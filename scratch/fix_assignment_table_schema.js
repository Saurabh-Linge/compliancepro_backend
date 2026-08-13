const { Client } = require('pg');

const localClient = new Client({
  connectionString: 'postgres://postgres:1234@localhost:5432/compliance_pro_local'
});

const remoteClient = new Client({
  connectionString: 'postgres://postgres:dms@kredpool450@db.kredpool.ai:5432/compliance_pro'
});

async function fixAssignmentSchema() {
  console.log('=== ADDING timeline_remark TO assignment TABLE ===\n');

  // 1. Local DB Migration
  console.log('Connecting to Local DB (compliance_pro_local)...');
  await localClient.connect();

  console.log('Adding timeline_remark column to assignment table if not exists...');
  await localClient.query(`
    ALTER TABLE assignment 
    ADD COLUMN IF NOT EXISTS timeline_remark TEXT;
  `);
  console.log('✅ Local DB assignment migration complete.');
  await localClient.end();

  // 2. Remote DB Migration
  console.log('\nConnecting to Remote DB (db.kredpool.ai)...');
  await remoteClient.connect();

  console.log('Adding timeline_remark column to assignment table on remote DB if not exists...');
  await remoteClient.query(`
    ALTER TABLE assignment 
    ADD COLUMN IF NOT EXISTS timeline_remark TEXT;
  `);
  console.log('✅ Remote DB assignment migration complete.');
  await remoteClient.end();

  console.log('\n🎉 Assignment Schema Migration Completed Successfully!');
}

fixAssignmentSchema().catch(err => {
  console.error('Error in fixAssignmentSchema:', err);
  process.exit(1);
});
