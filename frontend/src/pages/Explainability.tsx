
import { useEffect, useMemo, useState } from "react";
import {
  AlertCircle,
  ArrowDownRight,
  ArrowUpRight,
  Brain,
  CheckCircle2,
  Info,
  Loader2,
  RefreshCw,
} from "lucide-react";

import {
  getExplainability,
  type ExplainabilityResponse,
  type SHAPExplanation,
  type SHAPFeatureContribution,
} from "../services/api";

const formatNumber = (value: number) =>
  Number(value ?? 0).toLocaleString("en-IN", {
    maximumFractionDigits: 2,
  });

const formatCurrency = (value: number) =>
  `₹${formatNumber(value)}`;

const formatFeatureName = (feature: string) => {
  const names: Record<string, string> = {
    lag1: "Previous-day spending",
    lag7: "Spending 7 days earlier",
    day: "Day of month",
    month: "Month",
    dayofweek: "Day of week",
  };

  return (
    names[feature] ??
    feature
      .replace(/_/g, " ")
      .replace(/\b\w/g, (letter) => letter.toUpperCase())
  );
};

const getDirectionLabel = (
  direction: SHAPFeatureContribution["direction"]
) => {
  if (direction === "increases_prediction") {
    return "Increases prediction";
  }

  if (direction === "decreases_prediction") {
    return "Decreases prediction";
  }

  return "Neutral";
};

function FeatureImportanceCard({
  feature,
  value,
  maximumValue,
}: {
  feature: string;
  value: number;
  maximumValue: number;
}) {
  const percentage =
    maximumValue > 0 ? Math.min((value / maximumValue) * 100, 100) : 0;

  return (
    <div className="rounded-xl border border-slate-200 bg-white dark:bg-slate-900 p-4 dark:border-slate-700">
      <div className="mb-2 flex items-center justify-between gap-3">
        <p className="text-sm font-semibold text-slate-700 dark:text-slate-200 dark:text-slate-300">
          {formatFeatureName(feature)}
        </p>

        <p className="text-sm font-semibold text-slate-900 dark:text-white dark:text-slate-100">
          {formatNumber(value)}
        </p>
      </div>

      <div className="h-2 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
        <div
          className="h-full rounded-full bg-indigo-500 transition-all"
          style={{ width: `${percentage}%` }}
        />
      </div>

      <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">
        Mean absolute SHAP contribution
      </p>
    </div>
  );
}

function ContributionRow({
  contribution,
}: {
  contribution: SHAPFeatureContribution;
}) {
  const isPositive = contribution.direction === "increases_prediction";
  const isNegative = contribution.direction === "decreases_prediction";

  return (
    <div className="rounded-xl border border-slate-200 bg-white dark:bg-slate-900 p-4 dark:border-slate-700">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-slate-800 dark:text-slate-200">
            {formatFeatureName(contribution.feature)}
          </p>

          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
            Input value: {formatNumber(contribution.value)}
          </p>
        </div>

        <div
          className={`flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold ${
            isPositive
              ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300"
              : isNegative
                ? "bg-rose-50 text-rose-700 dark:bg-rose-950 dark:text-rose-300"
                : "bg-slate-100 text-slate-600  dark:text-slate-300"
          } dark:text-emerald-300 dark:text-rose-300 dark:text-slate-300`}
        >
          {isPositive && <ArrowUpRight size={13} />}
          {isNegative && <ArrowDownRight size={13} />}
          {getDirectionLabel(contribution.direction)}
        </div>
      </div>

      <div className="mt-3 flex items-center justify-between">
        <span className="text-xs text-slate-500 dark:text-slate-400">SHAP value</span>

        <span
          className={`text-sm font-bold ${
            contribution.shap_value > 0
              ? "text-emerald-600"
              : contribution.shap_value < 0
                ? "text-rose-600"
                : "text-slate-600"
          }`}
        >
          {contribution.shap_value > 0 ? "+" : ""}
          {formatNumber(contribution.shap_value)}
        </span>
      </div>
    </div>
  );
}

function ExplanationCard({
  explanation,
}: {
  explanation: SHAPExplanation;
}) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white dark:bg-slate-900 p-5 dark:border-slate-700">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-slate-800 dark:text-slate-200">
            {explanation.date}
          </p>

          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
            Base value: {formatNumber(explanation.base_value)}
          </p>
        </div>

        <div className="rounded-lg bg-indigo-50 px-3 py-2 text-right dark:bg-indigo-950">
          <p className="text-[11px] font-medium text-indigo-600 dark:text-indigo-300">
            Predicted amount
          </p>

          <p className="text-sm font-bold text-indigo-700  dark:text-indigo-300">
            {formatCurrency(explanation.predicted_amount)}
          </p>
        </div>
      </div>

      <div className="space-y-3">
        {explanation.feature_contributions.map((contribution) => (
          <ContributionRow
            key={`${explanation.date}-${contribution.feature}`}
            contribution={contribution}
          />
        ))}
      </div>
    </div>
  );
}

export default function Explainability() {
  const [data, setData] = useState<ExplainabilityResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");

  const loadExplainability = async (isRefresh = false) => {
    try {
      if (isRefresh) {
        setRefreshing(true);
      } else {
        setLoading(true);
      }

      setError("");

      const response = await getExplainability(30);
      setData(response);
    } catch (err: any) {
      const message =
        err?.response?.data?.detail ||
        err?.message ||
        "Unable to load SHAP explainability results.";

      setError(message);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    loadExplainability();
  }, []);

  const maximumImportance = useMemo(() => {
    if (!data?.feature_importance?.length) {
      return 0;
    }

    return Math.max(
      ...data.feature_importance.map(
        (item) => Math.abs(item.mean_absolute_shap)
      )
    );
  }, [data]);

  const strongestFeature = useMemo(() => {
    if (!data?.feature_importance?.length) {
      return null;
    }

    return [...data.feature_importance].sort(
      (a, b) => b.mean_absolute_shap - a.mean_absolute_shap
    )[0];
  }, [data]);

  if (loading) {
    return (
      <div className="flex min-h-[400px] items-center justify-center">
        <div className="flex items-center gap-3 text-sm text-slate-500 dark:text-slate-400">
          <Loader2 className="animate-spin" size={20} />
          Loading SHAP explainability results...
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-2xl border border-rose-200 bg-rose-50 p-6 dark:border-rose-800 dark:bg-rose-950">
        <div className="flex items-start gap-3">
          <AlertCircle className="mt-0.5 text-rose-600" size={20} />

          <div>
            <h2 className="font-semibold text-rose-800 dark:text-rose-300">
              Unable to load explainability
            </h2>

            <p className="mt-1 text-sm text-rose-700 dark:text-rose-300">{error}</p>

            <button
              type="button"
              onClick={() => loadExplainability()}
              className="mt-4 rounded-lg bg-rose-600 px-4 py-2 text-sm font-semibold text-white hover:bg-rose-700"
            >
              Try again
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="rounded-xl border border-slate-200 bg-white dark:bg-slate-900 p-6 text-sm text-slate-500 dark:border-slate-700 dark:text-slate-400">
        No explainability data is available.
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <div className="flex flex-col justify-between gap-4 md:flex-row md:items-start">
        <div>
          <div className="mb-2 flex items-center gap-2">
            <Brain className="text-indigo-600" size={24} />

            <span className="text-sm font-semibold text-indigo-600">
              Explainable AI
            </span>
          </div>

          <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white dark:text-slate-100">
            Forecast Explainability
          </h1>

          <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-500  dark:text-slate-300 dark:text-slate-400">
            Understand which input features influence the XGBoost spending
            forecast using SHAP feature contributions.
          </p>
        </div>

        <button
          type="button"
          onClick={() => loadExplainability(true)}
          disabled={refreshing}
          className="inline-flex items-center justify-center gap-2 rounded-lg border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 shadow-sm hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60 dark:text-slate-300"
        >
          <RefreshCw
            size={16}
            className={refreshing ? "animate-spin" : ""}
          />
          Refresh
        </button>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <div className="rounded-xl border border-slate-200 bg-white dark:bg-slate-900 p-5 dark:border-slate-700">
          <p className="text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">
            Model
          </p>

          <p className="mt-2 text-xl font-bold text-slate-900 dark:text-white dark:text-slate-100">
            {data.model}
          </p>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white dark:bg-slate-900 p-5 dark:border-slate-700">
          <p className="text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">
            Explainer
          </p>

          <p className="mt-2 text-xl font-bold text-slate-900 dark:text-slate-100">
            SHAP
          </p>

          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
            TreeExplainer
          </p>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white dark:bg-slate-900 p-5 dark:border-slate-700">
          <p className="text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">
            Forecast horizon
          </p>

          <p className="mt-2 text-xl font-bold text-slate-900 dark:text-slate-100">
            {data.forecast_horizon} days
          </p>
        </div>
      </div>

      <div className="rounded-2xl border border-indigo-100 bg-indigo-50 p-5 dark:border-indigo-800 dark:bg-indigo-950">
        <div className="flex items-start gap-3">
          <Info className="mt-0.5 shrink-0 text-indigo-600" size={20} />

          <div>
            <h2 className="font-semibold text-indigo-900 dark:text-indigo-300">
              Main explanation
            </h2>

            <p className="mt-1 text-sm leading-6 text-indigo-800 dark:text-indigo-300">
              {strongestFeature
                ? `${formatFeatureName(
                    strongestFeature.feature
                  )} has the highest mean absolute SHAP contribution among the evaluated features. This indicates that it has the strongest average influence on the model's predictions in this explanation.`
                : "Feature importance is not available."}
            </p>

            <p className="mt-2 text-xs leading-5 text-indigo-700 dark:text-indigo-300">
              SHAP measures model contribution, not causation. A high SHAP
              value does not prove that a feature directly causes spending to
              increase.
            </p>
          </div>
        </div>
      </div>

      <section className="space-y-4">
        <div>
          <h2 className="text-lg font-bold text-slate-900 dark:text-white dark:text-slate-100">
            Feature importance
          </h2>

          <p className="mt-1 text-sm text-slate-500 dark:text-slate-300 dark:text-slate-400">
            Mean absolute SHAP values across the forecast horizon.
          </p>
        </div>

        {data.feature_importance.length === 0 ? (
          <div className="rounded-xl border border-slate-200 bg-white dark:bg-slate-900 p-5 text-sm text-slate-500 dark:border-slate-700 dark:text-slate-400">
            No feature importance values were returned.
          </div>
        ) : (
          <div className="grid gap-4 md:grid-cols-2">
            {data.feature_importance.map((item) => (
              <FeatureImportanceCard
                key={item.feature}
                feature={item.feature}
                value={item.mean_absolute_shap}
                maximumValue={maximumImportance}
              />
            ))}
          </div>
        )}
      </section>

      <section className="space-y-4">
        <div>
          <h2 className="text-lg font-bold text-slate-900 dark:text-slate-100">
            Daily SHAP explanations
          </h2>

          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            Individual feature contributions for each forecasted date.
          </p>
        </div>

        {data.explanations.length === 0 ? (
          <div className="rounded-xl border border-slate-200 bg-white dark:bg-slate-900 p-5 text-sm text-slate-500 dark:border-slate-700 dark:text-slate-400">
            No individual explanations were returned.
          </div>
        ) : (
          <div className="space-y-5">
            {data.explanations.slice(0, 10).map((explanation) => (
              <ExplanationCard
                key={explanation.date}
                explanation={explanation}
              />
            ))}
          </div>
        )}

        {data.explanations.length > 10 && (
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Showing the first 10 forecast dates out of{" "}
            {data.explanations.length}. The API returned the complete
            explanation data.
          </p>
        )}
      </section>

      <div className="rounded-xl border border-emerald-100 bg-emerald-50 p-5 dark:border-emerald-900 dark:bg-emerald-950 dark:border-emerald-800">
        <div className="flex items-start gap-3">
          <CheckCircle2
            className="mt-0.5 shrink-0 text-emerald-600"
            size={20}
          />

          <div>
            <h2 className="font-semibold text-emerald-900 dark:text-emerald-200 dark:text-emerald-300">
              Explainability status
            </h2>

            <p className="mt-1 text-sm leading-6 text-emerald-800 dark:text-emerald-300">
              The page is displaying the SHAP results returned by the FastAPI
              backend. The explanations are based on the XGBoost forecasting
              model and its selected input features.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
