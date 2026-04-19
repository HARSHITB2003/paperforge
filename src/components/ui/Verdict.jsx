export default function Verdict({ verdict }) {
  if (!verdict) return null;
  const ratingColor = {
    strong: 'var(--color-profit)',
    reasonable: 'var(--color-hold)',
    weak: 'var(--color-graphite)',
    harmful: 'var(--color-loss)',
  }[verdict.rating] || 'var(--color-graphite)';

  return (
    <div className="fade-up" style={{ maxWidth: 780 }}>
      <div className="flex items-center gap-3 mb-6">
        <span className="uppercase-label">THE VERDICT</span>
        <span className="flex-1 hairline" />
        <span
          className="font-mono uppercase-label-sm"
          style={{ color: ratingColor, letterSpacing: '0.1em' }}
        >
          {verdict.rating}
        </span>
      </div>
      <p
        className="font-serif"
        style={{ fontSize: 20, lineHeight: 1.6, color: 'var(--color-ink)' }}
      >
        {verdict.verdict}
      </p>
      {verdict.headline_number && (
        <div
          className="mt-6 font-mono tabular text-[40px]"
          style={{ color: ratingColor, letterSpacing: '-0.01em' }}
        >
          {verdict.headline_number}
        </div>
      )}
    </div>
  );
}
