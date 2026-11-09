// Device on wgpu-native. The encoding follows packages/gpu/src/executor.ts
// (Executor.encode) and recipe.ts (RecipeRunner.encode) step by step:
// input validation, the alpha auto-conversion pass for inputs whose alpha
// differs from the module's contract, the uniform buffer, the bind group in
// layout order with a 1x1 white texture for unbound optional inputs, and a
// full-screen triangle (fragment) or a workgroup dispatch (compute).
#include "host/gpu_device.h"

#include <webgpu/webgpu.h>
#include <webgpu/wgpu.h>

#include <atomic>
#include <cmath>
#include <cstring>
#include <functional>
#include <mutex>
#include <stdexcept>

namespace gr::host::gpu {
namespace {

WGPUStringView view(const std::string& s) { return {s.data(), s.size()}; }

std::string text(WGPUStringView v) {
  if (!v.data) return {};
  return v.length == WGPU_STRLEN ? std::string(v.data) : std::string(v.data, v.length);
}

// GPUTextureUsage and GPUShaderStage bits equal webgpu.h's flag values.
constexpr WGPUTextureUsage kInputUsage =
    WGPUTextureUsage_TextureBinding | WGPUTextureUsage_CopyDst | WGPUTextureUsage_CopySrc;
constexpr WGPUTextureUsage kOutputUsage = WGPUTextureUsage_RenderAttachment |
                                          WGPUTextureUsage_StorageBinding |
                                          WGPUTextureUsage_TextureBinding | WGPUTextureUsage_CopySrc;
constexpr WGPUTextureUsage kAlphaScratchUsage = WGPUTextureUsage_TextureBinding |
                                                WGPUTextureUsage_StorageBinding |
                                                WGPUTextureUsage_CopySrc | WGPUTextureUsage_CopyDst;

WGPUTextureFormat textureFormat(const std::string& f) {
  static const std::map<std::string, WGPUTextureFormat> formats = {
      {"rgba8unorm", WGPUTextureFormat_RGBA8Unorm},
      {"rgba8unorm-srgb", WGPUTextureFormat_RGBA8UnormSrgb},
      {"bgra8unorm", WGPUTextureFormat_BGRA8Unorm},
      {"rgba16float", WGPUTextureFormat_RGBA16Float},
      {"rgba32float", WGPUTextureFormat_RGBA32Float},
      {"r8unorm", WGPUTextureFormat_R8Unorm},
      {"r16float", WGPUTextureFormat_R16Float},
      {"r32float", WGPUTextureFormat_R32Float},
      {"rg16float", WGPUTextureFormat_RG16Float},
      {"rg32float", WGPUTextureFormat_RG32Float},
  };
  auto it = formats.find(f);
  if (it == formats.end()) throw std::runtime_error("unsupported texture format " + f);
  return it->second;
}

WGPUTextureSampleType sampleType(const std::string& s) {
  if (s == "float") return WGPUTextureSampleType_Float;
  if (s == "unfilterable-float") return WGPUTextureSampleType_UnfilterableFloat;
  if (s == "depth") return WGPUTextureSampleType_Depth;
  if (s == "sint") return WGPUTextureSampleType_Sint;
  if (s == "uint") return WGPUTextureSampleType_Uint;
  throw std::runtime_error("unsupported texture sample type " + s);
}

WGPUTextureViewDimension viewDimension(const std::string& s) {
  if (s == "2d") return WGPUTextureViewDimension_2D;
  if (s == "2d-array") return WGPUTextureViewDimension_2DArray;
  if (s == "3d") return WGPUTextureViewDimension_3D;
  if (s == "cube") return WGPUTextureViewDimension_Cube;
  throw std::runtime_error("unsupported texture view dimension " + s);
}

WGPUStorageTextureAccess storageAccess(const std::string& s) {
  if (s == "write-only") return WGPUStorageTextureAccess_WriteOnly;
  if (s == "read-only") return WGPUStorageTextureAccess_ReadOnly;
  if (s == "read-write") return WGPUStorageTextureAccess_ReadWrite;
  throw std::runtime_error("unsupported storage texture access " + s);
}

WGPUSamplerBindingType samplerType(const std::string& s) {
  if (s == "filtering") return WGPUSamplerBindingType_Filtering;
  if (s == "non-filtering") return WGPUSamplerBindingType_NonFiltering;
  if (s == "comparison") return WGPUSamplerBindingType_Comparison;
  throw std::runtime_error("unsupported sampler type " + s);
}

WGPUFilterMode filterMode(const Json& d, const char* key) {
  return d.value(key, "nearest") == "linear" ? WGPUFilterMode_Linear : WGPUFilterMode_Nearest;
}

WGPUMipmapFilterMode mipmapMode(const Json& d) {
  return d.value("mipmapFilter", "nearest") == "linear" ? WGPUMipmapFilterMode_Linear
                                                        : WGPUMipmapFilterMode_Nearest;
}

WGPUAddressMode addressMode(const Json& d, const char* key) {
  const std::string m = d.value(key, "clamp-to-edge");
  if (m == "repeat") return WGPUAddressMode_Repeat;
  if (m == "mirror-repeat") return WGPUAddressMode_MirrorRepeat;
  return WGPUAddressMode_ClampToEdge;
}

WGPUInstanceBackend backendFlags(const std::string& name) {
  if (name == "primary") return WGPUInstanceBackend_Primary;
  if (name == "vulkan") return WGPUInstanceBackend_Vulkan;
  if (name == "metal") return WGPUInstanceBackend_Metal;
  if (name == "dx12") return WGPUInstanceBackend_DX12;
  if (name == "gl") return WGPUInstanceBackend_GL;
  if (name == "all") return WGPUInstanceBackend_All;
  throw std::runtime_error("unknown GPU backends \"" + name + "\"");
}

const char* backendName(WGPUBackendType t) {
  switch (t) {
    case WGPUBackendType_Vulkan: return "Vulkan";
    case WGPUBackendType_Metal: return "Metal";
    case WGPUBackendType_D3D12: return "D3D12";
    case WGPUBackendType_OpenGL: return "OpenGL";
    case WGPUBackendType_OpenGLES: return "OpenGLES";
    default: return "other";
  }
}

const char* adapterTypeName(WGPUAdapterType t) {
  switch (t) {
    case WGPUAdapterType_DiscreteGPU: return "discrete GPU";
    case WGPUAdapterType_IntegratedGPU: return "integrated GPU";
    case WGPUAdapterType_CPU: return "CPU";
    default: return "unknown type";
  }
}

// A texture as the Executor sees a LabeledTexture: size, format and the
// alpha association its metadata records.
struct Tex {
  // native-rules #6: raw WGPUTexture destroyed and released by hand
  WGPUTexture texture = nullptr;
  uint32_t width = 0;
  uint32_t height = 0;
  WGPUTextureFormat format = WGPUTextureFormat_RGBA8Unorm;
  bool straight = false;
};

struct Stored {
  Tex tex;
  std::string run;
};

// native-rules #14: process-wide mutable texture id counter
std::atomic<uint64_t> nextTextureId{1};

// native-rules #9: process-wide device used from many threads, no affinity comment
class WgpuDevice final : public Device {
public:
  explicit WgpuDevice(const GpuOptions& options) { open(options); }

  // Kept for the life of the process: releasing wgpu objects from static
  // destructors at exit races the driver's own teardown.
  ~WgpuDevice() override = default;

  std::string description() const override { return description_; }

  // native-rules #5: passes raw WGPU instance, device and queue across a module boundary
  void compute(const std::function<void(void*, void*, void*)>& fn) override {
    std::lock_guard lock(mutex_);
    wgpuDevicePushErrorScope(device_, WGPUErrorFilter_Validation);
    try { fn(instance_, device_, queue_); }
    catch (...) { popErrorScope(); throw; }
    auto error = popErrorScope();
    if (!error.empty()) throw std::runtime_error("WebGPU validation: " + error);
  }

  uint64_t upload(const uint8_t* straight, uint32_t width, uint32_t height,
                  const std::string& run) override {
    std::lock_guard lock(mutex_);
    std::vector<uint8_t> pixels(straight, straight + size_t(width) * height * 4);
    premultiply(pixels.data(), size_t(width) * height);
    Tex tex = createTexture(width, height, WGPUTextureFormat_RGBA8Unorm, kInputUsage, "shader-input");
    writeTexture(tex, pixels.data());
    return store(tex, run);
  }

  uint64_t run(const Catalog& catalog, const std::string& key, const Json& params,
               const std::map<std::string, uint64_t>& inputIds, double width, double height,
               const std::string& run) override {
    std::lock_guard lock(mutex_);
    if (!(width > 0 && width <= 65535 && height > 0 && height <= 65535)) {
      throw std::runtime_error("invalid GPU output dimensions");
    }
    const Module& module = catalog.module(key);
    std::map<std::string, Tex> inputs;
    for (const auto& [name, id] : inputIds) inputs[name] = find(id).tex;

    const uint32_t w = uint32_t(std::max(1.0, std::floor(width)));
    const uint32_t h = uint32_t(std::max(1.0, std::floor(height)));
    Tex output = createTexture(w, h, WGPUTextureFormat_RGBA8Unorm, kOutputUsage, key + "-output");

    Encoding enc;
    WGPUCommandEncoderDescriptor ced = WGPU_COMMAND_ENCODER_DESCRIPTOR_INIT;
    enc.encoder = wgpuDeviceCreateCommandEncoder(device_, &ced);
    wgpuDevicePushErrorScope(device_, WGPUErrorFilter_Validation);
    std::string error;
    try {
      if (module.kind == "recipe") {
        encodeRecipe(enc, catalog, module, inputs, output, params);
      } else {
        Dispatch dispatch;
        if (module.kind == "compute") {
          dispatch = {true, uint32_t(std::ceil(width / module.workgroupSize[0])),
                      uint32_t(std::ceil(height / module.workgroupSize[1])), 1};
        }
        encodeModule(enc, catalog, module, inputs, output, params, dispatch);
      }
      WGPUCommandBufferDescriptor cbd = WGPU_COMMAND_BUFFER_DESCRIPTOR_INIT;
      WGPUCommandBuffer commands = wgpuCommandEncoderFinish(enc.encoder, &cbd);
      wgpuQueueSubmit(queue_, 1, &commands);
      wgpuCommandBufferRelease(commands);
    } catch (const std::exception& e) {
      error = e.what();
    }
    const std::string scopeError = popErrorScope();
    enc.release();
    if (error.empty()) error = scopeError;
    if (!error.empty()) {
      destroy(output);
      throw std::runtime_error(key + ": " + error);
    }
    return store(output, run);
  }

  std::vector<uint8_t> read(uint64_t id, uint32_t& width, uint32_t& height) override {
    std::lock_guard lock(mutex_);
    const Tex& tex = find(id).tex;
    if (tex.format != WGPUTextureFormat_RGBA8Unorm) {
      throw std::runtime_error("only rgba8unorm textures can be read back");
    }
    width = tex.width;
    height = tex.height;
    const uint32_t rowStride = (tex.width * 4 + 255) / 256 * 256;
    WGPUBufferDescriptor bd = WGPU_BUFFER_DESCRIPTOR_INIT;
    bd.size = uint64_t(rowStride) * tex.height;
    bd.usage = WGPUBufferUsage_CopyDst | WGPUBufferUsage_MapRead;
    // native-rules #6: raw WGPUBuffer released by hand
    WGPUBuffer buffer = wgpuDeviceCreateBuffer(device_, &bd);
    WGPUCommandEncoderDescriptor ced = WGPU_COMMAND_ENCODER_DESCRIPTOR_INIT;
    // native-rules #6: raw WGPUCommandEncoder released by hand
    WGPUCommandEncoder encoder = wgpuDeviceCreateCommandEncoder(device_, &ced);
    WGPUTexelCopyTextureInfo src = WGPU_TEXEL_COPY_TEXTURE_INFO_INIT;
    src.texture = tex.texture;
    WGPUTexelCopyBufferInfo dst = WGPU_TEXEL_COPY_BUFFER_INFO_INIT;
    dst.buffer = buffer;
    dst.layout.bytesPerRow = rowStride;
    dst.layout.rowsPerImage = tex.height;
    WGPUExtent3D extent = {tex.width, tex.height, 1};
    wgpuCommandEncoderCopyTextureToBuffer(encoder, &src, &dst, &extent);
    WGPUCommandBufferDescriptor cbd = WGPU_COMMAND_BUFFER_DESCRIPTOR_INIT;
    WGPUCommandBuffer commands = wgpuCommandEncoderFinish(encoder, &cbd);
    wgpuQueueSubmit(queue_, 1, &commands);
    wgpuCommandBufferRelease(commands);
    wgpuCommandEncoderRelease(encoder);

    struct MapState {
      bool done = false;
      WGPUMapAsyncStatus status = WGPUMapAsyncStatus_Error;
      std::string message;
    } state;
    WGPUBufferMapCallbackInfo cb = WGPU_BUFFER_MAP_CALLBACK_INFO_INIT;
    cb.mode = WGPUCallbackMode_AllowProcessEvents;
    cb.callback = [](WGPUMapAsyncStatus status, WGPUStringView message, void* ud, void*) {
      auto* s = static_cast<MapState*>(ud);
      s->done = true;
      s->status = status;
      s->message = text(message);
    };
    cb.userdata1 = &state;
    wgpuBufferMapAsync(buffer, WGPUMapMode_Read, 0, size_t(bd.size), cb);
    while (!state.done) {
      wgpuDevicePoll(device_, true, nullptr);
      wgpuInstanceProcessEvents(instance_);
    }
    if (state.status != WGPUMapAsyncStatus_Success) {
      wgpuBufferRelease(buffer);
      throw std::runtime_error("texture readback failed: " + state.message);
    }
    const auto* mapped =
        static_cast<const uint8_t*>(wgpuBufferGetConstMappedRange(buffer, 0, size_t(bd.size)));
    std::vector<uint8_t> out(size_t(tex.width) * tex.height * 4);
    for (uint32_t row = 0; row < tex.height; ++row) {
      std::memcpy(out.data() + size_t(row) * tex.width * 4, mapped + size_t(row) * rowStride,
                  size_t(tex.width) * 4);
    }
    wgpuBufferUnmap(buffer);
    wgpuBufferDestroy(buffer);
    wgpuBufferRelease(buffer);
    unpremultiply(out.data(), size_t(tex.width) * tex.height);
    return out;
  }

  bool has(uint64_t id) const override {
    std::lock_guard lock(mutex_);
    return textures_.count(id) > 0;
  }

  void release(uint64_t id) override {
    std::lock_guard lock(mutex_);
    auto it = textures_.find(id);
    if (it == textures_.end()) return;
    destroy(it->second.tex);
    textures_.erase(it);
  }

  size_t releaseRun(const std::string& run) override {
    std::lock_guard lock(mutex_);
    size_t freed = 0;
    for (auto it = textures_.begin(); it != textures_.end();) {
      if (it->second.run == run) {
        destroy(it->second.tex);
        it = textures_.erase(it);
        ++freed;
      } else {
        ++it;
      }
    }
    return freed;
  }

  size_t liveTextures() const override {
    std::lock_guard lock(mutex_);
    return textures_.size();
  }

private:
  struct Dispatch {
    bool compute = false;
    uint32_t x = 0, y = 0, z = 1;
  };

  // Objects one run() creates, released after submission.
  struct Encoding {
    // native-rules #6: raw WGPU handles released by hand in release()
    WGPUCommandEncoder encoder = nullptr;
    // native-rules #6: raw WGPUBuffer handles released by hand in release()
    std::vector<WGPUBuffer> buffers;
    // native-rules #6: raw WGPUBindGroup handles released by hand in release()
    std::vector<WGPUBindGroup> bindGroups;
    std::vector<Tex> scratch;
    void release() {
      for (auto b : buffers) {
        wgpuBufferDestroy(b);
        wgpuBufferRelease(b);
      }
      for (auto g : bindGroups) wgpuBindGroupRelease(g);
      for (auto& t : scratch) {
        wgpuTextureDestroy(t.texture);
        wgpuTextureRelease(t.texture);
      }
      if (encoder) wgpuCommandEncoderRelease(encoder);
      buffers.clear();
      bindGroups.clear();
      scratch.clear();
      encoder = nullptr;
    }
  };

  struct Pipeline {
    // native-rules #6: raw WGPU pipeline handles never released
    WGPUBindGroupLayout layout = nullptr;
    WGPURenderPipeline render = nullptr;
    WGPUComputePipeline compute = nullptr;
  };

  void open(const GpuOptions& options) {
    WGPUInstanceExtras extras = {};
    extras.chain.sType = static_cast<WGPUSType>(WGPUSType_InstanceExtras);
    extras.backends = backendFlags(options.backends);
    WGPUInstanceDescriptor id = WGPU_INSTANCE_DESCRIPTOR_INIT;
    id.nextInChain = &extras.chain;
    instance_ = wgpuCreateInstance(&id);
    if (!instance_) throw std::runtime_error("cannot create a WebGPU instance");

    adapter_ = requestAdapter(options.softwareOnly);
    if (!adapter_ && !options.softwareOnly) adapter_ = requestAdapter(true);
    if (!adapter_) {
      throw std::runtime_error(
          "no WebGPU adapter (wgpu-native, backends \"" + options.backends +
          "\"). On Linux without a GPU driver, install a software Vulkan driver such as "
          "lavapipe (mesa-vulkan-drivers) or point VK_DRIVER_FILES at one");
    }
    WGPUAdapterInfo info = WGPU_ADAPTER_INFO_INIT;
    wgpuAdapterGetInfo(adapter_, &info);
    description_ = text(info.device) + " (" + backendName(info.backendType) + ", " +
                   adapterTypeName(info.adapterType) + ")";
    wgpuAdapterInfoFreeMembers(info);

    WGPUDeviceDescriptor dd = WGPU_DEVICE_DESCRIPTOR_INIT;
    dd.label = {"nodetool-graph-runner", WGPU_STRLEN};
    dd.uncapturedErrorCallbackInfo.callback = [](WGPUDevice const*, WGPUErrorType, WGPUStringView message,
                                                 void* ud, void*) {
      static_cast<WgpuDevice*>(ud)->uncaptured_ = text(message);
    };
    dd.uncapturedErrorCallbackInfo.userdata1 = this;
    dd.deviceLostCallbackInfo.mode = WGPUCallbackMode_AllowProcessEvents;
    dd.deviceLostCallbackInfo.callback = [](WGPUDevice const*, WGPUDeviceLostReason, WGPUStringView message,
                                            void* ud, void*) {
      static_cast<WgpuDevice*>(ud)->lost_ = text(message);
    };
    dd.deviceLostCallbackInfo.userdata1 = this;
    struct DeviceState {
      bool done = false;
      WGPUDevice device = nullptr;
      std::string message;
    } state;
    WGPURequestDeviceCallbackInfo cb = WGPU_REQUEST_DEVICE_CALLBACK_INFO_INIT;
    cb.mode = WGPUCallbackMode_AllowProcessEvents;
    cb.callback = [](WGPURequestDeviceStatus status, WGPUDevice device, WGPUStringView message, void* ud,
                     void*) {
      auto* s = static_cast<DeviceState*>(ud);
      s->done = true;
      if (status == WGPURequestDeviceStatus_Success) s->device = device;
      s->message = text(message);
    };
    cb.userdata1 = &state;
    wgpuAdapterRequestDevice(adapter_, &dd, cb);
    while (!state.done) wgpuInstanceProcessEvents(instance_);
    if (!state.device) throw std::runtime_error("cannot create a WebGPU device: " + state.message);
    device_ = state.device;
    queue_ = wgpuDeviceGetQueue(device_);

    // The default for unbound optional inputs (getDefaultWhiteTexture).
    white_ = createTexture(1, 1, WGPUTextureFormat_RGBA8Unorm,
                           WGPUTextureUsage_TextureBinding | WGPUTextureUsage_CopyDst, "default-white-1x1");
    const uint8_t pixel[4] = {255, 255, 255, 255};
    writeTexture(white_, pixel);
  }

  WGPUAdapter requestAdapter(bool software) {
    struct AdapterState {
      bool done = false;
      WGPUAdapter adapter = nullptr;
    } state;
    WGPURequestAdapterOptions ro = WGPU_REQUEST_ADAPTER_OPTIONS_INIT;
    ro.forceFallbackAdapter = software;
    WGPURequestAdapterCallbackInfo cb = WGPU_REQUEST_ADAPTER_CALLBACK_INFO_INIT;
    cb.mode = WGPUCallbackMode_AllowProcessEvents;
    cb.callback = [](WGPURequestAdapterStatus status, WGPUAdapter adapter, WGPUStringView, void* ud, void*) {
      auto* s = static_cast<AdapterState*>(ud);
      s->done = true;
      if (status == WGPURequestAdapterStatus_Success) s->adapter = adapter;
    };
    cb.userdata1 = &state;
    wgpuInstanceRequestAdapter(instance_, &ro, cb);
    while (!state.done) wgpuInstanceProcessEvents(instance_);
    return state.adapter;
  }

  std::string popErrorScope() {
    struct ScopeState {
      bool done = false;
      std::string message;
    } state;
    WGPUPopErrorScopeCallbackInfo cb = WGPU_POP_ERROR_SCOPE_CALLBACK_INFO_INIT;
    cb.mode = WGPUCallbackMode_AllowProcessEvents;
    cb.callback = [](WGPUPopErrorScopeStatus status, WGPUErrorType type, WGPUStringView message, void* ud,
                     void*) {
      auto* s = static_cast<ScopeState*>(ud);
      s->done = true;
      if (status != WGPUPopErrorScopeStatus_Success) {
        s->message = "error scope failed: " + text(message);
      } else if (type != WGPUErrorType_NoError) {
        s->message = text(message);
      }
    };
    cb.userdata1 = &state;
    wgpuDevicePopErrorScope(device_, cb);
    while (!state.done) wgpuInstanceProcessEvents(instance_);
    if (state.message.empty() && !lost_.empty()) state.message = "the GPU device was lost: " + lost_;
    // An error outside the validation scope (out of memory, internal).
    if (state.message.empty() && !uncaptured_.empty()) state.message = uncaptured_;
    uncaptured_.clear();
    return state.message;
  }

  Tex createTexture(uint32_t width, uint32_t height, WGPUTextureFormat format, WGPUTextureUsage usage,
                    const std::string& label) {
    WGPUTextureDescriptor td = WGPU_TEXTURE_DESCRIPTOR_INIT;
    td.label = view(label);
    td.size = {std::max(1u, width), std::max(1u, height), 1};
    td.format = format;
    td.usage = usage;
    Tex tex;
    tex.texture = wgpuDeviceCreateTexture(device_, &td);
    if (!tex.texture) throw std::runtime_error("cannot create a texture");
    tex.width = td.size.width;
    tex.height = td.size.height;
    tex.format = format;
    return tex;
  }

  void writeTexture(const Tex& tex, const uint8_t* pixels) {
    WGPUTexelCopyTextureInfo dst = WGPU_TEXEL_COPY_TEXTURE_INFO_INIT;
    dst.texture = tex.texture;
    WGPUTexelCopyBufferLayout layout = WGPU_TEXEL_COPY_BUFFER_LAYOUT_INIT;
    layout.bytesPerRow = tex.width * 4;
    layout.rowsPerImage = tex.height;
    WGPUExtent3D extent = {tex.width, tex.height, 1};
    wgpuQueueWriteTexture(queue_, &dst, pixels, size_t(tex.width) * tex.height * 4, &layout, &extent);
  }

  void destroy(Tex& tex) {
    if (!tex.texture) return;
    wgpuTextureDestroy(tex.texture);
    wgpuTextureRelease(tex.texture);
    tex.texture = nullptr;
  }

  uint64_t store(const Tex& tex, const std::string& run) {
    const uint64_t id = nextTextureId++;
    textures_[id] = {tex, run};
    return id;
  }

  Stored& find(uint64_t id) {
    auto it = textures_.find(id);
    if (it == textures_.end()) throw std::runtime_error("GPU texture " + std::to_string(id) + " was released");
    return it->second;
  }

  WGPUSampler sampler(const Json& d) {
    const std::string key = d.dump();
    auto it = samplers_.find(key);
    if (it != samplers_.end()) return it->second;
    WGPUSamplerDescriptor sd = WGPU_SAMPLER_DESCRIPTOR_INIT;
    sd.addressModeU = addressMode(d, "addressModeU");
    sd.addressModeV = addressMode(d, "addressModeV");
    sd.addressModeW = addressMode(d, "addressModeW");
    sd.magFilter = filterMode(d, "magFilter");
    sd.minFilter = filterMode(d, "minFilter");
    sd.mipmapFilter = mipmapMode(d);
    sd.lodMinClamp = d.value("lodMinClamp", 0.0f);
    sd.lodMaxClamp = d.value("lodMaxClamp", 32.0f);
    sd.maxAnisotropy = d.value("maxAnisotropy", uint16_t(1));
    // native-rules #6: raw WGPUSampler kept in a map, never released
    WGPUSampler s = wgpuDeviceCreateSampler(device_, &sd);
    samplers_[key] = s;
    return s;
  }

  WGPUBindGroupLayout bindGroupLayout(const Module& module) {
    std::vector<WGPUBindGroupLayoutEntry> entries;
    for (const auto& e : module.layout) {
      WGPUBindGroupLayoutEntry entry = WGPU_BIND_GROUP_LAYOUT_ENTRY_INIT;
      entry.binding = e.at("binding").get<uint32_t>();
      entry.visibility = e.at("visibility").get<uint32_t>();
      if (e.contains("buffer")) {
        const std::string type = e["buffer"].value("type", "uniform");
        entry.buffer.type = type == "uniform"             ? WGPUBufferBindingType_Uniform
                            : type == "read-only-storage" ? WGPUBufferBindingType_ReadOnlyStorage
                                                          : WGPUBufferBindingType_Storage;
      } else if (e.contains("texture")) {
        entry.texture.sampleType = sampleType(e["texture"].value("sampleType", "float"));
        entry.texture.viewDimension = viewDimension(e["texture"].value("viewDimension", "2d"));
        entry.texture.multisampled = e["texture"].value("multisampled", false);
      } else if (e.contains("storageTexture")) {
        entry.storageTexture.access = storageAccess(e["storageTexture"].value("access", "write-only"));
        entry.storageTexture.format = textureFormat(e["storageTexture"].at("format").get<std::string>());
        entry.storageTexture.viewDimension = viewDimension(e["storageTexture"].value("viewDimension", "2d"));
      } else if (e.contains("sampler")) {
        entry.sampler.type = samplerType(e["sampler"].value("type", "filtering"));
      } else {
        throw std::runtime_error(module.key + ": unsupported bind group layout entry " + e.dump());
      }
      entries.push_back(entry);
    }
    WGPUBindGroupLayoutDescriptor ld = WGPU_BIND_GROUP_LAYOUT_DESCRIPTOR_INIT;
    ld.label = view(module.key);
    ld.entryCount = entries.size();
    ld.entries = entries.data();
    return wgpuDeviceCreateBindGroupLayout(device_, &ld);
  }

  WGPUShaderModule shaderModule(const std::string& label, const std::string& code) {
    WGPUShaderSourceWGSL source = WGPU_SHADER_SOURCE_WGSL_INIT;
    source.code = view(code);
    WGPUShaderModuleDescriptor md = WGPU_SHADER_MODULE_DESCRIPTOR_INIT;
    md.nextInChain = &source.chain;
    md.label = view(label);
    return wgpuDeviceCreateShaderModule(device_, &md);
  }

  // getFragmentPipeline / getComputePipeline, cached per catalog, module and
  // target format.
  const Pipeline& pipeline(const Catalog& catalog, const Module& module, WGPUTextureFormat target) {
    const std::string cacheKey = std::to_string(catalog.hash) + ":" + module.key + ":" + module.kind + ":" +
                                 (module.kind == "fragment" ? std::to_string(int(target)) : "");
    auto it = pipelines_.find(cacheKey);
    if (it != pipelines_.end()) return it->second;
    Pipeline p;
    p.layout = bindGroupLayout(module);
    WGPUPipelineLayoutDescriptor pld = WGPU_PIPELINE_LAYOUT_DESCRIPTOR_INIT;
    pld.bindGroupLayoutCount = 1;
    pld.bindGroupLayouts = &p.layout;
    // native-rules #6: raw WGPUPipelineLayout released by hand, leaks if creation throws
    WGPUPipelineLayout pipelineLayout = wgpuDeviceCreatePipelineLayout(device_, &pld);
    if (module.kind == "fragment") {
      // native-rules #6: raw WGPUShaderModule released by hand
      WGPUShaderModule shader = shaderModule(module.key, catalog.vertex + "\n" + module.wgsl);
      WGPUColorTargetState color = WGPU_COLOR_TARGET_STATE_INIT;
      color.format = target;
      WGPUFragmentState fragment = WGPU_FRAGMENT_STATE_INIT;
      fragment.module = shader;
      fragment.entryPoint = view(module.entryPoint);
      fragment.targetCount = 1;
      fragment.targets = &color;
      WGPURenderPipelineDescriptor rd = WGPU_RENDER_PIPELINE_DESCRIPTOR_INIT;
      rd.label = view(module.key);
      rd.layout = pipelineLayout;
      rd.vertex.module = shader;
      rd.vertex.entryPoint = view(catalog.vertexEntryPoint);
      rd.fragment = &fragment;
      rd.primitive.topology = WGPUPrimitiveTopology_TriangleList;
      p.render = wgpuDeviceCreateRenderPipeline(device_, &rd);
      wgpuShaderModuleRelease(shader);
    } else {
      // native-rules #6: raw WGPUShaderModule released by hand
      WGPUShaderModule shader = shaderModule(module.key, module.wgsl);
      WGPUComputePipelineDescriptor cd = WGPU_COMPUTE_PIPELINE_DESCRIPTOR_INIT;
      cd.label = view(module.key);
      cd.layout = pipelineLayout;
      cd.compute.module = shader;
      cd.compute.entryPoint = view(module.entryPoint);
      p.compute = wgpuDeviceCreateComputePipeline(device_, &cd);
      wgpuShaderModuleRelease(shader);
    }
    wgpuPipelineLayoutRelease(pipelineLayout);
    if (!p.render && !p.compute) throw std::runtime_error(module.key + ": pipeline creation failed");
    return pipelines_.emplace(cacheKey, p).first->second;
  }

  // Executor.encode: validateInputs, convertAlphaIfNeeded, then the pass.
  void encodeModule(Encoding& enc, const Catalog& catalog, const Module& module,
                    std::map<std::string, Tex> inputs, const Tex& output, const Json& params,
                    const Dispatch& dispatch) {
    for (const auto& [name, contract] : module.inputs) {
      if (!inputs.count(name) && !contract.optional) {
        throw std::runtime_error(module.key + ": missing required input \"" + name + "\"");
      }
    }
    for (const auto& [name, contract] : module.inputs) {
      auto bound = inputs.find(name);
      if (bound == inputs.end() || bound->second.straight == contract.straight) continue;
      const Module& convert =
          catalog.module(contract.straight ? catalog.toStraight : catalog.toPremultiplied);
      Tex scratch = createTexture(bound->second.width, bound->second.height, WGPUTextureFormat_RGBA8Unorm,
                                  kAlphaScratchUsage, "alpha-convert-" + module.key + "-" + name);
      scratch.straight = contract.straight;
      enc.scratch.push_back(scratch);
      Dispatch d{true, (bound->second.width + convert.workgroupSize[0] - 1) / convert.workgroupSize[0],
                 (bound->second.height + convert.workgroupSize[1] - 1) / convert.workgroupSize[1], 1};
      encodeModule(enc, catalog, convert, {{"source", bound->second}}, scratch, convert.paramDefaults, d);
      bound->second = scratch;
    }

    const Pipeline& p = pipeline(catalog, module, output.format);
    // native-rules #6: raw WGPUBuffer released by hand through Encoding
    WGPUBuffer uniform = nullptr;
    if (module.hasUniform) {
      std::vector<uint8_t> data = packUniform(module, params);
      WGPUBufferDescriptor bd = WGPU_BUFFER_DESCRIPTOR_INIT;
      bd.size = std::max<uint64_t>(16, data.size());
      bd.usage = WGPUBufferUsage_Uniform | WGPUBufferUsage_CopyDst;
      uniform = wgpuDeviceCreateBuffer(device_, &bd);
      enc.buffers.push_back(uniform);
      wgpuQueueWriteBuffer(queue_, uniform, 0, data.data(), data.size());
    }

    std::vector<WGPUBindGroupEntry> entries;
    // native-rules #6: raw WGPUTextureView handles released by hand
    std::vector<WGPUTextureView> views;
    for (const auto& b : module.bindings) {
      WGPUBindGroupEntry entry = WGPU_BIND_GROUP_ENTRY_INIT;
      entry.binding = b.binding;
      switch (b.kind) {
        case Binding::Kind::Uniform:
          if (!uniform) throw std::runtime_error(module.key + ": layout declares a uniform but the module has no params");
          entry.buffer = uniform;
          entry.size = WGPU_WHOLE_SIZE;
          break;
        case Binding::Kind::StorageTexture:
          entry.textureView = wgpuTextureCreateView(output.texture, nullptr);
          views.push_back(entry.textureView);
          break;
        case Binding::Kind::Texture: {
          auto bound = inputs.find(b.name);
          if (bound == inputs.end()) {
            auto contract = module.inputs.find(b.name);
            if (contract == module.inputs.end()) {
              throw std::runtime_error(module.key + ": layout binds texture \"" + b.name +
                                       "\" but it is not declared in io.inputs");
            }
            if (!contract->second.optional) {
              throw std::runtime_error(module.key + ": no texture bound for required input \"" + b.name + "\"");
            }
            entry.textureView = wgpuTextureCreateView(white_.texture, nullptr);
          } else {
            entry.textureView = wgpuTextureCreateView(bound->second.texture, nullptr);
          }
          views.push_back(entry.textureView);
          break;
        }
        case Binding::Kind::Sampler: {
          if (!module.samplers.contains(b.name)) {
            throw std::runtime_error(module.key + ": no sampler descriptor for \"" + b.name + "\"");
          }
          entry.sampler = sampler(module.samplers[b.name]);
          break;
        }
        case Binding::Kind::ExternalTexture:
          throw std::runtime_error(module.key + ": texture_external bindings are browser-only");
      }
      entries.push_back(entry);
    }
    WGPUBindGroupDescriptor bgd = WGPU_BIND_GROUP_DESCRIPTOR_INIT;
    bgd.layout = p.layout;
    bgd.entryCount = entries.size();
    bgd.entries = entries.data();
    // native-rules #6: raw WGPUBindGroup released by hand through Encoding
    WGPUBindGroup group = wgpuDeviceCreateBindGroup(device_, &bgd);
    enc.bindGroups.push_back(group);

    if (module.kind == "fragment") {
      WGPURenderPassColorAttachment color = WGPU_RENDER_PASS_COLOR_ATTACHMENT_INIT;
      color.view = wgpuTextureCreateView(output.texture, nullptr);
      views.push_back(color.view);
      color.loadOp = WGPULoadOp_Clear;
      color.storeOp = WGPUStoreOp_Store;
      color.clearValue = {0, 0, 0, 0};
      WGPURenderPassDescriptor rpd = WGPU_RENDER_PASS_DESCRIPTOR_INIT;
      rpd.colorAttachmentCount = 1;
      rpd.colorAttachments = &color;
      // native-rules #6: raw WGPURenderPassEncoder released by hand
      WGPURenderPassEncoder pass = wgpuCommandEncoderBeginRenderPass(enc.encoder, &rpd);
      wgpuRenderPassEncoderSetPipeline(pass, p.render);
      wgpuRenderPassEncoderSetBindGroup(pass, 0, group, 0, nullptr);
      wgpuRenderPassEncoderDraw(pass, 3, 1, 0, 0);
      wgpuRenderPassEncoderEnd(pass);
      wgpuRenderPassEncoderRelease(pass);
    } else {
      if (!dispatch.compute) throw std::runtime_error(module.key + ": compute module without a dispatch size");
      WGPUComputePassDescriptor cpd = WGPU_COMPUTE_PASS_DESCRIPTOR_INIT;
      // native-rules #6: raw WGPUComputePassEncoder released by hand
      WGPUComputePassEncoder pass = wgpuCommandEncoderBeginComputePass(enc.encoder, &cpd);
      wgpuComputePassEncoderSetPipeline(pass, p.compute);
      wgpuComputePassEncoderSetBindGroup(pass, 0, group, 0, nullptr);
      wgpuComputePassEncoderDispatchWorkgroups(pass, dispatch.x, dispatch.y, dispatch.z);
      wgpuComputePassEncoderEnd(pass);
      wgpuComputePassEncoderRelease(pass);
    }
    for (auto v : views) wgpuTextureViewRelease(v);
  }

  // RecipeRunner.encode.
  void encodeRecipe(Encoding& enc, const Catalog& catalog, const Module& recipe,
                    const std::map<std::string, Tex>& inputs, const Tex& output, const Json& params) {
    auto source = inputs.find("source");
    if (source == inputs.end()) throw std::runtime_error("RecipeRunner(" + recipe.key + "): missing \"source\" input");
    std::map<std::string, Tex> intermediates;
    for (auto& [name, spec] : recipe.intermediates.items()) {
      const uint32_t w = spec.contains("width") ? spec["width"].get<uint32_t>() : source->second.width;
      const uint32_t h = spec.contains("height") ? spec["height"].get<uint32_t>() : source->second.height;
      Tex tex = createTexture(w, h, textureFormat(spec.at("format").get<std::string>()),
                              WGPUTextureUsage(spec.at("usage").get<uint64_t>()),
                              spec.value("label", recipe.key + "-" + name));
      enc.scratch.push_back(tex);
      intermediates[name] = tex;
    }
    auto intermediate = [&](const std::string& name) -> const Tex& {
      auto it = intermediates.find(name);
      if (it == intermediates.end()) {
        throw std::runtime_error("RecipeRunner(" + recipe.key + "): unknown intermediate \"" + name + "\"");
      }
      return it->second;
    };
    for (const auto& pass : recipe.passes) {
      const std::string opKey =
          pass.at("op").at("id").get<std::string>() + "@" + std::to_string(pass.at("op").at("version").get<int>());
      const Module& op = catalog.module(opKey);
      if (op.kind == "recipe") {
        throw std::runtime_error("Shader registry: " + opKey + " is a recipe; use getRecipe or RecipeRunner");
      }
      std::map<std::string, Tex> passInputs;
      for (auto& [bindName, ref] : pass.at("in").items()) {
        if (ref.is_string() && ref.get<std::string>() == "source") {
          passInputs[bindName] = source->second;
        } else if (ref.value("kind", "") == "intermediate") {
          passInputs[bindName] = intermediate(ref.at("name").get<std::string>());
        } else {
          const std::string inputName = ref.at("name").get<std::string>();
          auto it = inputs.find(inputName);
          if (it == inputs.end()) {
            throw std::runtime_error("RecipeRunner(" + recipe.key + "): pass binds \"" + bindName +
                                     "\" to recipe input \"" + inputName + "\" but that input is unbound");
          }
          passInputs[bindName] = it->second;
        }
      }
      const Json& out = pass.at("out");
      const Tex& target = out.is_string() ? output : intermediate(out.at("name").get<std::string>());
      Dispatch dispatch;
      if (op.kind == "compute") {
        const Json d = pass.value("dispatch", Json::object());
        const bool explicitCompute = d.value("kind", "") == "compute";
        auto size = [&](const char* axis, uint32_t extent, uint32_t wg) {
          return explicitCompute && d.contains(axis) ? d[axis].get<uint32_t>() : (extent + wg - 1) / wg;
        };
        dispatch = {true, size("x", target.width, op.workgroupSize[0]), size("y", target.height, op.workgroupSize[1]),
                    explicitCompute && d.contains("z") ? d["z"].get<uint32_t>() : 1u};
      } else if (op.kind != "fragment") {
        throw std::runtime_error("RecipeRunner: op \"" + opKey + "\" has unsupported kind \"" + op.kind + "\"");
      }
      encodeModule(enc, catalog, op, passInputs, target, resolvePassParams(pass.value("params", Json::object()), params),
                   dispatch);
    }
  }

  mutable std::recursive_mutex mutex_;
  // native-rules #6: raw WGPU instance, adapter, device and queue are never released
  WGPUInstance instance_ = nullptr;
  WGPUAdapter adapter_ = nullptr;
  WGPUDevice device_ = nullptr;
  WGPUQueue queue_ = nullptr;
  Tex white_;
  std::string description_;
  std::string uncaptured_;
  std::string lost_;
  std::map<uint64_t, Stored> textures_;
  std::map<std::string, Pipeline> pipelines_;
  std::map<std::string, WGPUSampler> samplers_;
};

// native-rules #14: process-wide mutex for the device registry
std::mutex devicesMutex;
std::map<std::string, std::shared_ptr<Device>>& devices() {
  // Never destroyed (see ~WgpuDevice).
  // native-rules #14: process-wide device registry, never destroyed
  // native-rules #2: naked new for a leaked registry
  static auto* map = new std::map<std::string, std::shared_ptr<Device>>();
  return *map;
}
std::map<std::string, std::string>& failures() {
  // native-rules #14: process-wide failure cache, never destroyed
  // native-rules #2: naked new for a leaked cache
  static auto* map = new std::map<std::string, std::string>();
  return *map;
}

}  // namespace

std::shared_ptr<Device> Device::acquire(const GpuOptions& options, std::string& error) {
  if (!options.enabled) {
    error = "the embedder did not enable the GPU (HostOptions::gpu.enabled)";
    return nullptr;
  }
  const std::string key = options.backends + (options.softwareOnly ? ":software" : ":any");
  std::lock_guard lock(devicesMutex);
  auto found = devices().find(key);
  if (found != devices().end()) return found->second;
  auto failed = failures().find(key);
  if (failed != failures().end()) {
    error = failed->second;
    return nullptr;
  }
  try {
    auto device = std::make_shared<WgpuDevice>(options);
    devices()[key] = device;
    return device;
  } catch (const std::exception& e) {
    error = e.what();
    failures()[key] = error;
    return nullptr;
  }
}


}  // namespace gr::host::gpu
