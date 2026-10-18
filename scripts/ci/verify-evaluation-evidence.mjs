import { execFileSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { shaPattern } from './evidence.mjs';
import { validateEvaluationEvidence, validateEvaluationFiles } from './evaluation-evidence.mjs';
import { childEnvironment } from './environment.mjs';
import { redact } from '../check-secret-exposure.mjs';
import { readContainedEvaluationFile, validateCheckedEvaluationInputs, validateBrowserEvidence, validateXRBrowserEvidence, validatePortableBrowserEvidence, validateEvaluationAudits, validateEvaluationScreenshot } from './evaluate.mjs';

export async function verifyEvaluationEvidence(file, { headSha, testedSha, baseSha, root = resolve(import.meta.dirname, '../..') } = {}) {
  const path = resolve(file), directory = dirname(path);
  const record = JSON.parse(await readFile(path, 'utf8'));
  if (!record || typeof record !== 'object' || Array.isArray(record)) return ['Invalid evaluation evidence envelope'];
  const expected = { headSha, testedSha };
  if (baseSha) expected.baseSha = baseSha;
  const errors = [...validateEvaluationEvidence(record, expected), ...await validateEvaluationFiles(record, directory),
    ...await validateCheckedEvaluationInputs(record, root), ...await validateEvaluationAudits(record, directory)];
  if (['pull_request', 'merge_group'].includes(record.eventName) && !baseSha) errors.push('Current PR/merge-group base is required');
  const git = (...args) => execFileSync('git', args, { cwd: root, env: childEnvironment(), encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
  try {
    const currentHead = git('rev-parse', 'HEAD');
    if (![headSha, testedSha].includes(currentHead)) errors.push('Current checkout is neither the reviewed head nor tested commit');
    if (git('rev-parse', 'HEAD^{tree}') !== record.treeSha) errors.push('Current checkout tree differs from the tested tree');
    if (git('status', '--porcelain').length) errors.push('Current checkout is dirty');
  } catch { errors.push('Current checkout identity could not be verified'); }
  try {
    const reportBytes = await readContainedEvaluationFile(directory, 'browser/browser-checks.json', 16 * 1024 * 1024);
    const summaryBytes = await readContainedEvaluationFile(directory, 'browser/f05-summary.json', 16 * 1024 * 1024);
    const buildBytes = await readContainedEvaluationFile(directory, 'browser/build.json', 16 * 1024 * 1024);
    errors.push(...validateEvaluationScreenshot(await readContainedEvaluationFile(directory, 'browser/courtyard-verified.png', 16 * 1024 * 1024)));
    const log = (await readContainedEvaluationFile(directory, 'logs/f05-browser.txt')).toString();
    const command = Array.isArray(record.commands) ? record.commands.find(item => item?.id === 'f05-browser') : null;
    errors.push(...await validateBrowserEvidence(JSON.parse(reportBytes), JSON.parse(summaryBytes), {
      root, record, browserCommand: { ...command, log }, requireBuildOutputs: false, reportBytes, summaryBytes, buildBytes
    }));
  } catch { errors.push('Fresh bound browser report, summary, build or log is missing/invalid'); }
  try {
    const reportBytes = await readContainedEvaluationFile(directory, 'xr/xr-browser-checks.json', 16 * 1024 * 1024);
    const buildBytes = await readContainedEvaluationFile(directory, 'xr/build.json', 16 * 1024 * 1024);
    const screenshotBytes = await readContainedEvaluationFile(directory, 'xr/emulated-stereo.png', 16 * 1024 * 1024);
    const log = (await readContainedEvaluationFile(directory, 'logs/f05-xr-browser.txt', 32 * 1024 * 1024)).toString();
    const command = Array.isArray(record.commands) ? record.commands.find(item => item?.id === 'f05-xr-browser') : null;
    errors.push(...await validateXRBrowserEvidence(JSON.parse(reportBytes), {
      root, record, xrCommand: { ...command, log }, requireBuildOutputs: false, reportBytes, buildBytes, screenshotBytes
    }));
  } catch { errors.push('Fresh bound emulated XR report, build, screenshot or log is missing/invalid'); }
  try {
    const read = (name, limit = 16 * 1024 * 1024) => readContainedEvaluationFile(directory, 'portable/' + name, limit);
    const reportBytes = await read('portable-browser-checks.json'), summaryBytes = await read('portable-summary.json'), buildBytes = await read('build.json');
    const screenshotBytes = await read('portable-world.png'), exportedBytes = await read('exported-world.bveworld', 4 * 1024 * 1024);
    const reexportedBytes = await read('reexported-world.bveworld', 4 * 1024 * 1024), authoredBytes = await read('authored-world.bveworld', 4 * 1024 * 1024);
    const log = (await readContainedEvaluationFile(directory, 'logs/f05-portable-browser.txt', 32 * 1024 * 1024)).toString();
    const command = Array.isArray(record.commands) ? record.commands.find(item => item?.id === 'f05-portable-browser') : null;
    errors.push(...await validatePortableBrowserEvidence(JSON.parse(reportBytes), JSON.parse(summaryBytes), {
      root, record, portableCommand: { ...command, log }, requireBuildOutputs: false,
      reportBytes, summaryBytes, buildBytes, screenshotBytes, exportedBytes, reexportedBytes, authoredBytes,
    }));
  } catch { errors.push('Fresh bound portable-world report, summary, build, screenshot, carriers or log is missing/invalid'); }
  return errors;
}

async function main() {
  const [file, headSha, testedSha, baseSha] = process.argv.slice(2);
  if (process.argv.length < 5 || process.argv.length > 6 || !file || !shaPattern.test(headSha ?? '') || !shaPattern.test(testedSha ?? '') || (baseSha && !shaPattern.test(baseSha))) {
    throw new Error('Usage: node scripts/ci/verify-evaluation-evidence.mjs MANIFEST CURRENT_HEAD TESTED_SHA [CURRENT_BASE]');
  }
  const errors = await verifyEvaluationEvidence(file, { headSha, testedSha, baseSha });
  if (errors.length) { console.error(errors.join('\n')); process.exitCode = 1; }
  else console.log('Evaluation files, current source, exact candidate identity and separate fresh desktop/emulated XR/portable-world bindings match. Independently verify the actual GitHub checks and required reviews; this remains subset evidence, not completed hardware/service qualification.');
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  await main().catch(error => { console.error(redact(error.message)); process.exitCode = 1; });
}
