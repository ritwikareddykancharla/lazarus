# Lazarus 👻

**A CPR coach that lives in your phone.** Hold your phone against your hand while you practice chest compressions. Lazarus measures your rate and depth live from the motion sensor, and a ghost coach tells you what to fix: "Push harder", "Slow down", "That's it. Keep going." It also finds the nearest mapped defibrillator.

Kiroween 2026 entry, **Frankenstein** category: phone motion sensors, signal processing, speech synthesis, Web Audio, OpenStreetMap AED data and vector tiles, stitched into one page that needs no install.

> **Training aid, not a medical device.** In a real emergency, call your local emergency number first and follow the dispatcher.

## Why

The American Heart Association says bystander CPR can double or triple a person's chance of surviving cardiac arrest, but most people have never practiced and have no idea whether they're pushing hard or fast enough. Feedback devices and training manikins cost money and live in training centers. Almost everyone already carries a phone with an accelerometer.

## Try it

- **On a phone:** open the page, press **Start coaching**, allow motion access, hold the phone flat against the back of your top hand (screen up) and push on a firm cushion.
- **On a laptop:** press **Open the simulator** and drag the rate and depth sliders. The simulated motion goes through exactly the same measuring code as real sensor data.
- **AED finder:** press **Find AEDs near me**, or try King's Cross, Times Square or Pike Place.

Targets follow the AHA adult guidelines: **100–120 compressions per minute, 5–6 cm deep**.

## Run it locally

Requires Node.js 22.18 or newer.

```bash
npm install
npm run dev        # http://localhost:5175
npm test           # property-based tests for the depth estimator, coach and tile decoder
npm run build      # static site in dist/
```

Motion sensors only work on secure pages (`https://` or `localhost`), so test phones against a deployed copy or an HTTPS tunnel.

## How a phone measures depth

An accelerometer only measures acceleration. Integrating it twice to get distance drifts by centimeters within seconds. CPR is a rhythm, so Lazarus uses a spectral method instead:

1. **Vertical axis at any angle.** A slow low-pass filter tracks the direction of gravity, and each reading is projected onto it, so the phone can be tilted or on a forearm. This also cancels the opposite sign conventions of iOS and Android.
2. **Find the rhythm.** A harmonic-sum periodogram scans 45–180 per minute over the last 3 seconds. Because that can lock onto a multiple or fraction of the true rhythm, the candidates at ½, ⅓, ⅔, 1.5×, 2× and 3× are each fitted with the full model, and the highest frequency that fits about as well as the best one wins.
3. **Fit the motion.** Least squares fits a constant, a linear drift and 4 harmonics of that rhythm. This works on unevenly spaced samples, so no resampling is needed.
4. **Depth without drift.** For a rhythm, displacement of each harmonic is its acceleration divided by (k·ω)². Depth is the peak-to-peak of the reconstructed displacement.
5. **Quality.** The fit's R² says whether there's a steady rhythm at all; below 50% the coach just says "Push hard and fast in the center of the chest."

The coach fixes the bigger problem first, by relative distance from the target.

## How it's tested

[fast-check](https://fast-check.dev/) property-based tests in `src/cpr.test.ts` and `src/mvt.test.ts`:

- **Accuracy:** for any rate 70–150/min, depth 2–8 cm, realistic compression shapes (2nd harmonic up to 25%, 3rd up to 10%), sensor rates 40–120 Hz with up to 30% timing jitter, noise up to 0.4 m/s² and slow drift, the estimate is within **2 per minute** and **0.4 cm**.
- **Any angle:** the same motion measured with the phone at any orientation, with iOS or Android sign conventions, gives depth within 0.5 cm.
- **No false confidence:** random jostling never produces a confident estimate.
- **Coach:** zones always match the AHA targets, and "Keep going" only appears when both rate and depth are on target.
- **AED tiles:** the vector-tile decoder reads a real OpenAEDMap tile correctly, and the tile search always covers the whole search circle.

fast-check found a real bug while building: the first rhythm search read a clean 88/min as 132/min (1.5×). The fix is step 2 above, and the three counterexamples are kept as permanent test examples.

The simulator and the AED finder were also run in headless Chromium: the coach moved from "Push harder" to "That's it. Keep going." as the sliders reached 110/min and 5.5 cm, and the AED search returned real defibrillators around King's Cross.

**Not tested yet:** real phones doing real compressions. Depth accuracy on actual hardware, and how well holding the phone against the hand tracks chest depth, still need to be measured against a training manikin.

## AED data

AED locations come from [OpenStreetMap](https://www.openstreetmap.org/copyright) (ODbL), the `emergency=defibrillator` tag. Lazarus reads cached vector tiles from [OpenAEDMap](https://openaedmap.org/) and fetches details for the closest 12, falling back to the public Overpass API. Not every AED is mapped, and some may be locked or moved.

## Project layout

```
src/
  cpr.ts           Rate/depth estimator, gravity tracker, coach, motion model (pure, tested)
  mvt.ts           Minimal Mapbox Vector Tile point decoder (pure, tested)
  aed.ts           AED search: OpenAEDMap tiles, then Overpass
  geo.ts           Distance, bearing, compass
  sound.ts         Heartbeat metronome, voice coach
  App.tsx          Setup, coaching session, simulator
  AedFinder.tsx, Radar.tsx, Trace.tsx
.kiro/             Steering, spec and hooks used to build this with Kiro
```

## License

[MIT](./LICENSE)
