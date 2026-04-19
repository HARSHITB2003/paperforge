export default function RegimeBars({ data }) {
  const rows = [
    { key: 'bull', label: 'BULL' },
    { key: 'bear', label: 'BEAR' },
    { key: 'sideways', label: 'SIDEWAYS' },
    { key: 'highVol', label: 'HIGH VOL' },
  ];

  const all = rows.flatMap((r) => [data[r.key]?.strat ?? 0, data[r.key]?.bench ?? 0]);
  const max = Math.max(10, ...all.map((v) => Math.abs(v)));

  return (
    <div className="flex flex-col gap-3">
      {rows.map((r) => {
        const d = data[r.key] || { strat: 0, bench: 0, days: 0 };
        const stratW = (Math.abs(d.strat) / max) * 100;
        const benchW = (Math.abs(d.bench) / max) * 100;
        return (
          <div key={r.key}>
            <div className="flex justify-between uppercase-label-sm mb-1">
              <span>{r.label}</span>
              <span>{d.days || 0} DAYS</span>
            </div>
            <div className="relative h-2 mb-1" style={{ background: 'var(--color-grid)' }}>
              <div
                className="absolute h-full"
                style={{
                  width: `${stratW}%`,
                  background: d.strat >= 0 ? 'var(--color-signal)' : 'var(--color-loss)',
                  [d.strat >= 0 ? 'left' : 'right']: '0',
                }}
              />
            </div>
            <div className="relative h-2 mb-1" style={{ background: 'var(--color-grid)' }}>
              <div
                className="absolute h-full"
                style={{
                  width: `${benchW}%`,
                  background: d.bench >= 0 ? 'var(--color-graphite)' : 'var(--color-loss)',
                  opacity: 0.6,
                  [d.bench >= 0 ? 'left' : 'right']: '0',
                }}
              />
            </div>
            <div className="flex justify-between text-[11px] font-mono tabular" style={{ color: 'var(--color-graphite)' }}>
              <span style={{ color: d.strat >= 0 ? 'var(--color-profit)' : 'var(--color-loss)' }}>
                STRAT {d.strat >= 0 ? '+' : ''}
                {d.strat.toFixed(1)}%
              </span>
              <span>BENCH {d.bench >= 0 ? '+' : ''}{d.bench.toFixed(1)}%</span>
            </div>
          </div>
        );
      })}
    </div>
  );
}
