# CarbonCreditFarm — AI-Driven Carbon Credit Farming Platform

Major-project platform connecting **small-farm GPS mapping**, **soil data**, **machine-learning Soil Organic Carbon (SOC) prediction**, **IPCC carbon accounting**, **admin verification**, **academic blockchain certification**, and a **company marketplace**.

This is not a formula that says “1% SOC = N credits”. The ML model is trained on **real ISRIC WoSIS-latest laboratory organic carbon observations**. Random Forest was selected after comparing Linear / RF / GBM / XGBoost on a held-out test set (test R² ≈ 0.57). XGBoost was **not** assumed to be best.

## Architecture

```
Farmer (React)
   → Node.js / Express API
        → MongoDB Atlas (or in-memory Mongo for local demo)
        → Python FastAPI AI service → saved SOC model
        → IPCC carbon accounting module
        → Blockchain hash ledger (Ganache-ready Solidity)
```

GPS mapping (small parcels, no remote sensing):

```
Smartphone GPS → Browser Geolocation API → React + Leaflet.js + OpenStreetMap
→ Turf.js area (m², ha, acres, guntha) → Express → MongoDB
```

## Quick start

```bash
# 1) Python AI (after datasets + training, or use committed model artifacts)
cd ai-module
pip install -r requirements.txt
python data/collect_wosis.py          # real WoSIS download (WFS)
python preprocessing/clean_and_merge.py
python training/train_models.py
PYTHONPATH=. uvicorn app:app --host 0.0.0.0 --port 43122

# 2) Backend
cd backend
npm install
# optional: export MONGODB_URI="your Atlas URI"
npm start                             # http://127.0.0.1:43121

# 3) Frontend
cd frontend
npm install
npm run dev                           # http://127.0.0.1:43123
```

From the repo root you can also run:

```bash
npm install
npm run dev
```

## Demo login (password)

| Role | Mobile | Email | Password |
| --- | --- | --- | --- |
| Farmer | 9876543210 | ramesh@example.com | Farm@123 |
| Admin | 9999900000 | admin@carboncreditfarm.in | Admin@123 |
| Company | 9888800001 | buy@greentech.example | Company@123 |

Farm GPS boundary mapping is unchanged. Login no longer uses OTP.

## AI contribution

See [ai-module/README_AI.md](ai-module/README_AI.md).

- **Source:** ISRIC WoSIS-latest (standardised soil profiles)
- **Target:** `soc_percent` = ORGC (g/kg) / 10
- **Rows used for training:** 30,881 topsoil layers (upper depth ≤ 30 cm), including Indian profiles retained from WoSIS (Karnataka bounding-box count is reported in the quality JSON; it is not fabricated)
- **Models compared:** Linear Regression, Random Forest, Gradient Boosting, XGBoost
- **Selected model (by validation R², not assumed):** Random Forest Regressor
- **Held-out test:** R² ≈ 0.57, MAE ≈ 0.47 SOC %, RMSE ≈ 1.36 SOC % (see `models/experiment_results.csv` for the exact run)
- **SOC change:** computed in the app from farmer BEFORE/AFTER stages — WoSIS has no fabricated pairs

## Carbon accounting

IPCC 2006 AFOLU soil carbon stock:

`SOC stock (t C ha⁻¹) = SOC(%) × bulk density (g cm⁻³) × depth (cm) × (1 − coarse fragments)`

`CO₂e (t ha⁻¹) = ΔC × 44/12`

One listed credit = 1 t CO₂e, and only after **admin verification**. Statuses: PREDICTED → ESTIMATED → VERIFIED.

## Limitations (read before claiming impact)

1. Browser GPS is not survey-grade.
2. Predicted SOC is not laboratory SOC.
3. Manual soil data is used initially; IoT is schema-compatible, not physically connected.
4. Academic blockchain hashes are not official carbon-market issuance.
5. Farmer NPK in kg/ha is **not** substituted for WoSIS total N (g/kg).
6. Crop / tillage are farm metadata, not secretly injected as fake training columns.

## MongoDB Atlas

Set `MONGODB_URI` to your Atlas connection string. If unset, the API starts an **in-memory MongoDB** so the demo still runs.

## Blockchain

Solidity contract: `blockchain/contracts/CarbonCreditCertificate.sol`.  
Local academic ledger stores payload hashes. Point `GANACHE_RPC` at Ganache when you deploy.
