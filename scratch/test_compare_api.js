const fs = require('fs');
const path = require('path');

async function main() {
  const filePath = path.join(__dirname, '..', 'uploads', 'circulars', '2026', '06', 'NT16738E653AADCEC4217BEFFA92C050F69AD_c173b3e284eeda12.PDF');
  console.log(`Reading test PDF: ${filePath}`);
  if (!fs.existsSync(filePath)) {
    console.error(`File does not exist: ${filePath}`);
    return;
  }

  const fileBuffer = fs.readFileSync(filePath);
  const fileBlob = new Blob([fileBuffer], { type: 'application/pdf' });
  
  const form = new FormData();
  form.append('file', fileBlob, 'test_revised.pdf');

  console.log('Sending POST request to http://localhost:3580/circulars/2838/compare...');
  try {
    const response = await fetch('http://localhost:3580/circulars/2838/compare', {
      method: 'POST',
      body: form
    });
    
    console.log(`Status: ${response.status} ${response.statusText}`);
    const data = await response.text();
    console.log('Response text:');
    try {
      console.log(JSON.stringify(JSON.parse(data), null, 2));
    } catch {
      console.log(data);
    }
  } catch (err) {
    console.error('Request failed:', err);
  }
}

main().catch(console.error);
