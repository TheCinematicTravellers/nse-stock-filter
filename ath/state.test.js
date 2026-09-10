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
