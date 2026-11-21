import re
from datetime import datetime
from io import BytesIO
from typing import List

import pdfplumber

from app.schemas import ParsedTransaction


def clean_description(raw: str) -> str:
    """Make the transaction description cleaner and shorter."""
    if not raw:
        return "Unknown Transaction"

    # Remove common UPI noise
    cleaned = re.sub(r"UPI/(DR|CR)/\d+/", "", raw)
    cleaned = re.sub(r"/UPI$", "", cleaned)
    cleaned = re.sub(r"\s+", " ", cleaned).strip()

    # Keep only first meaningful part
    parts = cleaned.split("/")
    if parts:
        return parts[0].strip()[:80]

    return cleaned[:80]


def guess_category(description: str, is_income: bool) -> str:
    """Simple keyword-based category guessing."""
    if is_income:
        return "Income"

    desc = description.lower()

    if any(word in desc for word in ["airtel", "jio", "vi ", "recharge", "prepaid"]):
        return "Mobile Recharge"
    if any(word in desc for word in ["irctc", "railway", "train"]):
        return "Travel"
    if any(word in desc for word in ["dosa", "food", "restaurant", "cafe", "swiggy", "zomato"]):
        return "Food"
    if any(word in desc for word in ["atm", "cash"]):
        return "Cash Withdrawal"
    if any(word in desc for word in ["interest"]):
        return "Interest"
    if any(word in desc for word in ["google", "youtube", "netflix"]):
        return "Subscriptions"

    return "Uncategorized"


def parse_sbi_statement(pdf_bytes: bytes) -> List[ParsedTransaction]:
    """
    Parse SBI bank statement PDF and return list of transactions.
    Works with the format you shared.
    """
    transactions: List[ParsedTransaction] = []

    with pdfplumber.open(BytesIO(pdf_bytes)) as pdf:
        for page in pdf.pages:
            tables = page.extract_tables()

            for table in tables:
                if not table or len(table) < 2:
                    continue

                # Find header row
                header = [str(cell).lower() if cell else "" for cell in table[0]]

                # Check if this looks like the transaction table
                if not any("date" in h for h in header):
                    continue

                # Process data rows
                for row in table[1:]:
                    if not row or len(row) < 5:
                        continue

                    date_str = str(row[0]).strip() if row[0] else ""
                    description = str(row[1]).strip() if row[1] else ""
                    credit_str = str(row[3]).strip() if row[3] else "0"
                    debit_str = str(row[4]).strip() if row[4] else "0"

                    # Skip opening/closing balance rows
                    if "opening balance" in description.lower() or "closing balance" in description.lower():
                        continue
                    if not date_str or date_str.lower().startswith("your"):
                        continue

                    # Parse date (DD-MM-YY → YYYY-MM-DD)
                    try:
                        # Handle both DD-MM-YY and DD-MM-YYYY
                        if len(date_str.split("-")[-1]) == 2:
                            parsed_date = datetime.strptime(date_str, "%d-%m-%y")
                        else:
                            parsed_date = datetime.strptime(date_str, "%d-%m-%Y")
                        date_iso = parsed_date.strftime("%Y-%m-%d")
                    except ValueError:
                        continue

                    # Parse amounts
                    try:
                        credit = float(credit_str.replace(",", "") or 0)
                        debit = float(debit_str.replace(",", "") or 0)
                    except ValueError:
                        continue

                    if credit == 0 and debit == 0:
                        continue

                    is_income = credit > 0
                    amount = credit if is_income else debit
                    clean_desc = clean_description(description)
                    category = guess_category(clean_desc, is_income)

                    transactions.append(
                        ParsedTransaction(
                            date=date_iso,
                            description=clean_desc,
                            amount=round(amount, 2),
                            transaction_type="income" if is_income else "expense",
                            suggested_category=category,
                            payment_method="UPI" if "UPI" in description.upper() else "Other",
                        )
                    )

    return transactions