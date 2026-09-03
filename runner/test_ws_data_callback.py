import unittest
from unittest.mock import Mock

from ws_compat import data_callback


class SDKWebSocketDataCompatibilityTests(unittest.TestCase):

    def test_data_callback_accepts_websocket_client_data_arguments(self):
        handler = Mock()
        wsapp = Mock()
        data = {
            'token': '13061',
            'last_traded_price': 115720,
            'exchange_timestamp': 1777863000000,
        }

        data_callback(handler, wsapp, data, 'text', False)

        handler.assert_called_once_with(data)


if __name__ == '__main__':
    unittest.main()
