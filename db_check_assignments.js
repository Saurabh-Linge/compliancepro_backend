const { Client } = require('pg');

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
    const taskSets = await client.query(`SELECT id, name, default_due_date, frequency FROM task_set`);
    console.log('TASK SETS:', taskSets.rows);

    const taskSetBranches = await client.query(`
      SELECT tsb.task_set_id, ts.name as task_set_name, bd.id as branch_id, bd.name as unit_name, bd.type
      FROM task_set_branch tsb
      JOIN task_set ts ON ts.id = tsb.task_set_id
      JOIN branch_dept bd ON bd.id = tsb.branch_id
    `);
    console.log('MAPPED UNITS (task_set_branch):', taskSetBranches.rows);

    const assignments = await client.query(`
      SELECT a.id, a.task_set_id, a.branch_id, a.status, a.proposed_timeline, bd.name as branch_name
      FROM assignment a
      JOIN branch_dept bd ON bd.id = a.branch_id
    `);
    console.log('EXISTING ASSIGNMENTS (assignment table):', assignments.rows);

  } catch (err) {
    console.error(err);
  } finally {
    await client.end();
  }
}

main();
