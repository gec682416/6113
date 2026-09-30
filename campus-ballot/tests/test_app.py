import unittest
from app import create_app


class AppTests(unittest.TestCase):
    def setUp(self):
        self.client = create_app({"TESTING": True, "CONTRACT_ADDRESS": ""}).test_client()

    def test_home_is_mobile_ready_and_has_four_options(self):
        response = self.client.get("/")
        self.assertEqual(response.status_code, 200)
        self.assertIn(b'name="viewport"', response.data)
        self.assertEqual(response.data.count(b'name="activity"'), 4)
        self.assertIn(b'aria-live="polite"', response.data)

    def test_configuration_is_explicitly_unconfigured(self):
        response = self.client.get("/api/config")
        self.assertEqual(response.json["contractAddress"], "")
        self.assertEqual(response.json["chainId"], 11155111)
        self.assertEqual(response.headers["Cache-Control"], "no-store")
        self.assertFalse(self.client.get("/healthz").json["configured"])

    def test_configuration_uses_deployed_address(self):
        address = "0x" + "1" * 40
        client = create_app({"CONTRACT_ADDRESS": address}).test_client()
        self.assertEqual(client.get("/api/config").json["contractAddress"], address)
        self.assertTrue(client.get("/healthz").json["configured"])

    def test_invalid_and_zero_addresses_fail_at_startup(self):
        for address in ["0x123", "0x" + "0" * 40, "<script>"]:
            with self.assertRaises(ValueError):
                create_app({"CONTRACT_ADDRESS": address})

    def test_rpc_requires_https_except_local_testing(self):
        for rpc in ["http://example.com", "javascript:alert(1)", "https://"]:
            with self.assertRaises(ValueError):
                create_app({"RPC_URL": rpc})
        create_app({"RPC_URL": "http://127.0.0.1:8545"})

    def test_old_destructive_routes_do_not_exist(self):
        self.assertEqual(self.client.post("/deleteuserlog").status_code, 404)
        self.assertEqual(self.client.post("/main").status_code, 404)

    def test_browser_assets_are_bundled(self):
        for asset in ["app.js", "styles.css", "favicon.svg", "vendor/ethers.umd.min.js"]:
            response = self.client.get("/static/" + asset)
            self.assertEqual(response.status_code, 200)
            response.close()


if __name__ == "__main__":
    unittest.main()
