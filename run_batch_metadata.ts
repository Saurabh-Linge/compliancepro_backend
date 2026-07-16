import { Client } from 'pg';
import * as fs from 'fs';
import * as path from 'path';
import * as https from 'https';
import * as http from 'http';

// Simple manual .env parser
function loadEnv() {
  const envPath = path.join(__dirname, '.env');
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

const client = new Client({
  host: 'db.kredpool.ai',
  port: 5432,
  user: 'postgres',
  password: 'dms@kredpool450',
  database: 'compliance_pro',
  ssl: false
});

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

async function queryGroq(text: string, apiKey: string): Promise<string> {
  const systemPrompt = `You are a compliance analyst. Read the following regulatory circular and extract metadata and actionable compliance tasks.
Return ONLY a valid JSON object matching this exact schema:
{
  "reference_no": "string or null",
  "title": "string or null",
  "published_date": "string (The official publication date from the circular in YYYY-MM-DD format, e.g. 2026-06-24) or null",
  "priority": "High, Medium, or General",
  "circular_type": null,
  "description": "A short 1-2 sentence summary of the circular",
  "is_penalty_applicable": boolean,
  "penalty_amount": number (or null),
  "penalty_description": "string (or null)",
  "tasks": []
}
No explanation, no markdown, no extra text. Only the JSON object.`;

  const userPrompt = `Circular Text:\n${text}\n\nJSON:`;

  const requestBody = JSON.stringify({
    model: 'llama-3.3-70b-versatile',
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt }
    ],
    stream: false,
    temperature: 0.1
  });

  return new Promise<string>((resolve, reject) => {
    const req = https.request({
      hostname: 'api.groq.com',
      path: '/openai/v1/chat/completions',
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(requestBody)
      }
    }, (res) => {
      let data = '';
      res.on('data', (chunk) => data += chunk);
      res.on('end', () => resolve(data));
    });

    req.on('error', reject);
    req.write(requestBody);
    req.end();
  });
}

async function queryOllama(text: string): Promise<string> {
  const systemPrompt = `You are a compliance analyst. Read the following regulatory circular and extract metadata and actionable compliance tasks.
Return ONLY a valid JSON object matching this exact schema:
{
  "reference_no": "string or null",
  "title": "string or null",
  "published_date": "string (The official publication date from the circular in YYYY-MM-DD format, e.g. 2026-06-24) or null",
  "priority": "High, Medium, or General",
  "circular_type": null,
  "description": "A short 1-2 sentence summary of the circular",
  "is_penalty_applicable": boolean,
  "penalty_amount": number (or null),
  "penalty_description": "string (or null)",
  "tasks": []
}
No explanation, no markdown, no extra text. Only the JSON object.`;

  const userPrompt = `Circular Text:\n${text}\n\nJSON:`;

  const requestBody = JSON.stringify({
    model: 'llama3',
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt }
    ],
    stream: false,
    options: {
      temperature: 0.1
    }
  });

  return new Promise<string>((resolve, reject) => {
    const req = http.request({
      hostname: 'localhost',
      port: 11434,
      path: '/v1/chat/completions',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(requestBody)
      }
    }, (res) => {
      let data = '';
      res.on('data', (chunk) => data += chunk);
      res.on('end', () => resolve(data));
    });

    req.on('error', reject);
    req.write(requestBody);
    req.end();
  });
}

async function main() {
  await client.connect();
  console.log('[DB] Connected successfully!');

  // Query all circulars where the title is still a placeholder (starting with 'RBI/' or contains 'Circular No.')
  const circularsRes = await client.query(`
    SELECT id, title 
    FROM circular 
    WHERE title LIKE 'RBI/%' OR title LIKE '%Circular No.%' OR title LIKE '%Cir.No.%'
    ORDER BY id DESC
  `);

  console.log(`[Batch] Found ${circularsRes.rows.length} circulars with placeholder titles to process.`);
  
  const apiKey = process.env.GROQ_API_KEY;
  const unpdf = await import('unpdf');

  for (let i = 0; i < circularsRes.rows.length; i++) {
    const { id, title } = circularsRes.rows[i];
    console.log(`\n----------------------------------------`);
    console.log(`[${i + 1}/${circularsRes.rows.length}] Processing Circular ID: ${id} (Current Title: "${title}")`);

    try {
      // 1. Get file details
      const filesRes = await client.query(
        `SELECT file_url FROM circular_file WHERE circular_id = $1`,
        [id]
      );

      if (filesRes.rows.length === 0) {
        console.log(`[Skip] No files found for Circular ID: ${id}`);
        continue;
      }

      const { file_url } = filesRes.rows[0];
      const absolutePath = path.join(__dirname, file_url);

      if (!fs.existsSync(absolutePath)) {
        console.log(`[Skip] Local file does not exist: ${absolutePath}`);
        continue;
      }

      // 2. Read and extract text
      const fileBuffer = fs.readFileSync(absolutePath);
      const uint8Array = new Uint8Array(fileBuffer.buffer, fileBuffer.byteOffset, fileBuffer.byteLength);
      const pdfData = await unpdf.extractText(uint8Array);
      const text = Array.isArray(pdfData.text) ? pdfData.text.join('\n') : pdfData.text;

      if (!text || text.trim().length === 0) {
        console.log(`[Skip] Extracted PDF text is empty.`);
        continue;
      }

      // 3. Query AI (with fallback)
      let aiContent = '';
      let success = false;

      // Try Groq first (with auto-retry on per-minute rate limits)
      if (apiKey) {
        let attempts = 0;
        const maxAttempts = 3;
        while (attempts < maxAttempts && !success) {
          attempts++;
          try {
            console.log(`[AI] Querying Groq Cloud (Attempt ${attempts}/${maxAttempts})...`);
            const responseText = await queryGroq(text, apiKey);
            const responseJson = JSON.parse(responseText);
            
            if (responseJson.error) {
              const errMsg = responseJson.error.message || '';
              console.log(`[AI] Groq error: ${errMsg}`);
              
              if (errMsg.includes('Rate limit reached') && !errMsg.includes('tokens per day (TPD)')) {
                // Parse rate limit wait time from error message
                const match = errMsg.match(/try again in ([\d\.]+)s/);
                const waitSec = match ? parseFloat(match[1]) : 15;
                console.log(`[Rate Limit] TPM hit. Waiting ${waitSec.toFixed(1)}s before retry...`);
                await sleep((waitSec + 1) * 1000);
              } else {
                // For daily limit (TPD) or other errors, break and fall back to local Ollama
                break;
              }
            } else {
              aiContent = responseJson.choices[0].message.content;
              success = true;
              console.log('[AI] Groq response received successfully.');
            }
          } catch (err: any) {
            console.log(`[AI] Groq call failed: ${err.message}`);
            break;
          }
        }
      }

      // Fallback to local Ollama if Groq failed or is rate-limited
      if (!success) {
        console.log('[AI] Falling back to local Ollama (llama3)...');
        try {
          const responseText = await queryOllama(text);
          const responseJson = JSON.parse(responseText);
          aiContent = responseJson.choices[0].message.content;
          success = true;
          console.log('[AI] Ollama response received successfully.');
        } catch (err: any) {
          console.error(`[Error] Both Groq and local Ollama failed for ID ${id}: ${err.message}`);
          continue;
        }
      }

      // 4. Parse JSON and apply fallback for null title
      const jsonMatch = aiContent.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        console.log('[Skip] Could not find valid JSON in AI response.');
        continue;
      }

      const extractedData = JSON.parse(jsonMatch[0]);
      let extractedTitle = extractedData.title || null;
      let extractedDesc = extractedData.description || null;

      // Fallback: If title is missing/null but description is a short title-like string, use description as title
      if (!extractedTitle && extractedDesc && extractedDesc.length < 180) {
        extractedTitle = extractedDesc;
      }

      if (!extractedTitle) {
        console.log('[Skip] Extracted title is empty/null even after fallback.');
        continue;
      }

      // 5. Update DB
      console.log(`[DB] Updating title: "${extractedTitle.substring(0, 60)}..."`);
      await client.query(
        `UPDATE circular SET 
          reference_no = COALESCE($1, reference_no), 
          priority = COALESCE($2, priority),
          circular_type = COALESCE($3, circular_type),
          description = COALESCE($4, description),
          is_penalty_applicable = COALESCE($5, is_penalty_applicable),
          penalty_amount = COALESCE($6, penalty_amount),
          penalty_description = COALESCE($7, penalty_description),
          title = COALESCE($8, title),
          published_date = COALESCE($10, published_date),
          ai_processing_status = 'COMPLETED'
         WHERE id = $9`,
        [
          extractedData.reference_no || null,
          extractedData.priority || 'General',
          extractedData.circular_type || null,
          extractedDesc || 'Automated scrape from RBI website',
          extractedData.is_penalty_applicable || false,
          extractedData.penalty_amount || null,
          extractedData.penalty_description || null,
          extractedTitle,
          id,
          extractedData.published_date || null
        ]
      );
      console.log('[DB] Database record updated successfully!');

      // Add a small 1-second delay between calls to respect API pacing
      await sleep(1000);

    } catch (loopErr: any) {
      console.error(`[Error] Failed to process Circular ID ${id}:`, loopErr.message);
    }
  }

  console.log('\n[Batch] Finished processing all circulars!');
}

main()
  .catch(err => console.error('[Fatal Error]', err))
  .finally(() => client.end());
