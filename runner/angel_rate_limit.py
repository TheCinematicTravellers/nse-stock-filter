import time


def _is_rate_limit_error(exc):
    text = str(exc).lower()
    return ('exceeding access rate' in text or
            'access rate' in text or
            'too many requests' in text or
            'rate limit' in text)


def call_with_backoff(api_call, retries=3, sleep=time.sleep):
    last_error = None
    for attempt in range(retries):
        try:
            return api_call()
        except Exception as exc:
            last_error = exc
            if not _is_rate_limit_error(exc) or attempt == retries - 1:
                raise
            sleep(5 * (2 ** attempt))
    raise last_error


def seed_candle_request(api_call, sleep=time.sleep, interval=2):
    result = call_with_backoff(api_call, sleep=sleep)
    sleep(interval)
    return result
