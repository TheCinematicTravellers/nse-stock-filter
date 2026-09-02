import unittest
from unittest.mock import Mock

from angel_rate_limit import seed_candle_request


class SeedPacingTests(unittest.TestCase):
    def test_seed_requests_are_spaced_after_success(self):
        sleep = Mock()
        api_call = Mock(side_effect=['ONE', 'TWO', 'THREE'])

        result = [seed_candle_request(api_call, sleep=sleep, interval=2) for _ in range(3)]

        self.assertEqual(result, ['ONE', 'TWO', 'THREE'])
        self.assertEqual(api_call.call_count, 3)
        self.assertEqual([c.args[0] for c in sleep.call_args_list], [2, 2, 2])

    def test_seed_request_keeps_backoff_behavior_on_rate_limit(self):
        sleep = Mock()
        api_call = Mock(side_effect=[Exception('exceeding access rate'), 'OK'])

        result = seed_candle_request(api_call, sleep=sleep, interval=2)

        self.assertEqual(result, 'OK')
        self.assertEqual([c.args[0] for c in sleep.call_args_list], [5, 2])


if __name__ == '__main__':
    unittest.main()
