import time


def subscribe_in_batches(ws, instruments, batch_size=50, sleep=time.sleep):
    tokens = [str(x['token']) for x in instruments]
    for start in range(0, len(tokens), batch_size):
        batch = tokens[start:start + batch_size]
        ws.subscribe(
            'inside50',
            1,
            [{'exchangeType': 1, 'tokens': batch}],
        )
        if start + batch_size < len(tokens):
            sleep(0.5)
