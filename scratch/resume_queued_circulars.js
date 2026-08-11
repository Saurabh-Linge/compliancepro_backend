const { Queue } = require('bullmq');
const { Client } = require('pg');
const dotenv = require('dotenv');

dotenv.config();

async function resumeQueuedJobs() {
  const pgClient = new Client({
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '5432', 10),
    user: process.env.DB_USER || 'postgres',
    password: process.env.DB_PASSWORD || 'postgres',
    database: process.env.DB_NAME || 'compliancepro',
  });

  const redisHost = process.env.REDIS_HOST || '127.0.0.1';
  const redisPort = parseInt(process.env.REDIS_PORT || '6379', 10);
  const redisPassword = process.env.REDIS_PASSWORD || undefined;
  const prefix = process.env.BULL_PREFIX || 'bull';

  const circularsQueue = new Queue('circulars', {
    connection: {
      host: redisHost,
      port: redisPort,
      password: redisPassword,
    },
    prefix,
  });

  try {
    await pgClient.connect();
    console.log('[Resume] Connected to PostgreSQL!');

    // Find all circulars with status QUEUED that have files
    const res = await pgClient.query(`
      SELECT c.id, c.title, json_agg(cf.file_url) as file_urls
      FROM circular c
      JOIN circular_file cf ON cf.circular_id = c.id
      WHERE c.ai_processing_status = 'QUEUED'
      GROUP BY c.id, c.title
      ORDER BY c.id ASC;
    `);

    console.log(`[Resume] Found ${res.rows.length} QUEUED circulars with files to enqueue.`);

    if (res.rows.length === 0) {
      console.log('[Resume] No QUEUED circulars need processing.');
      return;
    }

    let enqueued = 0;
    for (const row of res.rows) {
      const fileUrls = row.file_urls.filter(Boolean);
      if (fileUrls.length > 0) {
        await circularsQueue.add('processCircularFiles', {
          circularId: row.id,
          fileUrls,
        }, {
          removeOnComplete: true,
          removeOnFail: false,
        });
        enqueued++;
      }
    }

    console.log(`\n SUCCESS: Enqueued ${enqueued} circular jobs into BullMQ (${prefix}:circulars)!`);
    console.log('Your running backend (CircularsProcessor) will now pick them up and process them continuously with OpenAI.\n');

  } catch (err) {
    console.error('[Resume] Error resuming queued circulars:', err);
  } finally {
    await circularsQueue.close();
    await pgClient.end();
  }
}

resumeQueuedJobs();
