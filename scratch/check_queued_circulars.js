const { Client } = require('pg');
const dotenv = require('dotenv');

dotenv.config();

async function checkQueued() {
  const client = new Client({
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '5432', 10),
    user: process.env.DB_USER || 'postgres',
    password: process.env.DB_PASSWORD || 'postgres',
    database: process.env.DB_NAME || 'compliancepro',
  });

  try {
    await client.connect();
    console.log('[DB] Connected to PostgreSQL!');

    const statusCounts = await client.query(`
      SELECT ai_processing_status, count(*) 
      FROM circular 
      GROUP BY ai_processing_status;
    `);
    console.log('\nCircular status breakdown:');
    console.table(statusCounts.rows);

    const queuedWithFiles = await client.query(`
      SELECT c.id, c.title, c.pdf_url, count(cf.id) as file_count
      FROM circular c
      LEFT JOIN circular_file cf ON cf.circular_id = c.id
      WHERE c.ai_processing_status = 'QUEUED'
      GROUP BY c.id, c.title, c.pdf_url
      LIMIT 10;
    `);

    console.log('\nSample QUEUED circulars:');
    console.table(queuedWithFiles.rows);

    const totalQueuedWithFiles = await client.query(`
      SELECT count(DISTINCT c.id) 
      FROM circular c
      JOIN circular_file cf ON cf.circular_id = c.id
      WHERE c.ai_processing_status = 'QUEUED';
    `);
    console.log(`\nTotal QUEUED circulars having files in circular_file: ${totalQueuedWithFiles.rows[0].count}`);

  } catch (err) {
    console.error('[DB] Error querying queued circulars:', err);
  } finally {
    await client.end();
  }
}

checkQueued();
