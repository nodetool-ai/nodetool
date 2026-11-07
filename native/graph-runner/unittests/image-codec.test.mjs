import { Buffer } from 'buffer';
import { loadSharp } from '../guest/host/sharp.mjs';
import { LIB_IMAGE_DRAW_NODES } from '@nodetool-ai/image-nodes/nodes/lib-image-draw';
globalThis.Buffer = Buffer;
let checks = 0;
function equal(a,b,label) {
  checks++;
  if (a.length !== b.length || a.some((v,i) => v !== b[i])) throw new Error(`${label}: ${JSON.stringify([...a])} != ${JSON.stringify(b)}`);
}
function check(value, label) { checks++; if (!value) throw new Error(label); }
try {
  const sharp = await loadSharp();
  for (const f of JSON.parse(fixtureJson)) {
    if (f.textBase && !globalThis.skipText) {
      const Text = LIB_IMAGE_DRAW_NODES.find(c => c.nodeType === 'lib.image.draw.RenderText');
      const node = new Text({id:'text'});
      node.image = {type:'image',data:new Uint8Array(f.textBase),mimeType:'image/png'};
      node.text = 'Ab<&'; node.size = 12;
      const output = await node.process();
      equal(await sharp(Buffer.from(output.output.data,'base64')).ensureAlpha().raw().toBuffer(),f.textExpected,'real RenderText');
    }
    const base = new Uint8Array(f.base), foreground = new Uint8Array(f.foreground), mask = new Uint8Array(f.mask);
    const Mask = LIB_IMAGE_DRAW_NODES.find(c => c.nodeType === 'lib.image.Mask');
    const node = new Mask({id:'mask'});
    const ref = data => ({type:'image',data,mimeType:'image/png'});
    node.image1 = ref(base); node.image2 = ref(foreground); node.mask = ref(mask);
    const result = await node.process();
    equal((await sharp(Buffer.from(result.output.data,'base64')).ensureAlpha().raw().toBuffer()), f.expected, 'real Mask');
    equal(await sharp(mask).resize(f.w,f.h,{fit:'fill'}).greyscale().raw().toBuffer(),f.grey,'greyscale resize');
    equal(await sharp(foreground).resize(f.w,f.h,{fit:'fill'}).ensureAlpha().raw().toBuffer(),f.resized,'alpha resize');
    const webp = new Uint8Array(f.webp);
    equal(__host.image.decode(webp).rgba, f.webpRaw,'WebP decode');
    equal(__host.image.decode(new Uint8Array(f.lossy)).rgba, f.lossyRaw, 'lossy WebP decode');
    const meta = await sharp(webp).metadata();
    check(meta.width === f.w && meta.height === f.h && meta.format === 'webp' && meta.channels === 4,'WebP metadata');
    const encoded = await sharp(base).webp({lossless:true}).toBuffer();
    equal(await sharp(encoded).ensureAlpha().raw().toBuffer(), f.webpRaw, 'WebP encode');
    const tile = await sharp(base).extract({left:0,top:0,width:1,height:1}).ensureAlpha().raw().toBuffer();
    equal(tile, (await sharp(base).ensureAlpha().raw().toBuffer()).slice(0,4), 'tile');
  }
  const opaque = new Uint8Array([255,0,12,255, 2,255,90,255]);
  const rgbPng = await sharp(opaque,{raw:{width:2,height:1,channels:4}}).removeAlpha().png().toBuffer();
  check((await sharp(rgbPng).metadata()).channels === 3,'opaque RGB channel contract');
  equal(await sharp(rgbPng).ensureAlpha().raw().toBuffer(), opaque, 'opaque alpha insertion');
  const blank = await sharp({create:{width:2,height:3,channels:4,background:{r:0,g:0,b:0,alpha:0}}}).png().toBuffer();
  equal(await sharp(blank).ensureAlpha().raw().toBuffer(), new Uint8Array(24), 'transparent blank');
  let fileError;
  try { const meta = await sharp(fixturePath).metadata(); check(granted && meta.width === 3, 'granted metadata'); } catch (error) { fileError = error; }
  check(granted ? !fileError : fileError?.code === 'EACCES', 'file metadata default deny');
  for (const path of ['/etc/passwd', '../outside.png', 'escape.png']) {
    let denied = false; try { await sharp(path).metadata(); } catch (error) { denied = error.code === 'EACCES'; } check(denied,'path escape denied');
  }
  for (const run of [
    () => sharp(new Uint8Array()).raw().toBuffer(),
    () => sharp(new Uint8Array([1,2,3])).raw().toBuffer(),
    () => sharp({create:{width:65535,height:65535,channels:4,background:{r:0,g:0,b:0,alpha:0}}}).png().toBuffer(),
    () => sharp(new Uint8Array([1]),{raw:{width:1,height:1,channels:4}}).raw().toBuffer(),
    () => sharp(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><image href="file:///etc/passwd"/></svg>')).png().toBuffer()
  ]) {
    let failed = false; try { await run(); } catch { failed = true; } check(failed,'invalid image rejected');
  }
  globalThis.testResult = `PASS ${checks} checks`;
} catch (error) { globalThis.testResult = String(error) + "\n" + error.stack; }
