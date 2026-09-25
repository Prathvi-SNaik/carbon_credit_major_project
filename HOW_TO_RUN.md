# How to run CarbonCreditFarm

You need **Node.js 18+**, **Python 3.10+**, and **npm**. MongoDB Atlas is optional.

## 1. Unzip

```bash
unzip CarbonCreditFarm-complete.zip
cd CarbonCreditFarm
```

## 2. Python AI service (required for SOC prediction)

The trained model is already in `ai-module/models/`. You do **not** need to retrain to demo.

```bash
cd ai-module
pip install -r requirements.txt
cd ..
set PYTHONPATH=ai-module
python -m uvicorn app:app --app-dir ai-module --host 0.0.0.0 --port 43122
```

Linux / macOS:

```bash
cd ai-module
pip install -r requirements.txt
PYTHONPATH=. python3 -m uvicorn app:app --host 0.0.0.0 --port 43122
```

Keep this terminal open. Health check: http://127.0.0.1:43122/ai/health

## 3. Backend API (new terminal)

```bash
cd backend
npm install
npm start
```

Keep this terminal open. API: http://127.0.0.1:43121/health

If you have MongoDB Atlas, set it before `npm start`:

```bash
set MONGODB_URI=your-atlas-connection-string
```

If `MONGODB_URI` is empty, the API starts an in-memory MongoDB automatically.

## 4. Frontend (new terminal)

```bash
cd frontend
npm install
npm run dev
```

Open **http://127.0.0.1:43123**

### Login (no OTP)

Register with email, mobile and a password. Login with email/mobile + password. GPS farm-boundary mapping is unchanged and still goes to admin.

Demo passwords:

| Role    | Mobile     | Email                         | Password     |
|---------|------------|-------------------------------|--------------|
| Farmer  | 9876543210 | ramesh@example.com            | Farm@123     |
| Admin   | 9999900000 | admin@carboncreditfarm.in     | Admin@123    |
| Company | 9888800001 | buy@greentech.example         | Company@123  |

### Farmer → admin verification (farm, not login)

1. Farmer: farm details → at least one document → GPS 2-guntha boundary → **Next — send to admin**.
2. Login as Admin → Farmer requests → **Approve**.
3. Soil page: Arduino EC20-BNC pH + moisture + temperature, then **Save from Arduino + ML**.

### 2 guntha land

Farm area defaults to **2 guntha**. GPS mapping uses high zoom, 0.35 m point spacing, and tap-to-mark corners so a ~202 m² plot can be recorded.

## Run in VS Code

1. **File → Open Folder** on the unzipped `CarbonCreditFarm` folder.
2. **Terminal → Run Task → Install all** (first time).
3. **Terminal → Run Task → Start CarbonCreditFarm**.
4. Open http://127.0.0.1:43123

Windows: double-click `scripts/start-windows.bat`. Mac/Linux: `bash scripts/start-linux.sh`.

## 5. Demo login (password)

On Login, choose a role, enter mobile or email, and the password.

| Role    | Mobile     | Email                         | Password     |
|---------|------------|-------------------------------|--------------|
| Farmer  | 9876543210 | ramesh@example.com            | Farm@123     |
| Admin   | 9999900000 | admin@carboncreditfarm.in     | Admin@123    |
| Company | 9888800001 | buy@greentech.example         | Company@123  |

Demo flow: Farmer → farm details → documents → GPS walk-boundary → send to admin → Admin approves → soil before/after → AI analysis → Admin certifies carbon → Company buys on marketplace.

## Retrain the AI (optional)

Only if you want to rebuild the model from the real WoSIS files:

```bash
cd ai-module
python data/collect_wosis.py
python preprocessing/clean_and_merge.py
python training/train_models.py
```

Raw WoSIS CSVs are included under `ai-module/data/raw/`. Processed tables are in `ai-module/data/processed/`. The saved model is `ai-module/models/final_soc_model.pkl`.

## What this zip contains

- `frontend/` React dashboards (Leaflet GPS + Turf.js)
- `backend/` Node.js + Express APIs
- `ai-module/` dataset pipeline, trained Random Forest SOC model, FastAPI
- `blockchain/` Solidity certificate contract
- `docs/` architecture, gap analysis, limitations
- Prototype images in `assets/`

`node_modules` is not in the zip. Run `npm install` as above.
