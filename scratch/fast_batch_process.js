const { Client } = require('pg');
const dotenv = require('dotenv');
const fs = require('fs');
const path = require('path');

dotenv.config();

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const AI_MODEL = process.env.AI_MODEL || 'gpt-4o-mini';

async function extractTasksFromText(text) {
  const messages = [
    {
      role: 'system',
      content: `You are a senior banking compliance analyst. Read the following regulatory circular and extract metadata and specific actionable compliance tasks.
IMPORTANT: Extract any mandatory regulatory amendments, operational requirements, reporting deadlines, board/committee approvals, system changes, or compliance action items that a regulated bank/financial entity must perform.

Return ONLY a valid JSON object matching this exact schema:
{
  "reference_no": "string (The official circular reference number, e.g. RBI/2023-24/123) or null",
  "title": "string (The official subject/title of the circular) or null",
  "published_date": "string (YYYY-MM-DD) or null",
  "priority": "High, Medium, or General",
  "circular_type": null,
  "description": "A concise 1-2 sentence executive summary of the circular's objective",
  "is_penalty_applicable": boolean,
  "penalty_amount": number (or null),
  "penalty_description": "string (or null)",
  "tasks": [
    {
      "description": "Clear, actionable compliance task or operational instruction for the bank/department."
    }
  ]
}
If no explicit tasks are found, formulate 1 to 3 standard review/implementation tasks based on the circular's directions.
No explanation, no markdown code fence, no extra text. Only the JSON object.`
    },
    {
      role: 'user',
      content: `Circular Text:\n${text.substring(0, 35000)}\n\nJSON:`
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

  if (!response.ok) {
    throw new Error(`OpenAI error: ${response.status} ${response.statusText}`);
  }

  const data = await response.json();
  return JSON.parse(data.choices[0].message.content);
}

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

async function processOneCircular(pgClient, circ) {
  const circularId = circ.id;
  const fileUrl = circ.file_url;

  if (!fileUrl) {
    await pgClient.query(`UPDATE circular SET ai_processing_status = 'COMPLETED' WHERE id = $1`, [circularId]);
    return { circularId, tasks: 0, status: 'NO_FILE', title: circ.title };
  }

  let cleanPath = fileUrl.startsWith('http') ? new URL(fileUrl).pathname : fileUrl;
  cleanPath = cleanPath.replace(/^\/+/, '');
  const absolutePath = path.join(process.cwd(), cleanPath);

  let text = '';
  if (fs.existsSync(absolutePath)) {
    const buffer = fs.readFileSync(absolutePath);
    text = await extractPdfText(buffer);
  }

  if (text.length < 20) {
    text = circ.title || 'Regulatory circular instructions';
  }

  // Call OpenAI
  const aiData = await extractTasksFromText(text);
  const tasks = aiData.tasks || [];

  // Update circular metadata while preserving clean title
  const existingTitle = circ.title?.trim();
  const finalTitle = (existingTitle && existingTitle !== 'Untitled Circular' && existingTitle !== 'Automated scrape from RBI website')
    ? existingTitle
    : (aiData.title || existingTitle || 'Circular');

  await pgClient.query(`
    UPDATE circular SET
      reference_no = COALESCE($1, reference_no),
      priority = COALESCE($2, priority),
      description = COALESCE($3, description),
      is_penalty_applicable = COALESCE($4, is_penalty_applicable),
      penalty_amount = COALESCE($5, penalty_amount),
      penalty_description = COALESCE($6, penalty_description),
      title = $7,
      ai_processing_status = 'COMPLETED'
    WHERE id = $8
  `, [
    aiData.reference_no || null,
    aiData.priority || 'Medium',
    aiData.description || 'Automated scrape from RBI website',
    aiData.is_penalty_applicable || false,
    aiData.penalty_amount || null,
    aiData.penalty_description || null,
    finalTitle,
    circularId
  ]);

  // Insert extracted compliance tasks
  let savedCount = 0;
  for (const t of tasks) {
    const desc = t.description?.trim();
    if (desc) {
      await pgClient.query(
        `INSERT INTO compliance_task (circular_id, description, status) VALUES ($1, $2, 'PENDING')`,
        [circularId, desc]
      );
      savedCount++;
    }
  }

  // Log completion
  await pgClient.query(
    `INSERT INTO circular_log (circular_id, status, message) VALUES ($1, 'COMPLETED', $2)`,
    [circularId, `Finished fast processing. ${savedCount} task(s) saved.`]
  );

  return { circularId, tasks: savedCount, title: finalTitle };
}

async function startBatchProcessor() {
  const pgClient = new Client({
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '5432', 10),
    user: process.env.DB_USER || 'postgres',
    password: process.env.DB_PASSWORD || 'postgres',
    database: process.env.DB_NAME || 'compliancepro',
  });

  await pgClient.connect();
  console.log('[FastBatch] Connected to PostgreSQL!');

  const queuedRes = await pgClient.query(`
    SELECT c.id, c.title, cf.file_url 
    FROM circular c
    LEFT JOIN circular_file cf ON cf.circular_id = c.id
    WHERE c.ai_processing_status = 'QUEUED'
    ORDER BY c.id ASC;
  `);

  const queued = queuedRes.rows;
  console.log(`[FastBatch] Found ${queued.length} circulars to process with OpenAI ${AI_MODEL}`);

  if (queued.length === 0) {
    console.log('[FastBatch] No QUEUED circulars left!');
    await pgClient.end();
    return;
  }

  const CONCURRENCY = 6; // Process 6 circulars in parallel
  let index = 0;
  let completedCount = 0;

  async function worker(workerId) {
    while (index < queued.length) {
      const circ = queued[index++];
      try {
        const result = await processOneCircular(pgClient, circ);
        completedCount++;
        console.log(`[Worker ${workerId}] [${completedCount}/${queued.length}] Circular #${result.circularId} COMPLETED (${result.tasks} tasks) - "${result.title?.substring(0, 50)}..."`);
      } catch (err) {
        console.error(`[Worker ${workerId}] Circular #${circ.id} error:`, err.message);
      }
    }
  }

  console.log(`[FastBatch] Launching ${CONCURRENCY} parallel workers...\n`);
  const startTime = Date.now();
  await Promise.all(Array.from({ length: CONCURRENCY }, (_, i) => worker(i + 1)));

  const totalTimeSec = ((Date.now() - startTime) / 1000).toFixed(1);
  console.log(`\n🎉 [FastBatch] All done! Processed ${completedCount} circulars in ${totalTimeSec}s!`);
  await pgClient.end();
}

startBatchProcessor();
