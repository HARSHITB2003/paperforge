import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');

  return {
    plugins: [
      react(),
      tailwindcss(),
      devAiMiddleware(env.GROQ_API_KEY),
    ],
    server: { port: 5173 },
  };
});

function devAiMiddleware(apiKey) {
  return {
    name: 'paperforge-dev-ai',
    configureServer(server) {
      server.middlewares.use('/api/ai', async (req, res) => {
        if (req.method !== 'POST') {
          res.statusCode = 405;
          res.end('method not allowed');
          return;
        }
        if (!apiKey) {
          res.statusCode = 500;
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify({ error: 'missing GROQ_API_KEY in .env.local' }));
          return;
        }

        const body = await readJson(req);
        const { mode } = body || {};

        let system, user;
        if (mode === 'parse') {
          ({ system, user } = buildParsePrompt(body));
        } else if (mode === 'verdict') {
          ({ system, user } = buildVerdictPrompt(body));
        } else {
          res.statusCode = 400;
          res.end('unknown mode');
          return;
        }

        try {
          const out = await callGroq(apiKey, system, user);
          res.statusCode = 200;
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify(out));
        } catch (e) {
          res.statusCode = 502;
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify({ error: String(e?.message || e) }));
        }
      });
    },
  };
}

function readJson(req) {
  return new Promise((resolve) => {
    let chunks = '';
    req.on('data', (c) => (chunks += c));
    req.on('end', () => {
      try { resolve(JSON.parse(chunks)); } catch { resolve({}); }
    });
  });
}

async function callGroq(apiKey, system, user) {
  const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'llama-3.3-70b-versatile',
      response_format: { type: 'json_object' },
      temperature: 0.3,
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: user },
      ],
    }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`groq ${res.status}: ${text.slice(0, 300)}`);
  }
  const data = await res.json();
  const content = data.choices?.[0]?.message?.content || '{}';
  return JSON.parse(content);
}

function buildParsePrompt({ input }) {
  const system = `You are PaperForge's strategy parser. Convert plain-English trading strategies into structured executable logic. Voice: terse, precise, slightly dry. No cheerleading. No emojis. No exclamation marks. All output in lowercase where it's narrative (the stream lines), JSON values can be normal case.

Return JSON only:
{
  "stream": [short status lines the user watches stream. Start with "parsing strategy...", use "→ ..." arrows for each detected piece, insert blank strings "" as section breaks, end with "ready."],
  "parsed": {
    "understood": boolean,
    "summary": "one sentence",
    "entry_conditions": [{ "type": "scheduled|price_trigger|indicator|event", "spec": "string", "logic": {...} }],
    "exit_conditions": [...],
    "universe": { "type": "single_asset|list|filter", "spec": [TICKERS] or { filter config } },
    "position_sizing": { "type": "fixed_amount|fixed_shares|percent_portfolio|volatility_adjusted", "spec": number },
    "risk_management": { "stop_loss": null or number, "take_profit": null or number, "max_position_size": null or number },
    "rebalance": null | "weekly|monthly|quarterly|yearly",
    "benchmark": "ticker string",
    "assumptions": ["strings"],
    "ambiguities": ["strings"],
    "backtest_feasible": boolean,
    "feasibility_notes": "string"
  }
}

LOGIC SHAPES:
- scheduled: { "frequency": "daily|weekly|monthly|quarterly|yearly", "day_of_week": 1-7 (Mon=1), "day_of_month": 1-31 }
- price_trigger: { "asset": "TICKER", "condition": "drops_by|rises_by|crosses_above|crosses_below", "value": number, "timeframe_days": number }
- indicator: { "asset": "TICKER", "indicator": "SMA|EMA|RSI", "period": number, "condition": "above|below|crosses_above|crosses_below", "compared_to": "price" or number }

If the user specifies an index like FTSE 100, use universe.type="filter" with spec { "index": "FTSE_100", "select": "worst_n"|"best_n", "n": int, "lookback_days": int }.
If strategy is impossible to backtest on price data (news sentiment, social media signals), set backtest_feasible=false and explain in feasibility_notes.
Supported tickers include VUAG, VUSA, VWCE, IWDA, SPY, QQQ, BND, TLT, and FTSE-100 constituents (SHEL, AZN, HSBA, ULVR, BP, BATS, GSK, DGE, RIO, GLEN). Prefer these; if a user ticker isn't in this list, keep it as-is but note in assumptions.`;

  const userMsg = `STRATEGY: ${input}`;
  return { system, user: userMsg };
}

function buildVerdictPrompt({ input, parsed, result }) {
  const system = `You are PaperForge's honest analyst. You have received a backtest result. Produce a terse verdict in the voice of a former options trader: short sentences, lowercase, no cheerleading, no fake concern, no emojis. If the strategy sucks, say so. If it outperformed, flag what to be suspicious of. 60-100 words.

Return JSON only:
{
  "verdict": "one paragraph",
  "headline_number": "short summary like '+12.3% vs benchmark'",
  "rating": "strong|reasonable|weak|harmful"
}

Guidance:
- If beat benchmark by >5%, rating may be "strong" but flag survivorship/regime risk.
- If within ±0.5% of benchmark, rating "reasonable" and call it a null result.
- If lost money absolutely, rating "harmful".
- Otherwise "weak".`;

  const userMsg = `STRATEGY: ${input}\nPARSED: ${JSON.stringify(parsed).slice(0, 1400)}\nRESULT: ${JSON.stringify(result).slice(0, 1400)}`;
  return { system, user: userMsg };
}
