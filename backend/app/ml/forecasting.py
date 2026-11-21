import pandas as pd
import numpy as np
from datetime import timedelta
from typing import List, Dict, Optional

from sklearn.metrics import mean_absolute_error, mean_squared_error

import warnings
warnings.filterwarnings("ignore")


# =========================================================
# OPTIONAL LIBRARIES
# =========================================================

try:
    from prophet import Prophet
    PROPHET_AVAILABLE = True
except ImportError:
    PROPHET_AVAILABLE = False

try:
    import xgboost as xgb
    XGBOOST_AVAILABLE = True
except ImportError:
    XGBOOST_AVAILABLE = False

from statsmodels.tsa.arima.model import ARIMA


# =========================================================
# DATA PREPARATION
# =========================================================

def prepare_time_series(expenses: List[dict]) -> pd.DataFrame:
    """
    Convert expense records into a daily time series.
    Missing dates are filled with zero spending.
    Invalid rows (bad dates, negative amounts, NaNs) are dropped.
    """
    if not expenses:
        return pd.DataFrame()

    df = pd.DataFrame(expenses)

    if "date" not in df.columns or "amount" not in df.columns:
        return pd.DataFrame()

    df["date"] = pd.to_datetime(df["date"], errors="coerce")
    df["amount"] = pd.to_numeric(df["amount"], errors="coerce")

    df = df.dropna(subset=["date", "amount"])
    df = df[df["amount"] >= 0]

    if df.empty:
        return pd.DataFrame()

    # Aggregate same-day expenses
    df = (
        df.groupby("date")["amount"]
        .sum()
        .reset_index()
        .sort_values("date")
    )

    # Fill missing dates with zero
    full_range = pd.date_range(
        start=df["date"].min(),
        end=df["date"].max(),
        freq="D"
    )

    df = (
        df.set_index("date")
        .reindex(full_range, fill_value=0)
        .rename_axis("date")
        .reset_index()
    )

    df.columns = ["ds", "y"]
    return df


def get_forecast_start_date(df: pd.DataFrame) -> pd.Timestamp:
    """
    First date of a *future* (production) forecast.
    """
    today = pd.Timestamp.today().normalize()
    last_expense_date = pd.to_datetime(df["ds"].max()).normalize()
    return max(today, last_expense_date + pd.Timedelta(days=1))


# =========================================================
# ARIMA
# =========================================================

def forecast_arima(
    df: pd.DataFrame,
    periods: int = 30,
    start_date: Optional[pd.Timestamp] = None
) -> Dict:
    """
    Generate a daily ARIMA forecast.
    If start_date is provided (used during validation), it is respected.
    Otherwise production logic (max(today, last+1)) is used.
    """
    try:
        model = ARIMA(df["y"], order=(2, 1, 2))
        fitted = model.fit()
        forecast = fitted.forecast(steps=periods)

        if start_date is None:
            start_date = get_forecast_start_date(df)

        future_dates = pd.date_range(
            start=start_date,
            periods=periods,
            freq="D"
        )

        forecasts = [
            {
                "date": date.strftime("%Y-%m-%d"),
                "predicted_amount": max(0.0, float(value))
            }
            for date, value in zip(future_dates, forecast)
        ]

        return {
            "model": "ARIMA",
            "forecasts": forecasts
        }

    except Exception as e:
        return {
            "model": "ARIMA",
            "error": str(e),
            "forecasts": []
        }


# =========================================================
# PROPHET
# =========================================================

def forecast_prophet(
    df: pd.DataFrame,
    periods: int = 30,
    start_date: Optional[pd.Timestamp] = None
) -> Dict:
    """
    Generate a daily Prophet forecast.
    """
    if not PROPHET_AVAILABLE:
        return {
            "model": "Prophet",
            "error": "Prophet not installed",
            "forecasts": []
        }

    try:
        model = Prophet(
            daily_seasonality=False,
            weekly_seasonality=True
        )
        model.fit(df)

        if start_date is None:
            start_date = get_forecast_start_date(df)

        future_dates = pd.date_range(
            start=start_date,
            periods=periods,
            freq="D"
        )

        future = pd.DataFrame({
            "ds": list(df["ds"]) + list(future_dates)
        })

        forecast = model.predict(future).tail(periods)

        forecasts = [
            {
                "date": row["ds"].strftime("%Y-%m-%d"),
                "predicted_amount": max(0.0, float(row["yhat"]))
            }
            for _, row in forecast.iterrows()
        ]

        return {
            "model": "Prophet",
            "forecasts": forecasts
        }

    except Exception as e:
        return {
            "model": "Prophet",
            "error": str(e),
            "forecasts": []
        }


# =========================================================
# XGBOOST
# =========================================================

def forecast_xgboost(
    df: pd.DataFrame,
    periods: int = 30,
    start_date: Optional[pd.Timestamp] = None
) -> Dict:
    """
    Generate an XGBoost forecast using calendar + lag features.
    Handles gaps between last training date and forecast start.
    """
    if not XGBOOST_AVAILABLE:
        return {
            "model": "XGBoost",
            "error": "XGBoost not installed",
            "forecasts": []
        }

    try:
        data = df.copy()

        data["day"] = data["ds"].dt.day
        data["month"] = data["ds"].dt.month
        data["dayofweek"] = data["ds"].dt.dayofweek
        data["lag1"] = data["y"].shift(1)
        data["lag7"] = data["y"].shift(7)

        data = data.dropna()

        if len(data) < 14:
            return {
                "model": "XGBoost",
                "error": "Not enough data after lag creation",
                "forecasts": []
            }

        features = ["day", "month", "dayofweek", "lag1", "lag7"]
        X = data[features]
        y = data["y"]

        model = xgb.XGBRegressor(
            n_estimators=100,
            learning_rate=0.1,
            max_depth=4,
            objective="reg:squarederror"
        )
        model.fit(X, y)

        if start_date is None:
            start_date = get_forecast_start_date(df)

        # Build continuous history so lags remain correct even with gaps
        last_known_date = data["ds"].max()
        history = list(data["y"].values)

        gap_days = (start_date - last_known_date).days - 1
        if gap_days > 0:
            history.extend([0.0] * gap_days)

        predictions = []
        current_date = start_date - timedelta(days=1)

        for _ in range(periods):
            current_date += timedelta(days=1)

            lag1 = history[-1]
            lag7 = history[-7] if len(history) >= 7 else 0.0

            X_pred = pd.DataFrame([{
                "day": current_date.day,
                "month": current_date.month,
                "dayofweek": current_date.dayofweek,
                "lag1": lag1,
                "lag7": lag7
            }])

            pred = max(0.0, float(model.predict(X_pred)[0]))

            predictions.append({
                "date": current_date.strftime("%Y-%m-%d"),
                "predicted_amount": pred
            })

            history.append(pred)

        return {
            "model": "XGBoost",
            "forecasts": predictions
        }

    except Exception as e:
        return {
            "model": "XGBoost",
            "error": str(e),
            "forecasts": []
        }


# =========================================================
# MODEL EVALUATION
# =========================================================

def evaluate_forecast(
    actual: List[float],
    predicted: List[float]
) -> Dict:
    """
    Calculate MAE and RMSE.
    Rejects length mismatches instead of silently truncating.
    """
    if not actual or not predicted:
        return {}

    if len(actual) != len(predicted):
        return {
            "error": (
                f"Length mismatch: actual={len(actual)}, "
                f"predicted={len(predicted)}"
            )
        }

    mae = mean_absolute_error(actual, predicted)
    rmse = np.sqrt(mean_squared_error(actual, predicted))

    return {
        "mae": round(float(mae), 2),
        "rmse": round(float(rmse), 2)
    }


# =========================================================
# MODEL VALIDATION
# =========================================================

def validate_models(df: pd.DataFrame) -> Dict:
    """
    Chronological train/test split (last 20%).
    Forecasts are forced to start on the first test-set date
    so that metrics are meaningful.
    """
    total_points = len(df)

    if total_points < 30:
        return {
            "error": (
                "At least 30 days of data are required "
                "for reliable model evaluation."
            )
        }

    test_size = max(7, int(total_points * 0.20))
    train_size = total_points - test_size

    if train_size < 21:
        return {
            "error": "Not enough training data for model evaluation."
        }

    train_df = df.iloc[:train_size].copy()
    test_df = df.iloc[train_size:].copy()

    actual_values = test_df["y"].astype(float).tolist()
    periods = len(test_df)

    # Critical: force start date to the first day of the test set
    test_start = pd.to_datetime(test_df["ds"].iloc[0]).normalize()

    validation_results = {}

    # Individual models
    for name, func in [
        ("ARIMA", forecast_arima),
        ("Prophet", forecast_prophet),
        ("XGBoost", forecast_xgboost),
    ]:
        result = func(train_df, periods=periods, start_date=test_start)

        if result.get("forecasts"):
            predicted = [
                item["predicted_amount"]
                for item in result["forecasts"]
            ]
            metrics = evaluate_forecast(actual_values, predicted)
            if metrics and "error" not in metrics:
                validation_results[name] = metrics

    # Ensemble (simple equal weight)
    individual_results = [
        forecast_arima(train_df, periods, test_start),
        forecast_prophet(train_df, periods, test_start),
        forecast_xgboost(train_df, periods, test_start),
    ]

    valid_results = [
        r for r in individual_results
        if r.get("forecasts") and len(r["forecasts"]) > 0
    ]

    if valid_results:
        ensemble_predictions = []
        for i in range(periods):
            values = [
                r["forecasts"][i]["predicted_amount"]
                for r in valid_results
                if i < len(r["forecasts"])
            ]
            if values:
                ensemble_predictions.append(sum(values) / len(values))

        metrics = evaluate_forecast(actual_values, ensemble_predictions)
        if metrics and "error" not in metrics:
            validation_results["Ensemble"] = metrics

    return validation_results


# =========================================================
# MAIN HYBRID FORECAST
# =========================================================

def run_hybrid_forecast(
    expenses: List[dict],
    periods: int = 30,
    model: str = "ensemble"
) -> Dict:
    """
    Main forecasting entry point.

    All individual models are always generated and returned
    so the frontend can show comparison metrics.
    The `model` parameter only controls which forecast is
    marked as selected.
    """
    df = prepare_time_series(expenses)

    if df.empty or len(df) < 14:
        return {
            "error": (
                "Not enough data. Please add "
                "at least 14 days of expenses."
            ),
            "forecasts": []
        }

    model = str(model).lower().strip()
    valid_models = {"arima", "prophet", "xgboost", "ensemble"}
    if model not in valid_models:
        model = "ensemble"

    results = {}

    # Generate all models (production start date)
    arima_result = forecast_arima(df, periods)
    results["ARIMA"] = arima_result

    prophet_result = forecast_prophet(df, periods)
    results["Prophet"] = prophet_result

    xgb_result = forecast_xgboost(df, periods)
    results["XGBoost"] = xgb_result

    # Ensemble
    individual_results = [arima_result, prophet_result, xgb_result]
    valid_results = [
        r for r in individual_results
        if r.get("forecasts") and len(r["forecasts"]) > 0
    ]

    ensemble_forecasts = []
    if valid_results:
        for i in range(periods):
            values = []
            date = None
            for result in valid_results:
                forecasts = result["forecasts"]
                if i < len(forecasts):
                    values.append(forecasts[i]["predicted_amount"])
                    if date is None:
                        date = forecasts[i]["date"]
            if values:
                ensemble_forecasts.append({
                    "date": date,
                    "predicted_amount": round(sum(values) / len(values), 2)
                })

    results["Ensemble"] = {
        "model": "Ensemble",
        "forecasts": ensemble_forecasts
    }

    # Validation metrics
    evaluation = validate_models(df)

    # Attach metrics to every model that has them
    for model_name, metrics in evaluation.items():
        if model_name == "error":
            continue
        if model_name in results and isinstance(metrics, dict):
            results[model_name]["mae"] = metrics.get("mae")
            results[model_name]["rmse"] = metrics.get("rmse")

    # Selected model handling
    selected_key_map = {
        "arima": "ARIMA",
        "prophet": "Prophet",
        "xgboost": "XGBoost",
        "ensemble": "Ensemble"
    }
    selected_key = selected_key_map.get(model, "Ensemble")
    selected_result = results.get(selected_key)

    if selected_result:
        results["selected_model"] = model
        results["selected_forecast"] = selected_result.get("forecasts", [])
        results["selected_mae"] = selected_result.get("mae")
        results["selected_rmse"] = selected_result.get("rmse")
    else:
        results["selected_model"] = model
        results["selected_forecast"] = []
        results["selected_mae"] = None
        results["selected_rmse"] = None

    results["evaluation"] = evaluation

    return results