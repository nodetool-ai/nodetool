#include "host/image_vips.h"
#include <vips/vips8>
#include <nlohmann/json.hpp>
#include <memory>
#include <mutex>
#include <regex>
#include <stdexcept>
#include <vector>

namespace gr::host {
namespace {
using vips::VImage;
using Json = nlohmann::json;
constexpr size_t maxPixels = 16777216;
constexpr size_t maxEncoded = 64 * 1024 * 1024;
void init() {
  // native-rules #14: process-wide libvips init flag
  static std::once_flag once;
  std::call_once(once, [] {
    if (vips_init("nodetool-graph-runner")) throw std::runtime_error(vips_error_buffer());
    // Do not retain guest buffers in the process-wide operation cache.
    vips_cache_set_max(0);
  });
}
int dimension(const Json& object, const char* key) {
  if (!object.contains(key) || !object[key].is_number_integer()) throw std::runtime_error("Invalid image dimension");
  const auto value = object[key].get<int64_t>();
  if (value < 1 || value > 65535) throw std::runtime_error("Invalid image dimension");
  return static_cast<int>(value);
}
void checkSize(int w, int h) {
  if (w < 1 || h < 1 || size_t(w) * size_t(h) > maxPixels) throw std::runtime_error("Image exceeds native pixel limit");
}
VImage alpha(VImage image) {
  return image.has_alpha() ? image : image.bandjoin(255);
}
VImage open(const std::vector<uint8_t>& bytes, const Json& spec) {
  if (spec.contains("raw")) {
    const auto& raw = spec["raw"];
    int w = dimension(raw, "width"), h = dimension(raw, "height"), c = dimension(raw, "channels");
    checkSize(w, h);
    if (c > 4 || bytes.size() != size_t(w) * h * c) throw std::runtime_error("Invalid raw pixel data");
    return VImage::new_from_memory(const_cast<uint8_t*>(bytes.data()), bytes.size(), w, h, c, VIPS_FORMAT_UCHAR)
      .copy(VImage::option()->set("interpretation", c < 3 ? VIPS_INTERPRETATION_B_W : VIPS_INTERPRETATION_sRGB));
  }
  if (spec.contains("create")) {
    const auto& create = spec["create"];
    int w = dimension(create, "width"), h = dimension(create, "height"), c = dimension(create, "channels");
    checkSize(w, h);
    if (c != 3 && c != 4) throw std::runtime_error("Image creation needs RGB or RGBA");
    const auto& bg = create.at("background");
    std::vector<double> color{bg.at("r"), bg.at("g"), bg.at("b")};
    if (c == 4) color.push_back(bg.value("alpha", 1.0) * 255);
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
js::Value info(js::Engine& e, VImage image, const char* format) {
  auto out = e.object();
  e.set(out, "width", e.number(image.width())); e.set(out, "height", e.number(image.height()));
  e.set(out, "channels", e.number(image.bands())); e.set(out, "format", e.string(format));
  e.set(out, "hasAlpha", e.boolean(image.has_alpha()));
  return out;
}
const char* formatOf(const std::vector<uint8_t>& b, const Json& spec) {
  if (spec.contains("raw") || spec.contains("create")) return "raw";
  if (b.size() >= 12 && b[0] == 'R' && b[8] == 'W') return "webp";
  if (b.size() >= 8 && b[0] == 137 && b[1] == 80) return "png";
  if (b.size() >= 2 && b[0] == 255 && b[1] == 216) return "jpeg";
  if (b.size() >= 6 && b[0] == 'G') return "gif";
  return "unknown";
}
}
void installVipsImage(js::Engine& e, const js::Value& object) {
  init();
  using Args = const std::vector<js::Value>&;
  e.set(object, "metadata", e.function("metadata", 2, [](js::Engine& e, Args a) {
    if (a.size() < 2 || !e.isBytes(a[0])) throw std::runtime_error("Image metadata requires bytes");
    auto b = e.toBytes(a[0]); auto spec = Json::parse(e.toString(a[1]));
    return info(e, open(b, spec), formatOf(b, spec));
  }));
  e.set(object, "transform", e.function("transform", 2, [](js::Engine& e, Args a) {
    if (a.size() < 2 || !e.isBytes(a[0])) throw std::runtime_error("Image transform requires bytes");
    auto bytes = e.toBytes(a[0]); auto spec = Json::parse(e.toString(a[1]));
    // Keep every backing buffer alive until libvips finishes its lazy graph.
    std::vector<std::vector<uint8_t>> overlays;
    for (size_t i = 2; i < a.size(); ++i) {
      if (!e.isBytes(a[i])) throw std::runtime_error("Composite requires bytes");
      overlays.push_back(e.toBytes(a[i]));
    }
    auto image = open(bytes, spec);
    if (spec.value("greyscale", false)) image = image.colourspace(VIPS_INTERPRETATION_B_W);
    if (spec.contains("resize")) {
      int w = dimension(spec["resize"], "width"), h = dimension(spec["resize"], "height"); checkSize(w, h);
      if (image.width() != w || image.height() != h) {
        const bool hasAlpha = image.has_alpha(); const auto originalFormat = image.format();
        if (hasAlpha) image = image.premultiply().cast(originalFormat);
        image = image.resize(double(w) / image.width(), VImage::option()->set("vscale", double(h) / image.height())->set("kernel", VIPS_KERNEL_LANCZOS3));
        if (hasAlpha) image = image.unpremultiply().cast(originalFormat);
      }
    }
    if (spec.contains("extract")) {
      const auto& r = spec["extract"];
      image = image.extract_area(r.at("left").get<int>(), r.at("top").get<int>(), dimension(r, "width"), dimension(r, "height"));
    }
    for (const auto& overlay : overlays) {
      auto top = alpha(open(overlay, Json::object()).colourspace(VIPS_INTERPRETATION_sRGB));
      if (top.width() > image.width() || top.height() > image.height()) throw std::runtime_error("Image to composite must have same dimensions or smaller");
      image = alpha(image).composite2(top, VIPS_BLEND_MODE_OVER, VImage::option()->set("compositing_space", VIPS_INTERPRETATION_sRGB)
        ->set("x", (image.width() - top.width() + 1) / 2)->set("y", (image.height() - top.height() + 1) / 2));
    }
    const std::string format = spec.value("format", "png");
    // Sharp raw greyscale stays one/two bands. Encoded greyscale is sRGB.
    if (!(format == "raw" && spec.value("greyscale", false))) image = image.colourspace(VIPS_INTERPRETATION_sRGB);
    if (spec.value("removeAlpha", false) && image.has_alpha()) image = image.extract_band(0, VImage::option()->set("n", image.bands() - 1));
    if (spec.value("ensureAlpha", false)) image = alpha(image);
    image = image.cast(VIPS_FORMAT_UCHAR);
    void* buffer = nullptr; size_t length = 0;
    if (format == "raw") {
      if (spec.value("greyscale", false)) image = image[0];
      buffer = image.write_to_memory(&length);
    }
    else if (format == "png") image.write_to_buffer(".png", &buffer, &length);
    else if (format == "webp") {
      const auto options = spec.value("webp", Json::object());
      for (const auto& [key, value] : options.items()) if (key != "lossless" && key != "quality") throw std::runtime_error("Unsupported native WebP option");
      int quality = options.value("quality", 80);
      if (quality < 1 || quality > 100) throw std::runtime_error("Invalid WebP quality");
      image.write_to_buffer(".webp", &buffer, &length, VImage::option()->set("lossless", options.value("lossless", false))->set("Q", quality));
    } else throw std::runtime_error("Unsupported image output format");
    std::unique_ptr<void, decltype(&g_free)> owner(buffer, g_free);
    auto out = e.object(); e.set(out, "data", e.bytes(static_cast<uint8_t*>(buffer), length));
    e.set(out, "info", info(e, image, format.c_str())); return out;
  }));
}
}
