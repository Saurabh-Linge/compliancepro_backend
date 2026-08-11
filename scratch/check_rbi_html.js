const axios = require('axios');
const cheerio = require('cheerio');

async function check() {
  const res = await axios.get('https://www.rbi.org.in/Scripts/BS_CircularIndexDisplay.aspx');
  const $ = cheerio.load(res.data);
  $('table.tablebg tr').slice(0, 10).each((i, el) => {
    console.log('--- ROW ' + i + ' ---');
    $(el).find('td, th').each((j, td) => {
      const a = $(td).find('a');
      console.log(`  COL ${j}: text="${$(td).text().replace(/\s+/g, ' ').trim()}", links=${a.length}, href="${a.attr('href') || ''}"`);
    });
  });
}

check();
