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
      SELECT status, is_approved, count(*) 
      FROM compliance_task 
      GROUP BY status, is_approved
    `);
    console.log('COMPLIANCE_TASK STATS:', res.rows);
  } catch (err) {
    console.error(err);
  } finally {
    await client.end();
  }
}

main();
