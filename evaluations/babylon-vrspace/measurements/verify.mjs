import assert from 'node:assert/strict';
import { constants } from 'node:fs';
import { open, lstat, readdir, realpath } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createHash } from 'node:crypto';
import { inflateSync } from 'node:zlib';
import { loadMeasurementProfile, currentMeasurementBinding, measurementCheckIds, validateCoordinateReadback, validateCenterAudio, validateDistanceTrace, validateCleanup } from './evidence.mjs';

const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const names=['audio-trace.json','build.json','coordinate-anchors.json','coordinate-markers.png','measurement-checks.json','measurement-summary.json'];
const rawNames=['audio-trace.json','build.json','coordinate-anchors.json','coordinate-markers.png'];
async function readBounded(root,name,maximum) {
  assert(names.includes(name));const file=join(root,name),before=await lstat(file);assert(before.isFile()&&!before.isSymbolicLink());
  const handle=await open(file,constants.O_RDONLY|constants.O_NOFOLLOW);
  try {
    const stat=await handle.stat();assert(stat.isFile()&&stat.size>0&&stat.size<=maximum);assert.equal(stat.ino,before.ino);assert.equal(stat.dev,before.dev);
    const bytes=await handle.readFile();const after=await handle.stat();assert.equal(bytes.length,stat.size);assert.equal(after.size,stat.size);assert.equal(after.mtimeMs,stat.mtimeMs);return bytes;
  } finally {await handle.close();}
}
function png(bytes,profile) {
  assert(bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])),'Missing PNG signature');
  let offset=8,header=null,ended=false;const data=[];
  const crc=bytes=>{let value=0xffffffff;for(const byte of bytes){value^=byte;for(let bit=0;bit<8;bit++)value=(value>>>1)^((value&1)?0xedb88320:0);}return (value^0xffffffff)>>>0;};
  while(offset<bytes.length){
    assert(offset+12<=bytes.length);const length=bytes.readUInt32BE(offset),end=offset+12+length;assert(end<=bytes.length);
    const type=bytes.toString('ascii',offset+4,offset+8),payload=bytes.subarray(offset+8,end-4);
    assert.equal(crc(bytes.subarray(offset+4,end-4)),bytes.readUInt32BE(end-4),'PNG chunk checksum mismatch');
    if(!header){assert.equal(type,'IHDR');assert.equal(length,13);header=payload;}
    else assert.notEqual(type,'IHDR');
    if(type==='IDAT')data.push(payload);
    if(type==='IEND'){assert.equal(length,0);assert.equal(end,bytes.length);ended=true;}
    offset=end;
  }
  assert(ended&&data.length>0);assert.equal(header.readUInt32BE(0),profile.viewport.width);assert.equal(header.readUInt32BE(4),profile.viewport.height);
  assert.equal(header[8],8);assert([2,6].includes(header[9]));assert.equal(header[10],0);assert.equal(header[11],0);assert.equal(header[12],0);
  const stride=profile.viewport.width*(header[9]===6?4:3)+1,expected=stride*profile.viewport.height;
  const decoded=inflateSync(Buffer.concat(data),{maxOutputLength:expected});assert.equal(decoded.length,expected);
  for(let y=0;y<profile.viewport.height;y++)assert(decoded[y*stride]<=4);
}

export function validateMeasurementRecord(report,summary,{profile,profileSha256,binding,coordinates,audio}) {
  assert.equal(report.schemaVersion,1);assert.equal(summary.schemaVersion,1);assert.equal(report.method,'real-browser');
  assert.equal(report.runStatus,'passed');assert.equal(summary.runStatus,'passed');assert.equal(report.qualificationStatus,'incomplete');assert.equal(summary.qualificationStatus,'incomplete');
  for(const key of ['physicalHeadset','physicalAudio','avTimingMeasured']){assert.equal(report[key],false);assert.equal(summary[key],false);}
  assert.equal(report.performanceWorkloadExecuted,false);assert.equal(report.environment.physicalGPU,false);assert.deepEqual(report.environment.viewport,profile.viewport);
  assert.equal(typeof report.environment.browser,'string');assert(report.environment.browser.length>0);assert.equal(report.environment.playwright,'1.62.1');
  assert.deepEqual(report.profile,profile);assert.equal(report.profileSha256,profileSha256);assert.equal(summary.profileSha256,profileSha256);
  assert.deepEqual(report.binding,binding);assert.deepEqual(report.finalBinding,binding);
  assert.equal(report.fatalError,null);assert.equal(report.audioCollectionError,null);assert.deepEqual(report.finalizationErrors,[]);assert.deepEqual(report.failedRequests,[]);
  assert(Array.isArray(report.logs)&&report.logs.length<=profile.evidence.maximumLogs&&report.logs.every(log=>log&&['warning','warn'].includes(log.type)&&typeof log.text==='string'&&log.text.length<=2048));
  const counts={passed:4,failed:0,pageErrors:0,failedRequests:0,logOverflow:0,requestOverflow:0};assert.deepEqual(report.counts,counts);assert.deepEqual(summary.counts,counts);
  assert(Array.isArray(report.checks));assert.deepEqual(report.checks.map(check=>check.id),measurementCheckIds);
  assert(report.checks.every(check=>check.status==='passed'&&check.method==='real-browser'));
  assert.deepEqual(summary.checks,report.checks.map(({id,status,method})=>({id,status,method})));
  assert(Number.isFinite(Date.parse(report.startedAt))&&Number.isFinite(Date.parse(report.timestamp))&&Date.parse(report.timestamp)>=Date.parse(report.startedAt));
  assert(Array.isArray(report.missingEvidence)&&report.missingEvidence.length>=3&&report.missingEvidence.every(value=>typeof value==='string'&&value.trim()));
  const details=[validateCoordinateReadback(coordinates,profile),validateCenterAudio(audio,profile),validateDistanceTrace(audio,profile),validateCleanup(report.cleanup)];
  report.checks.forEach((check,index)=>assert.deepEqual(check.detail,details[index],'Reported measurement differs from independent raw-data calculation'));
  return {profileSha256,checks:details.map((detail,index)=>({id:measurementCheckIds[index],detail})),qualificationStatus:'incomplete',physicalHeadset:false,physicalAudio:false,avTimingMeasured:false};
}

export async function verifyMeasurementDirectory(directory) {
  const root=await realpath(resolve(directory));assert.equal(root,resolve(directory),'Measurement directory must not be a symlink');
  assert.deepEqual((await readdir(root)).sort(),names,'Unexpected or missing measurement artifact');
  const {profile,sha256:profileSha256}=await loadMeasurementProfile(),binding=await currentMeasurementBinding();
  const files=new Map(await Promise.all(names.map(async name=>[name,await readBounded(root,name,profile.evidence.maximumReportBytes)])));
  const report=JSON.parse(files.get('measurement-checks.json')),summary=JSON.parse(files.get('measurement-summary.json'));
  assert.deepEqual(summary.report,{path:'measurement-checks.json',bytes:files.get('measurement-checks.json').length,sha256:sha(files.get('measurement-checks.json'))});
  assert(Array.isArray(report.files));assert.deepEqual(report.files.map(file=>file.path).sort(),rawNames);
  for(const file of report.files){const bytes=files.get(file.path);assert.deepEqual(file,{path:file.path,bytes:bytes.length,sha256:sha(bytes)});}
  const build=files.get('build.json');assert.equal(sha(build),binding.build.sha256);assert.equal(build.length,binding.build.bytes);assert.deepEqual(JSON.parse(build),binding.build.metadata);
  png(files.get('coordinate-markers.png'),profile);
  const result=validateMeasurementRecord(report,summary,{profile,profileSha256,binding,coordinates:JSON.parse(files.get('coordinate-anchors.json')),audio:JSON.parse(files.get('audio-trace.json'))});
  assert.deepEqual(await currentMeasurementBinding(),binding,'Current source changed during evidence verification');
  return {runStatus:'verified',directory:root,files:files.size,baseSources:Object.keys(binding.baseSources).length,measurementSources:Object.keys(binding.measurementSources).length,workspaceInputs:Object.keys(binding.workspaceInputs).length,
    profileSha256,result,reportSha256:sha(files.get('measurement-checks.json'))};
}

if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
  if(process.argv.length!==3)throw new Error('Usage: node measurements/verify.mjs <artifact-directory>');
  try{const result=await verifyMeasurementDirectory(process.argv[2]);console.log(JSON.stringify(result,null,2));}
  catch(error){console.error(error.stack||String(error));process.exitCode=1;}
}
