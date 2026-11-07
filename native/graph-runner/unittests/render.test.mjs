import { compositeLayersHeadless } from '../../../packages/gpu/src/compositor/headless.ts';
globalThis.renderTest = async () => {
  const adapter=await navigator.gpu.requestAdapter(); const device=await adapter.requestDevice();
  const pixels=new Uint8Array([10,20,30,255,40,50,60,255,70,80,90,255,100,110,120,255]);
  try {
    const out=await compositeLayersHeadless(device,[{rgba:pixels,width:2,height:2,opacity:1,blendModeId:0}],2,2);
    if(out.rgba.length!==pixels.length || !out.rgba.every((x,i)=>x===pixels[i])) throw new Error('compositor pixels '+Array.from(out.rgba));
    globalThis.renderResult='ok';
  } finally {device.destroy();}
};
import { CompositorNode } from '@nodetool-ai/image-nodes/nodes/image';
import { RAW_RGBA_MIME } from '@nodetool-ai/protocol';
const compositorTest=globalThis.renderTest;
globalThis.renderTest=async()=> {
  await compositorTest();
  const pixels=new Uint8Array([10,20,30,255,40,50,60,255,70,80,90,255,100,110,120,255]);
  const node=new CompositorNode({canvas_width:2,canvas_height:2,layers:[]});
  node.dynamicProps.set('image_0',{type:'image',mimeType:RAW_RGBA_MIME,data:pixels,width:2,height:2});
  const out=await node.process();
  if(out.output.data.length!==pixels.length || !out.output.data.every((x,i)=>x===pixels[i])) throw new Error('CompositorNode bytes');
  globalThis.renderResult='ok';
};

// Actual timeline callers from the independent review, with CPU pixel answers.
import { HeadlessFrameCompositor } from '../../../packages/timeline/src/render/frameCompositor.ts';
const imageNodeTest=globalThis.renderTest;
globalThis.renderTest=async()=> {
  await imageNodeTest();
  const adapter=await navigator.gpu.requestAdapter(), device=await adapter.requestDevice();
  const compositor=new HeadlessFrameCompositor(device,8,8);
  const check=(frame,expected,label,tolerance=0)=> {
    if(frame.length!==expected.length) throw new Error(label+' length');
    for(let i=0;i<frame.length;i++) if(Math.abs(frame[i]-expected[i])>tolerance) {
      throw new Error(`${label} byte ${i}: ${frame[i]} expected ${expected[i]}`);
    }
  };
  const layer=source=>({id:'review-layer',source,opacity:1,blendMode:'normal',zIndex:0});
  try {
    const gradient=new Uint8Array(8*8*4);
    for(let y=0;y<8;y++) for(let x=0;x<8;x++) gradient.set([x*24,y*24,16,255],(y*8+x)*4);
    const base=layer({rgba:gradient,width:8,height:8,version:'gradient'});
    check(await compositor.renderFrame([base]),gradient,'plain timeline');
    const cropped=await compositor.renderFrame([{...base,crop:{left:0.25,right:0,top:0,bottom:0}}]);
    const expectedCrop=new Uint8Array(8*8*4);
    for(let y=0;y<8;y++) for(let x=0;x<8;x++) {
      expectedCrop.set(x>=1&&x<7?[(x+1)*24,y*24,16,255]:[0,0,0,255],(y*8+x)*4);
    }
    check(cropped,expectedCrop,'cropped timeline');
    const pixels=new Uint8Array(4*8*4);
    for(let i=0;i<pixels.length;i+=4) pixels.set([255,0,0,255],i);
    const moving=layer({rgba:pixels,width:4,height:8,version:'moving'});
    const sample=x=>({layers:[{...moving,transform:{position:{x,y:0},scale:{x:1,y:1},rotation:0,anchor:{x:0.5,y:0.5}}}],adjustments:[],precomposites:[]});
    // A 4px-wide rectangle covers the left half, then the right half. Each
    // pixel is red for exactly one of two samples, black for the other.
    const opaque=new Uint8Array(8*8*4), transparent=new Uint8Array(8*8*4);
    for(let i=0;i<opaque.length;i+=4) { opaque.set([128,0,0,255],i); transparent.set([255,0,0,128],i); }
    check(await compositor.renderFrameSamples([sample(-2),sample(2)],{}),opaque,'moving opaque two-sample blur',1);
    check(await compositor.renderFrameSamples([sample(-2),sample(2)],{alpha:true}),transparent,'moving transparent two-sample blur',1);
    globalThis.renderResult='ok';
  } finally { compositor.dispose(); device.destroy(); }
};

import { WebGPUEffectsProcessor } from '../../../packages/timeline/src/render/effects.ts';
const timelineTest=globalThis.renderTest;
globalThis.renderTest=async()=> {
  await timelineTest();
  const adapter=await navigator.gpu.requestAdapter(), device=await adapter.requestDevice();
  const effect=new WebGPUEffectsProcessor(device);
  const input=new Uint8Array([24,48,96,255,144,192,216,255]);
  const source=device.createTexture({size:[2,1],format:'rgba8unorm',usage:GPUTextureUsage.COPY_DST|GPUTextureUsage.TEXTURE_BINDING});
  try {
    device.queue.writeTexture({texture:source},input,{bytesPerRow:8},{width:2,height:1});
    // Independent cube corner values swap R and G. The real effect uploader
    // stores them in a padded rgba16float LUT and the real shader interpolates.
    let cube='LUT_3D_SIZE 2\n';
    for(let b=0;b<2;b++) for(let g=0;g<2;g++) for(let r=0;r<2;r++) cube+=`${g} ${r} ${b}\n`;
    const output=effect.process('half-lut',source,2,1,[{type:'lut',enabled:true,cube,intensity:1}]);
    const read=device.createBuffer({size:256,usage:GPUBufferUsage.MAP_READ|GPUBufferUsage.COPY_DST});
    const encoder=device.createCommandEncoder(); encoder.copyTextureToBuffer({texture:output},{buffer:read,bytesPerRow:256},{width:2,height:1}); device.queue.submit([encoder.finish()]);
    await read.mapAsync(GPUMapMode.READ); const bytes=new Uint8Array(read.getMappedRange());
    const expected=[48,24,96,255,192,144,216,255];
    for(let i=0;i<expected.length;i++) if(Math.abs(bytes[i]-expected[i])>1) throw new Error(`real half-float LUT byte ${i}: ${bytes[i]} expected ${expected[i]}`);
    read.unmap(); read.destroy(); globalThis.renderResult='ok';
  } finally {source.destroy();effect.dispose();device.destroy();}
};

const lutTest=globalThis.renderTest;
globalThis.renderTest=async()=> {
  await lutTest();
  const a=await navigator.gpu.requestAdapter(), d=await a.requestDevice(), other=await a.requestDevice();
  const fail=(fn,label)=> {try{fn();}catch(e){if(e instanceof Error)return;throw e;}throw new Error(label+' accepted');};
  const texture=(format='rgba8unorm',usage=3)=>d.createTexture({size:[4,4],format,usage});
  const objects=[];
  try {
    for(const format of ['rgba8unorm','rgba16float']) {
      const bytes=format==='rgba8unorm'?4:8;
      const src=texture(format), dst=texture(format); objects.push(src,dst);
      const raw=format==='rgba8unorm'?new Uint8Array([25,50,75,255]):new Uint8Array(new Uint16Array([0x3c00,0x3800,0x3400,0x3c00]).buffer);
      // Nonzero upload, source copy, destination copy and readback origins.
      d.queue.writeTexture({texture:src,origin:[1,2]},raw,{bytesPerRow:bytes},[1,1]);
      const read=d.createBuffer({size:256,usage:9}); objects.push(read);
      const enc=d.createCommandEncoder();
      enc.copyTextureToTexture({texture:src,origin:{x:1,y:2}},{texture:dst,origin:[2,1,0]},[1,1,1]);
      enc.copyTextureToBuffer({texture:dst,origin:[2,1]},{buffer:read,bytesPerRow:256},[1,1]);
      d.queue.submit([enc.finish()]); await read.mapAsync(1);
      const actual=new Uint8Array(read.getMappedRange());
      if(!raw.every((x,i)=>x===actual[i])) throw new Error(format+' raw copy bytes');
      read.unmap();
      for(const origin of [{x:4},{y:4},{z:1},{x:-1},{x:0.5},{x:NaN}]) {
        fail(()=>d.createCommandEncoder().copyTextureToTexture({texture:src,origin},{texture:dst},[1,1]),'copy bounds');
        fail(()=>d.queue.writeTexture({texture:dst,origin},raw,{bytesPerRow:bytes},[1,1]),'upload bounds');
        fail(()=>d.createCommandEncoder().copyTextureToTexture({texture:src},{texture:dst,origin},[1,1]),'destination copy bounds');
        fail(()=>d.createCommandEncoder().copyTextureToBuffer({texture:src,origin},{buffer:read,bytesPerRow:256},[1,1]),'readback bounds');
      }
      fail(()=>d.queue.writeTexture({texture:dst},raw.subarray(0,bytes-1),{bytesPerRow:bytes},[1,1]),'short format bytes');
      fail(()=>d.queue.writeTexture({texture:dst},raw,{bytesPerRow:bytes-1},[1,1]),'short format row');
      fail(()=>d.createCommandEncoder().copyTextureToTexture({texture:src},{texture:dst},[1,1,2]),'copy depth');
      const finished=d.createCommandEncoder();finished.finish();
      fail(()=>finished.copyTextureToTexture({texture:src},{texture:dst},[1,1]),'finished encoder');
      fail(()=>d.createCommandEncoder().copyTextureToTexture({texture:src},{texture:src},[1,1]),'same texture');
    }
    const src=texture(), dst=texture(), noSrc=texture('rgba8unorm',2), noDst=texture('rgba8unorm',1), half=texture('rgba16float');
    objects.push(src,dst,noSrc,noDst,half);
    fail(()=>d.createCommandEncoder().copyTextureToTexture({texture:noSrc},{texture:dst},[1,1]),'source usage');
    fail(()=>d.createCommandEncoder().copyTextureToTexture({texture:src},{texture:noDst},[1,1]),'destination usage');
    fail(()=>d.createCommandEncoder().copyTextureToTexture({texture:src},{texture:half},[1,1]),'format mismatch');
    const foreign=other.createTexture({size:[4,4],format:'rgba8unorm',usage:3});
    fail(()=>d.createCommandEncoder().copyTextureToTexture({texture:foreign},{texture:dst},[1,1]),'foreign texture');
    fail(()=>d.createCommandEncoder().copyTextureToTexture({texture:{}},{texture:dst},[1,1]),'unknown texture');
    foreign.destroy();src.destroy();
    fail(()=>d.createCommandEncoder().copyTextureToTexture({texture:src},{texture:dst},[1,1]),'destroyed texture');
    const target=d.createTexture({size:[1,1],format:'rgba16float',usage:16});objects.push(target);
    const pass=d.createCommandEncoder().beginRenderPass({colorAttachments:[{view:target.createView(),loadOp:'clear',storeOp:'store'}]});
    fail(()=>pass.setBlendConstant({r:NaN,g:0,b:0,a:0}),'blend constant');
    fail(()=>pass.setScissorRect(0,0,2,1),'scissor bounds');
    pass.end();fail(()=>pass.setBlendConstant([1,1,1,1]),'ended pass');
    // The command encoder must own temporary textures until submission.
    const retained=d.createBuffer({size:256,usage:9});objects.push(retained);
    const enc=d.createCommandEncoder();
    (()=> {const temp=texture(), target=texture();d.queue.writeTexture({texture:temp},new Uint8Array([1,2,3,4]),{bytesPerRow:4},[1,1]);enc.copyTextureToTexture({texture:temp},{texture:target},[1,1]);enc.copyTextureToBuffer({texture:target},{buffer:retained,bytesPerRow:256},[1,1]);})();
    d.queue.submit([enc.finish()]);await retained.mapAsync(1);
    if(new Uint8Array(retained.getMappedRange()).slice(0,4).join(',')!=='1,2,3,4') throw new Error('temporary resource lifetime');
    retained.unmap();
    const budget=await a.requestDevice();
    const full=budget.createTexture({size:[4096,2048],format:'rgba16float',usage:2});
    fail(()=>budget.createTexture({size:[1,1],format:'rgba8unorm',usage:2}),'half-float byte budget');
    full.destroy(); const again=budget.createTexture({size:[4096,2048],format:'rgba16float',usage:2}); again.destroy();budget.destroy();
    globalThis.renderResult='ok';
  } finally {for(const o of objects)o.destroy();other.destroy();d.destroy();}
};
