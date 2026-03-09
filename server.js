const https = require('https');
const http = require('http');

const PORT = process.env.PORT || 3000;
const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY;
const OPENAI_KEY = process.env.OPENAI_API_KEY;
const GEMINI_KEY = process.env.GEMINI_API_KEY;

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Content-Type': 'application/json'
};

function proxy(req, res, hostname, path, headers) {
  let body = '';
  req.on('data', chunk => body += chunk);
  req.on('end', () => {
    const options = { hostname, path, method: 'POST', headers: { ...headers, 'Content-Length': Buffer.byteLength(body) } };
    const r = https.request(options, upstream => {
      res.writeHead(upstream.statusCode, CORS_HEADERS);
      upstream.pipe(res);
    });
    r.on('error', e => { res.writeHead(500, CORS_HEADERS); res.end(JSON.stringify({ error: e.message })); });
    r.write(body);
    r.end();
  });
}

http.createServer((req, res) => {
  if (req.method === 'OPTIONS') { res.writeHead(200, CORS_HEADERS); res.end(); return; }
  if (req.method !== 'POST') { res.writeHead(200, CORS_HEADERS); res.end(JSON.stringify({ status: 'ARADP proxy running' })); return; }

  if (req.url === '/anthropic') {
    proxy(req, res, 'api.anthropic.com', '/v1/messages', {
      'Content-Type': 'application/json',
      'x-api-key': ANTHROPIC_KEY,
      'anthropic-version': '2023-06-01'
    });
  } else if (req.url === '/openai') {
    proxy(req, res, 'api.openai.com', '/v1/chat/completions', {
      'Content-Type': 'application/json',
      'Authorization': 'Bearer ' + OPENAI_KEY
    });
  } else if (req.url === '/gemini') {
    proxy(req, res, 'generativelanguage.googleapis.com',
      '/v1beta/models/gemini-1.5-flash:generateContent?key=' + GEMINI_KEY, {
      'Content-Type': 'application/json'
    });
  } else {
    res.writeHead(200, CORS_HEADERS);
    res.end(JSON.stringify({ status: 'ARADP proxy running' }));
  }
}).listen(PORT, () => console.log('ARADP proxy running on port ' + PORT));
