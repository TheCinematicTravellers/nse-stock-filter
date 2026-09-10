function telegramConfig() {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;
  if (!token || !chatId) return null;
  return { token, chatId };
}

export function formatNewAthAlert(event, setup) {
  return [
    '🚨 NEW ATH',
    `${event.symbol} | ${event.athDate}`,
    `ATH High: ₹${event.athHigh}`,
    `ATH Day Low / SL: ₹${event.athLow}`,
    `D+1: ${setup.tradingDate}`,
    `Entry: ₹${setup.plannedEntry}`,
    `Target 1R: ₹${setup.target1R}`,
    `Base Capital: ₹${setup.baseCapital}`,
    `Qty: ${setup.quantity}`,
    'Rule: D+1 breaks prior ATH high; low-first invalidates.',
  ].join('\n');
}

export function formatNewAthSummary(created) {
  const lines = [
    '🚨 NEW ATH SUMMARY',
    `Total new ATHs: ${created.length}`,
    '',
  ];

  for (const { event, setup } of created) {
    lines.push(
      `${event.symbol} | ATH ₹${event.athHigh} | Low/SL ₹${event.athLow}`,
      `D+1 ${setup.tradingDate} | Entry ₹${setup.plannedEntry} | 1R ₹${setup.target1R} | Qty ${setup.quantity}`,
      '',
    );
  }

  lines.push('Rule: D+1 breaks prior ATH high; low-first invalidates; setup expires after D+1.');
  return lines.join('\n').trim();
}

export function formatTradeAlert(setup) {
  return [
    setup.status === 'TRIGGERED' ? '🟢 ATH ENTRY' : '🔔 ATH UPDATE',
    `${setup.symbol} | ${setup.tradingDate}`,
    `Status: ${setup.status}`,
    `Entry: ₹${setup.actualEntry ?? '—'}`,
    `SL: ₹${setup.setupLow}`,
    `Target: ₹${setup.target1R}`,
    `Qty: ${setup.quantity}`,
    `Capital: ₹${setup.deployedCapital ?? setup.baseCapital}`,
    setup.resultR != null ? `Result: ${setup.resultR}R` : '',
  ].filter(Boolean).join('\n');
}

export async function sendTelegram(text) {
  const config = telegramConfig();
  if (!config) return { sent: false, skipped: true };
  const response = await fetch(`https://api.telegram.org/bot${config.token}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: config.chatId, text }),
  });
  if (!response.ok) throw new Error(`Telegram send failed: ${response.status}`);
  return { sent: true };
}

export async function sendOnce(state, key, text, sentAt = new Date().toISOString()) {
  if (state.alertLedger?.[key]) return { state, sent: false, duplicate: true };
  const result = await sendTelegram(text);
  if (result.sent) {
    if (!state.alertLedger) state.alertLedger = {};
    state.alertLedger[key] = { sentAt, status: 'SENT' };
  }
  return { state, sent: result.sent, duplicate: false, skipped: result.skipped === true };
}
