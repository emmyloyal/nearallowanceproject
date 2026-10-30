// Minimal Keccak-256 (the Ethereum variant, not NIST SHA3) so EVM addresses can be derived
// without dependencies. Verified against known vectors in test/keccak.test.js.
const M = (1n << 64n) - 1n;
const rotl = (x, n) => n === 0 ? x : ((x << BigInt(n)) | (x >> BigInt(64 - n))) & M;

const RC = (() => {
  const rc = Array(24).fill(0n);
  let R = 1;
  for (let t = 0; t < 24; t++) {
    for (let j = 0; j < 7; j++) {
      R = ((R << 1) ^ ((R >> 7) * 0x71)) % 256;
      if (R & 2) rc[t] ^= 1n << BigInt((1 << j) - 1);
    }
  }
  return rc;
})();

function permute(A) {
  for (let round = 0; round < 24; round++) {
    const C = [0, 1, 2, 3, 4].map(x => A[x] ^ A[x + 5] ^ A[x + 10] ^ A[x + 15] ^ A[x + 20]);
    for (let x = 0; x < 5; x++) {
      const D = C[(x + 4) % 5] ^ rotl(C[(x + 1) % 5], 1);
      for (let y = 0; y < 5; y++) A[x + 5 * y] ^= D;
    }
    let x = 1, y = 0, cur = A[1];
    for (let t = 0; t < 24; t++) {
      [x, y] = [y, (2 * x + 3 * y) % 5];
      const tmp = A[x + 5 * y];
      A[x + 5 * y] = rotl(cur, ((t + 1) * (t + 2) / 2) % 64);
      cur = tmp;
    }
    for (let yy = 0; yy < 5; yy++) {
      const T = A.slice(5 * yy, 5 * yy + 5);
      for (let xx = 0; xx < 5; xx++) A[xx + 5 * yy] = T[xx] ^ ((~T[(xx + 1) % 5] & M) & T[(xx + 2) % 5]);
    }
    A[0] ^= RC[round];
  }
}

export function keccak256(input) {
  const data = typeof input === 'string' ? new TextEncoder().encode(input) : input;
  const rate = 136;
  const padLen = rate - (data.length % rate);
  const buf = new Uint8Array(data.length + padLen);
  buf.set(data);
  buf[data.length] ^= 0x01;
  buf[buf.length - 1] ^= 0x80;
  const A = Array(25).fill(0n);
  for (let off = 0; off < buf.length; off += rate) {
    for (let i = 0; i < rate / 8; i++) {
      let lane = 0n;
      for (let b = 7; b >= 0; b--) lane = (lane << 8n) | BigInt(buf[off + i * 8 + b]);
      A[i] ^= lane;
    }
    permute(A);
  }
  const out = new Uint8Array(32);
  for (let i = 0; i < 4; i++) for (let b = 0; b < 8; b++) out[i * 8 + b] = Number((A[i] >> BigInt(8 * b)) & 0xffn);
  return out;
}

export const toHex = (u8) => Array.from(u8, b => b.toString(16).padStart(2, '0')).join('');
export const fromHex = (h) => Uint8Array.from(h.replace(/^0x/, '').match(/.{2}/g) ?? [], b => parseInt(b, 16));
