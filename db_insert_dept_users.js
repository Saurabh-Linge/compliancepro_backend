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
    // 1. Fetch target uppercase departments
    const res = await client.query(`
      SELECT id, name 
      FROM branch_dept 
      WHERE name = UPPER(name) AND type = 'DEPARTMENT'
    `);
    
    console.log(`Found ${res.rows.length} uppercase departments.`);
    
    const passwordHash = await bcrypt.hash('123456', 10);
    
    // 2. Generate and execute INSERT statements
    for (const dept of res.rows) {
      // Map department names to friendly usernames and display names
      let prefix = dept.name.toLowerCase().replace(/ department/g, '').replace(/\s+/g, '_');
      if (prefix === 'investment') {
        prefix = 'investment_dept';
      } else {
        prefix = prefix + '_dept';
      }
      
      const username = prefix;
      const fullName = dept.name.split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(' ');
      const email = `${username}@kredpool.ai`;
      const userId = `usr_${Date.now()}_${dept.id}`;
      
      // Check if user already exists
      const checkRes = await client.query(`SELECT id FROM users WHERE username = $1`, [username]);
      if (checkRes.rows.length > 0) {
        console.log(`User '${username}' already exists. Skipping.`);
        continue;
      }
      
      const insertQuery = `
        INSERT INTO users (id, username, password_hash, full_name, email, role, branch_id, is_active)
        VALUES ($1, $2, $3, $4, $5, 'BRANCH', $6, true)
      `;
      
      await client.query(insertQuery, [userId, username, passwordHash, fullName, email, dept.id]);
      console.log(`Successfully created user: username='${username}', role='BRANCH', branch_id=${dept.id}`);
    }
  } catch (err) {
    console.error('Error running script:', err);
  } finally {
    await client.end();
  }
}

main();
