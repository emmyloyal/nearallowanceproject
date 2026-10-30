// NEAR Intents 1-Click Swap API client, plus an offline stand-in used in demo mode.
import { config, isDemo } from './config.js';
import { ASSETS, toAtomic, fromAtomic } from './assets.js';

const headers = () => ({ 'content-type': 'application/json', ...(config.oneClickJwt ? { authorization: `Bearer ${config.oneClickJwt}` } : {}) });

async function call(path, init) {
  const res = await fetch(config.oneClickBase + path, init);
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`1Click ${path} -> ${res.status} ${body.message ?? ''}`.trim());
  return body;
}

/** Refresh prices from the live token list. Returns the ids it could not find. */
export async function refreshPrices() {
  const tokens = await call('/v0/tokens', { headers: headers() });
  const missing = [];
  for (const [key, a] of Object.entries(ASSETS)) {
    const t = tokens.find(x => x.assetId === a.id);
    if (!t) { missing.push(key); continue; }
    if (Number.isFinite(t.price)) a.price = t.price;
    if (Number.isFinite(t.decimals)) a.decimals = t.decimals;
  }
  return { count: tokens.length, missing };
}

/**
 * Ask for a quote.
 *  pay:       EXACT_OUTPUT, so the payee receives exactly the invoice amount on their own chain.
 *  rebalance: EXACT_INPUT into the agent's own NEAR account.
 */
export async function getQuote({ originKey, destKey, swapType, amountUnits, recipient, refundTo, dry, slippageBps }) {
  const o = ASSETS[originKey], d = ASSETS[destKey];
  if (isDemo()) return demoQuote({ o, d, originKey, destKey, swapType, amountUnits, recipient, dry });
  const body = {
    dry, swapType, slippageTolerance: slippageBps,
    originAsset: o.id, destinationAsset: d.id,
    amount: toAtomic(amountUnits, swapType === 'EXACT_OUTPUT' ? d.decimals : o.decimals),
    depositType: 'ORIGIN_CHAIN', refundTo, refundType: 'ORIGIN_CHAIN',
    recipient, recipientType: 'DESTINATION_CHAIN',
    deadline: new Date(Date.now() + 20 * 60_000).toISOString(),
  };
  const r = await call('/v0/quote', { method: 'POST', headers: headers(), body: JSON.stringify(body) });
  const q = r.quote ?? {};
  const costUnits = q.amountIn ? fromAtomic(q.amountIn, o.decimals) : NaN;
  return {
    simulated: false, dry, depositAddress: q.depositAddress ?? null, deadline: q.deadline ?? r.quoteRequest?.deadline,
    amountInUnits: costUnits, amountInUsd: Number(q.amountInUsd) || costUnits * o.price,
    amountOutUsd: Number(q.amountOutUsd) || (q.amountOut ? fromAtomic(q.amountOut, d.decimals) * d.price : NaN),
    timeEstimateSec: q.timeEstimate, raw: r,
  };
}

export async function submitDeposit(depositAddress, txHash) {
  return call('/v0/deposit/submit', { method: 'POST', headers: headers(), body: JSON.stringify({ depositAddress, txHash }) });
}

export async function getStatus(depositAddress) {
  if (isDemo()) return demoStatus(depositAddress);
  const r = await call(`/v0/status?depositAddress=${encodeURIComponent(depositAddress)}`, { headers: headers() });
  return { status: r.status, hash: r.swapDetails?.destinationChainTxHashes?.[0]?.hash ?? null, raw: r };
}

// ---------- offline stand-in (clearly labelled "simulated" everywhere it surfaces) ----------
const demoSwaps = new Map();
function demoQuote({ o, d, swapType, amountUnits, recipient, dry }) {
  const FEE = 0.003; // mirrors the 0.2% app fee + a little spread
  let amountInUnits, amountOutUsd;
  if (swapType === 'EXACT_OUTPUT') { amountOutUsd = amountUnits * d.price; amountInUnits = (amountOutUsd * (1 + FEE)) / o.price; }
  else { amountInUnits = amountUnits; amountOutUsd = (amountUnits * o.price) * (1 - FEE); }
  const depositAddress = `demo-${Math.random().toString(36).slice(2, 10)}.simulated`; // demo always "executes"
  demoSwaps.set(depositAddress, { polls: 0, recipient });
  return { simulated: true, dry: false, depositAddress, deadline: new Date(Date.now() + 20 * 60_000).toISOString(),
    amountInUnits, amountInUsd: amountInUnits * o.price, amountOutUsd, timeEstimateSec: 12 };
}
function demoStatus(depositAddress) {
  const s = demoSwaps.get(depositAddress) ?? { polls: 9 };
  s.polls += 1;
  const status = s.polls < 2 ? 'PROCESSING' : 'SUCCESS';
  return { status, hash: status === 'SUCCESS' ? 'simulated-' + Buffer.from(depositAddress).toString('hex').slice(0, 24) : null, simulated: true };
}
