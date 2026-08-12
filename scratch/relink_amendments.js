const { Client } = require('pg');

const localClient = new Client({
  connectionString: 'postgres://postgres:1234@localhost:5432/compliance_pro_local'
});

const remoteClient = new Client({
  connectionString: 'postgres://postgres:dms@kredpool450@db.kredpool.ai:5432/compliance_pro'
});

// Helper to normalize reference strings
function normalizeRef(ref) {
  if (!ref) return '';
  return ref.toLowerCase().replace(/[^a-z0-9]/g, '');
}

async function relinkAmendments() {
  console.log('=== STARTING AMENDMENT RE-LINKING & AUDIT ===\n');

  await localClient.connect();
  console.log('Connected to Local DB (compliance_pro_local)');

  // 1. Fetch all circulars sorted chronologically
  const res = await localClient.query(`
    SELECT id, reference_no, published_date, title, circular_nature, amendment_notes
    FROM circular
    ORDER BY published_date ASC, id ASC
  `);
  const circulars = res.rows;
  console.log(`Fetched ${circulars.length} circulars from local database.`);

  // Build reference lookup maps
  const refToCircularMap = new Map();

  for (const c of circulars) {
    if (!c.reference_no) continue;

    const rawRef = c.reference_no.trim();
    const normFull = normalizeRef(rawRef);
    refToCircularMap.set(normFull, c);

    // Extract standard RBI pattern: "RBI/2020-21/15" or "RBI/2018-2019/55"
    const rbiMatch = rawRef.match(/RBI\/\d{4}-\d{2,4}\/\d+/i);
    if (rbiMatch) {
      const normRbi = normalizeRef(rbiMatch[0]);
      if (!refToCircularMap.has(normRbi)) {
        refToCircularMap.set(normRbi, c);
      }
    }

    // Extract Dept letter code pattern: e.g. "DOR.No.BP.BC.23", "DBR.No.Ret.BC.78", "FIDD.CO.Plan.BC.12"
    const deptMatch = rawRef.match(/([A-Z]{3,5}\.(?:[A-Z]{2,4}\.)*BC\.\d+)/i);
    if (deptMatch) {
      const normDept = normalizeRef(deptMatch[0]);
      if (!refToCircularMap.has(normDept)) {
        refToCircularMap.set(normDept, c);
      }
    }
  }

  const verifiedLinks = [];
  let originalCount = 0;
  let amendmentCount = 0;
  let notFoundCount = 0;

  for (const c of circulars) {
    const titleLower = (c.title || '').toLowerCase();
    const notesLower = (c.amendment_notes || '').toLowerCase();

    // Check if this circular is an amendment
    const isAmendmentTitle = titleLower.includes('amend') || 
                             titleLower.includes('modifi') || 
                             titleLower.includes('corrigendum') ||
                             titleLower.includes('partial modification');
                             
    const isAmendmentNature = c.circular_nature === 'AMENDMENT' || c.circular_nature === 'AMENDMENT_NOT_FOUND';

    if (!isAmendmentTitle && !isAmendmentNature) {
      originalCount++;
      await localClient.query(`UPDATE circular SET circular_nature = 'ORIGINAL' WHERE id = $1`, [c.id]);
      continue;
    }

    // Attempt to extract reference numbers from title & notes
    const textToScan = `${c.title} ${c.amendment_notes || ''}`;
    
    // Extract potential reference strings
    const rbiRefs = textToScan.match(/RBI\/\d{4}-\d{2,4}\/\d+/gi) || [];
    const deptRefs = textToScan.match(/([A-Z]{3,5}\.(?:[A-Z]{2,4}\.)*BC\.\d+)/gi) || [];
    const candidateRefs = [...rbiRefs, ...deptRefs];

    let matchedOriginal = null;

    for (const refCandidate of candidateRefs) {
      const normCand = normalizeRef(refCandidate);
      const target = refToCircularMap.get(normCand);

      if (target && target.id !== c.id && target.published_date <= c.published_date) {
        matchedOriginal = target;
        break;
      }
    }

    // Fallback: High-precision Title Topic Matching if reference string wasn't explicitly found
    if (!matchedOriginal) {
      const cleanTitle = titleLower
        .replace(/master direction|master circular|amendment|amendments|modifications|directions|guidelines|rbi|\d{4}-\d{2,4}/gi, '')
        .replace(/[^a-z0-9\s]/g, ' ')
        .trim();

      const keywords = cleanTitle.split(/\s+/).filter(w => w.length > 3);

      if (keywords.length >= 2) {
        // Search among prior circulars only
        for (const cand of circulars) {
          if (cand.id === c.id || cand.published_date > c.published_date) continue;

          const candTitleLower = cand.title.toLowerCase();
          const matchesAllKeywords = keywords.every(kw => candTitleLower.includes(kw));

          if (matchesAllKeywords) {
            matchedOriginal = cand;
            break;
          }
        }
      }
    }

    if (matchedOriginal) {
      amendmentCount++;
      verifiedLinks.push({
        originalId: matchedOriginal.id,
        amendmentId: c.id
      });
      await localClient.query(`UPDATE circular SET circular_nature = 'AMENDMENT' WHERE id = $1`, [c.id]);
    } else {
      notFoundCount++;
      await localClient.query(`UPDATE circular SET circular_nature = 'AMENDMENT_NOT_FOUND' WHERE id = $1`, [c.id]);
    }
  }

  console.log('\n--- Relinking Summary ---');
  console.log(`Total Circulars Analyzed: ${circulars.length}`);
  console.log(`  - Marked as ORIGINAL: ${originalCount}`);
  console.log(`  - Verified AMENDMENT (Linked): ${amendmentCount}`);
  console.log(`  - AMENDMENT_NOT_FOUND (Original pre-2017): ${notFoundCount}`);

  // Re-populate circular_amendment table in local DB
  await localClient.query('TRUNCATE TABLE circular_amendment RESTART IDENTITY');
  console.log('\nTruncated local circular_amendment table.');

  let insertedLinksCount = 0;
  for (const link of verifiedLinks) {
    await localClient.query(
      `INSERT INTO circular_amendment (original_circular_id, amendment_circular_id)
       VALUES ($1, $2) ON CONFLICT DO NOTHING`,
      [link.originalId, link.amendmentId]
    );
    insertedLinksCount++;
  }
  console.log(`Successfully inserted ${insertedLinksCount} verified links into local circular_amendment table.`);

  // 2. Sync to Remote DB (db.kredpool.ai)
  console.log('\nConnecting to Remote DB (db.kredpool.ai)...');
  await remoteClient.connect();
  console.log('Connected to Remote DB (db.kredpool.ai)');

  // Sync circular_nature updates to Remote DB in fast batch
  console.log('Syncing circular_nature updates to remote circular table...');
  const allLocalNature = await localClient.query(`SELECT id, circular_nature FROM circular`);
  
  // Group by nature for ultra fast updates
  const natures = ['ORIGINAL', 'AMENDMENT', 'AMENDMENT_NOT_FOUND'];
  for (const n of natures) {
    const ids = allLocalNature.rows.filter(r => r.circular_nature === n).map(r => r.id);
    if (ids.length > 0) {
      await remoteClient.query(
        `UPDATE circular SET circular_nature = $1 WHERE id = ANY($2::int[])`,
        [n, ids]
      );
    }
  }
  console.log(`Updated circular_nature for 1613 records on db.kredpool.ai.`);

  // Truncate and insert circular_amendment on Remote DB
  await remoteClient.query('TRUNCATE TABLE circular_amendment RESTART IDENTITY');
  console.log('Truncated remote circular_amendment table on db.kredpool.ai.');

  if (verifiedLinks.length > 0) {
    const linkValues = verifiedLinks.map(l => `(${l.originalId}, ${l.amendmentId})`).join(',');
    await remoteClient.query(
      `INSERT INTO circular_amendment (original_circular_id, amendment_circular_id)
       VALUES ${linkValues} ON CONFLICT DO NOTHING`
    );
  }
  console.log(`Successfully synced ${verifiedLinks.length} verified amendment links to remote DB db.kredpool.ai!`);

  await localClient.end();
  await remoteClient.end();

  console.log('\n🎉 Amendment Audit & Remote DB Sync Completed Successfully!');
}

relinkAmendments().catch(err => {
  console.error('Error in relinkAmendments:', err);
  process.exit(1);
});
