import { spawnSync } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { redactStructured } from './check-secret-exposure.mjs';
import { childEnvironment } from './ci/environment.mjs';

const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const levels = ['info', 'low', 'moderate', 'high', 'critical'];

export function classifyAudit(report, exitCode, commandError = null) {
  if (commandError) return { status: 'blocked', reason: 'Dependency audit command failed before a reliable result' };
  if (!object(report) || report.error || !object(report.metadata?.vulnerabilities) || !object(report.vulnerabilities) || ![0, 1].includes(exitCode)) return { status: 'blocked', reason: 'Dependency audit did not produce a valid registry result' };
  const counts = report.metadata.vulnerabilities;
  if ([...levels, 'total'].some(key => !Number.isSafeInteger(counts[key]) || counts[key] < 0)) return { status: 'blocked', reason: 'Dependency audit counts are invalid' };
  const entries = Object.values(report.vulnerabilities);
  if (entries.some(item => !object(item) || !levels.includes(item.severity))) return { status: 'blocked', reason: 'Dependency audit entries are invalid' };
  if (levels.some(level => entries.filter(item => item.severity === level).length !== counts[level]) || entries.length !== counts.total) return { status: 'blocked', reason: 'Dependency audit entries contradict its counts' };
  if (counts.high + counts.critical > 0) return { status: 'failed', reason: 'High or critical dependency advisories require remediation' };
  if (exitCode !== 0) return { status: 'blocked', reason: 'Dependency audit result contradicts its exit status' };
  return { status: 'passed', reason: counts.total ? 'No high/critical advisories; lower-severity findings remain in the report' : 'No reported dependency advisories' };
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const root = resolve(import.meta.dirname, '..');
  const result = spawnSync('npm', ['audit', '--json', '--audit-level=high', '--fetch-timeout=10000', '--fetch-retries=0'], { cwd: root, env: childEnvironment(), encoding: 'utf8', timeout: 30_000, maxBuffer: 4 * 1024 * 1024, shell: false });
  let report;
  let unparsedStdout = null;
  try { report = JSON.parse(result.stdout); } catch { report = { error: 'No valid registry JSON result' }; unparsedStdout = result.stdout ?? ''; }
  const commandError = result.error?.code ?? null;
  const assessment = classifyAudit(report, result.status, commandError);
  const directory = resolve(root, 'artifacts/security');
  await mkdir(directory, { recursive: true });
  await writeFile(resolve(directory, 'dependency-audit.json'), `${JSON.stringify(redactStructured({ assessment, exitCode: result.status, commandError, report, unparsedStdout, stderr: result.stderr ?? '' }), null, 2)}\n`);
  console.log(`${assessment.status}: ${assessment.reason}`);
  if (assessment.status !== 'passed') process.exitCode = 1;
}
