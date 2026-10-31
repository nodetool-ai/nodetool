#!/usr/bin/env node
import { scenarios } from '../benchmarks/scenarios.mjs';
import { mkdtemp, writeFile, rm, readFile } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
const build=process.argv[2];
if(!build) { throw new Error('benchmark-suite.mjs <build-directory>'); }
const stage=await mkdtemp(join(tmpdir(),'game-bench-suite-'));
try {
  const reports={};
  const limits=JSON.parse(await readFile(new URL('../benchmarks/scenario-budgets.json',import.meta.url),'utf8'));
  let passed=true;
  const cases=Object.entries(await scenarios());
  if(cases.length!==4||!['course','hierarchy','queries','churn'].every(name=>cases.some(([key])=>key===name))) { throw new Error('Expected nonempty complete benchmark scenario set'); }
  for(const [name,document] of cases) {
    const file=join(stage,`${name}.json`); await writeFile(file,JSON.stringify(document));
    reports[name]=await new Promise((done,reject)=>{
      const child=spawn(join(resolve(build),process.platform==='win32'?'game-bench.exe':'game-bench'),[file,'--ticks','120','--warmup','30'],{stdio:['ignore','pipe','pipe']}); let out='',err='';
      child.stdout.on('data',chunk=>out+=chunk);child.stderr.on('data',chunk=>err+=chunk);child.once('error',reject);child.once('close',code=>code===0?done(JSON.parse(out)):reject(new Error(`${name}: ${err}`)));
    });
    const budget=limits[name];
    if(!budget||!Number.isFinite(budget.simulationP95Ms)||!Number.isFinite(budget.transactionP95Ms)) { throw new Error(`Missing bounded budget for ${name}`); }
    const result=reports[name];
    const accepted=result.timings.totalMs.p95Ms<=budget.simulationP95Ms && result.timings.documentTransactionMs.p95Ms<=budget.transactionP95Ms;
    result.scenarioBudget={...budget,passed:accepted,enforced:process.argv.includes('--enforce')}; passed=passed&&accepted;
  }
  if(process.argv.includes('--enforce')&&!passed) { process.exitCode=2; }
  console.log(JSON.stringify(reports,null,2));
} finally { await rm(stage,{recursive:true,force:true}); }
