"""One-time ATH historical lifecycle reconciliation.

Forward-test ledger repair only. This is NOT a backtest and never creates setups.
It reads existing setups, maps symbols to current Angel tokens, fetches 1-minute
Angel historical candles from each setup D+1 through today, replays the locked
lifecycle rules, and writes only status-field corrections for older unresolved setups.
"""
from dotenv import load_dotenv
load_dotenv()

import csv
import datetime as dt
import io
import json
import os
import time

import pyotp
import requests
from SmartApi import SmartConnect

IST = dt.timezone(dt.timedelta(hours=5, minutes=30))
BASE = os.environ.get("SCANNER_BASE_URL", "").rstrip("/")
SECRET = os.environ.get("ATH_INGEST_SECRET") or os.environ.get("SCANNER_INGEST_SECRET", "")
API_KEY = os.environ.get("ANGEL_API_KEY", "")
CLIENT = os.environ.get("ANGEL_CLIENT_CODE", "")
PWD = os.environ.get("ANGEL_PASSWORD", "")
TOTP_SECRET = os.environ.get("ANGEL_TOTP_SECRET", "")
ANGEL_MASTER_URL = "https://margincalculator.angelbroking.com/OpenAPI_File/files/OpenAPIScripMaster.json"
NSE_EQUITY_URL = "https://nsearchives.nseindia.com/content/equities/EQUITY_L.csv"
NSE_ETF_URL = "https://nsearchives.nseindia.com/content/equities/eq_etfseclist.csv"

if not BASE or not SECRET:
    raise SystemExit("Safety stop: set SCANNER_BASE_URL and ATH_INGEST_SECRET (or SCANNER_INGEST_SECRET).")
if not all([API_KEY, CLIENT, PWD, TOTP_SECRET]):
    raise SystemExit("Safety stop: set all ANGEL_* credentials before reconciliation.")

HEAD = {"Authorization": f"Bearer {SECRET}", "Content-Type": "application/json"}
TERMINAL = {"TARGET_HIT", "STOP_LOSS", "INVALIDATED", "AMBIGUOUS", "AMBIGUOUS_EXIT"}


def get(path):
    r = requests.get(BASE + path, headers=HEAD, timeout=30)
    r.raise_for_status()
    return r.json()


def post(path, payload):
    r = requests.post(BASE + path, headers=HEAD, json=payload, timeout=45)
    r.raise_for_status()
    return r.json()


def login():
    smart = SmartConnect(api_key=API_KEY)
    session = smart.generateSession(CLIENT, PWD, pyotp.TOTP(TOTP_SECRET).now())
    if not session.get("status") or not session.get("data"):
        raise RuntimeError(f"Angel login failed: {session}")
    return smart


def build_token_map():
    equity = requests.get(NSE_EQUITY_URL, headers={"User-Agent": "Mozilla/5.0"}, timeout=45).text
    etf = requests.get(NSE_ETF_URL, headers={"User-Agent": "Mozilla/5.0"}, timeout=45).text

    def rows(text):
        reader = csv.reader(io.StringIO(text))
        all_rows = list(reader)
        if not all_rows:
            return []
        headers = [str(x).strip().upper() for x in all_rows[0]]
        return [dict(zip(headers, row)) for row in all_rows[1:] if row]

    equity_symbols = {
        str(r.get("SYMBOL", "")).strip().upper()
        for r in rows(equity)
        if str(r.get("SERIES", "")).strip().upper() == "EQ"
    }
    etf_symbols = {
        str(r.get("SYMBOL", "")).strip().upper()
        for r in rows(etf)
        if str(r.get("SYMBOL", "")).strip()
    }
    allowed = equity_symbols - etf_symbols

    instruments = requests.get(ANGEL_MASTER_URL, timeout=60).json()
    result = {}
    for x in instruments:
        exch = str(x.get("exch_seg", "")).lower()
        symbol = str(x.get("name") or x.get("symbol", "")).upper().strip()
        symbol = symbol.removesuffix("-EQ")
        tradingsymbol = str(x.get("symbol", "")).upper().strip()
        if exch not in {"nse", "nse_cm"} or not tradingsymbol.endswith("-EQ"):
            continue
        if symbol not in allowed or symbol in result:
            continue
        result[symbol] = str(x["token"])
    return result


def angel_candles(smart, token, from_date, to_date):
    params = {
        "exchange": "NSE",
        "symboltoken": str(token),
        "interval": "ONE_MINUTE",
        "fromdate": f"{from_date} 09:15",
        "todate": f"{to_date} 15:30",
    }
    last_error = None
    for attempt in range(4):
        try:
            raw = smart.getCandleData(params) or {}
            if not raw.get("status"):
                raise RuntimeError(raw.get("message") or raw)
            out = []
            for row in raw.get("data") or []:
                if len(row) < 6:
                    continue
                ts, opening, high, low, close, volume = row[:6]
                out.append({
                    "time": str(ts), "open": float(opening), "high": float(high),
                    "low": float(low), "close": float(close), "volume": float(volume or 0),
                })
            return out
        except Exception as exc:
            last_error = exc
            if attempt < 3:
                time.sleep(2 ** attempt)
    raise RuntimeError(f"Historical candle fetch failed for token {token}: {last_error}")


def apply_local(setup, candles):
    """Mirror the locked JS lifecycle rules for the repair payload."""
    current = dict(setup)
    if current.get("status") in TERMINAL:
        return current

    for candle in sorted(candles, key=lambda x: str(x["time"])):
        status = current.get("status")
        candle_date = str(candle["time"])[:10]
        if status == "PENDING_D1":
            if candle_date < str(current["tradingDate"]):
                continue
            high = float(candle["high"]); low = float(candle["low"]); opening = float(candle["open"])
            high_broken = high > float(current["setupHigh"])
            low_broken = low < float(current["setupLow"])
            if high_broken and low_broken:
                current.update(status="AMBIGUOUS", ambiguity="HIGH_AND_LOW_BROKEN_SAME_CANDLE", statusUpdatedAt=candle["time"], updatedAt=candle["time"])
                break
            if low_broken:
                current.update(status="INVALIDATED", invalidationTime=candle["time"], statusUpdatedAt=candle["time"], updatedAt=candle["time"])
                break
            if high_broken or opening > float(current["setupHigh"]):
                actual = opening if opening > float(current["setupHigh"]) else float(current["setupHigh"])
                risk = actual - float(current["setupLow"])
                qty = int(100000 // actual) if actual > 0 else 0
                current.update(status="TRIGGERED", actualEntry=round(actual, 4), quantity=qty,
                                deployedCapital=round(qty * actual, 4), riskPerShare=round(risk, 4),
                                riskAmount=round(qty * risk, 4), target1R=round(actual + risk, 4),
                                entryReason="GAP_UP_OPEN" if opening > float(current["setupHigh"]) else "HIGH_BREAK",
                                entryTime=candle["time"], statusUpdatedAt=candle["time"], updatedAt=candle["time"])
                continue
        elif status == "TRIGGERED":
            if str(candle["time"]) <= str(current.get("entryTime") or ""):
                continue
            high = float(candle["high"]); low = float(candle["low"])
            target = float(current["target1R"]); stop = float(current["setupLow"])
            target_hit = high >= target; stop_hit = low <= stop
            if target_hit and stop_hit:
                current.update(status="AMBIGUOUS_EXIT", ambiguity="TARGET_AND_STOP_SAME_CANDLE", statusUpdatedAt=candle["time"], updatedAt=candle["time"])
                break
            if stop_hit:
                current.update(status="STOP_LOSS", exitPrice=round(stop, 4), exitTime=candle["time"], resultR=-1, statusUpdatedAt=candle["time"], updatedAt=candle["time"])
                break
            if target_hit:
                current.update(status="TARGET_HIT", exitPrice=round(target, 4), exitTime=candle["time"], resultR=1, statusUpdatedAt=candle["time"], updatedAt=candle["time"])
                break
    return current


def main():
    today = dt.datetime.now(IST).date().isoformat()
    state = get("/api/ath/state")
    setups = [x for x in state.get("tradeSetups", []) if str(x.get("setupDate", "")) < today and x.get("status") not in TERMINAL]
    if not setups:
        print("No older unresolved ATH setups need reconciliation.")
        return

    token_map = build_token_map()
    smart = login()
    repairs = []
    stats = {}

    for i, setup in enumerate(setups, 1):
        symbol = setup.get("symbol")
        token = token_map.get(symbol)
        if not token:
            print(f"[{i}/{len(setups)}] {symbol}: SKIP, no current NSE/Angel token")
            continue
        start = setup.get("tradingDate") or setup.get("setupDate")
        try:
            candles = angel_candles(smart, token, start, today)
            repaired = apply_local(setup, candles)
            old = setup.get("status"); new = repaired.get("status")
            print(f"[{i}/{len(setups)}] {symbol}: {old} -> {new} ({len(candles)} x 1m candles)")
            stats[new] = stats.get(new, 0) + 1
            if new != old:
                patch = {"id": setup["id"], "status": new}
                for key in ["actualEntry", "quantity", "deployedCapital", "riskPerShare", "riskAmount", "target1R", "entryReason", "entryTime", "invalidationTime", "exitTime", "exitPrice", "resultR", "ambiguity", "statusUpdatedAt", "updatedAt"]:
                    if key in repaired:
                        patch[key] = repaired[key]
                repairs.append(patch)
        except Exception as exc:
            print(f"[{i}/{len(setups)}] {symbol}: ERROR {exc}")
        time.sleep(1.05)

    print("\nProposed changes:")
    print(json.dumps(repairs, indent=2))
    if not repairs:
        print("No status changes proposed. Nothing was written.")
        return

    result = post("/api/ath/reconcile", {"confirm": "ATH_RECONCILE_2026", "repairs": repairs})
    print("\nATH reconciliation result:")
    print(json.dumps(result, indent=2))
    print("\nStatus summary:", json.dumps(stats, sort_keys=True))


if __name__ == "__main__":
    main()
