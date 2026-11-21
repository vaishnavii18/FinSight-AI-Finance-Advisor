
import { NavLink, useNavigate } from "react-router-dom";

import {
  LayoutDashboard,
  Wallet,
  Receipt,
  TrendingUp,
  AlertTriangle,
  Brain,
  Bot,
  Settings,
  LogOut,
} from "lucide-react";

import { useAuth } from "../context/AuthContext";

const menuItems = [
  { icon: LayoutDashboard, label: "Dashboard", path: "/" },
  { icon: Receipt, label: "Expenses", path: "/expenses" },
  { icon: TrendingUp, label: "Forecast", path: "/forecast" },
  { icon: AlertTriangle, label: "Anomalies", path: "/anomalies" },
  { icon: Wallet, label: "Budget", path: "/budget" },
  { icon: Brain, label: "Explainability", path: "/explainability" },
  { icon: Bot, label: "AI Advisor", path: "/advisor" },
  { icon: Settings, label: "Settings", path: "/settings" },
];

export default function Sidebar() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  const handleLogout = () => {
    logout();
    navigate("/login", { replace: true });
  };

  return (
    <header className="sticky top-0 z-50 w-full border-b border-slate-200 bg-white shadow-sm dark:border-slate-700 dark:bg-slate-900">

      {/* Brand and Account Bar */}
      <div className="flex items-center justify-between gap-3 px-4 py-3 sm:px-6 lg:px-8">

        {/* Brand */}
        <div className="flex shrink-0 items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-indigo-600">
            <span className="text-lg font-bold text-white">F</span>
          </div>

          <div>
            <div className="text-lg font-bold tracking-tight text-slate-900 dark:text-slate-100">
              FinSight
            </div>

            <p className="text-xs text-slate-500 dark:text-slate-400">
              Personal Finance Advisor
            </p>
          </div>
        </div>

        {/* Account and Logout */}
        <div className="flex min-w-0 items-center gap-2 sm:gap-3">

          <NavLink
            to="/account"
            aria-label={`My Account: ${user?.name || "User"}, ${user?.email || ""}`}
            className={({ isActive }) =>
              `flex min-w-0 items-center gap-2 rounded-lg px-2 py-2 transition-colors sm:px-3 ${
                isActive
                  ? "bg-indigo-50 text-indigo-700"
                  : "text-slate-600 hover:bg-slate-100"
              }`
            }
          >
            {/* Profile Avatar */}
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-indigo-100 font-semibold text-indigo-700 dark:bg-indigo-950 dark:text-indigo-300">
              {user?.name?.charAt(0).toUpperCase() || "U"}
            </div>

            {/* User Information */}
            <div className="hidden min-w-0 sm:block">
              <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                {user?.name || "My Account"}
              </p>

              <p className="max-w-[260px] break-all text-xs text-slate-500 dark:text-slate-400">
                {user?.email || ""}
              </p>
            </div>
          </NavLink>

          {/* Logout */}
          <button
            type="button"
            onClick={handleLogout}
            aria-label="Log out of FinSight"
            title="Log out"
            className="flex shrink-0 items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium text-slate-600 transition-colors hover:bg-red-50 hover:text-red-600 focus:outline-none focus:ring-2 focus:ring-indigo-500 dark:text-slate-300 dark:hover:bg-red-950"
          >
            <LogOut size={18} />
            <span className="hidden sm:inline">Logout</span>
          </button>
        </div>
      </div>

      {/* Horizontal Navigation */}
      <nav
        aria-label="Main navigation"
        className="flex w-full items-center gap-1 overflow-x-auto px-3 pb-2 sm:px-6 lg:px-8"
      >
        {menuItems.map((item) => {
          const Icon = item.icon;

          return (
            <NavLink
              key={item.path}
              to={item.path}
              end={item.path === "/"}
              className={({ isActive }) =>
                `flex shrink-0 items-center gap-2 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-indigo-500 ${
                  isActive
                    ? "bg-indigo-600 text-white shadow-sm"
                    : "text-slate-600 hover:bg-slate-100 hover:text-indigo-600"
                } dark:hover:bg-slate-800`
              }
            >
              <Icon size={17} aria-hidden="true" />
              <span>{item.label}</span>
            </NavLink>
          );
        })}
      </nav>
    </header>
  );
}
