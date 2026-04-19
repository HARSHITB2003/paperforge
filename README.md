# paperforge

describe a trading strategy. backtest it on 10 years of data. deploy it in paper mode.
nothing touches a real broker. nothing touches real money.

## run it

```
npm install
npm run dev
```

open http://localhost:5173.

the app works fully offline — a deterministic heuristic parser understands the
five starter strategies and most plain-english variants. to get real AI
parsing/verdicts, deploy to vercel and set `GROQ_API_KEY` and
`VITE_AI_ENABLED=true`.

## stack

- react 19 + vite
- tailwind v4
- framer motion
- three.js via @react-three/fiber + @react-three/drei
- custom svg for the hero equity chart (recharts is not used — the chart is
  hand-built for the aesthetic)
- groq llama-3.3-70b-versatile as the AI (swappable for anthropic
  claude-sonnet-4 in `api/ai.js`)

## architecture

```
src/
├── components/
│   ├── background/   — 3d scene (price ribbon + particles)
│   ├── screens/      — compose / parse / backtest / diagnose / deploy
│   ├── chart/        — custom svg charts
│   └── ui/           — stat grid + verdict
├── engine/           — deterministic backtest engine (~ 100ms for 10y)
├── data/             — synthetic price series + prebuilt strategies
├── ai/               — AI adapters with heuristic fallback
└── state/            — tiny store with useSyncExternalStore
```

## deploy to vercel

```
vercel
```

then set `GROQ_API_KEY` in the project env and `VITE_AI_ENABLED=true`.
the serverless function at `api/ai.js` brokers the calls.
