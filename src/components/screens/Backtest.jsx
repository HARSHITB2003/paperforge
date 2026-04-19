import { useEffect, useState } from 'react';
import { motion, useMotionValue, animate as fmAnimate } from 'framer-motion';
import EquityChart from '../chart/EquityChart.jsx';
import StatGrid from '../ui/StatGrid.jsx';
import Verdict from '../ui/Verdict.jsx';
import { useStore } from '../../state/store.js';

export default function Backtest() {
  const result = useStore((s) => s.backtest);
  const status = useStore((s) => s.backtest_status);
  const progress = useStore((s) => s.backtest_progress);
  const verdict = useStore((s) => s.verdict);

  const [draw, setDraw] = useState(0);

  useEffect(() => {
    if (status === 'done') {
      setDraw(0);
      const start = performance.now();
      let raf;
      const tick = () => {
        const elapsed = performance.now() - start;
        const t = Math.min(1, elapsed / 1800);
        setDraw(easeOut(t));
        if (t < 1) raf = requestAnimationFrame(tick);
      };
      raf = requestAnimationFrame(tick);
      return () => cancelAnimationFrame(raf);
    }
  }, [status, result]);

  if (status === 'running' || !result) {
    return (
      <section className="w-full max-w-[1100px] mx-auto px-6 pt-4 pb-20">
        <div className="flex items-center gap-3 mb-4">
          <span className="uppercase-label">BACKTEST</span>
          <span className="flex-1 hairline" />
          <span className="uppercase-label-sm" style={{ color: 'var(--color-hold)' }}>
            SIMULATING {Math.round(2520 * (progress || 0))} / 2,520 TRADING DAYS
          </span>
        </div>
        <div
          className="w-full relative shimmer"
          style={{ background: 'var(--color-terminal)', border: '1px solid var(--color-grid)', height: 500 }}
        >
          <div
            className="absolute left-0 top-0 h-full"
            style={{
              width: `${(progress || 0) * 100}%`,
              background: 'linear-gradient(90deg, transparent, rgba(77,143,255,0.08))',
              borderRight: '1px solid var(--color-signal)',
            }}
          />
        </div>
      </section>
    );
  }

  return (
    <section className="w-full max-w-[1100px] mx-auto px-6 pt-4 pb-8 fade-up">
      <EquityChart result={result} drawProgress={draw} />
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 1.8, duration: 0.6 }}
        className="mt-10"
      >
        <StatGrid result={result} />
      </motion.div>
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 2.3, duration: 0.6 }}
        className="mt-16"
      >
        <Verdict verdict={verdict} />
      </motion.div>
    </section>
  );
}

function easeOut(t) {
  return 1 - Math.pow(1 - t, 3);
}
