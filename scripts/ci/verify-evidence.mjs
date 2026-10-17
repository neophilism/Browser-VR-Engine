import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { validateEvidence, validateEvidenceFiles, shaPattern } from './evidence.mjs';

const [file, headSha, testedSha, baseSha] = process.argv.slice(2);
if (!file || !shaPattern.test(headSha ?? '') || !shaPattern.test(testedSha ?? '') || (baseSha && !shaPattern.test(baseSha))) {
  console.error('Usage: node scripts/ci/verify-evidence.mjs MANIFEST CURRENT_HEAD TESTED_SHA [CURRENT_BASE]');
  process.exitCode = 1;
} else {
  try {
    const path = resolve(file);
    const record = JSON.parse(await readFile(path, 'utf8'));
    const expected = { headSha, testedSha };
    if (baseSha) expected.baseSha = baseSha;
    const errors = [...validateEvidence(record, expected), ...await validateEvidenceFiles(record, dirname(path))];
    if (record.eventName === 'pull_request' && !baseSha) errors.push('Current PR base is required');
    if (errors.length) { console.error(errors.join('\n')); process.exitCode = 1; }
    else console.log('Candidate and report integrity match. Independently verify the actual GitHub checks and review before acceptance.');
  } catch (error) { console.error(error.message); process.exitCode = 1; }
}
