import { useEffect, useState, useMemo, useRef } from "react";
import {
  getExpenses,
  createExpense,
  updateExpense,
  deleteExpense,
  previewPDFImport,
  confirmPDFImport,
} from "../services/api";
import type { Expense, ParsedTransaction } from "../services/api";
import {
  Search,
  Filter,
  Plus,
  X,
  Pencil,
  Trash2,
  Upload,
  FileText,
  CheckSquare,
  Square,
} from "lucide-react";

export default function Expenses() {
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("All");
  const [statusFilter, setStatusFilter] = useState<
    "All" | "Normal" | "Anomaly"
  >("All");

  const [showForm, setShowForm] = useState(false);
  const [editingExpense, setEditingExpense] =
    useState<Expense | null>(null);

  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [formError, setFormError] = useState("");

  const [date, setDate] = useState(
    new Date().toISOString().split("T")[0]
  );
  const [amount, setAmount] = useState("");
  const [category, setCategory] = useState("Food");
  const [description, setDescription] = useState("");
  const [paymentMethod, setPaymentMethod] = useState("UPI");

  // ========== PDF IMPORT STATE ==========

  const [showImportModal, setShowImportModal] = useState(false);
  const [importLoading, setImportLoading] = useState(false);
  const [importError, setImportError] = useState("");

  const [parsedTransactions, setParsedTransactions] = useState<
    ParsedTransaction[]
  >([]);

  const [selectedIndexes, setSelectedIndexes] = useState<Set<number>>(
    new Set()
  );

  const [bulkCategory, setBulkCategory] = useState("Food");

  const importCategories = [
    "Food",
    "Education",
    "Shopping",
    "Transport",
    "Entertainment",
    "Health",
    "Bills",
    "Other",
    "Uncategorized",
  ];

  const [importing, setImporting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // ========== FETCH EXPENSES ==========

  const fetchExpenses = async () => {
    try {
      setLoading(true);

      const data = await getExpenses();

      setExpenses(data);
      setError("");
    } catch (err) {
      setError(
        "Failed to load expenses. Make sure the backend is running."
      );

      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchExpenses();
  }, []);
  // ========== EXPENSE-ONLY RECORDS ==========

const expenseRecords = useMemo(() => {
  return expenses.filter(
    (expense) => expense.transaction_type === "expense"
  );
}, [expenses]);

  // ========== CATEGORIES ==========

 const categories = useMemo(() => {
  const unique = Array.from(
    new Set(expenseRecords.map((expense) => expense.category))
  );

  return ["All", ...unique.sort()];
}, [expenseRecords]);

  // ========== FILTER EXPENSES ==========

  const filtered = useMemo(() => {
    return expenseRecords.filter((expense) => {
      const searchText = search.toLowerCase();

      const matchesSearch =
        search === "" ||
        expense.category.toLowerCase().includes(searchText) ||
        (expense.description?.toLowerCase().includes(searchText) ??
          false);

      const matchesCategory =
        categoryFilter === "All" ||
        expense.category === categoryFilter;

      const matchesStatus =
        statusFilter === "All" ||
        (statusFilter === "Anomaly" && expense.is_anomaly) ||
        (statusFilter === "Normal" && !expense.is_anomaly);

      return (
        matchesSearch &&
        matchesCategory &&
        matchesStatus
      );
    });
  }, [expenseRecords, search, categoryFilter, statusFilter]);

  const totalAmount = filtered.reduce(
    (sum, expense) => sum + expense.amount,
    0
  );

  const anomalyCount = filtered.filter(
    (expense) => expense.is_anomaly
  ).length;

  // ========== FORM HANDLERS ==========

  const resetForm = () => {
    setDate(new Date().toISOString().split("T")[0]);
    setAmount("");
    setCategory("Food");
    setDescription("");
    setPaymentMethod("UPI");
    setFormError("");
    setEditingExpense(null);
  };

  const closeForm = () => {
    if (saving) return;

    setShowForm(false);
    resetForm();
  };

  const openAddForm = () => {
    resetForm();
    setShowForm(true);
  };

  const openEditForm = (expense: Expense) => {
    setEditingExpense(expense);
    setDate(expense.date || "");
    setAmount(String(expense.amount));
    setCategory(expense.category);
    setDescription(expense.description || "");
    setPaymentMethod(expense.payment_method || "UPI");
    setFormError("");
    setShowForm(true);
  };

  const handleSubmit = async (
    event: React.FormEvent<HTMLFormElement>
  ) => {
    event.preventDefault();
    setFormError("");

    const numericAmount = Number(amount);

    if (!date) {
      setFormError("Please select a date.");
      return;
    }

    if (
      !amount ||
      !Number.isFinite(numericAmount) ||
      numericAmount <= 0
    ) {
      setFormError("Please enter an amount greater than zero.");
      return;
    }

    if (!category.trim()) {
      setFormError("Please select a category.");
      return;
    }

    try {
      setSaving(true);

      const expenseData = {
        date,
        amount: numericAmount,
        category: category.trim(),
        description: description.trim() || undefined,
        payment_method: paymentMethod || undefined,
      };

      if (editingExpense) {
        const updatedExpense = await updateExpense(
          editingExpense.id,
          expenseData
        );

        setExpenses((previousExpenses) =>
          previousExpenses.map((expense) =>
            expense.id === editingExpense.id
              ? updatedExpense
              : expense
          )
        );
      } else {
        const newExpense = await createExpense(expenseData);

        setExpenses((previousExpenses) => [
          newExpense,
          ...previousExpenses,
        ]);
      }

      setShowForm(false);
      resetForm();
    } catch (err) {
      console.error(err);

      setFormError(
        editingExpense
          ? "Failed to update expense. Please try again."
          : "Failed to save expense. Please check that the backend is running."
      );
    } finally {
      setSaving(false);
    }
  };

  // ========== DELETE EXPENSE ==========

  const handleDelete = async (expense: Expense) => {
    const confirmed = window.confirm(
      `Delete this ₹${expense.amount.toLocaleString(
        "en-IN"
      )} ${expense.category} expense?\n\nThis action cannot be undone.`
    );

    if (!confirmed) return;

    try {
      setDeletingId(expense.id);

      await deleteExpense(expense.id);

      setExpenses((previousExpenses) =>
        previousExpenses.filter(
          (item) => item.id !== expense.id
        )
      );
    } catch (err) {
      console.error(err);

      setError(
        "Failed to delete expense. Please try again."
      );
    } finally {
      setDeletingId(null);
    }
  };

  // ========== PDF IMPORT HANDLERS ==========

  const openImportModal = () => {
    setShowImportModal(true);
    setImportError("");
    setParsedTransactions([]);
    setSelectedIndexes(new Set());
    setBulkCategory("Food");

    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  const closeImportModal = () => {
    if (importLoading || importing) return;

    setShowImportModal(false);
    setImportError("");
    setParsedTransactions([]);
    setSelectedIndexes(new Set());
  };

  // ========== UPLOAD AND PREVIEW PDF ==========

  const handleFileChange = async (
    event: React.ChangeEvent<HTMLInputElement>
  ) => {
    const file = event.target.files?.[0];

    if (!file) return;

    if (!file.name.toLowerCase().endsWith(".pdf")) {
      setImportError("Please select a PDF file.");
      return;
    }

    try {
      setImportLoading(true);
      setImportError("");
      setParsedTransactions([]);
      setSelectedIndexes(new Set());

      const result = await previewPDFImport(file);

      setParsedTransactions(result.transactions);

      // Select all transactions by default
      const allIndexes = new Set(
        result.transactions.map((_, index) => index)
      );

      setSelectedIndexes(allIndexes);
    } catch (err: any) {
      console.error(err);

      const message =
        err?.response?.data?.detail ||
        "Failed to parse PDF. Make sure it is a valid SBI bank statement.";

      setImportError(message);
    } finally {
      setImportLoading(false);
    }
  };

  // ========== SELECT / DESELECT TRANSACTIONS ==========

  const toggleSelect = (index: number) => {
    setSelectedIndexes((previous) => {
      const next = new Set(previous);

      if (next.has(index)) {
        next.delete(index);
      } else {
        next.add(index);
      }

      return next;
    });
  };

  const toggleSelectAll = () => {
    if (selectedIndexes.size === parsedTransactions.length) {
      setSelectedIndexes(new Set());
    } else {
      setSelectedIndexes(
        new Set(parsedTransactions.map((_, index) => index))
      );
    }
  };

  // ========== INDIVIDUAL CATEGORY ASSIGNMENT ==========

  const updateTransactionCategory = (
    index: number,
    newCategory: string
  ) => {
    setParsedTransactions((previous) =>
      previous.map((txn, i) =>
        i === index
          ? {
              ...txn,
              suggested_category: newCategory,
            }
          : txn
      )
    );
  };

  // ========== BULK CATEGORY ASSIGNMENT ==========

  const applyBulkCategory = () => {
    if (selectedIndexes.size === 0) {
      setImportError("Select transactions first.");
      return;
    }

    const selectedExpenseExists = parsedTransactions.some(
      (txn, index) =>
        selectedIndexes.has(index) &&
        txn.transaction_type === "expense"
    );

    if (!selectedExpenseExists) {
      setImportError(
        "Select at least one expense transaction."
      );
      return;
    }

    setParsedTransactions((previous) =>
      previous.map((txn, index) =>
        selectedIndexes.has(index) &&
        txn.transaction_type === "expense"
          ? {
              ...txn,
              suggested_category: bulkCategory,
            }
          : txn
      )
    );

    setImportError("");
  };

  // ========== CONFIRM PDF IMPORT ==========

  const handleConfirmImport = async () => {
    const selected = parsedTransactions.filter((_, index) =>
      selectedIndexes.has(index)
    );

    if (selected.length === 0) {
      setImportError(
        "Please select at least one transaction."
      );
      return;
    }

    try {
      setImporting(true);
      setImportError("");

      const result = await confirmPDFImport(selected);

      // Refresh expenses list
      await fetchExpenses();

      // Close modal
      setShowImportModal(false);
      setParsedTransactions([]);
      setSelectedIndexes(new Set());

      alert(
        result.message ||
          `Successfully imported ${result.imported_count} transactions`
      );
    } catch (err: any) {
      console.error(err);

      const message =
        err?.response?.data?.detail ||
        "Failed to import transactions. Please try again.";

      setImportError(message);
    } finally {
      setImporting(false);
    }
  };

  // ========== UI ==========

  return (
    <div className="space-y-6">
      {/* PAGE HEADER */}

      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-[26px] font-semibold tracking-tight text-slate-900 dark:text-slate-100">
            Expenses
          </h1>

          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            View and manage all your transactions
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={openImportModal}
            className="inline-flex items-center justify-center gap-2 rounded-lg border border-slate-200 bg-white px-4 py-2.5 text-sm font-medium text-slate-700 shadow-sm transition hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800"
          >
            <Upload className="h-4 w-4" />
            Import PDF
          </button>

          <button
            type="button"
            onClick={openAddForm}
            className="inline-flex items-center justify-center gap-2 rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-medium text-white shadow-sm transition hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2"
          >
            <Plus className="h-4 w-4" />
            Add Expense
          </button>
        </div>
      </div>

      {/* ========== ADD / EDIT FORM ========== */}

      {showForm && (
        <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-700 dark:bg-slate-900">
          <div className="mb-5 flex items-center justify-between">
            <div>
              <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
                {editingExpense
                  ? "Edit Expense"
                  : "Add New Expense"}
              </h2>

              <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                {editingExpense
                  ? "Update the details of your expense."
                  : "Enter the details of your expense."}
              </p>
            </div>

            <button
              type="button"
              onClick={closeForm}
              disabled={saving}
              className="rounded-lg p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-700 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-300"
              aria-label="Close form"
            >
              <X className="h-5 w-5" />
            </button>
          </div>

          <form
            onSubmit={handleSubmit}
            className="grid grid-cols-1 gap-4 sm:grid-cols-2"
          >
            <div>
              <label
                htmlFor="expense-date"
                className="mb-1.5 block text-sm font-medium text-slate-700 dark:text-slate-300"
              >
                Date
              </label>

              <input
                id="expense-date"
                type="date"
                value={date}
                onChange={(event) =>
                  setDate(event.target.value)
                }
                required
                className="w-full rounded-lg border border-slate-200 px-3 py-2.5 text-sm text-slate-800 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 dark:border-slate-700 dark:text-slate-200"
              />
            </div>

            <div>
              <label
                htmlFor="expense-amount"
                className="mb-1.5 block text-sm font-medium text-slate-700 dark:text-slate-300"
              >
                Amount (₹)
              </label>

              <input
                id="expense-amount"
                type="number"
                min="0.01"
                step="0.01"
                placeholder="500"
                value={amount}
                onChange={(event) =>
                  setAmount(event.target.value)
                }
                required
                className="w-full rounded-lg border border-slate-200 px-3 py-2.5 text-sm text-slate-800 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 dark:border-slate-700 dark:text-slate-200"
              />
            </div>

            <div>
              <label
                htmlFor="expense-category"
                className="mb-1.5 block text-sm font-medium text-slate-700 dark:text-slate-300"
              >
                Category
              </label>

              <select
                id="expense-category"
                value={category}
                onChange={(event) =>
                  setCategory(event.target.value)
                }
                required
                className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-800 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
              >
                <option value="Food">Food</option>
                <option value="Education">Education</option>
                <option value="Shopping">Shopping</option>
                <option value="Transport">Transport</option>
                <option value="Entertainment">
                  Entertainment
                </option>
                <option value="Health">Health</option>
                <option value="Bills">Bills</option>
                <option value="Other">Other</option>
              </select>
            </div>

            <div>
              <label
                htmlFor="expense-payment-method"
                className="mb-1.5 block text-sm font-medium text-slate-700 dark:text-slate-300"
              >
                Payment Method
              </label>

              <select
                id="expense-payment-method"
                value={paymentMethod}
                onChange={(event) =>
                  setPaymentMethod(event.target.value)
                }
                className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-800 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
              >
                <option value="UPI">UPI</option>
                <option value="Cash">Cash</option>
                <option value="Credit Card">
                  Credit Card
                </option>
                <option value="Debit Card">
                  Debit Card
                </option>
                <option value="Bank Transfer">
                  Bank Transfer
                </option>
                <option value="Other">Other</option>
              </select>
            </div>

            <div className="sm:col-span-2">
              <label
                htmlFor="expense-description"
                className="mb-1.5 block text-sm font-medium text-slate-700 dark:text-slate-300"
              >
                Description
              </label>

              <input
                id="expense-description"
                type="text"
                placeholder="Lunch at college canteen"
                value={description}
                onChange={(event) =>
                  setDescription(event.target.value)
                }
                className="w-full rounded-lg border border-slate-200 px-3 py-2.5 text-sm text-slate-800 placeholder:text-slate-400 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 dark:border-slate-700 dark:text-slate-200 dark:placeholder:text-slate-400"
              />
            </div>

            {formError && (
              <div className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2.5 text-sm text-rose-700 sm:col-span-2 dark:border-rose-800 dark:bg-rose-950 dark:text-rose-300">
                {formError}
              </div>
            )}

            <div className="flex flex-col-reverse gap-2 sm:col-span-2 sm:flex-row sm:justify-end">
              <button
                type="button"
                onClick={closeForm}
                disabled={saving}
                className="rounded-lg border border-slate-200 px-4 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
              >
                Cancel
              </button>

              <button
                type="submit"
                disabled={saving}
                className="rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {saving
                  ? "Saving..."
                  : editingExpense
                    ? "Save Changes"
                    : "Save Expense"}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* ========== PDF IMPORT MODAL ========== */}

      {showImportModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="flex max-h-[90vh] w-full max-w-4xl flex-col rounded-xl bg-white shadow-xl dark:bg-slate-900">
            {/* HEADER */}

            <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4 dark:border-slate-700">
              <div>
                <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
                  Import Bank Statement PDF
                </h2>

                <p className="mt-0.5 text-sm text-slate-500 dark:text-slate-400">
                  Upload your SBI statement to extract transactions
                </p>
              </div>

              <button
                type="button"
                onClick={closeImportModal}
                disabled={importLoading || importing}
                className="rounded-lg p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-700 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-300"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* BODY */}

            <div className="flex-1 overflow-y-auto p-5">
              {/* FILE UPLOAD */}

              <div className="mb-5">
                <label className="mb-2 block text-sm font-medium text-slate-700 dark:text-slate-300">
                  Select PDF File
                </label>

                <div className="flex items-center gap-3">
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".pdf"
                    onChange={handleFileChange}
                    disabled={importLoading || importing}
                    className="block w-full text-sm text-slate-600 file:mr-4 file:rounded-lg file:border-0 file:bg-indigo-50 file:px-4 file:py-2 file:text-sm file:font-medium file:text-indigo-700 hover:file:bg-indigo-100 dark:text-slate-300 dark:file:bg-indigo-950 dark:file:text-indigo-300 dark:hover:file:bg-indigo-950"
                  />
                </div>
              </div>

              {/* ERROR */}

              {importError && (
                <div className="mb-4 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2.5 text-sm text-rose-700 dark:border-rose-800 dark:bg-rose-950 dark:text-rose-300">
                  {importError}
                </div>
              )}

              {/* LOADING */}

              {importLoading && (
                <div className="py-12 text-center">
                  <p className="text-sm text-slate-500 dark:text-slate-400">
                    Parsing PDF… please wait
                  </p>
                </div>
              )}

              {/* PREVIEW TABLE */}

              {!importLoading &&
                parsedTransactions.length > 0 && (
                  <>
                    {/* TRANSACTION SUMMARY */}

                    <div className="mb-3 flex items-center justify-between">
                      <p className="text-sm text-slate-600 dark:text-slate-300">
                        Found{" "}
                        <span className="font-semibold">
                          {parsedTransactions.length}
                        </span>{" "}
                        transactions •{" "}
                        <span className="font-semibold text-indigo-600">
                          {selectedIndexes.size}
                        </span>{" "}
                        selected
                      </p>

                      <button
                        type="button"
                        onClick={toggleSelectAll}
                        className="text-sm font-medium text-indigo-600 hover:text-indigo-700 dark:hover:text-indigo-300"
                      >
                        {selectedIndexes.size ===
                        parsedTransactions.length
                          ? "Deselect All"
                          : "Select All"}
                      </button>
                    </div>

                    {/* BULK CATEGORY ASSIGNMENT */}

                    <div className="mb-4 flex flex-col gap-2 rounded-lg border border-indigo-100 bg-indigo-50 p-3 sm:flex-row sm:items-center dark:border-indigo-800 dark:bg-indigo-950">
                      <div className="flex-1">
                        <p className="text-sm font-medium text-slate-800 dark:text-slate-200">
                          Assign category to selected expenses
                        </p>

                        <p className="text-xs text-slate-500 dark:text-slate-400">
                          Income transactions will not be changed.
                        </p>
                      </div>

                      <select
                        value={bulkCategory}
                        onChange={(event) =>
                          setBulkCategory(event.target.value)
                        }
                        className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900"
                      >
                        {importCategories
                          .filter(
                            (cat) => cat !== "Uncategorized"
                          )
                          .map((cat) => (
                            <option key={cat} value={cat}>
                              {cat}
                            </option>
                          ))}
                      </select>

                      <button
                        type="button"
                        onClick={applyBulkCategory}
                        className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700"
                      >
                        Apply to Selected
                      </button>
                    </div>

                    {/* TRANSACTIONS TABLE */}

                    <div className="overflow-hidden rounded-lg border border-slate-200 dark:border-slate-700">
                      <div className="max-h-80 overflow-y-auto">
                        <table className="w-full text-left text-sm">
                          <thead className="sticky top-0 bg-slate-50 dark:bg-slate-800">
                            <tr className="border-b border-slate-200 text-[11px] font-medium uppercase tracking-wider text-slate-400 dark:border-slate-700 dark:text-slate-400">
                              <th className="w-10 px-3 py-2.5"></th>

                              <th className="px-3 py-2.5">
                                Date
                              </th>

                              <th className="px-3 py-2.5">
                                Description
                              </th>

                              <th className="px-3 py-2.5">
                                Category
                              </th>

                              <th className="px-3 py-2.5 text-right">
                                Amount
                              </th>

                              <th className="px-3 py-2.5 text-right">
                                Type
                              </th>
                            </tr>
                          </thead>

                          <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                            {parsedTransactions.map(
                              (txn, index) => (
                                <tr
                                  key={index}
                                  className={`transition-colors ${
                                    selectedIndexes.has(index)
                                      ? "bg-indigo-50/50"
                                      : "hover:bg-slate-50"
                                  }`}
                                >
                                  {/* SELECT CHECKBOX */}

                                  <td className="px-3 py-2.5">
                                    <button
                                      type="button"
                                      onClick={() =>
                                        toggleSelect(index)
                                      }
                                      className="text-slate-500 hover:text-indigo-600 dark:text-slate-400"
                                    >
                                      {selectedIndexes.has(
                                        index
                                      ) ? (
                                        <CheckSquare className="h-4 w-4 text-indigo-600" />
                                      ) : (
                                        <Square className="h-4 w-4" />
                                      )}
                                    </button>
                                  </td>

                                  {/* DATE */}

                                  <td className="whitespace-nowrap px-3 py-2.5 text-slate-600 dark:text-slate-300">
                                    {new Date(
                                      txn.date
                                    ).toLocaleDateString("en-IN")}
                                  </td>

                                  {/* DESCRIPTION */}

                                  <td className="max-w-[180px] truncate px-3 py-2.5 text-slate-700 dark:text-slate-300">
                                    {txn.description}
                                  </td>

                                  {/* INDIVIDUAL CATEGORY DROPDOWN */}

                                  <td className="px-3 py-2.5">
                                    <select
                                      value={
                                        txn.suggested_category
                                      }
                                      onChange={(event) =>
                                        updateTransactionCategory(
                                          index,
                                          event.target.value
                                        )
                                      }
                                      disabled={
                                        txn.transaction_type ===
                                        "income"
                                      }
                                      className="max-w-[150px] rounded-md border border-slate-200 bg-white px-2 py-1.5 text-xs text-slate-700 disabled:bg-slate-100 disabled:text-slate-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300 dark:disabled:bg-slate-800 dark:disabled:text-slate-400"
                                    >
                                      {!importCategories.includes(
                                        txn.suggested_category
                                      ) && (
                                        <option
                                          value={
                                            txn.suggested_category
                                          }
                                        >
                                          {txn.suggested_category}
                                        </option>
                                      )}

                                      {importCategories.map(
                                        (cat) => (
                                          <option
                                            key={cat}
                                            value={cat}
                                          >
                                            {cat}
                                          </option>
                                        )
                                      )}
                                    </select>
                                  </td>

                                  {/* AMOUNT */}

                                  <td className="whitespace-nowrap px-3 py-2.5 text-right font-medium text-slate-900 dark:text-slate-100">
                                    ₹
                                    {txn.amount.toLocaleString("en-IN")}
                                  </td>

                                  {/* TRANSACTION TYPE */}

                                  <td className="whitespace-nowrap px-3 py-2.5 text-right">
                                    {txn.transaction_type ===
                                    "income" ? (
                                      <span className="inline-flex items-center rounded-md bg-emerald-50 px-2 py-0.5 text-[11px] font-medium text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300">
                                        Income
                                      </span>
                                    ) : (
                                      <span className="inline-flex items-center rounded-md bg-slate-50 px-2 py-0.5 text-[11px] font-medium text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                                        Expense
                                      </span>
                                    )}
                                  </td>
                                </tr>
                              )
                            )}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  </>
                )}

              {/* EMPTY PREVIEW */}

              {!importLoading &&
                parsedTransactions.length === 0 &&
                !importError && (
                  <div className="py-12 text-center">
                    <FileText className="mx-auto h-10 w-10 text-slate-300" />

                    <p className="mt-3 text-sm text-slate-500 dark:text-slate-400">
                      Select a PDF file to preview transactions
                    </p>
                  </div>
                )}
            </div>

            {/* FOOTER */}

            <div className="flex items-center justify-end gap-2 border-t border-slate-200 px-5 py-4 dark:border-slate-700">
              <button
                type="button"
                onClick={closeImportModal}
                disabled={importLoading || importing}
                className="rounded-lg border border-slate-200 px-4 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
              >
                Cancel
              </button>

              <button
                type="button"
                onClick={handleConfirmImport}
                disabled={
                  importLoading ||
                  importing ||
                  selectedIndexes.size === 0
                }
                className="rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {importing
                  ? "Importing..."
                  : `Import Selected (${selectedIndexes.size})`}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ========== LOADING STATE ========== */}

      {loading && (
        <div className="rounded-xl border border-slate-200 bg-white py-16 text-center dark:border-slate-700 dark:bg-slate-900">
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Loading expenses…
          </p>
        </div>
      )}

      {/* ========== ERROR STATE ========== */}

      {!loading && error && (
        <div className="rounded-xl border border-rose-200 bg-rose-50 px-5 py-4 text-sm text-rose-700 dark:border-rose-800 dark:bg-rose-950 dark:text-rose-300">
          {error}
        </div>
      )}

      {/* ========== EXPENSES CONTENT ========== */}

      {!loading && !error && (
        <>
          {/* SUMMARY CARDS */}

          <div className="flex flex-wrap gap-4 text-sm">
            <div className="rounded-lg border border-slate-200 bg-white px-4 py-2.5 dark:border-slate-700 dark:bg-slate-900">
              <span className="text-slate-500 dark:text-slate-400">
                Total
              </span>

              <span className="ml-2 font-semibold text-slate-900 dark:text-slate-100">
                ₹{totalAmount.toLocaleString("en-IN")}
              </span>
            </div>

            <div className="rounded-lg border border-slate-200 bg-white px-4 py-2.5 dark:border-slate-700 dark:bg-slate-900">
              <span className="text-slate-500 dark:text-slate-400">
                Transactions
              </span>

              <span className="ml-2 font-semibold text-slate-900 dark:text-slate-100">
                {filtered.length}
              </span>
            </div>

            <div className="rounded-lg border border-slate-200 bg-white px-4 py-2.5 dark:border-slate-700 dark:bg-slate-900">
              <span className="text-slate-500 dark:text-slate-400">
                Anomalies
              </span>

              <span className="ml-2 font-semibold text-rose-600">
                {anomalyCount}
              </span>
            </div>
          </div>

          {/* SEARCH AND FILTERS */}

          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400 dark:text-slate-400" />

              <input
                type="text"
                placeholder="Search by category or description…"
                value={search}
                onChange={(event) =>
                  setSearch(event.target.value)
                }
                className="w-full rounded-lg border border-slate-200 bg-white py-2.5 pl-10 pr-4 text-sm text-slate-800 placeholder:text-slate-400 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:placeholder:text-slate-400"
              />
            </div>

            <div className="relative">
              <Filter className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400 dark:text-slate-400" />

              <select
                value={categoryFilter}
                onChange={(event) =>
                  setCategoryFilter(event.target.value)
                }
                className="appearance-none rounded-lg border border-slate-200 bg-white py-2.5 pl-10 pr-8 text-sm text-slate-700 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300"
              >
                {categories.map((cat) => (
                  <option key={cat} value={cat}>
                    {cat}
                  </option>
                ))}
              </select>
            </div>

            <select
              value={statusFilter}
              onChange={(event) =>
                setStatusFilter(
                  event.target.value as
                    | "All"
                    | "Normal"
                    | "Anomaly"
                )
              }
              className="rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-700 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300"
            >
              <option value="All">All Status</option>
              <option value="Normal">Normal</option>
              <option value="Anomaly">Anomaly</option>
            </select>
          </div>

          {/* EXPENSES TABLE */}

          <div className="overflow-hidden rounded-xl border border-slate-200/80 bg-white shadow-[0_1px_2px_rgba(0,0,0,0.04)] dark:border-slate-700/80 dark:bg-slate-900">
            {filtered.length === 0 ? (
              <div className="py-16 text-center text-sm text-slate-500 dark:text-slate-400">
                No expenses match your filters.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left">
                  <thead>
                    <tr className="border-b border-slate-100 text-[11px] font-medium uppercase tracking-wider text-slate-400 dark:border-slate-800 dark:text-slate-400">
                      <th className="px-5 py-3">
                        Date
                      </th>

                      <th className="px-5 py-3">
                        Category
                      </th>

                      <th className="px-5 py-3">
                        Description
                      </th>

                      <th className="px-5 py-3 text-right">
                        Amount
                      </th>

                      <th className="px-5 py-3 text-right">
                        Status
                      </th>

                      <th className="px-5 py-3 text-right">
                        Actions
                      </th>
                    </tr>
                  </thead>

                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                    {filtered.map((expense) => (
                      <tr
                        key={expense.id}
                        className="transition-colors hover:bg-slate-50/70 dark:hover:bg-slate-800/70"
                      >
                        <td className="whitespace-nowrap px-5 py-3.5 text-[13px] text-slate-600 dark:text-slate-300">
                          {expense.date
                            ? new Date(
                                expense.date
                              ).toLocaleDateString("en-IN")
                            : "No date"}
                        </td>

                        <td className="px-5 py-3.5">
                          <span className="inline-flex items-center rounded-md bg-slate-100 px-2 py-0.5 text-[12px] font-medium text-slate-700 dark:bg-slate-800 dark:text-slate-300">
                            {expense.category}
                          </span>
                        </td>

                        <td className="max-w-[220px] truncate px-5 py-3.5 text-[13px] text-slate-600 dark:text-slate-300">
                          {expense.description || "—"}
                        </td>

                        <td className="whitespace-nowrap px-5 py-3.5 text-right text-[13px] font-medium text-slate-900 dark:text-slate-100">
                          ₹
                          {expense.amount.toLocaleString("en-IN")}
                        </td>

                        <td className="whitespace-nowrap px-5 py-3.5 text-right">
                          {expense.is_anomaly ? (
                            <span className="inline-flex items-center rounded-md bg-rose-50 px-2 py-0.5 text-[11px] font-medium text-rose-700 ring-1 ring-inset ring-rose-600/10 dark:bg-rose-950 dark:text-rose-300">
                              Anomaly
                            </span>
                          ) : (
                            <span className="inline-flex items-center rounded-md bg-slate-50 px-2 py-0.5 text-[11px] font-medium text-slate-500 ring-1 ring-inset ring-slate-500/10 dark:bg-slate-800 dark:text-slate-400">
                              Normal
                            </span>
                          )}
                        </td>

                        <td className="whitespace-nowrap px-5 py-3.5 text-right">
                          <div className="flex items-center justify-end gap-1.5">
                            <button
                              type="button"
                              onClick={() =>
                                openEditForm(expense)
                              }
                              disabled={
                                deletingId === expense.id
                              }
                              className="inline-flex items-center gap-1.5 rounded-md border border-slate-200 px-2.5 py-1.5 text-xs font-medium text-slate-600 transition hover:border-indigo-200 hover:bg-indigo-50 hover:text-indigo-700 disabled:cursor-not-allowed disabled:opacity-50 dark:border-slate-700 dark:text-slate-300 dark:hover:border-indigo-800 dark:hover:bg-indigo-950 dark:hover:text-indigo-300"
                              title="Edit expense"
                            >
                              <Pencil className="h-3.5 w-3.5" />
                              Edit
                            </button>

                            <button
                              type="button"
                              onClick={() =>
                                handleDelete(expense)
                              }
                              disabled={
                                deletingId === expense.id
                              }
                              className="inline-flex items-center gap-1.5 rounded-md border border-rose-200 px-2.5 py-1.5 text-xs font-medium text-rose-600 transition hover:bg-rose-50 hover:text-rose-700 disabled:cursor-not-allowed disabled:opacity-50 dark:border-rose-800 dark:hover:bg-rose-950 dark:hover:text-rose-300"
                              title="Delete expense"
                            >
                              <Trash2 className="h-3.5 w-3.5" />

                              {deletingId === expense.id
                                ? "Deleting..."
                                : "Delete"}
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
        </>
      )}
    </div>
  );
}
