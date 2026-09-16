import test from 'node:test';
import assert from 'node:assert/strict';
import {
  isNewAth,
  buildAthEvent,
  buildSetup,
  applyD1Tick,
  expireD1,
  quantityForCapital,
} from './engine.js';
import { createAthState } from './state.js';
import { detectDailyAth } from './daily.js';

test('equal high is not a new ATH', () => {
  assert.equal(isNewAth(100, 100), false);
});

test('strictly higher high is a new ATH', () => {
  assert.equal(isNewAth(100.01, 100), true);
});

test('ATH event is immutable and setup uses ATH day high/low', () => {
  const event = buildAthEvent('ABC', '2026-09-10', 125, 118, 120);
  assert.deepEqual(event, {
    id: 'ABC-2026-09-10', symbol: 'ABC', athDate: '2026-09-10', athHigh: 125,
    athLow: 118, previousAth: 120,
  });
  const setup = buildSetup(event, '2026-09-11');
  assert.equal(setup.setupHigh, 125);
  assert.equal(setup.setupLow, 118);
  assert.equal(setup.plannedEntry, 125);
  assert.equal(setup.quantity, 800);
  assert.equal(setup.deployedCapital, 100000);
  assert.equal(setup.target1R, 132);
});

test('quantity rounds down from fixed one lakh capital', () => {
  assert.equal(quantityForCapital(100000, 1110), 90);
  assert.equal(quantityForCapital(100000, 1100.5), 90);
});

test('gap-up enters at actual open', () => {
  const setup = buildSetup(buildAthEvent('ABC', '2026-09-10', 125, 118, 120), '2026-09-11');
  const next = applyD1Tick(setup, { time: '2026-09-11T09:15:00+05:30', open: 128, high: 128, low: 127, close: 127.5 });
  assert.equal(next.status, 'TRIGGERED');
  assert.equal(next.actualEntry, 128);
  assert.equal(next.entryReason, 'GAP_UP_OPEN');
});

test('low-first invalidates and later high cannot trigger', () => {
  const setup = buildSetup(buildAthEvent('ABC', '2026-09-10', 125, 118, 120), '2026-09-11');
  const invalid = applyD1Tick(setup, { time: '2026-09-11T10:00:00+05:30', open: 123, high: 124, low: 117.9, close: 123 });
  assert.equal(invalid.status, 'INVALIDATED');
  const later = applyD1Tick(invalid, { time: '2026-09-11T11:00:00+05:30', open: 123, high: 126, low: 122, close: 125 });
  assert.equal(later.status, 'INVALIDATED');
});

test('normal high break triggers at setup high', () => {
  const setup = buildSetup(buildAthEvent('ABC', '2026-09-10', 125, 118, 120), '2026-09-11');
  const next = applyD1Tick(setup, { time: '2026-09-11T10:00:00+05:30', open: 124, high: 125.1, low: 123, close: 125 });
  assert.equal(next.status, 'TRIGGERED');
  assert.equal(next.actualEntry, 125);
});

test('pending setup does not expire merely because D+1 session ended', () => {
  const setup = buildSetup(buildAthEvent('ABC', '2026-09-10', 125, 118, 120), '2026-09-11');
  const unchanged = applyD1Tick(setup, { time: '2026-09-11T15:30:00+05:30', open: 121, high: 124.9, low: 118.1, close: 123 });
  const next = expireD1(unchanged, '2026-09-11');
  assert.equal(next.status, 'PENDING_D1');
});

test('new day creates a fresh setup after a prior setup was invalidated', () => {
  const state = createAthState();
  state.athMaster.ABC = { adjustedAthPrice: 100, athDate: '2026-09-14' };
  state.athEvents.push(buildAthEvent('ABC', '2026-09-14', 100, 95, 99));
  const prior = buildSetup(state.athEvents[0], '2026-09-15');
  prior.status = 'INVALIDATED';
  state.tradeSetups.push(prior);

  const result = detectDailyAth(state, {
    date: '2026-09-15',
    detectedAt: '2026-09-15T17:05:00+05:30',
    stocks: [{ symbol: 'ABC', active: true, securityType: 'EQUITY', currentPrice: 101 }],
    dailyBars: { ABC: { date: '2026-09-15', high: 101, low: 97 } },
    nextTradingDate: () => '2026-09-16',
  });

  assert.equal(result.created.length, 1);
  assert.equal(result.created[0].setup.tradingDate, '2026-09-16');
  assert.equal(result.state.tradeSetups.length, 2);
});

test('new day does not add a second setup when an existing setup is active', () => {
  const state = createAthState();
  state.athMaster.XYZ = { adjustedAthPrice: 100, athDate: '2026-09-14' };
  state.athEvents.push(buildAthEvent('XYZ', '2026-09-14', 100, 95, 99));
  const prior = buildSetup(state.athEvents[0], '2026-09-15');
  prior.status = 'TRIGGERED';
  state.tradeSetups.push(prior);

  const result = detectDailyAth(state, {
    date: '2026-09-15',
    detectedAt: '2026-09-15T17:05:00+05:30',
    stocks: [{ symbol: 'XYZ', active: true, securityType: 'EQUITY', currentPrice: 101 }],
    dailyBars: { XYZ: { date: '2026-09-15', high: 101, low: 97 } },
    nextTradingDate: () => '2026-09-16',
  });

  assert.equal(result.created.length, 0);
  assert.equal(result.newAthSymbols.length, 0);
  assert.equal(result.state.tradeSetups.length, 1);
});

test('same-candle D+1 high and low is explicitly ambiguous', () => {
  const setup = buildSetup(buildAthEvent('ABC', '2026-09-10', 125, 118, 120), '2026-09-11');
  const next = applyD1Tick(setup, { time: '2026-09-11T10:00:00+05:30', open: 123, high: 126, low: 117, close: 123 });
  assert.equal(next.status, 'AMBIGUOUS');
  assert.equal(next.ambiguity, 'HIGH_AND_LOW_BROKEN_SAME_CANDLE');
});
