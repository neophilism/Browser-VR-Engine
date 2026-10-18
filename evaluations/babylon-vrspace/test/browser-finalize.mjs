/** Close all resources before taking the diagnostic snapshot used for status. */
export async function finalizeBrowserRun({ checks, expectedChecks, readSources, closeBrowser, closeServer, diagnostics }) {
  const finalizationErrors=[];
  const attempt=async(stage,action)=>{try{return await action();}catch(error){finalizationErrors.push({stage,message:String(error?.message||error).slice(0,2048)});return null;}};
  const sourceDigests=await attempt('source-fingerprints',readSources);
  await attempt('browser-close',closeBrowser);
  await attempt('server-close',closeServer);
  // Events emitted while hashing or closing must be included; callers supply
  // a callback rather than an earlier count/snapshot.
  const {logs,failedRequests,logOverflow=0}=structuredClone(diagnostics());
  const counts={passed:checks.filter(check=>check.status==='passed').length,failed:checks.filter(check=>check.status==='failed').length,pageErrors:logs.filter(log=>['error','pageerror'].includes(log.type)).length,failedRequests:failedRequests.length,logOverflow};
  const runStatus=checks.length===expectedChecks&&counts.passed===expectedChecks&&counts.failed===0&&counts.pageErrors===0&&counts.failedRequests===0&&logOverflow===0&&finalizationErrors.length===0?'passed':'failed';
  return {sourceDigests,logs,failedRequests,finalizationErrors,counts,runStatus,timestamp:new Date().toISOString()};
}
