# Gap analysis (empty repo → this build)

The repository started as an empty root commit. Nothing was deleted.

| Feature | Current status | Missing part | Required change | Priority |
| --- | --- | --- | --- | --- |
| Real SOC dataset | Implemented: WoSIS-latest WFS collector | ESDAC LUCAS (needs registration) | Keep separate if added | P0 |
| Cleaning / merge / quality report | Implemented | — | — | P0 |
| Multi-model training + CV | Implemented | SHAP (optional, heavy) | Add if evaluators want | P0 |
| Saved model + FastAPI | Implemented | — | — | P0 |
| OTP roles | Implemented (demo OTP displayed) | SMS gateway | Not required for academic demo | P1 |
| Farm / documents / GPS | Implemented (Leaflet, OSM, Turf, Geolocation) | Survey-grade GNSS | Documented limitation | P1 |
| Admin verification | Implemented | — | — | P1 |
| Soil before/after + IoT schema | Implemented | Physical ESP32 | `/api/iot/readings` stub | P1 |
| Carbon accounting IPCC | Implemented | Site-specific BD/CF | Defaults flagged | P1 |
| Blockchain | Solidity + hash ledger | Live Ganache deploy in this environment | Set GANACHE_RPC | P2 |
| Marketplace / purchase | Implemented | Retirement registry | Optional | P2 |
| MongoDB Atlas | URI supported, memory fallback | User Atlas credentials | Export MONGODB_URI | P1 |
| Diagrams | docs/ARCHITECTURE.md | Printed IEEE templates | Use for report | P2 |
