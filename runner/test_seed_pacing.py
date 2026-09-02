import unittest
from unittest.mock import Mock

from angel_rate_limit import call_with_backoff


class SeedPacingTests(unittest.TestCase):
    def test_seed_requests_are_spaced_after_success(self):
        sleep = Mock()
        api_call = Mock(return_value='OK')

        for _ in range(3):
            call_with_backoff(api_call, sleep=sleep)
            sleep(2)

        self.assertEqual(api_call.call_count, 3)
        self.assertEqual(sleep.call_count, 3)
        self.assertEqual([c.args[0] for c in sleep.call_args_list], [2, 2, 2])


if __name__ == '__main__':
    unittest.main()
