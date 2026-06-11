/* Command Center server — static files + Project-of-the-Day APIs.
   Zero dependencies. Run: node server.js  (port 3131, localhost only) */

const http = require('http');
const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');

const PORT = 3131;
const ROOT = __dirname;
const PROJECTS_DIR = path.join(ROOT, 'projects');

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css':  'text/css; charset=utf-8',
  '.js':   'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg':  'image/svg+xml',
  '.png':  'image/png',
  '.jpg':  'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif':  'image/gif',
  '.ico':  'image/x-icon',
  '.woff': 'font/woff',
  '.woff2':'font/woff2',
  '.txt':  'text/plain; charset=utf-8',
  '.md':   'text/plain; charset=utf-8',
};

/* Commands run only inside projects/<slug>; slug is sanitized to kill path traversal */
function safeSlug(s) {
  return String(s || '').toLowerCase().replace(/[^a-z0-9-_]/g, '-').replace(/^-+|-+$/g, '').slice(0, 60);
}

function json(res, code, obj) {
  res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(obj));
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', c => { data += c; if (data.length > 1e6) { reject(new Error('too big')); req.destroy(); } });
    req.on('end', () => { try { resolve(JSON.parse(data || '{}')); } catch (e) { reject(e); } });
  });
}

/* Reject requests from non-local origins (browser pages on other sites can't hit the exec API) */
function originOk(req) {
  const o = req.headers.origin;
  if (!o) return true; // same-origin fetches and curl have no Origin header issues locally
  return /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(o);
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://127.0.0.1:${PORT}`);

  /* ── APIs ─────────────────────────────────────────────── */
  if (url.pathname.startsWith('/api/')) {
    if (!originOk(req)) return json(res, 403, { error: 'forbidden origin' });

    // POST /api/pod/create  { slug, title, readme, starter }
    if (url.pathname === '/api/pod/create' && req.method === 'POST') {
      try {
        const b = await readBody(req);
        const slug = safeSlug(b.slug);
        if (!slug) return json(res, 400, { error: 'bad slug' });
        const dir = path.join(PROJECTS_DIR, slug);
        fs.mkdirSync(dir, { recursive: true });
        const readmePath = path.join(dir, 'README.md');
        if (!fs.existsSync(readmePath)) fs.writeFileSync(readmePath, b.readme || `# ${b.title || slug}\n`);
        const mainPath = path.join(dir, 'main.py');
        if (!fs.existsSync(mainPath)) fs.writeFileSync(mainPath, b.starter || `"""${b.title || slug}"""\n\n\ndef main():\n    pass\n\n\nif __name__ == "__main__":\n    main()\n`);
        return json(res, 200, { ok: true, path: dir });
      } catch (e) { return json(res, 500, { error: String(e.message || e) }); }
    }

    // GET /api/pod/status?slug=
    if (url.pathname === '/api/pod/status' && req.method === 'GET') {
      const slug = safeSlug(url.searchParams.get('slug'));
      const dir = path.join(PROJECTS_DIR, slug);
      const exists = !!slug && fs.existsSync(dir);
      const git = exists && fs.existsSync(path.join(dir, '.git'));
      return json(res, 200, { exists, git, path: exists ? dir : null });
    }

    // POST /api/term  { slug, cmd }  — run a command inside projects/<slug>
    if (url.pathname === '/api/term' && req.method === 'POST') {
      try {
        const b = await readBody(req);
        const slug = safeSlug(b.slug);
        const dir = path.join(PROJECTS_DIR, slug);
        if (!slug || !fs.existsSync(dir)) return json(res, 400, { error: 'project folder not found — create the project first' });
        const cmd = String(b.cmd || '').trim();
        if (!cmd) return json(res, 400, { error: 'empty command' });
        exec(cmd, { cwd: dir, timeout: 300000, windowsHide: true, maxBuffer: 4 * 1024 * 1024, shell: true }, (err, stdout, stderr) => {
          json(res, 200, {
            code: err ? (err.code === undefined ? 1 : err.code) : 0,
            out: String(stdout || ''),
            err: String(stderr || (err && !stdout ? err.message : '')),
            timedOut: !!(err && err.killed),
          });
        });
        return;
      } catch (e) { return json(res, 500, { error: String(e.message || e) }); }
    }

    // GET /api/yt/search?q=  — scrape YouTube search results (no API key needed)
    if (url.pathname === '/api/yt/search' && req.method === 'GET') {
      const q = String(url.searchParams.get('q') || '').slice(0, 100);
      if (!q) return json(res, 400, { error: 'missing q' });
      try {
        const page = await (await fetch('https://www.youtube.com/results?search_query=' + encodeURIComponent(q), {
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36',
            'Accept-Language': 'en-US,en;q=0.9',
            'Cookie': 'CONSENT=YES+1',
          },
        })).text();
        const m = page.match(/var ytInitialData = (\{.+?\});<\/script>/s);
        if (!m) return json(res, 200, { videos: [] });
        const data = JSON.parse(m[1]);
        const videos = [];
        (function walk(node) {
          if (!node || typeof node !== 'object' || videos.length >= 12) return;
          if (node.videoRenderer && node.videoRenderer.videoId) {
            const v = node.videoRenderer;
            videos.push({
              id: v.videoId,
              title: (v.title?.runs?.[0]?.text) || '',
              channel: (v.ownerText?.runs?.[0]?.text) || '',
              duration: v.lengthText?.simpleText || '',
              views: v.shortViewCountText?.simpleText || '',
            });
            return;
          }
          for (const k in node) walk(node[k]);
        })(data);
        return json(res, 200, { videos });
      } catch (e) { return json(res, 200, { videos: [], error: String(e.message || e) }); }
    }

    return json(res, 404, { error: 'unknown api' });
  }

  /* ── Static files ─────────────────────────────────────── */
  let p = decodeURIComponent(url.pathname);
  if (p === '/' || p === '') p = '/index.html';
  const filePath = path.normalize(path.join(ROOT, p));
  if (!filePath.startsWith(ROOT)) { res.writeHead(403); return res.end('forbidden'); }

  fs.readFile(filePath, (err, data) => {
    if (err) {
      // Directory? try index.html inside it
      if (err.code === 'EISDIR') {
        return fs.readFile(path.join(filePath, 'index.html'), (e2, d2) => {
          if (e2) { res.writeHead(404); return res.end('not found'); }
          res.writeHead(200, { 'Content-Type': MIME['.html'] });
          res.end(d2);
        });
      }
      res.writeHead(404); return res.end('not found');
    }
    const ext = path.extname(filePath).toLowerCase();
    const headers = { 'Content-Type': MIME[ext] || 'application/octet-stream' };
    // App files change often — make browsers always revalidate so updates show up
    if (ext === '.html' || ext === '.js' || ext === '.css') headers['Cache-Control'] = 'no-cache';
    res.writeHead(200, headers);
    res.end(data);
  });
});

server.listen(PORT, '127.0.0.1', () => {
  console.log(`Command Center running at http://127.0.0.1:${PORT}`);
});
