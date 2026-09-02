# Inside @ 50 EMA Live Scanner

Live NSE 5-minute scanner for the locked Trend-B inside-bar strategy.

## Rules
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

## Architecture
Angel One SmartAPI websocket on a Windows PC/VPS -> 5-minute candle runner -> protected Vercel ingest API -> persistent Redis/Upstash state -> dashboard + Telegram.

Vercel is used for the web/API layer. The persistent Angel websocket runner must stay on the machine/VPS that has the Angel credentials.

## Vercel environment variables
- `KV_REST_API_URL`
- `KV_REST_API_TOKEN`
- `INGEST_SECRET`
- `TELEGRAM_BOT_TOKEN`
- `TELEGRAM_CHAT_ID`

Do not commit secrets.

## Runner setup
1. Copy `runner/.env.example` to your local `.env` or set Windows environment variables.
2. Create `runner/instruments.json` containing the 208 NSE symbols and their Angel tokens. `runner/instruments.example.json` shows the format.
3. Install `runner/requirements.txt`.
4. Run `python runner/angel_runner.py`.

The runner refuses to start without the scanner URL, ingest secret, and Angel credentials. It seeds recent closed 5-minute candles first so the 20/50 EMA has history, then subscribes to the live NSE websocket.

## Dashboard
The dashboard polls `/api/state` every 10 seconds and has Live Candidates and Daily Ledger views. It is read-only by design. State changes come from the runner/API, so closing the browser does not stop scanning or Telegram alerts.
