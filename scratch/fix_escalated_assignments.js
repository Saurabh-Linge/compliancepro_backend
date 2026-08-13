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

async function fixEscalatedAssignments() {
  const client = new Client(localConfig);
  try {
    await client.connect();
    console.log('Connected to DB.');

    // Find assignments in ESCALATED_TO_CCO state
    const res = await client.query(`
      SELECT id, status, review_remark FROM assignment WHERE UPPER(status) = 'ESCALATED_TO_CCO'
    `);
    console.log('Escalated assignments:', res.rows);

    // Update assignment_tasks for ESCALATED_TO_CCO assignments that have review_status = 'APPROVED' or NULL
    const updateRes = await client.query(`
      UPDATE assignment_task
      SET review_status = 'ESCALATED'
      WHERE assignment_id IN (
        SELECT id FROM assignment WHERE UPPER(status) = 'ESCALATED_TO_CCO'
      ) AND (review_status = 'APPROVED' OR review_status IS NULL)
    `);
    console.log(`Updated ${updateRes.rowCount} tasks in ESCALATED_TO_CCO assignments to review_status = 'ESCALATED'.`);

  } catch (err) {
    console.error('Error:', err);
  } finally {
    await client.end();
  }
}

fixEscalatedAssignments();
