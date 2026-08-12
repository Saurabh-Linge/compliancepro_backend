const { Client } = require('pg');
const dotenv = require('dotenv');
const fs = require('fs');
const path = require('path');

dotenv.config();

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const AI_MODEL = process.env.AI_MODEL || 'gpt-4o-mini';

async function extractPdfText(buffer) {
  try {
    const unpdf = await import('unpdf');
    const uint8Array = new Uint8Array(buffer.buffer, buffer.byteOffset, buffer.byteLength);
    const data = await unpdf.extractText(uint8Array);
    return Array.isArray(data.text) ? data.text.join('\n') : (data.text || '');
  } catch (e) {
    return '';
  }
}

async function extractCategoryAndTasks(text) {
  const messages = [
    {
      role: 'system',
      content: `You are a senior banking compliance analyst. Read the following regulatory circular header and text.
Extract:
1. "category": Identify which category/entities this circular is addressed to or meant for (e.g. "Commercial Banks", "Small Finance Banks", "Urban Co-operative Banks", "Rural Co-operative Banks", "NBFCs", "Housing Finance Companies", "Payments Banks", "All Regulated Entities", "Authorized Dealers (AD Category-I Banks)"). If multiple, list them comma-separated.
2. "reference_no": Official circular reference number.
3. "title": Official subject/title.

Return ONLY a valid JSON object matching this exact schema:
{
  "category": "string (e.g. Commercial Banks, Urban Co-operative Banks, NBFCs, Small Finance Banks, All Regulated Entities)",
  "reference_no": "string or null",
  "title": "string or null"
}
No explanation, no markdown code fence, no extra text. Only JSON.`
    },
    {
      role: 'user',
      content: `Circular Header & Text:\n${text.substring(0, 8000)}\n\nJSON:`
    }
  ];

  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${OPENAI_API_KEY}`
    },
    body: JSON.stringify({
      model: AI_MODEL,
      messages,
      response_format: { type: 'json_object' },
      temperature: 0.1
    })
  });

  const data = await response.json();
  return JSON.parse(data.choices[0].message.content);
}

async function testCategoryOnSample() {
  const client = new Client({
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '5432', 10),
    user: process.env.DB_USER || 'postgres',
    password: process.env.DB_PASSWORD || '1234',
    database: process.env.DB_NAME || 'compliance_pro_local',
  });

  await client.connect();
  console.log('[DB] Connected to PostgreSQL!');

  // Pick 9 diverse circulars
  const res = await client.query(`
    SELECT c.id, c.title, c.reference_no, cf.file_url 
    FROM circular c
    JOIN circular_file cf ON cf.circular_id = c.id
    WHERE cf.file_url IS NOT NULL
    ORDER BY c.id DESC
    LIMIT 9;
  `);

  console.log(`\nTesting Category Extraction on ${res.rows.length} Sample Circulars:\n`);

  const results = [];
  for (const circ of res.rows) {
    let cleanPath = circ.file_url.startsWith('http') ? new URL(circ.file_url).pathname : circ.file_url;
    cleanPath = cleanPath.replace(/^\/+/, '');
    const absolutePath = path.join(process.cwd(), cleanPath);

    let text = '';
    if (fs.existsSync(absolutePath)) {
      const buffer = fs.readFileSync(absolutePath);
      text = await extractPdfText(buffer);
    }

    if (text.length > 50) {
      const aiResult = await extractCategoryAndTasks(text);
      results.push({
        id: circ.id,
        reference_no: circ.reference_no,
        title: circ.title,
        extracted_category: aiResult.category
      });
      console.log(`✔ Circular #${circ.id}: [Category: "${aiResult.category}"] -> "${circ.title.substring(0, 60)}..."`);
    }
  }

  console.log('\n--- Summary Table ---');
  console.table(results);
  await client.end();
}

testCategoryOnSample();
