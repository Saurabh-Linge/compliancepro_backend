const { Client } = require('pg');

const localClient = new Client({
  connectionString: 'postgres://postgres:1234@localhost:5432/compliance_pro_local'
});

const remoteClient = new Client({
  connectionString: 'postgres://postgres:dms@kredpool450@db.kredpool.ai:5432/compliance_pro'
});

async function applySlice1Schema() {
  console.log('=== APPLYING SLICE 1 SCHEMA MIGRATIONS ===\n');

  // 1. Local DB Migration
  console.log('Connecting to Local DB (compliance_pro_local)...');
  await localClient.connect();

  console.log('Adding type column to task_set table if not exists...');
  await localClient.query(`
    ALTER TABLE task_set 
    ADD COLUMN IF NOT EXISTS type VARCHAR(20) DEFAULT 'REGULAR',
    ADD COLUMN IF NOT EXISTS authority_id INT REFERENCES authority(id) ON DELETE SET NULL;
  `);

  console.log('Adding authority_id column to compliance_task table if not exists...');
  await localClient.query(`
    ALTER TABLE compliance_task
    ADD COLUMN IF NOT EXISTS authority_id INT REFERENCES authority(id) ON DELETE SET NULL;
  `);

  console.log('✅ Local DB migration complete.');
  await localClient.end();

  // 2. Remote DB Migration
  console.log('\nConnecting to Remote DB (db.kredpool.ai)...');
  await remoteClient.connect();

  console.log('Adding type column to task_set table on remote DB if not exists...');
  await remoteClient.query(`
    ALTER TABLE task_set 
    ADD COLUMN IF NOT EXISTS type VARCHAR(20) DEFAULT 'REGULAR',
    ADD COLUMN IF NOT EXISTS authority_id INT REFERENCES authority(id) ON DELETE SET NULL;
  `);

  console.log('Adding authority_id column to compliance_task table on remote DB if not exists...');
  await remoteClient.query(`
    ALTER TABLE compliance_task
    ADD COLUMN IF NOT EXISTS authority_id INT REFERENCES authority(id) ON DELETE SET NULL;
  `);

  console.log('✅ Remote DB migration complete.');
  await remoteClient.end();

  console.log('\n🎉 Slice 1 Database Migrations Applied Successfully!');
}

applySlice1Schema().catch(err => {
  console.error('Error applying Slice 1 migrations:', err);
  process.exit(1);
});
