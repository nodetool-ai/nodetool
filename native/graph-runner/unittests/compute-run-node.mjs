import { BaseNode } from '@nodetool-ai/node-sdk';
import catalogJson from 'nodetool:gpu-catalog';
export class NativeComputeProbe extends BaseNode {
  static nodeType='native.ComputeProbe';
  static metadataOutputTypes={output:'int'};
  static outputTypes={output:'int'};
  async process() {
    if(__host.gpu.computeResourceCount()!==0) throw new Error('previous run native resources retained');
    if(globalThis.priorComputeBuffer) {
      let stale=false;
      try { priorComputeBuffer.getMappedRange(); } catch(e) {stale=true;}
      if(!stale) throw new Error('previous run buffer remained usable');
    }
    const a=await navigator.gpu.requestAdapter(), d=await a.requestDevice();
    const b=d.createBuffer({size:16,usage:128|4|8}), r=d.createBuffer({size:16,usage:1|8});
    const shader=d.createShaderModule({code:'@group(0) @binding(0) var<storage, read_write> a: array<u32>; @compute @workgroup_size(1) fn main(@builtin(global_invocation_id) i:vec3u) { a[i.x] = a[i.x]*3u+7u; }'});
    const p=d.createComputePipeline({layout:'auto',compute:{module:shader,entryPoint:'main'}});
    const g=d.createBindGroup({layout:p.getBindGroupLayout(0),entries:[{binding:0,resource:{buffer:b}}]});
    d.queue.writeBuffer(b,0,new Uint32Array([1,2,3,4]));
    const enc=d.createCommandEncoder(), pass=enc.beginComputePass(); pass.setPipeline(p);pass.setBindGroup(0,g);pass.dispatchWorkgroups(4);pass.end();enc.copyBufferToBuffer(b,0,r,0,16);d.queue.submit([enc.finish()]);
    await r.mapAsync(1);
    const out=new Uint32Array(r.getMappedRange());
    if(out.join(',')!=='10,13,16,19') throw new Error('compute run bytes '+out);
    globalThis.priorComputeBuffer=r;
    return {output:out[3]};
  }
}
export class NativeCatalogOwnerProbe extends BaseNode {
  static nodeType = 'native.CatalogOwnerProbe';
  static metadataOutputTypes = {output: 'image'};
  static outputTypes = {output: 'image'};
  constructor(properties = {}) {
    super(properties);
    this.hold = properties.hold ?? false;
    this.foreignId = properties.foreignId ?? null;
  }
  async process(context) {
    const gpu = __host.gpu;
    const init = JSON.parse(gpu.init(catalogJson));
    if (!init.ok) throw Error(init.error);
    if (gpu.liveTextures() !== 0) throw Error('prior catalog textures retained');
    if (globalThis.priorCatalogTexture) {
      let stale = false;
      try { gpu.readback(priorCatalogTexture); } catch { stale = true; }
      if (!stale) throw Error('prior catalog handle still valid');
    }
    const id = JSON.parse(gpu.uploadRgba(new Uint8Array([17,31,59,255]), 1, 1, context.jobId)).texture;
    gpu.uploadRgba(new Uint8Array([23,41,67,255]), 1, 1, 'guest-controlled-label');
    if (this.foreignId !== null) {
      for (const operation of [
        () => gpu.readback(this.foreignId),
        () => gpu.release(this.foreignId),
        () => gpu.run(JSON.stringify({module:'color.invert@1', inputs:{source:this.foreignId}, width:1, height:1, run:context.jobId}), '{}')
      ]) {
        let rejected = false;
        try { operation(); } catch { rejected = true; }
        if (!rejected) throw Error('foreign catalog handle accepted');
      }
      context.postMessage({type:'node_log', content:'foreign-output', value:{type:'image', mimeType:'image/x-gpu-texture', texture:{gpu:this.foreignId}}});
    }
    if (this.hold) context.postMessage({type:'node_log', content:'catalog-held', texture_id:id});
    if (Array.from(gpu.readback(id).rgba).join(',') !== '17,31,59,255') throw Error('peer cleanup removed own texture');
    globalThis.priorCatalogTexture = id;
    return {output:{type:'image', mimeType:'image/x-gpu-texture', texture:{gpu:id}, width:1, height:1}};
  }
}
export const parityClasses = [NativeComputeProbe, NativeCatalogOwnerProbe];
