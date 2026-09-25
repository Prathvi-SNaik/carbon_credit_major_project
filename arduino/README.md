# Arduino soil station

Hardware this project is wired for:

| Sensor | Role | Arduino |
| --- | --- | --- |
| **EC20-BNC** pH electrode (BNC) on a **PH-4502C** module | pH | A0 |
| Capacitive soil moisture v1.2 | volumetric moisture % | A1 |
| LM35 (or DS18B20) | temperature °C | A2 (or D4) |

1. Flash `soil_station/soil_station.ino` with Arduino IDE.
2. Calibrate pH in buffer 7.00 then 4.00 (`PH_NEUTRAL_VOLTAGE` and `PH_SLOPE`).
3. On the PC that has the USB cable:

```bash
pip install pyserial
export ARDUINO_PORT=/dev/ttyUSB0   # Windows: COM3
export FARM_ID=<mongo farm id>
python serial_bridge.py
```

The bridge posts to `POST /api/iot/arduino` (`apiKey=arduino-dev-key`). The farmer Soil page then runs **Save from Arduino + ML**, which keeps pH/moisture/temperature from the board and predicts EC, N, P, K, texture and SOC for the mapped GPS place.

Without a board plugged in, use **Simulate Arduino packet** on that page.
