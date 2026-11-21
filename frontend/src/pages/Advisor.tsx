
import { useState } from "react";
import ReactMarkdown from "react-markdown";
import {
  getAdvisorRecommendations,
  getAdvisorLLMReview,
  type AdvisorResponse,
  type AdvisorRecommendation,
  type LLMReviewResponse,
} from "../services/api";

// =========================================================
// STYLING
// =========================================================

const actionStyles: Record<
  string,
  {
    border: string;
    background: string;
    badge: string;
    label: string;
  }
> = {
  Increase: {
    border: "border-blue-200 dark:border-blue-800",
    background: "bg-blue-50 dark:bg-blue-950",
    badge: "bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300",
    label: "Increase Budget",
  },
  Reduce: {
    border: "border-orange-200 dark:border-orange-800",
    background: "bg-orange-50 dark:bg-orange-950",
    badge: "bg-orange-100 text-orange-700 dark:bg-orange-950 dark:text-orange-300",
    label: "Reduce Budget",
  },
  Maintain: {
    border: "border-green-200 dark:border-green-800",
    background: "bg-green-50 dark:bg-green-950",
    badge: "bg-green-100 text-green-700 dark:bg-green-950 dark:text-green-300",
    label: "Maintain Budget",
  },
};

const formatCurrency = (amount: number): string => {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 2,
  }).format(amount);
};

// =========================================================
// RECOMMENDATION CARD
// =========================================================

function RecommendationCard({
  recommendation,
}: {
  recommendation: AdvisorRecommendation;
}) {
  const style =
    actionStyles[recommendation.action] ??
    actionStyles.Maintain;

  return (
    <div
      className={`rounded-xl border ${style.border} bg-white p-5 shadow-sm dark:bg-slate-900`}
    >
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
          {recommendation.category}
        </h3>

        <span
          className={`rounded-full px-3 py-1 text-xs font-semibold ${style.badge}`}
        >
          {style.label}
        </span>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <div className="rounded-lg bg-gray-50 p-3 dark:bg-gray-800">
          <p className="text-xs text-gray-500 dark:text-gray-400">
            Current Budget
          </p>
          <p className="mt-1 text-lg font-semibold text-gray-900 dark:text-gray-100">
            {formatCurrency(recommendation.current_budget)}
          </p>
        </div>

        <div className="rounded-lg bg-gray-50 p-3 dark:bg-gray-800">
          <p className="text-xs text-gray-500 dark:text-gray-400">
            Average Monthly Spending
          </p>
          <p className="mt-1 text-lg font-semibold text-gray-900 dark:text-gray-100">
            {formatCurrency(
              recommendation.average_monthly_spending
            )}
          </p>
        </div>

        <div className="rounded-lg bg-blue-50 p-3 dark:bg-blue-950">
          <p className="text-xs text-blue-600">
            Recommended Budget
          </p>
          <p className="mt-1 text-lg font-semibold text-blue-800 dark:text-blue-300">
            {formatCurrency(
              recommendation.recommended_budget
            )}
          </p>
        </div>
      </div>

      <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-gray-100 pt-4 dark:border-gray-800">
        <div>
          <p className="text-xs text-gray-500 dark:text-gray-400">
            Budget Difference
          </p>

          <p
            className={`mt-1 font-semibold ${recommendation.difference > 0
                ? "text-blue-600"
                : recommendation.difference < 0
                  ? "text-orange-600"
                  : "text-gray-700"
              }`}
          >
            {recommendation.difference > 0 ? "+" : ""}
            {formatCurrency(recommendation.difference)}
          </p>
        </div>

        <div>
          <p className="text-xs text-gray-500 dark:text-gray-400">
            Percentage Change
          </p>

          <p className="mt-1 font-semibold text-gray-800 dark:text-gray-200">
            {recommendation.percentage_change > 0 ? "+" : ""}
            {recommendation.percentage_change.toFixed(2)}%
          </p>
        </div>

        <div>
          <p className="text-xs text-gray-500 dark:text-gray-400">
            Target Allocation
          </p>

          <p className="mt-1 font-semibold text-gray-800 dark:text-gray-200">
            {formatCurrency(
              recommendation.target_allocation
            )}
          </p>
        </div>
      </div>

      <div className={`mt-4 rounded-lg p-3 ${style.background}`}>
        <p className="text-sm text-gray-700 dark:text-gray-300">
          {recommendation.action === "Increase" &&
            `Your average spending in ${recommendation.category} is higher than your current budget. Consider increasing the allocation to better reflect your spending pattern.`}

          {recommendation.action === "Reduce" &&
            `Your average spending in ${recommendation.category} is significantly below your current budget. You may be able to reduce this allocation.`}

          {recommendation.action === "Maintain" &&
            `Your current budget for ${recommendation.category} is reasonably aligned with your historical spending. Maintaining it is suggested.`}
        </p>
      </div>
    </div>
  );
}

// =========================================================
// MAIN ADVISOR PAGE
// =========================================================

export default function Advisor() {
  const [advisorData, setAdvisorData] =
    useState<AdvisorResponse | null>(null);

  const [forecastDays, setForecastDays] = useState(30);
  const [lookbackDays, setLookbackDays] = useState(200);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  // Ollama states
  const [llmReview, setLlmReview] =
    useState<LLMReviewResponse | null>(null);

  const [llmLoading, setLlmLoading] = useState(false);
  const [llmError, setLlmError] = useState("");

  // -------------------------------------------------------
  // LOAD RECOMMENDATIONS AND OLLAMA REVIEW
  // -------------------------------------------------------

  const loadRecommendations = async () => {
    let data: AdvisorResponse | null = null;

    try {
      setLoading(true);
      setError("");
      setLlmError("");
      setLlmReview(null);

      data = await getAdvisorRecommendations(
        forecastDays,
        lookbackDays
      );

      setAdvisorData(data);

    } catch (err) {
      console.error("Advisor request failed:", err);

      setError(
        "Unable to generate recommendations. Please check that the backend is running."
      );

      return;

    } finally {
      setLoading(false);
    }

    if (!data) return;

    // Generate Ollama review after backend analysis
    try {
      setLlmLoading(true);

      const review = await getAdvisorLLMReview(data);

      setLlmReview(review);

    } catch (err) {
      console.error("Ollama review failed:", err);

      setLlmError(
        "AI review is currently unavailable. Your regular budget recommendations are still available."
      );

    } finally {
      setLlmLoading(false);
    }
  };

  // -------------------------------------------------------
  // RECOMMENDATION COUNTS
  // -------------------------------------------------------

  const recommendations =
    advisorData?.recommendations ?? [];

  const increaseCount = recommendations.filter(
    (item) => item.action === "Increase"
  ).length;

  const reduceCount = recommendations.filter(
    (item) => item.action === "Reduce"
  ).length;

  const maintainCount = recommendations.filter(
    (item) => item.action === "Maintain"
  ).length;

  const financialSummary =
    advisorData?.financial_summary;

  // -------------------------------------------------------
  // UI
  // -------------------------------------------------------

  return (
    <div className="min-h-screen bg-gray-50 p-6 md:p-8 dark:bg-gray-800">
      <div className="mx-auto max-w-6xl">

        {/* PAGE HEADER */}

        <div className="mb-8 flex flex-col justify-between gap-5 md:flex-row md:items-center">
          <div>
            <div className="mb-3 flex items-center gap-3">
              <div className="rounded-xl bg-purple-100 p-3 text-2xl dark:bg-purple-950">
                🤖
              </div>

              <div>
                <h1 className="text-3xl font-bold text-gray-900 dark:text-gray-100">
                  AI Financial Advisor
                </h1>

                <p className="mt-1 text-gray-500 dark:text-gray-400">
                  Personalized insights based on your financial data.
                </p>
              </div>
            </div>
          </div>

          <button
            onClick={loadRecommendations}
            disabled={loading || llmLoading}
            className="rounded-xl bg-blue-600 px-6 py-3 font-semibold text-white shadow-sm transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {loading
              ? "Generating Insights..."
              : llmLoading
                ? "Generating AI Review..."
                : "Generate Insights"}
          </button>
        </div>

        {/* ANALYSIS SETTINGS */}

        <div className="mb-6 rounded-xl border border-gray-200 bg-white p-5 shadow-sm dark:border-gray-700 dark:bg-slate-900">
          <h2 className="mb-4 text-lg font-semibold text-gray-900 dark:text-gray-100">
            Analysis Settings
          </h2>

          <div className="grid gap-4 md:grid-cols-2">
            <label className="flex flex-col gap-2 text-sm font-medium text-gray-700 dark:text-gray-300">
              Forecast Period

              <select
                value={forecastDays}
                onChange={(event) =>
                  setForecastDays(Number(event.target.value))
                }
                className="rounded-lg border border-gray-300 px-3 py-2 outline-none focus:border-blue-500 dark:border-gray-700"
              >
                <option value={7}>7 days</option>
                <option value={14}>14 days</option>
                <option value={30}>30 days</option>
                <option value={60}>60 days</option>
                <option value={90}>90 days</option>
              </select>
            </label>

            <label className="flex flex-col gap-2 text-sm font-medium text-gray-700 dark:text-gray-300">
              Historical Lookback Period

              <select
                value={lookbackDays}
                onChange={(event) =>
                  setLookbackDays(Number(event.target.value))
                }
                className="rounded-lg border border-gray-300 px-3 py-2 outline-none focus:border-blue-500 dark:border-gray-700"
              >
                <option value={14}>14 days</option>
                <option value={30}>30 days</option>
                <option value={60}>60 days</option>
                <option value={90}>90 days</option>
                <option value={180}>180 days</option>
                <option value={200}>200 days (Recommended)</option>
              </select>
            </label>
          </div>
        </div>

        {/* ERROR */}

        {error && (
          <div className="mb-6 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-300">
            {error}
          </div>
        )}

        {/* INITIAL STATE */}

        {!advisorData && !loading && !error && (
          <div className="rounded-xl border border-gray-200 bg-white p-10 text-center shadow-sm dark:border-gray-700 dark:bg-slate-900">
            <div className="mb-3 text-4xl">
              💡
            </div>

            <h2 className="mb-2 text-xl font-semibold text-gray-900 dark:text-gray-100">
              Get Your Personalized Financial Insights
            </h2>

            <p className="mx-auto max-w-xl text-sm leading-6 text-gray-500 dark:text-gray-400">
              Generate recommendations using forecasting,
              anomaly detection, and budget analysis.
            </p>

            <button
              onClick={loadRecommendations}
              disabled={loading || llmLoading}
              className="mt-5 rounded-lg bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-60"
            >
              Start Analysis
            </button>
          </div>
        )}

        {/* LOADING */}

        {loading && (
          <div className="rounded-xl border border-gray-200 bg-white p-10 text-center shadow-sm dark:border-gray-700 dark:bg-slate-900">
            <div className="mb-3 text-3xl">
              ⏳
            </div>

            <p className="text-gray-600 dark:text-gray-300">
              Analyzing your expenses and generating recommendations...
            </p>
          </div>
        )}

        {/* RESULTS */}

        {advisorData && !loading && (
          <>

            {/* FINANCIAL SUMMARY */}

            <div className="mb-6 rounded-xl border border-blue-200 bg-blue-50 p-5 dark:border-blue-800 dark:bg-blue-950">
              <h2 className="mb-2 text-lg font-semibold text-blue-900 dark:text-blue-300">
                Financial Summary
              </h2>

              <p className="text-sm leading-6 text-blue-800 dark:text-blue-300">
                {advisorData.summary}
              </p>

              <p className="mt-3 text-xs text-blue-600">
                Historical analysis period: {advisorData.period_days} days
              </p>
            </div>

            {/* FINANCIAL METRICS */}

            {financialSummary && (
              <div className="mb-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">

                <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm dark:border-gray-700 dark:bg-slate-900">
                  <p className="text-sm text-gray-500 dark:text-gray-400">
                    Total Spending
                  </p>

                  <p className="mt-2 text-2xl font-bold text-gray-900 dark:text-gray-100">
                    {formatCurrency(
                      financialSummary.total_spending
                    )}
                  </p>
                </div>

                <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm dark:border-gray-700 dark:bg-slate-900">
                  <p className="text-sm text-gray-500 dark:text-gray-400">
                    Average Monthly Spending
                  </p>

                  <p className="mt-2 text-2xl font-bold text-gray-900 dark:text-gray-100">
                    {formatCurrency(
                      financialSummary.average_monthly_spending
                    )}
                  </p>
                </div>

                <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm dark:border-gray-700 dark:bg-slate-900">
                  <p className="text-sm text-gray-500 dark:text-gray-400">
                    Total Monthly Budget
                  </p>

                  <p className="mt-2 text-2xl font-bold text-blue-600">
                    {formatCurrency(
                      financialSummary.total_budget
                    )}
                  </p>
                </div>

                <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm dark:border-gray-700 dark:bg-slate-900">
                  <p className="text-sm text-gray-500 dark:text-gray-400">
                    Available Budget
                  </p>

                  <p
                    className={`mt-2 text-2xl font-bold ${financialSummary.available_budget < 0
                        ? "text-red-600"
                        : "text-green-600"
                      }`}
                  >
                    {formatCurrency(
                      financialSummary.available_budget
                    )}
                  </p>
                </div>

              </div>
            )}

            {/* DATA QUALITY */}

            {advisorData.data_quality_note && (
              <div className="mb-6 rounded-xl border border-yellow-200 bg-yellow-50 p-4 text-sm text-yellow-800 dark:border-yellow-800 dark:bg-yellow-950 dark:text-yellow-300">
                <span className="font-semibold">
                  Data Quality Notice:{" "}
                </span>

                {advisorData.data_quality_note}
              </div>
            )}

            {/* OLLAMA AI FINANCIAL REVIEW */}

            <div className="mb-8 rounded-xl border border-purple-200 bg-white p-6 shadow-sm dark:border-purple-800 dark:bg-slate-900">

              <div className="mb-4 flex items-center gap-3">
                <div className="rounded-lg bg-purple-100 p-3 text-2xl dark:bg-purple-950">
                  🤖
                </div>

                <div>
                  <h2 className="text-xl font-bold text-gray-900 dark:text-gray-100">
                    AI Financial Review
                  </h2>

                  <p className="text-sm text-gray-500 dark:text-gray-400">
                    Qualitative financial insights generated using Ollama.
                  </p>
                </div>
              </div>

              {llmLoading && (
                <div className="rounded-lg bg-purple-50 p-5 text-sm text-purple-700 dark:bg-purple-950 dark:text-purple-300">
                  <p className="font-semibold">
                    Generating AI financial review...
                  </p>

                  <p className="mt-1">
                    Ollama is analyzing your financial results. This may take a little time.
                  </p>
                </div>
              )}

              {llmError && (
                <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-300">
                  {llmError}
                </div>
              )}

              {llmReview && (
                <div className="space-y-4">

                  <div className="flex flex-wrap items-center gap-2">
                    <span
                      className={`rounded-full px-3 py-1 text-xs font-semibold ${llmReview.success
                          ? "bg-green-100 text-green-700"
                          : "bg-yellow-100 text-yellow-700"
                        }`}
                    >
                      {llmReview.success
                        ? "Review Generated"
                        : "Fallback Review"}
                    </span>

                    <span className="rounded-full bg-purple-100 px-3 py-1 text-xs font-semibold text-purple-700 dark:bg-purple-950 dark:text-purple-300">
                      {llmReview.source === "ollama"
                        ? "Powered by Ollama"
                        : "Rule-Based Review"}
                    </span>
                  </div>

                  <div className="rounded-lg bg-gray-50 p-5 dark:bg-gray-800">
  <div className="break-words text-sm leading-7 text-gray-700 dark:text-gray-300">

    <ReactMarkdown
      components={{
        h1: ({ children }) => (
          <h1 className="mb-3 mt-4 text-xl font-bold text-gray-900 dark:text-gray-100">
            {children}
          </h1>
        ),

        h2: ({ children }) => (
          <h2 className="mb-3 mt-5 text-lg font-bold text-gray-900 dark:text-gray-100">
            {children}
          </h2>
        ),

        h3: ({ children }) => (
          <h3 className="mb-2 mt-4 text-base font-semibold text-gray-900 dark:text-gray-100">
            {children}
          </h3>
        ),

        p: ({ children }) => (
          <p className="mb-3 leading-7">
            {children}
          </p>
        ),

        ul: ({ children }) => (
          <ul className="mb-4 list-disc space-y-2 pl-6">
            {children}
          </ul>
        ),

        ol: ({ children }) => (
          <ol className="mb-4 list-decimal space-y-2 pl-6">
            {children}
          </ol>
        ),

        li: ({ children }) => (
          <li className="pl-1">
            {children}
          </li>
        ),

        strong: ({ children }) => (
          <strong className="font-semibold text-gray-900 dark:text-gray-100">
            {children}
          </strong>
        ),
      }}
    >
      {llmReview.advice
        .replace(/\\#/g, "#")
        .replace(/\\n/g, "\n")}
    </ReactMarkdown>

  </div>
</div>

                  {llmReview.message && (
                    <p className="text-xs text-gray-500 dark:text-gray-400">
                      {llmReview.message}
                    </p>
                  )}

                </div>
              )}

              {!llmReview && !llmLoading && !llmError && (
                <p className="text-sm text-gray-500 dark:text-gray-400">
                  Generate insights to receive your AI financial review.
                </p>
              )}

            </div>

            {/* RECOMMENDATION COUNTS */}

            <div className="mb-8 grid gap-4 sm:grid-cols-3">

              <div className="rounded-xl border border-blue-100 bg-white p-5 shadow-sm dark:border-blue-800 dark:bg-slate-900">
                <p className="text-sm text-gray-500 dark:text-gray-400">
                  Increase Budget
                </p>

                <p className="mt-2 text-3xl font-bold text-blue-600">
                  {increaseCount}
                </p>
              </div>

              <div className="rounded-xl border border-orange-100 bg-white p-5 shadow-sm dark:border-orange-800 dark:bg-slate-900">
                <p className="text-sm text-gray-500 dark:text-gray-400">
                  Reduce Budget
                </p>

                <p className="mt-2 text-3xl font-bold text-orange-600">
                  {reduceCount}
                </p>
              </div>

              <div className="rounded-xl border border-green-100 bg-white p-5 shadow-sm dark:border-green-800 dark:bg-slate-900">
                <p className="text-sm text-gray-500 dark:text-gray-400">
                  Maintain Budget
                </p>

                <p className="mt-2 text-3xl font-bold text-green-600">
                  {maintainCount}
                </p>
              </div>

            </div>

            {/* RECOMMENDATIONS */}

            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-2xl font-bold text-gray-900 dark:text-gray-100">
                Budget Recommendations
              </h2>

              <span className="text-sm text-gray-500 dark:text-gray-400">
                {recommendations.length} recommendations
              </span>
            </div>

            {recommendations.length === 0 ? (
              <div className="rounded-xl border border-gray-200 bg-white p-8 text-center text-gray-500 dark:border-gray-700 dark:bg-slate-900 dark:text-gray-400">
                No budget recommendations are available.
                Create category-wise budgets to receive personalized
                budget allocation suggestions.
              </div>
            ) : (
              <div className="space-y-4">
                {recommendations.map((recommendation, index) => (
                  <RecommendationCard
                    key={`${recommendation.category}-${index}`}
                    recommendation={recommendation}
                  />
                ))}
              </div>
            )}

            {/* FOOTER */}

            <p className="mt-8 text-center text-xs leading-5 text-gray-400 dark:text-gray-400">
              Recommendations are calculated from your historical
              expenses and configured budgets. Review them before
              making financial decisions.
            </p>

          </>
        )}

      </div>
    </div>
  );
}
