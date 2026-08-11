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

async function migrateTable(sourceClient, targetClient, tableName, seqName = null, batchSize = 250) {
  console.log(`\n--- Migrating Table: ${tableName} ---`);
  
  // 1. Fetch source columns
  const colsRes = await sourceClient.query(`
    SELECT column_name 
    FROM information_schema.columns 
    WHERE table_name = $1 
    ORDER BY ordinal_position;
  `, [tableName]);
  
  const columns = colsRes.rows.map(r => r.column_name);
  console.log(`[${tableName}] Columns: ${columns.join(', ')}`);

  // 2. Fetch all source rows
  const sourceRowsRes = await sourceClient.query(`SELECT * FROM ${tableName} ORDER BY id ASC;`);
  const rows = sourceRowsRes.rows;
  console.log(`[${tableName}] Found ${rows.length} rows in Source DB.`);

  if (rows.length === 0) {
    console.log(`[${tableName}] No rows to migrate.`);
    return;
  }

  // 3. Batch insert into Target DB
  for (let i = 0; i < rows.length; i += batchSize) {
    const batch = rows.slice(i, i + batchSize);
    
    // Construct parameterized multi-row insert query
    const valueClauses = [];
    const values = [];
    let paramIndex = 1;

    for (const row of batch) {
      const rowParams = [];
      for (const col of columns) {
        let val = row[col];
        // Handle array formatting if pgvector or array
        rowParams.push(`$${paramIndex++}`);
        values.push(val);
      }
      valueClauses.push(`(${rowParams.join(', ')})`);
    }

    const insertQuery = `
      INSERT INTO ${tableName} (${columns.map(c => `"${c}"`).join(', ')})
      VALUES ${valueClauses.join(', ')}
      ON CONFLICT DO NOTHING;
    `;

    await targetClient.query(insertQuery, values);
    process.stdout.write(`\r[${tableName}] Migrated ${Math.min(i + batchSize, rows.length)} / ${rows.length} rows...`);
  }

  console.log(`\n[${tableName}] Successfully migrated ${rows.length} rows to Target DB!`);

  // 4. Update Postgres sequence if applicable
  if (seqName) {
    try {
      await targetClient.query(`SELECT setval('${seqName}', COALESCE((SELECT MAX(id) FROM ${tableName}), 1), true);`);
      console.log(`[${tableName}] Reset sequence '${seqName}'.`);
    } catch (e) {
      console.warn(`[${tableName}] Could not reset sequence '${seqName}': ${e.message}`);
    }
  }
}

async function runMigration() {
  console.log('=====================================================');
  console.log('   MIGRATE CLEAN CIRCULARS TO REMOTE DATABASE       ');
  console.log('=====================================================');
  console.log(`Source DB : ${sourceConfig.user}@${sourceConfig.host}:${sourceConfig.port}/${sourceConfig.database}`);
  console.log(`Target DB : ${targetConfig.user}@${targetConfig.host}:${targetConfig.port}/${targetConfig.database}`);
  console.log('-----------------------------------------------------\n');

  const sourceClient = new Client(sourceConfig);
  const targetClient = new Client(targetConfig);

  try {
    console.log('[Connecting] Connecting to Source Local DB...');
    await sourceClient.connect();
    console.log('[Connected] Source DB connected successfully!');

    console.log('[Connecting] Connecting to Target Remote DB...');
    await targetClient.connect();
    console.log('[Connected] Target DB connected successfully!');

    // 1. Cleanly Truncate target tables
    console.log('\n[Target DB] Truncating mismatched circular & task tables in Target DB...');
    await targetClient.query(`
      TRUNCATE TABLE 
        assignment_task,
        assignment,
        task_set,
        compliance_task,
        circular_file,
        circular_log,
        circular_amendment,
        circular,
        task_set_branch,
        task_set_mapping
      RESTART IDENTITY CASCADE;
    `);
    console.log('[Target DB] Cleaned and reset all target tables.');

    // 2. Migrate Tables in Order of Dependencies
    await migrateTable(sourceClient, targetClient, 'circular', 'circular_id_seq');
    await migrateTable(sourceClient, targetClient, 'circular_file', 'circular_file_id_seq');
    await migrateTable(sourceClient, targetClient, 'compliance_task', 'compliance_task_id_seq');
    await migrateTable(sourceClient, targetClient, 'circular_amendment', 'circular_amendment_id_seq');
    await migrateTable(sourceClient, targetClient, 'circular_log', 'circular_log_id_seq');

    // 3. Migrate & Sync scraper_state
    console.log('\n--- Syncing scraper_state ---');
    const stateRes = await sourceClient.query('SELECT * FROM scraper_state WHERE authority_name = $1', ['RBI']);
    if (stateRes.rows.length > 0) {
      const state = stateRes.rows[0];
      await targetClient.query(`
        INSERT INTO scraper_state (authority_name, last_processed_date, last_reference_no, updated_at)
        VALUES ($1, $2, $3, $4)
        ON CONFLICT (authority_name) 
        DO UPDATE SET 
          last_processed_date = EXCLUDED.last_processed_date,
          last_reference_no = EXCLUDED.last_reference_no,
          updated_at = EXCLUDED.updated_at;
      `, [state.authority_name, state.last_processed_date, state.last_reference_no, state.updated_at]);
      console.log(`[scraper_state] Target DB updated to last_processed_date: ${state.last_processed_date}`);
    }

    // 4. Verification
    console.log('\n=====================================================');
    console.log('                MIGRATION VERIFICATION               ');
    console.log('=====================================================');
    const tables = ['circular', 'circular_file', 'compliance_task', 'circular_amendment', 'circular_log'];
    for (const t of tables) {
      const srcC = await sourceClient.query(`SELECT count(*) FROM ${t}`);
      const tgtC = await targetClient.query(`SELECT count(*) FROM ${t}`);
      console.log(`  ${t.padEnd(20)} | Source: ${srcC.rows[0].count.padStart(5)} | Target: ${tgtC.rows[0].count.padStart(5)} | Status: ${srcC.rows[0].count === tgtC.rows[0].count ? '✅ MATCH' : '❌ MISMATCH'}`);
    }
    console.log('=====================================================\n');
    console.log('🎉 Full Migration Completed Successfully!');

  } catch (err) {
    console.error('\n❌ Migration Failed:', err);
  } finally {
    await sourceClient.end();
    await targetClient.end();
  }
}

runMigration();
