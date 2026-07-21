const { Client } = require('pg');

const client = new Client({
  host: 'db.kredpool.ai',
  port: 5432,
  user: 'postgres',
  password: 'dms@kredpool450',
  database: 'compliance_pro'
});

async function main() {
  await client.connect();
  const res = await client.query(`
    SELECT tgname, tgenabled, tgtype
    FROM pg_trigger
    WHERE tgrelid = 'circular'::regclass
  `);
  console.log('Triggers (pg_trigger):', JSON.stringify(res.rows, null, 2));
  await client.end();
}

main().catch(err => {
  console.error(err);
  client.end();
});
