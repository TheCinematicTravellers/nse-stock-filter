import unittest
from instrument_filter import filter_instruments


class InstrumentFilterTests(unittest.TestCase):
    def test_keeps_only_requested_price_band_symbols(self):
        instruments = [
            {'symbol': 'LOW', 'token': '1', 'cmp': 99.99},
            {'symbol': 'KEEP100', 'token': '2', 'cmp': 100.0},
            {'symbol': 'MID', 'token': '3', 'cmp': 2500.0},
            {'symbol': 'KEEP4000', 'token': '4', 'cmp': 4000.0},
            {'symbol': 'HIGH', 'token': '5', 'cmp': 4000.01},
        ]
        allowed = {'KEEP100', 'MID', 'KEEP4000'}
        result = filter_instruments(instruments, allowed_symbols=allowed)
        self.assertEqual([x['symbol'] for x in result], ['KEEP100', 'MID', 'KEEP4000'])

    def test_does_not_change_instrument_records(self):
        instrument = {'symbol': 'KEEP', 'token': '99', 'cmp': 500.0}
        result = filter_instruments([instrument], allowed_symbols={'KEEP'})
        self.assertEqual(result, [instrument])


if __name__ == '__main__':
    unittest.main()
