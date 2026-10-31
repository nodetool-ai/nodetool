#!/usr/bin/env node
import { spawn } from 'node:child_process';
import { readFile, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir, cpus, totalmem } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
const source = fileURLToPath(new URL('../', import.meta.url));
function run(command,args) { return new Promise((done,reject) => { const child=spawn(command,args,{stdio:['ignore','pipe','pipe'],env:{...process.env,...(process.platform==='linux'?{QT_QPA_PLATFORM:'xcb',QSG_RHI_BACKEND:'vulkan'}:{})}});let out='',err='';child.stdout.on('data',d=>out+=d);child.stderr.on('data',d=>err=(err+d).slice(-65536));child.once('error',reject);child.once('close',code=>code===0?done(out):reject(new Error(`${command} exit ${code}: ${err}`))); }); }
try {
  const args = process.argv.slice(2); const flags = new Set(args.filter(x=>x.startsWith('--')));
  const positional=args.filter(x=>!x.startsWith('--'));
  if(positional.length!==2) { throw new Error('benchmark.mjs <build-directory> <document> [--render] [--enforce]'); }
  const build=resolve(positional[0]), document=resolve(positional[1]);
  const budgets=JSON.parse(await readFile(join(source,'benchmarks','budgets.json'),'utf8'));
  const simulation=JSON.parse(await run(join(build,process.platform==='win32'?'game-bench.exe':'game-bench'),[document,'--ticks',String(budgets.measuredTicks),'--warmup',String(budgets.warmupTicks)]));
  const report={cpu:cpus()[0]?.model,logicalCpus:cpus().length,totalMemoryBytes:totalmem(),simulation,budgets,render:null};
  let passed=simulation.timings.totalMs.p95Ms<=budgets.simulationP95Ms;
  if(flags.has('--render')) {
    const stage=await mkdtemp(join(tmpdir(),'game-perf-'));
    try {
      const player=join(build,process.platform==='win32'?'game-player.exe':'game-player');
      const command=process.platform==='linux'?'xvfb-run':player;
      const renderArgs=[document,'--capture',join(stage,'frame.png'),'--report',join(stage,'report.json'),'--width',String(budgets.width),'--height',String(budgets.height),'--benchmark-frames',String(budgets.measuredFrames)];
      await run(command,command===player?renderArgs:['-a',player,...renderArgs]);
      report.render=JSON.parse(await readFile(join(stage,'report.json'),'utf8'));
      report.render.hardware=/llvmpipe|lavapipe|swiftshader|software/i.test(report.render.device ?? '')?false:true;
      report.render.gpuBudgetEvaluated=false;
      if(!report.render.hardware) { report.render.gateReason='Software renderer does not establish the hardware budget'; }
      passed=passed&&report.render.hardware&&report.render.frameTimings.p95Ms<=budgets.frameP95Ms;
    } finally { await rm(stage,{recursive:true,force:true}); }
  }
  report.budgetPassed=passed; report.enforced=flags.has('--enforce');
  console.log(JSON.stringify(report,null,2));
  if(report.enforced&&!passed) { process.exitCode=2; }
} catch(error) { console.error(error.message); process.exitCode=1; }
