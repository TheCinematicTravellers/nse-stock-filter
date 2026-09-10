import { requireAthSecret } from './auth.js';
import { readAthState, writeAthState } from '../../ath/store.js';

export default async function handler(req, res) {
  try {
    requireAthSecret(req);
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

    const { rows, updatedAt, rebuild } = req.body || {};
    if (rebuild !== true) return res.status(400).json({ error: 'rebuild must be true' });
    if (!Array.isArray(rows) || rows.length === 0) {
      return res.status(400).json({ error: 'rows must be a non-empty array' });
    }

    const state = await readAthState();
    let replaced = 0;

    for (const row of rows) {
      const symbol = String(row?.symbol || '').trim().toUpperCase();
      const adjustedAthPrice = Number(row?.adjustedAthPrice);
      if (!symbol || !Number.isFinite(adjustedAthPrice) || adjustedAthPrice <= 0) continue;

      state.athMaster[symbol] = {
        adjustedAthPrice,
        athDate: row.athDate ?? null,
        source: row.source ?? 'corporate_action_adjusted_yahoo',
        rawReferenceHigh: row.rawReferenceHigh ?? null,
        updatedAt: updatedAt || new Date().toISOString(),
      };
      replaced += 1;
    }

    state.updatedAt = updatedAt || new Date().toISOString();
    await writeAthState(state);

    return res.status(200).json({
      replaced,
      athEvents: state.athEvents.length,
      tradeSetups: state.tradeSetups.length,
      updatedAt: state.updatedAt,
    });
  } catch (error) {
    return res.status(error.statusCode || 500).json({ error: error.message });
  }
}
