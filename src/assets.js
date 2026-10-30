// Asset ids use the 1-Click format (nep141:...). The NEAR-chain ids below are held by the agent;
// the others are payout assets on other chains. `npm run doctor` checks every id against the live
// /v0/tokens list, and the app refreshes prices from it in quotes/live mode.
// Fixture prices are illustrative and only used when offline.
export const ASSETS = {
  'USDC.near': { id: 'nep141:17208628f84f5d6ad33f0da3bbbeb27ffcb398eac501a31bd6ad2011e36133a1', symbol: 'USDC', chain: 'near', decimals: 6, price: 1 },
  'NEAR.near': { id: 'nep141:wrap.near', symbol: 'NEAR', chain: 'near', decimals: 24, price: 3 },
  'USDC.eth':  { id: 'nep141:eth-0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48.omft.near', symbol: 'USDC', chain: 'eth', decimals: 6, price: 1 },
  'USDC.arb':  { id: 'nep141:arb-0xaf88d065e77c8cc2239327c5edb3a432268e5831.omft.near', symbol: 'USDC', chain: 'arb', decimals: 6, price: 1 },
  'USDC.sol':  { id: 'nep141:sol-5ce3bf3a31af18be40ba30f721101b4341690186.omft.near', symbol: 'USDC', chain: 'sol', decimals: 6, price: 1 },
};

// Assets the agent holds and may trade between (keyed by symbol for allocation targets).
export const HOLDABLE = { USDC: 'USDC.near', NEAR: 'NEAR.near' };

export const toAtomic = (units, decimals) => {
  const [i, f = ''] = Number(units).toFixed(Math.min(decimals, 8)).split('.');
  return (BigInt(i) * 10n ** BigInt(decimals) + BigInt((f + '0'.repeat(decimals)).slice(0, decimals))).toString();
};
export const fromAtomic = (atomic, decimals) => Number(BigInt(atomic)) / 10 ** decimals;
