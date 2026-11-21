from pydantic import BaseModel, Field
from datetime import date as Date, datetime
from typing import Optional, List


class ExpenseBase(BaseModel):
    date: Date
    amount: float = Field(..., gt=0)
    category: str
    description: Optional[str] = None
    payment_method: Optional[str] = None
    transaction_type: str = "expense"


class ExpenseCreate(ExpenseBase):
    pass


class ExpenseUpdate(BaseModel):
    date: Optional[Date] = None
    amount: Optional[float] = None
    category: Optional[str] = None
    description: Optional[str] = None
    payment_method: Optional[str] = None
    transaction_type: Optional[str] = None


class ExpenseResponse(ExpenseBase):
    id: int
    is_anomaly: bool
    created_at: datetime

    class Config:
        from_attributes = True


class BudgetBase(BaseModel):
    category: str
    monthly_limit: float = Field(..., gt=0)


class BudgetCreate(BudgetBase):
    pass


class BudgetResponse(BudgetBase):
    id: int
    created_at: datetime

    class Config:
        from_attributes = True


class ForecastRequest(BaseModel):
    months_ahead: int = Field(3, ge=1, le=12)
    model: str = Field("xgboost", pattern="^(arima|prophet|xgboost|ensemble)$")


class ForecastPoint(BaseModel):
    date: Date
    predicted_amount: float


class ForecastResponse(BaseModel):
    model_name: str
    forecasts: List[ForecastPoint]
    mae: Optional[float] = None
    rmse: Optional[float] = None


# ======================
# AI Advisor Schemas
# ======================

class Recommendation(BaseModel):
    category: str

    current_budget: float
    average_monthly_spending: float

    target_allocation: float
    recommended_budget: float

    difference: float
    percentage_change: float

    action: str
    reason: Optional[str] = None
    transaction_count: int = 0
    active_months: int = 0


class DataQuality(BaseModel):
    status: str
    months_available: int
    days_available: int
    total_expenses: int
    message: Optional[str] = None


class FinancialSummary(BaseModel):
    total_spending: float
    average_monthly_spending: float
    total_budget: float
    available_budget: float


class AdvisorResponse(BaseModel):
    generated_at: str
    period_days: int

    summary: str

    recommendations: List[Recommendation]

    forecast: Optional[dict] = None

    anomalies: Optional[list] = None

    data_quality: Optional[DataQuality] = None

    financial_summary: Optional[FinancialSummary] = None

    data_quality_note: Optional[str] = None

# ==================== PDF IMPORT ====================

class ParsedTransaction(BaseModel):
    date: str
    description: str
    amount: float
    transaction_type: str          # "expense" or "income"
    suggested_category: str
    payment_method: str | None = "UPI"


class PDFImportPreviewResponse(BaseModel):
    total_transactions: int
    expenses_count: int
    income_count: int
    transactions: list[ParsedTransaction]


class PDFImportConfirmRequest(BaseModel):
    transactions: list[ParsedTransaction]
