import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createSounds } from '../../../src/audio/sounds.js';

// A fake AudioContext class: records every instance, resume() calls and every oscillator started
// ({ freq, at }). `clock.t` is the shared currentTime the test moves forward.
const fakeAudio = (initialState = 'running') => {
  const made = [];
  const started = [];
  const clock = { t: 10 };
  class Fake {
    constructor() {
      this.state = initialState;
      this.resumed = 0;
      this.destination = {};
      made.push(this);
    }
    get currentTime() {
      return clock.t;
    }
    resume() {
      this.resumed++;
      return Promise.resolve();
    }
    createOscillator() {
      const o = {
        frequency: { value: 0 },
        connect() {},
        start: (at) => started.push({ freq: o.frequency.value, at }),
        stop() {},
      };
      return o;
    }
    createGain() {
      return { gain: { setValueAtTime() {}, exponentialRampToValueAtTime() {} }, connect() {} };
    }
  }
  return { Fake, made, started, clock };
};
const near = (a, b) => Math.abs(a - b) < 1e-9;
const starts = (started) => started.map((s) => [s.freq, Math.round(s.at * 1000) / 1000]);

describe('sound context', () => {
  it('creates the context on first use and leaves a running one alone', () => {
    const { Fake, made } = fakeAudio('running');
    const sounds = createSounds({ AudioContextClass: Fake });
    sounds.wake();
    sounds.play('tick');
    assert.equal(made.length, 1);
    assert.equal(made[0].resumed, 0);
    assert.equal(sounds.state(), 'running');
  });

  it('resumes a suspended context', () => {
    const { Fake, made } = fakeAudio('suspended');
    createSounds({ AudioContextClass: Fake }).wake();
    assert.equal(made[0].resumed, 1);
  });

  it('resumes an interrupted context, which is what iOS leaves after the screen locks', () => {
    const { Fake, made } = fakeAudio('interrupted');
    createSounds({ AudioContextClass: Fake }).wake();
    assert.equal(made[0].resumed, 1);
  });

  it('replaces a closed context with a new one', () => {
    const { Fake, made } = fakeAudio('running');
    const sounds = createSounds({ AudioContextClass: Fake });
    sounds.wake();
    made[0].state = 'closed';
    sounds.wake();
    assert.equal(made.length, 2);
    assert.equal(sounds.state(), 'running');
  });

  it('survives a resume that rejects', async () => {
    class Rejecting {
      state = 'suspended';
      resume() {
        return Promise.reject(new Error('not allowed'));
      }
    }
    const sounds = createSounds({ AudioContextClass: Rejecting });
    assert.doesNotThrow(() => sounds.wake());
    assert.doesNotThrow(() => sounds.play('chime'));
    await new Promise((r) => setTimeout(r, 5)); // an unhandled rejection would fail the run
  });

  it('has no state and plays nothing when the browser has no audio support', () => {
    const sounds = createSounds({ AudioContextClass: undefined });
    assert.doesNotThrow(() => sounds.play('go'));
    assert.equal(sounds.state(), null);
  });

  it('a throwing context never breaks the caller', () => {
    class Broken {
      constructor() {
        throw new Error('no');
      }
    }
    const sounds = createSounds({ AudioContextClass: Broken });
    assert.doesNotThrow(() => sounds.play('chime'));
    assert.doesNotThrow(() => sounds.wake());
  });
});

describe('sound cues', () => {
  it('tick is one short 660 Hz tone, go one 1175 Hz tone', () => {
    const { Fake, started } = fakeAudio();
    const sounds = createSounds({ AudioContextClass: Fake });
    sounds.play('tick');
    sounds.play('go');
    assert.deepEqual(starts(started), [
      [660, 10],
      [1175, 10],
    ]);
  });

  it('chime is three rising tones', () => {
    const { Fake, started } = fakeAudio();
    createSounds({ AudioContextClass: Fake }).play('chime');
    assert.deepEqual(starts(started), [
      [660, 10],
      [880, 10.12],
      [1320, 10.24],
    ]);
  });

  it('go vibrates where vibration exists, tick and chime do not', () => {
    const { Fake } = fakeAudio();
    const buzz = [];
    const sounds = createSounds({ AudioContextClass: Fake, vibrate: (ms) => buzz.push(ms) });
    sounds.play('tick');
    sounds.play('chime');
    sounds.play('go');
    assert.deepEqual(buzz, [120]);
  });

  it('go still vibrates without audio support, and a throwing vibrate is ignored', () => {
    const buzz = [];
    createSounds({ AudioContextClass: undefined, vibrate: (ms) => buzz.push(ms) }).play('go');
    assert.deepEqual(buzz, [120]);
    const sounds = createSounds({
      AudioContextClass: undefined,
      vibrate: () => {
        throw new Error('x');
      },
    });
    assert.doesNotThrow(() => sounds.play('go'));
  });

  it('ignores unknown cue names', () => {
    const { Fake, started } = fakeAudio();
    createSounds({ AudioContextClass: Fake }).play('boom');
    assert.equal(started.length, 0);
  });
});

describe('sound queue', () => {
  it('queues a chime behind the chime that is still playing', () => {
    const { Fake, started } = fakeAudio();
    const sounds = createSounds({ AudioContextClass: Fake });
    sounds.play('chime');
    sounds.play('chime');
    assert.ok(near(started[3].at, 10.6));
  });

  it('plays a chime at once when the last one has ended', () => {
    const { Fake, started, clock } = fakeAudio();
    const sounds = createSounds({ AudioContextClass: Fake });
    sounds.play('chime');
    clock.t = 11;
    sounds.play('chime');
    assert.ok(near(started[3].at, 11));
  });

  it('drops a chime that would start more than 1.2 s late', () => {
    const { Fake, started } = fakeAudio();
    const sounds = createSounds({ AudioContextClass: Fake });
    sounds.play('chime'); // 10.0
    sounds.play('chime'); // 10.6
    sounds.play('chime'); // 11.2, 1.2 s late: still plays
    sounds.play('chime'); // 11.8: dropped
    assert.equal(started.length, 9);
  });

  it('plays a countdown beep on time even while chimes are queued', () => {
    const { Fake, started } = fakeAudio();
    const sounds = createSounds({ AudioContextClass: Fake });
    sounds.play('chime');
    sounds.play('chime');
    sounds.play('tick');
    sounds.play('go');
    assert.deepEqual(starts(started).slice(6), [
      [660, 10],
      [1175, 10],
    ]);
  });

  it('a countdown beep does not shorten the time the queue stays busy', () => {
    const { Fake, started } = fakeAudio();
    const sounds = createSounds({ AudioContextClass: Fake });
    sounds.play('chime');
    sounds.play('tick');
    sounds.play('chime');
    assert.ok(near(started[4].at, 10.6));
  });

  it('a chime waits behind a go beep', () => {
    const { Fake, started } = fakeAudio();
    const sounds = createSounds({ AudioContextClass: Fake });
    sounds.play('go');
    sounds.play('chime');
    assert.ok(near(started[1].at, 10.51));
  });
});
