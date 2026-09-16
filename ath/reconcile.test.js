import test from 'node:test';
import assert from 'node:assert/strict';
import { buildSetup } from './engine.js';
import { reconcileSetup } from './reconcile.js';

test('reconcile marks an old pending setup invalidated when D+1 low breaks first', () => {
  const setup = buildSetup({ id: 'ABC-2026-09-01', symbol: 'ABC', athDate: '2026-09-01', athHigh: 110, athLow: 100, previousAth: 109 }, '2026-09-02');
  const result = reconcileSetup(setup, [
    { time: '2026-09-02T09:20:00+05:30', open: 105, high: 108, low: 99, close: 104 },
  ]);
  assert.equal(result.setup.status, 'INVALIDATED');
  assert.equal(result.changed, true);
});

test('reconcile carries a historical trigger into a later target hit', () => {
  const setup = buildSetup({ id: 'ABC-2026-09-01', symbol: 'ABC', athDate: '2026-09-01', athHigh: 110, athLow: 100, previousAth: 109 }, '2026-09-02');
  const result = reconcileSetup(setup, [
    { time: '2026-09-02T09:20:00+05:30', open: 110, high: 112, low: 108, close: 111 },
    { time: '2026-09-02T09:25:00+05:30', open: 111, high: 121, low: 110, close: 120 },
  ]);
  assert.equal(result.setup.status, 'TARGET_HIT');
  assert.equal(result.setup.actualEntry, 110);
  assert.equal(result.setup.target1R, 120);
  assert.equal(result.setup.resultR, 1);
});

test('reconcile stops on an ambiguous candle instead of guessing', () => {
  const setup = buildSetup({ id: 'ABC-2026-09-01', symbol: 'ABC', athDate: '2026-09-01', athHigh: 110, athLow: 100, previousAth: 109 }, '2026-09-02');
  const result = reconcileSetup(setup, [
    { time: '2026-09-02T09:20:00+05:30', open: 105, high: 111, low: 99, close: 106 },
  ]);
  assert.equal(result.setup.status, 'AMBIGUOUS');
  assert.equal(result.setup.ambiguity, 'HIGH_AND_LOW_BROKEN_SAME_CANDLE');
});

test('reconcile leaves terminal history untouched', () => {
  const setup = { id: 'ABC-2026-09-01-2026-09-02', symbol: 'ABC', status: 'STOP_LOSS', resultR: -1 };
  const result = reconcileSetup(setup, [{ time: '2026-09-03T09:20:00+05:30', open: 100, high: 130, low: 90, close: 120 }]);
  assert.deepEqual(result.setup, setup);
  assert.equal(result.changed, false);
});
