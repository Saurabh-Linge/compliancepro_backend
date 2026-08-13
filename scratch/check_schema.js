const { Client } = require('pg');

async function check() {
  const client = new Client({ connectionString: 'postgres://postgres:1234@localhost:5432/compliance_pro_local' });
  await client.connect();
  const res = await client.query("SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'task_set'");
  console.log('task_set columns:', res.rows.map(r => r.column_name));
  const resTask = await client.query("SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'compliance_task'");
  console.log('compliance_task columns:', resTask.rows.map(r => r.column_name));
  const resAss = await client.query("SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'assignment'");
  console.log('assignment columns:', resAss.rows.map(r => r.column_name));
  await client.end();
}

check().catch(err => console.error(err));
