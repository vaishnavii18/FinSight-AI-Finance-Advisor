# audit_forecast.py
"""
Forecast Truth Audit for FinSight.

Answers: "Is my forecast correct?"

- Holds out the last H months of a user's monthly category totals.
- Trains ARIMA, Prophet, XGBoost, and the ensemble on the train split.
- Compares against 2 naive baselines (last-value, 3-month MA).
- Computes MAPE / RMSE / MAE on the holdout.
- Prints a verdict and saves results/forecast_metrics.csv.

USAGE:
    python audit_forecast.py --user-email demo@finadvisor.com --horizon 3

    # or if you want to audit every user:
    python audit_forecast.py --all-users --horizon 3

REQUIRES:
    - Your existing DB models (User, Transaction)
    - Your existing forecast functions (see ADAPTERS section below)
"""

from __future__ import annotations

import argparse
import asyncio
import csv
import math
import os
import sys
from dataclasses import dataclass, asdict
from datetime import datetime
from pathlib import Path
from typing import Callable

import numpy as np
import pandas as pd

# ---- Adjust these imports to match YOUR project layout -----------------------
# Example (change to your actual paths):
# from app.db.session import SessionLocal
# from app.models.user import User
# from app.models.transaction import Transaction
# from app.services.forecasting import (
#     forecast_arima, forecast_prophet, forecast_xgboost, forecast_ensemble,
# )
# -----------------------------------------------------------------------------

OUT_DIR = Path("results")
OUT_DIR.mkdir(exist_ok=True)


# =============================================================================
# ADAPTERS — plug your existing functions in here.
# Each adapter takes a 1-D monthly series (list[float]) and a horizon,
# and returns a list[float] of length == horizon (or None if it failed).
# =============================================================================

def _try(fn: Callable, series: list[float], horizon: int) -> list[float] | None:
    try:
        out = fn(series, horizon)
        out = [float(x) for x in out]
        if len(out) != horizon or any(math.isnan(x) or math.isinf(x) for x in out):
            return None
        return out
    except Exception as e:
        print(f"    [warn] {getattr(fn, '__name__', fn)} failed: {e}")
        return None


def adapter_arima(series, horizon):
    from app.ml.forecasting import forecast_arima
    return _try(forecast_arima, series, horizon)


def adapter_prophet(series, horizon):
    from app.ml.forecasting import forecast_prophet
    return _try(forecast_prophet, series, horizon)


def adapter_xgboost(series, horizon):
    from app.ml.forecasting import forecast_xgboost
    return _try(forecast_xgboost, series, horizon)


def adapter_ensemble(series, horizon):
    from app.ml.forecasting import forecast_ensemble
    return _try(forecast_ensemble, series, horizon)


# =============================================================================
# BASELINES (these are the numbers your ML must beat)
# =============================================================================

def baseline_last_value(series, horizon):
    return [series[-1]] * horizon


def baseline_ma3(series, horizon):
    if len(series) < 3:
        return [float(np.mean(series))] * horizon
    return [float(np.mean(series[-3:]))] * horizon


def baseline_ma6(series, horizon):
    window = series[-6:] if len(series) >= 6 else series
    return [float(np.mean(window))] * horizon


# =============================================================================
# METRICS
# =============================================================================

def mape(actual, pred) -> float:
    a, p = np.asarray(actual, dtype=float), np.asarray(pred, dtype=float)
    mask = a != 0
    if mask.sum() == 0:
        return float("nan")
    return float(np.mean(np.abs((a[mask] - p[mask]) / a[mask])) * 100)


def rmse(actual, pred) -> float:
    a, p = np.asarray(actual, dtype=float), np.asarray(pred, dtype=float)
    return float(np.sqrt(np.mean((a - p) ** 2)))


def mae(actual, pred) -> float:
    a, p = np.asarray(actual, dtype=float), np.asarray(pred, dtype=float)
    return float(np.mean(np.abs(a - p)))


# =============================================================================
# DATA LOADING (adjust to your ORM)
# =============================================================================

def load_monthly_series(user_email: str) -> pd.Series:
    """
    Returns a pandas Series of monthly total expenses, indexed by YYYY-MM,
    for the given user. EXCLUDES the current (incomplete) month.
    """
    # --- REPLACE THIS BLOCK with your real DB query ---
    # from app.db.session import SessionLocal
    # from app.models.user import User
    # from app.models.transaction import Transaction
    #
    # db = SessionLocal()
    # user = db.query(User).filter(User.email == user_email).first()
    # if not user:
    #     raise SystemExit(f"User not found: {user_email}")
    #
    # rows = (
    #     db.query(Transaction)
    #     .filter(Transaction.user_id == user.id)
    #     .all()
    # )
    # df = pd.DataFrame([{"date": r.date, "amount": float(r.amount)} for r in rows])
    # db.close()
    # ---------------------------------------------------
    #
    # For a first dry-run without a DB, you can instead load from a CSV:
    # df = pd.read_csv("data/transactions.csv")  # columns: date, amount
    #
    # The demo fallback below synthesizes a plausible series so the script
    # runs end-to-end even before you wire the DB. DELETE it once wired.
    rng = np.random.default_rng(42)
    months = pd.period_range(end=pd.Period(datetime.now(), freq="M") - 1, periods=12, freq="M")
    values = 20000 + 3000 * np.sin(np.arange(12) / 2) + rng.normal(0, 1500, 12)
    return pd.Series(values, index=months.astype(str))

    # --- REAL version (uncomment & adapt) ---
    # df["date"] = pd.to_datetime(df["date"])
    # df = df[df["amount"] < 0] if expenses are negative, else df
    # current_month = pd.Period(datetime.now(), freq="M")
    # df["month"] = df["date"].dt.to_period("M")
    # df = df[df["month"] < current_month]
    # series = df.groupby("month")["amount"].sum().sort_index()
    # return pd.Series(series.values, index=series.index.astype(str))


# =============================================================================
# AUDIT CORE
# =============================================================================

@dataclass
class Row:
    user: str
    model: str
    horizon: int
    n_train: int
    mape: float
    rmse: float
    mae: float
    status: str  # ok | failed | too_short


def audit_user(series: pd.Series, user_email: str, horizon: int) -> list[Row]:
    values = list(series.values.astype(float))
    months = list(series.index.astype(str))

    if len(values) < horizon + 4:
        print(f"  [skip] {user_email}: only {len(values)} months (need >= {horizon + 4})")
        return [Row(user_email, "ALL", horizon, len(values), float("nan"),
                    float("nan"), float("nan"), "too_short")]

    train = values[:-horizon]
    test = values[-horizon:]
    train_months = months[:-horizon]
    test_months = months[-horizon:]

    print(f"  train: {len(train)} months ({train_months[0]}..{train_months[-1]})")
    print(f"  test : {len(test)} months ({test_months[0]}..{test_months[-1]})")
    print(f"  actual test values: {[round(x, 2) for x in test]}")

    candidates: dict[str, Callable] = {
        "naive_last": baseline_last_value,
        "naive_ma3": baseline_ma3,
        "naive_ma6": baseline_ma6,
        "ARIMA": adapter_arima,
        "Prophet": adapter_prophet,
        "XGBoost": adapter_xgboost,
        "Ensemble": adapter_ensemble,
    }

    rows: list[Row] = []
    for name, fn in candidates.items():
        pred = fn(train, horizon)
        if pred is None:
            rows.append(Row(user_email, name, horizon, len(train),
                            float("nan"), float("nan"), float("nan"), "failed"))
            print(f"    {name:12s} FAILED")
            continue
        rows.append(Row(
            user_email, name, horizon, len(train),
            mape(test, pred), rmse(test, pred), mae(test, pred), "ok",
        ))
        print(f"    {name:12s} MAPE={rows[-1].mape:7.2f}%  "
              f"RMSE={rows[-1].rmse:10.2f}  MAE={rows[-1].mae:10.2f}  "
              f"pred={[round(x, 2) for x in pred]}")

    return rows


def verdict(rows: list[Row]) -> str:
    """Verdict for this user based on ensemble vs naive_ma3."""
    by = {r.model: r for r in rows if r.status == "ok"}
    if "Ensemble" not in by or "naive_ma3" not in by:
        return "❌ Cannot verdict: ensemble or naive_ma3 missing."
    ens, base = by["Ensemble"], by["naive_ma3"]
    lines = []
    if math.isnan(ens.mape):
        return "❌ Ensemble MAPE is NaN (zero actuals in test set?)"
    beats = ens.mape < base.mape
    delta = base.mape - ens.mape
    if ens.mape < 15 and beats:
        lines.append(f"✅ CORRECT: Ensemble MAPE {ens.mape:.1f}% < 15% and beats naive_ma3 by {delta:.1f}pp.")
    elif ens.mape < 25 and beats:
        lines.append(f"⚠️ ACCEPTABLE: Ensemble MAPE {ens.mape:.1f}% (15–25%) and beats naive_ma3 by {delta:.1f}pp. Document as limitation.")
    else:
        lines.append(f"❌ NOT CORRECT: Ensemble MAPE {ens.mape:.1f}% vs naive_ma3 {base.mape:.1f}%.")
        if not beats:
            lines.append("   Ensemble LOSES to naive_ma3. Fix aggregation/split before viva.")
        else:
            lines.append("   Ensemble beats baseline but error is high. Check outliers / short history.")
    return "\n".join(lines)


# =============================================================================
# ENTRY POINT
# =============================================================================

def run(users: list[str], horizon: int) -> None:
    all_rows: list[Row] = []
    for u in users:
        print(f"\n=== Auditing user: {u} ===")
        try:
            series = load_monthly_series(u)
        except Exception as e:
            print(f"  [error] could not load series: {e}")
            continue
        print(f"  series ({len(series)} months):")
        print("   ", {k: round(float(v), 2) for k, v in series.items()})
        rows = audit_user(series, u, horizon)
        all_rows.extend(rows)
        print("\n  --- Verdict ---")
        print("  " + verdict(rows).replace("\n", "\n  "))

    if not all_rows:
        print("\nNo rows produced.")
        return

    out = OUT_DIR / "forecast_metrics.csv"
    with out.open("w", newline="") as f:
        w = csv.DictWriter(f, fieldnames=list(asdict(all_rows[0]).keys()))
        w.writeheader()
        for r in all_rows:
            w.writerow(asdict(r))
    print(f"\nSaved: {out}")

    # Summary pivot for the report
    df = pd.DataFrame([asdict(r) for r in all_rows])
    ok = df[df["status"] == "ok"]
    if not ok.empty:
        pivot = ok.pivot_table(index="model", values=["mape", "rmse", "mae"], aggfunc="mean")
        print("\n=== Mean across users (for report Chapter 6) ===")
        print(pivot.round(2).to_string())
        pivot.round(2).to_csv(OUT_DIR / "forecast_metrics_mean.csv")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--user-email", type=str, default=None)
    ap.add_argument("--all-users", action="store_true")
    ap.add_argument("--horizon", type=int, default=3,
                    help="months to hold out (default 3)")
    args = ap.parse_args()

    if args.all_users:
        # --- REPLACE with your DB query for all user emails ---
        # from app.db.session import SessionLocal
        # from app.models.user import User
        # db = SessionLocal()
        # users = [u.email for u in db.query(User).all()]
        # db.close()
        raise SystemExit("Wire --all-users to your DB first, or pass --user-email.")
    elif args.user_email:
        users = [args.user_email]
    else:
        users = ["demo@finadvisor.com"]

    run(users, args.horizon)


if __name__ == "__main__":
    main()
