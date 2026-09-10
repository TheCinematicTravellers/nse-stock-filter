# NSE ATH Breakout Monitor Design

## Goal
Build a persistent NSE cash-stock ATH monitor that maintains the current adjusted historical all-time high for every eligible stock priced at or above ₹50, detects new ATHs after the daily session, creates a one-trading-day breakout setup, sends Telegram alerts, and exposes a historical/live web dashboard.

## Locked Rules

1. Universe is NSE cash/equity stocks whose current price is ₹50 or above. ETFs and unsuitable non-equity securities are excluded.
2. Corporate actions must be handled for historical ATH determination. Historical data used to establish the ATH must be adjusted consistently for splits, bonuses, and other relevant corporate actions.
3. Current-day NSE OHLC is the execution truth. Live setup prices, entry, SL, target, and quantity are based on actual tradable NSE prices.
4. Daily scan runs after 5 PM IST using the completed day's high. A stock creates a NEW ATH event when today's high is strictly greater than the prior stored ATH.
5. New ATH day is D. The setup is active only on the next NSE trading day D+1.
6. Entry on D+1 is triggered when price breaks D High. If D+1 opens above D High, entry is at the open.
7. Initial SL is D Low.
8. Initial target is 1R minimum, where R = entry - SL for a long setup.
9. Position quantity is `floor(100000 / entry_price)` using a fixed ₹1,00,000 base capital per setup. Example: entry ₹1,110 => 90 shares and ₹99,900 deployed capital.
10. If D+1 breaks D Low before breaking D High, the setup is INVALID and cannot trigger later that day.
11. If D+1 neither triggers nor invalidates, the setup EXPIRES at the end of D+1. It never carries to D+2.
12. A later genuine NEW ATH creates a fresh setup and reactivates the stock.
13. Historical alert/setup records are retained permanently in the dashboard ledger.

## Architecture

Use a hybrid data architecture:

- NSE source: official/current NSE universe and daily OHLC used for current tradable prices and daily detection.
- Adjusted historical source: Yahoo Finance or an equivalent adjusted historical feed used to establish and maintain the historical ATH baseline.
- Persistent backend/state: extend the existing Vercel/API + persistent Redis/Upstash pattern in `TheCinematicTravellers/nse-stock-filter` where practical, while keeping ATH logic isolated from the existing 5-minute scanner state.
- Daily worker: scheduled after 5 PM IST to refresh the eligible universe, fetch daily OHLC, detect new ATHs, update state, and emit Telegram alerts.
- Next-day monitor: only active D+1 setups need intraday price monitoring. This keeps the live workload small.
- Web dashboard: show current ATH universe, new ATH events, active D+1 setups, triggered trades, outcomes, and historical alert records.
- Telegram: alert on NEW ATH, triggered entry, invalidation/expiry where useful, and target/SL outcome.

## Data Model

### stocks
- symbol
- company_name
- exchange
- current_price
- eligible_price_ge_50
- security_type
- active
- updated_at

### ath_master
- symbol
- adjusted_ath_price
- ath_date
- source
- raw_reference_high where available
- updated_at

### ath_events
- id
- symbol
- ath_date
- ath_high
- ath_low
- previous_ath
- detected_at
- telegram_alert_sent_at

### trade_setups
- id
- ath_event_id
- symbol
- setup_date
- trading_date
- setup_high
- setup_low
- planned_entry
- actual_entry
- base_capital (100000)
- quantity
- deployed_capital
- risk_per_share
- risk_amount
- target_1r
- status
- invalidation_time
- entry_time
- exit_time
- exit_price
- result_r
- updated_at

## State Machine

`NEW_ATH -> PENDING_D1 -> TRIGGERED -> TARGET_HIT | STOP_LOSS`

or

`NEW_ATH -> PENDING_D1 -> INVALIDATED`

or

`NEW_ATH -> PENDING_D1 -> EXPIRED`

A new NEW_ATH event always creates a new setup rather than reopening an old completed setup.

## Intraday D+1 Ordering

The engine must process price movement in chronological order. For a normal session, a trigger occurs when price crosses D High; invalidation occurs when D Low is crossed before the trigger. If both boundaries appear in the same candle and the source does not provide enough intrabar ordering to determine which occurred first, the system must mark the event as ambiguous rather than silently invent an ordering. This ambiguity policy must be covered by tests and made visible in the ledger.

## Telegram Requirements

NEW ATH alert must include symbol, ATH date, ATH high/low, previous ATH, next-day entry level, SL, 1R target, ₹1,00,000 base capital, calculated quantity, and setup status.

Entry alert must include actual entry, quantity, capital deployed, SL, target, and risk.

Outcome alerts must identify TARGET HIT or STOP LOSS and the realized R.

## Dashboard Requirements

Provide separate views/tabs for:
- New ATHs
- Active D+1 setups
- Triggered/open trades
- Completed trades
- ATH master list

Every event must retain its detected/alerted date and current status. The dashboard must not overwrite historical events when a later ATH occurs.

## Operational Requirements

- All times are IST unless explicitly stated otherwise.
- Daily detection must use completed NSE trading sessions only.
- Exchange holidays must be handled so D+1 means the next actual NSE trading day.
- Jobs must be idempotent. Re-running the same daily scan must not duplicate ATH events, setups, or Telegram alerts.
- Secrets must remain in environment variables and never be committed.
- The existing scanner functionality in this repository must not be altered by the ATH subsystem.

## Acceptance Criteria

1. Initial build can populate the eligible NSE cash-stock universe and establish adjusted ATH records.
2. A daily run after 5 PM identifies exactly those stocks whose completed-day high is a new ATH.
3. Each new ATH produces one D+1 setup with correct high, low, 1R target, and ₹1 lakh quantity.
4. Gap-up opens above the ATH trigger at the open.
5. A low-first D+1 move invalidates the setup and prevents a later trigger.
6. A non-triggered D+1 setup expires at session end.
7. A later NEW ATH creates a fresh setup.
8. Telegram alerts contain the required trading and position-sizing fields.
9. Website retains historical ATH events and setup outcomes.
10. Re-running jobs is safe and does not duplicate records or alerts.
