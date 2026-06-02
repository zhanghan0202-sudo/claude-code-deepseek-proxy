import http from 'http';

const PROXY_URL = 'http://localhost:4001/v1/chat/completions';
const API_KEY = process.env.DEEPSEEK_API_KEY || 'sk-3ce61671b085410b9cd32ef71793e8e3';
const MODEL = 'deepseek-reasoner'; // Or 'deepseek-v4-pro' if that's what's mapped

async function makeRequest(messages, stream = true) {
  return new Promise((resolve, reject) => {
    const payload = JSON.stringify({
      model: MODEL,
      messages: messages,
      stream: stream
    });

    const parsedUrl = new URL(PROXY_URL);
    const options = {
      hostname: parsedUrl.hostname,
      port: parsedUrl.port,
      path: parsedUrl.pathname,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${API_KEY}`,
        'Content-Length': Buffer.byteLength(payload)
      }
    };

    const req = http.request(options, res => {
      let responseBody = '';
      
      if (res.statusCode !== 200) {
        let errData = '';
        res.on('data', chunk => { errData += chunk; });
        res.on('end', () => {
          reject(new Error(`HTTP ${res.statusCode}: ${errData}`));
        });
        return;
      }

      if (stream) {
        let accumulatedContent = '';
        let accumulatedReasoning = '';
        
        res.on('data', chunk => {
          const lines = chunk.toString().split('\n');
          for (const line of lines) {
            const trimmed = line.trim();
            if (trimmed.startsWith('data: ') && trimmed !== 'data: [DONE]') {
              try {
                const data = JSON.parse(trimmed.slice(6));
                const delta = data.choices?.[0]?.delta;
                if (delta) {
                  if (delta.reasoning_content) {
                    accumulatedReasoning += delta.reasoning_content;
                    process.stdout.write(`[Thinking] ${delta.reasoning_content}\r`);
                  }
                  if (delta.content) {
                    accumulatedContent += delta.content;
                    process.stdout.write(delta.content);
                  }
                }
              } catch (_) {}
            }
          }
        });

        res.on('end', () => {
          console.log('\n[Stream Finished]');
          resolve({
            role: 'assistant',
            content: accumulatedContent,
            reasoning_content: accumulatedReasoning
          });
        });
      } else {
        res.on('data', chunk => { responseBody += chunk; });
        res.on('end', () => {
          try {
            const data = JSON.parse(responseBody);
            const msg = data.choices?.[0]?.message;
            resolve(msg);
          } catch (e) {
            reject(new Error(`Failed to parse response: ${responseBody}`));
          }
        });
      }
    });

    req.on('error', reject);
    req.write(payload);
    req.end();
  });
}

async function runTest() {
  try {
    console.log('=== Turn 1: Asking standard question ===');
    const messages1 = [
      { role: 'user', content: 'What is 15 + 27? Tell me in 1 sentence.' }
    ];
    const resp1 = await makeRequest(messages1, true);
    console.log('\nTurn 1 Assistant Response:', JSON.stringify(resp1, null, 2));

    console.log('\n=== Turn 2: Follow-up question (sending Turn 1 response without reasoning_content) ===');
    // Simulate what Claude Code/LiteLLM does: sends the response back without reasoning_content
    const messages2 = [
      { role: 'user', content: 'What is 15 + 27? Tell me in 1 sentence.' },
      { role: 'assistant', content: resp1.content }, // Notice: NO reasoning_content here!
      { role: 'user', content: 'Are you sure?' }
    ];
    
    const resp2 = await makeRequest(messages2, true);
    console.log('\nTurn 2 Assistant Response:', JSON.stringify(resp2, null, 2));
    console.log('\n🎉 Test completed successfully!');
  } catch (err) {
    console.error('\n❌ Test failed:', err.message);
  }
}

runTest();
