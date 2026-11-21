import { useEffect, useState } from "react";
import {
  getBudgets,
  createBudget,
  updateBudget,
  deleteBudget,
  optimizeBudget,
} from "../services/api";
import type { Budget } from "../types";
import type {
  BudgetOptimizationResponse,
} from "../services/api";
import {
  Wallet,
  PiggyBank,
  Calculator,
  TrendingDown,
  TrendingUp,
  Minus,
  AlertCircle,
  ShieldCheck,
  Info,
  Plus,
  Pencil,
  Trash2,
  RefreshCw,
  X,
} from "lucide-react";

export default function Budget() {
  const [budgets, setBudgets] = useState<Budget[]>([]);

  const [totalBudget, setTotalBudget] = useState("");
  const [savingsGoal, setSavingsGoal] = useState("");

  const [result, setResult] =
    useState<BudgetOptimizationResponse | null>(null);

  const [loading, setLoading] = useState(true);
  const [optimizing, setOptimizing] = useState(false);
  const [savingBudget, setSavingBudget] = useState(false);
  const [deletingBudgetId, setDeletingBudgetId] =
    useState<number | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const [error, setError] = useState("");

  // ==========================================================
  // ADD / EDIT BUDGET FORM
  // ==========================================================

  const [showBudgetForm, setShowBudgetForm] =
    useState(false);

  const [editingBudgetId, setEditingBudgetId] =
    useState<number | null>(null);

  const [budgetCategory, setBudgetCategory] =
    useState("");

  const [budgetAmount, setBudgetAmount] =
    useState("");

  // ==========================================================
  // FORMAT CURRENCY
  // ==========================================================

  const formatCurrency = (value: number) => {
    return `₹${Number(value || 0).toLocaleString("en-IN", {
      maximumFractionDigits: 0,
    })}`;
  };

  // ==========================================================
  // LOAD BUDGETS
  // ==========================================================

  const loadBudgets = async (
    showRefreshLoader = false
  ) => {
    try {
      if (showRefreshLoader) {
        setRefreshing(true);
      }

      const data = await getBudgets();

      setBudgets(data);

      // Calculate current total category budgets.
      const currentTotal = data.reduce(
        (sum, budget) =>
          sum + Number(budget.monthly_limit || 0),
        0
      );

      if (currentTotal > 0) {
        setTotalBudget(String(currentTotal));
      } else {
        setTotalBudget("");
      }
    } catch (err: any) {
      console.error(err);

      const backendMessage =
        err?.response?.data?.detail;

      setError(
        backendMessage ||
          "Failed to load budgets. Make sure the backend is running."
      );
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  // ==========================================================
  // INITIAL LOAD
  // ==========================================================

  useEffect(() => {
    loadBudgets();
  }, []);

  // ==========================================================
  // OPEN ADD FORM
  // ==========================================================

  const handleAddBudget = () => {
    setEditingBudgetId(null);
    setBudgetCategory("");
    setBudgetAmount("");
    setError("");
    setShowBudgetForm(true);
  };

  // ==========================================================
  // OPEN EDIT FORM
  // ==========================================================

  const handleEditBudget = (budget: Budget) => {
    setEditingBudgetId(budget.id);
    setBudgetCategory(budget.category);
    setBudgetAmount(
      String(budget.monthly_limit)
    );
    setError("");
    setShowBudgetForm(true);
  };

  // ==========================================================
  // CLOSE BUDGET FORM
  // ==========================================================

  const handleCloseBudgetForm = () => {
    if (savingBudget) {
      return;
    }

    setShowBudgetForm(false);
    setEditingBudgetId(null);
    setBudgetCategory("");
    setBudgetAmount("");
  };

  // ==========================================================
  // SAVE BUDGET
  // ==========================================================

  const handleSaveBudget = async () => {
    setError("");

    const category = budgetCategory.trim();
    const amount = Number(budgetAmount);

    if (!category) {
      setError("Please enter a budget category.");
      return;
    }

    if (
      !budgetAmount ||
      !Number.isFinite(amount) ||
      amount <= 0
    ) {
      setError(
        "Please enter a valid monthly budget amount."
      );
      return;
    }

    try {
      setSavingBudget(true);

      if (editingBudgetId !== null) {
        await updateBudget(editingBudgetId, {
          category,
          monthly_limit: amount,
        });
      } else {
        await createBudget({
          category,
          monthly_limit: amount,
        });
      }

      setShowBudgetForm(false);
      setEditingBudgetId(null);
      setBudgetCategory("");
      setBudgetAmount("");
      setResult(null);

      await loadBudgets();
    } catch (err: any) {
      console.error(err);

      const backendMessage =
        err?.response?.data?.detail;

      setError(
        backendMessage ||
          (editingBudgetId !== null
            ? "Failed to update budget. Please try again."
            : "Failed to create budget. Please try again.")
      );
    } finally {
      setSavingBudget(false);
    }
  };

  // ==========================================================
  // DELETE BUDGET
  // ==========================================================

  const handleDeleteBudget = async (
    budget: Budget
  ) => {
    const confirmed = window.confirm(
      `Delete the "${budget.category}" budget?`
    );

    if (!confirmed) {
      return;
    }

    try {
      setError("");
      setDeletingBudgetId(budget.id);

      await deleteBudget(budget.id);

      setResult(null);

      await loadBudgets();
    } catch (err: any) {
      console.error(err);

      const backendMessage =
        err?.response?.data?.detail;

      setError(
        backendMessage ||
          "Failed to delete budget. Please try again."
      );
    } finally {
      setDeletingBudgetId(null);
    }
  };

  // ==========================================================
  // OPTIMIZE BUDGET
  // ==========================================================

  const handleOptimize = async () => {
    setError("");
    setResult(null);

    const budgetValue = Number(totalBudget);
    const savingsValue = Number(
      savingsGoal || 0
    );

    // Validate monthly budget.
    if (
      !totalBudget ||
      !Number.isFinite(budgetValue) ||
      budgetValue <= 0
    ) {
      setError(
        "Please enter a valid monthly budget."
      );
      return;
    }

    // Validate savings goal.
    if (
      !Number.isFinite(savingsValue) ||
      savingsValue < 0
    ) {
      setError(
        "Savings goal cannot be negative."
      );
      return;
    }

    // Savings must be less than total budget.
    if (savingsValue >= budgetValue) {
      setError(
        "Savings goal must be less than the monthly budget."
      );
      return;
    }

    try {
      setOptimizing(true);

      const data = await optimizeBudget({
        total_budget: budgetValue,
        savings_goal: savingsValue,
      });

      setResult(data);
    } catch (err: any) {
      console.error(err);

      const backendMessage =
        err?.response?.data?.detail;

      setError(
        backendMessage ||
          "Budget optimization failed. Please try again."
      );
    } finally {
      setOptimizing(false);
    }
  };

  // ==========================================================
  // ACTION BADGE
  // ==========================================================

  const ActionBadge = ({
    action,
  }: {
    action:
      | "Reduce"
      | "Maintain"
      | "Increase";
  }) => {
    if (action === "Reduce") {
      return (
        <span className="inline-flex items-center gap-1 rounded-md bg-amber-50 px-2.5 py-1 text-xs font-medium text-amber-700 ring-1 ring-inset ring-amber-600/10 dark:bg-amber-950 dark:text-amber-300">
          <TrendingDown className="h-3.5 w-3.5" />
          Reduce
        </span>
      );
    }

    if (action === "Increase") {
      return (
        <span className="inline-flex items-center gap-1 rounded-md bg-emerald-50 px-2.5 py-1 text-xs font-medium text-emerald-700 ring-1 ring-inset ring-emerald-600/10 dark:bg-emerald-950 dark:text-emerald-300">
          <TrendingUp className="h-3.5 w-3.5" />
          Increase
        </span>
      );
    }

    return (
      <span className="inline-flex items-center gap-1 rounded-md bg-slate-50 px-2.5 py-1 text-xs font-medium text-slate-600 ring-1 ring-inset ring-slate-500/10 dark:bg-slate-800 dark:text-slate-300">
        <Minus className="h-3.5 w-3.5" />
        Maintain
      </span>
    );
  };

  // ==========================================================
  // LOADING STATE
  // ==========================================================

  if (loading) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-[26px] font-semibold tracking-tight text-slate-900 dark:text-slate-100">
            Budget Optimization
          </h1>

          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            Optimize your monthly budget using
            your spending history
          </p>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white py-16 text-center dark:border-slate-700 dark:bg-slate-900">
          <div className="flex items-center justify-center gap-2 text-sm text-slate-500 dark:text-slate-400">
            <RefreshCw className="h-4 w-4 animate-spin" />
            Loading budgets…
          </div>
        </div>
      </div>
    );
  }

  // ==========================================================
  // PAGE
  // ==========================================================

  return (
    <div className="space-y-6">

      {/* ======================================================
          HEADER
      ====================================================== */}

      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-[26px] font-semibold tracking-tight text-slate-900 dark:text-slate-100">
            Budget Optimization
          </h1>

          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            Set your monthly budget and savings goal
            to generate personalized category
            allocations
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => loadBudgets(true)}
            disabled={refreshing}
            className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-4 py-2.5 text-sm font-medium text-slate-700 shadow-sm transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800"
          >
            <RefreshCw
              className={`h-4 w-4 ${
                refreshing
                  ? "animate-spin"
                  : ""
              }`}
            />

            Refresh
          </button>

          <button
            type="button"
            onClick={handleAddBudget}
            className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-medium text-white shadow-sm transition hover:bg-indigo-700"
          >
            <Plus className="h-4 w-4" />
            Add Budget
          </button>
        </div>
      </div>

      {/* ======================================================
          ERROR MESSAGE
      ====================================================== */}

      {error && (
        <div className="flex items-start gap-3 rounded-xl border border-rose-200 bg-rose-50 px-5 py-4 text-sm text-rose-700 dark:border-rose-800 dark:bg-rose-950 dark:text-rose-300">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />

          <span>{error}</span>

          <button
            type="button"
            onClick={() => setError("")}
            className="ml-auto shrink-0 text-rose-500 transition hover:text-rose-700 dark:hover:text-rose-300"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      {/* ======================================================
          BUDGET MANAGEMENT
      ====================================================== */}

      <div className="rounded-xl border border-slate-200/80 bg-white shadow-[0_1px_2px_rgba(0,0,0,0.04)] dark:border-slate-700/80 dark:bg-slate-900">

        <div className="flex flex-col gap-4 border-b border-slate-100 px-6 py-5 sm:flex-row sm:items-center sm:justify-between dark:border-slate-800">
          <div>
            <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">
              Category Budgets
            </h2>

            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
              Create and manage your monthly spending
              limits by category.
            </p>
          </div>

          <div className="rounded-lg bg-slate-50 px-3 py-2 dark:bg-slate-800">
            <p className="text-[11px] font-medium uppercase tracking-wide text-slate-400 dark:text-slate-400">
              Current Total
            </p>

            <p className="mt-0.5 text-sm font-semibold text-slate-900 dark:text-slate-100">
              {formatCurrency(
                budgets.reduce(
                  (sum, budget) =>
                    sum +
                    Number(
                      budget.monthly_limit || 0
                    ),
                  0
                )
              )}
            </p>
          </div>
        </div>

        {budgets.length === 0 ? (
          <div className="px-6 py-12 text-center">
            <Wallet className="mx-auto h-10 w-10 text-slate-300" />

            <h3 className="mt-3 text-sm font-semibold text-slate-800 dark:text-slate-200">
              No category budgets yet
            </h3>

            <p className="mx-auto mt-1 max-w-sm text-xs leading-5 text-slate-500 dark:text-slate-400">
              Add your first category budget to start
              managing your monthly spending.
            </p>

            <button
              type="button"
              onClick={handleAddBudget}
              className="mt-5 inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-indigo-700"
            >
              <Plus className="h-4 w-4" />
              Add Your First Budget
            </button>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead>
                <tr className="border-b border-slate-100 text-[11px] font-medium uppercase tracking-wider text-slate-400 dark:border-slate-800 dark:text-slate-400">
                  <th className="px-6 py-3">
                    Category
                  </th>

                  <th className="px-6 py-3 text-right">
                    Monthly Limit
                  </th>

                  <th className="px-6 py-3 text-right">
                    Actions
                  </th>
                </tr>
              </thead>

              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {budgets.map((budget) => (
                  <tr
                    key={budget.id}
                    className="transition-colors hover:bg-slate-50/70 dark:hover:bg-slate-800/70"
                  >
                    <td className="px-6 py-4">
                      <span className="inline-flex items-center rounded-md bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-700 dark:bg-slate-800 dark:text-slate-300">
                        {budget.category}
                      </span>
                    </td>

                    <td className="whitespace-nowrap px-6 py-4 text-right text-sm font-semibold text-slate-900 dark:text-slate-100">
                      {formatCurrency(
                        Number(
                          budget.monthly_limit
                        )
                      )}
                    </td>

                    <td className="whitespace-nowrap px-6 py-4 text-right">
                      <div className="flex justify-end gap-2">
                        <button
                          type="button"
                          onClick={() =>
                            handleEditBudget(
                              budget
                            )
                          }
                          disabled={
                            deletingBudgetId ===
                            budget.id
                          }
                          className="inline-flex items-center gap-1.5 rounded-md border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800"
                        >
                          <Pencil className="h-3.5 w-3.5" />
                          Edit
                        </button>

                        <button
                          type="button"
                          onClick={() =>
                            handleDeleteBudget(
                              budget
                            )
                          }
                          disabled={
                            deletingBudgetId ===
                            budget.id
                          }
                          className="inline-flex items-center gap-1.5 rounded-md border border-rose-200 bg-white px-3 py-1.5 text-xs font-medium text-rose-600 transition hover:bg-rose-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-rose-800 dark:bg-slate-900 dark:hover:bg-rose-950"
                        >
                          {deletingBudgetId ===
                          budget.id ? (
                            <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                          ) : (
                            <Trash2 className="h-3.5 w-3.5" />
                          )}

                          Delete
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ======================================================
          ADD / EDIT BUDGET MODAL
      ====================================================== */}

      {showBudgetForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 px-4 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-xl border border-slate-200 bg-white shadow-xl dark:border-slate-700 dark:bg-slate-900">

            <div className="flex items-center justify-between border-b border-slate-100 px-6 py-5 dark:border-slate-800">
              <div>
                <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">
                  {editingBudgetId !== null
                    ? "Edit Budget"
                    : "Add Budget"}
                </h2>

                <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                  Set a monthly spending limit for
                  a category.
                </p>
              </div>

              <button
                type="button"
                onClick={handleCloseBudgetForm}
                disabled={savingBudget}
                className="rounded-md p-1.5 text-slate-400 transition hover:bg-slate-100 hover:text-slate-600 disabled:cursor-not-allowed disabled:opacity-50 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-300"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="space-y-5 px-6 py-6">

              {/* CATEGORY */}

              <div>
                <label className="mb-2 block text-sm font-medium text-slate-700 dark:text-slate-300">
                  Category
                </label>

                <input
                  type="text"
                  value={budgetCategory}
                  onChange={(e) =>
                    setBudgetCategory(
                      e.target.value
                    )
                  }
                  placeholder="e.g. Food"
                  disabled={savingBudget}
                  className="w-full rounded-lg border border-slate-200 bg-white px-3.5 py-2.5 text-sm text-slate-800 placeholder:text-slate-400 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 disabled:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:placeholder:text-slate-400 dark:disabled:bg-slate-800"
                />
              </div>

              {/* MONTHLY LIMIT */}

              <div>
                <label className="mb-2 block text-sm font-medium text-slate-700 dark:text-slate-300">
                  Monthly Limit
                </label>

                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-slate-500 dark:text-slate-400">
                    ₹
                  </span>

                  <input
                    type="number"
                    min="1"
                    step="100"
                    value={budgetAmount}
                    onChange={(e) =>
                      setBudgetAmount(
                        e.target.value
                      )
                    }
                    placeholder="e.g. 5000"
                    disabled={savingBudget}
                    className="w-full rounded-lg border border-slate-200 bg-white py-2.5 pl-8 pr-4 text-sm text-slate-800 placeholder:text-slate-400 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 disabled:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:placeholder:text-slate-400 dark:disabled:bg-slate-800"
                  />
                </div>
              </div>
            </div>

            <div className="flex justify-end gap-3 border-t border-slate-100 px-6 py-4 dark:border-slate-800">
              <button
                type="button"
                onClick={handleCloseBudgetForm}
                disabled={savingBudget}
                className="rounded-lg border border-slate-200 bg-white px-4 py-2.5 text-sm font-medium text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800"
              >
                Cancel
              </button>

              <button
                type="button"
                onClick={handleSaveBudget}
                disabled={savingBudget}
                className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {savingBudget && (
                  <RefreshCw className="h-4 w-4 animate-spin" />
                )}

                {savingBudget
                  ? "Saving…"
                  : editingBudgetId !== null
                  ? "Update Budget"
                  : "Add Budget"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ======================================================
          OPTIMIZATION SETTINGS
      ====================================================== */}

      <div className="rounded-xl border border-slate-200/80 bg-white p-6 shadow-[0_1px_2px_rgba(0,0,0,0.04)] dark:border-slate-700/80 dark:bg-slate-900">

        <div className="mb-6 flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-indigo-50 dark:bg-indigo-950">
            <Calculator className="h-5 w-5 text-indigo-600" />
          </div>

          <div>
            <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">
              Monthly Budget Settings
            </h2>

            <p className="text-xs text-slate-500 dark:text-slate-400">
              Enter the amount you want to manage each
              month
            </p>
          </div>
        </div>

        <div className="grid gap-5 md:grid-cols-2">

          {/* MONTHLY BUDGET */}

          <div>
            <label className="mb-2 block text-sm font-medium text-slate-700 dark:text-slate-300">
              Monthly Budget
            </label>

            <div className="relative">
              <Wallet className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400 dark:text-slate-400" />

              <span className="absolute left-9 top-1/2 -translate-y-1/2 text-sm text-slate-500 dark:text-slate-400">
                ₹
              </span>

              <input
                type="number"
                min="1"
                step="100"
                value={totalBudget}
                onChange={(e) => {
                  setTotalBudget(
                    e.target.value
                  );
                  setResult(null);
                  setError("");
                }}
                placeholder="e.g. 30000"
                className="w-full rounded-lg border border-slate-200 bg-white py-2.5 pl-14 pr-4 text-sm text-slate-800 placeholder:text-slate-400 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:placeholder:text-slate-400"
              />
            </div>

            <p className="mt-1.5 text-xs text-slate-400 dark:text-slate-400">
              Your total monthly spending budget
            </p>
          </div>

          {/* SAVINGS GOAL */}

          <div>
            <label className="mb-2 block text-sm font-medium text-slate-700 dark:text-slate-300">
              Monthly Savings Goal
            </label>

            <div className="relative">
              <PiggyBank className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400 dark:text-slate-400" />

              <span className="absolute left-9 top-1/2 -translate-y-1/2 text-sm text-slate-500 dark:text-slate-400">
                ₹
              </span>

              <input
                type="number"
                min="0"
                step="100"
                value={savingsGoal}
                onChange={(e) => {
                  setSavingsGoal(
                    e.target.value
                  );
                  setResult(null);
                  setError("");
                }}
                placeholder="e.g. 5000"
                className="w-full rounded-lg border border-slate-200 bg-white py-2.5 pl-14 pr-4 text-sm text-slate-800 placeholder:text-slate-400 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:placeholder:text-slate-400"
              />
            </div>

            <p className="mt-1.5 text-xs text-slate-400 dark:text-slate-400">
              Amount reserved for savings before
              spending
            </p>
          </div>
        </div>

        {/* CALCULATION PREVIEW */}

        {totalBudget &&
          Number(totalBudget) > 0 &&
          savingsGoal !== "" &&
          Number(savingsGoal) >= 0 &&
          Number(savingsGoal) <
            Number(totalBudget) && (
            <div className="mt-5 rounded-lg border border-indigo-100 bg-indigo-50/60 px-4 py-3 dark:border-indigo-800 dark:bg-indigo-950/60">
              <div className="flex flex-col gap-1 text-xs sm:flex-row sm:items-center sm:justify-between">
                <span className="font-medium text-indigo-800 dark:text-indigo-300">
                  Estimated available spending
                </span>

                <span className="font-semibold text-indigo-900 dark:text-indigo-300">
                  {formatCurrency(
                    Number(totalBudget) -
                      Number(savingsGoal)
                  )}
                </span>
              </div>

              <p className="mt-1 text-xs leading-5 text-indigo-700 dark:text-indigo-300">
                This amount is calculated by
                subtracting your savings goal from
                your monthly budget.
              </p>
            </div>
          )}

        {/* OPTIMIZE BUTTON */}

        <div className="mt-6 flex justify-end">
          <button
            type="button"
            onClick={handleOptimize}
            disabled={optimizing}
            className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-5 py-2.5 text-sm font-medium text-white shadow-sm transition hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {optimizing ? (
              <RefreshCw className="h-4 w-4 animate-spin" />
            ) : (
              <Calculator className="h-4 w-4" />
            )}

            {optimizing
              ? "Optimizing…"
              : "Optimize Budget"}
          </button>
        </div>
      </div>

      {/* ======================================================
          OPTIMIZATION RESULTS
      ====================================================== */}

      {result && (
        <>
          {/* SUMMARY CARDS */}

          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">

            <div className="rounded-xl border border-slate-200/80 bg-white p-5 shadow-[0_1px_2px_rgba(0,0,0,0.04)] dark:border-slate-700/80 dark:bg-slate-900">
              <p className="text-xs font-medium text-slate-500 dark:text-slate-400">
                Monthly Budget
              </p>

              <p className="mt-2 text-xl font-semibold text-slate-900 dark:text-slate-100">
                {formatCurrency(
                  result.total_budget
                )}
              </p>

              <p className="mt-1 text-xs text-slate-400 dark:text-slate-400">
                Total amount entered
              </p>
            </div>

            <div className="rounded-xl border border-slate-200/80 bg-white p-5 shadow-[0_1px_2px_rgba(0,0,0,0.04)] dark:border-slate-700/80 dark:bg-slate-900">
              <p className="text-xs font-medium text-slate-500 dark:text-slate-400">
                Savings Goal
              </p>

              <p className="mt-2 text-xl font-semibold text-emerald-600">
                {formatCurrency(
                  result.savings_goal
                )}
              </p>

              <p className="mt-1 text-xs text-slate-400 dark:text-slate-400">
                Target amount reserved
              </p>
            </div>

            <div className="rounded-xl border border-slate-200/80 bg-white p-5 shadow-[0_1px_2px_rgba(0,0,0,0.04)] dark:border-slate-700/80 dark:bg-slate-900">
              <p className="text-xs font-medium text-slate-500 dark:text-slate-400">
                Available Spending
              </p>

              <p className="mt-2 text-xl font-semibold text-indigo-600">
                {formatCurrency(
                  result.available_budget
                )}
              </p>

              <p className="mt-1 text-xs text-slate-400 dark:text-slate-400">
                Budget after savings goal
              </p>
            </div>

            <div className="rounded-xl border border-slate-200/80 bg-white p-5 shadow-[0_1px_2px_rgba(0,0,0,0.04)] dark:border-slate-700/80 dark:bg-slate-900">
              <p className="text-xs font-medium text-slate-500 dark:text-slate-400">
                Optimized Allocation
              </p>

              <p className="mt-2 text-xl font-semibold text-slate-900 dark:text-slate-100">
                {formatCurrency(
                  result.optimized_total
                )}
              </p>

              <p className="mt-1 text-xs text-slate-400 dark:text-slate-400">
                Recommended category total
              </p>
            </div>

            <div className="rounded-xl border border-slate-200/80 bg-white p-5 shadow-[0_1px_2px_rgba(0,0,0,0.04)] dark:border-slate-700/80 dark:bg-slate-900">
              <p className="text-xs font-medium text-slate-500 dark:text-slate-400">
                Unallocated Reserve
              </p>

              <p className="mt-2 text-xl font-semibold text-amber-600">
                {formatCurrency(
                  result.remaining_amount
                )}
              </p>

              <p className="mt-1 text-xs text-slate-400 dark:text-slate-400">
                Remaining after recommended
                allocations
              </p>
            </div>
          </div>

          {/* OPTIMIZATION STATUS */}

          <div className="rounded-xl border border-emerald-200 bg-emerald-50/60 px-5 py-4 dark:border-emerald-800 dark:bg-emerald-950/60">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div className="flex items-start gap-3">
                <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-emerald-700 dark:text-emerald-300" />

                <div>
                  <p className="text-sm font-semibold text-emerald-800 dark:text-emerald-300">
                    Budget optimization completed
                  </p>

                  <p className="mt-1 text-xs text-emerald-700 dark:text-emerald-300">
                    Linear Programming status:{" "}
                    {result.optimization_status}
                  </p>

                  <p className="mt-2 text-xs leading-5 text-emerald-700 dark:text-emerald-300">
                    The optimizer recommends
                    category allocations based on
                    your historical spending
                    patterns. Any remaining amount
                    is shown as an unallocated
                    reserve and is not automatically
                    treated as additional savings.
                  </p>
                </div>
              </div>

              <div className="shrink-0 text-sm font-semibold text-emerald-800 dark:text-emerald-300">
                Reserve:{" "}
                {formatCurrency(
                  result.remaining_amount
                )}
              </div>
            </div>
          </div>

          {/* OPTIMIZATION EXPLANATION */}

          <div className="rounded-xl border border-indigo-200 bg-indigo-50/60 px-5 py-4 dark:border-indigo-800 dark:bg-indigo-950/60">
            <div className="flex items-start gap-3">
              <Info className="mt-0.5 h-5 w-5 shrink-0 text-indigo-600" />

              <div>
                <h3 className="text-sm font-semibold text-indigo-900 dark:text-indigo-300">
                  How to interpret these results
                </h3>

                <ul className="mt-2 space-y-1.5 text-xs leading-5 text-indigo-800 dark:text-indigo-300">
                  <li>
                    • Your savings goal is deducted
                    from the total monthly budget
                    to calculate the available
                    spending budget.
                  </li>

                  <li>
                    • Recommended category
                    allocations are influenced by
                    historical average spending.
                  </li>

                  <li>
                    • The optimizer can recommend
                    less than the available
                    spending budget when historical
                    spending is lower.
                  </li>

                  <li>
                    • The remaining reserve can be
                    used for emergencies, additional
                    savings, or expenses not
                    represented in the current
                    categories.
                  </li>
                </ul>
              </div>
            </div>
          </div>

          {/* RECOMMENDATIONS TABLE */}

          <div className="overflow-hidden rounded-xl border border-slate-200/80 bg-white shadow-[0_1px_2px_rgba(0,0,0,0.04)] dark:border-slate-700/80 dark:bg-slate-900">

            <div className="border-b border-slate-100 px-5 py-4 dark:border-slate-800">
              <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">
                Optimized Category Allocation
              </h2>

              <p className="mt-1 text-xs leading-5 text-slate-500 dark:text-slate-400">
                Recommendations are based on
                historical spending patterns. The
                optimizer respects your available
                spending budget and may leave part of
                it unallocated as a reserve.
              </p>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left">
                <thead>
                  <tr className="border-b border-slate-100 text-[11px] font-medium uppercase tracking-wider text-slate-400 dark:border-slate-800 dark:text-slate-400">
                    <th className="px-5 py-3">
                      Category
                    </th>

                    <th className="px-5 py-3 text-right">
                      Current
                    </th>

                    <th className="px-5 py-3 text-right">
                      Historical Avg.
                    </th>

                    <th className="px-5 py-3 text-right">
                      Recommended
                    </th>

                    <th className="px-5 py-3 text-right">
                      Change
                    </th>

                    <th className="px-5 py-3 text-right">
                      Action
                    </th>
                  </tr>
                </thead>

                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {result.recommendations.length >
                  0 ? (
                    result.recommendations.map(
                      (recommendation) => (
                        <tr
                          key={
                            recommendation.category
                          }
                          className="transition-colors hover:bg-slate-50/70 dark:hover:bg-slate-800/70"
                        >
                          <td className="px-5 py-4">
                            <span className="inline-flex items-center rounded-md bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-700 dark:bg-slate-800 dark:text-slate-300">
                              {
                                recommendation.category
                              }
                            </span>
                          </td>

                          <td className="whitespace-nowrap px-5 py-4 text-right text-sm text-slate-600 dark:text-slate-300">
                            {formatCurrency(
                              recommendation.current_budget
                            )}
                          </td>

                          <td className="whitespace-nowrap px-5 py-4 text-right text-sm text-slate-600 dark:text-slate-300">
                            {formatCurrency(
                              recommendation.average_monthly_spending
                            )}
                          </td>

                          <td className="whitespace-nowrap px-5 py-4 text-right text-sm font-semibold text-slate-900 dark:text-slate-100">
                            {formatCurrency(
                              recommendation.recommended_budget
                            )}
                          </td>

                          <td
                            className={`whitespace-nowrap px-5 py-4 text-right text-sm font-medium ${
                              recommendation.difference <
                              0
                                ? "text-amber-600"
                                : recommendation.difference >
                                  0
                                ? "text-emerald-600"
                                : "text-slate-500"
                            }`}
                          >
                            {recommendation.difference >
                            0
                              ? "+"
                              : ""}

                            {formatCurrency(
                              recommendation.difference
                            )}

                            <span className="ml-1 text-xs font-normal">
                              (
                              {recommendation.percentage_change >
                              0
                                ? "+"
                                : ""}

                              {recommendation.percentage_change.toFixed(
                                1
                              )}
                              %)
                            </span>
                          </td>

                          <td className="whitespace-nowrap px-5 py-4 text-right">
                            <ActionBadge
                              action={
                                recommendation.action
                              }
                            />
                          </td>
                        </tr>
                      )
                    )
                  ) : (
                    <tr>
                      <td
                        colSpan={6}
                        className="px-5 py-8 text-center text-sm text-slate-500 dark:text-slate-400"
                      >
                        No category recommendations
                        were generated.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* RESULT FOOTNOTE */}

          <div className="flex items-start gap-2 rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 dark:border-slate-700 dark:bg-slate-800">
            <Info className="mt-0.5 h-4 w-4 shrink-0 text-slate-500 dark:text-slate-400" />

            <p className="text-xs leading-5 text-slate-600 dark:text-slate-300">
              The recommended allocation is based on
              the optimization model and available
              historical data. Actual future expenses
              may differ from these recommendations.
            </p>
          </div>
        </>
      )}
    </div>
  );
}
