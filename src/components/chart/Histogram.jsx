export default function Histogram({ data }) {
  const { bins } = data;
  if (!bins.length) {
    return (
      <div className="uppercase-label-sm">NO CLOSED TRADES</div>
    );
  }
  const max = Math.max(...bins.map((b) => b.count));
  const W = 400;
  const H = 180;
  const padL = 30, padR = 10, padT = 10, padB = 24;
  const innerW = W - padL - padR;
  const innerH = H - padT - padB;
  const barW = innerW / bins.length;

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ display: 'block' }}>
      {/* zero line */}
      {bins.map((b, i) => {
        const h = max > 0 ? (b.count / max) * innerH : 0;
        const x = padL + i * barW;
        const y = H - padB - h;
        const pos = b.end > 0 && b.start < 0 ? null : b.start >= 0;
        const color = pos === null ? '#9CA3B8' : pos ? '#00D395' : '#FF4D5E';
        return (
          <g key={i}>
            <rect x={x + 1} y={y} width={Math.max(1, barW - 2)} height={h} fill={color} opacity="0.75" />
          </g>
        );
      })}
      <line x1={padL} x2={W - padR} y1={H - padB} y2={H - padB} stroke="#2A3244" strokeWidth="1" />
      <text x={padL} y={H - 8} fontSize="9" fontFamily="JetBrains Mono" fill="#5F6B82">
        {bins[0].start.toFixed(0)}%
      </text>
      <text x={W - padR} y={H - 8} fontSize="9" fontFamily="JetBrains Mono" fill="#5F6B82" textAnchor="end">
        {bins[bins.length - 1].end.toFixed(0)}%
      </text>
    </svg>
  );
}
