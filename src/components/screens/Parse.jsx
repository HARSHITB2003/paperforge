import { useEffect, useRef } from 'react';
import { motion } from 'framer-motion';
import { useStore } from '../../state/store.js';

export default function Parse({ onProceed }) {
  const parseStream = useStore((s) => s.parse_stream);
  const parseStatus = useStore((s) => s.parse_status);
  const scrollRef = useRef(null);

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [parseStream.length]);

  return (
    <section className="w-full max-w-[780px] mx-auto px-6 pt-2 pb-20">
      <div className="flex items-center gap-3 mb-5">
        <span className="uppercase-label">PARSE</span>
        <span className="flex-1 hairline" />
        <span className="uppercase-label-sm" style={{ color: parseStatus === 'done' ? 'var(--color-profit)' : 'var(--color-hold)' }}>
          {parseStatus === 'done' ? 'DONE' : parseStatus === 'parsing' ? 'PARSING…' : 'READY'}
        </span>
      </div>

      <div
        ref={scrollRef}
        className="font-mono text-[13px] thin-scroll"
        style={{
          background: 'var(--color-terminal)',
          border: '1px solid var(--color-grid)',
          padding: '18px 22px',
          maxHeight: 420,
          overflowY: 'auto',
          lineHeight: 1.8,
        }}
      >
        {parseStream.map((line, i) => (
          <motion.div
            key={i}
            initial={{ opacity: 0, y: 2 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.22 }}
            style={{
              color: line.startsWith('→') ? 'var(--color-signal)' :
                     line === 'strategy validated.' ? 'var(--color-profit)' :
                     line === 'ready.' ? 'var(--color-profit)' :
                     line === '' ? 'transparent' :
                     'var(--color-ink)',
              whiteSpace: 'pre',
              minHeight: line === '' ? '0.5em' : 'auto',
            }}
          >
            {line || '\u00A0'}
          </motion.div>
        ))}
        {parseStatus === 'parsing' && <span className="caret" />}
      </div>

      {parseStatus === 'done' && (
        <motion.div
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3, duration: 0.5 }}
          className="mt-8 flex justify-center"
        >
          <button
            type="button"
            onClick={onProceed}
            className="font-mono wavy-underline text-[15px]"
            style={{ background: 'none', border: 'none', padding: '4px 0', color: 'var(--color-ink)' }}
          >
            run backtest
          </button>
        </motion.div>
      )}
    </section>
  );
}
