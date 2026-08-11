const dotenv = require('dotenv');
dotenv.config();

async function checkRateLimits() {
  const apiKey = process.env.OPENAI_API_KEY;
  const model = process.env.AI_MODEL || 'gpt-4o-mini';

  console.log(`Checking rate limits for model: ${model}...`);
  try {
    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: model,
        messages: [{ role: 'user', content: 'hi' }],
        max_tokens: 5
      })
    });

    console.log('\n--- HTTP Response Headers (Rate Limits) ---');
    const rateLimitHeaders = {};
    for (const [key, value] of res.headers.entries()) {
      if (key.toLowerCase().startsWith('x-ratelimit')) {
        rateLimitHeaders[key] = value;
      }
    }
    console.log(JSON.stringify(rateLimitHeaders, null, 2));

  } catch (err) {
    console.error('Error:', err);
  }
}

checkRateLimits();
