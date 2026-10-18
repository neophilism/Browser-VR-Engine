// Final status is derived only after owned resource cleanup and report metadata
// collection. The same function writes the report and sets the process outcome,
// so an error received during capture/closure cannot retain an earlier pass.
const errorTypes = new Set(['error', 'pageerror', 'socketerror']);

export async function finalizeBrowserRun({ checks, observed, logs, requests, dispose, resources, prepareReport, writeReport }) {
  const cleanupErrors = [...(observed.cleanupErrors || [])];
  for (const phase of [dispose, resources]) {
    const settled = await Promise.allSettled(phase.map(({ close }) => Promise.resolve().then(close)));
    for (let index = 0; index < settled.length; index++) {
      if (settled[index].status === 'rejected') {
        const reason = settled[index].reason;
        cleanupErrors.push({ resource: phase[index].resource, error: String(reason?.stack || reason) });
      }
    }
  }
  if (cleanupErrors.length) observed.cleanupErrors = cleanupErrors;

  // Metadata preparation can await filesystem reads. Inspect the accumulated
  // observations afterward, immediately before constructing the final report.
  const metadata = await prepareReport();
  const errorCount = logs.filter(entry => errorTypes.has(entry.type)).length;
  const probeErrorCount = (observed.final || []).reduce((sum, state) => sum + (state?.errors?.length || 0), 0);
  const complete = checks.length === 9 && checks.every(check => check.status === 'passed');
  const passed = complete && !observed.fatal && errorCount === 0 && probeErrorCount === 0 && requests.length === 0 && cleanupErrors.length === 0;
  const result = {
    ...metadata,
    runStatus: passed ? 'passed' : 'failed',
    counts: { passed: checks.filter(check => check.status === 'passed').length, failed: checks.filter(check => check.status === 'failed').length, checks: checks.length },
    finalization: { evaluatedAfterCleanupSettled: true, browserErrors: errorCount, probeErrors: probeErrorCount, failedOrBlockedRequests: requests.length, cleanupErrors: cleanupErrors.length },
    checks, observed, logs, requests,
  };
  if (!passed) process.exitCode = 1;
  await writeReport(result);
  return result;
}
