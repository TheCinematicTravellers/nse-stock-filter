import { isNewAth } from './engine.js';
import { normalizeAthState, recordNewAth } from './state.js';

const n = (value) => Number(value);

function isEligible(stock) {
  return stock?.active !== false &&
    String(stock?.securityType ?? 'EQUITY').toUpperCase() === 'EQUITY' &&
    Number.isFinite(n(stock?.currentPrice));
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
    if (previousAth == null) continue;
    if (!isNewAth(todayHigh, previousAth)) continue;

    const tradingDate = nextTradingDate(date);
    if (!tradingDate) throw new Error(`nextTradingDate returned no date for ${date}`);
    const out = recordNewAth(state, {
      symbol,
      athDate: date,
      athHigh: todayHigh,
      athLow: todayLow,
      previousAth,
      tradingDate,
      detectedAt,
      source: 'forward_daily',
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
