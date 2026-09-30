"""Flask serves the UI. MetaMask signs votes; the contract stores all results."""
import os
import re
from urllib.parse import urlparse

from flask import Flask, jsonify, render_template


def create_app(overrides=None):
    app = Flask(__name__)
    app.config.update(
        CONTRACT_ADDRESS=os.environ.get(
            "CONTRACT_ADDRESS", "0x00a08f3025b0B746093A524Db7179884c9813D77"
        ).strip(),
        RPC_URL=os.environ.get("RPC_URL", "https://ethereum-sepolia-rpc.publicnode.com").strip(),
    )
    if overrides:
        app.config.update(overrides)
    address = app.config["CONTRACT_ADDRESS"]
    if address and (not re.fullmatch(r"0x[0-9a-fA-F]{40}", address) or int(address, 16) == 0):
        raise ValueError("CONTRACT_ADDRESS must be a nonzero Ethereum contract address")
    rpc = urlparse(app.config["RPC_URL"])
    if not rpc.hostname or (rpc.scheme != "https" and not (
        rpc.scheme == "http" and rpc.hostname in {"127.0.0.1", "localhost"}
    )):
        raise ValueError("RPC_URL must use HTTPS (HTTP is allowed only for localhost tests)")

    @app.get("/")
    def index():
        return render_template("index.html")

    @app.get("/api/config")
    def config():
        # Public information only. Never add private keys or secret RPC credentials here.
        response = jsonify(
            contractAddress=address,
            rpcUrl=app.config["RPC_URL"],
            chainId=11155111,
            chainName="Sepolia",
            explorerUrl="https://sepolia.etherscan.io",
        )
        response.headers["Cache-Control"] = "no-store"
        return response

    @app.get("/healthz")
    def health():
        return jsonify(status="ok", configured=bool(address))

    @app.after_request
    def headers(response):
        response.headers["X-Content-Type-Options"] = "nosniff"
        response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
        response.headers["X-Frame-Options"] = "DENY"
        return response

    return app


app = create_app()

if __name__ == "__main__":
    app.run(host="127.0.0.1", port=int(os.environ.get("PORT", "5001")))
