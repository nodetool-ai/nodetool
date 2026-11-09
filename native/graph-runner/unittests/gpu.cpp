// Tests for the image and gpu host capabilities: the uniform packer against
// typegpu's packing, the image codec, one shader pass, one recipe, texture
// lifetime per run, the message boundary, the JavaScript functions, and the
// adapter fallback.
//
//   gr_gpu_tests <gpu-catalog.json>
//
// The catalog comes from `node guest/host/gpu-catalog.mjs build/gpu-catalog.json`.
// GPU cases need a WebGPU adapter. ctest points the Vulkan loader at lavapipe
// when it is installed, so no hardware GPU is involved.
#include "host/capabilities.h"
#include "host/gpu.h"
#include "host/gpu_catalog.h"
#include "host/gpu_device.h"
#include "host/image.h"
#include "js/engine.h"
#include "kernel/task.h"
#include "kernel/guest.h"

#include <algorithm>
#include <cmath>
#include <cstring>
#include <cstdio>
#include <cstdlib>
#include <fstream>
#include <iterator>
#include <string>
#include <vector>
#include <condition_variable>
#include <mutex>

namespace {

// native-rules #14: file-scope mutable test counters
int failures = 0;
int checks = 0;

#define CHECK(cond)                                                    \
  do {                                                                 \
    ++checks;                                                          \
    if (!(cond)) {                                                     \
      ++failures;                                                      \
      std::fprintf(stderr, "%s:%d: CHECK failed: %s\n", __FILE__,      \
                   __LINE__, #cond);                                   \
    }                                                                  \
  } while (0)

using gr::Json;
namespace gpu = gr::host::gpu;
namespace js = gr::js;

// native-rules #14: file-scope mutable catalog text
std::string catalogText;
std::shared_ptr<const gpu::Catalog> catalog;

int maxDiff(const std::vector<uint8_t>& a, const std::vector<uint8_t>& b) {
  if (a.size() != b.size()) return 256;
  int worst = 0;
  for (size_t i = 0; i < a.size(); ++i) worst = std::max(worst, std::abs(int(a[i]) - int(b[i])));
  return worst;
}

std::vector<uint8_t> gradient(uint32_t w, uint32_t h, bool opaque) {
  std::vector<uint8_t> px(size_t(w) * h * 4);
  for (uint32_t y = 0; y < h; ++y) {
    for (uint32_t x = 0; x < w; ++x) {
      uint8_t* p = &px[(size_t(y) * w + x) * 4];
      p[0] = uint8_t(x * 255 / std::max(1u, w - 1));
      p[1] = uint8_t(y * 255 / std::max(1u, h - 1));
      p[2] = 96;
      p[3] = opaque ? 255 : uint8_t(64 + (x + y) * 191 / std::max(1u, w + h - 2));
    }
  }
  return px;
}

// --- no GPU needed --------------------------------------------------------

void packerMatchesTypegpu() {
  int compared = 0;
  for (const auto& [key, module] : catalog->modules) {
    if (!module.hasUniform) continue;
    CHECK(!module.packedDefaults.empty());
    std::vector<uint8_t> packed = gpu::packUniform(module, module.paramDefaults);
    if (packed != module.packedDefaults) std::fprintf(stderr, "packer differs from typegpu for %s\n", key.c_str());
    CHECK(packed == module.packedDefaults);
    ++compared;
  }
  CHECK(compared > 40);
}

void numbersFollowJavaScript() {
  auto num = [](const char* json) {
    Json v = Json::parse(json);
    return gpu::jsNumber(&v);
  };
  CHECK(std::isnan(gpu::jsNumber(nullptr)));
  CHECK(num("null") == 0);
  CHECK(num("true") == 1);
  CHECK(num("\" 2.5 \"") == 2.5);
  CHECK(num("\"\"") == 0);
  CHECK(num("\"0x10\"") == 16);
  CHECK(std::isnan(num("\"NaN\"")));
  CHECK(std::isinf(num("\"-Infinity\"")) && num("\"-Infinity\"") < 0);
  CHECK(std::isnan(num("\"inf\"")));
  CHECK(num("[]") == 0);
  CHECK(num("[7]") == 7);
  CHECK(std::isnan(num("[1, 2]")));
  CHECK(std::isnan(num("{}")));

  // A vector field reads indices; a missing vector throws as typegpu does.
  const gpu::Module& blur = catalog->module("filters.blur.gaussian@1");
  auto packed = gpu::packUniform(blur, Json::parse(R"({"radius": 2, "sigma": 1, "direction": [0, 1]})"));
  float direction[2];
  std::memcpy(direction, packed.data() + 8, 8);
  CHECK(direction[0] == 0 && direction[1] == 1);
  bool threw = false;
  try {
    gpu::packUniform(blur, Json::parse(R"({"radius": 2, "sigma": 1})"));
  } catch (const std::exception&) {
    threw = true;
  }
  CHECK(threw);
}

void recipeParamsResolve() {
  Json pass = Json::parse(R"({"radius": "$.radius", "sigma": 0, "direction": [1, 0], "gone": "$.missing"})");
  Json out = gpu::resolvePassParams(pass, Json::parse(R"({"radius": 4})"));
  CHECK(out["radius"] == 4);
  CHECK(out["sigma"] == 0);
  CHECK(out["direction"] == Json::parse("[1, 0]"));
  CHECK(!out.contains("gone"));
}

void codecRoundTrips() {
  for (bool opaque : {true, false}) {
    auto px = gradient(7, 5, opaque);
    auto png = gr::host::encodePng(px.data(), 7, 5);
    CHECK(png.size() > 33);
    // IHDR colour type: 2 (RGB) for an opaque image, 6 (RGBA) otherwise.
    CHECK(png[25] == (opaque ? 2 : 6));
    gr::host::RgbaImage back = gr::host::decodeImage(png.data(), png.size());
    CHECK(back.width == 7 && back.height == 5);
    CHECK(back.pixels == px);
    uint32_t w = 0, h = 0;
    gr::host::imageSize(png.data(), png.size(), w, h);
    CHECK(w == 7 && h == 5);
  }
  bool threw = false;
  try {
    const uint8_t junk[4] = {1, 2, 3, 4};
    gr::host::decodeImage(junk, sizeof junk);
  } catch (const std::exception&) {
    threw = true;
  }
  CHECK(threw);
}

// --- GPU ------------------------------------------------------------------

gr::GpuOptions enabled() {
  gr::GpuOptions o;
  o.enabled = true;
  return o;
}

std::shared_ptr<gpu::Device> device() {
  std::string error;
  auto d = gpu::Device::acquire(enabled(), error);
  if (!d) std::fprintf(stderr, "no GPU device: %s\n", error.c_str());
  return d;
}

void shaderPass() {
  auto d = device();
  CHECK(d != nullptr);
  if (!d) return;
  auto px = gradient(5, 3, true);
  uint64_t source = d->upload(px.data(), 5, 3, "shader-pass");
  // color.invert is a fragment module with an optional mask, so the pass
  // also binds the white default texture.
  uint64_t out = d->run(*catalog, "color.invert@1", Json{{"amount", 1}}, {{"source", source}}, 5, 3, "shader-pass");
  uint32_t w = 0, h = 0;
  auto result = d->read(out, w, h);
  CHECK(w == 5 && h == 3);
  std::vector<uint8_t> expected = px;
  for (size_t i = 0; i < expected.size(); i += 4) {
    for (int c = 0; c < 3; ++c) expected[i + c] = uint8_t(255 - px[i + c]);
  }
  CHECK(maxDiff(result, expected) <= 1);

  // A compute module: a zero-radius gaussian copies its input.
  uint64_t copy = d->run(*catalog, "filters.blur.gaussian@1",
                         Json::parse(R"({"radius": 0, "sigma": 1, "direction": [1, 0]})"), {{"source", source}}, 5, 3,
                         "shader-pass");
  CHECK(maxDiff(d->read(copy, w, h), px) <= 1);

  // A module input missing is an error, not a crash.
  bool threw = false;
  try {
    d->run(*catalog, "color.invert@1", Json{{"amount", 1}}, {}, 5, 3, "shader-pass");
  } catch (const std::exception& e) {
    threw = std::string(e.what()).find("missing required input") != std::string::npos;
  }
  CHECK(threw);
  d->releaseRun("shader-pass");
}

void recipeRuns() {
  auto d = device();
  if (!d) return;
  // A flat colour stays flat under the separable blur recipe (two compute
  // passes through an intermediate).
  std::vector<uint8_t> flat(8 * 8 * 4);
  for (size_t i = 0; i < flat.size(); i += 4) {
    flat[i] = 200;
    flat[i + 1] = 40;
    flat[i + 2] = 90;
    flat[i + 3] = 255;
  }
  uint64_t source = d->upload(flat.data(), 8, 8, "recipe");
  Json params = {{"radius", 3}, {"sigma", 1.5}};
  uint64_t out = d->run(*catalog, "filters.blur.gaussianSeparable@1", params, {{"source", source}}, 8, 8, "recipe");
  uint32_t w = 0, h = 0;
  CHECK(maxDiff(d->read(out, w, h), flat) <= 1);

  // A single bright pixel spreads in both directions, so both passes ran.
  std::vector<uint8_t> spike(8 * 8 * 4, 0);
  for (size_t i = 3; i < spike.size(); i += 4) spike[i] = 255;
  const size_t centre = (4 * 8 + 4) * 4;
  spike[centre] = spike[centre + 1] = spike[centre + 2] = 255;
  uint64_t spikeId = d->upload(spike.data(), 8, 8, "recipe");
  auto blurred = d->read(d->run(*catalog, "filters.blur.gaussianSeparable@1", params, {{"source", spikeId}}, 8, 8, "recipe"), w, h);
  CHECK(blurred[centre] < 255);
  CHECK(blurred[(4 * 8 + 5) * 4] > 0);  // right neighbour: horizontal pass
  CHECK(blurred[(5 * 8 + 4) * 4] > 0);  // lower neighbour: vertical pass
  CHECK(blurred[(5 * 8 + 5) * 4] > 0);  // diagonal: both
  d->releaseRun("recipe");
}

void texturesLiveForTheirRun() {
  auto d = device();
  if (!d) return;
  const size_t before = d->liveTextures();
  auto e = js::createQuickJsEngine();
  auto object = e->object();
  gr::HostOptions options; options.gpu = enabled();
  gr::host::installGpu(*e, object, options);
  e->call(e->get(object, "init"), e->undefined(), {e->string(catalogText)});
  auto px = gradient(4, 4, false);
  auto upload = [&](const std::string& label) {
    return Json::parse(e->toString(e->call(e->get(object, "uploadRgba"), e->undefined(),
      {e->bytes(px.data(), px.size()), e->number(4), e->number(4), e->string(label)})))["texture"].get<uint64_t>();
  };
  const uint64_t a1 = upload("run-a");
  const Json request = {{"module", "color.invert@1"}, {"inputs", {{"source", a1}}},
    {"width", 4}, {"height", 4}, {"run", "run-a"}};
  const uint64_t a2 = Json::parse(e->toString(e->call(e->get(object, "run"), e->undefined(),
    {e->string(request.dump()), e->string(R"({"amount":1})")})))["texture"].get<uint64_t>();
  const uint64_t b1 = upload("run-b");
  CHECK(d->liveTextures() == before + 3);

  Json message = {{"type", "output_update"},
                  {"value", {{"type", "image"}, {"mimeType", "image/x-gpu-texture"}, {"texture", {{"gpu", a2}}},
                             {"width", 400}, {"height", 400}}}};
  auto portable = gr::host::atBoundary(*e, message);
  CHECK(portable.has_value());
  if (portable) {
    const Json& v = (*portable)["value"];
    CHECK(v["mimeType"] == "image/png");
    CHECK(!v.contains("texture"));
    CHECK(v["width"] == 4 && v["height"] == 4);
    uint32_t w = 0, h = 0;
    auto expected = d->read(a2, w, h);
    const std::string b64 = v["data"].get<std::string>();
    std::vector<uint8_t> png;
    const std::string alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
    uint32_t acc = 0;
    int bits = 0;
    for (char c : b64) {
      if (c == '=') break;
      acc = (acc << 6) | uint32_t(alphabet.find(c));
      bits += 6;
      if (bits >= 8) {
        bits -= 8;
        png.push_back(uint8_t(acc >> bits));
      }
    }
    CHECK(gr::host::decodeImage(png.data(), png.size()).pixels == expected);
  }
  CHECK(!gr::host::atBoundary(*e, Json{{"type", "output_update"}, {"value", 3}}).has_value());
  e->call(e->get(object, "releaseRun"), e->undefined(), {e->string("run-a")});
  CHECK(!d->has(a1) && !d->has(a2));
  CHECK(d->has(b1));
  CHECK(d->liveTextures() == before + 1);
  auto stale = gr::host::atBoundary(*e, message);
  CHECK(stale && (*stale)["value"]["data"] == "");
  gr::host::endRun(*e, "actual-job");
  CHECK(d->liveTextures() == before);
}

// Every catalog module compiles on wgpu-native (naga) and runs with its
// defaults: the WGSL was written against Dawn (Tint).
void everyModuleRuns() {
  auto d = device();
  if (!d) return;
  auto px = gradient(6, 4, false);
  uint64_t source = d->upload(px.data(), 6, 4, "every-module");
  int ran = 0;
  for (const auto& [key, module] : catalog->modules) {
    std::map<std::string, uint64_t> inputs;
    for (const auto& [name, contract] : module.inputs) inputs[name] = source;
    try {
      d->run(*catalog, key, module.paramDefaults, inputs, 6, 4, "every-module");
      ++ran;
    } catch (const std::exception& e) {
      std::fprintf(stderr, "%s: %s\n", key.c_str(), e.what());
      CHECK(false);
    }
  }
  CHECK(ran == int(catalog->modules.size()));
  d->releaseRun("every-module");
}

// The capability's JavaScript functions, as guest/host/gpu.mjs calls them.
void javascriptFunctions() {
  auto e = js::createQuickJsEngine();
  js::Value object = e->object();
  gr::HostOptions options;
  options.gpu = enabled();
  gr::host::installGpu(*e, object, options);
  js::Value image = e->object();
  gr::host::installImage(*e, image, options);
  js::Value host = e->object();
  e->set(host, "gpu", object);
  e->set(host, "image", image);
  e->set(e->global(), "__host", host);
  e->set(e->global(), "catalogJson", e->string(catalogText));
  js::Value r = e->evaluateScript(R"JS(
    (() => {
      const g = __host.gpu;
      const status = JSON.parse(g.init(catalogJson));
      if (!status.ok) return "init: " + status.error;
      for (const handle of [0, -1, 1.5, Infinity, NaN, 9007199254740992]) {
        try { g.readback(handle); return "invalid handle accepted"; }
        catch (err) { if (!String(err).includes("invalid texture handle")) return "handle validation " + err; }
      }
      for (const width of [1.5, Infinity, NaN, 4294967296]) {
        try { g.uploadRgba(new Uint8Array(4), width, 1, "js"); return "invalid size accepted"; }
        catch (err) {}
      }
      const before = g.liveTextures();
      const bad = JSON.stringify({ module: "color.invert@1", inputs: {}, width: 2, height: 2, run: "js" });
      try { g.run(bad, "{}"); return "missing input accepted"; } catch (err) {}
      if (g.liveTextures() !== before) return "failed shader leaked texture";
      const px = new Uint8Array(2 * 2 * 4).fill(255);
      px[0] = 10;
      const up = JSON.parse(g.uploadRgba(px, 2, 2, "js"));
      const req = JSON.stringify({ module: "color.invert@1", inputs: { source: up.texture }, width: 2, height: 2, run: "js" });
      const out = JSON.parse(g.run(req, JSON.stringify({ amount: 1 })));
      const back = g.readback(out.texture);
      if (!(back.rgba instanceof Uint8Array) || back.width !== 2) return "readback shape";
      if (Math.abs(back.rgba[0] - 245) > 1 || back.rgba[1] !== 0 || back.rgba[3] !== 255) return "pixels " + Array.from(back.rgba).join(",");
      const png = __host.image.encodePng(back.rgba, 2, 2);
      const metadata = __host.image.info(png);
      if (metadata.width !== 2 || metadata.height !== 2 || metadata.channels !== 3 || metadata.format !== "png") return "metadata";
      const transparent = __host.image.encodePng(new Uint8Array(4), 1, 1);
      if (__host.image.info(transparent).channels !== 4) return "alpha metadata";
      try { __host.image.info(new Uint8Array([1, 2, 3])); return "invalid image accepted"; } catch (err) {}
      const decoded = __host.image.decode(png);
      if (decoded.rgba[0] !== back.rgba[0]) return "codec";
      const enc = JSON.parse(g.uploadEncoded(png, "js"));
      if (enc.width !== 2 || enc.height !== 2) return "uploadEncoded";
      if (g.liveTextures() < 3) return "live " + g.liveTextures();
      g.releaseRun("js");
      try { g.readback(out.texture); return "released texture still readable"; } catch (err) {}
      return "ok";
    })()
  )JS", "gpu-test.js");
  const std::string result = e->toString(r);
  if (result != "ok") std::fprintf(stderr, "javascript: %s\n", result.c_str());
  CHECK(result == "ok");
}

// Catalog texture ids are untrusted guest data, even when devices are shared.
void catalogOwnerIsolation() {
  auto make = [](std::function<std::string(gr::OutputImage)> outputImages = {}) {
    auto engine = js::createQuickJsEngine();
    auto object = engine->object();
    gr::HostOptions options; options.gpu = enabled(); options.gpu.outputImages = std::move(outputImages);
    gr::host::installGpu(*engine, object, options);
    engine->set(engine->global(), "gpu", object);
    engine->set(engine->global(), "catalogJson", engine->string(catalogText));
    engine->evaluateScript("if (!JSON.parse(gpu.init(catalogJson)).ok) throw Error('catalog init')", "owner-init");
    return engine;
  };
  auto a = make(), b = make();
  auto upload = [](js::Engine& e, const std::string& label) {
    return uint64_t(e.toNumber(e.evaluateScript(
      "JSON.parse(gpu.uploadRgba(new Uint8Array([17,31,59,255]),1,1," + Json(label).dump() + ")).texture", "owner-upload")));
  };
  auto readable = [](js::Engine& e, uint64_t id) {
    try {
      const auto result = e.evaluateScript("Array.from(gpu.readback(" + std::to_string(id) + ").rgba).join(',')", "owner-read");
      return e.toString(result) == "17,31,59,255";
    } catch (const std::exception&) { return false; }
  };
  auto rejects = [](js::Engine& e, const std::string& source) {
    try { e.evaluateScript(source, "owner-reject"); return false; }
    catch (const std::exception&) { return true; }
  };
  auto ref = [](uint64_t id) {
    return Json{{"type", "output_update"}, {"value", {{"type", "image"},
      {"mimeType", "image/x-gpu-texture"}, {"texture", {{"gpu", id}}}, {"width", 1}, {"height", 1}}}};
  };
  uint64_t first = upload(*a, "same-job"), peer = upload(*b, "same-job");
  CHECK(readable(*a, first)); CHECK(readable(*b, peer));
  for (const auto& bad : {Json(-1), Json(0), Json(1.5), Json("1"), Json(nullptr), Json(9007199254740992ULL)}) {
    const Json request = {{"module", "color.invert@1"}, {"inputs", {{"source", bad}}}, {"width", 1}, {"height", 1}};
    CHECK(rejects(*a, "gpu.run(" + Json(request.dump()).dump() + ", '{}')"));
    auto malformed = ref(first); malformed["value"]["texture"]["gpu"] = bad;
    const auto output = gr::host::gpuBoundary(*a, malformed);
    CHECK(output && !(*output)["value"].contains("texture") && !(*output)["value"].contains("mimeType"));
  }
  CHECK(rejects(*a, "gpu.uploadRgba(new Uint8Array(4),1,1,{toString(){throw Error('bad label')}})"));
  CHECK(a->toNumber(a->evaluateScript("gpu.liveTextures()", "owner-count")) == 1);
  CHECK(rejects(*a, "gpu.run(" + Json(Json{{"module", "color.invert@1"}, {"inputs", {{"source", first}}},
    {"width", 65535}, {"height", 65535}}.dump()).dump() + ", '{}')"));
  CHECK(a->toNumber(a->evaluateScript("gpu.liveTextures()", "owner-count")) == 1);
  {
    auto denied = js::createQuickJsEngine();
    auto object = denied->object();
    gr::host::installGpu(*denied, object, gr::HostOptions{});
    const auto status = Json::parse(denied->toString(denied->call(denied->get(object, "init"), denied->undefined(), {denied->string(catalogText)})));
    CHECK(status["ok"] == false);
    auto output = gr::host::gpuBoundary(*denied, ref(first));
    CHECK(output && !(*output)["value"].contains("texture") && !(*output)["value"].contains("mimeType"));
    auto uninstalled = js::createQuickJsEngine();
    output = gr::host::gpuBoundary(*uninstalled, ref(first));
    CHECK(output && !(*output)["value"].contains("texture") && !(*output)["value"].contains("mimeType"));
  }
  CHECK(rejects(*b, "gpu.readback(" + std::to_string(first) + ")"));
  CHECK(rejects(*b, "gpu.run(" + Json(Json{{"module", "color.invert@1"}, {"inputs", {{"source", first}}},
      {"width", 1}, {"height", 1}, {"run", "same-job"}}.dump()).dump() + ", '{}')"));
  auto foreignOutput = gr::host::gpuBoundary(*b, ref(first));
  CHECK(foreignOutput && (*foreignOutput)["value"].value("mimeType", std::string()) != "image/png");
  CHECK(rejects(*b, "gpu.release(" + std::to_string(first) + ")"));
  CHECK(readable(*a, first));
  // Keep testing cleanup even when the negative release check destroyed it.
  if (!readable(*a, first)) first = upload(*a, "same-job");
  b->evaluateScript("gpu.releaseRun('same-job')", "owner-release-label");
  CHECK(readable(*a, first));
  CHECK(!readable(*b, peer));
  peer = upload(*b, "same-job");
  // Public job strings do not identify owners. One context's run end must
  // neither retain mislabeled textures nor destroy another context's work.
  const uint64_t mislabeled = upload(*a, "guest-controlled-label");
  a->releaseRunResources();
  gr::host::gpuEndRun(*a, "same-job");
  CHECK(!readable(*a, first)); CHECK(!readable(*a, mislabeled));
  CHECK(readable(*b, peer));
  auto ownOutput = gr::host::gpuBoundary(*b, ref(peer));
  CHECK(ownOutput && (*ownOutput)["value"].value("mimeType", std::string()) == "image/png");
  // Every message that carries the texture gets the same encoding, and a
  // released texture's encoding is never served again.
  auto again = gr::host::gpuBoundary(*b, ref(peer));
  CHECK(again && (*again)["value"]["data"] == (*ownOutput)["value"]["data"]);
  b->evaluateScript("gpu.release(" + std::to_string(peer) + ")", "owner-release-encoded");
  auto released = gr::host::gpuBoundary(*b, ref(peer));
  CHECK(released && (*released)["value"].value("mimeType", std::string()) != "image/png");
  peer = upload(*b, "same-job");
  {
    // An embedder that shows outputs in process takes the pixels once and
    // messages carry its URI instead of image data.
    std::vector<gr::OutputImage> taken;
    auto embedded = make([&](gr::OutputImage image) {
      taken.push_back(std::move(image));
      return "local-media://" + std::to_string(taken.size());
    });
    const auto texture = upload(*embedded, "embedded-job");
    auto first = gr::host::gpuBoundary(*embedded, ref(texture));
    auto second = gr::host::gpuBoundary(*embedded, ref(texture));
    CHECK(first && (*first)["value"].value("uri", std::string()) == "local-media://1");
    CHECK(first && !(*first)["value"].contains("data") && !(*first)["value"].contains("mimeType") && !(*first)["value"].contains("texture"));
    CHECK(second && (*second)["value"] == (*first)["value"]);
    CHECK(taken.size() == 1 && taken[0].run == "embedded-job" && taken[0].width == 1 && taken[0].height == 1);
    CHECK(taken.size() == 1 && taken[0].rgba == std::vector<uint8_t>({17, 31, 59, 255}));
    // A hook that returns no URI leaves the output as PNG data.
    auto declined = make([](gr::OutputImage) { return std::string(); });
    const auto kept = upload(*declined, "declined-job");
    auto png = gr::host::gpuBoundary(*declined, ref(kept));
    CHECK(png && (*png)["value"].value("mimeType", std::string()) == "image/png" && !(*png)["value"].contains("uri"));
    for (auto* engine : {embedded.get(), declined.get()}) {
      engine->releaseRunResources();
    }
    gr::host::gpuEndRun(*embedded, "embedded-job");
    gr::host::gpuEndRun(*declined, "declined-job");
  }
  b->releaseRunResources();
  gr::host::gpuEndRun(*b, "same-job");
  gr::host::gpuEndRun(*b, "guest-controlled-label");
  CHECK(a->toNumber(a->evaluateScript("gpu.liveTextures()", "owner-count")) == 0);
  CHECK(b->toNumber(b->evaluateScript("gpu.liveTextures()", "owner-count")) == 0);
  const auto baseline = device()->liveTextures();
  for (int run = 0; run < 4; ++run) {
    const auto owned = upload(*a, "repeated-run"), survivor = upload(*b, "repeated-run");
    gr::host::gpuEndRun(*a, "repeated-run");
    gr::host::gpuEndRun(*a, "repeated-run");
    CHECK(!readable(*a, owned)); CHECK(readable(*b, survivor));
    b->releaseRunResources();
    CHECK(device()->liveTextures() == baseline);
  }
  const auto survivor = upload(*b, "context-teardown");
  upload(*a, "context-teardown");
  a.reset();
  CHECK(device()->liveTextures() == baseline + 1);
  CHECK(readable(*b, survivor));
  b.reset();
  CHECK(device()->liveTextures() == baseline);
}

// Adapter selection: the GPU is opt-in, a software (CPU) adapter such as
// lavapipe serves when no hardware one does, and a build without GPU support
// says so.
void computeRuns(const std::string& path) {
  gr::HostOptions opts; opts.gpu=enabled();
  gr::GraphRunner runner(path,opts);
  CHECK(runner.waitUntilLoaded(60000));
  if(!runner.ready()) {std::fprintf(stderr,"compute bundle: %s\n",runner.loadError().c_str());return;}
  const std::string graph=R"({"nodes":[{"id":"gpu","type":"native.ComputeProbe","data":{}}],"edges":[]})";
  for(int i=0;i<4;++i) {
    std::mutex mutex; std::condition_variable cv; bool done=false, success=false;
    runner.submit("compute-"+std::to_string(i),"wf",graph,"{}",[&](const std::string& text,bool last) {
      std::lock_guard lock(mutex); auto msg=Json::parse(text);
      if(msg.value("status",std::string())=="failed") std::fprintf(stderr,"compute run: %s\n",text.c_str());
      if(msg.value("type",std::string())=="job_update" && msg.value("status",std::string())=="completed") success=true;
      if(last) {done=true;cv.notify_one();}
    });
    std::unique_lock lock(mutex); CHECK(cv.wait_for(lock,std::chrono::seconds(30),[&]{return done;})); CHECK(success);
  }
  CHECK(runner.contextLoads()==1);
}

void catalogOwnerRuns(const std::string& path) {
  auto graph = [](bool hold, uint64_t foreign = 0) {
    Json data = {{"hold", hold}};
    if (foreign) data["foreignId"] = foreign;
    return Json{{"nodes", Json::array({{{"id", "gpu"}, {"type", "native.CatalogOwnerProbe"}, {"data", data}}})},
      {"edges", Json::array()}}.dump();
  };
  std::mutex mutex; std::condition_variable changed;
  uint64_t texture = 0;
  bool resume = false, heldDone = false, peerDone = false, heldSuccess = false, peerSuccess = false;
  bool heldPng = false, peerPng = false, foreignSanitized = false;
  auto inspect = [](const Json& value, auto&& self) -> bool {
    if (value.is_object() && value.value("mimeType", std::string()) == "image/png" && value.contains("data")) return true;
    if (value.is_object() || value.is_array()) for (const auto& child : value) if (self(child, self)) return true;
    return false;
  };
  bool barrierDone = false, barrierSuccess = false;
  gr::HostOptions options; options.gpu = enabled();
  gr::GraphRunner held(path, options), peer(path, options);
  CHECK(held.waitUntilLoaded(60000)); CHECK(peer.waitUntilLoaded(60000));
  if (!held.ready() || !peer.ready()) return;
  held.submit("same-public-job", "wf", graph(true), "{}", [&](const std::string& text, bool last) {
    std::unique_lock lock(mutex); const auto message = Json::parse(text);
    heldPng = heldPng || inspect(message, inspect);
    if (message.value("content", std::string()) == "catalog-held") {
      texture = message.at("texture_id").get<uint64_t>(); changed.notify_all();
      if (!changed.wait_for(lock, std::chrono::seconds(30), [&] { return resume; })) ++failures;
    }
    if (message.value("status", std::string()) == "completed") heldSuccess = true;
    if (message.value("status", std::string()) == "failed") std::fprintf(stderr, "held catalog run: %s\n", text.c_str());
    if (last) { heldDone = true; changed.notify_all(); }
  });
  {
    std::unique_lock lock(mutex);
    CHECK(changed.wait_for(lock, std::chrono::seconds(30), [&] { return texture != 0; }));
  }
  peer.submit("same-public-job", "wf", graph(false, texture), "{}", [&](const std::string& text, bool last) {
    std::lock_guard lock(mutex); const auto message = Json::parse(text);
    if (message.value("content", std::string()) == "foreign-output") {
      foreignSanitized = message.at("value").value("mimeType", std::string()) != "image/png" &&
        !message.at("value").contains("texture") && message.at("value").value("data", std::string("missing")).empty();
    } else peerPng = peerPng || inspect(message, inspect);
    if (message.value("status", std::string()) == "completed") peerSuccess = true;
    if (message.value("status", std::string()) == "failed") std::fprintf(stderr, "peer catalog run: %s\n", text.c_str());
    if (last) { peerDone = true; changed.notify_all(); }
  });
  {
    std::unique_lock lock(mutex);
    CHECK(changed.wait_for(lock, std::chrono::seconds(30), [&] { return peerDone; }));
  }
  // A second job is a worker barrier: the previous run's cleanup occurs
  // after its final message and before the next job can execute.
  peer.submit("same-public-job", "wf", graph(false), "{}", [&](const std::string& text, bool last) {
    std::lock_guard lock(mutex); const auto message = Json::parse(text);
    if (message.value("status", std::string()) == "failed") std::fprintf(stderr, "catalog repeat: %s\n", text.c_str());
    if (message.value("status", std::string()) == "completed") barrierSuccess = true;
    if (last) { barrierDone = true; changed.notify_all(); }
  });
  {
    std::unique_lock lock(mutex);
    CHECK(changed.wait_for(lock, std::chrono::seconds(30), [&] { return barrierDone; }));
    resume = true; changed.notify_all();
    CHECK(changed.wait_for(lock, std::chrono::seconds(30), [&] { return heldDone; }));
    CHECK(heldSuccess); CHECK(peerSuccess); CHECK(barrierSuccess); CHECK(heldPng); CHECK(peerPng); CHECK(foreignSanitized);
  }
  CHECK(held.contextLoads() == 1); CHECK(peer.contextLoads() == 1);
}

void renderGuest(const char* path) {
  std::ifstream file(path); std::string source((std::istreambuf_iterator<char>(file)), {});
  CHECK(!source.empty());
  auto e=js::createQuickJsEngine(); auto host=e->object(); gr::HostOptions opts; opts.gpu=enabled();
  gr::Guest guest(*e,opts);
  e->evaluateScript(source,"render-test.js");
  e->evaluateScript("renderTest().catch(e=>{globalThis.renderResult=String(e)+' '+e.stack})","render-start");
  auto& loop=gr::Loop::current(); loop.setPump([&]{return e->drainJobs()>0;}); loop.run(); loop.setPump(nullptr);
  auto result=e->toString(e->get(e->global(),"renderResult"));
  if(result!="ok") std::fprintf(stderr,"render: %s\n",result.c_str());
  CHECK(result=="ok");
  e->releaseRunResources();
}

void computeEngineTeardown() {
  auto& loop=gr::Loop::current();
  {
    auto e=js::createQuickJsEngine(); auto host=e->object(); gr::HostOptions options; options.gpu=enabled();
    gr::host::installGpu(*e,host,options);
    e->evaluateScript(R"JS((async()=>{
      const a=await navigator.gpu.requestAdapter(); const d=await a.requestDevice();
      const b=d.createBuffer({size:16,usage:9});
      b.mapAsync(1).catch(()=>{});
    })())JS","teardown.js");
    e->drainJobs();
    CHECK(loop.pendingTimers()>0);
  }
  CHECK(loop.pendingTimers()==0);
}

void computeGuest() {
  auto e = js::createQuickJsEngine();
  gr::HostOptions options;
  options.gpu = enabled();
  auto host = e->object();
  gr::host::installGpu(*e, host, options);
  auto peer=js::createQuickJsEngine(); auto peerHost=peer->object();
  gr::host::installGpu(*peer,peerHost,options);
  auto peerResult=peer->evaluateScript(
#include "compute.js.inc"
  , "peer-compute.js");
  CHECK(peer->isPromise(peerResult));
  auto token=e->nativeObject(std::make_shared<js::NativePayload>());
  CHECK(!peer->nativePayload(token));
  auto result = e->evaluateScript(
#include "compute.js.inc"
  , "compute-test.js");
  CHECK(e->isPromise(result));
  auto& loop = gr::Loop::current();
  loop.setPump([&] { const auto ran=e->drainJobs(); return peer->drainJobs()+ran > 0; });
  loop.run();
  loop.setPump(nullptr);
  const auto status = e->toString(e->get(e->global(), "computeResult"));
  if (status != "ok") std::fprintf(stderr,"compute: %s\n",status.c_str());
  CHECK(status == "ok");
  CHECK(peer->toString(peer->get(peer->global(),"computeResult")) == "ok");
  peer->releaseRunResources();
  CHECK(e->toNumber(e->call(e->get(host,"computeResourceCount"),e->undefined(),{})) == 0);
  e->evaluateScript(R"JS(globalThis.cancelled='pending'; (async()=>{
    const a=await navigator.gpu.requestAdapter(); globalThis.cancelDevice=await a.requestDevice();
    globalThis.cancelBuffer=cancelDevice.createBuffer({size:16,usage:9});
    cancelBuffer.mapAsync(1).then(()=>{cancelled='resolved'},()=>{cancelled='cancelled'});
  })())JS","cancel-test");
  e->drainJobs();
  CHECK(loop.pendingTimers() > 0);
  loop.clearTimers();
  e->drainJobs();
  CHECK(e->toString(e->get(e->global(),"cancelled")) == "cancelled");
  e->releaseRunResources();
  CHECK(e->toNumber(e->call(e->get(host,"computeResourceCount"),e->undefined(),{})) == 0);
}

void adapterFallback() {
  gr::GpuOptions off;
  std::string error;
  CHECK(gpu::Device::acquire(off, error) == nullptr);
  CHECK(error.find("did not enable the GPU") != std::string::npos);

  auto e = js::createQuickJsEngine();
  js::Value object = e->object();
  gr::host::installGpu(*e, object, gr::HostOptions{});
#ifdef NODETOOL_GRAPH_RUNNER_GPU
  e->evaluateScript("globalThis.denied='pending'; navigator.gpu.requestAdapter().then(()=>{denied='granted'},e=>{denied=e instanceof Error?'denied':'wrong error'})", "denied.js");
  e->drainJobs();
  CHECK(e->toString(e->get(e->global(),"denied")) == "denied");
#endif
  Json status = Json::parse(e->toString(e->call(e->get(object, "init"), e->undefined(), {e->string(catalogText)})));
  CHECK(status["ok"] == false);
  CHECK(status["error"].get<std::string>().find("did not enable") != std::string::npos);

#ifdef NODETOOL_GRAPH_RUNNER_GPU
  gr::GpuOptions software = enabled();
  software.softwareOnly = true;
  error.clear();
  auto cpu = gpu::Device::acquire(software, error);
  CHECK(cpu != nullptr);
  if (cpu) {
    CHECK(cpu->description().find("CPU") != std::string::npos);
    auto px = gradient(3, 3, false);
    uint64_t id = cpu->upload(px.data(), 3, 3, "software");
    uint32_t w = 0, h = 0;
    // Premultiplied upload and readback round-trip within one level.
    CHECK(maxDiff(cpu->read(id, w, h), px) <= 1);
    cpu->releaseRun("software");
  }
  // With only lavapipe visible, the default request lands on it too.
  const char* icd = std::getenv("VK_ICD_FILENAMES");
  if (icd && std::string(icd).find("lvp_icd") != std::string::npos) {
    auto d = device();
    CHECK(d && d->description().find("CPU") != std::string::npos);
  }
#else
  error.clear();
  CHECK(gpu::Device::acquire(enabled(), error) == nullptr);
  CHECK(error.find("without GPU support") != std::string::npos);
#endif
}

}  // namespace

int main(int argc, char** argv) {
  if (argc < 2) {
    std::fprintf(stderr, "usage: gr_gpu_tests <gpu-catalog.json>\n");
    return 2;
  }
  std::ifstream in(argv[1], std::ios::binary);
  if (!in) {
    std::fprintf(stderr, "cannot read %s (node guest/host/gpu-catalog.mjs %s)\n", argv[1], argv[1]);
    return 2;
  }
  catalogText.assign(std::istreambuf_iterator<char>(in), std::istreambuf_iterator<char>());
  catalog = gpu::parseCatalog(catalogText);

  packerMatchesTypegpu();
  numbersFollowJavaScript();
  recipeParamsResolve();
  codecRoundTrips();
  adapterFallback();
#ifdef NODETOOL_GRAPH_RUNNER_GPU
  if (auto d = device()) std::fprintf(stderr, "adapter: %s\n", d->description().c_str());
  computeGuest();
  computeGuest();
  computeEngineTeardown();
  if(argc>2) {
    renderGuest(argv[2]);
    if(argc<4 || std::string(argv[3])!="--engine-only") {
      computeRuns(std::string(argv[2])+".runner.js");
      catalogOwnerRuns(std::string(argv[2])+".runner.js");
    }
  }
  shaderPass();
  recipeRuns();
  everyModuleRuns();
  texturesLiveForTheirRun();
  javascriptFunctions();
  catalogOwnerIsolation();
#endif
  std::printf("%d checks, %d failures\n", checks, failures);
  return failures == 0 ? 0 : 1;
}
