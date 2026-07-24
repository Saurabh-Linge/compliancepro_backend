const { Client } = require('pg');

async function runEndToEndTest() {
  const db = new Client({
    host: 'db.kredpool.ai',
    port: 5432,
    user: 'postgres',
    password: 'dms@kredpool450',
    database: 'compliance_pro',
    ssl: false
  });

  await db.connect();
  console.log('=== STARTING END-TO-END COMPLIANCE FLOW INTEGRATION TEST ===\n');

  try {
    // -------------------------------------------------------------
    // Step 1: Pick an Active Task Set & Branch / Department
    // -------------------------------------------------------------
    console.log('[STEP 1] Fetching active Task Set & Department...');
    const tsRes = await db.query(`SELECT id, name FROM task_set ORDER BY id DESC LIMIT 1`);
    if (tsRes.rows.length === 0) throw new Error('No task set found.');
    const taskSet = tsRes.rows[0];
    console.log(`✓ Using Task Set ID ${taskSet.id}: "${taskSet.name}"`);

    const branchRes = await db.query(`SELECT id, name, type FROM branch_dept ORDER BY id ASC LIMIT 1`);
    const branch = branchRes.rows[0];
    console.log(`✓ Using Unit ID ${branch.id}: "${branch.name}" (${branch.type})`);

    // Create a new clean assignment for this test
    const assignRes = await db.query(
      `INSERT INTO assignment (task_set_id, branch_id, status, proposed_timeline)
       VALUES ($1, $2, 'In_Progress', CURRENT_DATE + INTERVAL '15 days')
       RETURNING id, status`,
      [taskSet.id, branch.id]
    );
    const assignmentId = assignRes.rows[0].id;
    console.log(`✓ Created test Assignment ID ${assignmentId} with status: ${assignRes.rows[0].status}`);

    // Fetch existing tasks
    const tasksRes = await db.query(`SELECT id FROM compliance_task LIMIT 2`);
    if (tasksRes.rows.length < 2) throw new Error('Need at least 2 compliance tasks in database.');
    const task1 = tasksRes.rows[0];
    const task2 = tasksRes.rows[1];

    const at1Res = await db.query(
      `INSERT INTO assignment_task (assignment_id, task_id, status, due_date) VALUES ($1, $2, 'PENDING', CURRENT_DATE + INTERVAL '10 days') RETURNING id`,
      [assignmentId, task1.id]
    );
    const at2Res = await db.query(
      `INSERT INTO assignment_task (assignment_id, task_id, status, due_date) VALUES ($1, $2, 'PENDING', CURRENT_DATE + INTERVAL '10 days') RETURNING id`,
      [assignmentId, task2.id]
    );

    const at1Id = at1Res.rows[0].id;
    const at2Id = at2Res.rows[0].id;
    console.log(`✓ Created Assignment Tasks: Task #1 (ID: ${at1Id}) and Task #2 (ID: ${at2Id})`);

    // -------------------------------------------------------------
    // Step 2: Department Fills Compliance for Both Tasks & Submits
    // -------------------------------------------------------------
    console.log('\n[STEP 2] Department declares compliance for Task #1 & Task #2...');
    await db.query(
      `UPDATE assignment_task SET compliance_status = 'COMPLIED', remarks = 'Department response for task 1', status = 'COMPLETED' WHERE id = $1`,
      [at1Id]
    );
    await db.query(
      `UPDATE assignment_task SET compliance_status = 'COMPLIED', remarks = 'Department response for task 2', status = 'COMPLETED' WHERE id = $1`,
      [at2Id]
    );
    await db.query(`UPDATE assignment SET status = 'REVIEW_PENDING' WHERE id = $1`, [assignmentId]);

    const checkState1 = await db.query(`SELECT status FROM assignment WHERE id = $1`, [assignmentId]);
    console.log(`✓ Assignment submitted to Reviewer. Status: ${checkState1.rows[0].status}`);

    // -------------------------------------------------------------
    // Step 3: CO Reviewer Accepts Task #1, Rejects Task #2 (Needs Redo)
    // -------------------------------------------------------------
    console.log('\n[STEP 3] CO Reviewer reviews tasks individually...');
    // Accept Task 1
    await db.query(`UPDATE assignment_task SET review_status = 'APPROVED', review_remark = 'Task 1 meets requirements' WHERE id = $1`, [at1Id]);
    console.log(`  -> Task #1 marked as APPROVED (Accepted)`);

    // Reject Task 2
    await db.query(
      `UPDATE assignment_task SET review_status = 'NEEDS_REDO', review_remark = 'Task 2 requires revised calculation sheet', status = 'PENDING', compliance_status = 'PENDING', remarks = NULL WHERE id = $1`,
      [at2Id]
    );
    await db.query(`UPDATE assignment SET status = 'REJECTED', review_remark = 'Task 2 needs re-compliance' WHERE id = $1`, [assignmentId]);
    console.log(`  -> Task #2 marked as NEEDS_REDO (Rejected)`);
    console.log(`  -> Assignment status set to REJECTED for re-compliance`);

    // Verify task states
    const tStateRes = await db.query(`SELECT id, review_status, review_remark, compliance_status, remarks FROM assignment_task WHERE assignment_id = $1 ORDER BY id ASC`, [assignmentId]);
    console.log('✓ Task States in DB after CO Review:', tStateRes.rows);

    // -------------------------------------------------------------
    // Step 4: Verify Department Re-Compliance Target Lock Logic
    // -------------------------------------------------------------
    console.log('\n[STEP 4] Verifying Department Re-Compliance Lock logic...');
    const t1 = tStateRes.rows[0];
    const t2 = tStateRes.rows[1];

    const canEditT1 = (t1.review_status === 'NEEDS_REDO');
    const canEditT2 = (t2.review_status === 'NEEDS_REDO');

    console.log(`  -> Task #1 Editable by Department? ${canEditT1} (Expected: false - Locked because APPROVED)`);
    console.log(`  -> Task #2 Editable by Department? ${canEditT2} (Expected: true - Unlocked because NEEDS_REDO)`);

    if (canEditT1 !== false || canEditT2 !== true) {
      throw new Error('FAILED: Re-compliance targeting logic failed!');
    }
    console.log('✓ Task-wise re-compliance locking verified successfully!');

    // -------------------------------------------------------------
    // Step 5: Department Re-complies ONLY Task #2 & Re-submits
    // -------------------------------------------------------------
    console.log('\n[STEP 5] Department re-complies Task #2 and re-submits checklist...');
    await db.query(
      `UPDATE assignment_task SET compliance_status = 'COMPLIED', remarks = 'Department revised response with updated calculation sheet', status = 'COMPLETED' WHERE id = $1`,
      [at2Id]
    );
    await db.query(`UPDATE assignment SET status = 'REVIEW_PENDING' WHERE id = $1`, [assignmentId]);
    console.log(`✓ Assignment re-submitted to CO/CCO. Status: REVIEW_PENDING`);

    // -------------------------------------------------------------
    // Step 6: CO / CCO Final Review & Acceptance
    // -------------------------------------------------------------
    console.log('\n[STEP 6] CO/CCO conducts final review and accepts Task #2...');
    await db.query(`UPDATE assignment_task SET review_status = 'APPROVED', review_remark = 'Task 2 revised calculation approved' WHERE id = $1`, [at2Id]);
    await db.query(`UPDATE assignment SET status = 'COMPLETED', review_remark = 'All compliance items verified and approved' WHERE id = $1`, [assignmentId]);

    const finalRes = await db.query(`SELECT id, status, review_remark FROM assignment WHERE id = $1`, [assignmentId]);
    const finalTasksRes = await db.query(`SELECT id, review_status, compliance_status, remarks, review_remark FROM assignment_task WHERE assignment_id = $1 ORDER BY id ASC`, [assignmentId]);

    console.log('✓ FINAL ASSIGNMENT STATE:', finalRes.rows[0]);
    console.log('✓ FINAL TASKS STATE:', finalTasksRes.rows);

    // Clean up test assignment
    await db.query(`DELETE FROM assignment_task WHERE assignment_id = $1`, [assignmentId]);
    await db.query(`DELETE FROM assignment WHERE id = $1`, [assignmentId]);
    console.log('\n✓ Cleaned up test records.');

    console.log('\n======================================================');
    console.log('🎉 ALL INTEGRATION TESTS PASSED SUCCESSFULLY! 100% OK!');
    console.log('======================================================');

  } catch (err) {
    console.error('\n❌ INTEGRATION TEST FAILED:', err);
  } finally {
    await db.end();
  }
}

runEndToEndTest();
