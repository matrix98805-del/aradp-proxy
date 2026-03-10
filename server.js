const https = require('https');
const http = require('http');

const PORT = process.env.PORT || 3000;
const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY;
const OPENAI_KEY = process.env.OPENAI_API_KEY;
const GEMINI_KEY = process.env.GEMINI_API_KEY;

const TIMEOUT_MS = 55000; // 55s — under Render's 60s request limit

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, anthropic-version, x-api-key',
  'Content-Type': 'application/json'
};

function proxy(req, res, hostname, path, headers) {
  let body = '';
  req.on('data', chunk => body += chunk);
  req.on('end', () => {
    const options = {
      hostname,
      path,
      method: 'POST',
      headers: { ...headers, 'Content-Length': Buffer.byteLength(body) },
      timeout: TIMEOUT_MS
    };

    let responded = false;

    const r = https.request(options, upstream => {
      responded = true;
      // Collect full response so we can log non-2xx errors
      let responseBody = '';
      upstream.on('data', chunk => responseBody += chunk);
      upstream.on('end', () => {
        if (upstream.statusCode !== 200) {
          console.error(`[${hostname}] HTTP ${upstream.statusCode}: ${responseBody.slice(0, 500)}`);
        }
        res.writeHead(upstream.statusCode, CORS_HEADERS);
        res.end(responseBody);
      });
    });

    // Timeout: upstream took too long
    r.on('timeout', () => {
      console.error(`[${hostname}] Request timed out after ${TIMEOUT_MS}ms`);
      r.destroy();
      if (!responded) {
        responded = true;
        res.writeHead(504, CORS_HEADERS);
        res.end(JSON.stringify({ error: `Upstream timeout after ${TIMEOUT_MS}ms`, hostname }));
      }
    });

    // Network-level error
    r.on('error', e => {
      console.error(`[${hostname}] Request error: ${e.message}`);
      if (!responded) {
        responded = true;
        res.writeHead(502, CORS_HEADERS);
        res.end(JSON.stringify({ error: e.message, hostname }));
      }
    });

    r.write(body);
    r.end();
  });
}

http.createServer((req, res) => {
  if (req.method === 'OPTIONS') { res.writeHead(200, CORS_HEADERS); res.end(); return; }
  if (req.method === 'GET') { res.writeHead(200, CORS_HEADERS); res.end(JSON.stringify({ status: 'ARADP proxy running', version: '2.0' })); return; }
  if (req.method !== 'POST') { res.writeHead(404, CORS_HEADERS); res.end(); return; }

  console.log(`[${new Date().toISOString()}] ${req.method} ${req.url}`);

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
    res.writeHead(404, CORS_HEADERS);
    res.end(JSON.stringify({ error: 'Unknown endpoint' }));
  }
}).listen(PORT, () => console.log(`ARADP proxy v2.0 running on port ${PORT}`));
