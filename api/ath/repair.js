import { requireAthSecret } from './auth.js';
import { readAthState, writeAthState } from '../../ath/store.js';

export default async function handler(req, res) {
  try {
    requireAthSecret(req);
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

    const { repairs } = req.body || {};
    if (!Array.isArray(repairs) || repairs.length === 0) {
      return res.status(400).json({ error: 'repairs must be a non-empty array' });
    }

    const state = await readAthState();
    const repaired = [];

    for (const repair of repairs) {
      const symbol = String(repair?.symbol || '').trim().toUpperCase();
      const eventDate = String(repair?.eventDate || '').trim();
      const adjustedAthPrice = Number(repair?.adjustedAthPrice);
      const athDate = String(repair?.athDate || '').trim();

      if (!symbol || !eventDate || !Number.isFinite(adjustedAthPrice) || !athDate) {
        return res.status(400).json({ error: `Invalid repair for ${symbol || 'unknown symbol'}` });
      }

      const beforeEvents = state.athEvents.length;
      state.athEvents = state.athEvents.filter(
        (event) => !(event.symbol === symbol && event.athDate === eventDate),
      );

      const beforeSetups = state.tradeSetups.length;
      state.tradeSetups = state.tradeSetups.filter(
        (setup) => !(setup.symbol === symbol && setup.athDate === eventDate),
      );

      if (state.alertLedger && typeof state.alertLedger === 'object') {
        for (const key of Object.keys(state.alertLedger)) {
          if (key.includes(symbol) && key.includes(eventDate)) delete state.alertLedger[key];
        }
      }

      state.athMaster[symbol] = {
        adjustedAthPrice,
        athDate,
        source: String(repair.source || 'corporate_action_adjusted_manual_repair'),
        rawReferenceHigh: repair.rawReferenceHigh ?? null,
        updatedAt: new Date().toISOString(),
      };

      repaired.push({
        symbol,
        removedEvents: beforeEvents - state.athEvents.length,
        removedSetups: beforeSetups - state.tradeSetups.length,
        athMaster: state.athMaster[symbol],
      });
    }

    state.updatedAt = new Date().toISOString();
    await writeAthState(state);
    return res.status(200).json({ repaired });
  } catch (error) {
    return res.status(error.statusCode || 500).json({ error: error.message });
  }
}
