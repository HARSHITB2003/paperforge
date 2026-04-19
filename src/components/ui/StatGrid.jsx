import { formatMoney, formatPct, formatNum } from '../../lib/util.js';

function Row({ label, a, b, format, winner }) {
  const aClass = winner === 'strategy' ? 'text-[var(--color-profit)]' : winner === 'benchmark' ? 'text-[var(--color-ink)]' : 'text-[var(--color-ink)]';
  const bClass = winner === 'benchmark' ? 'text-[var(--color-profit)]' : winner === 'strategy' ? 'text-[var(--color-ink)]' : 'text-[var(--color-graphite)]';
  return (
    <div className="grid grid-cols-[1.3fr_1fr_1fr] py-1.5 items-baseline text-[13px] font-mono tabular">
      <div style={{ color: 'var(--color-graphite)' }}>{label}</div>
      <div className={`text-right ${aClass}`}>{format(a)}</div>
      <div className={`text-right ${bClass}`}>{b == null ? '—' : format(b)}</div>
    </div>
  );
}

function Section({ title, children }) {
  return (
    <div className="mb-4">
      <div className="flex items-center gap-3 mb-2">
        <span className="uppercase-label">{title}</span>
        <span className="flex-1 hairline" />
      </div>
      {children}
    </div>
  );
}

export default function StatGrid({ result }) {
  const { strategy: s, benchmark: b, activity: a } = result.metrics;

  const w = (sv, bv, better = 'higher') => {
    if (sv == null || bv == null) return null;
    if (better === 'higher') return sv > bv ? 'strategy' : 'benchmark';
    return sv < bv ? 'strategy' : 'benchmark';
  };

  return (
    <div
      className="w-full px-6 py-5"
      style={{ background: 'var(--color-terminal)', border: '1px solid var(--color-grid)' }}
    >
      <div className="grid grid-cols-[1.3fr_1fr_1fr] py-1.5 items-baseline text-[11px] font-mono uppercase-label">
        <div></div>
        <div className="text-right">STRATEGY</div>
        <div className="text-right">BENCHMARK</div>
      </div>
      <div className="hairline my-1.5" />

      <Section title="TOTAL RETURN">
        <Row
          label="absolute"
          a={s.totalReturnAbs}
          b={b.totalReturnAbs}
          format={(v) => formatMoney(v)}
          winner={w(s.totalReturnAbs, b.totalReturnAbs)}
        />
        <Row
          label="percent"
          a={s.totalReturnPct}
          b={b.totalReturnPct}
          format={(v) => formatPct(v, 1)}
          winner={w(s.totalReturnPct, b.totalReturnPct)}
        />
        <Row
          label="annualised (cagr)"
          a={s.cagr}
          b={b.cagr}
          format={(v) => formatPct(v, 1)}
          winner={w(s.cagr, b.cagr)}
        />
      </Section>

      <Section title="RISK">
        <Row
          label="max drawdown"
          a={s.maxDrawdown}
          b={b.maxDrawdown}
          format={(v) => `${v.toFixed(1)}%`}
          winner={w(s.maxDrawdown, b.maxDrawdown, 'higher')}
        />
        <Row
          label="volatility (annualised)"
          a={s.volatility}
          b={b.volatility}
          format={(v) => `${v.toFixed(1)}%`}
          winner={w(s.volatility, b.volatility, 'lower')}
        />
        <Row label="sharpe ratio" a={s.sharpe} b={b.sharpe} format={(v) => formatNum(v, 2)} winner={w(s.sharpe, b.sharpe)} />
        <Row label="sortino ratio" a={s.sortino} b={b.sortino} format={(v) => formatNum(v, 2)} winner={w(s.sortino, b.sortino)} />
      </Section>

      <Section title="ACTIVITY">
        <Row label="total trades" a={a.total} b={1} format={(v) => String(v)} />
        <Row
          label="win rate"
          a={a.winRate}
          b={null}
          format={(v) => (v == null ? '—' : `${v.toFixed(1)}%`)}
        />
        <Row
          label="avg hold time"
          a={a.avgHoldDays}
          b={null}
          format={(v) => (v ? `${v.toFixed(0)} days` : 'open')}
        />
        <Row
          label="fees paid (est.)"
          a={a.fees}
          b={3}
          format={(v) => `£${Math.round(v).toLocaleString('en-GB')}`}
        />
      </Section>
    </div>
  );
}
