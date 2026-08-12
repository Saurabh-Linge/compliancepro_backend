const { Client } = require('pg');
const dotenv = require('dotenv');

dotenv.config();

// Source (Local Clean DB)
const sourceConfig = {
  host: process.env.SOURCE_DB_HOST || 'localhost',
  port: parseInt(process.env.SOURCE_DB_PORT || '5432', 10),
  user: process.env.SOURCE_DB_USER || 'postgres',
  password: process.env.SOURCE_DB_PASSWORD || '1234',
  database: process.env.SOURCE_DB_NAME || 'compliance_pro_local',
};

// Target (Remote DB: db.kredpool.ai / compliance_pro)
const targetConfig = {
  host: process.env.TARGET_DB_HOST || 'db.kredpool.ai',
  port: parseInt(process.env.TARGET_DB_PORT || '5432', 10),
  user: process.env.TARGET_DB_USER || 'postgres',
  password: process.env.TARGET_DB_PASSWORD || 'dms@kredpool450',
  database: process.env.TARGET_DB_NAME || 'compliance_pro',
  ssl: false,
};

async function syncCategories() {
  console.log('=====================================================');
  console.log('   SAFE SYNC: UPDATE CATEGORIES TO REMOTE DATABASE   ');
  console.log('   (NO TRUNCATE - NO DATA LOSS - UPDATE ONLY)        ');
  console.log('=====================================================');
  console.log(`Source DB : ${sourceConfig.user}@${sourceConfig.host}:${sourceConfig.port}/${sourceConfig.database}`);
  console.log(`Target DB : ${targetConfig.user}@${targetConfig.host}:${targetConfig.port}/${targetConfig.database}`);
  console.log('-----------------------------------------------------\n');

  const sourceClient = new Client(sourceConfig);
  const targetClient = new Client(targetConfig);

  try {
    console.log('[Connecting] Connecting to Source Local DB...');
    await sourceClient.connect();
    console.log('[Connected] Source DB connected!');

    console.log('[Connecting] Connecting to Target Remote DB...');
    await targetClient.connect();
    console.log('[Connected] Target DB connected!');

    // 1. Target DB ready for category updates

    // 2. Sync circular_category master items
    console.log('\n[Sync] Syncing circular_category master records...');
    const catRows = await sourceClient.query(`SELECT * FROM circular_category ORDER BY id ASC;`);
    for (const cat of catRows.rows) {
      await targetClient.query(`
        INSERT INTO circular_category (id, name, description, is_active)
        VALUES ($1, $2, $3, $4)
        ON CONFLICT (name) DO UPDATE 
        SET description = EXCLUDED.description;
      `, [cat.id, cat.name, cat.description, cat.is_active]);
    }
    console.log(`[Sync] Synced ${catRows.rows.length} master categories.`);

    // 3. Fetch newly updated circular categories (2018-2026) from Source DB
    console.log('\n[Sync] Fetching newly updated 2018-2026 categories from Local DB...');
    const updatedCircs = await sourceClient.query(`
      SELECT id, title, category 
      FROM circular 
      WHERE category IS NOT NULL AND category != ''
        AND (EXTRACT(YEAR FROM published_date) >= 2018 OR published_date >= '2018-01-01')
      ORDER BY id ASC;
    `);
    console.log(`[Sync 2018-2026] Found ${updatedCircs.rows.length} circulars with newly populated category in Local DB.`);

    // 4. Update Target DB in batches
    let updatedCount = 0;
    for (const circ of updatedCircs.rows) {
      const res = await targetClient.query(`
        UPDATE circular 
        SET category = $1 
        WHERE id = $2;
      `, [circ.category, circ.id]);
      if (res.rowCount > 0) updatedCount++;
      process.stdout.write(`\r[Target DB] Updated ${updatedCount} / ${updatedCircs.rows.length} circulars...`);
    }

    console.log(`\n\n[Target DB] Successfully updated category for ${updatedCount} circulars!`);

    // 5. Verification
    const remoteCount = await targetClient.query(`SELECT count(*) FROM circular WHERE category IS NOT NULL AND category != '';`);
    console.log(`[Target DB] Total circulars with category on Remote DB: ${remoteCount.rows[0].count}`);
    console.log('\n🎉 Category Sync Completed Successfully without truncating anything!');

  } catch (err) {
    console.error('\n❌ Sync Failed:', err);
  } finally {
    await sourceClient.end();
    await targetClient.end();
  }
}

syncCategories();
