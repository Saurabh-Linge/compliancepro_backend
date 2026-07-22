const { Client } = require('pg');
const client = new Client({
  host: 'db.kredpool.ai',
  port: 5432,
  user: 'postgres',
  password: 'dms@kredpool450',
  database: 'compliance_pro'
});

async function main() {
  await client.connect();
  const res = await client.query(`
    SELECT column_name, data_type 
    FROM information_schema.columns 
    WHERE table_name = 'task_set_mapping';
  `);
  console.log('task_set_mapping columns:', res.rows);

  const res2 = await client.query(`
    SELECT column_name, data_type 
    FROM information_schema.columns 
    WHERE table_name = 'assignment_task';
  `);
  console.log('assignment_task columns:', res2.rows);

  await client.end();
}

main().catch(console.error);
