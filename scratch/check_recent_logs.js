const { Client } = require('pg');
const dotenv = require('dotenv');

dotenv.config();

async function checkRecentLogs() {
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

    const recentLogs = await client.query(`
      SELECT cl.id, cl.circular_id, cl.status, cl.message, cl.created_at, c.title
      FROM circular_log cl
      LEFT JOIN circular c ON c.id = cl.circular_id
      ORDER BY cl.id DESC
      LIMIT 20;
    `);

    console.log('\n=== Recent 20 Circular Logs ===');
    recentLogs.rows.forEach(l => {
      console.log(`[${l.created_at?.toISOString()}] [Circular ${l.circular_id}] [${l.status}]: ${l.message?.substring(0, 120)}`);
    });

    const failedLogs = await client.query(`
      SELECT cl.id, cl.circular_id, cl.status, cl.message, cl.created_at, c.title
      FROM circular_log cl
      LEFT JOIN circular c ON c.id = cl.circular_id
      WHERE cl.status = 'FAILED'
      ORDER BY cl.id DESC
      LIMIT 5;
    `);

    if (failedLogs.rows.length > 0) {
      console.log('\n=== Recent Failed Logs ===');
      failedLogs.rows.forEach(l => {
        console.log(`[${l.created_at?.toISOString()}] [Circular ${l.circular_id}]: ${l.message}`);
      });
    }

  } catch (err) {
    console.error('[DB] Error:', err);
  } finally {
    await client.end();
  }
}

checkRecentLogs();
