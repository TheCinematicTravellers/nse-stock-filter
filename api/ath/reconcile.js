import { requireAthSecret } from './auth.js';
import { readAthState, writeAthState } from '../../ath/store.js';

const TERMINAL = new Set(['TARGET_HIT', 'STOP_LOSS', 'INVALIDATED', 'AMBIGUOUS', 'AMBIGUOUS_EXIT']);
const ALLOWED = new Set([
  'status', 'actualEntry', 'quantity', 'deployedCapital', 'riskPerShare', 'riskAmount',
  'target1R', 'entryReason', 'entryTime', 'invalidationTime', 'exitTime', 'exitPrice',
  'resultR', 'ambiguity', 'statusUpdatedAt', 'updatedAt',
]);

export default async function handler(req, res) {
  try {
    requireAthSecret(req);
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

    const { repairs, confirm } = req.body || {};
    if (confirm !== 'ATH_RECONCILE_2026') return res.status(400).json({ error: 'Missing reconciliation confirmation' });
    if (!Array.isArray(repairs) || repairs.length === 0) return res.status(400).json({ error: 'repairs must be a non-empty array' });

    const state = await readAthState();
    const byId = new Map(state.tradeSetups.map((setup, index) => [setup.id, { setup, index }]));
    const changed = [];

    for (const repair of repairs) {
      const id = String(repair?.id || '');
      const found = byId.get(id);
      if (!found) return res.status(400).json({ error: `Unknown setup id: ${id}` });

      const before = found.setup;
      const nextStatus = String(repair?.status || before.status);
      if (!TERMINAL.has(nextStatus) && nextStatus !== 'TRIGGERED' && nextStatus !== 'PENDING_D1') {
        return res.status(400).json({ error: `Invalid status for ${id}: ${nextStatus}` });
      }

      const patch = {};
      for (const [key, value] of Object.entries(repair)) {
        if (key !== 'id' && ALLOWED.has(key)) patch[key] = value;
      }
      patch.status = nextStatus;
      state.tradeSetups[found.index] = { ...before, ...patch };
      changed.push({ id, symbol: before.symbol, from: before.status, to: nextStatus });
    }

    state.updatedAt = new Date().toISOString();
    await writeAthState(state);
    return res.status(200).json({ changed, changedCount: changed.length, updatedAt: state.updatedAt });
  } catch (error) {
    return res.status(error.statusCode || 500).json({ error: error.message });
  }
}
