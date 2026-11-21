
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from ..database import get_db
from .. import models
from ..models import User
from ..security import get_current_user
from ..ml.anomaly_detection import (
    detect_anomalies,
    get_anomaly_summary,
)


router = APIRouter(
    prefix="/anomaly",
    tags=["Anomaly Detection"],
)


@router.get("/preview")
def preview_expense_anomalies(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Run current detection in memory without saving any results."""
    expenses = (
        db.query(models.Expense)
        .filter(
            models.Expense.user_id == current_user.id,
            models.Expense.transaction_type == "expense",
        )
        .order_by(models.Expense.date.asc())
        .all()
    )

    expense_list = [
        {
            "id": expense.id,
            "date": expense.date.isoformat() if expense.date else None,
            "amount": expense.amount,
            "category": expense.category,
            "description": expense.description,
            "payment_method": expense.payment_method,
        }
        for expense in expenses
    ]

    results = detect_anomalies(expense_list)
    return {"status": "success", **get_anomaly_summary(results)}


@router.get("/detect")
def detect_expense_anomalies(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Detect anomalies for the authenticated user's expenses,
    save detection results, and return a summary.
    """

    expenses = (
        db.query(models.Expense)
        .filter(
            models.Expense.user_id == current_user.id,
            models.Expense.transaction_type == "expense",
        )
        .order_by(
            models.Expense.date.asc()
        )
        .all()
    )

    if not expenses:

        return {
            "status": "success",
            **get_anomaly_summary([]),
            "message": "No expenses available for analysis.",
        }

    expense_list = [
        {
            "id": expense.id,
            "date": (
                expense.date.isoformat()
                if expense.date
                else None
            ),
            "amount": expense.amount,
            "category": expense.category,
            "description": expense.description,
            "payment_method": expense.payment_method,
        }
        for expense in expenses
    ]

    try:

        results = detect_anomalies(
            expense_list
        )

        expense_by_id = {
            expense.id: expense
            for expense in expenses
        }

        for item in results:

            db_expense = expense_by_id.get(
                item.get("id")
            )

            if db_expense is None:
                continue

            db_expense.is_anomaly = bool(
                item["is_anomaly"]
            )

            db_expense.anomaly_score = float(
                item["anomaly_score"]
            )

            db_expense.severity = item["severity"]

        db.commit()

    except ValueError as error:

        db.rollback()

        raise HTTPException(
            status_code=400,
            detail=str(error),
        )

    except Exception as error:

        db.rollback()

        print(
            "ANOMALY DETECTION ERROR:",
            repr(error),
        )

        raise HTTPException(
            status_code=500,
            detail="Anomaly detection or database update failed.",
        )

    summary = get_anomaly_summary(
        results
    )

    return {
        "status": "success",
        **summary,
    }


@router.get("/list")
def list_anomalies(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Return saved anomalies belonging to the current user.
    Does not execute the detection model again.
    """

    anomalies = (
        db.query(models.Expense)
        .filter(
            models.Expense.user_id == current_user.id,
            models.Expense.transaction_type == "expense",
            models.Expense.is_anomaly.is_(True),
        )
        .order_by(
            models.Expense.date.desc()
        )
        .all()
    )

    return {
        "status": "success",
        "anomaly_count": len(anomalies),

        "anomalies": [
            {
                "id": expense.id,

                "date": (
                    expense.date.isoformat()
                    if expense.date
                    else None
                ),

                "amount": expense.amount,

                "category": expense.category,

                "description": expense.description,

                "payment_method": expense.payment_method,

                "is_anomaly": bool(
                    expense.is_anomaly
                ),

                "anomaly_score": float(
                    expense.anomaly_score or 0.0
                ),

                "severity": (
                    expense.severity or "Normal"
                ),
            }
            for expense in anomalies
        ],
    }
