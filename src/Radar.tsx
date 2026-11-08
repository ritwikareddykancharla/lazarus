import { formatDistance } from './geo';

export interface Blip {
  id: string;
  distance: number;
  bearing: number;
  label: string;
}

const SIZE = 280;
const C = SIZE / 2;
const R = C - 18;

/** North-up radar: you in the middle, blips by bearing and distance. */
export function Radar({ blips, range, selected, onSelect }: { blips: Blip[]; range: number; selected?: string; onSelect?: (id: string) => void }) {
  const rings = [0.25, 0.5, 1];
  return (
    <svg className="radar" viewBox={`0 0 ${SIZE} ${SIZE}`} role="img" aria-label={`Radar showing ${blips.length} defibrillators within ${formatDistance(range)}`}>
      <defs>
        <radialGradient id="radar-bg">
          <stop offset="0%" stopColor="#0d2a1a" />
          <stop offset="100%" stopColor="#030a06" />
        </radialGradient>
        <linearGradient id="sweep" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor="#39ff88" stopOpacity="0" />
          <stop offset="100%" stopColor="#39ff88" stopOpacity="0.35" />
        </linearGradient>
      </defs>
      <circle cx={C} cy={C} r={R} fill="url(#radar-bg)" stroke="#1e6b40" />
      {rings.map((f) => (
        <g key={f}>
          <circle cx={C} cy={C} r={R * f} fill="none" stroke="#1e6b40" strokeDasharray="3 4" />
          <text x={C + 4} y={C - R * f + 12} className="radar-label">
            {formatDistance(range * f)}
          </text>
        </g>
      ))}
      <line x1={C} y1={C - R} x2={C} y2={C + R} stroke="#123d26" />
      <line x1={C - R} y1={C} x2={C + R} y2={C} stroke="#123d26" />
      <text x={C} y={12} textAnchor="middle" className="radar-north">
        N
      </text>
      <g className="sweep">
        <path d={`M${C},${C} L${C + R},${C} A${R},${R} 0 0,0 ${C + R * Math.cos(-0.6)},${C + R * Math.sin(-0.6)} Z`} fill="url(#sweep)" />
      </g>
      {blips.map((b, i) => {
        const d = Math.min(1, b.distance / range) * R;
        const a = ((b.bearing - 90) * Math.PI) / 180;
        const x = C + d * Math.cos(a);
        const y = C + d * Math.sin(a);
        const isSel = b.id === selected;
        return (
          <g key={b.id} className={isSel ? 'blip sel' : 'blip'} onClick={() => onSelect?.(b.id)}>
            <title>{`${i + 1}. ${b.label}, ${formatDistance(b.distance)}`}</title>
            <circle cx={x} cy={y} r={isSel ? 9 : 7} />
            <text x={x} y={y + 3.5} textAnchor="middle">
              {i + 1}
            </text>
          </g>
        );
      })}
      <circle cx={C} cy={C} r={5} className="you" />
    </svg>
  );
}
