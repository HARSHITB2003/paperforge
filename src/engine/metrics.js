const TRADING_DAYS_PER_YEAR = 252;
const RISK_FREE = 0.04;

export function calculateMetrics(equityCurve, benchmarkCurve, trades, config) {
  const strategy = summariseCurve(equityCurve, config);
  const benchmark = summariseCurve(benchmarkCurve, config);
  const activity = summariseActivity(trades, config);
  return { strategy, benchmark, activity };
}

function summariseCurve(curve, config) {
  if (!curve.length) {
    return { totalReturnAbs: 0, totalReturnPct: 0, cagr: 0, maxDrawdown: 0, volatility: 0, sharpe: 0, sortino: 0, finalValue: 0 };
  }
  const startValue = curve[0].value;
  const finalValue = curve[curve.length - 1].value;
  // For contributions-based strategies, we compare against cumulative invested.
  const totalContributed = curve[curve.length - 1].contributed ?? 0;
  const netInvested = startValue + totalContributed;
  const totalReturnAbs = finalValue - netInvested;
  const totalReturnPct = netInvested > 0 ? ((finalValue - netInvested) / netInvested) * 100 : 0;

  const years = (curve.length - 1) / TRADING_DAYS_PER_YEAR;
  const cagr = netInvested > 0 && years > 0 ? (Math.pow(finalValue / Math.max(netInvested, 1), 1 / years) - 1) * 100 : 0;

  const dailyReturns = [];
  for (let i = 1; i < curve.length; i++) {
    const prev = curve[i - 1].value;
    const cur = curve[i].value;
    if (prev > 0) dailyReturns.push((cur - prev) / prev);
  }

  const mean = avg(dailyReturns);
  const std = stddev(dailyReturns, mean);
  const volatility = std * Math.sqrt(TRADING_DAYS_PER_YEAR) * 100;

  const downside = dailyReturns.filter((r) => r < 0);
  const downsideStd = stddev(downside, 0);
  const downsideVol = downsideStd * Math.sqrt(TRADING_DAYS_PER_YEAR);

  const sharpe = volatility > 0 ? (cagr / 100 - RISK_FREE) / (volatility / 100) : 0;
  const sortino = downsideVol > 0 ? (cagr / 100 - RISK_FREE) / downsideVol : 0;

  // Max drawdown
  let peak = startValue;
  let maxDD = 0;
  for (const point of curve) {
    if (point.value > peak) peak = point.value;
    const dd = peak > 0 ? (point.value - peak) / peak : 0;
    if (dd < maxDD) maxDD = dd;
  }
  return {
    totalReturnAbs,
    totalReturnPct,
    cagr,
    maxDrawdown: maxDD * 100,
    volatility,
    sharpe,
    sortino,
    finalValue,
  };
}

function summariseActivity(trades, config) {
  const total = trades.length;
  const closed = trades.filter((t) => t.exit);
  const profitable = closed.filter((t) => (t.exit.value - t.entry.value) > 0);
  const winRate = closed.length ? (profitable.length / closed.length) * 100 : 0;
  const avgHold = closed.length
    ? closed.reduce((sum, t) => sum + (t.exit.dayIndex - t.entry.dayIndex), 0) / closed.length
    : 0;
  const fees = total * (config.fees_per_trade || 0);
  return { total, winRate, avgHoldDays: avgHold, fees };
}

function avg(arr) {
  if (!arr.length) return 0;
  return arr.reduce((s, v) => s + v, 0) / arr.length;
}

function stddev(arr, mean) {
  if (arr.length < 2) return 0;
  const m = mean ?? avg(arr);
  const v = arr.reduce((s, x) => s + (x - m) ** 2, 0) / (arr.length - 1);
  return Math.sqrt(v);
}

export function drawdownPeriods(curve) {
  const periods = [];
  let peak = curve[0]?.value ?? 0;
  let peakIndex = 0;
  let inDD = false;
  let ddStart = 0;
  let ddTrough = peak;
  let ddTroughIndex = 0;
  for (let i = 0; i < curve.length; i++) {
    const v = curve[i].value;
    if (v > peak) {
      if (inDD) {
        if ((ddTrough - peak) / peak <= -0.05) {
          periods.push({ start: ddStart, end: i, depth: (ddTrough - peak) / peak });
        }
        inDD = false;
      }
      peak = v;
      peakIndex = i;
      ddTrough = v;
    } else if (v < peak) {
      if (!inDD) {
        inDD = true;
        ddStart = peakIndex;
        ddTrough = v;
        ddTroughIndex = i;
      } else if (v < ddTrough) {
        ddTrough = v;
        ddTroughIndex = i;
      }
    }
  }
  return periods;
}

export function returnsHistogram(trades, bins = 20) {
  const returns = trades
    .filter((t) => t.exit)
    .map((t) => ((t.exit.value - t.entry.value) / t.entry.value) * 100);
  if (!returns.length) return { bins: [], returns: [] };
  const min = Math.min(...returns);
  const max = Math.max(...returns);
  const span = max - min || 1;
  const width = span / bins;
  const out = new Array(bins).fill(0).map((_, i) => ({
    start: min + i * width,
    end: min + (i + 1) * width,
    count: 0,
  }));
  for (const r of returns) {
    const idx = Math.min(bins - 1, Math.floor((r - min) / width));
    out[idx].count++;
  }
  return { bins: out, returns };
}
