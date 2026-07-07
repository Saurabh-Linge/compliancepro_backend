const { Client } = require('pg');
const client = new Client({
  user: 'postgres',
  host: 'db.kredpool.in',
  database: 'compliance_pro',
  password: 'dms@kredpool450',
  port: 5432
});

client.connect().then(async () => {
  try {
    const res = await client.query("SELECT username, role FROM users WHERE role LIKE '%BRANCH%'");
    console.log(res.rows);
  } catch (e) {
    console.error(e);
  } finally {
    client.end();
  }
});
