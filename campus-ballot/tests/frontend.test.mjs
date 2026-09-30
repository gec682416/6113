// Unit-test the shipped controller with a minimal DOM and a disposable EVM.
// No installed browser, real wallet, account, or public network is controlled here.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ganache from 'ganache';
import * as ethers from 'ethers';
import { compile } from './compile.mjs';

const names = ['Outdoor movie night', 'Board game social', 'Weekend nature walk', 'Creative workshop'];
class Element {
  constructor(text = '') { this.textContent = text; this.listeners = {}; this.style = {}; this.dataset = {}; this.attrs = {}; this.classList = {toggle(){}}; this.children = []; }
  addEventListener(name, listener) { this.listeners[name] = listener; }
  setAttribute(name, value) { this.attrs[name] = value; }
  replaceChildren(...children) { this.children = children; }
  append(child) { this.children.push(child); }
  scrollIntoView() {}
}
let chain, provider, contract, accounts;
before(async () => {
  chain = ganache.provider({logging:{quiet:true}, chain:{chainId:11155111}});
  provider = new ethers.BrowserProvider(chain);
  provider.pollingInterval = 20;
  accounts = await chain.request({method:'eth_accounts', params:[]});
  const {abi, evm} = compile();
  contract = await new ethers.ContractFactory(abi, evm.bytecode.object, await provider.getSigner()).deploy(90);
  await contract.waitForDeployment();
});
after(async () => { provider.destroy(); await chain.disconnect(); });

async function waitFor(predicate) {
  const end = Date.now() + 6000;
  while (!predicate()) {
    if (Date.now() > end) throw new Error('Timed out waiting for controller state');
    await new Promise(resolve => setTimeout(resolve, 10));
  }
}
async function setup({withWallet = true, address = null} = {}) {
  const elements = new Map();
  const el = id => { if (!elements.has(id)) elements.set(id, new Element()); return elements.get(id); };
  const radios = Array.from({length:4}, () => ({checked:false}));
  const walletEvents = {};
  const flags = {reject:false, wrongNetwork:false};
  const providers = [];
  const injected = {
    on(name, handler) { walletEvents[name] = handler; },
    async request({method, params}) {
      if (method === 'eth_requestAccounts') {
        if (flags.reject) throw Object.assign(new Error('Rejected'), {code:4001});
        return [accounts[0]];
      }
      if (method === 'eth_chainId' && flags.wrongNetwork) return '0x1';
      if (method === 'wallet_switchEthereumChain') { flags.wrongNetwork = false; return null; }
      if (method === 'eth_accounts') return [accounts[0]];
      return chain.request({method, params: params || []});
    },
  };
  class TestBrowserProvider extends ethers.BrowserProvider {
    constructor(wallet) { super(wallet); this.pollingInterval = 20; providers.push(this); }
  }
  class TestReadProvider extends ethers.BrowserProvider {
    constructor() { super(chain, undefined, {cacheTimeout:0}); this.pollingInterval = 20; providers.push(this); }
  }
  const context = {
    console, Event, URL, setTimeout, clearTimeout,
    setInterval() { return 0; },
    location: {host:'ballot.example', pathname:'/', protocol:'https:'},
    ethers: {...ethers, JsonRpcProvider:TestReadProvider, BrowserProvider:TestBrowserProvider},
    fetch: async () => ({ok:true, json: async () => ({contractAddress:address ?? await contract.getAddress(),rpcUrl:'https://example.invalid',chainId:11155111, explorerUrl:'https://sepolia.etherscan.io'})}),
    document: {
      hidden:false,
      getElementById:el,
      querySelectorAll:selector => selector === '.option-copy strong' ? names.map(n => new Element(n)) : radios,
      addEventListener(){},
      createTextNode:text => ({textContent:text}),
      createElement:() => new Element(),
    },
  };
  context.window = {ethers:context.ethers, ethereum:withWallet ? injected : null, addEventListener(){}, dispatchEvent(){}};
  vm.runInNewContext(readFileSync(new URL('../static/app.js', import.meta.url), 'utf8'), context);
  await waitFor(() => ['Voting open','Awaiting deployment'].includes(el('poll-status').textContent));
  return {el, flags, walletEvents, cleanup:() => providers.forEach(p => p.destroy())};
}

test('unconfigured controller clearly disables voting without fabricating counts', async () => {
  const h = await setup({address:''});
  assert.equal(h.el('vote').disabled, true);
  assert.match(h.el('notice').textContent, /Setup required/);
  h.cleanup();
});
test('controller reads zero-count state and provides an HTTPS mobile deep link', async () => {
  const h = await setup({withWallet:false});
  assert.equal(h.el('total').textContent, '0');
  assert.equal(h.el('mobile-link').href, 'https://link.metamask.io/dapp/ballot.example/');
  await h.el('connect').listeners.click();
  assert.match(h.el('notice').textContent, /MetaMask’s browser/);
  h.cleanup();
});
test('wallet rejection stays disconnected and displays an actionable message', async () => {
  const h = await setup();
  h.flags.reject = true;
  await h.el('connect').listeners.click();
  assert.match(h.el('notice').textContent, /cancelled/);
  assert.equal(h.el('my-vote').textContent, 'Wallet not connected');
  assert.equal(await contract.totalVotes(), 0n);
  h.cleanup();
});
test('controller switches networks, signs a vote, waits for confirmation, and locks duplicate voting', async () => {
  const h = await setup();
  h.flags.wrongNetwork = true;
  await h.el('connect').listeners.click();
  assert.equal(h.flags.wrongNetwork, false);
  h.el('options').listeners.change({target:{value:'1'}});
  assert.equal(h.el('vote').disabled, false);
  await h.el('vote-form').listeners.submit({preventDefault(){}});
  assert.equal(await contract.choiceOf(accounts[0]), 2n);
  assert.equal(h.el('total').textContent, '1');
  assert.equal(h.el('my-vote').textContent, names[1]);
  assert.equal(h.el('vote').disabled, true);
  assert.match(h.el('transaction').children[0].textContent, /confirmed on Sepolia/);
  assert.match(h.el('transaction').children[1].href, /sepolia.etherscan.io\/tx\/0x/);
  h.cleanup();
});
