# Glossary

Words used the same way in the code, the docs and conversations.

- **Workout**: the one in progress, from Start until it finishes. Built by `start` in `src/domain/workout.js` and changed only by `advance`.
- **Session**: a saved workout in the history (`state.sessions`), with its date, duration and one entry per exercise done.
- **Step**: one set of one exercise in the workout order (`{ slot, set, group }`). The warmup items are not steps.
- **Draft**: a workout in progress saved in the browser (`treinoRR.draft`) so it can be resumed after leaving.
- **Sound cue**: the name of a sound the workout asks for: `tick` (countdown second), `go` (a start) or `chime` (an item or set done).
- **Prescription**: a level plus its targets for the next workout, as `prescribe` returns it.
