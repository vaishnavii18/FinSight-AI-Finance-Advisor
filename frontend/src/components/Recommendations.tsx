import type { AdvisorRecommendation } from "../services/api";

interface Props {
  recommendations: AdvisorRecommendation[];
}

export default function Recommendations({
  recommendations,
}: Props) {
  if (
    !recommendations ||
    recommendations.length === 0
  ) {
    return (
      <div className="rounded-xl border border-slate-200 bg-white p-6 dark:border-slate-700 dark:bg-slate-900">
        <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
          AI Budget Recommendations
        </h2>

        <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">
          No budget recommendations are available yet.
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-6 dark:border-slate-700 dark:bg-slate-900">
      {/* Header */}
      <div className="mb-5">
        <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
          AI Budget Recommendations
        </h2>

        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
          Recommendations based on your spending
          patterns and current budgets.
        </p>
      </div>

      {/* Recommendations */}
      <div className="space-y-4">
        {recommendations.map(
          (recommendation) => {
            const isIncrease =
              recommendation.action ===
              "Increase";

            const isReduce =
              recommendation.action ===
              "Reduce";
            const isReview =
              recommendation.action === "Review";

            const actionLabel =
              isIncrease
                ? "Increase Budget"
                : isReduce
                  ? "Reduce Budget"
                  : isReview
                    ? "Review Budget"
                    : "Maintain Budget";

            return (
              <div
                key={recommendation.category}
                className="rounded-lg border border-slate-200 p-4 dark:border-slate-700"
              >
                {/* Category + Action */}
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <h3 className="font-medium text-slate-900 dark:text-slate-100">
                      {recommendation.category}
                    </h3>

                    <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                      {actionLabel}
                    </p>
                  </div>

                  <span className="text-sm font-medium text-slate-700 dark:text-slate-300">
                    {recommendation.percentage_change >
                    0
                      ? "+"
                      : ""}
                    {Number(
                      recommendation.percentage_change
                    ).toFixed(1)}
                    %
                  </span>
                </div>

                {/* Financial Details */}
                {recommendation.reason && (
                  <p className="mt-3 text-sm leading-5 text-slate-600 dark:text-slate-300">
                    {recommendation.reason}
                    {recommendation.transaction_count !== undefined && recommendation.active_months !== undefined && (
                      <span className="mt-1 block text-xs text-slate-400 dark:text-slate-400">
                        Based on {recommendation.transaction_count} transactions across {recommendation.active_months} active months.
                      </span>
                    )}
                  </p>
                )}
                <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">

                  {/* Current Budget */}
                  <div>
                    <p className="text-xs text-slate-400 dark:text-slate-400">
                      Current Budget
                    </p>

                    <p className="mt-1 text-sm font-medium text-slate-800 dark:text-slate-200">
                      ₹
                      {Number(recommendation.current_budget).toLocaleString("en-IN")}
                    </p>
                  </div>

                  {/* Average Spending */}
                  <div>
                    <p className="text-xs text-slate-400 dark:text-slate-400">
                      Avg. Spending
                    </p>

                    <p className="mt-1 text-sm font-medium text-slate-800 dark:text-slate-200">
                      ₹
                      {Number(recommendation.average_monthly_spending).toLocaleString("en-IN")}
                    </p>
                  </div>

                  {/* Recommended Budget */}
                  <div>
                    <p className="text-xs text-slate-400 dark:text-slate-400">
                      Recommended
                    </p>

                    <p className="mt-1 text-sm font-medium text-slate-800 dark:text-slate-200">
                      ₹
                      {Number(recommendation.recommended_budget).toLocaleString("en-IN")}
                    </p>
                  </div>

                  {/* Difference */}
                  <div>
                    <p className="text-xs text-slate-400 dark:text-slate-400">
                      Difference
                    </p>

                    <p className="mt-1 text-sm font-medium text-slate-800 dark:text-slate-200">
                      ₹
                      {Math.abs(Number(recommendation.difference)).toLocaleString("en-IN")}
                    </p>
                  </div>
                </div>

              </div>
            );
          }
        )}
      </div>
    </div>
  );
}
