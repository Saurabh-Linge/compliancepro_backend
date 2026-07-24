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
        SELECT id FROM assignment WHERE status = 'In_Progress' OR status = 'IN_PROGRESS'
      )
    `);
    console.log(`✓ Cleared timeline review_status for ${res.rowCount} tasks in In_Progress assignments.`);
  } catch (err) {
    console.error(err);
  } finally {
    await client.end();
  }
}

main();
