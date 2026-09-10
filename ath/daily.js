import { isNewAth } from './engine.js';
import { normalizeAthState, recordNewAth } from './state.js';

const n = (value) => Number(value);

function isEligible(stock) {
  return stock?.active !== false &&
    String(stock?.securityType ?? 'EQUITY').toUpperCase() === 'EQUITY' &&
    Number.isFinite(n(stock?.currentPrice)) && n(stock.currentPrice) >= 50;
}

export function detectDailyAth(inputState, { date, detectedAt, stocks, dailyBars, nextTradingDate }) {
  let state = normalizeAthState(inputState);
  const newAthSymbols = [];
  const created = [];

  for (const stock of stocks ?? []) {
    if (!isEligible(stock)) continue;
    const symbol = stock.symbol;
    const bar = dailyBars?.[symbol];
    if (!symbol || !bar || String(bar.date) !== String(date)) continue;
    const todayHigh = n(bar.high);
    const todayLow = n(bar.low);
    if (!Number.isFinite(todayHigh) || !Number.isFinite(todayLow)) continue;

    const previousAth = state.athMaster[symbol]?.adjustedAthPrice;
    if (previousAth != null && !isNewAth(todayHigh, previousAth)) continue;
    if (previousAth == null && todayHigh <= 0) continue;

    const tradingDate = nextTradingDate(date);
    const out = recordNewAth(state, {
      symbol,
      athDate: date,
      athHigh: todayHigh,
      athLow: todayLow,
      previousAth: previousAth ?? 0,
      tradingDate,
      detectedAt,
      source: 'adjusted_historical',
      rawReferenceHigh: todayHigh,
    });
    state = out.state;
    if (out.created) {
      newAthSymbols.push(symbol);
      created.push(out);
    }
  }

  state.updatedAt = detectedAt ?? state.updatedAt;
  return { state, newAthSymbols, created };
}
