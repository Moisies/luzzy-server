const http = require('http');
const fs = require('fs');
const path = require('path');

const port = 4000;
const publicDir = path.join(__dirname, 'public');
const mime = {
  '.html': 'text/html; charset=utf-8',
  '.css':  'text/css',
  '.js':   'application/javascript',
  '.webp': 'image/webp',
  '.png':  'image/png',
  '.svg':  'image/svg+xml',
  '.ico':  'image/x-icon',
};

http.createServer((req, res) => {
  let url = req.url === '/' ? '/index.html' : req.url;
  // handle routes like /privacy, /delete-account
  if (!path.extname(url)) url = url + '.html';
  const file = path.join(publicDir, url);
  if (!fs.existsSync(file)) {
    res.writeHead(404);
    return res.end('Not found: ' + url);
  }
  const ext = path.extname(file);
  res.writeHead(200, { 'Content-Type': mime[ext] || 'text/plain' });
  fs.createReadStream(file).pipe(res);
}).listen(port, () => {
  console.log('Servidor corriendo en http://localhost:' + port);
});
