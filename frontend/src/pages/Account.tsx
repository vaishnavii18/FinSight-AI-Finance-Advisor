
import { useState, useEffect } from "react";
import { User, Mail, Save, ShieldCheck } from "lucide-react";
import { useAuth } from "../context/AuthContext";
import api from "../services/api";

export default function Account() {
  const { user, updateUser } = useAuth();
  useEffect(() => {
  if (user) {
    setName(user.name ?? "");
  }
}, [user]);
  const [name, setName] = useState(user?.name ?? "");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");

  const handleSave = async () => {
  try {
    setSaving(true);
    setMessage("");

    const response = await api.put("/auth/profile", {
      name: name.trim(),
    });

    updateUser(response.data);

    setName(response.data.name ?? "");

    setMessage("Profile updated successfully.");
  } catch {
    setMessage("Unable to update profile. Please try again.");
  } finally {
    setSaving(false);
  }
};

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100">
          My Account
        </h1>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
          Manage your personal information and account details.
        </p>
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-700 dark:bg-slate-900">
        <div className="mb-6 flex items-center gap-4">
          <div className="flex h-16 w-16 items-center justify-center rounded-full bg-indigo-100 dark:bg-indigo-950">
            <User size={30} className="text-indigo-600" />
          </div>

          <div>
            <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
              {user?.name || "Your Profile"}
            </h2>
            <p className="text-sm text-slate-500 dark:text-slate-400">
              Personal Finance Account
            </p>
          </div>
        </div>

        <div className="space-y-5">
          <div>
            <label className="mb-2 block text-sm font-medium text-slate-700 dark:text-slate-300">
              Full Name
            </label>
            <div className="flex items-center gap-3 rounded-lg border border-slate-200 px-3 dark:border-slate-700">
              <User size={18} className="text-slate-400 dark:text-slate-400" />
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Enter your name"
                className="w-full py-3 text-sm outline-none"
              />
            </div>
          </div>

          <div>
            <label className="mb-2 block text-sm font-medium text-slate-700 dark:text-slate-300">
              Email Address
            </label>
            <div className="flex items-center gap-3 rounded-lg border border-slate-200 bg-slate-50 px-3 dark:border-slate-700 dark:bg-slate-800">
              <Mail size={18} className="text-slate-400 dark:text-slate-400" />
              <input
                value={user?.email ?? ""}
                readOnly
                className="w-full bg-transparent py-3 text-sm outline-none"
              />
            </div>
          </div>

          <div className="flex items-center gap-2 text-sm text-green-700 dark:text-green-300">
            <ShieldCheck size={18} />
            Your account is protected.
          </div>

          <button
            onClick={handleSave}
            disabled={saving}
            className="flex items-center gap-2 rounded-lg bg-indigo-600 px-5 py-3 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
          >
            <Save size={17} />
            {saving ? "Saving..." : "Save Changes"}
          </button>

          {message && (
            <p className="text-sm text-slate-600 dark:text-slate-300">{message}</p>
          )}
        </div>
      </div>
    </div>
  );
}