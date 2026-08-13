const { Client } = require('pg');

async function checkAndClean() {
  const localClient = new Client({ connectionString: 'postgres://postgres:1234@localhost:5432/compliance_pro_local' });
  const remoteClient = new Client({ connectionString: 'postgres://postgres:dms@kredpool450@db.kredpool.ai:5432/compliance_pro' });

  await localClient.connect();
  await remoteClient.connect();

  console.log('Checking task_set records on local DB...');
  const localRes = await localClient.query('SELECT id, name, type, circular_id, authority_id, created_at FROM task_set ORDER BY id DESC LIMIT 20');
  console.log('Recent Local task_set rows:');
  console.table(localRes.rows);

  console.log('Checking task_set records on remote DB...');
  const remoteRes = await remoteClient.query('SELECT id, name, type, circular_id, authority_id, created_at FROM task_set ORDER BY id DESC LIMIT 20');
  console.log('Recent Remote task_set rows:');
  console.table(remoteRes.rows);

  await localClient.end();
  await remoteClient.end();
}

checkAndClean().catch(err => console.error(err));
