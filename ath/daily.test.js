import test from 'node:test';
import assert from 'node:assert/strict';

import { createAthState } from './state.js';
import { detectDailyAth } from './daily.js';

test('daily detector includes all priced equities regardless of price', () => {
  const state = createAthState();
  state.athMaster.HIGH = { adjustedAthPrice: 100, athDate: '2026-09-01' };
  state.athMaster.LOW = { adjustedAthPrice: 900, athDate: '2026-09-01' };
  const result = detectDailyAth(state, {
    date: '2026-09-10',
    detectedAt: '2026-09-10T17:05:00+05:30',
    stocks: [
      { symbol: 'HIGH', securityType: 'EQUITY', currentPrice: 100, active: true },
      { symbol: 'LOW', securityType: 'EQUITY', currentPrice: 49.99, active: true },
      { symbol: 'ETF', securityType: 'ETF', currentPrice: 200, active: true },
    ],
    dailyBars: {
      HIGH: { date: '2026-09-10', high: 120, low: 110 },
      LOW: { date: '2026-09-10', high: 999, low: 900 },
      ETF: { date: '2026-09-10', high: 999, low: 900 },
    },
    nextTradingDate: () => '2026-09-11',
  });

  assert.deepEqual(result.newAthSymbols, ['HIGH', 'LOW']);
  assert.equal(result.state.athEvents.length, 2);
});

test('equal high does not create an ATH event', () => {
  const state = createAthState();
  state.athMaster.ABC = { adjustedAthPrice: 120, athDate: '2026-09-01' };
  const result = detectDailyAth(state, {
    date: '2026-09-10', detectedAt: '2026-09-10T17:05:00+05:30',
    stocks: [{ symbol: 'ABC', securityType: 'EQUITY', currentPrice: 125, active: true }],
    dailyBars: { ABC: { date: '2026-09-10', high: 120, low: 115 } },
    nextTradingDate: () => '2026-09-11',
  });
  assert.deepEqual(result.newAthSymbols, []);
  assert.equal(result.state.athEvents.length, 0);
});

test('higher high creates a fresh immutable ATH event and setup', () => {
  const state = createAthState();
  state.athMaster.ABC = { adjustedAthPrice: 120, athDate: '2026-09-01' };
  const result = detectDailyAth(state, {
    date: '2026-09-10', detectedAt: '2026-09-10T17:05:00+05:30',
    stocks: [{ symbol: 'ABC', securityType: 'EQUITY', currentPrice: 125, active: true }],
    dailyBars: { ABC: { date: '2026-09-10', high: 125, low: 118 } },
    nextTradingDate: () => '2026-09-11',
  });
  assert.deepEqual(result.newAthSymbols, ['ABC']);
  assert.equal(result.state.athEvents[0].previousAth, 120);
  assert.equal(result.state.tradeSetups[0].tradingDate, '2026-09-11');
});
