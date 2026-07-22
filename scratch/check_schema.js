const { Client } = require('pg');
const client = new Client({
  user: 'postgres',
  host: 'db.kredpool.in',
  database: 'compliance_pro',
  password: 'dms@kredpool450',
  port: 5432
});
client.connect().then(async () => {
  const res = await client.query("SELECT column_name FROM information_schema.columns WHERE table_name = 'branch_dept'");
  console.log('branch_dept:', res.rows.map(r=>r.column_name));
  const res2 = await client.query("SELECT column_name FROM information_schema.columns WHERE table_name = 'users'");
  console.log('users:', res2.rows.map(r=>r.column_name));
  client.end();
});
