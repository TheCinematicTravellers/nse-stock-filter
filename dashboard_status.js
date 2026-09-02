function latestCandleTime(candles) {
  let latest = null;
  for (const list of Object.values(candles)) {
    if (!Array.isArray(list)) continue;
    for (const candle of list) {
      const time = candle?.time;
      if (typeof time === 'string' && (!latest || time > latest)) latest = time;
    }
  }
  return latest;
}

export function buildStatusSummary(state = {}) {
  const trades = Array.isArray(state.trades) ? state.trades : [];
  const candles = state.candles && typeof state.candles === 'object' ? state.candles : {};
  const monitored = Object.keys(candles).length;
  const lastLiveUpdate = state.lastLiveUpdate ?? null;
  const latestCandle = latestCandleTime(candles);
  const dataMode = state.dataMode === 'LIVE' || lastLiveUpdate ? 'LIVE' : monitored ? 'SEED' : 'NONE';
  const system = dataMode === 'LIVE' ? 'ONLINE' : dataMode === 'SEED' ? 'SEEDED' : 'OFFLINE';
  const count = status => trades.filter(t => t && t.status === status).length;

  return {
    system,
    dataMode,
    monitored,
    latestCandle,
    eligible: count('ELIGIBLE'),
    active: count('ACTIVE'),
    target: count('TARGET'),
    sl: count('SL'),
    invalidated: count('INVALIDATED'),
    hardExit: count('HARD_EXIT'),
    lastUpdate: state.updatedAt ?? null,
    lastLiveUpdate,
    sessionDate: state.sessionDate ?? null
  };
}
