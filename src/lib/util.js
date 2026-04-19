export function classNames(...args) {
  return args.filter(Boolean).join(' ');
}

export function formatMoney(v, currency = '£') {
  const sign = v >= 0 ? '+' : '-';
  const abs = Math.abs(v);
  const formatted = abs.toLocaleString('en-GB', { maximumFractionDigits: 0 });
  return `${sign}${currency}${formatted}`;
}

export function formatPct(v, digits = 1) {
  const sign = v >= 0 ? '+' : '';
  return `${sign}${v.toFixed(digits)}%`;
}

export function formatNum(v, digits = 2) {
  return v.toFixed(digits);
}

export function clamp(v, min, max) {
  return Math.max(min, Math.min(max, v));
}

export function lerp(a, b, t) {
  return a + (b - a) * t;
}

// deterministic PRNG
export function mulberry32(seed) {
  let a = seed | 0;
  return function () {
    a |= 0;
    a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function formatDateShort(d) {
  const date = d instanceof Date ? d : new Date(d);
  return date.toLocaleDateString('en-GB', { year: 'numeric', month: 'short', day: 'numeric' });
}

export function parseDate(s) {
  return new Date(s);
}

export function daysBetween(a, b) {
  const MS = 1000 * 60 * 60 * 24;
  return Math.round((b.getTime() - a.getTime()) / MS);
}

export function uniqueId(prefix = 'str') {
  return `${prefix}-${Math.random().toString(36).slice(2, 9)}${Date.now().toString(36).slice(-4)}`;
}
