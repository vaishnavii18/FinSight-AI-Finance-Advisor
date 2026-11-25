# FinSight: AI Finance Advisor

A web-based personal finance application that combines expense and budget management with daily spending forecasting (ARIMA, Prophet, XGBoost and an equal-weight ensemble), Isolation Forest anomaly detection, SHAP explanations for the XGBoost forecast, linear-programming budget optimisation, and a rule-based advisor with an optional local LLM review (Ollama).

Project report: *FinSight: A Hybrid Time-Series Forecasting System with SHAP-Based Explainability for Personal Expenditure Analysis*, Central University of Jharkhand, 2026.

> FinSight is a decision-support tool. Forecasts, anomaly flags and recommendations are estimates to be reviewed by the user. They are not financial advice and anomaly flags do not establish fraud.

## Features

| Module | What it does |
|---|---|
| Accounts | Registration and login; JWT (HS256, 60 min); Argon2 password hashing; all data scoped per user |
| Transactions | Add, edit, delete and filter income and expenses (single `Expense` table with a `transaction_type` field) |
| Budgets | Monthly limit per category; spending compared with limits |
| Forecasting | Daily expenditure forecast with ARIMA(2,1,2), Prophet (weekly seasonality), XGBoost (calendar + lag1/lag7 features) and an equal-weight ensemble; MAE/RMSE on a chronological 80/20 holdout |
| Anomaly detection | Isolation Forest on log-transformed expense amounts (200 trees, contamination 0.1); preview or save flags, scores and severity |
| Explainability | SHAP `TreeExplainer` contributions for the XGBoost forecast (per date and mean absolute summary) |
| Budget optimisation | PuLP linear program that keeps allocations close to historical monthly averages within (budget − savings goal) |
| AI Advisor | Rule-based recommendations, plus an optional Ollama-written review of the computed figures |
| Import / export | SBI bank-statement PDF import (text extraction or OCR) with preview before confirming; CSV and PDF report export |

## Tech stack

- **Frontend:** React 19, TypeScript, Vite, Tailwind CSS, React Router, Axios, Recharts
- **Backend:** Python, FastAPI, SQLAlchemy, Pydantic, SQLite
- **ML / analytics:** statsmodels, Prophet, XGBoost, scikit-learn, SHAP, PuLP, pandas, NumPy
- **Optional:** Ollama (local LLM), Tesseract OCR and Poppler (scanned statements)

## Repository structure

```
backend/
  app/
    api/          # FastAPI routers: auth, expenses, budget, forecast, anomaly,
                  #   explainability, advisor, export, user_settings
    ml/           # forecasting, anomaly_detection, explainability, advisor, categorization
    services/     # pdf_parser (SBI statement import)
    models.py     # SQLAlchemy models (User, Expense, Budget)
    schemas.py    # Pydantic schemas
    security.py   # password hashing, JWT creation and verification
    database.py   # SQLite configuration
    main.py       # FastAPI app, CORS, router registration
  test_anomaly.py # anomaly-detection check script
  requirements.txt
frontend/
  src/            # pages, components, auth context, API client
```

## Prerequisites

- Python 3.10 or newer
- Node.js 18 or newer and npm
- *Optional, scanned-PDF import:* [Tesseract OCR](https://github.com/tesseract-ocr/tesseract) and [Poppler](https://poppler.freedesktop.org/)
- *Optional, AI review:* [Ollama](https://ollama.com/) with a pulled model (default `llama3`)

## Setup

### 1. Backend

```bash
cd backend
python -m venv .venv
# Windows: .venv\Scripts\activate      macOS/Linux: source .venv/bin/activate
pip install -r requirements.txt
```

Create `backend/.env` (this file is git-ignored):

```env
SECRET_KEY=replace-with-a-long-random-string
# Optional, Ollama review
OLLAMA_URL=http://localhost:11434/api/generate
OLLAMA_MODEL=llama3
OLLAMA_TIMEOUT=180
```

`SECRET_KEY` is required: the backend refuses to start without it. Generate one with:

```bash
python -c "import secrets; print(secrets.token_urlsafe(48))"
```

Start the API:

```bash
uvicorn app.main:app --reload --port 8000
```

The API is at `http://127.0.0.1:8000` and the interactive docs at `http://127.0.0.1:8000/docs`. Tables are created automatically in `backend/finance.db` on first start.

### 2. Frontend

```bash
cd frontend
npm install
npm run dev
```

Open `http://localhost:5173`. The Vite dev server proxies `/api/*` to the backend on port 8000.

### 3. Optional: AI review (Ollama)

```bash
ollama pull llama3
ollama serve
```

If Ollama is not running, the AI Advisor falls back to the rule-based recommendations.

## Usage

1. Register an account and log in.
2. Add transactions manually, or import an SBI statement PDF from the Expenses page and confirm the previewed rows.
3. Set category budgets on the Budget page.
4. Open Forecast, Anomalies, Explainability and AI Advisor for the analysis. Settings has CSV/PDF export.

Minimum data: forecasting needs at least 14 daily observations, holdout validation (MAE/RMSE) needs at least 30, and anomaly detection needs at least 10 expense amounts with at least 3 distinct values.

## Tests

```bash
cd backend
python test_anomaly.py
```

This runs Isolation Forest on 20 sample expenses (19 ordinary amounts and one of ₹50,000). Other checks were done manually through the UI; there is no automated test suite yet.

## Known limitations

- PDF import supports SBI statement layouts only; category suggestions are keyword-based.
- `backend/app/services/pdf_parser.py` contains Windows paths for Tesseract and Poppler. Edit them if you are on another OS or installed elsewhere.
- Forecasts cover total daily spending, not individual categories. Days with no recorded expense are treated as zero spend.
- SHAP explains the XGBoost model only, not ARIMA, Prophet or the ensemble.
- Evaluation uses one user's data and one holdout window.
- Prototype security: the token is kept in `sessionStorage`, there is no login rate limiting or token revocation, and the SQLite file is unencrypted. CORS allows only `localhost:5173` and `127.0.0.1:5173`. Do not deploy as-is.

See Chapter 6 of the project report for details.

## Author

Vaishnavi Sharma, Department of Computer Science and Engineering, Central University of Jharkhand, Ranchi.
Supervisor: Prof. Subhash Chandra Yadav.
