
import { useEffect, useState } from "react";

import ForecastChart from "../components/ForecastChart";
import RecentExpenses from "../components/RecentExpenses";
import Recommendations from "../components/Recommendations";
import SummaryCards from "../components/SummaryCards";

import {
  getAdvisorRecommendations,
  getAnomalyPreview,
  getBudgets,
  getExpenses,
  getForecast,
} from "../services/api";

import type {
  AdvisorResponse,
  Budget,
  Expense,
  ForecastResponse,
} from "../services/api";

export default function Dashboard() {
  const [advisor, setAdvisor] = useState<AdvisorResponse | null>(null);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [budgets, setBudgets] = useState<Budget[]>([]);
  const [forecast, setForecast] = useState<ForecastResponse | null>(null);
  const [anomalyCount, setAnomalyCount] = useState<number | null>(null);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    const fetchData = async () => {
      try {
        const results = await Promise.allSettled([
          getAdvisorRecommendations(),
          getExpenses(),
          getBudgets(),
          getForecast(1, "ensemble"),
          getAnomalyPreview(),
        ]);
        const failures: string[] = [];
        const [advisorResult, expenseResult, budgetResult, forecastResult, anomalyResult] = results;

        if (advisorResult.status === "fulfilled") setAdvisor(advisorResult.value);
        else failures.push("recommendations");
        if (expenseResult.status === "fulfilled") setExpenses(expenseResult.value);
        else failures.push("transactions");
        if (budgetResult.status === "fulfilled") setBudgets(budgetResult.value);
        else failures.push("budgets");
        if (forecastResult.status === "fulfilled") setForecast(forecastResult.value);
        else failures.push("forecast");
        if (anomalyResult.status === "fulfilled") setAnomalyCount(anomalyResult.value.anomaly_count);
        else failures.push("anomaly detection");

        if (failures.length) {
          setError(`Some dashboard data could not be loaded: ${failures.join(", ")}. Available data is still shown.`);
        }
      } catch (err) {
        console.error("Dashboard loading error:", err);

        setError(
          "Failed to load data. Make sure the backend is running on port 8000."
        );
      } finally {
        setLoading(false);
      }
    };

    void fetchData();
  }, []);

  // Only consider expense transactions.
  const expenseRecords = expenses.filter(
    (expense) => expense.transaction_type === "expense"
  );

  // The API returns 30 daily points for months_ahead=1. Sum those exact
  // points so the card and monthly chart use the same model and horizon.
  const forecasts = forecast?.Ensemble?.forecasts;

  // Calculate total configured monthly budget.
  const totalBudget = budgets.reduce(
    (total, budget) =>
      total + Number(budget.monthly_limit || 0),
    0
  );

  // Calculate average monthly spending over the last 200 days.
  const now = new Date();

  const lookbackDays = 200;

  const today = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate()
  );

  const cutoffDate = new Date(today);
  // Include today and exactly the preceding 199 calendar days (200 dates total).
  cutoffDate.setDate(cutoffDate.getDate() - (lookbackDays - 1));

  // Format local dates as YYYY-MM-DD to compare with API date strings.
  const formatLocalDate = (date: Date) => {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");

    return `${year}-${month}-${day}`;
  };

  const cutoffDateString = formatLocalDate(cutoffDate);
  const todayString = formatLocalDate(today);

  const latestExpenseDate = expenseRecords
    .map((expense) => expense.date)
    .filter((date): date is string => date !== null && date <= todayString)
    .sort()
    .at(-1);
  const expectedForecastStart = latestExpenseDate === todayString
    ? formatLocalDate(new Date(today.getFullYear(), today.getMonth(), today.getDate() + 1))
    : todayString;
  const forecastStartOffset = expectedForecastStart === todayString ? 0 : 1;

  const totalPredicted =
    forecasts &&
      forecasts.length === 30 &&
      forecasts.every((point, index) => {
        const expectedDate = formatLocalDate(new Date(
          today.getFullYear(), today.getMonth(), today.getDate() + forecastStartOffset + index
        ));
        return point.date === expectedDate && Number.isFinite(point.predicted_amount);
      })
      ? forecasts.reduce((total, point) => total + point.predicted_amount, 0)
      : null;

  const validHistoricalExpenses = expenseRecords.filter(
    (expense) => {
      const amount = Number(expense.amount);
      const expenseDate = expense.date;

      return (
        typeof expenseDate === "string" &&
        expenseDate >= cutoffDateString &&
        expenseDate <= todayString &&
        Number.isFinite(amount) &&
        amount > 0
      );
    }
  );

  const historicalTotal = validHistoricalExpenses.reduce(
    (total, expense) => total + Number(expense.amount),
    0
  );

  const averageMonthlySpending =
    validHistoricalExpenses.length > 0
      ? (historicalTotal / lookbackDays) * 30.4375
      : null;

  const recommendations = advisor?.recommendations ?? [];

  const previousMonth = new Date(today.getFullYear(), today.getMonth() - 1, 1);
  const monthKey = `${previousMonth.getFullYear()}-${String(previousMonth.getMonth() + 1).padStart(2, "0")}`;
  const reportingPeriod = previousMonth.toLocaleDateString("en-IN", {
    month: "long",
    year: "numeric",
  });
  const monthlyTotals = expenses.reduce(
    (totals, expense) => {
      if (!expense.date || expense.date.slice(0, 7) !== monthKey) return totals;
      const amount = Number(expense.amount);
      if (!Number.isFinite(amount) || amount < 0) return totals;
      if (expense.transaction_type === "income") totals.income += amount;
      else totals.expenses += amount;
      return totals;
    },
    { income: 0, expenses: 0 }
  );

  return (
    <>
      <div className="mb-8 flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-[26px] font-semibold tracking-tight text-slate-900 dark:text-slate-100">
            Financial Dashboard
          </h1>

          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            Overview of spending, forecasts and recommendations
          </p>
        </div>

        {advisor && (
          <p className="text-xs text-slate-400 dark:text-slate-400">
            Updated{" "}
            {new Date(advisor.generated_at).toLocaleString("en-IN", {
              day: "numeric",
              month: "short",
              hour: "2-digit",
              minute: "2-digit",
            })}
          </p>
        )}
      </div>

      {loading && (
        <div className="rounded-xl border border-slate-200 bg-white py-16 text-center dark:border-slate-700 dark:bg-slate-900">
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Loading financial data...
          </p>
        </div>
      )}

      {!loading && error && (
        <div className="rounded-xl border border-rose-200 bg-rose-50 px-5 py-4 text-sm text-rose-700 dark:border-rose-800 dark:bg-rose-950 dark:text-rose-300">
          {error}
        </div>
      )}

      {!loading && (
        <div className="space-y-7">

          {/* Dashboard Summary Cards */}
          <SummaryCards
            totalPredicted={totalPredicted}
            averageMonthlySpending={averageMonthlySpending}
            totalBudget={totalBudget}
            anomalyCount={anomalyCount}
            monthlyIncome={monthlyTotals.income}
            monthlyExpenses={monthlyTotals.expenses}
            monthlyNet={monthlyTotals.income - monthlyTotals.expenses}
            reportingPeriod={reportingPeriod}
          />

          {/* Forecast Chart */}
          <ForecastChart
            forecast={forecast}
            expenses={expenses}
            budgets={budgets}
            selectedModel="ensemble"
          />

          {/* Recommendations and Recent Expenses */}
          <div className="grid grid-cols-1 gap-7 xl:grid-cols-3">

            <div className="xl:col-span-2">
              <Recommendations recommendations={recommendations} />
            </div>

            <div>
              <RecentExpenses expenses={expenses} />
            </div>

          </div>
        </div>
      )}
    </>
  );
}
