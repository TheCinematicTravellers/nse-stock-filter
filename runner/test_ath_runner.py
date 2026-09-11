import os
import unittest
import datetime as dt
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
        split_ts = 1726790401
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
				"splitRatio": "1:10",	
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

    def test_two_for_one_split_uses_inverse_price_factor(self):
        split_ts = 1762713000
        payload = {
            "chart": {
                "result": [{
                    "timestamp": [1724976000, 1762713001],
                    "indicators": {
                        "quote": [{
                            "high": [91.5, 95.0],
                            "close": [90.0, 94.0],
                        }],
                        "adjclose": [{"adjclose": [91.5, 95.0]}],
                    },
                    "events": {
                        "splits": {
                            str(split_ts): {
                                "numerator": 2,
                                "denominator": 1,
                            }
                        }
                    },
                }]
            }
        }

        with patch.object(ath_runner.requests, "get", return_value=FakeResponse(payload)):
            result = ath_runner.yahoo_adjusted_ath("SMCGLOBAL")

        self.assertEqual(result["adjustedAthPrice"], 95.0)
        self.assertEqual(result["rawReferenceHigh"], 95.0)
        self.assertEqual(result["source"], "corporate_action_adjusted_yahoo")

class RebuildBatchTests(unittest.TestCase):
    def test_rebuild_baseline_writes_all_rows_in_one_request(self):
        rows = [
            {"symbol": "AAA", "adjustedAthPrice": 100.0},
            {"symbol": "BBB", "adjustedAthPrice": 200.0},
            {"symbol": "CCC", "adjustedAthPrice": 300.0},
        ]

        with patch.object(ath_runner, "post") as mock_post:
            ath_runner.rebuild_baseline(rows)

        mock_post.assert_called_once_with(
            "/api/ath/repair",
            {
                "rebuild": True,
                "repairs": rows,
            },
        )

class LiveSubscriptionTests(unittest.TestCase):
    def test_refresh_subscriptions_subscribes_pending_d1_setup(self):
        class FakeWS:
            def __init__(self):
                self.calls = []

            def subscribe(self, *args):
                self.calls.append(args)

        monitor = ath_runner.LiveMonitor.__new__(ath_runner.LiveMonitor)
        monitor.ws = FakeWS()
        monitor.by_token = {
            "123": {"token": "123", "symbol": "AHCL"},
        }
        monitor.subscribed = set()

        with patch.object(
            ath_runner,
            "get",
            return_value={
                "tradeSetups": [
                    {"symbol": "AHCL", "status": "PENDING_D1"},
                ]
            },
        ):
            monitor.refresh_subscriptions()

        self.assertEqual(monitor.ws.calls, [
            ("ath-live", 2, [{"exchangeType": 1, "tokens": ["123"]}])
        ])
        self.assertEqual(monitor.subscribed, {"123"})

class LiveSessionTests(unittest.TestCase):
    def test_on_data_ignores_ticks_after_nse_close(self):
        class FakeWS:
            def subscribe(self, *args):
                pass

        monitor = ath_runner.LiveMonitor.__new__(ath_runner.LiveMonitor)
        monitor.ws = FakeWS()
        monitor.by_token = {
            "123": {"token": "123", "symbol": "AHCL"},
        }
        monitor.subscribed = set()

        data = {
            "token": "123",
            "last_traded_price": 1800,
            "exchange_timestamp": int(
                dt.datetime(
                    2026, 9, 11, 15, 59, 57,
                    tzinfo=ath_runner.IST,
                ).timestamp() * 1000
            ),
            "open_price_of_the_day": 1750,
        }

        with patch.object(ath_runner, "post") as mock_post:
            monitor.on_data(None, data)

        mock_post.assert_not_called()

if __name__ == "__main__":
    unittest.main()
