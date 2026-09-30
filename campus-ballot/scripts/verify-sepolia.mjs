// Read-only verification. This script never signs or submits transactions.
import { Contract, FetchRequest, JsonRpcProvider } from 'ethers';
const address = '0x00a08f3025b0B746093A524Db7179884c9813D77';
const request = new FetchRequest('https://ethereum-sepolia-rpc.publicnode.com');
request.timeout = 30000;
const provider = new JsonRpcProvider(request, undefined, {batchMaxCount:1});
const contract = new Contract(address, [
  'function APP_ID() view returns (string)',
  'function getResults() view returns (string[4] names, uint256[4] votes, uint256 total, uint256 deadline, bool isOpen)',
], provider);
try {
  const [network, code, appId, result] = await Promise.all([
    provider.getNetwork(), provider.getCode(address), contract.APP_ID(), contract.getResults(),
  ]);
  if (network.chainId !== 11155111n || code === '0x' || appId !== 'campus-ballot-v1') throw new Error('Contract identity or network mismatch');
  console.log(JSON.stringify({address, chainId:Number(network.chainId), appId,
    names:[...result.names], votes:result.votes.map(String), total:String(result.total),
    deadlineUTC:new Date(Number(result.deadline)*1000).toISOString(), isOpen:result.isOpen,
  }, null, 2));
} catch(error) {
  console.error(error.shortMessage || error.message);
  process.exitCode = 1;
} finally { provider.destroy(); }
