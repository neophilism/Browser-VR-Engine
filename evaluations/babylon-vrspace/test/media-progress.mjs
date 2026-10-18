/**
 * Test-only observer. Independent clocks need to advance within one bounded
 * observation interval; a short video-audio pulse need not coincide with the
 * final animation sample. Only plain observations are retained, never nodes.
 * The function is self-contained so Playwright can serialize it into the page.
 */
export function observeMediaProgress({ state, sample } = {}) {
  state ??= globalThis.portableTest.mediaProgress;
  if (!sample) {
    const p = globalThis.foundationProbe, wall = p.audio.sources.get('wall-playback');
    sample = {
      at: performance.now(), steps: p.physicsSteps, animation: p.inspect().animations[0],
      audioState: p.audio.context.state, clock: p.audio.context.currentTime, sampleRate: p.audio.context.sampleRate,
      video: { time: p.video.currentTime, duration: Number.isFinite(p.video.duration) ? p.video.duration : null, paused: p.video.paused,
        seeking: p.video.seeking, loop: p.video.loop, decodedFrames: p.video.getVideoPlaybackQuality().totalVideoFrames },
      invalidMessages: wall.meterState.invalidMessages, wallWindows: wall.meterState.history,
    };
  }
  const finite = Number.isFinite, integer = value => Number.isSafeInteger(value) && value >= 0;
  if (!sample || !finite(sample.at) || !integer(sample.steps) || !finite(sample.clock) || sample.clock < 0
    || !integer(sample.sampleRate) || sample.sampleRate < 8000 || sample.sampleRate > 384000
    || !sample.animation || !finite(sample.animation.frame) || !Array.isArray(sample.animation.position)
    || sample.animation.position.length !== 3 || !sample.animation.position.every(finite)
    || !['running', 'suspended', 'closed', 'interrupted'].includes(sample.audioState)
    || !sample.video || !finite(sample.video.time) || sample.video.time < 0
    || (sample.video.duration !== null && (!finite(sample.video.duration) || sample.video.duration <= 0 || sample.video.time > sample.video.duration))
    || ['paused', 'seeking', 'loop'].some(key => typeof sample.video[key] !== 'boolean')
    || !integer(sample.video.decodedFrames) || sample.invalidMessages !== 0
    || !Array.isArray(sample.wallWindows) || sample.wallWindows.length > 128) throw new Error('Invalid native media progress sample');
  for (const window of sample.wallWindows) {
    if (!window || !integer(window.startFrame) || !integer(window.endFrame) || window.endFrame <= window.startFrame
      || window.sampleRate !== sample.sampleRate || !finite(window.inputRms) || window.inputRms < 0
      || !integer(window.invalidFrames) || !integer(window.droppedWindows)) throw new Error('Invalid native paired audio window');
  }

  const latest = sample.wallWindows.at(-1) ?? null;
  const baselineFrame = state.before ? Math.max(state.before.clock * state.before.sampleRate, state.before.latestWallWindow?.endFrame ?? 0) : Infinity;
  const positive = sample.wallWindows.find(window => window.startFrame >= baselineFrame && window.endFrame > baselineFrame
    && window.sampleRate === sample.sampleRate && window.invalidFrames === 0 && window.droppedWindows === 0
    && window.inputRms > .01) ?? null;
  const observation = structuredClone({ ...sample, wallWindows: undefined, latestWallWindow: latest, positiveWallWindow: positive });
  delete observation.wallWindows;
  if (!state.before) {
    state.before = observation; state.last = observation; state.samples = []; state.videoElapsed = 0;
    state.wraps = 0; state.videoDuration = sample.video.duration; state.milestones = {}; state.ready = false;
    return false;
  }
  const before = state.before, previous = state.last;
  if (sample.at < previous.at || sample.clock < previous.clock || sample.steps < previous.steps
    || sample.video.decodedFrames < previous.video.decodedFrames || sample.sampleRate !== before.sampleRate
    || (state.videoDuration !== null && sample.video.duration !== state.videoDuration)) throw new Error('Native media progress clocks changed identity or regressed');
  state.videoDuration ??= sample.video.duration;
  if (state.samples.length >= 256) throw new Error('Native media progress observation bound exceeded');
  state.samples.push(observation); state.last = observation;
  // No seek or playback control is issued during this observation. A backward
  // time transition on the same looping element records a wrap. Missed entire
  // loops under a stalled sampler can only under-count this elapsed duration.
  if (!sample.video.seeking && !previous.video.seeking && sample.video.duration !== null && previous.video.duration !== null) {
    const delta = sample.video.time - previous.video.time;
    if (delta >= 0) state.videoElapsed += delta;
    else if (sample.video.loop && previous.video.loop) { state.videoElapsed += sample.video.duration + delta; state.wraps++; }
  }
  const mark = (name, passed) => { if (passed && !Object.hasOwn(state.milestones, name)) state.milestones[name] = state.samples.length - 1; };
  mark('audio', sample.audioState === 'running' && sample.clock > before.clock + .2);
  mark('physics', sample.steps > before.steps);
  mark('animation', sample.animation.entityId === before.animation.entityId && sample.animation.clip === before.animation.clip
    && sample.animation.playing === true && sample.animation.frame !== before.animation.frame
    && sample.animation.position.some((value, index) => Math.abs(value - before.animation.position[index]) > .001));
  mark('video', !sample.video.paused && !sample.video.seeking && sample.video.loop
    && state.videoElapsed > .1 && sample.video.decodedFrames > before.video.decodedFrames);
  mark('wallAudio', !!positive);
  state.ready = ['audio', 'physics', 'animation', 'video', 'wallAudio'].every(name => Object.hasOwn(state.milestones, name))
    && sample.audioState === 'running' && sample.animation.playing === true && !sample.video.paused && !sample.video.seeking;
  return state.ready ? state : false;
}
