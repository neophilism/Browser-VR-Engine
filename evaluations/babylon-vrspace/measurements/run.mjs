import {spawn} from 'node:child_process';
import {packageRoot} from '../config.mjs';
import {isolatedEnvironment} from '../environment.mjs';

const commands={unit:['--test','--test-isolation=none','measurements/test.mjs'],browser:['measurements/browser-checks.mjs'],verify:['measurements/verify.mjs']};
const mode=process.argv[2],extra=process.argv.slice(3);
if(!Object.hasOwn(commands,mode)||(mode==='verify'?extra.length!==1:extra.length!==0))throw new Error('Usage: node measurements/run.mjs unit|browser|verify [artifact-directory]');
const child=spawn(process.execPath,[...commands[mode],...extra],{cwd:packageRoot,env:await isolatedEnvironment(),shell:false,stdio:'inherit'});
for(const signal of ['SIGINT','SIGTERM'])process.once(signal,()=>child.kill(signal));
child.once('error',error=>{console.error(error.message);process.exitCode=1;});
child.once('exit',(code,signal)=>{process.exitCode=signal?1:(code??1);});
