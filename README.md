# Inside @ 50 EMA Live Scanner

Live NSE 5-minute scanner for the locked Trend-B inside-bar strategy.

## Existing scanner rules
- 5-minute NSE candles.
- Mother candle followed by 1 to 5 child candles.
- Every child stays strictly inside the mother range.
- At least one child touches/intersects 50 EMA.
- Trend B: 20 EMA > 50 EMA and 50 EMA rising over 3 candles = LONG only; inverse = SHORT only.
- Mother high break activates LONG; mother low break activates SHORT.
- SL = opposite mother boundary; target = 1R.
- No new entries after 14:45 IST.
- CAS hard exit at 15:13 IST.
- If both SL and target are touched in the same 5-minute candle, SL is processed first.
- Each state transition is alerted once and retained in the daily ledger.

## Existing scanner architecture
Angel One SmartAPI websocket on a Windows PC/VPS -> 5-minute candle runner -> protected Vercel ingest API -> persistent Redis/Upstash state -> dashboard + Telegram.

## NSE ATH Forward Monitor
The ATH subsystem is isolated from the existing scanner and is **forward-testing only**. It does not contain a backtest engine or historical strategy-performance loop.

Open the ATH dashboard at `/ath.html`.

### Locked ATH rules
- Universe: current NSE cash/equity securities priced at ₹50+; ETFs excluded.
- Historical ATH baseline: corporate-action-adjusted historical data.
- NEW ATH: completed-day high strictly greater than stored ATH.
- Detection: after 5 PM IST.
- D+1: next actual NSE trading day, including holidays.
- Gap-up above prior ATH high: entry at actual open.
- Normal breakout: entry at prior ATH high.
- SL: prior ATH day's low.
- Target: 1R.
- Low breaks before high on D+1: INVALIDATED.
- Neither level breaks by D+1 close: EXPIRED.
- If both D+1 levels are crossed in one candle and order is unknowable: AMBIGUOUS.
- Base capital: ₹1,00,000 per setup; quantity is floor(capital / actual entry).
- Historical ATH events and setups are immutable ledger records.
- Telegram alerts are idempotent.

### ATH runtime
The dedicated runner is `runner/ath_runner.py`. It builds the NSE equity universe from NSE's official equity and ETF lists, matches symbols to Angel One cash-market tokens, seeds the adjusted baseline, runs the after-close daily detector, and monitors only active D+1 setups during the live session.

Required environment variables for the ATH runner:
- `SCANNER_BASE_URL`
- `ATH_INGEST_SECRET` (or existing `SCANNER_INGEST_SECRET`)
- `ANGEL_API_KEY`
- `ANGEL_CLIENT_CODE`
- `ANGEL_PASSWORD`
- `ANGEL_TOTP_SECRET`
- Existing Telegram variables: `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID`

Optional:
- `ATH_SEED_BASELINE=0` skips baseline seeding on runner start.

The ATH API uses the dedicated Redis key `ath:state`, so the existing `inside50:state` scanner state is untouched.

## Verification
The ATH logic is covered by Node's built-in test runner, including trading-calendar, baseline, D+1 entry/invalidation/expiry/ambiguity, sizing, and target/SL exit behavior.
