export const BASE_CAPITAL = 100000;

const n = (value) => Number(value);
const round = (value) => Number(n(value).toFixed(4));
const transition = (setup, patch, time) => ({
  ...setup,
  ...patch,
  statusUpdatedAt: time ?? setup.statusUpdatedAt ?? null,
  updatedAt: time ?? setup.updatedAt ?? null,
});

export function isNewAth(todayHigh, storedAth) {
  return n(todayHigh) > n(storedAth);
}

export function buildAthEvent(symbol, athDate, athHigh, athLow, previousAth) {
  return {
    id: `${symbol}-${athDate}`,
    symbol,
    athDate,
    athHigh: round(athHigh),
    athLow: round(athLow),
    previousAth: round(previousAth),
  };
}

export function quantityForCapital(capital, entry) {
  if (!(entry > 0)) return 0;
  return Math.floor(n(capital) / n(entry));
}

export function buildSetup(event, tradingDate) {
  const plannedEntry = n(event.athHigh);
  const riskPerShare = n(event.athHigh) - n(event.athLow);
  const quantity = quantityForCapital(BASE_CAPITAL, plannedEntry);
  return {
    id: `${event.id}-${tradingDate}`,
    athEventId: event.id,
    symbol: event.symbol,
    setupDate: event.athDate,
    tradingDate,
    setupHigh: round(event.athHigh),
    setupLow: round(event.athLow),
    plannedEntry: round(plannedEntry),
    actualEntry: null,
    baseCapital: BASE_CAPITAL,
    quantity,
    deployedCapital: round(quantity * plannedEntry),
    riskPerShare: round(riskPerShare),
    riskAmount: round(quantity * riskPerShare),
    target1R: round(plannedEntry + riskPerShare),
    status: 'PENDING_D1',
    statusUpdatedAt: event.detectedAt ?? null,
    updatedAt: event.detectedAt ?? null,
    entryReason: null,
    entryTime: null,
    invalidationTime: null,
    exitTime: null,
    exitPrice: null,
    resultR: null,
    ambiguity: null,
  };
}

export function applyD1Tick(setup, candle) {
  if (!['PENDING_D1'].includes(setup.status)) return setup;
  const high = n(candle.high);
  const low = n(candle.low);
  const open = n(candle.open);
  const date = String(candle.time).slice(0, 10);
  if (date !== setup.tradingDate) return setup;

  const highBroken = high > setup.setupHigh;
  const lowBroken = low < setup.setupLow;
  if (highBroken && lowBroken) {
    return transition(setup, {
      status: 'AMBIGUOUS',
      ambiguity: 'HIGH_AND_LOW_BROKEN_SAME_CANDLE',
    }, candle.time);
  }
  if (lowBroken) {
    return transition(setup, {
      status: 'INVALIDATED',
      invalidationTime: candle.time,
    }, candle.time);
  }
  if (highBroken || open > setup.setupHigh) {
    const actualEntry = open > setup.setupHigh ? open : setup.setupHigh;
    const riskPerShare = actualEntry - setup.setupLow;
    const quantity = quantityForCapital(BASE_CAPITAL, actualEntry);
    return transition(setup, {
      status: 'TRIGGERED',
      actualEntry: round(actualEntry),
      quantity,
      deployedCapital: round(quantity * actualEntry),
      riskPerShare: round(riskPerShare),
      riskAmount: round(quantity * riskPerShare),
      target1R: round(actualEntry + riskPerShare),
      entryReason: open > setup.setupHigh ? 'GAP_UP_OPEN' : 'HIGH_BREAK',
      entryTime: candle.time,
    }, candle.time);
  }
  return setup;
}

export function expireD1(setup, tradingDate, updatedAt = null) {
  if (setup.status !== 'PENDING_D1' || setup.tradingDate !== tradingDate) return setup;
  return transition(setup, { status: 'EXPIRED' }, updatedAt);
}
