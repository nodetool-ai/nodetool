// The checked-in resource is generated from the web sources, never by hand.
import { build, root } from './oracleTools.mjs';
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import assert from 'node:assert/strict';
const outputDir = path.resolve(process.argv[2]);
const outfile = path.join(outputDir, 'w-reference.mjs');
await build({stdin:{contents:`
import * as constants from './web/src/components/timeline/Tracks/trackEffectsConstants.ts';
import {paletteDark} from './web/src/components/themes/paletteDark.ts';
import {makeTrackEffect} from './packages/timeline/src/defaults.ts';
import {makeFableEffect,FABLE_FX_KINDS} from './web/src/components/timeline/daw/fx/fableFxParams.ts';
export {constants,makeTrackEffect,makeFableEffect,FABLE_FX_KINDS,paletteDark};`,resolveDir:root},
 outfile,bundle:true,platform:'node',format:'esm',plugins:[{name:'timeline-exports',setup(b){
 b.onResolve({filter:/^@nodetool-ai\/timeline$/},()=>({path:'timeline',namespace:'oracle'}));
 b.onLoad({filter:/.*/,namespace:'oracle'},()=>({contents:`export {createTimeOrderedUuid} from './packages/timeline/src/defaults.ts'; export {FABLE_EFFECT_KINDS} from './packages/timeline/src/types.ts';`,resolveDir:root}));
 }}]});
const ts = await import(pathToFileURL(outfile));
const defaults = {};
for (const type of Object.keys(ts.constants.DEVICE_WIDTHS)) {
 const effect = ts.makeTrackEffect(type); delete effect.id; defaults[type] = effect;
}
const fableDefaults = {};
for (const kind of ts.FABLE_FX_KINDS) {
 const effect = ts.makeFableEffect(kind); delete effect.id; fableDefaults[kind] = effect;
}
const strings = JSON.parse(readFileSync(path.join(root,'web/src/i18n/locales/en.json'),'utf8'))['i18n-cont-music-09'].effects;
const reference = {palette:{grey400:ts.paletteDark.grey[400],grey600:ts.paletteDark.grey[600],primaryContrast:ts.paletteDark.primary.contrastText,primaryDark:ts.paletteDark.primary.dark},defaults, fableDefaults, strings, widths:ts.constants.DEVICE_WIDTHS,
 fableWidths:ts.constants.FABLE_DEVICE_WIDTHS, knobs:ts.constants.KNOBS,
 audioTypes:ts.constants.AUDIO_EFFECT_TYPES, videoTypes:ts.constants.VIDEO_EFFECT_TYPES, fableKinds:ts.FABLE_FX_KINDS};
const target = path.join(root,'native/timeline/src/wiring/w/TrackEffectsReference.json');
if (process.argv.includes('--write')) writeFileSync(target,JSON.stringify(reference,null,2)+'\n');
else assert.deepEqual(JSON.parse(readFileSync(target,'utf8')),reference,'Track effects resource differs from the web sources');
assert(Object.keys(reference.defaults).length && Object.keys(reference.fableDefaults).length,'Empty reference');
console.log('PASS track effect defaults, metadata and wording match TypeScript');
