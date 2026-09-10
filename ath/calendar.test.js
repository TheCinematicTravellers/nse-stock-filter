import test from 'node:test';
import assert from 'node:assert/strict';
import {
  NSE_2026_HOLIDAYS,
  isTradingDay,
  nextTradingDay,
} from './calendar.js';

test('weekends are not trading days', () => {
  assert.equal(isTradingDay('2026-09-12'), false); // Saturday
  assert.equal(isTradingDay('2026-09-13'), false); // Sunday
});

test('official NSE 2026 holiday is not a trading day', () => {
  assert.equal(NSE_2026_HOLIDAYS.has('2026-09-14'), true);
  assert.equal(isTradingDay('2026-09-14'), false); // Ganesh Chaturthi
});

test('ordinary weekday is a trading day', () => {
  assert.equal(isTradingDay('2026-09-10'), true);
});

test('next trading day skips weekend', () => {
  assert.equal(nextTradingDay('2026-09-10'), '2026-09-11');
});

test('next trading day skips NSE holiday and weekend', () => {
  assert.equal(nextTradingDay('2026-09-11', NSE_2026_HOLIDAYS), '2026-09-15');
});

test('calendar rejects invalid dates', () => {
  assert.throws(() => isTradingDay('not-a-date'), /Invalid date/);
  assert.throws(() => nextTradingDay('not-a-date'), /Invalid date/);
});
