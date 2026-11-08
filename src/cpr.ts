/**
 * Chest-compression rate and depth from a phone's accelerometer.
 *
 * Integrating acceleration twice to get distance drifts within seconds. CPR is
 * periodic, so we use the spectral approach instead: fit the last few seconds
 * of vertical acceleration with a sum of harmonics of the compression
 * frequency, then divide each harmonic by (k*omega)^2 to get displacement
 * exactly, with no drift. Depth is the peak-to-peak of that displacement.
 */

export interface Sample {
  /** Seconds. */
  t: number;
  /** Vertical acceleration in m/s^2, any constant offset (gravity) allowed. */
  a: number;
}

export interface Estimate {
  /** Compressions per minute. */
  rate: number;
  depthCm: number;
  /** Share of the signal the fit explains, 0-1. Low means no steady rhythm. */
  quality: number;
}

export const WINDOW_S = 3;
export const MIN_SPAN_S = 2;
export const MIN_SAMPLES = 40;
export const F_MIN = 0.75;
export const F_MAX = 3.0;
export const HARMONICS = 4;

/** AHA adult CPR targets. */
export const RATE_MIN = 100;
export const RATE_MAX = 120;
export const DEPTH_MIN = 5;
export const DEPTH_MAX = 6;
export const QUALITY_MIN = 0.5;

const TAU = 2 * Math.PI;

/** Solve A x = b in place with partial pivoting. Returns null if singular. */
export function solve(A: number[][], b: number[]): number[] | null {
  const n = b.length;
  for (let c = 0; c < n; c++) {
    let p = c;
    for (let r = c + 1; r < n; r++) if (Math.abs((A[r] as number[])[c] as number) > Math.abs((A[p] as number[])[c] as number)) p = r;
    if (Math.abs((A[p] as number[])[c] as number) < 1e-12) return null;
    [A[c], A[p]] = [A[p] as number[], A[c] as number[]];
    [b[c], b[p]] = [b[p] as number, b[c] as number];
    const rowC = A[c] as number[];
    for (let r = c + 1; r < n; r++) {
      const rowR = A[r] as number[];
      const f = (rowR[c] as number) / (rowC[c] as number);
      if (f === 0) continue;
      for (let k = c; k < n; k++) rowR[k] = (rowR[k] as number) - f * (rowC[k] as number);
      b[r] = (b[r] as number) - f * (b[c] as number);
    }
  }
  const x = new Array<number>(n).fill(0);
  for (let r = n - 1; r >= 0; r--) {
    const row = A[r] as number[];
    let s = b[r] as number;
    for (let k = r + 1; k < n; k++) s -= (row[k] as number) * (x[k] as number);
    x[r] = s / (row[r] as number);
  }
  return x;
}

interface Fit {
  /** cos and sin coefficients for harmonics 1..K: [c1, s1, c2, s2, ...] */
  harmonics: number[];
  r2: number;
}

/** Least-squares fit of a + b*t + sum_k (c_k cos(k w t) + s_k sin(k w t)). Works on unevenly spaced samples. */
export function fitHarmonics(t: readonly number[], a: readonly number[], f: number, K = HARMONICS): Fit | null {
  const P = 2 + 2 * K;
  const ATA = Array.from({ length: P }, () => new Array<number>(P).fill(0));
  const ATb = new Array<number>(P).fill(0);
  const row = new Array<number>(P).fill(0);
  let mean = 0;
  for (const v of a) mean += v;
  mean /= a.length;
  for (let i = 0; i < t.length; i++) {
    const ti = t[i] as number;
    row[0] = 1;
    row[1] = ti;
    for (let k = 1; k <= K; k++) {
      const ph = TAU * k * f * ti;
      row[2 * k] = Math.cos(ph);
      row[2 * k + 1] = Math.sin(ph);
    }
    const y = (a[i] as number) - mean;
    for (let p = 0; p < P; p++) {
      const rp = row[p] as number;
      ATb[p] = (ATb[p] as number) + rp * y;
      const ATAp = ATA[p] as number[];
      for (let q = p; q < P; q++) ATAp[q] = (ATAp[q] as number) + rp * (row[q] as number);
    }
  }
  for (let p = 0; p < P; p++) for (let q = 0; q < p; q++) (ATA[p] as number[])[q] = (ATA[q] as number[])[p] as number;
  const x = solve(ATA, ATb);
  if (!x) return null;

  let sse = 0;
  let sst = 0;
  for (let i = 0; i < t.length; i++) {
    const ti = t[i] as number;
    let model = (x[0] as number) + (x[1] as number) * ti;
    for (let k = 1; k <= K; k++) {
      const ph = TAU * k * f * ti;
      model += (x[2 * k] as number) * Math.cos(ph) + (x[2 * k + 1] as number) * Math.sin(ph);
    }
    const y = (a[i] as number) - mean;
    sse += (y - model) ** 2;
    sst += y * y;
  }
  return { harmonics: x.slice(2), r2: sst > 0 ? Math.max(0, 1 - sse / sst) : 0 };
}

/** Peak-to-peak displacement (m) of the motion whose acceleration harmonics are given. */
export function displacementPeakToPeak(harmonics: readonly number[], f: number): number {
  const K = harmonics.length / 2;
  const w = TAU * f;
  let lo = Infinity;
  let hi = -Infinity;
  const N = 256;
  for (let i = 0; i < N; i++) {
    const t = i / (N * f);
    let x = 0;
    for (let k = 1; k <= K; k++) {
      const kw2 = (k * w) ** 2;
      x -= ((harmonics[2 * k - 2] as number) * Math.cos(k * w * t) + (harmonics[2 * k - 1] as number) * Math.sin(k * w * t)) / kw2;
    }
    if (x < lo) lo = x;
    if (x > hi) hi = x;
  }
  return hi - lo;
}

/** Harmonic-sum periodogram: rewards a frequency whose first three harmonics all carry energy. */
function harmonicScore(t: readonly number[], a: readonly number[], f: number): number {
  let score = 0;
  for (let k = 1; k <= 3; k++) {
    let c = 0;
    let s = 0;
    const w = TAU * k * f;
    for (let i = 0; i < t.length; i++) {
      const ph = w * (t[i] as number);
      c += (a[i] as number) * Math.cos(ph);
      s += (a[i] as number) * Math.sin(ph);
    }
    score += c * c + s * s;
  }
  return score;
}

/** Estimate compression rate and depth from the last WINDOW_S seconds of samples (sorted by time). */
export function estimate(samples: readonly Sample[], windowS = WINDOW_S): Estimate | null {
  const last = samples[samples.length - 1];
  if (!last) return null;
  let start = samples.length - 1;
  while (start > 0 && (samples[start - 1] as Sample).t >= last.t - windowS) start--;
  const win = samples.slice(start);
  const first = win[0] as Sample;
  if (win.length < MIN_SAMPLES || last.t - first.t < MIN_SPAN_S) return null;

  const mid = (first.t + last.t) / 2;
  const t = win.map((s) => s.t - mid);
  // Remove mean and linear trend (gravity, slow tilt) before searching for the rhythm.
  const n = t.length;
  let st = 0;
  let sa = 0;
  let stt = 0;
  let sta = 0;
  for (let i = 0; i < n; i++) {
    const ti = t[i] as number;
    const ai = (win[i] as Sample).a;
    st += ti;
    sa += ai;
    stt += ti * ti;
    sta += ti * ai;
  }
  const slope = (n * sta - st * sa) / (n * stt - st * st || 1);
  const icept = (sa - slope * st) / n;
  const a = win.map((s, i) => s.a - icept - slope * (t[i] as number));

  // 1. Coarse rhythm search with a harmonic-sum periodogram.
  let coarse = F_MIN;
  let bestScore = -1;
  for (let f = F_MIN; f <= F_MAX + 1e-9; f += 0.01) {
    const sc = harmonicScore(t, a, f);
    if (sc > bestScore) {
      bestScore = sc;
      coarse = f;
    }
  }

  // 2. A harmonic sum can lock onto half (or a third, or double) the true
  //    rhythm. Fit the full model at each related frequency and keep the
  //    highest one that explains the motion about as well as the best does:
  //    a subharmonic only "wins" by also fitting noise with its extra terms.
  const r2At = (f: number) => fitHarmonics(t, a, f)?.r2 ?? -1;
  const refine = (center: number, span: number, step: number) => {
    let bestF = center;
    let bestR2 = -1;
    for (let f = Math.max(F_MIN, center - span); f <= Math.min(F_MAX, center + span) + 1e-9; f += step) {
      const r2 = r2At(f);
      if (r2 > bestR2) {
        bestR2 = r2;
        bestF = f;
      }
    }
    return { f: bestF, r2: bestR2 };
  };
  const candidates = [1, 2, 3, 1 / 2, 1 / 3, 3 / 2, 2 / 3]
    .map((ratio) => coarse * ratio)
    .filter((f) => f >= F_MIN - 0.02 && f <= F_MAX + 0.02)
    .map((f) => refine(f, 0.02, 0.002));
  const bestR2 = Math.max(...candidates.map((c) => c.r2));
  const chosen = candidates.filter((c) => c.r2 >= bestR2 - 0.02).reduce((hi, c) => (c.f > hi.f ? c : hi));
  const final = refine(chosen.f, 0.003, 0.0005);

  const fit = fitHarmonics(t, a, final.f);
  if (!fit) return null;
  return {
    rate: final.f * 60,
    depthCm: displacementPeakToPeak(fit.harmonics, final.f) * 100,
    quality: fit.r2,
  };
}

/**
 * Projects raw accelerometer readings onto the direction of gravity, so the
 * phone can be held at any angle. Gravity is tracked with a slow low-pass.
 */
export class VerticalTracker {
  private g: [number, number, number] | null = null;
  private lastT = 0;
  private readonly tau: number;

  constructor(tau = 1.0) {
    this.tau = tau;
  }

  push(t: number, ax: number, ay: number, az: number): number {
    if (!this.g) {
      this.g = [ax, ay, az];
      this.lastT = t;
    }
    const dt = Math.min(0.5, Math.max(0, t - this.lastT));
    this.lastT = t;
    const k = 1 - Math.exp(-dt / this.tau);
    const g = this.g;
    g[0] += k * (ax - g[0]);
    g[1] += k * (ay - g[1]);
    g[2] += k * (az - g[2]);
    const norm = Math.hypot(g[0], g[1], g[2]) || 1;
    return (ax * g[0] + ay * g[1] + az * g[2]) / norm - norm;
  }
}

export type RateZone = 'none' | 'slow' | 'good' | 'fast';
export type DepthZone = 'none' | 'shallow' | 'good' | 'deep';

export interface Advice {
  rate: RateZone;
  depth: DepthZone;
  /** What the coach should say right now. */
  say: string;
  focus: 'start' | 'rate' | 'depth' | 'good';
}

export function rateZone(rate: number): Exclude<RateZone, 'none'> {
  return rate < RATE_MIN ? 'slow' : rate > RATE_MAX ? 'fast' : 'good';
}

export function depthZone(depthCm: number): Exclude<DepthZone, 'none'> {
  return depthCm < DEPTH_MIN ? 'shallow' : depthCm > DEPTH_MAX ? 'deep' : 'good';
}

/** Turn an estimate into one clear instruction, fixing the bigger problem first. */
export function coach(est: Estimate | null): Advice {
  if (!est || est.quality < QUALITY_MIN || est.depthCm < 1) {
    return { rate: 'none', depth: 'none', focus: 'start', say: 'Push hard and fast in the center of the chest.' };
  }
  const rate = rateZone(est.rate);
  const depth = depthZone(est.depthCm);
  const rateOff = rate === 'slow' ? (RATE_MIN - est.rate) / RATE_MIN : rate === 'fast' ? (est.rate - RATE_MAX) / RATE_MAX : 0;
  const depthOff = depth === 'shallow' ? (DEPTH_MIN - est.depthCm) / DEPTH_MIN : depth === 'deep' ? (est.depthCm - DEPTH_MAX) / DEPTH_MAX : 0;
  if (rateOff === 0 && depthOff === 0) return { rate, depth, focus: 'good', say: "That's it. Keep going." };
  if (depthOff >= rateOff) {
    return { rate, depth, focus: 'depth', say: depth === 'shallow' ? 'Push harder. At least five centimeters.' : 'Ease off a little. No deeper than six centimeters.' };
  }
  return { rate, depth, focus: 'rate', say: rate === 'slow' ? 'Faster. Push to the beat.' : 'Slow down a little. Follow the beat.' };
}

/** Synthetic compressions: the same motion model the tests use, for Practice mode. */
export interface SynthParams {
  rate: number;
  depthCm: number;
  /** Second and third harmonic, as a share of the fundamental displacement. */
  h2: number;
  h3: number;
  phase2: number;
  phase3: number;
}

export function synthDisplacement(p: SynthParams, t: number): number {
  const w = (TAU * p.rate) / 60;
  const A = p.depthCm / 200;
  return A * (Math.cos(w * t) + p.h2 * Math.cos(2 * w * t + p.phase2) + p.h3 * Math.cos(3 * w * t + p.phase3));
}

/** Acceleration at a given phase of the compression cycle (lets Practice mode change rate smoothly). */
export function accelerationAtPhase(p: SynthParams, phase: number): number {
  const w = (TAU * p.rate) / 60;
  const A = p.depthCm / 200;
  return -A * w * w * (Math.cos(phase) + 4 * p.h2 * Math.cos(2 * phase + p.phase2) + 9 * p.h3 * Math.cos(3 * phase + p.phase3));
}

export function synthAcceleration(p: SynthParams, t: number): number {
  return accelerationAtPhase(p, ((TAU * p.rate) / 60) * t);
}

/** True peak-to-peak depth of a synthetic motion, in cm. */
export function synthDepthCm(p: SynthParams): number {
  let lo = Infinity;
  let hi = -Infinity;
  const period = 60 / p.rate;
  for (let i = 0; i < 2000; i++) {
    const x = synthDisplacement(p, (i / 2000) * period);
    lo = Math.min(lo, x);
    hi = Math.max(hi, x);
  }
  return (hi - lo) * 100;
}
