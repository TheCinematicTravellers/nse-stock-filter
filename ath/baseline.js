import { normalizeAthState } from './state.js';

const n = (value) => Number(value);

export function seedAthBaseline(inputState, rows, updatedAt = null) {
  const state = normalizeAthState(inputState);
  let initialized = 0;

  for (const row of rows ?? []) {
    const symbol = row?.symbol;
    const ath = n(row?.adjustedAthPrice);
    if (!symbol || !Number.isFinite(ath) || ath <= 0) continue;

    const existing = state.athMaster[symbol];
    if (existing && Number(existing.adjustedAthPrice) >= ath) continue;

    state.athMaster[symbol] = {
      adjustedAthPrice: ath,
      athDate: row.athDate ?? null,
      source: row.source ?? 'adjusted_historical',
      rawReferenceHigh: row.rawReferenceHigh ?? null,
      updatedAt,
    };
    initialized += 1;
  }

  state.updatedAt = updatedAt ?? state.updatedAt;
  return { state, initialized };
}
