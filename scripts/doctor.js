// Checks your setup and says exactly what to fix. Run: npm run doctor
import { config } from '../src/config.js';
import { ASSETS } from '../src/assets.js';
import { refreshPrices } from '../src/intents.js';
import { deriveEvmAddress } from '../src/signatures.js';

const ok = (m) => console.log('  ✔', m);
const bad = (m, fix) => { console.log('  ✘', m); if (fix) console.log('    fix:', fix); process.exitCode = 1; };
const warn = (m) => console.log('  !', m);

console.log(`Allowance doctor (MODE=${config.mode}, network=${config.network})\n`);

console.log('Node');
Number(process.versions.node.split('.')[0]) >= 20 ? ok(`Node ${process.versions.node}`) : bad(`Node ${process.versions.node} is too old`, 'install Node 20 or newer');

console.log('\nNEAR Intents 1-Click API');
try {
  const { count, missing } = await refreshPrices();
  ok(`reached ${config.oneClickBase}, ${count} tokens listed`);
  missing.length ? bad(`asset ids not in the live token list: ${missing.join(', ')}`, 'update src/assets.js with ids from GET /v0/tokens') : ok('every asset id in src/assets.js exists');
  for (const [k, a] of Object.entries(ASSETS)) console.log(`      ${k.padEnd(10)} $${a.price}`);
  config.oneClickJwt ? ok('JWT set (no 0.2% app fee)') : warn('no ONECLICK_JWT: a 0.2% fee applies to swaps');
} catch (e) { bad(`1-Click API unreachable: ${e.message}`, 'check your network; demo mode works offline'); }

console.log('\nNEAR AI Cloud');
if (!config.nearAiKey) warn('NEARAI_API_KEY not set: the rules brain will be used. Get a key at https://cloud.near.ai');
else try {
  const r = await fetch(`${config.nearAiBase}/models`, { headers: { authorization: `Bearer ${config.nearAiKey}` } });
  r.ok ? ok(`key accepted (${config.nearAiModel})`) : bad(`NEAR AI Cloud returned ${r.status}`, 'check the key and that the account has credits');
} catch (e) { bad(`NEAR AI Cloud unreachable: ${e.message}`); }

console.log('\nNEAR RPC and Chain Signatures');
try {
  const r = await fetch(config.rpcUrl, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'status', params: [] }) });
  ok(`RPC ${config.rpcUrl} answered ${r.status}`);
  const d = await deriveEvmAddress();
  ok(`${config.accountId} at path "${config.chainsigPath}" controls EVM address ${d.address}`);
} catch (e) { bad(`could not derive an address: ${String(e.message).slice(0, 160)}`, 'set NEAR_ACCOUNT_ID to an account that exists on NEAR_NETWORK'); }

console.log(config.mode === 'live' && !config.privateKey ? '\n  ✘ MODE=live needs NEAR_PRIVATE_KEY for the agent sub-account' : '\nDone.');
