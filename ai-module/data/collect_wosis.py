"""Download REAL ISRIC WoSIS-latest observations.

Global tables: WFS GeoJSON (fast, large).
India tables: GraphQL filter countryName=India (complete Indian ORGC layers).

No synthetic rows. Licence and source fields are preserved.
"""

from __future__ import annotations

import json
import time
from pathlib import Path

import pandas as pd
import requests

RAW = Path(__file__).resolve().parent / "raw"
RAW.mkdir(parents=True, exist_ok=True)

WFS = "https://maps.isric.org/mapserv"
GQL = "https://graphql.isric.org/wosis/graphql"
PAGE_WFS = 2500

LAYERS = {
    "orgc": "wosis_latest_orgc",
    "phaq": "wosis_latest_phaq",
    "clay": "wosis_latest_clay",
    "sand": "wosis_latest_sand",
    "silt": "wosis_latest_silt",
    "nitkjd": "wosis_latest_nitkjd",
    "bdfiod": "wosis_latest_bdfiod",
    "elco25": "wosis_latest_elco25",
}

VALUE_COL = {
    "orgc": "orgc_g_kg",
    "phaq": "ph_h2o",
    "clay": "clay_pct",
    "sand": "sand_pct",
    "silt": "silt_pct",
    "nitkjd": "n_g_kg",
    "bdfiod": "bulk_density_g_cm3",
    "elco25": "ec_ds_m",
}

GQL_Q = """
query Layers($first: Int!, $offset: Int!, $filter: WosisLatestLayerFilter) {
  wosisLatestLayers(first: $first, offset: $offset, filter: $filter) {
    profileId
    layerId
    upperDepth
    lowerDepth
    datasetId
    date
    licence
    orgcValues(first: 1) { valueAvg }
    phaqValues(first: 1) { valueAvg }
    clayValues(first: 1) { valueAvg }
    sandValues(first: 1) { valueAvg }
    siltValues(first: 1) { valueAvg }
    nitkjdValues(first: 1) { valueAvg }
    bdfiodValues(first: 1) { valueAvg }
    elco25Values(first: 1) { valueAvg }
    profile { latitude longitude countryName region continent year usdaOrderName wrbReferenceSoilGroup }
  }
}
"""


def wfs_page(layer: str, start: int) -> list[dict]:
    params = {
        "map": "/map/wosis_latest.map",
        "SERVICE": "WFS",
        "VERSION": "2.0.0",
        "REQUEST": "GetFeature",
        "OUTPUTFORMAT": "geojson",
        "TYPENAMES": layer,
        "COUNT": str(PAGE_WFS),
        "STARTINDEX": str(start),
    }
    for attempt in range(5):
        try:
            r = requests.get(WFS, params=params, timeout=180)
            r.raise_for_status()
            feats = r.json().get("features") or []
            rows = []
            for f in feats:
                p = dict(f.get("properties") or {})
                coords = (f.get("geometry") or {}).get("coordinates") or [None, None]
                p["longitude"] = coords[0]
                p["latitude"] = coords[1]
                rows.append(p)
            return rows
        except Exception as exc:  # noqa: BLE001
            print("wfs retry", layer, start, exc)
            time.sleep(1.5 * (attempt + 1))
    return []


def download_wfs(key: str, max_rows: int) -> Path:
    out = RAW / f"wosis_{key}_global.csv"
    if out.exists() and out.stat().st_size > 5000:
        print("skip", out.name)
        return out
    frames = []
    start = 0
    while start < max_rows:
        print(f"WFS {key} offset={start}")
        rows = wfs_page(LAYERS[key], start)
        if not rows:
            break
        frames.append(pd.DataFrame(rows))
        print(" ", len(rows))
        if len(rows) < PAGE_WFS:
            break
        start += PAGE_WFS
    df = pd.concat(frames, ignore_index=True)
    df["source"] = "ISRIC_WoSIS_latest"
    df["dataset_name"] = LAYERS[key]
    df["download_tag"] = "global_wfs"
    df.to_csv(out, index=False)
    print("wrote", out, len(df))
    return out


def avg(vals):
    return vals[0]["valueAvg"] if vals else None


def flatten_gql(node: dict) -> dict:
    p = node.get("profile") or {}
    return {
        "layer_id": node.get("layerId"),
        "profile_id": node.get("profileId"),
        "upper_depth": node.get("upperDepth"),
        "lower_depth": node.get("lowerDepth"),
        "dataset_id": node.get("datasetId"),
        "date": node.get("date"),
        "licence": node.get("licence"),
        "orgc_g_kg": avg(node.get("orgcValues")),
        "ph_h2o": avg(node.get("phaqValues")),
        "clay_pct": avg(node.get("clayValues")),
        "sand_pct": avg(node.get("sandValues")),
        "silt_pct": avg(node.get("siltValues")),
        "n_g_kg": avg(node.get("nitkjdValues")),
        "bulk_density_g_cm3": avg(node.get("bdfiodValues")),
        "ec_ds_m": avg(node.get("elco25Values")),
        "latitude": p.get("latitude"),
        "longitude": p.get("longitude"),
        "country_name": p.get("countryName"),
        "region": p.get("region"),
        "continent": p.get("continent"),
        "usda_order": p.get("usdaOrderName"),
        "wrb_group": p.get("wrbReferenceSoilGroup"),
        "year": p.get("year"),
        "source": "ISRIC_WoSIS_latest",
        "dataset_name": "wosis_latest GraphQL India",
        "download_tag": "india",
        "data_label": "REAL DATA",
    }


def download_india(max_rows: int = 2000) -> Path:
    out = RAW / "wosis_joined_india.csv"
    if out.exists() and out.stat().st_size > 2000:
        print("skip", out.name)
        return out
    rows = []
    offset = 0
    page = 40
    filt = {"orgcValuesExist": True, "profile": {"countryName": {"equalTo": "India"}}}
    while len(rows) < max_rows:
        print("India GraphQL offset", offset, "have", len(rows))
        payload = {"query": GQL_Q, "variables": {"first": page, "offset": offset, "filter": filt}}
        r = requests.post(GQL, json=payload, timeout=120)
        r.raise_for_status()
        body = r.json()
        batch = (body.get("data") or {}).get("wosisLatestLayers") or []
        if not batch:
            break
        rows.extend(flatten_gql(n) for n in batch)
        pd.DataFrame(rows).to_csv(out, index=False)
        offset += page
        if len(batch) < page:
            break
        time.sleep(0.05)
    print("wrote", out, len(rows))
    return out


def merge_global() -> Path:
    orgc = pd.read_csv(RAW / "wosis_orgc_global.csv", low_memory=False)
    orgc.columns = [c.lower() for c in orgc.columns]
    orgc = orgc.rename(columns={"value_avg": "orgc_g_kg"})
    keep = [
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
        "orgc_g_kg",
        "source",
        "dataset_name",
        "download_tag",
    ]
    merged = orgc[[c for c in keep if c in orgc.columns]].drop_duplicates("layer_id")
    for key, col in VALUE_COL.items():
        if key == "orgc":
            continue
        path = RAW / f"wosis_{key}_global.csv"
        if not path.exists():
            continue
        o = pd.read_csv(path, low_memory=False)
        o.columns = [c.lower() for c in o.columns]
        o = o.rename(columns={"value_avg": col})
        merged = merged.merge(o[["layer_id", col]].drop_duplicates("layer_id"), on="layer_id", how="left")
    merged["data_label"] = "REAL DATA"
    out = RAW / "wosis_joined_global_topsoil.csv"
    # keep name expected by cleaner: wosis_joined_*.csv
    out = RAW / "wosis_joined_global.csv"
    merged.to_csv(out, index=False)
    print("merged global", len(merged))
    return out


def main() -> None:
    download_wfs("orgc", 50_000)
    for key in ("phaq", "clay", "sand", "silt", "nitkjd", "bdfiod", "elco25"):
        download_wfs(key, 35_000)
    merge_global()
    download_india(2000)
    (RAW / "SOURCES.json").write_text(
        json.dumps(
            {
                "citation": "Batjes NH, Calisto L, de Sousa LM. WoSIS-latest. ISRIC — World Soil Information.",
                "wfs": WFS,
                "graphql": GQL,
                "label": "REAL DATA",
                "units": {
                    "orgc": "g/kg",
                    "n": "g/kg Kjeldahl",
                    "texture": "mass %",
                    "bd": "g/cm3 oven dry",
                    "ph": "pH water",
                },
            },
            indent=2,
        )
    )


if __name__ == "__main__":
    main()
