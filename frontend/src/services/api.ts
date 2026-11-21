import axios from "axios";

const TOKEN_KEY = "finance_advisor_token";

const api = axios.create({
  baseURL:
    "/api",
  headers: {
    "Content-Type": "application/json",
  },
  timeout: 30000,
});

api.interceptors.request.use((config) => {
  const token = sessionStorage.getItem(TOKEN_KEY);

  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }

  return config;
});

/* =========================================================
   EXPENSES
========================================================= */

export type AnomalySeverity =
  | "Normal"
  | "Low"
  | "Medium"
  | "High";

export interface Expense {
  id: number;
  date: string | null;
  amount: number;
  category: string;
  description: string | null;
  payment_method: string | null;
  transaction_type: "expense" | "income";
  is_anomaly?: boolean;
  anomaly_score?: number;
  severity?: AnomalySeverity;
}

export interface ExpenseCreate {
  date: string;
  amount: number;
  category: string;
  description?: string;
  payment_method?: string;
}

export const getExpenses = async (): Promise<Expense[]> => {
  const response = await api.get("/expenses/");
  return response.data;
};

export const createExpense = async (
  expense: ExpenseCreate
): Promise<Expense> => {
  const response = await api.post("/expenses/", expense);
  return response.data;
};

export const updateExpense = async (
  expenseId: number,
  expenseData: {
    date: string;
    amount: number;
    category: string;
    description?: string;
    payment_method?: string;
  }
): Promise<Expense> => {
  const response = await api.put(
    `/expenses/${expenseId}`,
    expenseData
  );

  return response.data;
};

export const deleteExpense = async (
  expenseId: number
): Promise<void> => {
  await api.delete(`/expenses/${expenseId}`);
};

/* =========================================================
   PDF IMPORT
========================================================= */

export interface ParsedTransaction {
  date: string;
  description: string;
  amount: number;
  transaction_type: "expense" | "income";
  suggested_category: string;
  payment_method: string | null;
}

export interface PDFImportPreviewResponse {
  total_transactions: number;
  expenses_count: number;
  income_count: number;
  transactions: ParsedTransaction[];
}

export const previewPDFImport = async (
  file: File
): Promise<PDFImportPreviewResponse> => {
  const formData = new FormData();

  formData.append("file", file);

  const response = await api.post(
    "/expenses/import-pdf/preview",
    formData,
    {
      headers: {
        "Content-Type": "multipart/form-data",
      },
    }
  );

  return response.data;
};

export const confirmPDFImport = async (
  transactions: ParsedTransaction[]
): Promise<{
  status: string;
  imported_count: number;
  message: string;
}> => {
  const response = await api.post(
    "/expenses/import-pdf/confirm",
    {
      transactions,
    }
  );

  return response.data;
};

/* =========================================================
   BUDGETS
========================================================= */

export interface Budget {
  id: number;
  category: string;
  monthly_limit: number;
}

export interface BudgetCreate {
  category: string;
  monthly_limit: number;
}

export interface BudgetUpdate {
  category: string;
  monthly_limit: number;
}

export const getBudgets = async (): Promise<Budget[]> => {
  const response = await api.get("/budgets/");
  return response.data;
};

export const createBudget = async (
  budget: BudgetCreate
): Promise<Budget> => {
  const response = await api.post("/budgets/", budget);
  return response.data;
};

export const updateBudget = async (
  budgetId: number,
  budget: BudgetUpdate
): Promise<Budget> => {
  const response = await api.put(
    `/budgets/${budgetId}`,
    budget
  );

  return response.data;
};

export const deleteBudget = async (
  budgetId: number
): Promise<void> => {
  await api.delete(`/budgets/${budgetId}`);
};

/* =========================================================
   BUDGET OPTIMIZATION
========================================================= */

export interface BudgetOptimizationRequest {
  total_budget?: number;
  savings_goal: number;
}

export interface BudgetOptimizationRecommendation {
  category: string;
  current_budget: number;
  average_monthly_spending: number;
  target_allocation: number;
  recommended_budget: number;
  difference: number;
  percentage_change: number;
  action: "Reduce" | "Maintain" | "Increase";
}

export interface BudgetOptimizationResponse {
  status: string;
  optimization_status: string;
  total_budget: number;
  savings_goal: number;
  available_budget: number;
  optimized_total: number;
  remaining_amount: number;
  recommendations: BudgetOptimizationRecommendation[];
}

export const optimizeBudget = async (
  request: BudgetOptimizationRequest
): Promise<BudgetOptimizationResponse> => {
  const response = await api.post(
    "/budgets/optimize",
    request
  );

  return response.data;
};

/* =========================================================
   FORECAST
========================================================= */

export type ForecastModel =
  | "arima"
  | "prophet"
  | "xgboost"
  | "ensemble";

export interface ForecastRequest {
  months_ahead?: number;
  model?: ForecastModel;
}

export interface ForecastPoint {
  date: string;
  predicted_amount: number;
}

export interface ForecastMetrics {
  mae?: number | null;
  rmse?: number | null;
}

export interface ForecastModelResult
  extends ForecastMetrics {
  model: string;
  forecasts: ForecastPoint[];
  error?: string;
}

export interface ForecastEvaluation {
  ARIMA?: ForecastMetrics;
  Prophet?: ForecastMetrics;
  XGBoost?: ForecastMetrics;
  Ensemble?: ForecastMetrics;
  error?: string;
}

export interface ForecastResponse {
  ARIMA?: ForecastModelResult;
  Prophet?: ForecastModelResult;
  XGBoost?: ForecastModelResult;
  Ensemble?: ForecastModelResult;

  selected_model?: ForecastModel;
  selected_forecast?: ForecastPoint[];
  selected_mae?: number | null;
  selected_rmse?: number | null;

  evaluation?: ForecastEvaluation;

  error?: string;
}

export const getForecast = async (
  monthsAhead: number = 1,
  model: ForecastModel = "ensemble"
): Promise<ForecastResponse> => {
  const response = await api.post<ForecastResponse>(
    "/forecast/",
    {
      months_ahead: monthsAhead,
      model,
    }
  );

  return response.data;
};

/* =========================================================
   ANOMALY DETECTION
========================================================= */

export interface AnomalyExpense {
  id: number;
  date: string | null;
  amount: number;
  category: string;
  description: string | null;
  payment_method: string | null;
  is_anomaly: boolean;
  anomaly_score?: number;
  severity?: AnomalySeverity;
}

export interface AnomalySeverityCounts {
  High: number;
  Medium: number;
  Low: number;
}

export interface AnomalyDetectionResponse {
  status: string;
  total_expenses: number;
  anomaly_count: number;
  anomaly_percentage: number;
  total_anomaly_amount: number;
  severity_counts: AnomalySeverityCounts;
  anomalies: AnomalyExpense[];
}

export interface AnomalyListResponse {
  status: string;
  anomaly_count: number;
  anomalies: AnomalyExpense[];
}

export const getAnomalyDetection =
  async (): Promise<AnomalyDetectionResponse> => {
    const response = await api.get(
      "/anomaly/detect"
    );

    return response.data;
  };

export const getAnomalyPreview =
  async (): Promise<AnomalyDetectionResponse> => {
    const response = await api.get(
      "/anomaly/preview"
    );

    return response.data;
  };

export const getAnomalyList =
  async (): Promise<AnomalyListResponse> => {
    const response = await api.get(
      "/anomaly/list"
    );

    return response.data;
  };

/* =========================================================
   ADVISOR
========================================================= */

export interface AdvisorRecommendation {
  category: string;
  current_budget: number;
  average_monthly_spending: number;
  target_allocation: number;
  recommended_budget: number;
  difference: number;
  percentage_change: number;
  action: string;
  reason?: string | null;
  transaction_count?: number;
  active_months?: number;
}

export interface AdvisorDataQuality {
  status: string;
  months_available: number;
  days_available: number;
  total_expenses: number;
  message?: string | null;
}

export interface AdvisorFinancialSummary {
  total_spending: number;
  average_monthly_spending: number;
  total_budget: number;
  available_budget: number;
}

export interface AdvisorResponse {
  generated_at: string;
  period_days: number;
  summary: string;
  recommendations: AdvisorRecommendation[];

  forecast?: Record<string, unknown> | null;
  anomalies?: unknown[] | null;

  data_quality?: AdvisorDataQuality | null;

  financial_summary?: AdvisorFinancialSummary | null;

  data_quality_note?: string | null;
}

export const getAdvisorRecommendations =
  async (
    forecastDays: number = 30,
    lookbackDays: number = 200
  ): Promise<AdvisorResponse> => {
    const response = await api.get(
      "/advisor/recommendations",
      {
        params: {
          forecast_days: forecastDays,
          lookback_days: lookbackDays,
        },
      }
    );

    return response.data;
  };

/* =========================================================
   OLLAMA FINANCIAL REVIEW
========================================================= */

export interface LLMReviewResponse {
  success: boolean;
  advice: string;
  source: "ollama" | "rule_based";
  message?: string | null;
}

export const getAdvisorLLMReview =
  async (
    advisorData: AdvisorResponse
  ): Promise<LLMReviewResponse> => {
    const response =
      await api.post<LLMReviewResponse>(
        "/advisor/llm-review",
        advisorData,
        {
          timeout: 90000,
        }
      );

    return response.data;
  };

/* =========================================================
   EXPLAINABILITY / SHAP
========================================================= */

export type SHAPDirection =
  | "increases_prediction"
  | "decreases_prediction"
  | "neutral";

export interface SHAPFeatureContribution {
  feature: string;
  value: number;
  shap_value: number;
  direction: SHAPDirection;
}

export interface SHAPExplanation {
  date: string;
  base_value: number;
  predicted_amount: number;
  feature_contributions: SHAPFeatureContribution[];
}

export interface ExplainabilityFeature {
  feature: string;
  importance: number;
  mean_absolute_shap: number;
  direction?: string;
}

export interface ExplainabilityResponse {
  status: string;
  model: string;
  explainer: string;
  periods: number;
  forecast_horizon: number;
  feature_importance: ExplainabilityFeature[];
  shap_values?: Record<string, unknown>[];
  explanations: SHAPExplanation[];
}

export const getExplainability =
  async (
    periods: number = 30
  ): Promise<ExplainabilityResponse> => {
    const response = await api.get(
      "/explainability/xgboost",
      {
        params: {
          periods,
        },
      }
    );

    return response.data;
  };

/* =========================================================
   USER SETTINGS
========================================================= */

export interface UserSettings {
  monthly_income: number;
  total_monthly_budget: number;
  currency: "INR" | "USD" | "EUR" | "GBP";
  theme: "light" | "dark" | "system";
}

export interface UserSettingsUpdate {
  monthly_income: number;
  total_monthly_budget: number;
  currency: "INR" | "USD" | "EUR" | "GBP";
  theme: "light" | "dark" | "system";
}

export const getUserSettings =
  async (): Promise<UserSettings> => {
    const response = await api.get<UserSettings>(
      "/user-settings/"
    );

    return response.data;
  };

export const updateUserSettings =
  async (
    settings: UserSettingsUpdate
  ): Promise<UserSettings> => {
    const response = await api.put(
      "/user-settings/",
      settings
    );

    return {
      monthly_income: response.data.monthly_income,
      total_monthly_budget:
        response.data.total_monthly_budget,
      currency: response.data.currency,
      theme: response.data.theme,
    };
  };

/* =========================================================
   API ERROR HANDLING
========================================================= */

export const getApiErrorMessage = (
  error: unknown
): string => {
  if (axios.isAxiosError(error)) {
    if (error.response?.data?.detail) {
      return String(
        error.response.data.detail
      );
    }

    if (error.message) {
      return error.message;
    }

    return "An API request failed.";
  }

  if (error instanceof Error) {
    return error.message;
  }

  return "An unexpected error occurred.";
};

/* =========================================================
   EXPORT DATE RANGE
========================================================= */

export interface ExportDateRange {
  startDate?: string;
  endDate?: string;
}

/* =========================================================
   FINANCIAL CSV EXPORT
========================================================= */

export const downloadFinancialCSV = async (
  dateRange: ExportDateRange = {}
): Promise<void> => {
  const response = await api.get(
    "/export/expenses",
    {
      params: {
        start_date: dateRange.startDate || undefined,
        end_date: dateRange.endDate || undefined,
      },
      responseType: "blob",
    }
  );

  const blob = new Blob(
    [response.data],
    {
      type: "text/csv;charset=utf-8;",
    }
  );

  const url =
    window.URL.createObjectURL(blob);

  const link =
    document.createElement("a");

  link.href = url;

  link.download =
    "FinSight_Financial_Data.csv";

  document.body.appendChild(link);

  link.click();

  link.remove();

  window.URL.revokeObjectURL(url);
};

/* =========================================================
   COMPLETE FINANCIAL REPORT
========================================================= */

export const downloadCompleteFinancialReport =
  async (
    dateRange: ExportDateRange = {}
  ): Promise<void> => {
    const response = await api.get(
      "/export/complete-report.pdf",
      {
        params: {
          start_date:
            dateRange.startDate || undefined,
          end_date:
            dateRange.endDate || undefined,
        },
        responseType: "blob",
      }
    );

    const blob = new Blob(
      [response.data],
      {
        type: "application/pdf",
      }
    );

    const url =
      window.URL.createObjectURL(blob);

    const link =
      document.createElement("a");

    link.href = url;

    link.download =
      "FinSight_Complete_Report.pdf";

    document.body.appendChild(link);

    link.click();

    link.remove();

    window.URL.revokeObjectURL(url);
  };

/* =========================================================
   ANOMALY PDF
========================================================= */

export const downloadAnomalyPDF =
  async (
    dateRange: ExportDateRange = {}
  ): Promise<void> => {
    const response = await api.get(
      "/export/anomalies.pdf",
      {
        params: {
          start_date:
            dateRange.startDate || undefined,
          end_date:
            dateRange.endDate || undefined,
        },
        responseType: "blob",
      }
    );

    const blob = new Blob(
      [response.data],
      {
        type: "application/pdf",
      }
    );

    const url =
      window.URL.createObjectURL(blob);

    const link =
      document.createElement("a");

    link.href = url;

    link.download =
      "FinSight_Anomaly_Report.pdf";

    document.body.appendChild(link);

    link.click();

    link.remove();

    window.URL.revokeObjectURL(url);
  };

/* =========================================================
   LEGACY CSV EXPORT
========================================================= */

export const downloadExpensesCSV =
  async (): Promise<void> => {
    await downloadFinancialCSV();
  };

export default api;
