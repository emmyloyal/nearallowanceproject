// Prints the foreign-chain address your NEAR account controls through Chain Signatures.
// Optional: `npm run derive -- --sign` asks the MPC contract to sign a test hash (testnet, needs a key and 1 yoctoNEAR).
import { config } from '../src/config.js';
import { deriveEvmAddress, buildSignRequest, SIGNER_CONTRACT } from '../src/signatures.js';
import { keccak256, toHex } from '../src/keccak.js';

const d = await deriveEvmAddress();
console.log(`NEAR account : ${config.accountId}`);
console.log(`Path         : ${config.chainsigPath}`);
console.log(`Signer       : ${SIGNER_CONTRACT[config.network]}`);
console.log(`Public key   : ${d.publicKey}`);
console.log(`EVM address  : ${d.address}   (same address on Ethereum, Arbitrum, Base, ...)`);

if (process.argv.includes('--sign')) {
  if (config.network !== 'testnet') { console.error('Refusing to sign on mainnet from a demo script. Set NEAR_NETWORK=testnet.'); process.exit(1); }
  const { chainSign } = await import('../src/near.js');
  const payload = toHex(keccak256('allowance chain signatures test'));
  console.log(`\nAsking the MPC network to sign 0x${payload} ...`);
  const out = await chainSign(buildSignRequest(payload));
  console.log('Signature request submitted. Tx:', out?.transaction?.hash ?? '(see explorer)');
}
