"""FastAPI SOC prediction service — loads the saved model, never retrains."""

from __future__ import annotations

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
from typing import Optional

from prediction.service import load, predict
from prediction.fill_service import fill_properties, load_fill

app = FastAPI(title="CarbonCreditFarm AI", version="1.0.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


class PredictIn(BaseModel):
    ph: Optional[float] = None
    ec: Optional[float] = None
    n_g_kg: Optional[float] = None
    clay: Optional[float] = None
    sand: Optional[float] = None
    silt: Optional[float] = None
    bulk_density: Optional[float] = Field(default=1.3)
    depth_cm: Optional[float] = 15
    latitude: Optional[float] = None
    longitude: Optional[float] = None
    soil_type: Optional[str] = None
    country: Optional[str] = "India"
    continent: Optional[str] = "Asia"


class FillIn(BaseModel):
    ph: Optional[float] = None
    moisture: Optional[float] = None
    temperature: Optional[float] = None
    latitude: Optional[float] = None
    longitude: Optional[float] = None
    state: Optional[str] = None
    district: Optional[str] = None
    soil_type: Optional[str] = None
    month: Optional[int] = None
    rainfall_mm: Optional[float] = None
    elevation_m: Optional[float] = None
    soil_depth: Optional[float] = 15


@app.get("/ai/health")
def health():
    out = {"ok": True}
    try:
        _, meta = load()
        out["soc_model"] = meta.get("model_name")
    except Exception as exc:  # noqa: BLE001
        out["soc_model_error"] = str(exc)
    try:
        _, fmeta = load_fill()
        out["fill_model"] = fmeta.get("model_name")
        out["fill_version"] = fmeta.get("version")
    except Exception as exc:  # noqa: BLE001
        out["ok"] = False
        out["fill_error"] = str(exc)
    return out


@app.get("/ai/model")
def model_info():
    try:
        _, fmeta = load_fill()
        return fmeta
    except Exception:
        pass
    try:
        _, meta = load()
        return meta
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(503, f"Model not trained yet: {exc}") from exc


@app.post("/ai/predict")
def ai_predict(body: PredictIn):
    try:
        return predict(body.model_dump())
    except FileNotFoundError:
        filled = fill_properties(
            {
                "ph": body.ph,
                "latitude": body.latitude,
                "longitude": body.longitude,
                "soil_type": body.soil_type,
            }
        )
        soc = filled["properties"]["soc_percent"]
        return {
            "predicted_soc_percent": soc,
            "unit": "%",
            "data_label": "PLACE-BASED FILL MODEL SOC",
            "model_name": filled["model_name"],
            "model_version": filled["model_version"],
            "dataset": filled["dataset"],
            "metrics": filled["metrics"],
            "feature_importance": [],
            "features_sent": filled["place"],
            "notes": filled["notes"],
        }
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(400, str(exc)) from exc


@app.post("/ai/fill-properties")
def ai_fill(body: FillIn):
    try:
        return fill_properties(body.model_dump())
    except FileNotFoundError as exc:
        raise HTTPException(503, "Fill model missing. Run python training/train_sensor_fill.py") from exc
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(400, str(exc)) from exc
