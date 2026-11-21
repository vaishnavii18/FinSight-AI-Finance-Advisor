# app/api/export.py

import csv
import inspect
from collections import defaultdict
from datetime import date, datetime
from html import escape
from io import BytesIO, StringIO

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session

from reportlab.lib import colors
from reportlab.lib.enums import TA_CENTER, TA_LEFT, TA_RIGHT
from reportlab.lib.pagesizes import A4, landscape
from reportlab.lib.styles import (
    ParagraphStyle,
    getSampleStyleSheet,
)
from reportlab.lib.units import mm
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.platypus import (
    BaseDocTemplate,
    Frame,
    PageTemplate,
    Paragraph,
    Spacer,
    Table,
    TableStyle,
    PageBreak,
    LongTable,
    KeepTogether,
)
from reportlab.graphics.shapes import Drawing
from reportlab.graphics.charts.barcharts import VerticalBarChart
from reportlab.graphics.charts.linecharts import HorizontalLineChart
from reportlab.graphics.charts.legends import Legend

from app.database import get_db
from app.models import Expense, Budget, User
from app.security import get_current_user

from app.ml.advisor import (
    generate_recommendations,
    generate_llm_review,
)
from app.ml.forecasting import run_hybrid_forecast
from app.ml.explainability import explain_xgboost_forecast


router = APIRouter(
    prefix="/export",
    tags=["Data Export"],
)


# ============================================================
# FONT SETUP — must succeed and be used everywhere for ₹
# ============================================================

FONT_REGULAR = "Helvetica"
FONT_BOLD = "Helvetica-Bold"
FONT_ITALIC = "Helvetica-Oblique"


def register_fonts():
    """
    Register a Unicode TTF that contains ₹ (U+20B9) under stable names.
    These exact names are then forced into every ParagraphStyle and
    every TableStyle FONTNAME command. Registration alone is not enough.
    """
    global FONT_REGULAR, FONT_BOLD, FONT_ITALIC

    candidates = [
        # DejaVu – most reliable on Linux containers (confirmed paths)
        (
            "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
            "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf",
            "/usr/share/fonts/truetype/dejavu/DejaVuSans-Oblique.ttf",
            "DejaVuSans",
            "DejaVuSans-Bold",
            "DejaVuSans-Oblique",
        ),
        (
            "/usr/share/fonts/truetype/dejavu/DejaVuSansCondensed.ttf",
            "/usr/share/fonts/truetype/dejavu/DejaVuSansCondensed-Bold.ttf",
            "/usr/share/fonts/truetype/dejavu/DejaVuSansCondensed-Oblique.ttf",
            "DejaVuSans",
            "DejaVuSans-Bold",
            "DejaVuSans-Oblique",
        ),
        (
            "/usr/share/fonts/TTF/DejaVuSans.ttf",
            "/usr/share/fonts/TTF/DejaVuSans-Bold.ttf",
            "/usr/share/fonts/TTF/DejaVuSans-Oblique.ttf",
            "DejaVuSans",
            "DejaVuSans-Bold",
            "DejaVuSans-Oblique",
        ),
        (
            "/usr/share/fonts/dejavu/DejaVuSans.ttf",
            "/usr/share/fonts/dejavu/DejaVuSans-Bold.ttf",
            "/usr/share/fonts/dejavu/DejaVuSans-Oblique.ttf",
            "DejaVuSans",
            "DejaVuSans-Bold",
            "DejaVuSans-Oblique",
        ),
        # Noto Sans also contains ₹
        (
            "/usr/share/fonts/truetype/noto/NotoSans-Regular.ttf",
            "/usr/share/fonts/truetype/noto/NotoSans-Bold.ttf",
            "/usr/share/fonts/truetype/noto/NotoSans-Italic.ttf",
            "NotoSans",
            "NotoSans-Bold",
            "NotoSans-Italic",
        ),
    ]

    for regular_path, bold_path, italic_path, reg_name, bold_name, italic_name in candidates:
        try:
            pdfmetrics.registerFont(TTFont(reg_name, regular_path))
            pdfmetrics.registerFont(TTFont(bold_name, bold_path))
            try:
                pdfmetrics.registerFont(TTFont(italic_name, italic_path))
            except Exception:
                italic_name = reg_name
            try:
                pdfmetrics.registerFontFamily(
                    reg_name,
                    normal=reg_name,
                    bold=bold_name,
                    italic=italic_name,
                )
            except Exception:
                pass
            FONT_REGULAR = reg_name
            FONT_BOLD = bold_name
            FONT_ITALIC = italic_name
            return
        except Exception:
            continue

    # Absolute fallback – still keep the names consistent
    FONT_REGULAR = "Helvetica"
    FONT_BOLD = "Helvetica-Bold"
    FONT_ITALIC = "Helvetica-Oblique"


register_fonts()


# ============================================================
# COLORS
# ============================================================

NAVY = colors.HexColor("#0F172A")
INDIGO = colors.HexColor("#4338CA")
INDIGO_LIGHT = colors.HexColor("#EEF2FF")
BLUE = colors.HexColor("#2563EB")
TEAL = colors.HexColor("#0F766E")
TEAL_LIGHT = colors.HexColor("#ECFDF5")
GREEN = colors.HexColor("#15803D")
GREEN_LIGHT = colors.HexColor("#F0FDF4")
AMBER = colors.HexColor("#B45309")
AMBER_LIGHT = colors.HexColor("#FFFBEB")
RED = colors.HexColor("#B91C1C")
RED_LIGHT = colors.HexColor("#FEF2F2")
SLATE = colors.HexColor("#475569")
SLATE_LIGHT = colors.HexColor("#F8FAFC")
BORDER = colors.HexColor("#CBD5E1")
WHITE = colors.white
BLACK = colors.black


# ============================================================
# GENERAL HELPERS
# ============================================================

def safe_float(value, default=0.0):
    try:
        if value is None:
            return default
        return float(value)
    except (TypeError, ValueError):
        return default


def safe_text(value, default=""):
    if value is None:
        return default
    return escape(str(value))


def format_date(value):
    if value is None:
        return "-"
    if isinstance(value, datetime):
        value = value.date()
    if isinstance(value, date):
        return value.strftime("%d %b %Y")
    return str(value)


def format_percent(value, decimals=1):
    return f"{safe_float(value):,.{decimals}f}%"


def currency_symbol(currency):
    # Plain ASCII prefixes for PDF reliability (no Unicode glyphs)
    symbols = {
        "INR": "Rs",
        "USD": "USD",
        "EUR": "EUR",
        "GBP": "GBP",
    }
    return symbols.get(str(currency or "INR").upper(), str(currency or "INR").upper())


def money(value, currency="INR"):
    """Format amounts with plain ASCII currency prefix, e.g. Rs 124,804.00"""
    symbol = currency_symbol(currency)
    return f"{symbol} {safe_float(value):,.2f}"


def month_label(year, month):
    return date(year, month, 1).strftime("%b %Y")


def month_count_inclusive(start_date, end_date):
    if start_date > end_date:
        return 0
    return (
        (end_date.year - start_date.year) * 12
        + end_date.month
        - start_date.month
        + 1
    )


def months_between(start_date, end_date):
    if start_date > end_date:
        return []
    result = []
    year = start_date.year
    month = start_date.month
    while (year, month) <= (end_date.year, end_date.month):
        result.append((year, month, month_label(year, month)))
        month += 1
        if month > 12:
            month = 1
            year += 1
    return result


def clean_category(value):
    value = str(value or "Uncategorized").strip()
    return value or "Uncategorized"


# ============================================================
# REPORT STYLES — every style forces the Unicode font
# ============================================================

def build_styles():
    styles = getSampleStyleSheet()

    styles.add(ParagraphStyle(
        name="FA_Title", fontName=FONT_BOLD, fontSize=22, leading=26,
        textColor=NAVY, alignment=TA_LEFT, spaceAfter=6,
    ))
    styles.add(ParagraphStyle(
        name="FA_Subtitle", fontName=FONT_REGULAR, fontSize=9.5, leading=13,
        textColor=SLATE, spaceAfter=4,
    ))
    styles.add(ParagraphStyle(
        name="FA_Section", fontName=FONT_BOLD, fontSize=13, leading=16,
        textColor=NAVY, spaceBefore=4, spaceAfter=6,
    ))
    styles.add(ParagraphStyle(
        name="FA_Subsection", fontName=FONT_BOLD, fontSize=10, leading=13,
        textColor=INDIGO, spaceBefore=3, spaceAfter=3, keepWithNext=1,
    ))
    styles.add(ParagraphStyle(
        name="FA_Body", fontName=FONT_REGULAR, fontSize=8, leading=11,
        textColor=NAVY,
    ))
    styles.add(ParagraphStyle(
        name="FA_Small", fontName=FONT_REGULAR, fontSize=7, leading=9,
        textColor=SLATE,
    ))
    styles.add(ParagraphStyle(
        name="FA_Tiny", fontName=FONT_REGULAR, fontSize=6.2, leading=8,
        textColor=SLATE,
    ))
    styles.add(ParagraphStyle(
        name="FA_Table", fontName=FONT_REGULAR, fontSize=7, leading=9,
        textColor=NAVY,
    ))
    styles.add(ParagraphStyle(
        name="FA_TableBold", fontName=FONT_BOLD, fontSize=7, leading=9,
        textColor=NAVY,
    ))
    styles.add(ParagraphStyle(
        name="FA_CardLabel", fontName=FONT_BOLD, fontSize=6.5, leading=8,
        textColor=SLATE, alignment=TA_CENTER,
    ))
    styles.add(ParagraphStyle(
        name="FA_CardValue", fontName=FONT_BOLD, fontSize=11, leading=13,
        textColor=NAVY, alignment=TA_CENTER,
    ))
    styles.add(ParagraphStyle(
        name="FA_CoverMeta", fontName=FONT_REGULAR, fontSize=8.5, leading=12,
        textColor=SLATE,
    ))
    styles.add(ParagraphStyle(
        name="FA_CoverMetaBold", fontName=FONT_BOLD, fontSize=8.5, leading=12,
        textColor=NAVY,
    ))
    styles.add(ParagraphStyle(
        name="FA_Footer", fontName=FONT_REGULAR, fontSize=6.5, leading=8,
        textColor=SLATE,
    ))
    styles.add(ParagraphStyle(
        name="FA_Warning", fontName=FONT_BOLD, fontSize=9, leading=12,
        textColor=AMBER, spaceBefore=2, spaceAfter=2,
    ))
    return styles


# ============================================================
# PDF DOCUMENT
# ============================================================

class FinancialReportDocTemplate(BaseDocTemplate):

    def __init__(self, filename, styles, **kwargs):
        super().__init__(
            filename,
            pagesize=landscape(A4),
            rightMargin=11 * mm,
            leftMargin=11 * mm,
            topMargin=15 * mm,
            bottomMargin=13 * mm,
            **kwargs,
        )
        frame = Frame(
            self.leftMargin, self.bottomMargin,
            self.width, self.height, id="normal",
        )
        self.addPageTemplates([
            PageTemplate(id="financial", frames=frame, onPage=self._draw_page)
        ])
        self.styles = styles

    def _draw_page(self, canvas, document):
        canvas.saveState()
        width, height = landscape(A4)

        canvas.setStrokeColor(INDIGO)
        canvas.setLineWidth(1.1)
        canvas.line(self.leftMargin, height - 9 * mm, width - self.rightMargin, height - 9 * mm)

        canvas.setFont(FONT_BOLD, 7)
        canvas.setFillColor(NAVY)
        canvas.drawString(self.leftMargin, height - 6.5 * mm, "FINSIGHT")

        canvas.setFont(FONT_REGULAR, 6.5)
        canvas.setFillColor(SLATE)
        canvas.drawRightString(width - self.rightMargin, height - 6.5 * mm, "Personal Finance Report")

        canvas.setStrokeColor(BORDER)
        canvas.setLineWidth(0.5)
        canvas.line(self.leftMargin, 8 * mm, width - self.rightMargin, 8 * mm)

        canvas.setFont(FONT_REGULAR, 6.5)
        canvas.setFillColor(SLATE)
        canvas.drawString(self.leftMargin, 4.8 * mm, "Generated by FinSight")
        canvas.drawCentredString(width / 2, 4.8 * mm, f"Page {canvas.getPageNumber()}")
        canvas.drawRightString(width - self.rightMargin, 4.8 * mm, date.today().strftime("%d %b %Y"))

        canvas.restoreState()


# ============================================================
# TABLE HELPERS — force Unicode font on header AND body cells
# ============================================================

def make_table(data, col_widths, styles, header=True, repeat_rows=1, alignments=None):
    converted = []
    for row_index, row in enumerate(data):
        converted_row = []
        for value in row:
            style = styles["FA_TableBold"] if (row_index == 0 and header) else styles["FA_Table"]
            converted_row.append(Paragraph(safe_text(value), style))
        converted.append(converted_row)

    table = LongTable(
        converted,
        colWidths=col_widths,
        repeatRows=repeat_rows if header else 0,
        hAlign="LEFT",
    )

    commands = [
        ("BACKGROUND", (0, 0), (-1, 0), INDIGO),
        ("TEXTCOLOR", (0, 0), (-1, 0), WHITE),
        ("FONTNAME", (0, 0), (-1, 0), FONT_BOLD),
        # Critical: body cells must also use the Unicode font
        ("FONTNAME", (0, 1), (-1, -1), FONT_REGULAR),
        ("GRID", (0, 0), (-1, -1), 0.3, BORDER),
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("LEFTPADDING", (0, 0), (-1, -1), 4),
        ("RIGHTPADDING", (0, 0), (-1, -1), 4),
        ("TOPPADDING", (0, 0), (-1, -1), 3),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 3),
    ]
    if len(data) > 1:
        commands.append(("ROWBACKGROUNDS", (0, 1), (-1, -1), [WHITE, SLATE_LIGHT]))
    if alignments:
        for column, alignment in alignments.items():
            commands.append(("ALIGN", (column, 1 if header else 0), (column, -1), alignment))
    table.setStyle(TableStyle(commands))
    return table


def section_title(title, styles):
    return Paragraph(safe_text(title), styles["FA_Section"])


def subsection_title(title, styles):
    return Paragraph(safe_text(title), styles["FA_Subsection"])


def summary_cards(cards, styles):
    labels = [Paragraph(safe_text(label), styles["FA_CardLabel"]) for label, _ in cards]
    values = [Paragraph(safe_text(value), styles["FA_CardValue"]) for _, value in cards]
    data = [labels, values]
    widths = [250 * mm / max(len(cards), 1) for _ in cards]
    table = Table(data, colWidths=widths, rowHeights=[8 * mm, 12 * mm])
    table.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, -1), INDIGO_LIGHT),
        ("BOX", (0, 0), (-1, -1), 0.6, colors.HexColor("#C7D2FE")),
        ("INNERGRID", (0, 0), (-1, -1), 0.4, colors.HexColor("#C7D2FE")),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("FONTNAME", (0, 0), (-1, -1), FONT_REGULAR),
    ]))
    return table


# ============================================================
# CHARTS — compact heights so page 3 can hold more content
# ============================================================

def monthly_cashflow_chart(monthly_data, currency):
    drawing = Drawing(700, 125)
    if not monthly_data:
        return drawing
    chart = HorizontalLineChart()
    chart.x = 45
    chart.y = 20
    chart.height = 90
    chart.width = 620
    income_values = [safe_float(item["income"]) for item in monthly_data]
    expense_values = [safe_float(item["expense"]) for item in monthly_data]
    labels = [item["label"] for item in monthly_data]
    chart.data = [income_values, expense_values]
    chart.categoryAxis.categoryNames = labels
    chart.categoryAxis.labels.fontName = FONT_REGULAR
    chart.categoryAxis.labels.fontSize = 6
    chart.categoryAxis.labels.angle = 30
    chart.valueAxis.labels.fontName = FONT_REGULAR
    chart.valueAxis.labels.fontSize = 6
    chart.valueAxis.valueMin = 0
    chart.strokeColor = colors.HexColor("#94A3B8")
    try:
        chart.lines[0].strokeColor = BLUE
        chart.lines[1].strokeColor = RED
        chart.lines[0].strokeWidth = 1.8
        chart.lines[1].strokeWidth = 1.8
    except Exception:
        pass
    drawing.add(chart)
    return drawing


def category_bar_chart(category_data, currency):
    # Slightly more compact so it can share a page with the category table
    drawing = Drawing(700, 118)
    if not category_data:
        return drawing
    data = [[safe_float(item["amount"]) for item in category_data]]
    labels = [item["category"][:13] for item in category_data]
    chart = VerticalBarChart()
    chart.x = 45
    chart.y = 20
    chart.height = 82
    chart.width = 620
    chart.data = data
    chart.categoryAxis.categoryNames = labels
    chart.categoryAxis.labels.fontName = FONT_REGULAR
    chart.categoryAxis.labels.fontSize = 6
    chart.categoryAxis.labels.angle = 30
    chart.valueAxis.labels.fontName = FONT_REGULAR
    chart.valueAxis.labels.fontSize = 6
    chart.valueAxis.valueMin = 0
    chart.bars[0].fillColor = INDIGO
    chart.bars[0].strokeColor = INDIGO
    drawing.add(chart)
    return drawing


def budget_bar_chart(category_data, currency):
    drawing = Drawing(700, 135)
    if not category_data:
        return drawing
    actual = [safe_float(item["actual"]) for item in category_data]
    budget = [safe_float(item["budget"]) for item in category_data]
    labels = [item["category"][:12] for item in category_data]
    chart = VerticalBarChart()
    chart.x = 45
    chart.y = 22
    chart.height = 90
    chart.width = 620
    chart.data = [budget, actual]
    chart.categoryAxis.categoryNames = labels
    chart.categoryAxis.labels.fontName = FONT_REGULAR
    chart.categoryAxis.labels.fontSize = 6
    chart.categoryAxis.labels.angle = 30
    chart.valueAxis.labels.fontName = FONT_REGULAR
    chart.valueAxis.labels.fontSize = 6
    chart.valueAxis.valueMin = 0
    chart.bars[0].fillColor = TEAL
    chart.bars[0].strokeColor = TEAL
    chart.bars[1].fillColor = INDIGO
    chart.bars[1].strokeColor = INDIGO
    drawing.add(chart)
    legend = Legend()
    legend.x = 520
    legend.y = 115
    legend.colorNamePairs = [(TEAL, "Budget"), (INDIGO, "Actual")]
    legend.fontName = FONT_REGULAR
    legend.fontSize = 7
    drawing.add(legend)
    return drawing


# ============================================================
# DATA PREPARATION
# ============================================================

def calculate_monthly_data(expenses):
    monthly = defaultdict(lambda: {"income": 0.0, "expense": 0.0})
    for expense in expenses:
        if expense.date is None:
            continue
        key = (expense.date.year, expense.date.month)
        amount = safe_float(expense.amount)
        if expense.transaction_type == "income":
            monthly[key]["income"] += amount
        else:
            monthly[key]["expense"] += amount

    dated = [e.date for e in expenses if e.date is not None]
    if not dated:
        return []
    result = []
    for year, month, label in months_between(min(dated), max(dated)):
        values = monthly.get((year, month), {"income": 0.0, "expense": 0.0})
        result.append({
            "label": label,
            "income": values["income"],
            "expense": values["expense"],
            "net": values["income"] - values["expense"],
        })
    return result


def calculate_category_data(expenses):
    categories = defaultdict(lambda: {"amount": 0.0, "count": 0})
    for expense in expenses:
        if expense.transaction_type != "expense":
            continue
        category = clean_category(expense.category)
        categories[category]["amount"] += safe_float(expense.amount)
        categories[category]["count"] += 1

    total = sum(item["amount"] for item in categories.values())
    result = []
    for category, item in categories.items():
        percentage = (item["amount"] / total * 100) if total > 0 else 0
        avg = (item["amount"] / item["count"]) if item["count"] > 0 else 0
        result.append({
            "category": category,
            "amount": item["amount"],
            "count": item["count"],
            "percentage": percentage,
            "average": avg,
        })
    result.sort(key=lambda item: item["amount"], reverse=True)
    return result


def calculate_budget_data(expenses, budgets, start_date, end_date):
    spending = defaultdict(float)
    for expense in expenses:
        if expense.transaction_type != "expense":
            continue
        category = clean_category(expense.category)
        spending[category] += safe_float(expense.amount)

    months = month_count_inclusive(start_date, end_date)
    result = []
    budget_categories = set()

    for budget in budgets:
        category = clean_category(budget.category)
        budget_categories.add(category)
        monthly_limit = safe_float(budget.monthly_limit)
        period_budget = monthly_limit * months
        actual = spending.get(category, 0.0)
        remaining = period_budget - actual
        utilization = (actual / period_budget * 100) if period_budget > 0 else 0
        result.append({
            "category": category,
            "monthly_budget": monthly_limit,
            "budget": period_budget,
            "actual": actual,
            "remaining": remaining,
            "utilization": utilization,
        })

    for category, actual in spending.items():
        if category not in budget_categories:
            result.append({
                "category": category,
                "monthly_budget": 0.0,
                "budget": 0.0,
                "actual": actual,
                "remaining": -actual,
                "utilization": 0.0,
            })

    result.sort(key=lambda item: item["actual"], reverse=True)
    return result


def calculate_data_quality(expenses, start_date, end_date):
    dates = [expense.date for expense in expenses if expense.date is not None]
    unique_days = len(set(dates))
    months = len({(value.year, value.month) for value in dates})
    missing_dates = sum(1 for expense in expenses if expense.date is None)
    expenses_count = sum(1 for expense in expenses if expense.transaction_type == "expense")
    income_count = sum(1 for expense in expenses if expense.transaction_type == "income")

    if not expenses:
        status = "No data"
        message = "No transactions were found in the selected period."
    elif unique_days < 14:
        status = "Limited"
        message = (
            "The selected history is short. "
            "Forecasting and explainability may be unavailable or less reliable."
        )
    elif months < 2:
        status = "Limited"
        message = "Less than two months of history are available in the selected period."
    else:
        status = "Good"
        message = "The selected history is generally suitable for trend analysis."

    return {
        "status": status,
        "unique_days": unique_days,
        "months_available": months,
        "transactions": len(expenses),
        "expense_transactions": expenses_count,
        "income_transactions": income_count,
        "transactions_missing_date": missing_dates,
        "start_date": start_date,
        "end_date": end_date,
        "message": message,
    }


# ============================================================
# ANOMALY — single source of truth = persisted Expense fields
# ============================================================

def build_anomaly_list_from_expenses(expenses):
    """
    Single source of truth for the entire report.
    Only uses the persisted fields on Expense:
      is_anomaly, anomaly_score, severity
    Returns a list of dicts that every section (summary, table, appendix)
    must reuse. Never mixes advisor output with persisted values.
    """
    result = []
    for expense in expenses:
        if not getattr(expense, "is_anomaly", False):
            continue
        result.append({
            "id": getattr(expense, "id", None),
            "date": expense.date,
            "amount": safe_float(expense.amount),
            "category": clean_category(expense.category),
            "description": expense.description or "",
            "payment_method": expense.payment_method or "—",
            "is_anomaly": True,
            "anomaly_score": safe_float(getattr(expense, "anomaly_score", None)),
            "severity": (getattr(expense, "severity", None) or "Low"),
            "transaction_type": expense.transaction_type,
        })
    return result


def anomaly_value(item, key, default=None):
    if isinstance(item, dict):
        return item.get(key, default)
    return getattr(item, key, default)


# ============================================================
# ML HELPERS
# ============================================================

def expense_dicts(expenses):
    return [
        {
            "date": expense.date.strftime("%Y-%m-%d") if expense.date else None,
            "amount": safe_float(expense.amount),
            "category": clean_category(expense.category),
        }
        for expense in expenses
        if expense.transaction_type == "expense" and expense.date is not None
    ]


def run_forecast_safely(expenses):
    data = expense_dicts(expenses)
    if len(data) < 2:
        return {
            "status": "unavailable",
            "error": "Not enough expense history to run the forecasting models.",
        }
    try:
        return run_hybrid_forecast(expenses=data, periods=30, model="ensemble")
    except Exception as exc:
        return {"status": "unavailable", "error": str(exc)}


def run_explainability_safely(expenses):
    data = expense_dicts(expenses)
    if len(data) < 14:
        return {
            "status": "unavailable",
            "error": "At least 14 days of expense history are required for XGBoost/SHAP explainability.",
        }
    try:
        return explain_xgboost_forecast(expenses=data, periods=30)
    except Exception as exc:
        return {"status": "unavailable", "error": str(exc)}


def run_advisor_safely(db, user):
    try:
        return generate_recommendations(
            db=db, user_id=user.id, forecast_days=30, lookback_days=60,
        )
    except Exception as exc:
        return {
            "status": "unavailable",
            "error": str(exc),
            "recommendations": [],
            "anomalies": [],
            "data_quality": None,
            "financial_summary": None,
        }


def call_llm_review_safely(
    total_income,
    total_expenses,
    net_balance,
    budget_total,
    available_budget,
    forecast_result,
    recommendations,
    anomalies,
    data_quality_note,
):
    try:
        sig = inspect.signature(generate_llm_review)
        params = list(sig.parameters.keys())
        n = len(params)

        candidates = []
        full = (
            total_income, total_expenses, net_balance,
            budget_total, available_budget, forecast_result,
            recommendations, anomalies, data_quality_note,
        )
        candidates.append(full)
        if n >= 7:
            candidates.append((
                total_income, total_expenses, net_balance,
                budget_total, available_budget, forecast_result,
                recommendations,
            ))
        if n >= 5:
            candidates.append((
                total_income, total_expenses, net_balance,
                budget_total, available_budget,
            ))
        if n >= 3:
            candidates.append((total_income, total_expenses, net_balance))

        last_error = None
        for args in candidates:
            try:
                return generate_llm_review(*args)
            except TypeError as te:
                last_error = te
                continue
        return {
            "success": False,
            "advice": "",
            "source": "unavailable",
            "message": f"Signature mismatch: {last_error}",
        }
    except Exception as exc:
        return {
            "success": False,
            "advice": "",
            "source": "unavailable",
            "message": str(exc),
        }


# ============================================================
# REPORT DATA
# ============================================================

def build_report_data(db, user, expenses, budgets, start_date, end_date):
    income = sum(
        safe_float(e.amount) for e in expenses if e.transaction_type == "income"
    )
    spending = sum(
        safe_float(e.amount) for e in expenses if e.transaction_type == "expense"
    )
    net = income - spending
    monthly_income = safe_float(user.monthly_income)
    total_monthly_budget = safe_float(user.total_monthly_budget)
    savings_rate = (net / income * 100) if income > 0 else None

    category_data = calculate_category_data(expenses)
    budget_data = calculate_budget_data(expenses, budgets, start_date, end_date)
    monthly_data = calculate_monthly_data(expenses)
    data_quality = calculate_data_quality(expenses, start_date, end_date)

    # Single source of truth for anomalies — persisted fields only
    anomalies = build_anomaly_list_from_expenses(expenses)

    # Anomaly amount = sum of amounts of anomalous *expense* transactions
    total_anomaly_amount = sum(
        item["amount"]
        for item in anomalies
        if item.get("transaction_type") == "expense"
    )

    severity_counts = {"High": 0, "Medium": 0, "Low": 0}
    for anomaly in anomalies:
        severity = str(anomaly.get("severity") or "Low")
        if severity in severity_counts:
            severity_counts[severity] += 1
        else:
            severity_counts["Low"] += 1

    expense_txns = [e for e in expenses if e.transaction_type == "expense"]
    anomalous_expense_count = sum(
        1 for a in anomalies if a.get("transaction_type") == "expense"
    )
    anomaly_rate = (
        (anomalous_expense_count / len(expense_txns) * 100)
        if expense_txns else 0.0
    )

    months = max(month_count_inclusive(start_date, end_date), 1)
    average_monthly_spending = spending / months
    available_budget = total_monthly_budget - average_monthly_spending

    highest_category = category_data[0]["category"] if category_data else "—"
    highest_category_amount = category_data[0]["amount"] if category_data else 0

    # ML calls (once each)
    forecast = run_forecast_safely(expenses)
    explainability = run_explainability_safely(expenses)
    advisor = run_advisor_safely(db, user)

    data_quality_note = (
        data_quality["message"]
        + " Forecasts are model outputs, not guarantees. "
        "Anomaly flags should be reviewed before treating a transaction as fraudulent. "
        "SHAP values describe model behaviour and do not prove causation."
    )

    llm_review = call_llm_review_safely(
        income, spending, net, total_monthly_budget, available_budget,
        forecast,
        advisor.get("recommendations", []) if isinstance(advisor, dict) else [],
        anomalies, data_quality_note,
    )

    return {
        "income": income,
        "spending": spending,
        "net": net,
        "monthly_income": monthly_income,
        "total_monthly_budget": total_monthly_budget,
        "savings_rate": savings_rate,
        "average_monthly_spending": average_monthly_spending,
        "available_budget": available_budget,
        "category_data": category_data,
        "budget_data": budget_data,
        "monthly_data": monthly_data,
        "data_quality": data_quality,
        "forecast": forecast,
        "explainability": explainability,
        "advisor": advisor,
        "anomalies": anomalies,          # the single list
        "total_anomaly_amount": total_anomaly_amount,
        "anomaly_rate": anomaly_rate,
        "severity_counts": severity_counts,
        "llm_review": llm_review,
        "highest_category": highest_category,
        "highest_category_amount": highest_category_amount,
        "transaction_count": len(expenses),
    }


# ============================================================
# COVER PAGE
# ============================================================

def build_cover(elements, styles, user, start_date, end_date, currency):
    elements.append(Spacer(1, 18 * mm))
    elements.append(Paragraph(
        "FINSIGHT",
        ParagraphStyle("CoverBrand", parent=styles["FA_Title"], fontSize=12, textColor=INDIGO, spaceAfter=4),
    ))
    elements.append(Paragraph("Complete Financial Health Report", styles["FA_Title"]))
    elements.append(Paragraph(
        "Analysis of activity, budgets, spending patterns, anomalies, forecasts, "
        "advisor recommendations and explainable AI results.",
        styles["FA_Subtitle"],
    ))
    elements.append(Spacer(1, 8 * mm))

    metadata = [
        [
            Paragraph("<b>Prepared For</b>", styles["FA_CoverMeta"]),
            Paragraph("<b>Email</b>", styles["FA_CoverMeta"]),
            Paragraph("<b>Report Period</b>", styles["FA_CoverMeta"]),
            Paragraph("<b>Currency</b>", styles["FA_CoverMeta"]),
        ],
        [
            Paragraph(safe_text(user.name or user.email), styles["FA_CoverMeta"]),
            Paragraph(safe_text(user.email), styles["FA_CoverMeta"]),
            Paragraph(f"{format_date(start_date)} – {format_date(end_date)}", styles["FA_CoverMeta"]),
            Paragraph(safe_text(currency), styles["FA_CoverMeta"]),
        ],
    ]
    table = Table(metadata, colWidths=[58 * mm, 70 * mm, 75 * mm, 35 * mm], rowHeights=[8 * mm, 11 * mm])
    table.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), INDIGO_LIGHT),
        ("BOX", (0, 0), (-1, -1), 0.6, BORDER),
        ("INNERGRID", (0, 0), (-1, -1), 0.35, BORDER),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("LEFTPADDING", (0, 0), (-1, -1), 6),
        ("RIGHTPADDING", (0, 0), (-1, -1), 6),
        ("FONTNAME", (0, 0), (-1, -1), FONT_REGULAR),
    ]))
    elements.append(table)
    elements.append(Spacer(1, 8 * mm))
    elements.append(subsection_title("Report scope", styles))
    elements.append(Paragraph(
        "Transactions, income, spending, category budgets, utilisation, anomalies, "
        "forecasting, advisor recommendations, XGBoost/SHAP explainability, "
        "qualitative AI review and data-quality limitations. "
        "Full transaction history is provided in Appendix A.",
        styles["FA_Body"],
    ))
    elements.append(Spacer(1, 10 * mm))
    elements.append(Paragraph(
        "This report uses authenticated user data only. Numerical values are calculated "
        "from the selected reporting period unless explicitly identified as model or advisor output.",
        styles["FA_Small"],
    ))
    elements.append(PageBreak())


# ============================================================
# SECTION 1 — EXECUTIVE SUMMARY
# ============================================================

def build_executive_summary(elements, styles, user, data, currency):
    elements.append(section_title("1. Executive Financial Summary", styles))

    elements.append(summary_cards([
        ("Total Recorded Income", money(data["income"], currency)),
        ("Total Expenses", money(data["spending"], currency)),
        ("Net Cash Flow", money(data["net"], currency)),
        ("Savings Rate", format_percent(data["savings_rate"]) if data["savings_rate"] is not None else "N/A"),
    ], styles))
    elements.append(Spacer(1, 3 * mm))

    elements.append(summary_cards([
        ("Configured Monthly Income", money(data["monthly_income"], currency)),
        ("Configured Monthly Budget", money(data["total_monthly_budget"], currency)),
        ("Avg. Monthly Spending", money(data["average_monthly_spending"], currency)),
        ("Est. Monthly Budget Headroom", money(max(data["available_budget"], 0), currency)),
    ], styles))
    elements.append(Spacer(1, 3 * mm))

    elements.append(summary_cards([
        ("Transactions", str(data["transaction_count"])),
        ("Anomalies", str(len(data["anomalies"]))),
        ("Highest Category", data["highest_category"]),
        ("Highest Category Amt", money(data["highest_category_amount"], currency)),
    ], styles))
    elements.append(Spacer(1, 4 * mm))

    elements.append(Paragraph(
        "<b>Note:</b> “Total Recorded Income” is the sum of income transactions in the selected period. "
        "“Configured Monthly Income” is the value stored in account settings and is independent of the transaction history. "
        "“Est. Monthly Budget Headroom” = configured monthly budget − average monthly spending (not a cash-balance figure).",
        styles["FA_Small"],
    ))
    elements.append(Spacer(1, 3 * mm))

    bullets = []
    if data["income"] <= 0:
        bullets.append("No income transactions were recorded in the selected period.")
    elif data["net"] >= 0:
        bullets.append("The selected period produced a positive net cash flow.")
    else:
        bullets.append("Expenses exceeded recorded income during the selected period.")

    if data["total_monthly_budget"] > 0:
        if data["average_monthly_spending"] > data["total_monthly_budget"]:
            bullets.append("Average monthly spending is above the configured total monthly budget.")
        else:
            bullets.append("Average monthly spending is within the configured total monthly budget.")
    else:
        bullets.append("No total monthly budget is configured.")

    if data["anomalies"]:
        bullets.append(f"{len(data['anomalies'])} anomalous transaction(s) were available to the report.")
    else:
        bullets.append("No detected anomalies were available for the selected report.")

    for sentence in bullets:
        elements.append(Paragraph("• " + safe_text(sentence), styles["FA_Body"]))

    elements.append(Spacer(1, 3 * mm))
    elements.append(subsection_title("Account Settings", styles))
    settings_data = [
        ["Setting", "Value"],
        ["Name", user.name or "-"],
        ["Email", user.email],
        ["Monthly Income (configured)", money(user.monthly_income, currency)],
        ["Total Monthly Budget (configured)", money(user.total_monthly_budget, currency)],
        ["Currency", currency],
        ["Theme", getattr(user, "theme", None) or "system"],
    ]
    elements.append(make_table(settings_data, [70 * mm, 180 * mm], styles))


# ============================================================
# SECTION 2 — SPENDING ANALYSIS (page-3 / page-4 composition)
# ============================================================

def build_spending_analysis(elements, styles, data, currency):
    elements.append(PageBreak())
    elements.append(section_title("2. Spending Patterns & Analysis", styles))

    if not data["monthly_data"]:
        elements.append(Paragraph(
            "No dated transactions are available for monthly trend analysis.", styles["FA_Body"],
        ))
    else:
        elements.append(subsection_title("Monthly Income vs Expense Trend", styles))
        elements.append(monthly_cashflow_chart(data["monthly_data"], currency))

    categories = data["category_data"]
    if not categories:
        elements.append(Spacer(1, 2 * mm))
        elements.append(Paragraph("No expense transactions are available.", styles["FA_Body"]))
        return

    # Heading has keepWithNext=1 so it stays with the table that follows.
    # Table is a LongTable and will split naturally if needed.
    elements.append(Spacer(1, 2 * mm))
    elements.append(subsection_title("Category Spending Breakdown", styles))

    category_rows = [["Category", "Amount", "% of Expenses", "Txns", "Avg / Txn"]]
    for item in categories:
        category_rows.append([
            item["category"],
            money(item["amount"], currency),
            format_percent(item["percentage"]),
            str(item["count"]),
            money(item["average"], currency),
        ])
    elements.append(make_table(
        category_rows,
        [58 * mm, 42 * mm, 38 * mm, 28 * mm, 42 * mm],
        styles,
        alignments={1: "RIGHT", 2: "RIGHT", 3: "RIGHT", 4: "RIGHT"},
    ))

    # Keep chart on the same flow as the table (compact height) and add a
    # short, data-driven interpretation so any residual whitespace is useful.
    elements.append(Spacer(1, 2 * mm))
    elements.append(subsection_title("Top Spending Categories", styles))
    elements.append(category_bar_chart(categories[:8], currency))

    # Compact insight block derived from the same category_data (no filler).
    if categories:
        top = categories[0]
        top3_pct = sum(item["percentage"] for item in categories[:3])
        insight_lines = [
            f"The highest category is {top['category']} at {money(top['amount'], currency)} "
            f"({format_percent(top['percentage'])} of total expenses).",
        ]
        if len(categories) >= 3:
            insight_lines.append(
                f"The top three categories together account for {format_percent(top3_pct)} of spending."
            )
        if len(categories) > 1 and categories[1]["percentage"] > 0:
            second = categories[1]
            insight_lines.append(
                f"Next is {second['category']} ({money(second['amount'], currency)}, "
                f"{format_percent(second['percentage'])})."
            )
        elements.append(Spacer(1, 1.5 * mm))
        for line in insight_lines:
            elements.append(Paragraph("• " + safe_text(line), styles["FA_Body"]))


# ============================================================
# SECTION 3 — BUDGET ANALYSIS
# ============================================================

def build_budget_analysis(elements, styles, data, currency):
    elements.append(PageBreak())
    elements.append(section_title("3. Budget Management", styles))

    budget_data = data["budget_data"]
    configured_total = data["total_monthly_budget"]
    category_total = sum(
        safe_float(item["monthly_budget"]) for item in budget_data if item["monthly_budget"] > 0
    )
    over_count = sum(
        1 for item in budget_data if item["budget"] > 0 and item["actual"] > item["budget"]
    )

    elements.append(summary_cards([
        ("Configured Monthly Budget", money(configured_total, currency)),
        ("Sum of Category Budgets", money(category_total, currency)),
        ("Reporting Months", str(month_count_inclusive(
            data["data_quality"]["start_date"], data["data_quality"]["end_date"],
        ))),
        ("Overspending Categories", str(over_count)),
    ], styles))
    elements.append(Spacer(1, 2 * mm))
    elements.append(Paragraph(
        "Configured total monthly budget and the sum of category budgets are independent values. "
        "They are shown separately and are not assumed to be equal.",
        styles["FA_Small"],
    ))

    if not budget_data:
        elements.append(Spacer(1, 2 * mm))
        elements.append(Paragraph("No category budgets are configured.", styles["FA_Body"]))
        return

    elements.append(Spacer(1, 2 * mm))
    elements.append(subsection_title("Budget vs Actual Spending (period capacity)", styles))

    rows = [["Category", "Monthly", "Period Budget", "Actual", "Remaining", "Utilisation", "Status"]]
    for item in budget_data:
        budget = item["budget"]
        actual = item["actual"]
        if budget <= 0:
            status = "No Budget" if actual > 0 else "Unused"
        elif actual > budget:
            status = "Over"
        else:
            status = "Within"
        rows.append([
            item["category"],
            money(item["monthly_budget"], currency),
            money(budget, currency),
            money(actual, currency),
            money(item["remaining"], currency),
            format_percent(item["utilization"]) if budget > 0 else "—",
            status,
        ])
    elements.append(make_table(
        rows,
        [40 * mm, 30 * mm, 36 * mm, 36 * mm, 36 * mm, 28 * mm, 26 * mm],
        styles,
        alignments={1: "RIGHT", 2: "RIGHT", 3: "RIGHT", 4: "RIGHT", 5: "RIGHT"},
    ))

    chart_categories = [item for item in budget_data if item["budget"] > 0][:8]
    if chart_categories:
        elements.append(Spacer(1, 2 * mm))
        elements.append(budget_bar_chart(chart_categories, currency))

    elements.append(Spacer(1, 2 * mm))
    elements.append(Paragraph(
        "Period budget = configured monthly category limit × number of calendar months in the report period. "
        "Categories without a configured budget are listed separately.",
        styles["FA_Small"],
    ))


# ============================================================
# SECTION 4 — INCOME ANALYSIS
# ============================================================

def build_income_analysis(elements, styles, data, expenses, currency):
    elements.append(PageBreak())
    elements.append(section_title("4. Income Analysis", styles))

    income_transactions = [e for e in expenses if e.transaction_type == "income"]
    elements.append(summary_cards([
        ("Total Recorded Income", money(data["income"], currency)),
        ("Income Transactions", str(len(income_transactions))),
        ("Configured Monthly Income", money(data["monthly_income"], currency)),
        ("Net Cash Flow", money(data["net"], currency)),
    ], styles))
    elements.append(Spacer(1, 3 * mm))

    if not income_transactions:
        elements.append(Paragraph(
            "No income transactions were recorded in the selected period.", styles["FA_Body"],
        ))
        return

    sorted_income = sorted(income_transactions, key=lambda e: safe_float(e.amount), reverse=True)[:8]
    rows = [["Date", "Category", "Description", "Payment", "Amount"]]
    for expense in sorted_income:
        rows.append([
            format_date(expense.date),
            clean_category(expense.category),
            (expense.description or "")[:40],
            (expense.payment_method or "—"),
            money(expense.amount, currency),
        ])
    elements.append(subsection_title("Largest Income Transactions (sample)", styles))
    elements.append(make_table(
        rows, [30 * mm, 40 * mm, 80 * mm, 35 * mm, 40 * mm], styles,
        alignments={4: "RIGHT"},
    ))
    elements.append(Spacer(1, 2 * mm))
    elements.append(Paragraph(
        "Complete income and expense history appears in Appendix A.",
        styles["FA_Small"],
    ))


# ============================================================
# SECTION 5 — ANOMALY DETECTION (uses the single normalized list)
# ============================================================

def build_anomaly_analysis(elements, styles, data, currency):
    elements.append(PageBreak())
    elements.append(section_title("5. Anomaly Detection", styles))

    anomalies = data["anomalies"]  # the single list built from persisted fields

    elements.append(summary_cards([
        ("Detected Anomalies", str(len(anomalies))),
        ("Anomaly Amount", money(data["total_anomaly_amount"], currency)),
        ("Anomaly Rate", format_percent(data["anomaly_rate"])),
        ("High Severity", str(data["severity_counts"]["High"])),
    ], styles))
    elements.append(Spacer(1, 3 * mm))

    severity_data = [
        ["Severity", "Count"],
        ["High", str(data["severity_counts"]["High"])],
        ["Medium", str(data["severity_counts"]["Medium"])],
        ["Low", str(data["severity_counts"]["Low"])],
    ]
    elements.append(make_table(severity_data, [70 * mm, 40 * mm], styles, alignments={1: "RIGHT"}))
    elements.append(Spacer(1, 3 * mm))

    if not anomalies:
        elements.append(Paragraph(
            "No detected anomalies are available for the selected report.", styles["FA_Body"],
        ))
        return

    rows = [["Date", "Category", "Description", "Payment", "Amount", "Score", "Severity"]]
    for item in anomalies:
        score = item.get("anomaly_score")
        rows.append([
            format_date(item.get("date")),
            item.get("category", "—"),
            (item.get("description") or "")[:35],
            item.get("payment_method") or "—",
            money(item.get("amount", 0), currency),
            f"{safe_float(score):.4f}" if score is not None else "—",
            str(item.get("severity") or "Low"),
        ])
    elements.append(subsection_title("Detected Anomalous Transactions", styles))
    elements.append(make_table(
        rows,
        [28 * mm, 35 * mm, 55 * mm, 30 * mm, 32 * mm, 28 * mm, 28 * mm],
        styles,
        alignments={4: "RIGHT", 5: "RIGHT"},
    ))
    elements.append(Spacer(1, 2 * mm))
    elements.append(Paragraph(
        "Anomaly detection uses the anomaly flags, scores and severity values persisted on each transaction. "
        "An anomaly flag is not proof of fraud, error, or an incorrect transaction.",
        styles["FA_Small"],
    ))


# ============================================================
# SECTION 6 — FORECASTING
# ============================================================

def build_forecasting(elements, styles, data, currency):
    elements.append(PageBreak())
    elements.append(section_title("6. AI Expense Forecasting", styles))

    forecast = data["forecast"]
    if not forecast or forecast.get("status") == "unavailable":
        elements.append(Paragraph("Forecasting is unavailable for this report.", styles["FA_Body"]))
        if forecast:
            elements.append(Spacer(1, 2 * mm))
            elements.append(Paragraph(
                "Reason: " + safe_text(forecast.get("error", "Unknown forecasting error.")),
                styles["FA_Small"],
            ))
        return

    selected_model = forecast.get("selected_model", "ensemble")
    selected_forecast = forecast.get("selected_forecast", [])
    selected_mae = forecast.get("selected_mae")
    selected_rmse = forecast.get("selected_rmse")

    elements.append(summary_cards([
        ("Selected Model", str(selected_model)),
        ("Forecast Horizon", f"{len(selected_forecast)} days"),
        ("MAE", money(selected_mae, currency) if selected_mae is not None else "N/A"),
        ("RMSE", money(selected_rmse, currency) if selected_rmse is not None else "N/A"),
    ], styles))
    elements.append(Spacer(1, 3 * mm))

    evaluation = forecast.get("evaluation", {})
    evaluation_rows = [["Model", "MAE", "RMSE"]]
    for model_name in ["ARIMA", "Prophet", "XGBoost", "Ensemble"]:
        model_result = evaluation.get(model_name) if isinstance(evaluation, dict) else None
        if not model_result:
            continue
        evaluation_rows.append([
            model_name,
            money(model_result.get("mae"), currency) if model_result.get("mae") is not None else "—",
            money(model_result.get("rmse"), currency) if model_result.get("rmse") is not None else "—",
        ])
    if len(evaluation_rows) > 1:
        elements.append(subsection_title("Model Evaluation", styles))
        elements.append(make_table(
            evaluation_rows, [80 * mm, 55 * mm, 55 * mm], styles,
            alignments={1: "RIGHT", 2: "RIGHT"},
        ))

    elements.append(Spacer(1, 3 * mm))
    if selected_forecast:
        rows = [["Forecast Date", "Predicted Expense"]]
        for point in selected_forecast[:14]:
            rows.append([
                format_date(point.get("date")),
                money(point.get("predicted_amount"), currency),
            ])
        elements.append(subsection_title("Selected Forecast (first 14 days)", styles))
        elements.append(make_table(
            rows, [80 * mm, 70 * mm], styles, alignments={1: "RIGHT"},
        ))
        if len(selected_forecast) > 14:
            elements.append(Paragraph(
                f"… and {len(selected_forecast) - 14} additional forecast points (not shown for brevity).",
                styles["FA_Small"],
            ))

    elements.append(Spacer(1, 2 * mm))
    elements.append(Paragraph(
        "Forecast values are generated by the application’s existing forecasting pipeline. "
        "They represent model predictions and are not guarantees of future spending.",
        styles["FA_Small"],
    ))


# ============================================================
# SECTION 7 — ADVISOR
# ============================================================

def build_advisor_analysis(elements, styles, data, currency):
    elements.append(PageBreak())
    elements.append(section_title("7. AI Financial Advisor", styles))

    advisor = data["advisor"]
    if not isinstance(advisor, dict):
        elements.append(Paragraph("Advisor analysis is unavailable.", styles["FA_Body"]))
        return

    financial_summary = advisor.get("financial_summary")
    if isinstance(financial_summary, dict):
        elements.append(subsection_title("Advisor Financial Snapshot", styles))
        elements.append(summary_cards([
            ("Total Spending", money(financial_summary.get("total_spending", 0), currency)),
            ("Avg. Monthly Spending", money(financial_summary.get("average_monthly_spending", 0), currency)),
            ("Total Budget", money(financial_summary.get("total_budget", 0), currency)),
            ("Available Budget", money(financial_summary.get("available_budget", 0), currency)),
        ], styles))
        elements.append(Spacer(1, 2 * mm))
        elements.append(Paragraph(
            "Note: The advisor uses its own lookback window (typically 60 days) which may differ "
            "from the exact report period selected above.",
            styles["FA_Small"],
        ))
        elements.append(Spacer(1, 2 * mm))

    recommendations = advisor.get("recommendations", []) or []
    data_quality = advisor.get("data_quality") or {}
    dq_status = str(data_quality.get("status", "")).lower()
    all_zero_change = all(
        abs(safe_float(r.get("percentage_change", 0))) < 0.05
        for r in recommendations
    ) if recommendations else True
    limited = (
        dq_status in ("limited", "insufficient", "poor")
        or (recommendations and all_zero_change and any(
            "insufficient" in str(r.get("reason", "")).lower()
            or "not enough" in str(r.get("reason", "")).lower()
            for r in recommendations
        ))
    )

    if limited:
        elements.append(Paragraph(
            "Advisor confidence: Limited",
            styles["FA_Warning"],
        ))
        elements.append(Paragraph(
            "The advisor itself reports that historical data is insufficient for reliable budget adjustments. "
            "All recommended changes are therefore 0 %. Treat the output as informational only; "
            "do not re-allocate budgets solely on these numbers.",
            styles["FA_Body"],
        ))
        elements.append(Spacer(1, 2 * mm))

    summary = advisor.get("summary")
    if summary:
        elements.append(subsection_title("Advisor Summary", styles))
        elements.append(Paragraph(safe_text(summary), styles["FA_Body"]))
        elements.append(Spacer(1, 2 * mm))

    if not recommendations:
        elements.append(Paragraph("No advisor recommendations were returned.", styles["FA_Body"]))
    elif limited:
        cats = ", ".join(r.get("category", "—") for r in recommendations[:8])
        elements.append(Paragraph(
            f"Categories reviewed: {cats}. "
            "No quantitative budget change is recommended until more consistent expense history is available.",
            styles["FA_Body"],
        ))
    else:
        elements.append(subsection_title("Personalized Recommendations", styles))
        rows = [["Category", "Current", "Avg Spend", "Recommended", "Change", "Action", "Reason"]]
        for rec in recommendations:
            rows.append([
                rec.get("category", "—"),
                money(rec.get("current_budget", 0), currency),
                money(rec.get("average_monthly_spending", 0), currency),
                money(rec.get("recommended_budget", 0), currency),
                format_percent(rec.get("percentage_change", 0)),
                rec.get("action", "—"),
                (rec.get("reason") or "No reason supplied.")[:55],
            ])
        elements.append(make_table(
            rows,
            [30 * mm, 30 * mm, 30 * mm, 32 * mm, 25 * mm, 25 * mm, 70 * mm],
            styles,
            alignments={1: "RIGHT", 2: "RIGHT", 3: "RIGHT", 4: "RIGHT"},
        ))

    if isinstance(data_quality, dict) and data_quality:
        elements.append(Spacer(1, 3 * mm))
        elements.append(subsection_title("Advisor Data Quality", styles))
        quality_rows = [
            ["Status", "Months", "Days", "Expenses"],
            [
                data_quality.get("status", "—"),
                str(data_quality.get("months_available", "—")),
                str(data_quality.get("days_available", "—")),
                str(data_quality.get("total_expenses", "—")),
            ],
        ]
        elements.append(make_table(
            quality_rows, [55 * mm, 40 * mm, 40 * mm, 50 * mm], styles,
            alignments={1: "RIGHT", 2: "RIGHT", 3: "RIGHT"},
        ))


# ============================================================
# SECTION 8 — SHAP
# ============================================================

def build_explainability(elements, styles, data, currency):
    elements.append(PageBreak())
    elements.append(section_title("8. Explainable AI — XGBoost + SHAP", styles))

    explanation = data["explainability"]
    if not explanation or explanation.get("status") != "success":
        elements.append(Paragraph(
            "XGBoost/SHAP explainability is unavailable for this report.", styles["FA_Body"],
        ))
        if explanation:
            elements.append(Spacer(1, 2 * mm))
            elements.append(Paragraph(
                "Reason: " + safe_text(explanation.get("error", "Unknown explainability error.")),
                styles["FA_Small"],
            ))
        return

    elements.append(summary_cards([
        ("Model", explanation.get("model", "XGBoost")),
        ("Explainer", explanation.get("explainer", "SHAP")),
        ("Forecast Horizon", str(explanation.get("forecast_horizon", "—"))),
        ("Periods", str(explanation.get("periods", "—"))),
    ], styles))
    elements.append(Spacer(1, 3 * mm))

    feature_importance = explanation.get("feature_importance", [])
    if feature_importance:
        rows = [["Feature", "Mean Absolute SHAP", "Importance"]]
        importance_values = [
            safe_float(item.get("mean_absolute_shap", item.get("importance", 0)))
            for item in feature_importance
        ]
        total_importance = sum(importance_values) or 1
        for item, value in zip(feature_importance, importance_values):
            percentage = value / total_importance * 100
            rows.append([
                item.get("feature", "—"),
                f"{value:,.6f}",
                format_percent(percentage),
            ])
        elements.append(subsection_title("Feature Importance", styles))
        elements.append(make_table(
            rows, [80 * mm, 70 * mm, 55 * mm], styles,
            alignments={1: "RIGHT", 2: "RIGHT"},
        ))

    explanations = explanation.get("explanations", [])
    if explanations:
        elements.append(Spacer(1, 3 * mm))
        elements.append(subsection_title(
            "XGBoost explainability examples (model-generated timeline)",
            styles,
        ))
        elements.append(Paragraph(
            "These explanations come from the XGBoost/SHAP pipeline’s own forecast horizon. "
            "They are not guaranteed to be identical to the production ensemble forecast dates shown earlier.",
            styles["FA_Small"],
        ))
        elements.append(Spacer(1, 2 * mm))
        rows = [["Date", "Predicted", "Base", "Top Contributions"]]
        for item in explanations[:5]:
            contributions = item.get("feature_contributions", [])[:4]
            contribution_text = []
            for c in contributions:
                feature = c.get("feature", "—")
                shap_value = safe_float(c.get("shap_value", 0))
                direction = c.get("direction", "neutral")
                contribution_text.append(f"{feature}: {shap_value:+.3f} ({direction})")
            rows.append([
                format_date(item.get("date")),
                money(item.get("predicted_amount"), currency),
                money(item.get("base_value"), currency),
                "; ".join(contribution_text) if contribution_text else "—",
            ])
        elements.append(make_table(
            rows, [28 * mm, 35 * mm, 35 * mm, 140 * mm], styles,
            alignments={1: "RIGHT", 2: "RIGHT"},
        ))

    elements.append(Spacer(1, 2 * mm))
    elements.append(Paragraph(
        "SHAP values explain how the XGBoost model’s features contributed to a prediction. "
        "They describe model behaviour and should not be interpreted as proof that a feature "
        "caused the underlying financial outcome.",
        styles["FA_Small"],
    ))


# ============================================================
# SECTION 9 — QUALITATIVE AI REVIEW
# ============================================================

def build_llm_review(elements, styles, data):
    elements.append(PageBreak())
    elements.append(section_title("9. Qualitative Financial Review", styles))

    review = data["llm_review"]
    if not isinstance(review, dict):
        elements.append(Paragraph("AI review is unavailable.", styles["FA_Body"]))
        return

    success = bool(review.get("success", False))
    advice = review.get("advice", "")
    source = review.get("source", "unknown")

    if success and advice:
        elements.append(summary_cards([
            ("Review Source", str(source)),
            ("Status", "Available"),
        ], styles))
        elements.append(Spacer(1, 3 * mm))
        for paragraph in str(advice).split("\n"):
            paragraph = paragraph.strip()
            if not paragraph:
                continue
            elements.append(Paragraph(safe_text(paragraph), styles["FA_Body"]))
            elements.append(Spacer(1, 1.5 * mm))
    else:
        message = review.get("message", "No qualitative AI review was returned.")
        elements.append(Paragraph("AI financial review unavailable.", styles["FA_Body"]))
        elements.append(Spacer(1, 2 * mm))
        elements.append(Paragraph("Reason: " + safe_text(message), styles["FA_Small"]))

    elements.append(Spacer(1, 3 * mm))
    elements.append(Paragraph(
        "Qualitative AI commentary is supplementary. "
        "Verified numerical calculations in this report take precedence.",
        styles["FA_Small"],
    ))


# ============================================================
# SECTION 10 — DATA QUALITY + ASSESSMENT
# ============================================================

def build_data_quality(elements, styles, data, currency):
    elements.append(PageBreak())
    elements.append(section_title("10. Data Quality & Financial Assessment", styles))

    quality = data["data_quality"]
    quality_rows = [
        ["Metric", "Value"],
        ["Quality Status", quality["status"]],
        ["Unique Days", str(quality["unique_days"])],
        ["Months Available", str(quality["months_available"])],
        ["Transactions", str(quality["transactions"])],
        ["Expense Transactions", str(quality["expense_transactions"])],
        ["Income Transactions", str(quality["income_transactions"])],
        ["Transactions Missing Date", str(quality["transactions_missing_date"])],
    ]
    elements.append(make_table(quality_rows, [90 * mm, 110 * mm], styles))
    elements.append(Spacer(1, 3 * mm))
    elements.append(Paragraph(safe_text(quality["message"]), styles["FA_Body"]))
    elements.append(Spacer(1, 4 * mm))

    elements.append(subsection_title("Financial Assessment", styles))
    assessment = []
    if data["income"] <= 0:
        assessment.append("Recorded income is zero or unavailable for the selected period.")
    elif data["net"] >= 0:
        assessment.append("Recorded income exceeded recorded expenses during the selected period.")
    else:
        assessment.append("Recorded expenses exceeded recorded income during the selected period.")

    if data["total_monthly_budget"] <= 0:
        assessment.append("No total monthly budget is configured, so budget capacity cannot be fully assessed.")
    elif data["average_monthly_spending"] > data["total_monthly_budget"]:
        assessment.append("Average monthly spending exceeds the configured total monthly budget.")
    else:
        assessment.append("Average monthly spending is not above the configured total monthly budget.")

    overspending = [
        item for item in data["budget_data"]
        if item["budget"] > 0 and item["actual"] > item["budget"]
    ]
    if overspending:
        names = ", ".join(item["category"] for item in overspending[:6])
        assessment.append("Overspending was identified in: " + names + ".")
    else:
        assessment.append("No configured budget category exceeded its prorated period budget.")

    if data["anomalies"]:
        assessment.append(
            f"{len(data['anomalies'])} anomalous transaction(s) were identified "
            "from the persisted anomaly flags on the selected transactions."
        )
    else:
        assessment.append("No anomaly records were available.")

    for item in assessment:
        elements.append(Paragraph("• " + safe_text(item), styles["FA_Body"]))

    elements.append(Spacer(1, 4 * mm))
    elements.append(subsection_title("Limitations & Interpretation", styles))
    limitations = [
        "Forecasts are model predictions and are not guarantees of future spending.",
        "Anomaly flags identify unusual transactions but do not establish fraud or transaction errors.",
        "SHAP explanations describe model behaviour and do not establish causality.",
        "Budget utilisation depends on the transactions and reporting period selected.",
        "The report does not create a financial-health score because the application does not provide a validated scoring methodology.",
        "Qualitative AI commentary should not override verified numerical calculations.",
    ]
    for item in limitations:
        elements.append(Paragraph("• " + safe_text(item), styles["FA_Small"]))


# ============================================================
# APPENDIX A — COMPLETE TRANSACTION HISTORY
# Uses the exact same persisted anomaly fields as the anomaly section
# ============================================================

def build_transaction_history(elements, styles, expenses, currency):
    elements.append(PageBreak())
    elements.append(section_title("Appendix A — Complete Transaction History", styles))
    elements.append(Paragraph(
        "All transactions in the selected reporting period, ordered by date (newest first). "
        "Anomaly status, score and severity are the values persisted on each transaction "
        "and are identical to those shown in the Anomaly Detection section.",
        styles["FA_Small"],
    ))
    elements.append(Spacer(1, 2 * mm))

    if not expenses:
        elements.append(Paragraph(
            "No transactions were found in the selected period.", styles["FA_Body"],
        ))
        return

    rows = [["Date", "Type", "Category", "Description", "Payment", "Amount", "Anomaly", "Score", "Severity"]]
    sorted_expenses = sorted(
        expenses,
        key=lambda item: (item.date is None, item.date or date.min),
        reverse=True,
    )
    for expense in sorted_expenses:
        is_anom = bool(getattr(expense, "is_anomaly", False))
        score = getattr(expense, "anomaly_score", None)
        severity = getattr(expense, "severity", None) or "—"
        rows.append([
            format_date(expense.date),
            (expense.transaction_type or "—").title(),
            clean_category(expense.category),
            (expense.description or "")[:45],
            (expense.payment_method or "—"),
            money(expense.amount, currency),
            "Yes" if is_anom else "No",
            f"{safe_float(score):.4f}" if score is not None else "—",
            str(severity) if is_anom else "—",
        ])

    elements.append(make_table(
        rows,
        [25 * mm, 22 * mm, 35 * mm, 60 * mm, 30 * mm, 32 * mm, 22 * mm, 28 * mm, 25 * mm],
        styles,
        alignments={5: "RIGHT", 6: "CENTER", 7: "RIGHT"},
    ))


# ============================================================
# MAIN PDF CREATION
# ============================================================

def create_complete_pdf(user, expenses, budgets, start_date, end_date, data):
    buffer = BytesIO()
    document = FinancialReportDocTemplate(buffer, build_styles())
    styles = document.styles
    currency = user.currency or "INR"
    elements = []

    build_cover(elements, styles, user, start_date, end_date, currency)
    build_executive_summary(elements, styles, user, data, currency)
    build_spending_analysis(elements, styles, data, currency)
    build_budget_analysis(elements, styles, data, currency)
    build_income_analysis(elements, styles, data, expenses, currency)
    build_anomaly_analysis(elements, styles, data, currency)
    build_forecasting(elements, styles, data, currency)
    build_advisor_analysis(elements, styles, data, currency)
    build_explainability(elements, styles, data, currency)
    build_llm_review(elements, styles, data)
    build_data_quality(elements, styles, data, currency)
    build_transaction_history(elements, styles, expenses, currency)

    document.build(elements)
    buffer.seek(0)
    return buffer


def create_anomaly_pdf(user, expenses, start_date, end_date, data):
    buffer = BytesIO()
    document = FinancialReportDocTemplate(buffer, build_styles())
    styles = document.styles
    currency = user.currency or "INR"
    elements = []

    elements.append(Spacer(1, 12 * mm))
    elements.append(Paragraph("FinSight Anomaly Detection Report", styles["FA_Title"]))
    elements.append(Paragraph(
        f"Prepared for {safe_text(user.name or user.email)} | "
        f"{format_date(start_date)} – {format_date(end_date)}",
        styles["FA_Subtitle"],
    ))
    build_anomaly_analysis(elements, styles, data, currency)
    document.build(elements)
    buffer.seek(0)
    return buffer


# ============================================================
# DATE FILTERING
# ============================================================

def validate_date_range(start_date, end_date):
    if start_date is not None and end_date is not None and start_date > end_date:
        raise HTTPException(
            status_code=400,
            detail="start_date cannot be later than end_date.",
        )


def load_user_expenses(db, user, start_date=None, end_date=None):
    query = db.query(Expense).filter(Expense.user_id == user.id)
    if start_date is not None:
        query = query.filter(Expense.date >= start_date)
    if end_date is not None:
        query = query.filter(Expense.date <= end_date)
    return query.order_by(Expense.date.desc()).all()


def resolve_report_dates(db, user, expenses, start_date, end_date):
    dated = [expense.date for expense in expenses if expense.date is not None]
    if start_date is None:
        start_date = min(dated) if dated else date.today()
    if end_date is None:
        end_date = max(dated) if dated else date.today()
    return start_date, end_date


# ============================================================
# CSV EXPORT
# ============================================================

@router.get("/expenses")
def export_expenses(
    start_date: date | None = Query(default=None, description="Optional inclusive report start date."),
    end_date: date | None = Query(default=None, description="Optional inclusive report end date."),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    validate_date_range(start_date, end_date)
    expenses = load_user_expenses(db, user, start_date, end_date)

    output = StringIO()
    writer = csv.writer(output)
    writer.writerow([
        "Date", "Type", "Category", "Description", "Amount",
        "Payment Method", "Anomaly", "Anomaly Score", "Severity",
    ])
    for expense in expenses:
        writer.writerow([
            expense.date,
            expense.transaction_type,
            expense.category,
            expense.description or "",
            expense.amount,
            expense.payment_method or "",
            "Yes" if getattr(expense, "is_anomaly", False) else "No",
            getattr(expense, "anomaly_score", None),
            getattr(expense, "severity", None),
        ])
    output.seek(0)
    return StreamingResponse(
        iter([output.getvalue()]),
        media_type="text/csv",
        headers={"Content-Disposition": 'attachment; filename="FinSight_Financial_Data.csv"'},
    )


# ============================================================
# BASIC REPORT ENDPOINT
# ============================================================

@router.get("/report.pdf")
def export_financial_report(
    start_date: date | None = Query(default=None),
    end_date: date | None = Query(default=None),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    validate_date_range(start_date, end_date)
    expenses = load_user_expenses(db, user, start_date, end_date)
    start_date, end_date = resolve_report_dates(db, user, expenses, start_date, end_date)
    budgets = db.query(Budget).filter(Budget.user_id == user.id).order_by(Budget.category).all()
    data = build_report_data(db, user, expenses, budgets, start_date, end_date)
    pdf = create_complete_pdf(user, expenses, budgets, start_date, end_date, data)
    return StreamingResponse(
        pdf,
        media_type="application/pdf",
        headers={"Content-Disposition": 'attachment; filename="FinSight_Financial_Report.pdf"'},
    )


# ============================================================
# ANOMALY REPORT
# ============================================================

@router.get("/anomalies.pdf")
def export_anomaly_report(
    start_date: date | None = Query(default=None),
    end_date: date | None = Query(default=None),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    validate_date_range(start_date, end_date)
    expenses = load_user_expenses(db, user, start_date, end_date)
    start_date, end_date = resolve_report_dates(db, user, expenses, start_date, end_date)
    budgets = db.query(Budget).filter(Budget.user_id == user.id).order_by(Budget.category).all()
    data = build_report_data(db, user, expenses, budgets, start_date, end_date)
    pdf = create_anomaly_pdf(user, expenses, start_date, end_date, data)
    return StreamingResponse(
        pdf,
        media_type="application/pdf",
        headers={"Content-Disposition": 'attachment; filename="FinSight_Anomaly_Report.pdf"'},
    )


# ============================================================
# COMPLETE FINANCIAL REPORT
# ============================================================

@router.get("/complete-report.pdf")
def export_complete_report(
    start_date: date | None = Query(default=None, description="Inclusive report start date."),
    end_date: date | None = Query(default=None, description="Inclusive report end date."),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    validate_date_range(start_date, end_date)

    # Authenticated user only – never trust a client-supplied user_id
    expenses = load_user_expenses(db, user, start_date, end_date)
    start_date, end_date = resolve_report_dates(db, user, expenses, start_date, end_date)
    budgets = db.query(Budget).filter(Budget.user_id == user.id).order_by(Budget.category).all()
    data = build_report_data(db, user, expenses, budgets, start_date, end_date)
    pdf = create_complete_pdf(user, expenses, budgets, start_date, end_date, data)
    return StreamingResponse(
        pdf,
        media_type="application/pdf",
        headers={"Content-Disposition": 'attachment; filename="FinSight_Complete_Financial_Report.pdf"'},
    )
