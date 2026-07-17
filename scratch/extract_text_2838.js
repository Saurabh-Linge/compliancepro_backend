const fs = require('fs');
const path = require('path');

async function main() {
  const filePath = path.join(__dirname, '..', 'uploads', 'circulars', '2026', '06', 'NT16738E653AADCEC4217BEFFA92C050F69AD_c173b3e284eeda12.PDF');
  console.log(`Reading file: ${filePath}`);
  if (!fs.existsSync(filePath)) {
    console.error(`File does not exist at path: ${filePath}`);
    return;
  }
  const fileBuffer = fs.readFileSync(filePath);
  const unpdf = await import('unpdf');
  const uint8Array = new Uint8Array(fileBuffer.buffer, fileBuffer.byteOffset, fileBuffer.byteLength);
  const pdfData = await unpdf.extractText(uint8Array);
  const text = Array.isArray(pdfData.text) ? pdfData.text.join('\n') : pdfData.text;
  console.log('--- Extracted Text ---');
  console.log(text.substring(0, 1500));
}

main().catch(console.error);
