import { requireAthSecret } from './auth.js';
import { readAthState, writeAthState } from '../../ath/store.js';
import { detectDailyAth } from '../../ath/daily.js';
import { nextTradingDay } from '../../ath/calendar.js';
import { formatNewAthAlert, sendOnce } from '../../ath/telegram.js';

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

    const { date, detectedAt, stocks, dailyBars } = req.body || {};
    const runDate = String(date || todayIst());
    if (runDate !== todayIst()) return res.status(400).json({ error: `date must be current IST date ${todayIst()}` });
    if (!Array.isArray(stocks) || !dailyBars || typeof dailyBars !== 'object') {
      return res.status(400).json({ error: 'stocks and dailyBars are required' });
    }

    let state = await readAthState();
    const result = detectDailyAth(state, {
      date: runDate,
      detectedAt: detectedAt || new Date().toISOString(),
      stocks,
      dailyBars,
      nextTradingDate,
    });
    state = result.state;

    const alerts = [];
    for (const { event, setup } of result.created) {
      const alert = await sendOnce(state, `NEW_ATH:${event.id}`, formatNewAthAlert(event, setup), detectedAt);
      state = alert.state;
      alerts.push({ eventId: event.id, sent: alert.sent, duplicate: alert.duplicate, skipped: alert.skipped });
    }

    await writeAthState(state);
    return res.status(200).json({ newAthSymbols: result.newAthSymbols, alerts, created: result.created.map(({ event, setup }) => ({ event, setup })) });
  } catch (error) {
    return res.status(error.statusCode || 500).json({ error: error.message });
  }
}
