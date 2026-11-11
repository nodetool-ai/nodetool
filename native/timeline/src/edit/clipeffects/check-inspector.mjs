#!/usr/bin/env node
// D6 snapshots are written by the offscreen UI test, then rendered by both paths.
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { timelineSequenceResponse } from "@nodetool-ai/protocol/api-schemas/timeline.js";

const root = fileURLToPath(new URL("../../../",import.meta.url));
const stages = ["base","color","curves","effects","group"];

function psnr(first,second) {
  for (const file of [first,second]) {
    if (!fs.existsSync(file)) { throw new Error(`Missing still: ${file}`); }
  }
  const output = execFileSync("bash",["-c",'exec ffmpeg -hide_banner -i "$0" -i "$1" -lavfi "[0:v]format=rgb24[a];[1:v]format=rgb24[b];[a][b]psnr" -f null - 2>&1',first,second],{encoding:"utf8"});
  const match = /average:(inf|[0-9.]+)/.exec(output);
  if (!match) { throw new Error("Missing PSNR statistic"); }
  return match[1] === "inf" ? Infinity : Number(match[1]);
}

export function compareStills(base,preview,exported) {
  const parity = psnr(preview,exported);
  if (!(parity >= 40)) { throw new Error(`export comparison: ${parity} dB < 40 dB`); }
  const difference = psnr(base,preview);
  if (!Number.isFinite(difference) || difference > 40) {
    throw new Error(`edited preview must differ from unedited still: ${difference} dB`);
  }
  return {pass:true,parity,difference};
}

export function requireEditedDocuments(documents) {
  for (const name of stages) {
    if (!Array.isArray(documents[name]?.clips) || !documents[name].clips.length) {
      throw new Error(`Missing UI document: ${name}`);
    }
  }
  for (let i = 1; i < stages.length; ++i) {
    if (JSON.stringify(documents[stages[i]].clips) === JSON.stringify(documents[stages[i-1]].clips)) {
      throw new Error(`UI document ${stages[i]} is unchanged`);
    }
  }
}

export function validateDocument(document,name) {
  const parsed = timelineSequenceResponse.safeParse(document);
  if (!parsed.success) { throw new Error(`${name}: invalid export document: ${parsed.error.message}`); }
}

export function main(argv) {
  if (argv.length !== 4 || argv[0] !== "--bin" || argv[2] !== "--ui-test") {
    throw new Error("Usage: check-inspector.mjs --bin build/nodetool-timeline --ui-test build/tst_clipeffects");
  }
  const bin = path.resolve(argv[1]), uiTest = path.resolve(argv[3]);
  const directory = path.join(root,"build","d6-golden");
  fs.mkdirSync(directory,{recursive:true});
  const prefs = fs.mkdtempSync(path.join(root,"build","tmp","d6-prefs-"));
  const env = {...process.env,NODETOOL_TIMELINE_PREFERENCES:path.join(prefs,"prefs.conf")};
  for (const name of stages) { fs.rmSync(path.join(directory,`${name}.json`),{force:true}); }
  // Software Qt Quick renders only the UI test. Stills retain the driver's RHI.
  execFileSync(uiTest,["exportDocuments"],{env:{...env,QT_QPA_PLATFORM:"offscreen",QT_QUICK_BACKEND:"software",NT_D6_OUTPUT:directory},stdio:"inherit"});
  const documents = Object.fromEntries(stages.map(name => [name,JSON.parse(fs.readFileSync(path.join(directory,`${name}.json`),"utf8"))]));
  requireEditedDocuments(documents);
  for (const name of stages) { validateDocument(documents[name],name); }
  const still = name => path.join(directory,`${name}-preview`,"frame_000000.png");
  const renderEnv = {...env,QT_QPA_PLATFORM:process.env.QT_QPA_PLATFORM ?? "offscreen"};
  delete renderEnv.QT_QUICK_BACKEND;
  for (const [index,name] of stages.entries()) {
    const fixture = path.join(directory,`${name}.json`);
    // E and J's web export oracle, using only its local scratch asset store.
    execFileSync(process.execPath,[path.join(root,"scripts","golden-import.mjs"),fixture,"--frames","0","--out",path.join(directory,`${name}-export`)],{env,stdio:"inherit"});
    fs.rmSync(still(name),{force:true});
    execFileSync(bin,[fixture,"--stills",path.dirname(still(name)),"--still-frames","0","--decode","sw"],{env:renderEnv,stdio:"inherit"});
    if (name !== "base") {
      const result = compareStills(still(stages[index-1]),still(name),path.join(directory,`${name}-export`,"stills","frame_000000.png"));
      const baseline = psnr(still("base"),still(name));
      if (!Number.isFinite(baseline) || baseline > 40) { throw new Error(`${name}: unchanged from unedited still`); }
      console.log(`${name}: PASS preview/export ${result.parity} dB, edited/previous ${result.difference} dB, edited/base ${baseline} dB`);
    }
  }
  return 0;
}
if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  try { process.exitCode = main(process.argv.slice(2)); }
  catch (error) { console.error(`check-inspector: ${error.message}`); process.exitCode = 1; }
}
