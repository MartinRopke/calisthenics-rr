import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { scheduleSfx } from '../../../src/audio/schedule.js';

describe('sound scheduling', () => {
  it('plays at once when nothing else is playing and marks the sound as busy', () => {
    const r = scheduleSfx({ now: 10, busyUntil: 0, len: 0.14 });
    assert.equal(r.offset, 0);
    assert.ok(Math.abs(r.busyUntil - 10.18) < 1e-9);
  });

  it('queues a chime behind the sound that is still playing', () => {
    const r = scheduleSfx({ now: 10, busyUntil: 10.5, len: 0.56 });
    assert.ok(Math.abs(r.offset - 0.5) < 1e-9);
  });

  it('drops a chime that would start more than 1.2 s late', () => {
    assert.equal(scheduleSfx({ now: 10, busyUntil: 11.5, len: 0.56 }), null);
  });

  it('plays a countdown beep on time even while a chime is still playing', () => {
    const r = scheduleSfx({ now: 10, busyUntil: 11, len: 0.14, onTime: true });
    assert.equal(r.offset, 0);
  });

  it('plays a countdown beep on time even when the queue is far behind', () => {
    const r = scheduleSfx({ now: 10, busyUntil: 12.5, len: 0.14, onTime: true });
    assert.equal(r.offset, 0);
  });

  it('does not shorten the time the queue stays busy', () => {
    const r = scheduleSfx({ now: 10, busyUntil: 11, len: 0.14, onTime: true });
    assert.equal(r.busyUntil, 11);
  });
});
