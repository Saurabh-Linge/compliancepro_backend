const { Client } = require('pg');
const bcrypt = require('bcrypt');

async function main() {
  const client = new Client({
    host: 'db.kredpool.ai',
    port: 5432,
    user: 'postgres',
    password: 'dms@kredpool450',
    database: 'compliance_pro',
    ssl: false
  });

  await client.connect();

  try {
    const targetUsernames = [
      'human_resources_dept',
      'inspection_dept',
      'recovery_dept',
      'legal_dept',
      'it_dept',
      'investment_dept',
      'accounts_dept',
      'advances_dept'
    ];

    // 1. Delete the existing department users with old IDs
    console.log('Deleting existing department users with old IDs...');
    await client.query(`DELETE FROM users WHERE username = ANY($1)`, [targetUsernames]);

    // 2. Fetch the target uppercase departments
    const res = await client.query(`
      SELECT id, name 
      FROM branch_dept 
      WHERE name = UPPER(name) AND type = 'DEPARTMENT'
      ORDER BY id ASC
    `);
    
    const passwordHash = await bcrypt.hash('123456', 10);
    
    // Starting ID index after the existing 'cco', 'admin', 'co', 'branch' users
    let currentId = 5;

    // 3. Insert them sequentially
    for (const dept of res.rows) {
      let prefix = dept.name.toLowerCase().replace(/ department/g, '').replace(/\s+/g, '_');
      if (prefix === 'investment') {
        prefix = 'investment_dept';
      } else {
        prefix = prefix + '_dept';
      }
      
      const username = prefix;
      const fullName = dept.name.split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(' ');
      const email = `${username}@kredpool.ai`;
      const userId = String(currentId++);
      
      const insertQuery = `
        INSERT INTO users (id, username, password_hash, full_name, email, role, branch_id, is_active)
        VALUES ($1, $2, $3, $4, $5, 'BRANCH', $6, true)
      `;
      
      await client.query(insertQuery, [userId, username, passwordHash, fullName, email, dept.id]);
      console.log(`Successfully created user: ID='${userId}', username='${username}', branch_id=${dept.id}`);
    }
  } catch (err) {
    console.error('Error running script:', err);
  } finally {
    await client.end();
  }
}

main();
