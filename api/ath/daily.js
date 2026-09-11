import { requireAthSecret } from './auth.js';
import { readAthState, writeAthState } from '../../ath/store.js';
import { detectDailyAth } from '../../ath/daily.js';
import { nextTradingDay } from '../../ath/calendar.js';
import { formatNewAthSummary, sendOnce } from '../../ath/telegram.js';
import { unsentNewAthEvents } from '../../ath/reporting.js';

const IST = 'Asia/Kolkata';

function todayIst() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: IST, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
}

function hourIst() {
  return Number(new Intl.DateTimeFormat('en-GB', { timeZone: IST, hour: '2-digit', hour12: false }).format(new Date()));
}

export default async function handler(req, res) {
  try {
    requireAthSecret(req);
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
    if (hourIst() < 17) return res.status(409).json({ error: 'ATH daily detection is only allowed after 5 PM IST' });

    const {
      date,
      detectedAt,
      stocks,
      dailyBars,
      snapshotComplete = true,
      universeCount = null,
    } = req.body || {};
    const runDate = String(date || todayIst());
    if (runDate !== todayIst()) return res.status(400).json({ error: `date must be current IST date ${todayIst()}` });
    if (!Array.isArray(stocks) || !dailyBars || typeof dailyBars !== 'object') {
      return res.status(400).json({ error: 'stocks and dailyBars are required' });
    }

    let state = await readAthState();
    const expectedCount = Object.keys(state.athMaster || {}).length;
    const observedCount = Object.keys(dailyBars).length;
    const completenessFloor = expectedCount >= 1000 ? expectedCount - 2 : expectedCount;
    if (!snapshotComplete || (expectedCount >= 1000 && observedCount < completenessFloor)) {
      return res.status(409).json({
        error: 'ATH daily snapshot is incomplete; refusing to create partial NEW ATH events',
        expectedCount,
        universeCount,
        barCount: observedCount,
        completenessFloor,
      });
    }

    const result = detectDailyAth(state, {
      date: runDate,
      detectedAt: detectedAt || new Date().toISOString(),
      stocks,
      dailyBars,
      nextTradingDate: nextTradingDay,
    });
    state = result.state;

    const unsentEvents = unsentNewAthEvents(state, runDate);
    const setupsByEvent = Object.fromEntries(
      state.tradeSetups.map((setup) => [setup.athEventId, setup]),
    );
    const alertRows = unsentEvents
      .map((event) => ({ event, setup: setupsByEvent[event.id] }))
      .filter((row) => row.setup);

    let alert = { sent: false, duplicate: false, skipped: false };
    if (alertRows.length > 0) {
      const eventIds = alertRows.map(({ event }) => event.id).sort().join('|');
      const summaryKey = `NEW_ATH_SUMMARY:${runDate}:${eventIds}`;
      alert = await sendOnce(
        state,
        summaryKey,
        formatNewAthSummary(alertRows),
        detectedAt,
      );
      state = alert.state;

      if (alert.sent) {
        const sentAt = detectedAt || new Date().toISOString();
        const sentIds = new Set(alertRows.map(({ event }) => event.id));
        state.athEvents = state.athEvents.map((event) => (
          sentIds.has(event.id)
            ? { ...event, telegramAlertSentAt: sentAt }
            : event
        ));
      }
    }

    await writeAthState(state);
    return res.status(200).json({
      newAthSymbols: result.newAthSymbols,
      alert,
      created: result.created.map(({ event, setup }) => ({ event, setup })),
      unsentNewAthCount: unsentEvents.length,
      snapshotComplete: true,
    });
  } catch (error) {
    return res.status(error.statusCode || 500).json({ error: error.message });
  }
}
