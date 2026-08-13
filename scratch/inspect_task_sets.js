const { Client } = require('pg');

async function inspect() {
  const client = new Client({ connectionString: 'postgres://postgres:1234@localhost:5432/compliance_pro_local' });
  await client.connect();

  const taskSets = await client.query('SELECT id, name, type, circular_id, authority_id FROM task_set ORDER BY id DESC LIMIT 10');
  console.log('Task sets:', taskSets.rows);

  const internalTasks = await client.query('SELECT id, description, circular_id, authority_id FROM compliance_task WHERE circular_id IS NULL');
  console.log('Internal tasks in DB:', internalTasks.rows);

  const mappings = await client.query('SELECT * FROM task_set_mapping LIMIT 20');
  console.log('Mappings:', mappings.rows);

  await client.end();
}

inspect().catch(err => console.error(err));
