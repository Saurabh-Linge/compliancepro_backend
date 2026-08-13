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

const departments = [
  { deptName: 'Accounts Dept', username: 'accounts_dept', fullName: 'Accounts Department' },
  { deptName: 'Advances Dept', username: 'advances_dept', fullName: 'Advances Department' },
  { deptName: 'General Administration Dept', username: 'gen_admin_dept', fullName: 'General Administration Department' },
  { deptName: 'HR Dept', username: 'hr_dept', fullName: 'HR Department' },
  { deptName: 'Inspection Dept', username: 'inspection_dept', fullName: 'Inspection Department' },
  { deptName: 'Investment Dept', username: 'investment_dept', fullName: 'Investment Department' },
  { deptName: 'IT Dept', username: 'it_dept', fullName: 'IT Department' },
  { deptName: 'Legal Dept', username: 'legal_dept', fullName: 'Legal Department' },
  { deptName: 'Marketing Dept', username: 'marketing_dept', fullName: 'Marketing Department' },
  { deptName: 'MIS Dept', username: 'mis_dept', fullName: 'MIS Department' },
  { deptName: 'Recovery Dept', username: 'recovery_dept', fullName: 'Recovery Department' },
  { deptName: 'Secretarial Dept', username: 'secretarial_dept', fullName: 'Secretarial Department' }
];

async function seed() {
  const client = new Client(localConfig);
  await client.connect();
  console.log('=== Adding 12 Department Users with password: password123 ===\n');

  try {
    await client.query('BEGIN');

    // 1. Get or create department in branch_dept
    for (const d of departments) {
      let deptId;
      const bdCheck = await client.query(`SELECT id FROM branch_dept WHERE LOWER(name) = LOWER($1)`, [d.deptName]);
      if (bdCheck.rows.length > 0) {
        deptId = bdCheck.rows[0].id;
        // ensure co_user_id is 2
        await client.query(`UPDATE branch_dept SET co_user_id = '2' WHERE id = $1 AND co_user_id IS NULL`, [deptId]);
      } else {
        const insBD = await client.query(
          `INSERT INTO branch_dept (name, type, co_user_id) VALUES ($1, 'DEPARTMENT', '2') RETURNING id`,
          [d.deptName]
        );
        deptId = insBD.rows[0].id;
        console.log(`Created new department in branch_dept: "${d.deptName}" (ID: ${deptId})`);
      }
      d.deptId = deptId;

      // 2. Get or create user in users table
      const userCheck = await client.query(`SELECT id FROM users WHERE username = $1`, [d.username]);
      if (userCheck.rows.length > 0) {
        const userId = userCheck.rows[0].id;
        await client.query(
          `UPDATE users SET password_hash = 'password123', full_name = $1, role = 'DEPARTMENT', branch_id = $2, is_active = true WHERE id = $3`,
          [d.fullName, deptId, userId]
        );
        d.userId = userId;
        console.log(`Updated existing user: "${d.username}" (ID: ${userId}) -> Dept ID: ${deptId}`);
      } else {
        const insUser = await client.query(
          `INSERT INTO users (username, password_hash, full_name, role, branch_id, is_active, created_at, updated_at)
           VALUES ($1, 'password123', $2, 'DEPARTMENT', $3, true, NOW(), NOW())
           RETURNING id`,
          [d.username, d.fullName, deptId]
        );
        const userId = insUser.rows[0].id;
        d.userId = userId;
        console.log(`Created new user: "${d.username}" (ID: ${userId}) -> Dept ID: ${deptId}`);
      }
    }

    await client.query('COMMIT');
    console.log('\n✅ All 12 Department Users Seeded Successfully!\n');

    // Display summary table
    const result = await client.query(`
      SELECT 
        u.id,
        u.username,
        u.full_name,
        u.role,
        u.branch_id as dept_id,
        b.name as dept_name,
        u.password_hash as password
      FROM users u
      LEFT JOIN branch_dept b ON u.branch_id = b.id
      ORDER BY u.id::integer ASC
    `);

    console.log('Complete Users List in Database:');
    console.table(result.rows);

  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Error seeding department users:', err);
  } finally {
    await client.end();
  }
}

seed();
