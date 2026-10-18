import { WebXRExperienceHelper } from '@babylonjs/core/XR/webXRExperienceHelper.js';

const abortError = () => new DOMException('The VR request was cancelled.', 'AbortError');
const describeError = error => {
  const messages = {
    NotAllowedError: 'VR permission was denied. Allow access in the browser, then try again.',
    SecurityError: 'VR needs a secure page and a direct press of Enter VR.',
    NotSupportedError: 'This device does not support the required immersive VR and floor reference space.',
    InvalidStateError: 'Another VR session may be active. Close it, then try again.',
    AbortError: 'The VR request was cancelled.',
  };
  const code = Object.hasOwn(messages, error?.name) ? error.name : 'XRFailure';
  return { code, message: messages[code] || 'VR could not complete this operation. You can retry or leave using the headset system controls.' };
};

export async function createBabylonXRExperience(scene, canvas) {
  const helper = await WebXRExperienceHelper.CreateAsync(scene);
  const manager = helper.sessionManager;
  helper.camera.minZ = scene.activeCamera.minZ;
  helper.camera.maxZ = scene.activeCamera.maxZ;
  const renderTarget = manager.getWebXRRenderTarget({ canvasElement: canvas });
  requireNativeFloorAndConfirmedEnd(manager);
  return { helper, renderTarget };
}

/** Narrow adapter over public manager methods, including the helper's error path. */
export function requireNativeFloorAndConfirmedEnd(manager) {
  // The pinned helper otherwise silently substitutes viewer space plus a 1.7 m
  // height. This adapter requires a real floor reference and fails explicitly.
  manager.setReferenceSpaceTypeAsync = async type => {
    if (type !== 'local-floor') throw new TypeError('The evaluation requires local-floor.');
    const session = manager.session;
    const floor = await session.requestReferenceSpace('local-floor');
    const viewer = await session.requestReferenceSpace('viewer');
    if (manager.session !== session || !manager.inXRSession) throw abortError();
    manager.viewerReferenceSpace = viewer;
    manager.referenceSpace = manager.baseReferenceSpace = floor;
    manager.onXRReferenceSpaceInitialized.notifyObservers(floor);
    return floor;
  };
  manager.exitXRAsync = async () => {
    if (!manager.inXRSession) return;
    const session = manager.session;
    await session.end();
    if (manager.inXRSession && manager.session === session) throw new Error('The browser has not confirmed session end.');
  };
}

/** Owns one browser session. It neither records headset poses nor qualifies hardware. */
export class XRSessionController {
  constructor({ createExperience, platform = globalThis.navigator, secure = globalThis.isSecureContext, hooks = {} }) {
    this.createExperience = createExperience;
    this.platform = platform;
    this.secure = secure;
    this.hooks = hooks;
    this.phase = 'unprepared';
    this.supported = false;
    this.error = null;
    this.session = null;
    this.visibility = null;
    this.frames = 0;
    this.experience = null;
    this.operation = null;
    this.observers = [];
    this.sessionListeners = [];
    this.disposing = false;
    this.disposed = false;
  }
  get active() { return this.session !== null; }
  get busy() { return !!this.prepareTask || !!this.entryTask || !!this.endTask || this.disposing; }
  // A support query/helper preparation does not own the desktop pose. Entry
  // takes ownership synchronously, before beforeEnter or requestSession runs.
  get blocksDesktopPose() { return this.active || !!this.operation || !!this.entryTask || !!this.endTask || this.disposing || this.disposed; }
  inspect() {
    return { phase: this.phase, supported: this.supported, active: this.active, busy: this.busy,
      blocksDesktopPose: this.blocksDesktopPose,
      visibility: this.visibility, frames: this.frames, referenceSpace: this.active ? 'local-floor' : null,
      error: this.error, qualification: 'physical-device-evidence-pending' };
  }
  setPhase(phase) { this.phase = phase; this.hooks.state?.(this.inspect()); }
  fail(error) { this.error = describeError(error); this.setPhase('error'); }
  observe(observable, callback) {
    const observer = observable.add(callback);
    this.observers.push(() => observable.remove(observer));
  }
  async prepare() {
    if (this.disposed || this.disposing) return false;
    if (this.prepareTask) return this.prepareTask;
    if (this.experience) { if (!this.active && !this.entryTask) this.setPhase('ready'); return true; }
    this.setPhase('preparing');
    this.prepareTask = (async () => {
      try {
        this.supported = !!this.secure && !!this.platform?.xr && await this.platform.xr.isSessionSupported('immersive-vr');
        if (!this.supported) { if (!this.disposing) this.setPhase('unavailable'); return false; }
        this.experience = await this.createExperience();
        const { helper } = this.experience;
        this.observe(helper.sessionManager.onXRSessionInit, session => this.sessionStarted(session));
        this.observe(helper.onInitialXRPoseSetObservable, camera => this.hooks.initialPose?.(camera));
        // Babylon registers its camera observer first; this sees that frame's
        // tracked pose before application locomotion queues the next offset.
        this.observe(helper.sessionManager.onXRFrameObservable, frame => {
          if (!this.active || this.operation?.cancelled || this.disposing || this.phase === 'ending') return;
          try {
            if (this.hooks.frame?.(frame, helper) !== false) {
              this.frames = Math.min(1_000_000, this.frames + 1);
              if (this.phase === 'entering') this.setPhase('immersive');
            }
          } catch (error) {
            this.fail(error);
            void this.endCurrent().catch(() => {});
          }
        });
        if (!this.disposing) this.setPhase('ready');
        return true;
      } catch (error) { if (!this.disposing) this.fail(error); return false; }
    })().finally(() => { this.prepareTask = null; this.hooks.state?.(this.inspect()); });
    return this.prepareTask;
  }
  enter() {
    if (this.entryTask) return this.entryTask;
    if (this.disposed || this.disposing || this.active || !this.experience) return Promise.resolve(false);
    if (this.platform?.userActivation?.isActive === false) { this.fail(new DOMException('', 'SecurityError')); return Promise.resolve(false); }
    this.error = null;
    const operation = { cancelled: false };
    this.operation = operation;
    try {
      this.hooks.beforeEnter?.();
      this.setPhase('requesting');
    } catch (error) {
      // No native request or entry task owns this failed preparation hook.
      if (this.operation === operation) this.operation = null;
      this.fail(error);
      return Promise.resolve(false);
    }
    // No capability probe or asynchronous preparation intervenes between this
    // user action and Babylon's browser requestSession call.
    const { helper, renderTarget } = this.experience;
    this.entryTask = (async () => {
      try {
        await helper.enterXRAsync('immersive-vr', 'local-floor', renderTarget, { requiredFeatures: ['local-floor'] });
        if (operation.cancelled || this.disposing) { await this.endCurrent(); return false; }
        return this.active;
      } catch (error) {
        if (this.active) {
          try { await this.endCurrent(); }
          catch { return false; }
        }
        if (!operation.cancelled && !this.disposing) this.fail(error);
        return false;
      }
    })().finally(() => {
      if (this.operation === operation) this.operation = null;
      this.entryTask = null;
      if (!this.active && !this.disposing && this.phase === 'cancelling') this.setPhase('ready');
      else this.hooks.state?.(this.inspect());
    });
    return this.entryTask;
  }
  sessionStarted(session) {
    this.session = session;
    this.frames = 0;
    const listen = (type, callback) => {
      session.addEventListener(type, callback);
      this.sessionListeners.push(() => session.removeEventListener(type, callback));
    };
    listen('end', () => this.sessionEnded(session));
    listen('visibilitychange', () => {
      this.visibility = session.visibilityState;
      this.hooks.visibility?.(this.visibility);
      this.hooks.state?.(this.inspect());
    });
    listen('select', event => { if (!this.disposing && this.phase === 'immersive') this.hooks.select?.(event); });
    this.visibility = session.visibilityState;
    this.hooks.visibility?.(this.visibility);
    // WebXR has no AbortSignal for requestSession. A late grant is ended by
    // Babylon's initialization error path before it can start the XR renderer.
    if (!this.operation || this.operation.cancelled || this.disposing) throw abortError();
    this.setPhase('entering');
  }
  sessionEnded(session) {
    if (this.session !== session) return;
    for (const remove of this.sessionListeners.splice(0)) remove();
    this.session = null;
    this.visibility = null;
    this.hooks.ended?.();
    if (!this.disposing && !this.operation?.cancelled) this.setPhase(this.error ? 'error' : 'ready');
  }
  cancel() {
    if (!this.entryTask) return this.endCurrent();
    this.operation.cancelled = true;
    this.setPhase('cancelling');
    return this.entryTask.then(() => !this.active);
  }
  exit() { return this.entryTask ? this.cancel() : this.endCurrent(); }
  endCurrent() {
    if (this.endTask) return this.endTask;
    const session = this.session;
    if (!session) return Promise.resolve(true);
    this.setPhase('ending');
    // Do not use the helper's exit method: its pinned manager catches an end
    // failure and still cleans up as though the native session had ended.
    this.endTask = (async () => {
      try {
        await session.end();
        if (this.session === session) throw new Error('The browser has not confirmed session end.');
        return true;
      } catch (error) { this.fail(error); throw error; }
    })().finally(() => { this.endTask = null; this.hooks.state?.(this.inspect()); });
    return this.endTask;
  }
  dismissError() {
    if (this.disposed || this.disposing) return;
    this.error = null;
    this.setPhase(this.active ? 'immersive' : this.experience ? 'ready' : 'unavailable');
  }
  async dispose() {
    if (this.disposed) return;
    if (this.disposeTask) return this.disposeTask;
    this.disposing = true;
    this.disposeTask = (async () => {
      try {
        if (this.prepareTask) await this.prepareTask;
        if (this.entryTask) await this.cancel();
        await this.endCurrent();
        if (this.active) throw new Error('Cannot dispose resources owned by an active XR session.');
        for (const remove of this.observers.splice(0)) remove();
        this.experience?.renderTarget.dispose();
        this.experience?.helper.dispose();
        this.experience = null;
        this.disposed = true;
        this.setPhase('disposed');
      } finally { this.disposing = false; this.disposeTask = null; }
    })();
    return this.disposeTask;
  }
}

/** The standard left thumbstick requests motion; unsupported layouts stay still. */
export function xrMovementAxes(session, tracking) {
  if (!tracking || session?.visibilityState !== 'visible') return [0, 0];
  const source = Array.from(session.inputSources || []).find(input => input.handedness === 'left' && input.gamepad?.mapping === 'xr-standard');
  const axes = source?.gamepad?.axes;
  if (!axes || axes.length < 4 || ![axes[2], axes[3]].every(value => Number.isFinite(value) && Math.abs(value) <= 1)) return [0, 0];
  const length = Math.hypot(axes[2], axes[3]);
  if (length <= .2) return [0, 0];
  const strength = Math.min(1, (length - .2) / .8);
  return [axes[2] / length * strength, axes[3] / length * strength];
}
