
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from ..database import get_db
from .. import models
from ..ml.explainability import explain_xgboost_forecast
from ..models import User
from ..security import get_current_user

router = APIRouter(
    prefix="/explainability",
    tags=["Explainability"],
)


@router.get("/xgboost")
def get_xgboost_explanation(
    periods: int = 30,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Generate SHAP explanations using the current user's expenses only.
    """

    expenses = (
        db.query(models.Expense)
        .filter(
            models.Expense.user_id == current_user.id,
            models.Expense.transaction_type == "expense",
        )
        .order_by(models.Expense.date)
        .all()
    )

    if not expenses:
        raise HTTPException(
            status_code=404,
            detail="No expense data found.",
        )

    expense_data = [
        {
            "date": expense.date,
            "amount": expense.amount,
        }
        for expense in expenses
    ]

    result = explain_xgboost_forecast(
        expenses=expense_data,
        periods=periods,
    )

    if result.get("status") == "error":
        raise HTTPException(
            status_code=500,
            detail=result.get(
                "error",
                "Unable to generate SHAP explanation.",
            ),
        )

    if result.get("error"):
        raise HTTPException(
            status_code=400,
            detail=result["error"],
        )

    return result
