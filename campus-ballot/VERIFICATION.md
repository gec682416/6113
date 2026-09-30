# Verification record

Checked locally on 2026-09-30.

## Automated checks

- `npm test`: **12 passed** — 8 Solidity/EVM tests and 4 frontend controller tests.
- `.venv/bin/python -m unittest discover -s tests -p 'test_*.py' -v`: **7 passed**.
- `node --check static/app.js`: passed.

Contract coverage: initial state, duration, sender attribution, VoteCast event, duplicate rejection, invalid option rejection, independent wallets, total consistency, ETH transfer rejection, and closure at the exact deadline.

Frontend controller coverage: explicit unconfigured state, read-only results, mobile HTTPS deep link construction, missing wallet guidance, rejected wallet connection, network switch, actual vote execution against a disposable EVM, receipt confirmation, result update, and duplicate-button locking. These tests use a minimal synthetic DOM and EIP-1193 provider; they do not claim to test the installed MetaMask application.

Flask coverage: page structure, public configuration, health status, invalid address rejection, RPC URL validation, absence of classroom destructive routes, and bundled browser assets.

Ganache falls back to its JavaScript implementation on this Node 22 / Apple Silicon machine. The tests pass; this test-only dependency is not installed by Render.

## Browser checks

- Desktop: verified rendered layout and the missing-contract setup state.
- Read integration: started a disposable local EVM, deployed the actual contract, and verified the website reads its four zero-count results, deadline, and voting-open status.
- 390 × 844 mobile viewport: activity selection works and the page has no horizontal overflow.
- 320 × 740 viewport: document width equals viewport width; option touch areas are approximately 93px high.
- No injected wallet: pressing the vote/connect button displays the mobile/desktop MetaMask instructions.

## Still requires external deployment

- GitHub source publication and authenticated Render service creation.
- Verification of the resulting real Render URL.
- A real mobile MetaMask vote on Sepolia, including the deep-link handoff on the user's device.

The local EVM address must never be submitted as a Sepolia deployment. Test counts are not substituted for missing public-chain data.

## Public Sepolia deployment verified

The user deployed `0x00a08f3025b0B746093A524Db7179884c9813D77` in Remix. `node scripts/verify-sepolia.mjs` queried the public RPC and confirmed chain ID 11155111, nonempty bytecode, APP_ID `campus-ballot-v1`, the expected four activity names, zero votes at verification time, and an open poll. The contract deadline is `2026-12-29T12:22:36Z`. The application default and Render Blueprint now use this address. This is read-only verification; no vote was submitted on the student's behalf.

The local website was then reloaded against the public Sepolia RPC in the browser. It displayed Voting open, all four zero-count results, the actual contract Etherscan link, and the correct Singapore-time deadline.
