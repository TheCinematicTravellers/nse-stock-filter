import { requireAthSecret } from './auth.js';
import { readAthState, writeAthState } from '../../ath/store.js';

export default async function handler(req, res) {
  try {
    requireAthSecret(req);
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

    const { repairs, rebuild, deleteSymbols } = req.body || {};
    const hasDeleteSymbols = Array.isArray(deleteSymbols);
    if ((!Array.isArray(repairs) || repairs.length === 0) && !hasDeleteSymbols) {
      return res.status(400).json({ error: 'repairs must be a non-empty array or deleteSymbols must be an array' });
    }

    const state = await readAthState();

    if (hasDeleteSymbols) {
      const symbols = [...new Set(deleteSymbols.map((symbol) => String(symbol || '').trim().toUpperCase()).filter(Boolean))];
      const deleted = [];

      for (const symbol of symbols) {
        if (Object.prototype.hasOwnProperty.call(state.athMaster, symbol)) {
          delete state.athMaster[symbol];
          deleted.push(symbol);
        }
      }

      state.updatedAt = new Date().toISOString();
      await writeAthState(state);

      return res.status(200).json({
        deleted,
        deletedCount: deleted.length,
        masterCount: Object.keys(state.athMaster).length,
        athEvents: state.athEvents.length,
        tradeSetups: state.tradeSetups.length,
        updatedAt: state.updatedAt,
      });
    }

    if (rebuild === true) {
      let replaced = 0;

      for (const row of repairs) {
        const symbol = String(row?.symbol || '').trim().toUpperCase();
        const adjustedAthPrice = Number(row?.adjustedAthPrice);
        if (!symbol || !Number.isFinite(adjustedAthPrice) || adjustedAthPrice <= 0) continue;

        state.athMaster[symbol] = {
          adjustedAthPrice,
          athDate: row.athDate ?? null,
          source: row.source ?? 'corporate_action_adjusted_yahoo',
          rawReferenceHigh: row.rawReferenceHigh ?? null,
          updatedAt: new Date().toISOString(),
        };
        replaced += 1;
      }

      state.updatedAt = new Date().toISOString();
      await writeAthState(state);

      return res.status(200).json({
        replaced,
        athEvents: state.athEvents.length,
        tradeSetups: state.tradeSetups.length,
        updatedAt: state.updatedAt,
      });
    }

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
