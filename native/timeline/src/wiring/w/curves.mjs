import { build, root } from './oracleTools.mjs';
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
const source = readFileSync(path.join(root,'web/src/components/timeline/Tracks/TrackEffectsPanel.tsx'),'utf8');
function section(from,to) {
 const start=source.indexOf(from), end=source.indexOf(to,start);
 assert(start >= 0 && end > start);
 return source.slice(start,end);
}
const result = await build({stdin:{contents:section('const biquadMagDb =','const eqCurveStyles =')+'\n'+section('const compTransferDb =','const compXY ='),loader:'ts'},write:false,bundle:false,treeShaking:false,format:'esm'});
// QML JS libraries expose top-level declarations through their import namespace.
const body = result.outputFiles[0].text.replace(/\bconst biquadMagDb =/,'var biquadMagDb =').replace(/\bconst compTransferDb =/,'var compTransferDb =');
assert(body.includes('var biquadMagDb =') && body.includes('var compTransferDb ='), 'Empty curve comparison');
const output = '.pragma library\n// Generated from TrackEffectsPanel.tsx by src/wiring/w/curves.mjs.\nvar EQ_FS = 48000\n'+body;
const target=path.join(root,'native/timeline/qml/wiring/w/CurveMath.js');
if(process.argv.includes('--write')) writeFileSync(target,output);
else assert.equal(readFileSync(target,'utf8'),output);
console.log('PASS EQ and compressor curve functions match TypeScript');
