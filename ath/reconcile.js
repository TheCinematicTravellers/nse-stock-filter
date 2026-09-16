import { applyD1Tick } from './engine.js';
import { applyExitTick } from './exits.js';

const TERMINAL = new Set(['TARGET_HIT', 'STOP_LOSS', 'INVALIDATED', 'AMBIGUOUS', 'AMBIGUOUS_EXIT']);

export function reconcileSetup(setup, candles) {
  if (!setup || TERMINAL.has(setup.status)) return { setup, changed: false };

  let current = { ...setup };
  const ordered = [...(candles ?? [])].sort((a, b) => String(a.time).localeCompare(String(b.time)));

  for (const candle of ordered) {
    const before = current.status;
    if (current.status === 'PENDING_D1') current = applyD1Tick(current, candle);
    else if (current.status === 'TRIGGERED') current = applyExitTick(current, candle);
    if (current.status === 'AMBIGUOUS' || current.status === 'AMBIGUOUS_EXIT') break;
    if (current.status === 'INVALIDATED' || current.status === 'STOP_LOSS' || current.status === 'TARGET_HIT') break;
    if (before === current.status && current.status === 'PENDING_D1' && String(candle.time).slice(0, 10) > String(current.tradingDate)) {
      continue;
    }
  }

  return { setup: current, changed: current.status !== setup.status };
}
