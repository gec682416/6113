# Campus Ballot

An original campus activity voting Dapp for course 6106. Built with ChatGPT, Flask, Solidity, ethers.js, and MetaMask. Deploy the contract with Remix and the website on Render.

The classroom transfer/deposit application in the parent directory is preserved for reference. **This folder is a separate application: upload only the contents of `campus-ballot/` to your new GitHub repository.**

## Connected Sepolia deployment

The student's deployed contract is already configured: [`0x00a08f3025b0B746093A524Db7179884c9813D77`](https://sepolia.etherscan.io/address/0x00a08f3025b0B746093A524Db7179884c9813D77). Read-only verification confirmed the expected app ID and four options. Voting closes on **2026-12-29 at 20:22:36 Singapore time**. No redeployment is needed for the current ballot; proceed to GitHub and Render below. `CONTRACT_ADDRESS` can still override the bundled default.

## What it does

- A four-option poll: outdoor movie night, board game social, nature walk, or creative workshop.
- One vote per wallet address, enforced by Solidity, not a browser cookie.
- The voter is `msg.sender`; users cannot submit an arbitrary voter address.
- Public totals, percentages, closing time, and your wallet's recorded choice.
- A transaction link after submission and confirmation only after the receipt succeeds.
- Mobile layout; read results in any browser and vote inside MetaMask's mobile browser.
- No SQLite, login database, funds custody, admin vote editing, or classroom contract addresses.

This is a public, non-binding activity preference poll. A person can own multiple wallets, so this is **not** verified one-student-one-vote voting. Both the vote and wallet address are public. The contract accepts no ETH deposits; voting still consumes Sepolia test ETH for network gas.

## 1. Deploy the smart contract in Remix

1. Open <https://remix.ethereum.org> in a browser with MetaMask installed.
2. Create `CampusBallot.sol` and paste the contents of `contracts/CampusBallot.sol`.
3. In Solidity Compiler, select **0.8.24** and compile. Optimizer can stay off.
4. In MetaMask, select **Sepolia** and make sure you have Sepolia test ETH.
5. In Remix → Deploy & Run Transactions, select **Injected Provider - MetaMask** (some versions display **Browser Extension**). Confirm the wallet/network is Sepolia, chain ID **11155111**. Do not use Remix VM for the submitted website.
6. Select `CampusBallot`, enter **90** for `durationInDays` (voting stays open for 90 days from deployment), keep **VALUE = 0**, and click Deploy.
7. Confirm the deployment in your wallet. Copy the **deployed contract address** shown under Deployed Contracts. This is not your wallet address or the transaction hash.

The duration must be between 1 and 365 days. Deploy a new contract to start a new ballot after the deadline. Existing votes cannot be erased or changed.

## 2. Upload to a new GitHub repository

Create a repository such as `campus-ballot-6106`. Upload the **contents inside this folder**, preserving `static/`, `templates/`, and `contracts/`. The repository root should directly contain `app.py`, `requirements.txt`, and `render.yaml`.

Do not upload `.venv/`, `node_modules/`, `artifacts/`, or the parent classroom project. A deployment ZIP is provided alongside this folder; extract it first because GitHub needs the source files, not the ZIP itself. Include the bundled `static/vendor/ethers.umd.min.js`, which removes a runtime CDN dependency.

## 3. Deploy the website on Render

In <https://dashboard.render.com>, select **New → Web Service**, connect the new repository, and use:

| Setting | Value |
| --- | --- |
| Runtime | Python 3 |
| Root Directory | Leave blank if `app.py` is at the repository root |
| Build Command | `pip install -r requirements.txt` |
| Start Command | `gunicorn --bind 0.0.0.0:$PORT app:app` |
| Instance Type | Free |
| Health Check Path | `/healthz` |
| Environment variable | `CONTRACT_ADDRESS` = the Sepolia contract address from Remix |

`RPC_URL` is optional. Its default is `https://ethereum-sepolia-rpc.publicnode.com`. This URL is sent to visitors' browsers, so **do not put secret RPC API credentials into it**. If the public endpoint becomes unavailable, replace it with another browser-accessible Sepolia endpoint that permits CORS. The UI verifies the RPC chain and contract identity before enabling voting.

Alternatively use **New → Blueprint** with the included `render.yaml`; the current public contract address is already included. The YAML assumes this project is at the repository root. If you deliberately upload the whole parent folder, set the service Root Directory to `campus-ballot` (manual Web Service flow is simplest in that case).

When Render reports **Live**, open its actual `https://…onrender.com` service URL. This is the link to submit. The code does not contain an invented deployment URL. Free service cold starts can cause a delay on the first request.

## 4. Check the submitted link on a phone

1. Open the Render link in Safari or Chrome. Confirm results load without a wallet.
2. Tap **Open in MetaMask**, or paste the Render URL into MetaMask's built-in browser.
3. Select Sepolia, connect a wallet with test ETH, choose an activity, and tap **Cast my vote**.
4. Confirm in MetaMask and wait for the on-chain confirmation. Check the Etherscan transaction link.
5. Refresh: the count and your choice should persist. The same wallet must not be able to vote again.
6. Connect a second wallet to cast another vote. This is one address per vote, not identity verification.

Safari/Chrome on a phone can display results but usually do not inject a wallet provider. This version intentionally uses MetaMask's in-app browser for mobile signing; it does not implement WalletConnect.

## Local development

```sh
cd campus-ballot
python3 -m venv .venv
.venv/bin/pip install -r requirements.txt
.venv/bin/python app.py
```

Open <http://127.0.0.1:5001>. The current Sepolia contract is the default. Set `CONTRACT_ADDRESS` to use a different deployment; explicitly setting it to an empty string shows the “Awaiting deployment” state. The app does not simulate votes.

Node.js is only needed to run contract tests or update the vendored ethers library; Render runs Python only:

```sh
npm ci
npm test
.venv/bin/python -m unittest discover -s tests -p 'test_*.py' -v
npm run vendor
```

For disposable local EVM testing, run `npm run local-chain` in another terminal. It prints a local contract address. Start Flask with that address and `RPC_URL=http://127.0.0.1:8545`. This local chain is **not Sepolia**, although it uses the same chain ID for isolated integration checks. Never publish that local RPC configuration to Render or add those test accounts to your real wallet.

## Files worth understanding

| File | Responsibility |
| --- | --- |
| `contracts/CampusBallot.sol` | Voting rules and permanent chain state |
| `app.py` | Flask page, public config, health endpoint |
| `static/app.js` | Wallet connection, network checking, transaction flow, result reads |
| `templates/index.html` | Accessible English UI |
| `static/styles.css` | Responsive desktop and phone styles |
| `render.yaml` | Render deployment configuration |

## Short explanation for class

> Campus Ballot is a decentralized voting application for choosing a campus activity. I used ChatGPT to help develop it. The frontend connects to MetaMask, while a Solidity smart contract on Sepolia enforces one vote per wallet and stores the results. Flask serves the website on Render. Users can read results on any phone browser and vote through MetaMask's mobile browser. Unlike the classroom payment-record example, this project has its own voting contract, voting rules, activity choices, and responsive interface.

## Official references

- [Deploy a Flask app on Render](https://render.com/docs/deploy-flask)
- [Render Blueprint configuration](https://render.com/docs/blueprint-spec)
- [Remix Deploy & Run](https://remix-ide.readthedocs.io/en/latest/run.html)
- [ethers.js v6](https://docs.ethers.org/v6/)
- [MetaMask test networks](https://support.metamask.io/develop/blockchain-networks/testnets/)
