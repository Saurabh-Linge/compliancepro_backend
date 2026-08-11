const { Client } = require('pg');
const dotenv = require('dotenv');

dotenv.config();

async function runMigration() {
  const client = new Client({
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '5432', 10),
    user: process.env.DB_USER || 'postgres',
    password: process.env.DB_PASSWORD || 'postgres',
    database: process.env.DB_NAME || 'compliancepro',
  });

  try {
    await client.connect();
    console.log('[Migration] Connected to PostgreSQL!');

    console.log('[Migration] Adding missing columns to compliance_task table...');
    await client.query(`
      ALTER TABLE compliance_task ADD COLUMN IF NOT EXISTS file_url TEXT;
      ALTER TABLE compliance_task ADD COLUMN IF NOT EXISTS header_id INTEGER REFERENCES task_header(id) ON DELETE SET NULL;
      ALTER TABLE compliance_task ADD COLUMN IF NOT EXISTS priority VARCHAR(50);
      ALTER TABLE compliance_task ADD COLUMN IF NOT EXISTS risk_category VARCHAR(100);
      ALTER TABLE compliance_task ADD COLUMN IF NOT EXISTS business_risk TEXT;
      ALTER TABLE compliance_task ADD COLUMN IF NOT EXISTS control_risk TEXT;
      ALTER TABLE compliance_task ADD COLUMN IF NOT EXISTS audit_area_id INTEGER;
    `);

    console.log('[Migration] Successfully added missing columns to compliance_task!');

    // Verify columns in compliance_task
    const res = await client.query(`
      SELECT column_name, data_type 
      FROM information_schema.columns 
      WHERE table_name = 'compliance_task'
      ORDER BY ordinal_position;
    `);

    console.log('\n[Schema] Current columns in compliance_task:');
    res.rows.forEach(r => console.log(`  - ${r.column_name} (${r.data_type})`));
  } catch (err) {
    console.error('[Migration] Error running migration:', err);
  } finally {
    await client.end();
  }
}

runMigration();
