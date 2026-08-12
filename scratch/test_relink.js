const { Client } = require('pg');

const client = new Client({
  connectionString: 'postgres://postgres:1234@localhost:5432/compliance_pro_local'
});

async function runTestRelink() {
  await client.connect();

  // 1. Fetch all circulars
  const res = await client.query(`
    SELECT id, reference_no, published_date, title, circular_nature, amendment_notes
    FROM circular
    ORDER BY published_date ASC, id ASC
  `);
  const circulars = res.rows;
  console.log(`Loaded ${circulars.length} circulars from DB.`);

  // Build reference map: exact ref & normalized ref -> circular
  const refMap = new Map();
  const titleMap = new Map();

  for (const c of circulars) {
    if (c.reference_no) {
      const normRef = c.reference_no.trim().toLowerCase();
      refMap.set(normRef, c);

      // Extract short ref e.g. "RBI/2020-21/15" from "RBI/2020-21/15/DOR..."
      const shortMatch = normRef.match(/rbi\/\d{4}-\d{2,4}\/\d+/i);
      if (shortMatch) {
        refMap.set(shortMatch[0], c);
      }
    }
  }

  let verifiedLinksCount = 0;
  let notFoundCount = 0;
  let originalCount = 0;

  const newLinks = [];

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
      continue;
    }

    // Try to find reference numbers in title or amendment notes
    const combinedText = `${c.title} ${c.amendment_notes || ''}`;
    const refMatches = combinedText.match(/RBI\/\d{4}-\d{2,4}\/\d+/gi) || [];

    let matchedOrig = null;

    for (const ref of refMatches) {
      const target = refMap.get(ref.toLowerCase());
      if (target && target.id !== c.id && target.published_date <= c.published_date) {
        matchedOrig = target;
        break;
      }
    }

    // If no ref match, try Title similarity among prior circulars
    if (!matchedOrig) {
      const cleanTitle = titleLower
        .replace(/master direction|master circular|amendment|amendments|modifications|directions|guidelines|rbi|\d{4}-\d{2,4}/gi, '')
        .replace(/[^a-z0-9\s]/g, ' ')
        .trim();

      const keywords = cleanTitle.split(/\s+/).filter(w => w.length > 3);

      if (keywords.length >= 2) {
        for (const candidate of circulars) {
          if (candidate.id === c.id || candidate.published_date > c.published_date) continue;

          const candTitleLower = candidate.title.toLowerCase();
          const matchesAll = keywords.every(kw => candTitleLower.includes(kw));

          if (matchesAll) {
            matchedOrig = candidate;
            break;
          }
        }
      }
    }

    if (matchedOrig) {
      verifiedLinksCount++;
      newLinks.push({
        origId: matchedOrig.id,
        amendId: c.id,
        origTitle: matchedOrig.title,
        amendTitle: c.title,
        origDate: matchedOrig.published_date,
        amendDate: c.published_date
      });
    } else {
      notFoundCount++;
    }
  }

  console.log(`\n--- Test Relinking Results ---`);
  console.log(`Original Circulars: ${originalCount}`);
  console.log(`Verified Amendment Links Found: ${verifiedLinksCount}`);
  console.log(`Amendments (Original pre-2017 or missing in DB): ${notFoundCount}`);

  console.log('\n--- Sample 15 High Precision Verified Links ---');
  newLinks.slice(0, 15).forEach((l, idx) => {
    console.log(`[#${idx+1}] Original [#${l.origId}] (${l.origDate.toISOString().split('T')[0]}): ${l.origTitle.slice(0, 70)}`);
    console.log(`     Amendment [#${l.amendId}] (${l.amendDate.toISOString().split('T')[0]}): ${l.amendTitle.slice(0, 70)}\n`);
  });

  await client.end();
}

runTestRelink().catch(err => console.error(err));
