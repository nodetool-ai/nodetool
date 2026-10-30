import { createHash } from "node:crypto";
import { createServer } from "node:http";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { gameDocument3D } from "@nodetool-ai/protocol";
import { nativeGame3dDocument, nativeFrame3D } from "@nodetool-ai/protocol/native-game";
import { chromium } from "@playwright/test";
import { build } from "esbuild";
import { expect, it } from "vitest";

it("paints original BLACKSITE widgets with verified TTFs inside the native output canvas after tone mapping", async () => {
  const sample = new URL("../../game-runtime/samples/blacksite/", import.meta.url);
  const original = gameDocument3D.parse(JSON.parse(await readFile(new URL("game.json", sample), "utf8")));
  if (!original.ui) { throw new Error("Original BLACKSITE widget fixture is empty"); }
  const files = new Map<string, Uint8Array>();
  const assets = [];
  for (const [id, entry] of Object.entries(original.assets)) {
    if (entry.mediaKind !== "font") { continue; }
    const bytes = await readFile(new URL(`assets/${entry.assetId}.ttf`, sample));
    const path = `${id}.ttf`; files.set(`/${path}`, bytes);
    assets.push({id,kind:"font",path,size:bytes.length,digest:createHash("sha256").update(bytes).digest("hex"),dependencies:[]});
  }
  const nodes = original.ui.nodes.map((node) => {
    if (node.kind !== "bar") { return node; }
    const { source: _source, ...resolved } = node; return resolved;
  });
  const document = nativeGame3dDocument.parse({engine:"native-cpp-1",schemaVersion:4,dimension:"3d",id:"native-hud-blacksite",title:"Native HUD",
    initialSceneId:"scene",scenes:[{id:"scene",entities:[]}],assets,presentation:original.presentation,ui:{nodes,safeArea:original.ui.safeArea}});
  const frame = nativeFrame3D.parse({dimension:"3d",tick:0,generation:1,sceneId:"scene",events:[],presentationEvents:[],hostRequests:[],queryResults:[],music:[],score:0,health:100,
    logs:[],hud:[],entities:[],camera:{},lighting:{},backgrounds:[],presentation:document.presentation,ui:{...document.ui,focusNavigation:false}});
  const bundle = await build({stdin:{resolveDir:process.cwd(),sourcefile:"native-hud-control.ts",contents:`
    import { WebGLRenderer, WebGLRenderTarget, AgXToneMapping, LinearSRGBColorSpace, Vector4 } from 'three';
    import { createNativeHud3D } from './src/native-cpp/3d-hud.ts';
    import { createNativeAssetBroker } from './src/native-cpp/assets.ts';
    import { paintGameUi } from './src/ui/paint.ts';
    import { gameFontFamily } from './src/fonts.ts';
    window.verifyNativeHud=async(documentValue,frame)=>{
      let reads=0;const assets=createNativeAssetBroker({assets:documentValue.assets,fetchBytes:async(path)=>{reads++;return new Uint8Array(await(await fetch('/'+path)).arrayBuffer());}});
      for(const entry of assets.entries)await assets.get(entry.id);
      const baselineFonts=document.fonts.size;
      const hud=await createNativeHud3D({assets,document:documentValue});
      const loadedFonts=[...document.fonts].filter(face=>face.family.startsWith('ntg-')).map(face=>face.status);
      const canvas=document.createElement('canvas');document.body.append(canvas);
      const renderer=new WebGLRenderer({canvas,antialias:false,preserveDrawingBuffer:true});renderer.setSize(1280,720,false);
      renderer.setPixelRatio(1);renderer.outputColorSpace=LinearSRGBColorSpace;renderer.toneMapping=AgXToneMapping;renderer.toneMappingExposure=100;
      renderer.setClearColor('#213040',1);renderer.clear();
      const expected=document.createElement('canvas');expected.width=1280;expected.height=720;const expectedContext=expected.getContext('2d');
      expectedContext.drawImage(canvas,0,0);paintGameUi(expectedContext,frame.ui,{width:1280,height:720},{gameId:documentValue.id});
      renderer.setViewport(17,19,800,600);renderer.setScissor(9,11,20,30);renderer.setScissorTest(true);
      const originalRender=renderer.render.bind(renderer);let draws=0,versions=[];
      renderer.render=(scene,camera)=>{draws++;versions.push(scene.children[0].material.map.version);return originalRender(scene,camera);};
      hud.render(renderer,{...frame,ui:undefined});const noUiDraws=draws;
      hud.render(renderer,frame);
      const actual=document.createElement('canvas');actual.width=1280;actual.height=720;const actualContext=actual.getContext('2d');actualContext.drawImage(canvas,0,0);
      const a=actualContext.getImageData(0,0,1280,720).data,b=expectedContext.getImageData(0,0,1280,720).data;
      let total=0,changed=0,maximum=0;for(let index=0;index<a.length;index+=4){let delta=0;for(let channel=0;channel<3;channel++){const difference=Math.abs(a[index+channel]-b[index+channel]);total+=difference;delta=Math.max(delta,difference);}maximum=Math.max(maximum,delta);if(delta>8)changed++;}
      const stateRestored=renderer.outputColorSpace===LinearSRGBColorSpace&&renderer.autoClear===true&&renderer.getScissorTest()===true&&renderer.getViewport(new Vector4()).toArray().join(',')==='17,19,800,600';
      hud.render(renderer,frame);hud.render(renderer,{...frame,tick:1,ui:structuredClone(frame.ui)});
      const unchangedTextureVersion=versions.every(version=>version===versions[0]);
      hud.contextRestored();hud.render(renderer,frame);const restoredTextureVersion=versions.at(-1)>versions[0];
      const target=new WebGLRenderTarget(32,16);renderer.setRenderTarget(target);hud.render(renderer,frame);const targetRestored=renderer.getRenderTarget()===target;
      renderer.setRenderTarget(null);renderer.setSize(640,360,false);renderer.setPixelRatio(2);renderer.setScissorTest(false);renderer.clear();hud.render(renderer,frame);
      const resized=document.createElement('canvas');resized.width=1280;resized.height=720;const resizedContext=resized.getContext('2d');resizedContext.drawImage(canvas,0,0);
      const resizedPixels=resizedContext.getImageData(0,0,1280,720).data;let resizedDelta=0;
      for(let index=0;index<b.length;index++)if(index%4!==3)resizedDelta+=Math.abs(resizedPixels[index]-b[index]);
      const dprMean=resizedDelta/(1280*720*3),drawingBufferSized=canvas.width===1280&&canvas.height===720;
      const fontContext=document.createElement('canvas').getContext('2d');fontContext.font='600 34px "'+gameFontFamily(documentValue.id,'font-display')+'"';const brandWidth=fontContext.measureText('BLACKSITE').width;
      hud.dispose();hud.dispose();const fontsDisposed=document.fonts.size===baselineFonts;
      let disposed=false;try{hud.render(renderer,frame);}catch{disposed=true;}
      const bad=new Uint8Array([1,2,3]);let badReads=0;
      const failedAssets={entries:[...assets.entries,{id:'invalid-font',kind:'font',size:bad.length}],verifiedRange:(id,offset,length)=>{badReads++;return id==='invalid-font'?bad:assets.verifiedRange(id,offset,length);}};
      let failed=false;try{await createNativeHud3D({assets:failedAssets,document:documentValue});}catch(error){failed=error.message.includes('invalid-font');}
      const partialFontCleanup=document.fonts.size===baselineFonts;
      assets.dispose();target.dispose();renderer.dispose();canvas.remove();
      return {mean:total/(1280*720*3),changed,maximum,dprMean,drawingBufferSized,stateRestored,noUiDraws,unchangedTextureVersion,restoredTextureVersion,targetRestored,brandWidth,loadedFonts,fontsDisposed,disposed,failed,partialFontCleanup,reads,badReads,
        actual:actual.toDataURL(),expected:expected.toDataURL()};
    };
  `},bundle:true,conditions:["nodetool-dev"],platform:"browser",format:"iife",write:false,logLevel:"silent"});
  const javascript=bundle.outputFiles?.[0]?.contents;if(!javascript){throw new Error("Native HUD fixture did not bundle");}
  const requested=new Set<string>();
  const server=createServer((request,response)=>{
    const path=request.url??"/";requested.add(path);
    if(files.has(path)){response.setHeader("content-type","font/ttf");response.end(files.get(path));}
    else if(path==="/owner.js"){response.setHeader("content-type","text/javascript");response.end(javascript);}
    else if(path==="/"){response.setHeader("content-type","text/html");response.end('<script src="/owner.js"></script>');}
    else{response.statusCode=404;response.end();}
  });
  let browser:Awaited<ReturnType<typeof chromium.launch>>|undefined;
  try{
    await new Promise<void>((resolve)=>server.listen(0,"127.0.0.1",resolve));const address=server.address();if(!address||typeof address==="string"){throw new Error("Native HUD fixture did not bind");}
    browser=await chromium.launch({headless:true,chromiumSandbox:true,args:["--use-angle=swiftshader","--enable-unsafe-swiftshader"]});
    const page=await browser.newPage();await page.goto(`http://127.0.0.1:${address.port}`);await page.waitForFunction(()=>typeof Reflect.get(window,"verifyNativeHud")==="function");
    const result=await page.evaluate(async({document,frame})=>Reflect.get(window,"verifyNativeHud")(document,frame),{document,frame});
    const directory=await mkdtemp(join(tmpdir(),"native-browser3d-hud-"));
    await writeFile(join(directory,"actual.png"),Buffer.from(result.actual.split(",")[1],"base64"));await writeFile(join(directory,"reference.png"),Buffer.from(result.expected.split(",")[1],"base64"));
    const {actual:_actual,expected:_expected,...metrics}=result;await writeFile(join(directory,"metrics.json"),JSON.stringify(metrics,null,2));
    expect(result.mean).toBeLessThan(0.05);expect(result.dprMean).toBeLessThan(0.05);expect(result.maximum).toBeLessThanOrEqual(2);expect(result.changed).toBe(0);expect(Math.abs(result.brandWidth-111)).toBeLessThan(1);
    expect(result).toMatchObject({drawingBufferSized:true,stateRestored:true,noUiDraws:0,unchangedTextureVersion:true,restoredTextureVersion:true,targetRestored:true,loadedFonts:["loaded","loaded"],fontsDisposed:true,disposed:true,failed:true,partialFontCleanup:true,reads:2,badReads:3});
    expect([...requested].filter(path=>path!=="/favicon.ico").sort()).toEqual(["/","/font-display.ttf","/font-ui.ttf","/owner.js"]);
  }finally{await browser?.close();await new Promise<void>((resolve)=>server.close(()=>resolve()));}
},30_000);
