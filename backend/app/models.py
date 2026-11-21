from sqlalchemy import (
    Column,
    Integer,
    String,
    Float,
    Date,
    DateTime,
    Boolean,
    ForeignKey,
)
from sqlalchemy.sql import func

from .database import Base



class Expense(Base):
    __tablename__ = "expenses"

    id = Column(Integer, primary_key=True, index=True)
    date = Column(Date, nullable=False, index=True)
    amount = Column(Float, nullable=False)

    transaction_type = Column(
        String(20),
        nullable=False,
        default="expense",
        server_default="expense",
    )

    category = Column(String(100), nullable=False, index=True)
    description = Column(String(255), nullable=True)
    payment_method = Column(String(50), nullable=True)

    is_anomaly = Column(
        Boolean,
        nullable=False,
        default=False,
        server_default="0",
    )

    anomaly_score = Column(
        Float,
        nullable=False,
        default=0.0,
        server_default="0.0",
    )

    severity = Column(
        String(20),
        nullable=False,
        default="Normal",
        server_default="Normal",
    )

    created_at = Column(DateTime(timezone=True), server_default=func.now())

    user_id = Column(
        Integer,
        ForeignKey("users.id"),
        nullable=True,
        index=True,
    )



class Budget(Base):
    __tablename__ = "budgets"

    id = Column(Integer, primary_key=True, index=True)
    category = Column(String(100), nullable=False, index=True)
    monthly_limit = Column(Float, nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    user_id = Column(
        Integer,
        ForeignKey("users.id"),
        nullable=True,
        index=True,
    )


class ForecastResult(Base):
    __tablename__ = "forecast_results"

    id = Column(Integer, primary_key=True, index=True)
    model_name = Column(String(50), nullable=False)
    forecast_date = Column(Date, nullable=False)
    predicted_amount = Column(Float, nullable=False)
    created_at = Column(
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False,
    )


class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    email = Column(String(255), unique=True, index=True, nullable=False)
    name = Column(String(150), nullable=True)
    password_hash = Column(String(255), nullable=False)
    monthly_income = Column(
        Float,
        nullable=False,
        default=0.0,
        server_default="0.0",
    )

    total_monthly_budget = Column(
        Float,
        nullable=False,
        default=0.0,
        server_default="0.0",
    )

    currency = Column(
        String(10),
        nullable=False,
        default="INR",
        server_default="INR",
    )

    theme = Column(
        String(20),
        nullable=False,
        default="system",
        server_default="system",
    )
    created_at = Column(
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False,
    )
