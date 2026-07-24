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
    const res = await client.query(`SELECT id, username, role, branch_id FROM users WHERE username LIKE '%account%' OR role LIKE '%dept%' OR role LIKE '%branch%' LIMIT 10`);
    console.log('USERS:', res.rows);
  } catch (err) {
    console.error(err);
  } finally {
    await client.end();
  }
}

main();
