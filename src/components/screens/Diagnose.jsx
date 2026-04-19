import { useMemo } from 'react';
import { motion } from 'framer-motion';
import Histogram from '../chart/Histogram.jsx';
import RegimeBars from '../chart/RegimeBars.jsx';
import { returnsHistogram } from '../../engine/metrics.js';
import { regimeAnalysis } from '../../engine/backtest.js';
import { useStore } from '../../state/store.js';
import { formatPct } from '../../lib/util.js';

export default function Diagnose() {
  const result = useStore((s) => s.backtest);
  const counterfactuals = useStore((s) => s.counterfactuals);

  const histogram = useMemo(() => (result ? returnsHistogram(result.trades) : null), [result]);
  const regimes = useMemo(() => (result ? regimeAnalysis(result) : null), [result]);
  if (!result) return null;

  const { returns } = histogram;
  const bestTrade = returns.length ? Math.max(...returns) : null;
  const worstTrade = returns.length ? Math.min(...returns) : null;
  const top10Pct = returns.length ? concentratedProfit(returns) : null;

  const bull = regimes.bull, bear = regimes.bear;

  return (
    <section className="w-full max-w-[1100px] mx-auto px-6 pt-20 pb-8">
      <div className="flex items-center gap-3 mb-10">
        <span className="uppercase-label">DIAGNOSIS</span>
        <span className="flex-1 hairline" />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <Panel title="DISTRIBUTION OF RETURNS">
          {histogram ? <Histogram data={histogram} /> : null}
          <p className="font-serif mt-3" style={{ fontSize: 14, color: 'var(--color-graphite)', lineHeight: 1.5 }}>
            {returns.length === 0
              ? 'no closed trades in the window. every position is still open.'
              : `${returns.length} closed trades. best: ${formatPct(bestTrade, 1)}. worst: ${formatPct(worstTrade, 1)}.${top10Pct != null ? ` ${top10Pct.toFixed(0)}% of profit came from the top 10% of trades.` : ''}`}
          </p>
        </Panel>

        <Panel title="REGIME ANALYSIS">
          <RegimeBars data={regimes} />
          <p className="font-serif mt-3" style={{ fontSize: 14, color: 'var(--color-graphite)', lineHeight: 1.5 }}>
            {regimeNarrative(regimes)}
          </p>
        </Panel>

        <Panel title="COUNTERFACTUALS">
          <CounterfactualTable base={result.metrics.strategy.totalReturnPct} list={counterfactuals} />
          <p className="font-serif mt-3" style={{ fontSize: 14, color: 'var(--color-graphite)', lineHeight: 1.5 }}>
            {counterfactualNarrative(counterfactuals, result.metrics.strategy.totalReturnPct)}
          </p>
        </Panel>
      </div>
    </section>
  );
}

function Panel({ title, children }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5 }}
      className="px-5 py-5"
      style={{ background: 'var(--color-terminal)', border: '1px solid var(--color-grid)' }}
    >
      <div className="uppercase-label mb-4">{title}</div>
      {children}
    </motion.div>
  );
}

function CounterfactualTable({ base, list }) {
  return (
    <div className="font-mono text-[12.5px] tabular">
      <div className="flex justify-between py-1.5" style={{ borderBottom: '1px solid var(--color-grid)' }}>
        <span style={{ color: 'var(--color-ink)' }}>original strategy</span>
        <span style={{ color: 'var(--color-ink)' }}>{formatPct(base, 1)}</span>
      </div>
      {list.map((cf, i) => {
        const delta = cf.result ? cf.result.metrics.strategy.totalReturnPct - base : null;
        return (
          <div key={i} className="flex justify-between py-1.5" style={{ borderBottom: i === list.length - 1 ? 'none' : '1px solid var(--color-grid)' }}>
            <span style={{ color: 'var(--color-graphite)', maxWidth: 220, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {cf.name}
            </span>
            <span className="flex gap-3">
              <span>{cf.result ? formatPct(cf.result.metrics.strategy.totalReturnPct, 1) : '—'}</span>
              {delta != null && (
                <span style={{ color: delta > 0 ? 'var(--color-profit)' : 'var(--color-loss)', minWidth: 64, textAlign: 'right' }}>
                  ({delta > 0 ? '+' : ''}{delta.toFixed(1)}%)
                </span>
              )}
            </span>
          </div>
        );
      })}
    </div>
  );
}

function concentratedProfit(returns) {
  const wins = returns.filter((r) => r > 0).sort((a, b) => b - a);
  if (!wins.length) return null;
  const top = Math.max(1, Math.ceil(wins.length * 0.1));
  const topSum = wins.slice(0, top).reduce((s, v) => s + v, 0);
  const totalSum = wins.reduce((s, v) => s + v, 0);
  if (!totalSum) return null;
  return (topSum / totalSum) * 100;
}

function regimeNarrative(r) {
  const beats = Object.entries(r)
    .filter(([_, v]) => v.strat > v.bench && v.days > 10)
    .map(([k]) => k);
  const loses = Object.entries(r)
    .filter(([_, v]) => v.strat < v.bench && v.days > 10)
    .map(([k]) => k);
  if (beats.length && loses.length) return `outperforms in ${beats.join(', ')}. underperforms in ${loses.join(', ')}.`;
  if (beats.length) return `outperforms across ${beats.join(', ')}. no regime where it decisively loses.`;
  if (loses.length) return `underperforms in ${loses.join(', ')}. a regime-specific weakness.`;
  return 'behaves similarly across regimes. no obvious sensitivity.';
}

function counterfactualNarrative(list, base) {
  const best = list
    .map((c) => ({ c, delta: c.result ? c.result.metrics.strategy.totalReturnPct - base : 0 }))
    .sort((a, b) => b.delta - a.delta)[0];
  if (!best) return '';
  if (Math.abs(best.delta) < 0.5) return 'none of the variations move the needle much. the strategy is insensitive in this neighbourhood.';
  if (best.delta > 0) return `the biggest win: "${best.c.name}" — adds ${best.delta.toFixed(1)}%.`;
  return `even the best alternative is worse. your spec is already the local best.`;
}
