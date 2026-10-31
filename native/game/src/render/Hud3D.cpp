#include "Hud3D.h"
#include <QCoreApplication>
#include <QFontDatabase>
#include <QFontMetricsF>
#include <QGuiApplication>
#include <QPainter>
#include <QRawFont>
#include <QThread>
#include <algorithm>
#include <cmath>
#include <functional>
#include <set>

namespace nodetool::game {
namespace {
QFont font(const Json &node, const std::shared_ptr<const RenderFonts> &fonts) {
  QFont result(QStringLiteral("sans-serif"));
  const auto id = node.value("fontId", std::string());
  if (!id.empty()) {
    if (!fonts || !fonts->families.contains(id)) {
      throw Error("asset", "HUD font not prepared: " + id);
    }
    result.setFamily(fonts->families.at(id));
    if (fonts->styles.contains(id)) {
      result.setStyleName(fonts->styles.at(id));
    }
  }
  result.setPixelSize(
      std::max(1, static_cast<int>(std::lround(node.value("size", 16.)))));
  result.setWeight(QFont::DemiBold);
  result.setHintingPreference(QFont::PreferFullHinting);
  if (fonts && fonts->weights.contains(id) && fonts->weights.at(id) < 600) {
    const double regularAdvance =
        QFontMetricsF(result).horizontalAdvance(QStringLiteral("H"));
    result.setWeight(QFont::Bold);
    // Qt adds synthetic-bold advance while Canvas preserves the face's advance.
    const double syntheticAdvance =
        QFontMetricsF(result).horizontalAdvance(QStringLiteral("H"));
    result.setLetterSpacing(QFont::AbsoluteSpacing,
                            regularAdvance - syntheticAdvance);
  }
  return result;
}
QColor color(const Json &node, const char *key, const char *fallback) {
  QColor result(QString::fromStdString(node.value(key, std::string(fallback))));
  return result.isValid() ? result : QColor(fallback);
}
Json resolvedUi(const Json &document, const Json &frame) {
  return frame.value("ui",
                     document.value("ui", Json{{"nodes", Json::array()}}));
}
} // namespace
RenderFonts::~RenderFonts() {
  auto handlesToRemove = std::move(handles);
  auto *app = QCoreApplication::instance();
  if (!app) {
    return;
  }
  const auto remove = [ids = std::move(handlesToRemove)] {
    for (const auto id : ids) {
      QFontDatabase::removeApplicationFont(id);
    }
  };
  if (QThread::currentThread() == app->thread()) {
    remove();
  } else {
    QMetaObject::invokeMethod(app, remove, Qt::QueuedConnection);
  }
}
std::shared_ptr<const RenderFonts> prepareHudFonts3D(PreparedAssets &assets,
                                                     const Json &manifest) {
  auto *app = QGuiApplication::instance();
  if (!app || QThread::currentThread() != app->thread()) {
    throw Error("render", "HUD fonts must be prepared on the GUI thread");
  }
  auto result = std::make_shared<RenderFonts>();
  std::size_t total = 0;
  for (const auto &asset : manifest) {
    if (asset.value("kind", std::string()) != "font") {
      continue;
    }
    const auto id = asset.at("id").get<std::string>();
    const auto bytes = assets.bytes(id);
    if (result->handles.size() >= 32 || bytes->empty() ||
        bytes->size() > 16 * 1024 * 1024 ||
        total + bytes->size() > 64 * 1024 * 1024) {
      throw Error("resource_limit", "HUD font byte budget exceeded");
    }
    const auto handle = QFontDatabase::addApplicationFontFromData(
        QByteArray(reinterpret_cast<const char *>(bytes->data()),
                   static_cast<qsizetype>(bytes->size())));
    if (handle < 0) {
      throw Error("asset", "Cannot decode HUD font: " + id);
    }
    result->handles.push_back(handle);
    const auto families = QFontDatabase::applicationFontFamilies(handle);
    if (families.empty()) {
      throw Error("asset", "HUD font has no family: " + id);
    }
    result->families.emplace(id, families.front());
    const QRawFont raw(QByteArray(reinterpret_cast<const char *>(bytes->data()),
                                  static_cast<qsizetype>(bytes->size())),
                       16, QFont::PreferDefaultHinting);
    if (!raw.isValid()) {
      throw Error("asset", "HUD font face unavailable: " + id);
    }
    result->styles.emplace(id, raw.styleName());
    result->weights.emplace(id, raw.weight());
    QRawFont metricFace = raw;
    metricFace.setPixelSize(1024);
    result->baselineRatios.emplace(
        id, metricFace.ascent() / (metricFace.ascent() + metricFace.descent()));
    total += bytes->size();
  }
  return result;
}
Json layoutHud3D(const Json &document, const Json &frame,
                 const std::shared_ptr<const RenderFonts> &fonts) {
  const auto ui = resolvedUi(document, frame),
             presentation = document.value("presentation", Json::object());
  const double width = presentation.value("hudWidth", 1280.),
               height = presentation.value("hudHeight", 720.);
  if (width <= 0 || height <= 0 || width > 8192 || height > 8192 ||
      width * height > 16777216) {
    throw Error("resource_limit", "3D HUD canvas budget exceeded");
  }
  const auto nodes = ui.value("nodes", Json::array());
  if (nodes.size() > 256) {
    throw Error("resource_limit", "3D HUD node budget exceeded");
  }
  std::map<std::string, std::vector<const Json *>> children;
  for (const auto &node : nodes) {
    if (!node.value("visible", true)) {
      continue;
    }
    children[node.value("parent", std::string())].push_back(&node);
  }
  std::map<std::string, QSizeF> sizes;
  std::set<std::string> placed;
  const auto sizeOf = [&](const Json &node) {
    const auto id = node.at("id").get<std::string>();
    const auto known = sizes.find(id);
    if (known != sizes.end()) {
      return known->second;
    }
    const auto kind = node.at("kind").get<std::string>();
    QSizeF size(node.value("width", 0.), node.value("height", 0.));
    if (kind == "text") {
      const auto text =
          QString::fromStdString(node.value("text", std::string()));
      const auto textFont = font(node, fonts);
      const QFontMetricsF metrics(textFont);
      if (!node.contains("width")) {
        size.setWidth(metrics.horizontalAdvance(text));
      }
      if (!node.contains("height")) {
        size.setHeight(node.value("size", 16.) * 1.25);
      }
    } else if (kind != "panel" && kind != "bar") {
      throw Error("unsupported", "Unsupported native 3D HUD widget: " + kind);
    }
    sizes.emplace(id, size);
    return size;
  };
  Json result = Json::array();
  std::function<void(const Json &, QRectF, double)> place;
  place = [&](const Json &node, QRectF parent, double inherited) {
    const auto id = node.at("id").get<std::string>();
    if (!placed.insert(id).second) {
      return;
    }
    const auto size = sizeOf(node);
    const auto anchor = node.value("anchor", Json{{"x", 0}, {"y", 0}}),
               pivot = node.value("pivot", anchor),
               offset = node.value("offset", Json{{"x", 0}, {"y", 0}});
    const double x = parent.x() +
                     anchor.at("x").get<double>() * parent.width() -
                     pivot.at("x").get<double>() * size.width() +
                     offset.at("x").get<double>();
    const double y = parent.y() +
                     anchor.at("y").get<double>() * parent.height() -
                     pivot.at("y").get<double>() * size.height() +
                     offset.at("y").get<double>();
    const double opacity = inherited * node.value("opacity", 1.);
    result.push_back({{"node", node},
                      {"x", x},
                      {"y", y},
                      {"width", size.width()},
                      {"height", size.height()},
                      {"opacity", opacity}});
    for (const auto *child : children[id]) {
      place(*child, QRectF(x, y, size.width(), size.height()), opacity);
    }
  };
  const auto insets = ui.value("safeArea", false)
                          ? ui.value("insets", Json::object())
                          : Json::object();
  const double left = insets.value("left", 0.),
               right = insets.value("right", 0.), top = insets.value("top", 0.),
               bottom = insets.value("bottom", 0.);
  for (const auto *node : children[std::string()]) {
    place(*node,
          QRectF(left, top, std::max(0., width - left - right),
                 std::max(0., height - top - bottom)),
          1);
  }
  return result;
}
QImage paintHud3D(const Json &document, const Json &frame, QSize size,
                  const std::shared_ptr<const RenderFonts> &fonts) {
  const auto presentation = document.value("presentation", Json::object());
  const auto boxes = layoutHud3D(document, frame, fonts);
  const auto width = static_cast<int>(
                 std::lround(presentation.value("hudWidth", 1280.))),
             height = static_cast<int>(
                 std::lround(presentation.value("hudHeight", 720.)));
  QImage image(QSize(width, height), QImage::Format_RGBA8888_Premultiplied);
  image.fill(Qt::transparent);
  QPainter painter(&image);
  painter.setRenderHint(QPainter::Antialiasing);
  painter.setRenderHint(QPainter::TextAntialiasing);
  for (const auto &box : boxes) {
    const auto &node = box.at("node");
    const auto kind = node.at("kind").get<std::string>();
    const double x = box.at("x"), y = box.at("y"), w = box.at("width"),
                 h = box.at("height");
    painter.setOpacity(box.at("opacity").get<double>());
    painter.setPen(Qt::NoPen);
    if (kind == "panel") {
      painter.setBrush(color(node, "color", "#1b1f2a"));
      const double radius =
          std::min({node.value("cornerRadius", 0.), w / 2, h / 2});
      if (radius > 0) {
        painter.drawRoundedRect(QRectF(x, y, w, h), radius, radius);
      } else {
        painter.drawRect(QRectF(x, y, w, h));
      }
    } else if (kind == "bar") {
      painter.fillRect(QRectF(x, y, w, h),
                       color(node, "background", "#1b1f2a"));
      const double fraction =
          std::clamp(node.value("value", 0.) / node.value("max", 1.), 0., 1.);
      const auto direction =
          node.value("direction", std::string("leftToRight"));
      QRectF fill(x, y, w * fraction, h);
      if (direction == "rightToLeft") {
        fill.moveLeft(x + w * (1 - fraction));
      } else if (direction == "bottomToTop") {
        fill = QRectF(x, y + h * (1 - fraction), w, h * fraction);
      } else if (direction == "topToBottom") {
        fill = QRectF(x, y, w, h * fraction);
      }
      painter.fillRect(fill, color(node, "color", "#4caf50"));
    } else {
      const auto text =
          QString::fromStdString(node.value("text", std::string()));
      const auto textFont = font(node, fonts);
      painter.setFont(textFont);
      painter.setPen(color(node, "color", "#ffffff"));
      const QFontMetricsF metrics(textFont);
      const auto align = node.value("align", std::string("left"));
      const double advance = metrics.horizontalAdvance(text),
                   tx = align == "right"    ? x + w - advance
                        : align == "center" ? x + (w - advance) / 2
                                            : x;
      const auto fontId = node.value("fontId", std::string());
      const double baselineRatio =
          fonts && fonts->baselineRatios.contains(fontId)
              ? fonts->baselineRatios.at(fontId)
              : metrics.ascent() / (metrics.ascent() + metrics.descent());
      const double emAscent = textFont.pixelSize() * baselineRatio;
      painter.drawText(QPointF(tx, y + emAscent), text);
    }
  }
  painter.end();
  return image.size() == size ? image
                              : image.scaled(size, Qt::IgnoreAspectRatio,
                                             Qt::SmoothTransformation);
}
} // namespace nodetool::game
