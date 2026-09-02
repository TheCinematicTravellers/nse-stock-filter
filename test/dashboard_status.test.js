import test from 'node:test';
import assert from 'node:assert/strict';

import {buildStatusSummary} from '../dashboard_status.js';

test('buildStatusSummary reports online state and today\'s counts', () => {
  const state = {
    trades: [
      {status: 'ELIGIBLE'},
      {status: 'ACTIVE'},
      {status: 'TARGET'},
      {status: 'SL'},
      {status: 'INVALIDATED'},
      {status: 'HARD_EXIT'}
    ],
    candles: {ABB: [], SBIN: [], TCS: []},
    updatedAt: '2026-09-02T10:30:00+05:30',
    lastLiveUpdate: '2026-09-02T10:30:00+05:30',
    sessionDate: '2026-09-02'
  };

  assert.deepEqual(buildStatusSummary(state), {
    system: 'ONLINE',
    dataMode: 'LIVE',
    monitored: 3,
    latestCandle: null,
    eligible: 1,
    active: 1,
    target: 1,
    sl: 1,
    invalidated: 1,
    hardExit: 1,
    lastUpdate: state.updatedAt,
    lastLiveUpdate: state.lastLiveUpdate,
    sessionDate: state.sessionDate
  });
});

test('buildStatusSummary reports seeded state when candles exist without live update', () => {
  const state = {
    trades: [],
    candles: {
      ABB: [{time: '2026-09-02T09:15:00+05:30'}],
      SBIN: [{time: '2026-09-02T09:20:00+05:30'}]
    },
    updatedAt: null,
    lastLiveUpdate: null,
    sessionDate: '2026-09-02'
  };

  assert.deepEqual(buildStatusSummary(state), {
    system: 'SEEDED',
    dataMode: 'SEED',
    monitored: 2,
    latestCandle: '2026-09-02T09:20:00+05:30',
    eligible: 0,
    active: 0,
    target: 0,
    sl: 0,
    invalidated: 0,
    hardExit: 0,
    lastUpdate: null,
    lastLiveUpdate: null,
    sessionDate: '2026-09-02'
  });
});

test('buildStatusSummary reports offline when no update or candles exist', () => {
  const state = {trades: [], candles: {}, updatedAt: null, lastLiveUpdate: null, sessionDate: null};

  assert.deepEqual(buildStatusSummary(state), {
    system: 'OFFLINE',
    dataMode: 'NONE',
    monitored: 0,
    latestCandle: null,
    eligible: 0,
    active: 0,
    target: 0,
    sl: 0,
    invalidated: 0,
    hardExit: 0,
    lastUpdate: null,
    lastLiveUpdate: null,
    sessionDate: null
  });
});
