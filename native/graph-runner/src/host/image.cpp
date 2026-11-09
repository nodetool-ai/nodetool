#include "host/image.h"

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

EncodedImageInfo encodedImageInfo(const uint8_t* data, size_t size) {
  EncodedImageInfo out;
  imageSize(data, size, out.width, out.height);
  int iw = 0, ih = 0, channels = 0;
  stbi_info_from_memory(data, int(size), &iw, &ih, &channels);
  WebPBitstreamFeatures features{};
  if (WebPGetFeatures(data, size, &features) == VP8_STATUS_OK) channels = features.has_alpha ? 4 : 3;
  out.channels = channels;
  out.format = size >= 12 && data[0] == 'R' && data[8] == 'W' ? "webp"
      : size >= 8 && data[0] == 137 && data[1] == 80 ? "png"
      : size >= 2 && data[0] == 255 && data[1] == 216 ? "jpeg"
      : size >= 6 && data[0] == 'G' && data[1] == 'I' ? "gif"
      : size >= 2 && data[0] == 'B' && data[1] == 'M' ? "bmp" : "unknown";
  return out;
}

std::vector<uint8_t> encodePng(const uint8_t* rgba, uint32_t width, uint32_t height, uint64_t maxBytes) {
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
  struct Sink {
    std::vector<uint8_t> out;
    uint64_t maxBytes;
    bool overflow = false;
  } sink{{}, maxBytes};
  auto append = [](void* context, void* data, int size) {
    auto* to = static_cast<Sink*>(context);
    if (to->overflow || size < 0 || uint64_t(size) > to->maxBytes - to->out.size()) {
      to->overflow = true;
      return;
    }
    auto* bytes = static_cast<uint8_t*>(data);
    to->out.insert(to->out.end(), bytes, bytes + size);
  };
  if (!stbi_write_png_to_func(append, &sink, int(width), int(height), channels, source,
                              int(width) * channels)) {
    throw std::runtime_error("cannot encode PNG");
  }
  if (sink.overflow) throw std::runtime_error("PNG output exceeds its reserved size");
  return std::move(sink.out);
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

}  // namespace gr::host
