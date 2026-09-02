export function buildStatusSummary(state = {}) {
  const trades = Array.isArray(state.trades) ? state.trades : [];
  const candles = state.candles && typeof state.candles === 'object' ? state.candles : {};

  const count = status => trades.filter(t => t && t.status === status).length;

  return {
    system: state.updatedAt ? 'ONLINE' : 'OFFLINE',
    monitored: Object.keys(candles).length,
    eligible: count('ELIGIBLE'),
    active: count('ACTIVE'),
    target: count('TARGET'),
    sl: count('SL'),
    invalidated: count('INVALIDATED'),
    hardExit: count('HARD_EXIT'),
    lastUpdate: state.updatedAt ?? null,
    sessionDate: state.sessionDate ?? null
  };
}
