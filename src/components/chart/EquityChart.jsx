import { useMemo, useRef, useState } from 'react';
import { drawdownPeriods } from '../../engine/metrics.js';
import { formatDateShort } from '../../lib/util.js';

export default function EquityChart({ result, height = 500, drawProgress = 1 }) {
  const svgRef = useRef(null);
  const [hover, setHover] = useState(null);
  const [logScale, setLogScale] = useState(true);

  const { equity_curve, benchmark_curve } = result;

  const { width, pathStrategy, pathBenchmark, areaStrategy, yAxisTicks, xAxisTicks, toX, toY, maxValue, minValue, ddRects } = useMemo(() => {
    const W = 1100;
    const H = height;
    const padL = 64, padR = 24, padT = 24, padB = 40;
    const n = equity_curve.length;
    if (!n) return { width: W, pathStrategy: '', pathBenchmark: '', areaStrategy: '', yAxisTicks: [], xAxisTicks: [], toX: () => 0, toY: () => 0, maxValue: 0, minValue: 0, ddRects: [] };

    const all = equity_curve.map((p) => p.value).concat(benchmark_curve.map((p) => p.value));
    const rawMin = Math.max(1, Math.min(...all));
    const rawMax = Math.max(...all);

    const toV = (v) => (logScale ? Math.log(Math.max(1, v)) : v);
    const yMin = toV(rawMin);
    const yMax = toV(rawMax);
    const yRange = yMax - yMin || 1;

    const toX = (i) => padL + (i / Math.max(1, n - 1)) * (W - padL - padR);
    const toY = (v) => padT + (1 - (toV(v) - yMin) / yRange) * (H - padT - padB);

    // strategy path (respect drawProgress)
    const drawCount = Math.max(1, Math.floor(n * drawProgress));
    const stratPts = [];
    const benchPts = [];
    for (let i = 0; i < drawCount; i++) {
      stratPts.push(`${toX(i).toFixed(1)},${toY(equity_curve[i].value).toFixed(1)}`);
      benchPts.push(`${toX(i).toFixed(1)},${toY(benchmark_curve[i].value).toFixed(1)}`);
    }
    const pathStrategy = stratPts.length ? 'M' + stratPts.join(' L') : '';
    const pathBenchmark = benchPts.length ? 'M' + benchPts.join(' L') : '';
    const baselineY = H - padB;
    const areaStrategy = stratPts.length
      ? `M${toX(0)},${baselineY} L` + stratPts.join(' L') + ` L${toX(drawCount - 1)},${baselineY} Z`
      : '';

    // Axis ticks
    const yTickCount = 5;
    const yAxisTicks = [];
    for (let i = 0; i <= yTickCount; i++) {
      const fraction = i / yTickCount;
      const val = logScale
        ? Math.exp(yMin + fraction * yRange)
        : yMin + fraction * yRange;
      yAxisTicks.push({ y: toY(val), value: val });
    }
    const xAxisTicks = [];
    const yearBoundaries = [];
    for (let i = 0; i < n; i++) {
      const d = new Date(equity_curve[i].date);
      if (d.getMonth() === 0 && (i === 0 || new Date(equity_curve[i - 1].date).getFullYear() !== d.getFullYear())) {
        yearBoundaries.push({ i, year: d.getFullYear() });
      }
    }
    for (const yb of yearBoundaries) xAxisTicks.push({ x: toX(yb.i), label: String(yb.year) });

    const dds = drawdownPeriods(equity_curve).filter((d) => d.depth <= -0.1);
    const ddRects = dds.map((d) => ({
      x: toX(d.start),
      width: Math.max(1, toX(d.end) - toX(d.start)),
    }));

    return { width: W, pathStrategy, pathBenchmark, areaStrategy, yAxisTicks, xAxisTicks, toX, toY, maxValue: rawMax, minValue: rawMin, ddRects };
  }, [equity_curve, benchmark_curve, height, drawProgress, logScale]);

  function onPointerMove(e) {
    const rect = svgRef.current.getBoundingClientRect();
    const ratio = (e.clientX - rect.left) / rect.width;
    const scaledX = ratio * width;
    const n = equity_curve.length;
    const padL = 64, padR = 24;
    const innerW = width - padL - padR;
    const i = Math.round(((scaledX - padL) / innerW) * (n - 1));
    const clamped = Math.max(0, Math.min(n - 1, i));
    setHover({ i: clamped });
  }

  function onPointerLeave() {
    setHover(null);
  }

  const hoverData = hover
    ? {
        date: equity_curve[hover.i].date,
        strategy: equity_curve[hover.i].value,
        benchmark: benchmark_curve[hover.i].value,
        x: toX(hover.i),
      }
    : null;

  return (
    <div className="relative w-full">
      <div className="flex items-center justify-between mb-3">
        <div className="uppercase-label">EQUITY CURVE — STRATEGY VS BUY-AND-HOLD</div>
        <button
          type="button"
          onClick={() => setLogScale((v) => !v)}
          className="uppercase-label hover:text-[var(--color-ink)] transition-colors"
        >
          {logScale ? 'LOG' : 'LINEAR'} SCALE
        </button>
      </div>
      <div
        className="relative overflow-hidden"
        style={{ background: 'var(--color-terminal)', border: '1px solid var(--color-grid)' }}
      >
        <svg
          ref={svgRef}
          viewBox={`0 0 ${width} ${height}`}
          preserveAspectRatio="none"
          className="w-full"
          style={{ display: 'block', height }}
          onPointerMove={onPointerMove}
          onPointerLeave={onPointerLeave}
        >
          <defs>
            <linearGradient id="stratGlow" x1="0" x2="0" y1="0" y2="1">
              <stop offset="0%" stopColor="#4D8FFF" stopOpacity="0.28" />
              <stop offset="100%" stopColor="#4D8FFF" stopOpacity="0" />
            </linearGradient>
            <pattern id="grid-pattern" width="60" height="60" patternUnits="userSpaceOnUse">
              <path d="M 60 0 L 0 0 0 60" fill="none" stroke="#1E2433" strokeWidth="0.5" />
            </pattern>
          </defs>
          <rect x="0" y="0" width={width} height={height} fill="url(#grid-pattern)" opacity="0.4" />

          {/* Drawdown shading */}
          {ddRects.map((r, i) => (
            <rect key={i} x={r.x} y="0" width={r.width} height={height - 40} fill="#FF4D5E" opacity="0.05" />
          ))}

          {/* Y-axis grid */}
          {yAxisTicks.map((t, i) => (
            <g key={`y${i}`}>
              <line x1={64} x2={width - 24} y1={t.y} y2={t.y} stroke="#1E2433" strokeWidth="1" />
              <text
                x={58}
                y={t.y + 3}
                textAnchor="end"
                fontSize="10"
                fontFamily="JetBrains Mono, monospace"
                fill="#5F6B82"
              >
                £{Math.round(t.value).toLocaleString('en-GB')}
              </text>
            </g>
          ))}

          {/* X-axis year ticks */}
          {xAxisTicks.map((t, i) => (
            <g key={`x${i}`}>
              <line x1={t.x} x2={t.x} y1={24} y2={height - 40} stroke="#1E2433" strokeWidth="0.5" opacity="0.6" />
              <text
                x={t.x}
                y={height - 24}
                textAnchor="middle"
                fontSize="10"
                fontFamily="JetBrains Mono, monospace"
                fill="#5F6B82"
              >
                {t.label}
              </text>
            </g>
          ))}

          {/* Strategy area */}
          <path d={areaStrategy} fill="url(#stratGlow)" />
          {/* Benchmark dashed */}
          <path d={pathBenchmark} fill="none" stroke="#5F6B82" strokeWidth="1.5" strokeDasharray="4 2" />
          {/* Strategy line */}
          <path d={pathStrategy} fill="none" stroke="#4D8FFF" strokeWidth="2.5" strokeLinejoin="round" />

          {/* Trade dots (sampled so we don't draw 500 dots on a 2520 day chart) */}
          {result.trades.slice(0, 150).map((t, i) => {
            const idx = t.entry.dayIndex - (equity_curve[0] ? 0 : 0);
            if (idx >= equity_curve.length) return null;
            const x = toX(idx);
            const y = toY(equity_curve[idx].value);
            const profitable = t.exit && t.exit.value > t.entry.value;
            const open = !t.exit;
            return (
              <circle
                key={`trade-${i}`}
                cx={x}
                cy={y}
                r="2"
                fill={open ? '#FFC84A' : profitable ? '#00D395' : '#FF4D5E'}
                opacity="0.7"
              />
            );
          })}

          {/* Hover indicator */}
          {hoverData && (
            <>
              <line
                x1={hoverData.x}
                x2={hoverData.x}
                y1={24}
                y2={height - 40}
                stroke="#4D8FFF"
                strokeWidth="1"
                opacity="0.5"
              />
              <circle cx={hoverData.x} cy={toY(hoverData.strategy)} r="4" fill="#4D8FFF" />
              <circle cx={hoverData.x} cy={toY(hoverData.benchmark)} r="4" fill="#5F6B82" />
            </>
          )}
        </svg>

        {/* Floating quote panel */}
        {hoverData && (
          <div
            className="absolute pointer-events-none"
            style={{
              left: `${Math.min(72, (hoverData.x / width) * 100)}%`,
              top: 16,
              transform: hoverData.x / width > 0.8 ? 'translateX(-100%)' : 'translateX(12px)',
            }}
          >
            <div
              className="font-mono text-[11px] px-3 py-2"
              style={{ background: '#06080D', border: '1px solid #2A3244', minWidth: 200 }}
            >
              <div className="uppercase-label-sm mb-1.5">{formatDateShort(hoverData.date)}</div>
              <div className="flex justify-between gap-4 tabular">
                <span style={{ color: '#4D8FFF' }}>STRATEGY</span>
                <span>£{Math.round(hoverData.strategy).toLocaleString('en-GB')}</span>
              </div>
              <div className="flex justify-between gap-4 tabular">
                <span style={{ color: '#9CA3B8' }}>BENCHMARK</span>
                <span>£{Math.round(hoverData.benchmark).toLocaleString('en-GB')}</span>
              </div>
              <div className="flex justify-between gap-4 tabular" style={{ color: '#5F6B82' }}>
                <span>DELTA</span>
                <span>
                  {hoverData.strategy - hoverData.benchmark >= 0 ? '+' : '-'}£
                  {Math.round(Math.abs(hoverData.strategy - hoverData.benchmark)).toLocaleString('en-GB')}
                </span>
              </div>
            </div>
          </div>
        )}
      </div>
      <div className="mt-2 flex gap-5 items-center">
        <div className="flex items-center gap-2">
          <span className="inline-block w-3 h-[2.5px]" style={{ background: '#4D8FFF' }} />
          <span className="uppercase-label">STRATEGY</span>
        </div>
        <div className="flex items-center gap-2">
          <svg width="14" height="4">
            <line x1="0" y1="2" x2="14" y2="2" stroke="#5F6B82" strokeWidth="1.5" strokeDasharray="4 2" />
          </svg>
          <span className="uppercase-label">BUY-AND-HOLD BENCHMARK</span>
        </div>
      </div>
    </div>
  );
}
