# Tech

## Stack
- React 19, TypeScript (strict, `noUncheckedIndexedAccess`), Vite 8, plain CSS.
- Browser APIs: DeviceMotionEvent, Web Audio, SpeechSynthesis, Geolocation, Screen Wake Lock.
- Vitest + fast-check.

## Commands
- `npm test`: run all tests once. Never use watch mode from the agent.
- `npm run typecheck`, `npm run build`.
- `npm run dev` serves on port 5175. Ask the user to run it.

## Signal-processing rules
- `src/cpr.ts` and `src/mvt.ts` are pure: no `window`, no DOM, no React.
- Never estimate depth by integrating acceleration twice. Use the harmonic fit in `estimate()`.
- Targets (`RATE_MIN`, `RATE_MAX`, `DEPTH_MIN`, `DEPTH_MAX`) come from the AHA adult guidelines. Change them only with a cited source.
- `estimate()` must return low quality (or null) rather than a confident wrong answer.
- Practice mode must feed synthetic samples through the same `estimate()` and `coach()` as real sensor data.

## Testing rules
- Every property in `.kiro/specs/lazarus/design.md` has a fast-check test.
- When fast-check finds a counterexample, keep it in the property's `examples`.
- Never widen a tolerance to make a change pass.

## Data rules
- AED data: OpenAEDMap vector tiles first, Overpass mirrors second. Always show OpenStreetMap (ODbL) attribution and a note that not every AED is mapped.
- No tracking and no server. Location stays in the browser and is only sent to the AED data services.

## Browser rules
- iOS needs `DeviceMotionEvent.requestPermission()` from a tap. Handle denial with a clear message.
- If no motion events arrive within 2 seconds, offer Practice mode.
- Respect `prefers-reduced-motion`.
