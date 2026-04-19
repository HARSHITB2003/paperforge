import { findPrebuilt } from '../data/prebuilt.js';
import { fallbackParse, fallbackStream } from './fallbackParse.js';

const GROQ_API_URL = '/api/ai';

export async function* parseStrategy(input) {
  // 1. prebuilt short-circuit for the demo pills
  const prebuilt = findPrebuilt(input);
  if (prebuilt) {
    for (const line of prebuilt.parseStream) {
      yield { type: 'line', line };
      await sleep(randMs(25, 75));
    }
    yield { type: 'parsed', parsed: prebuilt.parsed };
    return;
  }

  // 2. try real AI
  const envKey = (import.meta.env && import.meta.env.VITE_AI_ENABLED) === 'true';
  if (envKey) {
    try {
      yield* streamFromApi(input);
      return;
    } catch (e) {
      console.warn('AI parse failed, falling back:', e);
    }
  }

  // 3. deterministic heuristic parser
  const { parsed, stream } = fallbackParse(input);
  for (const line of stream) {
    yield { type: 'line', line };
    await sleep(randMs(30, 90));
  }
  yield { type: 'parsed', parsed };
}

async function* streamFromApi(input) {
  const res = await fetch(GROQ_API_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ mode: 'parse', input }),
  });
  if (!res.ok) throw new Error(`api ${res.status}`);
  const data = await res.json();
  for (const line of data.stream || []) {
    yield { type: 'line', line };
    await sleep(randMs(20, 60));
  }
  yield { type: 'parsed', parsed: data.parsed };
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function randMs(lo, hi) {
  return Math.floor(lo + Math.random() * (hi - lo));
}
