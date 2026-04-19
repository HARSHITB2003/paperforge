// Honest one-paragraph verdict. Uses AI when available, falls back to a
// templated but context-aware sentence generator that still reads as terse
// and honest, consistent with the voice.

import { formatPct } from '../lib/util.js';

export async function generateVerdict({ input, parsed, result }) {
  const envKey = (import.meta.env && import.meta.env.VITE_AI_ENABLED) === 'true';
  if (envKey) {
    try {
      const res = await fetch('/api/ai', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode: 'verdict', input, parsed, result: slim(result) }),
      });
      if (res.ok) {
        const data = await res.json();
        if (data?.verdict) return data;
      }
    } catch (e) {
      console.warn('verdict AI failed, falling back:', e);
    }
  }

  return heuristicVerdict({ input, parsed, result });
}

function slim(r) {
  return {
    metrics: r.metrics,
    trades_total: r.trades.length,
    winners: r.trades.filter((t) => t.exit && t.exit.value > t.entry.value).length,
    benchmark_ticker: r.benchmark_ticker,
  };
}

function heuristicVerdict({ input, parsed, result }) {
  const { strategy: s, benchmark: b, activity: a } = result.metrics;
  const diff = s.totalReturnPct - b.totalReturnPct;
  const beat = diff > 0.5;
  const lost = diff < -0.5;
  const small = Math.abs(diff) <= 0.5;

  let rating;
  if (s.totalReturnPct < 0) rating = 'harmful';
  else if (beat && s.sharpe > 0.6) rating = 'strong';
  else if (small || (beat && s.sharpe <= 0.6)) rating = 'reasonable';
  else rating = 'weak';

  const parts = [];
  if (beat) {
    parts.push(`your strategy beat buy-and-hold by ${formatPct(diff).replace('+', '')} over ${years(result)} years.`);
    if (a.total > 100) parts.push(`it took ${a.total} trades to get there.`);
    parts.push(`be suspicious — backtests are autopsies, not promises. if the pattern that worked in this window changes, so will the edge.`);
  } else if (lost) {
    parts.push(`your strategy underperformed by ${formatPct(-diff).replace('+', '')} over ${years(result)} years.`);
    if (a.total > 0) parts.push(`you made ${a.total} trades to generate worse returns than doing nothing. you also paid £${Math.round(a.fees)} in fees for the privilege.`);
    if (s.maxDrawdown > -20 && b.maxDrawdown <= -25) parts.push(`the one thing you got: lower drawdown (${s.maxDrawdown.toFixed(1)}% vs benchmark ${b.maxDrawdown.toFixed(1)}%).`);
    else parts.push(`worse return, similar or bigger drawdowns. not a trade worth making.`);
  } else {
    parts.push(`you ended roughly where the benchmark did — ${formatPct(s.totalReturnPct)} vs ${formatPct(b.totalReturnPct)}.`);
    if (a.total > 0) parts.push(`you made ${a.total} trades and paid £${Math.round(a.fees)} in fees to do so. a null result.`);
    parts.push(`this is the most common outcome. it's not a bad strategy — it just isn't doing anything a passive holder isn't.`);
  }

  if (s.sharpe > b.sharpe + 0.15 && !beat) {
    parts.push(`the risk-adjusted picture is slightly better (sharpe ${s.sharpe.toFixed(2)} vs ${b.sharpe.toFixed(2)}).`);
  }

  const headline =
    beat ? `+${formatPct(diff).replace('+', '')} vs benchmark` :
    lost ? `${formatPct(diff)} vs benchmark` :
    `flat vs benchmark`;

  return { verdict: parts.join(' '), headline_number: headline, rating };
}

function years(result) {
  return ((result.equity_curve.length || 0) / 252).toFixed(1);
}
