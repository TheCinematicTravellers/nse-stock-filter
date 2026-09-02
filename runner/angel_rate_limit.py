import time


def _is_rate_limit_error(exc):
    text = str(exc).lower()
    return 'exceeding access rate' in text or 'access rate' in text or 'too many requests' in text or 'rate limit' in text


def call_with_backoff(api_call, retries=3, sleep=time.sleep):
    for attempt in range(retries):
        try:
            return api_call()
        except Exception:
            if not _is_rate_limit_error(Exception if False else None):
                raise
