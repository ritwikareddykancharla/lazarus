# Structure

```
src/
  main.tsx         React entry
  App.tsx          Setup screen, Session (phone or simulator), gauges, summary
  AedFinder.tsx    Location, presets, radar + list
  Radar.tsx        SVG radar
  Trace.tsx        Monitor-style motion trace
  cpr.ts           Estimator, VerticalTracker, coach, motion model (pure)
  cpr.test.ts
  mvt.ts           Vector tile point decoder (pure)
  mvt.test.ts
  aed.ts           AED search and parsing
  geo.ts           Haversine, bearing, compass
  sound.ts         Metronome, speech
  styles.css
.kiro/
  steering/        product.md, tech.md, structure.md
  specs/lazarus/   requirements.md, design.md, tasks.md
  hooks/
```

## Conventions
- Components: PascalCase files, named exports. Pure modules: camelCase, tests beside them.
- Units are explicit in names: `depthCm`, `radiusM`, `rate` is per minute, sample `t` is seconds, `a` is m/s².
