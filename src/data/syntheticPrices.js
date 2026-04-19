import { mulberry32 } from '../lib/util.js';

// Deterministic synthetic OHLC generator. Not trying to be realistic — trying to be
// plausible enough that the backtest engine has something sensible to chew on.
// For the portfolio build we lean on this so the app works offline without a
// price-proxy dependency.

const TRADING_DAYS_PER_YEAR = 252;
const START_DATE = new Date('2014-01-02');
const END_DATE = new Date('2024-04-01');

function tradingCalendar(start, end) {
  const days = [];
  const d = new Date(start);
  while (d <= end) {
    const dow = d.getDay();
    if (dow !== 0 && dow !== 6) days.push(new Date(d));
    d.setDate(d.getDate() + 1);
  }
  return days;
}

const CALENDAR = tradingCalendar(START_DATE, END_DATE);

// Profiles: start price, drift (annualised), vol (annualised), seed, and
// crash/boom regime overrides.
const ASSET_PROFILES = {
  VUAG: { start: 28.4, drift: 0.11, vol: 0.18, seed: 10001 },
  VUSA: { start: 34.1, drift: 0.105, vol: 0.17, seed: 10002 },
  VWCE: { start: 42.0, drift: 0.085, vol: 0.16, seed: 10003 },
  IWDA: { start: 30.0, drift: 0.09, vol: 0.165, seed: 10004 },
  SPY: { start: 182.9, drift: 0.115, vol: 0.175, seed: 10005 },
  QQQ: { start: 88.0, drift: 0.145, vol: 0.22, seed: 10006 },
  BND: { start: 80.5, drift: 0.015, vol: 0.05, seed: 10007 },
  TLT: { start: 100.0, drift: 0.005, vol: 0.12, seed: 10008 },
  // FTSE 100 constituents (synthetic — not real prices, directional feel only)
  SHEL: { start: 22.0, drift: 0.04, vol: 0.22, seed: 20001 },
  AZN: { start: 40.0, drift: 0.09, vol: 0.18, seed: 20002 },
  HSBA: { start: 6.6, drift: 0.02, vol: 0.24, seed: 20003 },
  ULVR: { start: 25.0, drift: 0.05, vol: 0.16, seed: 20004 },
  BP: { start: 5.1, drift: 0.01, vol: 0.28, seed: 20005 },
  BATS: { start: 33.0, drift: 0.03, vol: 0.2, seed: 20006 },
  GSK: { start: 14.0, drift: 0.025, vol: 0.18, seed: 20007 },
  DGE: { start: 19.0, drift: 0.06, vol: 0.17, seed: 20008 },
  RIO: { start: 33.0, drift: 0.055, vol: 0.28, seed: 20009 },
  GLEN: { start: 3.4, drift: 0.03, vol: 0.32, seed: 20010 },
};

// Macro regime overlay: shared shocks by date so all assets correlate during
// 2020 COVID and 2022 inflation, as is realistic.
function macroShock(dateIndex) {
  // 2020 COVID: roughly days 1500-1560 — sharp dip then V recovery
  if (dateIndex >= 1500 && dateIndex <= 1520) return -0.008;
  if (dateIndex > 1520 && dateIndex <= 1560) return 0.006;
  // 2022 inflation: days 2020-2200 — grinding drawdown
  if (dateIndex >= 2020 && dateIndex <= 2200) return -0.0012;
  // 2023 rally: days 2280-2480
  if (dateIndex >= 2280 && dateIndex <= 2480) return 0.0008;
  return 0;
}

function generateSeries(profile) {
  const rand = mulberry32(profile.seed);
  const dailyDrift = profile.drift / TRADING_DAYS_PER_YEAR;
  const dailyVol = profile.vol / Math.sqrt(TRADING_DAYS_PER_YEAR);
  let price = profile.start;
  const series = [];
  for (let i = 0; i < CALENDAR.length; i++) {
    // box-muller approx via two uniforms
    const u1 = Math.max(1e-9, rand());
    const u2 = rand();
    const z = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
    const shock = macroShock(i);
    const ret = dailyDrift + dailyVol * z + shock;
    const prevClose = price;
    price = price * (1 + ret);
    const intradayRange = Math.abs(dailyVol * rand() * 1.5);
    const open = prevClose * (1 + (rand() - 0.5) * intradayRange * 0.3);
    const close = price;
    const high = Math.max(open, close) * (1 + rand() * intradayRange * 0.5);
    const low = Math.min(open, close) * (1 - rand() * intradayRange * 0.5);
    series.push({
      date: CALENDAR[i].toISOString().slice(0, 10),
      open: round2(open),
      high: round2(high),
      low: round2(low),
      close: round2(close),
      volume: Math.floor(rand() * 5000000 + 500000),
    });
  }
  return series;
}

function round2(v) {
  return Math.round(v * 100) / 100;
}

const CACHE = new Map();

export function getHistory(ticker) {
  const t = ticker.toUpperCase();
  if (CACHE.has(t)) return CACHE.get(t);
  const profile = ASSET_PROFILES[t];
  if (!profile) {
    // fallback: use SPY profile with a different seed
    const synthetic = { start: 50, drift: 0.08, vol: 0.2, seed: hashString(t) };
    const series = generateSeries(synthetic);
    CACHE.set(t, series);
    return series;
  }
  const series = generateSeries(profile);
  CACHE.set(t, series);
  return series;
}

export function getCalendar() {
  return CALENDAR.map((d) => d.toISOString().slice(0, 10));
}

function hashString(s) {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return Math.abs(h) || 42;
}

export const SUPPORTED_TICKERS = Object.keys(ASSET_PROFILES);

export const FTSE_100_SAMPLE = ['SHEL', 'AZN', 'HSBA', 'ULVR', 'BP', 'BATS', 'GSK', 'DGE', 'RIO', 'GLEN'];
