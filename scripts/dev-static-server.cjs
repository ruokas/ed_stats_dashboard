const http = require('http');
const fs = require('fs');
const path = require('path');

const root = process.cwd();
const port = Number.parseInt(process.env.PORT || '5500', 10);
const host = process.env.HOST || '127.0.0.1';

const mime = {
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.ico': 'image/x-icon',
  '.jpeg': 'image/jpeg',
  '.jpg': 'image/jpeg',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.map': 'application/json; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.webp': 'image/webp',
};

function resolveFilePath(requestUrl) {
  const urlPath = decodeURIComponent(String(requestUrl || '/').split('?')[0] || '/');
  const relativePath = urlPath === '/' ? 'index.html' : urlPath.replace(/^\/+/, '');
  const filePath = path.resolve(root, relativePath);
  return filePath.startsWith(root) ? filePath : '';
}

http
  .createServer((req, res) => {
    try {
      let filePath = resolveFilePath(req.url);
      if (!filePath) {
        res.writeHead(403);
        res.end('Forbidden');
        return;
      }
      let stats = fs.existsSync(filePath) ? fs.statSync(filePath) : null;
      if (stats?.isDirectory()) {
        filePath = path.join(filePath, 'index.html');
        stats = fs.existsSync(filePath) ? fs.statSync(filePath) : null;
      }
      if (!stats?.isFile()) {
        res.writeHead(404);
        res.end('Not found');
        return;
      }
      res.writeHead(200, {
        'Cache-Control': 'no-cache',
        'Content-Type': mime[path.extname(filePath).toLowerCase()] || 'application/octet-stream',
      });
      fs.createReadStream(filePath).pipe(res);
    } catch (error) {
      res.writeHead(500);
      res.end(String(error?.message || error));
    }
  })
  .listen(port, host, () => {
    console.log(`Static server listening on http://${host}:${port}`);
  });
