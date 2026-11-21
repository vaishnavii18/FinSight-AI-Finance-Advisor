
from typing import Any
import math

from fastapi import APIRouter, Depends, Query, HTTPException
from sqlalchemy.orm import Session

from app.database import get_db
from app.ml.advisor import (
    generate_recommendations,
    generate_llm_review,
)
from app.models import User
from app.schemas import AdvisorResponse
from app.security import get_current_user

router = APIRouter(
    prefix="/advisor",
    tags=["AI Advisor"],
)


# Existing rule-based advisor endpoint
@router.get(
    "/recommendations",
    response_model=AdvisorResponse,
)
def get_ai_recommendations(
    forecast_days: int = Query(
        30, ge=7, le=90,
        description="Number of days to forecast ahead",
    ),
    lookback_days: int = Query(
        200, ge=14, le=365,
        description="Number of past days to analyze",
    ),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    return generate_recommendations(
        db=db,
        user_id=current_user.id,
        forecast_days=forecast_days,
        lookback_days=lookback_days,
    )


# New Ollama LLM review endpoint
@router.post("/llm-review")
def get_llm_financial_review(
    payload: dict[str, Any],
    current_user: User = Depends(get_current_user),
):
    financial_summary = payload.get("financial_summary")

    if not isinstance(financial_summary, dict):
        raise HTTPException(
            status_code=422,
            detail="Valid financial_summary data is required.",
        )

    def get_number(key: str) -> float:
        try:
            value = float(financial_summary.get(key, 0))

            if not math.isfinite(value):
                raise ValueError

            return value

        except (TypeError, ValueError, OverflowError):
            raise HTTPException(
                status_code=422,
                detail=f"Invalid financial value: {key}",
            )

    forecast = payload.get("forecast") or {}
    recommendations = payload.get("recommendations") or []
    anomalies = payload.get("anomalies") or []

    if not isinstance(forecast, dict):
        forecast = {}

    if not isinstance(recommendations, list):
        recommendations = []

    if not isinstance(anomalies, list):
        anomalies = []

    data_quality_note = (
        payload.get("data_quality_note")
        or (
            payload.get("data_quality", {}).get("message")
            if isinstance(payload.get("data_quality"), dict)
            else None
        )
    )

    return generate_llm_review(
        total_monthly_spending=get_number(
            "average_monthly_spending"
        ),
        budget_total=get_number("total_budget"),
        available_budget=get_number("available_budget"),
        forecast_result=forecast,
        recommendations=recommendations,
        anomalies=anomalies,
        data_quality_note=data_quality_note,
    )
