import { requireAthSecret } from './auth.js';
import { readAthState, writeAthState } from '../../ath/store.js';
import { applyD1Tick, expireD1 } from '../../ath/engine.js';
import { applyExitTick } from '../../ath/exits.js';
import { formatTradeAlert, sendOnce } from '../../ath/telegram.js';

function transitionAlertKey(setup) {
  return `TRADE:${setup.id}:${setup.status}`;
}

export default async function handler(req, res) {
  try {
    requireAthSecret(req);
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
    const { candlesBySymbol, expireDate, updatedAt } = req.body || {};
    if (!candlesBySymbol || typeof candlesBySymbol !== 'object') {
      return res.status(400).json({ error: 'candlesBySymbol is required' });
    }

    let state = await readAthState();
    const transitions = [];

    for (let i = 0; i < state.tradeSetups.length; i += 1) {
      let setup = state.tradeSetups[i];
      const candle = candlesBySymbol[setup.symbol];
      if (candle) {
        if (setup.status === 'PENDING_D1') setup = applyD1Tick(setup, candle);
        else if (setup.status === 'TRIGGERED') setup = applyExitTick(setup, candle);
      }
      if (expireDate && setup.status === 'PENDING_D1') setup = expireD1(setup, expireDate);

      if (setup.status !== state.tradeSetups[i].status) {
        state.tradeSetups[i] = setup;
        const alert = await sendOnce(state, transitionAlertKey(setup), formatTradeAlert(setup), updatedAt);
        state = alert.state;
        transitions.push({ setupId: setup.id, symbol: setup.symbol, status: setup.status, sent: alert.sent, duplicate: alert.duplicate });
      }
    }

    state.updatedAt = updatedAt || new Date().toISOString();
    await writeAthState(state);
    return res.status(200).json({ transitions, updatedAt: state.updatedAt });
  } catch (error) {
    return res.status(error.statusCode || 500).json({ error: error.message });
  }
}
