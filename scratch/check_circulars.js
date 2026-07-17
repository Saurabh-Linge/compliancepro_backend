const { Client } = require('pg');
const dotenv = require('dotenv');
dotenv.config();

const client = new Client({
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '5432', 10),
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD || '1234',
  database: process.env.DB_NAME || 'compliance_pro_local',
  ssl: process.env.DB_SSL === 'true'
});

async function main() {
  await client.connect();
  const amendRes = await client.query('SELECT * FROM circular_amendment LIMIT 10');
  console.log('Circular amendments in DB:');
  console.log(JSON.stringify(amendRes.rows, null, 2));

  const countRes = await client.query('SELECT COUNT(*) FROM circular');
  console.log(`Total circulars in DB: ${countRes.rows[0].count}`);





  const compCountRes = await client.query("SELECT COUNT(*) FROM circular WHERE ai_processing_status = 'COMPLETED'");
  console.log(`Total COMPLETED circulars: ${compCountRes.rows[0].count}`);


  await client.end();
}

main().catch(err => {
  console.error(err);
  client.end();
});
