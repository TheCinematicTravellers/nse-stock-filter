import unittest
from pathlib import Path
import re


class WebSocketCallbackSignatureTests(unittest.TestCase):
    def test_runner_uses_websocket_callback_signatures(self):
        source = Path(__file__).with_name('angel_runner.py').read_text(encoding='utf-8')

        self.assertRegex(source, r"def on_open\(wsapp\):")
        self.assertRegex(source, r"def on_close\(wsapp, close_status_code, close_msg\):")


if __name__ == '__main__':
    unittest.main()
