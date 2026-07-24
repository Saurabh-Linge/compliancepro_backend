const { Client } = require('pg');

function calculatePeriodAndDueDate(frequency, startDateStr, defaultDueDateStr, refDate = new Date()) {
  const y = refDate.getFullYear();
  const m = refDate.getMonth();
  const d = refDate.getDate();

  let periodStart, periodEnd, dueDate;
  const defaultOffsetDay = defaultDueDateStr ? new Date(defaultDueDateStr).getDate() : 15;
  const freq = frequency ? String(frequency).trim() : '6';

  switch (freq) {
    case '1': // FORTNIGHT
      if (d <= 15) {
        periodStart = new Date(y, m, 1);
        periodEnd = new Date(y, m, 15);
        dueDate = new Date(y, m, 15);
      } else {
        periodStart = new Date(y, m, 16);
        periodEnd = new Date(y, m + 1, 0);
        dueDate = new Date(y, m + 1, 0);
      }
      break;

    case '2': // MONTHLY
      periodStart = new Date(y, m, 1);
      periodEnd = new Date(y, m + 1, 0);
      dueDate = new Date(y, m, defaultOffsetDay);
      if (dueDate < periodStart) {
        dueDate = new Date(y, m, 15);
      }
      break;

    case '3': // QUARTERLY
      const quarter = Math.floor(m / 3);
      periodStart = new Date(y, quarter * 3, 1);
      periodEnd = new Date(y, (quarter + 1) * 3, 0);
      dueDate = new Date(y, quarter * 3, defaultOffsetDay || 30);
      break;

    case '4': // SEMI-ANNUAL
      const half = Math.floor(m / 6);
      periodStart = new Date(y, half * 6, 1);
      periodEnd = new Date(y, (half + 1) * 6, 0);
      dueDate = new Date(y, half * 6 + 1, defaultOffsetDay || 15);
      break;

    case '5': // YEARLY
      periodStart = new Date(y, 0, 1);
      periodEnd = new Date(y, 11, 31);
      dueDate = new Date(y, 2, defaultOffsetDay || 31);
      break;

    case '6': // ONE-TIME
    default:
      periodStart = startDateStr ? new Date(startDateStr) : new Date(y, m, d);
      periodEnd = new Date(y + 1, m, d);
      dueDate = defaultDueDateStr ? new Date(defaultDueDateStr) : new Date(y, m, d + 30);
      break;
  }

  return {
    periodStart: periodStart.toISOString().split('T')[0],
    periodEnd: periodEnd.toISOString().split('T')[0],
    dueDate: dueDate.toISOString().split('T')[0],
  };
}

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
    const taskSetsRes = await client.query(`SELECT id, name, default_due_date, start_date, end_date, frequency FROM task_set`);
    let totalGenerated = 0;

    for (const ts of taskSetsRes.rows) {
      const branchesRes = await client.query(`SELECT branch_id FROM task_set_branch WHERE task_set_id = $1`, [ts.id]);
      const branchIds = branchesRes.rows.map(r => r.branch_id);

      if (branchIds.length === 0) continue;

      const { dueDate } = calculatePeriodAndDueDate(ts.frequency, ts.start_date, ts.default_due_date);

      for (const branchId of branchIds) {
        const checkRes = await client.query(
          `SELECT id FROM assignment WHERE task_set_id = $1 AND branch_id = $2 AND proposed_timeline = $3::DATE`,
          [ts.id, branchId, dueDate]
        );

        if (checkRes.rows.length > 0) continue;

        const insertRes = await client.query(
          `INSERT INTO assignment (task_set_id, branch_id, proposed_timeline, status)
           VALUES ($1, $2, $3, 'Pending_Timeline')
           RETURNING id`,
          [ts.id, branchId, dueDate]
        );

        const assignmentId = insertRes.rows[0].id;

        await client.query(
          `INSERT INTO assignment_task (assignment_id, task_id, status, due_date, proposed_due_date)
           SELECT $1, tsm.task_id, 'PENDING', COALESCE(tsm.due_date, $3::DATE), NULL
           FROM task_set_mapping tsm
           WHERE tsm.task_set_id = $2`,
          [assignmentId, ts.id, dueDate]
        );

        console.log(`Generated Assignment ID ${assignmentId} for Task Set "${ts.name}" (ID ${ts.id}) -> Branch/Dept ID ${branchId}`);
        totalGenerated++;
      }
    }

    console.log(`Finished generating assignments. Total created: ${totalGenerated}`);
  } catch (err) {
    console.error(err);
  } finally {
    await client.end();
  }
}

main();
