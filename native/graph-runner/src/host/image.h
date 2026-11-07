// Host image capability: decodes and encodes images for node code, which in
// TypeScript uses sharp (Node) or Canvas (browser) for this. The guest half
// is guest/host/image.mjs.
//
//   __host.image.decode(bytes)              -> {rgba: Uint8Array, width, height}
//   __host.image.info(bytes)                -> {width, height}
//   __host.image.encodePng(rgba, w, h)      -> Uint8Array
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

// PNG of straight-alpha RGBA8. Like the TypeScript encoder on Node, an image
// whose alpha is opaque everywhere is written without an alpha channel.
std::vector<uint8_t> encodePng(const uint8_t* rgba, uint32_t width, uint32_t height);

std::string base64Encode(const uint8_t* data, size_t size);

void installImage(js::Engine& engine, const js::Value& object, const HostOptions& options);

}  // namespace gr::host
