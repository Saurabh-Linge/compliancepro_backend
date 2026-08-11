const { Client } = require('pg');
const dotenv = require('dotenv');

dotenv.config();

async function seedSampleAssignments() {
  const client = new Client({
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '5432', 10),
    user: process.env.DB_USER || 'postgres',
    password: process.env.DB_PASSWORD || 'postgres',
    database: process.env.DB_NAME || 'compliancepro',
  });

  try {
    await client.connect();
    console.log('[Seed] Connected to PostgreSQL!');

    // 1. Fetch available tasks and branches
    const tasksRes = await client.query('SELECT id, description FROM compliance_task LIMIT 20');
    const branchesRes = await client.query('SELECT id, name FROM branch_dept LIMIT 6');

    if (tasksRes.rows.length === 0) {
      console.log('[Seed] No compliance tasks found. Scrape circulars first.');
      return;
    }

    if (branchesRes.rows.length === 0) {
      console.log('[Seed] No branches/departments found.');
      return;
    }

    const tasks = tasksRes.rows;
    const branches = branchesRes.rows;

    console.log(`[Seed] Creating sample Task Sets using ${tasks.length} tasks and ${branches.length} branches...`);

    // 2. Create Task Sets
    const taskSet1 = await client.query(`
      INSERT INTO task_set (name, default_due_date, frequency, start_date, end_date)
      VALUES ('Quarterly RBI Regulatory Compliance Set', CURRENT_DATE + INTERVAL '30 days', 'QUARTERLY', CURRENT_DATE - INTERVAL '10 days', CURRENT_DATE + INTERVAL '80 days')
      RETURNING id, name;
    `);

    const taskSet2 = await client.query(`
      INSERT INTO task_set (name, default_due_date, frequency, start_date, end_date)
      VALUES ('Annual Statutory KYC & AML Review', CURRENT_DATE + INTERVAL '45 days', 'ANNUAL', CURRENT_DATE - INTERVAL '5 days', CURRENT_DATE + INTERVAL '360 days')
      RETURNING id, name;
    `);

    const ts1Id = taskSet1.rows[0].id;
    const ts2Id = taskSet2.rows[0].id;

    // 3. Map tasks to task sets
    for (let i = 0; i < Math.min(5, tasks.length); i++) {
      await client.query(`INSERT INTO task_set_mapping (task_set_id, task_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`, [ts1Id, tasks[i].id]);
    }
    for (let i = 5; i < Math.min(10, tasks.length); i++) {
      await client.query(`INSERT INTO task_set_mapping (task_set_id, task_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`, [ts2Id, tasks[i].id]);
    }

    // 4. Create sample assignments with various statuses
    const sampleAssignments = [
      {
        task_set_id: ts1Id,
        branch_id: branches[0]?.id || 1,
        status: 'REVIEW_PENDING',
        proposed_timeline: '2026-09-15',
        review_remark: 'Submitted by branch manager for Compliance Officer review'
      },
      {
        task_set_id: ts1Id,
        branch_id: branches[1]?.id || 2,
        status: 'TIMELINE_REVIEW',
        proposed_timeline: '2026-09-30',
        timeline_remark: 'Requested 15-day extension due to quarterly audit'
      },
      {
        task_set_id: ts2Id,
        branch_id: branches[2]?.id || 3,
        status: 'ESCALATED_TO_CCO',
        proposed_timeline: '2026-10-01',
        review_remark: 'High-risk compliance delay escalated for Chief Compliance Officer review'
      },
      {
        task_set_id: ts2Id,
        branch_id: branches[3]?.id || 4,
        status: 'IN_PROGRESS',
        proposed_timeline: '2026-09-20',
        review_remark: 'Compliance documentation currently in progress'
      },
      {
        task_set_id: ts1Id,
        branch_id: branches[4]?.id || 5,
        status: 'COMPLETED',
        proposed_timeline: '2026-08-30',
        review_remark: 'All compliance evidence reviewed and verified'
      }
    ];

    console.log('[Seed] Inserting assignments and assignment tasks...');
    for (const item of sampleAssignments) {
      const aRes = await client.query(`
        INSERT INTO assignment (task_set_id, branch_id, status, proposed_timeline, review_remark, timeline_remark, created_at)
        VALUES ($1, $2, $3, $4, $5, $6, CURRENT_TIMESTAMP)
        RETURNING id;
      `, [item.task_set_id, item.branch_id, item.status, item.proposed_timeline, item.review_remark, item.timeline_remark || null]);

      const assignmentId = aRes.rows[0].id;

      // Get mapped tasks for this task set
      const mTasks = await client.query('SELECT task_id FROM task_set_mapping WHERE task_set_id = $1', [item.task_set_id]);
      for (const t of mTasks.rows) {
        await client.query(`
          INSERT INTO assignment_task (assignment_id, task_id, status, review_status, due_date)
          VALUES ($1, $2, 'PENDING', $3, $4)
          ON CONFLICT DO NOTHING;
        `, [assignmentId, t.task_id, item.status === 'REVIEW_PENDING' ? 'SUBMITTED' : 'PENDING', item.proposed_timeline]);
      }
    }

    console.log('\n[Seed] Successfully seeded sample assignments for CO and CCO review queues!');

    const summary = await client.query(`
      SELECT a.id, a.status, ts.name as task_set_name, bd.name as branch_name
      FROM assignment a
      JOIN task_set ts ON ts.id = a.task_set_id
      JOIN branch_dept bd ON bd.id = a.branch_id
      ORDER BY a.id;
    `);

    console.log('\nGenerated Assignments:');
    console.table(summary.rows);

  } catch (err) {
    console.error('[Seed] Error seeding assignments:', err);
  } finally {
    await client.end();
  }
}

seedSampleAssignments();
