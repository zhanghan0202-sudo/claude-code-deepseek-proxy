import http from 'http';

const payload = JSON.stringify({
  model: 'deepseek-v4-pro-direct',
  messages: [{ role: 'user', content: 'hello' }],
  stream: true
});

const req = http.request({
  hostname: '127.0.0.1',
  port: 4000,
  path: '/v1/chat/completions',
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Authorization': 'Bearer sk-3ce61671b085410b9cd32ef71793e8e3'
  }
}, res => {
  let body = '';
  res.on('data', chunk => { body += chunk; });
  res.on('end', () => {
    console.log('STATUS:', res.statusCode);
    console.log('BODY:', body);
  });
});

req.on('error', err => {
  console.error('ERROR:', err.message);
});

req.write(payload);
req.end();
