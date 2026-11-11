#include "host/image_vips.h"
#include <vips/vips8>
#include <cstdint>
#include <memory>
#include <regex>
#include <stdexcept>
#include <string>
#include <utility>
#include <vector>

namespace gr::host {
namespace {
using vips::VImage;
constexpr size_t maxPixels = 16777216;
constexpr size_t maxEncoded = 64 * 1024 * 1024;

const char* formatName(ImageSpec::Format format) {
  switch (format) {
    case ImageSpec::Format::Webp: return "webp";
    case ImageSpec::Format::Raw: return "raw";
    case ImageSpec::Format::Png: break;
  }
  return "png";
}

void checkSize(int w, int h) {
  if (w < 1 || h < 1 || size_t(w) * size_t(h) > maxPixels) throw std::runtime_error("Image exceeds native pixel limit");
}
VImage alpha(VImage image) {
  return image.has_alpha() ? image : image.bandjoin(255);
}
VImage open(const std::vector<uint8_t>& bytes, const ImageSpec& spec) {
  if (spec.raw) {
    const int w = spec.raw->width, h = spec.raw->height, c = spec.raw->channels;
    checkSize(w, h);
    if (c > 4 || bytes.size() != size_t(w) * h * c) throw std::runtime_error("Invalid raw pixel data");
    return VImage::new_from_memory(const_cast<uint8_t*>(bytes.data()), bytes.size(), w, h, c, VIPS_FORMAT_UCHAR)
      .copy(VImage::option()->set("interpretation", c < 3 ? VIPS_INTERPRETATION_B_W : VIPS_INTERPRETATION_sRGB));
  }
  if (spec.create) {
    const int w = spec.create->width, h = spec.create->height, c = spec.create->channels;
    checkSize(w, h);
    if (c != 3 && c != 4) throw std::runtime_error("Image creation needs RGB or RGBA");
    const auto& bg = spec.background;
    std::vector<double> color{bg.r, bg.g, bg.b};
    if (c == 4) color.push_back(bg.alpha * 255);
    return VImage::black(w, h, VImage::option()->set("bands", c)).new_from_image(color)
      .copy(VImage::option()->set("interpretation", VIPS_INTERPRETATION_sRGB));
  }
  if (bytes.empty() || bytes.size() > maxEncoded) throw std::runtime_error("Invalid encoded image size");
  // Restrict loaders to in-memory raster formats. SVG and container loaders can
  // resolve external resources outside the files capability's grants.
  const char* loader = vips_foreign_find_load_buffer(bytes.data(), bytes.size());
  const std::string name = loader ? loader : "";
  bool textSvg = false;
  if (name == "VipsForeignLoadSvgBuffer") {
    // Only the exact resource-free SVG shape emitted by draw.RenderText.
    if (bytes.size() > 8192) throw std::runtime_error("RenderText SVG exceeds native markup limit");
    const std::string xml(bytes.begin(), bytes.end());
    static const std::regex shape(R"SVG(<svg xmlns="http://www.w3.org/2000/svg" width="([0-9]+)" height="([0-9]+)"><text x="[^"<]*" y="[^"<]*" font-size="[^"<]*" fill="[^"<]*" font-family="[^"<]*" text-anchor="(start|middle|end)">[^<]*</text></svg>)SVG");
    static const std::regex resource(R"(url\s*\()", std::regex::icase);
    std::smatch match;
    if (!std::regex_match(xml, match, shape) || xml.find("&#") != std::string::npos || std::regex_search(xml, resource)) {
      throw std::runtime_error("Native sharp: SVG must be resource-free RenderText markup");
    }
    checkSize(std::stoi(match[1]), std::stoi(match[2]));
    textSvg = true;
  }
  if (!textSvg && name != "VipsForeignLoadPngBuffer" && name != "VipsForeignLoadJpegBuffer" &&
      name != "VipsForeignLoadWebpBuffer" && name != "VipsForeignLoadNsgifBuffer") {
    throw std::runtime_error("Native sharp: encoded format is not an allowed in-memory raster format");
  }
  auto image = VImage::new_from_buffer(bytes.data(), bytes.size(), "", VImage::option()->set("access", VIPS_ACCESS_RANDOM));
  checkSize(image.width(), image.height());
  return image;
}
VipsInfo info(VImage image, std::string format) {
  return {image.width(), image.height(), image.bands(), image.has_alpha(), std::move(format)};
}
const char* formatOf(const std::vector<uint8_t>& b, const ImageSpec& spec) {
  if (spec.raw || spec.create) return "raw";
  if (b.size() >= 12 && b[0] == 'R' && b[8] == 'W') return "webp";
  if (b.size() >= 8 && b[0] == 137 && b[1] == 80) return "png";
  if (b.size() >= 2 && b[0] == 255 && b[1] == 216) return "jpeg";
  if (b.size() >= 6 && b[0] == 'G') return "gif";
  return "unknown";
}
}  // namespace

const std::optional<std::string>& vipsStartup(const std::function<bool(std::string&)>& start) {
  // libvips's own state is process-wide, so the outcome of starting it is
  // too. Set once, under the thread-safe initialization of a local static,
  // and never changed afterwards.
  static const std::optional<std::string> outcome = [&]() -> std::optional<std::string> {
    std::string why;
    if (start) {
      // Caught, so the initialization completes and is never retried.
      try {
        if (start(why)) return std::nullopt;
      } catch (const std::exception& e) {
        why = e.what();
      } catch (...) {
        why = "the libvips starter threw";
      }
    } else if (vips_init("nodetool-graph-runner") == 0) {
      // Do not retain guest buffers in the process-wide operation cache.
      vips_cache_set_max(0);
      return std::nullopt;
    } else {
      why = vips_error_buffer();
    }
    return why.empty() ? std::string("vips_init failed") : why;
  }();
  return outcome;
}

void requireVips() {
  if (const auto& failure = vipsStartup()) {
    throw std::runtime_error("Native sharp is unavailable: libvips failed to start: " + *failure);
  }
}

VipsInfo vipsMetadata(const std::vector<uint8_t>& bytes, const ImageSpec& spec) {
  requireVips();
  return info(open(bytes, spec), formatOf(bytes, spec));
}

VipsOutput vipsTransform(const std::vector<uint8_t>& bytes, const ImageSpec& spec,
                         const std::vector<std::vector<uint8_t>>& overlays, uint64_t maxBytes) {
  requireVips();
  auto image = open(bytes, spec);
  if (spec.greyscale) image = image.colourspace(VIPS_INTERPRETATION_B_W);
  if (spec.resize) {
    const int w = spec.resize->width, h = spec.resize->height;
    checkSize(w, h);
    if (image.width() != w || image.height() != h) {
      const bool hasAlpha = image.has_alpha(); const auto originalFormat = image.format();
      if (hasAlpha) image = image.premultiply().cast(originalFormat);
      image = image.resize(double(w) / image.width(), VImage::option()->set("vscale", double(h) / image.height())->set("kernel", VIPS_KERNEL_LANCZOS3));
      if (hasAlpha) image = image.unpremultiply().cast(originalFormat);
    }
  }
  if (spec.extract) {
    const auto& r = *spec.extract;
    image = image.extract_area(r.left, r.top, r.width, r.height);
  }
  for (const auto& overlay : overlays) {
    auto top = alpha(open(overlay, ImageSpec{}).colourspace(VIPS_INTERPRETATION_sRGB));
    if (top.width() > image.width() || top.height() > image.height()) throw std::runtime_error("Image to composite must have same dimensions or smaller");
    image = alpha(image).composite2(top, VIPS_BLEND_MODE_OVER, VImage::option()->set("compositing_space", VIPS_INTERPRETATION_sRGB)
      ->set("x", (image.width() - top.width() + 1) / 2)->set("y", (image.height() - top.height() + 1) / 2));
  }
  const auto format = spec.format;
  // Sharp raw greyscale stays one/two bands. Encoded greyscale is sRGB.
  if (!(format == ImageSpec::Format::Raw && spec.greyscale)) image = image.colourspace(VIPS_INTERPRETATION_sRGB);
  if (spec.removeAlpha && image.has_alpha()) image = image.extract_band(0, VImage::option()->set("n", image.bands() - 1));
  if (spec.ensureAlpha) image = alpha(image);
  image = image.cast(VIPS_FORMAT_UCHAR);
  void* buffer = nullptr; size_t length = 0;
  if (format == ImageSpec::Format::Raw) {
    if (spec.greyscale) image = image[0];
    buffer = image.write_to_memory(&length);
  } else if (format == ImageSpec::Format::Png) {
    image.write_to_buffer(".png", &buffer, &length);
  } else {
    image.write_to_buffer(".webp", &buffer, &length,
                          VImage::option()->set("lossless", spec.webpLossless)->set("Q", spec.webpQuality));
  }
  std::unique_ptr<void, decltype(&g_free)> owner(buffer, g_free);
  if (length > maxBytes) throw std::runtime_error("Image output exceeds its reserved size");
  const auto* data = static_cast<const uint8_t*>(buffer);
  return {std::vector<uint8_t>(data, data + length), info(image, formatName(format))};
}
}  // namespace gr::host
