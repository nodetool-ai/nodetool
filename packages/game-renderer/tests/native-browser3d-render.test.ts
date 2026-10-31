import { createHash } from "node:crypto";
import { native3DConformanceFixture } from "./fixtures/nativeBrowser3DConformance.js";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { mkdtemp, writeFile } from "node:fs/promises";
import { chromium } from "@playwright/test";
import { build } from "esbuild";
import { expect, it } from "vitest";

it("renders native primitives, seeks frames, resizes and restores an actual lost WebGL context", async () => {
  const fixture = native3DConformanceFixture();
  const modelEntry = {
    id: "model",
    kind: "model",
    path: "model.glb",
    dependencies: [],
    size: fixture.bytes.length,
    digest: createHash("sha256").update(fixture.bytes).digest("hex")
  };
  const bundle = await build({
    stdin: {
      resolveDir: resolve("."),
      contents: `
    import {createNativeRenderer3D} from './src/native-cpp/renderer3d.ts';
    import {nativeFrame3D} from '@nodetool-ai/protocol/native-game';
    import {createNativeAssetBroker} from './src/native-cpp/assets.ts';
    const fixtureModel=${JSON.stringify(fixture.prepared)};const fixtureBytes=new Uint8Array(${JSON.stringify(Array.from(fixture.bytes))});
    window.runNative3D = async () => {
      const canvas=document.createElement('canvas');document.body.append(canvas);
      let losses=0, restores=0;
      const assets=createNativeAssetBroker({assets:[${JSON.stringify(modelEntry)}],fetchBytes:async()=>fixtureBytes});await assets.get('model');
      const owner=await createNativeRenderer3D({canvas,assets,prepareModel:async()=>fixtureModel,onContextLost(){losses++},onContextRestored(){restores++}});
      const frame=nativeFrame3D.parse({dimension:'3d',tick:0,generation:0,sceneId:'scene',events:[],presentationEvents:[],hostRequests:[],queryResults:[],music:[],score:0,health:100,logs:[],hud:[],lighting:{},backgrounds:[],camera:{position:[4,3,6],target:[0,0,0],fov:60},entities:[{id:'imported',transform:{position:[0,-2,0]},visual:{kind:'model',assetId:'model'}},
        {id:'box',visual:{kind:'primitive',shape:'box',size:[1,2,1],color:[1,.2,.1,1]}},
        {id:'ball',transform:{position:[-2,0,0]},visual:{kind:'primitive',shape:'sphere',size:[1,1,1],color:[.1,1,.2,1]}},
        {id:'pill',transform:{position:[2,0,0]},visual:{kind:'primitive',shape:'capsule',size:[1,1,1],color:[.2,.1,1,1]}}
      ]});
      const gl=canvas.getContext('webgl2'),originalFinish=gl.finish.bind(gl);let finishes=0;gl.finish=()=>{finishes++;originalFinish()};
      owner.resize(192,128);owner.render(frame);owner.render(frame);
      const capture=()=>{const c=document.createElement('canvas');c.width=canvas.width;c.height=canvas.height;const ctx=c.getContext('2d');ctx.drawImage(canvas,0,0);return Array.from(ctx.getImageData(0,0,c.width,c.height).data)};
      let budgetRejected=false;try{owner.render({...frame,entities:Array.from({length:500},(_,index)=>({...frame.entities[2],id:"budget"+index}))})}catch(error){budgetRejected=String(error).includes("vertex budget")}if(!budgetRejected)throw Error("Native vertex budget was not enforced");owner.render(frame);
      if(finishes!==0)throw Error("Live rendering forced GPU completion");owner.finishFrame();if(finishes!==1)throw Error("GPU completion seam did not synchronize");
      const initial=capture(); const initialPNG=canvas.toDataURL(); const firstStats={...owner.stats};
      owner.render({...frame,tick:60});const animated=capture();owner.render(frame);
      const sought=capture();
      owner.render({...frame,camera:{position:[0,1.6,4],target:[0,1.6,0],fov:75}});const firstPerson=capture();
      owner.render({...frame,camera:{position:[0,1.6,4],target:[2,1.6,0],fov:75}});const firstPersonTurned=capture();
      owner.render({...frame,camera:{position:[0,1.6,4],target:[0,1.6,0],fov:45}});const firstPersonZoomed=capture();owner.render(frame);const cameraReturned=capture();
      owner.render({...frame,camera:{...frame.camera,near:20,far:100}});const nearClipped=capture();
      owner.render({...frame,camera:{...frame.camera,near:.05,far:1}});const farClipped=capture();owner.render(frame);const clipReturned=capture();
      owner.render({...frame,camera:{}});const defaultCamera=capture();owner.render({...frame,camera:{...frame.camera,near:20,far:100}});owner.render({...frame,camera:{}});const defaultClipReturned=capture();owner.render(frame);
      const warmPrograms=owner.stats.programs;for(let count=0;count<3;count++){owner.render({...frame,entities:[]});owner.render(frame);}if(owner.stats.programs!==warmPrograms)throw Error("Native programs grew after reload");
      const extension=gl.getExtension('WEBGL_lose_context');
      if(!extension)throw Error('WebGL context-loss fixture capability unavailable');
      extension.loseContext(); await new Promise(resolve=>canvas.addEventListener('webglcontextlost',resolve,{once:true}));
      let lostFinishRejected=false;try{owner.finishFrame()}catch{lostFinishRejected=true}if(!lostFinishRejected)throw Error("GPU completion accepted lost context");
      owner.render(frame); await new Promise(resolve=>setTimeout(resolve,100)); extension.restoreContext(); await new Promise(resolve=>canvas.addEventListener('webglcontextrestored',()=>setTimeout(resolve,20),{once:true}));
      owner.render(frame);const restored=capture();
      owner.resize(96,64,2);owner.render(frame); const resized=[canvas.width,canvas.height];
      const stats={...owner.stats};owner.dispose();owner.dispose();
      let closed=false;try{owner.render(frame)}catch{closed=true}
      let closedFinishRejected=false;try{owner.finishFrame()}catch{closedFinishRejected=true}if(!closedFinishRejected||finishes!==1)throw Error("GPU completion lifecycle guard failed")
      return {initialPNG,initial,animated,sought,firstPerson,firstPersonTurned,firstPersonZoomed,cameraReturned,nearClipped,farClipped,clipReturned,defaultCamera,defaultClipReturned,restored,losses,restores,firstStats,stats,resized,closed};
    };
  `
    },
    bundle: true,
    platform: "browser",
    format: "iife",
    write: false,
    conditions: ["nodetool-dev"]
  });
  const browser = await chromium.launch({
    headless: true,
    chromiumSandbox: true,
    args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader"]
  });
  try {
    const page = await browser.newPage({
      viewport: { width: 220, height: 160 },
      deviceScaleFactor: 1
    });
    await page.route("**/*", (route) =>
      route.request().url() === "http://127.0.0.1/"
        ? route.fulfill({
            contentType: "text/html",
            body: "<!doctype html><body style='margin:0'>"
          })
        : route.abort()
    );
    page.on("console", (message) => console.info(message.text()));
    page.on("pageerror", (error) => console.info(error.message));
    await page.goto("http://127.0.0.1/");
    const output = bundle.outputFiles?.[0];
    if (!output) {
      throw new Error("Missing native browser3D bundle");
    }
    await page.addScriptTag({ content: output.text });
    const result = await page.evaluate(async () => {
      const run = Reflect.get(window, "runNative3D");
      return run();
    });
    expect(result.firstStats.entities).toBe(4);
    expect(result.firstStats.drawCalls).toBeGreaterThanOrEqual(3);
    expect(result.sought).toEqual(result.initial);
    expect(result.firstPerson).not.toEqual(result.initial);
    expect(result.firstPersonTurned).not.toEqual(result.firstPerson);
    expect(result.firstPersonZoomed).not.toEqual(result.firstPerson);
    expect(result.cameraReturned).toEqual(result.initial);
    expect(result.nearClipped).not.toEqual(result.initial);
    expect(result.farClipped).not.toEqual(result.initial);
    expect(result.clipReturned).toEqual(result.initial);
    expect(result.defaultClipReturned).toEqual(result.defaultCamera);
    expect(result.animated).not.toEqual(result.initial);
    expect(result.firstStats.textures).toBeGreaterThan(0);
    let changed = 0;
    for (let i = 0; i < result.initial.length; i++) {
      if (Math.abs(result.initial[i] - result.restored[i]) > 3) {
        changed++;
      }
    }
    expect(changed / result.initial.length).toBeLessThan(0.005);
    expect(result.losses).toBe(1);
    expect(result.restores).toBe(1);
    expect(result.resized).toEqual([192, 128]);
    expect(result.closed).toBe(true);
    expect(result.stats.programs).toBe(result.firstStats.programs);
    const artifacts = await mkdtemp(join(tmpdir(), "a84-native-browser3d-"));
    await writeFile(
      join(artifacts, "initial.png"),
      Buffer.from(result.initialPNG.split(",")[1], "base64")
    );
    await page.screenshot({
      path: join(artifacts, "restored.png")
    });
  } finally {
    await browser.close();
  }
});
