const { Client } = require('pg');

const client = new Client({
  connectionString: 'postgres://postgres:1234@localhost:5432/compliance_pro_local'
});

async function auditLinks() {
  await client.connect();

  const allLinks = await client.query(`
    SELECT ca.id as link_id,
           ca.original_circular_id,
           ca.amendment_circular_id,
           c_orig.title as orig_title,
           c_orig.reference_no as orig_ref,
           c_orig.published_date as orig_date,
           c_amend.title as amend_title,
           c_amend.reference_no as amend_ref,
           c_amend.published_date as amend_date,
           c_amend.amendment_notes
    FROM circular_amendment ca
    JOIN circular c_orig ON c_orig.id = ca.original_circular_id
    JOIN circular c_amend ON c_amend.id = ca.amendment_circular_id
    ORDER BY ca.id ASC
  `);

  console.log(`Total circular_amendment records: ${allLinks.rows.length}\n`);

  let validCount = 0;
  let chronologicalErrorCount = 0;
  let topicMismatchCount = 0;
  const badLinks = [];

  for (const row of allLinks.rows) {
    const isChronologicalOk = row.amend_date >= row.orig_date;
    
    // Compute simple word overlap on titles
    const origWords = new Set(row.orig_title.toLowerCase().replace(/[^a-z0-9\s]/g, '').split(/\s+/).filter(w => w.length > 3));
    const amendWords = new Set(row.amend_title.toLowerCase().replace(/[^a-z0-9\s]/g, '').split(/\s+/).filter(w => w.length > 3));
    
    let commonCount = 0;
    for (const w of amendWords) {
      if (origWords.has(w) && !['reserve', 'bank', 'india', 'directions', 'circular', 'master'].includes(w)) {
        commonCount++;
      }
    }

    if (!isChronologicalOk) {
      chronologicalErrorCount++;
      badLinks.push({ reason: 'CHRONOLOGY_ERROR (Amendment dated BEFORE Original)', link: row });
    } else if (commonCount === 0 && (!row.amendment_notes || !row.amendment_notes.includes(row.orig_ref))) {
      topicMismatchCount++;
      badLinks.push({ reason: 'TOPIC_MISMATCH (Zero common key terms & no ref match)', link: row });
    } else {
      validCount++;
    }
  }

  console.log(`Summary of 359 Links Audit:`);
  console.log(`  ✅ Valid & Accurate Links: ${validCount} (${((validCount/allLinks.rows.length)*100).toFixed(1)}%)`);
  console.log(`  ❌ Chronology Errors (Amendment dated BEFORE Original): ${chronologicalErrorCount}`);
  console.log(`  ⚠️ Topic Mismatches (Weak/Unrelated FTS matches): ${topicMismatchCount}`);
  console.log(`  Total Inaccurate Links: ${badLinks.length}\n`);

  console.log('--- Sample Inaccurate Links to Fix ---');
  badLinks.slice(0, 15).forEach(({ reason, link: l }) => {
    console.log(`[Link #${l.link_id}] Reason: ${reason}`);
    console.log(`  Original  [#${l.original_circular_id}] (${l.orig_date ? l.orig_date.toISOString().split('T')[0] : 'N/A'}) [Ref: ${l.orig_ref}]: ${l.orig_title}`);
    console.log(`  Amendment [#${l.amendment_circular_id}] (${l.amend_date ? l.amend_date.toISOString().split('T')[0] : 'N/A'}) [Ref: ${l.amend_ref}]: ${l.amend_title}`);
    console.log(`  Notes: ${l.amendment_notes ? l.amendment_notes.slice(0, 90) : 'N/A'}\n`);
  });

  await client.end();
}

auditLinks().catch(err => console.error(err));
