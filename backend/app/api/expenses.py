from datetime import date

from fastapi import APIRouter, Depends, HTTPException, status, UploadFile, File
from sqlalchemy.orm import Session

from app import models, schemas
from app.database import get_db
from app.models import User
from app.security import get_current_user
from app.services.pdf_parser import parse_sbi_statement

router = APIRouter(prefix="/expenses", tags=["Expenses"])


@router.post(
    "/",
    response_model=schemas.ExpenseResponse,
    status_code=status.HTTP_201_CREATED,
)
def create_expense(
    expense: schemas.ExpenseCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    new_expense = models.Expense(
        date=expense.date,
        amount=expense.amount,
        category=expense.category,
        description=expense.description,
        payment_method=expense.payment_method,
        user_id=current_user.id,
        transaction_type=expense.transaction_type,
    )

    db.add(new_expense)
    db.commit()
    db.refresh(new_expense)

    return new_expense


@router.get(
    "/summary/by-category",
    response_model=dict,
)
def expense_summary_by_category(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    expenses = (
        db.query(models.Expense)
        .filter(
    models.Expense.user_id == current_user.id,
    models.Expense.transaction_type == "expense",
)
        .all()
    )

    summary = {}

    for expense in expenses:
        summary[expense.category] = (
            summary.get(expense.category, 0) + expense.amount
        )

    return summary


@router.get(
    "/",
    response_model=list[schemas.ExpenseResponse],
)
def get_expenses(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    return (
        db.query(models.Expense)
        .filter(models.Expense.user_id == current_user.id)
        .order_by(models.Expense.date.desc())
        .all()
    )


@router.get(
    "/{expense_id}",
    response_model=schemas.ExpenseResponse,
)
def get_expense(
    expense_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    expense = (
        db.query(models.Expense)
        .filter(
            models.Expense.id == expense_id,
            models.Expense.user_id == current_user.id,
        )
        .first()
    )

    if expense is None:
        raise HTTPException(
            status_code=404,
            detail="Expense not found",
        )

    return expense


@router.put(
    "/{expense_id}",
    response_model=schemas.ExpenseResponse,
)
def update_expense(
    expense_id: int,
    expense_data: schemas.ExpenseUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    expense = (
        db.query(models.Expense)
        .filter(
            models.Expense.id == expense_id,
            models.Expense.user_id == current_user.id,
        )
        .first()
    )

    if expense is None:
        raise HTTPException(
            status_code=404,
            detail="Expense not found",
        )

    expense.date = expense_data.date
    expense.amount = expense_data.amount
    expense.category = expense_data.category
    expense.description = expense_data.description
    expense.payment_method = expense_data.payment_method
     # Preserve the existing transaction type if none is provided
    if expense_data.transaction_type is not None:
        expense.transaction_type = expense_data.transaction_type
    

    db.commit()
    db.refresh(expense)

    return expense


@router.delete(
    "/{expense_id}",
    status_code=status.HTTP_204_NO_CONTENT,
)
def delete_expense(
    expense_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    expense = (
        db.query(models.Expense)
        .filter(
            models.Expense.id == expense_id,
            models.Expense.user_id == current_user.id,
        )
        .first()
    )

    if expense is None:
        raise HTTPException(
            status_code=404,
            detail="Expense not found",
        )

    db.delete(expense)
    db.commit()

    return None


# ==================== PDF IMPORT ====================

@router.post(
    "/import-pdf/preview",
    response_model=schemas.PDFImportPreviewResponse,
)
async def preview_pdf_import(
    file: UploadFile = File(...),
    current_user: User = Depends(get_current_user),
):
    """
    Upload a bank statement PDF and get a preview of extracted transactions.
    Does NOT save anything to the database yet.
    """
    if not file.filename.lower().endswith(".pdf"):
        raise HTTPException(
            status_code=400,
            detail="Only PDF files are allowed",
        )

    pdf_bytes = await file.read()

    try:
        transactions = parse_sbi_statement(pdf_bytes)
    except Exception as e:
        raise HTTPException(
            status_code=400,
            detail=f"Failed to parse PDF. Make sure it is a valid SBI statement. Error: {str(e)}",
        )

    if not transactions:
        raise HTTPException(
            status_code=400,
            detail="No transactions found in the PDF. Please check the file format.",
        )

    expenses_count = sum(1 for t in transactions if t.transaction_type == "expense")
    income_count = sum(1 for t in transactions if t.transaction_type == "income")

    return schemas.PDFImportPreviewResponse(
        total_transactions=len(transactions),
        expenses_count=expenses_count,
        income_count=income_count,
        transactions=transactions,
    )


@router.post(
    "/import-pdf/confirm",
    response_model=dict,
)
def confirm_pdf_import(
    payload: schemas.PDFImportConfirmRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Save the selected transactions from the PDF preview into the database.
    """

    if not payload.transactions:
        raise HTTPException(
            status_code=400,
            detail="No transactions provided",
        )

    # Convert and validate all dates before adding records
    transactions_to_save = []

    try:
        for t in payload.transactions:
            transaction_date = date.fromisoformat(t.date)

            new_expense = models.Expense(
                date=transaction_date,
                amount=t.amount,
                transaction_type=t.transaction_type,
                category=t.suggested_category,
                description=t.description,
                payment_method=t.payment_method,
                user_id=current_user.id,
            )

            transactions_to_save.append(new_expense)

    except ValueError:
        raise HTTPException(
            status_code=400,
            detail="Invalid transaction date in PDF import",
        )

    try:
        db.add_all(transactions_to_save)
        db.commit()

    except Exception:
        db.rollback()
        raise HTTPException(
            status_code=500,
            detail="Failed to save imported transactions",
        )

    return {
        "status": "success",
        "imported_count": len(transactions_to_save),
        "message": f"Successfully imported {len(transactions_to_save)} transactions",
    }