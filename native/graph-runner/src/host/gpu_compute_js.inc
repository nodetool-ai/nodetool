R"JS((acquire => {
  const flags = {
    GPUBufferUsage: {MAP_READ:1,MAP_WRITE:2,COPY_SRC:4,COPY_DST:8,INDEX:16,VERTEX:32,UNIFORM:64,STORAGE:128,INDIRECT:256,QUERY_RESOLVE:512},
    GPUTextureUsage: {COPY_SRC:1,COPY_DST:2,TEXTURE_BINDING:4,STORAGE_BINDING:8,RENDER_ATTACHMENT:16},
    GPUMapMode: {READ:1,WRITE:2}, GPUShaderStage: {VERTEX:1,FRAGMENT:2,COMPUTE:4}
  };
  Object.assign(globalThis, flags);
  globalThis.navigator ??= {};
  navigator.gpu = {async requestAdapter() {
    acquire();
    return {async requestDevice(desc = {}) {
      if (Object.keys(desc).some(k => k !== 'label')) throw new Error('WebGPU device options unsupported');
      // Each logical device has separate resource ownership, even with one backend.
      const call = acquire();
      const handles = new WeakMap(), kinds = new WeakMap();
      const wrap = (h, methods, kind) => { const o = methods; handles.set(o,h); kinds.set(o,kind); return o; };
      const handle = o => {
        const h = handles.get(o);
        if (!h) throw new Error('WebGPU unknown or wrong-device resource');
        return h;
      };
      const unsupported = () => { throw new Error('WebGPU operation unsupported by native subset'); };
      const keys = (desc, allowed) => {
        if (!desc || typeof desc !== 'object' || Object.keys(desc).some(k => !allowed.includes(k))) unsupported();
      };
      const extent = value => {
        if(Array.isArray(value)) {
          if(value.length<1||value.length>3) unsupported();
          return {width:value[0],height:value[1]??1,depthOrArrayLayers:value[2]??1};
        }
        keys(value,['width','height','depthOrArrayLayers']); return value;
      };
      const origin = value => {
        if(value===undefined) return {x:0,y:0,z:0};
        if(Array.isArray(value)) {
          if(value.length>3) unsupported();
          return {x:value[0]??0,y:value[1]??0,z:value[2]??0};
        }
        keys(value,['x','y','z']); return value;
      };
      const copy = value => {
        keys(value,['texture','origin','mipLevel','aspect']);
        if((value.mipLevel!==undefined && value.mipLevel!==0) ||
           (value.aspect!==undefined && value.aspect!=='all')) unsupported();
        return {texture:handle(value.texture),origin:origin(value.origin)};
      };
      const color = value => {
        if(Array.isArray(value)) {
          if(value.length!==4) unsupported();
          return {r:value[0],g:value[1],b:value[2],a:value[3]};
        }
        keys(value,['r','g','b','a']); return value;
      };
      // Resolves when the device is destroyed, as GPUDevice.lost does.
      let markLost;
      const lost = new Promise(resolve => { markLost = resolve; });
      // gpu_device.cpp requests no limits or features, so the device has the
      // WebGPU default limits and no optional features.
      const limits = Object.freeze({
        maxTextureDimension1D:8192, maxTextureDimension2D:8192, maxTextureDimension3D:2048,
        maxTextureArrayLayers:256, maxBindGroups:4, maxBindingsPerBindGroup:1000,
        maxDynamicUniformBuffersPerPipelineLayout:8, maxDynamicStorageBuffersPerPipelineLayout:4,
        maxSampledTexturesPerShaderStage:16, maxSamplersPerShaderStage:16,
        maxStorageBuffersPerShaderStage:8, maxStorageTexturesPerShaderStage:4,
        maxUniformBuffersPerShaderStage:12, maxUniformBufferBindingSize:65536,
        maxStorageBufferBindingSize:134217728, minUniformBufferOffsetAlignment:256,
        minStorageBufferOffsetAlignment:256, maxVertexBuffers:8, maxBufferSize:268435456,
        maxVertexAttributes:16, maxVertexBufferArrayStride:2048, maxInterStageShaderVariables:16,
        maxColorAttachments:8, maxColorAttachmentBytesPerSample:32,
        maxComputeWorkgroupStorageSize:16384, maxComputeInvocationsPerWorkgroup:256,
        maxComputeWorkgroupSizeX:256, maxComputeWorkgroupSizeY:256, maxComputeWorkgroupSizeZ:64,
        maxComputeWorkgroupsPerDimension:65535
      });
      const device = {
        lost, limits, features: new Set(),
        createBuffer(desc) {
          keys(desc,['label','size','usage','mappedAtCreation']);
          const h=call('buffer',desc);
          let offset=0, length=desc.size, state='unmapped';
          return wrap(h, {
            size:desc.size, usage:desc.usage,
            get mapState() { return state; },
            async mapAsync(mode, off=0, size=desc.size-off) {
              const p=call('map',h,mode,off,size); state='pending';
              try { await p; offset=off; length=size; state='mapped'; }
              catch(e) { state='unmapped'; throw e; }
            },
            getMappedRange(off=offset,size=length-(off-offset)) {return call('range',h,off,size);},
            unmap() {call('unmap',h); state='unmapped';},
            destroy() {if(state==='destroyed') return; call('destroy',h); state='destroyed';}
          });
        },
        createShaderModule(desc) {
          keys(desc,['label','code']); if(typeof desc.code!=='string') unsupported();
          return wrap(call('shader',desc),{});
        },
        createComputePipeline(desc) {
          keys(desc,['label','layout','compute']); keys(desc.compute,['module','entryPoint']);

          const h=call('pipeline',handle(desc.compute.module),desc.compute.entryPoint ?? 'main',desc.layout==='auto'?null:handle(desc.layout));
          return wrap(h,{getBindGroupLayout(index) {return wrap(call('layout',h,index),{});}});
        },
        async createComputePipelineAsync(desc) { return device.createComputePipeline(desc); },
        createBindGroup(desc) {
          keys(desc,['label','layout','entries']);
          const entries=desc.entries.map(e => e.resource.buffer?({binding:e.binding,buffer:handle(e.resource.buffer),offset:e.resource.offset??0,...(e.resource.size===undefined?{}:{size:e.resource.size})}):({binding:e.binding,buffer:handle(e.resource),kind:kinds.get(e.resource)}));
          return wrap(call('group',handle(desc.layout),entries),{});
        },
        createCommandEncoder(desc={}) {
          keys(desc,['label']);
          const h=call('encoder');
          return wrap(h,{
            beginRenderPass(desc) {
              if(desc.colorAttachments.length!==1 || desc.depthStencilAttachment) unsupported();
              const a=desc.colorAttachments[0];
              if(a.storeOp!=='store' || !['load','clear'].includes(a.loadOp) || a.resolveTarget) unsupported();
              const p=call('beginRender',h,handle(a.view),a.loadOp,a.clearValue??{});
              return wrap(p,{
                setPipeline(v) {call('renderSetPipeline',p,handle(v));},
                setBlendConstant(value) {call('blendConstant',p,color(value));},
                setScissorRect(x,y,w,h) {call('scissor',p,x,y,w,h);},
                setBindGroup(i,v,offsets) {if(offsets?.length) unsupported(); call('renderSetGroup',p,i,handle(v));},
                draw(n,instances=1,first=0,firstInstance=0) {call('draw',p,n,instances,first,firstInstance);},
                end() {call('renderEnd',p);}
              });
            },
            copyTextureToBuffer(src,dst,size) {
              const from=copy(src);
              keys(dst,['buffer','offset','bytesPerRow','rowsPerImage']);
              call('copyTexture',h,from.texture,handle(dst.buffer),dst,extent(size),from.origin);
            },
            copyTextureToTexture(src,dst,size) {
              const from=copy(src), to=copy(dst);
              call('copyTextureToTexture',h,from.texture,from.origin,to.texture,to.origin,extent(size));
            },
            beginComputePass(desc={}) {
              keys(desc,['label']);
              const p=call('begin',h);
              return wrap(p,{
                setPipeline(v) {call('setPipeline',p,handle(v));},
                setBindGroup(i,v,offsets) {if(offsets?.length) unsupported(); call('setGroup',p,i,handle(v));},
                dispatchWorkgroups(x,y=1,z=1) {call('dispatch',p,x,y,z);},
                end() {call('end',p);}
              });
            },
            copyBufferToBuffer(src,so,dst,off,size) {call('copy',h,handle(src),so,handle(dst),off,size);},
            finish() {return wrap(call('finish',h),{});}
          });
        },
        features:new Set(),
        createTexture(desc) {
          keys(desc,['label','size','format','usage','dimension','mipLevelCount','sampleCount']);
          desc={...desc,size:extent(desc.size)};
          const h=call('texture',desc); let destroyed=false;
          return wrap(h,{
            width:desc.size.width,height:desc.size.height,depthOrArrayLayers:1,
            format:desc.format,usage:desc.usage,mipLevelCount:1,sampleCount:1,dimension:'2d',
            createView(desc={}) {if(Object.keys(desc).some(k=>k!=='label')) unsupported(); return wrap(call('view',h),{},'view');},
            destroy() {if(!destroyed) {call('destroyTexture',h);destroyed=true;}}
          },'texture');
        },
        createSampler(desc={}) {keys(desc,['label','magFilter','minFilter','addressModeU','addressModeV','addressModeW']); return wrap(call('sampler',desc),{},'sampler');},
        createBindGroupLayout(desc) {return wrap(call('bgl',desc.entries),{});},
        createPipelineLayout(desc) {return wrap(call('pipelineLayout',desc.bindGroupLayouts.map(handle)),{});},
        createRenderPipeline(desc) {
          keys(desc,['label','layout','vertex','fragment','primitive','multisample','depthStencil']);
          keys(desc.vertex,['module','entryPoint','buffers']); keys(desc.fragment,['module','entryPoint','targets']);
          if(desc.primitive) keys(desc.primitive,['topology']);
          if(desc.multisample) keys(desc.multisample,['count']);
          for(const t of desc.fragment.targets) keys(t,['format','blend']);
          if(desc.vertex.module!==desc.fragment?.module || desc.vertex.buffers?.length || desc.depthStencil || desc.multisample?.count>1 || desc.fragment.targets.length!==1 || !['rgba8unorm','rgba16float'].includes(desc.fragment.targets[0].format)) unsupported();
          const target=desc.fragment.targets[0];
          if(target.blend) {
            keys(target.blend,['color','alpha']);
            for(const component of [target.blend.color,target.blend.alpha]) {
              keys(component,['srcFactor','dstFactor','operation']);
              if(component.srcFactor!=='constant'||component.dstFactor!=='one'||(component.operation??'add')!=='add') unsupported();
            }
          }
          const h=call('renderPipeline',handle(desc.vertex.module),desc.vertex.entryPoint??'main',desc.fragment.entryPoint??'main',desc.primitive?.topology??'triangle-list',desc.layout==='auto'?null:handle(desc.layout),target.format,!!target.blend);
          return wrap(h,{getBindGroupLayout(i) {return wrap(call('renderLayout',h,i),{});}});
        },
        queue: {
          writeTexture(dst,data,layout,size) {
            const to=copy(dst);
            keys(layout,['offset','bytesPerRow','rowsPerImage']);
            call('writeTexture',to.texture,data,layout,extent(size),to.origin);
          },
          writeBuffer(b,off,data,dataOffset=0,size) {
            const unit=ArrayBuffer.isView(data)?data.BYTES_PER_ELEMENT:1;
            if(!unit || !Number.isSafeInteger(dataOffset)||dataOffset<0 || (size!==undefined&&(!Number.isSafeInteger(size)||size<0))) throw new Error('WebGPU invalid data range');
            const view=ArrayBuffer.isView(data)?new Uint8Array(data.buffer,data.byteOffset,data.byteLength):new Uint8Array(data);
            const start=dataOffset*unit, len=size===undefined?view.length-start:size*unit;
            if(start>view.length || len>view.length-start) throw new Error('WebGPU data range exceeds input');
            call('write',handle(b),off,view.subarray(start,start+len));
          },
          submit(commands) {call('submit',commands.map(handle));},
          async onSubmittedWorkDone() {await call('done');}
        },
        destroy() {call('destroyDevice'); markLost({reason:'destroyed', message:'Device destroyed'});},
        pushErrorScope:unsupported, popErrorScope:unsupported,

      };
      return device;
    }};
  }};
}))JS"
