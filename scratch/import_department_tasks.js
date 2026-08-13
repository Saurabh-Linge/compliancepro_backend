const fs = require('fs');
const path = require('path');
const xlsx = require('xlsx');
const { Client } = require('pg');
const dotenv = require('dotenv');

dotenv.config();

const folderPath = 'C:\\Users\\User\\Downloads\\New folder';

const localConfig = {
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '5432', 10),
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD || '1234',
  database: process.env.DB_NAME || 'compliance_pro_local',
};

const targetTabs = ['daily', 'weekly', 'fortnightly', 'monthly', 'qtrly-hy-annual', 'quarterly'];

function isTargetTab(name) {
  const lower = name.trim().toLowerCase();
  return targetTabs.some(t => lower.includes(t));
}

async function run() {
  console.log('=== Starting Import of Department Tasks ===\n');
  console.log(`Folder: ${folderPath}`);

  const client = new Client(localConfig);
  await client.connect();
  console.log('Connected to PostgreSQL Database.\n');

  try {
    // 1. Fetch existing task headers into a map
    const headersRes = await client.query(`SELECT id, name FROM task_header`);
    const headerMap = new Map();
    for (const h of headersRes.rows) {
      headerMap.set(h.name.trim().toLowerCase(), h.id);
    }
    console.log(`Loaded ${headerMap.size} existing Task Headers from database.`);

    // 2. Fetch existing task descriptions to prevent duplicates
    const tasksRes = await client.query(`SELECT LOWER(TRIM(description)) as desc_lower FROM compliance_task`);
    const existingDescSet = new Set(tasksRes.rows.map(r => r.desc_lower));
    console.log(`Loaded ${existingDescSet.size} existing tasks for deduplication check.\n`);

    // Helper to get or create header_id
    async function getOrCreateHeaderId(areaName) {
      const trimmed = (areaName || 'General').trim();
      const lower = trimmed.toLowerCase();
      if (headerMap.has(lower)) {
        return headerMap.get(lower);
      }
      const insRes = await client.query(
        `INSERT INTO task_header (name, created_at, updated_at) VALUES ($1, NOW(), NOW()) RETURNING id`,
        [trimmed]
      );
      const newId = insRes.rows[0].id;
      headerMap.set(lower, newId);
      return newId;
    }

    const files = fs.readdirSync(folderPath).filter(f => f.endsWith('.xlsx') || f.endsWith('.xls'));
    console.log(`Found ${files.length} Department Checklist files to process.\n`);

    let totalParsed = 0;
    let totalInserted = 0;
    let totalSkipped = 0;

    for (const file of files) {
      const filePath = path.join(folderPath, file);
      const workbook = xlsx.readFile(filePath);
      console.log(`--------------------------------------------------`);
      console.log(`Processing File: ${file}`);

      let fileInserted = 0;
      let fileSkipped = 0;

      for (const sheetName of workbook.SheetNames) {
        if (!isTargetTab(sheetName)) continue;

        const sheet = workbook.Sheets[sheetName];
        const rawRows = xlsx.utils.sheet_to_json(sheet, { header: 1, defval: '' });
        if (rawRows.length < 2) continue;

        // Find header row (usually row 1)
        let headerRowIndex = 1;
        let colAreaIdx = 1;
        let colDescIdx = 2;

        // Verify if row 1 has column names
        const row1 = rawRows[1] || [];
        for (let c = 0; c < row1.length; c++) {
          const val = String(row1[c]).toLowerCase();
          if (val.includes('area') || val.includes('function')) colAreaIdx = c;
          if (val.includes('checklist') || val.includes('item') || val.includes('responsibility')) colDescIdx = c;
        }

        // Process data rows (from row 2 onwards)
        for (let r = 2; r < rawRows.length; r++) {
          const row = rawRows[r];
          if (!row || row.length === 0) continue;

          const area = String(row[colAreaIdx] || 'General').trim();
          const description = String(row[colDescIdx] || '').trim();

          if (!description || description.length < 5) continue;
          if (description.toLowerCase().includes('checklist item') || description.toLowerCase() === 'description') continue;

          totalParsed++;
          const descLower = description.toLowerCase();

          if (existingDescSet.has(descLower)) {
            totalSkipped++;
            fileSkipped++;
            continue;
          }

          const headerId = await getOrCreateHeaderId(area);

          await client.query(
            `INSERT INTO compliance_task (
              circular_id,
              authority_id,
              header_id,
              description,
              status,
              is_approved,
              is_discarded,
              priority,
              risk_category,
              business_risk,
              control_risk,
              created_at,
              updated_at
            ) VALUES (
              NULL,
              1,
              $1,
              $2,
              'APPROVED',
              TRUE,
              FALSE,
              'Medium',
              'OPERATIONAL RISK',
              'Medium',
              'Medium',
              NOW(),
              NOW()
            )`,
            [headerId, description]
          );

          existingDescSet.add(descLower);
          totalInserted++;
          fileInserted++;
        }
      }

      console.log(`  -> Inserted: ${fileInserted} tasks, Skipped (duplicates): ${fileSkipped}`);
    }

    console.log(`\n==================================================`);
    console.log(`IMPORT COMPLETED SUCCESSFULLY!`);
    console.log(`Total Tasks Parsed:   ${totalParsed}`);
    console.log(`Total Tasks Inserted: ${totalInserted}`);
    console.log(`Total Tasks Skipped:  ${totalSkipped}`);
    console.log(`Total Headers in DB:  ${headerMap.size}`);
    console.log(`==================================================\n`);

  } catch (err) {
    console.error('Error during import:', err);
  } finally {
    await client.end();
  }
}

run();
