import { Client } from 'pg';
import * as fs from 'fs';
import * as path from 'path';
import * as https from 'https';

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
        // Remove quotes if present
        if (val.startsWith('"') && val.endsWith('"')) val = val.substring(1, val.length - 1);
        if (val.startsWith("'") && val.endsWith("'")) val = val.substring(1, val.length - 1);
        process.env[key] = val;
      }
    }
  }
}

loadEnv();

const circularId = parseInt(process.argv[2] || '2133', 10);
console.log(`[Standalone Reprocess] Starting for Circular ID: ${circularId}`);

const client = new Client({
  host: 'db.kredpool.ai',
  port: 5432,
  user: 'postgres',
  password: 'dms@kredpool450',
  database: 'compliance_pro',
  ssl: false
});

async function main() {
  await client.connect();
  console.log('[DB] Connected successfully!');

  // 1. Get file details
  const filesRes = await client.query(
    `SELECT file_url, file_name FROM circular_file WHERE circular_id = $1`,
    [circularId]
  );

  if (filesRes.rows.length === 0) {
    console.error(`[Error] No files found for Circular ID: ${circularId}`);
    return;
  }

  const { file_url } = filesRes.rows[0];
  console.log(`[File] Target file URL: ${file_url}`);

  // 2. Read file from disk
  const absolutePath = path.join(__dirname, file_url);
  console.log(`[File] Reading local file: ${absolutePath}`);
  if (!fs.existsSync(absolutePath)) {
    console.error(`[Error] File does not exist at local path: ${absolutePath}`);
    return;
  }

  const fileBuffer = fs.readFileSync(absolutePath);
  console.log(`[File] Read ${fileBuffer.length} bytes successfully.`);

  // 3. Extract text
  console.log('[OCR] Extracting PDF text...');
  const unpdf = await import('unpdf');
  const uint8Array = new Uint8Array(fileBuffer.buffer, fileBuffer.byteOffset, fileBuffer.byteLength);
  const pdfData = await unpdf.extractText(uint8Array);
  const text = Array.isArray(pdfData.text) ? pdfData.text.join('\n') : pdfData.text;
  console.log(`[OCR] Extracted ${text.length} characters.`);

  // 4. Query Groq Cloud API
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) {
    throw new Error('GROQ_API_KEY is not defined in .env file!');
  }
  console.log('[AI] Querying Groq Cloud API (model: llama-3.3-70b-versatile)...');
  
  const systemPrompt = `You are a compliance analyst. Read the following regulatory circular and extract metadata and actionable compliance tasks.
Return ONLY a valid JSON object matching this exact schema:
{
  "reference_no": "string or null",
  "title": "string or null",
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

  const responseText = await new Promise<string>((resolve, reject) => {
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

  const responseJson = JSON.parse(responseText);
  if (responseJson.error) {
    throw new Error(`Groq API Error: ${responseJson.error.message}`);
  }
  
  const aiContent = responseJson.choices[0].message.content;
  console.log(`[AI Response Raw]:\n${aiContent}\n`);

  // Parse extracted json
  const jsonMatch = aiContent.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    throw new Error('No JSON object found in AI response');
  }
  const extractedData = JSON.parse(jsonMatch[0]);

  let extractedTitle = extractedData.title || null;
  let extractedDesc = extractedData.description || null;

  // Fallback: If title is missing/null but description is a short title-like string, use description as title
  if (!extractedTitle && extractedDesc && extractedDesc.length < 180) {
    console.log(`[Fallback] Title is null but description is short (${extractedDesc.length} chars). Using description as title.`);
    extractedTitle = extractedDesc;
  }

  console.log(`[Metadata Result]
- Reference: ${extractedData.reference_no}
- Title: ${extractedTitle}
- Priority: ${extractedData.priority}
- Description: ${extractedDesc}
`);

  // 5. Update DB directly
  console.log('[DB] Updating database record...');
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
      extractedTitle || null,
      circularId
    ]
  );
  console.log('[DB] Database record updated successfully!');
}

main()
  .catch(err => console.error('[Fatal Error]', err))
  .finally(() => client.end());
