import { execFileSync, spawnSync } from 'node:child_process';
import { mkdir, readFile, writeFile, rm, realpath, stat, lstat, readdir } from 'node:fs/promises';
import { platform, arch } from 'node:os';
import { resolve, relative, isAbsolute } from 'node:path';
import { pathToFileURL } from 'node:url';
import { crc32, inflateSync } from 'node:zlib';
import { digest, repository, shaPattern } from './evidence.mjs';
import { evaluationCommands, evaluationReportPath, evaluationFileLimit, validateEvaluationEvidence, validateEvaluationFiles } from './evaluation-evidence.mjs';
import { childEnvironment } from './environment.mjs';
import { classifyAudit } from '../check-dependencies.mjs';
import { redact } from '../check-secret-exposure.mjs';

const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const hashPattern = /^[a-f0-9]{64}$/;
const runPathPattern = /^artifacts\/runs\/run-[A-Za-z0-9]+$/;
const pretty = value => `${JSON.stringify(value, null, 2)}\n`;
const sortedKeys = value => object(value) ? Object.keys(value).sort() : [];
const sameKeys = (value, keys) => object(value) && JSON.stringify(sortedKeys(value)) === JSON.stringify([...keys].sort());
function canonical(value) {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (object(value)) return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${canonical(value[key])}`).join(',')}}`;
  return JSON.stringify(value);
}
const equal = (a, b) => canonical(a) === canonical(b);
const fixtureDirectory = 'packages/qualification-fixtures/fixtures';
const candidateDirectory = 'evaluations/babylon-vrspace';
const metadataFiles = ['world.json', 'catalog.json', 'scenario.json', 'thresholds.json', 'workloads.json', 'devices.json', 'schema-set.json', 'comparison.json'];
export const requiredF05BuildInputs = Object.freeze([
  'src/main.js', 'src/xr-session.js', 'src/spatial-audio.js', 'src/audio-meter.js', 'src/import-policy.js', 'src/import-resources.js',
  'index.html', 'package.json', 'package-lock.json', 'fixture-pins.json', 'vendor/vrspace/asset-loader.js', 'build.mjs'
]);
export const requiredF05SourceFiles = Object.freeze([
  ...requiredF05BuildInputs, 'config.mjs', 'environment.mjs', 'fixtures.mjs', 'server.mjs', 'run.mjs',
  'browser-checks.mjs', 'test/local-server.test.mjs', 'test/import-policy.test.mjs',
  'test/xr-session.test.mjs', 'test/xr-browser-checks.mjs', 'test/browser-finalize.mjs'
]);
export const requiredF05Checks = Object.freeze([
  'real-render-and-frozen-fixtures', 'user-start-activation', 'animated-skinned-creature-and-attached-source',
  'desktop-keyboard-movement', 'wall-solid-and-open-arch-traversal', 'visible-pick-grab-and-throw',
  'four-simultaneous-corner-sources-and-calibrated-gain', 'listener-turn-changes-left-right-pan-with-fixed-source',
  'video-single-source-play-pause-seek-loop', 'actual-browser-prop-transform-editor', 'json-transform-snapshot-reload',
  'scene-glb-export-reimport', 'drop-glb-through-browser-dnd', 'untrusted-external-model-uri-rejected',
  'failed-babylon-load-rolls-back-partial-resources', 'failed-collider-publication-rolls-back-real-body-and-model',
  'unmodified-vrspace-asset-loader-reuse', 'devtools-observed-single-context-audio-routing',
  'dispose-releases-browser-resources-and-input-ownership'
]);
export const requiredF05XRChecks = Object.freeze([
  'emulated-capability-does-not-request-session', 'emulated-permission-denial-visible-and-dismissible',
  'emulated-cancelled-late-grant-never-starts-xr-renderer', 'emulated-session-renders-stereo-through-babylon',
  'emulated-head-pose-drives-one-shared-spatial-listener', 'emulated-visibility-mutes-pauses-input-and-restores-output',
  'emulated-thumbstick-moves-and-collides-with-frozen-thin-barrier',
  'emulated-physical-head-overlap-warns-without-clamping-tracking',
  'emulated-controller-ray-select-exits-with-renderer-cleanup', 'emulated-dispose-ends-live-session-and-removes-controls'
]);
const xrFiles = Object.freeze(['xr-browser-checks.json', 'emulated-stereo.png', 'emulated-failed.png']);
const browserFiles = Object.freeze([
  'browser-checks.json', 'f05-summary.json', 'courtyard-verified.png', 'f03-before-activation.png',
  'derived-prop.glb', 'browser-checks-fatal.json', 'browser-checks-fatal.png'
]);
const explicitEnvironmentKeys = Object.freeze([
  'npm_config_userconfig', 'npm_config_globalconfig', 'npm_config_cache', 'npm_config_registry',
  'npm_config_fetch_retries', 'npm_config_fetch_timeout', 'PLAYWRIGHT_BROWSERS_PATH',
  'PLAYWRIGHT_DOWNLOAD_CONNECTION_TIMEOUT', 'EVAL_SOFTWARE_RENDERING', 'NODE_USE_SYSTEM_CA'
]);

export function runEvaluationCommand(argv, { cwd, timeout = 300_000, environment = process.env, allowChrome = false } = {}) {
  const started = Date.now(), startedAt = new Date(started).toISOString();
  const env = childEnvironment(environment);
  for (const key of explicitEnvironmentKeys) if (typeof environment[key] === 'string') env[key] = environment[key];
  if (allowChrome && typeof environment.CHROME_EXECUTABLE === 'string') env.CHROME_EXECUTABLE = environment.CHROME_EXECUTABLE;
  const child = spawnSync(argv[0], argv.slice(1), { cwd, env, encoding: 'utf8', timeout, maxBuffer: 32 * 1024 * 1024, shell: false });
  const finished = Date.now();
  const errorCode = child.error?.code ?? (child.error ? 'UNKNOWN_PROCESS_ERROR' : null);
  const signal = child.signal ?? null;
  const log = redact(`${child.stdout ?? ''}${child.stderr ?? ''}${errorCode ? `\nCommand error: ${errorCode}\n` : ''}${signal ? `\nCommand signal: ${signal}\n` : ''}`);
  return { argv: [...argv], outcome: child.status === 0 && !child.error && !signal ? 'passed' : 'failed',
    exitCode: child.status, errorCode, signal, startedAt, finishedAt: new Date(finished).toISOString(),
    durationMs: Math.max(0, finished - started), log };
}

function safeRelative(path) {
  return typeof path === 'string' && /^[A-Za-z0-9._/-]+$/.test(path) && !isAbsolute(path)
    && !path.split('/').some(part => !part || part === '.' || part === '..');
}
export async function readContainedEvaluationFile(directory, name, maxBytes = 64 * 1024 * 1024) {
  if (!safeRelative(name)) throw new Error('Unsafe evaluation file path');
  const root = await realpath(directory), path = await realpath(resolve(root, name)), rel = relative(root, path);
  if (rel.startsWith('..') || isAbsolute(rel)) throw new Error(`Evaluation file escapes its directory: ${name}`);
  const info = await stat(path);
  if (!info.isFile() || info.size > maxBytes) throw new Error(`Invalid or oversized evaluation file: ${name}`);
  return readFile(path);
}
export function validateEvaluationScreenshot(bytes) {
  try {
    if (!Buffer.isBuffer(bytes) || bytes.length < 57 || bytes.length > 16 * 1024 * 1024
      || !bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) throw new Error('Invalid PNG');
    const compressed = [];
    let offset = 8, colorType, sawHeader = false, sawEnd = false, dataEnded = false;
    while (offset < bytes.length) {
      if (offset + 12 > bytes.length) throw new Error('Truncated PNG chunk');
      const length = bytes.readUInt32BE(offset), end = offset + length + 12;
      if (end > bytes.length) throw new Error('Truncated PNG payload');
      const kind = bytes.toString('ascii', offset + 4, offset + 8), data = bytes.subarray(offset + 8, end - 4);
      if (!/^[A-Za-z]{4}$/.test(kind) || crc32(bytes.subarray(offset + 4, end - 4)) !== bytes.readUInt32BE(end - 4)) throw new Error('Invalid PNG chunk checksum');
      if (!sawHeader && kind !== 'IHDR') throw new Error('Missing PNG header');
      if (kind === 'IHDR') {
        if (sawHeader || length !== 13 || data.readUInt32BE(0) !== 1280 || data.readUInt32BE(4) !== 720
          || data[8] !== 8 || ![2, 6].includes(data[9]) || data[10] !== 0 || data[11] !== 0 || data[12] !== 0) throw new Error('Unexpected screenshot geometry');
        sawHeader = true; colorType = data[9];
      } else if (kind === 'IDAT') {
        if (dataEnded) throw new Error('Non-contiguous PNG image data');
        compressed.push(data);
      } else {
        if (compressed.length) dataEnded = true;
        if (kind === 'IEND') {
          if (length !== 0 || end !== bytes.length || !compressed.length) throw new Error('Incomplete PNG ending');
          sawEnd = true;
        } else if (kind[0] === kind[0].toUpperCase() && kind !== 'PLTE') throw new Error('Unknown critical PNG chunk');
      }
      offset = end;
    }
    if (!sawEnd) throw new Error('Missing PNG ending');
    const rowBytes = 1280 * (colorType === 6 ? 4 : 3) + 1, expectedBytes = rowBytes * 720;
    const pixels = inflateSync(Buffer.concat(compressed), { maxOutputLength: expectedBytes });
    if (pixels.length !== expectedBytes) throw new Error('Incomplete screenshot pixels');
    for (let row = 0; row < 720; row++) if (pixels[row * rowBytes] > 4) throw new Error('Invalid PNG row filter');
    return [];
  } catch { return ['Required browser screenshot is not a complete 1280x720 PNG']; }
}
async function ensureDirectory(root, name) {
  if (!safeRelative(name)) throw new Error('Unsafe evaluation directory');
  let current = await realpath(root);
  for (const part of name.split('/')) {
    current = resolve(current, part);
    try {
      const info = await lstat(current);
      if (!info.isDirectory() || info.isSymbolicLink()) throw new Error(`Evaluation output must be a real directory: ${name}`);
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
      await mkdir(current);
    }
  }
  return current;
}
async function jsonFile(root, path) { return JSON.parse(await readContainedEvaluationFile(root, path)); }
async function checkFingerprints(value, required, root, prefix, errors, label) {
  if (!sameKeys(value, required)) { errors.push(`${label} fingerprint coverage differs from the checked contract`); return; }
  for (const name of required) {
    const entry = value[name];
    if (!object(entry) || !Number.isSafeInteger(entry.bytes) || entry.bytes < 0 || typeof entry.sha256 !== 'string' || !hashPattern.test(entry.sha256)) {
      errors.push(`Invalid ${label} fingerprint: ${name}`); continue;
    }
    try {
      const bytes = await readContainedEvaluationFile(root, `${prefix}/${name}`);
      if (bytes.length !== entry.bytes || digest(bytes) !== entry.sha256) errors.push(`Changed ${label} file: ${name}`);
    } catch { errors.push(`Missing or unsafe ${label} file: ${name}`); }
  }
}

export async function validateCheckedEvaluationInputs(record, root) {
  const errors = [];
  const files = [
    ['planSha256', 'docs/plan/pr-plan.json'],
    ['comparisonSha256', `${fixtureDirectory}/comparison.json`]
  ];
  for (const [field, path] of files) {
    try { if (digest(await readContainedEvaluationFile(root, path)) !== record?.[field]) errors.push(`Changed checked ${field}`); }
    catch { errors.push(`Missing checked ${field}`); }
  }
  for (const [id, name] of [['f04', 'hubs-spoke'], ['f05', 'babylon-vrspace']]) {
    try { if (digest(await readContainedEvaluationFile(root, `evaluations/${name}/package-lock.json`)) !== record?.packageLocks?.[id]) errors.push(`Changed ${id} lockfile`); }
    catch { errors.push(`Missing ${id} lockfile`); }
  }
  return errors;
}

// Extract only the final runner's structured output, not arbitrary file paths
// supplied by a downloaded report. All collected filenames remain allowlisted.
function browserConsoleResults(log) {
  const results = [];
  if (typeof log !== 'string') return results;
  for (const match of log.matchAll(/^\{\s*"runStatus"\s*:/gm)) {
    let depth = 0, quoted = false, escaped = false;
    for (let i = match.index; i < log.length; i++) {
      const char = log[i];
      if (quoted) {
        if (escaped) escaped = false;
        else if (char === '\\') escaped = true;
        else if (char === '"') quoted = false;
      } else if (char === '"') quoted = true;
      else if (char === '{') depth++;
      else if (char === '}' && --depth === 0) {
        try { results.push(JSON.parse(log.slice(match.index, i + 1))); } catch { /* Not a valid runner result. */ }
        break;
      }
    }
  }
  return results;
}

export async function validateBrowserEvidence(report, summary, {
  root, record, browserCommand, requireBuildOutputs = false,
  reportBytes = report ? Buffer.from(pretty(report)) : null,
  summaryBytes = summary ? Buffer.from(pretty(summary)) : null,
  buildBytes = report?.build ? Buffer.from(pretty(report.build)) : null,
} = {}) {
  const errors = [];
  if (!object(report) || !object(summary) || !object(record?.browser)) return ['Missing fresh browser result binding'];
  const binding = record.browser;
  const files = Array.isArray(record.files) ? record.files : [];
  if (typeof binding.runDirectory !== 'string' || !runPathPattern.test(binding.runDirectory)) errors.push('Invalid fresh browser run directory');
  if (files.some(item => ['browser/browser-checks-fatal.json', 'browser/browser-checks-fatal.png'].includes(item?.path))) errors.push('Passing browser evidence contains a fatal-run artifact');
  if (report.runStatus !== 'passed' || summary.runStatus !== 'passed' || report.qualificationStatus !== 'incomplete' || summary.qualificationStatus !== 'incomplete') errors.push('Browser subset did not pass with honest incomplete qualification');
  if (!Array.isArray(report.checks) || !equal(report.checks.map(check => check?.id), requiredF05Checks)
    || report.checks.some(check => check?.status !== 'passed' || check?.method !== 'real-browser')) errors.push('Required current 19 browser checks are missing, changed or failing');
  const counts = { passed: requiredF05Checks.length, failed: 0, pageErrors: 0, failedRequests: 0, logOverflow: 0 };
  if (!equal(report.counts, counts) || !equal(summary.counts, counts)) errors.push('Browser check/error/request counts are invalid');
  if (!Array.isArray(report.finalizationErrors) || report.finalizationErrors.length || !equal(summary.finalizationErrors, report.finalizationErrors)) errors.push('Browser finalization did not complete cleanly');
  if (!Array.isArray(report.failedRequests) || report.failedRequests.length !== 0) errors.push('Browser contains failed requests');
  if (!Array.isArray(report.logs) || report.logs.some(log => !object(log) || !['warning', 'warn'].includes(log.type))) errors.push('Browser contains page errors or invalid diagnostics');
  if (!Array.isArray(report.missingEvidence) || !report.missingEvidence.length || report.missingEvidence.some(item => typeof item !== 'string' || !item.trim()) || !equal(summary.missingEvidence, report.missingEvidence)) errors.push('Browser qualification limitations are missing or inconsistent');
  const summarizedChecks = Array.isArray(report.checks) ? report.checks.map(check => object(check) ? { id: check.id, status: check.status, method: check.method } : null) : null;
  if (!equal(summary.checks, summarizedChecks)) errors.push('Browser summary check list differs from its report');
  for (const key of ['scope', 'qualificationStatus', 'startedAt', 'timestamp', 'candidate', 'environment', 'fixtureDigests', 'comparison', 'runStatus']) {
    if (!equal(summary[key], report[key])) errors.push(`Browser summary differs in ${key}`);
  }
  if (summary.evidenceFile !== 'browser-checks.json') errors.push('Browser summary points to a different report');
  const times = [browserCommand?.startedAt, report.startedAt, report.timestamp, browserCommand?.finishedAt].map(value => typeof value === 'string' ? Date.parse(value) : NaN);
  if (times.some(time => !Number.isFinite(time)) || times.some((time, i) => i > 0 && time < times[i - 1])
    || binding.startedAt !== report.startedAt || binding.finishedAt !== report.timestamp) errors.push('Browser evidence is stale or outside its command time bounds');
  const expectedCommand = evaluationCommands.find(command => command.id === 'f05-browser');
  if (browserCommand?.id !== expectedCommand.id || browserCommand?.cwd !== expectedCommand.cwd || !equal(browserCommand?.argv, expectedCommand.argv)
    || browserCommand?.outcome !== 'passed' || browserCommand?.exitCode !== 0 || browserCommand.errorCode || browserCommand.signal) errors.push('Browser command did not complete successfully');
  const consoleResults = browserConsoleResults(browserCommand?.log);
  if (consoleResults.length !== 1 || consoleResults[0].output !== binding.runDirectory || consoleResults[0].runStatus !== 'passed'
    || !Object.entries(counts).every(([key, value]) => consoleResults[0][key] === value)) errors.push('Browser command output does not identify this fresh run');
  for (const [field, path, bytes] of [
    ['reportSha256', 'browser/browser-checks.json', reportBytes],
    ['summarySha256', 'browser/f05-summary.json', summaryBytes],
    ['buildSha256', 'browser/build.json', buildBytes]
  ]) {
    const entry = files.find(item => item?.path === path);
    if (!Buffer.isBuffer(bytes) || typeof binding[field] !== 'string' || !hashPattern.test(binding[field])
      || digest(bytes) !== binding[field] || entry?.sha256 !== binding[field] || entry?.bytes !== bytes.length) errors.push(`Browser ${field} is not bound to the collected file`);
  }
  errors.push(...await validateF05RunInputs(report, { root, binding, buildBytes, requireBuildOutputs, kind: 'desktop' }));
  return errors;
}

export async function validateXRBrowserEvidence(report, {
  root, record, xrCommand, requireBuildOutputs = false,
  reportBytes = report ? Buffer.from(pretty(report)) : null,
  buildBytes = report?.build ? Buffer.from(pretty(report.build)) : null,
  screenshotBytes = null,
} = {}) {
  const errors = [];
  if (!object(report) || !object(record?.xr)) return ['Missing fresh emulated XR result binding'];
  const binding = record.xr, files = Array.isArray(record.files) ? record.files : [];
  if (typeof binding.runDirectory !== 'string' || !/^artifacts\/xr-runs\/run-[A-Za-z0-9]+$/.test(binding.runDirectory)) errors.push('Invalid fresh XR run directory');
  if (files.some(item => item?.path === 'xr/emulated-failed.png')) errors.push('Passing XR evidence contains a failed-run artifact');
  if (report.runStatus !== 'passed' || report.qualificationStatus !== 'incomplete'
    || report.method !== 'emulated-browser' || report.physicalHeadset !== false || report.physicalAudio !== false) errors.push('XR evidence must remain explicitly emulated with incomplete physical qualification');
  if (!Array.isArray(report.checks) || !equal(report.checks.map(check => check?.id), requiredF05XRChecks)
    || report.checks.some(check => check?.status !== 'passed' || check?.method !== 'emulated-browser')) errors.push('Required current 10 emulated XR checks are missing, changed or failing');
  const counts = { passed: requiredF05XRChecks.length, failed: 0, pageErrors: 0, failedRequests: 0, logOverflow: 0 };
  if (!equal(report.counts, counts)) errors.push('XR check/error/request counts are invalid');
  if (!Array.isArray(report.finalizationErrors) || report.finalizationErrors.length) errors.push('XR finalization did not complete cleanly');
  if (!Array.isArray(report.failedRequests) || report.failedRequests.length) errors.push('XR contains failed requests');
  if (!Array.isArray(report.logs) || report.logs.some(log => !object(log) || !['warning', 'warn'].includes(log.type))) errors.push('XR contains page errors or invalid diagnostics');
  if (!Array.isArray(report.missingEvidence) || !report.missingEvidence.length || report.missingEvidence.some(item => typeof item !== 'string' || !item.trim())) errors.push('XR qualification limitations are missing');
  const times = [xrCommand?.startedAt, report.startedAt, report.timestamp, xrCommand?.finishedAt].map(value => typeof value === 'string' ? Date.parse(value) : NaN);
  if (times.some(time => !Number.isFinite(time)) || times.some((time, index) => index > 0 && time < times[index - 1])
    || binding.startedAt !== report.startedAt || binding.finishedAt !== report.timestamp) errors.push('XR evidence is stale or outside its command time bounds');
  const expectedCommand = evaluationCommands.find(command => command.id === 'f05-xr-browser');
  if (xrCommand?.id !== expectedCommand.id || xrCommand?.cwd !== expectedCommand.cwd || !equal(xrCommand?.argv, expectedCommand.argv)
    || xrCommand?.outcome !== 'passed' || xrCommand?.exitCode !== 0 || xrCommand.errorCode || xrCommand.signal) errors.push('XR command did not complete successfully');
  const consoleResults = browserConsoleResults(xrCommand?.log);
  if (consoleResults.length !== 1 || consoleResults[0].output !== binding.runDirectory || consoleResults[0].runStatus !== 'passed'
    || !Object.entries(counts).every(([key, value]) => consoleResults[0][key] === value)) errors.push('XR command output does not identify this fresh run');
  for (const [field, path, bytes] of [
    ['reportSha256', 'xr/xr-browser-checks.json', reportBytes],
    ['buildSha256', 'xr/build.json', buildBytes],
    ['screenshotSha256', 'xr/emulated-stereo.png', screenshotBytes],
  ]) {
    const entry = files.find(item => item?.path === path);
    if (!Buffer.isBuffer(bytes) || typeof binding[field] !== 'string' || !hashPattern.test(binding[field])
      || digest(bytes) !== binding[field] || entry?.sha256 !== binding[field] || entry?.bytes !== bytes.length) errors.push(`XR ${field} is not bound to the collected file`);
  }
  errors.push(...validateEvaluationScreenshot(screenshotBytes));
  errors.push(...await validateF05RunInputs(report, { root, binding, buildBytes, requireBuildOutputs, kind: 'xr' }));
  return errors;
}

async function validateF05RunInputs(report, { root, binding, buildBytes, requireBuildOutputs, kind }) {
  const errors = [];
  let build;
  try { build = JSON.parse(buildBytes); if (!equal(build, report.build)) errors.push('Browser report uses a different build'); }
  catch { errors.push('Missing or invalid browser build report'); }
  if (build?.schemaVersion !== 1 || !sameKeys(build?.outputs, ['dist/main.js', 'dist/main.js.map', 'dist/audio-meter.js'])) errors.push('Invalid browser build output inventory');
  else for (const entry of Object.values(build.outputs)) if (!object(entry) || typeof entry.sha256 !== 'string' || !hashPattern.test(entry.sha256) || !Number.isSafeInteger(entry.bytes) || entry.bytes <= 0) errors.push('Invalid browser build output fingerprint');
  await checkFingerprints(report.sourceDigests, requiredF05SourceFiles, root, candidateDirectory, errors, 'source');
  await checkFingerprints(build?.inputs, requiredF05BuildInputs, root, candidateDirectory, errors, 'build input');
  if (requireBuildOutputs) {
    await checkFingerprints(build?.outputs, ['dist/main.js', 'dist/main.js.map', 'dist/audio-meter.js'], root, candidateDirectory, errors, 'build output');
    try { if (digest(await readContainedEvaluationFile(root, `${candidateDirectory}/dist/build.json`)) !== binding.buildSha256) errors.push('Fresh build metadata changed'); }
    catch { errors.push('Fresh build metadata is missing'); }
  }
  try {
    const fixturePins = await jsonFile(root, `${candidateDirectory}/fixture-pins.json`);
    const comparison = await jsonFile(root, `${fixtureDirectory}/comparison.json`);
    if (!sameKeys(fixturePins.files, metadataFiles) || fixturePins.repositoryPath !== fixtureDirectory || fixturePins.fixtureSetId !== comparison.fixtureSetId) errors.push('Unexpected F03 fixture pin contract');
    const fixtureDigests = {};
    for (const name of metadataFiles) {
      const bytes = await readContainedEvaluationFile(root, `${fixtureDirectory}/${name}`);
      fixtureDigests[name.slice(0, -5)] = digest(bytes);
      if (fixturePins.files?.[name]?.bytes !== bytes.length || fixturePins.files?.[name]?.sha256 !== digest(bytes)) errors.push(`Changed pinned F03 metadata: ${name}`);
    }
    if (!equal(report.fixtureDigests, fixtureDigests) || !equal(build?.fixtureDigests, fixtureDigests) || !equal(report.comparison, comparison)) errors.push('Browser fixture/comparison identities differ from checked F03 files');
    const catalog = await jsonFile(root, `${fixtureDirectory}/catalog.json`);
    if (!Array.isArray(catalog.resources) || !catalog.resources.length) errors.push('Invalid checked F03 catalog');
    else for (const resource of catalog.resources) {
      if (!safeRelative(resource?.path)) { errors.push('Unsafe F03 resource path'); continue; }
      const bytes = await readContainedEvaluationFile(resolve(root, fixtureDirectory), resource.path);
      if (bytes.length !== resource.sizeBytes || digest(bytes) !== resource.sha256) errors.push(`Changed F03 resource: ${resource.path}`);
    }
    const pkg = await jsonFile(root, `${candidateDirectory}/package.json`);
    const vendor = await jsonFile(root, `${candidateDirectory}/vendor/vrspace/provenance.json`);
    const expectedCandidate = kind === 'xr'
      ? { babylon: pkg.dependencies['@babylonjs/core'], rapier: pkg.dependencies['@dimforge/rapier3d-compat'], iwer: pkg.devDependencies.iwer, testOnlyAdapter: 'IWER getOffsetReferenceSpace forwards originOffset.matrix; pre-patch negative control required' }
      : { babylon: pkg.dependencies['@babylonjs/core'], rapier: pkg.dependencies['@dimforge/rapier3d-compat'], vrspaceCommit: vendor.commit };
    if (!equal(report.candidate, expectedCandidate)) errors.push('Browser candidate differs from checked dependencies/provenance');
    if (digest(await readContainedEvaluationFile(root, `${candidateDirectory}/vendor/vrspace/asset-loader.js`)) !== vendor.sourceSha256) errors.push('Vendor source differs from checked provenance');
    const env = report.environment;
    if (!object(env) || typeof env.browser !== 'string' || !/^\d+\.\d+\.\d+\.\d+$/.test(env.browser) || env.playwright !== pkg.devDependencies.playwright
      || !equal(env.flags, ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--autoplay-policy=document-user-activation-required'])
      || env.graphicsMode !== 'SwiftShader' || env.physicalGPU !== false || env.physicalHeadset !== false || env.physicalAudio !== false
      || !equal(env.viewport, { width: 1280, height: 720, dpr: 1 })) errors.push('Browser toolchain or software-rendering identity is inconsistent');
  } catch { errors.push('Required checked fixture/candidate inputs are missing or unsafe'); }
  return errors;
}

export async function validateEvaluationAudits(record, directory) {
  const errors = [];
  for (const id of ['f04', 'f05']) {
    try {
      const item = await jsonFile(directory, `reports/${id}/dependency-audit.json`);
      const assessment = classifyAudit(item.report, item.exitCode, item.commandError);
      if (assessment.status !== 'passed' || !equal(assessment, item.assessment)) errors.push(`${id} audit is blocked, failing or inconsistent`);
      if (!Array.isArray(record?.commands) || record.commands.find(command => command?.id === `${id}-audit`)?.outcome !== 'passed') errors.push(`${id} audit command did not pass`);
    } catch { errors.push(`${id} audit is missing or invalid`); }
  }
  return errors;
}

export async function evaluationRunDirectories(root, kind = 'desktop') {
  if (!['desktop', 'xr'].includes(kind)) throw new Error('Unknown evaluation run kind');
  const directory = resolve(root, candidateDirectory, kind === 'xr' ? 'artifacts/xr-runs' : 'artifacts/runs');
  try {
    const resolved = await realpath(directory), rel = relative(await realpath(root), resolved);
    if (rel.startsWith('..') || isAbsolute(rel) || (await lstat(directory)).isSymbolicLink()) throw new Error('Unsafe browser run directory');
    const entries = await readdir(directory, { withFileTypes: true });
    return new Set(entries.filter(entry => /^run-[A-Za-z0-9]+$/.test(entry.name)).map(entry => {
      if (!entry.isDirectory() || entry.isSymbolicLink()) throw new Error('Browser run entry is not a real directory');
      return entry.name;
    }));
  } catch (error) { if (error.code === 'ENOENT') return new Set(); throw error; }
}
async function putFile(record, output, path, bytes) {
  if (!evaluationReportPath.test(path) || Buffer.byteLength(bytes) > evaluationFileLimit(path)) throw new Error('Report is outside the evaluation path/size allowlist');
  await writeFile(resolve(output, path), bytes);
  record.files = record.files.filter(item => item.path !== path);
  record.files.push({ path, bytes: Buffer.byteLength(bytes), sha256: digest(bytes) });
}
async function collectBrowser(record, root, output, before, command) {
  const after = await evaluationRunDirectories(root), added = [...after].filter(name => !before.has(name));
  if (added.length !== 1) throw new Error('Browser command did not create exactly one new unique run directory');
  const runDirectory = `artifacts/runs/${added[0]}`;
  const directory = resolve(root, candidateDirectory, runDirectory);
  const copied = new Map();
  for (const name of browserFiles) {
    try {
      const bytes = await readContainedEvaluationFile(directory, name, 16 * 1024 * 1024);
      await putFile(record, output, `browser/${name}`, bytes); copied.set(name, bytes);
    } catch (error) { if (error.code !== 'ENOENT') throw error; }
  }
  const reportBytes = copied.get('browser-checks.json'), summaryBytes = copied.get('f05-summary.json');
  if (!reportBytes || !summaryBytes || !copied.has('courtyard-verified.png')) throw new Error('Fresh browser report, summary or screenshot is missing');
  const screenshotErrors = validateEvaluationScreenshot(copied.get('courtyard-verified.png'));
  if (screenshotErrors.length) throw new Error(screenshotErrors.join('\n'));
  const report = JSON.parse(reportBytes), summary = JSON.parse(summaryBytes);
  const buildBytes = await readContainedEvaluationFile(root, `${candidateDirectory}/dist/build.json`);
  await putFile(record, output, 'browser/build.json', buildBytes);
  record.browser = { runDirectory, startedAt: report.startedAt, finishedAt: report.timestamp,
    reportSha256: digest(reportBytes), summarySha256: digest(summaryBytes), buildSha256: digest(buildBytes) };
  const errors = await validateBrowserEvidence(report, summary, { root, record, browserCommand: command, requireBuildOutputs: true, reportBytes, summaryBytes, buildBytes });
  if (errors.length) throw new Error(errors.join('\n'));
}

export async function collectXREvidence(record, root, output, before, command) {
  const after = await evaluationRunDirectories(root, 'xr'), added = [...after].filter(name => !before.has(name));
  if (added.length !== 1) throw new Error('XR command did not create exactly one new unique run directory');
  const runDirectory = `artifacts/xr-runs/${added[0]}`;
  const directory = resolve(root, candidateDirectory, runDirectory), copied = new Map();
  for (const name of xrFiles) {
    try {
      const bytes = await readContainedEvaluationFile(directory, name, evaluationFileLimit(`xr/${name}`));
      await putFile(record, output, `xr/${name}`, bytes); copied.set(name, bytes);
    } catch (error) { if (error.code !== 'ENOENT') throw error; }
  }
  const reportBytes = copied.get('xr-browser-checks.json'), screenshotBytes = copied.get('emulated-stereo.png');
  if (!reportBytes || !screenshotBytes) throw new Error('Fresh XR report or screenshot is missing');
  const report = JSON.parse(reportBytes);
  const buildBytes = await readContainedEvaluationFile(root, `${candidateDirectory}/dist/build.json`, evaluationFileLimit('xr/build.json'));
  await putFile(record, output, 'xr/build.json', buildBytes);
  record.xr = { runDirectory, startedAt: report.startedAt, finishedAt: report.timestamp,
    reportSha256: digest(reportBytes), buildSha256: digest(buildBytes), screenshotSha256: digest(screenshotBytes) };
  const errors = await validateXRBrowserEvidence(report, { root, record, xrCommand: command, requireBuildOutputs: true, reportBytes, buildBytes, screenshotBytes });
  if (errors.length) throw new Error(errors.join('\n'));
}

async function main() {
  if (process.argv.slice(2).some(arg => arg !== '--local') || process.argv.length > 3) throw new Error('Usage: node scripts/ci/evaluate.mjs [--local]');
  const local = process.argv.includes('--local');
  if (!local && process.env.GITHUB_ACTIONS !== 'true') throw new Error('Use --local for diagnostics; hosted evaluation evidence requires GitHub Actions');
  const root = resolve(import.meta.dirname, '../..');
  const output = await ensureDirectory(root, 'artifacts/evaluations');
  await rm(output, { recursive: true, force: true });
  for (const path of ['artifacts/evaluations/logs', 'artifacts/evaluations/reports/f04', 'artifacts/evaluations/reports/f05', 'artifacts/evaluations/browser', 'artifacts/evaluations/xr', 'artifacts/evaluation-tools/config', 'artifacts/evaluation-tools/npm-cache', 'artifacts/evaluation-tools/browsers']) await ensureDirectory(root, path);
  const config = resolve(root, 'artifacts/evaluation-tools/config');
  for (const file of ['user.npmrc', 'global.npmrc']) await writeFile(resolve(config, file), '');
  const env = { ...childEnvironment(),
    npm_config_userconfig: resolve(config, 'user.npmrc'), npm_config_globalconfig: resolve(config, 'global.npmrc'),
    npm_config_cache: resolve(root, 'artifacts/evaluation-tools/npm-cache'), npm_config_registry: 'https://registry.npmjs.org',
    npm_config_fetch_retries: '0', npm_config_fetch_timeout: '15000', NODE_USE_SYSTEM_CA: '1',
    PLAYWRIGHT_BROWSERS_PATH: resolve(root, 'artifacts/evaluation-tools/browsers'),
    PLAYWRIGHT_DOWNLOAD_CONNECTION_TIMEOUT: '120000', EVAL_SOFTWARE_RENDERING: '1'
  };
  const record = { schemaVersion: 1, kind: 'foundation-evaluations', repository: process.env.GITHUB_REPOSITORY ?? repository,
    mode: local ? 'local' : 'github', eventName: local ? 'local' : process.env.GITHUB_EVENT_NAME,
    startedAt: new Date().toISOString(), commands: [], files: [], failures: [], complete: false,
    scope: { f04: 'Pinned toolkit tests, historical evidence integrity and modern toolkit audit; no fresh Hubs/Spoke runtime, services or headset execution.',
      f05: 'Fresh 19-check desktop and separate 10-check emulated XR software-rendering subsets; full runtime/device/service/production qualification remains incomplete.' }
  };
  const write = () => writeFile(resolve(output, 'manifest.json'), pretty(record));
  await write();
  const git = (...args) => execFileSync('git', args, { cwd: root, env, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
  try {
    if (local) {
      if (!process.env.CHROME_EXECUTABLE) throw new Error('--local requires CHROME_EXECUTABLE; local mode never installs a browser or produces hosted completion');
      env.CHROME_EXECUTABLE = await realpath(process.env.CHROME_EXECUTABLE);
      if (!(await stat(env.CHROME_EXECUTABLE)).isFile()) throw new Error('CHROME_EXECUTABLE must identify an existing executable file');
    }
    record.testedSha = git('rev-parse', 'HEAD'); record.treeSha = git('rev-parse', 'HEAD^{tree}');
    record.dirty = git('status', '--porcelain').length > 0;
    record.headSha = record.eventName === 'pull_request' ? process.env.CI_PR_HEAD_SHA : record.testedSha;
    record.baseSha = record.eventName === 'pull_request' ? process.env.CI_PR_BASE_SHA : null;
    record.runId = process.env.GITHUB_RUN_ID ?? null; record.runAttempt = Number(process.env.GITHUB_RUN_ATTEMPT) || null;
    record.workflowRef = process.env.CI_WORKFLOW_REF ?? null; record.workflowSha = process.env.CI_WORKFLOW_SHA ?? null;
    if (!local && record.testedSha !== process.env.GITHUB_SHA) throw new Error('Checkout differs from the GitHub tested commit');
    if (!local && record.dirty) throw new Error('Dirty source cannot produce hosted evaluation evidence');
    if (!local && record.eventName === 'merge_group') {
      if (!process.env.GITHUB_EVENT_PATH) throw new Error('Merge-group event payload is missing');
      const event = JSON.parse(await readFile(process.env.GITHUB_EVENT_PATH, 'utf8'));
      if (event.merge_group?.head_sha !== record.testedSha || !shaPattern.test(event.merge_group?.base_sha ?? '')) throw new Error('Merge-group source identity does not match the checkout');
      record.baseSha = event.merge_group.base_sha;
    }
    record.packageLocks = {};
    for (const [id, name] of [['f04', 'hubs-spoke'], ['f05', 'babylon-vrspace']]) record.packageLocks[id] = digest(await readContainedEvaluationFile(root, `evaluations/${name}/package-lock.json`));
    record.planSha256 = digest(await readContainedEvaluationFile(root, 'docs/plan/pr-plan.json'));
    record.comparisonSha256 = digest(await readContainedEvaluationFile(root, `${fixtureDirectory}/comparison.json`));
    record.toolchain = { node: process.version, npm: execFileSync('npm', ['--version'], { cwd: root, env, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim(), os: platform(), arch: arch(), runnerImage: process.env.ImageVersion ?? null };
    await write();
    const prerequisites = {
      'f04-source': ['f04-install'], 'f04-tests': ['f04-install', 'f04-source'], 'f04-history': ['f04-install'],
      'f05-build': ['f05-install'], 'f05-tests': ['f05-install'], 'f05-browser-install': ['f05-install'],
      'f05-browser': ['f05-install', 'f05-build', 'f05-tests', ...(local ? [] : ['f05-browser-install'])],
      'f05-xr-browser': ['f05-install', 'f05-build', 'f05-tests', ...(local ? [] : ['f05-browser-install'])]
    };
    const timeouts = { 'f04-source': 360_000, 'f05-browser-install': 600_000, 'f04-audit': 45_000, 'f05-audit': 45_000 };
    for (const command of evaluationCommands) {
      let result, before;
      const unmet = (prerequisites[command.id] || []).filter(id => record.commands.find(item => item.id === id)?.outcome !== 'passed');
      if (local && command.id === 'f05-browser-install') result = { argv: [...command.argv], outcome: 'skipped_local', exitCode: null, errorCode: null, signal: null, durationMs: 0, log: 'Not run: local diagnostic uses the explicit CHROME_EXECUTABLE. It cannot establish hosted completion.\n' };
      else if (unmet.length) result = { argv: [...command.argv], outcome: 'not_run', exitCode: null, errorCode: null, signal: null, durationMs: 0, log: `Not run: failed prerequisites ${unmet.join(', ')}.\n` };
      else {
        try {
          if (command.id === 'f05-browser' || command.id === 'f05-xr-browser') before = await evaluationRunDirectories(root, command.id === 'f05-xr-browser' ? 'xr' : 'desktop');
          if (command.id === 'f05-build') {
            const parent = await ensureDirectory(root, candidateDirectory);
            const dist = resolve(parent, 'dist');
            try { if ((await lstat(dist)).isSymbolicLink()) throw new Error('Build output must not be a symlink'); }
            catch (error) { if (error.code !== 'ENOENT') throw error; }
            await rm(dist, { recursive: true, force: true });
          }
          if (command.id.endsWith('-audit')) await rm(resolve(output, `reports/${command.id.slice(0, 3)}/dependency-audit.json`), { force: true });
          const cwd = command.cwd === '.' ? root : await ensureDirectory(root, command.cwd);
          result = runEvaluationCommand(command.argv, { cwd, timeout: timeouts[command.id] || 300_000, environment: env, allowChrome: local });
        } catch (error) { result = { argv: [...command.argv], outcome: 'failed', exitCode: null, errorCode: error.code || 'EVALUATION_PRECONDITION', signal: null, durationMs: 0, log: `${redact(error.message)}\n` }; }
      }
      const { log, ...outcome } = result;
      record.commands.push({ id: command.id, cwd: command.cwd, ...outcome });
      await putFile(record, output, `logs/${command.id}.txt`, log);
      if (command.id === 'f05-browser' && before) {
        try { await collectBrowser(record, root, output, before, { id: command.id, cwd: command.cwd, ...result }); }
        catch (error) { record.failures.push(redact(error.message)); }
      }
      if (command.id === 'f05-xr-browser' && before) {
        try { await collectXREvidence(record, root, output, before, { id: command.id, cwd: command.cwd, ...result }); }
        catch (error) { record.failures.push(redact(error.message)); }
      }
      if (command.id.endsWith('-audit')) {
        const path = `reports/${command.id.slice(0, 3)}/dependency-audit.json`;
        try { await putFile(record, output, path, await readContainedEvaluationFile(output, path, 8 * 1024 * 1024)); }
        catch { record.failures.push(`Missing current ${path}`); }
      }
      console.log(`${command.id}: ${result.outcome}`);
      if (result.outcome === 'failed') console.error(log);
      await write();
    }
    record.dirty ||= git('status', '--porcelain').length > 0;
    if (git('rev-parse', 'HEAD') !== record.testedSha || git('rev-parse', 'HEAD^{tree}') !== record.treeSha) record.failures.push('Checked source identity changed during evaluation');
    record.failures.push(...await validateCheckedEvaluationInputs(record, root), ...await validateEvaluationFiles(record, output), ...await validateEvaluationAudits(record, output));
    const failedCommands = record.commands.some(command => command.outcome !== 'passed' && !(local && command.id === 'f05-browser-install' && command.outcome === 'skipped_local'));
    record.complete = !local && !failedCommands && record.failures.length === 0;
    if (!local) {
      const errors = validateEvaluationEvidence(record);
      if (errors.length) { record.complete = false; record.failures.push(...errors); }
    }
    if (failedCommands || record.failures.length) process.exitCode = 1;
  } catch (error) { record.complete = false; record.failures.push(redact(error.message)); process.exitCode = 1; }
  record.finishedAt = new Date().toISOString();
  await write();
  if (record.failures.length) console.error(record.failures.join('\n'));
  else console.log(local ? 'Local evaluation diagnostics passed; hosted complete remains false.' : 'Hosted evaluation subset evidence is complete; F04/F05 qualification remains incomplete.');
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  await main().catch(error => { console.error(redact(error.message)); process.exitCode = 1; });
}
