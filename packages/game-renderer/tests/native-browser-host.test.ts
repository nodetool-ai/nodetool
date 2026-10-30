import { createServer } from "node:http";
import { chromium } from "@playwright/test";
import { build } from "esbuild";
import { expect, it } from "vitest";

declare global {
  interface Window {
    verifyNativeHost: () => Promise<{ persisted: boolean; slotLimit: boolean; scopeSeparated: boolean; lostSession: boolean; closedRequests: boolean; inputBindings: boolean; imageSources: boolean }>;
  }
}

it("owns a real browser worker, persists JSON saves across reload, and terminates an in-flight dispatch", async () => {
  const bundles = await Promise.all([
    build({ stdin: { resolveDir: process.cwd(), sourcefile: "native-browser-host-control.ts", contents: `
      import { createNativeBrowserSession, createNativeIndexedDbSaveStorage, NativeBrowserInput, attachNativeBrowserInput, resolveNativeModelImage } from '@nodetool-ai/game-runtime/native-browser';
      import { createNativeAssetBroker } from './src/native-cpp/assets.ts';
      window.verifyNativeHost = async () => {
        const encoded=new Uint8Array([137,80,78,71,13,10,26,10]),modelBytes=new Uint8Array([1]);
        const hash=async(bytes)=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),v=>v.toString(16).padStart(2,'0')).join('');
        const imageDigest=await hash(encoded);let imageReads=0;
        const broker=createNativeAssetBroker({assets:[{id:'model',kind:'model',path:'model.glb',size:1,digest:await hash(modelBytes),dependencies:['image']},
          {id:'image',kind:'image',path:'image.png',size:encoded.length,digest:imageDigest,dependencies:[]}],fetchBytes:async(path)=>{imageReads++;return path==='image.png'?encoded:modelBytes;}});
        const descriptor={mimeType:'image/png',source:{assetId:'image',offset:0,length:encoded.length,digest:imageDigest}};
        let unverified=false;try{await resolveNativeModelImage(descriptor,'model',broker);}catch{unverified=true;}
        const noEarlyFetch=imageReads===0;await broker.get('image');
        const resolved=await resolveNativeModelImage(descriptor,'model',broker);resolved.bytes[0]=0;
        const owned=broker.verifiedRange('image',0,1)[0]===137;
        broker.release('image');let releasedSource=false;try{await resolveNativeModelImage(descriptor,'model',broker);}catch{releasedSource=true;}
        const imageSources=unverified&&noEarlyFetch&&owned&&releasedSource&&imageReads===1;broker.dispose();
        const canvas=document.createElement('canvas');document.body.append(canvas);
        const input=new NativeBrowserInput('2d'),binding=attachNativeBrowserInput(input,canvas,[{action:'fire',binding:'touch'}]);
        canvas.dispatchEvent(new KeyboardEvent('keydown',{code:'KeyA'}));
        canvas.dispatchEvent(new KeyboardEvent('keydown',{code:'ArrowLeft'}));
        window.dispatchEvent(new KeyboardEvent('keyup',{code:'KeyA'}));
        const held=input.sample().actions.left===true;
        window.dispatchEvent(new KeyboardEvent('keyup',{code:'ArrowLeft'}));
        const released=input.sample().actions.left===false;
        canvas.dispatchEvent(new TouchEvent('touchstart'));
        const touched=input.sample().actions.fire===true;
        canvas.dispatchEvent(new TouchEvent('touchcancel'));
        const cancelled=input.sample().actions.fire===false;
        canvas.dispatchEvent(new TouchEvent('touchstart'));canvas.dispatchEvent(new TouchEvent('touchend'));
        const tapped=input.sample().actions.fire===true&&input.sample().actions.fire===false;
        canvas.dispatchEvent(new KeyboardEvent('keydown',{code:'Space'}));window.dispatchEvent(new Event('blur'));
        const blurred=input.sample().jump===false;
        binding.dispose();canvas.remove();const inputBindings=held&&released&&touched&&cancelled&&tapped&&blurred;
        const storage = await createNativeIndexedDbSaveStorage({gameId:'full-game-id',engineContract:'native-cpp-1'});
        const previous = await storage.read('progress','saved');
        await storage.write('progress','saved',{formatVersion:1,data:{value:42}});
        const scopeSeparated = (await storage.read('settings','saved')) === null;
        let slotLimit = false;
        for (let i=0;i<15;i++) await storage.write('progress','slot'+i,{formatVersion:1,data:{}});
        try { await storage.write('progress','extra',{formatVersion:1,data:{}}); } catch { slotLimit = true; }
        storage.close();
        const session = await createNativeBrowserSession({workerUrl:new URL('/worker.js',location.href),
          moduleUrl:new URL('/module.mjs',location.href),wasmUrl:new URL('/module.wasm',location.href),requestTimeoutMs:2000});
        const result = await session.request({protocolVersion:1,requestId:'first',operation:'close',sessionId:'fixture'});
        if(result.status !== 'ok') throw new Error('Worker response did not cross the typed seam');
        const controller = new AbortController();
        const pending = session.request({protocolVersion:1,requestId:'block',operation:'hello'},controller.signal);
        setTimeout(()=>controller.abort(),20);
        let lostSession = false;
        try { await pending; } catch(error) { lostSession = error.code === 'session_lost'; }
        let closedRequests = false;
        try { await session.request({protocolVersion:1,requestId:'later',operation:'hello'}); } catch(error) { closedRequests = error.code === 'closed'; }
        await session.close();
        return {persisted:previous?.data.value===42,slotLimit,scopeSeparated,lostSession,closedRequests,inputBindings,imageSources};
      };
    ` }, bundle: true, conditions: ["nodetool-dev"], platform: "browser", format: "esm", write: false, logLevel: "silent" }),
    build({ entryPoints: ["../game-runtime/src/native-browser/worker.ts"], bundle: true, conditions: ["nodetool-dev"], platform: "browser", format: "esm", write: false, logLevel: "silent" })
  ]);
  const owner = bundles[0].outputFiles?.[0]?.contents, worker = bundles[1].outputFiles?.[0]?.contents;
  if (!owner || !worker) { throw new Error("Native browser host test did not bundle both entry points"); }
  // The transport fixture implements the C ABI in JS. Real WASM admission has its own core/export fixture.
  const module = `export default async function() {
    const HEAPU8=new Uint8Array(65536),encoder=new TextEncoder(),decoder=new TextDecoder();let length=0;
    return {HEAPU8,_malloc:()=>8,_free:()=>{},_ng_create:()=>1,_ng_destroy:()=>{},
      _ng_dispatch:(context,pointer,size)=>{const request=JSON.parse(decoder.decode(HEAPU8.slice(pointer,pointer+size)));
        if(request.requestId==='block') while(true){}
        const bytes=encoder.encode(JSON.stringify({protocolVersion:1,requestId:request.requestId,status:'ok',result:{closed:true}}));
        HEAPU8.set(bytes,32768);length=bytes.length;return 0;},_ng_response_pointer:()=>32768,_ng_response_length:()=>length,
      FS:{mkdirTree(){},writeFile(){},unlink(){}}};
  }`;
  const requests = new Set<string>();
  const server = createServer((request, response) => {
    const path = request.url ?? "/"; requests.add(path);
    response.setHeader("cache-control", "no-store");
    if (path === "/owner.js" || path === "/worker.js" || path === "/module.mjs") {
      response.setHeader("content-type", "text/javascript"); response.end(path === "/owner.js" ? owner : path === "/worker.js" ? worker : module);
    } else if (path === "/") {
      response.setHeader("content-type", "text/html"); response.end('<script type="module" src="/owner.js"></script>');
    } else { response.statusCode = 404; response.end(); }
  });
  let browser: Awaited<ReturnType<typeof chromium.launch>> | undefined;
  try {
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    const address = server.address(); if (!address || typeof address === "string") { throw new Error("Native host fixture did not bind"); }
    browser = await chromium.launch({ headless: true, chromiumSandbox: true });
    const page = await browser.newPage(); await page.goto(`http://127.0.0.1:${address.port}`);
    await page.waitForFunction(() => typeof window.verifyNativeHost === "function");
    expect(await page.evaluate(() => window.verifyNativeHost())).toEqual({persisted:false,slotLimit:true,scopeSeparated:true,lostSession:true,closedRequests:true,inputBindings:true,imageSources:true});
    await page.reload(); await page.waitForFunction(() => typeof window.verifyNativeHost === "function");
    expect(await page.evaluate(() => window.verifyNativeHost())).toEqual({persisted:true,slotLimit:true,scopeSeparated:true,lostSession:true,closedRequests:true,inputBindings:true,imageSources:true});
    expect([...requests].filter((path) => path !== "/favicon.ico").sort()).toEqual(["/", "/module.mjs", "/owner.js", "/worker.js"]);
  } finally {
    await browser?.close(); await new Promise<void>((resolve) => server.close(() => resolve()));
  }
}, 30_000);
