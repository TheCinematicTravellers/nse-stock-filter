from dotenv import load_dotenv
load_dotenv()

import csv
import io
import json
import os
import threading

import pyotp
from SmartApi import SmartConnect
from SmartApi.smartWebSocketV2 import SmartWebSocketV2

from ws_utils import subscribe_in_batches


def build_csv(instruments, prices):
    output = io.StringIO(newline="")
    writer = csv.writer(output, lineterminator="\n")
    writer.writerow(["Stock", "Token", "CMP"])
    for item in instruments:
        token = str(item["token"])
        cmp_value = prices.get(token)
        writer.writerow([
            item["symbol"],
            token,
            "" if cmp_value is None else f"{float(cmp_value):.2f}",
        ])
    return output.getvalue()


def main():
    api_key = os.environ.get("ANGEL_API_KEY", "")
    client = os.environ.get("ANGEL_CLIENT_CODE", "")
    password = os.environ.get("ANGEL_PASSWORD", "")
    totp_secret = os.environ.get("ANGEL_TOTP_SECRET", "")
    instruments_file = os.environ.get("INSTRUMENTS_FILE", "instruments.json")
    output_file = os.environ.get("CMP_CSV_FILE", "208_stocks_cmp.csv")

    if not all([api_key, client, password, totp_secret]):
        raise SystemExit("Set ANGEL_API_KEY, ANGEL_CLIENT_CODE, ANGEL_PASSWORD and ANGEL_TOTP_SECRET first.")

    with open(instruments_file, encoding="utf-8") as f:
        instruments = json.load(f)
    if not instruments:
        raise SystemExit("No instruments configured.")

    smart = SmartConnect(api_key=api_key)
    session = smart.generateSession(client, password, pyotp.TOTP(totp_secret).now())
    auth = session["data"]["jwtToken"]
    feed = session["data"]["feedToken"]

    prices = {}
    done = threading.Event()
    lock = threading.Lock()
    by_token = {str(item["token"]): item["symbol"] for item in instruments}
    ws = SmartWebSocketV2(auth, api_key, client, feed)

    def on_data(data):
        try:
            token = str(data["token"])
            if token not in by_token:
                return
            price = float(data["last_traded_price"]) / 100.0
            with lock:
                prices[token] = price
                count = len(prices)
            print(f"CMP {count}/{len(instruments)} {by_token[token]}: {price:.2f}", flush=True)
            if count == len(instruments):
                done.set()
        except Exception as exc:
            print(f"tick error: {exc}", flush=True)

    def on_open(wsapp):
        print(f"Connected. Subscribing {len(instruments)} symbols.", flush=True)
        subscribe_in_batches(ws, instruments, batch_size=50)
        print("Subscription requests sent. Waiting for CMP values...", flush=True)

    def on_error(wsapp, error):
        print(f"WS error: {error}", flush=True)
        done.set()

    def on_close(wsapp, close_status_code, close_msg):
        print(f"WS closed: {close_status_code} {close_msg}", flush=True)
        done.set()

    ws.on_data = lambda wsapp, data, data_type=None, continue_flag=None: on_data(data)
    ws.on_open = on_open
    ws.on_error = on_error
    ws.on_close = on_close

    ws.connect()
    done.wait(timeout=30)

    with lock:
        snapshot = dict(prices)

    text = build_csv(instruments, snapshot)
    with open(output_file, "w", encoding="utf-8", newline="") as f:
        f.write(text)

    missing = len(instruments) - len(snapshot)
    print(f"Wrote {len(instruments)} rows to {output_file}. CMP received: {len(snapshot)}. Missing: {missing}.", flush=True)

    try:
        ws.close_connection()
    except Exception:
        pass


if __name__ == "__main__":
    main()
