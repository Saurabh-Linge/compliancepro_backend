const { Client } = require('pg');
const dotenv = require('dotenv');
const fs = require('fs');
const path = require('path');

dotenv.config();

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const AI_MODEL = process.env.AI_MODEL || 'gpt-4o-mini';

async function extractPdfHeader(buffer) {
  try {
    const unpdf = await import('unpdf');
    const uint8Array = new Uint8Array(buffer.buffer, buffer.byteOffset, buffer.byteLength);
    const data = await unpdf.extractText(uint8Array);
    const fullText = Array.isArray(data.text) ? data.text.join('\n') : (data.text || '');
    // Header is usually within the first 6,000 characters
    return fullText.substring(0, 8000);
  } catch (e) {
    return '';
  }
}

async function extractCategory(headerText, title, retries = 3) {
  const messages = [
    {
      role: 'system',
      content: `You are a senior banking compliance analyst. Read the following regulatory circular header and determine the target entity category to which this circular is addressed / meant for.

Standard Banking Categories List:
1. "All Regulated Entities" (Default when circular applies to all banks & REs or general payment/statutory instructions)
2. "Commercial Banks" (Scheduled Commercial Banks, Public/Private/Foreign banks)
3. "Small Finance Banks"
4. "Payments Banks"
5. "Urban Co-operative Banks"
6. "Rural Co-operative Banks" (State/District Co-operative banks)
7. "Regional Rural Banks"
8. "Non-Banking Financial Companies (NBFCs)"
9. "Housing Finance Companies (HFCs)"
10. "All-India Financial Institutions (AIFIs)" (EXIM Bank, NABARD, NHB, SIDBI, NaBFID)
11. "Authorized Dealers (AD Category-I Banks)" (FEMA / Forex / Trade)
12. "Credit Information Companies (CICs)"

Instructions:
- Return one or more comma-separated categories selected STRICTLY from the above 12 standard names.
- If it applies to all or multiple broad classes without specific distinction, return "All Regulated Entities".

Return ONLY valid JSON matching this exact schema:
{
  "category": "string (One or more standard categories from the list above)"
}
No extra text.`
    },
    {
      role: 'user',
      content: `Circular Title: ${title}\n\nHeader & Text Snippet:\n${headerText || title}\n\nJSON:`
    }
  ];

  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
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
          temperature: 0.1,
          max_tokens: 150
        })
      });

      if (response.status === 429 && attempt < retries) {
        console.warn(`[OpenAI 429] Rate limit hit. Waiting ${attempt * 3}s before retry...`);
        await new Promise(r => setTimeout(r, attempt * 3000));
        continue;
      }

      if (!response.ok) {
        throw new Error(`OpenAI HTTP ${response.status}: ${response.statusText}`);
      }

      const data = await response.json();
      const parsed = JSON.parse(data.choices[0].message.content);
      return parsed.category || 'All Regulated Entities';
    } catch (err) {
      if (attempt === retries) throw err;
      await new Promise(r => setTimeout(r, attempt * 2000));
    }
  }
  return 'All Regulated Entities';
}

async function populateCategories() {
  const client = new Client({
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '5432', 10),
    user: process.env.DB_USER || 'postgres',
    password: process.env.DB_PASSWORD || '1234',
    database: process.env.DB_NAME || 'compliance_pro_local',
  });

  await client.connect();
  console.log('[DB] Connected to PostgreSQL!');

  const queryRes = await client.query(`
    SELECT c.id, c.title, c.reference_no, c.published_date, cf.file_url 
    FROM circular c
    LEFT JOIN circular_file cf ON cf.circular_id = c.id
    WHERE (c.category IS NULL OR c.category = '')
      AND (EXTRACT(YEAR FROM c.published_date) >= 2018 OR c.published_date >= '2018-01-01')
    ORDER BY c.id ASC;
  `);

  const circulars = queryRes.rows;
  console.log(`[Phase 1: 2018-2026] Found ${circulars.length} remaining circulars requiring category extraction.`);

  if (circulars.length === 0) {
    console.log('[Populate] All circulars already have category assigned!');
    await client.end();
    return;
  }

  const CONCURRENCY = 4;
  let index = 0;
  let completed = 0;

  async function worker(workerId) {
    while (index < circulars.length) {
      const circ = circulars[index++];
      try {
        let headerText = '';
        if (circ.file_url) {
          let cleanPath = circ.file_url.startsWith('http') ? new URL(circ.file_url).pathname : circ.file_url;
          cleanPath = cleanPath.replace(/^\/+/, '');
          const absolutePath = path.join(process.cwd(), cleanPath);
          if (fs.existsSync(absolutePath)) {
            const buffer = fs.readFileSync(absolutePath);
            headerText = await extractPdfHeader(buffer);
          }
        }

        const category = await extractCategory(headerText, circ.title);
        
        await client.query(`UPDATE circular SET category = $1 WHERE id = $2`, [category, circ.id]);
        completed++;
        console.log(`[Worker ${workerId}] [${completed}/${circulars.length}] Circular #${circ.id}: [${category}] - "${circ.title.substring(0, 45)}..."`);
      } catch (err) {
        console.error(`[Worker ${workerId}] Circular #${circ.id} error:`, err.message);
      }
    }
  }

  console.log(`[Populate] Launching ${CONCURRENCY} parallel category workers...\n`);
  const start = Date.now();
  await Promise.all(Array.from({ length: CONCURRENCY }, (_, i) => worker(i + 1)));
  const totalTime = ((Date.now() - start) / 1000).toFixed(1);

  console.log(`\n🎉 [Populate] Successfully populated category for ${completed} circulars in ${totalTime}s!`);
  await client.end();
}

populateCategories();
