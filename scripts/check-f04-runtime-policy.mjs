import { isDeepStrictEqual } from 'node:util';
import { isAlias, parseDocument, visit } from 'yaml';

const command = 'python3 -B -O scripts/ci/f04-runtime.py';
const always = '${{ always() }}';
const actions = ['actions/checkout', 'actions/setup-node', 'actions/upload-artifact'];
const record = value => value !== null && typeof value === 'object' && !Array.isArray(value);

// This manual workflow is a separate, explicitly dispatched diagnostic. Its
// permissive audit mode must never become an extra trigger or a required-job
// shortcut. Match the executable contract and reject undeclared YAML keys.
export function validateF04RuntimeWorkflow(text, pins) {
  const errors = [];
  if (typeof text !== 'string') return ['F04 workflow must be YAML text'];
  let workflow;
  try {
    const document = parseDocument(text, { uniqueKeys: true });
    if (document.errors.length || document.warnings.length) return ['F04 workflow YAML is invalid or contains unsupported tags'];
    let alias = false;
    visit(document, (_key, node) => { if (isAlias(node)) alias = true; });
    if (alias) return ['F04 workflow aliases are not permitted'];
    workflow = document.toJS({ maxAliasCount: 0 });
  } catch {
    return ['F04 workflow YAML cannot be safely read'];
  }

  function keys(value, required, optional, path) {
    if (!record(value)) {
      errors.push(`${path}: expected a mapping`);
      return false;
    }
    const actual = Object.keys(value);
    if (required.some(key => !Object.hasOwn(value, key)) || actual.some(key => !required.includes(key) && !optional.includes(key))) {
      errors.push(`${path}: declared keys differ`);
    }
    return true;
  }
  function equal(value, expected, path) {
    if (!isDeepStrictEqual(value, expected)) errors.push(`${path}: required value differs`);
  }
  function cosmetic(value, key, path) {
    if (record(value) && Object.hasOwn(value, key) && (typeof value[key] !== 'string' || value[key].includes('${{'))) {
      errors.push(`${path}.${key}: expected literal display text`);
    }
  }
  function exact(value, expected, path) {
    if (!keys(value, Object.keys(expected), [], path)) return;
    for (const [key, item] of Object.entries(expected)) equal(value[key], item, `${path}.${key}`);
  }
  function action(name) {
    const sha = record(pins) && Object.hasOwn(pins, name) && record(pins[name]) ? pins[name].sha : undefined;
    if (typeof sha !== 'string' || !/^[a-f0-9]{40}$/.test(sha)) {
      errors.push('F04 workflow requires a verified full action SHA');
      return null;
    }
    return `${name}@${sha}`;
  }
  const [checkout, setup, upload] = actions.map(action);

  if (!keys(workflow, ['on', 'permissions', 'concurrency', 'defaults', 'jobs'], ['name'], 'workflow')) return errors;
  cosmetic(workflow, 'name', 'workflow');
  const trigger = workflow.on;
  keys(trigger, ['workflow_dispatch'], [], 'workflow.on');
  const dispatch = trigger?.workflow_dispatch;
  keys(dispatch, ['inputs'], [], 'workflow.on.workflow_dispatch');
  keys(dispatch?.inputs, ['mode'], [], 'workflow.on.workflow_dispatch.inputs');
  const mode = dispatch?.inputs?.mode;
  if (keys(mode, ['type', 'required', 'default', 'options'], ['description'], 'mode')) {
    equal(mode.type, 'choice', 'mode.type');
    equal(mode.required, true, 'mode.required');
    equal(mode.default, 'diagnose', 'mode.default');
    equal(mode.options, ['diagnose', 'evaluate'], 'mode.options');
    cosmetic(mode, 'description', 'mode');
  }
  exact(workflow.permissions, {}, 'workflow.permissions');
  exact(workflow.concurrency, { group: 'f04-hubs-runtime-${{ github.ref }}', 'cancel-in-progress': false }, 'workflow.concurrency');
  if (keys(workflow.defaults, ['run'], [], 'workflow.defaults')) exact(workflow.defaults.run, { shell: 'bash' }, 'workflow.defaults.run');
  keys(workflow.jobs, ['runtime'], [], 'workflow.jobs');
  const job = workflow.jobs?.runtime;
  if (!keys(job, ['name', 'runs-on', 'timeout-minutes', 'permissions', 'env', 'steps'], [], 'runtime')) return errors;
  equal(job.name, 'f04-hubs-runtime', 'runtime.name');
  equal(job['runs-on'], 'ubuntu-24.04', 'runtime.runs-on');
  equal(job['timeout-minutes'], 70, 'runtime.timeout-minutes');
  exact(job.permissions, { contents: 'read' }, 'runtime.permissions');
  exact(job.env, {
    CI: 'true', TZ: 'UTC', F04_MODE: '${{ inputs.mode }}',
    CI_WORKFLOW_REF: '${{ github.workflow_ref }}', CI_WORKFLOW_SHA: '${{ github.workflow_sha }}',
  }, 'runtime.env');

  const expectedSteps = [
    { uses: checkout, with: { 'persist-credentials': false, 'fetch-depth': 2, ref: '${{ github.sha }}' } },
    { uses: setup, with: { 'node-version-file': '.nvmrc', 'package-manager-cache': false } },
    { run: `${command} run` },
    { if: always, run: `${command} cleanup` },
    { if: always, run: `${command} finalize` },
    { if: always, uses: upload, with: {
      name: 'f04-hubs-runtime-${{ github.sha }}-${{ github.run_id }}-${{ github.run_attempt }}',
      path: 'artifacts/f04-runtime/', 'if-no-files-found': 'error', 'include-hidden-files': false,
      overwrite: false, 'retention-days': 30,
    } },
  ];
  if (!Array.isArray(job.steps) || job.steps.length !== expectedSteps.length) {
    errors.push('runtime.steps: exactly six ordered steps are required');
    return errors;
  }
  expectedSteps.forEach((expected, index) => {
    const step = job.steps[index], path = `runtime.steps[${index}]`;
    if (!keys(step, Object.keys(expected), ['name'], path)) return;
    cosmetic(step, 'name', path);
    for (const [key, value] of Object.entries(expected)) {
      if (key === 'with') exact(step.with, value, `${path}.with`);
      else equal(step[key], value, `${path}.${key}`);
    }
  });
  return errors;
}
