const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function toDate(value) {
  if (!DATE_RE.test(String(value ?? ''))) return null;
  const [year, month, day] = String(value).split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, day));
}

function isoDate(date) {
  return date.toISOString().slice(0, 10);
}

function addDays(date, days) {
  const next = new Date(date);
  next.setUTCDate(next.getUTCDate() + days);
  return next;
}

export function statusLabel(status) {
  return {
    PENDING_D1: 'PENDING',
    TRIGGERED: 'TRIGGERED',
    TARGET_HIT: 'TARGET',
    STOP_LOSS: 'SL',
    INVALIDATED: 'INVALIDATED',
    EXPIRED: 'EXPIRED',
    AMBIGUOUS: 'AMBIGUOUS',
    AMBIGUOUS_EXIT: 'AMBIGUOUS',
  }[status] ?? String(status ?? 'UNKNOWN');
}

export function activityDate(setup) {
  const value = setup.statusUpdatedAt
    || setup.exitTime
    || setup.entryTime
    || setup.invalidationTime
    || setup.tradingDate
    || setup.setupDate;
  if (!value) return null;
  const match = String(value).match(/^\d{4}-\d{2}-\d{2}/);
  return match ? match[0] : null;
}

export function filterByDateRange(setups, range, today, customFrom = null, customTo = null) {
  const anchor = toDate(today);
  if (!anchor) return [];

  let from;
  let to;
  switch (range) {
    case 'today':
      from = to = anchor;
      break;
    case 'yesterday':
      from = to = addDays(anchor, -1);
      break;
    case 'current_week': {
      const day = anchor.getUTCDay();
      const mondayOffset = day === 0 ? -6 : 1 - day;
      from = addDays(anchor, mondayOffset);
      to = anchor;
      break;
    }
    case 'last_week': {
      const day = anchor.getUTCDay();
      const mondayOffset = day === 0 ? -6 : 1 - day;
      to = addDays(anchor, mondayOffset - 1);
      from = addDays(to, -6);
      break;
    }
    case 'current_month':
      from = new Date(Date.UTC(anchor.getUTCFullYear(), anchor.getUTCMonth(), 1));
      to = anchor;
      break;
    case 'last_month':
      from = new Date(Date.UTC(anchor.getUTCFullYear(), anchor.getUTCMonth() - 1, 1));
      to = new Date(Date.UTC(anchor.getUTCFullYear(), anchor.getUTCMonth(), 0));
      break;
    case 'custom':
      from = toDate(customFrom);
      to = toDate(customTo);
      break;
    default:
      return [];
  }

  if (!from || !to || from > to) return [];
  const fromKey = isoDate(from);
  const toKey = isoDate(to);
  return (setups ?? []).filter((setup) => {
    const date = activityDate(setup);
    return date != null && date >= fromKey && date <= toKey;
  });
}

export function unsentNewAthEvents(state, date) {
  return (state?.athEvents ?? []).filter((event) => (
    String(event.athDate) === String(date) && !event.telegramAlertSentAt
  ));
}
