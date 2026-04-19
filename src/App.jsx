import { useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import Scene3D from './components/background/Scene3D.jsx';
import Compose from './components/screens/Compose.jsx';
import Parse from './components/screens/Parse.jsx';
import Backtest from './components/screens/Backtest.jsx';
import Diagnose from './components/screens/Diagnose.jsx';
import Deploy from './components/screens/Deploy.jsx';
import { parseStrategy } from './ai/parse.js';
import { generateVerdict } from './ai/verdict.js';
import { proposeCounterfactuals } from './ai/counterfactuals.js';
import { runBacktest } from './engine/backtest.js';
import { store, useStore } from './state/store.js';

export default function App() {
  const stage = useStore((s) => s.stage);
  const rawInput = useStore((s) => s.raw_input);
  const hasResult = useStore((s) => !!s.backtest);

  useEffect(() => {
    // Simulate paper-trading forward for any deployed strategies on mount.
    const deployed = store.get().deployed;
    if (deployed.length) {
      const updated = deployed.map(advanceDeployment);
      store.set({ deployed: updated });
    }
  }, []);

  async function handleRun() {
    const input = store.get().raw_input;
    if (!input.trim()) return;
    store.set({ stage: 'parse', parse_stream: [], parse_status: 'parsing' });

    // Scroll the parse section into view
    setTimeout(() => {
      document.getElementById('workspace')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 50);

    let parsed = null;
    for await (const evt of parseStrategy(input)) {
      if (evt.type === 'line') {
        store.set((s) => ({ parse_stream: [...s.parse_stream, evt.line] }));
      } else if (evt.type === 'parsed') {
        parsed = evt.parsed;
      }
    }
    store.set({ parsed, parse_status: 'done' });
  }

  async function handleBacktest() {
    const parsed = store.get().parsed;
    if (!parsed) return;
    store.set({ stage: 'backtest', backtest_status: 'running', backtest_progress: 0, backtest: null, verdict: null, counterfactuals: [] });
    setTimeout(() => {
      document.getElementById('stage-backtest')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 50);

    // Fake progress bar to let the UI breathe. The real work is near-instant.
    const progressStart = performance.now();
    const PROGRESS_DURATION = 1400;
    let raf;
    const tick = () => {
      const elapsed = performance.now() - progressStart;
      const t = Math.min(1, elapsed / PROGRESS_DURATION);
      store.set({ backtest_progress: t });
      if (t < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);

    // Run the actual backtest synchronously (it's fast).
    const config = {
      initial_capital: parsed.position_sizing?.type === 'fixed_amount' ? 0 : 10000,
      fees_per_trade: 3,
    };
    const result = runBacktest(parsed, config);

    // Wait for the progress animation to finish for visual smoothness
    await new Promise((r) => setTimeout(r, PROGRESS_DURATION));
    cancelAnimationFrame(raf);

    store.set({ backtest: result, backtest_status: 'done', backtest_progress: 1 });

    // Kick off verdict + counterfactuals in parallel
    const rawInput = store.get().raw_input;
    store.set({ verdict_status: 'running', counterfactual_status: 'running' });
    generateVerdict({ input: rawInput, parsed, result }).then((v) => store.set({ verdict: v, verdict_status: 'done' }));

    const cfs = proposeCounterfactuals(parsed);
    const computed = cfs.map((cf) => ({
      name: cf.name,
      parsed: cf.parsed,
      result: runBacktest(cf.parsed, config),
    }));
    store.set({ counterfactuals: computed, counterfactual_status: 'done' });

    setTimeout(() => {
      document.getElementById('stage-diagnose')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 1600);
  }

  function resetToCompose() {
    store.reset();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  return (
    <div className="relative min-h-screen" style={{ color: 'var(--color-ink)' }}>
      <Scene3D />

      <main className="relative z-10">
        <TopNav onReset={resetToCompose} hasWork={stage !== 'compose' || rawInput.length > 0} />

        <Compose onRun={handleRun} />

        <AnimatePresence>
          {(stage === 'parse' || stage === 'backtest') && (
            <motion.div
              id="workspace"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6 }}
              className="pt-24"
            >
              <Parse onProceed={handleBacktest} />
            </motion.div>
          )}
        </AnimatePresence>

        <AnimatePresence>
          {stage === 'backtest' && (
            <motion.div
              id="stage-backtest"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6 }}
              className="pt-24"
            >
              <Backtest />
            </motion.div>
          )}
        </AnimatePresence>

        <AnimatePresence>
          {stage === 'backtest' && hasResult && (
            <motion.div
              id="stage-diagnose"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.2, duration: 0.6 }}
            >
              <Diagnose />
              <Deploy />
            </motion.div>
          )}
        </AnimatePresence>

        <Footer />
      </main>
    </div>
  );
}

function TopNav({ onReset, hasWork }) {
  return (
    <nav className="fixed top-0 left-0 right-0 z-20 px-6 py-5 flex justify-between items-center">
      <button
        type="button"
        onClick={onReset}
        className="font-mono text-[13px] tracking-[0.12em] uppercase"
        style={{ color: 'var(--color-graphite)' }}
      >
        paperforge<span style={{ color: 'var(--color-signal)' }}>.</span>
      </button>
      {hasWork && (
        <button
          type="button"
          onClick={onReset}
          className="uppercase-label hover:text-[var(--color-ink)]"
        >
          NEW STRATEGY ↻
        </button>
      )}
    </nav>
  );
}

function Footer() {
  return (
    <footer className="relative z-10 px-6 py-10 mt-20">
      <div className="max-w-[1100px] mx-auto hairline pt-6">
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-3">
          <div className="font-mono text-[11px]" style={{ color: 'var(--color-slate)', letterSpacing: '0.04em' }}>
            paperforge.app — a strategy laboratory.
          </div>
          <div className="uppercase-label-sm">NOT FINANCIAL ADVICE. NOT A BROKER.</div>
        </div>
      </div>
    </footer>
  );
}

function advanceDeployment(rec) {
  // Deterministic paper advance: use the current date to simulate passing time
  // since last_check. Tiny random walk based on strategy id seed.
  const lastCheck = new Date(rec.last_check);
  const now = new Date();
  const days = Math.max(0, Math.floor((now - lastCheck) / 86400000));
  if (!days) return rec;
  let seed = 0;
  for (const c of rec.id) seed = (seed * 31 + c.charCodeAt(0)) | 0;
  const rand = (() => { let a = seed | 0; return () => { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; })();
  let cur = rec.cumulative_return_pct || 0;
  let trades = rec.trades_since_deploy || 0;
  for (let i = 0; i < days; i++) {
    const daily = (rand() - 0.48) * 1.0;
    cur = cur + daily * (1 - Math.abs(cur) / 100);
    if (rand() < 0.03) trades++;
  }
  return {
    ...rec,
    cumulative_return_pct: cur,
    trades_since_deploy: trades,
    last_check: now.toISOString(),
  };
}
