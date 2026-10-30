import { readFile, writeFile, mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, resolve, join } from "node:path";
import { pathToFileURL, fileURLToPath } from "node:url";
import { build } from "esbuild";
import { chromium } from "playwright";

// Run with Node and --conditions=nodetool-dev --import=tsx under a valid software-GL display.
// These closed GLBs are the same front/back X/Y normal-map probes used by Qt.
const root = resolve(dirname(fileURLToPath(import.meta.url)), "../../../..");
const fixtureDirectory = join(root, "packages/game-renderer/tests/fixtures/native-normal-reference");
const moduleFile = join(root, "packages/game-renderer/dist/native-game.mjs");
const factory = (await import(pathToFileURL(moduleFile))).default;
const wasm = await factory({ wasmBinary: await readFile(join(dirname(moduleFile), "native-game.wasm")) });
wasm.FS.mkdirTree("/assets");
const context = wasm._ng_create(), fixtures = [];
const {createNativeVisual3DData}=await import("./nativeVisual3DData.ts");const common=await createNativeVisual3DData();
try {
  const cases = ["front-x","front-y","front-flat","back-x","back-y","back-flat","grazing","common-floor"];
  for (const name of cases) {
    const documentPath = name === "grazing" ? join(root, "native/game/tests/fixtures/anisotropic3d/game.json") : join(fixtureDirectory, `${name}.json`);
    const document = name==="common-floor" ? {...common.document,assets:common.document.assets.filter(a=>a.id==="surface"),scenes:[common.document.scenes[0]],initialSceneId:common.document.scenes[0].id} : JSON.parse(await readFile(documentPath, "utf8"));
    const bytes = name==="common-floor" ? new Uint8Array(common.bytes.surface) : await readFile(join(dirname(documentPath), document.assets[0].path));
    wasm.FS.writeFile(`/assets/${document.assets[0].path}`, bytes);
    const request = new TextEncoder().encode(JSON.stringify({ protocolVersion: 1, requestId: name, sessionId: "normal-reference", operation: "prepareModel", manifest: document.assets, id: document.assets[0].id }));
    const pointer = wasm._malloc(request.length);
    wasm.HEAPU8.set(request, pointer);
    const status = wasm._ng_dispatch(context, pointer, request.length);
    wasm._free(pointer);
    const length = wasm._ng_response_length(context);
    if (status !== 0 || length < 1 || length > 16777216) throw Error(`WASM admission failed: ${name}`);
    const offset = wasm._ng_response_pointer(context), response = JSON.parse(new TextDecoder().decode(wasm.HEAPU8.slice(offset, offset + length)));
    if (response.status !== "ok") throw Error(JSON.stringify(response));
    fixtures.push({ name, document, bytes: Array.from(bytes), model: response.result });
  }
} finally { wasm._ng_destroy(context); }
const bundle = await build({ stdin: { resolveDir: join(root, "packages/game-renderer"), loader: "ts", contents: `
import { Mesh } from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { nativeFrame3D, nativeGame3dDocument } from "@nodetool-ai/protocol/native-game";
import { createNativeRenderer3D } from "./src/native-cpp/renderer3d.ts";
import { createNativeAssetBroker } from "./src/native-cpp/assets.ts";
import { parseNativePreparedModel } from "./src/native-cpp/model3d-types.ts";
const fixtures = ${JSON.stringify(fixtures)};
function pixels(canvas) { const copy=document.createElement("canvas");copy.width=canvas.width;copy.height=canvas.height;const ctx=copy.getContext("2d");ctx.drawImage(canvas,0,0);return ctx.getImageData(0,0,copy.width,copy.height).data; }
function error(a,b) { let sum=0,changed=0,max=0;for(let i=0;i<a.length;i+=4){let delta=0;for(let c=0;c<3;c++){const d=Math.abs(a[i+c]-b[i+c]);sum+=d;max=Math.max(max,d);delta=Math.max(delta,d);}if(delta>16)changed++;}return {mean:sum/(a.length/4*3*255),changedFraction:changed/(a.length/4),max}; }
window.runNormalReference=async()=>{const report=[];for(const fixture of fixtures){fixture.document=nativeGame3dDocument.parse(fixture.document);
 const canvas=document.createElement("canvas");canvas.addEventListener("webglcontextcreationerror",event=>console.error(fixture.name+": "+event.statusMessage));document.body.append(canvas);const bytes=new Uint8Array(fixture.bytes),assets=createNativeAssetBroker({assets:fixture.document.assets,fetchBytes:async()=>bytes});await assets.get(fixture.document.assets[0].id);
 const owner=await createNativeRenderer3D({canvas,assets,prepareModel:async()=>parseNativePreparedModel(fixture.model)},fixture.document).catch(error=>{throw new Error(fixture.name+": "+String(error));});owner.resize(256,256);
 const sceneDoc=fixture.document.scenes[0],frame=nativeFrame3D.parse({dimension:"3d",tick:0,generation:0,sceneId:sceneDoc.id,camera:fixture.document.camera,entities:sceneDoc.entities,environment:sceneDoc.environment,events:[],presentationEvents:[],hostRequests:[],queryResults:[],music:[],score:0,health:100,logs:[],hud:[],lighting:{},backgrounds:[]});
 const original=Mesh.prototype.onAfterRender;let world;const nativeMeshes=[];
 Mesh.prototype.onAfterRender=function(renderer,scene,camera,geometry,material){if(material.type==="MeshStandardMaterial"&&geometry.type!=="BoxGeometry"){world=scene;if(!nativeMeshes.includes(this))nativeMeshes.push(this);}};
 owner.render(frame);owner.finishFrame();Mesh.prototype.onAfterRender=original;
 const nativePixels=pixels(canvas),nativePng=canvas.toDataURL();
 const loaded=await new GLTFLoader().parseAsync(bytes.buffer,"");const transform=sceneDoc.entities.find(entity=>entity.visual?.kind==="model").transform;loaded.scene.position.fromArray(transform.position);loaded.scene.quaternion.fromArray(transform.rotation);loaded.scene.scale.fromArray(transform.scale);
 const materials=[];loaded.scene.traverse(object=>{if(object.isMesh){for(const material of Array.isArray(object.material)?object.material:[object.material]){materials.push(material);if(material.map)material.map.anisotropy=owner.stats.modelTextureAnisotropy;if(material.normalMap)material.normalMap.anisotropy=owner.stats.modelTextureAnisotropy;}}});
 nativeMeshes.forEach(mesh=>mesh.visible=false);world.add(loaded.scene);owner.render(frame);owner.finishFrame();const referencePixels=pixels(canvas),referencePng=canvas.toDataURL();
 materials.forEach(material=>{if(material.normalScale)material.normalScale.y*=-1;});owner.render(frame);owner.finishFrame();const wrongPixels=pixels(canvas);
 report.push({name:fixture.name,reference:error(nativePixels,referencePixels),wrongY:error(referencePixels,wrongPixels),nativePng,referencePng});
 world.remove(loaded.scene);loaded.scene.traverse(object=>{if(object.isMesh)object.geometry.dispose();});materials.forEach(material=>{material.map?.dispose();material.normalMap?.dispose();material.dispose();});owner.dispose();assets.dispose();canvas.getContext("webgl2").getExtension("WEBGL_lose_context")?.loseContext();canvas.remove();
}return report;};` }, bundle: true, platform: "browser", format: "iife", conditions: ["nodetool-dev"], write: false });
const browser = await chromium.launch({ headless: true, chromiumSandbox: true, args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader"] });
try {
 const page=await browser.newPage();const diagnostics=[];page.on("console",message=>{if(message.type()==="error")diagnostics.push(message.text());});await page.route("**/*", route=>route.request().url()==="http://127.0.0.1/"?route.fulfill({contentType:"text/html",body:"<!doctype html><body>"}):route.abort());await page.goto("http://127.0.0.1/");await page.addScriptTag({content:bundle.outputFiles[0].text});
 const reports=await page.evaluate(()=>window.runNormalReference()).catch(error=>{throw new Error(String(error)+" Browser diagnostics: "+diagnostics.join(" | "));});const directory=await mkdtemp(join(tmpdir(),"native-normal-reference-"));
 for(const report of reports){for(const key of ["nativePng","referencePng"]){await writeFile(join(directory,`${report.name}-${key}.png`),Buffer.from(report[key].split(",")[1],"base64"));delete report[key];}}
 await writeFile(join(directory,"report.json"),JSON.stringify(reports,null,2));console.log(directory,JSON.stringify(reports));
 if(reports.length!==8||reports.some(value=>value.reference.mean>1/255||value.reference.changedFraction>.02))throw Error("Native normal convention differs from GLTFLoader");
 for(const side of ["front","back"]){if(reports.find(value=>value.name===`${side}-y`).wrongY.mean<.01)throw Error("Wrong Y convention did not fail the sensitive probe");}
} finally {await browser.close();}
