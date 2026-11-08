# Requirements: Lazarus

## Introduction
Lazarus coaches people practicing hands-only CPR using a phone's motion sensor, and helps them find the nearest mapped AED.

## Requirement 1: Emergency safety
**User story:** As someone facing a real emergency, I want the app to send me to emergency services first.

### Acceptance criteria
1. The system SHALL show buttons to call 911 and 112 on every screen.
2. The system SHALL show "Training aid, not a medical device" on every screen.
3. The setup screen SHALL list the hands-only CPR steps: call, push hard and fast in the center of the chest, don't stop.

## Requirement 2: Measure compressions
**User story:** As a learner, I want to see my compression rate and depth live, so that I know what to change.

### Acceptance criteria
1. WHEN the user starts coaching THEN the system SHALL read the motion sensor, asking for permission where the browser requires it.
2. IF permission is denied THEN the system SHALL explain how to allow it.
3. IF no motion data arrives within 2 seconds THEN the system SHALL return to setup and suggest Practice mode.
4. WHILE coaching, the system SHALL estimate rate (per minute) and depth (cm) from the last 3 seconds of motion, updated 8 times a second.
5. The system SHALL measure along the direction of gravity, whatever the phone's orientation.
6. The estimate SHALL be within 2 per minute and 0.4 cm for rates 70–150/min, depths 2–8 cm, sensor rates 40–120 Hz with timing jitter, noise and slow drift.
7. IF there is no steady rhythm THEN the system SHALL NOT show a depth or rate value.

## Requirement 3: Coach
**User story:** As a learner, I want one clear instruction at a time.

### Acceptance criteria
1. The system SHALL classify rate as slow (< 100), good (100–120) or fast (> 120), and depth as shallow (< 5 cm), good (5–6 cm) or deep (> 6 cm).
2. WHEN both are good THEN the system SHALL say "That's it. Keep going."
3. WHEN one or both are off THEN the system SHALL address the one furthest from its target, relative to the target.
4. WHERE the voice coach is on, the system SHALL speak a new instruction when it changes, no more often than every 3.5 seconds, and repeat it every 12 seconds.
5. WHERE the heartbeat is on, the system SHALL play a beat at 110 per minute.
6. The system SHALL show elapsed time, compression count and the share of time on target, and a summary when the session stops.
7. The system SHALL keep the screen awake while coaching where the browser allows it.

## Requirement 4: Practice without a phone
**User story:** As a laptop user, I want to try the coach without a motion sensor.

### Acceptance criteria
1. The system SHALL offer a simulator with rate (60–160/min) and depth (2–9 cm) sliders.
2. Simulated motion SHALL go through the same estimator and coach as sensor data.

## Requirement 5: Find an AED
**User story:** As a rescuer with a helper, I want to know where the nearest defibrillator is.

### Acceptance criteria
1. WHEN the user asks for AEDs near them THEN the system SHALL use their location and list mapped AEDs within 1.5 km, nearest first, with distance, compass direction, location notes, access and hours where mapped.
2. The system SHALL show AEDs on a north-up radar.
3. Each AED SHALL link to walking directions.
4. IF location is unavailable THEN the system SHALL explain why and offer preset cities.
5. IF the primary data service fails THEN the system SHALL try the backup services before reporting an error.
6. The system SHALL credit OpenStreetMap (ODbL) and state that not every AED is mapped.
