# 0011 Targets depend only on hitting them

Status: accepted

## Context

`targetsFor` used to build the next target from what was done in each set. Doing 30, 15, 15 seconds against a 10, 10, 10 target made the next target 30, 20, 20, and a set below its target lowered that target. A single over- or under-performing set skewed every later workout, and the stepper on the workout screen invited exactly that.

## Decision

- The next targets come from the previous targets and from one question: were they all hit? If yes, each goes up one step (1 rep, or 5 s on holds), capped at the top of the range. If not, the same targets repeat.
- Doing more or less than a target never changes the target itself.
- The workout screen asks only "Hit target" or "Missed", with no stepper. A hit stores the target; a miss stores one step below it (`setResult`), which keeps `sets` numeric for the history and for the check.
- Entries saved without targets still fall back to what was done.

## Consequences

- Targets are predictable: they only go up when all three sets were hit, and the future-workout preview matches what happens.
- The history no longer holds the exact reps or seconds of a missed set, only that it fell short.
- An entry saved with the old rule keeps its numbers, and the next target is recomputed from its stored targets.
