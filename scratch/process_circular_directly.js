const { Client } = require('pg');
const fs = require('fs');
const path = require('path');

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

const client = new Client({
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '5432', 10),
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD || '1234',
  database: process.env.DB_NAME || 'compliance_pro_local',
  ssl: process.env.DB_SSL === 'true'
});

const TASKS = [
  "Formulate and implement board-approved policy on customer protection and limiting liability for unauthorized electronic transactions by January 1, 2027.",
  "Set up a 24x7 mechanism (such as toll-free help line, SMS, email) for customers to immediately report unauthorized transactions.",
  "Ensure immediate response and acknowledgment of unauthorized transaction complaints, providing a unique complaint number.",
  "Credit the customer's account with the value of the disputed unauthorized transaction within 10 working days of reporting (shadow reversal).",
  "Resolve complaints of unauthorized transactions and establish liability of customer/bank within 90 days from the receipt of complaint."
];

async function main() {
  const circularId = 2838;
  await client.connect();
  console.log('[DB] Connected successfully!');

  // Check if circular exists
  const circRes = await client.query('SELECT * FROM circular WHERE id = $1', [circularId]);
  if (circRes.rows.length === 0) {
    console.error(`Circular ${circularId} not found in database!`);
    await client.end();
    return;
  }

  const circular = circRes.rows[0];
  console.log(`Processing circular: ${circular.title}`);

  // Fetch local file path
  const filesRes = await client.query('SELECT file_url FROM circular_file WHERE circular_id = $1', [circularId]);
  if (filesRes.rows.length === 0) {
    console.error('No files found for circular 2838!');
    await client.end();
    return;
  }

  let metadata = {
    reference_no: "RBI/2026-27/167 DOR.MCS.REC.No.130/01-01-032/2026-27",
    title: "Reserve Bank of India (Commercial Banks - Responsible Business Conduct) Third Amendment Directions, 2026",
    priority: "High",
    description: "Directions revising customer liability limits and responsibilities for unauthorized electronic banking transactions.",
    is_penalty_applicable: true,
    penalty_description: "Penalties applicable under Banking Regulation Act, 1949 for non-compliance."
  };

  // Clear existing tasks for 2838
  await client.query('DELETE FROM compliance_task WHERE circular_id = $1', [circularId]);

  // Insert tasks without vector (the RAG fallback uses text search if vector is null, or it uses the full list)
  console.log(`Inserting ${TASKS.length} tasks into DB...`);
  for (const t of TASKS) {
    await client.query(
      'INSERT INTO compliance_task (circular_id, description, status) VALUES ($1, $2, $3)',
      [circularId, t, 'PENDING']
    );
  }

  // Update circular metadata & status
  await client.query(
    `UPDATE circular SET
      reference_no = $2,
      title = $3,
      priority = $4,
      description = $5,
      is_penalty_applicable = $6,
      penalty_description = $7,
      ai_processing_status = 'COMPLETED'
     WHERE id = $1`,
    [
      circularId,
      metadata.reference_no,
      metadata.title,
      metadata.priority,
      metadata.description,
      metadata.is_penalty_applicable,
      metadata.penalty_description
    ]
  );

  console.log('Successfully completed direct processing for Circular ID: 2838!');
  await client.end();
}

main().catch(err => {
  console.error(err);
  client.end();
});
