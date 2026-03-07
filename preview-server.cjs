/**
 * preview-server.cjs — Dev server for Luzzy landing + dashboard
 * Handles static files AND /api/auth/* endpoints so the full auth flow
 * works locally without needing Bun or PostgreSQL.
 * Users are stored in users-dev.json (gitignored).
 */
const http   = require('http');
const fs     = require('fs');
const path   = require('path');
const crypto = require('crypto');

const PORT      = 4000;
const publicDir = path.join(__dirname, 'public');
const usersFile = path.join(__dirname, 'users-dev.json');
const JWT_SECRET = 'luzzy-dev-secret-key';

const mime = {
  '.html': 'text/html; charset=utf-8',
  '.css':  'text/css',
  '.js':   'application/javascript',
  '.webp': 'image/webp',
  '.png':  'image/png',
  '.svg':  'image/svg+xml',
  '.ico':  'image/x-icon',
};

/* ── User store (flat JSON file) ──────────────────────── */
function loadUsers() {
  try { return JSON.parse(fs.readFileSync(usersFile, 'utf8')); } catch { return {}; }
}
function saveUsers(u) { fs.writeFileSync(usersFile, JSON.stringify(u, null, 2)); }

/* ── Password hashing (crypto.scrypt) ─────────────────── */
function hashPassword(pw) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(pw, salt, 64).toString('hex');
  return salt + ':' + hash;
}
function verifyPassword(pw, stored) {
  const [salt, hash] = stored.split(':');
  const attempt = crypto.scryptSync(pw, salt, 64).toString('hex');
  return attempt === hash;
}

/* ── Minimal JWT (HS256-like) ─────────────────────────── */
function makeToken(email) {
  const header  = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
  const payload = Buffer.from(JSON.stringify({ phone: email, iat: Date.now() })).toString('base64url');
  const sig     = crypto.createHmac('sha256', JWT_SECRET).update(header + '.' + payload).digest('base64url');
  return header + '.' + payload + '.' + sig;
}

/* ── JSON body helper ─────────────────────────────────── */
function readBody(req) {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', c => data += c);
    req.on('end',  () => { try { resolve(JSON.parse(data)); } catch { reject(new Error('Invalid JSON')); } });
    req.on('error', reject);
  });
}

/* ── JSON response helpers ────────────────────────────── */
function jsonOk(res, body) {
  res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
  res.end(JSON.stringify(body));
}
function jsonErr(res, status, msg) {
  res.writeHead(status, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
  res.end(JSON.stringify({ error: msg }));
}

/* ── Server ───────────────────────────────────────────── */
http.createServer(async (req, res) => {
  const { method, url } = req;

  /* CORS preflight */
  if (method === 'OPTIONS') {
    res.writeHead(204, { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'POST,GET,OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type' });
    return res.end();
  }

  /* ── API: Register ────────────────────────────────── */
  if (method === 'POST' && url === '/api/auth/web-register') {
    try {
      const { email, password, displayName } = await readBody(req);
      if (!email || !password) return jsonErr(res, 400, 'Email and password are required.');
      if (password.length < 6) return jsonErr(res, 400, 'Password must be at least 6 characters.');
      const users = loadUsers();
      if (users[email]) return jsonErr(res, 409, 'An account with this email already exists.');
      users[email] = { email, displayName: displayName || null, passwordHash: hashPassword(password) };
      saveUsers(users);
      const token = makeToken(email);
      return jsonOk(res, { token, user: { email, displayName: displayName || null } });
    } catch (e) {
      return jsonErr(res, 500, e.message);
    }
  }

  /* ── API: Login ───────────────────────────────────── */
  if (method === 'POST' && url === '/api/auth/web-login') {
    try {
      const { email, password } = await readBody(req);
      if (!email || !password) return jsonErr(res, 400, 'Email and password are required.');
      const users = loadUsers();
      const user  = users[email];
      if (!user || !verifyPassword(password, user.passwordHash)) {
        return jsonErr(res, 401, 'Invalid email or password.');
      }
      const token = makeToken(email);
      return jsonOk(res, { token, user: { email: user.email, displayName: user.displayName } });
    } catch (e) {
      return jsonErr(res, 500, e.message);
    }
  }

  /* ── Static files ─────────────────────────────────── */
  let filePath = url === '/' ? '/index.html' : url;
  if (!path.extname(filePath)) filePath = filePath + '.html';
  const fullPath = path.join(publicDir, filePath);

  if (!fs.existsSync(fullPath)) {
    res.writeHead(404, { 'Content-Type': 'text/plain' });
    return res.end('404 Not Found');
  }
  const ext = path.extname(fullPath);
  res.writeHead(200, { 'Content-Type': mime[ext] || 'text/plain' });
  fs.createReadStream(fullPath).pipe(res);

}).listen(PORT, () => {
  console.log('Servidor corriendo en http://localhost:' + PORT);
});
