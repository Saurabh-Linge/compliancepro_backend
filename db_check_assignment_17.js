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
    const res = await client.query(`SELECT id, task_set_id, branch_id, status, review_remark FROM assignment ORDER BY id DESC LIMIT 5`);
    console.log('RECENT ASSIGNMENTS:', res.rows);

    const latest = res.rows[0];
    if (latest && latest.status === 'COMPLETED') {
      console.log(`Resetting Assignment ID ${latest.id} to REJECTED for re-compliance testing...`);
      await client.query(`UPDATE assignment SET status = 'REJECTED' WHERE id = $1`, [latest.id]);
      await client.query(`UPDATE assignment_task SET status = 'PENDING', compliance_status = 'PENDING', remarks = NULL WHERE assignment_id = $1 AND review_status = 'NEEDS_REDO'`, [latest.id]);
      console.log(`Assignment ID ${latest.id} successfully set to REJECTED.`);
    }
  } catch (err) {
    console.error(err);
  } finally {
    await client.end();
  }
}

main();
