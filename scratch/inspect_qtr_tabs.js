const fs = require('fs');
const path = require('path');
const xlsx = require('xlsx');

const folderPath = 'C:\\Users\\User\\Downloads\\New folder';
const files = fs.readdirSync(folderPath).filter(f => f.endsWith('.xlsx') || f.endsWith('.xls'));

for (const file of files) {
  const filePath = path.join(folderPath, file);
  const workbook = xlsx.readFile(filePath);
  const qtrSheet = workbook.SheetNames.find(s => s.toLowerCase().includes('qtr') || s.toLowerCase().includes('quarterly'));
  if (qtrSheet) {
    const sheet = workbook.Sheets[qtrSheet];
    const rawJson = xlsx.utils.sheet_to_json(sheet, { header: 1 });
    console.log(`\nFile: ${file} | Sheet: ${qtrSheet} | Rows: ${rawJson.length - 2}`);
    for (let i = 2; i < Math.min(6, rawJson.length); i++) {
      const row = rawJson[i];
      console.log(`  [${row[0]}] Area: "${row[1]}" | Item: "${(row[2] || '').substring(0, 80)}..."`);
    }
  }
}
