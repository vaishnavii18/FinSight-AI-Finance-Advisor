import pandas as pd
from datetime import timedelta
from typing import List, Dict

try:
    import shap
    SHAP_AVAILABLE = True
except ImportError:
    SHAP_AVAILABLE = False

try:
    import xgboost as xgb
    XGBOOST_AVAILABLE = True
except ImportError:
    XGBOOST_AVAILABLE = False


# =========================================================
# XGBOOST SHAP EXPLAINABILITY
# =========================================================

FEATURES = [
    "day",
    "month",
    "dayofweek",
    "lag1",
    "lag7",
]


def explain_xgboost_forecast(
    expenses: List[dict],
    periods: int = 30,
) -> Dict:
    """
    Explain the XGBoost forecasting model using SHAP.

    Feature engineering is kept consistent with forecasting.py.
    """

    if not XGBOOST_AVAILABLE:
        return {
            "status": "error",
            "error": "XGBoost is not installed."
        }

    if not SHAP_AVAILABLE:
        return {
            "status": "error",
            "error": "SHAP library is not installed."
        }

    if not expenses:
        return {
            "status": "error",
            "error": "No expense data available."
        }

    try:
        # =====================================================
        # PREPARE DATA (with basic cleaning)
        # =====================================================

        df = pd.DataFrame(expenses)

        if "date" not in df.columns or "amount" not in df.columns:
            return {
                "status": "error",
                "error": "Expense data must contain date and amount."
            }

        df["date"] = pd.to_datetime(df["date"], errors="coerce")
        df["amount"] = pd.to_numeric(df["amount"], errors="coerce")

        df = df.dropna(subset=["date", "amount"])
        df = df[df["amount"] >= 0]

        if df.empty:
            return {
                "status": "error",
                "error": "No valid expense records after cleaning."
            }

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
            freq="D",
        )

        df = (
            df.set_index("date")
            .reindex(full_range, fill_value=0)
            .rename_axis("date")
            .reset_index()
        )

        df.columns = ["ds", "y"]

        if len(df) < 14:
            return {
                "status": "error",
                "error": "Not enough data. Please add at least 14 days of expenses."
            }

        # =====================================================
        # CREATE FEATURES (same as forecasting.py)
        # =====================================================

        data = df.copy()

        data["day"] = data["ds"].dt.day
        data["month"] = data["ds"].dt.month
        data["dayofweek"] = data["ds"].dt.dayofweek
        data["lag1"] = data["y"].shift(1)
        data["lag7"] = data["y"].shift(7)

        data = data.dropna()

        if len(data) < 7:
            return {
                "status": "error",
                "error": "Not enough historical observations for SHAP explanation."
            }

        X = data[FEATURES]
        y = data["y"]

        # =====================================================
        # TRAIN XGBOOST MODEL (same config)
        # =====================================================

        model = xgb.XGBRegressor(
            n_estimators=100,
            learning_rate=0.1,
            max_depth=4,
            objective="reg:squarederror",
        )

        model.fit(X, y)

        # =====================================================
        # SHAP EXPLAINER
        # =====================================================

        explainer = shap.TreeExplainer(model)

        # =====================================================
        # RECURSIVE FUTURE FORECAST + SHAP
        # =====================================================

        last_known_date = data["ds"].max()
        history = list(data["y"].values)

        # Start from the day after the last known date
        current_date = last_known_date

        explanations = []
        feature_abs_contributions = {feature: [] for feature in FEATURES}

        periods = max(1, min(int(periods), 90))

        for _ in range(periods):
            current_date += timedelta(days=1)

            lag1 = history[-1]
            lag7 = history[-7] if len(history) >= 7 else 0.0

            X_pred = pd.DataFrame([{
                "day": current_date.day,
                "month": current_date.month,
                "dayofweek": current_date.dayofweek,
                "lag1": lag1,
                "lag7": lag7,
            }])

            prediction = max(0.0, float(model.predict(X_pred)[0]))

            # SHAP values
            shap_values = explainer.shap_values(X_pred)
            shap_row = shap_values[0]

            expected_value = explainer.expected_value

            if hasattr(expected_value, "item"):
                base_value = float(expected_value.item())
            elif isinstance(expected_value, (list, tuple)):
                base_value = float(expected_value[0])
            else:
                try:
                    base_value = float(expected_value)
                except (TypeError, ValueError):
                    base_value = 0.0

            feature_contributions = []

            for index, feature in enumerate(FEATURES):
                shap_value = float(shap_row[index])
                feature_value = float(X_pred.iloc[0][feature])

                feature_abs_contributions[feature].append(abs(shap_value))

                if shap_value > 0:
                    direction = "increases_prediction"
                elif shap_value < 0:
                    direction = "decreases_prediction"
                else:
                    direction = "neutral"

                feature_contributions.append({
                    "feature": feature,
                    "value": round(feature_value, 4),
                    "shap_value": round(shap_value, 4),
                    "direction": direction,
                })

            explanations.append({
                "date": current_date.strftime("%Y-%m-%d"),
                "predicted_amount": round(prediction, 2),
                "base_value": round(base_value, 4),
                "feature_contributions": feature_contributions,
            })

            history.append(prediction)

        # =====================================================
        # AGGREGATED FEATURE IMPORTANCE
        # =====================================================

        feature_importance = []

        for feature in FEATURES:
            values = feature_abs_contributions[feature]
            mean_abs_shap = sum(values) / len(values) if values else 0.0

            feature_importance.append({
                "feature": feature,
                "mean_absolute_shap": round(float(mean_abs_shap), 4),
            })

        feature_importance.sort(
            key=lambda item: item["mean_absolute_shap"],
            reverse=True,
        )

        # =====================================================
        # RETURN
        # =====================================================

        return {
            "status": "success",
            "model": "XGBoost",
            "explainer": "SHAP TreeExplainer",
            "features": FEATURES,
            "forecast_horizon": periods,
            "feature_importance": feature_importance,
            "explanations": explanations,
        }

    except Exception as e:
        return {
            "status": "error",
            "error": str(e),
        }