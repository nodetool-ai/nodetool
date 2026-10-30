#!/usr/bin/env node
import { exportNativePlayer } from '../../../packages/game-runtime/scripts/native-game-export.mjs';
import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawn } from 'node:child_process';
const build=resolve(process.argv[2] ?? 'native/game/build-player');
const root=await mkdtemp(join(tmpdir(),'native-delivery-check-'));
function run(command,args,env) { return new Promise((done,reject)=>{const child=spawn(command,args,{cwd:root,env,stdio:['ignore','pipe','pipe']});let out='',err='';child.stdout.on('data',d=>out+=d);child.stderr.on('data',d=>err+=d);child.once('error',reject);child.once('close',code=>code===0?done(out):reject(new Error(`${command}: ${code}: ${err}`)));}); }
try {
  const document=resolve('native/game/benchmarks/course.json');
  const report=await exportNativePlayer({buildDir:build,document,assetsRoot:resolve('native/game/benchmarks'),output:join(root,'export')});
  if(!report.files.length||report.files.some(file=>file.path.endsWith('.env'))) { throw new Error('Invalid nonempty export inventory'); }
  const env=Object.fromEntries(Object.entries(process.env).filter(([key])=>['PATH','HOME','LANG','XDG_RUNTIME_DIR','VK_ICD_FILENAMES','VK_DRIVER_FILES'].includes(key)));
  if(process.platform==='linux') { env.QT_QPA_PLATFORM='xcb'; env.QSG_RHI_BACKEND='vulkan'; }
  const executable=join(report.output,process.platform==='win32'?'bin/game-player.exe':'bin/game-player');
  const capability=JSON.parse(await run(executable,['--capabilities'],env));
  if(!capability.player||capability.graphicsProbed!==false) { throw new Error('Headless capabilities failed'); }
  const capture=join(root,'installed.png'),captureReport=join(root,'installed.json');
  const args=[join(report.output,'game.json'),'--assets-dir',join(report.output,'assets'),'--capture',capture,'--tick','3','--report',captureReport];
  await run(process.platform==='linux'?'xvfb-run':executable,process.platform==='linux'?['-a',executable,...args]:args,env);
  const measured=JSON.parse(await readFile(captureReport,'utf8'));
  if(measured.committedTick!==3||measured.vertices<1) { throw new Error('Installed capture did not render the authored scene'); }
  if(process.platform==='linux') {
    const dependencies=await run('ldd',[executable],env);
    for(const line of dependencies.split('\n').filter(line=>line.includes('libQt'))) { if(!line.includes(report.output)) { throw new Error(`Qt escaped installed bundle: ${line}`); } }
  }
  const names=await readdir(root);
  if(names.some(name=>name.startsWith('.native-game-export-'))) { throw new Error('Export left staging files'); }
  console.log(JSON.stringify({passed:true,files:report.files.length,device:measured.device,committedTick:measured.committedTick,standalone:true}));
} finally { await rm(root,{recursive:true,force:true}); }
