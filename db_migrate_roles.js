const { Client } = require('pg');

async function main() {
  const client = new Client({
    host: 'db.kredpool.ai',
    port: 5432,
    user: 'postgres',
    password: 'dms@dms450' || 'dms@kredpool450', // standard credential
    password: 'dms@kredpool450',
    database: 'compliance_pro',
    ssl: false
  });

  await client.connect();

  try {
    const res = await client.query(`
      UPDATE users 
      SET role = 'DEPARTMENT' 
      WHERE username IN (
        'human_resources_dept', 'inspection_dept', 'recovery_dept', 
        'legal_dept', 'it_dept', 'investment_dept', 
        'accounts_dept', 'advances_dept'
      )
      RETURNING id, username, role
    `);
    
    console.log('MIGRATED USERS:', res.rows);
  } catch (err) {
    console.error(err);
  } finally {
    await client.end();
  }
}

main();
