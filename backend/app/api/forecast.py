from datetime import date

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from ..database import get_db
from .. import models, schemas
from ..ml.forecasting import run_hybrid_forecast
from ..models import User
from ..security import get_current_user

router = APIRouter(
    prefix="/forecast",
    tags=["Forecasting"]
)


@router.post("/", response_model=dict)
def generate_forecast(
    request: schemas.ForecastRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    # Get only the current user's expenses
    expenses = (
        db.query(models.Expense)
        .filter(
        models.Expense.user_id == current_user.id,
        models.Expense.transaction_type == "expense",
            models.Expense.date <= date.today(),
    )
        .all()
    )

    if not expenses:
        raise HTTPException(
            status_code=400,
            detail="No expenses found. Please add some expenses first."
        )

    expense_list = [
        {
            "date": e.date.strftime("%Y-%m-%d"),
            "amount": e.amount,
            "category": e.category
        }
        for e in expenses
    ]

    result = run_hybrid_forecast(
        expenses=expense_list,
        periods=request.months_ahead * 30,
        model=request.model
    )

    return result
