
import {
  TrendingUp,
  Wallet,
  AlertTriangle,
  PiggyBank,
} from "lucide-react";
import { Link } from "react-router-dom";

interface Props {
  totalPredicted: number | null;
  averageMonthlySpending: number | null;
  totalBudget: number;
  anomalyCount: number | null;
  monthlyIncome: number;
  monthlyExpenses: number;
  monthlyNet: number;
  reportingPeriod: string;
}

export default function SummaryCards({
  totalPredicted,
  averageMonthlySpending,
  totalBudget,
  anomalyCount,
  monthlyIncome,
  monthlyExpenses,
  monthlyNet,
  reportingPeriod,
}: Props) {
  const formatCurrency = (value: number | null) =>
    value === null
      ? "N/A"
      : `₹${value.toLocaleString("en-IN", {
          maximumFractionDigits: 0,
        })}`;

  const cards = [
    {
      title: "Predicted Spending",
      subtitle: "Next 30 forecast days",
      value: formatCurrency(totalPredicted),
      icon: TrendingUp,
      iconBg: "bg-indigo-50 dark:bg-indigo-950",
      iconColor: "text-indigo-600",
      valueColor: "text-slate-900 dark:text-slate-100",
    },
    {
      title: "Monthly Income",
      subtitle: reportingPeriod,
      value: formatCurrency(monthlyIncome),
      icon: Wallet,
      iconBg: "bg-emerald-50 dark:bg-emerald-950",
      iconColor: "text-emerald-600",
      valueColor: "text-slate-900 dark:text-slate-100",
    },
    {
      title: "Monthly Expenses",
      subtitle: reportingPeriod,
      value: formatCurrency(monthlyExpenses),
      icon: Wallet,
      iconBg: "bg-rose-50 dark:bg-rose-950",
      iconColor: "text-rose-600",
      valueColor: "text-slate-900 dark:text-slate-100",
    },
    {
      title: "Monthly Net Cash Flow",
      subtitle: `Income minus expenses for ${reportingPeriod}`,
      value: formatCurrency(monthlyNet),
      icon: TrendingUp,
      iconBg: "bg-blue-50 dark:bg-blue-950",
      iconColor: "text-blue-600",
      valueColor: monthlyNet < 0 ? "text-rose-600" : "text-emerald-600",
    },
    {
      title: "Average Monthly Spending",
      subtitle:
        averageMonthlySpending === null
          ? "Insufficient historical data"
          : "Estimated from the last 200 days",
      value: formatCurrency(averageMonthlySpending),
      icon: Wallet,
      iconBg: "bg-blue-50 dark:bg-blue-950",
      iconColor: "text-blue-600",
      valueColor: "text-slate-900 dark:text-slate-100",
    },
    {
      title: "Monthly Budget",
      subtitle:
        totalBudget > 0
          ? "Total configured monthly budget"
          : "No budget configured",
      value: formatCurrency(totalBudget),
      icon: PiggyBank,
      iconBg: "bg-emerald-50 dark:bg-emerald-950",
      iconColor: "text-emerald-600",
      valueColor: "text-emerald-600",
    },
    {
      title: "Detected Anomalies",
      subtitle: "Unusual expense transactions",
      value: anomalyCount === null ? "N/A" : anomalyCount.toLocaleString("en-IN"),
      icon: AlertTriangle,
      iconBg: "bg-amber-50 dark:bg-amber-950",
      iconColor: "text-amber-600",
      valueColor: "text-slate-900 dark:text-slate-100",
    },
  ];

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
      {cards.map((card) => (
        <div
          key={card.title}
          className="rounded-xl border border-slate-200/80 bg-white p-5 shadow-[0_1px_2px_rgba(0,0,0,0.04)] transition-shadow duration-200 hover:shadow-[0_2px_8px_rgba(0,0,0,0.06)] dark:border-slate-700/80 dark:bg-slate-900"
        >
          {card.title === "Detected Anomalies" ? (
            <Link to="/anomalies" aria-label="View detected anomalies" className="block rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500">
              <CardContent card={card} />
            </Link>
          ) : <CardContent card={card} />}
        </div>
      ))}
    </div>
  );
}

function CardContent({ card }: { card: { title: string; subtitle: string; value: string; icon: typeof TrendingUp; iconBg: string; iconColor: string; valueColor: string } }) {
  return (
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-[13px] font-medium tracking-tight text-slate-500 dark:text-slate-400">
                {card.title}
              </p>

              <p
                className={`mt-1.5 text-[22px] font-semibold tracking-tight ${card.valueColor}`}
              >
                {card.value}
              </p>

              <p className="mt-1 text-xs text-slate-400 dark:text-slate-400">
                {card.subtitle}
              </p>
            </div>

            <div
              className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg ${card.iconBg}`}
            >
              <card.icon
                className={`h-[18px] w-[18px] ${card.iconColor}`}
              />
            </div>
          </div>
  );
}
