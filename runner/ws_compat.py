def close_callback(sdk_on_close, wsapp, close_status_code=None, close_msg=None):
    sdk_on_close(wsapp)
