import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { store, useStore } from '../../state/store.js';
import { uniqueId, formatPct, daysBetween } from '../../lib/util.js';

export default function Deploy() {
  const parsed = useStore((s) => s.parsed);
  const rawInput = useStore((s) => s.raw_input);
  const backtest = useStore((s) => s.backtest);
  const deployed = useStore((s) => s.deployed);
  const activeId = useStore((s) => s.active_strategy_id);
  const [justDeployed, setJustDeployed] = useState(null);

  if (!backtest || !parsed) return null;
  const alreadyDeployed = deployed.find((d) => d.id === activeId);

  function handleDeploy() {
    const id = uniqueId();
    const rec = {
      id,
      input: rawInput,
      parsed,
      deployed_at: new Date().toISOString(),
      live_log: [],
      last_check: new Date().toISOString(),
      start_value: backtest.metrics.strategy.finalValue,
      cur_value: backtest.metrics.strategy.finalValue,
      cumulative_return_pct: 0,
      trades_since_deploy: 0,
    };
    store.set((s) => ({ deployed: [...s.deployed, rec], active_strategy_id: id }));
    setJustDeployed(rec);
  }

  const display = justDeployed || alreadyDeployed;

  return (
    <section className="w-full max-w-[780px] mx-auto px-6 pt-12 pb-40 fade-up">
      <div className="flex items-center gap-3 mb-8">
        <span className="uppercase-label">SEND THIS LIVE?</span>
        <span className="flex-1 hairline" />
      </div>

      {!display && (
        <div className="space-y-6">
          <p className="font-serif" style={{ fontSize: 19, lineHeight: 1.6, color: 'var(--color-graphite)' }}>
            your strategy will run in paper mode. every market morning at 09:30 ET (14:30 UK),
            it will check the conditions and record what trade it would have made. no real orders.
            no broker. just a growing log of what this idea would have done with real money.
          </p>
          <p className="font-serif" style={{ fontSize: 19, lineHeight: 1.6, color: 'var(--color-graphite)' }}>
            you can come back whenever. your strategy keeps running without you.
          </p>
          <div className="pt-6 flex justify-center">
            <button
              type="button"
              onClick={handleDeploy}
              className="font-mono wavy-underline text-[15px]"
              style={{ background: 'none', border: 'none', padding: '4px 0', color: 'var(--color-ink)' }}
            >
              deploy
            </button>
          </div>
        </div>
      )}

      {display && (
        <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6 }}>
          <div
            className="px-6 py-5 mb-8"
            style={{ background: 'var(--color-terminal)', border: '1px solid var(--color-grid)' }}
          >
            <div className="uppercase-label mb-3">DEPLOYED</div>
            <p className="font-mono text-[14px] tabular mb-4" style={{ color: 'var(--color-ink)' }}>
              "{display.input}"
            </p>
            <div className="font-mono text-[12.5px] tabular space-y-1" style={{ color: 'var(--color-graphite)' }}>
              <div className="flex justify-between">
                <span>NEXT CHECK</span>
                <span>{describeNextCheck()}</span>
              </div>
              <div className="flex justify-between">
                <span>TRACKING SINCE</span>
                <span>{new Date(display.deployed_at).toLocaleString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}</span>
              </div>
              <div className="flex justify-between">
                <span>STRATEGY ID</span>
                <span style={{ color: 'var(--color-signal)' }}>{display.id}</span>
              </div>
            </div>
          </div>
        </motion.div>
      )}

      {deployed.length > 0 && <DeployedList deployed={deployed} />}

      <div className="mt-20 uppercase-label-sm" style={{ color: 'var(--color-ghost)' }}>
        PAPERFORGE IS A STRATEGY SIMULATOR. BACKTESTS ARE NOT PREDICTIONS. HISTORICAL
        PERFORMANCE DOES NOT GUARANTEE FUTURE RESULTS.
      </div>
    </section>
  );
}

function DeployedList({ deployed }) {
  return (
    <div className="mt-16">
      <div className="flex items-center gap-3 mb-4">
        <span className="uppercase-label">DEPLOYED STRATEGIES ({deployed.length})</span>
        <span className="flex-1 hairline" />
      </div>
      <div className="font-mono text-[12.5px] tabular">
        <div
          className="grid grid-cols-[2fr_0.6fr_0.7fr_0.5fr] py-2 uppercase-label-sm"
          style={{ borderBottom: '1px solid var(--color-grid)' }}
        >
          <span>STRATEGY</span>
          <span className="text-right">LIVE</span>
          <span className="text-right">RETURN</span>
          <span className="text-right">TRADES</span>
        </div>
        {deployed.map((d) => {
          const days = daysBetween(new Date(d.deployed_at), new Date());
          const retColor = d.cumulative_return_pct > 0 ? 'var(--color-profit)' : d.cumulative_return_pct < 0 ? 'var(--color-loss)' : 'var(--color-ink)';
          return (
            <div
              key={d.id}
              className="grid grid-cols-[2fr_0.6fr_0.7fr_0.5fr] py-2"
              style={{ borderBottom: '1px solid var(--color-grid)', color: 'var(--color-graphite)' }}
            >
              <span className="truncate pr-2" title={d.input} style={{ color: 'var(--color-ink)' }}>{d.input}</span>
              <span className="text-right">{days}d</span>
              <span className="text-right" style={{ color: retColor }}>{formatPct(d.cumulative_return_pct, 1)}</span>
              <span className="text-right">{d.trades_since_deploy}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function describeNextCheck() {
  // next monday 09:30 ET
  const now = new Date();
  const next = new Date(now);
  const day = now.getDay();
  const offset = day === 0 ? 1 : day === 6 ? 2 : day >= 1 && day <= 5 ? 1 : 1;
  next.setDate(now.getDate() + offset);
  next.setHours(14, 30, 0, 0); // 09:30 ET ≈ 14:30 UK
  const diffMs = next - now;
  const hours = Math.max(0, Math.floor(diffMs / 3600000));
  const days = Math.floor(hours / 24);
  const remHours = hours % 24;
  return `IN ${days}D ${remHours}H`;
}
