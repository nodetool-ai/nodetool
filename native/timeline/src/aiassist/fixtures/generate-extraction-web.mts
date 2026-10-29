import { buildScriptFromTimeline } from '../../../../../web/src/components/script/extractScript.ts';
import { writeFileSync } from 'node:fs';
const fixedDate = new Date('2023-11-14T22:13:20.000Z');
const OriginalDate = Date;
class FixedDate extends OriginalDate {
  constructor(...args: [] | [string | number | Date]) { super(args.length ? args[0] as string : fixedDate.getTime()); }
  static now() { return fixedDate.getTime(); }
}
globalThis.Date = FixedDate as DateConstructor;
const clips = [
 {id:'last', startMs:9000, durationMs:1000,sourceType:'generated', bindingKind:'text-to-audio', prompt:'A draft line',speaker:' Alice '},
 {id:'a',startMs:0,durationMs:1000,sourceType:'imported',currentAssetId:'audio-a',speaker:' Alice ',caption:{words:[{word:'Hello',startMs:0,endMs:500,kind:'word'},{word:'there',startMs:500,endMs:1000}]}},
 {id:'music',startMs:0,durationMs:10000,sourceType:'imported'},
 {id:'b',startMs:2000,durationMs:1000,sourceType:'imported',paragraphId:'joined',currentAssetId:'audio-b',speaker:'Bob',caption:{words:[{word:'Two',startMs:0,endMs:1000}]}},
 {id:'c',startMs:3000,durationMs:1000,sourceType:'imported',paragraphId:'joined',currentAssetId:'audio-c',speaker:'Other',caption:{words:[{word:'pieces',startMs:0,endMs:1000}]}},
 {id:'empty',startMs:8000,durationMs:500,sourceType:'imported',caption:{words:[]}}
];
const expected = buildScriptFromTimeline(clips as never);
const normalized = JSON.parse(JSON.stringify(expected).replaceAll(fixedDate.getTime().toString(36), 'fixed'));
writeFileSync(new URL('./extraction-web.json', import.meta.url), JSON.stringify({clips, expected:normalized},null,2)+'\n');
