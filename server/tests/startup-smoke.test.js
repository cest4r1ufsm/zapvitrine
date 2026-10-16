// Run only against a disposable PostgreSQL DB; no external integrations enabled.
const assert = require('node:assert/strict');
const path = require('node:path');
const net = require('node:net');
const { spawn } = require('node:child_process');
if (!process.env.TEST_POSTGRES_URL || process.env.TEST_POSTGRES_DISPOSABLE !== 'yes') throw new Error('Disposable TEST_POSTGRES_URL required');
const root = path.join(__dirname, '..');
async function port() {
  const server = net.createServer();
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const value = server.address().port;
  await new Promise(resolve => server.close(resolve));
  return value;
}
async function run(production) {
  const selectedPort = await port();
  const guard = `const fs=require('node:fs'),path=require('node:path');const root=${JSON.stringify(root)};function check(p){if(typeof p==='string'&&path.resolve(p).startsWith(root+path.sep))throw Error('READ_ONLY_ROOT_WRITE')}for(const name of ['writeFileSync','mkdirSync','appendFileSync']){const orig=fs[name];fs[name]=function(p,...args){check(p);return orig.call(this,p,...args)}}for(const name of ['writeFile','mkdir','appendFile']){const orig=fs.promises[name];fs.promises[name]=function(p,...args){check(p);return orig.call(this,p,...args)}}require('./src/index.js')`;
  const env = {
    PATH: process.env.PATH, SystemRoot: process.env.SystemRoot, TEMP: process.env.TEMP,
    NODE_ENV: production ? 'production' : 'test', PORT: String(selectedPort),
    DATABASE_URL: process.env.TEST_POSTGRES_URL, JWT_SECRET: 'synthetic-smoke-secret-32-characters-only',
    APP_URL: 'https://app.example.test', RUN_BACKGROUND_JOBS: 'false',
    ...(production ? { REDIS_URL: 'rediss://127.0.0.1:1', MEDIA_STORAGE: 's3', MEDIA_BUCKET: 'synthetic-unused', MEDIA_PUBLIC_URL: 'https://media.example.test' } : {}),
  };
  const child = spawn(process.execPath, ['-e', guard], { cwd: root, env, stdio: ['ignore', 'pipe', 'pipe'] });
  let output = '';
  child.stdout.on('data', chunk => { output += chunk; }); child.stderr.on('data', chunk => { output += chunk; });
  const exited = new Promise(resolve => child.once('exit', resolve));
  let ready = false;
  try {
    for (let i = 0; i < (production ? 12 : 40); i++) {
      await new Promise(resolve => setTimeout(resolve, 250));
      if (child.exitCode !== null) break;
      try { const response = await fetch(`http://127.0.0.1:${selectedPort}/api/health`, { signal: AbortSignal.timeout(400) }); ready = response.status === 200; } catch {}
      if (ready) break;
    }
    assert.ok(!output.includes('READ_ONLY_ROOT_WRITE'), 'Startup attempted writing application root');
    if (production) {
      assert.equal(ready, false, 'Production must not accept traffic without Redis');
      assert.ok(!output.includes('ERR_MODULE_NOT_FOUND') && !output.includes('Cannot find module'), output);
    } else {
      assert.equal(ready, true, output);
      const response = await fetch(`http://127.0.0.1:${selectedPort}/api/health`);
      assert.equal(response.headers.get('referrer-policy'), 'strict-origin-when-cross-origin', 'Restricted Mapbox tokens require an origin referrer');
    }
  } finally { child.kill('SIGTERM'); await Promise.race([exited, new Promise(resolve => setTimeout(resolve, 1000))]); if (child.exitCode === null) child.kill('SIGKILL'); }
}
(async () => { await run(false); await run(true); console.log('PASS startup: actual PostgreSQL health, read-only application root, production fails closed without Redis'); })().catch(error => { console.error(error); process.exitCode = 1; });
