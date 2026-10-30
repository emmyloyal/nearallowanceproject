// Live-mode NEAR access. Reads use plain JSON-RPC (no dependency). Writes use near-api-js (optional dependency).
import { config } from './config.js';

async function rpc(method, params) {
  const res = await fetch(config.rpcUrl, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: 'allowance', method, params }) });
  const j = await res.json();
  if (j.error) throw new Error(JSON.stringify(j.error));
  return j.result;
}

export const tokenContract = (assetId) => assetId.replace(/^nep141:/, '');

export async function ftBalance(assetId, account = config.accountId) {
  const args = Buffer.from(JSON.stringify({ account_id: account })).toString('base64');
  const r = await rpc('query', { request_type: 'call_function', finality: 'final', account_id: tokenContract(assetId), method_name: 'ft_balance_of', args_base64: args });
  return JSON.parse(Buffer.from(r.result).toString()); // atomic units as string
}

async function account() {
  let sdk;
  try { sdk = await import('near-api-js'); } catch { throw new Error('near-api-js is not installed. Run `npm install` to enable MODE=live.'); }
  if (!config.privateKey) throw new Error('NEAR_PRIVATE_KEY is not set.');
  return new sdk.Account(config.accountId, config.rpcUrl, sdk.KeyPairSigner.fromSecretKey(config.privateKey));
}

/** NEP-141 transfer from the agent sub-account to a 1-Click deposit address. Returns the tx hash. */
export async function ftTransfer({ assetId, receiver, amountAtomic }) {
  const acc = await account();
  const out = await acc.callFunction({
    contractId: tokenContract(assetId), methodName: 'ft_transfer',
    args: { receiver_id: receiver, amount: String(amountAtomic) },
    deposit: 1n, gas: 30_000_000_000_000n,
  });
  return out?.transaction?.hash ?? out?.transaction_outcome?.id ?? null;
}

/** Call the Chain Signatures MPC contract's `sign`. Needs 1 yoctoNEAR, so a function-call key cannot do it. */
export async function chainSign(signRequestArgs) {
  const { SIGNER_CONTRACT } = await import('./signatures.js');
  const acc = await account();
  return acc.callFunction({ contractId: SIGNER_CONTRACT[config.network], methodName: 'sign', args: signRequestArgs, deposit: 1n, gas: 300_000_000_000_000n });
}
