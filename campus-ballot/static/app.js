/* All writes go through the user's wallet. Flask never handles signing keys. */
(() => {
  'use strict';
  const $ = (id) => document.getElementById(id);
  const ABI = [
    'function APP_ID() view returns (string)',
    'function getResults() view returns (string[4] names, uint256[4] votes, uint256 total, uint256 deadline, bool isOpen)',
    'function choiceOf(address) view returns (uint256)',
    'function vote(uint256 optionId)',
    'event VoteCast(address indexed voter, uint256 indexed optionId)',
  ];
  const optionNames = [...document.querySelectorAll('.option-copy strong')].map(el => el.textContent);
  let config, readProvider, readContract, walletProvider, injected;
  let account = null, choice = 0, selected = null, connectedChain = null;
  let ready = false, open = false, deadline = 0, busy = false, refreshing = false;
  let connecting = false, walletRevision = 0, pendingHash = null;
  let verified = false, syncFailed = false;

  function notice(message = '', kind = 'info') {
    $('notice').textContent = message;
    $('notice').dataset.kind = kind;
    $('notice').hidden = !message;
  }
  function short(address) { return `${address.slice(0, 6)}…${address.slice(-4)}`; }
  function errorMessage(error) {
    const code = error?.code ?? error?.info?.error?.code;
    const message = `${error?.shortMessage || ''} ${error?.reason || ''} ${error?.message || ''}`;
    if (code === 4001 || code === 'ACTION_REJECTED') return 'Request cancelled in your wallet. No new vote was submitted.';
    if (code === -32002) return 'A request is already waiting in MetaMask. Open your wallet to finish it.';
    if (code === 'INSUFFICIENT_FUNDS' || /insufficient funds/i.test(message)) return 'Your wallet needs a little Sepolia test ETH for gas. Add test ETH, then try again.';
    if (/already voted/i.test(message)) return 'This wallet has already voted. Each address gets one vote.';
    if (/Voting has closed/i.test(message)) return 'Voting has closed. The final results are available below.';
    if (code === 'TIMEOUT') return 'Confirmation is taking longer than expected. Check your transaction link before trying again.';
    return error?.userMessage || 'Could not complete the request. Check your wallet, Sepolia network, and internet connection, then try again.';
  }
  function userError(message) { return Object.assign(new Error(message), {userMessage: message}); }

  function renderControls() {
    const closed = deadline > 0 && Date.now() / 1000 >= deadline;
    const canVote = ready && open && !closed && !syncFailed;
    $('connect').disabled = connecting || busy || !config;
    $('connect').textContent = connecting ? 'Opening wallet…' : account ? short(account) : 'Connect wallet ↗';
    $('connect').title = account || 'Connect MetaMask';
    $('options').disabled = busy || !canVote || choice > 0;
    $('vote').disabled = busy || !canVote || choice > 0 || (account !== null && selected === null);
    let text = 'Connect wallet to vote ↗';
    if (!config?.contractAddress) text = 'Ballot awaiting deployment';
    else if (syncFailed) text = 'Results unavailable · retry refresh';
    else if (!ready) text = 'Loading ballot…';
    else if (!open || closed) text = 'Voting has closed';
    else if (choice > 0) text = 'Your vote is recorded ✓';
    else if (busy) text = pendingHash ? 'Waiting for confirmation…' : 'Confirm in your wallet…';
    else if (account && connectedChain !== config.chainId) text = 'Switch to Sepolia to vote ↗';
    else if (account) text = selected === null ? 'Select an activity above' : 'Cast my vote ↗';
    $('vote').textContent = text;
    $('vote').classList.toggle('pending', busy);
    $('my-vote').textContent = !account ? 'Wallet not connected' : choice ? optionNames[choice - 1] : syncFailed ? 'Could not verify' : 'Not cast yet';
    if (choice) $('vote-hint').textContent = `You voted for ${optionNames[choice - 1]}. Votes cannot be changed.`;
    else $('vote-hint').textContent = 'Votes are final. A small Sepolia test ETH gas fee applies.';
    if (closed && ready) $('poll-status').textContent = 'Voting closed';
  }

  async function refresh() {
    if (!readContract || refreshing) return;
    refreshing = true;
    const revision = walletRevision;
    const currentAccount = account;
    $('refresh').disabled = true;
    $('results').setAttribute('aria-busy', 'true');
    try {
      if (!verified) {
        const network = await readProvider.getNetwork();
        if (Number(network.chainId) !== config.chainId) throw userError('The read RPC is not connected to Sepolia. Check RPC_URL in Render.');
        if (await readProvider.getCode(config.contractAddress) === '0x') throw userError('No contract found at this Sepolia address. Check CONTRACT_ADDRESS in Render.');
        if (await readContract.APP_ID() !== 'campus-ballot-v1') throw userError('This is not a Campus Ballot contract. Check the deployed address.');
        verified = true;
      }
      // Read results and wallet choice from the same block so they cannot disagree.
      const blockTag = await readProvider.getBlockNumber();
      const [data, votedChoice] = await Promise.all([
        readContract.getResults({blockTag}),
        currentAccount ? readContract.choiceOf(currentAccount, {blockTag}) : Promise.resolve(0n),
      ]);
      if (revision !== walletRevision) return;
      if (!data.names.every((name, i) => name === optionNames[i])) throw userError('Contract options do not match this website. Deploy the included CampusBallot.sol contract.');
      choice = Number(votedChoice);
      deadline = Number(data.deadline);
      open = data.isOpen;
      const total = data.total;
      $('total').textContent = total.toLocaleString();
      data.votes.forEach((count, i) => {
        const percent = total ? Number(count * 1000n / total) / 10 : 0;
        $(`percent-${i}`).textContent = `${percent}%`;
        $(`count-${i}`).textContent = `${count.toLocaleString()} ${count === 1n ? 'vote' : 'votes'}`;
        $(`bar-${i}`).style.transform = `scaleX(${percent / 100})`;
      });
      $('deadline').textContent = new Date(deadline * 1000).toLocaleString(undefined, {month:'short', day:'numeric', year:'numeric', hour:'2-digit', minute:'2-digit', timeZoneName:'short'});
      $('poll-status').textContent = open ? 'Voting open' : 'Voting closed';
      $('poll-status').dataset.state = 'ok';
      $('results-note').textContent = total === 0n ? 'No votes yet. Be the first to help choose.' : `Updated ${new Date().toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'})} · refreshes every 30 seconds`;
      if (syncFailed) notice();
      ready = true;
      syncFailed = false;
    } catch (error) {
      syncFailed = true;
      $('poll-status').textContent = 'Connection issue';
      $('poll-status').dataset.state = 'error';
      $('results-note').textContent = ready ? 'Showing the last successful read. Refresh to try again.' : 'Results are unavailable. Refresh to try again.';
      notice(errorMessage(error), 'error');
    } finally {
      refreshing = false;
      $('refresh').disabled = false;
      $('results').setAttribute('aria-busy', 'false');
      renderControls();
      if (revision !== walletRevision) void refresh();
    }
  }

  function bindWallet(provider) {
    injected = provider;
    walletProvider = new ethers.BrowserProvider(provider);
    provider.on?.('accountsChanged', (accounts) => {
      walletRevision++;
      account = accounts[0] || null;
      choice = 0;
      selected = null;
      document.querySelectorAll('input[name="activity"]').forEach(input => { input.checked = false; });
      renderControls();
      void refresh();
    });
    provider.on?.('chainChanged', (chain) => {
      walletRevision++;
      connectedChain = Number(chain);
      walletProvider = new ethers.BrowserProvider(provider);
      if (connectedChain !== config?.chainId) notice('Switch your wallet to Sepolia before voting. Public results still come from Sepolia.');
      else notice();
      renderControls();
      void refresh();
    });
    provider.on?.('disconnect', () => {
      walletRevision++;
      account = null;
      choice = 0;
      renderControls();
    });
  }

  let discovered;
  window.addEventListener('eip6963:announceProvider', (event) => {
    if (event.detail?.info?.rdns === 'io.metamask') discovered = event.detail.provider;
  });
  window.dispatchEvent(new Event('eip6963:requestProvider'));

  async function ensureNetwork() {
    connectedChain = Number(await injected.request({method:'eth_chainId'}));
    if (connectedChain === config.chainId) return;
    try {
      await injected.request({method:'wallet_switchEthereumChain', params:[{chainId:ethers.toQuantity(config.chainId)}]});
    } catch (error) {
      if ((error.code ?? error.data?.originalError?.code) !== 4902) throw error;
      await injected.request({method:'wallet_addEthereumChain', params:[{
        chainId:ethers.toQuantity(config.chainId), chainName:'Sepolia',
        nativeCurrency:{name:'Sepolia ETH', symbol:'ETH', decimals:18},
        rpcUrls:[config.rpcUrl], blockExplorerUrls:[config.explorerUrl],
      }]});
      await injected.request({method:'wallet_switchEthereumChain', params:[{chainId:ethers.toQuantity(config.chainId)}]});
    }
    connectedChain = Number(await injected.request({method:'eth_chainId'}));
    if (connectedChain !== config.chainId) throw userError('Select Sepolia in MetaMask, then try again.');
    walletProvider = new ethers.BrowserProvider(injected);
  }

  async function connect() {
    if (connecting || !config) return false;
    const provider = discovered || window.ethereum?.providers?.find(p => p.isMetaMask) || window.ethereum;
    if (!provider) {
      notice('To vote on your phone, tap “Open in MetaMask” below, or paste this page URL into MetaMask’s browser. On desktop, install the MetaMask extension.');
      $('mobile-link').scrollIntoView({behavior:'smooth', block:'center'});
      return false;
    }
    connecting = true;
    renderControls();
    try {
      if (!injected) bindWallet(provider);
      const accounts = await injected.request({method:'eth_requestAccounts'});
      if (!accounts[0]) throw userError('No account was selected in MetaMask. Please connect a wallet.');
      walletRevision++;
      account = accounts[0];
      await ensureNetwork();
      notice();
      await refresh();
      return true;
    } catch (error) {
      notice(errorMessage(error), 'error');
      return false;
    } finally {
      connecting = false;
      renderControls();
    }
  }

  function transaction(message, hash) {
    $('transaction').hidden = false;
    $('transaction').replaceChildren(document.createTextNode(message));
    if (hash) {
      const link = document.createElement('a');
      link.href = `${config.explorerUrl}/tx/${hash}`;
      link.target = '_blank';
      link.rel = 'noopener noreferrer';
      link.textContent = 'View transaction on Etherscan ↗';
      $('transaction').append(link);
    }
  }

  async function vote(event) {
    event.preventDefault();
    if (busy || !ready || syncFailed || !open || choice > 0) return;
    if (!account) { await connect(); return; }
    if (selected === null) { notice('Choose an activity before voting.'); return; }
    const option = selected;
    busy = true;
    pendingHash = null;
    renderControls();
    notice();
    try {
      await ensureNetwork();
      const signer = await walletProvider.getSigner();
      const signingAccount = await signer.getAddress();
      if (signingAccount.toLowerCase() !== account.toLowerCase()) throw userError('Your wallet account changed. Reconnect before voting.');
      const writable = new ethers.Contract(config.contractAddress, ABI, signer);
      transaction(`Confirm your vote for ${optionNames[option]} in MetaMask.`);
      const tx = await writable.vote(option);
      pendingHash = tx.hash;
      transaction('Vote submitted. Waiting for blockchain confirmation…', tx.hash);
      renderControls();
      let receipt;
      try {
        receipt = await tx.wait(1, 120000);
      } catch (error) {
        // A sped-up transaction can have a different hash; cancellation is not success.
        if (error.code === 'TRANSACTION_REPLACED' && !error.cancelled && error.reason === 'repriced') receipt = error.receipt;
        else throw error;
      }
      if (!receipt || receipt.status !== 1) throw userError('The transaction failed on chain. Your vote was not recorded.');
      transaction(`Your vote for ${optionNames[option]} is confirmed on Sepolia.`, receipt.hash);
      await refresh();
    } catch (error) {
      if (error.code === 'TRANSACTION_REPLACED' && error.cancelled) {
        transaction('The transaction was cancelled or replaced in your wallet. Refresh results to check your vote.', error.receipt?.hash || pendingHash);
      } else {
        transaction(pendingHash ? 'A transaction was submitted. Check its on-chain status below before retrying.' : 'No vote was submitted.', pendingHash);
      }
      notice(errorMessage(error), 'error');
      await refresh();
    } finally {
      busy = false;
      renderControls();
    }
  }

  async function init() {
    $('connect').addEventListener('click', connect);
    $('refresh').addEventListener('click', () => { notice(); void refresh(); });
    $('vote-form').addEventListener('submit', vote);
    $('options').addEventListener('change', (event) => { selected = Number(event.target.value); renderControls(); });
    const deepLink = new URL('https://link.metamask.io/dapp/' + location.host + location.pathname);
    if (location.protocol === 'https:') $('mobile-link').href = deepLink.href;
    else $('mobile-link').textContent = 'Get MetaMask ↗';
    try {
      if (!window.ethers) throw userError('The wallet library could not load. Reload this page or check your internet connection.');
      const response = await fetch('/api/config');
      if (!response.ok) throw userError('Website configuration is unavailable. Reload to try again.');
      config = await response.json();
      if (!config.contractAddress) {
        $('poll-status').textContent = 'Awaiting deployment';
        $('results').setAttribute('aria-busy', 'false');
        $('refresh').disabled = true;
        $('results-note').textContent = 'This ballot has not been connected to a contract yet.';
        notice('Setup required: deploy CampusBallot.sol to Sepolia, then set CONTRACT_ADDRESS in Render. No on-chain results are available yet.');
        renderControls();
        return;
      }
      // Normalize mixed-case input while preserving the address. No secrets in this config.
      config.contractAddress = ethers.getAddress(config.contractAddress.toLowerCase());
      $('contract-link').href = `${config.explorerUrl}/address/${config.contractAddress}`;
      $('contract-link').hidden = false;
      const rpcRequest = new ethers.FetchRequest(config.rpcUrl);
      rpcRequest.timeout = 15000;
      readProvider = new ethers.JsonRpcProvider(rpcRequest, undefined, {batchMaxCount:1, cacheTimeout:0});
      readContract = new ethers.Contract(config.contractAddress, ABI, readProvider);
      await refresh();
      setInterval(() => { if (!document.hidden && !busy) void refresh(); }, 30000);
      setInterval(renderControls, 1000);
      document.addEventListener('visibilitychange', () => { if (!document.hidden) void refresh(); });
    } catch (error) {
      $('poll-status').textContent = 'Setup issue';
      $('poll-status').dataset.state = 'error';
      $('results').setAttribute('aria-busy', 'false');
      notice(errorMessage(error), 'error');
      renderControls();
    }
  }
  void init();
})();
