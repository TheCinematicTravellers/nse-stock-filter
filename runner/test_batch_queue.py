import unittest
from batch_queue import BatchAccumulator

class BatchAccumulatorTests(unittest.TestCase):
    def test_coalesces_completed_candles_by_symbol(self):
        q=BatchAccumulator()
        q.add('AAA',{'time':'2026-09-04T10:00:00+05:30','close':100})
        q.add('BBB',{'time':'2026-09-04T10:00:00+05:30','close':200})
        q.add('AAA',{'time':'2026-09-04T10:05:00+05:30','close':101})
        batch=q.pop_all()
        self.assertEqual(batch,{
            'AAA':{'time':'2026-09-04T10:05:00+05:30','close':101},
            'BBB':{'time':'2026-09-04T10:00:00+05:30','close':200},
        })
        self.assertEqual(q.pop_all(),{})

    def test_flush_flag_waits_for_coalesce_window(self):
        q=BatchAccumulator(coalesce_seconds=1.0)
        q.add('AAA',{'time':'2026-09-04T10:00:00+05:30','close':100},now=10.0)
        self.assertFalse(q.ready(now=10.5))
        self.assertTrue(q.ready(now=11.0))

    def test_default_coalesce_window_is_latency_friendly(self):
        q=BatchAccumulator()
        self.assertLessEqual(q.coalesce_seconds,0.25)

if __name__=='__main__':
    unittest.main()
