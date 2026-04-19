// Minimal indicator library for the backtest engine.
// All indicators expect an array of closes and return an aligned array with
// nulls for periods where the indicator hasn't warmed up yet.

export function sma(closes, period) {
  const out = new Array(closes.length).fill(null);
  let sum = 0;
  for (let i = 0; i < closes.length; i++) {
    sum += closes[i];
    if (i >= period) sum -= closes[i - period];
    if (i >= period - 1) out[i] = sum / period;
  }
  return out;
}

export function ema(closes, period) {
  const out = new Array(closes.length).fill(null);
  const k = 2 / (period + 1);
  let prev = null;
  for (let i = 0; i < closes.length; i++) {
    if (i < period - 1) continue;
    if (prev === null) {
      let sum = 0;
      for (let j = 0; j < period; j++) sum += closes[i - (period - 1) + j];
      prev = sum / period;
    } else {
      prev = closes[i] * k + prev * (1 - k);
    }
    out[i] = prev;
  }
  return out;
}

export function rsi(closes, period = 14) {
  const out = new Array(closes.length).fill(null);
  let gains = 0;
  let losses = 0;
  for (let i = 1; i < closes.length; i++) {
    const diff = closes[i] - closes[i - 1];
    if (i <= period) {
      if (diff >= 0) gains += diff; else losses -= diff;
      if (i === period) {
        const avgGain = gains / period;
        const avgLoss = losses / period;
        const rs = avgLoss === 0 ? 100 : avgGain / avgLoss;
        out[i] = 100 - 100 / (1 + rs);
      }
    } else {
      const prevAvgGain = (out[i - 1] !== null ? 0 : 0); // unused
      const gain = diff > 0 ? diff : 0;
      const loss = diff < 0 ? -diff : 0;
      gains = (gains * (period - 1) + gain) / period;
      losses = (losses * (period - 1) + loss) / period;
      const rs = losses === 0 ? 100 : gains / losses;
      out[i] = 100 - 100 / (1 + rs);
    }
  }
  return out;
}

export function pctChange(closes, lookbackDays) {
  const out = new Array(closes.length).fill(null);
  for (let i = lookbackDays; i < closes.length; i++) {
    const base = closes[i - lookbackDays];
    if (!base) continue;
    out[i] = ((closes[i] - base) / base) * 100;
  }
  return out;
}
