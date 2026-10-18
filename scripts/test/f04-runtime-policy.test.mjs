import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { parse, stringify } from 'yaml';
import { validateF04RuntimeWorkflow } from '../check-f04-runtime-policy.mjs';

const text = await readFile(new URL('../../.github/workflows/f04-hubs-runtime.yml', import.meta.url), 'utf8');
const pins = JSON.parse(await readFile(new URL('../../docs/ci/action-pins.json', import.meta.url), 'utf8')).actions;
const runtime = workflow => workflow.jobs.runtime;
const mode = workflow => workflow.on.workflow_dispatch.inputs.mode;

test('the actual manual F04 workflow satisfies its separate policy', () => {
  assert.deepEqual(validateF04RuntimeWorkflow(text, pins), []);
});

test('literal display text and mapping order do not define executable policy', () => {
  const workflow = parse(text);
  workflow.name = 'Reviewed local service evidence';
  mode(workflow).description = 'Choose the explicitly recorded audit behavior';
  runtime(workflow).steps.forEach((step, index) => { step.name = `Display label ${index}`; });
  const reverse = value => Array.isArray(value) ? value.map(reverse) : value && typeof value === 'object'
    ? Object.fromEntries(Object.entries(value).reverse().map(([key, child]) => [key, reverse(child)])) : value;
  assert.deepEqual(validateF04RuntimeWorkflow(stringify(reverse(workflow)), pins), []);
  delete workflow.name;
  delete mode(workflow).description;
  runtime(workflow).steps.forEach(step => { delete step.name; });
  assert.deepEqual(validateF04RuntimeWorkflow(stringify(workflow), pins), []);
});

const mutations = [
  ['automatic push trigger', w => { w.on.push = {}; }],
  ['privileged pull request trigger', w => { w.on.pull_request_target = {}; }],
  ['reusable workflow trigger', w => { w.on.workflow_call = {}; }],
  ['missing explicit dispatch input', w => { w.on.workflow_dispatch = {}; }],
  ['extra arbitrary input', w => { w.on.workflow_dispatch.inputs.command = { type: 'string' }; }],
  ['free-form mode', w => { mode(w).type = 'string'; }],
  ['optional mode', w => { mode(w).required = false; }],
  ['implicit evaluation default', w => { mode(w).default = 'evaluate'; }],
  ['additional mode', w => { mode(w).options.push('skip-audit'); }],
  ['changed mode ordering', w => { mode(w).options.reverse(); }],
  ['workflow token permission', w => { w.permissions.contents = 'read'; }],
  ['write token permission', w => { runtime(w).permissions.contents = 'write'; }],
  ['OIDC privilege', w => { runtime(w).permissions['id-token'] = 'write'; }],
  ['extra workflow environment', w => { w.env = { TOKEN: '${{ secrets.SYNTHETIC_TOKEN }}' }; }],
  ['shell override', w => { w.defaults.run.shell = 'bash -l {0}'; }],
  ['default working-directory override', w => { w.defaults.run['working-directory'] = 'other'; }],
  ['cancelling an active run', w => { w.concurrency['cancel-in-progress'] = true; }],
  ['different concurrency scope', w => { w.concurrency.group = 'f04-${{ github.run_id }}'; }],
  ['additional job', w => { w.jobs.extra = structuredClone(runtime(w)); }],
  ['unstable job check name', w => { runtime(w).name = 'different'; }],
  ['floating runner', w => { runtime(w)['runs-on'] = 'ubuntu-latest'; }],
  ['self-hosted runner', w => { runtime(w)['runs-on'] = ['self-hosted', 'linux']; }],
  ['longer job lifetime', w => { runtime(w)['timeout-minutes'] = 71; }],
  ['job-level failure override', w => { runtime(w)['continue-on-error'] = true; }],
  ['job conditional', w => { runtime(w).if = '${{ always() }}'; }],
  ['job dependency', w => { runtime(w).needs = ['other']; }],
  ['deployment environment', w => { runtime(w).environment = 'production'; }],
  ['container execution context', w => { runtime(w).container = 'node:latest'; }],
  ['unreviewed service container', w => { runtime(w).services = { database: { image: 'postgres:latest' } }; }],
  ['matrix or strategy', w => { runtime(w).strategy = { matrix: { mode: ['diagnose'] } }; }],
  ['provider credential', w => { runtime(w).env.PROVIDER_KEY = '${{ secrets.SYNTHETIC_TOKEN }}'; }],
  ['bracketed credential in expected environment', w => { runtime(w).env.F04_MODE = "${{ secrets['SYNTHETIC_TOKEN'] }}"; }],
  ['hardcoded mode replacing dispatch evidence', w => { runtime(w).env.F04_MODE = 'diagnose'; }],
  ['missing workflow SHA binding', w => { delete runtime(w).env.CI_WORKFLOW_SHA; }],
  ['different workflow reference binding', w => { runtime(w).env.CI_WORKFLOW_REF = '${{ github.ref }}'; }],
  ['boolean CI environment value', w => { runtime(w).env.CI = true; }],
  ['missing work stage', w => { runtime(w).steps.splice(2, 1); }],
  ['missing watchdog cleanup', w => { runtime(w).steps.splice(3, 1); }],
  ['missing finalization', w => { runtime(w).steps.splice(4, 1); }],
  ['missing artifact upload', w => { runtime(w).steps.pop(); }],
  ['additional action', w => { runtime(w).steps.push({ uses: 'example/action@' + 'a'.repeat(40) }); }],
  ['reordered cleanup and finalization', w => { [runtime(w).steps[3], runtime(w).steps[4]] = [runtime(w).steps[4], runtime(w).steps[3]]; }],
  ['checkout of branch instead of event commit', w => { runtime(w).steps[0].with.ref = 'main'; }],
  ['checkout of an unrelated event reference', w => { runtime(w).steps[0].with.ref = '${{ github.ref }}'; }],
  ['persisted checkout credentials', w => { runtime(w).steps[0].with['persist-credentials'] = true; }],
  ['different checkout depth', w => { runtime(w).steps[0].with['fetch-depth'] = 0; }],
  ['unexpected checkout input', w => { runtime(w).steps[0].with.submodules = true; }],
  ['unbound Node version', w => { runtime(w).steps[1].with['node-version-file'] = 'other.nvmrc'; }],
  ['package manager cache', w => { runtime(w).steps[1].with['package-manager-cache'] = true; }],
  ['extra setup-node input', w => { runtime(w).steps[1].with['node-version'] = 'latest'; }],
  ['swallowed work failure', w => { runtime(w).steps[2].run += ' || true'; }],
  ['shell input interpolation', w => { runtime(w).steps[2].run += ' ${{ inputs.mode }}'; }],
  ['diagnostic replacing the wrapper', w => { runtime(w).steps[2].run = 'python3 -B -O evaluations/hubs-spoke/runtime/run.py diagnose'; }],
  ['conditional cleanup', w => { runtime(w).steps[3].if = '${{ failure() }}'; }],
  ['conditional finalization', w => { runtime(w).steps[4].if = '${{ success() }}'; }],
  ['conditional artifact retention', w => { runtime(w).steps[5].if = '${{ success() }}'; }],
  ['missing attempt in artifact identity', w => { runtime(w).steps[5].with.name = 'f04-hubs-runtime-${{ github.sha }}-${{ github.run_id }}'; }],
  ['broad artifact directory', w => { runtime(w).steps[5].with.path = '.'; }],
  ['silently missing artifact', w => { runtime(w).steps[5].with['if-no-files-found'] = 'warn'; }],
  ['hidden artifact upload', w => { runtime(w).steps[5].with['include-hidden-files'] = true; }],
  ['overwriting prior run artifacts', w => { runtime(w).steps[5].with.overwrite = true; }],
  ['different artifact retention', w => { runtime(w).steps[5].with['retention-days'] = 90; }],
  ['unknown upload input', w => { runtime(w).steps[5].with['include-secrets'] = true; }],
  ['display-name expression', w => { runtime(w).steps[0].name = '${{ secrets.SYNTHETIC_TOKEN }}'; }],
];

for (const [name, mutate] of mutations) {
  test(`manual F04 policy rejects ${name}`, () => {
    const workflow = parse(text);
    mutate(workflow);
    assert.ok(validateF04RuntimeWorkflow(stringify(workflow), pins).length > 0);
  });
}

test('every action must retain its checked-in full SHA and exact action name', () => {
  for (const index of [0, 1, 5]) {
    for (const changed of ['actions/checkout@v7', 'actions/checkout@' + '0'.repeat(40), 'other/action@' + pins['actions/checkout'].sha]) {
      const workflow = parse(text);
      runtime(workflow).steps[index].uses = changed;
      assert.ok(validateF04RuntimeWorkflow(stringify(workflow), pins).length > 0);
    }
  }
});

test('each step rejects undeclared failure, environment, shell and location overrides', () => {
  for (let index = 0; index < 6; index++) {
    for (const [key, value] of Object.entries({ 'continue-on-error': false, env: {}, shell: 'bash', 'working-directory': '.', 'timeout-minutes': 1 })) {
      const workflow = parse(text);
      runtime(workflow).steps[index][key] = value;
      assert.ok(validateF04RuntimeWorkflow(stringify(workflow), pins).length > 0);
    }
  }
  for (const index of [0, 1, 2]) {
    const workflow = parse(text);
    runtime(workflow).steps[index].if = '${{ always() }}';
    assert.ok(validateF04RuntimeWorkflow(stringify(workflow), pins).length > 0);
  }
});

test('duplicate YAML keys and aliases cannot conceal an alternate definition', () => {
  for (const changed of [
    text + '\njobs: {}\n',
    text.replace('permissions: {}', 'permissions: {}\npermissions: {}'),
    text.replace('    timeout-minutes: 70', '    timeout-minutes: 70\n    timeout-minutes: 70'),
    'name: &label unchanged\n' + text.replace(/^name:.*\n/, '').replace('        if: ${{ always() }}', '        if: *label'),
    text.replace('name: F04 Hubs runtime diagnostic', 'name: &label F04 Hubs runtime diagnostic').replace('name: Check out the exact dispatched commit', 'name: *label'),
  ]) assert.ok(validateF04RuntimeWorkflow(changed, pins).length > 0);
});

test('malformed structures and missing pin metadata fail with bounded diagnostics', () => {
  for (const malformed of [null, '', '[]', 'null', 'on: [', '!!unreviewed {}']) {
    assert.ok(validateF04RuntimeWorkflow(malformed, pins).length > 0);
  }
  for (const invalidPins of [null, {}, { 'actions/checkout': { sha: 'v7' } }]) {
    assert.ok(validateF04RuntimeWorkflow(text, invalidPins).length > 0);
  }
  const workflow = parse(text), marker = 'synthetic-private-value-for-diagnostic-test';
  runtime(workflow).env.F04_MODE = marker;
  assert.ok(!validateF04RuntimeWorkflow(stringify(workflow), pins).join('\n').includes(marker));
});
