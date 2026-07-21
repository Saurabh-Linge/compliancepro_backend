const { Client } = require('pg');
const fs = require('fs');
const path = require('path');
const https = require('https');

const client = new Client({
  host: 'db.kredpool.ai',
  port: 5432,
  user: 'postgres',
  password: 'dms@kredpool450',
  database: 'compliance_pro'
});

function translateText(text) {
  return new Promise((resolve, reject) => {
    const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=en&tl=mr&dt=t&q=${encodeURIComponent(text)}`;
    https.get(url, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          const translated = parsed[0].map(item => item[0]).join('');
          resolve(translated.trim());
        } catch (e) {
          reject(e);
        }
      });
    }).on('error', reject);
  });
}

function walkDir(dir, fileList = []) {
  const files = fs.readdirSync(dir);
  for (const file of files) {
    const filePath = path.join(dir, file);
    const stat = fs.statSync(filePath);
    if (stat.isDirectory()) {
      if (file !== 'node_modules' && file !== '.git' && file !== '.angular') {
        walkDir(filePath, fileList);
      }
    } else {
      if (file.endsWith('.ts') || file.endsWith('.html')) {
        fileList.push(filePath);
      }
    }
  }
  return fileList;
}

async function main() {
  await client.connect();

  console.log('Fetching Marathi language ID...');
  const langRes = await client.query("SELECT id FROM language_master WHERE code = 'mr'");
  if (langRes.rows.length === 0) {
    console.error("Marathi language 'mr' not found.");
    await client.end();
    return;
  }
  const marathiLangId = langRes.rows[0].id;

  const labels = new Set();

  console.log('Scanning frontend files for plain-text template nodes...');
  const frontendDir = 'f:\\KP\\compliance_pro\\compliancepro_frontend\\src';
  const files = walkDir(frontendDir);

  for (const file of files) {
    const content = fs.readFileSync(file, 'utf8');

    // 1. Match HTML text nodes: strings between > and <
    const textNodeRegex = />\s*([^<>\r\n{}()@*#:;]+)\s*</g;
    let match;
    while ((match = textNodeRegex.exec(content)) !== null) {
      const val = match[1].trim();
      if (
        val.length > 1 &&
        /[a-zA-Z]/.test(val) && // Must contain at least one english letter
        !val.includes('//') &&
        !val.startsWith('.') &&
        !val.startsWith('#')
      ) {
        labels.add(val);
      }
    }

    // 2. Match attribute labels
    const attributeRegexes = [
      /label=['"]([^'"]+)['"]/g,
      /placeholder=['"]([^'"]+)['"]/g,
      /pTooltip=['"]([^'"]+)['"]/g,
      /title=['"]([^'"]+)['"]/g,
      /header=['"]([^'"]+)['"]/g,
      /label:\s*['"]([^'"]+)['"]/g,
      /header:\s*['"]([^'"]+)['"]/g,
      /title:\s*['"]([^'"]+)['"]/g
    ];

    for (const regex of attributeRegexes) {
      let attrMatch;
      while ((attrMatch = regex.exec(content)) !== null) {
        const val = attrMatch[1].trim();
        if (
          val.length > 1 &&
          /[a-zA-Z]/.test(val) &&
          !val.includes('{') &&
          !val.includes('}') &&
          !val.includes('/') &&
          !val.startsWith('http')
        ) {
          labels.add(val);
        }
      }
    }
  }

  // Add explicit common terms that are dynamically bound
  const explicitTerms = [
    'Dashboard', 'Reports', 'CCO Review Queue', 'CO Review Queue', 'My Assignments',
    'Select Branch', 'Select Financial Year', 'Select Audit Status', 'Select Compliance Status',
    'Select Audit Type', 'Select Month', 'Select Department', 'All Years', 'All Branches',
    'All Head Of Departments', 'All Audit Types', 'All Audit', 'All Compliance', 'All Statuses',
    'Active', 'Review Pending', 'Re-Audit Needed', 'Re-Compliance Needed', 'Completed', 'Blocked',
    'Expired', 'High Risk', 'Medium Risk', 'Low Risk', 'All Departments', 'Pending Timeline',
    'Timeline Review', 'In Progress', 'Completed', 'Rejected', 'Escalated to CCO',
    'Propose Timeline', 'Setup Timeline', 'Review Timeline', 'Accept Timeline',
    'Submit Timeline Approval', 'Submit Compliance', 'View Compliance', 'Review Evidence'
  ];
  for (const term of explicitTerms) {
    labels.add(term);
  }

  console.log(`Found ${labels.size} potential labels in dashboards and reports. Translating to Marathi...`);

  let successCount = 0;
  for (const label of labels) {
    // Check if translation already exists
    const checkRes = await client.query(
      'SELECT translated_text FROM label_master WHERE english_text = $1 AND language_id = $2',
      [label, marathiLangId]
    );

    if (checkRes.rows.length > 0) {
      // Translation exists. Skip to avoid redundant calls.
      continue;
    }

    try {
      const translated = await translateText(label);
      if (translated && translated !== label) {
        await client.query(
          `INSERT INTO label_master (english_text, language_id, translated_text) 
           VALUES ($1, $2, $3) 
           ON CONFLICT (english_text, language_id) DO UPDATE SET translated_text = EXCLUDED.translated_text`,
          [label, marathiLangId, translated]
        );
        console.log(`[Translated & Saved] "${label}" -> "${translated}"`);
        successCount++;
      }
    } catch (err) {
      console.error(`Failed to translate "${label}":`, err.message);
    }
  }

  console.log(`CompliancePro Dashboard and Reports translation completed! Saved ${successCount} fresh translation labels.`);
  await client.end();
}

main().catch(err => {
  console.error(err);
  client.end();
});
