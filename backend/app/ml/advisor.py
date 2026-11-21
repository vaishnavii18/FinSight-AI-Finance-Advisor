
"""
AI Financial Advisor

Combines historical expense analysis, hybrid forecasting,
anomaly detection, rule-based budget recommendations,
and optional Ollama commentary.

Important:
- generate_recommendations() never calls Ollama.
- Python is the source of truth for financial calculations.
- Python determines Increase, Reduce, Maintain, or Review.
- Ollama only explains verified findings.
"""

from __future__ import annotations

import json
import math
import os
import re
import urllib.error
import urllib.request

from datetime import date, datetime, timedelta
from typing import Any

import pandas as pd
from sqlalchemy.orm import Session

from app.ml.anomaly_detection import detect_anomalies
from app.ml.forecasting import run_hybrid_forecast


# ============================================================
# OLLAMA CONFIGURATION
# ============================================================

OLLAMA_URL = os.getenv(
    "OLLAMA_URL",
    "http://localhost:11434/api/generate",
)

OLLAMA_MODEL = os.getenv("OLLAMA_MODEL", "llama3")

OLLAMA_TIMEOUT = float(os.getenv("OLLAMA_TIMEOUT", "180"))


# ============================================================
# BUDGET RECOMMENDATION CONFIGURATION
# ============================================================

MIN_CATEGORY_TRANSACTIONS = 5
MIN_CATEGORY_ACTIVE_MONTHS = 3

INCREASE_THRESHOLD = 1.10
REDUCE_THRESHOLD = 0.60

INCREASE_SAFETY_MARGIN = 1.15
REDUCE_SAFETY_MARGIN = 1.25

MIN_REDUCTION_FLOOR = 0.50


# ============================================================
# OLLAMA HELPER
# ============================================================

def _call_ollama(prompt: str) -> str:
    """Call Ollama and return generated text, or empty string."""

    payload = {
        "model": OLLAMA_MODEL,
        "prompt": prompt,
        "stream": False,
        "options": {
            "temperature": 0.2,
        },
    }

    request = urllib.request.Request(
        OLLAMA_URL,
        data=json.dumps(payload).encode("utf-8"),
        headers={
            "Content-Type": "application/json",
        },
        method="POST",
    )

    print("\n" + "=" * 60)
    print("OLLAMA DEBUG")
    print("=" * 60)
    print(f"OLLAMA URL: {OLLAMA_URL}")
    print(f"OLLAMA MODEL: {OLLAMA_MODEL}")
    print(f"OLLAMA TIMEOUT: {OLLAMA_TIMEOUT}")
    print(f"OLLAMA PROMPT LENGTH: {len(prompt)}")
    print("=" * 60)

    try:
        with urllib.request.urlopen(
            request,
            timeout=OLLAMA_TIMEOUT,
        ) as response:

            raw_response = response.read().decode("utf-8")

        data = json.loads(raw_response)

        generated_text = data.get("response", "")

        if not isinstance(generated_text, str):
            print("OLLAMA ERROR: response is not a string.")
            return ""

        generated_text = generated_text.strip()

        if not generated_text:
            print("OLLAMA ERROR: empty response.")
            return ""

        print("OLLAMA: generation successful.")
        print("OLLAMA RESPONSE:")
        print(generated_text)

        return generated_text

    except urllib.error.HTTPError as exc:
        print(
            f"OLLAMA HTTP ERROR: {exc.code} - {exc.reason}"
        )

        try:
            print(exc.read().decode("utf-8"))
        except Exception:
            pass

        return ""

    except urllib.error.URLError as exc:
        print("OLLAMA URL ERROR:", repr(exc))
        return ""

    except TimeoutError as exc:
        print(
            f"OLLAMA TIMEOUT after {OLLAMA_TIMEOUT}s:",
            repr(exc),
        )
        return ""

    except (json.JSONDecodeError, UnicodeDecodeError) as exc:
        print("OLLAMA RESPONSE PARSE ERROR:", repr(exc))
        return ""

    except OSError as exc:
        print("OLLAMA OS ERROR:", repr(exc))
        return ""

    except Exception as exc:
        print(
            "OLLAMA UNEXPECTED ERROR:",
            type(exc).__name__,
            repr(exc),
        )
        return ""


# ============================================================
# LLM REVIEW VALIDATION
# ============================================================

def _contains_numeric_claim(text: str) -> bool:
    """Reject numerical claims because figures come from Python."""

    if not text:
        return False

    patterns = [
        r"\d",
        r"[₹$€£]",
        r"\bINR\b",
        r"\bUSD\b",
        r"\bpercent(?:age)?\b",
        r"%",
        r"\b(?:rupees?|lakh|lakhs|crore|crores)\b",
    ]

    return any(
        re.search(pattern, text, flags=re.IGNORECASE)
        for pattern in patterns
    )


def _clean_llm_commentary(text: str) -> str:
    """Clean Ollama output and reject numerical claims."""

    if not isinstance(text, str):
        print("OLLAMA VALIDATION: Response is not text.")
        return ""

    text = text.strip()

    text = re.sub(
        r"^\s{0,3}#{1,6}\s*",
        "",
        text,
        flags=re.MULTILINE,
    )

    text = re.sub(
        r"^\s*[-*]\s*",
        "",
        text,
        flags=re.MULTILINE,
    )

    text = re.sub(r"\n{3,}", "\n\n", text).strip()

    if not text:
        print("OLLAMA VALIDATION: Empty commentary.")
        return ""

    if _contains_numeric_claim(text):
        print(
            "OLLAMA VALIDATION: "
            "Rejected numerical or financial claim."
        )
        print(text)
        return ""

    print("OLLAMA VALIDATION: Commentary accepted.")

    return text


# ============================================================
# VERIFIED FINANCIAL SECTION
# ============================================================

def _build_verified_financial_section(
    total_monthly_spending: float,
    budget_total: float,
    available_budget: float,
    recommendations: list,
    anomalies: list,
    data_quality_note: str | None,
) -> str:

    spending = max(0.0, float(total_monthly_spending))
    budget = max(0.0, float(budget_total))
    remaining = float(available_budget)

    if budget > 0:

        utilization = spending / budget * 100

        status = (
            "above the configured budget"
            if spending > budget
            else "within the configured budget"
        )

        utilization_text = f"{utilization:.2f}%"

    else:

        utilization_text = (
            "unavailable because no monthly budget is configured"
        )

        status = (
            "not comparable because no monthly budget is configured"
        )

    lines = [
        "## Current Financial Situation",
        f"- Estimated average monthly spending: ₹{spending:,.2f}.",
        f"- Total configured monthly budget: ₹{budget:,.2f}.",
        f"- Budget remaining after estimated spending: ₹{remaining:,.2f}.",
        f"- Budget utilization: {utilization_text}.",
        f"- Overall status: Spending is {status}.",
        (
            "- Note: Budget remaining is an allocation calculation, "
            "not the user's bank balance or available cash."
        ),
    ]

    if data_quality_note:
        lines.extend([
            "",
            "## Data Quality",
            data_quality_note,
        ])

    category_lines = []

    for item in recommendations:

        if not isinstance(item, dict):
            continue

        try:
            average = float(
                item.get("average_monthly_spending", 0) or 0
            )

            current = float(
                item.get("current_budget", 0) or 0
            )

            recommended = float(
                item.get("recommended_budget", 0) or 0
            )

        except (TypeError, ValueError):
            continue

        if not all(
            math.isfinite(v)
            for v in (average, current, recommended)
        ):
            continue

        if average <= 0:
            continue

        category = str(
            item.get("category") or "Uncategorized"
        )

        action = str(
            item.get("action") or "Review"
        )

        category_lines.append(
            f"- {category}: average monthly spending "
            f"₹{average:,.2f}; current budget ₹{current:,.2f}; "
            f"recommended budget ₹{recommended:,.2f}; "
            f"backend action: {action}."
        )

    lines.extend([
        "",
        "## Recorded Category Spending",
    ])

    if category_lines:
        lines.extend(category_lines)
    else:
        lines.append(
            "- No category had recorded spending in the selected period."
        )

    lines.extend([
        "",
        "## Unusual Spending",
    ])

    if anomalies:
        lines.append(
            f"- The backend flagged {len(anomalies)} potentially "
            "unusual transaction(s). Review the transaction details "
            "before taking action."
        )
    else:
        lines.append(
            "- The anomaly detector did not flag unusual transactions. "
            "This is not proof that every transaction is normal."
        )

    return "\n".join(lines)


# ============================================================
# OLLAMA QUALITATIVE ADVICE
# ============================================================

def _generate_llm_advice(
    total_monthly_spending: float,
    budget_total: float,
    available_budget: float,
    forecast_result: dict,
    recommendations: list,
    anomalies: list,
    data_quality_note: str | None,
) -> str:

    # --------------------------------------------------------
    # OVERALL STATUS
    # --------------------------------------------------------

    if budget_total <= 0:

        overall_status = "No monthly budget configured."

    elif total_monthly_spending > budget_total:

        overall_status = (
            "Estimated spending is above the configured budget."
        )

    else:

        overall_status = (
            "Estimated spending is within the configured budget."
        )

    if budget_total > 0:

        utilization = (
            total_monthly_spending / budget_total
        ) * 100

        if utilization >= 90:
            utilization_status = "Budget is nearly fully utilized."

        elif utilization >= 70:
            utilization_status = "Budget utilization is relatively high."

        elif utilization >= 40:
            utilization_status = "Budget utilization is moderate."

        else:
            utilization_status = "Budget utilization is relatively low."

    else:

        utilization_status = "Budget utilization cannot be assessed."

    # --------------------------------------------------------
    # CATEGORY INTERPRETATION
    # --------------------------------------------------------

    category_evidence = []

    for item in recommendations:

        if not isinstance(item, dict):
            continue

        try:

            average = float(
                item.get("average_monthly_spending", 0) or 0
            )

            current = float(
                item.get("current_budget", 0) or 0
            )

            recommended = float(
                item.get("recommended_budget", 0) or 0
            )

        except (TypeError, ValueError):
            continue

        if not all(
            math.isfinite(v)
            for v in (average, current, recommended)
        ):
            continue

        if min(average, current, recommended) < 0:
            continue

        if current > 0:

            if average > current:
                current_status = "above current budget"

            elif average < current:
                current_status = "below current budget"

            else:
                current_status = "equal to current budget"

        else:
            current_status = "no current budget configured"

        if recommended > 0:

            if average > recommended:
                recommended_status = "above recommended allocation"

            elif average < recommended:
                recommended_status = "below recommended allocation"

            else:
                recommended_status = "equal to recommended allocation"

        else:
            recommended_status = "no recommended allocation configured"

        action = str(
            item.get("action", "Review")
        ).strip()

        explanations = {
            "increase": (
                "The backend recommends increasing the budget allocation "
                "because historical spending exceeds the existing budget."
            ),
            "reduce": (
                "The backend recommends reducing the budget allocation "
                "because historical spending is consistently well below it."
            ),
            "maintain": (
                "The backend recommends retaining the current allocation. "
                "This does not establish that spending is optimal."
            ),
            "review": (
                "The backend recommends reviewing this category before "
                "changing its allocation."
            ),
        }

        category_evidence.append({

            "category": str(
                item.get("category", "Other")
            ),

            "historical_spending_vs_current_budget": current_status,

            "historical_spending_vs_recommended_budget": (
                recommended_status
            ),

            "backend_action": action,

            "verified_explanation": explanations.get(
                action.casefold(),
                explanations["review"],
            ),

        })

    # --------------------------------------------------------
    # DATA QUALITY
    # --------------------------------------------------------

    note = (data_quality_note or "").lower()

    if "no expenses were recorded" in note:

        quality_status = "No recent expense records."

    elif "limited recent history" in note:

        quality_status = (
            "Limited historical data. Conclusions must be cautious."
        )

    elif "recent analysis covers" in note:

        quality_status = (
            "The available records pass the backend's minimum "
            "data checks. This does not establish completeness."
        )

    else:

        quality_status = "Data quality could not be established."

    # --------------------------------------------------------
    # ANOMALIES
    # --------------------------------------------------------

    anomaly_status = (
        "Potentially unusual transactions were flagged for review."
        if anomalies
        else "No transactions were flagged by the anomaly detector."
    )

    # --------------------------------------------------------
    # FORECAST
    # --------------------------------------------------------

    forecast_available = (
        isinstance(forecast_result, dict)
        and bool(forecast_result)
        and not forecast_result.get("error")
    )

    forecast_status = (
        "Forecast output is available, but its accuracy "
        "has not been established."
        if forecast_available
        else "Forecast output is unavailable or incomplete."
    )

    # --------------------------------------------------------
    # VERIFIED EVIDENCE
    # --------------------------------------------------------

    evidence = {

        "overall_budget_status": overall_status,

        "budget_utilization_interpretation": utilization_status,

        "categories": category_evidence,

        "data_quality": quality_status,

        "anomaly_detection": anomaly_status,

        "forecast": forecast_status,

    }

    # --------------------------------------------------------
    # PROMPT
    # --------------------------------------------------------

    prompt = f"""
You are FinSight, a careful financial analysis assistant.

Interpret findings produced by a Python financial analysis system.

VERIFIED FINDINGS:

{json.dumps(evidence, indent=2, ensure_ascii=False)}

IMPORTANT RULES:

1. Python has already calculated all financial relationships.
2. Do not recalculate or reinterpret those relationships.
3. Never claim spending exceeds a budget unless the supplied
   comparison explicitly says "above current budget".
4. Increase means increasing a budget allocation.
5. Reduce means reducing a budget allocation.
6. Maintain means retaining the existing allocation.
7. Review means further examination, not an automatic increase.
8. A low spending level does not automatically mean a budget
   is unnecessary.
9. Flagged transactions are not proof of fraud.
10. Forecast availability does not establish prediction accuracy.
11. Communicate data uncertainty honestly.
12. Follow the verified_explanation for each category.
13. Do not contradict the backend_action.
14. Do not describe Maintain as optimal or problem-free.
15. Do not invent missing financial information.

YOUR TASK:

Write a useful financial review covering:

- Overall financial position.
- Important category observations.
- Why categories were assigned their respective actions.
- Potential risks and data limitations.
- Practical next steps.

OUTPUT REQUIREMENTS:

- Write three or four concise paragraphs.
- Use natural, professional English.
- Do not include digits or numerical figures.
- Do not include currency symbols or percentages.
- Do not invent financial facts.
- Avoid generic financial advice.
- Return plain text only.
"""

    print(
        "\nADVISOR: preparing evidence-based Ollama commentary..."
    )

    raw_advice = _call_ollama(prompt)

    commentary = _clean_llm_commentary(raw_advice)

    verified_section = _build_verified_financial_section(
        total_monthly_spending=total_monthly_spending,
        budget_total=budget_total,
        available_budget=available_budget,
        recommendations=recommendations,
        anomalies=anomalies,
        data_quality_note=data_quality_note,
    )

    if commentary:

        print(
            "ADVISOR: evidence-based Ollama commentary accepted."
        )

        return (
            verified_section
            + "\n\n## AI Observations\n"
            + commentary
        )

    print(
        "ADVISOR: Ollama commentary unavailable or rejected. "
        "Using verified rule-based fallback."
    )

    return (
        verified_section
        + "\n\n## AI Observations\n"
        + "AI commentary was unavailable or did not pass "
        "the output validation rules. The verified "
        "Python-generated financial findings remain available."
    )


# ============================================================
# SEPARATE OLLAMA REVIEW FUNCTION
# ============================================================

def generate_llm_review(
    total_monthly_spending: float,
    budget_total: float,
    available_budget: float,
    forecast_result: dict,
    recommendations: list,
    anomalies: list,
    data_quality_note: str | None,
) -> dict[str, Any]:

    print("\n" + "=" * 60)
    print("ADVISOR: starting optional Ollama review...")
    print("=" * 60)

    try:

        advice = _generate_llm_advice(

            total_monthly_spending=total_monthly_spending,

            budget_total=budget_total,

            available_budget=available_budget,

            forecast_result=forecast_result,

            recommendations=recommendations,

            anomalies=anomalies,

            data_quality_note=data_quality_note,

        )

        if advice:

            fallback_used = (
                "AI commentary was unavailable or did not pass"
                in advice
            )

            return {

                "success": True,

                "advice": advice,

                "source": (
                    "rule_based"
                    if fallback_used
                    else "ollama"
                ),

                "message": (
                    "Verified rule-based review returned; "
                    "AI commentary was unavailable or rejected."
                    if fallback_used
                    else None
                ),

            }

        return {

            "success": False,

            "advice": "",

            "source": "rule_based",

            "message": "No review could be generated.",

        }

    except Exception as exc:

        print(
            "ADVISOR: Ollama review failed:",
            type(exc).__name__,
            repr(exc),
        )

        return {

            "success": False,

            "advice": "",

            "source": "rule_based",

            "message": "Ollama review is currently unavailable.",

        }


# ============================================================
# MAIN ADVISOR FUNCTION
# ============================================================

def generate_recommendations(
    db: Session,
    user_id: int,
    forecast_days: int = 30,
    lookback_days: int = 60,
) -> dict[str, Any]:

    from app.models import Budget, Expense

    # ========================================================
    # 1. LOAD USER-SPECIFIC DATA
    # ========================================================

    expenses = (
        db.query(Expense)
        .filter(
            Expense.user_id == user_id,
            Expense.transaction_type == "expense",
        )
        .order_by(Expense.date.asc())
        .all()
    )

    budgets = (
        db.query(Budget)
        .filter(
            Budget.user_id == user_id
        )
        .all()
    )

    # ========================================================
    # 2. GROUP BUDGET CATEGORIES
    # ========================================================

    budget_groups = {}

    for budget in budgets:

        category = (
            budget.category or "Other"
        ).strip() or "Other"

        category_key = category.casefold()

        if category_key not in budget_groups:

            budget_groups[category_key] = {

                "category": category,

                "current_budget": 0.0,

            }

        budget_groups[category_key]["current_budget"] += float(
            budget.monthly_limit or 0
        )

    budget_total = sum(
        item["current_budget"]
        for item in budget_groups.values()
    )

    # ========================================================
    # 3. EMPTY RESPONSE
    # ========================================================

    def empty_response(message: str) -> dict[str, Any]:

        return {

            "generated_at": datetime.now().astimezone().isoformat(),

            "period_days": lookback_days,

            "summary": message,

            "recommendations": [],

            "forecast": {},

            "anomalies": [],

            "data_quality": {

                "status": "insufficient_data",

                "months_available": 0,

                "days_available": 0,

                "total_expenses": 0,

                "message": message,

            },

            "financial_summary": {

                "total_spending": 0.0,

                "average_monthly_spending": 0.0,

                "total_budget": round(budget_total, 2),

                "available_budget": round(budget_total, 2),

            },

            "data_quality_note": message,

        }

    if not expenses:

        return empty_response(
            "No expense records are available. Add expenses "
            "to receive personalized financial recommendations."
        )

    # ========================================================
    # 4. VALIDATE EXPENSE RECORDS
    # ========================================================

    expense_rows = []

    invalid_records = 0

    for expense in expenses:

        try:

            if expense.date is None:
                invalid_records += 1
                continue

            amount = float(expense.amount)

            if not math.isfinite(amount) or amount <= 0:
                invalid_records += 1
                continue

            transaction_date = expense.date

            if isinstance(transaction_date, datetime):
                transaction_date = transaction_date.date()

            if transaction_date > date.today():
                invalid_records += 1
                continue

            category = (
                expense.category or "Other"
            ).strip() or "Other"

            expense_rows.append({

                "date": transaction_date.isoformat(),

                "amount": amount,

                "category": category,

                "description": expense.description or "",

            })

        except (
            TypeError,
            ValueError,
            OverflowError,
        ):

            invalid_records += 1
            continue

    if not expense_rows:

        return empty_response(
            "No valid expense records are available for analysis. "
            "Please check transaction dates and amounts."
        )

    df = pd.DataFrame(expense_rows)

    df["date"] = pd.to_datetime(
        df["date"],
        errors="coerce",
    )

    df["amount"] = pd.to_numeric(
        df["amount"],
        errors="coerce",
    )

    df = df.dropna(
        subset=["date", "amount"]
    ).copy()

    df = df[
        (df["amount"] > 0)
        & (df["amount"].map(math.isfinite))
    ].copy()

    df["category"] = (
        df["category"]
        .fillna("Other")
        .astype(str)
        .str.strip()
        .replace("", "Other")
    )

    df["category_key"] = (
        df["category"].str.casefold()
    )

    if df.empty:

        return empty_response(
            "No valid expenses remain after data cleaning."
        )

    clean_rows = [

        {

            "date": row["date"].date().isoformat(),

            "amount": float(row["amount"]),

            "category": row["category"],

            "description": row["description"],

        }

        for _, row in df.iterrows()

    ]

    # ========================================================
    # 5. APPLY LOOKBACK PERIOD
    # ========================================================

    today = date.today()

    cutoff_date = today - timedelta(
        days=lookback_days - 1
    )

    recent_df = df[

        (df["date"].dt.date >= cutoff_date)

        & (df["date"].dt.date <= today)

    ].copy()

    # ========================================================
    # 6. DATA QUALITY
    # ========================================================

    unique_days = int(
        recent_df["date"].dt.normalize().nunique()
    )

    unique_months = int(
        recent_df["date"].dt.to_period("M").nunique()
    )

    if recent_df.empty:

        data_quality_note = (
            f"No expenses were recorded in the last "
            f"{lookback_days} days. Historical records are available, "
            "but recent spending analysis cannot be performed."
        )

    elif unique_days < 30 or unique_months < 2:

        data_quality_note = (
            f"Limited recent history: {unique_days} distinct expense days "
            f"across {unique_months} calendar months. Treat spending "
            "estimates cautiously."
        )

    else:

        data_quality_note = (
            f"Recent analysis covers {lookback_days} days, "
            f"with {unique_days} distinct expense days."
        )

    data_quality_status = (
        "available"
        if unique_days >= 30 and unique_months >= 2
        else "limited"
    )

    # ========================================================
    # 7. RECENT SPENDING
    # ========================================================

    total_spending = float(
        recent_df["amount"].sum()
    )

    total_monthly_spending = (
        total_spending / lookback_days
    ) * 30.4375

    available_budget = (
        budget_total - total_monthly_spending
    )

    # ========================================================
    # 8. FORECAST
    # ========================================================

    forecast_result: dict[str, Any] = {}

    try:

        forecast_output = run_hybrid_forecast(
            expenses=clean_rows,
            periods=forecast_days,
            model="ensemble",
        )

        if isinstance(forecast_output, dict):
            forecast_result = forecast_output
        else:
            forecast_result = {
                "result": forecast_output
            }

    except Exception as exc:

        print(
            "ADVISOR FORECAST ERROR:",
            repr(exc),
        )

        forecast_result = {
            "error": "Forecast is currently unavailable."
        }

    # ========================================================
    # 9. ANOMALY DETECTION
    # ========================================================

    anomalies: list[dict[str, Any]] = []

    if not recent_df.empty:

        recent_rows = [

            {

                "date": row["date"].date().isoformat(),

                "amount": float(row["amount"]),

                "category": row["category"],

                "description": row["description"],

            }

            for _, row in recent_df.iterrows()

        ]

        try:

            anomaly_output = detect_anomalies(recent_rows)

            if isinstance(anomaly_output, list):

                anomalies = [

                    item

                    for item in anomaly_output

                    if isinstance(item, dict)
                    and item.get("is_anomaly", False)

                ]

            elif isinstance(anomaly_output, dict):

                possible_anomalies = (
                    anomaly_output.get("anomalies", [])
                )

                if isinstance(possible_anomalies, list):

                    anomalies = [

                        item

                        for item in possible_anomalies

                        if isinstance(item, dict)
                        and item.get("is_anomaly", True)

                    ]

        except Exception as exc:

            print(
                "ADVISOR ANOMALY ERROR:",
                repr(exc),
            )

    # ========================================================
    # 10. CATEGORY SPENDING AND FREQUENCY
    # ========================================================

    category_monthly_average = {}

    category_transaction_count = {}

    category_active_months = {}

    category_stats = pd.DataFrame()

    if not recent_df.empty:

        category_stats = (

            recent_df.groupby("category_key")

            .agg(

                total_amount=("amount", "sum"),

                transaction_count=("amount", "count"),

                active_months=(
                    "date",
                    lambda values: (
                        values.dt.to_period("M").nunique()
                    ),
                ),

            )

        )

    for category_key, stats in category_stats.iterrows():

        category_monthly_average[category_key] = (

            float(stats["total_amount"])
            / lookback_days
        ) * 30.4375

        category_transaction_count[category_key] = int(
            stats["transaction_count"]
        )

        category_active_months[category_key] = int(
            stats["active_months"]
        )

    # ========================================================
    # 11. FOUR-ACTION BUDGET RECOMMENDATION ENGINE
    # ========================================================

    recommendations: list[dict[str, Any]] = []

    for category_key, budget_info in budget_groups.items():

        category = budget_info["category"]

        current_budget = float(
            budget_info["current_budget"]
        )

        average_spending = float(
            category_monthly_average.get(
                category_key,
                0.0,
            )
        )

        transaction_count = int(
            category_transaction_count.get(
                category_key,
                0,
            )
        )

        active_months = int(
            category_active_months.get(
                category_key,
                0,
            )
        )

        recommended_budget = current_budget

        action = "Maintain"

        reason = ""

        # ----------------------------------------------------
        # CASE 1: Insufficient overall data
        # ----------------------------------------------------

        if data_quality_status == "limited":

            action = "Review"

            reason = (
                "Overall historical data is insufficient "
                "for a reliable budget adjustment. "
                "Collect more consistent expense records."
            )

        # ----------------------------------------------------
        # CASE 2: No category spending
        # ----------------------------------------------------

        elif transaction_count == 0:

            action = "Review"

            reason = (
                "No recent transactions were recorded for this category. "
                "Check whether the category is still relevant and whether "
                "occasional expenses are expected before changing its budget."
            )

        # ----------------------------------------------------
        # CASE 3: Insufficient category-level history
        # ----------------------------------------------------

        elif (
            active_months < MIN_CATEGORY_ACTIVE_MONTHS
            or transaction_count < MIN_CATEGORY_TRANSACTIONS
        ):

            action = "Review"

            reason = (
                "Category-level transaction history is insufficient "
                "to justify an automatic budget change. Review recurring "
                "and occasional expenses first."
            )

        # ----------------------------------------------------
        # CASE 4: Spending exceeds budget
        # ----------------------------------------------------

        elif (
            current_budget > 0
            and average_spending > current_budget * INCREASE_THRESHOLD
        ):

            action = "Increase"

            recommended_budget = (
                average_spending * INCREASE_SAFETY_MARGIN
            )

            reason = (
                "Historical monthly spending consistently exceeds "
                "the current allocation. A higher budget is suggested "
                "to better reflect the observed spending pattern."
            )

        # ----------------------------------------------------
        # CASE 5: No existing budget, but spending exists
        # ----------------------------------------------------

        elif current_budget <= 0 and average_spending > 0:

            action = "Increase"

            recommended_budget = (
                average_spending * INCREASE_SAFETY_MARGIN
            )

            reason = (
                "This category has recurring expenses but no meaningful "
                "budget allocation. A starting allocation is suggested "
                "based on its historical spending."
            )

        # ----------------------------------------------------
        # CASE 6: Spending is substantially below budget
        # ----------------------------------------------------

        elif (
            current_budget > 0
            and average_spending < current_budget * REDUCE_THRESHOLD
        ):

            action = "Reduce"

            calculated_budget = (
                average_spending * REDUCE_SAFETY_MARGIN
            )

            minimum_allowed_budget = (
                current_budget * MIN_REDUCTION_FLOOR
            )

            recommended_budget = max(
                calculated_budget,
                minimum_allowed_budget,
            )

            # Never recommend a reduction that is not actually lower.
            recommended_budget = min(
                recommended_budget,
                current_budget,
            )

            reason = (
                f"Average monthly spending ({average_spending:,.2f}) is "
                f"below 60% of the current allocation ({current_budget:,.2f}). "
                f"The 25% spending buffer would be {calculated_budget:,.2f}, "
                f"but the minimum allocation floor is {minimum_allowed_budget:,.2f} "
                "(50% of the current budget), so that floor sets the recommendation."
            )

        # ----------------------------------------------------
        # CASE 7: Spending is reasonably close to budget
        # ----------------------------------------------------

        elif (
            current_budget > 0
            and average_spending >= current_budget * 0.75
        ):

            action = "Maintain"

            reason = (
                "Historical spending is reasonably aligned with the "
                "current allocation. Retaining the existing budget "
                "provides continuity without an unnecessary adjustment."
            )

        # ----------------------------------------------------
        # CASE 8: Moderate under-utilization
        # ----------------------------------------------------

        else:

            action = "Maintain"

            reason = (
                "Spending is below the current allocation, but the "
                "difference is not sufficient to justify an automatic "
                "budget reduction. Continue monitoring this category."
            )

        # ----------------------------------------------------
        # FINAL CALCULATIONS
        # ----------------------------------------------------

        recommended_budget = max(
            0.0,
            float(recommended_budget),
        )

        difference = (
            recommended_budget - current_budget
        )

        percentage_change = (
            difference / current_budget * 100
            if current_budget > 0
            else (
                100.0
                if recommended_budget > 0
                else 0.0
            )
        )

        recommendations.append({

            "category": category,

            "current_budget": round(
                current_budget,
                2,
            ),

            "average_monthly_spending": round(
                average_spending,
                2,
            ),

            "target_allocation": round(
                recommended_budget,
                2,
            ),

            "recommended_budget": round(
                recommended_budget,
                2,
            ),

            "difference": round(
                difference,
                2,
            ),

            "percentage_change": round(
                percentage_change,
                2,
            ),

            "action": action,

            "reason": reason,

            "transaction_count": transaction_count,

            "active_months": active_months,

        })

    # ========================================================
    # 12. RULE-BASED SUMMARY
    # ========================================================

    if recent_df.empty:

        summary = (
            f"No expenses were recorded during the selected "
            f"{lookback_days}-day analysis period. Historical data "
            "is retained for forecasting."
        )

    elif budget_total <= 0:

        summary = (
            "No monthly budget has been configured yet. Create category "
            "budgets to receive personalized budget recommendations."
        )

    elif available_budget < 0:

        summary = (
            "Your estimated monthly spending is above your configured "
            "budget. Review categories with higher spending before "
            "deciding whether budget changes are justified."
        )

    elif available_budget < budget_total * 0.10:

        summary = (
            "Your estimated monthly spending is close to your configured "
            "budget. Monitor discretionary spending carefully."
        )

    else:

        summary = (
            "Your estimated monthly spending is currently within your "
            "configured budget. Review category allocations to identify "
            "possible savings."
        )

    if anomalies:

        summary += (
            f" The analysis identified {len(anomalies)} potentially "
            f"unusual spending record"
            f"{'s' if len(anomalies) != 1 else ''}. Review them before "
            "making budget decisions."
        )

    if invalid_records > 0:

        summary += (
            f" {invalid_records} invalid or future-dated transaction "
            "record(s) were excluded."
        )

    # ========================================================
    # 13. FINAL RESPONSE
    # ========================================================

    return {

        "generated_at": datetime.now().astimezone().isoformat(),

        "period_days": lookback_days,

        "summary": summary,

        "recommendations": recommendations,

        "forecast": forecast_result,

        "anomalies": anomalies,

        "data_quality": {

            "status": data_quality_status,

            "months_available": int(unique_months),

            "days_available": int(unique_days),

            "total_expenses": int(len(recent_df)),

            "message": data_quality_note,

        },

        "financial_summary": {

            "total_spending": round(
                total_spending,
                2,
            ),

            "average_monthly_spending": round(
                total_monthly_spending,
                2,
            ),

            "total_budget": round(
                budget_total,
                2,
            ),

            "available_budget": round(
                available_budget,
                2,
            ),

        },

        "data_quality_note": data_quality_note,

    }
