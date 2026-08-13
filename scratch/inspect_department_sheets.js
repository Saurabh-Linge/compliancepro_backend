const fs = require('fs');
const path = require('path');
const xlsx = require('xlsx');

const folderPath = 'C:\\Users\\User\\Downloads\\New folder';

const targetTabs = ['Daily', 'Weekly', 'Fortnightly', 'Monthly', 'Quarterly'];

function normalizeTabName(name) {
  const trimmed = name.trim().toLowerCase();
  for (const t of targetTabs) {
    if (trimmed === t.toLowerCase()) return t;
  }
  return null;
}

function run() {
  console.log('=== Inspecting Department Sheets in:', folderPath, '===\n');
  const files = fs.readdirSync(folderPath).filter(f => f.endsWith('.xlsx') || f.endsWith('.xls'));
  console.log(`Found ${files.length} files.\n`);

  let totalTasks = 0;
  const summary = [];

  for (const file of files) {
    const filePath = path.join(folderPath, file);
    const workbook = xlsx.readFile(filePath);
    const sheetNames = workbook.SheetNames;
    
    console.log(`\n========================================`);
    console.log(`File: ${file}`);
    console.log(`All Sheets:`, sheetNames);

    const fileSummary = { file, tabs: {} };

    for (const sheetName of sheetNames) {
      const matchedTab = normalizeTabName(sheetName);
      if (!matchedTab) continue;

      const sheet = workbook.Sheets[sheetName];
      const data = xlsx.utils.sheet_to_json(sheet, { defval: '' });
      const firstRow = data[0] || {};
      const columns = Object.keys(firstRow);

      // Find Checklist Item column
      let checklistCol = columns.find(c => c.toLowerCase().includes('checklist') || c.toLowerCase().includes('item') || c.toLowerCase().includes('task') || c.toLowerCase().includes('description'));
      
      const validItems = data
        .map(row => checklistCol ? row[checklistCol] : null)
        .filter(item => item && String(item).trim().length > 0);

      console.log(`  Tab [${matchedTab}]: ${data.length} rows (${validItems.length} checklist items) | Col matched: "${checklistCol}"`);
      if (data.length > 0 && checklistCol) {
        console.log(`    Sample 1:`, JSON.stringify(validItems[0] || ''));
      }

      totalTasks += validItems.length;
      fileSummary.tabs[matchedTab] = {
        rowCount: data.length,
        itemCount: validItems.length,
        columns,
        checklistCol
      };
    }
    summary.push(fileSummary);
  }

  console.log('\n========================================');
  console.log(`TOTAL VALID TASKS ACROSS ALL FILES: ${totalTasks}`);
}

run();
