import http from 'http';

const LITELLM_URL = 'http://localhost:4000/v1/messages';
const MODEL = 'claude-3-5-sonnet-20241022';

async function makeAnthropicRequest(messages) {
  return new Promise((resolve, reject) => {
    const payload = JSON.stringify({
      model: MODEL,
      messages: messages,
      max_tokens: 1024
    });

    const parsedUrl = new URL(LITELLM_URL);
    const options = {
      hostname: parsedUrl.hostname,
      port: parsedUrl.port,
      path: parsedUrl.pathname,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': 'anything',
        'anthropic-version': '2023-06-01',
        'Content-Length': Buffer.byteLength(payload)
      }
    };

    const req = http.request(options, res => {
      let responseBody = '';
      
      res.on('data', chunk => { responseBody += chunk; });
      res.on('end', () => {
        if (res.statusCode !== 200) {
          reject(new Error(`HTTP ${res.statusCode}: ${responseBody}`));
          return;
        }
        try {
          const data = JSON.parse(responseBody);
          resolve(data);
        } catch (e) {
          reject(new Error(`Failed to parse response: ${responseBody}`));
        }
      });
    });

    req.on('error', reject);
    req.write(payload);
    req.end();
  });
}

async function runTest() {
  try {
    console.log('=== Turn 1: User asks question ===');
    const messages1 = [
      { role: 'user', content: 'What is 15 + 27? Tell me in 1 sentence.' }
    ];
    const resp1 = await makeAnthropicRequest(messages1);
    console.log('Turn 1 Response:', JSON.stringify(resp1, null, 2));

    const assistantContent = resp1.content.find(c => c.type === 'text')?.text || resp1.content[0].text;
    console.log('\nAssistant response text:', assistantContent);

    console.log('\n=== Turn 2: User asks follow-up (simulating multi-turn) ===');
    const messages2 = [
      { role: 'user', content: 'What is 15 + 27? Tell me in 1 sentence.' },
      { role: 'assistant', content: assistantContent },
      { role: 'user', content: 'Are you sure?' }
    ];
    const resp2 = await makeAnthropicRequest(messages2);
    console.log('Turn 2 Response:', JSON.stringify(resp2, null, 2));
    console.log('\n🎉 Multi-turn via LiteLLM completed successfully!');
  } catch (err) {
    console.error('\n❌ Test failed:', err.message);
  }
}

runTest();
