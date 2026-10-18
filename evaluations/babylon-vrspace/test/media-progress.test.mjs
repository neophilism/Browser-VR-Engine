import test from 'node:test';
import assert from 'node:assert/strict';
import { observeMediaProgress } from './media-progress.mjs';

// Synthetic edge cases test the observation logic, not a browser or device.
const sample = (overrides = {}) => ({ at: 0, steps: 1, animation: { entityId: 'bird', clip: 'flap', playing: true, frame: 0, position: [0, 5, 0] },
  audioState: 'running', clock: 1, sampleRate: 48000, video: { time: 1.98, duration: 2, paused: false, seeking: false, loop: true, decodedFrames: 60 },
  invalidMessages: 0, wallWindows: [], ...overrides });
const pulse = (startFrame = 48000) => ({ type: 'paired-audio-window', startFrame, endFrame: startFrame + 896, frames: 896, sampleRate: 48000,
  inputChannels: 1, postChannels: 1, invalidFrames: 0, inputRms: .2, postGainRms: .02, gainMin: .1, gainMax: .1, gainSamples: 896, droppedWindows: 0 });
const begin = before => { const state = {}; assert.equal(observeMediaProgress({ state, sample: before ?? sample() }), false); return state; };
const advance = overrides => sample({ at: 350, steps: 5, clock: 1.35,
  animation: { entityId: 'bird', clip: 'flap', playing: true, frame: 9, position: [0, 5, .3] },
  video: { time: .3, duration: 2, paused: false, seeking: false, loop: true, decodedFrames: 70 }, ...overrides });

test('looping video progress and an earlier real pulse survive a silent final window', () => {
  const state = begin();
  assert.equal(observeMediaProgress({ state, sample: sample({ at: 50, clock: 1.05, wallWindows: [pulse()] }) }), false);
  assert.equal(observeMediaProgress({ state, sample: advance({ wallWindows: [{ ...pulse(60000), inputRms: 0, postGainRms: 0 }] }) }), state);
  assert.equal(state.wraps, 1); assert(Math.abs(state.videoElapsed - .32) < 1e-9);
  assert.equal(state.milestones.wallAudio, 0); assert.equal(state.milestones.animation, 1);
  assert.equal(state.last.latestWallWindow.inputRms, 0);
});
for (const [name, windows] of [
  ['silence', [{ ...pulse(), inputRms: 0 }]], ['stale pulse', [pulse(47000)]],
  ['invalid PCM', [{ ...pulse(), invalidFrames: 1 }]], ['dropped window', [{ ...pulse(), droppedWindows: 1 }]],
]) test('media progress cannot pass with ' + name, () => {
  const state = begin(); assert.equal(observeMediaProgress({ state, sample: advance({ wallWindows: windows }) }), false);
  assert.equal(Object.hasOwn(state.milestones, 'wallAudio'), false);
});
for (const [name, change] of [
  ['frozen decoded frames', { video: { ...advance().video, decodedFrames: 60 } }],
  ['frozen animation', { animation: sample().animation }], ['frozen physics', { steps: 1 }],
  ['suspended context', { audioState: 'suspended' }], ['seeking video', { video: { ...advance().video, seeking: true } }],
]) test('media progress cannot pass with ' + name, () => {
  const state = begin(); assert.equal(observeMediaProgress({ state, sample: advance({ wallWindows: [pulse()], ...change }) }), false);
});
test('a transient positive native window is copied instead of retaining mutable history', () => {
  const state = begin(), window = pulse(); observeMediaProgress({ state, sample: advance({ wallWindows: [window] }) });
  window.inputRms = 0; assert.equal(state.last.positiveWallWindow.inputRms, .2);
});
test('pending video metadata stays incomplete and binds the first native duration', () => {
  const state = begin(sample({ video: { ...sample().video, time: 0, duration: null, decodedFrames: 0 } }));
  assert.equal(observeMediaProgress({ state, sample: advance({ wallWindows: [pulse()] }) }), false);
  assert.equal(state.videoDuration, 2);
  assert.equal(observeMediaProgress({ state, sample: advance({ at: 550, clock: 1.55, video: { ...advance().video, time: .5, decodedFrames: 75 } }) }), state);
});
test('nonfinite forged worklet values cannot produce progress', () => {
  for (const window of [{ ...pulse(), inputRms: Infinity }, { ...pulse(), startFrame: Infinity, endFrame: Infinity }]) {
    assert.throws(() => observeMediaProgress({ state: begin(), sample: advance({ wallWindows: [window] }) }), /Invalid native paired/);
  }
});
test('invalid samples, clock regression and excess observations fail visibly', () => {
  for (const changed of [advance({ clock: .5 }), advance({ invalidMessages: 1 }), advance({ steps: NaN })]) {
    const state = begin(); assert.throws(() => observeMediaProgress({ state, sample: changed }), /Invalid|regressed/);
  }
  const state = begin(); for (let i = 0; i < 256; i++) observeMediaProgress({ state, sample: sample({ at: i }) });
  assert.throws(() => observeMediaProgress({ state, sample: sample({ at: 256 }) }), /bound exceeded/);
});
