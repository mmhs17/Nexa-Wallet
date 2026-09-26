import { Link, NavLink, Outlet, useNavigate } from "react-router-dom";
import { useState } from "react";
import { useAuth } from "../context/AuthContext.jsx";

const NAV = [
  { to: "/dashboard", label: "Dashboard" },
  { to: "/wallet", label: "Wallet" },
  { to: "/send", label: "Send Money" },
  { to: "/request-money", label: "Request Money" },
  { to: "/requests", label: "Requests" },
  { to: "/recurring", label: "Recurring" },
  { to: "/beneficiaries", label: "Beneficiaries" },
  { to: "/add-money", label: "Add Money" },
  { to: "/transactions", label: "Transactions" },
  { to: "/notifications", label: "Notifications" },
  { to: "/fraud/alerts", label: "Fraud Alerts" },
  { to: "/fraud/history", label: "Risk History" },
  { to: "/analytics", label: "Analytics" },
  { to: "/intelligence", label: "NEXA AI" },
  { to: "/security", label: "Security" },
  { to: "/privacy", label: "Privacy" },
];

export default function Layout() {
  const { user, logout } = useAuth();
  const [lockFlash, setLockFlash] = useState(null);
  const navigate = useNavigate();

  const doLogout = async (all = false) => {
    await logout(all);
    navigate("/login");
  };

  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-20 border-b border-white/10 bg-[#0a0f1e]/90 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-4 py-3">
          <Link to="/dashboard" className="font-display text-lg font-bold tracking-tight">
            NEXA <span className="text-nexa-300">Wallet</span>
          </Link>
          <div className="flex items-center gap-2 text-sm text-slate-300">
            <span className="hidden sm:inline">{user?.fullName || user?.username}</span>
            <span className="rounded-full border border-white/10 bg-white/[0.05] px-2 py-0.5 text-[11px] uppercase tracking-wider text-slate-400">
              {user?.role || "USER"}
            </span>
            <button className="btn-ghost px-3 py-1.5 text-xs" onClick={() => doLogout(false)}>Logout</button>
          </div>
        </div>
      </header>
      {lockFlash && <div className="mx-auto mt-3 max-w-6xl px-4"><div className="alert-info">{lockFlash}</div></div>}
      <div className="mx-auto grid max-w-6xl gap-4 px-4 py-5 md:grid-cols-[220px_1fr]">
        <aside className="card !p-3 h-fit md:sticky md:top-[64px]">
          <nav className="flex flex-row flex-wrap gap-1 md:flex-col">
            {NAV.map((n) => (
              <NavLink key={n.to} to={n.to} className={({ isActive }) => `nav-link${isActive ? " active" : ""}`}>
                {n.label}
              </NavLink>
            ))}
            {user?.role === "ADMIN" && (
              <NavLink to="/admin" className={({ isActive }) => `nav-link${isActive ? " active" : ""}`}>
                Admin Command
              </NavLink>
            )}
          </nav>
        </aside>
        <main className="min-w-0">
          <Outlet context={[lockFlash, setLockFlash]} />
        </main>
      </div>
    </div>
  );
}
