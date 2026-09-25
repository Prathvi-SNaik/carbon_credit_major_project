"""India multi-criteria soil table for filling properties the Arduino does not measure.

Arduino (hardware): pH via EC20-BNC on a PH-4502C analog module, volumetric moisture,
and temperature.

This table does NOT invent WoSIS laboratory rows. It encodes published typical ranges
for Indian agro-ecological settings (NBSS&LUP / ICAR soil-order behaviour, IMD rainfall
normals, FAO salinity classes) so a regressor can map:

  place (lat, lng, state, district, soil type, month, rainfall, elevation)
  + live Arduino (pH, moisture, temperature)
  → EC, N, P, K, texture fractions, SOC

Each site is sampled across 12 months with correlated noise so seasonal moisture and
temperature remain physically consistent with rainfall and latitude.
"""

from __future__ import annotations

from pathlib import Path

import numpy as np
import pandas as pd

ROOT = Path(__file__).resolve().parents[1]
PROC = ROOT / "data" / "processed"
PROC.mkdir(parents=True, exist_ok=True)

# Typical ranges compiled from ICAR-NBSS&LUP soil-order summaries and IMD rainfall normals.
SITES = [
    # state, district, lat, lng, soil, rain_mm, elev_m, ph_lo, ph_hi, clay, sand, oc, n, p, k, ec
    ("Karnataka", "Mysuru", 12.30, 76.64, "Red", 800, 770, 5.8, 7.2, 28, 48, 0.7, 240, 18, 160, 0.25),
    ("Karnataka", "Mandya", 12.52, 76.90, "Red", 700, 678, 6.0, 7.4, 26, 50, 0.6, 220, 16, 150, 0.30),
    ("Karnataka", "Tumakuru", 13.34, 77.10, "Red", 650, 822, 5.6, 7.0, 24, 55, 0.5, 190, 12, 140, 0.22),
    ("Karnataka", "Ballari", 15.14, 76.92, "Black (Regur)", 550, 449, 7.2, 8.4, 48, 22, 0.6, 210, 14, 280, 0.55),
    ("Karnataka", "Udupi", 13.34, 74.74, "Laterite", 3500, 39, 4.8, 6.2, 32, 40, 1.4, 280, 8, 90, 0.18),
    ("Karnataka", "Kodagu", 12.34, 75.81, "Forest", 2700, 1150, 5.2, 6.5, 30, 35, 2.2, 340, 10, 180, 0.15),
    ("Tamil Nadu", "Thanjavur", 10.79, 79.14, "Alluvial", 1000, 57, 6.5, 7.8, 30, 42, 0.8, 260, 22, 170, 0.40),
    ("Tamil Nadu", "Coimbatore", 11.02, 76.96, "Red", 700, 411, 6.2, 7.6, 27, 50, 0.55, 200, 15, 155, 0.28),
    ("Tamil Nadu", "Madurai", 9.93, 78.12, "Red", 850, 136, 6.0, 7.5, 25, 52, 0.5, 185, 14, 145, 0.32),
    ("Tamil Nadu", "Nilgiris", 11.41, 76.70, "Forest", 1800, 2240, 5.0, 6.4, 28, 38, 2.4, 360, 11, 200, 0.12),
    ("Andhra Pradesh", "Guntur", 16.31, 80.44, "Black (Regur)", 850, 30, 7.4, 8.6, 50, 20, 0.7, 230, 16, 300, 0.70),
    ("Andhra Pradesh", "Anantapur", 14.68, 77.60, "Red", 550, 335, 6.4, 8.0, 22, 58, 0.35, 150, 10, 130, 0.35),
    ("Andhra Pradesh", "West Godavari", 16.92, 81.78, "Alluvial", 1100, 14, 6.2, 7.5, 32, 40, 0.9, 270, 24, 180, 0.45),
    ("Telangana", "Warangal", 17.97, 79.59, "Red", 900, 302, 6.0, 7.6, 28, 48, 0.6, 210, 13, 160, 0.30),
    ("Telangana", "Nizamabad", 18.67, 78.09, "Black (Regur)", 1000, 395, 7.0, 8.3, 46, 24, 0.75, 240, 15, 270, 0.50),
    ("Kerala", "Palakkad", 10.79, 76.65, "Laterite", 1800, 84, 5.0, 6.4, 34, 38, 1.3, 300, 7, 110, 0.16),
    ("Kerala", "Alappuzha", 9.50, 76.33, "Coastal", 2700, 3, 4.8, 6.2, 22, 55, 1.1, 250, 9, 95, 1.80),
    ("Kerala", "Idukki", 9.85, 76.97, "Forest", 2500, 1200, 5.0, 6.3, 30, 36, 2.6, 380, 9, 190, 0.14),
    ("Maharashtra", "Nagpur", 21.15, 79.09, "Black (Regur)", 1100, 310, 7.2, 8.4, 52, 18, 0.65, 220, 14, 310, 0.48),
    ("Maharashtra", "Pune", 18.52, 73.86, "Black (Regur)", 700, 560, 7.0, 8.2, 44, 26, 0.55, 200, 13, 260, 0.42),
    ("Maharashtra", "Nashik", 19.99, 73.79, "Black (Regur)", 800, 584, 7.1, 8.3, 45, 25, 0.6, 205, 12, 250, 0.40),
    ("Maharashtra", "Ratnagiri", 16.99, 73.31, "Laterite", 3000, 11, 5.0, 6.4, 30, 42, 1.5, 290, 8, 100, 0.20),
    ("Gujarat", "Anand", 22.56, 72.95, "Alluvial", 850, 39, 7.2, 8.4, 28, 48, 0.5, 180, 20, 190, 0.80),
    ("Gujarat", "Kutch", 23.24, 69.67, "Sandy", 350, 8, 7.8, 9.0, 12, 72, 0.22, 90, 8, 110, 2.40),
    ("Rajasthan", "Jaipur", 26.91, 75.79, "Sandy", 550, 431, 7.6, 8.8, 14, 70, 0.25, 100, 9, 120, 0.90),
    ("Rajasthan", "Udaipur", 24.59, 73.71, "Red", 650, 598, 6.8, 8.2, 24, 54, 0.4, 140, 11, 150, 0.50),
    ("Punjab", "Ludhiana", 30.90, 75.86, "Alluvial", 700, 247, 7.2, 8.4, 26, 50, 0.45, 170, 28, 200, 0.60),
    ("Haryana", "Karnal", 29.69, 76.99, "Alluvial", 700, 252, 7.4, 8.6, 27, 48, 0.4, 160, 26, 210, 0.75),
    ("Uttar Pradesh", "Varanasi", 25.32, 82.97, "Alluvial", 1000, 81, 6.8, 8.0, 30, 44, 0.55, 200, 22, 185, 0.50),
    ("Uttar Pradesh", "Lucknow", 26.85, 80.95, "Alluvial", 900, 123, 7.0, 8.2, 28, 46, 0.5, 190, 20, 180, 0.55),
    ("Bihar", "Patna", 25.59, 85.14, "Alluvial", 1100, 53, 6.6, 7.8, 32, 40, 0.6, 220, 18, 170, 0.40),
    ("West Bengal", "Bardhaman", 23.23, 87.86, "Alluvial", 1400, 30, 5.8, 7.2, 34, 38, 0.85, 260, 16, 160, 0.35),
    ("West Bengal", "South 24 Parganas", 22.14, 88.43, "Coastal", 1700, 6, 5.5, 7.4, 26, 50, 0.9, 240, 14, 150, 2.10),
    ("Odisha", "Cuttack", 20.46, 85.88, "Alluvial", 1500, 36, 5.6, 7.0, 30, 44, 0.7, 230, 12, 140, 0.38),
    ("Madhya Pradesh", "Indore", 22.72, 75.86, "Black (Regur)", 950, 553, 7.2, 8.4, 50, 20, 0.6, 210, 14, 290, 0.45),
    ("Madhya Pradesh", "Jabalpur", 23.18, 79.99, "Black (Regur)", 1200, 412, 7.0, 8.2, 48, 22, 0.7, 225, 15, 280, 0.40),
    ("Chhattisgarh", "Raipur", 21.25, 81.63, "Red", 1300, 298, 5.8, 7.2, 30, 46, 0.55, 200, 11, 150, 0.28),
    ("Jharkhand", "Ranchi", 23.34, 85.31, "Red", 1400, 651, 5.4, 6.8, 28, 48, 0.65, 210, 10, 145, 0.22),
    ("Assam", "Jorhat", 26.75, 94.20, "Alluvial", 2000, 116, 4.8, 6.2, 26, 42, 1.2, 300, 9, 130, 0.20),
    ("Assam", "Dibrugarh", 27.47, 94.91, "Alluvial", 2500, 108, 4.7, 6.0, 24, 44, 1.4, 320, 8, 125, 0.18),
]


def _clip(v, lo, hi):
    return float(np.clip(v, lo, hi))


def build(n_per_site_month: int = 18, seed: int = 42) -> pd.DataFrame:
    rng = np.random.default_rng(seed)
    rows = []
    for site in SITES:
        state, district, lat, lng, soil, rain, elev, ph_lo, ph_hi, clay, sand, oc, n, p, k, ec = site
        silt = max(5.0, 100 - clay - sand)
        for month in range(1, 13):
            # SW monsoon pulse Jun–Sep
            monsoon = 1.35 if month in (6, 7, 8, 9) else 0.7 if month in (10, 11) else 0.45
            rain_m = rain * monsoon / 12 * 12  # keep annual scale, seasonal factor below
            for _ in range(n_per_site_month):
                jlat = lat + rng.normal(0, 0.08)
                jlng = lng + rng.normal(0, 0.08)
                # Temperature: latitude + elevation + season
                season = 6 * np.cos((month - 5) / 12 * 2 * np.pi)
                temperature = _clip(32 - 0.18 * abs(jlat - 8) - elev / 180 + season + rng.normal(0, 1.2), 12, 44)
                moisture = _clip(8 + (rain / 80) * monsoon + rng.normal(0, 3.5) - max(0, temperature - 32) * 0.4, 4, 55)
                ph = _clip((ph_lo + ph_hi) / 2 + rng.normal(0, 0.18) - 0.01 * (moisture - 20), ph_lo - 0.3, ph_hi + 0.3)
                clay_i = _clip(clay + rng.normal(0, 3.2), 8, 70)
                sand_i = _clip(sand + rng.normal(0, 4.0), 8, 85)
                silt_i = _clip(100 - clay_i - sand_i, 5, 70)
                # Coastal / arid EC; moisture dilutes salts
                ec_i = _clip(ec * (1.15 - moisture / 120) + rng.normal(0, 0.06) + max(0, ph - 8.0) * 0.25, 0.05, 6.0)
                soc = _clip(
                    oc
                    + 0.012 * moisture
                    - 0.018 * max(0, temperature - 28)
                    + 0.008 * clay_i
                    + rng.normal(0, 0.08),
                    0.12,
                    4.5,
                )
                n_i = _clip(n * (0.7 + soc / 2.2) + moisture * 1.4 + rng.normal(0, 12), 40, 520)
                # Laterite P fixation; alluvial higher P
                p_fix = 0.55 if "Laterite" in soil or "Forest" in soil else 1.0
                p_i = _clip(p * p_fix + (7.4 - abs(ph - 6.8)) * 1.6 + rng.normal(0, 2.2), 4, 55)
                k_boost = 1.35 if "Black" in soil else 0.85 if "Sandy" in soil or "Coastal" in soil else 1.0
                k_i = _clip(k * k_boost + clay_i * 1.8 + rng.normal(0, 10), 40, 480)
                rows.append(
                    {
                        "state": state,
                        "district": district,
                        "latitude": round(jlat, 4),
                        "longitude": round(jlng, 4),
                        "soil_type": soil,
                        "month": month,
                        "rainfall_mm": round(rain_m * monsoon, 1),
                        "elevation_m": elev,
                        "ph": round(ph, 2),
                        "moisture": round(moisture, 1),
                        "temperature": round(temperature, 1),
                        "ec": round(ec_i, 3),
                        "nitrogen": round(n_i, 1),
                        "phosphorus": round(p_i, 1),
                        "potassium": round(k_i, 1),
                        "clay_pct": round(clay_i, 1),
                        "sand_pct": round(sand_i, 1),
                        "silt_pct": round(silt_i, 1),
                        "soc_percent": round(soc, 3),
                        "soil_depth": 15,
                    }
                )
    df = pd.DataFrame(rows)
    out = PROC / "india_place_sensor_table.csv"
    df.to_csv(out, index=False)
    (PROC / "india_place_sensor_SOURCES.md").write_text(
        """# India place + Arduino fill table

**What Arduino measures:** pH (EC20-BNC / E-201-C on PH-4502C), soil moisture, temperature.

**What this table trains:** EC, available N, P, K, clay/sand/silt, SOC from place + those three live sensors.

**Criteria used:** state, district, latitude, longitude, soil type/order, month (season), IMD-like rainfall, elevation, live pH, moisture, temperature.

**Not a substitute for a soil-test laboratory.** Site means follow NBSS&LUP / ICAR typical behaviour by soil order (red, laterite, black cotton, alluvial, coastal, forest, sandy) plus FAO salinity classes for EC. Rows are Monte-Carlo samples around those means, not copied farmer records.

Rows: %d
"""
        % len(df)
    )
    return df


if __name__ == "__main__":
    d = build()
    print(d.shape, d.columns.tolist())
    print(d.describe().round(2).to_string())
