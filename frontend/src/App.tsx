
import { Routes, Route } from "react-router-dom";

import Sidebar from "./components/Sidebar";
import ProtectedRoute from "./components/ProtectedRoute";

import Login from "./pages/Login";
import Register from "./pages/Register";

import Dashboard from "./pages/Dashboard";
import Expenses from "./pages/Expenses";
import Forecast from "./pages/Forecast";
import Anomalies from "./pages/Anomalies";
import Budget from "./pages/Budget";
import Explainability from "./pages/Explainability";
import Advisor from "./pages/Advisor";
import Settings from "./pages/Settings";
import Account from "./pages/Account";

function App() {
  return (
    <Routes>
      {/* Public Routes */}
      <Route path="/login" element={<Login />} />
      <Route path="/register" element={<Register />} />

      {/* Protected Routes */}
      <Route element={<ProtectedRoute />}>
        <Route
          path="*"
          element={
            <div className="flex min-h-screen flex-col bg-[#f8fafc] dark:bg-slate-950">

              <Sidebar />

              <main className="w-full flex-1">
                <div className="mx-auto max-w-[1600px] px-4 py-6 sm:px-6 sm:py-8 lg:px-8">

                  <Routes>
                    <Route path="/" element={<Dashboard />} />
                    <Route path="/expenses" element={<Expenses />} />
                    <Route path="/forecast" element={<Forecast />} />
                    <Route path="/anomalies" element={<Anomalies />} />
                    <Route path="/budget" element={<Budget />} />
                    <Route path="/explainability" element={<Explainability />} />
                    <Route path="/advisor" element={<Advisor />} />
                    <Route path="/settings" element={<Settings />} />
                    <Route path="/account" element={<Account />} />
                  </Routes>

                </div>
              </main>

            </div>
          }
        />
      </Route>
    </Routes>
  );
}

export default App;