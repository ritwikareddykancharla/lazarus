import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import {
  coach,
  DEPTH_MAX,
  DEPTH_MIN,
  estimate,
  QUALITY_MIN,
  RATE_MAX,
  RATE_MIN,
  synthAcceleration,
  synthDepthCm,
  VerticalTracker,
  type Sample,
  type SynthParams,
} from './cpr';

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const gaussian = (rng: () => number) => Math.sqrt(-2 * Math.log(Math.max(rng(), 1e-12))) * Math.cos(2 * Math.PI * rng());

const motion: fc.Arbitrary<SynthParams> = fc.record({
  rate: fc.double({ min: 70, max: 150, noNaN: true }),
  depthCm: fc.double({ min: 2, max: 8, noNaN: true }),
  h2: fc.double({ min: 0, max: 0.25, noNaN: true }),
  h3: fc.double({ min: 0, max: 0.1, noNaN: true }),
  phase2: fc.double({ min: 0, max: 2 * Math.PI, noNaN: true }),
  phase3: fc.double({ min: 0, max: 2 * Math.PI, noNaN: true }),
});

const sensor = fc.record({
  hz: fc.double({ min: 40, max: 120, noNaN: true }),
  jitter: fc.double({ min: 0, max: 0.3, noNaN: true }),
  noise: fc.double({ min: 0, max: 0.4, noNaN: true }),
  drift: fc.double({ min: -0.2, max: 0.2, noNaN: true }),
  t0: fc.double({ min: 0, max: 1000, noNaN: true }),
  seed: fc.integer({ min: 1, max: 2 ** 31 - 1 }),
});

type Sensor = typeof sensor extends fc.Arbitrary<infer T> ? T : never;

/** A phone sampling vertical acceleration (with gravity, drift, jitter and noise) for `seconds`. */
function record(p: SynthParams, s: Sensor, seconds = 4): Sample[] {
  const rng = mulberry32(s.seed);
  const dt = 1 / s.hz;
  const out: Sample[] = [];
  for (let i = 0; i * dt < seconds; i++) {
    const t = s.t0 + i * dt + (rng() - 0.5) * s.jitter * dt;
    out.push({ t, a: 9.81 + s.drift * (t - s.t0) + synthAcceleration(p, t) + s.noise * gaussian(rng) });
  }
  return out;
}

describe('estimate', () => {
  it('recovers rate within 2/min and depth within 0.4 cm for any realistic compression', () => {
    fc.assert(
      fc.property(motion, sensor, (p, s) => {
        const est = estimate(record(p, s));
        expect(est).not.toBeNull();
        expect(Math.abs((est?.rate ?? 0) - p.rate)).toBeLessThanOrEqual(2);
        expect(Math.abs((est?.depthCm ?? 0) - synthDepthCm(p))).toBeLessThanOrEqual(0.4);
        expect(est?.quality ?? 0).toBeGreaterThan(QUALITY_MIN);
      }),
      {
        numRuns: 60,
        // Found by fast-check: the first version locked onto 1.5x the real rhythm (88 -> 132 per minute).
        examples: [
          [{ rate: 88.24213390349739, depthCm: 2, h2: 0, h3: 0, phase2: 0, phase3: 0 }, { hz: 40, jitter: 0, noise: 0, drift: 0, t0: 0, seed: 1 }],
          [{ rate: 87.16007857918738, depthCm: 2, h2: 0, h3: 0, phase2: 0, phase3: 0 }, { hz: 40, jitter: 0, noise: 0.3370373165211504, drift: 0, t0: 0, seed: 2013261803 }],
          [{ rate: 88.26567296731629, depthCm: 2, h2: 0, h3: 0, phase2: 0, phase3: 0 }, { hz: 59.25, jitter: 0, noise: 0, drift: 0, t0: 0, seed: 1 }],
        ],
      },
    );
  });

  it('reports low quality when the phone is just being jostled', () => {
    fc.assert(
      fc.property(sensor, (s) => {
        const rng = mulberry32(s.seed);
        const samples: Sample[] = [];
        for (let i = 0; i < 4 * s.hz; i++) samples.push({ t: s.t0 + i / s.hz, a: 9.81 + 0.8 * gaussian(rng) });
        const est = estimate(samples);
        expect(est === null || est.quality < QUALITY_MIN).toBe(true);
      }),
      { numRuns: 40 },
    );
  });

  it('waits for at least two seconds of data', () => {
    const p: SynthParams = { rate: 110, depthCm: 5.5, h2: 0, h3: 0, phase2: 0, phase3: 0 };
    expect(estimate(record(p, { hz: 60, jitter: 0, noise: 0, drift: 0, t0: 0, seed: 1 }, 1.5))).toBeNull();
  });
});

describe('VerticalTracker', () => {
  it('measures the same depth whatever angle the phone is held at', () => {
    fc.assert(
      fc.property(
        motion,
        fc.double({ min: 0, max: Math.PI, noNaN: true }),
        fc.double({ min: 0, max: 2 * Math.PI, noNaN: true }),
        fc.boolean(),
        (p, theta, phi, iosSign) => {
          // Unit vector of gravity in the phone's frame. iOS reports the opposite sign to Android.
          const u = [Math.sin(theta) * Math.cos(phi), Math.sin(theta) * Math.sin(phi), Math.cos(theta)] as const;
          const sign = iosSign ? -1 : 1;
          const tracker = new VerticalTracker();
          const samples: Sample[] = [];
          for (let i = 0; i < 6 * 60; i++) {
            const t = i / 60;
            const g = sign * (9.81 + synthAcceleration(p, t));
            const v = tracker.push(t, g * u[0], g * u[1], g * u[2]);
            if (t >= 2) samples.push({ t, a: v });
          }
          const est = estimate(samples);
          expect(Math.abs((est?.depthCm ?? 0) - synthDepthCm(p))).toBeLessThanOrEqual(0.5);
        },
      ),
      { numRuns: 40 },
    );
  });
});

describe('coach', () => {
  it('agrees with the AHA targets and only praises compressions that hit both', () => {
    fc.assert(
      fc.property(
        fc.double({ min: 40, max: 180, noNaN: true }),
        fc.double({ min: 1, max: 10, noNaN: true }),
        fc.double({ min: QUALITY_MIN, max: 1, noNaN: true }),
        (rate, depthCm, quality) => {
          const advice = coach({ rate, depthCm, quality });
          expect(advice.rate).toBe(rate < RATE_MIN ? 'slow' : rate > RATE_MAX ? 'fast' : 'good');
          expect(advice.depth).toBe(depthCm < DEPTH_MIN ? 'shallow' : depthCm > DEPTH_MAX ? 'deep' : 'good');
          expect(advice.focus === 'good').toBe(advice.rate === 'good' && advice.depth === 'good');
          if (advice.focus === 'rate') expect(advice.rate).not.toBe('good');
          if (advice.focus === 'depth') expect(advice.depth).not.toBe('good');
        },
      ),
    );
  });

  it('asks you to start when there is no steady rhythm', () => {
    expect(coach(null).focus).toBe('start');
    expect(coach({ rate: 110, depthCm: 5.5, quality: 0.2 }).focus).toBe('start');
  });
});
