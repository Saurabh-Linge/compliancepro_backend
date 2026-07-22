const { Client } = require('pg');
const client = new Client({
  host: 'db.kredpool.ai',
  user: 'postgres',
  password: 'dms@kredpool450',
  database: 'compliance_pro',
  port: 5432
});

client.connect()
  .then(() => client.query("SELECT id, status, review_remark FROM assignment ORDER BY id DESC LIMIT 20"))
  .then(res => {
    console.log(res.rows);
    return client.end();
  })
  .catch(e => {
    console.error(e);
  });
