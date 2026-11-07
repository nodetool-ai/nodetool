#include "host/image.h"
#include "host/image_vips.h"

#include <stdexcept>
#include <cmath>
#include <limits>
#include <memory>
#include <webp/decode.h>

#define STB_IMAGE_IMPLEMENTATION
#define STBI_NO_HDR
#define STBI_NO_PIC
#define STBI_FAILURE_USERMSG
#include <stb_image.h>
#define STB_IMAGE_WRITE_IMPLEMENTATION
#define STBI_WRITE_NO_STDIO
#include <stb_image_write.h>

namespace gr::host {
namespace {

std::vector<uint8_t> bytesArg(js::Engine& e, const std::vector<js::Value>& args, size_t i,
                              const char* fn) {
  if (args.size() <= i || !e.isBytes(args[i])) {
    throw std::runtime_error(std::string("__host.image.") + fn + ": expected bytes");
  }
  return e.toBytes(args[i]);
}

uint32_t dimArg(js::Engine& e, const std::vector<js::Value>& args, size_t i) {
  double d = args.size() > i ? e.toNumber(args[i]) : 0;
  if (!(d >= 1 && d <= 65535) || d != std::floor(d)) throw std::runtime_error("__host.image: invalid image size");
  return uint32_t(d);
}

}  // namespace

RgbaImage decodeImage(const uint8_t* data, size_t size) {
  if (size > size_t(std::numeric_limits<int>::max())) throw std::runtime_error("encoded image is too large");
  uint32_t checkedW = 0, checkedH = 0;
  imageSize(data, size, checkedW, checkedH);
  if (checkedW > 65535 || checkedH > 65535 || size_t(checkedW) * checkedH > 16777216) throw std::runtime_error("Image exceeds native pixel limit");
  if (size >= 12 && data[0] == 'R' && data[8] == 'W') {
    RgbaImage out{checkedW, checkedH, std::vector<uint8_t>(size_t(checkedW) * checkedH * 4)};
    if (!WebPDecodeRGBAInto(data, size, out.pixels.data(), out.pixels.size(), checkedW * 4)) throw std::runtime_error("cannot decode WebP");
    return out;
  }
  int w = 0, h = 0, channels = 0;
  std::unique_ptr<stbi_uc, decltype(&stbi_image_free)> pixels(stbi_load_from_memory(data, int(size), &w, &h, &channels, 4), stbi_image_free);
  if (!pixels) {
    throw std::runtime_error(std::string("cannot decode image: ") + stbi_failure_reason());
  }
  RgbaImage out;
  out.width = uint32_t(w);
  out.height = uint32_t(h);
  out.pixels.assign(pixels.get(), pixels.get() + size_t(w) * size_t(h) * 4);
  return out;
}

void imageSize(const uint8_t* data, size_t size, uint32_t& width, uint32_t& height) {
  if (size > size_t(std::numeric_limits<int>::max())) throw std::runtime_error("encoded image is too large");
  int w = 0, h = 0, channels = 0;
  if (size >= 12 && data[0] == 'R' && data[8] == 'W') {
    if (!WebPGetInfo(data, size, &w, &h)) throw std::runtime_error("cannot read WebP size");
    width = uint32_t(w); height = uint32_t(h); return;
  }
  if (!stbi_info_from_memory(data, int(size), &w, &h, &channels)) {
    throw std::runtime_error(std::string("cannot read image size: ") + stbi_failure_reason());
  }
  width = uint32_t(w);
  height = uint32_t(h);
}

std::vector<uint8_t> encodePng(const uint8_t* rgba, uint32_t width, uint32_t height) {
  const size_t count = size_t(width) * size_t(height);
  if (!width || !height || width > 65535 || height > 65535 || count > 16777216) throw std::runtime_error("Invalid native image dimensions");
  bool opaque = true;
  for (size_t i = 0; i < count && opaque; ++i) opaque = rgba[i * 4 + 3] == 255;
  std::vector<uint8_t> rgb;
  const uint8_t* source = rgba;
  int channels = 4;
  if (opaque) {
    rgb.resize(count * 3);
    for (size_t i = 0; i < count; ++i) {
      rgb[i * 3] = rgba[i * 4];
      rgb[i * 3 + 1] = rgba[i * 4 + 1];
      rgb[i * 3 + 2] = rgba[i * 4 + 2];
    }
    source = rgb.data();
    channels = 3;
  }
  std::vector<uint8_t> out;
  auto append = [](void* context, void* data, int size) {
    auto* sink = static_cast<std::vector<uint8_t>*>(context);
    auto* bytes = static_cast<uint8_t*>(data);
    sink->insert(sink->end(), bytes, bytes + size);
  };
  if (!stbi_write_png_to_func(append, &out, int(width), int(height), channels, source,
                              int(width) * channels)) {
    throw std::runtime_error("cannot encode PNG");
  }
  return out;
}

std::string base64Encode(const uint8_t* data, size_t size) {
  static const char* alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
  std::string out;
  out.reserve((size + 2) / 3 * 4);
  size_t i = 0;
  for (; i + 2 < size; i += 3) {
    uint32_t v = (uint32_t(data[i]) << 16) | (uint32_t(data[i + 1]) << 8) | data[i + 2];
    out += alphabet[v >> 18];
    out += alphabet[(v >> 12) & 63];
    out += alphabet[(v >> 6) & 63];
    out += alphabet[v & 63];
  }
  if (i < size) {
    uint32_t v = uint32_t(data[i]) << 16;
    if (i + 1 < size) v |= uint32_t(data[i + 1]) << 8;
    out += alphabet[v >> 18];
    out += alphabet[(v >> 12) & 63];
    out += i + 1 < size ? alphabet[(v >> 6) & 63] : '=';
    out += '=';
  }
  return out;
}

void installImage(js::Engine& e, const js::Value& object, const HostOptions&) {
  installVipsImage(e, object);
  using Args = const std::vector<js::Value>&;
  e.set(object, "decode", e.function("decode", 1, [](js::Engine& e, Args a) {
    auto bytes = bytesArg(e, a, 0, "decode");
    RgbaImage image = decodeImage(bytes.data(), bytes.size());
    js::Value out = e.object();
    e.set(out, "rgba", e.bytes(image.pixels.data(), image.pixels.size()));
    e.set(out, "width", e.number(image.width));
    e.set(out, "height", e.number(image.height));
    return out;
  }));
  e.set(object, "info", e.function("info", 1, [](js::Engine& e, Args a) {
    auto bytes = bytesArg(e, a, 0, "info");
    uint32_t w = 0, h = 0;
    imageSize(bytes.data(), bytes.size(), w, h);
    js::Value out = e.object();
    e.set(out, "width", e.number(w));
    e.set(out, "height", e.number(h));
    int iw = 0, ih = 0, channels = 0;
    stbi_info_from_memory(bytes.data(), int(bytes.size()), &iw, &ih, &channels);
    WebPBitstreamFeatures features{};
    if (WebPGetFeatures(bytes.data(), bytes.size(), &features) == VP8_STATUS_OK) channels = features.has_alpha ? 4 : 3;
    e.set(out, "channels", e.number(channels));
    const auto& b = bytes;
    const char* format = b.size() >= 12 && b[0] == 'R' && b[8] == 'W' ? "webp"
        : b.size() >= 8 && b[0] == 137 && b[1] == 80 ? "png"
        : b.size() >= 2 && b[0] == 255 && b[1] == 216 ? "jpeg"
        : b.size() >= 6 && b[0] == 'G' && b[1] == 'I' ? "gif"
        : b.size() >= 2 && b[0] == 'B' && b[1] == 'M' ? "bmp" : "unknown";
    e.set(out, "format", e.string(format));
    return out;
  }));
  e.set(object, "encodePng", e.function("encodePng", 3, [](js::Engine& e, Args a) {
    auto rgba = bytesArg(e, a, 0, "encodePng");
    uint32_t w = dimArg(e, a, 1), h = dimArg(e, a, 2);
    if (rgba.size() != size_t(w) * h * 4) {
      throw std::runtime_error("__host.image.encodePng: pixel data does not match width * height * 4");
    }
    auto png = encodePng(rgba.data(), w, h);
    return e.bytes(png.data(), png.size());
  }));
}

}  // namespace gr::host
