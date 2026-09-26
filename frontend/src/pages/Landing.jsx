import { Link } from "react-router-dom";

export default function Landing() {
  return (
    <div className="min-h-screen bg-[#060a14]">
      <nav className="fixed top-0 z-50 border-b border-white/10 bg-[#060a14]/80 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3">
          <Link to="/" className="font-display text-lg font-bold tracking-tight">
            NEXA <span className="text-nexa-300">Wallet</span>
          </Link>
          <div className="flex items-center gap-4">
            <Link to="/login" className="text-sm text-slate-300 hover:text-white transition">Sign in</Link>
            <Link to="/register" className="rounded-full bg-nexa-500 px-4 py-2 text-sm font-semibold text-white transition hover:bg-nexa-500/90">Get Started</Link>
          </div>
        </div>
      </nav>

      <section className="relative pt-32 pb-20 px-4">
        <div className="mx-auto max-w-4xl text-center">
          <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.03] px-4 py-1.5 text-xs font-medium text-slate-400">
            <span className="inline-flex h-2 w-2 rounded-full bg-emerald-400"></span>
            Demo Environment — No Real Money
          </div>
          <h1 className="font-display text-5xl md:text-7xl font-bold tracking-tight mb-6">
            NEXA <span className="text-nexa-300">Wallet</span>
          </h1>
          <p className="mb-10 max-w-2xl mx-auto text-base md:text-lg text-slate-400">
            A security-first digital wallet built around intelligent payments, explainable fraud detection, privacy protection, and user-controlled financial security.
          </p>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
            <Link to="/register" className="inline-flex items-center gap-2 rounded-full bg-nexa-500 px-6 py-3 text-base font-semibold text-white transition hover:bg-nexa-500/90">Get Started</Link>
            <Link to="/login" className="inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/[0.05] px-6 py-3 text-base font-semibold text-slate-300 transition hover:bg-white/[0.1]">Explore NEXA Security</Link>
          </div>
        </div>
      </section>

      <section className="py-20 px-4">
        <div className="mx-auto max-w-6xl">
          <div className="mb-16 text-center">
            <h2 className="font-display text-3xl md:text-4xl font-bold text-white">Three Pillars of NEXA Security</h2>
            <p className="mx-auto mt-4 max-w-2xl text-slate-400">Every payment has a story. NEXA helps you understand it.</p>
          </div>
          <div className="mb-12 grid md:grid-cols-3 gap-6">
            <div className="card !p-6 hover:!border-nexa-500/30 transition border border-white/10">
              <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-nexa-500/10 text-2xl">🧠</div>
              <h3 className="font-display text-xl font-bold text-white">Explainable Fraud Intelligence</h3>
              <p className="mt-2 text-slate-400">Know why a payment is considered risky. NEXA explains the why behind every risk score.</p>
              <Link to="/login" className="mt-4 inline-block text-sm font-medium text-sky-400 hover:text-sky-300">Learn more →</Link>
            </div>
            <div className="card !p-6 hover:!border-nexa-500/30 transition border border-white/10">
              <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-nexa-500/10 text-2xl">👁</div>
              <h3 className="font-display text-xl font-bold text-white">Privacy Shield</h3>
              <p className="mt-2 text-slate-400">Control what others see. Hide your balance, mask transaction amounts, and manage your financial privacy.</p>
              <Link to="/login" className="mt-4 inline-block text-sm font-medium text-sky-400 hover:text-sky-300">Learn more →</Link>
            </div>
            <div className="card !p-6 hover:!border-nexa-500/30 transition border border-white/10">
              <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-nexa-500/10 text-2xl">🚨</div>
              <h3 className="font-display text-xl font-bold text-white">Emergency Wallet Lock</h3>
              <p className="mt-2 text-slate-400">Freeze your wallet instantly and block all sensitive operations when something feels wrong.</p>
              <Link to="/login" className="mt-4 inline-block text-sm font-medium text-sky-400 hover:text-sky-300">Learn more →</Link>
            </div>
          </div>
        </div>
      </section>

      <section className="border-t border-white/10 py-16 px-4">
        <div className="mx-auto max-w-4xl text-center">
          <div className="text-4xl mb-4">✦</div>
          <h2 className="font-display text-2xl md:text-3xl font-bold text-white">Intelligence behind every payment.</h2>
          <p className="mt-4 text-slate-400">NEXA Wallet doesn't just move money. It understands transactions, protects users, explains risk, and gives users control over their financial privacy.</p>
        </div>
      </section>

      <footer className="border-t border-white/10 py-8 px-4">
        <div className="mx-auto flex max-w-6xl items-center justify-between text-sm text-slate-500">
          <div className="font-display font-bold text-slate-400">NEXA <span className="text-nexa-300">Wallet</span></div>
          <div className="text-center">
            <p className="text-xs">Pay Smart. Stay Protected.</p>
            <p className="mt-1 text-xs text-slate-600">Engineered by Mohd Manzoor Hussain Siddiqui</p>
          </div>
          <div className="text-xs text-slate-600">© 2026 NEXA Wallet. All rights reserved.</div>
        </div>
      </footer>
    </div>
  );
}
