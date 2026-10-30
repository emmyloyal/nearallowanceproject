import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { config, isDemo } from './config.js';
import { createAgent } from './agent.js';
import { deriveEvmAddress, SIGNER_CONTRACT } from './signatures.js';

const here = dirname(fileURLToPath(import.meta.url));
const agent = createAgent();
let busy = false;

const send = (res, code, body, type = 'application/json') => {
  res.writeHead(code, { 'content-type': type, 'cache-control': 'no-store' });
  res.end(type === 'application/json' ? JSON.stringify(body) : body);
};
const readBody = (req) => new Promise((resolve, reject) => {
  let d = ''; req.on('data', c => { d += c; if (d.length > 20_000) { reject(new Error('Body too large')); req.destroy(); } });
  req.on('end', () => { try { resolve(d ? JSON.parse(d) : {}); } catch { reject(new Error('Invalid JSON')); } });
});

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, 'http://localhost');
    if (req.method === 'GET' && url.pathname === '/') return send(res, 200, await readFile(join(here, '../public/index.html')), 'text/html; charset=utf-8');
    if (req.method === 'GET' && url.pathname === '/api/state') { await agent.poll(); return send(res, 200, agent.snapshot()); }
    if (req.method === 'GET' && url.pathname === '/api/addresses') {
      try { return send(res, 200, { ok: true, ...(await deriveEvmAddress()), account: config.accountId, path: config.chainsigPath, contract: SIGNER_CONTRACT[config.network] }); }
      catch (e) { return send(res, 200, { ok: false, account: config.accountId, path: config.chainsigPath, contract: SIGNER_CONTRACT[config.network], error: isDemo() ? 'Demo mode is offline. Set NEAR_ACCOUNT_ID and run with network access to derive real addresses.' : String(e.message).slice(0, 200) }); }
    }
    if (req.method === 'POST') {
      const body = await readBody(req);
      if (url.pathname === '/api/tick') {
        if (busy) return send(res, 409, { error: 'A cycle is already running.' });
        busy = true; try { return send(res, 200, await agent.tick()); } finally { busy = false; }
      }
      if (url.pathname === '/api/approve') return send(res, 200, await agent.approve(String(body.id), !!body.approve));
      if (url.pathname === '/api/policy') return send(res, 200, await agent.setPolicy(String(body.text ?? '').slice(0, 500)));
      if (url.pathname === '/api/bill') { agent.addBill(body); return send(res, 200, agent.snapshot()); }
      if (url.pathname === '/api/reset') { agent.reset(); return send(res, 200, agent.snapshot()); }
    }
    send(res, 404, { error: 'Not found' });
  } catch (e) {
    send(res, 400, { error: String(e.message ?? e) });
  }
});

server.listen(config.port, async () => {
  console.log(`Allowance is running at http://localhost:${config.port}  (MODE=${config.mode})`);
  if (!isDemo()) {
    try { const r = await agent.refreshLive(); console.log('Live data ready:', JSON.stringify(r)); }
    catch (e) { console.warn('Could not refresh live data:', e.message); }
  }
});
