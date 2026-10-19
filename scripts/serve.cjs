'use strict';
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const types = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8' };
const files = new Set(['index.html', 'styles.css', 'app.js']);
http.createServer((req, res) => {
  const name = req.url === '/' ? 'index.html' : req.url.slice(1);
  if (!files.has(name)) { res.writeHead(404); res.end('Not found'); return; }
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Content-Type', types[path.extname(name)]);
  fs.createReadStream(path.join('dist', name)).on('error', () => {
    res.statusCode = 500; res.end('Build the app first with npm run build.');
  }).pipe(res);
}).listen(4173, '127.0.0.1', () => console.log('Local preview: http://127.0.0.1:4173'));
