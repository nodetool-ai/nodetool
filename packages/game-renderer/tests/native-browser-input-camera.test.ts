import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { createHash } from "node:crypto";
import { chromium, type Page } from "@playwright/test";
import { build } from "esbuild";
import { expect, it } from "vitest";
import { nativeFrame3D, nativeRuntimeInput } from "@nodetool-ai/protocol/native-game";
import { z } from "zod";

const harness = `
import {nativeGame3dDocument,nativeFrame3D,nativeRuntimeResponse} from '@nodetool-ai/protocol/native-game';
import {NativeBrowserInput,attachNativeBrowserInput} from '../game-runtime/src/native-browser/input.ts';
import {NativeJsonSaveHost,createNativeMemorySaveStorage} from '../game-runtime/src/native-browser/saves.ts';
import {NativeWasmDispatcher} from '../game-runtime/src/native-browser/wasm.ts';
import {startNativeBrowserPlayer} from './src/native-cpp/player.ts';
window.initializeNativeInput=async(factory)=>{
 const module=await factory({locateFile:()=>location.origin+'/native-game.wasm'});
 const dispatcher=new NativeWasmDispatcher(module);let sequence=0;
 const request=(operation,extra={})=>{const response=nativeRuntimeResponse.parse(dispatcher.dispatch({protocolVersion:1,requestId:'input-'+(++sequence),sessionId:'input-camera',operation,...extra}));if(response.status!=='ok')throw new Error(JSON.stringify(response));return response.result;};
 const doc=nativeGame3dDocument.parse({engine:'native-cpp-1',schemaVersion:4,dimension:'3d',id:'pointer-camera',title:'Pointer camera',initialSceneId:'scene',camera:{kind:'firstPerson',targetId:'player',offset:[0,.65,0],yaw:0,pitch:0,sensitivity:.002,minPitch:-1.3,maxPitch:1.3,fov:78,near:.03,far:160},scenes:[{id:'scene',entities:[{id:'player'}]}]});
 request('open',{document:doc});const initial=nativeFrame3D.parse(request('start'));
 const input=new NativeBrowserInput('3d'),target=document.getElementById('input');
 const bindings=attachNativeBrowserInput(input,target,[]);let trustedMoves=0;
 target.addEventListener('pointermove',event=>{if(event.isTrusted&&event.buttons)trustedMoves++;});
 window.nativePointerStep=()=>{const sampled=input.sample(),frame=nativeFrame3D.parse(request('step',{input:sampled}));return {sampled,frame,trustedMoves};};
 window.nativeInputClear=(kind)=>{if(kind==='blur')window.dispatchEvent(new Event('blur'));else bindings.releaseAll();};
 window.nativeInputDispose=()=>{bindings.dispose();dispatcher.close();};
 window.startActualInputHost=async()=>{
  bindings.dispose();dispatcher.close();
  window.actualFrames=[];window.actualInputs=[];
  const player=await startNativeBrowserPlayer({canvas:target,hud:document.getElementById('hud'),status:document.getElementById('status'),baseUrl:location.origin+'/',onCommittedFrame:frame=>window.actualFrames.push(frame),onRecordedInput:entry=>window.actualInputs.push(entry)});
  window.nativeInputDispose=()=>player.dispose();
 };
 window.nativeGenerationSave=async()=>{
  request('close');
  const source="i=>({commands:i.tick===0?[{kind:'load',scope:'progress',slot:'one'},{kind:'save',scope:'progress',slot:'one',data:{value:7}}]:[{kind:'transition',sceneId:'next'}]})";
  const game=nativeGame3dDocument.parse({engine:'native-cpp-1',schemaVersion:4,dimension:'3d',id:'generation-write',title:'Generation write',initialSceneId:'scene',scripts:[{id:'save',source}],scenes:[{id:'scene',entities:[{id:'actor',behaviors:[{id:'save',scriptId:'save'}]}]},{id:'next',entities:[]}]});
  request('open',{document:game});request('start');
  const trace=[],memory=createNativeMemorySaveStorage();let finishRead;
  const delayed=new Promise(resolve=>{finishRead=resolve;});
  const host=new NativeJsonSaveHost({persistence:'durable',read:async()=>{trace.push('read');return delayed;},write:async(scope,slot,record)=>{trace.push('write');await memory.write(scope,slot,record);}});
  const first=nativeFrame3D.parse(request('step'));host.consume(first.hostRequests,first.generation);await Promise.resolve();
  const transitioned=nativeFrame3D.parse(request('step'));host.reset(transitioned.generation);host.consume(transitioned.hostRequests,transitioned.generation);
  finishRead(null);await host.drain();
  return {firstGeneration:first.generation,nextGeneration:transitioned.generation,scene:transitioned.sceneId,trace,record:await memory.read('progress','one'),loaded:host.takeLoaded(transitioned.generation)};
 };
 return initial;
};`;

async function withNativeInput(run: (page: Page, initial: z.infer<typeof nativeFrame3D>) => Promise<void>): Promise<void> {
  const directory = process.env.NATIVE_GAME_BROWSER_BUILD ?? resolve("dist");
  const [module, wasm] = await Promise.all([readFile(resolve(directory, "native-game.mjs")), readFile(resolve(directory, "native-game.wasm"))]);
  console.info(`Native input module SHA256 ${createHash("sha256").update(module).digest("hex")} WASM ${createHash("sha256").update(wasm).digest("hex")}`);
  const worker = await readFile(resolve("dist/native-game-worker.js"));
  const bundle = await build({ stdin: { contents: harness, resolveDir: resolve("."), sourcefile: "native-input-camera.ts" }, bundle: true, platform: "browser", format: "iife", write: false, conditions: ["nodetool-dev"] });
  const script = bundle.outputFiles[0];
  if (!script) { throw new Error("Missing native input harness"); }
  const browser = await chromium.launch({ headless: true, args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader"] });
  const page = await browser.newPage({ viewport: { width: 300, height: 200 }, deviceScaleFactor: 1 });
  try {
    await page.route("**/*", (route) => {
      const path = new URL(route.request().url()).pathname;
      if (path === "/native-game-worker.js") { return route.fulfill({ contentType: "text/javascript", body: worker }); }
      if (path === "/game.json") { return route.fulfill({ contentType: "application/json", body: JSON.stringify({engine:'native-cpp-1',schemaVersion:4,dimension:'3d',id:'paused-pointer',title:'Paused pointer',initialSceneId:'scene',camera:{kind:'firstPerson',targetId:'player',offset:[0,.65,0],yaw:0,pitch:0,sensitivity:.002,minPitch:-1.3,maxPitch:1.3,fov:78,near:.03,far:160},scenes:[{id:'scene',entities:[{id:'player'}]}]}) }); }
      if (path === "/native-game.mjs") { return route.fulfill({ contentType: "text/javascript", body: module }); }
      if (path === "/native-game.wasm") { return route.fulfill({ contentType: "application/wasm", body: wasm }); }
      if (path === "/") { return route.fulfill({ contentType: "text/html", body: '<!doctype html><style>body{margin:0}canvas{touch-action:none}</style><canvas id="input" width="240" height="180"></canvas><div id="hud"></div><div id="status"></div>' }); }
      return route.abort();
    });
    await page.goto("http://127.0.0.1/");
    await page.addScriptTag({ content: script.text });
    await page.addScriptTag({ type: "module", content: "import factory from '/native-game.mjs';window.nativeInputReady=window.initializeNativeInput(factory);" });
    await page.waitForFunction(() => Reflect.has(window, "nativeInputReady"));
    const initial = nativeFrame3D.parse(await page.evaluate(() => Reflect.get(window, "nativeInputReady")));
    await run(page, initial);
  } finally {
    await page.evaluate(() => Reflect.get(window, "nativeInputDispose")?.()).catch(() => {});
    await browser.close();
  }
}
const sampledFrame = z.object({ sampled: nativeRuntimeInput, frame: nativeFrame3D, trustedMoves: z.number().int().nonnegative() });
const camera = z.object({ position: z.tuple([z.number(), z.number(), z.number()]), target: z.tuple([z.number(), z.number(), z.number()]) });

it.runIf(process.env.NODETOOL_NATIVE_BROWSER_PROFILE === "1")("applies real relative pointer events exactly once to the live WASM first-person camera", async () => {
  await withNativeInput(async (page, initial) => {
    await page.mouse.move(100, 80);
    await page.mouse.down();
    await page.mouse.move(112, 74, { steps: 3 });
    await page.mouse.up();
    const result = sampledFrame.parse(await page.evaluate(() => Reflect.get(window, "nativePointerStep")()));
    const artifact = await mkdtemp(join(tmpdir(), "native-pointer-camera-"));
    await writeFile(join(artifact, "pointer-result.json"), JSON.stringify({ initial, result }, null, 2));
    console.info(`Native pointer evidence: ${artifact}`);
    const pose = camera.parse(result.frame.camera);
    const direction = [pose.target[0] - pose.position[0], pose.target[1] - pose.position[1], pose.target[2] - pose.position[2]];
    const yaw = -12 * .002, pitch = 6 * .002;
    expect(direction[0]).toBeCloseTo(-Math.sin(yaw) * Math.cos(pitch), 9);
    expect(direction[1]).toBeCloseTo(Math.sin(pitch), 9);
    expect(direction[2]).toBeCloseTo(-Math.cos(yaw) * Math.cos(pitch), 9);
    expect(result.trustedMoves).toBeGreaterThan(0);
    expect(result.sampled.look).toEqual({ x: 12, y: -6 });
    const next = sampledFrame.parse(await page.evaluate(() => Reflect.get(window, "nativePointerStep")()));
    expect(next.sampled.look).toBeUndefined();
    expect(next.frame.camera).toEqual(result.frame.camera);
    await page.mouse.move(140, 100);
    const hover = sampledFrame.parse(await page.evaluate(() => Reflect.get(window, "nativePointerStep")()));
    expect(hover.frame.camera).toEqual(result.frame.camera);
    for (const reason of ["blur", "pause", "generation-reset"]) {
      await page.mouse.move(100, 80); await page.mouse.down(); await page.mouse.move(108, 84);
      await page.evaluate((kind) => Reflect.get(window, "nativeInputClear")(kind), reason);
      await page.mouse.up();
      const cleared = sampledFrame.parse(await page.evaluate(() => Reflect.get(window, "nativePointerStep")()));
      expect(cleared.sampled.look).toBeUndefined();
      expect(cleared.frame.camera).toEqual(result.frame.camera);
    }
  });
}, 60_000);

it.runIf(process.env.NODETOOL_NATIVE_BROWSER_PROFILE === "1")("executes a committed queued save after an actual WASM scene-generation transition", async () => {
  await withNativeInput(async (page) => {
    const result = z.object({ firstGeneration: z.number(), nextGeneration: z.number(), scene: z.string(), trace: z.array(z.string()), record: z.unknown(), loaded: z.array(z.unknown()) }).parse(await page.evaluate(() => Reflect.get(window, "nativeGenerationSave")()));
    expect(result.nextGeneration).toBeGreaterThan(result.firstGeneration);
    expect(result.scene).toBe("next");
    expect(result.trace).toEqual(["read", "write"]);
    expect(result.record).toEqual({ formatVersion: 1, data: { value: 7 } });
    expect(result.loaded).toEqual([]);
  });
}, 60_000);


it.runIf(process.env.NODETOOL_NATIVE_BROWSER_PROFILE === "1")("drops real input collected during an actual player pause before resuming", async () => {
  await withNativeInput(async (page) => {
    await page.evaluate(() => Reflect.get(window, "startActualInputHost")());
    await page.waitForFunction(() => Reflect.get(window, "actualFrames").length >= 3);
    await page.evaluate(() => window.dispatchEvent(new Event("blur")));
    await page.waitForTimeout(100);
    const paused = await page.evaluate(() => ({ frame: Reflect.get(window, "actualFrames").at(-1), count: Reflect.get(window, "actualInputs").length }));
    await page.mouse.move(100, 80); await page.mouse.down(); await page.mouse.move(112, 74); await page.mouse.up();
    await page.keyboard.down("KeyW");
    await page.evaluate(() => window.dispatchEvent(new Event("focus")));
    await page.waitForFunction((count) => Reflect.get(window, "actualInputs").length > count + 2, paused.count);
    const resumed = await page.evaluate((count) => ({ frame: Reflect.get(window, "actualFrames").at(-1), inputs: Reflect.get(window, "actualInputs").slice(count), status: document.getElementById("status")?.textContent }), paused.count);
    await page.keyboard.up("KeyW");
    const evidence = await mkdtemp(join(tmpdir(), "native-player-paused-input-"));
    await writeFile(join(evidence, "pause-result.json"), JSON.stringify({ paused, resumed }, null, 2));
    console.info(`Native player pause evidence: ${evidence}`);
    expect(resumed.status).toBe("");
    expect(resumed.frame.camera).toEqual(paused.frame.camera);
    for (const entry of resumed.inputs) {
      expect(entry.input.look).toBeUndefined();
      expect(entry.input.move).toEqual([0, 0, 0]);
      expect(entry.input.actions.forward).not.toBe(true);
      expect(entry.input.edges).toEqual([]);
    }
  });
}, 60_000);
