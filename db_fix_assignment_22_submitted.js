const { Client } = require('pg');

async function main() {
  const client = new Client({
    host: 'db.kredpool.ai',
    port: 5432,
    user: 'postgres',
    password: 'dms@kredpool450',
    database: 'compliance_pro',
    ssl: false
  });

  await client.connect();

  try {
    const res = await client.query(`
      UPDATE assignment_task
      SET review_status = NULL
      WHERE assignment_id IN (
        SELECT id FROM assignment WHERE status = 'REVIEW_PENDING' OR status = 'ESCALATED_TO_CCO'
      )
    `);
    console.log(`✓ Cleared review_status for ${res.rowCount} tasks in REVIEW_PENDING / ESCALATED_TO_CCO assignments.`);
  } catch (err) {
    console.error(err);
  } finally {
    await client.end();
  }
}

main();
