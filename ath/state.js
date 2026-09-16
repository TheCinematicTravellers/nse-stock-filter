import { buildAthEvent, buildSetup } from './engine.js';

export const createAthState = () => ({
  stocks: {},
  athMaster: {},
  athEvents: [],
  tradeSetups: [],
  alertLedger: {},
  updatedAt: null,
});

const clone = (value) => JSON.parse(JSON.stringify(value));

const ACTIVE_SETUP_STATUSES = new Set([
  'PENDING_D1',
  'TRIGGERED',
  'AMBIGUOUS',
  'AMBIGUOUS_EXIT',
]);

export function normalizeAthState(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return createAthState();
  const base = createAthState();
  return {
    ...base,
    ...clone(input),
    stocks: input.stocks && typeof input.stocks === 'object' ? clone(input.stocks) : {},
    athMaster: input.athMaster && typeof input.athMaster === 'object' ? clone(input.athMaster) : {},
    athEvents: Array.isArray(input.athEvents) ? clone(input.athEvents) : [],
    tradeSetups: Array.isArray(input.tradeSetups) ? clone(input.tradeSetups) : [],
    alertLedger: input.alertLedger && typeof input.alertLedger === 'object' ? clone(input.alertLedger) : {},
  };
}

export function hasActiveSetup(state, symbol) {
  return state.tradeSetups.some((setup) => (
    setup.symbol === symbol && ACTIVE_SETUP_STATUSES.has(setup.status)
  ));
}

export function recordNewAth(inputState, data) {
  const state = normalizeAthState(inputState);
  const eventId = `${data.symbol}-${data.athDate}`;
  if (state.athEvents.some((event) => event.id === eventId)) {
    return { state, created: false, event: state.athEvents.find((event) => event.id === eventId) };
  }

  const event = {
    ...buildAthEvent(data.symbol, data.athDate, data.athHigh, data.athLow, data.previousAth),
    detectedAt: data.detectedAt ?? null,
    telegramAlertSentAt: null,
  };

  state.athEvents.push(event);
  state.athMaster[data.symbol] = {
    adjustedAthPrice: event.athHigh,
    athDate: event.athDate,
    source: data.source ?? 'adjusted_historical',
    rawReferenceHigh: data.rawReferenceHigh ?? null,
    updatedAt: data.detectedAt ?? null,
  };

  if (hasActiveSetup(state, data.symbol)) {
    state.updatedAt = data.detectedAt ?? null;
    return { state, created: false, event, setup: null, skippedReason: 'ACTIVE_SETUP_EXISTS' };
  }

  const setup = buildSetup(event, data.tradingDate);
  state.tradeSetups.push(setup);
  state.updatedAt = data.detectedAt ?? null;

  return { state, created: true, event, setup };
}
