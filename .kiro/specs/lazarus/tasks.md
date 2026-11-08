# Implementation Plan: Lazarus

- [x] 1. Scaffold (Vite, React, TypeScript strict, Vitest, fast-check), MIT license, steering docs

- [x] 2. Estimator in `src/cpr.ts`
  - [x] 2.1 Harmonic least-squares fit and drift-free displacement, properties P1, P3
    - _Requirements: 2.4, 2.6_
  - [x] 2.2 Rhythm search with subharmonic/harmonic disambiguation (fixes the 1.5× bug fast-check found)
    - _Requirements: 2.6_
  - [x] 2.3 VerticalTracker, property P4
    - _Requirements: 2.5_
  - [x] 2.4 Quality gate, properties P2, P6
    - _Requirements: 2.7_

- [x] 3. Coach and zones, property P5
  - _Requirements: 3.1–3.3_

- [x] 4. Session UI: gauges, trace, stats, voice, heartbeat, wake lock, summary
  - _Requirements: 3.4–3.7_

- [x] 5. Phone sensor path with iOS permission and no-sensor fallback
  - _Requirements: 2.1–2.3_

- [x] 6. Simulator through the same estimator
  - _Requirements: 4.1, 4.2_

- [x] 7. AED finder: OpenAEDMap vector tiles + node details, Overpass fallback, radar, list, directions; properties P7–P9
  - _Requirements: 5.1–5.6_

- [x] 8. Safety framing on every screen
  - _Requirements: 1.1–1.3_

- [ ] 9. Real-world validation
  - [ ] 9.1 Compare depth against a CPR training manikin with a depth readout (20 compressions at 4, 5, 6 cm)
  - [ ] 9.2 iPhone (Safari) and Android (Chrome) permission flows
  - [ ] 9.3 Phone in hand vs. on forearm armband: which tracks depth better
  - [ ] 9.4 Ask a certified CPR instructor to review the coaching text

- [ ] 10. Deploy to GitHub Pages and add the live URL to the README

- [ ] 11. Stretch
  - [ ] 11.1 Recoil detection (chest not released fully between compressions)
  - [ ] 11.2 Pause detection ("Don't stop") and a 2-minute rescuer swap reminder
  - [ ] 11.3 Haptic beat for noisy places
  - [ ] 11.4 Offline support with a service worker
