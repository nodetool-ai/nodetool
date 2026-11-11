// Host gpu capability: runs the WebGPU image nodes' shader modules on a
// native WebGPU device. The guest half is guest/host/gpu.mjs, which replaces
// runShaderNode and runRecipeNode of @nodetool-ai/image-nodes.
//
//   __host.gpu.init(catalogJson)                  -> json {ok, adapter} | {ok: false, error}
//   __host.gpu.uploadEncoded(bytes, run)          -> json {texture, width, height}
//   __host.gpu.uploadRgba(rgba, width, height, run) -> json {texture, width, height}
//   __host.gpu.run(requestJson, paramsJson)       -> json {texture}
//       request: {module: "id@version", inputs: {name: texture}, width, height, run}
//   __host.gpu.readback(texture)                  -> {rgba: Uint8Array, width, height}
//   __host.gpu.release(texture)
//   __host.gpu.releaseRun(run)
//   __host.gpu.liveTextures()                     -> number
//
// The catalog is the document guest/host/gpu-catalog.mjs exports, embedded in
// the bundle. Numbered handles belong to one engine and its current run. Run
// labels are guest metadata, not ownership. gpuBoundary reads only that
// engine's textures, and gpuEndRun frees all textures owned by that engine.
#pragma once

#include "js/engine.h"
#include "kernel/json.h"
#include "nodetool/graph_runner.h"

#include <optional>
#include <string>

namespace gr::host {

void installGpu(js::Engine& engine, const js::Value& object, const HostOptions& options);

// A GPU-texture ImageRef ({type: "image", mimeType: "image/x-gpu-texture",
// texture: {gpu: id}, width, height}) becomes {type: "image", mimeType:
// "image/png", data: <base64 PNG>, width, height}.
std::optional<Json> gpuBoundary(js::Engine& engine, const Json& message);

void gpuEndRun(js::Engine& engine, const std::string& jobId);

}  // namespace gr::host
