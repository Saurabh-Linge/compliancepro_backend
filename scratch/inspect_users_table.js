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

async function inspect() {
  const client = new Client(localConfig);
  await client.connect();
  console.log('=== Inspecting `users` Table and Foreign Keys ===\n');

  // 1. Column info of users
  const cols = await client.query(`
    SELECT column_name, data_type, is_nullable, column_default
    FROM information_schema.columns
    WHERE table_name = 'users'
    ORDER BY ordinal_position
  `);
  console.log('`users` Columns:');
  console.table(cols.rows);

  // 2. Rows in users
  const rows = await client.query(`SELECT * FROM users ORDER BY created_at ASC`);
  console.log('\nCurrent `users` rows:');
  console.table(rows.rows);

  // 3. Foreign key constraints referencing users
  const fks = await client.query(`
    SELECT
      tc.table_schema, 
      tc.constraint_name, 
      tc.table_name, 
      kcu.column_name, 
      ccu.table_name AS foreign_table_name,
      ccu.column_name AS foreign_column_name 
    FROM 
      information_schema.table_constraints AS tc 
      JOIN information_schema.key_column_usage AS kcu
        ON tc.constraint_name = kcu.constraint_name
        AND tc.table_schema = kcu.table_schema
      JOIN information_schema.constraint_column_usage AS ccu
        ON ccu.constraint_name = tc.constraint_name
        AND ccu.table_schema = tc.table_schema
    WHERE tc.constraint_type = 'FOREIGN KEY' 
      AND (ccu.table_name = 'users' OR tc.table_name = 'users');
  `);
  console.log('\nForeign Keys related to `users`:');
  console.table(fks.rows);

  // 4. Check other tables that have user-related column names
  const otherCols = await client.query(`
    SELECT table_name, column_name, data_type
    FROM information_schema.columns
    WHERE column_name LIKE '%user%' AND table_schema = 'public'
    ORDER BY table_name, column_name
  `);
  console.log('\nAll columns matching "%user%":');
  console.table(otherCols.rows);

  await client.end();
}

inspect();
