#include "host/canvas.h"
#ifdef GR_HAVE_CANVAS
#include "host/image.h"
#include "host/image_jobs.h"
#include "kernel/async_jobs.h"

#include <cairo.h>
#include <fontconfig/fontconfig.h>
#include <pango/pangocairo.h>
#include <pango/pangofc-fontmap.h>
#include <unistd.h>
#if defined(__linux__)
#include <sys/mman.h>
#else
#include <cstdlib>
#include <filesystem>
#endif
#include <algorithm>
#include <cmath>
#include <cstdio>
#include <memory>
#include <sstream>
#include <stdexcept>
#include <string>
#include <vector>

namespace gr::host {
namespace {
constexpr size_t MAX_PIXELS = 16 * 1024 * 1024;
constexpr size_t MAX_TOTAL = 32 * 1024 * 1024;
int dimension(double n) {
  if (!std::isfinite(n) || n < 1 || n > 16384 || std::floor(n) != n) {
    throw std::runtime_error("canvas: invalid dimensions");
  }
  return static_cast<int>(n);
}
struct Fonts {
  // native-rules #6: raw Pango, fontconfig and fd handles freed by hand in the destructor
  // The fontconfig map on every platform. The default map on macOS is
  // CoreText, which cannot take a private FcConfig.
  PangoFontMap* map = pango_cairo_font_map_new_for_font_type(CAIRO_FONT_TYPE_FT);
  FcConfig* config = FcConfigCreate();
  std::vector<int> descriptors;
  // Without memfd, each font is a private temporary file, removed here.
  std::vector<std::string> paths;
  size_t byteCount = 0;
  Fonts() {
    if (!map || !PANGO_IS_FC_FONT_MAP(map) || !config) {
      if (map) {
        g_object_unref(map);
      }
      if (config) {
        FcConfigDestroy(config);
      }
      throw std::runtime_error("canvas: font initialization failed");
    }
    pango_fc_font_map_set_config(PANGO_FC_FONT_MAP(map), config);
  }
  ~Fonts() {
    g_object_unref(map);
    FcConfigDestroy(config);
    for (int fd : descriptors) {
      close(fd);
    }
    for (const auto& path : paths) {
      std::error_code ignored;
      std::filesystem::remove(path, ignored);
    }
  }
};
struct Surface {
  // native-rules #1: budget shared by all surfaces, no justification
  std::shared_ptr<size_t> budget;
  int width, height;
  unsigned savedDepth = 0;
  size_t pathCommands = 0;
  // native-rules #6: raw cairo handles freed by hand in the destructor
  cairo_surface_t* image = nullptr;
  cairo_t* ctx = nullptr;
  Surface(int w, int h, std::shared_ptr<size_t> b) : budget(std::move(b)), width(w), height(h) {
    const size_t count = size_t(w) * h;
    if (count > MAX_PIXELS || *budget + count > MAX_TOTAL) {
      throw std::runtime_error("canvas: pixel budget exceeded");
    }
    image = cairo_image_surface_create(CAIRO_FORMAT_ARGB32, w, h);
    if (cairo_surface_status(image) != CAIRO_STATUS_SUCCESS) {
      cairo_surface_destroy(image);
      throw std::runtime_error("canvas: allocation failed");
    }
    ctx = cairo_create(image);
    if (cairo_status(ctx) != CAIRO_STATUS_SUCCESS) {
      cairo_destroy(ctx);
      cairo_surface_destroy(image);
      throw std::runtime_error("canvas: context allocation failed");
    }
    *budget += count;
  }
  ~Surface() {
    cairo_destroy(ctx);
    cairo_surface_destroy(image);
    *budget -= size_t(width) * height;
  }
  void check() {
    if (cairo_status(ctx) != CAIRO_STATUS_SUCCESS) {
      throw std::runtime_error(cairo_status_to_string(cairo_status(ctx)));
    }
  }
};
struct Color {
  double r = 0, g = 0, b = 0, a = 1;
};
Color color(std::string s) {
  Color c;
  if (s == "transparent") {
    c.a = 0;
    return c;
  }
  if (s == "white") {
    s = "#ffffff";
  }
  if (s == "black") {
    s = "#000000";
  }
  if (s == "red") {
    s = "#ff0000";
  }
  if (s == "blue") {
    s = "#0000ff";
  }
  if (s == "green") {
    s = "#008000";
  }
  if (s.size() && s[0] == '#') {
    s.erase(0, 1);
    if (s.size() == 3 || s.size() == 4) {
      std::string t;
      for (char x : s) {
        t += x;
        t += x;
      }
      s = t;
    }
    if ((s.size() != 6 && s.size() != 8) ||
        s.find_first_not_of("0123456789abcdefABCDEF") != std::string::npos) {
      throw std::runtime_error("canvas: invalid color");
    }
    c.r = std::stoi(s.substr(0, 2), nullptr, 16) / 255.;
    c.g = std::stoi(s.substr(2, 2), nullptr, 16) / 255.;
    c.b = std::stoi(s.substr(4, 2), nullptr, 16) / 255.;
    if (s.size() == 8) {
      c.a = std::stoi(s.substr(6, 2), nullptr, 16) / 255.;
    }
    return c;
  }
  double r, g, b, a = 1;
  if (sscanf(s.c_str(), "rgba(%lf , %lf , %lf , %lf)", &r, &g, &b, &a) == 4 ||
      sscanf(s.c_str(), "rgb(%lf , %lf , %lf)", &r, &g, &b) == 3) {
    {
      if (!std::isfinite(r) || !std::isfinite(g) || !std::isfinite(b) || !std::isfinite(a)) {
        throw std::runtime_error("canvas: invalid color");
      }
      return {std::clamp(r / 255, 0., 1.), std::clamp(g / 255, 0., 1.), std::clamp(b / 255, 0., 1.),
              std::clamp(a, 0., 1.)};
    }
  }
  PangoColor parsed{};
  guint16 alpha = 65535;
  if (pango_color_parse_with_alpha(&parsed, &alpha, s.c_str())) {
    return {parsed.red / 65535., parsed.green / 65535., parsed.blue / 65535., alpha / 65535.};
  }
  throw std::runtime_error("canvas: unsupported color " + s);
}
void source(cairo_t* c, Color v, double alpha) {
  cairo_set_source_rgba(c, v.r, v.g, v.b, v.a * alpha);
}
// Canvas shadows blur the source alpha in device pixels. The source must not
// inherit the output clip: an off-clip glyph can cast a shadow into that clip.
void pathShadow(Surface& destination, Color shadow, double blur, double offsetX, double offsetY,
                bool stroke) {
  if (!std::isfinite(blur) || blur < 0 || blur > 128 || !std::isfinite(offsetX) ||
      !std::isfinite(offsetY) || std::abs(offsetX) > 4096 || std::abs(offsetY) > 4096) {
    throw std::runtime_error("canvas: shadow parameter limit exceeded");
  }
  auto* c = destination.ctx;
  double left, top, right, bottom;
  if (stroke) {
    cairo_stroke_extents(c, &left, &top, &right, &bottom);
  } else {
    cairo_path_extents(c, &left, &top, &right, &bottom);
  }
  if (left == right || top == bottom) {
    return;
  }
  cairo_matrix_t matrix;
  cairo_get_matrix(c, &matrix);
  double minX = 1e30, minY = 1e30, maxX = -1e30, maxY = -1e30;
  for (double x : {left, right}) {
    for (double y : {top, bottom}) {
      double dx = x, dy = y;
      cairo_matrix_transform_point(&matrix, &dx, &dy);
      minX = std::min(minX, dx);
      maxX = std::max(maxX, dx);
      minY = std::min(minY, dy);
      maxY = std::max(maxY, dy);
    }
  }
  const double sigma = blur / 2;
  const int radius = blur <= 0.01 ? 0 : static_cast<int>(std::ceil(3 * sigma));
  const double x0 = std::floor(std::max(minX - radius, -offsetX - radius));
  const double y0 = std::floor(std::max(minY - radius, -offsetY - radius));
  const double x1 = std::ceil(std::min(maxX + radius, destination.width - offsetX + radius));
  const double y1 = std::ceil(std::min(maxY + radius, destination.height - offsetY + radius));
  if (x1 <= x0 || y1 <= y0) {
    return;
  }
  if (!std::isfinite(x0) || !std::isfinite(y0) || !std::isfinite(x1) || !std::isfinite(y1) ||
      x1 - x0 > 16384 || y1 - y0 > 16384) {
    throw std::runtime_error("canvas: shadow extent limit exceeded");
  }
  const int w = static_cast<int>(x1 - x0), h = static_cast<int>(y1 - y0);
  const size_t pixels = size_t(w) * h;
  // Scratch alpha storage and convolution work are bounded separately from the
  // live Cairo pixel budget. Typical text uses only its tight ink rectangle.
  if (pixels > 4 * 1024 * 1024 || pixels * size_t(2 * radius + 1) * 2 > 128 * 1024 * 1024) {
    throw std::runtime_error("canvas: shadow work budget exceeded");
  }
  Surface mask(w, h, destination.budget);
  auto shifted = matrix;
  shifted.x0 -= x0;
  shifted.y0 -= y0;
  cairo_set_matrix(mask.ctx, &shifted);
  std::unique_ptr<cairo_path_t, decltype(&cairo_path_destroy)> path(cairo_copy_path(c),
                                                                    cairo_path_destroy);
  cairo_append_path(mask.ctx, path.get());
  cairo_set_source(mask.ctx, cairo_get_source(c));
  if (stroke) {
    cairo_set_line_width(mask.ctx, cairo_get_line_width(c));
    cairo_set_line_join(mask.ctx, cairo_get_line_join(c));
    cairo_stroke(mask.ctx);
  } else {
    cairo_fill(mask.ctx);
  }
  mask.check();
  cairo_surface_flush(mask.image);
  auto* data = cairo_image_surface_get_data(mask.image);
  const int stride = cairo_image_surface_get_stride(mask.image);
  std::vector<float> alpha(pixels), temporary;
  for (int y = 0; y < h; ++y) {
    for (int x = 0; x < w; ++x) {
      alpha[size_t(y) * w + x] = (reinterpret_cast<uint32_t*>(data + y * stride)[x] >> 24) / 255.f;
    }
  }
  if (radius > 0) {
    std::vector<double> kernel(size_t(radius) * 2 + 1);
    double sum = 0;
    for (int i = -radius; i <= radius; ++i) {
      double v = std::exp(-double(i) * i / (2 * sigma * sigma));
      kernel[i + radius] = v;
      sum += v;
    }
    for (auto& v : kernel) {
      v /= sum;
    }
    temporary.resize(pixels);
    for (int y = 0; y < h; ++y) {
      for (int x = 0; x < w; ++x) {
        double value = 0;
        for (int k = -radius; k <= radius; ++k) {
          if (x + k >= 0 && x + k < w) {
            value += alpha[size_t(y) * w + x + k] * kernel[k + radius];
          }
        }
        temporary[size_t(y) * w + x] = value;
      }
    }
    for (int y = 0; y < h; ++y) {
      for (int x = 0; x < w; ++x) {
        double value = 0;
        for (int k = -radius; k <= radius; ++k) {
          if (y + k >= 0 && y + k < h) {
            value += temporary[size_t(y + k) * w + x] * kernel[k + radius];
          }
        }
        alpha[size_t(y) * w + x] = value;
      }
    }
  }
  for (int y = 0; y < h; ++y) {
    for (int x = 0; x < w; ++x) {
      unsigned a =
          std::lround(std::clamp(double(alpha[size_t(y) * w + x]) * shadow.a, 0., 1.) * 255);
      reinterpret_cast<uint32_t*>(data + y * stride)[x] =
          (a << 24) | (unsigned(std::lround(shadow.r * a)) << 16) |
          (unsigned(std::lround(shadow.g * a)) << 8) | unsigned(std::lround(shadow.b * a));
    }
  }
  cairo_surface_mark_dirty(mask.image);
  cairo_save(c);
  cairo_identity_matrix(c);
  cairo_set_source_surface(c, mask.image, x0 + offsetX, y0 + offsetY);
  cairo_paint(c);
  cairo_restore(c);
}

// The surface's pixels as straight-alpha RGBA8. Flushes first, as cairo
// requires before reading the data. Worker only, like the surface.
std::vector<uint8_t> straightRgba(Surface& s) {
  cairo_surface_flush(s.image);
  auto* data = cairo_image_surface_get_data(s.image);
  int stride = cairo_image_surface_get_stride(s.image);
  std::vector<uint8_t> rgba(size_t(s.width) * s.height * 4);
  for (int y = 0; y < s.height; ++y) {
    for (int x = 0; x < s.width; ++x) {
      uint32_t v = reinterpret_cast<uint32_t*>(data + y * stride)[x];
      size_t i = (size_t(y) * s.width + x) * 4;
      unsigned alpha = v >> 24;
      rgba[i + 3] = alpha;
      for (int k = 0; k < 3; ++k) {
        rgba[i + k] = alpha ? std::min(255u, (((v >> (16 - 8 * k)) & 255) * 255 + alpha / 2) / alpha) : 0;
      }
    }
  }
  return rgba;
}

}  // namespace
void installCanvas(js::Engine& e, const js::Value& object, const HostOptions&) {
  e.set(object, "available", e.boolean(true));
  // native-rules #1: budget and fonts shared by the canvas host functions, no justification
  auto budget = std::make_shared<size_t>(0);
  auto fonts = std::make_shared<Fonts>();
  auto binding = RunBinding::of(e);
  e.set(object, "registerFont",
        e.function("registerFont", 1, [fonts](js::Engine& e, const auto& a) {
          if (a.size() != 1) {
            throw std::runtime_error("canvas: font bytes required");
          }
          // A view: nothing below runs JavaScript.
          const auto bytes = e.viewBytes(a[0]);
          if (bytes.empty() || bytes.size() > 16 * 1024 * 1024 || fonts->descriptors.size() >= 64 ||
              fonts->byteCount + bytes.size() > 64 * 1024 * 1024) {
            throw std::runtime_error("canvas: font budget exceeded");
          }
#if defined(__linux__)
          int fd = memfd_create("graph-runner-font", MFD_CLOEXEC);
          if (fd < 0) throw std::runtime_error("canvas: cannot allocate font storage");
          std::string path = "/proc/self/fd/" + std::to_string(fd);
#else
          std::string path = (std::filesystem::temp_directory_path() / "graph-runner-font-XXXXXX").string();
          int fd = mkstemp(path.data());
          if (fd < 0) throw std::runtime_error("canvas: cannot allocate font storage");
          fonts->paths.push_back(path);
#endif
          if (write(fd, bytes.data(), bytes.size()) != static_cast<ssize_t>(bytes.size())) {
            close(fd);
            throw std::runtime_error("canvas: cannot write font storage");
          }
          if (!FcConfigAppFontAddFile(fonts->config,
                                      reinterpret_cast<const FcChar8*>(path.c_str()))) {
            close(fd);
            return e.boolean(false);
          }
          fonts->descriptors.push_back(fd);
          fonts->byteCount += bytes.size();
          pango_fc_font_map_config_changed(PANGO_FC_FONT_MAP(fonts->map));
          return e.boolean(true);
        }));
  e.set(
      object, "create",
      e.function("create", 2, [budget, fonts, binding](js::Engine& e, const std::vector<js::Value>& a) {
        if (a.size() != 2) {
          throw std::runtime_error("canvas: create needs width and height");
        }
        auto s = std::make_shared<Surface>(dimension(e.toNumber(a[0])), dimension(e.toNumber(a[1])),
                                           budget);
        auto out = e.object();
        // Synchronous, as getImageData needs. Inside a run the snapshot
        // reaches JavaScript without a copy.
        e.set(out, "pixels", e.function("pixels", 0, [s, binding](js::Engine& e, const auto&) {
          auto rgba = straightRgba(*s);
          if (AsyncRun* run = binding->run()) return run->adoptBytes(std::move(rgba));
          return e.bytes(rgba.data(), rgba.size());
        }));
        // The pixels are copied here, on the worker that owns the surface,
        // and the copy is encoded on the run's CPU lane, so drawing after the
        // call cannot reach the PNG (docs/plans/
        // graph-runner-async-host-evidence.md, Q4.1). Outside a run, encodes
        // at the call and returns the bytes.
        e.set(out, "encodePng", e.function("encodePng", 0, [s, binding](js::Engine& e, const auto&) {
          const auto width = static_cast<uint32_t>(s->width), height = static_cast<uint32_t>(s->height);
          AsyncRun* run = binding->run();
          if (!run) {
            auto rgba = straightRgba(*s);
            auto png = encodePng(rgba.data(), width, height);
            return e.bytes(png.data(), png.size());
          }
          nodetool::jobs::Reservation reservation = run->reserve();
          reservation.reserveSnapshot(nodetool::jobs::checkedMul(nodetool::jobs::checkedMul(width, height), 4));
          auto rgba = straightRgba(*s);
          return submitPngJob(*run, std::move(rgba), width, height, std::move(reservation));
        }));
        e.set(out, "put", e.function("put", 5, [s](js::Engine& e, const auto& a) {
          if (a.size() != 5) {
            throw std::runtime_error("canvas: put arguments");
          }
          // The numbers are read first: their conversion can run JavaScript,
          // which would end the view below.
          int w = dimension(e.toNumber(a[1])), h = dimension(e.toNumber(a[2]));
          double dx = e.toNumber(a[3]), dy = e.toNumber(a[4]);
          const auto bytes = e.viewBytes(a[0]);
          if (size_t(w) * h > MAX_PIXELS || bytes.size() != size_t(w) * h * 4) {
            throw std::runtime_error("canvas: pixel length mismatch");
          }
          if (!std::isfinite(dx) || !std::isfinite(dy) || std::abs(dx) > 1e7 ||
              std::abs(dy) > 1e7) {
            throw std::runtime_error("canvas: invalid pixel origin");
          }
          int ox = dx, oy = dy;
          cairo_surface_flush(s->image);
          auto* data = cairo_image_surface_get_data(s->image);
          int stride = cairo_image_surface_get_stride(s->image);
          for (int y = 0; y < h; ++y) {
            for (int x = 0; x < w; ++x) {
              if (x + ox < 0 || x + ox >= s->width || y + oy < 0 || y + oy >= s->height) {
                continue;
              }
              size_t i = (size_t(y) * w + x) * 4;
              unsigned alpha = bytes[i + 3];
              reinterpret_cast<uint32_t*>(data + (y + oy) * stride)[x + ox] =
                  (alpha << 24) | (((bytes[i] * alpha + 127) / 255) << 16) |
                  (((bytes[i + 1] * alpha + 127) / 255) << 8) |
                  ((bytes[i + 2] * alpha + 127) / 255);
            }
          }
          cairo_surface_mark_dirty(s->image);
          return e.undefined();
        }));
        e.set(out, "call", e.function("call", 3, [s, budget, fonts](js::Engine& e, const auto& a) {
          if (a.size() != 3) {
            throw std::runtime_error("canvas: command arguments");
          }
          std::string op = e.toString(a[0]);
          auto args = a[1], state = a[2];
          auto* c = s->ctx;
          auto n = [&](int i) {
            double v = e.toNumber(e.get(args, std::to_string(i)));
            if (!std::isfinite(v) || std::abs(v) > 1e7) {
              throw std::runtime_error("canvas: invalid coordinate");
            }
            return v;
          };
          auto str = [&](const char* key) { return e.toString(e.get(state, key)); };
          double alpha = e.toNumber(e.get(state, "globalAlpha"));
          if (!std::isfinite(alpha) || alpha < 0 || alpha > 1) {
            throw std::runtime_error("canvas: invalid alpha");
          }
          std::string comp = str("globalCompositeOperation");
          const std::vector<std::pair<std::string, cairo_operator_t>> ops = {
              {"source-over", CAIRO_OPERATOR_OVER},
              {"copy", CAIRO_OPERATOR_SOURCE},
              {"destination-in", CAIRO_OPERATOR_DEST_IN},
              {"destination-out", CAIRO_OPERATOR_DEST_OUT},
              {"source-in", CAIRO_OPERATOR_IN},
              {"source-out", CAIRO_OPERATOR_OUT},
              {"destination-over", CAIRO_OPERATOR_DEST_OVER},
              {"xor", CAIRO_OPERATOR_XOR},
              {"lighter", CAIRO_OPERATOR_ADD},
              {"multiply", CAIRO_OPERATOR_MULTIPLY},
              {"screen", CAIRO_OPERATOR_SCREEN},
              {"overlay", CAIRO_OPERATOR_OVERLAY},
              {"darken", CAIRO_OPERATOR_DARKEN},
              {"lighten", CAIRO_OPERATOR_LIGHTEN},
              {"difference", CAIRO_OPERATOR_DIFFERENCE},
              {"exclusion", CAIRO_OPERATOR_EXCLUSION}};
          auto found =
              std::find_if(ops.begin(), ops.end(), [&](const auto& p) { return p.first == comp; });
          if (found == ops.end()) {
            throw std::runtime_error("canvas: unsupported composite " + comp);
          }
          cairo_set_operator(c, found->second);
          auto paint = [&](const char* key) {
            auto v = e.get(state, key);
            if (e.isString(v)) {
              source(c, color(e.toString(v)), alpha);
              return;
            }
            std::string kind = e.toString(e.get(v, "kind"));
            auto coords = e.get(v, "coords");
            auto cn = [&](int i) { return e.toNumber(e.get(coords, std::to_string(i))); };
            std::unique_ptr<cairo_pattern_t, decltype(&cairo_pattern_destroy)> pattern(
                kind == "linear"
                    ? cairo_pattern_create_linear(cn(0), cn(1), cn(2), cn(3))
                    : cairo_pattern_create_radial(cn(0), cn(1), cn(2), cn(3), cn(4), cn(5)),
                cairo_pattern_destroy);
            auto* p = pattern.get();
            auto stops = e.get(v, "stops");
            double count = e.toNumber(e.get(stops, "length"));
            if (!std::isfinite(count) || count < 0 || count > 256 || std::floor(count) != count) {
              throw std::runtime_error("canvas: gradient stop limit");
            }
            int len = static_cast<int>(count);
            for (int i = 0; i < len; ++i) {
              auto stop = e.get(stops, std::to_string(i));
              auto col = color(e.toString(e.get(stop, "1")));
              cairo_pattern_add_color_stop_rgba(p, e.toNumber(e.get(stop, "0")), col.r, col.g,
                                                col.b, col.a * alpha);
            }
            cairo_set_source(c, p);
          };
          const std::vector<std::pair<std::string, int>> numericOps = {
              {"translate", 2},        {"scale", 2},    {"rotate", 1},  {"setTransform", 6},
              {"transform", 6},        {"moveTo", 2},   {"lineTo", 2},  {"bezierCurveTo", 6},
              {"quadraticCurveTo", 4}, {"rect", 4},     {"ellipse", 7}, {"arcTo", 5},
              {"fillRect", 4},         {"clearRect", 4}};
          for (const auto& [name, count] : numericOps) {
            if (op == name) {
              for (int i = 0; i < count; ++i) {
                n(i);
              }
            }
          }
          if (op == "fillText" || op == "strokeText") {
            n(1);
            n(2);
          }
          bool drawing = op == "fill" || op == "stroke" || op == "fillRect" || op == "fillText" ||
                         op == "strokeText" || op == "drawImage";
          if (drawing && str("filter") != "none") {
            throw std::runtime_error("canvas: filter requires CPU timeline effects");
          }
          if (drawing && op != "fillText" && op != "strokeText" && op != "fillRect" &&
              color(str("shadowColor")).a > 0) {
            throw std::runtime_error("canvas: shadows on this drawing operation are unavailable");
          }
          if (op == "beginPath") {
            s->pathCommands = 0;
          }
          if (op == "moveTo" || op == "lineTo" || op == "bezierCurveTo" ||
              op == "quadraticCurveTo" || op == "rect" || op == "ellipse" || op == "arcTo" ||
              op == "closePath") {
            if (s->pathCommands >= 65536) {
              throw std::runtime_error("canvas: path command limit exceeded");
            }
            ++s->pathCommands;
          }
          if (op == "save") {
            if (s->savedDepth >= 256) {
              throw std::runtime_error("canvas: save limit exceeded");
            }
            ++s->savedDepth;
            cairo_save(c);
          } else if (op == "restore") {
            if (s->savedDepth > 0 && cairo_status(c) == CAIRO_STATUS_SUCCESS) {
              --s->savedDepth;
              cairo_restore(c);
            }
          } else if (op == "translate") {
            cairo_translate(c, n(0), n(1));
          } else if (op == "scale") {
            if (n(0) == 0 || n(1) == 0) {
              throw std::runtime_error("canvas: singular transform");
            }
            cairo_scale(c, n(0), n(1));
          } else if (op == "rotate") {
            cairo_rotate(c, n(0));
          } else if (op == "setTransform" || op == "transform") {
            cairo_matrix_t m;
            cairo_matrix_init(&m, n(0), n(1), n(2), n(3), n(4), n(5));
            if (op == "setTransform") {
              cairo_set_matrix(c, &m);
            } else {
              cairo_transform(c, &m);
            }
          } else if (op == "beginPath") {
            cairo_new_path(c);
          } else if (op == "closePath") {
            cairo_close_path(c);
          } else if (op == "moveTo") {
            cairo_move_to(c, n(0), n(1));
          } else if (op == "lineTo") {
            cairo_line_to(c, n(0), n(1));
          } else if (op == "bezierCurveTo") {
            cairo_curve_to(c, n(0), n(1), n(2), n(3), n(4), n(5));
          } else if (op == "quadraticCurveTo") {
            double x, y;
            cairo_get_current_point(c, &x, &y);
            cairo_curve_to(c, x + 2 * (n(0) - x) / 3, y + 2 * (n(1) - y) / 3,
                           n(2) + 2 * (n(0) - n(2)) / 3, n(3) + 2 * (n(1) - n(3)) / 3, n(2), n(3));
          } else if (op == "arcTo") {
            double x0, y0;
            cairo_get_current_point(c, &x0, &y0);
            double x1 = n(0), y1 = n(1), x2 = n(2), y2 = n(3), r = n(4);
            if (r < 0) {
              throw std::runtime_error("canvas: negative arc radius");
            }
            double ax = x0 - x1, ay = y0 - y1, bx = x2 - x1, by = y2 - y1, al = std::hypot(ax, ay),
                   bl = std::hypot(bx, by);
            if (!cairo_has_current_point(c)) {
              cairo_move_to(c, x1, y1);
            } else if (r == 0 || al == 0 || bl == 0) {
              cairo_line_to(c, x1, y1);
            } else {
              ax /= al;
              ay /= al;
              bx /= bl;
              by /= bl;
              double dot = std::clamp(ax * bx + ay * by, -1., 1.), cross = ax * by - ay * bx;
              if (std::abs(cross) < 1e-10) {
                cairo_line_to(c, x1, y1);
              } else {
                double half = std::acos(dot) / 2, d = r / std::tan(half),
                       cl = std::hypot(ax + bx, ay + by);
                double cx = x1 + (ax + bx) / cl * r / std::sin(half),
                       cy = y1 + (ay + by) / cl * r / std::sin(half);
                double tx = x1 + ax * d, ty = y1 + ay * d, ux = x1 + bx * d, uy = y1 + by * d;
                cairo_line_to(c, tx, ty);
                if (cross < 0) {
                  cairo_arc(c, cx, cy, r, std::atan2(ty - cy, tx - cx),
                            std::atan2(uy - cy, ux - cx));
                } else {
                  cairo_arc_negative(c, cx, cy, r, std::atan2(ty - cy, tx - cx),
                                     std::atan2(uy - cy, ux - cx));
                }
              }
            }
          } else if (op == "rect") {
            cairo_rectangle(c, n(0), n(1), n(2), n(3));
          } else if (op == "ellipse") {
            if (n(2) <= 0 || n(3) <= 0) {
              throw std::runtime_error("canvas: invalid ellipse");
            }
            cairo_save(c);
            cairo_translate(c, n(0), n(1));
            cairo_rotate(c, n(4));
            cairo_scale(c, n(2), n(3));
            if (e.toBoolean(e.get(args, "7"))) {
              cairo_arc_negative(c, 0, 0, 1, n(5), n(6));
            } else {
              cairo_arc(c, 0, 0, 1, n(5), n(6));
            }
            cairo_restore(c);
          } else if (op == "fill" || op == "clip") {
            cairo_set_fill_rule(c, e.toString(e.get(args, "0")) == "evenodd"
                                       ? CAIRO_FILL_RULE_EVEN_ODD
                                       : CAIRO_FILL_RULE_WINDING);
            if (op == "fill") {
              paint("fillStyle");
              cairo_fill_preserve(c);
            } else {
              cairo_clip_preserve(c);
            }
          } else if (op == "stroke") {
            paint("strokeStyle");
            double lw = e.toNumber(e.get(state, "lineWidth"));
            if (!std::isfinite(lw) || lw <= 0) {
              throw std::runtime_error("canvas: invalid line width");
            }
            cairo_set_line_width(c, lw);
            cairo_set_line_cap(c, str("lineCap") == "round"    ? CAIRO_LINE_CAP_ROUND
                                  : str("lineCap") == "square" ? CAIRO_LINE_CAP_SQUARE
                                                               : CAIRO_LINE_CAP_BUTT);
            cairo_set_line_join(c, str("lineJoin") == "round"   ? CAIRO_LINE_JOIN_ROUND
                                   : str("lineJoin") == "bevel" ? CAIRO_LINE_JOIN_BEVEL
                                                                : CAIRO_LINE_JOIN_MITER);
            auto d = e.get(state, "dash");
            std::vector<double> dash;
            double count = e.toNumber(e.get(d, "length"));
            if (!std::isfinite(count) || count < 0 || count > 256 || std::floor(count) != count) {
              throw std::runtime_error("canvas: dash limit");
            }
            int len = static_cast<int>(count);
            for (int i = 0; i < len; ++i) {
              {
                double v = e.toNumber(e.get(d, std::to_string(i)));
                if (!std::isfinite(v) || v < 0 || v > 1e7) {
                  throw std::runtime_error("canvas: invalid dash");
                }
                dash.push_back(v);
              }
            }
            cairo_set_dash(c, dash.data(), dash.size(), 0);
            cairo_stroke_preserve(c);
          } else if (op == "clearRect" || op == "fillRect") {
            if (op == "fillRect") {
              paint("fillStyle");
            }
            std::unique_ptr<cairo_path_t, decltype(&cairo_path_destroy)> path(cairo_copy_path(c),
                                                                              cairo_path_destroy);
            cairo_new_path(c);
            {
              cairo_save(c);
              std::unique_ptr<cairo_t, void (*)(cairo_t*)> restore(
                  c, [](cairo_t* context) { cairo_restore(context); });
              if (op == "clearRect") {
                cairo_set_operator(c, CAIRO_OPERATOR_CLEAR);
              }
              cairo_rectangle(c, n(0), n(1), n(2), n(3));
              if (op == "fillRect") {
                auto shadow = color(str("shadowColor"));
                if (shadow.a > 0) {
                  pathShadow(*s, shadow, e.toNumber(e.get(state, "shadowBlur")),
                             e.toNumber(e.get(state, "shadowOffsetX")),
                             e.toNumber(e.get(state, "shadowOffsetY")), false);
                }
              }
              cairo_fill(c);
            }
            cairo_append_path(c, path.get());

          } else if (op == "measureText" || op == "fillText" || op == "strokeText") {
            std::string text = e.toString(e.get(args, "0"));
            if (text.size() > 65536) {
              throw std::runtime_error("canvas: text limit exceeded");
            }
            std::string font = str("font");
            auto px = font.find("px");
            if (px == std::string::npos) {
              throw std::runtime_error("canvas: font needs px size");
            }
            size_t start = font.rfind(' ', px);
            start = start == std::string::npos ? 0 : start + 1;
            double size = std::stod(font.substr(start, px - start));
            if (!std::isfinite(size) || size <= 0 || size > 4096) {
              throw std::runtime_error("canvas: invalid font size");
            }
            if (fonts->descriptors.empty()) {
              throw std::runtime_error(
                  "canvas: text needs an explicitly registered "
                  "font");
            }
            std::unique_ptr<PangoFontDescription, decltype(&pango_font_description_free)> ownedDesc(
                pango_font_description_new(), pango_font_description_free);
            auto* desc = ownedDesc.get();
            std::string family = font.substr(px + 2);
            while (family.size() && family[0] == ' ') {
              family.erase(0, 1);
            }
            std::replace(family.begin(), family.end(), '"', ' ');
            pango_font_description_set_family(desc, family.c_str());
            pango_font_description_set_absolute_size(desc, size * PANGO_SCALE);
            std::istringstream prefix(font.substr(0, start));
            std::string token;
            while (prefix >> token) {
              if (token == "bold") {
                pango_font_description_set_weight(desc, PANGO_WEIGHT_BOLD);
              } else if (token.size() == 3 && token[0] >= '1' && token[0] <= '9' &&
                         token[1] == '0' && token[2] == '0') {
                pango_font_description_set_weight(desc, static_cast<PangoWeight>(std::stoi(token)));
              }
            }
            if (font.find("italic") != std::string::npos) {
              pango_font_description_set_style(desc, PANGO_STYLE_ITALIC);
            }
            auto* context = pango_font_map_create_context(fonts->map);
            if (!context) {
              throw std::runtime_error("canvas: cannot create text context");
            }
            // Canvas text metrics and shaping stay in user pixels. Importing
            // the output CTM into Pango changes advances under shear/scale;
            // Cairo applies that CTM once when the glyphs are painted.
            pango_cairo_context_set_resolution(context, 96);
            pango_context_set_round_glyph_positions(context, false);
            auto* fontOptions = cairo_font_options_create();
            cairo_font_options_set_hint_metrics(fontOptions, CAIRO_HINT_METRICS_OFF);
            pango_cairo_context_set_font_options(context, fontOptions);
            cairo_font_options_destroy(fontOptions);
            std::unique_ptr<PangoLayout, void (*)(PangoLayout*)> ownedLayout(
                pango_layout_new(context), [](PangoLayout* p) {
                  if (p) {
                    g_object_unref(p);
                  }
                });
            auto* layout = ownedLayout.get();
            g_object_unref(context);
            if (!layout) {
              throw std::runtime_error("canvas: cannot create text layout");
            }
            pango_layout_set_font_description(layout, desc);

            pango_layout_set_text(layout, text.c_str(), text.size());
            PangoRectangle ink, logical;
            pango_layout_get_extents(layout, &ink, &logical);
            double width = logical.width / double(PANGO_SCALE),
                   baseline = pango_layout_get_baseline(layout) / double(PANGO_SCALE);
            if (op == "measureText") {
              auto result = e.object();
              e.set(result, "width", e.number(width));

              return result;
            }
            double x = n(1), y = n(2);
            auto align = str("textAlign"), base = str("textBaseline");
            if (align == "center") {
              x -= width / 2;
            } else if (align == "right" || align == "end") {
              x -= width;
            }
            if (base == "alphabetic") {
              y -= baseline;
            } else if (base == "middle") {
              y -= logical.height / double(PANGO_SCALE) / 2;
            } else if (base == "bottom" || base == "ideographic") {
              y -= logical.height / double(PANGO_SCALE);
            }
            std::unique_ptr<cairo_path_t, decltype(&cairo_path_destroy)> path(cairo_copy_path(c),
                                                                              cairo_path_destroy);
            cairo_new_path(c);
            cairo_move_to(c, x, y);
            paint(op == "strokeText" ? "strokeStyle" : "fillStyle");
            const bool strokeText = op == "strokeText";
            if (strokeText) {
              double width = e.toNumber(e.get(state, "lineWidth"));
              if (!std::isfinite(width) || width <= 0 || width > 4096) {
                throw std::runtime_error("canvas: invalid line width");
              }
              cairo_set_line_width(c, width);
              cairo_set_line_join(
                  c, str("lineJoin") == "round" ? CAIRO_LINE_JOIN_ROUND : CAIRO_LINE_JOIN_MITER);
            }
            auto shadow = color(str("shadowColor"));
            if (shadow.a > 0 || strokeText) {
              pango_cairo_layout_path(c, layout);
              if (shadow.a > 0) {
                pathShadow(*s, shadow, e.toNumber(e.get(state, "shadowBlur")),
                           e.toNumber(e.get(state, "shadowOffsetX")),
                           e.toNumber(e.get(state, "shadowOffsetY")), strokeText);
              }
            }
            if (strokeText) {
              cairo_stroke(c);
            } else {
              cairo_new_path(c);
              cairo_move_to(c, x, y);
              pango_cairo_show_layout(c, layout);
            }
            cairo_new_path(c);
            cairo_append_path(c, path.get());

          } else if (op == "drawImage") {
            // The sizes are read first: their conversion can run JavaScript.
            int w = dimension(n(1)), h = dimension(n(2));
            const js::Value pixels = e.get(args, "0");
            const auto bytes = e.viewBytes(pixels);
            if (size_t(w) * h > MAX_PIXELS || bytes.size() != size_t(w) * h * 4) {
              throw std::runtime_error("canvas: image pixel length mismatch");
            }
            Surface src(w, h, budget);
            auto* data = cairo_image_surface_get_data(src.image);
            int stride = cairo_image_surface_get_stride(src.image);
            for (int y = 0; y < h; ++y) {
              for (int x = 0; x < w; ++x) {
                size_t i = (size_t(y) * w + x) * 4;
                unsigned a = bytes[i + 3];
                reinterpret_cast<uint32_t*>(data + y * stride)[x] =
                    (a << 24) | (((bytes[i] * a + 127) / 255) << 16) |
                    (((bytes[i + 1] * a + 127) / 255) << 8) | ((bytes[i + 2] * a + 127) / 255);
              }
            }
            cairo_surface_mark_dirty(src.image);
            double sx = n(3), sy = n(4), sw = n(5), sh = n(6), dx = n(7), dy = n(8), dw = n(9),
                   dh = n(10);
            if (sw <= 0 || sh <= 0 || dw <= 0 || dh <= 0) {
              throw std::runtime_error("canvas: image rectangles must be positive");
            }
            std::unique_ptr<cairo_path_t, decltype(&cairo_path_destroy)> path(cairo_copy_path(c),
                                                                              cairo_path_destroy);
            cairo_new_path(c);
            cairo_save(c);
            cairo_rectangle(c, dx, dy, dw, dh);
            cairo_clip(c);
            cairo_translate(c, dx, dy);
            cairo_scale(c, dw / sw, dh / sh);
            cairo_set_source_surface(c, src.image, -sx, -sy);
            cairo_pattern_set_filter(cairo_get_source(c),
                                     e.toBoolean(e.get(state, "imageSmoothingEnabled"))
                                         ? CAIRO_FILTER_BILINEAR
                                         : CAIRO_FILTER_NEAREST);
            cairo_paint_with_alpha(c, alpha);
            cairo_restore(c);
            cairo_append_path(c, path.get());

          } else {
            throw std::runtime_error("canvas: unknown command " + op);
          }
          s->check();
          return e.undefined();
        }));
        return out;
      }));
}
}  // namespace gr::host

#else
namespace gr::host {
void installCanvas(js::Engine& e, const js::Value& object, const HostOptions&) {
  e.set(object, "available", e.boolean(false));
  for (const auto* name : {"create", "registerFont"}) {
    e.set(object, name,
          e.function(name, 0, [](js::Engine&, const std::vector<js::Value>&) -> js::Value {
            throw std::runtime_error("canvas: Cairo/Pango support was not built");
          }));
  }
}
}  // namespace gr::host
#endif
