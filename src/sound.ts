/** Heartbeat metronome and the ghost coach's voice. */

let ctx: AudioContext | null = null;
function audio(): AudioContext {
  ctx ??= new AudioContext();
  return ctx;
}

function thump(ac: AudioContext, at: number, gain: number, fromHz: number) {
  const osc = ac.createOscillator();
  const g = ac.createGain();
  osc.frequency.setValueAtTime(fromHz, at);
  osc.frequency.exponentialRampToValueAtTime(45, at + 0.12);
  g.gain.setValueAtTime(0.0001, at);
  g.gain.exponentialRampToValueAtTime(gain, at + 0.008);
  g.gain.exponentialRampToValueAtTime(0.0001, at + 0.16);
  osc.connect(g).connect(ac.destination);
  osc.start(at);
  osc.stop(at + 0.2);
}

/** Lookahead scheduler so beats stay steady even when the main thread is busy. */
export class Metronome {
  private timer = 0;
  private nextAt = 0;
  bpm = 110;

  async start(bpm = this.bpm): Promise<void> {
    this.stop();
    this.bpm = bpm;
    const ac = audio();
    await ac.resume();
    this.nextAt = ac.currentTime + 0.1;
    this.timer = window.setInterval(() => {
      while (this.nextAt < ac.currentTime + 0.12) {
        thump(ac, this.nextAt, 0.55, 110);
        thump(ac, this.nextAt + 0.11, 0.25, 85);
        this.nextAt += 60 / this.bpm;
      }
    }, 25);
  }

  stop(): void {
    window.clearInterval(this.timer);
    this.timer = 0;
  }
}

export function speak(text: string): void {
  if (!('speechSynthesis' in window)) return;
  window.speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(text);
  u.rate = 1.05;
  u.pitch = 0.85;
  window.speechSynthesis.speak(u);
}

export function hush(): void {
  if ('speechSynthesis' in window) window.speechSynthesis.cancel();
}
