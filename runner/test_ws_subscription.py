import unittest
from unittest.mock import Mock

from ws_utils import subscribe_in_batches


class WebSocketSubscriptionTests(unittest.TestCase):
    def test_subscribes_208_tokens_in_batches_of_50(self):
        ws = Mock()
        instruments = [{'token': str(i)} for i in range(208)]

        subscribe_in_batches(ws, instruments, batch_size=50, sleep=lambda _: None)

        self.assertEqual(ws.subscribe.call_count, 5)
        sizes = [len(c.args[2][0]['tokens']) for c in ws.subscribe.call_args_list]
        self.assertEqual(sizes, [50, 50, 50, 50, 8])


if __name__ == '__main__':
    unittest.main()
