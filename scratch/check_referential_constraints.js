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

  console.log('--- REFERENTIAL CONSTRAINTS (FOREIGN KEYS) ---');
  const res = await client.query(`
    SELECT 
        tc.table_name, 
        tc.constraint_name, 
        rc.update_rule, 
        rc.delete_rule
    FROM 
        information_schema.table_constraints AS tc 
        JOIN information_schema.referential_constraints AS rc 
          ON tc.constraint_name = rc.constraint_name
    WHERE tc.constraint_type = 'FOREIGN KEY' AND tc.table_schema = 'public'
    ORDER BY tc.table_name, tc.constraint_name
  `);
  console.log(JSON.stringify(res.rows, null, 2));

  await client.end();
}

main().catch(err => {
  console.error(err);
  client.end();
});
