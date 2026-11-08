import { useEffect, useRef } from 'react';
import type { Sample } from './cpr';

const SPAN_S = 5;

/** Patient-monitor style trace of the last few seconds of vertical acceleration. */
export function Trace({ samples }: { samples: { current: Sample[] } }) {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    const g = canvas?.getContext('2d');
    if (!canvas || !g) return;
    let raf = 0;
    const draw = () => {
      raf = requestAnimationFrame(draw);
      const { width: w, height: h } = canvas;
      g.fillStyle = '#020604';
      g.fillRect(0, 0, w, h);
      g.strokeStyle = '#0c2416';
      g.lineWidth = 1;
      for (let x = 0; x < w; x += 24) {
        g.beginPath();
        g.moveTo(x + 0.5, 0);
        g.lineTo(x + 0.5, h);
        g.stroke();
      }
      for (let y = 0; y < h; y += 24) {
        g.beginPath();
        g.moveTo(0, y + 0.5);
        g.lineTo(w, y + 0.5);
        g.stroke();
      }
      const data = samples.current;
      const last = data[data.length - 1];
      if (!last) return;
      const from = last.t - SPAN_S;
      let mean = 0;
      let count = 0;
      let peak = 4;
      for (const s of data) {
        if (s.t < from) continue;
        mean += s.a;
        count++;
      }
      mean /= count || 1;
      for (const s of data) if (s.t >= from) peak = Math.max(peak, Math.abs(s.a - mean));
      g.strokeStyle = '#39ff88';
      g.shadowColor = '#39ff88';
      g.shadowBlur = 8;
      g.lineWidth = 2;
      g.beginPath();
      let started = false;
      for (const s of data) {
        if (s.t < from) continue;
        const x = ((s.t - from) / SPAN_S) * w;
        const y = h / 2 - ((s.a - mean) / peak) * (h * 0.42);
        if (started) g.lineTo(x, y);
        else {
          g.moveTo(x, y);
          started = true;
        }
      }
      g.stroke();
      g.shadowBlur = 0;
    };
    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, [samples]);

  return <canvas ref={ref} className="trace" width={720} height={150} role="img" aria-label="Live trace of your compressions" />;
}
