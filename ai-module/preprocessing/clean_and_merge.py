"""Clean, standardise and merge WoSIS-latest property tables.

Scientifically compatible merge: all tables are ISRIC-standardised WoSIS-latest
observations joined on layer_id (same horizon sample). Datasets that are not
WoSIS are not silently stacked.
"""

from __future__ import annotations

import json
from pathlib import Path

import numpy as np
import pandas as pd

ROOT = Path(__file__).resolve().parents[1]
RAW = ROOT / "data" / "raw"
PROC = ROOT / "data" / "processed"
REPORTS = ROOT / "reports"
PROC.mkdir(parents=True, exist_ok=True)
REPORTS.mkdir(parents=True, exist_ok=True)

VALUE_RENAME = {
    "orgc": "orgc_g_kg",
    "phaq": "ph_h2o",
    "clay": "clay_pct",
    "sand": "sand_pct",
    "silt": "silt_pct",
    "nitkjd": "n_g_kg",
    "bdfiod": "bulk_density_g_cm3",
    "elco25": "ec_ds_m",
}

KEEP = [
    "layer_id",
    "profile_id",
    "upper_depth",
    "lower_depth",
    "country_name",
    "region",
    "continent",
    "latitude",
    "longitude",
    "date",
    "licence",
    "dataset_id",
    "value_avg",
    "source",
    "dataset_name",
    "download_tag",
]


def load_joined() -> pd.DataFrame:
    frames = []
    for path in sorted(RAW.glob("wosis_joined_*.csv")):
        frames.append(pd.read_csv(path, low_memory=False))
    # legacy WFS per-property files
    orgc_files = list(RAW.glob("wosis_orgc_*.csv"))
    if not frames and not orgc_files:
        raise FileNotFoundError("No WoSIS raw CSV files. Run data/collect_wosis.py")
    if frames:
        df = pd.concat(frames, ignore_index=True)
        df.columns = [c.strip().lower() for c in df.columns]
        df = df.drop_duplicates(subset=["layer_id"], keep="first")
        return df
    raise FileNotFoundError("Joined WoSIS tables missing")


def usda_texture(sand: float, silt: float, clay: float) -> str:
    if pd.isna(sand) or pd.isna(silt) or pd.isna(clay):
        return np.nan
    if clay >= 40:
        if sand > 45:
            return "sandy_clay"
        if silt >= 40:
            return "silty_clay"
        return "clay"
    if clay >= 27 and sand <= 20:
        return "silty_clay_loam"
    if clay >= 27 and sand > 45:
        return "sandy_clay_loam"
    if clay >= 27:
        return "clay_loam"
    if silt >= 80 and clay < 12:
        return "silt"
    if silt >= 50:
        return "silt_loam" if clay >= 12 or silt < 80 else "silt"
    if clay < 7 and silt < 50 and sand >= 52:
        return "sand" if clay < 5 and sand >= 85 else "loamy_sand"
    if sand >= 52:
        return "sandy_loam"
    return "loam"


def quality_report(df: pd.DataFrame, name: str) -> dict:
    numeric = df.select_dtypes(include=[np.number])
    ranges = {c: {"min": _safe(numeric[c].min()), "max": _safe(numeric[c].max()), "mean": _safe(numeric[c].mean())} for c in numeric.columns}
    report = {
        "dataset": name,
        "label": "REAL DATA",
        "total_rows": int(len(df)),
        "total_columns": int(df.shape[1]),
        "missing_values": {k: int(v) for k, v in df.isna().sum().to_dict().items()},
        "duplicates_layer_id": int(df["layer_id"].duplicated().sum()) if "layer_id" in df else None,
        "numerical_ranges": ranges,
        "source_distribution": df["source"].value_counts().to_dict() if "source" in df else {},
        "country_distribution_top20": df["country_name"].value_counts().head(20).to_dict() if "country_name" in df else {},
        "continent_distribution": df["continent"].value_counts().to_dict() if "continent" in df else {},
        "soil_texture_distribution": df["soil_texture"].value_counts().to_dict() if "soil_texture" in df else {},
        "india_rows": int((df["country_name"] == "India").sum()) if "country_name" in df else 0,
        "karnataka_bbox_rows": int(
            ((df["latitude"].between(11.5, 18.5)) & (df["longitude"].between(74.0, 78.6))).sum()
        )
        if {"latitude", "longitude"}.issubset(df.columns)
        else 0,
    }
    (REPORTS / f"{name}_quality.json").write_text(json.dumps(report, indent=2, default=str))
    return report


def _safe(v):
    if v is None or (isinstance(v, float) and (np.isnan(v) or np.isinf(v))):
        return None
    return float(v) if isinstance(v, (np.floating, float, int, np.integer)) else v


def main() -> None:
    merged = load_joined()

    merged["orgc_g_kg"] = pd.to_numeric(merged["orgc_g_kg"], errors="coerce")
    for col in ("ph_h2o", "clay_pct", "sand_pct", "silt_pct", "n_g_kg", "bulk_density_g_cm3", "ec_ds_m", "upper_depth", "lower_depth", "latitude", "longitude"):
        if col in merged.columns:
            merged[col] = pd.to_numeric(merged[col], errors="coerce")

    n_raw = len(merged)
    invalid = {
        "orgc_nonpositive_or_null": int(merged["orgc_g_kg"].isna().sum() + (merged["orgc_g_kg"] <= 0).sum()),
        "orgc_extreme_gt_600_gkg": int((merged["orgc_g_kg"] > 600).sum()),
        "ph_out_of_range": int(((merged.get("ph_h2o") < 2) | (merged.get("ph_h2o") > 12)).sum()) if "ph_h2o" in merged else 0,
    }

    merged = merged[merged["orgc_g_kg"].notna() & (merged["orgc_g_kg"] > 0) & (merged["orgc_g_kg"] <= 600)]
    if "ph_h2o" in merged:
        merged.loc[(merged["ph_h2o"] < 2) | (merged["ph_h2o"] > 12), "ph_h2o"] = np.nan
    for tex in ("clay_pct", "sand_pct", "silt_pct"):
        if tex in merged:
            merged.loc[(merged[tex] < 0) | (merged[tex] > 100), tex] = np.nan
    if "bulk_density_g_cm3" in merged:
        merged.loc[(merged["bulk_density_g_cm3"] < 0.3) | (merged["bulk_density_g_cm3"] > 2.2), "bulk_density_g_cm3"] = np.nan
    if "n_g_kg" in merged:
        merged.loc[(merged["n_g_kg"] < 0) | (merged["n_g_kg"] > 50), "n_g_kg"] = np.nan

    merged["soc_percent"] = merged["orgc_g_kg"] / 10.0  # g/kg → %
    merged["depth_mid_cm"] = (merged["upper_depth"] + merged["lower_depth"]) / 2.0
    merged["depth_thickness_cm"] = merged["lower_depth"] - merged["upper_depth"]
    merged["is_topsoil"] = merged["upper_depth"].fillna(999) <= 30
    merged["n_percent"] = merged["n_g_kg"] / 10.0 if "n_g_kg" in merged else np.nan
    merged["cn_ratio"] = np.where(merged.get("n_g_kg", 0) > 0, merged["orgc_g_kg"] / merged["n_g_kg"], np.nan)
    merged["texture_sum"] = merged.get("clay_pct", 0) + merged.get("sand_pct", 0) + merged.get("silt_pct", 0)
    bad_tex = merged["texture_sum"].between(0, 1, inclusive="neither") | ((merged["texture_sum"] < 90) | (merged["texture_sum"] > 110))
    # only null texture if all three present and sum is wrong
    has_all = merged[["clay_pct", "sand_pct", "silt_pct"]].notna().all(axis=1) if set(["clay_pct", "sand_pct", "silt_pct"]).issubset(merged.columns) else False
    if isinstance(has_all, pd.Series):
        merged.loc[has_all & ((merged["texture_sum"] < 90) | (merged["texture_sum"] > 110)), ["clay_pct", "sand_pct", "silt_pct"]] = np.nan

    merged["soil_texture"] = [
        usda_texture(s, si, c) for s, si, c in zip(merged.get("sand_pct", []), merged.get("silt_pct", []), merged.get("clay_pct", []))
    ]
    merged["region_group"] = np.where(merged["country_name"] == "India", "India", merged["continent"])
    merged["karnataka_flag"] = (
        merged["latitude"].between(11.5, 18.5) & merged["longitude"].between(74.0, 78.6) & (merged["country_name"] == "India")
    )
    merged["data_label"] = "REAL DATA"
    merged["target"] = "soc_percent"
    merged["original_orgc_field"] = "value_avg (WoSIS ORGC, g/kg)"
    merged["year"] = pd.to_datetime(merged["date"], errors="coerce").dt.year

    # Prefer topsoil for the training table used by the farmer 0–30 cm workflow
    train = merged[merged["is_topsoil"]].copy()
    if len(train) < 2000:
        train = merged.copy()

    report = quality_report(train, "training_table")
    report["rows_before_invalid_filter"] = n_raw
    report["invalid_value_counts"] = invalid
    report["topsoil_rows"] = int(train["is_topsoil"].sum())
    (REPORTS / "training_table_quality.json").write_text(json.dumps(report, indent=2, default=str))

    merged.to_parquet(PROC / "wosis_merged_all_layers.parquet", index=False)
    train.to_parquet(PROC / "training_table.parquet", index=False)
    train.to_csv(PROC / "training_table.csv", index=False)
    print(json.dumps({k: report[k] for k in ("total_rows", "india_rows", "karnataka_bbox_rows", "total_columns")}, indent=2))


if __name__ == "__main__":
    main()
