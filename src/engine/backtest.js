import { getHistory, getCalendar, FTSE_100_SAMPLE } from '../data/syntheticPrices.js';
import { sma, ema, rsi, pctChange } from './indicators.js';
import { calculateMetrics } from './metrics.js';

const DEFAULT_CONFIG = {
  initial_capital: 0,
  fees_per_trade: 3,
  start_date: '2014-01-02',
  end_date: '2024-04-01',
};

export function runBacktest(strategy, config = {}) {
  const cfg = { ...DEFAULT_CONFIG, ...config };
  const calendar = getCalendar();
  const startIdx = calendar.findIndex((d) => d >= cfg.start_date);
  const endIdx = calendar.length - 1;

  const universe = resolveUniverse(strategy);
  const priceData = {};
  for (const t of universe) priceData[t] = getHistory(t);

  const benchmarkTicker = strategy?.benchmark || universe[0] || 'SPY';
  const benchmarkData = priceData[benchmarkTicker] || getHistory(benchmarkTicker);

  // Portfolio state
  const portfolio = {
    cash: cfg.initial_capital,
    positions: {}, // ticker -> { shares, entryPrice, entryDate, entryIndex }
    contributed: 0,
  };

  const trades = [];
  const equityCurve = [];
  const benchmarkCurve = [];

  // Benchmark: single lump-sum based on total contributions of strategy.
  // Adjusted after the run so comparable.

  // Pre-compute indicators lazily on demand
  const indicatorCache = new Map();
  function getIndicator(ticker, kind, period) {
    const key = `${ticker}:${kind}:${period}`;
    if (indicatorCache.has(key)) return indicatorCache.get(key);
    const closes = priceData[ticker].map((d) => d.close);
    let arr;
    if (kind === 'SMA') arr = sma(closes, period);
    else if (kind === 'EMA') arr = ema(closes, period);
    else if (kind === 'RSI') arr = rsi(closes, period);
    else if (kind === 'PCT') arr = pctChange(closes, period);
    else arr = [];
    indicatorCache.set(key, arr);
    return arr;
  }

  const rebalancePlan = strategy?.rebalance || null;
  let lastRebalanceIdx = -1;

  for (let i = startIdx; i <= endIdx; i++) {
    const date = calendar[i];
    const dayOfWeek = new Date(date).getDay(); // 0 Sun - 6 Sat
    const dayOfMonth = new Date(date).getDate();

    // 1. Evaluate exits for open positions
    for (const ticker of Object.keys(portfolio.positions)) {
      const pos = portfolio.positions[ticker];
      const bar = priceData[ticker][i];
      if (!bar) continue;

      let shouldExit = false;
      let exitReason = null;

      // Stop loss / take profit
      const entryPrice = pos.entryPrice;
      const curPrice = bar.close;
      const retPct = ((curPrice - entryPrice) / entryPrice) * 100;
      if (strategy?.risk_management?.stop_loss != null && retPct <= -Math.abs(strategy.risk_management.stop_loss)) {
        shouldExit = true;
        exitReason = 'stop_loss';
      } else if (strategy?.risk_management?.take_profit != null && retPct >= Math.abs(strategy.risk_management.take_profit)) {
        shouldExit = true;
        exitReason = 'take_profit';
      }

      // Explicit exit conditions
      if (!shouldExit) {
        for (const cond of strategy?.exit_conditions || []) {
          if (evaluateCondition(cond, { ticker, i, date, dayOfWeek, dayOfMonth, bar, priceData, getIndicator, pos })) {
            shouldExit = true;
            exitReason = cond.type || 'condition';
            break;
          }
        }
      }

      // Rebalance-based exit
      if (!shouldExit && rebalancePlan && rebalanceDue(rebalancePlan, date, lastRebalanceIdx, i)) {
        shouldExit = true;
        exitReason = 'rebalance';
      }

      if (shouldExit) {
        const proceeds = pos.shares * curPrice - cfg.fees_per_trade;
        portfolio.cash += proceeds;
        const existingTrade = trades.find((t) => t.id === pos.tradeId);
        if (existingTrade) {
          existingTrade.exit = { date, price: curPrice, dayIndex: i, value: proceeds, reason: exitReason };
        }
        delete portfolio.positions[ticker];
      }
    }

    // 2. Evaluate entries
    for (const cond of strategy?.entry_conditions || []) {
      const fires = evaluateCondition(cond, { i, date, dayOfWeek, dayOfMonth, priceData, getIndicator, universe });
      if (!fires) continue;

      // For scheduled entries on a universe, we may rotate or pick target assets.
      const targets = resolveEntryTargets(cond, strategy, { i, date, priceData, universe, getIndicator });
      for (const ticker of targets) {
        const bar = priceData[ticker]?.[i];
        if (!bar) continue;
        // Already in position? skip (unless we allow stacking).
        if (portfolio.positions[ticker] && strategy?.position_sizing?.type !== 'fixed_amount') continue;

        const price = bar.close;
        let dollarAmount = 0;
        if (strategy?.position_sizing?.type === 'fixed_amount') {
          dollarAmount = strategy.position_sizing.spec;
          portfolio.cash += dollarAmount; // external contribution
          portfolio.contributed += dollarAmount;
        } else if (strategy?.position_sizing?.type === 'percent_portfolio') {
          const total = portfolioValue(portfolio, priceData, i);
          dollarAmount = total * (strategy.position_sizing.spec / 100);
        } else if (strategy?.position_sizing?.type === 'fixed_shares') {
          dollarAmount = strategy.position_sizing.spec * price;
        } else {
          const total = portfolioValue(portfolio, priceData, i);
          dollarAmount = total / Math.max(1, targets.length);
        }
        const shares = (dollarAmount - cfg.fees_per_trade) / price;
        if (shares <= 0) continue;

        const tradeId = `t${trades.length + 1}`;
        portfolio.positions[ticker] = {
          shares,
          entryPrice: price,
          entryDate: date,
          entryIndex: i,
          tradeId,
        };
        portfolio.cash -= shares * price + cfg.fees_per_trade;
        trades.push({
          id: tradeId,
          ticker,
          entry: { date, price, dayIndex: i, value: shares * price, reason: cond.type || 'entry' },
          exit: null,
        });
      }
    }

    if (rebalancePlan && rebalanceDue(rebalancePlan, date, lastRebalanceIdx, i)) {
      lastRebalanceIdx = i;
    }

    // 3. Mark-to-market
    const equityValue = portfolioValue(portfolio, priceData, i);
    equityCurve.push({ date, value: equityValue, contributed: portfolio.contributed });
  }

  // Build benchmark curve. Use the total contributed (or initial capital) for
  // apples-to-apples: invest the entire final contribution at t=0. Fairer: use
  // dollar-cost averaging for the benchmark too.
  buildBenchmarkCurve(benchmarkData, benchmarkCurve, equityCurve, strategy, startIdx, endIdx, cfg);

  const metrics = calculateMetrics(equityCurve, benchmarkCurve, trades, cfg);

  return {
    equity_curve: equityCurve,
    benchmark_curve: benchmarkCurve,
    trades,
    metrics,
    start_date: calendar[startIdx],
    end_date: calendar[endIdx],
    benchmark_ticker: benchmarkTicker,
    universe,
  };
}

function buildBenchmarkCurve(data, outCurve, equityCurve, strategy, startIdx, endIdx, cfg) {
  // Mirror contribution schedule on the benchmark. If the strategy is a
  // contributions-based DCA, benchmark also does DCA on the benchmark asset.
  const isContributionStrategy = strategy?.position_sizing?.type === 'fixed_amount';
  let cash = cfg.initial_capital;
  let shares = 0;
  let contributed = 0;

  if (!isContributionStrategy) {
    // Lump-sum benchmark: invest initial capital fully at t=0.
    const initial = Math.max(cash, 1);
    shares = initial / data[startIdx].close;
    cash = 0;
  }

  // Map equityCurve contributions per-day so benchmark absorbs the same inflows.
  let prevContributed = 0;
  for (let idx = 0; idx < equityCurve.length; idx++) {
    const i = startIdx + idx;
    const bar = data[i];
    if (!bar) continue;
    const eq = equityCurve[idx];
    if (isContributionStrategy && eq.contributed > prevContributed) {
      const delta = eq.contributed - prevContributed;
      shares += delta / bar.close;
      contributed += delta;
      prevContributed = eq.contributed;
    }
    const value = shares * bar.close + cash;
    outCurve.push({ date: bar.date, value, contributed });
  }
}

function portfolioValue(portfolio, priceData, i) {
  let total = portfolio.cash;
  for (const ticker of Object.keys(portfolio.positions)) {
    const pos = portfolio.positions[ticker];
    const bar = priceData[ticker][i];
    if (bar) total += pos.shares * bar.close;
  }
  return total;
}

function evaluateCondition(cond, ctx) {
  if (!cond || !cond.type) return false;
  const { i, date, dayOfWeek, dayOfMonth, priceData, getIndicator } = ctx;

  if (cond.type === 'scheduled') {
    const spec = cond.logic || {};
    const freq = spec.frequency || 'daily';
    if (freq === 'daily') return true;
    if (freq === 'weekly') {
      const target = spec.day_of_week ?? 1; // Monday
      return dayOfWeek === target;
    }
    if (freq === 'monthly') {
      const target = spec.day_of_month ?? 1;
      return dayOfMonth === target || (target === 1 && isFirstTradingDayOfMonth(date, ctx));
    }
    if (freq === 'quarterly') {
      const month = new Date(date).getMonth();
      if (![0, 3, 6, 9].includes(month)) return false;
      return isFirstTradingDayOfMonth(date, ctx);
    }
    if (freq === 'yearly') {
      return new Date(date).getMonth() === 0 && isFirstTradingDayOfMonth(date, ctx);
    }
    return false;
  }

  if (cond.type === 'price_trigger') {
    const spec = cond.logic || {};
    const ticker = spec.asset || ctx.ticker;
    if (!ticker || !priceData[ticker]) return false;
    const bars = priceData[ticker];
    const bar = bars[i];
    if (!bar) return false;
    const lookback = spec.timeframe_days || 30;
    if (i - lookback < 0) return false;
    const base = bars[i - lookback].close;
    const change = ((bar.close - base) / base) * 100;
    if (spec.condition === 'drops_by') return change <= -Math.abs(spec.value);
    if (spec.condition === 'rises_by') return change >= Math.abs(spec.value);
    return false;
  }

  if (cond.type === 'indicator') {
    const spec = cond.logic || {};
    const ticker = spec.asset || ctx.ticker;
    if (!ticker) return false;
    const ind = getIndicator(ticker, spec.indicator, spec.period || 20);
    const bars = priceData[ticker];
    if (!bars || !ind) return false;
    const value = ind[i];
    const prev = ind[i - 1];
    if (value == null) return false;
    const compared = typeof spec.compared_to === 'number' ? spec.compared_to : bars[i]?.close;
    const prevCompared = typeof spec.compared_to === 'number' ? spec.compared_to : bars[i - 1]?.close;
    if (spec.condition === 'above') return compared > value;
    if (spec.condition === 'below') return compared < value;
    if (spec.condition === 'crosses_above') return prev != null && prevCompared <= prev && compared > value;
    if (spec.condition === 'crosses_below') return prev != null && prevCompared >= prev && compared < value;
    return false;
  }

  return false;
}

function isFirstTradingDayOfMonth(dateStr, ctx) {
  const date = new Date(dateStr);
  const m = date.getMonth();
  const y = date.getFullYear();
  // Check previous trading day had different month
  const cal = getCalendar();
  const idx = cal.indexOf(dateStr);
  if (idx <= 0) return true;
  const prev = new Date(cal[idx - 1]);
  return prev.getMonth() !== m || prev.getFullYear() !== y;
}

function rebalanceDue(plan, dateStr, lastIdx, i) {
  if (!plan) return false;
  if (lastIdx === i) return false;
  const cal = getCalendar();
  const date = new Date(dateStr);
  const prevDate = lastIdx >= 0 ? new Date(cal[lastIdx]) : null;
  if (!prevDate) {
    if (plan === 'weekly') return date.getDay() === 1;
    if (plan === 'monthly') return isFirstTradingDayOfMonth(dateStr);
    if (plan === 'quarterly') return [0, 3, 6, 9].includes(date.getMonth()) && isFirstTradingDayOfMonth(dateStr);
    if (plan === 'yearly') return date.getMonth() === 0 && isFirstTradingDayOfMonth(dateStr);
    return false;
  }
  if (plan === 'weekly') return daysBetween(prevDate, date) >= 5;
  if (plan === 'monthly') return monthsBetween(prevDate, date) >= 1;
  if (plan === 'quarterly') return monthsBetween(prevDate, date) >= 3;
  if (plan === 'yearly') return monthsBetween(prevDate, date) >= 12;
  return false;
}

function daysBetween(a, b) {
  return Math.round((b - a) / 86400000);
}

function monthsBetween(a, b) {
  return (b.getFullYear() - a.getFullYear()) * 12 + (b.getMonth() - a.getMonth());
}

function resolveUniverse(strategy) {
  const uni = strategy?.universe;
  if (!uni) return ['VUAG'];
  if (uni.type === 'single_asset' && Array.isArray(uni.spec) && uni.spec.length) return [uni.spec[0].toUpperCase()];
  if (uni.type === 'list' && Array.isArray(uni.spec)) return uni.spec.map((s) => s.toUpperCase());
  if (uni.type === 'filter' && uni.spec?.index === 'FTSE_100') return FTSE_100_SAMPLE;
  if (Array.isArray(uni.spec)) return uni.spec.map((s) => s.toUpperCase());
  return ['VUAG'];
}

function resolveEntryTargets(cond, strategy, { i, priceData, universe, getIndicator }) {
  // If the universe is a rotation filter (worst/best N), pick accordingly.
  const uni = strategy?.universe;
  if (uni?.type === 'filter' && uni.spec?.select === 'worst_n') {
    const n = uni.spec.n || 3;
    const lookback = uni.spec.lookback_days || 30;
    const ranked = universe
      .map((t) => {
        const arr = getIndicator(t, 'PCT', lookback);
        return { t, ret: arr[i] };
      })
      .filter((x) => x.ret != null)
      .sort((a, b) => a.ret - b.ret)
      .slice(0, n)
      .map((x) => x.t);
    return ranked.length ? ranked : universe.slice(0, n);
  }
  if (uni?.type === 'filter' && uni.spec?.select === 'best_n') {
    const n = uni.spec.n || 3;
    const lookback = uni.spec.lookback_days || 30;
    const ranked = universe
      .map((t) => {
        const arr = getIndicator(t, 'PCT', lookback);
        return { t, ret: arr[i] };
      })
      .filter((x) => x.ret != null)
      .sort((a, b) => b.ret - a.ret)
      .slice(0, n)
      .map((x) => x.t);
    return ranked.length ? ranked : universe.slice(0, n);
  }
  return universe;
}

// Regime analysis: classify each day and compute strategy vs benchmark within.
export function regimeAnalysis(result) {
  const bench = result.benchmark_curve;
  const strat = result.equity_curve;
  const regimes = { bull: [], bear: [], sideways: [], highVol: [] };

  const window = 63; // ~3 months
  for (let i = window; i < bench.length; i++) {
    const ret = (bench[i].value - bench[i - window].value) / Math.max(bench[i - window].value, 1);
    // vol via recent returns
    const rets = [];
    for (let j = i - window + 1; j <= i; j++) {
      const p = bench[j - 1].value;
      const c = bench[j].value;
      if (p > 0) rets.push((c - p) / p);
    }
    const mean = rets.reduce((a, b) => a + b, 0) / rets.length;
    const v = Math.sqrt(rets.reduce((s, r) => s + (r - mean) ** 2, 0) / rets.length) * Math.sqrt(252);

    let tag;
    if (v > 0.25) tag = 'highVol';
    else if (ret > 0.05) tag = 'bull';
    else if (ret < -0.05) tag = 'bear';
    else tag = 'sideways';

    const stratRet = strat[i] && strat[i - 1] ? (strat[i].value - strat[i - 1].value) / Math.max(strat[i - 1].value, 1) : 0;
    const benchRet = (bench[i].value - bench[i - 1].value) / Math.max(bench[i - 1].value, 1);
    regimes[tag].push({ stratRet, benchRet });
  }

  const aggregate = {};
  for (const k of Object.keys(regimes)) {
    const arr = regimes[k];
    if (!arr.length) {
      aggregate[k] = { strat: 0, bench: 0, days: 0 };
      continue;
    }
    const strat = arr.reduce((s, r) => s + r.stratRet, 0) * (252 / arr.length) * 100;
    const bench = arr.reduce((s, r) => s + r.benchRet, 0) * (252 / arr.length) * 100;
    aggregate[k] = { strat, bench, days: arr.length };
  }
  return aggregate;
}
