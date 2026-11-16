import { readFileSync, readdirSync, lstatSync } from 'node:fs';
import { resolve, dirname, relative, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
const here = dirname(fileURLToPath(import.meta.url));
export const allowed = [
  'index.html',
  'case-study.html',
  '404.html',
  'styles.css',
  'app.js',
  'bootstrap.js',
  'matching.js',
  'normalize.js',
  'data.js',
  'favicon.svg',
  'robots.txt',
  'sitemap.xml',
  'vercel.json',
  'artifact.json',
  'assets/local-dashboard.png',
  'assets/local-fit.png',
  'assets/og.png',
].sort();
export function audit(directory = resolve(here, 'dist')) {
  const files = [];
  function walk(dir) {
    for (const name of readdirSync(dir)) {
      const file = resolve(dir, name);
      const stat = lstatSync(file);
      assert(!stat.isSymbolicLink(), 'No symlinks');
      if (stat.isDirectory()) walk(file);
      else files.push(relative(directory, file).split(sep).join('/'));
    }
  }
  walk(directory);
  assert.deepEqual(files.sort(), allowed, 'Only explicitly reviewed static artifacts may deploy');
  let bytes = 0;
  for (const file of files) {
    const data = readFileSync(resolve(directory, file));
    bytes += data.length;
    assert(!data.includes(Buffer.from('SQLite format 3\0')), 'No SQLite payload');
    if (file.endsWith('.js')) {
      const text = data.toString();
      assert(
        !/\b(fetch|XMLHttpRequest|WebSocket|EventSource|sendBeacon|indexedDB|localStorage|sessionStorage|serviceWorker|readText|eval)\b|\bimport\s*\([^'"`]|node:|process\.env|\b(?:https?:\/\/)?(?:localhost|127\.0\.0\.1|\[::1\])\b|\/api\//i.test(
          text,
        ),
        `Forbidden runtime capability: ${file}`,
      );
      assert(
        !/<(?:form|iframe)\b|type=['"](?:file|email|password)['"]|createElement\(['"](?:form|iframe|input)['"]\)/i.test(
          text,
        ),
        'No generated personal-input or submission controls',
      );
      const imports = [...text.matchAll(/(?:from\s*|import\s*\(\s*)['"]([^'"]+)['"]/g)].map(
        (m) => m[1],
      );
      for (const source of imports)
        assert(
          ['./data.js', './matching.js', './normalize.js', './app.js'].includes(source),
          'Only reviewed local modules',
        );
    }
    if (/\.(html|css|js|json|svg|xml|txt)$/.test(file))
      assert(
        !/sk-[a-zA-Z0-9]{16}|gh[pousr]_[a-zA-Z0-9]{20}|(?:VERCEL_TOKEN|DATABASE_PATH|OLLAMA_BASE_URL)\s*[:=]|C:\\\\Users|D:\\\\/i.test(
          data.toString(),
        ),
        `Secret/path boundary: ${file}`,
      );
    if (file.endsWith('.html'))
      assert(
        !/<(?:form|iframe)\b|<input[^>]+type=['"](?:file|email|password)['"]|on(?:click|load|error)=|<script[^>]+src=['"]https?:/i.test(
          data.toString(),
        ),
        'No uploads, forms, inline handlers or remote scripts',
      );
  }
  assert(bytes < 2 * 1024 * 1024, 'Static artifact size budget');
  const config = JSON.parse(readFileSync(resolve(directory, 'vercel.json'), 'utf8'));
  assert.deepEqual(Object.keys(config).sort(), [
    'buildCommand',
    'cleanUrls',
    'framework',
    'headers',
    'installCommand',
    'version',
  ]);
  assert.equal(config.framework, null);
  assert.equal(config.buildCommand, null);
  assert.equal(config.installCommand, null);
  const headers = config.headers[0].headers;
  const csp = headers.find((h) => h.key === 'Content-Security-Policy').value;
  for (const directive of [
    "connect-src 'none'",
    "form-action 'none'",
    "frame-ancestors 'none'",
    "script-src 'self'",
  ])
    assert(csp.includes(directive));
  const notice =
    'Interactive synthetic demo. No live AI inference or personal data processing. Real Qwen3 inference is available in the local-first application.';
  for (const page of ['index.html', 'case-study.html'])
    assert(readFileSync(resolve(directory, page), 'utf8').replace(/\s+/g, ' ').includes(notice));
  return {
    status: 'PASS',
    kind: 'static-only',
    files: files.length,
    bytes,
    fileHashes: Object.fromEntries(
      files.map((file) => [
        file,
        createHash('sha256')
          .update(readFileSync(resolve(directory, file)))
          .digest('hex'),
      ]),
    ),
  };
}
if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url)
  console.log(JSON.stringify(audit(), null, 2));
else audit();
