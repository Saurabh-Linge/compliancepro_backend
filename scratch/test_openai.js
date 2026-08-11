const dotenv = require('dotenv');
dotenv.config();

async function testOpenAI() {
  const apiKey = process.env.OPENAI_API_KEY;
  const model = process.env.AI_MODEL || 'gpt-4o-mini';

  console.log(`[Test] Testing OpenAI with model: "${model}"`);
  console.log(`[Test] API Key preview: ${apiKey ? apiKey.substring(0, 15) + '...' : 'NONE'}`);

  try {
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: model,
        messages: [
          { role: 'system', content: 'You are a compliance assistant.' },
          { role: 'user', content: 'Say "OpenAI gpt-4o-mini is successfully connected!" in JSON format: {"status": "ok", "message": "..."}' }
        ],
        response_format: { type: 'json_object' },
        temperature: 0.2
      })
    });

    console.log(`[Test] Status Code: ${response.status} ${response.statusText}`);
    const data = await response.json();
    console.log('[Test] Response:', JSON.stringify(data, null, 2));

    if (response.ok) {
      console.log('\n SUCCESS: OpenAI API is connected and responding properly!');
    } else {
      console.error('\n FAILED: OpenAI returned an error.');
    }
  } catch (err) {
    console.error('\n ERROR:', err);
  }
}

testOpenAI();
