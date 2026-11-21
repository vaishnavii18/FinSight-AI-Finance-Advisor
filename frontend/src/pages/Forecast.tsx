import { useEffect, useState } from "react";
import ForecastChart from "../components/ForecastChart";

import {
  getForecast,
  getExpenses,
  getBudgets,
} from "../services/api";

import type {
  Expense,
  Budget,
  ForecastResponse,
  ForecastModelResult,
} from "../services/api";

type Model = "arima" | "prophet" | "xgboost" | "ensemble";
type ModelKey = "ARIMA" | "Prophet" | "XGBoost" | "Ensemble";

type ForecastTrend =
  | "higher"
  | "lower"
  | "stable"
  | "unavailable";

const modelLabels: Record<Model, string> = {
  arima: "ARIMA",
  prophet: "Prophet",
  xgboost: "XGBoost",
  ensemble: "Ensemble",
};

export default function Forecast() {
  const [forecast, setForecast] = useState<ForecastResponse | null>(null);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [budgets, setBudgets] = useState<Budget[]>([]);

  const [monthsAhead, setMonthsAhead] = useState<number>(3);
  const [model, setModel] = useState<Model>("ensemble");

  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string>("");

  /* --------------------------------
     Load forecast, expenses and budgets
  -------------------------------- */

  const loadForecast = async (
    selectedMonths: number = monthsAhead,
    selectedModel: Model = model
  ) => {
    try {
      setLoading(true);
      setError("");

      const [forecastData, expenseData, budgetData] =
        await Promise.all([
          getForecast(selectedMonths, selectedModel),
          getExpenses(),
          getBudgets(),
        ]);

      setForecast(forecastData);
      setExpenses(expenseData);
      setBudgets(budgetData);
    } catch (err) {
      console.error("Forecast loading error:", err);

      setError(
        err instanceof Error
          ? err.message
          : "Unable to load forecast data."
      );
    } finally {
      setLoading(false);
    }
  };

  /* --------------------------------
     Initial loading
  -------------------------------- */

  useEffect(() => {
    void loadForecast(3, "ensemble");

    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* --------------------------------
     Generate forecast
  -------------------------------- */

  const handleGenerate = async () => {
    await loadForecast(monthsAhead, model);
  };

  /* --------------------------------
     Selected model
  -------------------------------- */

  const selectedForecast: ForecastModelResult | undefined =
    model === "arima"
      ? forecast?.ARIMA
      : model === "prophet"
        ? forecast?.Prophet
        : model === "xgboost"
          ? forecast?.XGBoost
          : forecast?.Ensemble;

  const selectedModelName = modelLabels[model];

  /* --------------------------------
     Model comparison data
  -------------------------------- */

  const modelResults: Array<{
    key: ModelKey;
    name: string;
    result: ForecastModelResult | undefined;
  }> = [
    {
      key: "ARIMA",
      name: "ARIMA",
      result: forecast?.ARIMA,
    },
    {
      key: "Prophet",
      name: "Prophet",
      result: forecast?.Prophet,
    },
    {
      key: "XGBoost",
      name: "XGBoost",
      result: forecast?.XGBoost,
    },
    {
      key: "Ensemble",
      name: "Ensemble",
      result: forecast?.Ensemble,
    },
  ];

  /* --------------------------------
     Find models with valid metrics
  -------------------------------- */

  const modelsWithMetrics = modelResults.filter(
    (
      item
    ): item is {
      key: ModelKey;
      name: string;
      result: ForecastModelResult;
    } => {
      if (!item.result) return false;

      const modelHasError =
        "error" in item.result && Boolean(item.result.error);

      return (
        !modelHasError &&
        Array.isArray(item.result.forecasts) &&
        item.result.forecasts.length > 0 &&
        item.result.mae !== undefined &&
        item.result.mae !== null &&
        Number.isFinite(Number(item.result.mae))
      );
    }
  );

  /* --------------------------------
     Best model based on historical MAE
  -------------------------------- */

  const bestModel =
    modelsWithMetrics.length > 0
      ? modelsWithMetrics.reduce((best, current) =>
          Number(current.result.mae) <
          Number(best.result.mae)
            ? current
            : best
        )
      : undefined;

  /* --------------------------------
     Selected model metrics
  -------------------------------- */

  const selectedMae = selectedForecast?.mae;
  const selectedRmse = selectedForecast?.rmse;

  /* --------------------------------
     Calculate predicted total
  -------------------------------- */

/* --------------------------------
     Calculate predicted total
  -------------------------------- */

  /* --------------------------------
     Calculate predicted total
  -------------------------------- */

  const predictedTotal: number | null =
    Array.isArray(selectedForecast?.forecasts) &&
    selectedForecast.forecasts.length > 0 &&
    !(
      "error" in (selectedForecast ?? {}) &&
      Boolean(selectedForecast?.error)
    )
      ? selectedForecast.forecasts.reduce(
          (sum, point) => {
            const amount = Number(point.predicted_amount);

            return sum + (Number.isFinite(amount) ? amount : 0);
          },
          0
        )
      : null;

  /* --------------------------------
     Currency formatting
  -------------------------------- */

  const formatCurrency = (
    value: number | undefined | null
  ): string => {
    if (
      value === undefined ||
      value === null ||
      !Number.isFinite(Number(value))
    ) {
      return "N/A";
    }

    return `₹${Number(value).toLocaleString("en-IN", {
      maximumFractionDigits: 2,
    })}`;
  };

  /* --------------------------------
     Actual month-to-month spending

     Compare the two most recent completed
     calendar months.
  -------------------------------- */

  const today = new Date();

  const latestCompletedMonth = new Date(
    today.getFullYear(),
    today.getMonth() - 1,
    1
  );

  const previousCompletedMonth = new Date(
    today.getFullYear(),
    today.getMonth() - 2,
    1
  );

  const getMonthKey = (date: Date): string => {
    const year = date.getFullYear();

    const month = String(
      date.getMonth() + 1
    ).padStart(2, "0");

    return `${year}-${month}`;
  };

  const latestMonthKey = getMonthKey(
    latestCompletedMonth
  );

  const previousMonthKey = getMonthKey(
    previousCompletedMonth
  );

  /* --------------------------------
     Monthly spending calculation

     Only expense transactions are included.
  -------------------------------- */

  const getMonthlySpending = (monthKey: string) => {
    const monthExpenses = expenses.filter((expense) => {
      const expenseDate = expense.date;

      return (
        expense.transaction_type === "expense" &&
        typeof expenseDate === "string" &&
        expenseDate.slice(0, 7) === monthKey
      );
    });

    const total = monthExpenses.reduce(
      (sum, expense) => {
        const amount = Number(expense.amount || 0);

        return (
          sum +
          (Number.isFinite(amount) ? amount : 0)
        );
      },
      0
    );

    return {
      total,
      transactionCount: monthExpenses.length,
    };
  };

  const latestMonthData = getMonthlySpending(
    latestMonthKey
  );

  const previousMonthData = getMonthlySpending(
    previousMonthKey
  );

  const latestMonthSpending = latestMonthData.total;

  const previousMonthSpending = previousMonthData.total;

  /* --------------------------------
     Monthly comparison availability
  -------------------------------- */

  const hasMonthlyComparisonData =
    latestMonthData.transactionCount > 0 &&
    previousMonthData.transactionCount > 0;

  const monthlyDifference =
    hasMonthlyComparisonData
      ? latestMonthSpending - previousMonthSpending
      : null;

  const monthlyDifferencePercent =
    hasMonthlyComparisonData &&
    previousMonthSpending > 0
      ? (
          (latestMonthSpending -
            previousMonthSpending) /
          previousMonthSpending
        ) * 100
      : null;

  /* --------------------------------
     Actual spending trend
  -------------------------------- */

  const spendingTrend =
    monthlyDifference === null
      ? "unavailable"
      : monthlyDifference > 0
        ? "increased"
        : monthlyDifference < 0
          ? "decreased"
          : "unchanged";

  /* --------------------------------
     Month labels
  -------------------------------- */

  const latestMonthLabel =
    latestCompletedMonth.toLocaleDateString(
      "en-IN",
      {
        month: "long",
        year: "numeric",
      }
    );

  const previousMonthLabel =
    previousCompletedMonth.toLocaleDateString(
      "en-IN",
      {
        month: "long",
        year: "numeric",
      }
    );

  /* --------------------------------
     Average monthly forecast

     This is an estimate because the backend
     currently generates monthsAhead * 30 days.
  -------------------------------- */

  const averageMonthlyForecast =
    predictedTotal !== null && monthsAhead > 0
      ? predictedTotal / monthsAhead
      : null;

  /* --------------------------------
     Forecast trend

     Compare estimated monthly forecast
     with the latest completed month's spending.
  -------------------------------- */

  const forecastTrend: ForecastTrend =
    predictedTotal === null ||
    latestMonthData.transactionCount === 0
      ? "unavailable"
      : averageMonthlyForecast! >
          latestMonthSpending
        ? "higher"
        : averageMonthlyForecast! <
            latestMonthSpending
          ? "lower"
          : "stable";

  /* --------------------------------
     Budget calculations
  -------------------------------- */

  const monthlyBudget = budgets.reduce(
    (sum, budget) => {
      const amount = Number(
        budget.monthly_limit || 0
      );

      return (
        sum +
        (Number.isFinite(amount) ? amount : 0)
      );
    },
    0
  );

  const periodBudget =
    monthlyBudget * monthsAhead;

  /* --------------------------------
     Budget comparison

     Do not treat failed forecasts as zero.
  -------------------------------- */

  const forecastExceedsBudget =
    predictedTotal !== null &&
    periodBudget > 0 &&
    predictedTotal > periodBudget;

  const budgetUsagePercent =
    predictedTotal !== null &&
    periodBudget > 0
      ? (predictedTotal / periodBudget) * 100
      : null;

  /* --------------------------------
     Budget status
  -------------------------------- */

  const budgetStatus =
    periodBudget <= 0
      ? "No Budget Set"
      : predictedTotal === null
        ? "Unavailable"
        : forecastExceedsBudget
          ? "Over Budget"
          : "Within Budget";

  /* --------------------------------
     Render
  -------------------------------- */

  return (
    <div className="space-y-6">

      {/* Header */}

      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900 dark:text-slate-100">
          Spending Forecast
        </h1>

        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
          Predict your future spending using machine learning models.
        </p>
      </div>

      {/* Controls */}

      <div className="rounded-xl border border-slate-200/80 bg-white p-5 shadow-[0_1px_2px_rgba(0,0,0,0.04)] dark:border-slate-700/80 dark:bg-slate-900">

        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">

          <div>
            <label
              htmlFor="forecast-model"
              className="mb-1.5 block text-sm font-medium text-slate-700 dark:text-slate-300"
            >
              Forecast Model
            </label>

            <select
              id="forecast-model"
              value={model}
              onChange={(e) =>
                setModel(e.target.value as Model)
              }
              className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-700 outline-none transition focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300"
            >
              <option value="arima">ARIMA</option>
              <option value="prophet">Prophet</option>
              <option value="xgboost">XGBoost</option>
              <option value="ensemble">Ensemble</option>
            </select>
          </div>

          <div>
            <label
              htmlFor="forecast-period"
              className="mb-1.5 block text-sm font-medium text-slate-700 dark:text-slate-300"
            >
              Forecast Period
            </label>

            <select
              id="forecast-period"
              value={monthsAhead}
              onChange={(e) =>
                setMonthsAhead(Number(e.target.value))
              }
              className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-700 outline-none transition focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300"
            >
              <option value={1}>1 Month</option>
              <option value={3}>3 Months</option>
              <option value={6}>6 Months</option>
              <option value={12}>12 Months</option>
            </select>
          </div>

          <div className="flex items-end">
            <button
              type="button"
              onClick={handleGenerate}
              disabled={loading}
              className="w-full rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {loading
                ? "Generating..."
                : "Generate Forecast"}
            </button>
          </div>

        </div>
      </div>

      {/* Error */}

      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-300">
          {error}
        </div>
      )}

      {/* Loading / Dashboard */}

      {loading && !forecast ? (
        <div className="rounded-xl border border-slate-200 bg-white p-10 text-center text-sm text-slate-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-400">
          Loading forecast...
        </div>
      ) : (
        <>

          {/* Summary Cards */}

          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">

            {/* Predicted Spending */}

            <div className="rounded-xl border border-slate-200/80 bg-white p-5 shadow-[0_1px_2px_rgba(0,0,0,0.04)] dark:border-slate-700/80 dark:bg-slate-900">

              <p className="text-sm font-medium text-slate-500 dark:text-slate-400">
                Predicted Spending
              </p>

              <p className="mt-2 text-2xl font-semibold tracking-tight text-slate-900 dark:text-slate-100">
                {formatCurrency(predictedTotal)}
              </p>

              <p className="mt-1 text-xs text-slate-400 dark:text-slate-400">
                Next {monthsAhead}{" "}
                {monthsAhead === 1 ? "month" : "months"}
              </p>

            </div>

            {/* MAE */}

            <div className="rounded-xl border border-slate-200/80 bg-white p-5 shadow-[0_1px_2px_rgba(0,0,0,0.04)] dark:border-slate-700/80 dark:bg-slate-900">

              <p className="text-sm font-medium text-slate-500 dark:text-slate-400">
                Mean Absolute Error (MAE)
              </p>

              <p className="mt-2 text-2xl font-semibold tracking-tight text-slate-900 dark:text-slate-100">
                {formatCurrency(selectedMae)}
              </p>

              <p className="mt-1 text-xs text-slate-400 dark:text-slate-400">
                Historical prediction error. Lower is better.
              </p>

            </div>

            {/* RMSE */}

            <div className="rounded-xl border border-slate-200/80 bg-white p-5 shadow-[0_1px_2px_rgba(0,0,0,0.04)] dark:border-slate-700/80 dark:bg-slate-900">

              <p className="text-sm font-medium text-slate-500 dark:text-slate-400">
                Root Mean Squared Error (RMSE)
              </p>

              <p className="mt-2 text-2xl font-semibold tracking-tight text-slate-900 dark:text-slate-100">
                {formatCurrency(selectedRmse)}
              </p>

              <p className="mt-1 text-xs text-slate-400 dark:text-slate-400">
                Historical prediction error. Lower is better.
              </p>

            </div>

          </div>

          {/* Model Comparison */}

          <div className="overflow-hidden rounded-xl border border-slate-200/80 bg-white shadow-[0_1px_2px_rgba(0,0,0,0.04)] dark:border-slate-700/80 dark:bg-slate-900">

            <div className="border-b border-slate-100 px-5 py-4 dark:border-slate-800">

              <h2 className="text-[15px] font-semibold tracking-tight text-slate-900 dark:text-slate-100">
                Model Comparison
              </h2>

              <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                Comparison of forecasting models based on historical test data.
              </p>

            </div>

            <div className="overflow-x-auto">

              <table className="w-full min-w-[600px]">

                <thead>
                  <tr className="border-b border-slate-100 bg-slate-50 dark:border-slate-800 dark:bg-slate-800">

                    <th
                      scope="col"
                      className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400"
                    >
                      Model
                    </th>

                    <th
                      scope="col"
                      className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400"
                    >
                      MAE
                    </th>

                    <th
                      scope="col"
                      className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400"
                    >
                      RMSE
                    </th>

                    <th
                      scope="col"
                      className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400"
                    >
                      Status
                    </th>

                  </tr>
                </thead>

                <tbody>

                  {modelResults.map((item) => {
                    const isBest =
                      bestModel?.key === item.key;

                    return (
                      <tr
                        key={item.key}
                        className={`border-b border-slate-100 last:border-b-0 ${
                          isBest
                            ? "bg-indigo-50/50"
                            : "bg-white"
                        } dark:border-slate-800`}
                      >

                        <td className="px-5 py-4">

                          <div className="flex items-center gap-2">

                            <span
                              className={`text-sm font-semibold ${
                                isBest
                                  ? "text-indigo-700"
                                  : "text-slate-800"
                              }`}
                            >
                              {item.name}
                            </span>

                            {isBest && (
                              <span className="rounded-full bg-indigo-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-indigo-700 dark:bg-indigo-950 dark:text-indigo-300">
                                Best
                              </span>
                            )}

                          </div>

                        </td>

                        <td className="px-5 py-4 text-sm text-slate-600 dark:text-slate-300">
                          {formatCurrency(item.result?.mae)}
                        </td>

                        <td className="px-5 py-4 text-sm text-slate-600 dark:text-slate-300">
                          {formatCurrency(item.result?.rmse)}
                        </td>

                        <td className="px-5 py-4">

                          {isBest ? (
                            <span className="inline-flex rounded-md bg-emerald-50 px-2.5 py-1 text-xs font-medium text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300">
                              Best Model
                            </span>
                          ) : (
                            <span className="text-sm text-slate-400 dark:text-slate-400">
                              —
                            </span>
                          )}

                        </td>

                      </tr>
                    );
                  })}

                </tbody>

              </table>

            </div>

            {/* Recommended Model */}

            {bestModel && (
              <div className="border-t border-slate-100 p-5 dark:border-slate-800">

                <div className="rounded-xl border border-indigo-100 bg-indigo-50/60 p-4 dark:border-indigo-800 dark:bg-indigo-950/60">

                  <div className="flex items-start gap-3">

                    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-indigo-100 text-sm font-bold text-indigo-600 dark:bg-indigo-950">
                      ✓
                    </div>

                    <div className="min-w-0">

                      <p className="text-sm font-semibold text-indigo-700 dark:text-indigo-300">
                        Recommended Model
                      </p>

                      <p className="mt-1 text-sm leading-6 text-slate-600 dark:text-slate-300">

                        <span className="font-semibold text-slate-900 dark:text-slate-100">
                          {bestModel.name}
                        </span>{" "}

                        has the lowest historical MAE among the models with valid evaluation results, at{" "}

                        <span className="font-semibold text-slate-900 dark:text-slate-100">
                          {formatCurrency(
                            Number(bestModel.result.mae)
                          )}
                        </span>.

                      </p>

                      <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">
                        Lower MAE means predictions were closer to actual spending values in the historical test data. This is a holdout evaluation, not a guarantee of future performance.
                      </p>

                    </div>

                  </div>

                </div>

              </div>
            )}

            {!bestModel && (
              <div className="border-t border-slate-100 px-5 py-4 text-sm text-slate-500 dark:border-slate-800 dark:text-slate-400">
                Model comparison is unavailable because valid evaluation metrics have not been generated.
              </div>
            )}

          </div>

          {/* Forecast Chart */}

          <ForecastChart
            forecast={forecast}
            expenses={expenses}
            budgets={budgets}
            selectedModel={model}
          />

          {/* Forecast Insights */}

<div className="rounded-xl border border-slate-200/80 bg-white p-5 shadow-[0_1px_2px_rgba(0,0,0,0.04)] dark:border-slate-700/80 dark:bg-slate-900">

  <div className="mb-5">
    <h2 className="text-[15px] font-semibold tracking-tight text-slate-900 dark:text-slate-100">
      Forecast Insights
    </h2>
    <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
      Key insights based on your spending history, budget, and selected forecast.
    </p>
  </div>

  <div className="grid grid-cols-1 gap-4 md:grid-cols-3">

    {/* Forecast Trend */}
    <div className="rounded-xl border border-slate-100 bg-slate-50/70 p-4 dark:border-slate-800 dark:bg-slate-800/70">
      <p className="text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">
        Forecast Trend
      </p>

      <p
        className={`mt-2 text-xl font-semibold ${
          forecastTrend === "higher"
            ? "text-amber-600"
            : forecastTrend === "lower"
              ? "text-emerald-600"
              : "text-slate-900"
        }`}
      >
        {forecastTrend === "higher"
          ? "Above Last Completed Month"
          : forecastTrend === "lower"
            ? "Below Last Completed Month"
            : forecastTrend === "stable"
              ? "Similar to Last Completed Month"
              : "Limited Recent Data"}
      </p>

      <p className="mt-1 text-xs leading-5 text-slate-500 dark:text-slate-400">
        Estimated average monthly forecast:{" "}
        {formatCurrency(averageMonthlyForecast)}.
      </p>
    </div>

    {/* Monthly Difference */}
    <div className="rounded-xl border border-slate-100 bg-slate-50/70 p-4 dark:border-slate-800 dark:bg-slate-800/70">
      <p className="text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">
        Monthly Difference
      </p>

      <p
        className={`mt-2 text-xl font-semibold ${
          monthlyDifference === null
            ? "text-slate-900"
            : monthlyDifference > 0
              ? "text-red-600"
              : monthlyDifference < 0
                ? "text-emerald-600"
                : "text-slate-900"
        }`}
      >
        {monthlyDifference === null
          ? "N/A"
          : `${
              monthlyDifference > 0
                ? "+"
                : monthlyDifference < 0
                  ? "−"
                  : ""
            }${formatCurrency(Math.abs(monthlyDifference))}`}
      </p>

      <p className="mt-1 text-xs leading-5 text-slate-500 dark:text-slate-400">
        {monthlyDifference === null
          ? `No transactions found in ${latestMonthLabel}. Comparison with ${previousMonthLabel} is not possible yet.`
          : monthlyDifferencePercent === null
            ? `Compared with ${previousMonthLabel}; percentage change is unavailable because previous-month spending was zero.`
            : `${Math.abs(monthlyDifferencePercent).toFixed(1)}% ${
                monthlyDifference > 0
                  ? "increase"
                  : monthlyDifference < 0
                    ? "decrease"
                    : "no change"
              } compared with ${previousMonthLabel}.`}
      </p>

      <p className="mt-2 text-xs text-slate-400 dark:text-slate-400">
        {latestMonthLabel} vs {previousMonthLabel}
      </p>
    </div>

    {/* Budget Outlook */}
    <div className="rounded-xl border border-slate-100 bg-slate-50/70 p-4 dark:border-slate-800 dark:bg-slate-800/70">
      <p className="text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">
        Budget Outlook
      </p>

      <p
        className={`mt-2 text-xl font-semibold ${
          budgetStatus === "Over Budget"
            ? "text-red-600"
            : budgetStatus === "Within Budget"
              ? "text-emerald-600"
              : "text-slate-900"
        }`}
      >
        {budgetStatus}
      </p>

      <p className="mt-1 text-xs leading-5 text-slate-500 dark:text-slate-400">
        {periodBudget > 0
          ? budgetUsagePercent !== null
            ? `${budgetUsagePercent.toFixed(1)}% of your ${monthsAhead}-month budget`
            : "Forecast data is unavailable."
          : "Set a budget to see the forecast outlook."}
      </p>
    </div>

  </div>

  {/* Insight Explanation */}
  <div className="mt-4 rounded-xl border border-indigo-100 bg-indigo-50/60 p-4 dark:border-indigo-800 dark:bg-indigo-950/60">
    <p className="text-sm leading-6 text-slate-600 dark:text-slate-300">
      Based on the{" "}
      <span className="font-semibold text-slate-900 dark:text-slate-100">
        {selectedModelName}
      </span>{" "}
      model, your predicted spending for the next{" "}
      <span className="font-semibold text-slate-900 dark:text-slate-100">
        {monthsAhead} {monthsAhead === 1 ? "month" : "months"}
      </span>{" "}
      is{" "}
      <span className="font-semibold text-slate-900 dark:text-slate-100">
        {formatCurrency(predictedTotal)}
      </span>.

      {monthlyDifference !== null ? (
        <>
          {" "}
          Actual spending in{" "}
          <span className="font-semibold text-slate-900 dark:text-slate-100">
            {latestMonthLabel}
          </span>{" "}
          was{" "}
          <span className="font-semibold text-slate-900 dark:text-slate-100">
            {formatCurrency(latestMonthSpending)}
          </span>
          , compared with{" "}
          <span className="font-semibold text-slate-900 dark:text-slate-100">
            {formatCurrency(previousMonthSpending)}
          </span>{" "}
          in {previousMonthLabel}. Spending{" "}
          <span className="font-semibold text-slate-900 dark:text-slate-100">
            {spendingTrend} by{" "}
            {formatCurrency(Math.abs(monthlyDifference))}
          </span>
          {monthlyDifferencePercent !== null
            ? ` (${Math.abs(monthlyDifferencePercent).toFixed(1)}%).`
            : ". Percentage change is unavailable because previous-month spending was zero."}
        </>
      ) : (
        <>
          {" "}
          No transactions were recorded in {latestMonthLabel}, so a
          month-over-month comparison is not available. The forecast
          still uses your earlier history (Jul–Sep).
        </>
      )}

      {periodBudget > 0 && (
        <>
          {" "}
          For the selected period, your total budget is{" "}
          <span className="font-semibold text-slate-900 dark:text-slate-100">
            {formatCurrency(periodBudget)}
          </span>.
        </>
      )}
    </p>
  </div>

</div>

          {/* Current Forecast */}

          <div className="rounded-xl border border-slate-200/80 bg-white p-5 shadow-[0_1px_2px_rgba(0,0,0,0.04)] dark:border-slate-700/80 dark:bg-slate-900">

            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">

              <div>

                <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                  Current Forecast
                </p>

                <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                  Using {selectedModelName} for the next{" "}
                  {monthsAhead}{" "}
                  {monthsAhead === 1 ? "month" : "months"}.
                </p>

              </div>

              <span className="w-fit rounded-md bg-indigo-50 px-2.5 py-1 text-xs font-medium text-indigo-600 dark:bg-indigo-950">
                {selectedModelName}
              </span>

            </div>

          </div>

        </>
      )}

    </div>
  );
}
