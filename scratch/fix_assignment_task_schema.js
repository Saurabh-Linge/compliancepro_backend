const { Client } = require('pg');

const localClient = new Client({
  connectionString: 'postgres://postgres:1234@localhost:5432/compliance_pro_local'
});

const remoteClient = new Client({
  connectionString: 'postgres://postgres:dms@kredpool450@db.kredpool.ai:5432/compliance_pro'
});

async function fixAssignmentTaskSchema() {
  console.log('=== ADDING MISSING COLUMNS TO assignment_task ===\n');

  // 1. Local DB Migration
  console.log('Connecting to Local DB (compliance_pro_local)...');
  await localClient.connect();

  console.log('Adding due_date, proposed_due_date, etc. to assignment_task on local DB...');
  await localClient.query(`
    ALTER TABLE assignment_task 
    ADD COLUMN IF NOT EXISTS due_date DATE,
    ADD COLUMN IF NOT EXISTS proposed_due_date DATE,
    ADD COLUMN IF NOT EXISTS proposed_remark TEXT,
    ADD COLUMN IF NOT EXISTS timeline_review_remark TEXT;
  `);
  console.log('✅ Local DB assignment_task migration complete.');
  await localClient.end();

  // 2. Remote DB Migration
  console.log('\nConnecting to Remote DB (db.kredpool.ai)...');
  await remoteClient.connect();

  console.log('Adding due_date, proposed_due_date, etc. to assignment_task on remote DB...');
  await remoteClient.query(`
    ALTER TABLE assignment_task 
    ADD COLUMN IF NOT EXISTS due_date DATE,
    ADD COLUMN IF NOT EXISTS proposed_due_date DATE,
    ADD COLUMN IF NOT EXISTS proposed_remark TEXT,
    ADD COLUMN IF NOT EXISTS timeline_review_remark TEXT;
  `);
  console.log('✅ Remote DB assignment_task migration complete.');
  await remoteClient.end();

  console.log('\n🎉 Assignment Task Schema Migration Completed Successfully!');
}

fixAssignmentTaskSchema().catch(err => {
  console.error('Error in fixAssignmentTaskSchema:', err);
  process.exit(1);
});
