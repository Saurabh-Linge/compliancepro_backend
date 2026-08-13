const { Client } = require('pg');

async function deleteDuplicate() {
  const localClient = new Client({ connectionString: 'postgres://postgres:1234@localhost:5432/compliance_pro_local' });
  await localClient.connect();
  
  await localClient.query('DELETE FROM task_set_mapping WHERE task_set_id = 3');
  await localClient.query('DELETE FROM task_set_branch WHERE task_set_id = 3');
  await localClient.query('DELETE FROM assignment WHERE task_set_id = 3');
  await localClient.query('DELETE FROM task_set WHERE id = 3');

  console.log('Deleted duplicate task set id: 3 from local database.');
  await localClient.end();
}

deleteDuplicate().catch(err => console.error(err));
