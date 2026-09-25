"""Read Arduino USB serial JSON and POST pH / moisture / temperature to the API."""

from __future__ import annotations

import json
import os
import sys
import time
import urllib.request

PORT = os.environ.get("ARDUINO_PORT", "/dev/ttyUSB0")
BAUD = int(os.environ.get("ARDUINO_BAUD", "9600"))
API = os.environ.get("CCF_API", "http://127.0.0.1:43121/api/iot/arduino")
KEY = os.environ.get("IOT_API_KEY", "arduino-dev-key")
FARM_ID = os.environ.get("FARM_ID", "")


def post(payload: dict) -> None:
    payload = {**payload, "apiKey": KEY, "farmId": FARM_ID or payload.get("farmId")}
    data = json.dumps(payload).encode()
    req = urllib.request.Request(API, data=data, headers={"Content-Type": "application/json"})
    with urllib.request.urlopen(req, timeout=10) as res:
        print(res.read().decode())


def main() -> None:
    try:
        import serial  # type: ignore
    except ImportError:
        print("pip install pyserial")
        sys.exit(1)
    ser = serial.Serial(PORT, BAUD, timeout=2)
    time.sleep(2)
    print(f"Listening on {PORT} → {API}")
    while True:
        line = ser.readline().decode("utf-8", errors="ignore").strip()
        if not line.startswith("{"):
            continue
        try:
            payload = json.loads(line)
        except json.JSONDecodeError:
            continue
        try:
            post(payload)
        except Exception as exc:  # noqa: BLE001
            print("post failed", exc)


if __name__ == "__main__":
    main()
