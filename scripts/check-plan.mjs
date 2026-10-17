import { readFile, realpath, stat } from 'node:fs/promises';
import { resolve, relative, isAbsolute } from 'node:path';
import { pathToFileURL } from 'node:url';

const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const sha = value => typeof value === 'string' && /^[a-f0-9]{40}$/.test(value);
const reference = (value, kind) => typeof value === 'string' && new RegExp(`^docs/${kind}/[A-Za-z0-9_./-]+\\.(?:md|json)$`).test(value) && !value.split('/').includes('..');
const evidence = values => Array.isArray(values) && values.length > 0 && values.every(value => reference(value, 'evidence'));

export function validatePlan(plan, progress) {
  const errors = [];
  if (!object(plan) || plan.schemaVersion !== 1 || !Array.isArray(plan.cards) || !plan.cards.length) return ['Invalid plan envelope'];
  if (!object(progress) || progress.schemaVersion !== 1 || !Array.isArray(progress.units)) return ['Invalid progress envelope'];
  const cards = new Map();
  for (const c of plan.cards) {
    if (!object(c) || typeof c.id !== 'string' || !/^[A-Z]\d{2}$/.test(c.id) || cards.has(c.id)) { errors.push(`Invalid or duplicate card ${c?.id}`); continue; }
    cards.set(c.id, c);
    for (const key of ['title', 'lane', 'deliverable', 'acceptance', 'tests', 'security']) {
      if (typeof c[key] !== 'string' || !c[key].trim()) errors.push(`${c.id} lacks ${key}`);
    }
    if (!['engine', 'app'].includes(c.repo)) errors.push(`${c.id} invalid repository`);
    if (!['core', 'expanded'].includes(c.release)) errors.push(`${c.id} invalid release`);
    if (!Array.isArray(c.depends) || c.depends.some(dep => typeof dep !== 'string') || new Set(c.depends).size !== c.depends.length) errors.push(`${c.id} invalid dependencies`);
  }
  const visiting = new Set(), visited = new Set();
  function visit(id) {
    if (visiting.has(id)) { errors.push(`Dependency cycle at ${id}`); return; }
    if (visited.has(id) || !cards.has(id)) return;
    visiting.add(id);
    for (const dep of Array.isArray(cards.get(id).depends) ? cards.get(id).depends : []) {
      if (!cards.has(dep)) errors.push(`${id} unknown dependency ${dep}`);
      else if (cards.get(id).repo === 'engine' && cards.get(dep).repo === 'app') errors.push(`${id} depends on application ${dep}`);
      visit(dep);
    }
    visiting.delete(id); visited.add(id);
  }
  for (const id of cards.keys()) visit(id);
  const states = new Map();
  for (const u of progress.units) {
    if (!object(u) || !cards.has(u.id) || states.has(u.id)) { errors.push(`Invalid or duplicate progress ${u?.id}`); continue; }
    states.set(u.id, u);
    if (!['planned', 'implementing', 'implemented', 'blocked', 'verified', 'accepted'].includes(u.status)) errors.push(`${u.id} invalid status`);
    if (!Array.isArray(u.blockers) || u.blockers.some(reason => typeof reason !== 'string' || !reason.trim())) errors.push(`${u.id} invalid blockers`);
    if (u.status === 'blocked' && (!u.blockers?.length || typeof u.nextAction !== 'string' || !u.nextAction.trim())) errors.push(`${u.id} blocked without reason or next action`);
    if (['verified', 'accepted'].includes(u.status) && (!evidence(u.verification) || !reference(u.securityReview, 'security'))) errors.push(`${u.id} lacks verification or security review references`);
    const repo = cards.get(u.id).repo === 'engine' ? 'Browser-VR-Engine' : 'XLR8';
    if (u.status === 'accepted' && (!(new RegExp(`^https://github\\.com/neophilism/${repo}/pull/[1-9]\\d*$`)).test(u.pullRequest ?? '') || !sha(u.mergedCommit))) errors.push(`${u.id} lacks immutable merge evidence`);
    for (const [field, completed] of [['deployment', 'deployed'], ['qualification', 'qualified']]) {
      const value = u[field];
      if (value === null || value === undefined) continue;
      if (!object(value) || !['not_applicable', 'pending', 'failed', 'blocked', completed].includes(value.status)) { errors.push(`${u.id} invalid ${field}`); continue; }
      if (value.status === completed && (!sha(value.sourceSha) || !evidence(value.evidence) || typeof value.target !== 'string' || !value.target.trim())) errors.push(`${u.id} lacks separate ${field} evidence`);
      if (['blocked', 'not_applicable'].includes(value.status) && (typeof value.reason !== 'string' || !value.reason.trim())) errors.push(`${u.id} ${field} needs a reason`);
    }
  }
  for (const id of cards.keys()) {
    if (!states.has(id)) errors.push(`Missing progress ${id}`);
    if (states.get(id)?.status === 'accepted') for (const dep of Array.isArray(cards.get(id).depends) ? cards.get(id).depends : []) {
      if (states.get(dep)?.status !== 'accepted') errors.push(`${id} accepted before ${dep}`);
    }
  }
  if (!Array.isArray(cards.get('C01')?.depends) || !cards.get('C01').depends.includes('R12')) errors.push('Application bootstrap must wait for complete engine R12');
  return errors;
}

export async function validateReferences(progress, root) {
  const errors = [];
  const canonical = await realpath(root);
  for (const unit of progress.units) {
    const references = [
      ...(['verified', 'accepted'].includes(unit?.status) ? [...unit.verification, unit.securityReview] : []),
      ...(unit?.deployment?.status === 'deployed' ? unit.deployment.evidence : []),
      ...(unit?.qualification?.status === 'qualified' ? unit.qualification.evidence : [])
    ];
    for (const ref of references) {
      try {
        const file = await realpath(resolve(canonical, ref));
        const rel = relative(canonical, file);
        if (rel.startsWith('..') || isAbsolute(rel) || !(await stat(file)).isFile()) throw new Error('Invalid reference');
      } catch { errors.push(`${unit.id} missing or unsafe evidence reference ${ref}`); }
    }
  }
  return errors;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const root = resolve(import.meta.dirname, '..');
  const plan = JSON.parse(await readFile(resolve(root, 'docs/plan/pr-plan.json'), 'utf8'));
  const progress = JSON.parse(await readFile(resolve(root, 'docs/progress.json'), 'utf8'));
  const errors = validatePlan(plan, progress);
  if (!errors.length) errors.push(...await validateReferences(progress, root));
  if (errors.length) { console.error(errors.join('\n')); process.exitCode = 1; }
  else console.log(`Plan validated: ${plan.cards.length} units, engine-first sequencing, consistent evidence.`);
}
