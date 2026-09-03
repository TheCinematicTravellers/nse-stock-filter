import unittest
from unittest.mock import Mock

from ws_compat import close_callback


class SDKWebSocketIntegrationTests(unittest.TestCase):
    def test_adapter_forwards_websocket_close_to_sdk(self):
        sdk = Mock()
        wsapp = Mock()
        callback = lambda wsapp, status=None, msg=None: close_callback(sdk._on_close, wsapp, status, msg)
        callback(wsapp, 1000, 'normal closure')
        sdk._on_close.assert_called_once_with(wsapp)


if __name__ == '__main__':
    unittest.main()
