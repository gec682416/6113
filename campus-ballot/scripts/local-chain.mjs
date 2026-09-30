// Disposable local test chain. These generated wallets are never used on public networks.
import ganache from 'ganache';
import { JsonRpcProvider, ContractFactory } from 'ethers';
import { writeFileSync, mkdirSync } from 'node:fs';
import { compile } from '../tests/compile.mjs';
const server = ganache.server({logging:{quiet:true}, chain:{chainId:11155111}});
await server.listen(8545, '127.0.0.1');
const provider = new JsonRpcProvider('http://127.0.0.1:8545');
const {abi, evm} = compile();
const contract = await new ContractFactory(abi, evm.bytecode.object, await provider.getSigner()).deploy(90);
await contract.waitForDeployment();
const address = await contract.getAddress();
mkdirSync('artifacts', {recursive:true});
writeFileSync('artifacts/local-address.txt', address);
console.log(`Local test contract: ${address}\nLocal RPC: http://127.0.0.1:8545\nNo real Sepolia deployment has occurred.`);
async function stop() { provider.destroy(); await server.close(); process.exit(0); }
process.on('SIGINT', stop);
process.on('SIGTERM', stop);
