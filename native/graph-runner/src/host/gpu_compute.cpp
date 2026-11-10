// Independent implementation informed by Mystral's native-handle JS wrapper
// pattern, pinned bafab09d599bd55aeb7433ba7131c3f320334c99. No copied code.
#include "host/gpu.h"
#include "host/gpu_device.h"
#include "kernel/task.h"
#include <webgpu/webgpu.h>
#include <webgpu/wgpu.h>
#include <cmath>
#include <atomic>
#include <mutex>
#include <algorithm>
#include <set>

namespace gr::host {
namespace {
using V = js::Value;
using E = js::Engine;
using Args = const std::vector<V>&;
struct Resource;
struct State { std::set<uint64_t> timers; std::vector<std::weak_ptr<Resource>> resources; std::shared_ptr<gpu::Device> device; size_t bytes = 0, count = 0, pendingCount = 0; bool dead = false; };
enum Kind { Buffer, Shader, Pipeline, Layout, Group, Encoder, Pass, Commands, Texture, View, Sampler, PipelineLayout, RenderPipeline, RenderPass };
struct Resource : js::NativePayload {
  // native-rules #1: Resource and Pending share State, no justification
  std::shared_ptr<State> state;
  Kind kind;
  // native-rules #6: type-erased raw WGPU handle freed by a switch in release()
  void* handle = nullptr;
  uint32_t width=0,height=0,texelBytes=0;
  WGPUTextureFormat format=WGPUTextureFormat_Undefined;
  uint64_t size = 0, usage = 0, offset = 0, length = 0;
  bool dead = false, pending = false, mapped = false, active = false, used = false;
  // native-rules #1: Resource tree shared with JS payloads, no justification
  std::shared_ptr<Resource> parent;
  std::vector<std::shared_ptr<Resource>> dependencies;
  Resource(std::shared_ptr<State> s, Kind k) : state(std::move(s)), kind(k) {
    if (state->count >= 4096) throw std::runtime_error("WebGPU resource budget exceeded");
    ++state->count;
  }
  ~Resource() {
    if (handle) {
      try { state->device->compute([&](void*, void*, void*) { release(); }); }
      catch (const std::exception& ex) { std::fprintf(stderr,"[gpu] release: %s\n",ex.what()); }
    }
    releaseAllocation();
    --state->count;
  }
  void releaseAllocation() { state->bytes-=size; size=0; }
  void release() {
    switch (kind) {
      case Buffer: wgpuBufferDestroy((WGPUBuffer)handle); wgpuBufferRelease((WGPUBuffer)handle); break;
      case Shader: wgpuShaderModuleRelease((WGPUShaderModule)handle); break;
      case Pipeline: wgpuComputePipelineRelease((WGPUComputePipeline)handle); break;
      case Layout: wgpuBindGroupLayoutRelease((WGPUBindGroupLayout)handle); break;
      case Group: wgpuBindGroupRelease((WGPUBindGroup)handle); break;
      case Encoder: wgpuCommandEncoderRelease((WGPUCommandEncoder)handle); break;
      case Pass: wgpuComputePassEncoderRelease((WGPUComputePassEncoder)handle); break;
      case Commands: wgpuCommandBufferRelease((WGPUCommandBuffer)handle); break;
      case Texture: wgpuTextureDestroy((WGPUTexture)handle); wgpuTextureRelease((WGPUTexture)handle); break;
      case View: wgpuTextureViewRelease((WGPUTextureView)handle); break;
      case Sampler: wgpuSamplerRelease((WGPUSampler)handle); break;
      case PipelineLayout: wgpuPipelineLayoutRelease((WGPUPipelineLayout)handle); break;
      case RenderPipeline: wgpuRenderPipelineRelease((WGPURenderPipeline)handle); break;
      case RenderPass: wgpuRenderPassEncoderRelease((WGPURenderPassEncoder)handle); break;
    }
    handle = nullptr;
    releaseAllocation();
  }
};
void releaseState(const std::shared_ptr<State>& s) {
  while(!s->timers.empty()) {
    const auto id=*s->timers.begin(); s->timers.erase(s->timers.begin());
    Loop::current().clearTimer(id);
  }
  s->dead=true;
  s->device->compute([&](void* i,void* d,void*) {
    for(auto& wr:s->resources) if(auto r=wr.lock()) {
      if(r->handle) r->release();
      r->dead=true;
    }
    wgpuDevicePoll((WGPUDevice)d,false,nullptr);
    wgpuInstanceProcessEvents((WGPUInstance)i);
  });
}
uint64_t num(E& e, const V& v, uint64_t max = 67108864) {
  if (!e.isNumber(v)) throw std::runtime_error("WebGPU expected a numeric integer");
  double n = e.toNumber(v);
  if (!std::isfinite(n) || n < 0 || n > double(max) || n != std::floor(n)) throw std::runtime_error("WebGPU integer out of range");
  return uint64_t(n);
}
uint64_t field(E& e, const V& v, const char* key, uint64_t fallback = 0) {
  auto f = e.get(v, key); return e.isUndefined(f) ? fallback : num(e, f);
}
std::shared_ptr<Resource> resource(E& e, const V& v, const std::shared_ptr<State>& s, Kind kind) {
  auto p = e.nativePayload(v);
  if (!p) throw std::runtime_error("WebGPU unknown resource");
  auto r = std::dynamic_pointer_cast<Resource>(p);
  if (!r) throw std::runtime_error("WebGPU unknown resource type");
  if (r->state != s || r->kind != kind || r->dead || s->dead || (r->parent && r->parent->dead)) throw std::runtime_error("WebGPU stale or wrong-device resource");
  return r;
}
// native-rules #9: written by a wgpu callback and read on the loop, no affinity comment
// native-rules #10: mutex does not name the data it guards
struct Completion { std::atomic<bool> done{false}; std::mutex mutex; std::string error; };
// Callbacks only publish native status. JS settlement happens in a loop timer.
struct Pending {
  E* engine;
  js::PromiseCapability promise;
  std::shared_ptr<State> state;
  std::shared_ptr<Resource> buffer;
  std::shared_ptr<Completion> completion;
  bool settled = false;
  uint64_t timer = 0;
  ~Pending() {
    if (state) { state->timers.erase(timer); --state->pendingCount; }
    if (settled) return;
    try {
      state->device->compute([&](void* i,void* d,void*) {
        if(buffer && buffer->pending && !buffer->dead) wgpuBufferUnmap((WGPUBuffer)buffer->handle);
        wgpuDevicePoll((WGPUDevice)d,false,nullptr);
        wgpuInstanceProcessEvents((WGPUInstance)i);
      });
      if(buffer) buffer->pending=false;
      auto error=engine->evaluateScript("new Error('WebGPU operation cancelled')","gpu-cancel");
      engine->call(promise.reject,engine->undefined(),{error});
    } catch(const std::exception& ex) {
      std::fprintf(stderr,"[gpu] cancellation: %s\n",ex.what());
    }
  }
};
void poll(const std::shared_ptr<Pending>& p) {
  p->timer = Loop::current().setTimer(std::chrono::milliseconds(1), [p] {
    p->state->timers.erase(p->timer);
    p->state->device->compute([](void* i, void* d, void*) {
      wgpuDevicePoll((WGPUDevice)d, false, nullptr);
      wgpuInstanceProcessEvents((WGPUInstance)i);
    });
    if (!p->completion->done.load()) { poll(p); return; }
    auto& e = *p->engine;
    std::string error;
    { std::lock_guard lock(p->completion->mutex); error = p->completion->error; }
    if (p->buffer) {
      p->buffer->pending = false;
      if (p->buffer->dead) error = "WebGPU buffer destroyed during map";
      p->buffer->mapped = error.empty();
    }
    if (p->state->dead) error = "WebGPU device destroyed";
    p->settled = true;
    auto value = error.empty() ? e.undefined() : e.evaluateScript("new Error(" + Json(error).dump() + ")", "gpu-error");
    e.call(error.empty() ? p->promise.resolve : p->promise.reject, e.undefined(), {value});
  });
  p->state->timers.insert(p->timer);
}
void complete(const std::shared_ptr<Completion>& c, bool ok, WGPUStringView message) {
  { std::lock_guard lock(c->mutex); if (!ok) c->error = message.data ? std::string(message.data, message.length) : "WebGPU operation failed"; }
  c->done = true;
}
struct TextureFormat {
  WGPUTextureFormat native;
  uint32_t bytes;
};
TextureFormat textureFormat(const std::string& name) {
  if(name=="rgba8unorm") return {WGPUTextureFormat_RGBA8Unorm,4};
  if(name=="rgba16float") return {WGPUTextureFormat_RGBA16Float,8};
  throw std::runtime_error("WebGPU texture format unsupported: "+name);
}
WGPUTexelCopyTextureInfo textureCopy(E& e, const V& origin, const std::shared_ptr<Resource>& texture,
                                     uint64_t width, uint64_t height, uint64_t depth) {
  const auto x=field(e,origin,"x"), y=field(e,origin,"y"), z=field(e,origin,"z");
  if(!width||!height||depth!=1||z||x>texture->width||width>texture->width-x||
     y>texture->height||height>texture->height-y) throw std::runtime_error("WebGPU texture copy bounds invalid");
  WGPUTexelCopyTextureInfo info=WGPU_TEXEL_COPY_TEXTURE_INFO_INIT;
  info.texture=(WGPUTexture)texture->handle; info.origin={(uint32_t)x,(uint32_t)y,0};
  return info;
}
V invoke(E& e, Args a, const std::shared_ptr<State>& s) {
  if (a.empty()) throw std::runtime_error("WebGPU missing operation");
  auto op = e.toString(a[0]);
  auto arg = [&](size_t i) -> V { if (i >= a.size()) throw std::runtime_error("WebGPU missing argument"); return a[i]; };
  if (s->dead && op == "destroyDevice") return e.undefined();
  if (s->dead && op != "stats") throw std::runtime_error("WebGPU device destroyed");
  V out = e.undefined();
  if (op == "stats") return e.number(double(s->count));
  if (op == "destroyDevice") { releaseState(s); return out; }
  auto get = [&](size_t i, Kind k) { return resource(e,arg(i),s,k); };
  auto make = [&](Kind k) {
    if(s->resources.size()>=8192) std::erase_if(s->resources,[](const auto& r) { return r.expired(); });
    auto r = std::make_shared<Resource>(s,k); s->resources.push_back(r); return r;
  };
  std::shared_ptr<Pending> pending;
  s->device->compute([&](void*, void* device, void* queue) {
    auto d = (WGPUDevice)device; auto q = (WGPUQueue)queue;
    if(op=="texture") {
      auto desc=arg(1), dims=e.get(desc,"size"); auto w=field(e,dims,"width"), h=field(e,dims,"height",1);
      auto format=e.toString(e.get(desc,"format")); auto usage=field(e,desc,"usage");
      const auto fmt=textureFormat(format);
      if(!w || !h || w>8192 || h>8192 || w*h*fmt.bytes>67108864-s->bytes || !usage || (usage&~31ull) || field(e,dims,"depthOrArrayLayers",1)!=1 || field(e,desc,"mipLevelCount",1)!=1 || field(e,desc,"sampleCount",1)!=1) throw std::runtime_error("WebGPU texture descriptor unsupported or over budget");
      auto dim=e.get(desc,"dimension"); if(!e.isUndefined(dim)&&e.toString(dim)!="2d") throw std::runtime_error("WebGPU only 2d textures supported");
      WGPUTextureDescriptor td=WGPU_TEXTURE_DESCRIPTOR_INIT; td.size={(uint32_t)w,(uint32_t)h,1}; td.format=fmt.native; td.usage=usage;
      auto r=make(Texture); r->handle=wgpuDeviceCreateTexture(d,&td); r->width=w; r->height=h; r->format=fmt.native; r->texelBytes=fmt.bytes; r->usage=usage; r->size=w*h*fmt.bytes; s->bytes+=r->size; out=e.nativeObject(r);
    } else if(op=="view") {
      auto t=get(1,Texture); auto r=make(View); r->parent=t; r->handle=wgpuTextureCreateView((WGPUTexture)t->handle,nullptr); out=e.nativeObject(r);
    } else if(op=="sampler") {
      auto desc=arg(1); WGPUSamplerDescriptor sd=WGPU_SAMPLER_DESCRIPTOR_INIT;
      auto filter=[&](const char* key) { auto v=e.get(desc,key); if(e.isUndefined(v)||e.toString(v)=="nearest") return WGPUFilterMode_Nearest; if(e.toString(v)=="linear") return WGPUFilterMode_Linear; throw std::runtime_error("WebGPU unsupported filter"); };
      sd.magFilter=filter("magFilter"); sd.minFilter=filter("minFilter");
      auto addr=[&](const char* key) { auto v=e.get(desc,key); if(e.isUndefined(v)||e.toString(v)=="clamp-to-edge") return WGPUAddressMode_ClampToEdge; if(e.toString(v)=="repeat") return WGPUAddressMode_Repeat; if(e.toString(v)=="mirror-repeat") return WGPUAddressMode_MirrorRepeat; throw std::runtime_error("WebGPU unsupported address mode"); };
      sd.addressModeU=addr("addressModeU"); sd.addressModeV=addr("addressModeV"); sd.addressModeW=addr("addressModeW");
      auto r=make(Sampler); r->handle=wgpuDeviceCreateSampler(d,&sd); out=e.nativeObject(r);
    } else if(op=="bgl") {
      auto entries=arg(1); auto count=field(e,entries,"length"); if(count>32) throw std::runtime_error("WebGPU layout budget exceeded");
      std::vector<WGPUBindGroupLayoutEntry> es(count);
      for(size_t i=0;i<count;++i) {
        auto v=e.get(entries,std::to_string(i)); auto& en=es[i]; en=WGPU_BIND_GROUP_LAYOUT_ENTRY_INIT; en.binding=field(e,v,"binding"); en.visibility=field(e,v,"visibility");
        auto b=e.get(v,"buffer"), t=e.get(v,"texture"), st=e.get(v,"storageTexture"), sa=e.get(v,"sampler");
        if(!e.isUndefined(b)) {
          auto type=e.get(b,"type"); auto name=e.isUndefined(type)?"uniform":e.toString(type);
          en.buffer.type=name=="uniform"?WGPUBufferBindingType_Uniform:name=="storage"?WGPUBufferBindingType_Storage:name=="read-only-storage"?WGPUBufferBindingType_ReadOnlyStorage:WGPUBufferBindingType_Undefined;
          en.buffer.minBindingSize=field(e,b,"minBindingSize"); if(e.toBoolean(e.get(b,"hasDynamicOffset"))) throw std::runtime_error("WebGPU dynamic offsets unsupported");
        } else if(!e.isUndefined(t)) {
          auto sample=e.get(t,"sampleType"), dim=e.get(t,"viewDimension");
          if((!e.isUndefined(sample)&&e.toString(sample)!="float")||(!e.isUndefined(dim)&&e.toString(dim)!="2d")||e.toBoolean(e.get(t,"multisampled"))) throw std::runtime_error("WebGPU texture layout unsupported");
          en.texture.sampleType=WGPUTextureSampleType_Float; en.texture.viewDimension=WGPUTextureViewDimension_2D; }
        else if(!e.isUndefined(st)) {
          if(e.toString(e.get(st,"format"))!="rgba8unorm") throw std::runtime_error("WebGPU storage texture format unsupported");
          auto access=e.get(st,"access"), dim=e.get(st,"viewDimension");
          if((!e.isUndefined(access)&&e.toString(access)!="write-only")||(!e.isUndefined(dim)&&e.toString(dim)!="2d")) throw std::runtime_error("WebGPU storage texture layout unsupported");
          en.storageTexture.format=WGPUTextureFormat_RGBA8Unorm; en.storageTexture.viewDimension=WGPUTextureViewDimension_2D; en.storageTexture.access=WGPUStorageTextureAccess_WriteOnly;
        } else if(!e.isUndefined(sa)) {
          auto type=e.get(sa,"type"); auto name=e.isUndefined(type)?"filtering":e.toString(type);
          if(name!="filtering"&&name!="non-filtering") throw std::runtime_error("WebGPU sampler layout unsupported");
          en.sampler.type=name=="filtering"?WGPUSamplerBindingType_Filtering:WGPUSamplerBindingType_NonFiltering;
        }
        else throw std::runtime_error("WebGPU binding layout unsupported");
      }
      WGPUBindGroupLayoutDescriptor bd=WGPU_BIND_GROUP_LAYOUT_DESCRIPTOR_INIT; bd.entryCount=count; bd.entries=es.data(); auto r=make(Layout); r->handle=wgpuDeviceCreateBindGroupLayout(d,&bd); out=e.nativeObject(r);
    } else if(op=="pipelineLayout") {
      auto list=arg(1); auto count=field(e,list,"length"); if(count>4) throw std::runtime_error("WebGPU too many bind group layouts");
      std::vector<WGPUBindGroupLayout> layouts; for(size_t i=0;i<count;++i) layouts.push_back((WGPUBindGroupLayout)resource(e,e.get(list,std::to_string(i)),s,Layout)->handle);
      WGPUPipelineLayoutDescriptor pd=WGPU_PIPELINE_LAYOUT_DESCRIPTOR_INIT; pd.bindGroupLayoutCount=count; pd.bindGroupLayouts=layouts.data(); auto r=make(PipelineLayout); r->handle=wgpuDeviceCreatePipelineLayout(d,&pd); out=e.nativeObject(r);
    } else if(op=="renderPipeline") {
      auto shader=get(1,Shader); auto ve=e.toString(arg(2)), fe=e.toString(arg(3)), topology=e.toString(arg(4));
      WGPUColorTargetState target=WGPU_COLOR_TARGET_STATE_INIT;
      target.format=textureFormat(e.toString(arg(6))).native;
      WGPUBlendState blend=WGPU_BLEND_STATE_INIT;
      if(e.toBoolean(arg(7))) {
        blend.color.operation=blend.alpha.operation=WGPUBlendOperation_Add;
        blend.color.srcFactor=blend.alpha.srcFactor=WGPUBlendFactor_Constant;
        blend.color.dstFactor=blend.alpha.dstFactor=WGPUBlendFactor_One;
        target.blend=&blend;
      }
      WGPUFragmentState frag=WGPU_FRAGMENT_STATE_INIT; frag.module=(WGPUShaderModule)shader->handle; frag.entryPoint={fe.data(),fe.size()}; frag.targetCount=1; frag.targets=&target;
      WGPURenderPipelineDescriptor pd=WGPU_RENDER_PIPELINE_DESCRIPTOR_INIT; pd.vertex.module=(WGPUShaderModule)shader->handle; pd.vertex.entryPoint={ve.data(),ve.size()}; pd.fragment=&frag;
      if(!e.isNull(arg(5))) pd.layout=(WGPUPipelineLayout)get(5,PipelineLayout)->handle;
      if(topology=="triangle-list") pd.primitive.topology=WGPUPrimitiveTopology_TriangleList; else if(topology=="triangle-strip") pd.primitive.topology=WGPUPrimitiveTopology_TriangleStrip; else throw std::runtime_error("WebGPU topology unsupported");
      auto r=make(RenderPipeline); r->handle=wgpuDeviceCreateRenderPipeline(d,&pd); out=e.nativeObject(r);
    } else if(op=="renderLayout") {
      auto p=get(1,RenderPipeline); auto r=make(Layout); r->handle=wgpuRenderPipelineGetBindGroupLayout((WGPURenderPipeline)p->handle,num(e,arg(2),3)); out=e.nativeObject(r);
    } else if(op=="beginRender") {
      auto enc=get(1,Encoder), view=get(2,View); if(enc->used||enc->active||!(view->parent->usage&WGPUTextureUsage_RenderAttachment)) throw std::runtime_error("WebGPU encoder unavailable");
      WGPURenderPassColorAttachment ca=WGPU_RENDER_PASS_COLOR_ATTACHMENT_INIT; ca.view=(WGPUTextureView)view->handle; ca.loadOp=e.toString(arg(3))=="load"?WGPULoadOp_Load:WGPULoadOp_Clear; ca.storeOp=WGPUStoreOp_Store;
      auto color=arg(4); auto channel=[&](const char* key) { auto v=e.get(color,key); if(e.isUndefined(v)) return 0.0; auto n=e.toNumber(v); if(!std::isfinite(n)) throw std::runtime_error("WebGPU nonfinite clear color"); return n; }; ca.clearValue={channel("r"),channel("g"),channel("b"),channel("a")};
      WGPURenderPassDescriptor pd=WGPU_RENDER_PASS_DESCRIPTOR_INIT; pd.colorAttachmentCount=1; pd.colorAttachments=&ca;
      auto r=make(RenderPass); r->parent=enc; r->width=view->parent->width; r->height=view->parent->height; enc->dependencies.push_back(view); r->handle=wgpuCommandEncoderBeginRenderPass((WGPUCommandEncoder)enc->handle,&pd); enc->active=true; out=e.nativeObject(r);
    } else if(op=="renderSetPipeline"||op=="renderSetGroup"||op=="draw"||op=="blendConstant"||op=="scissor"||op=="renderEnd") {
      auto pass=get(1,RenderPass); if(pass->used) throw std::runtime_error("WebGPU render pass ended"); auto h=(WGPURenderPassEncoder)pass->handle;
      if(op=="renderSetPipeline") { auto p=get(2,RenderPipeline); pass->parent->dependencies.push_back(p); wgpuRenderPassEncoderSetPipeline(h,(WGPURenderPipeline)p->handle); }
      else if(op=="renderSetGroup") { auto g=get(3,Group); pass->parent->dependencies.push_back(g); wgpuRenderPassEncoderSetBindGroup(h,num(e,arg(2),3),(WGPUBindGroup)g->handle,0,nullptr); }
      else if(op=="scissor") {
        const auto x=num(e,arg(2)), y=num(e,arg(3)), w=num(e,arg(4)), height=num(e,arg(5));
        if(x>pass->width||w>pass->width-x||y>pass->height||height>pass->height-y) throw std::runtime_error("WebGPU scissor bounds invalid");
        wgpuRenderPassEncoderSetScissorRect(h,x,y,w,height);
      }
      else if(op=="blendConstant") {
        auto color=arg(2);
        auto channel=[&](const char* key) { auto v=e.get(color,key); if(!e.isNumber(v)) throw std::runtime_error("WebGPU blend constant must be numeric"); auto n=e.toNumber(v); if(!std::isfinite(n)) throw std::runtime_error("WebGPU blend constant must be finite"); return n; };
        WGPUColor constant={channel("r"),channel("g"),channel("b"),channel("a")};
        wgpuRenderPassEncoderSetBlendConstant(h,&constant);
      }
      else if(op=="draw") wgpuRenderPassEncoderDraw(h,num(e,arg(2),1048576),num(e,arg(3),1024),num(e,arg(4)),num(e,arg(5)));
      else { wgpuRenderPassEncoderEnd(h); pass->used=true; pass->parent->active=false; }
    } else if(op=="copyTextureToTexture") {
      auto enc=get(1,Encoder), src=get(2,Texture), dst=get(4,Texture); auto extent=arg(6);
      const auto w=field(e,extent,"width"), h=field(e,extent,"height",1), depth=field(e,extent,"depthOrArrayLayers",1);
      if(enc->active||enc->used||src==dst||src->format!=dst->format||!(src->usage&WGPUTextureUsage_CopySrc)||!(dst->usage&WGPUTextureUsage_CopyDst)) throw std::runtime_error("WebGPU texture copy state/format/usage invalid");
      auto from=textureCopy(e,arg(3),src,w,h,depth), to=textureCopy(e,arg(5),dst,w,h,depth);
      WGPUExtent3D size={(uint32_t)w,(uint32_t)h,1};
      enc->dependencies.push_back(src); enc->dependencies.push_back(dst);
      wgpuCommandEncoderCopyTextureToTexture((WGPUCommandEncoder)enc->handle,&from,&to,&size);
    } else if(op=="writeTexture"||op=="copyTexture") {
      size_t base=op=="writeTexture"?1:2; auto tex=get(base,Texture); auto layout=arg(base+2), extent=arg(base+3);
      auto w=field(e,extent,"width"), h=field(e,extent,"height",1), depth=field(e,extent,"depthOrArrayLayers",1);
      auto row=field(e,layout,"bytesPerRow",w*tex->texelBytes), rows=field(e,layout,"rowsPerImage",h), off=field(e,layout,"offset");
      auto ti=textureCopy(e,arg(base+4),tex,w,h,depth);
      if(row<w*tex->texelBytes||rows<h||off%tex->texelBytes) throw std::runtime_error("WebGPU texture copy layout invalid");
      WGPUExtent3D size={(uint32_t)w,(uint32_t)h,1};
      WGPUTexelCopyBufferLayout bl=WGPU_TEXEL_COPY_BUFFER_LAYOUT_INIT; bl.offset=off; bl.bytesPerRow=row; bl.rowsPerImage=rows;
      const uint64_t required=off+row*(h-1)+w*tex->texelBytes;
      if(op=="writeTexture") {
        if(!(tex->usage&WGPUTextureUsage_CopyDst)||!e.isBytes(arg(base+1))||e.byteLength(arg(base+1))>67108864) throw std::runtime_error("WebGPU texture upload usage/byte budget invalid");
        if(required>e.byteLength(arg(base+1))) throw std::runtime_error("WebGPU texture data too short");
        auto data=e.viewBytes(arg(base+1)); wgpuQueueWriteTexture(q,&ti,data.data(),data.size(),&bl,&size);
      } else {
        auto enc=get(1,Encoder), buf=get(base+1,Buffer);
        if(enc->used||enc->active||buf->mapped||buf->pending||row%256||required>buf->size||!(tex->usage&WGPUTextureUsage_CopySrc)||!(buf->usage&WGPUBufferUsage_CopyDst)) throw std::runtime_error("WebGPU texture copy state/usage/range invalid");
        WGPUTexelCopyBufferInfo bi=WGPU_TEXEL_COPY_BUFFER_INFO_INIT; bi.buffer=(WGPUBuffer)buf->handle; bi.layout=bl;
        enc->dependencies.push_back(tex); enc->dependencies.push_back(buf);
        wgpuCommandEncoderCopyTextureToBuffer((WGPUCommandEncoder)enc->handle,&ti,&bi,&size);
      }
    } else if(op=="destroyTexture") { auto t=get(1,Texture); wgpuTextureDestroy((WGPUTexture)t->handle); t->dead=true; t->releaseAllocation();
    } else if (op == "buffer") {
      auto desc = arg(1); uint64_t size = field(e,desc,"size"), usage = field(e,desc,"usage");
      if (!size || size % 4 || !usage || (usage & ~1023ull) || size > 67108864 - s->bytes) throw std::runtime_error("WebGPU buffer size/usage/budget invalid");
      if (e.toBoolean(e.get(desc,"mappedAtCreation"))) throw std::runtime_error("WebGPU mappedAtCreation unsupported, use queue.writeBuffer");
      auto r=make(Buffer); WGPUBufferDescriptor bd=WGPU_BUFFER_DESCRIPTOR_INIT; bd.size=size; bd.usage=usage;
      r->handle=wgpuDeviceCreateBuffer(d,&bd); r->size=size; r->usage=usage; s->bytes+=size; out=e.nativeObject(r);
    } else if (op == "shader") {
      auto code=e.toString(e.get(arg(1),"code")); if(code.size()>1048576) throw std::runtime_error("WebGPU shader budget exceeded");
      WGPUShaderSourceWGSL wg=WGPU_SHADER_SOURCE_WGSL_INIT; wg.code={code.data(),code.size()};
      WGPUShaderModuleDescriptor sd=WGPU_SHADER_MODULE_DESCRIPTOR_INIT; sd.nextInChain=&wg.chain;
      auto r=make(Shader); r->handle=wgpuDeviceCreateShaderModule(d,&sd); out=e.nativeObject(r);
    } else if (op == "pipeline") {
      auto shader=get(1,Shader); auto entry=e.toString(arg(2));
      WGPUComputePipelineDescriptor pd=WGPU_COMPUTE_PIPELINE_DESCRIPTOR_INIT; pd.compute.module=(WGPUShaderModule)shader->handle; pd.compute.entryPoint={entry.data(),entry.size()}; if(a.size()>3&&!e.isNull(arg(3))) pd.layout=(WGPUPipelineLayout)get(3,PipelineLayout)->handle;
      auto r=make(Pipeline); r->handle=wgpuDeviceCreateComputePipeline(d,&pd); out=e.nativeObject(r);
    } else if (op == "layout") {
      auto p=get(1,Pipeline); auto r=make(Layout); r->handle=wgpuComputePipelineGetBindGroupLayout((WGPUComputePipeline)p->handle,num(e,arg(2),3)); out=e.nativeObject(r);
    } else if (op == "group") {
      auto layout=get(1,Layout); auto entries=arg(2); size_t count=field(e,entries,"length"); if(count>32) throw std::runtime_error("WebGPU binding budget exceeded");
      std::vector<WGPUBindGroupEntry> es(count); auto r=make(Group);
      for(size_t i=0;i<count;++i) {
        auto item=e.get(entries,std::to_string(i)); auto bv=e.get(item,"buffer");
        auto type=e.get(item,"kind"); auto name=e.isUndefined(type)?"buffer":e.toString(type);
        if(name!="buffer") {
          auto rsrc=resource(e,bv,s,name=="view"?View:Sampler); r->dependencies.push_back(rsrc); es[i]=WGPU_BIND_GROUP_ENTRY_INIT; es[i].binding=field(e,item,"binding");
          if(name=="view") es[i].textureView=(WGPUTextureView)rsrc->handle; else es[i].sampler=(WGPUSampler)rsrc->handle;
          continue;
        }
        auto b=resource(e,bv,s,Buffer);
        auto off=field(e,item,"offset"), len=field(e,item,"size",b->size-off);
        if(off>b->size || !len || len>b->size-off || b->mapped || b->pending) throw std::runtime_error("WebGPU binding range invalid");
        r->dependencies.push_back(b); es[i]=WGPU_BIND_GROUP_ENTRY_INIT; es[i].binding=field(e,item,"binding"); es[i].buffer=(WGPUBuffer)b->handle; es[i].offset=off; es[i].size=len;
      }
      WGPUBindGroupDescriptor gd=WGPU_BIND_GROUP_DESCRIPTOR_INIT; gd.layout=(WGPUBindGroupLayout)layout->handle; gd.entryCount=count; gd.entries=es.data();
      r->handle=wgpuDeviceCreateBindGroup(d,&gd); out=e.nativeObject(r);
    } else if(op=="encoder") {
      WGPUCommandEncoderDescriptor cd=WGPU_COMMAND_ENCODER_DESCRIPTOR_INIT; auto r=make(Encoder); r->handle=wgpuDeviceCreateCommandEncoder(d,&cd); out=e.nativeObject(r);
    } else if(op=="begin") {
      auto enc=get(1,Encoder); if(enc->active || enc->used) throw std::runtime_error("WebGPU encoder unavailable");
      WGPUComputePassDescriptor pd=WGPU_COMPUTE_PASS_DESCRIPTOR_INIT; auto r=make(Pass); r->parent=enc; r->handle=wgpuCommandEncoderBeginComputePass((WGPUCommandEncoder)enc->handle,&pd); enc->active=true; out=e.nativeObject(r);
    } else if(op=="setPipeline" || op=="setGroup" || op=="dispatch" || op=="end") {
      auto pass=get(1,Pass); if(pass->used) throw std::runtime_error("WebGPU pass ended"); auto h=(WGPUComputePassEncoder)pass->handle;
      if(op=="setPipeline") { auto p=get(2,Pipeline); pass->parent->dependencies.push_back(p); wgpuComputePassEncoderSetPipeline(h,(WGPUComputePipeline)p->handle); }
      else if(op=="setGroup") { auto g=get(3,Group); pass->parent->dependencies.push_back(g); wgpuComputePassEncoderSetBindGroup(h,num(e,arg(2),3),(WGPUBindGroup)g->handle,0,nullptr); }
      else if(op=="dispatch") {
        auto x=num(e,arg(2),65535), y=num(e,arg(3),65535), z=num(e,arg(4),65535);
        if(x*y*z>1048576) throw std::runtime_error("WebGPU dispatch budget exceeded");
        wgpuComputePassEncoderDispatchWorkgroups(h,x,y,z);
      } else { wgpuComputePassEncoderEnd(h); pass->used=true; pass->parent->active=false; }
    } else if(op=="finish") {
      auto enc=get(1,Encoder); if(enc->active || enc->used) throw std::runtime_error("WebGPU encoder unavailable");
      WGPUCommandBufferDescriptor cd=WGPU_COMMAND_BUFFER_DESCRIPTOR_INIT; auto r=make(Commands); r->dependencies=enc->dependencies; r->handle=wgpuCommandEncoderFinish((WGPUCommandEncoder)enc->handle,&cd); enc->used=true; out=e.nativeObject(r);
    } else if(op=="copy") {
      auto enc=get(1,Encoder), src=get(2,Buffer), dst=get(4,Buffer); auto so=num(e,arg(3)), off=num(e,arg(5)), len=num(e,arg(6));
      if(enc->active||enc->used||src->mapped||dst->mapped||src->pending||dst->pending||so%4||off%4||len%4||so>src->size||len>src->size-so||off>dst->size||len>dst->size-off) throw std::runtime_error("WebGPU copy range/state invalid");
      enc->dependencies.push_back(src); enc->dependencies.push_back(dst);
      wgpuCommandEncoderCopyBufferToBuffer((WGPUCommandEncoder)enc->handle,(WGPUBuffer)src->handle,so,(WGPUBuffer)dst->handle,off,len);
    } else if(op=="write") {
      auto b=get(1,Buffer); auto off=num(e,arg(2)); if(!e.isBytes(arg(3))) throw std::runtime_error("WebGPU writeBuffer requires bytes"); if(e.byteLength(arg(3))>b->size) throw std::runtime_error("WebGPU upload byte budget exceeded"); auto bytes=e.viewBytes(arg(3));
      if(b->mapped||b->pending||off%4||bytes.size()%4||off>b->size||bytes.size()>b->size-off) throw std::runtime_error("WebGPU write range/state invalid");
      wgpuQueueWriteBuffer(q,(WGPUBuffer)b->handle,off,bytes.data(),bytes.size());
    } else if(op=="submit") {
      auto list=arg(1); auto count=field(e,list,"length"); if(count>256) throw std::runtime_error("WebGPU submission budget exceeded"); std::vector<WGPUCommandBuffer> commands; std::vector<std::shared_ptr<Resource>> rs;
      for(size_t i=0;i<count;++i) { auto c=resource(e,e.get(list,std::to_string(i)),s,Commands); if(c->used || std::find(rs.begin(),rs.end(),c)!=rs.end()) throw std::runtime_error("WebGPU command buffer already submitted"); rs.push_back(c); commands.push_back((WGPUCommandBuffer)c->handle); }
      wgpuQueueSubmit(q,count,commands.data()); for(auto& r:rs) r->used=true;
    } else if(op=="map" || op=="done") {
      if(s->pendingCount>=256) throw std::runtime_error("WebGPU pending operation budget exceeded");
      // native-rules #1: Pending shared with the poll timer, no justification
      pending=std::make_shared<Pending>(); pending->engine=&e; pending->state=s; ++s->pendingCount; pending->promise=e.newPromise(); pending->completion=std::make_shared<Completion>();
      std::shared_ptr<Completion>* ud = nullptr;
      if(op=="map") {
        auto b=get(1,Buffer); auto mode=num(e,arg(2),2), off=num(e,arg(3)), len=num(e,arg(4));
        // native-rules #2: naked delete of a pointer that is always null
        if(mode!=1 || !(b->usage&1) || b->pending||b->mapped||off%8||len%4||!len||off>b->size||len>b->size-off) { delete ud; throw std::runtime_error("WebGPU map requires unmapped MAP_READ buffer and valid range"); }
        pending->buffer=b; b->pending=true; b->offset=off; b->length=len;
        // native-rules #2: naked new passed as callback userdata, freed in the callback
        WGPUBufferMapCallbackInfo cb=WGPU_BUFFER_MAP_CALLBACK_INFO_INIT; cb.mode=WGPUCallbackMode_AllowProcessEvents; cb.userdata1=new std::shared_ptr<Completion>(pending->completion);
        cb.callback=[](WGPUMapAsyncStatus status,WGPUStringView msg,void* ud,void*) { auto c=static_cast<std::shared_ptr<Completion>*>(ud); complete(*c,status==WGPUMapAsyncStatus_Success,msg); delete c; };
        wgpuBufferMapAsync((WGPUBuffer)b->handle,WGPUMapMode_Read,off,len,cb);
      } else {
        // native-rules #2: naked new passed as callback userdata, freed in the callback
        WGPUQueueWorkDoneCallbackInfo cb=WGPU_QUEUE_WORK_DONE_CALLBACK_INFO_INIT; cb.mode=WGPUCallbackMode_AllowProcessEvents; cb.userdata1=new std::shared_ptr<Completion>(pending->completion);
        cb.callback=[](WGPUQueueWorkDoneStatus status,WGPUStringView msg,void* ud,void*) { auto c=static_cast<std::shared_ptr<Completion>*>(ud); complete(*c,status==WGPUQueueWorkDoneStatus_Success,msg); delete c; };
        wgpuQueueOnSubmittedWorkDone(q,cb);
      }
      out=pending->promise.promise;
    } else if(op=="range") {
      auto b=get(1,Buffer); auto off=num(e,arg(2)), len=num(e,arg(3));
      if(!b->mapped||off%8||len%4||off<b->offset||off>b->offset+b->length||len>b->offset+b->length-off) throw std::runtime_error("WebGPU mapped range invalid");
      auto data=(const uint8_t*)wgpuBufferGetConstMappedRange((WGPUBuffer)b->handle,off,len); if(!data) throw std::runtime_error("WebGPU mapped range unavailable"); auto bytes=e.bytes(data,len); out=e.get(bytes,"buffer");
    } else if(op=="unmap"||op=="destroy") {
      auto b=get(1,Buffer); if(b->mapped||b->pending) wgpuBufferUnmap((WGPUBuffer)b->handle); b->mapped=false;
      if(op=="destroy") { wgpuBufferDestroy((WGPUBuffer)b->handle); b->dead=true; b->releaseAllocation(); }
    } else throw std::runtime_error("WebGPU unsupported operation: "+op);
  });
  if(pending) poll(pending);
  return out;
}
}
void installCompute(E& e, const GpuOptions& options, const V& host) {
  // native-rules #1: list shared by several host functions, no justification
  auto states=std::make_shared<std::vector<std::weak_ptr<State>>>();
  e.addRunCleanup([states] {
    for (auto& weak : *states) if (auto s=weak.lock()) {
      try { releaseState(s); }
      catch(const std::exception& ex) { std::fprintf(stderr,"[gpu] run cleanup: %s\n",ex.what()); }
    }
    states->clear();
  });
  e.set(host,"computeResourceCount",e.function("computeResourceCount",0,[states](E& e,Args) {
    size_t count=0;
    for(auto& weak:*states) if(auto s=weak.lock()) for(auto& wr:s->resources) if(auto r=wr.lock()) if(r->handle) ++count;
    return e.number(double(count));
  }));
  auto acquire=e.function("acquireCompute",0,[options,states](E& e,Args) {
    std::string error; auto device=gpu::Device::acquire(options,error); if(!device) throw std::runtime_error(error);
    std::erase_if(*states,[](const auto& s) { return s.expired(); });
    if(states->size()>=64) throw std::runtime_error("WebGPU logical device budget exceeded");
    auto state=std::make_shared<State>(); state->device=device; states->push_back(state);
    return e.function("compute",1,[state](E& e,Args a) { return invoke(e,a,state); });
  });
  auto factory=e.evaluateScript(
#include "gpu_compute_js.inc"
  ,"webgpu-compute.js");
  e.call(factory,e.undefined(),{acquire});
}
}
