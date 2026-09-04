import time

class BatchAccumulator:
    def __init__(self, coalesce_seconds=0.2):
        self.coalesce_seconds=float(coalesce_seconds)
        self.items={}
        self.first_at=None

    def add(self,symbol,candle,now=None):
        if now is None:
            now=time.monotonic()
        if self.first_at is None:
            self.first_at=float(now)
        self.items[symbol]=candle

    def ready(self,now=None):
        if not self.items:
            return False
        if now is None:
            now=time.monotonic()
        return float(now)-self.first_at>=self.coalesce_seconds

    def pop_all(self):
        out=self.items
        self.items={}
        self.first_at=None
        return out
