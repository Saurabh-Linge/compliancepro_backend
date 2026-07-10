const { Client } = require('pg');

const client = new Client({
  host: 'db.kredpool.in',
  port: 5432,
  user: 'postgres',
  password: 'dms@kredpool450',
  database: 'compliance_pro'
});

async function main() {
  await client.connect();

  console.log('1. All assignments in DB:');
  const asgs = await client.query('SELECT * FROM assignment');
  console.log(asgs.rows);

  console.log('\n2. All assignment_task rows in DB:');
  const asgTasks = await client.query('SELECT id, assignment_id, task_id, status, compliance_status FROM assignment_task');
  console.log(asgTasks.rows);

  await client.end();
}

main().catch(err => {
  console.error(err);
  client.end();
});
