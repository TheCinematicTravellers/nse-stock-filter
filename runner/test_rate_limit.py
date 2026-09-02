import unittest
from unittest.mock import Mock

from angel_rate_limit import call_with_backoff


class RateLimitTests(unittest.TestCase):
    def test_rate_limit_retries_with_backoff_then_succeeds(self):
        api_call = Mock(side_effect=[Exception('Access denied because of exceeding access rate'), Exception('exceeding access rate'), 'OK'])
        sleep = Mock()

        result = call_with_backoff(api_call, retries=3, sleep=sleep)

        self.assertEqual(result, 'OK')
        self.assertEqual(api_call.call_count, 3)
        self.assertEqual(sleep.call_count, 2)
        self.assertEqual([c.args[0] for c in sleep.call_args_list], [5, 10])

    def test_non_rate_limit_error_is_not_retried(self):
        api_call = Mock(side_effect=Exception('Internal Server Error'))
        sleep = Mock()

        with self.assertRaisesRegex(Exception, 'Internal Server Error'):
            call_with_backoff(api_call, retries=3, sleep=sleep)

        self.assertEqual(api_call.call_count, 1)
        sleep.assert_not_called()


if __name__ == '__main__':
    unittest.main()
