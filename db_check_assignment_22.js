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
    const aRes = await client.query(`SELECT * FROM assignment WHERE id = 22`);
    console.log('ASSIGNMENT 22:', aRes.rows);

    const atRes = await client.query(`SELECT * FROM assignment_task WHERE assignment_id = 22`);
    console.log('ASSIGNMENT 22 TASKS:', atRes.rows);
  } catch (err) {
    console.error(err);
  } finally {
    await client.end();
  }
}

main();
