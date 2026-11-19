# 0012 The guided workout is a pure module driven by events

Status: accepted

## Context

Every rule of the guided workout outside the target math (one side plus the other counting as one set, going back after a skip, a rest that ran out while the screen was locked, pause and resume, the 3, 2, 1 countdowns) lived in about 35 imperative functions and click handlers in `app.js`, all changing one global workout object. Only the slow browser tests covered them, so each new workout feature landed in the least tested code of the app.

## Decision

- `src/domain/workout.js` owns every change to the workout in progress, behind three calls:
  - `start(state, now)` builds a workout that copies what it needs from the state: the warmup list, the steps in workout order, and for each active exercise its level, targets and rest time. It never reads the live state again.
  - `advance(workout, event, now)` returns `{ workout, sounds, finished }`. `sounds` lists sound cues (`tick`, `go`, `chime`). `finished` is present only when the event ended the workout, and holds `{ session | null, levels, promotions, durationSec }` from `finishWorkout`.
  - `readout(workout, now)` returns `{ phase, remaining, total, countdown, progress, next }`, all the time math the screen needs.
- Events: `begin`, `hit`, `miss`, `skip`, `back`, `holdStart`, `pause`, `restAdd`, `restSkip`, `warmNext`, `warmSkip`, `warmBack`, `warmTimer`, `warmAdjust`, `warmSwap`, `changeLevel`, `finish`, `tick`. The timer loop sends `tick` every 250 ms, and every expiry and countdown cue comes out of it.
- The cue dedupe lives in the workout, so it is saved with the draft and a resume never replays a beep. Resuming a draft is a `tick` on the loaded workout.
- The shell maps clicks to events, plays the returned sounds, saves the draft, renders, and applies the finished result to the state in one place. Leave, discard, rendering, the wake lock and the exercise sheet stay in the shell.
- A workout carries `v: WORKOUT_VERSION`. The history store rejects drafts with another version, so drafts saved by the old code are not offered for resume.
- The old pause helper (`src/domain/timer.js`) is folded into the module.

## Consequences

- Every workout rule is a pure function from a workout, an event and a clock time, tested in Node in `test/unit/domain/workout.test.js`.
- A draft is larger, since it carries its levels and warmup list.
- Updating the app in the middle of a workout loses that workout's resume offer.
- The shell stays imperative for the DOM, audio and timers. This moves rules inward, in the direction of ADR 0001.
