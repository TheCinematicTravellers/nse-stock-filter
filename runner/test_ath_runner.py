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

    def __init__(self, payload):
        self.payload = payload

    def raise_for_status(self):
        return None

    def json(self):
        return self.payload


class YahooBaselineAdjustmentTests(unittest.TestCase):
    def test_ath_uses_raw_high_when_no_split_exists(self):
        payload = {
            "chart": {
                "result": [{
                    "timestamp": [1724976000, 1725062400],
                    "indicators": {
                        "quote": [{
                            "high": [10.0, 20.0],
                            "close": [9.0, 18.0],
                        }],
                        "adjclose": [{"adjclose": [5.0, 9.0]}],
                    },
                    "events": {},
                }]
            }
        }

        with patch.object(ath_runner.requests, "get", return_value=FakeResponse(payload)):
            result = ath_runner.yahoo_adjusted_ath("VOGL")

        self.assertEqual(result["symbol"], "VOGL")
        self.assertEqual(result["adjustedAthPrice"], 20.0)
        self.assertEqual(result["source"], "corporate_action_adjusted_yahoo")
        self.assertEqual(result["historicalSymbol"], "VOGL")

    def test_pre_split_high_is_adjusted_but_dividends_are_not(self):
        split_ts = 1726790400
        payload = {
            "chart": {
                "result": [{
                    "timestamp": [1724976000, split_ts],
                    "indicators": {
                        "quote": [{
                            "high": [130.0, 63.5],
                            "close": [120.0, 62.0],
                        }],
                        "adjclose": [{"adjclose": [60.0, 31.0]}],
                    },
                    "events": {
                        "splits": {
                            str(split_ts): {
                                "numerator": 1,
                                "denominator": 10,
                            }
                        }
                    },
                }]
            }
        }

        with patch.object(ath_runner.requests, "get", return_value=FakeResponse(payload)):
            result = ath_runner.yahoo_adjusted_ath("FEDDERSHOL")

        self.assertEqual(result["adjustedAthPrice"], 63.5)
        self.assertEqual(result["source"], "corporate_action_adjusted_yahoo")
        self.assertEqual(result["athDate"], "2024-09-20")


if __name__ == "__main__":
    unittest.main()
