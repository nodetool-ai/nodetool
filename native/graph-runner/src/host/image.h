// Host image capability: decodes and encodes images for node code, which in
// TypeScript uses sharp (Node) or Canvas (browser) for this. The guest half
// is guest/host/image.mjs.
//
//   __host.image.decode(bytes)              -> {rgba: Uint8Array, width, height}
//   __host.image.info(bytes)                -> {width, height}
//   __host.image.encodePng(rgba, w, h)      -> Uint8Array
//   __host.image.encodePngAsync(rgba, w, h) -> Promise<Uint8Array>
//   __host.image.metadata(bytes, spec)      -> Promise<{width, height, channels, format, hasAlpha}>
//   __host.image.transform(bytes, spec, ...overlays)
//                                           -> Promise<{data: Uint8Array, info}>
//
// The promise-returning functions copy their inputs at the call and run on
// the bound run's CPU lane (host/image_jobs.h). Outside a run they run at
// the call and return the value itself.
//
// Pixels are straight-alpha RGBA8, the shape decodeRgba returns. Decoding
// reads PNG, JPEG, BMP, GIF (first frame), TGA, PSD and PNM (stb_image), plus WebP (libwebp).
#pragma once

#include "js/engine.h"
#include "nodetool/graph_runner.h"

#include <cstdint>
#include <string>
#include <vector>

namespace gr::host {

struct RgbaImage {
  uint32_t width = 0;
  uint32_t height = 0;
  std::vector<uint8_t> pixels;  // straight alpha, width * height * 4
};

// Throws std::runtime_error naming the decoder's reason.
RgbaImage decodeImage(const uint8_t* data, size_t size);
void imageSize(const uint8_t* data, size_t size, uint32_t& width, uint32_t& height);

// What __host.image.info reports: the size, the channel count the decoder
// sees (0 when it cannot tell) and the format sniffed from the signature.
struct EncodedImageInfo {
  uint32_t width = 0;
  uint32_t height = 0;
  int channels = 0;
  const char* format = "unknown";
};
// Throws std::runtime_error like imageSize.
EncodedImageInfo encodedImageInfo(const uint8_t* data, size_t size);

// PNG of straight-alpha RGBA8. Like the TypeScript encoder on Node, an image
// whose alpha is opaque everywhere is written without an alpha channel.
// Fails, before appending it, when the PNG holds more than `maxBytes`.
// Safe on any thread: stb_image_write's PNG path only reads its file-scope
// settings, which nothing in the runner sets (docs/plans/
// graph-runner-async-host-evidence.md, Q4.3).
std::vector<uint8_t> encodePng(const uint8_t* rgba, uint32_t width, uint32_t height,
                               uint64_t maxBytes = UINT64_MAX);

std::string base64Encode(const uint8_t* data, size_t size);

// Defined in image_jobs.cpp, which submits the promise-returning functions.
void installImage(js::Engine& engine, const js::Value& object, const HostOptions& options);

}  // namespace gr::host
