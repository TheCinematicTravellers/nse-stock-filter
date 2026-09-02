import test from 'node:test';
import assert from 'node:assert/strict';

// Contract tests for the dashboard status summary.
// The current dashboard does not expose this function yet, so these tests
// intentionally fail until the dashboard implementation is added.
import {buildStatusSummary} from '../dashboard_status.js';

test('buildStatusSummary reports online state and today's counts', () => {
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
    sessionDate: '2026-09-02'
  };

  assert.deepEqual(buildStatusSummary(state), {
    system: 'ONLINE',
    monitored: 3,
    eligible: 1,
    active: 1,
    target: 1,
    sl: 1,
    invalidated: 1,
    hardExit: 1,
    lastUpdate: state.updatedAt,
    sessionDate: state.sessionDate
  });
});

test('buildStatusSummary reports offline when no update exists', () => {
  const state = {trades: [], candles: {}, updatedAt: null, sessionDate: null};

  assert.deepEqual(buildStatusSummary(state), {
    system: 'OFFLINE',
    monitored: 0,
    eligible: 0,
    active: 0,
    target: 0,
    sl: 0,
    invalidated: 0,
    hardExit: 0,
    lastUpdate: null,
    sessionDate: null
  });
});
