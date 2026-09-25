# System architecture and diagrams

## Context

```mermaid
flowchart LR
  Farmer --> React
  Company --> React
  Admin --> React
  React --> Express
  Express --> Mongo[(MongoDB Atlas)]
  Express --> FastAPI
  FastAPI --> Model[final_soc_model.pkl]
  Express --> Accounting[IPCC carbon accounting]
  Express --> Chain[Certificate hashes]
```

## Farmer to credit

```mermaid
flowchart TD
  A[Register + OTP] --> B[Farm details]
  B --> C[Documents]
  C --> D[Walk GPS boundary]
  D --> E[Admin verify farmer]
  E --> F[BEFORE soil]
  F --> G[AFTER soil]
  G --> H[AI SOC prediction]
  H --> I[IPCC accounting]
  I --> J[Admin verify carbon]
  J --> K[Blockchain hash]
  K --> L[Marketplace]
  L --> M[Company purchase]
```

## GPS (small land)

```mermaid
flowchart TD
  P[Smartphone] --> GPS[GNSS]
  GPS --> GEO[Browser Geolocation API]
  GEO --> R[React + Leaflet + OSM]
  R --> T[Turf.js polygon area]
  T --> API[Express]
  API --> DB[(MongoDB)]
```

## AI dataset pipeline

```mermaid
flowchart TD
  W[WoSIS-latest WFS REAL DATA] --> C[Collect]
  C --> K[Clean / units / invalids]
  K --> M[Merge on layer_id]
  M --> S[Topsoil filter]
  S --> X[Train/val/test grouped by profile]
  X --> TR[LR / RF / GBM / XGBoost]
  TR --> SEL[Select by validation R2]
  SEL --> PKL[Save model + metadata]
```

## IoT (future, same schema)

```
7-in-1 sensor → RS485/Modbus → ESP32 → Wi-Fi → POST /api/iot/readings
→ SoilReading { stage, inputMethod: IOT }
```

## ER (logical)

User (role) 1—N Farm 1—1 FarmBoundary  
Farm 1—N Document, SoilReading, AIResult, CarbonAssessment  
CarbonAssessment 1—1 CarbonCredit 1—N BlockchainTransaction  
CarbonCredit 1—1 MarketplaceListing 1—N Purchase

## DFD level 0

External: Farmer, Admin, Company, WoSIS (training time only).  
Process: CarbonCreditFarm system.  
Stores: MongoDB, model files, academic ledger.

## State: verification

NOT_SUBMITTED → PENDING → APPROVED | REJECTED | CORRECTION_REQUIRED
