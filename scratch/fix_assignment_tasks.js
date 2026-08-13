const { Client } = require('pg');

async function fixAssignmentTasks() {
  const client = new Client({ connectionString: 'postgres://postgres:1234@localhost:5432/compliance_pro_local' });
  await client.connect();

  console.log('Populating assignment_task for assignment #1...');
  await client.query(`
    INSERT INTO assignment_task (assignment_id, task_id, status, due_date)
    SELECT a.id, tsm.task_id, 'PENDING', COALESCE(tsm.due_date, a.proposed_timeline)
    FROM assignment a
    JOIN task_set_mapping tsm ON tsm.task_set_id = a.task_set_id
    WHERE a.id = 1
    ON CONFLICT DO NOTHING
  `);

  const countRes = await client.query('SELECT count(*) as count FROM assignment_task WHERE assignment_id = 1');
  console.log(`Assignment #1 now has ${countRes.rows[0].count} assignment_tasks!`);

  await client.end();
}

fixAssignmentTasks().catch(err => console.error(err));
