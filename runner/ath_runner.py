"""NSE ATH forward-testing runner.

Separate from the existing inside-50 scanner. No backtest logic lives here.

Responsibilities:
- Build the current NSE equity universe from NSE's official equity/ETF lists.
- Match it to Angel One cash-market tokens.
- Seed/refresh corporate-action-adjusted ATH baselines from Yahoo Finance.
- After 17:00 IST, send the completed daily OHLC snapshot to /api/ath/daily.
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
    equity_rows = list(csv.DictReader(io.StringIO(download_text(NSE_EQUITY_URL))))
    etf_rows = list(csv.DictReader(io.StringIO(download_text(NSE_ETF_URL))))
    equity_symbols = {
        str(r.get("SYMBOL", "")).strip().upper()
        for r in equity_rows
        if str(r.get("SERIES", "")).strip().upper() == "EQ"
    }
    etf_symbols = {str(r.get("SYMBOL", "")).strip().upper() for r in etf_rows}
    allowed = equity_symbols - etf_symbols

    instruments = requests.get(ANGEL_MASTER_URL, timeout=60).json()
    out = []
    seen = set()
    for x in instruments:
        exch = str(x.get("exch_seg", "")).lower()
        symbol = str(x.get("name") or x.get("symbol", "")).upper().strip()
        raw_symbol = symbol.removesuffix("-EQ")
        tradingsymbol = str(x.get("symbol", "")).upper().strip()
        if exch not in {"nse", "nse_cm"}:
            continue
        if not tradingsymbol.endswith("-EQ"):
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
    ticker = quote(f"{symbol}.NS", safe="")
    url = YAHOO_URL.format(ticker=ticker)
    params = {"range": "max", "interval": "1d", "events": "div,splits", "includeAdjustedClose": "true"}
    r = requests.get(url, params=params, headers={"User-Agent": "Mozilla/5.0"}, timeout=30)
    r.raise_for_status()
    result = r.json()["chart"]["result"][0]
    meta = result.get("meta", {})
    timestamps = result.get("timestamp") or []
    q = (result.get("indicators") or {}).get("quote", [{}])[0]
    adj = (result.get("indicators") or {}).get("adjclose", [{}])[0].get("adjclose", [])
    highs = q.get("high", [])
    closes = q.get("close", [])
    best = None
    best_date = None
    for i, ts in enumerate(timestamps):
        high = highs[i] if i < len(highs) else None
        close = closes[i] if i < len(closes) else None
        adjusted_close = adj[i] if i < len(adj) else None
        if high is None or close in (None, 0) or adjusted_close is None:
            continue
        factor = float(adjusted_close) / float(close)
        adjusted_high = float(high) * factor
        if best is None or adjusted_high > best:
            best = adjusted_high
            best_date = dt.datetime.fromtimestamp(ts, tz=dt.timezone.utc).date().isoformat()
    if best is None:
        raise ValueError(f"Yahoo returned no usable history for {symbol}")
    return {"symbol": symbol, "adjustedAthPrice": round(best, 4), "athDate": best_date, "source": "adjusted_historical_yahoo", "rawReferenceHigh": None}


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
        if inst["symbol"] in existing:
            continue
        try:
            params = {
                "exchange": "NSE",
                "symboltoken": inst["token"],
                "interval": "ONE_DAY",
                "fromdate": (dt.datetime.now(IST) - dt.timedelta(days=2000)).strftime("%Y-%m-%d 09:15"),
                "todate": dt.datetime.now(IST).strftime("%Y-%m-%d 15:30"),
            }
            raw = smart.getCandleData(params).get("data") or []
            if not raw:
                continue
            current_price = float(raw[-1][4])
            if current_price < 50:
                continue
            row = yahoo_adjusted_ath(inst["symbol"])
            rows.append(row)
            if len(rows) >= 100:
                post("/api/ath/baseline", {"rows": rows, "updatedAt": now})
                rows.clear()
            if i % 25 == 0:
                print(f"ATH baseline {i}/{len(universe)}", flush=True)
        except Exception as e:
            print(f"Baseline failed {inst['symbol']}: {e}", flush=True)
        time.sleep(0.08)
    if rows:
        post("/api/ath/baseline", {"rows": rows, "updatedAt": now})


def daily_snapshot(smart, universe):
    now = dt.datetime.now(IST)
    date = now.date().isoformat()
    stocks = []
    bars = {}
    for i, inst in enumerate(universe, 1):
        try:
            params = {
                "exchange": "NSE", "symboltoken": inst["token"], "interval": "ONE_DAY",
                "fromdate": f"{date} 09:15", "todate": f"{date} 15:30",
            }
            raw = smart.getCandleData(params).get("data") or []
            if not raw:
                continue
            row = raw[-1]
            bars[inst["symbol"]] = {
                "date": date, "open": float(row[1]), "high": float(row[2]),
                "low": float(row[3]), "close": float(row[4]), "volume": float(row[5] or 0),
            }
            stocks.append({**inst, "currentPrice": float(row[4])})
        except Exception as e:
            print(f"Daily failed {inst['symbol']}: {e}", flush=True)
        time.sleep(0.03)
    if bars:
        result = post("/api/ath/daily", {"date": date, "detectedAt": now.isoformat(), "stocks": stocks, "dailyBars": bars})
        print("ATH daily result:", json.dumps(result), flush=True)


class LiveMonitor:
    def __init__(self, smart, jwt, feed, universe):
        self.ws = SmartWebSocketV2(jwt, API_KEY, CLIENT, feed)
        self.by_token = {x["token"]: x for x in universe}
        self.subscribed = set()
        self.lock = threading.Lock()
        self.last_refresh = 0
        self.ws.on_data = self.on_data
        self.ws.on_open = self.on_open
        self.ws.on_error = lambda ws, err: print("ATH WS error", err, flush=True)
        self.ws.on_close = lambda ws, code, msg: print("ATH WS closed", code, msg, flush=True)

    def refresh_subscriptions(self):
        try:
            state = get("/api/ath/state")
            wanted_symbols = {x["symbol"] for x in state.get("tradeSetups", []) if x.get("status") in {"PENDING_D1", "TRIGGERED"}}
            tokens = [x["token"] for x in self.by_token.values() if x["symbol"] in wanted_symbols and x["token"] not in self.subscribed]
            if tokens:
                for start in range(0, len(tokens), 50):
                    chunk = tokens[start:start + 50]
                    self.ws.subscribe("ath-live", 1, [{"exchangeType": 1, "tokens": chunk}])
                    self.subscribed.update(chunk)
                print(f"ATH subscribed +{len(tokens)} active symbols", flush=True)
        except Exception as e:
            print("ATH subscription refresh failed", e, flush=True)

    def on_open(self, wsapp):
        print("ATH websocket connected", flush=True)
        self.refresh_subscriptions()

    def on_data(self, wsapp, data, data_type=None, continue_flag=None):
        try:
            token = str(data["token"])
            inst = self.by_token.get(token)
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

    monitor = LiveMonitor(smart, jwt, feed, universe)
    threading.Thread(target=monitor.run, daemon=True).start()

    last_daily_date = None
    last_refresh_minute = None
    while True:
        now = dt.datetime.now(IST)
        if now.hour >= 17 and last_daily_date != now.date():
            try:
                daily_snapshot(smart, universe)
                last_daily_date = now.date()
            except Exception as e:
                print("ATH daily snapshot failed", e, flush=True)
        minute_key = now.replace(second=0, microsecond=0)
        if last_refresh_minute != minute_key and now.hour >= 9 and (now.hour < 16):
            monitor.refresh_subscriptions()
            last_refresh_minute = minute_key
        time.sleep(5)


if __name__ == "__main__":
    main()
