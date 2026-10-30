import { readFile, writeFile, mkdtemp } from "node:fs/promises";
import { createHash } from "node:crypto";
import { dirname, resolve, join } from "node:path";
import { fileURLToPath } from "node:url";
import { tmpdir } from "node:os";
import { build } from "esbuild";
import { chromium } from "playwright";

// Non-gating diagnostic. It records implementation-dependent clipping behavior.
const root = resolve(dirname(fileURLToPath(import.meta.url)), "../../../..");
const fixture = join(root, "packages/game-renderer/tests/fixtures/native-eye-plane-original");
const document = JSON.parse(await readFile(join(fixture, "game.json"), "utf8"));
const bytes = await readFile(join(fixture, "surface.glb"));
if (bytes.length !== document.assets[0].size || createHash("sha256").update(bytes).digest("hex") !== document.assets[0].digest) throw Error("Closed diagnostic asset changed");
const bundle = await build({ stdin: { resolveDir: root, contents: `
import { BoxGeometry, Mesh, Scene, PerspectiveCamera, WebGLRenderer, WebGLRenderTarget, MeshDepthMaterial, RGBADepthPacking, DoubleSide, NeverDepth, LessEqualDepth } from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { nativeGame3dDocument } from "@nodetool-ai/protocol/native-game";
window.runEyePlaneDepth=async()=>{
 const doc=nativeGame3dDocument.parse(${JSON.stringify(document)}),scene=new Scene(),camera=new PerspectiveCamera(doc.camera.fov,256/192,doc.camera.near,doc.camera.far);
 camera.position.fromArray(doc.camera.position);camera.lookAt(...doc.camera.target);
 const loaded=await new GLTFLoader().parseAsync(new Uint8Array(${JSON.stringify(Array.from(bytes))}).buffer,"");scene.add(loaded.scene);
 const floorDoc=doc.scenes[0].entities.find(entity=>entity.id==="floor"),floor=new Mesh(new BoxGeometry(...floorDoc.visual.size));floor.position.fromArray(floorDoc.transform.position);scene.add(floor);
 const renderer=new WebGLRenderer({preserveDrawingBuffer:true});renderer.setSize(256,192);const target=new WebGLRenderTarget(256,192),depth=new MeshDepthMaterial({depthPacking:RGBADepthPacking,side:DoubleSide});scene.overrideMaterial=depth;
 const reports=[];
 for(const mode of ["model-only","floor-only","combined","never","front-before-eye","gl-fragcoord"]){
  loaded.scene.visible=mode!=="floor-only";floor.visible=mode!=="model-only";floor.scale.z=mode==="front-before-eye"?.98:1;depth.depthFunc=mode==="never"?NeverDepth:LessEqualDepth;
  if(mode==="gl-fragcoord"){depth.onBeforeCompile=shader=>shader.fragmentShader=shader.fragmentShader.replace("float fragCoordZ = 0.5 * vHighPrecisionZW[ 0 ] / vHighPrecisionZW[ 1 ] + 0.5;","float fragCoordZ = gl_FragCoord.z;");depth.customProgramCacheKey=()=>"actual-fragcoord";depth.needsUpdate=true;}
  renderer.setRenderTarget(target);renderer.setClearColor(0xffffff,1);renderer.clear();renderer.render(scene,camera);
  const samples=[];for(const row of [120,125,130,135,140]){const pixel=new Uint8Array(4);renderer.readRenderTargetPixels(target,128,191-row,1,1,pixel);samples.push({row,rgba:Array.from(pixel),depth:pixel[0]/256+pixel[1]/65536+pixel[2]/16777216+pixel[3]/4278190080});}
  const gl=renderer.getContext();reports.push({mode,samples,depthBits:gl.getParameter(gl.DEPTH_BITS),depthFunction:gl.getParameter(gl.DEPTH_FUNC),framebufferStatus:gl.checkFramebufferStatus(gl.FRAMEBUFFER),glError:gl.getError()});
 }
 const gl=renderer.getContext(),debug=gl.getExtension("WEBGL_debug_renderer_info"),graphics={version:gl.getParameter(gl.VERSION),renderer:debug?gl.getParameter(debug.UNMASKED_RENDERER_WEBGL):gl.getParameter(gl.RENDERER)};
 target.dispose();depth.dispose();renderer.dispose();gl.getExtension("WEBGL_lose_context")?.loseContext();
 return {diagnostic:true,gating:false,cause:"Provisional lower-level eye-plane clipping behavior. No vendor or platform-wide claim.",graphics,reports};
};` }, bundle: true, platform: "browser", format: "iife", conditions: ["nodetool-dev"], write: false });
const browser = await chromium.launch({headless:true,chromiumSandbox:true,args:["--use-angle=swiftshader","--enable-unsafe-swiftshader"]});
try {
 const page=await browser.newPage();await page.route("**/*",route=>route.request().url()==="http://127.0.0.1/"?route.fulfill({contentType:"text/html",body:"<!doctype html><body>"}):route.abort());await page.goto("http://127.0.0.1/");await page.addScriptTag({content:bundle.outputFiles[0].text});const report=await page.evaluate(()=>window.runEyePlaneDepth());const directory=await mkdtemp(join(tmpdir(),"native-eye-plane-depth-"));await writeFile(join(directory,"report.json"),JSON.stringify(report,null,2));console.log(directory,JSON.stringify(report));
} finally {await browser.close();}
