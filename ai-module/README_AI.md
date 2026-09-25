# AI / data-science module

## Why this exists

The core academic contribution is a **soil organic carbon (SOC) prediction model trained on large, real, publicly licensed soil observations**, not a hard-coded carbon formula and not synthetic farm rows.

## Dataset

| Item | Value |
| --- | --- |
| Name | ISRIC **WoSIS-latest** (World Soil Information Service, dynamic standardised snapshot accessed via WFS) |
| Citation | Batjes N.H., Calisto L., de Sousa L.M. WoSIS-latest. ISRIC — World Soil Information. https://www.isric.org/explore/wosis |
| Access | `https://maps.isric.org/mapserv?map=/map/wosis_latest.map` WFS 2.0 GeoJSON |
| Licence | Per-observation `licence` field (CC-BY / CC-BY-NC as provided by data holders). Rows keep `source`, `dataset_name`, `licence`, `country_name`, `date`. |
| Label | **REAL DATA** |

India (and a Karnataka bounding box) is extracted and reported separately. Karnataka-specific laboratory SOC at farm-plot density is not openly published at this scale; we do **not** invent those plots. Global WoSIS profiles supply the large training table, with Indian profiles retained and flagged.

LUCAS 2018 (EU) was considered as a second SOC table (pH, EC, N, P, K, OC) but requires ESDAC registration, so it is **not silently merged**. Merging LUCAS with WoSIS would mix sampling frames; they stay separate if added later.

## Target

`soc_percent = orgc_g_kg / 10`

WoSIS ORGC is gravimetric organic carbon in the fine-earth fraction (g/kg). There are **no genuine before/after farm pairs** in this table, so **SOC change is not trained and not fabricated**.

The web app:

1. Predicts SOC from a soil reading (typically AFTER_FARMING).
2. Uses measured SOC before if the farmer entered it, otherwise a second prediction on the BEFORE reading.
3. Subtracts those values in the **carbon accounting** module.

## Features actually used

From WoSIS (only columns that exist after the join on `layer_id`):

- pH (water)
- clay / sand / silt %
- total nitrogen (Kjeldahl, g/kg)
- oven-dry bulk density
- electrical conductivity (elco25)
- horizon depth (mid-point and thickness)
- latitude, longitude
- USDA texture class (derived from sand/silt/clay, not invented)
- continent / India vs other region group

**Not used (not in WoSIS):** crop, irrigation, tillage, manure, farmer NPK kg/ha, soil moisture, soil temperature.

## Pipeline

```
REAL WoSIS WFS
 → collect_wosis.py
 → clean_and_merge.py (units, invalids, duplicates, quality report)
 → train_models.py (70/15/15 + GroupKFold by profile_id)
 → Linear / RF / GBM / XGBoost comparison
 → light randomised hyperparameter search on the winner
 → feature importance
 → models/final_soc_model.pkl + model_metadata.json + experiment_results.csv
 → FastAPI /ai/predict (loads pickle, does not retrain)
```

## How to train

```bash
pip install -r requirements.txt
python data/collect_wosis.py
python preprocessing/clean_and_merge.py
python training/train_models.py
PYTHONPATH=. uvicorn app:app --port 43122
```

Metrics in the farmer dashboard are read from `model_metadata.json` — they are whatever the training run produced.

Trained table: **30,881** real topsoil layers. Final selected model in the last run: **RandomForestRegressor** (test R² 0.569, MAE 0.47, RMSE 1.36). Linear, GBM and XGBoost were all trained; XGBoost was not the winner.

## Limitations

Pedotransfer from a global profile database will not replace a district soil-health laboratory. Coverage is uneven. Organic soils (very high ORGC) are clipped at 600 g/kg. Spatial leakage is reduced by grouping horizons of the same `profile_id`, not by spatial blocking of neighbouring profiles.
