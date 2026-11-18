import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { resumeTimers } from '../../../src/domain/timer.js';

describe('resuming paused timers', () => {
  it('pushes a running rest timer back by the time spent paused', () => {
    const out = resumeTimers({ restEnd: 100000, warmEnd: 0, holdStart: null }, 40000, 70000);
    assert.equal(out.restEnd, 130000);
  });

  it('keeps 25 s left on the clock when paused with 25 s left', () => {
    const pausedAt = 75000;
    const left = (100000 - pausedAt) / 1000;
    const out = resumeTimers({ restEnd: 100000, warmEnd: 0, holdStart: null }, pausedAt, 500000);
    assert.equal((out.restEnd - 500000) / 1000, left);
  });

  it('also moves a hold start that is still in its lead-in', () => {
    const out = resumeTimers({ restEnd: 0, warmEnd: 0, holdStart: 53000 }, 50000, 60000);
    assert.equal(out.holdStart, 63000);
  });

  it('leaves timers that are not running alone', () => {
    const idle = { restEnd: 0, warmEnd: 0, holdStart: null };
    assert.deepEqual(resumeTimers(idle, 1000, 9000), idle);
  });

  it('does not move anything when the pause lasted no time', () => {
    const t = { restEnd: 100000, warmEnd: 200000, holdStart: 300000 };
    assert.deepEqual(resumeTimers(t, 5000, 5000), t);
  });
});
