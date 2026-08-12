const { Client } = require('pg');

const localClient = new Client({
  connectionString: 'postgres://postgres:1234@localhost:5432/compliance_pro_local'
});

async function analyzeAmendments() {
  await localClient.connect();
  console.log('Connected to Local Database compliance_pro_local');

  // 1. Overall stats on circular_nature
  const natureRes = await localClient.query(`
    SELECT circular_nature, COUNT(*) as count 
    FROM circular 
    GROUP BY circular_nature 
    ORDER BY count DESC
  `);
  console.log('\n--- Circular Nature Breakdown ---');
  console.table(natureRes.rows);

  // 2. circular_amendment table links
  const linksRes = await localClient.query(`
    SELECT COUNT(*) as total_links FROM circular_amendment
  `);
  console.log(`Total circular_amendment link records in DB: ${linksRes.rows[0].total_links}`);

  // 3. Find circulars with title keywords (amendment, modifying, modification, update, correction)
  const titleKeywordsRes = await localClient.query(`
    SELECT id, reference_no, published_date, title, circular_nature, amendment_notes
    FROM circular
    WHERE title ILIKE '%amend%' 
       OR title ILIKE '%modifi%' 
       OR title ILIKE '%correct%' 
       OR title ILIKE '%partial%'
    ORDER BY published_date DESC
  `);
  console.log(`\nCirculars with amendment keywords in Title: ${titleKeywordsRes.rows.length}`);
  
  let keywordMatchCount = 0;
  let keywordMissedCount = 0;
  const missedList = [];

  for (const row of titleKeywordsRes.rows) {
    if (row.circular_nature === 'AMENDMENT') {
      keywordMatchCount++;
    } else {
      keywordMissedCount++;
      missedList.push(row);
    }
  }

  console.log(`  - Flagged as AMENDMENT: ${keywordMatchCount}`);
  console.log(`  - Marked as ${keywordMissedCount > 0 ? 'OTHER (ORIGINAL/NULL/NOT_FOUND)' : '0'}: ${keywordMissedCount}`);

  if (missedList.length > 0) {
    console.log('\n--- Sample Circulars with "Amendment/Modification" in Title NOT marked as AMENDMENT ---');
    missedList.slice(0, 15).forEach(c => {
      console.log(`[ID: ${c.id}] Date: ${c.published_date ? c.published_date.toISOString().split('T')[0] : 'N/A'} | Ref: ${c.reference_no} | Nature: ${c.circular_nature}`);
      console.log(`   Title: ${c.title}`);
      console.log(`   Notes: ${c.amendment_notes || 'None'}\n`);
    });
  }

  // 4. Check circular_amendment linkages (Original <-> Amendment)
  const linkedRes = await localClient.query(`
    SELECT ca.id, ca.original_circular_id, ca.amendment_circular_id,
           c_orig.title as orig_title, c_orig.published_date as orig_date,
           c_amend.title as amend_title, c_amend.published_date as amend_date, c_amend.amendment_notes
    FROM circular_amendment ca
    JOIN circular c_orig ON c_orig.id = ca.original_circular_id
    JOIN circular c_amend ON c_amend.id = ca.amendment_circular_id
    ORDER BY ca.id DESC
    LIMIT 20
  `);

  console.log('\n--- Sample Linked Amendments in DB ---');
  linkedRes.rows.forEach(l => {
    console.log(`Link ID #${l.id}:`);
    console.log(`  Original [#${l.original_circular_id}] (${l.orig_date ? l.orig_date.toISOString().split('T')[0] : 'N/A'}): ${l.orig_title.slice(0, 80)}`);
    console.log(`  Amendment [#${l.amendment_circular_id}] (${l.amend_date ? l.amend_date.toISOString().split('T')[0] : 'N/A'}): ${l.amend_title.slice(0, 80)}`);
    console.log(`  Notes: ${l.amendment_notes || 'N/A'}\n`);
  });

  // 5. Check if any circular marked as AMENDMENT_NOT_FOUND
  const notFoundRes = await localClient.query(`
    SELECT id, reference_no, published_date, title, amendment_notes
    FROM circular
    WHERE circular_nature = 'AMENDMENT_NOT_FOUND'
    ORDER BY published_date DESC
  `);
  console.log(`\n--- Circulars marked as AMENDMENT_NOT_FOUND: ${notFoundRes.rows.length} ---`);
  notFoundRes.rows.slice(0, 10).forEach(c => {
    console.log(`[ID: ${c.id}] Date: ${c.published_date ? c.published_date.toISOString().split('T')[0] : 'N/A'} | Ref: ${c.reference_no}`);
    console.log(`   Title: ${c.title}`);
    console.log(`   Notes: ${c.amendment_notes || 'None'}\n`);
  });

  await localClient.end();
}

analyzeAmendments().catch(err => console.error(err));
