import test from 'node:test';
import assert from 'node:assert/strict';

process.env.KV_REST_API_URL = 'https://test.example';
process.env.KV_REST_API_TOKEN = 'test-token';

const state = {
  trades: [],
  candles: {ABB: [{time: '2026-09-02T09:15:00+05:30'}]},
  updatedAt: '2026-09-02T10:35:19.209Z'
};

const encoded = JSON.stringify(JSON.stringify(JSON.stringify(state)));

global.fetch = async () => ({
  ok: true,
  async json() { return {result: encoded}; }
});

const {readState} = await import('./store.js?multiencode-test');

test('readState normalizes legacy multi-encoded KV state', async () => {
  assert.deepEqual(await readState(), state);
});
