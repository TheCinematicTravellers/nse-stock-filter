const n = (value) => Number(value);
const round = (value) => Number(n(value).toFixed(4));

export function applyExitTick(trade, candle) {
  if (trade.status !== 'TRIGGERED') return trade;
  if (String(candle.time) <= String(trade.entryTime)) return trade;

  const high = n(candle.high);
  const low = n(candle.low);
  const stop = n(trade.setupLow);
  const target = n(trade.target1R);

  const targetHit = high >= target;
  const stopHit = low <= stop;

  if (targetHit && stopHit) {
    return {
      ...trade,
      status: 'AMBIGUOUS_EXIT',
      ambiguity: 'TARGET_AND_STOP_SAME_CANDLE',
    };
  }

  if (stopHit) {
    return {
      ...trade,
      status: 'STOP_LOSS',
      exitPrice: round(stop),
      exitTime: candle.time,
      resultR: -1,
    };
  }

  if (targetHit) {
    return {
      ...trade,
      status: 'TARGET_HIT',
      exitPrice: round(target),
      exitTime: candle.time,
      resultR: 1,
    };
  }

  return trade;
}
