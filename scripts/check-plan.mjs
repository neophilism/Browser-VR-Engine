import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

export function validatePlan(plan, progress) {
  const errors = [];
  if (!plan || plan.schemaVersion !== 1 || !Array.isArray(plan.cards)) return ['Invalid plan envelope'];
  if (!progress || progress.schemaVersion !== 1 || !Array.isArray(progress.units)) return ['Invalid progress envelope'];
  const cards = new Map();
  for (const c of plan.cards) {
    if (!/^[FWANMBRC]\d{2}$/.test(c.id) || cards.has(c.id)) errors.push(`Invalid or duplicate card ${c.id}`);
    cards.set(c.id, c);
    for (const key of ['title', 'deliverable', 'acceptance', 'tests', 'security']) {
      if (typeof c[key] !== 'string' || !c[key].trim()) errors.push(`${c.id} lacks ${key}`);
    }
    if (!['engine', 'app'].includes(c.repo)) errors.push(`${c.id} invalid repository`);
    if (!Array.isArray(c.depends)) errors.push(`${c.id} invalid dependencies`);
  }
  const visiting = new Set(), visited = new Set();
  function visit(id) {
    if (visiting.has(id)) { errors.push(`Dependency cycle at ${id}`); return; }
    if (visited.has(id) || !cards.has(id)) return;
    visiting.add(id);
    for (const dep of cards.get(id).depends ?? []) {
      if (!cards.has(dep)) errors.push(`${id} unknown dependency ${dep}`);
      else if (cards.get(id).repo === 'engine' && cards.get(dep).repo === 'app') errors.push(`${id} depends on application ${dep}`);
      visit(dep);
    }
    visiting.delete(id); visited.add(id);
  }
  for (const id of cards.keys()) visit(id);
  const states = new Map();
  for (const u of progress.units) {
    if (!cards.has(u.id) || states.has(u.id)) errors.push(`Invalid or duplicate progress ${u.id}`);
    states.set(u.id, u);
    if (!['planned', 'implementing', 'blocked', 'verified', 'accepted'].includes(u.status)) errors.push(`${u.id} invalid status`);
    if (u.status === 'blocked' && !u.blockers?.length) errors.push(`${u.id} blocked without reason`);
    if (['verified', 'accepted'].includes(u.status) && (!u.verification?.length || !u.securityReview)) errors.push(`${u.id} lacks verification or security review`);
    if (u.status === 'accepted' && (!/^https:\/\/github\.com\/neophilism\/(Browser-VR-Engine|XLR8)\/pull\/\d+$/.test(u.pullRequest ?? '') || !/^[a-f0-9]{40}$/.test(u.mergedCommit ?? ''))) errors.push(`${u.id} lacks immutable merge evidence`);
  }
  for (const id of cards.keys()) {
    if (!states.has(id)) errors.push(`Missing progress ${id}`);
    if (states.get(id)?.status === 'accepted') for (const dep of cards.get(id).depends ?? []) {
      if (states.get(dep)?.status !== 'accepted') errors.push(`${id} accepted before ${dep}`);
    }
  }
  if (!cards.get('C01')?.depends?.includes('R12')) errors.push('Application bootstrap must wait for complete engine R12');
  return errors;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const root = resolve(import.meta.dirname, '..');
  const plan = JSON.parse(await readFile(resolve(root, 'docs/plan/pr-plan.json'), 'utf8'));
  const progress = JSON.parse(await readFile(resolve(root, 'docs/progress.json'), 'utf8'));
  const errors = validatePlan(plan, progress);
  if (errors.length) { console.error(errors.join('\n')); process.exitCode = 1; }
  else console.log(`Plan validated: ${plan.cards.length} units, engine-first sequencing, consistent evidence.`);
}
