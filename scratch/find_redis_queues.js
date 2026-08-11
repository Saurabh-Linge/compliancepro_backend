const { Redis } = require('ioredis');
const dotenv = require('dotenv');

dotenv.config();

async function findKeys() {
  const redis = new Redis({
    host: process.env.REDIS_HOST || '127.0.0.1',
    port: parseInt(process.env.REDIS_PORT || '6379', 10),
    password: process.env.REDIS_PASSWORD || undefined,
  });

  try {
    const keys = await redis.keys('*');
    console.log(`Total Redis keys: ${keys.length}`);
    console.log('Sample keys (up to 30):', keys.slice(0, 30));
  } catch (err) {
    console.error('Redis error:', err);
  } finally {
    redis.disconnect();
  }
}

findKeys();
