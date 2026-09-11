import test from 'node:test';
import assert from 'node:assert/strict';
import {
  statusLabel,
  activityDate,
  filterByDateRange,
  unsentNewAthEvents,
} from './reporting.js';

test('final trade statuses have concise dashboard labels', () => {
  assert.equal(statusLabel('PENDING_D1'), 'PENDING');
  assert.equal(statusLabel('TRIGGERED'), 'TRIGGERED');
  assert.equal(statusLabel('TARGET_HIT'), 'TARGET');
  assert.equal(statusLabel('STOP_LOSS'), 'SL');
  assert.equal(statusLabel('INVALIDATED'), 'INVALIDATED');
  assert.equal(statusLabel('EXPIRED'), 'EXPIRED');
  assert.equal(statusLabel('AMBIGUOUS'), 'AMBIGUOUS');
  assert.equal(statusLabel('AMBIGUOUS_EXIT'), 'AMBIGUOUS');
});

test('activity date follows the latest lifecycle transition', () => {
  assert.equal(activityDate({ status: 'PENDING_D1', tradingDate: '2026-09-15', statusUpdatedAt: '2026-09-10T17:00:00+05:30' }), '2026-09-15');
  assert.equal(activityDate({ status: 'TRIGGERED', entryTime: '2026-09-15T10:00:00+05:30', tradingDate: '2026-09-15' }), '2026-09-15');
  assert.equal(activityDate({ status: 'INVALIDATED', invalidationTime: '2026-09-15T11:00:00+05:30', tradingDate: '2026-09-15' }), '2026-09-15');
  assert.equal(activityDate({ status: 'STOP_LOSS', exitTime: '2026-09-15T14:20:00+05:30', tradingDate: '2026-09-15' }), '2026-09-15');
});

test('date filters select today, yesterday, week and month by activity date', () => {
  const setups = [
    { id: 'a', status: 'STOP_LOSS', exitTime: '2026-09-15T14:00:00+05:30', tradingDate: '2026-09-15' },
    { id: 'b', status: 'TARGET_HIT', exitTime: '2026-09-14T14:00:00+05:30', tradingDate: '2026-09-14' },
    { id: 'c', status: 'INVALIDATED', invalidationTime: '2026-09-11T10:00:00+05:30', tradingDate: '2026-09-11' },
  ];
  assert.deepEqual(filterByDateRange(setups, 'today', '2026-09-15').map(x => x.id), ['a']);
  assert.deepEqual(filterByDateRange(setups, 'yesterday', '2026-09-15').map(x => x.id), ['b']);
  assert.deepEqual(filterByDateRange(setups, 'current_week', '2026-09-15').map(x => x.id), ['a', 'b']);
  assert.deepEqual(filterByDateRange(setups, 'last_week', '2026-09-15').map(x => x.id), ['c']);
  assert.deepEqual(filterByDateRange(setups, 'custom', '2026-09-15', '2026-09-11', '2026-09-14').map(x => x.id), ['b', 'c']);
});

test('new ATH summary candidates include every unsent event for the selected date', () => {
  const state = {
    athEvents: [
      { id: 'AAA-2026-09-10', symbol: 'AAA', athDate: '2026-09-10', telegramAlertSentAt: null },
      { id: 'BBB-2026-09-10', symbol: 'BBB', athDate: '2026-09-10', telegramAlertSentAt: '2026-09-10T17:01:00+05:30' },
      { id: 'CCC-2026-09-10', symbol: 'CCC', athDate: '2026-09-10', telegramAlertSentAt: null },
      { id: 'DDD-2026-09-11', symbol: 'DDD', athDate: '2026-09-11', telegramAlertSentAt: null },
    ],
  };
  assert.deepEqual(unsentNewAthEvents(state, '2026-09-10').map(x => x.symbol), ['AAA', 'CCC']);
});
