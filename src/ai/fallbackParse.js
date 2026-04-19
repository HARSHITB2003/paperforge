// Heuristic parser used when no AI key is available. It's not as smart as
// Claude, but it covers the five starter shapes plus a handful of variations
// so the app works offline.

import { SUPPORTED_TICKERS } from '../data/syntheticPrices.js';

export function fallbackParse(rawInput) {
  const input = rawInput.toLowerCase().trim();
  const stream = ['parsing strategy...', ''];

  // Detect tickers
  const tickers = [];
  for (const t of SUPPORTED_TICKERS) {
    const re = new RegExp(`\\b${t}\\b`, 'i');
    if (re.test(rawInput)) tickers.push(t);
  }

  // Detect frequency
  let frequency = null;
  let dayOfWeek = 1;
  if (/\bmonday\b/.test(input)) { frequency = 'weekly'; dayOfWeek = 1; }
  else if (/\btuesday\b/.test(input)) { frequency = 'weekly'; dayOfWeek = 2; }
  else if (/\bweekly\b|\beach week\b/.test(input)) { frequency = 'weekly'; }
  else if (/\bmonthly\b|\beach month\b/.test(input)) { frequency = 'monthly'; }
  else if (/\bquarterly\b/.test(input)) { frequency = 'quarterly'; }
  else if (/\byearly\b|\bannual/.test(input)) { frequency = 'yearly'; }
  else if (/\bdaily\b/.test(input)) { frequency = 'daily'; }

  // Amount detection
  const amountMatch = input.match(/£\s?(\d+[\d,]*)|\$\s?(\d+[\d,]*)|(\d+)\s?(gbp|usd|dollars|pounds)/);
  const amount = amountMatch ? parseInt((amountMatch[1] || amountMatch[2] || amountMatch[3] || '100').replace(/,/g, ''), 10) : 100;

  // Drop/rise detection
  const dropMatch = input.match(/drops?\s+(\d+)\s?%/);
  const riseMatch = input.match(/rises?\s+(\d+)\s?%/);
  const timeframeMatch = input.match(/(\d+)\s*(day|days|week|weeks|month|months)/);

  // 200 ma
  const maMatch = input.match(/(\d+)[\s-]?day\s*(ma|moving average|sma|ema)/);

  // Best/worst N
  const worstMatch = input.match(/(\d+)\s+worst/);
  const bestMatch = input.match(/(\d+)\s+best/);

  const parsed = {
    understood: true,
    summary: rawInput,
    entry_conditions: [],
    exit_conditions: [],
    universe: { type: 'single_asset', spec: tickers.length ? [tickers[0]] : ['VUAG'] },
    position_sizing: { type: 'fixed_amount', spec: amount },
    risk_management: { stop_loss: null, take_profit: null, max_position_size: null },
    rebalance: null,
    benchmark: tickers[0] || 'VUAG',
    assumptions: [],
    ambiguities: [],
    backtest_feasible: true,
    feasibility_notes: '',
  };

  stream.push('identifying entry conditions...');

  if (frequency) {
    stream.push(`→ condition: ${frequency}${frequency === 'weekly' ? ', ' + ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'][dayOfWeek] : ''}`);
    parsed.entry_conditions.push({
      type: 'scheduled',
      spec: `${frequency}`,
      logic: { frequency, day_of_week: dayOfWeek, day_of_month: 1 },
    });
  } else if (maMatch) {
    const period = parseInt(maMatch[1], 10);
    stream.push(`→ indicator: SPY vs ${period}-day SMA`);
    parsed.universe = { type: 'list', spec: ['SPY', 'BND'] };
    parsed.position_sizing = { type: 'percent_portfolio', spec: 100 };
    parsed.entry_conditions.push({
      type: 'indicator',
      spec: `SPY crosses above ${period} SMA`,
      logic: { asset: 'SPY', indicator: 'SMA', period, condition: 'crosses_above', compared_to: 'price' },
    });
    parsed.exit_conditions.push({
      type: 'indicator',
      spec: `SPY crosses below ${period} SMA`,
      logic: { asset: 'SPY', indicator: 'SMA', period, condition: 'crosses_below', compared_to: 'price' },
    });
    parsed.benchmark = 'SPY';
    parsed.assumptions.push('Initial capital £10,000. Full portfolio rotation.');
  } else if (worstMatch) {
    const n = parseInt(worstMatch[1], 10);
    stream.push(`→ rank FTSE 100 by trailing 30-day return`);
    stream.push(`→ pick bottom ${n}, equal weight`);
    parsed.universe = { type: 'filter', spec: { index: 'FTSE_100', select: 'worst_n', n, lookback_days: 30 } };
    parsed.position_sizing = { type: 'percent_portfolio', spec: Math.floor(100 / n) };
    parsed.rebalance = 'monthly';
    parsed.entry_conditions.push({ type: 'scheduled', spec: 'monthly', logic: { frequency: 'monthly', day_of_month: 1 } });
    parsed.benchmark = 'SHEL';
  } else if (bestMatch) {
    const n = parseInt(bestMatch[1], 10);
    stream.push(`→ rank FTSE 100 by trailing 30-day return`);
    stream.push(`→ pick top ${n}, equal weight`);
    parsed.universe = { type: 'filter', spec: { index: 'FTSE_100', select: 'best_n', n, lookback_days: 30 } };
    parsed.position_sizing = { type: 'percent_portfolio', spec: Math.floor(100 / n) };
    parsed.rebalance = 'monthly';
    parsed.entry_conditions.push({ type: 'scheduled', spec: 'monthly', logic: { frequency: 'monthly', day_of_month: 1 } });
    parsed.benchmark = 'SHEL';
  } else {
    // default: monthly DCA on the detected ticker
    stream.push('→ no explicit schedule detected — assuming monthly');
    parsed.entry_conditions.push({ type: 'scheduled', spec: 'monthly', logic: { frequency: 'monthly', day_of_month: 1 } });
    parsed.assumptions.push('Defaulted to monthly cadence.');
  }

  if (tickers.length) {
    stream.push(`→ asset: ${tickers[0]}`);
  } else if (!maMatch && !worstMatch && !bestMatch) {
    stream.push('→ no asset specified — defaulting to VUAG');
    parsed.assumptions.push('No ticker specified — defaulted to VUAG.');
  }
  stream.push(`→ amount: £${amount}`);
  stream.push('');
  stream.push('identifying exit conditions...');

  if (dropMatch) {
    const val = parseInt(dropMatch[1], 10);
    const tf = timeframeMatch ? timeframeMatch[1] + ' ' + timeframeMatch[2] : '30 days';
    stream.push(`→ exit if drop ≥ ${val}% over ${tf}`);
    parsed.exit_conditions.push({
      type: 'price_trigger',
      spec: `-${val}% over ${tf}`,
      logic: { asset: parsed.universe.spec?.[0] || tickers[0] || 'VUAG', condition: 'drops_by', value: val, timeframe_days: parseTimeframe(timeframeMatch) },
    });
    parsed.risk_management.stop_loss = val;
  } else if (riseMatch) {
    const val = parseInt(riseMatch[1], 10);
    stream.push(`→ take profit at +${val}%`);
    parsed.risk_management.take_profit = val;
  } else if (!parsed.exit_conditions.length) {
    stream.push('→ no exit condition — buy and hold');
  }

  stream.push('');
  stream.push('identifying universe...');
  if (parsed.universe.type === 'filter') {
    stream.push('→ FTSE 100 (representative sample)');
  } else if (parsed.universe.type === 'list') {
    stream.push(`→ list: ${parsed.universe.spec.join(', ')}`);
  } else {
    stream.push(`→ single asset: ${parsed.universe.spec[0]}`);
  }
  stream.push('');
  stream.push('identifying risk parameters...');
  stream.push(`→ position sizing: ${parsed.position_sizing.type.replace('_', ' ')} — ${parsed.position_sizing.spec}`);
  if (parsed.risk_management.stop_loss) stream.push(`→ stop loss: ${parsed.risk_management.stop_loss}%`);
  if (parsed.risk_management.take_profit) stream.push(`→ take profit: ${parsed.risk_management.take_profit}%`);
  stream.push('');
  stream.push('strategy validated.');
  stream.push('backtest period: jan 2014 → apr 2024 (10.3 years)');
  stream.push(`benchmark: ${parsed.benchmark}`);
  stream.push('');
  stream.push('ready.');

  return { parsed, stream };
}

function parseTimeframe(m) {
  if (!m) return 30;
  const n = parseInt(m[1], 10);
  const unit = m[2];
  if (/week/.test(unit)) return n * 5;
  if (/month/.test(unit)) return n * 21;
  return n;
}

export function fallbackStream() { return []; }
