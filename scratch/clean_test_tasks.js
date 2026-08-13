const { Client } = require('pg');

async function cleanTestTasks() {
  const localClient = new Client({ connectionString: 'postgres://postgres:1234@localhost:5432/compliance_pro_local' });
  await localClient.connect();

  console.log('Finding test tasks with description "New"...');
  const res = await localClient.query("SELECT id, description, circular_id, authority_id FROM compliance_task WHERE description = 'New'");
  console.log('Found:', res.rows);

  if (res.rows.length > 0) {
    const ids = res.rows.map(r => r.id);
    await localClient.query('DELETE FROM task_set_mapping WHERE task_id = ANY($1::int[])', [ids]);
    await localClient.query('DELETE FROM assignment_task WHERE task_id = ANY($1::int[])', [ids]);
    await localClient.query('DELETE FROM compliance_task WHERE id = ANY($1::int[])', [ids]);
    console.log(`Deleted ${ids.length} dummy test tasks from local database.`);
  }

  await localClient.end();
}

cleanTestTasks().catch(err => console.error(err));
