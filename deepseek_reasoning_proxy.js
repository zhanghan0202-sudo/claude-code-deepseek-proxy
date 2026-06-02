import http from 'http';

const PORT = 4001;
const TARGET_HOST = '127.0.0.1';
const TARGET_PORT = 4000;

// Cache to store assistant conversational state -> reasoning_content
// Key: JSON string of user message contents + assistant index, Value: reasoning_content
const reasoningCache = new Map();

function canonicalizeUserMessage(msg) {
  if (!msg || msg.role !== 'user') return null;
  let text = '';
  if (typeof msg.content === 'string') {
    text = msg.content;
  } else if (Array.isArray(msg.content)) {
    text = msg.content
      .map(block => {
        if (typeof block === 'string') return block;
        if (block && typeof block === 'object') {
          if (block.type === 'text') return block.text || '';
          if (block.text) return block.text;
        }
        return '';
      })
      .join('\n');
  } else if (msg.content) {
    text = JSON.stringify(msg.content);
  }
  // Strip system reminders to make it stable
  text = text.replace(/<system-reminder>[^]*?<\/system-reminder>/gi, '');
  return text.trim();
}

function getCacheKey(messages, assistantIndex) {
  const userContents = messages
    ? messages.filter(m => m.role === 'user').map(canonicalizeUserMessage).filter(Boolean)
    : [];
  return JSON.stringify({
    users: userContents,
    index: assistantIndex
  });
}

const server = http.createServer((req, res) => {
  // CORS Headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', '*');
  res.setHeader('Access-Control-Allow-Headers', '*');

  if (req.method === 'OPTIONS') {
    res.writeHead(200);
    res.end();
    return;
  }

  if (req.url === '/v1/chat/completions' && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', () => {
      try {
        const payload = JSON.parse(body);
        
        console.log(`[Proxy Incoming Request] Model: ${payload.model}, Messages count: ${payload.messages?.length}`);

        // 1. Inject cached reasoning_content back into history
        if (Array.isArray(payload.messages)) {
          let assistantCount = 0;
          payload.messages = payload.messages.map((msg, index) => {
            if (msg.role === 'assistant') {
              const historyPrefix = payload.messages.slice(0, index);
              const key = getCacheKey(historyPrefix, assistantCount);
              let newMsg = { ...msg };
              
              if (reasoningCache.has(key)) {
                const cachedReasoning = reasoningCache.get(key);
                console.log(`[Proxy] Injecting reasoning_content for assistant message at index ${index} (key index ${assistantCount}, length: ${cachedReasoning.length})`);
                newMsg.reasoning_content = cachedReasoning;
              } else {
                console.log(`[Proxy] Cache MISS for assistant message at index ${index} (key index ${assistantCount}): content="${typeof msg.content === 'string' ? msg.content.slice(0, 30) : JSON.stringify(msg.content)?.slice(0, 30)}"`);
              }
              assistantCount++;

              // Fix DeepSeek 400 error: "Invalid assistant message: content or tool_calls must be set"
              let hasContent = false;
              if (newMsg.content) {
                if (typeof newMsg.content === 'string') {
                  hasContent = newMsg.content.trim() !== '';
                } else if (Array.isArray(newMsg.content)) {
                  hasContent = newMsg.content.length > 0;
                } else {
                  hasContent = true; // Object or other truthy value
                }
              }
              
              const hasToolCalls = newMsg.tool_calls && Array.isArray(newMsg.tool_calls) && newMsg.tool_calls.length > 0;
              
              if (!hasContent && !hasToolCalls) {
                console.log(`[Proxy] Sanitizing empty assistant message at index ${index} to avoid DeepSeek 400 error.`);
                newMsg.content = " "; // Use a single space as a placeholder content
              }
              
              return newMsg;
            }
            return msg;
          });
        }

        // Change model name for LiteLLM routing
        payload.model = 'deepseek-v4-pro-direct';

        // 2. Prepare headers for LiteLLM: whitelist only essential headers
        const headers = {};
        const allowedHeaders = ['content-type', 'authorization', 'accept', 'user-agent'];
        for (const h of allowedHeaders) {
          if (req.headers[h]) {
            headers[h] = req.headers[h];
          }
        }

        const modifiedBody = JSON.stringify(payload);

        const options = {
          hostname: TARGET_HOST,
          port: TARGET_PORT,
          path: '/v1/chat/completions',
          method: 'POST',
          headers: headers
        };

        console.log(`[Proxy] Forwarding request to http://${options.hostname}:${options.port}${options.path}`);
        console.log(`[Proxy] Forwarding headers: ${JSON.stringify(options.headers)}`);

        // 3. Forward request to LiteLLM
        const proxyReq = http.request(options, proxyRes => {
          if (!res.destroyed && !res.writableEnded) {
            res.writeHead(proxyRes.statusCode, proxyRes.headers);
          }

          let isStream = proxyRes.headers['content-type']?.includes('event-stream');
          let responseBody = '';
          
          if (isStream) {
            let accumulatedContent = '';
            let accumulatedReasoning = '';
            let accumulatedToolCalls = null;
            let buffer = '';
            
            proxyRes.on('data', chunk => {
              if (!res.destroyed && !res.writableEnded) {
                res.write(chunk);
              }
              
              buffer += chunk.toString('utf8');
              let lineEndIndex;
              while ((lineEndIndex = buffer.indexOf('\n')) !== -1) {
                const line = buffer.slice(0, lineEndIndex).trim();
                buffer = buffer.slice(lineEndIndex + 1);
                
                if (line.startsWith('data: ') && line !== 'data: [DONE]') {
                  try {
                    const data = JSON.parse(line.slice(6));
                    const delta = data.choices?.[0]?.delta;
                    if (delta) {
                      if (delta.reasoning_content) {
                        accumulatedReasoning += delta.reasoning_content;
                      }
                      if (delta.content) {
                        accumulatedContent += delta.content;
                      }
                      if (delta.tool_calls) {
                        if (!accumulatedToolCalls) accumulatedToolCalls = [];
                        for (const tc of delta.tool_calls) {
                          const idx = tc.index;
                          if (!accumulatedToolCalls[idx]) {
                            accumulatedToolCalls[idx] = {
                              id: tc.id,
                              type: tc.type || 'function',
                              function: { name: '', arguments: '' }
                            };
                          }
                          if (tc.id) accumulatedToolCalls[idx].id = tc.id;
                          if (tc.function?.name) accumulatedToolCalls[idx].function.name += tc.function.name;
                          if (tc.function?.arguments) accumulatedToolCalls[idx].function.arguments += tc.function.arguments;
                        }
                      }
                    }
                  } catch (_) {}
                }
              }
            });

            proxyRes.on('end', () => {
              // Process remaining buffer
              if (buffer.trim()) {
                const line = buffer.trim();
                if (line.startsWith('data: ') && line !== 'data: [DONE]') {
                  try {
                    const data = JSON.parse(line.slice(6));
                    const delta = data.choices?.[0]?.delta;
                    if (delta) {
                      if (delta.reasoning_content) accumulatedReasoning += delta.reasoning_content;
                      if (delta.content) accumulatedContent += delta.content;
                      if (delta.tool_calls) {
                        if (!accumulatedToolCalls) accumulatedToolCalls = [];
                        for (const tc of delta.tool_calls) {
                          const idx = tc.index;
                          if (!accumulatedToolCalls[idx]) {
                            accumulatedToolCalls[idx] = {
                              id: tc.id,
                              type: tc.type || 'function',
                              function: { name: '', arguments: '' }
                            };
                          }
                          if (tc.id) accumulatedToolCalls[idx].id = tc.id;
                          if (tc.function?.name) accumulatedToolCalls[idx].function.name += tc.function.name;
                          if (tc.function?.arguments) accumulatedToolCalls[idx].function.arguments += tc.function.arguments;
                        }
                      }
                    }
                  } catch (_) {}
                }
              }
              if (!res.destroyed && !res.writableEnded) {
                res.end();
              }
              
              if (accumulatedReasoning) {
                const assistantCount = payload.messages.filter(m => m.role === 'assistant').length;
                const key = getCacheKey(payload.messages, assistantCount);
                console.log(`[Proxy] Caching stream reasoning (${accumulatedReasoning.length} chars) at key index ${assistantCount}`);
                reasoningCache.set(key, accumulatedReasoning);
              }
            });
          } else {
            // Non-stream handling
            proxyRes.on('data', chunk => { responseBody += chunk; });
            proxyRes.on('end', () => {
              if (!res.destroyed && !res.writableEnded) {
                res.write(responseBody);
                res.end();
              }

              try {
                const data = JSON.parse(responseBody);
                const choice = data.choices?.[0];
                const msg = choice?.message;
                if (msg && msg.reasoning_content) {
                  const assistantCount = payload.messages.filter(m => m.role === 'assistant').length;
                  const key = getCacheKey(payload.messages, assistantCount);
                  console.log(`[Proxy] Caching reasoning (${msg.reasoning_content.length} chars) for assistant message at key index ${assistantCount}.`);
                  reasoningCache.set(key, msg.reasoning_content);
                }
              } catch (_) {}
            });
          }
        });

        res.on('close', () => {
          if (!res.writableEnded) {
            proxyReq.destroy();
          }
        });

        proxyReq.on('error', err => {
          console.error('[Proxy Error]', err);
          if (!res.destroyed && !res.writableEnded) {
            res.writeHead(500);
            res.end(JSON.stringify({ error: err.message }));
          }
        });

        proxyReq.write(modifiedBody);
        proxyReq.end();

      } catch (err) {
        console.error('[Proxy Payload Error]', err);
        res.writeHead(400);
        res.end(JSON.stringify({ error: 'Invalid JSON payload' }));
      }
    });
  } else {
    // Forward other requests (like GET /v1/models)
    const headers = { ...req.headers };
    delete headers['host'];
    
    const options = {
      hostname: TARGET_HOST,
      port: TARGET_PORT,
      path: req.url,
      method: req.method,
      headers: headers
    };

    const proxyReq = http.request(options, proxyRes => {
      if (!res.destroyed && !res.writableEnded) {
        res.writeHead(proxyRes.statusCode, proxyRes.headers);
      }
      proxyRes.pipe(res);
    });

    req.pipe(proxyReq);
  }
});

server.listen(PORT, () => {
  console.log(`[Proxy] DeepSeek reasoning patch proxy listening on port ${PORT}`);
});
