
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import User
from app.security import get_current_user

router = APIRouter(prefix="/user-settings", tags=["User Settings"])


class SettingsUpdate(BaseModel):
    monthly_income: float = Field(ge=0)
    total_monthly_budget: float = Field(ge=0)
    currency: str
    theme: str


@router.get("/")
def get_settings(
    user: User = Depends(get_current_user),
):
    return {
        "monthly_income": user.monthly_income,
        "total_monthly_budget": user.total_monthly_budget,
        "currency": user.currency,
        "theme": user.theme,
    }


@router.put("/")
def update_settings(
    request: SettingsUpdate,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    if request.currency not in ["INR", "USD", "EUR", "GBP"]:
        raise HTTPException(400, "Unsupported currency")

    if request.theme not in ["light", "dark", "system"]:
        raise HTTPException(400, "Invalid theme")

    user.monthly_income = request.monthly_income
    user.total_monthly_budget = request.total_monthly_budget
    user.currency = request.currency
    user.theme = request.theme

    db.commit()
    db.refresh(user)

    return {
        "message": "Settings saved successfully",
        "monthly_income": user.monthly_income,
        "total_monthly_budget": user.total_monthly_budget,
        "currency": user.currency,
        "theme": user.theme,
    }