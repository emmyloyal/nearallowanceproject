import test from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_POLICY, evaluate, checkQuote, sanitizePolicy, parsePolicyText } from '../src/policy.js';

const ctx = (spent = 0) => ({ spentTodayUsd: spent, holdings: { USDC: 50, NEAR: 20 }, price: { USDC: 1, NEAR: 3 } });
const pay = (payeeId, amountUsd) => ({ type: 'pay', payeeId, amountUsd });
const P = DEFAULT_POLICY;

test('small payment to an allowlisted payee is allowed', () => {
  assert.equal(evaluate(P, ctx(), pay('near-ai-cloud', 4.2)).decision, 'allow');
});
test('over the approval line asks a human', () => {
  assert.equal(evaluate(P, ctx(), pay('domain-registrar', 12)).decision, 'needs_approval');
  assert.equal(evaluate(P, ctx(), pay('domain-registrar', 12), { approved: true }).decision, 'allow');
});
test('payees that are not allowlisted are always denied, approved or not', () => {
  assert.equal(evaluate(P, ctx(), pay('acme-billing', 1)).decision, 'deny');
  assert.equal(evaluate(P, ctx(), pay('acme-billing', 1), { approved: true }).decision, 'deny');
  assert.equal(evaluate(P, ctx(), pay('__proto__', 1)).decision, 'deny');
});
test('approval can never lift the per-payment cap or the daily cap', () => {
  assert.equal(evaluate(P, ctx(), pay('rpc-provider', 15.01), { approved: true }).decision, 'deny');
  assert.equal(evaluate(P, ctx(25), pay('rpc-provider', 6), { approved: true }).decision, 'deny');
  assert.equal(evaluate(P, ctx(25), pay('rpc-provider', 5), { approved: true }).decision, 'allow');
});
test('garbage amounts are denied', () => {
  for (const a of [0, -5, NaN, Infinity, '12', null, undefined]) assert.equal(evaluate(P, ctx(), pay('near-ai-cloud', a)).decision, 'deny', String(a));
});
test('unknown action types and non-objects are denied', () => {
  assert.equal(evaluate(P, ctx(), { type: 'withdraw_all', amountUsd: 1 }).decision, 'deny');
  assert.equal(evaluate(P, ctx(), null).decision, 'deny');
});
test('rebalance needs two held assets and enough balance', () => {
  assert.equal(evaluate(P, ctx(), { type: 'rebalance', from: 'NEAR', to: 'USDC', amountUsd: 10 }).decision, 'allow');
  assert.equal(evaluate(P, ctx(), { type: 'rebalance', from: 'NEAR', to: 'NEAR', amountUsd: 10 }).decision, 'deny');
  assert.equal(evaluate(P, ctx(), { type: 'rebalance', from: 'DOGE', to: 'USDC', amountUsd: 1 }).decision, 'deny');
  assert.equal(evaluate(P, ctx(), { type: 'rebalance', from: 'NEAR', to: 'USDC', amountUsd: 14.9 }).decision, 'allow');
});
test('quote check uses the real cost, not the invoice amount', () => {
  assert.equal(checkQuote(P, { maxCostUsd: 10, quotedCostUsd: 10.2 }).ok, true);
  assert.equal(checkQuote(P, { maxCostUsd: 10, quotedCostUsd: 12 }).ok, false);
});
test('sanitizePolicy clamps values and never touches payees or chains', () => {
  const out = sanitizePolicy(P, { dailyCapUsd: 5000, perTxCapUsd: -3, approvalAboveUsd: 'abc', payees: { evil: { address: '0xBAD' } }, allowedChains: ['btc'] });
  assert.equal(out.dailyCapUsd, 1000);
  assert.equal(out.perTxCapUsd, 0);
  assert.deepEqual(out.payees, P.payees);
  assert.deepEqual(out.allowedChains, P.allowedChains);
  assert.ok(out.approvalAboveUsd <= out.perTxCapUsd);
});
test('allocation must be complete and sum to 1', () => {
  assert.deepEqual(sanitizePolicy(P, { targetAllocation: { USDC: 0.7, NEAR: 0.3 } }).targetAllocation, { USDC: 0.7, NEAR: 0.3 });
  assert.deepEqual(sanitizePolicy(P, { targetAllocation: { USDC: 0.9, NEAR: 0.9 } }).targetAllocation, P.targetAllocation);
});
test('plain-English parser', () => {
  const p = parsePolicyText('Never spend more than $12 a day. Ask me over $3. 70% USDC.');
  assert.equal(p.dailyCapUsd, 12); assert.equal(p.approvalAboveUsd, 3); assert.deepEqual(p.targetAllocation, { USDC: 0.7, NEAR: 0.3 });
  const d = parsePolicyText(DEFAULT_POLICY.text);
  assert.equal(d.dailyCapUsd, 30); assert.equal(d.approvalAboveUsd, 8); assert.deepEqual(d.targetAllocation, { USDC: 0.5, NEAR: 0.5 });
});
