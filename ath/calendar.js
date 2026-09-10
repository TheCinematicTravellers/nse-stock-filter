const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

// NSE equity-market holidays for calendar year 2026.
// Source: NSE India trading-holidays calendar, retrieved 2026-09-10.
// Keep this list year-scoped so future calendars can be added without
// changing the calendar engine.
export const NSE_2026_HOLIDAYS = new Set([
  '2026-01-15',
  '2026-01-26',
  '2026-02-19',
  '2026-03-03',
  '2026-03-19',
  '2026-03-26',
  '2026-03-31',
  '2026-04-01',
  '2026-04-03',
  '2026-04-14',
  '2026-05-01',
  '2026-05-28',
  '2026-06-26',
  '2026-08-26',
  '2026-09-14',
  '2026-10-02',
  '2026-10-20',
  '2026-11-10',
  '2026-11-24',
  '2026-12-25',
]);

function assertIsoDate(value) {
  const date = String(value);
  if (!ISO_DATE.test(date)) throw new Error(`Invalid date: ${value}`);
  const parsed = new Date(`${date}T00:00:00Z`);
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== date) {
    throw new Error(`Invalid date: ${value}`);
  }
  return parsed;
}

export function isTradingDay(date, holidays = NSE_2026_HOLIDAYS) {
  const parsed = assertIsoDate(date);
  const day = parsed.getUTCDay();
  return day !== 0 && day !== 6 && !holidays.has(String(date));
}

export function nextTradingDay(date, holidays = NSE_2026_HOLIDAYS) {
  let parsed = assertIsoDate(date);
  do {
    parsed = new Date(parsed.getTime() + 24 * 60 * 60 * 1000);
  } while (!isTradingDay(parsed.toISOString().slice(0, 10), holidays));
  return parsed.toISOString().slice(0, 10);
}
