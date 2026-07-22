const { Client } = require('pg');
const client = new Client({
  host: 'db.kredpool.ai',
  port: 5432,
  user: 'postgres',
  password: 'dms@kredpool450',
  database: 'compliance_pro'
});

async function main() {
  await client.connect();
  console.log('Connected to DB. Running migration...');
  await client.query(`
    ALTER TABLE task_set_mapping 
    ADD COLUMN IF NOT EXISTS due_date DATE;
  `);
  console.log('Migration completed successfully.');
  await client.end();
}

main().catch(console.error);
