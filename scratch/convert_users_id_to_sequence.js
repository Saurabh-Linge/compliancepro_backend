const { Client } = require('pg');
const dotenv = require('dotenv');

dotenv.config();

const localConfig = {
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '5432', 10),
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD || '1234',
  database: process.env.DB_NAME || 'compliance_pro_local',
};

async function migrate() {
  const client = new Client(localConfig);
  await client.connect();
  console.log('=== Converting `users` table ID to 1, 2, 3, 4... sequence ===\n');

  try {
    await client.query('BEGIN');

    // 1. Fetch current users in chronological order
    const usersRes = await client.query(`SELECT id, username, role, full_name, created_at FROM users ORDER BY created_at ASC`);
    const users = usersRes.rows;
    console.log('Current users before conversion:');
    console.table(users);

    // Build ID mapping
    const idMap = new Map();
    users.forEach((u, index) => {
      const newId = index + 1;
      idMap.set(u.id, newId);
    });

    console.log('\nID Mapping:');
    for (const [oldId, newId] of idMap.entries()) {
      console.log(`  "${oldId}" -> ${newId}`);
    }

    // 2. Drop existing foreign key constraints
    console.log('\nDropping foreign key constraints...');
    await client.query(`ALTER TABLE branch_dept DROP CONSTRAINT IF EXISTS branch_dept_co_user_id_fkey`);
    await client.query(`ALTER TABLE notification DROP CONSTRAINT IF EXISTS notification_user_id_fkey`);

    // 3. Update referencing tables
    console.log('Updating referencing tables...');
    for (const [oldId, newId] of idMap.entries()) {
      const bdRes = await client.query(`UPDATE branch_dept SET co_user_id = $1 WHERE co_user_id = $2`, [String(newId), oldId]);
      if (bdRes.rowCount > 0) {
        console.log(`  Updated ${bdRes.rowCount} row(s) in branch_dept for oldId "${oldId}" -> "${newId}"`);
      }
      const notifRes = await client.query(`UPDATE notification SET user_id = $1 WHERE user_id = $2`, [String(newId), oldId]);
      if (notifRes.rowCount > 0) {
        console.log(`  Updated ${notifRes.rowCount} row(s) in notification for oldId "${oldId}" -> "${newId}"`);
      }
    }

    // 4. Update users table with temporary IDs first (to avoid unique constraint collision)
    console.log('Updating users table with new IDs...');
    for (const [oldId, newId] of idMap.entries()) {
      await client.query(`UPDATE users SET id = $1 WHERE id = $2`, [`temp_${newId}`, oldId]);
    }
    for (const [_, newId] of idMap.entries()) {
      await client.query(`UPDATE users SET id = $1 WHERE id = $2`, [String(newId), `temp_${newId}`]);
    }

    // 5. Create sequence and set default for users.id
    const maxId = users.length;
    const startSeq = maxId + 1;
    console.log(`Creating users_id_seq starting at ${startSeq}...`);
    await client.query(`DROP SEQUENCE IF EXISTS users_id_seq CASCADE`);
    await client.query(`CREATE SEQUENCE users_id_seq START WITH ${startSeq}`);

    // Check if we can alter column type to integer or set default
    console.log('Setting default nextval for users.id...');
    await client.query(`ALTER TABLE users ALTER COLUMN id SET DEFAULT nextval('users_id_seq')::text`);

    // 6. Re-create foreign key constraints
    console.log('Re-creating foreign key constraints...');
    await client.query(`
      ALTER TABLE branch_dept
      ADD CONSTRAINT branch_dept_co_user_id_fkey
      FOREIGN KEY (co_user_id) REFERENCES users(id) ON DELETE SET NULL
    `);

    await client.query(`
      ALTER TABLE notification
      ADD CONSTRAINT notification_user_id_fkey
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    `);

    await client.query('COMMIT');
    console.log('\n✅ Transaction COMMITTED successfully!');

    // 7. Verify result
    const verifyUsers = await client.query(`SELECT id, username, role, full_name FROM users ORDER BY id::integer ASC`);
    console.log('\nUsers table after conversion:');
    console.table(verifyUsers.rows);

    const verifyBD = await client.query(`SELECT id, name, co_user_id FROM branch_dept WHERE co_user_id IS NOT NULL`);
    console.log('\nbranch_dept table after conversion:');
    console.table(verifyBD.rows);

  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Migration failed, rolled back:', err);
  } finally {
    await client.end();
  }
}

migrate();
