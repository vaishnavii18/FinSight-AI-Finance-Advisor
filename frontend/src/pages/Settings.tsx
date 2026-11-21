import { useEffect, useState } from "react";

import {
  Wallet,
  PiggyBank,
  Save,
  Download,
  Trash2,
  Pencil,
  Check,
  X,
  Palette,
  Loader2,
  FileSpreadsheet,
  FileText,
  ShieldAlert,
  Moon,
  Sun,
  Monitor,
  CalendarDays,
} from "lucide-react";

import {
  getBudgets,
  updateBudget,
  deleteBudget,
  getUserSettings,
  updateUserSettings,
  downloadFinancialCSV,
  downloadCompleteFinancialReport,
  downloadAnomalyPDF,
  getApiErrorMessage,
} from "../services/api";

import type {
  Budget,
  ExportDateRange,
  UserSettings,
} from "../services/api";
import { syncTheme, THEME_KEY } from "../theme";

type Theme = "light" | "dark" | "system";

const INCOME_KEY = "finance_monthly_income";
const TOTAL_BUDGET_KEY = "finance_total_budget";
const CURRENCY_KEY = "finance_currency";

const currencies = [
  {
    code: "INR",
    label: "Indian Rupee (₹)",
    symbol: "₹",
  },
  {
    code: "USD",
    label: "US Dollar ($)",
    symbol: "$",
  },
  {
    code: "EUR",
    label: "Euro (€)",
    symbol: "€",
  },
  {
    code: "GBP",
    label: "British Pound (£)",
    symbol: "£",
  },
] as const;

export default function Settings() {
  const [budgets, setBudgets] = useState<Budget[]>([]);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [settingsLoading, setSettingsLoading] =
    useState(true);

  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  const [monthlyIncome, setMonthlyIncome] =
    useState("");

  const [totalBudget, setTotalBudget] =
    useState("");

  const [currency, setCurrency] =
    useState<UserSettings["currency"]>("INR");

  const [theme, setTheme] =
    useState<Theme>("system");

  const [editingId, setEditingId] =
    useState<number | null>(null);

  const [editCategory, setEditCategory] =
    useState("");

  const [editAmount, setEditAmount] =
    useState("");

  const [downloading, setDownloading] =
    useState("");

  const [startDate, setStartDate] =
    useState("");

  const [endDate, setEndDate] =
    useState("");

  const symbol =
    currencies.find(
      (item) => item.code === currency
    )?.symbol ?? "₹";

  /* ========================================================
     LOAD USER SETTINGS
  ======================================================== */

  const fetchUserSettings = async () => {
    try {
      setSettingsLoading(true);

      const data =
        await getUserSettings();

      setMonthlyIncome(
        String(data.monthly_income ?? 0)
      );

      setTotalBudget(
        String(
          data.total_monthly_budget ?? 0
        )
      );

      setCurrency(data.currency);
      setTheme(data.theme);

      // Keep localStorage as a lightweight cache.
      localStorage.setItem(
        INCOME_KEY,
        String(data.monthly_income ?? 0)
      );

      localStorage.setItem(
        TOTAL_BUDGET_KEY,
        String(
          data.total_monthly_budget ?? 0
        )
      );

      localStorage.setItem(
        CURRENCY_KEY,
        data.currency
      );

      localStorage.setItem(
        THEME_KEY,
        data.theme
      );
    } catch (err) {
      console.error(err);

      /*
       * Backend is the source of truth.
       * LocalStorage is only used as a fallback
       * if the settings request fails.
       */

      const cachedIncome =
        localStorage.getItem(
          INCOME_KEY
        );

      const cachedBudget =
        localStorage.getItem(
          TOTAL_BUDGET_KEY
        );

      const cachedCurrency =
        localStorage.getItem(
          CURRENCY_KEY
        );

      const cachedTheme =
        localStorage.getItem(THEME_KEY);

      if (cachedIncome !== null) {
        setMonthlyIncome(cachedIncome);
      }

      if (cachedBudget !== null) {
        setTotalBudget(cachedBudget);
      }

      if (
        cachedCurrency === "INR" ||
        cachedCurrency === "USD" ||
        cachedCurrency === "EUR" ||
        cachedCurrency === "GBP"
      ) {
        setCurrency(cachedCurrency);
      }

      if (
        cachedTheme === "light" ||
        cachedTheme === "dark" ||
        cachedTheme === "system"
      ) {
        setTheme(cachedTheme);
      }

      setError(
        "Unable to load your saved settings. Cached values may be shown."
      );
    } finally {
      setSettingsLoading(false);
    }
  };

  /* ========================================================
     FETCH CATEGORY BUDGETS
  ======================================================== */

  const fetchBudgets = async () => {
    try {
      setLoading(true);

      const data =
        await getBudgets();

      setBudgets(data);

      /*
       * If the backend total budget is zero but category
       * budgets exist, show their sum as a useful default.
       *
       * We do NOT automatically save it to the backend.
       */
      if (
        Number(totalBudget || 0) === 0
      ) {
        const total =
          data.reduce(
            (sum, budget) =>
              sum +
              Number(
                budget.monthly_limit || 0
              ),
            0
          );

        if (total > 0) {
          setTotalBudget(
            String(total)
          );
        }
      }
    } catch (err) {
      console.error(err);

      setError(
        "Unable to load category budgets."
      );
    } finally {
      setLoading(false);
    }
  };

  /* ========================================================
     INITIAL LOAD
  ======================================================== */

  useEffect(() => {
    fetchUserSettings();
    fetchBudgets();
  }, []);

  /* ========================================================
     APPLY LIGHT / DARK / SYSTEM THEME
  ======================================================== */

  useEffect(() => {
    syncTheme(theme);
  }, [theme]);

  /* ========================================================
     SAVE GENERAL SETTINGS
  ======================================================== */

  const handleSave = async (
    e: React.FormEvent<HTMLFormElement>
  ) => {
    e.preventDefault();

    const income =
      Number(monthlyIncome);

    const budget =
      Number(totalBudget);

    if (
      monthlyIncome.trim() === "" ||
      totalBudget.trim() === "" ||
      !Number.isFinite(income) ||
      !Number.isFinite(budget) ||
      income < 0 ||
      budget < 0
    ) {
      setMessage(
        "Please enter valid non-negative amounts."
      );

      return;
    }

    try {
      setSaving(true);
      setMessage("");
      setError("");

      const updated =
        await updateUserSettings({
          monthly_income: income,
          total_monthly_budget:
            budget,
          currency,
          theme,
        });

      setMonthlyIncome(
        String(updated.monthly_income)
      );

      setTotalBudget(
        String(
          updated.total_monthly_budget
        )
      );

      setCurrency(updated.currency);
      setTheme(updated.theme);

      /*
       * Keep localStorage synchronized,
       * but the backend remains authoritative.
       */
      localStorage.setItem(
        INCOME_KEY,
        String(updated.monthly_income)
      );

      localStorage.setItem(
        TOTAL_BUDGET_KEY,
        String(
          updated.total_monthly_budget
        )
      );

      localStorage.setItem(
        CURRENCY_KEY,
        updated.currency
      );

      localStorage.setItem(
        THEME_KEY,
        updated.theme
      );

      setMessage(
        "Settings saved successfully."
      );
    } catch (err) {
      console.error(err);

      setMessage(
        getApiErrorMessage(err)
      );
    } finally {
      setSaving(false);
    }
  };

  /* ========================================================
     EDIT CATEGORY BUDGET
  ======================================================== */

  const startEditing = (
    budget: Budget
  ) => {
    setEditingId(budget.id);
    setEditCategory(
      budget.category
    );
    setEditAmount(
      String(budget.monthly_limit)
    );
    setMessage("");
    setError("");
  };

  const handleUpdateBudget =
    async (id: number) => {
      const amount =
        Number(editAmount);

      if (
        !editCategory.trim() ||
        !Number.isFinite(amount) ||
        amount <= 0
      ) {
        setMessage(
          "Enter a valid category and budget amount."
        );

        return;
      }

      try {
        setSaving(true);
        setMessage("");
        setError("");

        await updateBudget(id, {
          category:
            editCategory.trim(),
          monthly_limit: amount,
        });

        await fetchBudgets();

        setEditingId(null);
        setEditCategory("");
        setEditAmount("");

        setMessage(
          "Category budget updated successfully."
        );
      } catch (err) {
        console.error(err);

        setMessage(
          getApiErrorMessage(err)
        );
      } finally {
        setSaving(false);
      }
    };

  /* ========================================================
     DELETE CATEGORY BUDGET
  ======================================================== */

  const handleDeleteBudget =
    async (id: number) => {
      const confirmed =
        window.confirm(
          "Are you sure you want to delete this category budget?"
        );

      if (!confirmed) {
        return;
      }

      try {
        setSaving(true);
        setMessage("");
        setError("");

        await deleteBudget(id);

        await fetchBudgets();

        setMessage(
          "Category budget deleted successfully."
        );
      } catch (err) {
        console.error(err);

        setMessage(
          getApiErrorMessage(err)
        );
      } finally {
        setSaving(false);
      }
    };

  /* ========================================================
     DATE RANGE VALIDATION
  ======================================================== */

  const getExportDateRange =
    (): ExportDateRange | null => {
      if (
        !startDate &&
        !endDate
      ) {
        return {};
      }

      if (
        startDate &&
        endDate &&
        startDate > endDate
      ) {
        setMessage(
          "Start date cannot be later than end date."
        );

        return null;
      }

      return {
        startDate:
          startDate || undefined,
        endDate:
          endDate || undefined,
      };
    };

  /* ========================================================
     DOWNLOAD REPORTS
  ======================================================== */

  const handleDownload = async (
    type: string,
    downloadFunction: (
      dateRange: ExportDateRange
    ) => Promise<void>
  ) => {
    const dateRange =
      getExportDateRange();

    if (!dateRange) {
      return;
    }

    try {
      setDownloading(type);
      setMessage("");
      setError("");

      await downloadFunction(
        dateRange
      );

      setMessage(
        `${type} downloaded successfully.`
      );
    } catch (err) {
      console.error(err);

      setMessage(
        `Unable to download ${type}. ${getApiErrorMessage(err)}`
      );
    } finally {
      setDownloading("");
    }
  };

  /* ========================================================
     CLEAR DATE FILTER
  ======================================================== */

  const clearDateFilter = () => {
    setStartDate("");
    setEndDate("");
    setMessage("");
  };

  /* ========================================================
     FORMAT CURRENCY
  ======================================================== */

  const formatAmount = (
    amount: number
  ) => {
    return `${symbol}${Number(
      amount
    ).toLocaleString("en-IN", {
      maximumFractionDigits: 2,
    })}`;
  };

  return (
    <div className="space-y-6 pb-10">

      {/* ====================================================
          HEADER
      ==================================================== */}

      <div>
        <h1 className="text-2xl font-bold text-slate-900 dark:text-white dark:text-slate-100">
          Settings
        </h1>

        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
          Manage your financial preferences,
          budgets, appearance and data exports.
        </p>
      </div>

      {/* ====================================================
          NOTIFICATIONS
      ==================================================== */}

      {message && (
        <div
          role="status"
          aria-live="polite"
          className="rounded-lg border border-indigo-200 bg-indigo-50 px-4 py-3 text-sm text-indigo-700 dark:border-indigo-800 dark:bg-indigo-950 dark:text-indigo-300"
        >
          {message}
        </div>
      )}

      {error && (
        <div
          role="alert"
          className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700 dark:border-rose-800 dark:bg-rose-950 dark:text-rose-300"
        >
          {error}
        </div>
      )}

      {/* ====================================================
          GENERAL SETTINGS
      ==================================================== */}

      <section className="rounded-xl border border-slate-200 bg-white shadow-sm dark:border-slate-700 dark:bg-slate-900">

        <div className="border-b border-slate-100 px-5 py-4 dark:border-slate-700 dark:border-slate-800">
          <h2 className="font-semibold text-slate-900 dark:text-white dark:text-slate-100">
            General Settings
          </h2>

          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
            Manage your income, total monthly
            budget and currency preference.
          </p>
        </div>

        {settingsLoading ? (
          <div className="flex justify-center py-10">
            <Loader2
              className="animate-spin text-indigo-600"
              size={24}
              aria-label="Loading settings"
            />
          </div>
        ) : (
          <form
            onSubmit={handleSave}
            className="space-y-5 p-5"
          >

            {/* MONTHLY INCOME */}

            <div>
              <label
                htmlFor="monthly-income"
                className="mb-2 block text-sm font-medium text-slate-700 dark:text-slate-300"
              >
                Monthly Income ({symbol})
              </label>

              <div className="relative">
                <Wallet
                  className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400 dark:text-slate-400"
                  aria-hidden="true"
                />

                <input
                  id="monthly-income"
                  type="number"
                  min="0"
                  step="0.01"
                  value={monthlyIncome}
                  onChange={(e) =>
                    setMonthlyIncome(
                      e.target.value
                    )
                  }
                  placeholder="Enter monthly income"
                  className="w-full rounded-lg border border-slate-200 bg-white py-3 pl-10 pr-4 text-sm text-slate-900 outline-none focus:border-indigo-500 dark:border-slate-700 dark:bg-slate-800 dark:text-white dark:bg-slate-900 dark:text-slate-100"
                />
              </div>
            </div>

            {/* TOTAL BUDGET */}

            <div>
              <label
                htmlFor="total-budget"
                className="mb-2 block text-sm font-medium text-slate-700 dark:text-slate-300"
              >
                Total Monthly Budget ({symbol})
              </label>

              <div className="relative">
                <PiggyBank
                  className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400 dark:text-slate-400"
                  aria-hidden="true"
                />

                <input
                  id="total-budget"
                  type="number"
                  min="0"
                  step="0.01"
                  value={totalBudget}
                  onChange={(e) =>
                    setTotalBudget(
                      e.target.value
                    )
                  }
                  placeholder="Enter total monthly budget"
                  className="w-full rounded-lg border border-slate-200 bg-white py-3 pl-10 pr-4 text-sm text-slate-900 outline-none focus:border-indigo-500 dark:border-slate-700 dark:bg-slate-800 dark:text-white dark:bg-slate-900 dark:text-slate-100"
                />
              </div>
            </div>

            {/* CURRENCY */}

            <div>
              <label
                htmlFor="currency"
                className="mb-2 block text-sm font-medium text-slate-700 dark:text-slate-300"
              >
                Currency Preference
              </label>

              <select
                id="currency"
                value={currency}
                onChange={(e) =>
                  setCurrency(
                    e.target.value as UserSettings["currency"]
                  )
                }
                className="w-full rounded-lg border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 outline-none focus:border-indigo-500 dark:border-slate-700 dark:bg-slate-800 dark:text-white dark:bg-slate-900 dark:text-slate-100"
              >
                {currencies.map(
                  (item) => (
                    <option
                      key={item.code}
                      value={item.code}
                    >
                      {item.label}
                    </option>
                  )
                )}
              </select>
            </div>

            {/* SAVE */}

            <button
              type="submit"
              disabled={saving}
              className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-5 py-3 text-sm font-medium text-white transition hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {saving ? (
                <Loader2
                  size={17}
                  className="animate-spin"
                />
              ) : (
                <Save size={17} />
              )}

              {saving
                ? "Saving..."
                : "Save Changes"}
            </button>

          </form>
        )}
      </section>

      {/* ====================================================
          APPEARANCE
      ==================================================== */}

      <section className="rounded-xl border border-slate-200 bg-white shadow-sm dark:border-slate-700 dark:bg-slate-900">

        <div className="flex items-center gap-3 border-b border-slate-100 px-5 py-4 dark:border-slate-700 dark:border-slate-800">

          <Palette
            className="text-indigo-600"
            size={20}
          />

          <div>
            <h2 className="font-semibold text-slate-900 dark:text-white dark:text-slate-100">
              Appearance
            </h2>

            <p className="text-xs text-slate-500 dark:text-slate-400">
              Customize your application theme.
            </p>
          </div>

        </div>

        <div className="p-5">

          <label className="mb-3 block text-sm font-medium text-slate-700 dark:text-slate-300">
            Select Theme
          </label>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">

            {(
              [
                "light",
                "dark",
                "system",
              ] as Theme[]
            ).map((item) => {

              const Icon =
                item === "light"
                  ? Sun
                  : item === "dark"
                    ? Moon
                    : Monitor;

              return (
                <button
                  key={item}
                  type="button"
                  aria-pressed={
                    theme === item
                  }
                  onClick={() =>
                    setTheme(item)
                  }
                  className={`flex items-center justify-center gap-2 rounded-lg border px-3 py-4 text-sm font-medium capitalize transition ${
                    theme === item
                      ? "border-indigo-600 bg-indigo-50 text-indigo-700 dark:bg-indigo-950 dark:text-indigo-300"
                      : "border-slate-200 text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
                  } dark:text-indigo-300 dark:hover:bg-slate-800`}
                >
                  <Icon size={18} />
                  {item}
                </button>
              );
            })}

          </div>

          <p className="mt-4 text-xs text-slate-500 dark:text-slate-400">
            Click “Save Changes” in General
            Settings to persist the selected theme
            to your account.
          </p>

        </div>
      </section>

      {/* ====================================================
          CATEGORY BUDGETS
      ==================================================== */}

      <section className="rounded-xl border border-slate-200 bg-white shadow-sm dark:border-slate-700 dark:bg-slate-900">

        <div className="border-b border-slate-100 px-5 py-4 dark:border-slate-700 dark:border-slate-800">

          <h2 className="font-semibold text-slate-900 dark:text-white dark:text-slate-100">
            Category Budgets
          </h2>

          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
            View, edit and delete your existing
            category budgets.
          </p>

        </div>

        <div className="space-y-3 p-5">

          {loading ? (
            <div className="flex justify-center py-8">
              <Loader2
                className="animate-spin text-indigo-600"
                aria-label="Loading budgets"
              />
            </div>
          ) : budgets.length === 0 ? (
            <p className="py-6 text-center text-sm text-slate-500 dark:text-slate-400">
              No category budgets found.
              Create budgets from the Budget
              page.
            </p>
          ) : (
            budgets.map(
              (budget) => (
                <div
                  key={budget.id}
                  className="rounded-lg border border-slate-200 bg-slate-50 p-4 dark:border-slate-700 dark:bg-slate-800"
                >

                  {editingId ===
                  budget.id ? (
                    <div className="space-y-3">

                      <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">
                        Category

                        <input
                          value={
                            editCategory
                          }
                          onChange={(e) =>
                            setEditCategory(
                              e.target.value
                            )
                          }
                          placeholder="Category name"
                          className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 dark:border-slate-600 dark:bg-slate-900 dark:text-white dark:border-slate-700 dark:text-slate-100"
                        />
                      </label>

                      <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">
                        Monthly Limit

                        <input
                          type="number"
                          min="0.01"
                          step="0.01"
                          value={
                            editAmount
                          }
                          onChange={(e) =>
                            setEditAmount(
                              e.target.value
                            )
                          }
                          placeholder="Monthly limit"
                          className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 dark:border-slate-600 dark:bg-slate-900 dark:text-white dark:border-slate-700 dark:text-slate-100"
                        />
                      </label>

                      <div className="flex gap-2">

                        <button
                          type="button"
                          disabled={
                            saving
                          }
                          onClick={() =>
                            handleUpdateBudget(
                              budget.id
                            )
                          }
                          className="flex items-center gap-2 rounded-lg bg-indigo-600 px-3 py-2 text-sm text-white disabled:opacity-50"
                        >
                          {saving ? (
                            <Loader2
                              size={16}
                              className="animate-spin"
                            />
                          ) : (
                            <Check
                              size={16}
                            />
                          )}

                          Save
                        </button>

                        <button
                          type="button"
                          onClick={() => {
                            setEditingId(
                              null
                            );

                            setEditCategory(
                              ""
                            );

                            setEditAmount(
                              ""
                            );
                          }}
                          className="flex items-center gap-2 rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-600 dark:border-slate-600 dark:text-slate-300"
                        >
                          <X size={16} />
                          Cancel
                        </button>

                      </div>
                    </div>
                  ) : (
                    <div className="flex items-center justify-between gap-3">

                      <div className="min-w-0">

                        <p className="truncate text-sm font-semibold text-slate-800 dark:text-white dark:text-slate-200">
                          {budget.category}
                        </p>

                        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                          Monthly limit:{" "}
                          <span className="font-semibold text-slate-900 dark:text-white dark:text-slate-100">
                            {formatAmount(
                              budget.monthly_limit
                            )}
                          </span>
                        </p>

                      </div>

                      <div className="flex shrink-0 gap-2">

                        <button
                          type="button"
                          onClick={() =>
                            startEditing(
                              budget
                            )
                          }
                          title="Edit budget"
                          aria-label={`Edit ${budget.category} budget`}
                          className="rounded-lg border border-slate-200 bg-white p-2 text-indigo-600 hover:bg-indigo-50 dark:border-slate-600 dark:bg-slate-900 dark:border-slate-700 dark:hover:bg-indigo-950"
                        >
                          <Pencil
                            size={16}
                          />
                        </button>

                        <button
                          type="button"
                          disabled={
                            saving
                          }
                          onClick={() =>
                            handleDeleteBudget(
                              budget.id
                            )
                          }
                          title="Delete budget"
                          aria-label={`Delete ${budget.category} budget`}
                          className="rounded-lg border border-slate-200 bg-white p-2 text-red-600 hover:bg-red-50 disabled:opacity-50 dark:border-slate-600 dark:bg-slate-900 dark:border-slate-700 dark:hover:bg-red-950"
                        >
                          <Trash2
                            size={16}
                          />
                        </button>

                      </div>
                    </div>
                  )}

                </div>
              )
            )
          )}

        </div>
      </section>

      {/* ====================================================
          DATA EXPORT
      ==================================================== */}

      <section className="rounded-xl border border-slate-200 bg-white shadow-sm dark:border-slate-700 dark:bg-slate-900">

        <div className="border-b border-slate-100 px-5 py-4 dark:border-slate-700 dark:border-slate-800">

          <h2 className="font-semibold text-slate-900 dark:text-white dark:text-slate-100">
            Data & Privacy
          </h2>

          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
            Download your financial information,
            reports and anomaly analysis.
          </p>

        </div>

        <div className="space-y-5 p-5">

          {/* ==================================================
              DATE FILTER
          ================================================== */}

          <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 dark:border-slate-700 dark:bg-slate-800">

            <div className="mb-4 flex items-center gap-3">

              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-indigo-100 dark:bg-indigo-950">
                <CalendarDays
                  size={19}
                  className="text-indigo-600"
                />
              </div>

              <div>
                <p className="text-sm font-semibold text-slate-800 dark:text-white dark:text-slate-200">
                  Report Date Range
                </p>

                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Leave both dates empty to export
                  all available financial data.
                </p>
              </div>

            </div>

            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">

              <div>
                <label
                  htmlFor="report-start-date"
                  className="mb-2 block text-xs font-medium text-slate-600 dark:text-slate-300"
                >
                  Start Date
                </label>

                <input
                  id="report-start-date"
                  type="date"
                  value={startDate}
                  max={endDate || undefined}
                  onChange={(e) =>
                    setStartDate(
                      e.target.value
                    )
                  }
                  className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900 outline-none focus:border-indigo-500 dark:border-slate-600 dark:bg-slate-900 dark:text-white dark:border-slate-700 dark:text-slate-100"
                />
              </div>

              <div>
                <label
                  htmlFor="report-end-date"
                  className="mb-2 block text-xs font-medium text-slate-600 dark:text-slate-300"
                >
                  End Date
                </label>

                <input
                  id="report-end-date"
                  type="date"
                  min={startDate || undefined}
                  value={endDate}
                  onChange={(e) =>
                    setEndDate(
                      e.target.value
                    )
                  }
                  className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900 outline-none focus:border-indigo-500 dark:border-slate-600 dark:bg-slate-900 dark:text-white dark:border-slate-700 dark:text-slate-100"
                />
              </div>

            </div>

            {(startDate ||
              endDate) && (
              <button
                type="button"
                onClick={
                  clearDateFilter
                }
                className="mt-3 text-xs font-medium text-indigo-600 hover:text-indigo-700 dark:text-indigo-400 dark:hover:text-indigo-300"
              >
                Clear date filter
              </button>
            )}

          </div>

          {/* ==================================================
              CSV
          ================================================== */}

          <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">

            <div className="flex items-center gap-3">

              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-emerald-50 dark:bg-emerald-950">
                <FileSpreadsheet
                  className="text-emerald-600"
                  size={21}
                />
              </div>

              <div>
                <p className="text-sm font-semibold text-slate-800 dark:text-white dark:text-slate-200">
                  Financial Transactions (CSV)
                </p>

                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Export transactions for Excel or
                  spreadsheet applications.
                </p>
              </div>

            </div>

            <button
              type="button"
              onClick={() =>
                handleDownload(
                  "Financial CSV",
                  downloadFinancialCSV
                )
              }
              disabled={
                !!downloading
              }
              className="inline-flex items-center justify-center gap-2 rounded-lg bg-indigo-600 px-5 py-3 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
            >
              {downloading ===
              "Financial CSV" ? (
                <Loader2
                  size={17}
                  className="animate-spin"
                />
              ) : (
                <Download size={17} />
              )}

              {downloading ===
              "Financial CSV"
                ? "Downloading..."
                : "Export CSV"}
            </button>

          </div>

          <div className="border-t border-slate-100 dark:border-slate-700 dark:border-slate-800" />

          {/* ==================================================
              FINANCIAL PDF
          ================================================== */}

          <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">

            <div className="flex items-center gap-3">

              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-rose-50 dark:bg-rose-950">
                <FileText
                  className="text-rose-600"
                  size={21}
                />
              </div>

              <div>
                <p className="text-sm font-semibold text-slate-800 dark:text-white dark:text-slate-200">
                  Complete Financial Report (PDF)
                </p>

                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Includes transactions, budgets,
                  forecasts, anomalies, advisor
                  analysis and explainability.
                </p>
              </div>

            </div>

            <button
              type="button"
              onClick={() =>
                handleDownload(
                  "Financial PDF",
                  downloadCompleteFinancialReport
                )
              }
              disabled={
                !!downloading
              }
              className="inline-flex items-center justify-center gap-2 rounded-lg bg-indigo-600 px-5 py-3 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
            >
              {downloading ===
              "Financial PDF" ? (
                <Loader2
                  size={17}
                  className="animate-spin"
                />
              ) : (
                <Download size={17} />
              )}

              {downloading ===
              "Financial PDF"
                ? "Downloading..."
                : "Export PDF"}
            </button>

          </div>

          <div className="border-t border-slate-100 dark:border-slate-700 dark:border-slate-800" />

          {/* ==================================================
              ANOMALY PDF
          ================================================== */}

          <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">

            <div className="flex items-center gap-3">

              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-amber-50 dark:bg-amber-950">
                <ShieldAlert
                  className="text-amber-600"
                  size={21}
                />
              </div>

              <div>
                <p className="text-sm font-semibold text-slate-800 dark:text-white dark:text-slate-200">
                  Anomaly Report (PDF)
                </p>

                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Download detected unusual
                  transactions with anomaly details.
                </p>
              </div>

            </div>

            <button
              type="button"
              onClick={() =>
                handleDownload(
                  "Anomaly PDF",
                  downloadAnomalyPDF
                )
              }
              disabled={
                !!downloading
              }
              className="inline-flex items-center justify-center gap-2 rounded-lg bg-indigo-600 px-5 py-3 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
            >
              {downloading ===
              "Anomaly PDF" ? (
                <Loader2
                  size={17}
                  className="animate-spin"
                />
              ) : (
                <Download size={17} />
              )}

              {downloading ===
              "Anomaly PDF"
                ? "Downloading..."
                : "Export PDF"}
            </button>

          </div>

        </div>
      </section>

    </div>
  );
}
