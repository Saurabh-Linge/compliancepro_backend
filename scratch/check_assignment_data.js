const { Client } = require('pg');
const dotenv = require('dotenv');

dotenv.config();

async function checkData() {
  const client = new Client({
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '5432', 10),
    user: process.env.DB_USER || 'postgres',
    password: process.env.DB_PASSWORD || 'postgres',
    database: process.env.DB_NAME || 'compliancepro',
  });

  try {
    await client.connect();
    console.log('[DB] Connected to PostgreSQL!');

    const circularCount = await client.query('SELECT count(*) FROM circular');
    const taskCount = await client.query('SELECT count(*) FROM compliance_task');
    const taskSetCount = await client.query('SELECT count(*) FROM task_set');
    const mappingCount = await client.query('SELECT count(*) FROM task_set_mapping');
    const branchCount = await client.query('SELECT count(*) FROM branch_dept');
    const assignmentCount = await client.query('SELECT count(*) FROM assignment');
    const assignmentTaskCount = await client.query('SELECT count(*) FROM assignment_task');

    console.log('=== Database Row Counts ===');
    console.log('circular:', circularCount.rows[0].count);
    console.log('compliance_task:', taskCount.rows[0].count);
    console.log('task_set:', taskSetCount.rows[0].count);
    console.log('task_set_mapping:', mappingCount.rows[0].count);
    console.log('branch_dept:', branchCount.rows[0].count);
    console.log('assignment:', assignmentCount.rows[0].count);
    console.log('assignment_task:', assignmentTaskCount.rows[0].count);

    if (parseInt(assignmentCount.rows[0].count, 10) > 0) {
      const sample = await client.query(`
        SELECT a.id, a.status, a.task_set_id, ts.name as task_set_name, bd.name as branch_name
        FROM assignment a
        LEFT JOIN task_set ts ON ts.id = a.task_set_id
        LEFT JOIN branch_dept bd ON bd.id = a.branch_id
        LIMIT 5
      `);
      console.log('\nSample assignments:');
      console.log(sample.rows);
    }
  } catch (err) {
    console.error('[DB] Error querying data:', err);
  } finally {
    await client.end();
  }
}

checkData();
