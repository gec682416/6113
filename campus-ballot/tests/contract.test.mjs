import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import ganache from 'ganache';
import { BrowserProvider, ContractFactory } from 'ethers';
import { compile } from './compile.mjs';

let chain, provider, factory, contract, first, second;
before(async () => {
  chain = ganache.provider({logging:{quiet:true}, chain:{chainId:11155111}});
  provider = new BrowserProvider(chain);
  provider.pollingInterval = 20;
  [first, second] = await Promise.all([provider.getSigner(0), provider.getSigner(1)]);
  const compiled = compile();
  factory = new ContractFactory(compiled.abi, compiled.evm.bytecode.object, first);
  contract = await factory.deploy(90);
  await contract.waitForDeployment();
});
after(async () => { provider.destroy(); await chain.disconnect(); });

test('new ballot has exactly four options, zero votes, and a 90-day deadline', async () => {
  assert.equal(await contract.APP_ID(), 'campus-ballot-v1');
  const result = await contract.getResults();
  assert.deepEqual([...result.names], ['Outdoor movie night','Board game social','Weekend nature walk','Creative workshop']);
  assert.deepEqual([...result.votes], [0n,0n,0n,0n]);
  assert.equal(result.total, 0n);
  assert.equal(result.isOpen, true);
  const block = await provider.getBlock('latest');
  assert.equal(result.deadline - BigInt(block.timestamp), 90n * 86400n);
});
test('successful vote is attributed to the sender and emits a verifiable event', async () => {
  const tx = await contract.vote(2);
  const receipt = await tx.wait();
  const event = contract.interface.parseLog(receipt.logs[0]);
  assert.equal(event.name, 'VoteCast');
  assert.equal(event.args.voter, await first.getAddress());
  assert.equal(event.args.optionId, 2n);
  assert.equal(await contract.hasVoted(await first.getAddress()), true);
  assert.equal(await contract.choiceOf(await first.getAddress()), 3n);
  const result = await contract.getResults();
  assert.deepEqual([...result.votes], [0n,0n,1n,0n]);
  assert.equal(result.total, 1n);
});
test('the same wallet cannot vote twice or overwrite its original choice', async () => {
  await assert.rejects(contract.vote.staticCall(0), /already voted/);
  assert.equal(await contract.choiceOf(await first.getAddress()), 3n);
  assert.equal(await contract.totalVotes(), 1n);
});
test('invalid choices revert without consuming voting eligibility', async () => {
  await assert.rejects(contract.connect(second).vote.staticCall(4), /Invalid option/);
  assert.equal(await contract.hasVoted(await second.getAddress()), false);
});
test('a second wallet votes independently and totals stay consistent', async () => {
  await (await contract.connect(second).vote(0)).wait();
  const result = await contract.getResults();
  assert.deepEqual([...result.votes], [1n,0n,1n,0n]);
  assert.equal(result.total, result.votes.reduce((a,b) => a+b, 0n));
});
test('contract rejects ETH payments; voting only pays gas to the network', async () => {
  await assert.rejects(first.sendTransaction({to:await contract.getAddress(), value:1n}));
});
test('deployment rejects invalid durations', async () => {
  for (const duration of [0,366]) await assert.rejects(factory.deploy(duration));
});
test('at the exact deadline, voting closes and final results remain readable', async () => {
  const deadline = Number(await contract.closesAt());
  await chain.request({method:'evm_setTime', params:[deadline * 1000]});
  await chain.request({method:'evm_mine', params:[]});
  const third = await provider.getSigner(2);
  await assert.rejects(contract.connect(third).vote.staticCall(1), /Voting has closed/);
  const result = await contract.getResults();
  assert.equal(result.isOpen, false);
  assert.equal(result.total, 2n);
});
