const { Client } = require('pg');
const dotenv = require('dotenv');

dotenv.config();

const localConfig = {
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '5432', 10),
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD || '1234',
  database: process.env.DB_NAME || 'compliance_pro_local',
};

const remoteConfig = {
  host: 'db.kredpool.ai',
  port: 5432,
  user: 'postgres',
  password: 'dms@kredpool450',
  database: 'compliance_pro',
  ssl: false,
};

const createTableSQL = `
CREATE TABLE IF NOT EXISTS assignment_task_remarks_history (
    id SERIAL PRIMARY KEY,
    assignment_task_id INTEGER NOT NULL REFERENCES assignment_task(id) ON DELETE CASCADE,
    role VARCHAR(50) NOT NULL,
    username VARCHAR(255),
    remark TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_atrh_task_id ON assignment_task_remarks_history(assignment_task_id);
`;

async function run() {
  console.log('=== Checking & Migrating assignment_task_remarks_history Table ===\n');

  // 1. Check Remote DB
  console.log('1. Checking Remote DB (db.kredpool.ai)...');
  const remoteClient = new Client(remoteConfig);
  let remoteHasTable = false;
  try {
    await remoteClient.connect();
    console.log('Connected to remote DB.');
    const res = await remoteClient.query(`
      SELECT table_name FROM information_schema.tables 
      WHERE table_name = 'assignment_task_remarks_history'
    `);
    remoteHasTable = res.rows.length > 0;
    console.log('Remote DB has assignment_task_remarks_history:', remoteHasTable);

    if (!remoteHasTable) {
      console.log('Creating assignment_task_remarks_history on Remote DB...');
      await remoteClient.query(createTableSQL);
      console.log('✅ Created on Remote DB.');
    } else {
      const countRes = await remoteClient.query('SELECT count(*) FROM assignment_task_remarks_history');
      console.log(`Remote DB remarks history count: ${countRes.rows[0].count}`);
    }
  } catch (err) {
    console.error('Remote DB connection/query error (ignoring if remote unreachable):', err.message);
  } finally {
    try { await remoteClient.end(); } catch (e) {}
  }

  // 2. Setup Local DB
  console.log('\n2. Setting up Local DB (compliance_pro_local)...');
  const localClient = new Client(localConfig);
  try {
    await localClient.connect();
    console.log('Connected to local DB.');
    await localClient.query(createTableSQL);
    console.log('✅ Created assignment_task_remarks_history table and index on Local DB.');

    // Verify
    const verifyRes = await localClient.query(`
      SELECT column_name, data_type 
      FROM information_schema.columns 
      WHERE table_name = 'assignment_task_remarks_history'
    `);
    console.log('Local DB Table Columns:', verifyRes.rows);
  } catch (err) {
    console.error('Local DB error:', err);
  } finally {
    try { await localClient.end(); } catch (e) {}
  }

  console.log('\n🎉 Migration complete!');
}

run();
