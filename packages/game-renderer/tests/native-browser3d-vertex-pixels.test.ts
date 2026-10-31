import { chromium } from "@playwright/test";
import { build } from "esbuild";
import { resolve } from "node:path";
import { expect, it } from "vitest";

it("renders linear vertex color, alpha shadow tests and finite HDR emission in Chromium", async () => {
  const bundle = await build({ stdin: { resolveDir: resolve("."), contents: `
import * as T from 'three';
import {NativePBRMaterials} from './src/native-cpp/3d-materials.ts';
import {NativeModelInstance} from './src/native-cpp/model3d-instance.ts';
window.runVertexPixels=()=>{
 const renderer=new T.WebGLRenderer({antialias:false});renderer.setSize(32,32);renderer.outputColorSpace=T.LinearSRGBColorSpace;renderer.toneMapping=T.NoToneMapping;
 const target=new T.WebGLRenderTarget(32,32,{type:T.HalfFloatType,format:T.RGBAFormat});target.texture.colorSpace=T.LinearSRGBColorSpace;
 const camera=new T.OrthographicCamera(-1,1,1,-1,.1,10);camera.position.z=2;
 const identity=new T.Matrix4().toArray();const samples={};
 function render(name,opts={}){
  const colors=opts.gradient?[[1,0,0,1],[0,1,0,1],[0,0,1,1]]:Array(3).fill(opts.color??[1,1,1,1]);
  const model={meshes:[[{vertices:[[-1,-1,0],[3,-1,0],[-1,3,0]].map((position,i)=>({position,normal:[0,0,1],uv:[.5,.5],joints:[0,0,0,0],weights:[1,0,0,0],color:colors[i]})),indices:[0,1,2],material:0}]],materials:[{color:[1,1,1,opts.opacity??1],metallic:0,roughness:1,image:-1,doubleSided:true,emissive:opts.emissive??[0,0,0],emissiveStrength:opts.strength??1,alphaMode:opts.mode??'OPAQUE',alphaCutoff:opts.cutoff??.5}],images:[],nodes:[{local:identity,children:[],mesh:0,skin:-1}],roots:[0],skins:[],animations:[]};
  const materials=new NativePBRMaterials(model,[]);let texture;
  if(opts.mapAlpha!==undefined){texture=new T.DataTexture(new Uint8Array([255,255,255,opts.mapAlpha]),1,1);texture.needsUpdate=true;materials.materials[0].map=texture;}
  const instance=new NativeModelInstance(model,materials.materials);instance.sample(0,0);
  const scene=new T.Scene();scene.add(instance.root);if(!opts.emissive)scene.add(new T.AmbientLight(0xffffff,Math.PI));
  if(opts.shadow){instance.root.traverse(object=>{if(object instanceof T.Mesh){object.material=opts.shadow==='depth'?object.customDepthMaterial:object.customDistanceMaterial;if(!object.material)throw Error('Missing shadow variant');if(opts.shadow==='distance'){const light=new T.PointLight();light.position.set(0,0,2);light.updateMatrixWorld();light.shadow.camera.near=.1;light.shadow.camera.far=10;renderer.properties.get(object.material).light=light;}}});}
  renderer.setRenderTarget(target);renderer.setClearColor(0,0);renderer.clear();renderer.render(scene,camera);renderer.getContext().finish();
  const raw=new Uint16Array(32*32*4);renderer.readRenderTargetPixels(target,0,0,32,32,raw);
  const pixel=(x,y)=>Array.from(raw.slice((y*32+x)*4,(y*32+x)*4+4),T.DataUtils.fromHalfFloat);
  samples[name]={center:pixel(16,16),left:pixel(2,2),right:pixel(29,2),top:pixel(2,29),finite:Array.from(raw).every(value=>(value&0x7c00)!==0x7c00)};
  instance.dispose();materials.dispose();texture?.dispose();
 }
 render('gradient',{gradient:true});render('white');render('tint',{color:[.25,.5,.75,1]});
 render('blend',{mode:'BLEND',color:[1,1,1,.75],opacity:.8,mapAlpha:128});
 render('maskPass',{mode:'MASK',color:[1,1,1,.75],opacity:.8,mapAlpha:128,cutoff:.25});
 render('maskFail',{mode:'MASK',color:[1,1,1,.75],opacity:.8,mapAlpha:128,cutoff:.4});
 for(const shadow of ['depth','distance']){render(shadow+'Pass',{shadow,mode:'MASK',color:[1,1,1,.75],opacity:.8,mapAlpha:128,cutoff:.25});render(shadow+'Fail',{shadow,mode:'MASK',color:[1,1,1,.75],opacity:.8,mapAlpha:128,cutoff:.4});}
 render('emission1',{emissive:[.1,.2,.3]});render('emission28',{emissive:[.1,.2,.3],strength:2.8});render('emissionMax',{emissive:[1,1,1],strength:3.4028234663852886e38});
 target.dispose();renderer.dispose();return samples;
};` }, bundle: true, platform: "browser", format: "iife", write: false, conditions: ["nodetool-dev"] });
  const browser = await chromium.launch({ headless: true, chromiumSandbox: true, args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader"] });
  try {
    const page = await browser.newPage();
    const errors: string[] = [];
    page.on("pageerror", error => errors.push(error.message));
    page.on("console", message => { if (message.type() === "error") { errors.push(message.text()); } });
    await page.route("**/*", route => route.request().url() === "http://127.0.0.1/" ? route.fulfill({ contentType: "text/html", body: "<!doctype html><body>" }) : route.abort());
    await page.goto("http://127.0.0.1/");
    const output = bundle.outputFiles?.[0];
    if (!output) { throw new Error("Missing vertex material capture bundle"); }
    await page.addScriptTag({ content: output.text });
    const result: Record<string, { center: number[]; left: number[]; right: number[]; top: number[]; finite: boolean }> = await page.evaluate(() => Reflect.get(window, "runVertexPixels")());
    expect(errors).toEqual([]);
    expect(Object.keys(result)).toHaveLength(13);
    for (const sample of Object.values(result)) { expect(sample.finite).toBe(true); }
    expect(result.white.center[0]).toBeGreaterThan(0);
    for (const [channel, multiplier] of [0.25, 0.5, 0.75].entries()) { expect(result.tint.center[channel] / result.white.center[channel]).toBeCloseTo(multiplier, 2); }
    expect(result.gradient.left[0]).toBeGreaterThan(result.gradient.right[0]);
    expect(result.gradient.right[1]).toBeGreaterThan(result.gradient.left[1]);
    expect(result.gradient.top[2]).toBeGreaterThan(result.gradient.left[2]);
    expect(result.blend.center[3]).toBeCloseTo(0.8 * 0.75 * 128 / 255, 2);
    expect(result.maskPass.center[0]).toBeGreaterThan(0);
    expect(result.maskFail.center).toEqual([0, 0, 0, 0]);
    for (const shadow of ["depth", "distance"]) {
      expect(result[shadow + "Pass"].center.some(value => value > 0)).toBe(true);
      expect(result[shadow + "Fail"].center).toEqual([0, 0, 0, 0]);
    }
    for (let channel = 0; channel < 3; channel++) { expect(result.emission28.center[channel] / result.emission1.center[channel]).toBeCloseTo(2.8, 2); }
    expect(result.emissionMax.center.slice(0, 3)).toEqual([65504, 65504, 65504]);
  } finally { await browser.close(); }
}, 60_000);
