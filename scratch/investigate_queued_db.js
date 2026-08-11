const { Client } = require('pg');
const dotenv = require('dotenv');

dotenv.config();

async function investigate() {
  const client = new Client({
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '5432', 10),
    user: process.env.DB_USER || 'postgres',
    password: process.env.DB_PASSWORD || 'postgres',
    database: process.env.DB_NAME || 'compliancepro',
  });

  try {
    await client.connect();

    const queuedSample = await client.query(`
      SELECT c.id, c.title, c.published_date, c.ai_processing_status, count(cf.id) as file_count, json_agg(cf.file_url) as file_urls
      FROM circular c
      LEFT JOIN circular_file cf ON cf.circular_id = c.id
      WHERE c.ai_processing_status = 'QUEUED'
      GROUP BY c.id, c.title, c.published_date, c.ai_processing_status
      ORDER BY c.id ASC
      LIMIT 5;
    `);

    console.log('Sample QUEUED circulars:');
    console.log(JSON.stringify(queuedSample.rows, null, 2));

    // Check if there are any logs for these circulars
    const sampleIds = queuedSample.rows.map(r => r.id);
    const logs = await client.query(`
      SELECT circular_id, status, message, created_at 
      FROM circular_log 
      WHERE circular_id = ANY($1::int[])
      ORDER BY id ASC;
    `, [sampleIds]);

    console.log('\nLogs for sample QUEUED circulars:');
    console.log(logs.rows);

  } catch (err) {
    console.error('Error:', err);
  } finally {
    await client.end();
  }
}

investigate();
