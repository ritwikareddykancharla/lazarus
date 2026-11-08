import { useEffect, useRef, useState } from 'react';
import { AedFinder } from './AedFinder';
import {
  accelerationAtPhase,
  coach,
  DEPTH_MAX,
  DEPTH_MIN,
  estimate,
  RATE_MAX,
  RATE_MIN,
  VerticalTracker,
  type Advice,
  type Estimate,
  type Sample,
} from './cpr';
import { hush, Metronome, speak } from './sound';
import { Trace } from './Trace';

type Mode = 'phone' | 'practice';
interface Summary {
  seconds: number;
  compressions: number;
  onTarget: number;
}

const BEAT_BPM = 110;
const TICK_MS = 125;
const KEEP_S = 8;

export function App() {
  const [mode, setMode] = useState<Mode | null>(null);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [motionError, setMotionError] = useState<string | null>(null);

  async function startPhone() {
    setMotionError(null);
    const DM = window.DeviceMotionEvent as (typeof DeviceMotionEvent & { requestPermission?: () => Promise<'granted' | 'denied'> }) | undefined;
    if (!DM) {
      setMotionError('This browser has no motion sensor access. Try Practice mode.');
      return;
    }
    if (typeof DM.requestPermission === 'function') {
      try {
        if ((await DM.requestPermission()) !== 'granted') {
          setMotionError("Motion access was denied. Allow motion sensors for this site in your browser's site settings, reload, and try again.");
          return;
        }
      } catch {
        setMotionError('Could not ask for motion access. Reload the page and try again.');
        return;
      }
    }
    setSummary(null);
    setMode('phone');
  }

  return (
    <div className="app">
      <header className="top">
        <div className="brand">
          <Ghost beating={mode !== null} />
          <div>
            <h1>Lazarus</h1>
            <p className="tag">A CPR coach that lives in your phone.</p>
          </div>
        </div>
        <div className="call">
          <a className="btn alarm" href="tel:911">
            Call 911
          </a>
          <a className="btn alarm" href="tel:112">
            Call 112
          </a>
        </div>
      </header>

      <p className="disclaimer" role="note">
        <strong>Training aid, not a medical device.</strong> In a real emergency, call your local emergency number first, put it on speaker and
        follow the dispatcher.
      </p>

      {mode ? (
        <Session
          mode={mode}
          onNoSensor={() => {
            setMode(null);
            setMotionError("This device isn't sending motion data (most laptops have no accelerometer). Try Practice mode, or open this page on your phone.");
          }}
          onStop={(s) => {
            setSummary(s);
            setMode(null);
          }}
        />
      ) : (
        <main className="setup">
          {summary && <SummaryCard summary={summary} />}
          <section className="card" aria-labelledby="how-title">
            <h2 id="how-title">Hands-only CPR</h2>
            <ol className="steps">
              <li>
                <strong>Call.</strong> Phone emergency services, or have someone else do it.
              </li>
              <li>
                <strong>Push hard and fast</strong> in the center of the chest: {RATE_MIN}–{RATE_MAX} pushes a minute, {DEPTH_MIN}–{DEPTH_MAX} cm deep,
                letting the chest come all the way back up each time.
              </li>
              <li>
                <strong>Don't stop</strong> until help or an AED arrives.
              </li>
            </ol>
          </section>

          <div className="choose">
            <section className="card" aria-labelledby="phone-title">
              <h2 id="phone-title">📱 Practice with your phone</h2>
              <p>
                Kneel by a firm cushion. Hold your phone flat against the back of your top hand (an armband on your forearm works too), screen up, and push
                on the cushion. Lazarus measures every compression and tells you what to fix.
              </p>
              <button type="button" className="btn primary big" onClick={() => void startPhone()}>
                Start coaching
              </button>
              {motionError && (
                <p className="warn" role="alert">
                  {motionError}
                </p>
              )}
            </section>
            <section className="card" aria-labelledby="sim-title">
              <h2 id="sim-title">🖥️ Practice mode (simulator)</h2>
              <p>
                No phone handy? Drive a simulated rescuer with sliders. The numbers go through exactly the same measuring code as real sensor data.
              </p>
              <button
                type="button"
                className="btn big"
                onClick={() => {
                  setSummary(null);
                  setMotionError(null);
                  setMode('practice');
                }}
              >
                Open the simulator
              </button>
            </section>
          </div>

          <AedFinder />

          <details className="card how">
            <summary>How does a phone measure depth?</summary>
            <p>
              The accelerometer only measures acceleration. Integrating it twice to get distance drifts badly within seconds. CPR is a rhythm, so
              Lazarus fits the last 3 seconds of motion with a sum of harmonics of the compression rate. For a rhythm, displacement is each harmonic of
              acceleration divided by its frequency squared, which gives depth with no drift. The phone can be held at any angle: Lazarus tracks the
              direction of gravity and measures along it.
            </p>
          </details>
        </main>
      )}

      <footer className="foot">
        Lazarus · built with Kiro for Kiroween 2026 · <a href="https://github.com/ritwikareddykancharla/lazarus">source</a>
      </footer>
    </div>
  );
}

function Ghost({ beating }: { beating: boolean }) {
  return (
    <svg className={beating ? 'ghost beat' : 'ghost'} viewBox="0 0 64 72" aria-hidden="true" style={{ animationDuration: `${60 / BEAT_BPM}s` }}>
      <path d="M32 4C17 4 8 15 8 30v38l8-6 8 6 8-6 8 6 8-6 8 6V30C56 15 47 4 32 4z" />
      <circle cx="24" cy="30" r="5" className="eye" />
      <circle cx="40" cy="30" r="5" className="eye" />
      <path d="M22 46c3 3 7 4 10 4s7-1 10-4" className="mouth" />
    </svg>
  );
}

function SummaryCard({ summary }: { summary: Summary }) {
  const minutes = Math.floor(summary.seconds / 60);
  const secs = Math.round(summary.seconds % 60);
  return (
    <section className="card summary" aria-labelledby="sum-title">
      <h2 id="sum-title">Last session</h2>
      <dl>
        <div>
          <dt>Time</dt>
          <dd>
            {minutes}:{String(secs).padStart(2, '0')}
          </dd>
        </div>
        <div>
          <dt>Compressions</dt>
          <dd>{summary.compressions}</dd>
        </div>
        <div>
          <dt>On target</dt>
          <dd>{summary.onTarget}%</dd>
        </div>
      </dl>
    </section>
  );
}

function gaussian(): number {
  return Math.sqrt(-2 * Math.log(Math.max(Math.random(), 1e-12))) * Math.cos(2 * Math.PI * Math.random());
}

function Session({ mode, onStop, onNoSensor }: { mode: Mode; onStop: (s: Summary) => void; onNoSensor: () => void }) {
  const samples = useRef<Sample[]>([]);
  const [est, setEst] = useState<Estimate | null>(null);
  const [advice, setAdvice] = useState<Advice>(() => coach(null));
  const [elapsed, setElapsed] = useState(0);
  const [count, setCount] = useState(0);
  const [onTargetPct, setOnTargetPct] = useState(0);
  const [beat, setBeat] = useState(true);
  const [voice, setVoice] = useState(true);
  const [sim, setSim] = useState({ rate: 85, depthCm: 3.5 });
  const simRef = useRef(sim);
  simRef.current = sim;
  const voiceRef = useRef(voice);
  voiceRef.current = voice;
  const onNoSensorRef = useRef(onNoSensor);
  onNoSensorRef.current = onNoSensor;
  const stats = useRef({ start: performance.now(), compressions: 0, onTarget: 0, measured: 0 });

  const pushSample = (s: Sample) => {
    const arr = samples.current;
    arr.push(s);
    if (arr.length > 2000 || (arr[0] && s.t - arr[0].t > KEEP_S * 1.5)) {
      let i = 0;
      while (i < arr.length && s.t - (arr[i] as Sample).t > KEEP_S) i++;
      arr.splice(0, i);
    }
  };

  // Phone accelerometer.
  useEffect(() => {
    if (mode !== 'phone') return;
    const tracker = new VerticalTracker();
    let got = 0;
    const onMotion = (e: DeviceMotionEvent) => {
      const g = e.accelerationIncludingGravity;
      if (!g || g.x === null || g.y === null || g.z === null) return;
      got++;
      const t = e.timeStamp / 1000;
      pushSample({ t, a: tracker.push(t, g.x, g.y, g.z) });
    };
    window.addEventListener('devicemotion', onMotion);
    const check = window.setTimeout(() => {
      if (got === 0) onNoSensorRef.current();
    }, 2000);
    return () => {
      window.removeEventListener('devicemotion', onMotion);
      window.clearTimeout(check);
    };
  }, [mode]);

  // Simulated rescuer: 60 Hz samples of the same motion model the tests use.
  useEffect(() => {
    if (mode !== 'practice') return;
    let phase = 0;
    let last = performance.now() / 1000;
    const id = window.setInterval(() => {
      const now = performance.now() / 1000;
      const p = simRef.current;
      while (last + 1 / 60 <= now) {
        last += 1 / 60;
        phase += (2 * Math.PI * p.rate) / 60 / 60;
        const params = { rate: p.rate, depthCm: p.depthCm, h2: 0.12, h3: 0.04, phase2: 0.6, phase3: 1.1 };
        pushSample({ t: last, a: 9.81 + accelerationAtPhase(params, phase) + 0.25 * gaussian() });
      }
    }, 40);
    return () => window.clearInterval(id);
  }, [mode]);

  // Measure, coach, count.
  useEffect(() => {
    let lastSaid = '';
    let lastSpoke = 0;
    const id = window.setInterval(() => {
      const e = estimate(samples.current);
      const a = coach(e);
      setEst(e);
      setAdvice(a);
      const s = stats.current;
      const now = performance.now();
      if (e && a.focus !== 'start') {
        s.compressions += (e.rate / 60) * (TICK_MS / 1000);
        s.measured += TICK_MS;
        if (a.focus === 'good') s.onTarget += TICK_MS;
      }
      setElapsed((now - s.start) / 1000);
      setCount(Math.round(s.compressions));
      setOnTargetPct(s.measured ? Math.round((s.onTarget / s.measured) * 100) : 0);
      const changed = a.say !== lastSaid;
      if (voiceRef.current && now - lastSpoke > 3500 && (changed || now - lastSpoke > 12000)) {
        speak(a.say);
        lastSaid = a.say;
        lastSpoke = now;
      }
    }, TICK_MS);
    return () => {
      window.clearInterval(id);
      hush();
    };
  }, []);

  // Heartbeat metronome.
  useEffect(() => {
    if (!beat) return;
    const m = new Metronome();
    void m.start(BEAT_BPM);
    return () => m.stop();
  }, [beat]);

  // Keep the screen awake while coaching.
  useEffect(() => {
    let lock: WakeLockSentinel | null = null;
    navigator.wakeLock?.request('screen').then(
      (l) => {
        lock = l;
      },
      () => undefined,
    );
    return () => void lock?.release();
  }, []);

  useEffect(() => {
    if (!voice) hush();
  }, [voice]);

  function stop() {
    const s = stats.current;
    onStop({ seconds: (performance.now() - s.start) / 1000, compressions: Math.round(s.compressions), onTarget: s.measured ? Math.round((s.onTarget / s.measured) * 100) : 0 });
  }

  const live = est && advice.focus !== 'start';
  const rate = live ? Math.round(est.rate) : null;
  const depth = live ? est.depthCm : null;

  return (
    <main className="session">
      <section className={`coach-line ${advice.focus}`} aria-live="polite">
        <Ghost beating />
        <p>{advice.say}</p>
      </section>

      <div className="readouts">
        <RateGauge rate={rate} zone={advice.rate} />
        <DepthGauge depth={depth} zone={advice.depth} />
        <div className="card stats">
          <dl>
            <div>
              <dt>Time</dt>
              <dd>
                {Math.floor(elapsed / 60)}:{String(Math.floor(elapsed % 60)).padStart(2, '0')}
              </dd>
            </div>
            <div>
              <dt>Compressions</dt>
              <dd>{count}</dd>
            </div>
            <div>
              <dt>On target</dt>
              <dd>{onTargetPct}%</dd>
            </div>
            <div>
              <dt>Signal</dt>
              <dd>{est ? `${Math.round(est.quality * 100)}%` : '—'}</dd>
            </div>
          </dl>
        </div>
      </div>

      <section className="card" aria-label="Motion trace">
        <Trace samples={samples} />
      </section>

      {mode === 'practice' && (
        <section className="card sim" aria-labelledby="sim-controls">
          <h2 id="sim-controls">Simulated rescuer</h2>
          <label>
            <span>
              Rate: <strong>{sim.rate}</strong> per minute
            </span>
            <input type="range" min={60} max={160} value={sim.rate} onChange={(e) => setSim((s) => ({ ...s, rate: +e.target.value }))} />
          </label>
          <label>
            <span>
              Depth: <strong>{sim.depthCm.toFixed(1)}</strong> cm
            </span>
            <input type="range" min={2} max={9} step={0.1} value={sim.depthCm} onChange={(e) => setSim((s) => ({ ...s, depthCm: +e.target.value }))} />
          </label>
          <p className="muted small">Slide into the green zones and listen to the coach change its advice.</p>
        </section>
      )}

      <div className="row controls">
        <label className="toggle">
          <input type="checkbox" checked={beat} onChange={(e) => setBeat(e.target.checked)} /> Heartbeat at {BEAT_BPM}/min
        </label>
        <label className="toggle">
          <input type="checkbox" checked={voice} onChange={(e) => setVoice(e.target.checked)} /> Voice coach
        </label>
        <button type="button" className="btn" onClick={stop}>
          Stop
        </button>
      </div>
    </main>
  );
}

function RateGauge({ rate, zone }: { rate: number | null; zone: Advice['rate'] }) {
  const lo = 60;
  const hi = 160;
  const pct = (v: number) => ((Math.min(hi, Math.max(lo, v)) - lo) / (hi - lo)) * 100;
  return (
    <section className={`card gauge rate ${zone}`} aria-label="Compression rate">
      <h2>Rate</h2>
      <p className="value">
        {rate ?? '—'}
        <small>/min</small>
      </p>
      <div className="hbar">
        <div className="target" style={{ left: `${pct(RATE_MIN)}%`, width: `${pct(RATE_MAX) - pct(RATE_MIN)}%` }} />
        {rate !== null && <div className="needle" style={{ left: `${pct(rate)}%` }} />}
      </div>
      <p className="scale">
        <span>{lo}</span>
        <span>
          target {RATE_MIN}–{RATE_MAX}
        </span>
        <span>{hi}</span>
      </p>
    </section>
  );
}

function DepthGauge({ depth, zone }: { depth: number | null; zone: Advice['depth'] }) {
  const max = 9;
  const pct = (v: number) => (Math.min(max, Math.max(0, v)) / max) * 100;
  return (
    <section className={`card gauge depth ${zone}`} aria-label="Compression depth">
      <h2>Depth</h2>
      <p className="value">
        {depth === null ? '—' : depth.toFixed(1)}
        <small>cm</small>
      </p>
      <div className="vbar">
        <div className="target" style={{ top: `${pct(DEPTH_MIN)}%`, height: `${pct(DEPTH_MAX) - pct(DEPTH_MIN)}%` }} />
        {depth !== null && <div className="fill" style={{ height: `${pct(depth)}%` }} />}
      </div>
      <p className="scale">
        target {DEPTH_MIN}–{DEPTH_MAX} cm
      </p>
    </section>
  );
}
