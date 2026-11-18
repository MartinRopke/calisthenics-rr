import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createAudio } from '../../../src/audio/audio.js';

// A fake AudioContext class that records every instance and how often resume() ran.
const fakeContext = (initialState = 'running') => {
  const made = [];
  class Fake {
    constructor() {
      this.state = initialState;
      this.resumed = 0;
      made.push(this);
    }
    resume() {
      this.resumed++;
      return Promise.resolve();
    }
  }
  return { Fake, made };
};

describe('audio context', () => {
  it('creates the context on first use and leaves a running one alone', () => {
    const { Fake, made } = fakeContext('running');
    const audio = createAudio(Fake);
    audio.ensureRunning();
    audio.ensureRunning();
    assert.equal(made.length, 1);
    assert.equal(made[0].resumed, 0);
  });

  it('resumes a suspended context', () => {
    const { Fake, made } = fakeContext('suspended');
    createAudio(Fake).ensureRunning();
    assert.equal(made[0].resumed, 1);
  });

  it('resumes an interrupted context, which is what iOS leaves after the screen locks', () => {
    const { Fake, made } = fakeContext('interrupted');
    createAudio(Fake).ensureRunning();
    assert.equal(made[0].resumed, 1);
  });

  it('replaces a closed context with a new one', () => {
    const { Fake, made } = fakeContext('running');
    const audio = createAudio(Fake);
    const first = audio.ensureRunning();
    first.state = 'closed';
    const second = audio.ensureRunning();
    assert.equal(made.length, 2);
    assert.notEqual(first, second);
    assert.equal(audio.context, second);
  });

  it('survives a resume that rejects', async () => {
    class Rejecting {
      state = 'suspended';
      resume() {
        return Promise.reject(new Error('not allowed'));
      }
    }
    assert.doesNotThrow(() => createAudio(Rejecting).ensureRunning());
    await new Promise((r) => setTimeout(r, 5)); // an unhandled rejection would fail the run
  });

  it('returns null when the browser has no audio support', () => {
    assert.equal(createAudio(undefined).ensureRunning(), null);
  });
});
