// The guardrails. The AI proposes; this file decides. It is plain deterministic code with no model
// in the loop, so a confused or manipulated model cannot talk its way past a limit.

export const DEFAULT_POLICY = {
  text: 'Keep half in USDC and half in NEAR. Pay my bills automatically. Never spend more than $30 a day. Ask me before anything over $8.',
  dailyCapUsd: 30,        // hard ceiling on money leaving the treasury per UTC day
  perTxCapUsd: 15,        // hard ceiling on a single payment, even if a human approves it
  approvalAboveUsd: 8,    // above this, a human must tap approve
  targetAllocation: { USDC: 0.5, NEAR: 0.5 },
  rebalanceBandPct: 8,    // only rebalance when an asset drifts this many points off target
  maxSlippageBps: 100,
  allowedChains: ['near', 'eth', 'arb', 'sol'],
  // The ONLY places the agent can send money. Addresses live here, never in model output.
  payees: {
    'near-ai-cloud': { label: 'NEAR AI Cloud credits', chain: 'eth', asset: 'USDC.eth', address: '0x1111111111111111111111111111111111111111' },
    'design-freelancer': { label: 'Mira (design freelancer)', chain: 'arb', asset: 'USDC.arb', address: '0x2222222222222222222222222222222222222222' },
    'domain-registrar': { label: 'Domain registrar', chain: 'sol', asset: 'USDC.sol', address: '9xQeWvG816bUx9EPjHmaT23yvVM2ZWbrrpZb9PusVFin' },
    'rpc-provider': { label: 'RPC provider', chain: 'eth', asset: 'USDC.eth', address: '0x3333333333333333333333333333333333333333' },
  },
};

const num = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : NaN);
const r2 = (n) => Math.round(n * 100) / 100;

/**
 * Decide what to do with a proposed action.
 * @returns {{decision:'allow'|'needs_approval'|'deny', reasons:string[]}}
 */
export function evaluate(policy, ctx, action, { approved = false } = {}) {
  const deny = (...reasons) => ({ decision: 'deny', reasons });
  if (!action || typeof action !== 'object') return deny('Action is not an object.');

  if (action.type === 'noop') return { decision: 'allow', reasons: ['Nothing to do.'] };

  const amount = num(action.amountUsd);
  if (!(amount > 0)) return deny('Amount must be a positive number.');

  if (action.type === 'pay') {
    const payee = policy.payees[action.payeeId];
    if (!payee) return deny(`Payee "${String(action.payeeId).slice(0, 40)}" is not on the allowlist.`);
    if (!policy.allowedChains.includes(payee.chain)) return deny(`Chain ${payee.chain} is not allowed.`);
    if (amount > policy.perTxCapUsd) return deny(`$${r2(amount)} is over the $${policy.perTxCapUsd} per-payment cap.`);
    const left = policy.dailyCapUsd - ctx.spentTodayUsd;
    if (amount > left + 1e-9) return deny(`Would exceed the daily cap: $${r2(Math.max(left, 0))} left of $${policy.dailyCapUsd}.`);
    if (amount > policy.approvalAboveUsd && !approved) {
      return { decision: 'needs_approval', reasons: [`$${r2(amount)} is over the $${policy.approvalAboveUsd} auto-approve limit.`] };
    }
    return { decision: 'allow', reasons: ['Payee allowlisted and inside every limit.'] };
  }

  if (action.type === 'rebalance') {
    if (!(action.from in ctx.holdings) || !(action.to in ctx.holdings) || action.from === action.to) return deny('Rebalance needs two different held assets.');
    if (amount > policy.perTxCapUsd) return deny(`$${r2(amount)} is over the $${policy.perTxCapUsd} per-trade cap.`);
    if (amount > ctx.holdings[action.from] * ctx.price[action.from] + 1e-9) return deny('Not enough of the source asset.');
    return { decision: 'allow', reasons: ['Swap stays inside the treasury account.'] };
  }

  return deny(`Unknown action type "${String(action.type).slice(0, 20)}".`);
}

/** Policy checks against what a quote will really cost, not what the model hoped it would cost. */
export function checkQuote(policy, { maxCostUsd, quotedCostUsd }) {
  const slack = 1 + policy.maxSlippageBps / 10_000 + 0.01; // slippage + ~1% for fees
  if (quotedCostUsd > maxCostUsd * slack) {
    return { ok: false, reason: `Quote costs $${r2(quotedCostUsd)}, more than the $${r2(maxCostUsd * slack)} the policy allows for this payment.` };
  }
  return { ok: true };
}

/** Clamp anything coming from a model or a form into a safe policy. Unknown keys are dropped. */
export function sanitizePolicy(base, patch = {}) {
  const out = { ...base };
  const clampNum = (v, lo, hi) => (Number.isFinite(Number(v)) ? Math.min(hi, Math.max(lo, Number(v))) : undefined);
  const d = clampNum(patch.dailyCapUsd, 0, 1000); if (d !== undefined) out.dailyCapUsd = d;
  const t = clampNum(patch.perTxCapUsd, 0, 1000); if (t !== undefined) out.perTxCapUsd = t;
  const a = clampNum(patch.approvalAboveUsd, 0, 1000); if (a !== undefined) out.approvalAboveUsd = a;
  const b = clampNum(patch.rebalanceBandPct, 1, 50); if (b !== undefined) out.rebalanceBandPct = b;
  if (patch.targetAllocation && typeof patch.targetAllocation === 'object') {
    const ta = {};
    for (const k of Object.keys(base.targetAllocation)) {
      const v = clampNum(patch.targetAllocation[k], 0, 1);
      if (v !== undefined) ta[k] = v;
    }
    const sum = Object.values(ta).reduce((s, v) => s + v, 0);
    if (Object.keys(ta).length === Object.keys(base.targetAllocation).length && Math.abs(sum - 1) < 0.01) out.targetAllocation = ta;
  }
  if (typeof patch.text === 'string') out.text = patch.text.slice(0, 500);
  // A per-payment cap can never exceed the daily cap, and approvals can never exceed the per-payment cap.
  out.perTxCapUsd = Math.min(out.perTxCapUsd, out.dailyCapUsd);
  out.approvalAboveUsd = Math.min(out.approvalAboveUsd, out.perTxCapUsd);
  // payees and allowedChains are intentionally NOT patchable from text or a model.
  return out;
}

/** Offline plain-English parser, used when no NEAR AI key is set. Handles the common phrasings. */
export function parsePolicyText(text) {
  const patch = { text };
  const money = '\\$\\s?(\\d+(?:\\.\\d+)?)';
  let m;
  if ((m = text.match(new RegExp(`${money}\\s*(?:a|per|/|each)\\s*day`, 'i')) || text.match(new RegExp(`(?:more than|over|above)\\s*${money}\\s*(?:a|per|each)\\s*day`, 'i')))) patch.dailyCapUsd = Number(m[1]);
  if ((m = text.match(new RegExp(`(?:ask me|approval|approve|confirm)[^.$]*?(?:over|above|more than)\\s*${money}`, 'i')))) patch.approvalAboveUsd = Number(m[1]);
  if ((m = text.match(new RegExp(`(?:single|each|one)\\s*(?:payment|transaction|tx)[^.$]*?${money}`, 'i')))) patch.perTxCapUsd = Number(m[1]);
  const alloc = {};
  for (const sym of ['USDC', 'NEAR']) {
    const r = text.match(new RegExp(`(\\d+)\\s*%\\s*(?:in\\s*)?${sym}`, 'i'));
    if (r) alloc[sym] = Math.round(Number(r[1])) / 100;
  }
  if (/half in usdc and half in near|half usdc,? half near/i.test(text)) { alloc.USDC = 0.5; alloc.NEAR = 0.5; }
  if (alloc.USDC !== undefined && alloc.NEAR === undefined) alloc.NEAR = Math.round((1 - alloc.USDC) * 100) / 100;
  if (alloc.NEAR !== undefined && alloc.USDC === undefined) alloc.USDC = Math.round((1 - alloc.NEAR) * 100) / 100;
  if (Object.keys(alloc).length === 2) patch.targetAllocation = alloc;
  return patch;
}
