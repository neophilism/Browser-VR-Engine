import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { parse, stringify } from 'yaml';
import { validateWorkflow, validatePackageCommands } from '../check-ci-policy.mjs';
import { inspectBoundary } from '../check-boundaries.mjs';
import { inspectExposure, redact, redactStructured } from '../check-secret-exposure.mjs';
import { classifyAudit } from '../check-dependencies.mjs';
import { validatePackInventory } from '../test-consumer.mjs';

const workflowText = await readFile(new URL('../../.github/workflows/engine-ci.yml', import.meta.url), 'utf8');
const pins = JSON.parse(await readFile(new URL('../../docs/ci/action-pins.json', import.meta.url), 'utf8')).actions;
test('the actual workflow conforms to the checked-in policy', () => assert.deepEqual(validateWorkflow(workflowText, pins), []));

const manifest = JSON.parse(await readFile(new URL('../../package.json', import.meta.url), 'utf8'));
test('required package and example commands include every foundation host and suite', () => {
  assert.deepEqual(validatePackageCommands(manifest), []);
  for (const suffix of [' && npm run test --workspace @browser-vr-engine/contracts', ' && npm run test --workspace @browser-vr-engine/qualification-fixtures']) {
    const changed = structuredClone(manifest);
    changed.scripts.test = changed.scripts.test.replace(suffix, '');
    assert.ok(validatePackageCommands(changed).length);
  }
  const changed = structuredClone(manifest);
  changed.scripts['example:all'] = 'npm run example:sdk';
  assert.ok(validatePackageCommands(changed).length);
});

for (const [name, mutate] of [
  ['floating action', workflow => { workflow.jobs.checks.steps[0].uses = 'actions/checkout@v7'; }],
  ['privileged trigger', workflow => { workflow.on.pull_request_target = {}; }],
  ['write token', workflow => { workflow.jobs.checks.permissions.contents = 'write'; }],
  ['persistent checkout credentials', workflow => { workflow.jobs.checks.steps[0].with['persist-credentials'] = true; }],
  ['ignored failure', workflow => { workflow.jobs.checks['continue-on-error'] = true; }],
  ['local preview replacing hosted run', workflow => { workflow.jobs.checks.steps[2].run += ' --local'; }],
  ['skipped hosted run', workflow => { workflow.jobs.checks.steps[2].if = '${{ false }}'; }],
  ['missing hosted runner', workflow => { workflow.jobs.checks.steps.splice(2, 1); }],
  ['missing artifact upload', workflow => { workflow.jobs.checks.steps.pop(); }],
  ['missing evaluation job', workflow => { delete workflow.jobs.evaluations; }],
  ['skipped evaluation job', workflow => { workflow.jobs.evaluations.if = '${{ false }}'; }],
  ['local evaluation replacing hosted run', workflow => { workflow.jobs.evaluations.steps[2].run += ' --local'; }],
  ['missing evaluation artifact', workflow => { workflow.jobs.evaluations.steps.pop(); }],
  ['evaluation omitted from required gate', workflow => { workflow.jobs.required.needs = ['checks']; }],
  ['conditional artifact upload', workflow => { workflow.jobs.checks.steps[3].if = '${{ success() }}'; }],
  ['skipped foundation job', workflow => { workflow.jobs.checks.if = '${{ false }}'; }],
  ['skipped required gate', workflow => { workflow.jobs.required.if = '${{ success() }}'; }],
  ['skipped required shell step', workflow => { workflow.jobs.required.steps[0].if = '${{ false }}'; }],
  ['always-green gate', workflow => { workflow.jobs.required.steps[0].run = 'true'; }],
  ['broad artifact upload', workflow => { workflow.jobs.checks.steps[3].with.path = '.'; }],
  ['hidden artifact upload', workflow => { workflow.jobs.checks.steps[3].with['include-hidden-files'] = true; }],
  ['secret access', workflow => { workflow.jobs.checks.env.TOKEN = '${{ secrets.DEPLOY_TOKEN }}'; }],
  ['bracketed secret access', workflow => { workflow.jobs.checks.env.TOKEN = "${{ secrets['DEPLOY_TOKEN'] }}"; }],
  ['path-filtered required check', workflow => { workflow.on.pull_request.paths = ['packages/**']; }],
  ['changed target branch', workflow => { workflow.on.push.branches = ['unrelated']; }]
]) {
  test(`workflow policy rejects ${name}`, () => {
    const workflow = parse(workflowText);
    mutate(workflow);
    assert.ok(validateWorkflow(stringify(workflow), pins).length);
  });
}

test('the actual required shell gate fails on failed, skipped, cancelled and absent jobs', () => {
  const command = parse(workflowText).jobs.required.steps[0].run;
  for (const key of ['CHECKS_RESULT', 'EVALUATIONS_RESULT']) {
    for (const outcome of ['success', 'failure', 'skipped', 'neutral', 'cancelled', '']) {
      const result = spawnSync('bash', ['-c', command], { env: { PATH: process.env.PATH, CHECKS_RESULT: 'success', EVALUATIONS_RESULT: 'success', [key]: outcome } });
      assert.equal(result.error, undefined);
      assert.equal(result.status === 0, outcome === 'success');
    }
  }
});

test('duplicate YAML keys cannot hide a workflow definition', () => assert.ok(validateWorkflow(`${workflowText}\njobs: {}\n`, pins).length));

test('static engine boundary catches imports, re-exports, require and package dependencies', () => {
  for (const source of ['import x from "@other/xlr8";', 'export * from "../../conference-app/module.js";', 'await import("@other/xlr8");', 'require("@other/xlr8");', 'import x from "@other/xlr\\u0038";']) assert.ok(inspectBoundary('module.ts', source).length);
  assert.ok(inspectBoundary('package.json', JSON.stringify({ optionalDependencies: { '@other/xlr8': '*' } })).length);
  for (const target of ['npm:@other/xlr8@1.0.0', 'npm:xlr8@1.0.0', 'file:../../../XLR8', 'file:XLR8', 'git+https://github.com/example/XLR8.git#main', 'github:example/XLR8']) assert.ok(inspectBoundary('package.json', JSON.stringify({ dependencies: { adapter: target } })).length);
  assert.deepEqual(inspectBoundary('package.json', JSON.stringify({ dependencies: { adapter: 'npm:@engine/core@1.0.0' } })), []);
  assert.deepEqual(inspectBoundary('module.ts', '// import x from "@other/xlr8";\nconst help = "import from xlr8";\nimport x from "@engine/core";'), []);
});

test('secret diagnostics never include the synthetic secret value', () => {
  const marker = 'gh' + 'p_' + 'x'.repeat(36);
  const findings = inspectExposure('sample.ts', `\n${marker}`);
  assert.match(findings.join('\n'), /sample.ts:2: github-token/);
  assert.ok(!findings.join().includes(marker));
  assert.ok(!redact(marker).includes(marker));
  assert.ok(inspectExposure('.env.production', 'EXAMPLE=value').length);
  assert.deepEqual(inspectExposure('.env.example', 'EXAMPLE=replace-me'), []);
});

test('assignment and structured redaction cover arbitrary credential names without breaking JSON', () => {
  for (const [name, value] of [['MESHY_API_KEY', 'synthetic-provider-value'], ['OTHER_API_KEY', 'synthetic-other-value'], ['customPassword', 'synthetic-password-value'], ['ACCESS_TOKEN', 'synthetic-token-value']]) {
    assert.ok(!redact(`${name}=${value}`).includes(value));
    const json = JSON.stringify({ [name]: value, safe: 'retained' });
    const masked = JSON.parse(redact(json));
    assert.equal(masked[name], '[REDACTED:credential]');
    assert.equal(masked.safe, 'retained');
  }
  const report = { details: ['MESHY_API_KEY="synthetic-escaped-\\\"-value"', 'safe value'], nested: { UNKNOWN_API_KEY: 'synthetic-nested-value' } };
  const serialized = JSON.stringify(redactStructured(report));
  assert.doesNotThrow(() => JSON.parse(serialized));
  assert.ok(!serialized.includes('synthetic-escaped'));
  assert.ok(!serialized.includes('synthetic-nested'));
  const key = ['-----BEGIN' + ' PRIVATE KEY-----', 'synthetic-private-key-body', '-----END' + ' PRIVATE KEY-----'].join('\n');
  assert.ok(!redact(key).includes('synthetic-private-key-body'));
});

test('dependency auditing distinguishes advisories, lower findings and registry/tool failures', () => {
  const clear = { metadata: { vulnerabilities: { info: 0, low: 0, moderate: 0, high: 0, critical: 0, total: 0 } }, vulnerabilities: {} };
  assert.equal(classifyAudit(clear, 0).status, 'passed');
  assert.equal(classifyAudit(clear, 1).status, 'blocked');
  assert.equal(classifyAudit({ error: 'registry unavailable' }, 1).status, 'blocked');
  assert.equal(classifyAudit(clear, null).status, 'blocked');
  assert.equal(classifyAudit(clear, 0, 'EPERM').status, 'blocked');
  const high = structuredClone(clear);
  high.metadata.vulnerabilities.high = high.metadata.vulnerabilities.total = 1;
  high.vulnerabilities.example = { severity: 'high' };
  assert.equal(classifyAudit(high, 1).status, 'failed');
  const low = structuredClone(clear);
  low.metadata.vulnerabilities.low = low.metadata.vulnerabilities.total = 1;
  low.vulnerabilities.example = { severity: 'low' };
  assert.equal(classifyAudit(low, 0).status, 'passed');
  low.metadata.vulnerabilities.total = 0;
  assert.equal(classifyAudit(low, 0).status, 'blocked');
  const inconsistent = structuredClone(clear);
  inconsistent.vulnerabilities.example = { severity: 'moderate' };
  assert.equal(classifyAudit(inconsistent, 0).status, 'blocked');
  for (const vulnerabilities of [[], { example: null }, { example: { severity: 'unknown' } }]) assert.equal(classifyAudit({ ...clear, vulnerabilities }, 0).status, 'blocked');
});

test('package inventory rejects missing public exports and leaked private files', () => {
  const good = ['package.json', 'README.md', 'dist/index.js', 'dist/index.d.ts'].map(path => ({ path }));
  assert.deepEqual(validatePackInventory(good), []);
  assert.ok(validatePackInventory(good.slice(0, 3)).length);
  assert.ok(validatePackInventory([...good, { path: '.env' }]).length);
  assert.ok(validatePackInventory([...good, { path: 'dist/../private-model.glb' }]).length);
});
