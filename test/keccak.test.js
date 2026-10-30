import test from 'node:test';
import assert from 'node:assert/strict';
import { keccak256, toHex } from '../src/keccak.js';
import { evmAddressFromBytes, normalizePublicKey, buildSignRequest } from '../src/signatures.js';

test('keccak256 known vectors', () => {
  assert.equal(toHex(keccak256('')), 'c5d2460186f7233c927e7db2dcc703c0e500b653ca82273b7bfad8045d85a470');
  assert.equal(toHex(keccak256('abc')), '4e03657aea45a94fc7d47ba826c8d667c0d1e6e33a64a036ec44f58fa12d6c45');
  // longer than one 136-byte block
  assert.equal(toHex(keccak256('a'.repeat(200))).length, 64);
});

// Private key 1 -> public key = generator point G -> well-known address.
const G_X = '79be667ef9dcbbac55a06295ce870b07029bfcdb2dce28d959f2815b16f81798';
const G_Y = '483ada7726a3c4655da4fbfc0e1108a8fd17b448a68554199c47d08ffb10d4b8';
const hex = (h) => Uint8Array.from(h.match(/.{2}/g), b => parseInt(b, 16));

test('EVM address from raw, 0x04-prefixed and compressed public keys', () => {
  const want = '0x7E5F4552091A69125d5DfCb7b8C2659029395Bdf';
  assert.equal(evmAddressFromBytes(hex(G_X + G_Y)), want);
  assert.equal(evmAddressFromBytes(hex('04' + G_X + G_Y)), want);
  assert.equal(evmAddressFromBytes(hex('02' + G_X)), want); // G has even y
});

test('compressed key with odd y decompresses to the right point', () => {
  // -G has the same x and y' = p - y (odd)
  const P = 2n ** 256n - 2n ** 32n - 977n;
  const yNeg = (P - BigInt('0x' + G_Y)).toString(16).padStart(64, '0');
  assert.deepEqual(Buffer.from(normalizePublicKey(hex('03' + G_X))).toString('hex'), G_X + yNeg);
});

test('sign request shape', () => {
  const r = buildSignRequest('ab'.repeat(32), 'p1');
  assert.deepEqual(r, { request: { payload_v2: { Ecdsa: 'ab'.repeat(32) }, path: 'p1', domain_id: 0 } });
  assert.throws(() => buildSignRequest('xyz'));
});
