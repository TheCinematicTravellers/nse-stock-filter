import unittest
from unittest.mock import Mock

from ws_compat import close_callback


class SDKWebSocketCompatibilityTests(unittest.TestCase):
    def test_close_callback_accepts_websocket_client_close_arguments(self):
        sdk_on_close = Mock()
        wsapp = Mock()
        close_callback(sdk_on_close, wsapp, 1000, 'normal closure')
        sdk_on_close.assert_called_once_with(wsapp)


if __name__ == '__main__':
    unittest.main()
