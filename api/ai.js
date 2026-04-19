// Vercel serverless function that brokers calls to Groq (free tier) using
// llama-3.3-70b-versatile. The front-end hits /api/ai with { mode, input, ... }.
// We keep the API key on the server. The JSON-response shape matches the
// prompts defined in the brief.
//
// To enable: set GROQ_API_KEY in Vercel and VITE_AI_ENABLED=true on the client.

const GROQ_URL = 'https://api.groq.com/openai/v1/chat/completions';
const MODEL = 'llama-3.3-70b-versatile';

export default async function handler(req) {
  if (req.method !== 'POST') {
    return new Response('method not allowed', { status: 405 });
  }
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) {
    return new Response(JSON.stringify({ error: 'missing GROQ_API_KEY' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  let body;
  try { body = await req.json(); } catch { return new Response('bad json', { status: 400 }); }
  const { mode } = body || {};
  if (mode === 'parse') return parseRoute(body, apiKey);
  if (mode === 'verdict') return verdictRoute(body, apiKey);
  if (mode === 'counterfactuals') return counterfactualsRoute(body, apiKey);
  return new Response('unknown mode', { status: 400 });
}

async function parseRoute({ input }, apiKey) {
  const systemPrompt = `You are PaperForge's strategy parser. Convert plain-English trading strategies into structured executable logic. Voice: terse, precise, slightly dry. No cheerleading. No emojis. No exclamation marks.

Return JSON only, in this exact shape:
{
  "stream": [array of short status lines — this is what the user watches stream. Start with "parsing strategy..." and use → arrows for detected parts. End with "ready."],
  "parsed": {
    "understood": true | false,
    "summary": "One sentence restatement.",
    "entry_conditions": [{ "type": "scheduled" | "price_trigger" | "indicator" | "event", "spec": "string", "logic": {...} }],
    "exit_conditions": [...],
    "universe": { "type": "single_asset" | "list" | "filter", "spec": [...] or {...} },
    "position_sizing": { "type": "fixed_amount" | "fixed_shares" | "percent_portfolio" | "volatility_adjusted", "spec": number },
    "risk_management": { "stop_loss": null | number, "take_profit": null | number, "max_position_size": null | number },
    "rebalance": null | "weekly" | "monthly" | "quarterly" | "yearly",
    "benchmark": "ticker",
    "assumptions": ["strings"],
    "ambiguities": ["strings"],
    "backtest_feasible": true | false,
    "feasibility_notes": "string"
  }
}

LOGIC SCHEMA:
- scheduled: { "frequency": "daily|weekly|monthly|quarterly|yearly", "day_of_week": 1-7, "day_of_month": 1-31 }
- price_trigger: { "asset": "TICKER", "condition": "drops_by|rises_by|crosses_above|crosses_below", "value": number, "timeframe_days": number }
- indicator: { "asset": "TICKER", "indicator": "SMA|EMA|RSI", "period": number, "condition": "above|below|crosses_above|crosses_below", "compared_to": "price" or number }

If strategy references things you cannot backtest, set backtest_feasible false.`;
  return callGroq(apiKey, systemPrompt, `STRATEGY: ${input}`);
}

async function verdictRoute({ input, parsed, result }, apiKey) {
  const systemPrompt = `You are PaperForge's honest analyst. You receive a backtest result and produce a terse verdict in the voice of a former options trader: short sentences, no cheerleading, no fake concern. If the strategy sucks, say so. If it outperformed, flag survivorship worries.

Return JSON only:
{
  "verdict": "one paragraph 60-100 words, lowercase preferred, no emojis",
  "headline_number": "short summary number e.g. '+12.3% vs benchmark'",
  "rating": "strong" | "reasonable" | "weak" | "harmful"
}`;
  const userPrompt = `STRATEGY: ${input}\nPARSED: ${JSON.stringify(parsed).slice(0, 1200)}\nRESULT: ${JSON.stringify(result).slice(0, 1200)}`;
  return callGroq(apiKey, systemPrompt, userPrompt);
}

async function counterfactualsRoute({ parsed, result }, apiKey) {
  const systemPrompt = `You propose four counterfactual versions of a strategy — each with ONE parameter changed — chosen to reveal what the strategy is actually sensitive to. Return JSON: { "counterfactuals": [{"name": "what if …", "change": "short description", "logic_diff": {...}}] }`;
  return callGroq(apiKey, systemPrompt, `PARSED: ${JSON.stringify(parsed).slice(0, 1200)}\nRESULT_SUMMARY: ${JSON.stringify(result).slice(0, 600)}`);
}

async function callGroq(apiKey, system, user) {
  const res = await fetch(GROQ_URL, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: MODEL,
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
    return new Response(JSON.stringify({ error: `groq ${res.status}`, detail: text.slice(0, 400) }), {
      status: 502,
      headers: { 'Content-Type': 'application/json' },
    });
  }
  const data = await res.json();
  const content = data.choices?.[0]?.message?.content || '{}';
  let parsed;
  try { parsed = JSON.parse(content); } catch { parsed = { error: 'invalid json from model', raw: content.slice(0, 400) }; }
  return new Response(JSON.stringify(parsed), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}

