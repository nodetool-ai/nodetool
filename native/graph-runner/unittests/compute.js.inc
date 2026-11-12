R"JS((async () => {
  const assert=(x,m)=>{if(!x) throw new Error(m);};
  const rejects=async(f,m)=>{try{await f();}catch(e){assert(e instanceof Error,m+' error identity');return;}throw new Error(m+' accepted');};
  const ap=navigator.gpu.requestAdapter(); assert(ap instanceof Promise,'adapter promise');
  const a=await ap, dp=a.requestDevice(); assert(dp instanceof Promise,'device promise');
  const d=await dp;
  await rejects(()=>d.createShaderModule({code:'this is not valid WGSL'}),'WGSL');
  const s=d.createShaderModule({code:`@group(0) @binding(0) var<storage,read_write> data: array<u32>;
    @compute @workgroup_size(1) fn main(@builtin(global_invocation_id) id: vec3u) {
      data[id.x] = data[id.x] * 3u + 7u;
    }`});
  const p=d.createComputePipeline({layout:'auto',compute:{module:s,entryPoint:'main'}});
  const input=new Uint32Array([0,1,17,255,65535,123456789,0xffffffff,42]);
  const expected=Array.from(input,x=>(Math.imul(x,3)+7)>>>0);
  for(let repeat=0;repeat<8;repeat++) {
    const b=d.createBuffer({size:input.byteLength,usage:GPUBufferUsage.STORAGE|GPUBufferUsage.COPY_SRC|GPUBufferUsage.COPY_DST});
    const read=d.createBuffer({size:input.byteLength,usage:GPUBufferUsage.MAP_READ|GPUBufferUsage.COPY_DST});
    const group=d.createBindGroup({layout:p.getBindGroupLayout(0),entries:[{binding:0,resource:{buffer:b}}]});
    d.queue.writeBuffer(b,0,input);
    const enc=d.createCommandEncoder(), pass=enc.beginComputePass(); pass.setPipeline(p); pass.setBindGroup(0,group); pass.dispatchWorkgroups(input.length); pass.end();
    enc.copyBufferToBuffer(b,0,read,0,input.byteLength);
    const cmd=enc.finish(); d.queue.submit([cmd]);
    await rejects(()=>d.queue.submit([cmd]),'double submit');
    const fence=d.queue.onSubmittedWorkDone(); assert(fence instanceof Promise,'fence promise'); await fence;
    const map=read.mapAsync(GPUMapMode.READ); assert(map instanceof Promise,'map promise'); assert(read.mapState==='pending','nonblocking map'); await map;
    const range=read.getMappedRange(); assert(range instanceof ArrayBuffer,'ArrayBuffer');
    assert(range.byteLength===input.byteLength,'readback byte length');
    const expectedBytes=new Uint8Array(new Uint32Array(expected).buffer);
    assert(new Uint8Array(range).every((x,i)=>x===expectedBytes[i]),'exact expected bytes');
    assert(Array.from(new Uint32Array(range)).every((x,i)=>x===expected[i]),'compute bytes');
    read.unmap(); await rejects(()=>read.getMappedRange(),'unmapped'); read.destroy(); read.destroy(); b.destroy();
    await rejects(()=>d.queue.writeBuffer(b,0,input),'destroyed');
  }
  for(const size of [NaN,Infinity,-1,1.5,67108868]) await rejects(()=>d.createBuffer({size,usage:128}),'bad size');
  await rejects(()=>d.queue.writeBuffer({},0,input),'unknown');
  const d2=await a.requestDevice(); const other=d2.createBuffer({size:32,usage:8});
  await rejects(()=>d.queue.writeBuffer(other,0,input),'wrong device'); other.destroy();
  const pending=d.createBuffer({size:32,usage:1|8}); const m=pending.mapAsync(1); pending.destroy(); await rejects(()=>m,'cancel map');
  await rejects(()=>d.pushErrorScope('validation'),'unsupported scopes');
  d2.destroy(); d.destroy();
  globalThis.computeResult='ok';
})().catch(e=>{globalThis.computeResult=String(e)+' '+String(e.stack??'');}))JS"
