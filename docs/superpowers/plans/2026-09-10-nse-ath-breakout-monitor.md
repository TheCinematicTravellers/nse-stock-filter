# NSE ATH Breakout Monitor Implementation Plan

## Branch
`feature/ath-breakout-monitor`

## Objective
Implement the locked ATH system without modifying the behavior of the existing inside-50-EMA scanner.

## Phase 1: Data foundation
1. Add a dedicated `ath/` module and configuration.
2. Build NSE equity-universe ingestion using official NSE data, excluding ETFs and unsuitable security types.
3. Apply the current-price filter `price >= ₹50` to the active universe.
4. Add adjusted historical-price ingestion for ATH baseline calculation.
5. Normalize symbols, dates, prices, and corporate-action adjustments consistently.
6. Create a persistent schema for stocks, ATH master records, ATH events, trade setups, and alert ledger.

Verification:
- Universe contains only eligible NSE cash/equity securities.
- A split/bonus test fixture proves historical ATH continuity after adjustment.
- Running initialization twice is idempotent.

## Phase 2: ATH baseline and daily detector
1. Implement historical ATH initialization per eligible stock.
2. Store adjusted ATH price/date and source metadata.
3. Implement daily post-5-PM IST job using completed NSE daily OHLC.
4. Detect only strict new highs: `today_high > stored_ath`.
5. Create one immutable ATH event per symbol/date.
6. Update the master ATH record after event creation.
7. Ensure reruns do not duplicate events or Telegram alerts.

Verification:
- Fixture with equal high does not create an event.
- Higher high creates exactly one event.
- Rerunning the same date produces no duplicate event.

## Phase 3: D+1 setup engine
1. Resolve the next actual NSE trading day using an exchange-calendar abstraction.
2. Create one pending setup from each NEW ATH event.
3. Set setup high/low from the ATH day.
4. Calculate planned entry at the setup high, base capital ₹100,000, and quantity as `floor(100000 / entry)`.
5. Calculate risk and 1R target.
6. On D+1, treat a gap above setup high as entry at the actual open.
7. Otherwise trigger when the setup high is crossed.
8. If setup low breaks before setup high, invalidate immediately.
9. If neither condition occurs by session end, expire the setup.
10. Never carry an untriggered setup beyond D+1.
11. If a later new ATH occurs, create a new setup.

Verification:
- Normal breakout triggers correctly.
- Gap-up triggers at open.
- Low-first invalidates and cannot later trigger.
- No-trigger expires.
- Quantity rounds down correctly.
- Later ATH creates a distinct setup.
- Same-candle high/low ambiguity is explicitly classified, not guessed.

## Phase 4: Intraday monitor
1. Add a lightweight D+1 monitor that subscribes/checks only active setups.
2. Process price movement chronologically.
3. Persist state transitions exactly once.
4. On triggered trade, monitor SL and 1R target.
5. Record exit price/time and realized R.
6. Define and test an explicit same-candle SL/target policy using the available data granularity; if order cannot be determined, mark ambiguous rather than inventing it.

Verification:
- State transitions are idempotent.
- Restarting the monitor does not duplicate transitions.
- Active setup count is limited to D+1 events.

## Phase 5: Telegram integration
1. Add Telegram adapter using environment variables only.
2. NEW ATH message includes symbol, ATH date, high/low, previous ATH, planned entry, SL, 1R target, ₹100,000 base capital, quantity, and status.
3. Entry message includes actual entry, quantity, deployed capital, SL, target, and risk.
4. Outcome messages report target/SL and realized R.
5. Persist alert-send state and make sends idempotent.

Verification:
- Formatting tests cover prices, quantities, gap-up entries, and duplicate suppression.
- Secrets are never logged or committed.

## Phase 6: Website/dashboard
1. Add ATH API endpoints separate from existing scanner endpoints.
2. Build dashboard views for NEW ATHs, active D+1 setups, triggered/open trades, completed trades, and ATH master.
3. Show alert date and current status on every historical event.
4. Show entry, actual entry, quantity, base capital, SL, target, exit, result, and R where applicable.
5. Add refresh/polling suitable for the live dashboard.
6. Preserve historical records when a stock makes later ATHs.

Verification:
- API returns persisted records after restart.
- Dashboard displays current and historical states accurately.
- Existing scanner dashboard behavior remains unchanged.

## Phase 7: Scheduling and deployment
1. Add a post-market scheduler for the daily detector after 5 PM IST.
2. Add the D+1 live-monitor process for active setups.
3. Keep credentials in deployment environment variables.
4. Add operational logging and failure visibility.
5. Document Windows/VPS setup and daily commands.
6. Deploy web/API components through the existing Vercel architecture where compatible.

Verification:
- Dry run on a historical trading day reproduces expected events.
- Full end-to-end fixture: new ATH → Telegram event → D+1 entry/invalid/expiry → outcome → dashboard ledger.
- Existing repository tests/scanner behavior remain intact.

## Delivery order
Data foundation → baseline → daily detector → setup engine → intraday monitor → Telegram → dashboard → scheduler/deployment.

No trading-rule changes are permitted without explicit user approval.
