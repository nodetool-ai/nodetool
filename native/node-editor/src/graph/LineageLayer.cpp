#include "LineageLayer.h"
#include "canvas/CanvasScene.h"
#include "canvas/LineageItem.h"
#include <memory>
#include <QJsonArray>
#include <algorithm>
#include <cmath>

namespace nodetool::node_editor {
LineageAnchors lineageAnchors(const QRectF &source, const QRectF &target) {
  const auto a = source.center(), b = target.center();
  if (std::abs(b.x() - a.x()) >= std::abs(b.y() - a.y())) {
    const bool forward = b.x() >= a.x();
    return {{forward ? source.right() : source.left(), a.y()},
            {forward ? target.left() : target.right(), b.y()},
            forward ? LineageSide::Right : LineageSide::Left,
            forward ? LineageSide::Left : LineageSide::Right};
  }
  const bool down = b.y() >= a.y();
  return {{a.x(), down ? source.bottom() : source.top()},
          {b.x(), down ? target.top() : target.bottom()},
          down ? LineageSide::Bottom : LineageSide::Top,
          down ? LineageSide::Top : LineageSide::Bottom};
}
QPainterPath lineageCurve(const QRectF &source, const QRectF &target) {
  const auto anchors = lineageAnchors(source, target);
  const auto control = [](const QPointF &point, const QPointF &other,
                          LineageSide side) {
    const auto offset = [](double distance) {
      return distance >= 0 ? distance * .5 : 6.25 * std::sqrt(-distance);
    };
    switch (side) {
    case LineageSide::Left:
      return point - QPointF(offset(point.x() - other.x()), 0);
    case LineageSide::Right:
      return point + QPointF(offset(other.x() - point.x()), 0);
    case LineageSide::Top:
      return point - QPointF(0, offset(point.y() - other.y()));
    case LineageSide::Bottom:
      return point + QPointF(0, offset(other.y() - point.y()));
    }
    return point;
  };
  QPainterPath path(anchors.source);
  path.cubicTo(control(anchors.source, anchors.target, anchors.sourceSide),
               control(anchors.target, anchors.source, anchors.targetSide),
               anchors.target);
  return path;
}
namespace {
bool validRect(const QRectF &rect) {
  return std::isfinite(rect.x()) && std::isfinite(rect.y()) &&
         std::isfinite(rect.width()) && std::isfinite(rect.height()) &&
         std::isfinite(rect.right()) && std::isfinite(rect.bottom()) &&
         rect.width() > 0 && rect.height() > 0;
}
} // namespace
LineageLayer::LineageLayer(canvas::CanvasScene &scene, QObject *parent)
    : QObject(parent), scene_(&scene) {}
LineageLayer::~LineageLayer() = default;

std::unique_ptr<canvas::LineageItem> LineageLayer::createLink(const QString &id) {
  auto item = std::make_unique<canvas::LineageItem>(*scene_, id);
  item->selectionRequested = [this](const QString &link, bool additive) { emit selectionRequested(link, additive); };
  item->deleteRequested = [this](const QString &link) { emit deleteRequested(link); };
  item->contextMenuRequested = [this](const QString &link, const QPoint &position) { emit contextMenuRequested(link, position); };
  return item;
}

QString LineageLayer::update(const QJsonObject &graph,
                             const QHash<QString, QRectF> &geometry) {
  if (!scene_) {
    return QStringLiteral("Lineage scene no longer exists");
  }
  if (!graph.value("nodes").isArray() ||
      (graph.contains("links") && !graph.value("links").isArray())) {
    return QStringLiteral("Lineage requires graph nodes and links arrays");
  }
  QSet<QString> nodes;
  for (const auto &value : graph.value("nodes").toArray()) {
    nodes.insert(value.toObject().value("id").toString());
  }
  QSet<QString> ids;
  for (const auto &value : graph.value("links").toArray()) {
    const auto link = value.toObject();
    const auto id = link.value("id").toString();
    if (!value.isObject() || id.isEmpty() || ids.contains(id) ||
        !nodes.contains(link.value("source").toString()) ||
        !nodes.contains(link.value("target").toString())) {
      return QStringLiteral("Invalid lineage link ID or endpoint");
    }
    for (const auto &field :
         {QStringLiteral("label"), QStringLiteral("kind")}) {
      const auto fieldValue = link.value(field);
      if (!fieldValue.isUndefined() && !fieldValue.isNull() &&
          !fieldValue.isString()) {
        return QStringLiteral("Invalid lineage label or kind");
      }
    }
    ids.insert(id);
  }
  QSet<QString> visible;
  for (const auto &value : graph.value("links").toArray()) {
    const auto link = value.toObject();
    const auto id = link.value("id").toString();
    const auto source = geometry.constFind(link.value("source").toString()),
               target = geometry.constFind(link.value("target").toString());
    if (source == geometry.cend() || target == geometry.cend() ||
        !validRect(*source) || !validRect(*target)) {
      continue;
    }
    visible.insert(id);
    auto &item = items_[id];
    if (!item) { item = createLink(id); }
    item->updateGeometry(lineageCurve(*source, *target),
                         link.value("label").toString(), theme_,
                         selected_.contains(id));
  }
  for (auto it = items_.begin(); it != items_.end();) {
    if (!visible.contains(it->first)) {
      it = items_.erase(it);
    } else {
      ++it;
    }
  }
  known_ = ids;
  selected_.intersect(known_);
  return {};
}
void LineageLayer::clear() {
  items_.clear();
  known_.clear();
  selected_.clear();
}

void LineageLayer::setTheme(const LineageTheme &theme) {
  theme_ = theme;
  // Geometry is retained, so a theme update never needs a document rebuild.
  for (const auto &[id, link] : items_) {
    link->updateGeometry(link->path(), link->label(), theme_, selected_.contains(id));
  }
}
void LineageLayer::setSelectedLinkIds(const QStringList &ids) {
  selected_ = QSet<QString>(ids.cbegin(), ids.cend());
  selected_.intersect(known_);
  for (const auto &[id, link] : items_) { link->setLinkSelected(selected_.contains(id)); }
}
QStringList LineageLayer::selectedLinkIds() const {
  auto result = selected_.values();
  std::sort(result.begin(), result.end());
  return result;
}
QPainterPath LineageLayer::linkPath(const QString &id) const {
  const auto found = items_.find(id);
  return found != items_.end() ? found->second->path() : QPainterPath{};
}
canvas::LineageItem *LineageLayer::linkItem(const QString &id) const {
  const auto found = items_.find(id);
  return found != items_.end() ? found->second.get() : nullptr;
}
} // namespace nodetool::node_editor
