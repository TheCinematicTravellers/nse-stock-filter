import test from 'node:test';
import assert from 'node:assert/strict';

import { createAthState } from './state.js';
import { seedAthBaseline } from './baseline.js';

test('baseline seed initializes missing ATHs without creating trade setups or alerts', () => {
  const result = seedAthBaseline(createAthState(), [
    { symbol: 'ABC', adjustedAthPrice: 120, athDate: '2026-09-09', source: 'adjusted_historical' },
  ], '2026-09-10T12:00:00+05:30');
  assert.equal(result.state.athMaster.ABC.adjustedAthPrice, 120);
  assert.equal(result.state.athEvents.length, 0);
  assert.equal(result.initialized, 1);
});

test('baseline seed does not overwrite a newer forward ATH', () => {
  const state = createAthState();
  state.athMaster.ABC = { adjustedAthPrice: 125, athDate: '2026-09-10', source: 'forward_daily' };
  const result = seedAthBaseline(state, [
    { symbol: 'ABC', adjustedAthPrice: 120, athDate: '2026-09-09', source: 'adjusted_historical' },
  ], '2026-09-10T17:00:00+05:30');
  assert.equal(result.state.athMaster.ABC.adjustedAthPrice, 125);
  assert.equal(result.initialized, 0);
});
