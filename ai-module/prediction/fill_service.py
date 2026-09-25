"""Fill EC, NPK, texture and SOC from place + Arduino pH/moisture/temperature."""

from __future__ import annotations

import json
from pathlib import Path

import joblib
import pandas as pd

ROOT = Path(__file__).resolve().parents[1]
MODELS = ROOT / "models"

_PIPE = None
_META = None

STATE_CLIMATE = {
    "Karnataka": (800, 700),
    "Tamil Nadu": (900, 200),
    "Andhra Pradesh": (900, 150),
    "Telangana": (900, 350),
    "Kerala": (2800, 100),
    "Maharashtra": (900, 400),
    "Gujarat": (700, 80),
    "Rajasthan": (500, 350),
    "Punjab": (700, 250),
    "Haryana": (650, 240),
    "Uttar Pradesh": (950, 120),
    "Bihar": (1100, 60),
    "West Bengal": (1600, 30),
    "Odisha": (1450, 40),
    "Madhya Pradesh": (1100, 450),
    "Chhattisgarh": (1300, 300),
    "Jharkhand": (1300, 600),
    "Assam": (2200, 100),
}


def load_fill():
    global _PIPE, _META
    if _PIPE is None:
        _PIPE = joblib.load(MODELS / "soil_fill_model.pkl")
        _META = json.loads((MODELS / "soil_fill_metadata.json").read_text())
    return _PIPE, _META


def fill_properties(payload: dict) -> dict:
    pipe, meta = load_fill()
    state = payload.get("state") or "Karnataka"
    rain, elev = STATE_CLIMATE.get(state, (900, 300))
    if payload.get("rainfall_mm") is not None:
        rain = payload["rainfall_mm"]
    if payload.get("elevation_m") is not None:
        elev = payload["elevation_m"]
    row = {
        "ph": _num(payload.get("ph"), 6.5),
        "moisture": _num(payload.get("moisture"), 22),
        "temperature": _num(payload.get("temperature"), 27),
        "latitude": _num(payload.get("latitude"), 12.3),
        "longitude": _num(payload.get("longitude"), 76.64),
        "month": int(_num(payload.get("month"), 6)),
        "rainfall_mm": float(rain),
        "elevation_m": float(elev),
        "soil_depth": _num(payload.get("soil_depth") or payload.get("soilDepth"), 15),
        "soil_type": payload.get("soil_type") or payload.get("soilType") or "Red",
        "state": state,
    }
    pred = pipe.predict(pd.DataFrame([row]))[0]
    names = meta["targets"]
    props = {n: round(float(pred[i]), 3) for i, n in enumerate(names)}
    return {
        "properties": props,
        "arduino": {"ph": row["ph"], "moisture": row["moisture"], "temperature": row["temperature"]},
        "place": {"latitude": row["latitude"], "longitude": row["longitude"], "state": state, "soil_type": row["soil_type"], "month": row["month"]},
        "model_name": meta.get("model_name"),
        "model_version": meta.get("version"),
        "dataset": meta.get("training_dataset"),
        "metrics": meta.get("metrics_test"),
        "notes": meta.get("notes"),
    }


def _num(v, default=None):
    if v is None or v == "":
        return default
    try:
        return float(v)
    except (TypeError, ValueError):
        return default
