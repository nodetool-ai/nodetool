import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import { build, transform } from 'esbuild';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../../../../..');
const qml=vm.runInNewContext(fs.readFileSync(path.join(root,'native/timeline/qml/mixer/faderTaper.js'),'utf8').replace(/^\.pragma library\s*/, '')+
 '\n({dbToFaderPosition,faderPositionToDb,formatDb,parseDb,formatPan,panValueText})');
const result=await build({entryPoints:[path.join(root,'web/src/components/timeline/daw/mixer/faderTaper.ts')],bundle:true,format:'esm',platform:'node',write:false});
const web=await import('data:text/javascript;base64,'+Buffer.from(result.outputFiles[0].text).toString('base64'));
let count=0;
function check(name,arg) {
 const expected=web[name](arg);
 let actual=qml[name](arg);
 if(process.argv.includes('--bad-input')&&count===0)actual=99;
 if(typeof expected==='number' ? (!Number.isFinite(actual)||Math.abs(actual-expected)>1e-12) : actual!==expected)throw Error(`${name}(${JSON.stringify(arg)}): native=${actual} web=${expected}`);
 count++;
}
for(let i=0;i<=4096;i++) {
 check('dbToFaderPosition',-130+i*160/4096);
 check('faderPositionToDb',-.1+i*1.2/4096);
 check('formatDb',-130+i*160/4096);
 check('formatPan',-1+i*2/4096);
 check('panValueText',-1+i*2/4096);
}
for(const value of ['','bad','-inf','inf','∞','-∞',' -6 dB ','+3.5db','−9','200','-200','1e2','NaN','Infinity'])check('parseDb',value);
if(!count)throw Error('Empty comparison');
console.log(`PASS ${count} QML/web fader taper, readout and pan comparisons (absolute tolerance 1e-12)`);

const editor=fs.readFileSync(path.join(root,'web/src/components/timeline/Tracks/TrackEffectsPanel.tsx'),'utf8');
function declaration(name) {
 const start=editor.indexOf('const '+name+' =');
 const end=editor.indexOf('\n};',start);
 if(start<0||end<start)throw Error('Missing web curve '+name);
 return editor.slice(start,end+3);
}
const sampleRateDeclaration=editor.match(/const EQ_FS = [0-9]+;/)?.[0];
if(!sampleRateDeclaration)throw Error('Missing web EQ sample rate');
const code=await transform(sampleRateDeclaration+'\n'+declaration('biquadMagDb')+'\n'+declaration('compTransferDb')+'\nexport {biquadMagDb,compTransferDb}',{loader:'ts',format:'esm'});
const ref=await import('data:text/javascript;base64,'+Buffer.from(code.code).toString('base64'));
const curves=vm.runInNewContext(fs.readFileSync(path.join(root,'native/timeline/qml/mixer/effectCurves.js'),'utf8').replace(/^\.pragma library\s*/, '')+'\n({biquadMagDb,compTransferDb})');
let curveCount=0;
function curve(name,args) {
 const expected=ref[name](...args);
 let actual=curves[name](...args);
 if(process.argv.includes(name==='biquadMagDb'?'--bad-eq':'--bad-comp'))actual+=1;
 if(!Number.isFinite(actual)||Math.abs(actual-expected)>1e-9*Math.max(1,Math.abs(expected)))throw Error(name+': native='+actual+' web='+expected);
 curveCount++;
}
for(const type of ['lowshelf','peaking','highshelf'])for(const f of [20,50,100,200,500,1000,2000,5000,10000,20000])for(const f0 of [100,200,1000,10000])for(const gain of [-18,-6,0,6,18])for(const q of [.1,1,10])curve('biquadMagDb',[type,f,f0,gain,q]);
for(let input=-60;input<=0;input+=.5)for(const threshold of [-60,-36,-24,0])for(const ratio of [1,4,20])for(const knee of [0,10,30,40])curve('compTransferDb',[input,threshold,ratio,knee]);
if(!curveCount)throw Error('Empty curve comparison');
console.log('PASS '+curveCount+' EQ/compressor graph comparisons against TrackEffectsPanel.tsx (relative tolerance 1e-9)');
