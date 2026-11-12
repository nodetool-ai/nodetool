#include "host/gpu.h"

#include "host/gpu_device.h"
#include "host/image.h"
#include "kernel/async_jobs.h"

#include <algorithm>
#include <cmath>
#include <cstring>
#include <deque>
#include <map>
#include <cstdio>
#include <memory>
#include <mutex>
#include <stdexcept>

namespace gr::host {
namespace {

constexpr const char* kGpuTextureMime = "image/x-gpu-texture";

using gpu::Catalog;
using gpu::Device;

constexpr const char* kCatalogState = "gpu.catalog";
constexpr size_t kMaxTextures = 4096;
constexpr uint64_t kMaxTextureBytes = 64 * 1024 * 1024;

// The backend and immutable catalog may be shared. Texture authority lives
// only in this engine's native state, never in a guest-provided run string.
// The GPU state of one JavaScript context. Its engine thread only.
struct ContextGpu final : js::NativePayload {
  struct Texture { std::string run; uint64_t bytes; };
  GpuOptions options;
  std::shared_ptr<Device> device;
  std::shared_ptr<const Catalog> catalog;
  std::map<uint64_t, Texture> textures;
  uint64_t allocated = 0;
  // A texture never changes after it is created, and every message that
  // carries it (output, result, generation, summary) needs the same image, so
  // each texture is read back once: handed to GpuOptions::outputImages for a
  // URI, or encoded as PNG data.
  struct Portable { std::string uri; std::string data; uint32_t width; uint32_t height; };
  std::map<uint64_t, Portable> portables;
  // The images uploadEncoded decoded last, newest first, with their encoded
  // bytes. Each preview run of a slider drag uploads the same source image
  // again, so an exact byte match skips the decode. They stay across runs and
  // go with the context. At most two entries.
  struct Decoded { std::vector<uint8_t> encoded; RgbaImage image; };
  std::deque<Decoded> decoded;
  static constexpr size_t kDecodedEntries = 2;
  static constexpr size_t kDecodedBytes = 64u << 20;

  const RgbaImage& decode(const uint8_t* data, size_t size) {
    for (auto it = decoded.begin(); it != decoded.end(); ++it) {
      if (it->encoded.size() == size && std::memcmp(it->encoded.data(), data, size) == 0) {
        if (it != decoded.begin()) { std::rotate(decoded.begin(), it, std::next(it)); }
        return decoded.front().image;
      }
    }
    Decoded entry{std::vector<uint8_t>(data, data + size), decodeImage(data, size)};
    // An image over kDecodedBytes stays alone, because the caller reads it.
    if (entry.image.pixels.size() > kDecodedBytes) {
      decoded.clear();
    } else if (decoded.size() >= kDecodedEntries) {
      decoded.pop_back();
    }
    decoded.push_front(std::move(entry));
    return decoded.front().image;
  }

  ~ContextGpu() override { clear(); }

  Device& ready() const {
    if (!device || !catalog) throw std::runtime_error("__host.gpu.init was not called");
    return *device;
  }
  void require(uint64_t id) const {
    if (!textures.count(id)) throw std::runtime_error("GPU texture is foreign, unknown or released");
  }
  uint64_t allocation(double width, double height) const {
    if (!(width > 0 && width <= 65535 && height > 0 && height <= 65535)) {
      throw std::runtime_error("invalid GPU output dimensions");
    }
    const auto w = uint64_t(std::max(1.0, std::floor(width)));
    const auto h = uint64_t(std::max(1.0, std::floor(height)));
    const uint64_t bytes = w * h * 4;
    if (textures.size() >= kMaxTextures || bytes > kMaxTextureBytes - allocated) {
      throw std::runtime_error("GPU catalog texture budget exceeded");
    }
    return bytes;
  }
  uint64_t own(uint64_t id, const std::string& run, uint64_t bytes) {
    try { textures.emplace(id, Texture{run, bytes}); }
    catch (...) { device->release(id); throw; }
    allocated += bytes;
    return id;
  }
  void release(uint64_t id) {
    require(id);
    device->release(id);
    allocated -= textures.at(id).bytes;
    textures.erase(id);
    portables.erase(id);
  }
  void releaseRun(const std::string& run) {
    for (auto it = textures.begin(); it != textures.end();) {
      if (it->second.run != run) { ++it; continue; }
      device->release(it->first);
      allocated -= it->second.bytes;
      portables.erase(it->first);
      it = textures.erase(it);
    }
  }
  void clear() {
    for (const auto& [id, texture] : textures) device->release(id);
    textures.clear();
    portables.clear();
    allocated = 0;
  }
};

std::shared_ptr<ContextGpu> contextGpu(js::Engine& engine) {
  return std::dynamic_pointer_cast<ContextGpu>(engine.hostState(kCatalogState));
}

// Parsed catalogs by document, shared by the contexts that load one bundle.
std::shared_ptr<const Catalog> catalogFor(const std::string& json) {
  // native-rules #14: process-wide mutex for the catalog cache
  static std::mutex mutex;
  // native-rules #14: process-wide catalog cache, never destroyed
  // native-rules #2: naked new for a leaked cache
  static auto* cache = new std::map<std::string, std::shared_ptr<const Catalog>>();
  std::lock_guard lock(mutex);
  auto it = cache->find(json);
  if (it != cache->end()) return it->second;
  auto catalog = gpu::parseCatalog(json);
  (*cache)[json] = catalog;
  return catalog;
}

std::vector<uint8_t> bytesArg(js::Engine& e, const std::vector<js::Value>& a, size_t i, const char* fn) {
  if (a.size() <= i || !e.isBytes(a[i])) throw std::runtime_error(std::string("__host.gpu.") + fn + ": expected bytes");
  return e.toBytes(a[i]);
}

// A view of the argument's bytes, valid until JavaScript runs again.
std::span<const uint8_t> viewArg(js::Engine& e, const std::vector<js::Value>& a, size_t i, const char* fn) {
  if (a.size() <= i || !e.isBytes(a[i])) throw std::runtime_error(std::string("__host.gpu.") + fn + ": expected bytes");
  return e.viewBytes(a[i]);
}

std::string stringArg(js::Engine& e, const std::vector<js::Value>& a, size_t i) {
  return a.size() > i && !e.isUndefined(a[i]) && !e.isNull(a[i]) ? e.toString(a[i]) : std::string();
}

uint64_t textureArg(js::Engine& e, const std::vector<js::Value>& a, size_t i) {
  const double d = a.size() > i ? e.toNumber(a[i]) : -1;
  if (!(d >= 1 && d <= 9007199254740991.0) || d != std::floor(d)) throw std::runtime_error("__host.gpu: invalid texture handle");
  return uint64_t(d);
}

uint64_t textureId(const Json& id) {
  if (!id.is_number()) throw std::runtime_error("invalid GPU texture handle");
  const double number = id.get<double>();
  if (!(number >= 1 && number <= 9007199254740991.0) || number != std::floor(number)) {
    throw std::runtime_error("invalid GPU texture handle");
  }
  return uint64_t(number);
}

bool isTextureRef(const Json& v) {
  if (!v.is_object()) return false;
  const auto mime = v.find("mimeType");
  return mime != v.end() && mime->is_string() && mime->get<std::string>() == kGpuTextureMime;
}

bool holdsTexture(const Json& v) {
  if (isTextureRef(v)) return true;
  if (v.is_object() || v.is_array()) {
    for (const auto& child : v) {
      if (holdsTexture(child)) return true;
    }
  }
  return false;
}

void portable(Json& v, const std::shared_ptr<ContextGpu>& state) {
  if (isTextureRef(v)) {
    try {
      const uint64_t id = textureId(v.at("texture").at("gpu"));
      if (!state) throw std::runtime_error("GPU texture has no owning context");
      state->require(id);
      auto cached = state->portables.find(id);
      if (cached == state->portables.end()) {
        uint32_t w = 0, h = 0;
        auto rgba = state->ready().read(id, w, h);
        ContextGpu::Portable portable{{}, {}, w, h};
        if (state->options.outputImages) {
          portable.uri = state->options.outputImages(OutputImage{state->textures.at(id).run, w, h, rgba});
        }
        if (portable.uri.empty()) {
          const auto png = encodePng(rgba.data(), w, h);
          portable.data = base64Encode(png.data(), png.size());
        }
        cached = state->portables.emplace(id, std::move(portable)).first;
      }
      if (cached->second.uri.empty()) {
        v["mimeType"] = "image/png";
        v["data"] = cached->second.data;
      } else {
        v.erase("mimeType");
        v.erase("data");
        v["uri"] = cached->second.uri;
      }
      v["width"] = cached->second.width;
      v["height"] = cached->second.height;
    } catch (const std::exception& e) {
      std::fprintf(stderr, "[gpu] cannot read back an output image: %s\n", e.what());
      v.erase("mimeType");
      v["data"] = "";
    }
    v.erase("texture");
    return;
  }
  if (v.is_object() || v.is_array()) {
    for (auto& child : v) portable(child, state);
  }
}

}  // namespace

namespace gpu {

// An opaque pixel stays as it is in both directions, so it skips the math.
void premultiply(uint8_t* p, size_t pixels) {
  for (size_t i = 0; i < pixels * 4; i += 4) {
    if (p[i + 3] == 255) continue;
    const double a = p[i + 3] / 255.0;
    p[i] = uint8_t(std::round(p[i] * a));
    p[i + 1] = uint8_t(std::round(p[i + 1] * a));
    p[i + 2] = uint8_t(std::round(p[i + 2] * a));
  }
}

void unpremultiply(uint8_t* p, size_t pixels) {
  for (size_t i = 0; i < pixels * 4; i += 4) {
    const uint8_t a = p[i + 3];
    if (a == 0 || a == 255) continue;
    const double inv = 255.0 / a;
    p[i] = uint8_t(std::min(255.0, std::round(p[i] * inv)));
    p[i + 1] = uint8_t(std::min(255.0, std::round(p[i + 1] * inv)));
    p[i + 2] = uint8_t(std::min(255.0, std::round(p[i + 2] * inv)));
  }
}

}  // namespace gpu

void installCompute(js::Engine&, const GpuOptions&, const js::Value&);

void installGpu(js::Engine& e, const js::Value& object, const HostOptions& options) {
#ifdef NODETOOL_GRAPH_RUNNER_GPU
  installCompute(e, options.gpu, object);
#endif
  using Args = const std::vector<js::Value>&;
  // native-rules #1: state shared by the gpu host functions, no justification
  auto state = std::make_shared<ContextGpu>();
  state->options = options.gpu;
  e.setHostState(kCatalogState, state);
  e.addRunCleanup([state] { state->clear(); });
  auto binding = RunBinding::of(e);

  e.set(object, "init", e.function("init", 1, [state](js::Engine& e, Args a) {
    Json reply;
    try {
      if (!state->device) {
        std::string error;
        state->device = Device::acquire(state->options, error);
        if (!state->device) throw std::runtime_error(error);
      }
      state->catalog = catalogFor(stringArg(e, a, 0));
      reply = {{"ok", true}, {"adapter", state->device->description()}};
    } catch (const std::exception& ex) {
      reply = {{"ok", false}, {"error", ex.what()}};
    }
    return e.string(reply.dump());
  }));

  e.set(object, "uploadEncoded", e.function("uploadEncoded", 2, [state](js::Engine& e, Args a) {
    Device& device = state->ready();
    auto bytes = viewArg(e, a, 0, "uploadEncoded");
    const RgbaImage& image = state->decode(bytes.data(), bytes.size());
    const std::string run = stringArg(e, a, 1);
    const uint64_t bytesNeeded = state->allocation(image.width, image.height);
    const uint64_t id = state->own(device.upload(image.pixels.data(), image.width, image.height, ""), run, bytesNeeded);
    return e.string(Json{{"texture", id}, {"width", image.width}, {"height", image.height}}.dump());
  }));

  e.set(object, "uploadRgba", e.function("uploadRgba", 4, [state](js::Engine& e, Args a) {
    Device& device = state->ready();
    auto rgba = bytesArg(e, a, 0, "uploadRgba");
    const double w = a.size() > 1 ? e.toNumber(a[1]) : 0;
    const double h = a.size() > 2 ? e.toNumber(a[2]) : 0;
    if (!(w >= 1 && w <= 65535 && h >= 1 && h <= 65535) ||
        w != std::floor(w) || h != std::floor(h) || rgba.size() != size_t(w) * size_t(h) * 4) {
      throw std::runtime_error("__host.gpu.uploadRgba: pixel data does not match width * height * 4");
    }
    const std::string run = stringArg(e, a, 3);
    const uint64_t bytesNeeded = state->allocation(w, h);
    const uint64_t id = state->own(device.upload(rgba.data(), uint32_t(w), uint32_t(h), ""), run, bytesNeeded);
    return e.string(Json{{"texture", id}, {"width", w}, {"height", h}}.dump());
  }));

  e.set(object, "run", e.function("run", 2, [state](js::Engine& e, Args a) {
    Device& device = state->ready();
    Json request = Json::parse(stringArg(e, a, 0));
    Json params = Json::parse(a.size() > 1 ? stringArg(e, a, 1) : std::string("{}"));
    std::map<std::string, uint64_t> inputs;
    const Json bound = request.value("inputs", Json::object());
    if (!bound.is_object()) throw std::runtime_error("GPU inputs must be an object");
    for (auto& [name, id] : bound.items()) {
      const uint64_t handle = textureId(id);
      state->require(handle);
      inputs[name] = handle;
    }
    const uint64_t bytesNeeded = state->allocation(request.at("width").get<double>(), request.at("height").get<double>());
    const std::string run = request.value("run", std::string());
    const uint64_t id = state->own(device.run(*state->catalog, request.at("module").get<std::string>(), params, inputs,
                                   request.at("width").get<double>(), request.at("height").get<double>(),
                                   ""), run, bytesNeeded);
    return e.string(Json{{"texture", id}}.dump());
  }));

  // Runs on the worker: the device and its textures belong to it. Inside a
  // run the pixels reach JavaScript without a copy.
  e.set(object, "readback", e.function("readback", 1, [state, binding](js::Engine& e, Args a) {
    Device& device = state->ready();
    uint32_t w = 0, h = 0;
    const uint64_t id = textureArg(e, a, 0);
    state->require(id);
    std::vector<uint8_t> rgba = device.read(id, w, h);
    js::Value out = e.object();
    AsyncRun* run = binding->run();
    e.set(out, "rgba", run ? run->adoptBytes(std::move(rgba)) : e.bytes(rgba.data(), rgba.size()));
    e.set(out, "width", e.number(w));
    e.set(out, "height", e.number(h));
    return out;
  }));

  e.set(object, "release", e.function("release", 1, [state](js::Engine& e, Args a) {
    state->release(textureArg(e, a, 0));
    return e.undefined();
  }));

  e.set(object, "releaseRun", e.function("releaseRun", 1, [state](js::Engine& e, Args a) {
    state->releaseRun(stringArg(e, a, 0));
    return e.undefined();
  }));

  e.set(object, "liveTextures", e.function("liveTextures", 0, [state](js::Engine& e, Args) {
    return e.number(double(state->textures.size()));
  }));
}

std::optional<Json> gpuBoundary(js::Engine& engine, const Json& message) {
  if (!holdsTexture(message)) return std::nullopt;
  Json out = message;
  portable(out, contextGpu(engine));
  return out;
}

void gpuEndRun(js::Engine& engine, const std::string&) {
  // All textures of the completed run go, even when guest code supplied a
  // different label. Repeated engine/run teardown is harmless.
  if (auto state = contextGpu(engine)) state->clear();
}

}  // namespace gr::host
