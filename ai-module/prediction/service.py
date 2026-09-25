"""Load the trained SOC model and run a single prediction."""

from __future__ import annotations

import json
from pathlib import Path

import joblib
import numpy as np
import pandas as pd

ROOT = Path(__file__).resolve().parents[1]
MODELS = ROOT / "models"

_PIPE = None
_META = None

SOIL_TYPE_TO_TEXTURE = {
    "alluvial": "loam",
    "black": "clay",
    "regur": "clay",
    "vertisol": "clay",
    "red": "sandy_clay_loam",
    "laterite": "clay_loam",
    "desert": "sandy_loam",
    "mountain": "loam",
    "forest": "silt_loam",
    "coastal": "sandy_loam",
    "peaty": "silty_clay",
    "saline": "sandy_loam",
    "sandy": "sand",
    "clayey": "clay",
    "loamy": "loam",
}


def load():
    global _PIPE, _META
    if _PIPE is None:
        _PIPE = joblib.load(MODELS / "final_soc_model.pkl")
        _META = json.loads((MODELS / "model_metadata.json").read_text())
    return _PIPE, _META


def predict(payload: dict) -> dict:
    pipe, meta = load()
    soil_type = str(payload.get("soil_type") or payload.get("soilType") or "unknown").strip().lower()
    texture = payload.get("soil_texture") or SOIL_TYPE_TO_TEXTURE.get(soil_type, "unknown")
    row = {
        "ph_h2o": _num(payload.get("ph")),
        "clay_pct": _num(payload.get("clay")),
        "sand_pct": _num(payload.get("sand")),
        "silt_pct": _num(payload.get("silt")),
        "n_g_kg": _num(payload.get("n_g_kg")),
        "bulk_density_g_cm3": _num(payload.get("bulk_density") or payload.get("bulkDensity") or 1.3),
        "ec_ds_m": _num(payload.get("ec")),
        "depth_mid_cm": _num(payload.get("depth_cm") or payload.get("soilDepth") or 15) / 1.0,
        "depth_thickness_cm": _num(payload.get("depth_cm") or payload.get("soilDepth") or 15),
        "latitude": _num(payload.get("latitude")),
        "longitude": _num(payload.get("longitude")),
        "soil_texture": texture,
        "continent": payload.get("continent") or "Asia",
        "region_group": "India" if str(payload.get("country") or "India") == "India" else payload.get("continent") or "unknown",
    }
    X = pd.DataFrame([row])
    pred = float(pipe.predict(X)[0])
    pred = float(np.clip(pred, 0.01, 30.0))

    model = pipe.named_steps["model"]
    pre = pipe.named_steps["pre"]
    names = list(pre.get_feature_names_out())
    if hasattr(model, "feature_importances_"):
        imp = model.feature_importances_
        importance = sorted(
            [{"feature": n.replace("num__", "").replace("cat__", ""), "importance": round(float(v), 4)} for n, v in zip(names, imp)],
            key=lambda x: x["importance"],
            reverse=True,
        )[:8]
    else:
        importance = meta.get("feature_importance_top15", [])[:8]

    # Tree-based uncertainty: std of trees if available
    uncertainty = None
    try:
        Xt = pre.transform(X)
        if hasattr(model, "estimators_"):
            preds = np.array([est.predict(Xt)[0] for est in np.ravel(model.estimators_)[:80]])
            uncertainty = float(np.std(preds))
        elif hasattr(model, "get_booster"):
            uncertainty = None
    except Exception:
        uncertainty = None

    features_sent = {}
    for key, value in row.items():
        if pd.isna(value):
            features_sent[key] = None
        elif isinstance(value, np.generic):
            features_sent[key] = value.item()
        else:
            features_sent[key] = value

    return {
        "predicted_soc_percent": round(pred, 3),
        "unit": "%",
        "data_label": "MODEL PREDICTION FROM REAL TRAINING DATA",
        "model_name": meta.get("model_name"),
        "model_version": meta.get("version"),
        "dataset": meta.get("training_dataset"),
        "dataset_version": meta.get("dataset_version"),
        "metrics": meta.get("metrics_test"),
        "feature_importance": importance,
        "uncertainty_std": uncertainty,
        "features_sent": features_sent,
        "notes": [
            "Predicted SOC is not laboratory-measured SOC.",
            "Crop and kg/ha NPK are excluded because they are not in the WoSIS training table.",
        ],
    }


def _num(v):
    if v is None or v == "":
        return np.nan
    try:
        return float(v)
    except (TypeError, ValueError):
        return np.nan
