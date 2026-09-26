export function inr(n) {
  const v = Number(n ?? 0);
  if (!Number.isFinite(v)) return "₹0";
  return `₹${v.toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;
}

export function fmtDate(v) {
  if (!v) return "—";
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString("en-IN", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
}

export function fmtDay(v) {
  if (!v) return "—";
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
}

const RISK_STYLES = {
  LOW: "bg-emerald-500/15 text-emerald-300 border-emerald-500/30",
  MEDIUM: "bg-amber-500/15 text-amber-300 border-amber-500/30",
  HIGH: "bg-rose-500/15 text-rose-300 border-rose-500/30",
};

const STATUS_STYLES = {
  COMPLETED: "bg-emerald-500/15 text-emerald-300 border-emerald-500/30",
  PENDING: "bg-sky-500/15 text-sky-300 border-sky-500/30",
  UNDER_REVIEW: "bg-amber-500/15 text-amber-300 border-amber-500/30",
  BLOCKED: "bg-rose-500/15 text-rose-300 border-rose-500/30",
  FAILED: "bg-rose-500/15 text-rose-300 border-rose-500/30",
  REVERSED: "bg-zinc-500/15 text-zinc-300 border-zinc-500/30",
  OPEN: "bg-rose-500/15 text-rose-300 border-rose-500/30",
  REVIEWING: "bg-amber-500/15 text-amber-300 border-amber-500/30",
  RESOLVED_APPROVED: "bg-emerald-500/15 text-emerald-300 border-emerald-500/30",
  RESOLVED_REJECTED: "bg-zinc-500/15 text-zinc-300 border-zinc-500/30",
};

export function riskBadge(level) {
  const key = String(level || "").toUpperCase();
  return `inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-semibold ${RISK_STYLES[key] || "bg-zinc-500/15 text-zinc-300 border-zinc-500/30"}`;
}

export function statusBadge(status) {
  const key = String(status || "").toUpperCase();
  return `inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-semibold ${STATUS_STYLES[key] || "bg-zinc-500/15 text-zinc-300 border-zinc-500/30"}`;
}

/** Fraud factor may be a string ("CODE") or an object ({ code, detail, points }). */
export function factorLabel(f) {
  if (f == null) return "";
  if (typeof f === "string") return f.replace(/_/g, " ");
  if (typeof f === "object") {
    const code = String(f.code || "").replace(/_/g, " ");
    if (f.detail) return `${code} — ${f.detail}`;
    if (f.points != null) return `${code} (+${f.points})`;
    return code || JSON.stringify(f);
  }
  return String(f);
}
