import { createServer } from "node:http";
import { readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "@playwright/test";
import { build } from "esbuild";

/** Explicit selfcheck: callers must build/stage real native artifacts first. Missing artifacts fail. */
export async function checkNativeBrowserHost(runtimeDirectory, reportPath) {
  const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
  const fixtures = await build({ stdin: { resolveDir: packageRoot, sourcefile: "native-browser-host-selfcheck.ts", contents: `
    import { createNativeBrowserSession, createNativeIndexedDbSaveStorage, NativeJsonSaveHost, NativeBrowserInput } from '@nodetool-ai/game-runtime/native-browser';
    import { nativeGameDocument, nativeFrame } from '@nodetool-ai/protocol/native-game';
    const assert=(condition,message)=>{if(!condition)throw new Error(message);};
    window.nativeHostSelfcheck=async()=>{
      const reports=[];
      for(const dimension of ['2d','3d']){
        const source='i=>({commands:i.tick===0?[{kind:"save",scope:"progress",slot:"slot",data:{value:3}},{kind:"save",scope:"settings",slot:"slot",data:{value:4}},{kind:"load",scope:"progress",slot:"slot"},{kind:"load",scope:"settings",slot:"slot"}]:(i.input.loaded||[]).map(r=>({kind:"score",amount:r.data.value}))})';
        const actor=dimension==='2d'?{id:'actor',body2d:{type:'kinematic',gravityScale:0},collider2d:{width:1,height:1},behaviors:[{id:'behavior',scriptId:'script'}]}:{id:'actor',behaviors:[{id:'behavior',scriptId:'script'}]};
        const document=nativeGameDocument.parse({engine:'native-cpp-1',schemaVersion:dimension==='2d'?5:4,dimension,id:'browser-selfcheck-'+dimension,title:'Real browser host selfcheck',initialSceneId:'scene',scenes:[{id:'scene',entities:[actor]}],scripts:[{id:'script',source}]});
        const options={workerUrl:new URL('/worker.js',location.href),moduleUrl:new URL('/native-game.mjs',location.href),wasmUrl:new URL('/native-game.wasm',location.href)};
        const session=await createNativeBrowserSession(options);let sequence=0;
        const request=async(operation,extra={},sessionId='live')=>{
          const response=await session.request({protocolVersion:1,requestId:'host-'+sequence++,operation,...(operation==='hello'?{}:{sessionId}),...extra});
          if(response.status==='error')throw new Error(response.error.message);return response.result;
        };
        const storage=await createNativeIndexedDbSaveStorage({gameId:document.id,engineContract:document.engine,databaseName:'native-host-'+dimension});
        let reads=0,writes=0;
        const counted={persistence:'durable',read:async(...args)=>{reads++;return storage.read(...args);},write:async(...args)=>{writes++;return storage.write(...args);}};
        try{
          await request('hello');await request('open',{document});await session.releaseAssets();
          const initial=nativeFrame.parse(await request('start',{seed:17}));
          const snapshot=await request('snapshot');const host=new NativeJsonSaveHost(counted);host.reset(initial.generation);
          const inputs=[],frames=[];const input=new NativeBrowserInput(dimension);
          input.set('right',true);
          for(let tick=0;tick<4;tick++){
            const value={...input.sample(),loaded:host.takeLoaded(initial.generation)};inputs.push(value);
            const frame=nativeFrame.parse(await request('step',{input:value}));frames.push(frame);
            host.consume(frame.hostRequests,frame.generation);await host.drain();
          }
          assert(frames.length===4&&frames[3].score===7,'Recorded JSON load delivery did not affect actual native scripts');
          assert(reads===2&&writes===2,'Committed IO was duplicated or omitted');
          assert(inputs[0].loaded.length===0&&inputs[1].loaded.length===2,'Loads did not enter the later recorded tick');
          assert(inputs[1].loaded[0].scope==='progress'&&inputs[1].loaded[0].data.value===3&&inputs[1].loaded[1].scope==='settings'&&inputs[1].loaded[1].data.value===4,'Load ordering or scope separation changed');
          const restored=nativeFrame.parse(await request('restore',{snapshot}));
          const replay=new NativeJsonSaveHost(counted,{replay:true});replay.reset(restored.generation);
          const comparable=frame=>JSON.stringify({tick:frame.tick,entities:frame.entities,score:frame.score,events:frame.events});
          for(let tick=0;tick<inputs.length;tick++){
            const frame=nativeFrame.parse(await request('step',{input:inputs[tick]}));replay.consume(frame.hostRequests,frame.generation);
            assert(comparable(frame)===comparable(frames[tick]),'Recorded-input replay diverged at tick '+tick);
          }
          await replay.drain();assert(reads===2&&writes===2,'Replay performed external IO');
          const foreign=await createNativeBrowserSession(options);
          try{
            const send=(operation,extra={})=>foreign.request({protocolVersion:1,requestId:'foreign-'+sequence++,operation,sessionId:'live',...extra});
            assert((await send('open',{document})).status==='ok','Foreign fixture open failed');
            assert((await send('start')).status==='ok','Foreign fixture start failed');
            const rejected=await send('restore',{snapshot});assert(rejected.status==='error','Foreign live-instance snapshot was accepted');
          }finally{await foreign.close();}
          const rollback=nativeGameDocument.parse({...document,id:'rollback-'+dimension,scripts:[{id:'script',source:'i=>({commands:[{kind:"save",scope:"progress",slot:"bad",data:{value:9}},{kind:"invalid"}]})'}]});
          await request('open',{document:rollback},'rollback');await request('start',{},'rollback');
          const failure=await session.request({protocolVersion:1,requestId:'rollback-'+sequence++,operation:'step',sessionId:'rollback',input:input.sample()});
          assert(failure.status==='error','Invalid command did not roll back its tick');
          const unchanged=nativeFrame.parse(await request('frame',{},'rollback'));
          assert(unchanged.tick===0&&unchanged.hostRequests.length===0,'Failed tick leaked a storage request');
          assert(await storage.read('progress','bad')===null,'Failed tick wrote durable progress');
          storage.close();
          const reopened=await createNativeIndexedDbSaveStorage({gameId:document.id,engineContract:document.engine,databaseName:'native-host-'+dimension});
          try{assert((await reopened.read('progress','slot')).data.value===3,'Durable JSON progress did not reopen');}finally{reopened.close();}
          reports.push({dimension,fixtureTicks:frames.length,replayedTicks:inputs.length,reads,writes,foreignSnapshotRejected:true,failedTickRolledBack:true,metrics:session.metrics()});
        }finally{storage.close();await session.close();}
      }
      assert(reports.length===2,'Native browser fixture discovery was empty');
      const exhausted=await createNativeBrowserSession({workerUrl:new URL('/worker.js',location.href),moduleUrl:new URL('/oom-module.mjs',location.href),wasmUrl:new URL('/native-game.wasm',location.href)});
      try{
        const limited=await exhausted.request({protocolVersion:1,requestId:'heap-oom',operation:'hello'});
        assert(limited.requestId==='heap-oom'&&limited.status==='error'&&limited.error.code==='resource_limit'&&limited.error.message==='Interface memory budget exhausted','Full WASM heap did not deliver the static resource_limit error to its caller');
        const recovered=await exhausted.request({protocolVersion:1,requestId:'heap-recovered',operation:'hello'});
        assert(recovered.status==='ok','Recoverable interface allocation failure lost the live dispatcher');
        reports.push({fixture:'full-heap-wire-error',resourceLimitCorrelated:true,dispatcherRecovered:true,metrics:exhausted.metrics()});
      }finally{await exhausted.close();}
      return reports;
    };
  ` }, bundle: true, conditions: ["nodetool-dev"], platform: "browser", format: "esm", write: false, logLevel: "silent" });
  const worker = await build({ entryPoints: [resolve(packageRoot, "../game-runtime/src/native-browser/worker.ts")],
    bundle: true, conditions: ["nodetool-dev"], platform: "browser", format: "esm", write: false, logLevel: "silent" });
  const javascript = fixtures.outputFiles?.[0]?.contents, workerBytes = worker.outputFiles?.[0]?.contents;
  if (!javascript || !workerBytes) { throw new Error("Native host selfcheck did not bundle both entry points"); }
  const module = await readFile(resolve(runtimeDirectory, "native-game.mjs"));
  const wasm = await readFile(resolve(runtimeDirectory, "native-game.wasm"));
  if (!module.length || !wasm.length) { throw new Error("Real native browser artifacts must be nonempty"); }
  // Test-only wrapper exhausts the real production heap after the adapter allocates its request.
  // Free the blocks after dispatch so the caller can prove this error remains recoverable.
  const oomModule = new TextEncoder().encode(`import createModule from '/native-game.mjs';export default async options=>{
    const module=await createModule(options),dispatch=module._ng_dispatch;let exhaust=true;
    module._ng_dispatch=(...args)=>{
      if(!exhaust)return dispatch(...args);exhaust=false;const allocated=[];
      try{for(let size=16*1024*1024;size>=1;size=Math.floor(size/2)){
        for(;;){const pointer=module._malloc(size);if(!pointer)break;allocated.push(pointer);}
      }return dispatch(...args);}finally{for(const pointer of allocated)module._free(pointer);}
    };return module;
  };`);
  const files = new Map([["/owner.js", javascript], ["/worker.js", workerBytes], ["/native-game.mjs", module], ["/native-game.wasm", wasm], ["/oom-module.mjs", oomModule]]);
  const paths = new Set();
  const server = createServer((request, response) => {
    const path = request.url ?? "/"; paths.add(path);
    response.setHeader("cache-control", "no-store");
    if (files.has(path)) { response.setHeader("content-type", path.endsWith(".wasm") ? "application/wasm" : "text/javascript"); response.end(files.get(path)); }
    else if (path === "/") { response.setHeader("content-type", "text/html"); response.end('<script type="module" src="/owner.js"></script>'); }
    else { response.statusCode = 404; response.end(); }
  });
  let browser;
  try {
    await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
    const address = server.address(); if (!address || typeof address === "string") { throw new Error("Native host selfcheck server did not bind"); }
    browser = await chromium.launch({ headless: true, chromiumSandbox: true });
    const page = await browser.newPage(); await page.goto(`http://127.0.0.1:${address.port}`);
    await page.waitForFunction(() => typeof window.nativeHostSelfcheck === "function");
    const fixtures = await page.evaluate(() => window.nativeHostSelfcheck());
    const expected = ["/", "/native-game.mjs", "/native-game.wasm", "/oom-module.mjs", "/owner.js", "/worker.js"];
    const actual = [...paths].filter((path) => path !== "/favicon.ico").sort();
    if (JSON.stringify(actual) !== JSON.stringify(expected)) { throw new Error(`Native host selfcheck fetched undeclared paths: ${JSON.stringify(actual)}`); }
    const report = { browser: browser.version(), fixtures, networkPaths: actual,
      memoryMeasurement: "Observed WASM linear-memory extent after startup/dispatch, not live C++ allocations or GPU memory" };
    if (reportPath) { await writeFile(reportPath, JSON.stringify(report, null, 2) + "\n"); }
    return report;
  } finally {
    await browser?.close(); await new Promise((resolve) => server.close(resolve));
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const directory = process.argv[2];
  if (!directory) { throw new Error("Pass the directory containing built native-game.mjs and native-game.wasm"); }
  console.log(JSON.stringify(await checkNativeBrowserHost(resolve(directory), process.argv[3]), null, 2));
}
