import os
import unittest
from unittest.mock import patch

os.environ.setdefault("SCANNER_BASE_URL", "https://example.test")
os.environ.setdefault("ATH_INGEST_SECRET", "test-secret")
os.environ.setdefault("ANGEL_API_KEY", "test-key")
os.environ.setdefault("ANGEL_CLIENT_CODE", "test-client")
os.environ.setdefault("ANGEL_PASSWORD", "test-password")
os.environ.setdefault("ANGEL_TOTP_SECRET", "test-totp")

from runner import ath_runner


class FakeResponse:
    status_code = 200

    def raise_for_status(self):
        return None

    def json(self):
        return {
            "chart": {
                "result": [
                    {
                        "timestamp": [1724976000, 1725062400],
                        "indicators": {
                            "quote": [
                                {
                                    "high": [10.0, 20.0],
                                    "close": [9.0, 18.0],
                                }
                            ]
                        },
                    }
                ]
            }
        }


class YahooBaselineFallbackTests(unittest.TestCase):
    def test_missing_adjclose_uses_raw_high_fallback(self):
        with patch.object(ath_runner.requests, "get", return_value=FakeResponse()):
            result = ath_runner.yahoo_adjusted_ath("VOGL")

        self.assertEqual(result["symbol"], "VOGL")
        self.assertEqual(result["adjustedAthPrice"], 20.0)
        self.assertEqual(result["source"], "historical_yahoo_raw_fallback")
        self.assertEqual(result["historicalSymbol"], "VOGL")


if __name__ == "__main__":
    unittest.main()
