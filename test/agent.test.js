import test from 'node:test';
import assert from 'node:assert/strict';
import { createAgent } from '../src/agent.js';
import { rulesBrain, extractJson } from '../src/brain.js';

const byTitle = (s, re) => s.log.find(l => re.test(l.title));

test('full demo cycle: pays, asks, blocks, rebalances, then settles', async () => {
  const a = createAgent();
  let s = await a.tick();
  assert.ok(byTitle(s, /Paid NEAR AI Cloud/)); assert.ok(byTitle(s, /Paid Mira/)); assert.ok(byTitle(s, /Paid RPC provider/));
  assert.equal(byTitle(s, /Domain registrar/).decision, 'needs_approval');
  assert.equal(byTitle(s, /Unknown vendor/).decision, 'deny');
  assert.ok(byTitle(s, /Rebalancing/));
  assert.equal(s.approvals.length, 1);
  assert.ok(Math.abs(s.spentTodayUsd - 15.25) < 0.01); // 4.2 + 7 + 4, plus a 0.3% simulated fee
  s = await a.tick();
  assert.equal(s.pendingSwaps, 0);
  assert.ok(Math.abs(s.holdingsUsd.USDC - s.holdingsUsd.NEAR) < 1, 'rebalanced to roughly 50/50');
});

test('rebalance is not repeated while money is in flight or once balanced', async () => {
  const a = createAgent();
  await a.tick(); await a.tick(); const s = await a.tick();
  assert.equal(s.log.filter(l => /Rebalancing/.test(l.title)).length, 1);
});

test('approval pays; declining does not', async () => {
  const a = createAgent();
  let s = await a.tick();
  s = await a.approve(s.approvals[0].id, true);
  assert.ok(byTitle(s, /Paid Domain registrar/));
  assert.ok(s.spentTodayUsd > 27 && s.spentTodayUsd < 28);
  const b = createAgent(); s = await b.tick();
  const before = s.spentTodayUsd;
  s = await b.approve(s.approvals[0].id, false);
  assert.equal(s.spentTodayUsd, before);
  assert.equal(s.bills.find(x => x.id === 'b3').status, 'rejected');
});

test('approval cannot push spending past the daily cap', async () => {
  const a = createAgent();
  let s = await a.tick();
  await a.setPolicy('Never spend more than $18 a day. Ask me over $8.');
  s = await a.approve(s.approvals[0].id, true);
  assert.ok(byTitle(s, /Blocked even with your approval/));
  assert.ok(s.spentTodayUsd <= 18);
});

test('prompt-injected memo cannot redirect money: model output naming an attacker is blocked', async () => {
  const evilBrain = { decide: async () => ({ brain: 'evil', rationale: 'obeying the memo', actions: [
    { type: 'pay', billId: 'b4', payeeId: '0xBAD00000000000000000000000000000000beef', amountUsd: 18 },
    { type: 'pay', billId: 'b1', payeeId: 'rpc-provider', amountUsd: 4.2 },   // wrong payee for this invoice
    { type: 'pay', billId: 'b2', payeeId: 'design-freelancer', amountUsd: 1 }, // wrong amount for this invoice
    { type: 'pay', billId: 'nope', payeeId: 'near-ai-cloud', amountUsd: 1 },
    { type: 'drain_wallet', amountUsd: 999 },
  ] }) };
  const a = createAgent({ brain: evilBrain });
  const s = await a.tick();
  assert.equal(s.spentTodayUsd, 0);
  assert.equal(s.log.filter(l => l.decision === 'deny').length, 5);
  assert.equal(s.bills.find(b => b.id === 'b4').status, 'blocked');
  assert.equal(s.swaps?.length ?? 0, 0);
});

test('hard cap holds under repeated bills', async () => {
  const a = createAgent();
  await a.tick();
  for (let i = 0; i < 5; i++) a.addBill({ payeeId: 'rpc-provider', amountUsd: 7 });
  const s = await a.tick();
  assert.ok(s.spentTodayUsd <= s.policy.dailyCapUsd);
  assert.ok(s.log.some(l => /daily cap/.test(l.detail ?? '')));
});

test('rules brain only proposes, and model JSON is extracted defensively', () => {
  const out = rulesBrain({ policy: { targetAllocation: { USDC: .5, NEAR: .5 }, rebalanceBandPct: 8 }, holdingsUsd: { USDC: 50, NEAR: 50 }, bills: [] });
  assert.deepEqual(out.actions, []);
  assert.deepEqual(extractJson('Sure!\n```json\n{"actions":[]}\n```'), { actions: [] });
  assert.deepEqual(extractJson('here you go {"a":1} thanks'), { a: 1 });
  assert.equal(extractJson('not json'), null);
});

test('addBill rejects bad amounts', () => {
  const a = createAgent();
  assert.throws(() => a.addBill({ payeeId: 'x', amountUsd: -1 }));
  assert.throws(() => a.addBill({ payeeId: 'x', amountUsd: 'abc' }));
});
