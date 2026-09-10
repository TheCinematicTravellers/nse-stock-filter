import test from 'node:test';
import assert from 'node:assert/strict';
import { applyExitTick } from './exits.js';

const openTrade = {
  status: 'TRIGGERED',
  actualEntry: 125,
  setupLow: 118,
  target1R: 132,
  entryTime: '2026-09-11T10:00:00+05:30',
  quantity: 800,
};

test('target hit closes trade at target and records +1R', () => {
  const out = applyExitTick(openTrade, {
    time: '2026-09-11T11:00:00+05:30', open: 129, high: 132.1, low: 128, close: 131,
  });
  assert.equal(out.status, 'TARGET_HIT');
  assert.equal(out.exitPrice, 132);
  assert.equal(out.resultR, 1);
});

test('stop hit closes trade and records negative R', () => {
  const out = applyExitTick(openTrade, {
    time: '2026-09-11T11:00:00+05:30', open: 124, high: 126, low: 117.9, close: 119,
  });
  assert.equal(out.status, 'STOP_LOSS');
  assert.equal(out.exitPrice, 118);
  assert.equal(out.resultR, -1);
});

test('same candle target and stop is ambiguous', () => {
  const out = applyExitTick(openTrade, {
    time: '2026-09-11T11:00:00+05:30', open: 125, high: 133, low: 117, close: 125,
  });
  assert.equal(out.status, 'AMBIGUOUS_EXIT');
  assert.equal(out.ambiguity, 'TARGET_AND_STOP_SAME_CANDLE');
});

test('triggered trade ignores candles before entry', () => {
  const out = applyExitTick(openTrade, {
    time: '2026-09-11T09:30:00+05:30', open: 124, high: 133, low: 117, close: 120,
  });
  assert.equal(out.status, 'TRIGGERED');
});
