const { Client } = require('pg');
const axios = require('axios');
const dotenv = require('dotenv');

dotenv.config();

async function testSingle() {
  const client = new Client({
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '5432', 10),
    user: process.env.DB_USER || 'postgres',
    password: process.env.DB_PASSWORD || 'postgres',
    database: process.env.DB_NAME || 'compliancepro',
  });

  try {
    await client.connect();
    
    // Pick the oldest QUEUED circular
    const res = await client.query(`
      SELECT c.id, c.title, cf.file_url 
      FROM circular c
      JOIN circular_file cf ON cf.circular_id = c.id
      WHERE c.ai_processing_status = 'QUEUED'
      ORDER BY c.id ASC
      LIMIT 1;
    `);

    if (res.rows.length === 0) {
      console.log('No QUEUED circulars found!');
      return;
    }

    const circ = res.rows[0];
    console.log(`Testing processing for Circular ID: ${circ.id} ("${circ.title}")`);
    console.log(`File URL: ${circ.file_url}`);

    // Call OCR / PDF service or MinIO to check accessibility
    const minioHost = process.env.MINIO_ENDPOINT || 'localhost';
    const minioPort = process.env.MINIO_PORT || 10101;
    console.log(`MinIO host: ${minioHost}:${minioPort}`);

    // Trigger reprocess via API
    try {
      console.log(`Calling POST http://localhost:3580/circulars/${circ.id}/reprocess ...`);
      const apiRes = await axios.post(`http://localhost:3580/circulars/${circ.id}/reprocess`);
      console.log('Reprocess API response:', apiRes.data);
    } catch (apiErr) {
      console.error('API Error:', apiErr.message);
    }

  } catch (err) {
    console.error('Error:', err);
  } finally {
    await client.end();
  }
}

testSingle();
