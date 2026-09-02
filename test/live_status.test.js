import test from 'node:test';
import assert from 'node:assert/strict';

import {processCandle} from '../api/strategy-server.js';

const candle = time => ({time, open: 100, high: 101, low: 99, close: 100});

test('seed ingest updates data timestamp but not live timestamp', async () => {
  const state = {};
  const out = await processCandle(state, 'ABB', candle('2026-09-02T09:15:00+05:30'), {seed: true});

  assert.equal(out.state.lastLiveUpdate, undefined);
  assert.equal(out.state.updatedAt !== undefined, true);
});

test('live ingest records a separate live timestamp', async () => {
  const state = {};
  const out = await processCandle(state, 'ABB', candle('2026-09-02T09:20:00+05:30'), {seed: false});

  assert.equal(typeof out.state.lastLiveUpdate, 'string');
  assert.equal(typeof out.state.updatedAt, 'string');
});
