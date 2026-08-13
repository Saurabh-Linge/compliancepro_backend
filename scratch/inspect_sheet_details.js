const path = require('path');
const xlsx = require('xlsx');

const file = 'C:\\Users\\User\\Downloads\\New folder\\Accounts_Department_RBI_Compliance_Checklist.xlsx';
const workbook = xlsx.readFile(file);

console.log('Sheet Names:', workbook.SheetNames);

for (const name of workbook.SheetNames) {
  console.log(`\n================== SHEET: ${name} ==================`);
  const sheet = workbook.Sheets[name];
  const rawJson = xlsx.utils.sheet_to_json(sheet, { header: 1 });
  console.log(`Total raw rows: ${rawJson.length}`);
  for (let i = 0; i < Math.min(6, rawJson.length); i++) {
    console.log(`Row ${i}:`, JSON.stringify(rawJson[i]));
  }
}
