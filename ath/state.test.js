import test from 'node:test';
import assert from 'node:assert/strict';

import { createAthState, recordNewAth } from './state.js';

test('createAthState is isolated from inside50 state and keeps immutable ledgers', () => {
  const state = createAthState();
  assert.deepEqual(state, {
    stocks: {},
    athMaster: {},
    athEvents: [],
    tradeSetups: [],
    alertLedger: {},
    updatedAt: null,
  });
});

test('recordNewAth creates one immutable event and D+1 setup', () => {
  const state = createAthState();
  const out = recordNewAth(state, {
    symbol: 'ABC',
    athDate: '2026-09-10',
    athHigh: 120,
    athLow: 110,
    previousAth: 115,
    tradingDate: '2026-09-11',
    detectedAt: '2026-09-10T17:05:00+05:30',
  });

  assert.equal(out.state.athEvents.length, 1);
  assert.equal(out.state.tradeSetups.length, 1);
  assert.equal(out.state.athMaster.ABC.adjustedAthPrice, 120);
  assert.equal(out.state.athEvents[0].id, 'ABC-2026-09-10');
  assert.equal(out.state.tradeSetups[0].id, 'ABC-2026-09-10-2026-09-11');
  assert.equal(out.created, true);
});

test('recordNewAth is idempotent on rerun and does not duplicate Telegram ledger entries', () => {
  const first = recordNewAth(createAthState(), {
    symbol: 'ABC', athDate: '2026-09-10', athHigh: 120, athLow: 110,
    previousAth: 115, tradingDate: '2026-09-11', detectedAt: '2026-09-10T17:05:00+05:30'
  });
  const second = recordNewAth(first.state, {
    symbol: 'ABC', athDate: '2026-09-10', athHigh: 120, athLow: 110,
    previousAth: 115, tradingDate: '2026-09-11', detectedAt: '2026-09-10T17:06:00+05:30'
  });

  assert.equal(second.created, false);
  assert.equal(second.state.athEvents.length, 1);
  assert.equal(second.state.tradeSetups.length, 1);
});

test('invalidated setup becomes eligible again only when a fresh ATH event occurs', () => {
  const first = recordNewAth(createAthState(), {
    symbol: 'ABC', athDate: '2026-09-10', athHigh: 120, athLow: 110,
    previousAth: 115, tradingDate: '2026-09-11', detectedAt: '2026-09-10T17:05:00+05:30'
  });
  first.state.tradeSetups[0].status = 'INVALIDATED';

  const retry = recordNewAth(first.state, {
    symbol: 'ABC', athDate: '2026-09-15', athHigh: 130, athLow: 118,
    previousAth: 120, tradingDate: '2026-09-16', detectedAt: '2026-09-15T16:05:00+05:30'
  });

  assert.equal(retry.created, true);
  assert.equal(retry.state.athEvents.length, 2);
  assert.equal(retry.state.tradeSetups.length, 2);
  assert.equal(retry.state.tradeSetups[0].status, 'INVALIDATED');
  assert.equal(retry.state.tradeSetups[1].athEventId, 'ABC-2026-09-15');
});

test('active setup blocks duplicate setup creation even when a new ATH event is detected', () => {
  const first = recordNewAth(createAthState(), {
    symbol: 'ABC', athDate: '2026-09-10', athHigh: 120, athLow: 110,
    previousAth: 115, tradingDate: '2026-09-11', detectedAt: '2026-09-10T17:05:00+05:30'
  });

  const second = recordNewAth(first.state, {
    symbol: 'ABC', athDate: '2026-09-15', athHigh: 130, athLow: 118,
    previousAth: 120, tradingDate: '2026-09-16', detectedAt: '2026-09-15T16:05:00+05:30'
  });

  assert.equal(second.created, false);
  assert.equal(second.skippedReason, 'ACTIVE_SETUP_EXISTS');
  assert.equal(second.state.athEvents.length, 2);
  assert.equal(second.state.tradeSetups.length, 1);
});

test('completed setup history is preserved and does not duplicate without a fresh ATH event', () => {
  const first = recordNewAth(createAthState(), {
    symbol: 'ABC', athDate: '2026-09-10', athHigh: 120, athLow: 110,
    previousAth: 115, tradingDate: '2026-09-11', detectedAt: '2026-09-10T17:05:00+05:30'
  });
  first.state.tradeSetups[0].status = 'TARGET_HIT';

  const rerun = recordNewAth(first.state, {
    symbol: 'ABC', athDate: '2026-09-10', athHigh: 120, athLow: 110,
    previousAth: 115, tradingDate: '2026-09-11', detectedAt: '2026-09-16T16:05:00+05:30'
  });

  assert.equal(rerun.created, false);
  assert.equal(rerun.state.athEvents.length, 1);
  assert.equal(rerun.state.tradeSetups.length, 1);
  assert.equal(rerun.state.tradeSetups[0].status, 'TARGET_HIT');
});
