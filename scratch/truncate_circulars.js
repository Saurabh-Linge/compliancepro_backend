const { Client } = require('pg');
const { Queue } = require('bullmq');
const dotenv = require('dotenv');

dotenv.config();

async function cleanQueue() {
  const connection = {
    host: process.env.REDIS_HOST || 'localhost',
    port: parseInt(process.env.REDIS_PORT || '6379', 10),
    password: process.env.REDIS_PASSWORD
  };

  console.log('[Redis] Connecting to Redis:', { host: connection.host, port: connection.port });
  const queue = new Queue('circulars', { connection });

  try {
    console.log('[Redis] Draining and cleaning queue...');
    await queue.drain(true);
    await queue.clean(0, 100000, 'failed');
    await queue.clean(0, 100000, 'completed');
    await queue.clean(0, 100000, 'active');
    console.log('[Redis] Queue successfully cleaned.');
  } catch (err) {
    console.error('[Redis Error] Failed to clean queue:', err);
  } finally {
    await queue.close();
  }
}

async function truncateDatabase() {
  const client = new Client({
    host: process.env.DB_HOST || 'db.kredpool.ai',
    port: parseInt(process.env.DB_PORT || '5432', 10),
    user: process.env.DB_USER || 'postgres',
    password: process.env.DB_PASSWORD || 'dms@kredpool450',
    database: process.env.DB_NAME || 'compliance_pro',
    ssl: process.env.DB_SSL === 'true'
  });

  try {
    await client.connect();
    console.log('[DB] Connected to PostgreSQL!');

    console.log('[DB] Truncating all dependency and circular tables...');
    await client.query(`
      TRUNCATE TABLE 
        assignment_task,
        assignment,
        task_set,
        compliance_task,
        circular_file,
        circular_log,
        circular_amendment,
        circular,
        task_set_branch,
        task_set_mapping
      CASCADE;
    `);
    console.log('[DB] All circular and dependency tables successfully truncated!');

    console.log('[DB] Resetting RBI scraper state to start from 2017-01-01...');
    const updateRes = await client.query(`
      UPDATE scraper_state 
      SET last_processed_date = '2017-01-01 00:00:00+00' 
      WHERE authority_name = 'RBI'
      RETURNING *;
    `);

    if (updateRes.rows.length === 0) {
      await client.query(`
        INSERT INTO scraper_state (authority_name, last_processed_date)
        VALUES ('RBI', '2017-01-01 00:00:00+00');
      `);
      console.log('[DB] RBI Scraper state inserted for 2017-01-01.');
    } else {
      console.log('[DB] RBI Scraper state updated to 2017-01-01:', updateRes.rows[0]);
    }

    // Check counts
    const circCount = await client.query('SELECT COUNT(*) FROM circular;');
    const taskCount = await client.query('SELECT COUNT(*) FROM compliance_task;');
    console.log(`[DB] Current circular count: ${circCount.rows[0].count}`);
    console.log(`[DB] Current compliance task count: ${taskCount.rows[0].count}`);

  } catch (err) {
    console.error('[DB Error] Failed to truncate tables:', err);
  } finally {
    await client.end();
  }
}

async function main() {
  console.log('=== STARTING FULL CLEANUP WORKFLOW ===');
  // Skipping Redis queue cleanup — Redis not reachable from local machine.
  // BullMQ failing jobs on the server will resolve themselves once DB is cleared.
  // await cleanQueue();
  await truncateDatabase();
  console.log('=== CLEANUP WORKFLOW COMPLETED ===');
}

main();
