import csv
import io
import unittest

from export_cmp import build_csv


class ExportCMPTests(unittest.TestCase):
    def test_build_csv_contains_all_instruments_and_cmp(self):
        instruments = [
            {"symbol": "AAA", "token": "1"},
            {"symbol": "BBB", "token": "2"},
        ]
        prices = {"1": 101.25, "2": 202.50}

        text = build_csv(instruments, prices)
        rows = list(csv.DictReader(io.StringIO(text)))

        self.assertEqual(rows, [
            {"Stock": "AAA", "Token": "1", "CMP": "101.25"},
            {"Stock": "BBB", "Token": "2", "CMP": "202.50"},
        ])

    def test_missing_cmp_is_blank(self):
        instruments = [{"symbol": "AAA", "token": "1"}]
        text = build_csv(instruments, {})
        rows = list(csv.DictReader(io.StringIO(text)))
        self.assertEqual(rows[0]["CMP"], "")


if __name__ == "__main__":
    unittest.main()
