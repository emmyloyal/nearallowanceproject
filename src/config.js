import { readFileSync, existsSync } from 'node:fs';

// Tiny .env loader so the project has zero required dependencies.
if (existsSync('.env')) {
  for (const line of readFileSync('.env', 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
    if (m && !line.trim().startsWith('#') && process.env[m[1]] === undefined) process.env[m[1]] = m[2];
  }
}

const env = (k, d = '') => (process.env[k] ?? d);

export const config = {
  mode: env('MODE', 'demo'),            // demo | quotes | live
  port: Number(env('PORT', '3000')),
  nearAiKey: env('NEARAI_API_KEY'),
  nearAiModel: env('NEARAI_MODEL', 'z-ai/glm-5.2'),
  nearAiBase: 'https://cloud-api.near.ai/v1',
  oneClickBase: 'https://1click.chaindefuser.com',
  oneClickJwt: env('ONECLICK_JWT'),
  network: env('NEAR_NETWORK', 'mainnet'),
  accountId: env('NEAR_ACCOUNT_ID', 'agent.demo.near'),
  privateKey: env('NEAR_PRIVATE_KEY'),
  chainsigPath: env('CHAINSIG_PATH', 'allowance-1'),
  rpcUrl: env('NEAR_RPC_URL') || (env('NEAR_NETWORK', 'mainnet') === 'testnet'
    ? 'https://rpc.testnet.near.org' : 'https://rpc.mainnet.near.org'),
};

export const isDemo = () => config.mode === 'demo';
export const isLive = () => config.mode === 'live';
