const { Client } = require('pg');

const localClient = new Client({
  connectionString: 'postgres://postgres:1234@localhost:5432/compliance_pro_local'
});

async function deepAudit() {
  await localClient.connect();

  console.log('=== DEEP AMENDMENT AUDIT REPORT ===\n');

  // Audit 1: Title contains Amendment/Modif/Corrigendum/Partial but classified as ORIGINAL
  const falseOriginals = await localClient.query(`
    SELECT id, reference_no, published_date, title, circular_nature, amendment_notes
    FROM circular
    WHERE circular_nature = 'ORIGINAL'
      AND (
        title ILIKE '%amend%' 
        OR title ILIKE '%modifi%' 
        OR title ILIKE '%corrigendum%'
        OR title ILIKE '%partial%'
      )
    ORDER BY published_date DESC
  `);

  console.log(`1. Circulars titled as Amendment/Modification but currently classified as ORIGINAL: ${falseOriginals.rows.length}`);
  if (falseOriginals.rows.length > 0) {
    console.table(falseOriginals.rows.slice(0, 15).map(r => ({
      id: r.id,
      date: r.published_date ? r.published_date.toISOString().split('T')[0] : 'N/A',
      ref: r.reference_no,
      title: r.title.slice(0, 70)
    })));
  }

  // Audit 2: Circulars marked as AMENDMENT_NOT_FOUND (Why were they not found?)
  const notFoundList = await localClient.query(`
    SELECT id, reference_no, published_date, title, amendment_notes
    FROM circular
    WHERE circular_nature = 'AMENDMENT_NOT_FOUND'
    ORDER BY published_date DESC
  `);
  console.log(`\n2. Circulars classified as AMENDMENT_NOT_FOUND: ${notFoundList.rows.length}`);
  console.log('Sample of AMENDMENT_NOT_FOUND:');
  notFoundList.rows.slice(0, 10).forEach(r => {
    console.log(` - [#${r.id}] ${r.published_date ? r.published_date.toISOString().split('T')[0] : ''} | ${r.title.slice(0, 75)}`);
    console.log(`   Notes: ${r.amendment_notes ? r.amendment_notes.slice(0, 100) : 'None'}`);
  });

  // Audit 3: Anomaly Check on Linked Amendments (Is Amendment Published Date AFTER Original Published Date?)
  const anomalyLinks = await localClient.query(`
    SELECT ca.id, ca.original_circular_id, ca.amendment_circular_id,
           c_orig.title as orig_title, c_orig.published_date as orig_date,
           c_amend.title as amend_title, c_amend.published_date as amend_date
    FROM circular_amendment ca
    JOIN circular c_orig ON c_orig.id = ca.original_circular_id
    JOIN circular c_amend ON c_amend.id = ca.amendment_circular_id
    WHERE c_amend.published_date < c_orig.published_date
  `);

  console.log(`\n3. Anomaly Check - Amendments dated BEFORE their linked Original: ${anomalyLinks.rows.length}`);
  if (anomalyLinks.rows.length > 0) {
    anomalyLinks.rows.forEach(r => {
      console.log(` [ALERT Link #${r.id}] Amendment [#${r.amendment_circular_id}] (${r.amend_date.toISOString().split('T')[0]}) -> Original [#${r.original_circular_id}] (${r.orig_date.toISOString().split('T')[0]})`);
      console.log(`   Original Title: ${r.orig_title.slice(0, 80)}`);
      console.log(`   Amendment Title: ${r.amend_title.slice(0, 80)}\n`);
    });
  }

  // Audit 4: Self-referencing links
  const selfLinks = await localClient.query(`
    SELECT * FROM circular_amendment WHERE original_circular_id = amendment_circular_id
  `);
  console.log(`4. Anomaly Check - Self-referencing amendment links: ${selfLinks.rows.length}`);

  // Audit 5: Master Circular / Directions vs Master Amendments
  const masterAmendments = await localClient.query(`
    SELECT id, reference_no, published_date, title, circular_nature, amendment_notes
    FROM circular
    WHERE title ILIKE 'Master Direction%' AND (title ILIKE '%amendment%' OR title ILIKE '%updated%')
    ORDER BY published_date DESC
  `);
  console.log(`\n5. Master Directions with 'Amendment/Updated' in title: ${masterAmendments.rows.length}`);
  console.table(masterAmendments.rows.slice(0, 10).map(r => ({
    id: r.id,
    date: r.published_date ? r.published_date.toISOString().split('T')[0] : 'N/A',
    nature: r.circular_nature,
    title: r.title.slice(0, 70)
  })));

  await localClient.end();
}

deepAudit().catch(err => console.error(err));
