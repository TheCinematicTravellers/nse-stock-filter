"""NSE ATH forward-testing runner.

Separate from the existing inside-50 scanner. No backtest logic lives here.

Responsibilities:
- Build the current NSE equity universe from NSE's official equity/ETF lists.
- Match it to Angel One cash-market tokens.
- Seed corporate-action-adjusted ATH baselines from Yahoo Finance.
- After 17:00 IST, fetch the completed daily OHLC snapshot in batched market-data requests and send it to /api/ath/daily.
- During market hours, subscribe only to active D+1 setups and forward ticks to /api/ath/live.
"""
from dotenv import load_dotenv
load_dotenv()

import csv
import datetime as dt
import io
import json
import os
import threading
import time
from urllib.parse import quote

import requests
import pyotp
from SmartApi import SmartConnect
from SmartApi.smartWebSocketV2 import SmartWebSocketV2

IST = dt.timezone(dt.timedelta(hours=5, minutes=30))
NSE_EQUITY_URL = "https://nsearchives.nseindia.com/content/equities/EQUITY_L.csv"
NSE_ETF_URL = "https://nsearchives.nseindia.com/content/equities/eq_etfseclist.csv"
ANGEL_MASTER_URL = "https://margincalculator.angelbroking.com/OpenAPI_File/files/OpenAPIScripMaster.json"
YAHOO_URL = "https://query1.finance.yahoo.com/v8/finance/chart/{ticker}"

YAHOO_SYMBOL_ALIASES = {
    "ANSAL": "ANSALAPI",
}

BASE = os.environ.get("SCANNER_BASE_URL", "").rstrip("/")
SECRET = os.environ.get("ATH_INGEST_SECRET") or os.environ.get("SCANNER_INGEST_SECRET", "")
API_KEY = os.environ.get("ANGEL_API_KEY", "")
CLIENT = os.environ.get("ANGEL_CLIENT_CODE", "")
PWD = os.environ.get("ANGEL_PASSWORD", "")
TOTP_SECRET = os.environ.get("ANGEL_TOTP_SECRET", "")

if not BASE or not SECRET:
    raise SystemExit("Safety stop: set SCANNER_BASE_URL and ATH_INGEST_SECRET (or SCANNER_INGEST_SECRET).")
if not all([API_KEY, CLIENT, PWD, TOTP_SECRET]):
    raise SystemExit("Safety stop: set all ANGEL_* credentials before starting ATH runner.")

HEAD = {"Authorization": f"Bearer {SECRET}", "Content-Type": "application/json"}


def post(path, payload):
    r = requests.post(BASE + path, headers=HEAD, json=payload, timeout=45)
    r.raise_for_status()
    return r.json()


def get(path):
    r = requests.get(BASE + path, headers=HEAD, timeout=30)
    r.raise_for_status()
    return r.json()


def download_text(url):
    r = requests.get(url, headers={"User-Agent": "Mozilla/5.0"}, timeout=45)
    r.raise_for_status()
    return r.text


def build_universe():
    equity_text = download_text(NSE_EQUITY_URL)
    etf_text = download_text(NSE_ETF_URL)

    def normalized_rows(text):
        reader = csv.reader(io.StringIO(text))
        rows = list(reader)
        if not rows:
            return []
        headers = [str(h).strip().upper() for h in rows[0]]
        return [dict(zip(headers, row)) for row in rows[1:] if row]

    equity_rows = normalized_rows(equity_text)
    etf_rows = normalized_rows(etf_text)

    equity_symbols = {
        str(r.get("SYMBOL", "")).strip().upper()
        for r in equity_rows
        if str(r.get("SERIES", "")).strip().upper() == "EQ"
    }
    etf_symbols = {
        str(r.get("SYMBOL", "")).strip().upper()
        for r in etf_rows
        if str(r.get("SYMBOL", "")).strip()
    }

    allowed = equity_symbols - etf_symbols
    instruments = requests.get(ANGEL_MASTER_URL, timeout=60).json()
    out, seen = [], set()

    for x in instruments:
        exch = str(x.get("exch_seg", "")).lower()
        symbol = str(x.get("name") or x.get("symbol", "")).upper().strip()
        raw_symbol = symbol.removesuffix("-EQ")
        tradingsymbol = str(x.get("symbol", "")).upper().strip()

        if exch not in {"nse", "nse_cm"} or not tradingsymbol.endswith("-EQ"):
            continue
        if raw_symbol not in allowed or raw_symbol in seen:
            continue

        seen.add(raw_symbol)
        out.append({
            "symbol": raw_symbol,
            "tradingsymbol": tradingsymbol,
            "token": str(x["token"]),
            "securityType": "EQUITY",
            "active": True,
        })

    return out


def yahoo_adjusted_ath(symbol):
    """Return the historical ATH in the current share-price scale.

    Yahoo's Adj Close includes dividend adjustments. Dividends should not lower a
    historical price-level ATH for this breakout system, so we ignore Adj Close and
    adjust raw highs only for actual stock splits reported by Yahoo.
    """
    yahoo_symbol = YAHOO_SYMBOL_ALIASES.get(symbol, symbol)
    ticker = quote(f"{yahoo_symbol}.NS", safe="")
    url = YAHOO_URL.format(ticker=ticker)

    params = {
        "range": "max",
        "interval": "1d",
        "events": "div,splits",
        "includeAdjustedClose": "true",
    }
    headers = {"User-Agent": "Mozilla/5.0"}
    last_error = None

    for attempt in range(5):
        try:
            r = requests.get(url, params=params, headers=headers, timeout=30)

            if r.status_code == 404 and yahoo_symbol == symbol:
                raise LookupError(f"Yahoo ticker not found for {symbol}")

            if r.status_code in (403, 429):
                wait = min(60, 5 * (2 ** attempt))
                print(f"Yahoo rate limit {symbol}: HTTP {r.status_code}. Waiting {wait}s before retry {attempt + 1}/5", flush=True)
                time.sleep(wait)
                continue

            r.raise_for_status()
            payload = r.json()
            result = payload.get("chart", {}).get("result") or []
            if not result:
                raise LookupError(f"Yahoo returned no history for {symbol}")
            result = result[0]

            timestamps = result.get("timestamp") or []
            q = (result.get("indicators") or {}).get("quote", [{}])[0]
            highs = q.get("high", [])
            split_events = (result.get("events") or {}).get("splits") or {}

            split_points = []
            for event_ts, event in split_events.items():
                try:
                    numerator = float(event.get("numerator"))
                    denominator = float(event.get("denominator"))
                    if numerator > 0 and denominator > 0:
                        split_points.append((int(event_ts), numerator / denominator))
                except (TypeError, ValueError):
                    continue
            split_points.sort()

            def split_factor_for(ts):
                factor = 1.0
                for split_ts, ratio in split_points:
                    if int(ts) < split_ts:
                        factor *= ratio
                return factor

            best = None
            best_date = None
            best_raw = None

            for i, ts in enumerate(timestamps):
                high = highs[i] if i < len(highs) else None
                if high is None:
                    continue

                raw_high = float(high)
                adjusted_high = raw_high * split_factor_for(ts)

                if best is None or adjusted_high > best:
                    best = adjusted_high
                    best_raw = raw_high
                    best_date = dt.datetime.fromtimestamp(ts, tz=dt.timezone.utc).date().isoformat()

            if best is None:
                raise LookupError(f"Yahoo returned no usable history for {symbol}")

            return {
                "symbol": symbol,
                "adjustedAthPrice": round(best, 4),
                "athDate": best_date,
                "source": "corporate_action_adjusted_yahoo",
                "rawReferenceHigh": best_raw,
                "historicalSymbol": yahoo_symbol,
            }

        except LookupError:
            raise
        except Exception as e:
            last_error = e
            if attempt < 4:
                wait = min(60, 5 * (2 ** attempt))
                print(f"Yahoo failed {symbol}: {e}. Waiting {wait}s before retry {attempt + 1}/5", flush=True)
                time.sleep(wait)

    raise RuntimeError(f"Yahoo failed after 5 attempts for {symbol}: {last_error}")


def login():
    smart = SmartConnect(api_key=API_KEY)
    session = smart.generateSession(CLIENT, PWD, pyotp.TOTP(TOTP_SECRET).now())
    if not session.get("status") or not session.get("data"):
        raise RuntimeError(f"Angel login failed: {session}")
    return smart, session["data"]["jwtToken"], session["data"]["feedToken"]


def seed_baseline(smart, universe):
    state = get("/api/ath/state")
    existing = state.get("athMaster", {})
    rows = []
    now = dt.datetime.now(IST).isoformat()

    for i, inst in enumerate(universe, 1):
        symbol = inst["symbol"]
        if symbol in existing:
            continue

        try:
            rows.append(yahoo_adjusted_ath(symbol))

            if len(rows) >= 25:
                post("/api/ath/baseline", {"rows": rows, "updatedAt": now})
                rows.clear()

            if i % 25 == 0:
                print(f"ATH baseline {i}/{len(universe)}", flush=True)

        except LookupError as e:
            print(f"Baseline skipped {symbol}: {e}", flush=True)
        except Exception as e:
            print(f"Baseline failed {symbol}: {e}", flush=True)

        time.sleep(1.0)

    if rows:
        post("/api/ath/baseline", {"rows": rows, "updatedAt": now})


def daily_snapshot(smart, universe):
    """Fetch today's completed OHLC in batches instead of one historical call per stock.

    Angel's Market Data API supports up to 50 NSE tokens per request and is rate-limited
    to roughly one request per second. This keeps the 2,293-stock daily scan to about
    one minute instead of thousands of historical requests that trigger AB1021.
    """
    now = dt.datetime.now(IST)
    date = now.date().isoformat()
    stocks, bars = [], {}
    by_token = {str(inst["token"]): inst for inst in universe}
    tokens = list(by_token)
    total_batches = (len(tokens) + 49) // 50

    for batch_no, start in enumerate(range(0, len(tokens), 50), 1):
        batch = tokens[start:start + 50]
        try:
            raw = smart.getMarketData("OHLC", {"NSE": batch}) or {}
            data = raw.get("data") or {}
            fetched = data.get("fetched") or []
            for row in fetched:
                token = str(row.get("symbolToken", ""))
                inst = by_token.get(token)
                if not inst:
                    continue
                high = row.get("high")
                low = row.get("low")
                ltp = row.get("ltp")
                opening = row.get("open")
                close = row.get("close")
                if high is None or low is None:
                    continue
                symbol = inst["symbol"]
                bars[symbol] = {
                    "date": date,
                    "open": float(opening if opening is not None else ltp),
                    "high": float(high),
                    "low": float(low),
                    "close": float(close if close is not None else ltp),
                    "volume": 0,
                }
                stocks.append({**inst, "currentPrice": float(ltp if ltp is not None else close)})
            unfetched = data.get("unfetched") or []
            if unfetched:
                print(f"ATH daily batch {batch_no}/{total_batches}: {len(unfetched)} unfetched", flush=True)
        except Exception as e:
            print(f"ATH daily batch failed {batch_no}/{total_batches}: {e}", flush=True)

        print(f"ATH daily batch {batch_no}/{total_batches}: {len(bars)}/{len(universe)} stocks", flush=True)
        if batch_no < total_batches:
            time.sleep(1.05)

    if not bars:
        raise RuntimeError("ATH daily snapshot returned no usable OHLC data")

    result = post("/api/ath/daily", {"date": date, "detectedAt": now.isoformat(), "stocks": stocks, "dailyBars": bars})
    print("ATH daily result:", json.dumps(result), flush=True)


class LiveMonitor:
    def __init__(self, jwt, feed, universe):
        self.ws = SmartWebSocketV2(jwt, API_KEY, CLIENT, feed)
        self.by_token = {x["token"]: x for x in universe}
        self.subscribed = set()
        self.ws.on_data = self.on_data
        self.ws.on_open = self.on_open
        self.ws.on_error = lambda ws, err: print("ATH WS error", err, flush=True)
        self.ws.on_close = lambda ws, code, msg: print("ATH WS closed", code, msg, flush=True)

    def refresh_subscriptions(self):
        try:
            state = get("/api/ath/state")
            wanted = {x["symbol"] for x in state.get("tradeSetups", []) if x.get("status") in {"PENDING_D1", "TRIGGERED"}}
            tokens = [x["token"] for x in self.by_token.values() if x["symbol"] in wanted and x["token"] not in self.subscribed]
            for start in range(0, len(tokens), 50):
                chunk = tokens[start:start + 50]
                if chunk:
                    self.ws.subscribe("ath-live", 2, [{"exchangeType": 1, "tokens": chunk}])
                    self.subscribed.update(chunk)
            if tokens:
                print(f"ATH subscribed +{len(tokens)} active symbols", flush=True)
        except Exception as e:
            print("ATH subscription refresh failed", e, flush=True)

    def on_open(self, wsapp):
        print("ATH websocket connected", flush=True)
        self.refresh_subscriptions()

    def on_data(self, wsapp, data, data_type=None, continue_flag=None):
        try:
            inst = self.by_token.get(str(data["token"]))
            if not inst:
                return
            px = float(data["last_traded_price"]) / 100.0
            ts = int(data.get("exchange_timestamp") or time.time() * 1000)
            t = dt.datetime.fromtimestamp(ts / 1000, tz=IST)
            opening = data.get("open_price_of_the_day")
            if opening is not None:
                opening = float(opening) / 100.0
            candle = {"time": t.isoformat(), "open": opening if opening is not None else px, "high": px, "low": px, "close": px}
            post("/api/ath/live", {"candlesBySymbol": {inst["symbol"]: candle}, "updatedAt": t.isoformat()})
        except Exception as e:
            print("ATH tick error", e, flush=True)

    def run(self):
        self.ws.connect()


def main():
    smart, jwt, feed = login()
    universe = build_universe()
    print(f"ATH universe: {len(universe)} NSE equities after ETF exclusion", flush=True)
    if os.environ.get("ATH_SEED_BASELINE", "1") == "1":
        seed_baseline(smart, universe)

    monitor = LiveMonitor(jwt, feed, universe)
    threading.Thread(target=monitor.run, daemon=True).start()

    last_daily_date = None
    last_refresh_minute = None
    last_expiry_date = None
    while True:
        now = dt.datetime.now(IST)
        if now.hour >= 17 and last_daily_date != now.date():
            try:
                daily_snapshot(smart, universe)
                last_daily_date = now.date()
            except Exception as e:
                print("ATH daily snapshot failed", e, flush=True)
        if now.hour == 15 and now.minute >= 31 and last_expiry_date != now.date():
            try:
                post("/api/ath/live", {"candlesBySymbol": {}, "expireDate": now.date().isoformat(), "updatedAt": now.isoformat()})
                last_expiry_date = now.date()
            except Exception as e:
                print("ATH expiry failed", e, flush=True)
        minute_key = now.replace(second=0, microsecond=0)
        if last_refresh_minute != minute_key and 9 <= now.hour < 16:
            monitor.refresh_subscriptions()
            last_refresh_minute = minute_key
        time.sleep(5)


if __name__ == "__main__":
    main()
