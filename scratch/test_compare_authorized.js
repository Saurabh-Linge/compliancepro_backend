const fs = require('fs');
const path = require('path');
const jwt = require('jsonwebtoken');

function loadEnv() {
  const envPath = path.join(__dirname, '..', '.env');
  if (fs.existsSync(envPath)) {
    const content = fs.readFileSync(envPath, 'utf8');
    for (const line of content.split('\n')) {
      const match = line.match(/^\s*([^#=]+)\s*=\s*(.*)\s*$/);
      if (match) {
        const key = match[1].trim();
        let val = match[2].trim();
        if (val.startsWith('"') && val.endsWith('"')) val = val.substring(1, val.length - 1);
        if (val.startsWith("'") && val.endsWith("'")) val = val.substring(1, val.length - 1);
        process.env[key] = val;
      }
    }
  }
}

loadEnv();

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

  // Generate a mock JWT token
  const secret = process.env.JWT_SECRET || 'compliance-pro-secret-key-2026';
  const payload = {
    username: 'admin',
    sub: 1,
    fullName: 'Administrator',
    role: 'Admin',
    branchId: 1
  };
  const token = jwt.sign(payload, secret, { expiresIn: '1h' });
  console.log(`Generated JWT token: ${token.substring(0, 20)}...`);

  console.log('Sending authorized POST request to http://localhost:3580/circulars/2838/compare...');
  try {
    const response = await fetch('http://localhost:3580/circulars/2838/compare', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`
      },
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
