// The native WebGPU device behind the gpu capability: runs catalog shader
// modules and recipes the way @nodetool-ai/gpu's Executor and RecipeRunner
// encode them, and holds the textures node outputs refer to.
//
// gpu_device.cpp implements it on wgpu-native. gpu_device_none.cpp is the
// implementation of a build without GPU support, whose acquire() fails.
#pragma once

#include "host/gpu_catalog.h"
#include "nodetool/graph_runner.h"

#include <cstdint>
#include <functional>
#include <map>
#include <memory>
#include <string>
#include <vector>

namespace gr::host::gpu {

class Device {
public:
  virtual ~Device() = default;

  // The process-wide device for these options, created on first use and
  // kept for the life of the process. Returns null and sets `error` when
  // the build has no GPU support or no adapter is available.
  // native-rules #1: process-wide shared Device, comment gives no reason unique fails
  static std::shared_ptr<Device> acquire(const GpuOptions& options, std::string& error);

  // Adapter name, backend and type, for logs.
  virtual std::string description() const = 0;
  // Internal binding seam. Native handles are borrowed under the device lock.
  // native-rules #5: hands raw WGPU instance, device and queue to the callback
  virtual void compute(const std::function<void(void*, void*, void*)>&) {
    throw std::runtime_error("WebGPU compute unavailable in this build");
  }

  // Uploads straight-alpha RGBA8 as a premultiplied rgba8unorm texture, as
  // uploadStraightAlpha does, and returns its id. The texture belongs to
  // `run` in the trusted native backend. Guest ownership is enforced by
  // ContextGpu before any backend call; a guest label is never authority.
  virtual uint64_t upload(const uint8_t* straightRgba, uint32_t width, uint32_t height,
                          const std::string& run) = 0;

  // Runs a shader module or a recipe on `inputs` (input name -> texture id)
  // into a new rgba8unorm texture of the given size, as runShaderNode and
  // runRecipeNode do, and returns its id. Width and height may be
  // fractional: the texture is floored, a compute dispatch is not.
  virtual uint64_t run(const Catalog& catalog, const std::string& moduleKey, const Json& params,
                       const std::map<std::string, uint64_t>& inputs, double width, double height,
                       const std::string& run) = 0;

  // Reads a texture back to straight-alpha RGBA8 (readbackTexture).
  virtual std::vector<uint8_t> read(uint64_t id, uint32_t& width, uint32_t& height) = 0;

  virtual bool has(uint64_t id) const = 0;
  virtual void release(uint64_t id) = 0;
  // Frees every texture of `run`. Returns how many there were.
  virtual size_t releaseRun(const std::string& run) = 0;
  virtual size_t liveTextures() const = 0;
};

// The straight-alpha conversions the TypeScript path applies on upload and
// readback (premultiplyInPlace / unpremultiplyInPlace in gpu-device.ts).
void premultiply(uint8_t* rgba, size_t pixels);
void unpremultiply(uint8_t* rgba, size_t pixels);

}  // namespace gr::host::gpu
