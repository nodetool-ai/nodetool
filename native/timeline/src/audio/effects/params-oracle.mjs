// The actual QML JS library is evaluated by QQmlEngine. The expected results
// come from the TypeScript source, including the parameter format functions.
import { build } from 'esbuild';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../../..');
const binary = path.resolve(process.argv[2]);
const output = path.join(path.dirname(binary), 'p1-params.mjs');
await build({entryPoints:[path.join(root,'web/src/components/timeline/daw/fablesynth/params.ts')], outfile:output, bundle:true, platform:'node', format:'esm'});
const ts = await import(pathToFileURL(output));
let seed = 291;
const random = () => { seed = (Math.imul(seed,1664525)+1013904223) >>> 0; return seed / 4294967296; };
const requests = [], expected = [];
function add(name, args) { requests.push([name,args]); expected.push(ts[name](...args)); }
for (const def of Object.values(ts.PARAMS)) {
 if (def.min === undefined || def.max === undefined) continue;
 for (const n of [-1,0,0.001,.25,.5,.75,.999,1,2, ...Array.from({length:12},random)]) {
  add('normToValue',[def,n]);
  const v = ts.normToValue(def,n);
  add('valueToNorm',[def,v]);
 }
}
for (const name of ['fmtHz','fmtSec','fmtPct','fmtPan','fmtSigned','fmtDb','fmtBi','fmtNote']) {
 for (const v of [-100,-1,-.5,-.009,0,.001,.01,.5,.999,1,12,69,99.9,100,999,1000,20000,...Array.from({length:50},()=>random()*200-100)]) add(name,[v]);
}
const actual = JSON.parse(execFileSync(binary,['--helpers'],{input:JSON.stringify(requests),env:{...process.env,QT_QPA_PLATFORM:'offscreen',QT_QUICK_BACKEND:'software'},encoding:'utf8'}));
if (!requests.length || actual.length !== expected.length) throw Error('Empty or incomplete comparison');
for (let i=0;i<expected.length;++i) {
 const a = actual[i], b = expected[i];
 if (typeof b === 'number' ? !Number.isFinite(a) || Math.abs(a-b) > 1e-10*Math.max(1,Math.abs(b)) : a !== b) throw Error(`${JSON.stringify(requests[i])}: QML=${a} TS=${b}`);
}
console.log(`PASS ${requests.length} QML/TypeScript parameter and formatter comparisons`);
