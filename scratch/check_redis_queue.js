const { Queue } = require('bullmq');
const dotenv = require('dotenv');

dotenv.config();

async function checkQueue() {
  const redisHost = process.env.REDIS_HOST || '127.0.0.1';
  const redisPort = parseInt(process.env.REDIS_PORT || '6379', 10);
  const redisPassword = process.env.REDIS_PASSWORD || undefined;
  const prefix = process.env.BULL_PREFIX || 'bull';

  const queue = new Queue('circulars', {
    connection: {
      host: redisHost,
      port: redisPort,
      password: redisPassword,
    },
    prefix,
  });

  try {
    const counts = await queue.getJobCounts('waiting', 'active', 'completed', 'failed', 'delayed', 'paused');
    console.log(`\n=== BullMQ Queue Counts (prefix: ${prefix}:circulars) ===`);
    console.table(counts);

    const activeJobs = await queue.getActive();
    console.log(`Active jobs (${activeJobs.length}):`, activeJobs.map(j => ({ id: j.id, name: j.name, data: j.data })));

    const failedJobs = await queue.getFailed(0, 5);
    if (failedJobs.length > 0) {
      console.log(`Recent Failed jobs (${failedJobs.length}):`);
      failedJobs.forEach(j => console.log(`  Job ${j.id}: reason="${j.failedReason}"`));
    }

    const waitingJobs = await queue.getWaiting(0, 5);
    console.log(`Waiting jobs (${waitingJobs.length}):`, waitingJobs.map(j => ({ id: j.id, name: j.name, circularId: j.data?.circularId })));

  } catch (err) {
    console.error('Error inspecting Redis queue:', err);
  } finally {
    await queue.close();
  }
}

checkQueue();
