import { join } from 'node:path';
import { newRun, writeJson } from './lib.mjs';
import { verifySource } from './sources.mjs';
import { prepareFixture } from './fixtures.mjs';
const run = await newRun('fixtures');
try {
  const source = await verifySource('spoke');
  const prepared = await prepareFixture(run);
  await writeJson(join(run.dir, 'prepared.json'), { status: 'prepared', source, projectName: prepared.projectName, adaptation: prepared.adaptation });
  console.log(JSON.stringify({ status: 'prepared', run: run.dir, project: join(prepared.servedRoot, prepared.projectName) }));
} catch (error) {
  await writeJson(join(run.dir, 'prepared.json'), { status: 'failed', error: error.message });
  console.error(error.message); process.exitCode = 1;
}
