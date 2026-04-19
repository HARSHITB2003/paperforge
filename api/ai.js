// Vercel serverless function that brokers calls to Groq.
// Node.js runtime (default). Uses (req, res) signature.

const GROQ_URL = 'https://api.groq.com/openai/v1/chat/completions';
const MODEL = 'llama-3.3-70b-versatile';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.status(405).send('method not allowed');
    return;
  }
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) {
    res.status(500).json({ error: 'missing GROQ_API_KEY' });
    return;
  }

  const body = req.body && typeof req.body === 'object' ? req.body : await readJson(req);
  const { mode } = body || {};

  let system, user;
  if (mode === 'parse') ({ system, user } = parsePrompt(body));
  else if (mode === 'verdict') ({ system, user } = verdictPrompt(body));
  else { res.status(400).send('unknown mode'); return; }

  try {
    const out = await callGroq(apiKey, system, user);
    res.status(200).json(out);
  } catch (e) {
    res.status(502).json({ error: String(e?.message || e) });
  }
}

function readJson(req) {
  return new Promise((resolve) => {
    let s = '';
    req.on('data', (c) => (s += c));
    req.on('end', () => { try { resolve(JSON.parse(s)); } catch { resolve({}); } });
  });
}

async function callGroq(apiKey, system, user) {
  const res = await fetch(GROQ_URL, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: MODEL,
      response_format: { type: 'json_object' },
      temperature: 0.3,
      messages: [{ role: 'system', content: system }, { role: 'user', content: user }],
    }),
  });
  if (!res.ok) throw new Error(`groq ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const data = await res.json();
  const content = data.choices?.[0]?.message?.content || '{}';
  return JSON.parse(content);
}

function parsePrompt({ input }) {
  const system = `You are PaperForge's strategy parser. Convert plain-English trading strategies into structured executable logic. Voice: terse, precise. No cheerleading. No emojis. No exclamation marks.

Return JSON only:
{
  "stream": [short status lines the user watches. Start "parsing strategy...", use "→ ..." for detected parts, blank "" as breaks, end "ready."],
  "parsed": {
    "understood": boolean, "summary": "one sentence",
    "entry_conditions": [{ "type": "scheduled|price_trigger|indicator|event", "spec": "string", "logic": {...} }],
    "exit_conditions": [...],
    "universe": { "type": "single_asset|list|filter", "spec": [TICKERS] or { filter } },
    "position_sizing": { "type": "fixed_amount|fixed_shares|percent_portfolio", "spec": number },
    "risk_management": { "stop_loss": null|number, "take_profit": null|number, "max_position_size": null|number },
    "rebalance": null|"weekly|monthly|quarterly|yearly",
    "benchmark": "ticker",
    "assumptions": ["strings"], "ambiguities": ["strings"],
    "backtest_feasible": boolean, "feasibility_notes": "string"
  }
}

LOGIC:
- scheduled: { "frequency": "daily|weekly|monthly|quarterly|yearly", "day_of_week": 1-7 (Mon=1), "day_of_month": 1-31 }
- price_trigger: { "asset": "TICKER", "condition": "drops_by|rises_by|crosses_above|crosses_below", "value": number, "timeframe_days": number }
- indicator: { "asset": "TICKER", "indicator": "SMA|EMA|RSI", "period": number, "condition": "above|below|crosses_above|crosses_below", "compared_to": "price" or number }

For index-based strategies (FTSE 100 etc), use universe.type="filter" with spec { "index": "FTSE_100", "select": "worst_n"|"best_n", "n": int, "lookback_days": int }.
Supported tickers: VUAG, VUSA, VWCE, IWDA, SPY, QQQ, BND, TLT, SHEL, AZN, HSBA, ULVR, BP, BATS, GSK, DGE, RIO, GLEN. Prefer these.`;
  return { system, user: `STRATEGY: ${input}` };
}

function verdictPrompt({ input, parsed, result }) {
  const system = `You are PaperForge's honest analyst. Produce a terse verdict in the voice of a former options trader: short sentences, lowercase, no cheerleading, no emojis. 60-100 words. If the strategy sucks, say so. If it outperformed, flag survivorship risk.

Return JSON only: { "verdict": "one paragraph", "headline_number": "short like '+12.3% vs benchmark'", "rating": "strong|reasonable|weak|harmful" }`;
  return { system, user: `STRATEGY: ${input}\nPARSED: ${JSON.stringify(parsed).slice(0, 1200)}\nRESULT: ${JSON.stringify(result).slice(0, 1200)}` };
}
