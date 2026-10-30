// Chain Signatures: one NEAR account controls addresses on other chains through the MPC signer contract.
// Derivation here is read-only (a view call over JSON-RPC), so it needs no keys and no dependencies.
import { keccak256, toHex } from './keccak.js';
import { config } from './config.js';

export const SIGNER_CONTRACT = { testnet: 'v1.signer-prod.testnet', mainnet: 'v1.signer' };

const B58 = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
export function base58decode(s) {
  let n = 0n;
  for (const ch of s) {
    const v = B58.indexOf(ch);
    if (v < 0) throw new Error('bad base58');
    n = n * 58n + BigInt(v);
  }
  const bytes = [];
  while (n > 0n) { bytes.unshift(Number(n & 0xffn)); n >>= 8n; }
  for (const ch of s) { if (ch === '1') bytes.unshift(0); else break; }
  return Uint8Array.from(bytes);
}

const P = 2n ** 256n - 2n ** 32n - 977n;
const modpow = (b, e, m) => { let r = 1n; b %= m; while (e > 0n) { if (e & 1n) r = r * b % m; b = b * b % m; e >>= 1n; } return r; };
const big = (u8) => BigInt('0x' + (toHex(u8) || '0'));

/** Accepts 64-byte raw, 65-byte 0x04-prefixed, or 33-byte compressed; returns 64-byte x||y. */
export function normalizePublicKey(bytes) {
  if (bytes.length === 64) return bytes;
  if (bytes.length === 65 && bytes[0] === 4) return bytes.slice(1);
  if (bytes.length === 33 && (bytes[0] === 2 || bytes[0] === 3)) {
    const x = big(bytes.slice(1));
    let y = modpow((modpow(x, 3n, P) + 7n) % P, (P + 1n) / 4n, P);
    if ((y & 1n) !== BigInt(bytes[0] & 1)) y = P - y;
    const hex = (v) => v.toString(16).padStart(64, '0');
    return Uint8Array.from((hex(x) + hex(y)).match(/.{2}/g), h => parseInt(h, 16));
  }
  throw new Error(`unsupported public key length ${bytes.length}`);
}

export function evmAddressFromKey(nearKeyString) {
  const raw = base58decode(nearKeyString.replace(/^secp256k1:/, ''));
  return evmAddressFromBytes(raw);
}

export function evmAddressFromBytes(raw) {
  const xy = normalizePublicKey(raw);
  const addr = toHex(keccak256(xy)).slice(-40);
  // EIP-55 checksum
  const hash = toHex(keccak256(addr));
  return '0x' + [...addr].map((c, i) => (parseInt(hash[i], 16) >= 8 ? c.toUpperCase() : c)).join('');
}

async function rpc(method, params) {
  const res = await fetch(config.rpcUrl, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 'allowance', method, params }),
  });
  const j = await res.json();
  if (j.error) throw new Error(JSON.stringify(j.error));
  return j.result;
}

export async function derivedPublicKey({ account = config.accountId, path = config.chainsigPath, network = config.network } = {}) {
  const contractId = SIGNER_CONTRACT[network];
  const args = Buffer.from(JSON.stringify({ path, predecessor: account, domain_id: 0 })).toString('base64');
  const r = await rpc('query', { request_type: 'call_function', finality: 'final', account_id: contractId, method_name: 'derived_public_key', args_base64: args });
  return JSON.parse(Buffer.from(r.result).toString());
}

export async function deriveEvmAddress(opts) {
  const key = await derivedPublicKey(opts);
  return { publicKey: key, address: evmAddressFromKey(key), contract: SIGNER_CONTRACT[opts?.network ?? config.network] };
}

/** The exact arguments for the MPC contract's `sign` method (1 yoctoNEAR deposit, up to 300 Tgas). */
export function buildSignRequest(payloadHex32, path = config.chainsigPath) {
  if (!/^[0-9a-f]{64}$/i.test(payloadHex32)) throw new Error('payload must be 32 bytes of hex');
  return { request: { payload_v2: { Ecdsa: payloadHex32.toLowerCase() }, path, domain_id: 0 } };
}
