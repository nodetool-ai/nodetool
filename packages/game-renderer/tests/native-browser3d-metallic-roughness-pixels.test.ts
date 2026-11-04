import { chromium } from "@playwright/test";
import { build } from "esbuild";
import { resolve } from "node:path";
import { expect, it } from "vitest";

it("uses linear G/B metallic-roughness channels once with authored factors in Chromium", async () => {
  const bundle = await build({ stdin: { resolveDir: resolve("."), contents: `
import * as T from 'three';
import {NativePBRMaterials} from './src/native-cpp/3d-materials.ts';
import {NativeModelInstance} from './src/native-cpp/model3d-instance.ts';
window.runMetallicRoughnessPixels=async()=>{
 const renderer=new T.WebGLRenderer({antialias:false});renderer.setSize(32,32);
 renderer.outputColorSpace=T.LinearSRGBColorSpace;renderer.toneMapping=T.NoToneMapping;
 const target=new T.WebGLRenderTarget(32,32,{type:T.HalfFloatType,format:T.RGBAFormat});target.texture.colorSpace=T.LinearSRGBColorSpace;
 const camera=new T.OrthographicCamera(-1,1,1,-1,.1,10);camera.position.z=2;
 const identity=new T.Matrix4().toArray(), samples={};
 async function render(name,rgba,roughness=.8,metallic=.6){
  const model={meshes:[[{vertices:[[-1,-1,0],[3,-1,0],[-1,3,0]].map(position=>({position,normal:[0,0,1],uv:[.5,.5],joints:[0,0,0,0],weights:[1,0,0,0]})),indices:[0,1,2],material:0}]],
   materials:[{color:[.75,.4,.2,1],metallic,roughness,image:-1,doubleSided:true,...(rgba?{metallicRoughnessImage:0}:{})}],images:[],nodes:[{local:identity,children:[],mesh:0,skin:-1}],roots:[0],skins:[],animations:[]};
  let bitmap;const images=[];
  if(rgba){const canvas=new OffscreenCanvas(1,1);canvas.getContext('2d').putImageData(new ImageData(new Uint8ClampedArray(rgba),1,1),0,0);bitmap=await createImageBitmap(canvas,{colorSpaceConversion:'none',premultiplyAlpha:'none'});images.push({bitmap,digest:rgba.join('-')});}
  const materials=new NativePBRMaterials(model,images), instance=new NativeModelInstance(model,materials.materials);instance.sample(0,0);
  const scene=new T.Scene();scene.add(instance.root,new T.AmbientLight(0xffffff,.15));
  const sun=new T.DirectionalLight(0xffffff,3);sun.position.set(2,1,3);scene.add(sun);
  renderer.setRenderTarget(target);renderer.setClearColor(0,0);renderer.clear();renderer.render(scene,camera);renderer.getContext().finish();
  const raw=new Uint16Array(32*32*4);renderer.readRenderTargetPixels(target,0,0,32,32,raw);
  samples[name]=Array.from(raw,T.DataUtils.fromHalfFloat);
  instance.dispose();materials.dispose();bitmap?.close();
 }
 await render('unmapped');await render('neutral',[0,255,255,255]);
 await render('mapped',[0,128,64,255]);await render('reference',null,.8*128/255,.6*64/255);
 await render('unusedChannels',[255,128,64,128]);
 await render('roughLow',[0,64,192,255]);await render('roughHigh',[0,224,192,255]);
 await render('metalLow',[0,160,0,255]);await render('metalHigh',[0,160,255,255]);
 target.dispose();renderer.dispose();return samples;
};` }, bundle: true, platform: "browser", format: "iife", write: false, conditions: ["nodetool-dev"] });
  const browser = await chromium.launch({ headless: true, chromiumSandbox: true,
    args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader"] });
  try {
    const page = await browser.newPage(), errors: string[] = [];
    page.on("pageerror", error => errors.push(error.message));
    page.on("console", message => { if (message.type() === "error") { errors.push(message.text()); } });
    await page.route("**/*", route => route.request().url() === "http://127.0.0.1/" ? route.fulfill({ contentType: "text/html", body: "<!doctype html><body>" }) : route.abort());
    await page.goto("http://127.0.0.1/");
    const output = bundle.outputFiles?.[0];
    if (!output) { throw new Error("Missing metallic-roughness pixel bundle"); }
    await page.addScriptTag({ content: output.text });
    const samples: Record<string, number[]> = await page.evaluate(() => Reflect.get(window, "runMetallicRoughnessPixels")());
    expect(errors).toEqual([]);
    expect(Object.keys(samples)).toHaveLength(9);
    for (const values of Object.values(samples)) {
      expect(values).toHaveLength(4096);
      expect(values.every(Number.isFinite)).toBe(true);
      expect(values.some(value => value > 0)).toBe(true);
    }
    const maxDifference = (a: number[], b: number[]): number => Math.max(...a.map((value, index) => Math.abs(value - b[index])));
    expect(maxDifference(samples.neutral, samples.unmapped)).toBe(0);
    expect(maxDifference(samples.mapped, samples.reference)).toBeLessThan(0.003);
    expect(maxDifference(samples.mapped, samples.unmapped)).toBeGreaterThan(0.01);
    expect(maxDifference(samples.mapped, samples.unusedChannels)).toBeLessThan(0.003);
    expect(maxDifference(samples.roughLow, samples.roughHigh)).toBeGreaterThan(0.01);
    expect(maxDifference(samples.metalLow, samples.metalHigh)).toBeGreaterThan(0.01);
  } finally { await browser.close(); }
}, 60_000);
