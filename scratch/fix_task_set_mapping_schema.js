const { Client } = require('pg');

const localClient = new Client({
  connectionString: 'postgres://postgres:1234@localhost:5432/compliance_pro_local'
});

const remoteClient = new Client({
  connectionString: 'postgres://postgres:dms@kredpool450@db.kredpool.ai:5432/compliance_pro'
});

async function fixMappingSchema() {
  console.log('=== ADDING due_date TO task_set_mapping ===\n');

  // 1. Local DB Migration
  console.log('Connecting to Local DB (compliance_pro_local)...');
  await localClient.connect();

  console.log('Adding due_date column to task_set_mapping table if not exists...');
  await localClient.query(`
    ALTER TABLE task_set_mapping 
    ADD COLUMN IF NOT EXISTS due_date DATE;
  `);
  console.log('✅ Local DB task_set_mapping migration complete.');
  await localClient.end();

  // 2. Remote DB Migration
  console.log('\nConnecting to Remote DB (db.kredpool.ai)...');
  await remoteClient.connect();

  console.log('Adding due_date column to task_set_mapping table on remote DB if not exists...');
  await remoteClient.query(`
    ALTER TABLE task_set_mapping 
    ADD COLUMN IF NOT EXISTS due_date DATE;
  `);
  console.log('✅ Remote DB task_set_mapping migration complete.');
  await remoteClient.end();

  console.log('\n🎉 Schema Migration Completed Successfully!');
}

fixMappingSchema().catch(err => {
  console.error('Error in fixMappingSchema:', err);
  process.exit(1);
});
