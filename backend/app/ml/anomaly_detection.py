
from typing import List, Dict, Any

import numpy as np
from sklearn.ensemble import IsolationForest


def _get_severity(
    is_anomaly: bool,
    anomaly_score: float,
) -> str:
    """
    Assign display severity using application-level thresholds.

    These values are NOT probabilities or confidence levels.
    """

    if not is_anomaly:
        return "Normal"

    if anomaly_score >= 0.30:
        return "High"

    if anomaly_score >= 0.15:
        return "Medium"

    return "Low"


def detect_anomalies(
    expenses: List[dict],
    contamination: float = 0.1,
) -> List[dict]:
    """
    Detect unusual expense amounts using Isolation Forest.

    Features:
        - Log-transformed transaction amount.

    Invalid amounts are excluded from model fitting.
    They are not silently converted into zero-value transactions.

    The model needs at least 10 valid transactions and
    at least 3 distinct amounts to run.
    """

    if not 0 < contamination < 0.5:
        raise ValueError(
            "Contamination must be greater than 0 and less than 0.5."
        )

    results = [
        expense.copy()
        for expense in expenses
    ]

    if not results:
        return results

    # --------------------------------------------------------
    # 1. INITIALIZE DEFAULT RESULTS
    # --------------------------------------------------------

    valid_indices = []
    valid_amounts = []

    for index, expense in enumerate(results):

        expense["is_anomaly"] = False
        expense["anomaly_score"] = 0.0
        expense["severity"] = "Normal"

        try:

            amount = float(
                expense.get("amount")
            )

            if not np.isfinite(amount) or amount <= 0:
                continue

            valid_indices.append(index)
            valid_amounts.append(amount)

            expense["amount"] = amount

        except (TypeError, ValueError, OverflowError):
            continue

    # --------------------------------------------------------
    # 2. CHECK MINIMUM DATA REQUIREMENTS
    # --------------------------------------------------------

    if len(valid_amounts) < 10:
        return results

    amount_array = np.asarray(
        valid_amounts,
        dtype=float,
    )

    # A model cannot meaningfully distinguish unusual
    # values when all transactions have identical amounts.
    distinct_amounts = np.unique(
        amount_array
    )

    if len(distinct_amounts) < 3:
        return results

    # --------------------------------------------------------
    # 3. FEATURE TRANSFORMATION
    # --------------------------------------------------------

    log_amounts = np.log1p(
        amount_array
    )

    X = log_amounts.reshape(-1, 1)

    # --------------------------------------------------------
    # 4. TRAIN ISOLATION FOREST
    # --------------------------------------------------------

    model = IsolationForest(
        n_estimators=200,
        contamination=contamination,
        random_state=42,
        n_jobs=-1,
    )

    predictions = model.fit_predict(X)

    decision_scores = model.decision_function(X)

    # Higher values indicate more unusual observations.
    anomaly_scores = np.maximum(
        -decision_scores,
        0.0,
    )

    # --------------------------------------------------------
    # 5. ASSIGN RESULTS
    # --------------------------------------------------------

    for position, original_index in enumerate(valid_indices):

        is_anomaly = bool(
            predictions[position] == -1
        )

        anomaly_score = float(
            anomaly_scores[position]
        )

        expense = results[original_index]

        expense["is_anomaly"] = is_anomaly

        expense["anomaly_score"] = round(
            anomaly_score,
            4,
        )

        expense["severity"] = _get_severity(
            is_anomaly=is_anomaly,
            anomaly_score=anomaly_score,
        )

    return results


def get_anomaly_summary(
    expenses: List[dict],
) -> Dict[str, Any]:
    """
    Generate summary statistics for detected anomalies.
    """

    anomalies = [
        expense
        for expense in expenses
        if bool(
            expense.get("is_anomaly", False)
        )
    ]

    total_anomaly_amount = 0.0

    for expense in anomalies:

        try:

            amount = float(
                expense.get("amount", 0)
            )

            if np.isfinite(amount) and amount > 0:
                total_anomaly_amount += amount

        except (TypeError, ValueError, OverflowError):
            continue

    total_expenses = len(expenses)
    anomaly_count = len(anomalies)

    anomaly_percentage = (
        (anomaly_count / total_expenses) * 100
        if total_expenses > 0
        else 0.0
    )

    severity_counts = {
        "High": 0,
        "Medium": 0,
        "Low": 0,
    }

    for anomaly in anomalies:

        severity = anomaly.get(
            "severity",
            "Low",
        )

        if severity in severity_counts:
            severity_counts[severity] += 1

    return {
        "total_expenses": total_expenses,
        "anomaly_count": anomaly_count,
        "anomaly_percentage": round(
            anomaly_percentage,
            2,
        ),
        "total_anomaly_amount": round(
            total_anomaly_amount,
            2,
        ),
        "severity_counts": severity_counts,
        "anomalies": anomalies,
    }
