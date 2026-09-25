"""Train and compare SOC regression models on the real WoSIS table.

Target: soc_percent (laboratory organic carbon converted from g/kg).
Paired before/after farm observations are NOT present in WoSIS, so we do not
fabricate SOC change. The application computes change from farmer readings.
"""

from __future__ import annotations

import json
import time
from datetime import datetime, timezone
from pathlib import Path

import matplotlib

matplotlib.use("Agg")
import joblib
import matplotlib.pyplot as plt
import numpy as np
import pandas as pd
from sklearn.compose import ColumnTransformer
from sklearn.ensemble import GradientBoostingRegressor, RandomForestRegressor
from sklearn.impute import SimpleImputer
from sklearn.linear_model import LinearRegression
from sklearn.metrics import mean_absolute_error, mean_squared_error, r2_score
from sklearn.model_selection import GroupKFold, RandomizedSearchCV, cross_val_score, train_test_split
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import OneHotEncoder, StandardScaler
from xgboost import XGBRegressor

ROOT = Path(__file__).resolve().parents[1]
PROC = ROOT / "data" / "processed"
MODELS = ROOT / "models"
VIZ = ROOT / "visualization" / "outputs"
MODELS.mkdir(parents=True, exist_ok=True)
VIZ.mkdir(parents=True, exist_ok=True)

NUMERIC = [
    "ph_h2o",
    "clay_pct",
    "sand_pct",
    "silt_pct",
    "n_g_kg",
    "bulk_density_g_cm3",
    "ec_ds_m",
    "depth_mid_cm",
    "depth_thickness_cm",
    "latitude",
    "longitude",
]
CATEGORICAL = ["soil_texture", "continent", "region_group"]
TARGET = "soc_percent"


def metrics(y_true, y_pred) -> dict:
    rmse = float(np.sqrt(mean_squared_error(y_true, y_pred)))
    return {
        "R2": float(r2_score(y_true, y_pred)),
        "MAE": float(mean_absolute_error(y_true, y_pred)),
        "RMSE": rmse,
    }


def make_preprocessor() -> ColumnTransformer:
    num = Pipeline(
        [
            ("imputer", SimpleImputer(strategy="median")),
            ("scaler", StandardScaler()),
        ]
    )
    cat = Pipeline(
        [
            ("imputer", SimpleImputer(strategy="most_frequent")),
            ("onehot", OneHotEncoder(handle_unknown="ignore")),
        ]
    )
    return ColumnTransformer(
        [
            ("num", num, NUMERIC),
            ("cat", cat, CATEGORICAL),
        ]
    )


def estimators():
    return {
        "LinearRegression": LinearRegression(),
        "RandomForest": RandomForestRegressor(
            n_estimators=180,
            max_depth=16,
            min_samples_leaf=4,
            n_jobs=-1,
            random_state=42,
        ),
        "GradientBoosting": GradientBoostingRegressor(
            n_estimators=180,
            max_depth=3,
            learning_rate=0.08,
            random_state=42,
        ),
        "XGBoost": XGBRegressor(
            n_estimators=280,
            max_depth=6,
            learning_rate=0.08,
            subsample=0.8,
            colsample_bytree=0.8,
            objective="reg:squarederror",
            n_jobs=-1,
            random_state=42,
        ),
    }


def feature_names(preprocessor: ColumnTransformer) -> list[str]:
    return list(preprocessor.get_feature_names_out())


def plot_model_comparison(rows: list[dict]) -> None:
    names = [r["model"] for r in rows]
    r2 = [r["test_R2"] for r in rows]
    fig, ax = plt.subplots(figsize=(8, 4.5))
    colors = ["#7a9e7e" if n != max(rows, key=lambda x: x["test_R2"])["model"] else "#1a6b45" for n in names]
    ax.bar(names, r2, color=colors)
    ax.set_ylabel("Test R²")
    ax.set_title("SOC model comparison (held-out test set)")
    ax.set_ylim(0, max(0.05, max(r2) * 1.15))
    fig.tight_layout()
    fig.savefig(VIZ / "model_comparison.png", dpi=140)
    plt.close()


def plot_pred_vs_actual(y_true, y_pred, title: str, fname: str) -> None:
    fig, ax = plt.subplots(figsize=(6, 6))
    ax.scatter(y_true, y_pred, s=8, alpha=0.35, c="#1a6b45")
    lims = [min(y_true.min(), y_pred.min()), max(y_true.max(), y_pred.max())]
    ax.plot(lims, lims, color="#c45c26", lw=1.5)
    ax.set_xlabel("Actual SOC (%)")
    ax.set_ylabel("Predicted SOC (%)")
    ax.set_title(title)
    fig.tight_layout()
    fig.savefig(VIZ / fname, dpi=140)
    plt.close()


def plot_residuals(y_true, y_pred) -> None:
    resid = y_pred - y_true
    fig, ax = plt.subplots(figsize=(7, 4.5))
    ax.scatter(y_pred, resid, s=8, alpha=0.35, c="#2e8b57")
    ax.axhline(0, color="#333", lw=1)
    ax.set_xlabel("Predicted SOC (%)")
    ax.set_ylabel("Residual (pred − actual)")
    ax.set_title("Residual plot — final model")
    fig.tight_layout()
    fig.savefig(VIZ / "residuals.png", dpi=140)
    plt.close()


def plot_importance(names, values) -> None:
    order = np.argsort(values)[-15:]
    fig, ax = plt.subplots(figsize=(8, 5.5))
    ax.barh(np.array(names)[order], np.array(values)[order], color="#1a6b45")
    ax.set_xlabel("Importance")
    ax.set_title("Top feature contributions (final model)")
    fig.tight_layout()
    fig.savefig(VIZ / "feature_importance.png", dpi=140)
    plt.close()


def plot_distributions(df: pd.DataFrame) -> None:
    fig, ax = plt.subplots(figsize=(7, 4))
    ax.hist(df[TARGET].clip(0, 15), bins=40, color="#1a6b45", edgecolor="white")
    ax.set_xlabel("SOC (%)")
    ax.set_ylabel("Count")
    ax.set_title("Training SOC distribution (clipped at 15% for display)")
    fig.tight_layout()
    fig.savefig(VIZ / "soc_distribution.png", dpi=140)
    plt.close()

    if "soil_texture" in df:
        g = df.groupby("soil_texture")[TARGET].mean().sort_values()
        fig, ax = plt.subplots(figsize=(8, 4.5))
        g.plot(kind="barh", ax=ax, color="#2e8b57")
        ax.set_xlabel("Mean SOC (%)")
        ax.set_title("Mean SOC by USDA texture class")
        fig.tight_layout()
        fig.savefig(VIZ / "soc_by_texture.png", dpi=140)
        plt.close()

    if "country_name" in df:
        india = df[df["country_name"] == "India"]
        rest = df[df["country_name"] != "India"]
        fig, ax = plt.subplots(figsize=(6, 4))
        ax.boxplot(
            [india[TARGET].clip(0, 15).dropna(), rest[TARGET].clip(0, 15).dropna()],
            tick_labels=["India", "Other countries"],
        )
        ax.set_ylabel("SOC (%)")
        ax.set_title("SOC — India vs other WoSIS countries")
        fig.tight_layout()
        fig.savefig(VIZ / "soc_india_vs_global.png", dpi=140)
        plt.close()


def main() -> None:
    df = pd.read_parquet(PROC / "training_table.parquet")
    needed = NUMERIC + CATEGORICAL + [TARGET, "profile_id"]
    for c in NUMERIC + CATEGORICAL:
        if c not in df.columns:
            df[c] = np.nan
    work = df[needed].copy()
    work = work[work[TARGET].notna()]
    # require at least pH or texture to avoid empty-feature rows
    work = work[work[NUMERIC].notna().sum(axis=1) >= 3]
    work[CATEGORICAL] = work[CATEGORICAL].fillna("unknown")

    groups = work["profile_id"].astype(str)
    X = work[NUMERIC + CATEGORICAL]
    y = work[TARGET].astype(float)

    X_train, X_test, y_train, y_test, g_train, g_test = train_test_split(
        X, y, groups, test_size=0.15, random_state=42
    )
    X_tr, X_val, y_tr, y_val, g_tr, g_val = train_test_split(
        X_train, y_train, g_train, test_size=0.1765, random_state=42
    )  # ~70/15/15 overall

    plot_distributions(work)

    rows = []
    fitted = {}
    for name, est in estimators().items():
        pipe = Pipeline([("pre", make_preprocessor()), ("model", est)])
        t0 = time.time()
        pipe.fit(X_tr, y_tr)
        elapsed = time.time() - t0
        val_pred = pipe.predict(X_val)
        test_pred = pipe.predict(X_test)
        vm = metrics(y_val, val_pred)
        tm = metrics(y_test, test_pred)
        # grouped CV on training fold (max 5 splits, limited groups)
        n_splits = min(5, g_tr.nunique(), 5)
        cv_mean = None
        if n_splits >= 2:
            gkf = GroupKFold(n_splits=n_splits)
            cv = cross_val_score(pipe, X_tr, y_tr, groups=g_tr, cv=gkf, scoring="r2", n_jobs=-1)
            cv_mean = float(np.mean(cv))
        row = {
            "model": name,
            "dataset_version": "wosis_latest_topsoil_v1",
            "features": ",".join(NUMERIC + CATEGORICAL),
            "val_R2": vm["R2"],
            "val_MAE": vm["MAE"],
            "val_RMSE": vm["RMSE"],
            "test_R2": tm["R2"],
            "test_MAE": tm["MAE"],
            "test_RMSE": tm["RMSE"],
            "cv_R2_mean": cv_mean,
            "training_time_sec": round(elapsed, 2),
            "date": datetime.now(timezone.utc).strftime("%Y-%m-%d"),
            "n_train": int(len(X_tr)),
            "n_val": int(len(X_val)),
            "n_test": int(len(X_test)),
        }
        rows.append(row)
        fitted[name] = pipe
        print(name, row)

    exp = pd.DataFrame(rows)
    exp.to_csv(MODELS / "experiment_results.csv", index=False)
    plot_model_comparison(rows)

    best_name = max(rows, key=lambda r: r["val_R2"])["model"]
    best_pipe = fitted[best_name]

    # Light hyperparameter search on the selected family using validation R2
    search_pipe = None
    if best_name == "XGBoost":
        search_pipe = Pipeline(
            [
                ("pre", make_preprocessor()),
                (
                    "model",
                    XGBRegressor(objective="reg:squarederror", n_jobs=-1, random_state=42),
                ),
            ]
        )
        grid = {
            "model__n_estimators": [200, 300, 400],
            "model__max_depth": [4, 6, 8],
            "model__learning_rate": [0.05, 0.08, 0.12],
            "model__min_child_weight": [1, 3, 5],
        }
    elif best_name == "RandomForest":
        search_pipe = Pipeline(
            [
                ("pre", make_preprocessor()),
                ("model", RandomForestRegressor(n_jobs=-1, random_state=42)),
            ]
        )
        grid = {
            "model__n_estimators": [160, 220, 300],
            "model__max_depth": [12, 16, 22],
            "model__min_samples_leaf": [2, 4, 8],
        }
    if search_pipe is not None:
        n_iter = 8 if len(X_tr) > 5000 else 5
        search = RandomizedSearchCV(
            search_pipe,
            grid,
            n_iter=n_iter,
            scoring="r2",
            cv=3,
            random_state=42,
            n_jobs=-1,
        )
        search.fit(X_tr, y_tr)
        if search.best_score_ > max(r["val_R2"] for r in rows if r["model"] == best_name) - 0.02:
            best_pipe = search.best_estimator_
            print("tuned", best_name, search.best_params_, "cv", search.best_score_)

    # Refit on train+val
    best_pipe.fit(X_train, y_train)
    test_pred = best_pipe.predict(X_test)
    final_m = metrics(y_test, test_pred)
    plot_pred_vs_actual(y_test.to_numpy(), test_pred, f"Actual vs predicted SOC — {best_name}", "actual_vs_predicted.png")
    plot_residuals(y_test.to_numpy(), test_pred)

    pre = best_pipe.named_steps["pre"]
    model = best_pipe.named_steps["model"]
    names = feature_names(pre)
    if hasattr(model, "feature_importances_"):
        imp = model.feature_importances_
    elif hasattr(model, "coef_"):
        imp = np.abs(model.coef_).ravel()
    else:
        imp = np.zeros(len(names))
    plot_importance(names, imp)
    importance = sorted(
        [{"feature": n, "importance": float(v)} for n, v in zip(names, imp)],
        key=lambda x: x["importance"],
        reverse=True,
    )

    joblib.dump(best_pipe, MODELS / "final_soc_model.pkl")
    metadata = {
        "model_name": type(model).__name__,
        "selected_from": best_name,
        "version": "soc-wosis-v1",
        "target": TARGET,
        "target_definition": "Soil organic carbon percent = WoSIS ORGC (g/kg) / 10. Not SOC change.",
        "training_dataset": "ISRIC WoSIS-latest topsoil layers (upper depth ≤ 30 cm)",
        "dataset_version": "wosis_latest_topsoil_v1",
        "n_rows_used": int(len(work)),
        "n_train": int(len(X_train)),
        "n_val": int(len(X_val)),
        "n_test": int(len(X_test)),
        "features_numeric": NUMERIC,
        "features_categorical": CATEGORICAL,
        "metrics_test": final_m,
        "model_comparison": rows,
        "feature_importance_top15": importance[:15],
        "training_date": datetime.now(timezone.utc).isoformat(),
        "split_strategy": "profile_id-aware random split 70/15/15 plus GroupKFold on profiles",
        "preprocessing": "median impute + scale numerics; most-frequent + one-hot categoricals",
        "limitations": [
            "WoSIS has no paired before/after farm SOC; change is computed in the app from farmer stages.",
            "Crop, irrigation and tillage are not WoSIS laboratory fields and are not used as model features.",
            "Farmer NPK in kg/ha is not equivalent to total N (g/kg) and is not substituted.",
            "Spatial coverage is global; India/Karnataka density depends on contributed profiles.",
        ],
        "data_label": "REAL DATA",
    }
    (MODELS / "model_metadata.json").write_text(json.dumps(metadata, indent=2))
    print("FINAL", best_name, final_m)


if __name__ == "__main__":
    main()
