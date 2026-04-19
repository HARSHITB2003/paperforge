import { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { PREBUILT_STRATEGIES } from '../../data/prebuilt.js';
import { store, useStore } from '../../state/store.js';

const PLACEHOLDERS = [
  'describe what you want to do',
  'buy the dip. define the dip.',
  'rotate between sectors based on momentum',
  'tell me the rule and i\'ll tell you if it works',
];

export default function Compose({ onRun }) {
  const rawInput = useStore((s) => s.raw_input);
  const [placeholderIdx, setPlaceholderIdx] = useState(0);
  const [typing, setTyping] = useState(false);
  const textareaRef = useRef(null);

  useEffect(() => {
    if (rawInput.length || typing) return;
    const t = setInterval(() => setPlaceholderIdx((i) => (i + 1) % PLACEHOLDERS.length), 4000);
    return () => clearInterval(t);
  }, [rawInput, typing]);

  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = Math.min(260, textareaRef.current.scrollHeight) + 'px';
    }
  }, [rawInput]);

  function handleRun() {
    if (!rawInput.trim()) return;
    onRun();
  }

  function pickStarter(input) {
    setTyping(true);
    store.set({ raw_input: '' });
    let i = 0;
    const iv = setInterval(() => {
      i++;
      store.set({ raw_input: input.slice(0, i) });
      if (i >= input.length) {
        clearInterval(iv);
        setTyping(false);
        setTimeout(() => onRun(), 900);
      }
    }, 18);
  }

  return (
    <section className="min-h-screen flex flex-col items-center justify-center px-6 pt-24 pb-32">
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.9, ease: [0.2, 0.8, 0.2, 1] }}
        className="w-full max-w-[780px]"
      >
        <h1 className="font-serif text-[56px] leading-none mb-12" style={{ color: 'var(--color-ink)' }}>
          paperforge.
        </h1>

        <div className="font-serif space-y-1 mb-16" style={{ fontSize: 19, lineHeight: 1.5, color: 'var(--color-graphite)' }}>
          <p>describe a trading strategy.</p>
          <p>i'll test it on 10 years of real data.</p>
          <p>no broker. no money. no pretending.</p>
        </div>

        <div className="relative mb-3">
          <textarea
            ref={textareaRef}
            value={rawInput}
            onChange={(e) => store.set({ raw_input: e.target.value })}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); handleRun(); }
            }}
            placeholder={PLACEHOLDERS[placeholderIdx]}
            rows={1}
            className="font-serif w-full bg-transparent border-none outline-none resize-none"
            style={{
              color: 'var(--color-ink)',
              fontSize: 24,
              lineHeight: 1.4,
              caretColor: 'var(--color-signal)',
            }}
          />
          <div className="w-full" style={{ height: 1, background: 'var(--color-tape)' }} />
        </div>

        <div className="flex items-center justify-between mt-10">
          <button
            type="button"
            onClick={handleRun}
            disabled={!rawInput.trim()}
            className="font-mono wavy-underline text-[15px]"
            style={{
              color: rawInput.trim() ? 'var(--color-ink)' : 'var(--color-ghost)',
              background: 'none',
              border: 'none',
              padding: '4px 0',
            }}
          >
            run backtest
          </button>
          <div className="uppercase-label-sm" style={{ color: 'var(--color-slate)' }}>
            ⌘ + ⏎ TO RUN
          </div>
        </div>

        <div className="mt-20">
          <div className="uppercase-label mb-6">OR START WITH ONE OF THESE</div>
          <ul className="space-y-3">
            {PREBUILT_STRATEGIES.map((s) => (
              <li key={s.id}>
                <button
                  type="button"
                  onClick={() => pickStarter(s.input)}
                  className="font-serif text-left group flex items-start gap-3 w-full"
                  style={{ color: 'var(--color-graphite)', fontSize: 17, lineHeight: 1.5 }}
                >
                  <span
                    className="mt-[10px] inline-block w-1 h-1 rounded-full shrink-0 transition-colors"
                    style={{ background: 'var(--color-tape)' }}
                  />
                  <span className="transition-colors group-hover:text-[var(--color-ink)]">{s.input}</span>
                </button>
              </li>
            ))}
          </ul>
        </div>

        <div className="mt-32 uppercase-label-sm" style={{ color: 'var(--color-ghost)' }}>
          PAPERFORGE IS A STRATEGY SIMULATOR. IT DOES NOT EXECUTE REAL TRADES.
        </div>
      </motion.div>
    </section>
  );
}
