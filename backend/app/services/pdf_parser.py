
import re
from datetime import datetime
from io import BytesIO
from typing import List

import pdfplumber
import pytesseract
from pdf2image import convert_from_bytes

from app.schemas import ParsedTransaction


# Windows OCR tool locations
pytesseract.pytesseract.tesseract_cmd = (
    r"C:\Program Files\Tesseract-OCR\tesseract.exe"
)

POPPLER_PATH = (
    r"C:\Program Files\Poppler\poppler-26.09.0\Library\bin"
)


def clean_description(raw: str) -> str:
    """Clean and shorten a transaction description."""
    if not raw:
        return "Unknown Transaction"

    cleaned = re.sub(r"UPI/(DR|CR)/\d+/", "", raw, flags=re.IGNORECASE)
    cleaned = re.sub(r"/UPI$", "", cleaned, flags=re.IGNORECASE)
    cleaned = re.sub(r"\s+", " ", cleaned).strip()

    parts = cleaned.split("/")
    return (parts[0].strip() if parts else cleaned)[:80]


def guess_category(description: str, is_income: bool) -> str:
    """Guess a transaction category using keywords."""
    if is_income:
        return "Income"

    desc = description.lower()

    if any(word in desc for word in [
        "airtel", "jio", "vi ", "recharge", "prepaid"
    ]):
        return "Mobile Recharge"

    if any(word in desc for word in ["irctc", "railway", "train"]):
        return "Travel"

    if any(word in desc for word in [
        "dosa", "food", "restaurant", "cafe", "swiggy", "zomato"
    ]):
        return "Food"

    if any(word in desc for word in ["atm", "cash"]):
        return "Cash Withdrawal"

    if "interest" in desc:
        return "Interest"

    if any(word in desc for word in ["google", "youtube", "netflix"]):
        return "Subscriptions"

    return "Uncategorized"


def parse_date(date_str: str):
    """Convert supported bank statement dates to YYYY-MM-DD."""
    date_str = date_str.strip()

    for fmt in (
        "%d-%m-%y",
        "%d-%m-%Y",
        "%d/%m/%y",
        "%d/%m/%Y",
        "%d %b %Y",
        "%d %b %y",
        "%d %B %Y",
    ):
        try:
            return datetime.strptime(date_str, fmt).strftime("%Y-%m-%d")
        except ValueError:
            continue

    return None


def parse_amount(value) -> float:
    """Convert a bank statement amount into a number."""
    if value is None:
        return 0.0

    value = str(value).strip()
    value = value.replace(",", "").replace("₹", "").replace("Rs.", "")
    value = value.replace("INR", "").strip()

    if not value or value in ("-", "—"):
        return 0.0

    # Ignore values that do not resemble amounts.
    if not re.fullmatch(r"-?\d+(?:\.\d{1,2})?", value):
        raise ValueError("Invalid amount")

    return abs(float(value))


def make_transaction(date_iso, description, credit, debit):
    """Create a transaction using the existing project schema."""
    if credit <= 0 and debit <= 0:
        return None

    # Skip rows where the debit/credit meaning is ambiguous.
    if credit > 0 and debit > 0:
        return None

    is_income = credit > 0
    amount = credit if is_income else debit
    clean_desc = clean_description(description)

    if not clean_desc or clean_desc == "Unknown Transaction":
        return None

    return ParsedTransaction(
        date=date_iso,
        description=clean_desc,
        amount=round(amount, 2),
        transaction_type="income" if is_income else "expense",
        suggested_category=guess_category(clean_desc, is_income),
        payment_method=(
            "UPI" if "UPI" in description.upper() else "Other"
        ),
    )


def parse_table_rows(pdf_bytes: bytes) -> List[ParsedTransaction]:
    """Extract transactions from selectable-text PDF tables."""
    transactions = []

    with pdfplumber.open(BytesIO(pdf_bytes)) as pdf:
        for page in pdf.pages:
            for table in page.extract_tables() or []:
                if not table or len(table) < 2:
                    continue

                header = [
                    str(cell).lower() if cell else ""
                    for cell in table[0]
                ]

                if not any("date" in cell for cell in header):
                    continue

                for row in table[1:]:
                    if not row or len(row) < 5:
                        continue

                    date_str = str(row[0] or "").strip()
                    description = str(row[1] or "").strip()

                    if not description:
                        continue

                    if any(
                        label in description.lower()
                        for label in (
                            "opening balance",
                            "closing balance",
                            "total",
                        )
                    ):
                        continue

                    date_iso = parse_date(date_str)
                    if not date_iso:
                        continue

                    try:
                        credit = parse_amount(row[3])
                        debit = parse_amount(row[4])
                    except ValueError:
                        continue

                    transaction = make_transaction(
                        date_iso, description, credit, debit
                    )

                    if transaction:
                        transactions.append(transaction)

    return transactions



def parse_ocr_text(text: str) -> List[ParsedTransaction]:
    """
    Parse OCR text from an SBI statement.

    Expected transaction columns:
    Date | Description | Credit | Debit | Balance

    Balance is deliberately excluded from imported transactions.
    """
    transactions = []

    date_pattern = re.compile(
        r"^\s*(\d{1,2}[-/]\d{1,2}[-/]\d{2,4})\s+(.+)$"
    )

    # Match whitespace-separated numeric values, including OCR's -0.
    number_pattern = re.compile(
        r"(?<!\S)-?\d[\d,]*(?:\.\d{2})?(?=\s|$)"
    )

    for line in text.splitlines():
        line = re.sub(r"\s+", " ", line).strip()

        if not line:
            continue

        date_match = date_pattern.match(line)

        if not date_match:
            continue

        date_iso = parse_date(date_match.group(1))
        remainder = date_match.group(2)

        if not date_iso:
            continue

        if any(
            word in remainder.lower()
            for word in (
                "opening balance",
                "closing balance",
                "transaction details",
            )
        ):
            continue

        # Find the numeric columns at the end of the transaction row.
        amount_matches = list(number_pattern.finditer(remainder))

        if len(amount_matches) < 3:
            continue

        # The final three values represent:
        # Credit, Debit, Balance.
        last_three = amount_matches[-3:]

        credit_text = last_three[0].group().replace(",", "").replace("-", "")
        debit_text = last_three[1].group().replace(",", "").replace("-", "")

        # Description ends before the Credit column.
        description = remainder[:last_three[0].start()].strip()
        description = description.rstrip("-–— ").strip()

        try:
            credit = float(credit_text)
            debit = float(debit_text)
        except ValueError:
            continue

        if not description:
            continue

        # Avoid importing rows with ambiguous debit/credit values.
        if credit > 0 and debit > 0:
            continue

        # Validate UPI direction when it is clearly present.
        upper_description = description.upper()

        if "/CR/" in upper_description and debit > 0:
            continue

        if "/DR/" in upper_description and credit > 0:
            continue

        transaction = make_transaction(
            date_iso,
            description,
            credit,
            debit,
        )

        if transaction:
            transactions.append(transaction)

    return transactions



def parse_sbi_statement(pdf_bytes: bytes) -> List[ParsedTransaction]:
    """
    Parse an SBI statement using table extraction first, then OCR
    if no transactions can be extracted from the tables.
    """
    transactions = parse_table_rows(pdf_bytes)

    if transactions:
        return transactions

    # Convert scanned PDF pages into images, then recognize text.
    try:
        images = convert_from_bytes(
            pdf_bytes,
            dpi=300,
            poppler_path=POPPLER_PATH,
        )

        ocr_pages = []
        for image in images:
            text = pytesseract.image_to_string(
                image,
                config="--psm 6",
            )
            ocr_pages.append(text)

        ocr_text = "\n".join(ocr_pages)
        return parse_ocr_text(ocr_text)

    except Exception as exc:
        raise ValueError(
            "Could not read the PDF using OCR. "
            "Check the PDF file and the Tesseract/Poppler installation."
        ) from exc
