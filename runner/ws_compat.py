def close_callback(sdk_on_close, wsapp, close_status_code=None, close_msg=None):
    sdk_on_close(wsapp)


def data_callback(runner_on_data, wsapp, data, data_type=None, continue_flag=None):
    runner_on_data(data)
