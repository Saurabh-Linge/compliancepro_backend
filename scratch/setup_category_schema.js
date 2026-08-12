const { Client } = require('pg');
const dotenv = require('dotenv');

dotenv.config();

const standardCategories = [
  { name: 'All Regulated Entities', description: 'Applies universally to all banks, NBFCs, and regulated financial entities' },
  { name: 'Commercial Banks', description: 'Scheduled Commercial Banks (SCBs), Public, Private, and Foreign Banks' },
  { name: 'Small Finance Banks', description: 'Small Finance Banks (SFBs)' },
  { name: 'Payments Banks', description: 'Payments Banks (PBs)' },
  { name: 'Urban Co-operative Banks', description: 'Primary (Urban) Co-operative Banks (UCBs)' },
  { name: 'Rural Co-operative Banks', description: 'State Co-operative Banks (StCBs) & District Central Co-operative Banks (DCCBs)' },
  { name: 'Regional Rural Banks', description: 'Regional Rural Banks (RRBs)' },
  { name: 'Non-Banking Financial Companies (NBFCs)', description: 'NBFC-Base, Middle, Upper, and Top Layers' },
  { name: 'Housing Finance Companies (HFCs)', description: 'Housing Finance Companies' },
  { name: 'All-India Financial Institutions (AIFIs)', description: 'EXIM Bank, NABARD, NHB, SIDBI, NaBFID' },
  { name: 'Authorized Dealers (AD Category-I Banks)', description: 'Foreign Exchange / FEMA Authorized Dealers' },
  { name: 'Credit Information Companies (CICs)', description: 'Credit Information Companies / Credit Bureaus' },
];

async function setupCategorySchema() {
  const client = new Client({
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '5432', 10),
    user: process.env.DB_USER || 'postgres',
    password: process.env.DB_PASSWORD || '1234',
    database: process.env.DB_NAME || 'compliance_pro_local',
  });

  try {
    await client.connect();
    console.log('[DB] Connected to PostgreSQL!');

    console.log('[DB] Creating circular_category master table...');
    await client.query(`
      CREATE TABLE IF NOT EXISTS circular_category (
        id SERIAL PRIMARY KEY,
        name VARCHAR(100) UNIQUE NOT NULL,
        description TEXT,
        is_active BOOLEAN DEFAULT true,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    console.log('[DB] Adding category column to circular table...');
    await client.query(`
      ALTER TABLE circular 
      ADD COLUMN IF NOT EXISTS category VARCHAR(255);
    `);

    console.log('[DB] Seeding standard categories into circular_category...');
    for (const cat of standardCategories) {
      await client.query(`
        INSERT INTO circular_category (name, description)
        VALUES ($1, $2)
        ON CONFLICT (name) DO UPDATE 
        SET description = EXCLUDED.description;
      `, [cat.name, cat.description]);
    }

    const countRes = await client.query('SELECT count(*) FROM circular_category;');
    console.log(`[DB] Successfully seeded ${countRes.rows[0].count} standard categories!`);

  } catch (err) {
    console.error('[DB Error]:', err);
  } finally {
    await client.end();
  }
}

setupCategorySchema();
