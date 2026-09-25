"""Train a multi-output Random Forest to fill soil properties from place + Arduino sensors."""

from __future__ import annotations

import json
from datetime import datetime, timezone
from pathlib import Path

import joblib
import numpy as np
import pandas as pd
from sklearn.compose import ColumnTransformer
from sklearn.ensemble import ExtraTreesRegressor, RandomForestRegressor
from sklearn.impute import SimpleImputer
from sklearn.metrics import mean_absolute_error, r2_score
from sklearn.model_selection import train_test_split
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import OneHotEncoder

from data.build_india_sensor_table import build

ROOT = Path(__file__).resolve().parents[1]
MODELS = ROOT / "models"
MODELS.mkdir(parents=True, exist_ok=True)

NUMERIC = ["ph", "moisture", "temperature", "latitude", "longitude", "month", "rainfall_mm", "elevation_m", "soil_depth"]
CATEGORICAL = ["soil_type", "state"]
TARGETS = ["ec", "nitrogen", "phosphorus", "potassium", "clay_pct", "sand_pct", "silt_pct", "soc_percent"]


def _scores(y_true, y_pred, names):
    out = {}
    for i, name in enumerate(names):
        out[name] = {
            "R2": float(r2_score(y_true[:, i], y_pred[:, i])),
            "MAE": float(mean_absolute_error(y_true[:, i], y_pred[:, i])),
        }
    out["mean_R2"] = float(np.mean([out[n]["R2"] for n in names]))
    return out


def main():
    df = build()
    X = df[NUMERIC + CATEGORICAL]
    y = df[TARGETS].to_numpy()
    Xtr, Xte, ytr, yte = train_test_split(X, y, test_size=0.2, random_state=7)

    pre = ColumnTransformer(
        [
            ("num", SimpleImputer(strategy="median"), NUMERIC),
            (
                "cat",
                Pipeline(
                    [
                        ("imp", SimpleImputer(strategy="most_frequent")),
                        ("oh", OneHotEncoder(handle_unknown="ignore")),
                    ]
                ),
                CATEGORICAL,
            ),
        ]
    )

    candidates = {
        "RandomForest": RandomForestRegressor(n_estimators=90, min_samples_leaf=2, random_state=7, n_jobs=-1),
        "ExtraTrees": ExtraTreesRegressor(n_estimators=120, min_samples_leaf=2, random_state=7, n_jobs=-1),
    }

    comparison = []
    best_name, best_pipe, best_mean = None, None, -1e9
    for name, model in candidates.items():
        pipe = Pipeline([("pre", pre), ("model", model)])
        pipe.fit(Xtr, ytr)
        sc = _scores(yte, pipe.predict(Xte), TARGETS)
        comparison.append({"model": name, "mean_R2": sc["mean_R2"], "per_target": {n: sc[n] for n in TARGETS}})
        if sc["mean_R2"] > best_mean:
            best_mean, best_name, best_pipe = sc["mean_R2"], name, pipe

    joblib.dump(best_pipe, MODELS / "soil_fill_model.pkl")
    meta = {
        "model_name": best_name,
        "version": "soil-fill-place-v1",
        "trained_at": datetime.now(timezone.utc).isoformat(),
        "targets": TARGETS,
        "features_numeric": NUMERIC,
        "features_categorical": CATEGORICAL,
        "n_rows": int(len(df)),
        "arduino_inputs": ["ph", "moisture", "temperature"],
        "place_criteria": ["latitude", "longitude", "state", "soil_type", "month", "rainfall_mm", "elevation_m"],
        "training_dataset": "India agro-ecological Monte-Carlo table (NBSS&LUP/ICAR typical ranges + seasonal climate)",
        "metrics_test": next(c for c in comparison if c["model"] == best_name),
        "model_comparison": comparison,
        "notes": [
            "Arduino measures pH (EC20-BNC), moisture and temperature.",
            "Remaining properties are predicted for the mapped farm location.",
            "Not a laboratory soil-test certificate.",
        ],
    }
    (MODELS / "soil_fill_metadata.json").write_text(json.dumps(meta, indent=2))
    print(json.dumps(comparison, indent=2))
    print("selected", best_name, "mean_R2", best_mean)


if __name__ == "__main__":
    main()
