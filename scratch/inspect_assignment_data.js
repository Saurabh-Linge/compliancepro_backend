const { Client } = require('pg');

async function inspectData() {
  const client = new Client({ connectionString: 'postgres://postgres:1234@localhost:5432/compliance_pro_local' });
  await client.connect();

  console.log('--- ALL ASSIGNMENTS ---');
  const assRes = await client.query(`
    SELECT a.id, a.task_set_id, a.branch_id, a.status, a.proposed_timeline, ts.name as task_set_name, ts.type as task_set_type
    FROM assignment a
    JOIN task_set ts ON ts.id = a.task_set_id
    ORDER BY a.id DESC
  `);
  console.table(assRes.rows);

  for (const a of assRes.rows) {
    console.log(`\nAssignment ID #${a.id} (Task Set #${a.task_set_id}: "${a.task_set_name}"):`);
    
    // Check task_set_mapping for this task_set
    const mappingRes = await client.query('SELECT * FROM task_set_mapping WHERE task_set_id = $1', [a.task_set_id]);
    console.log(`  - task_set_mapping count: ${mappingRes.rows.length}`);
    if (mappingRes.rows.length > 0) {
      console.log('    mapping rows:', mappingRes.rows);
    }

    // Check assignment_task for this assignment
    const assTaskRes = await client.query('SELECT * FROM assignment_task WHERE assignment_id = $1', [a.id]);
    console.log(`  - assignment_task count: ${assTaskRes.rows.length}`);
    if (assTaskRes.rows.length > 0) {
      console.log('    assignment_task rows:', assTaskRes.rows);
    }
  }

  await client.end();
}

inspectData().catch(err => console.error(err));
