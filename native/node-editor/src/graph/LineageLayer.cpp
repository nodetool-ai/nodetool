#include "LineageLayer.h"
#include <memory>
#include <QCursor>
#include <QFontMetricsF>
#include <QGraphicsObject>
#include <QGraphicsScene>
#include <QGraphicsSceneContextMenuEvent>
#include <QGraphicsSceneMouseEvent>
#include <QJsonArray>
#include <QKeyEvent>
#include <QPainter>
#include <QPainterPathStroker>
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
// UI thread only. The scene owns the item while it is attached.
class LineageItem final : public QGraphicsObject {
public:
  LineageItem(QString id, LineageLayer &layer)
      : id_(std::move(id)), layer_(layer) {
    setFlag(ItemIsFocusable);
    setAcceptedMouseButtons(Qt::LeftButton | Qt::MiddleButton |
                            Qt::RightButton);
    setCursor(QCursor(Qt::PointingHandCursor));
    // Group frames are background panels at -1e6. Links sit above those
    // panels, while ordinary nodes and QtNodes data wires stay above links.
    setZValue(-100000);
  }
  void updateGeometry(QPainterPath path, QString label,
                      const LineageTheme &theme, bool selected) {
    prepareGeometryChange();
    path_ = std::move(path);
    label_ = std::move(label);
    theme_ = theme;
    selected_ = selected;
    setToolTip(label_.isEmpty() ? QStringLiteral("Lineage link") : label_);
    bounds_ = path_.boundingRect().adjusted(-9, -9, 9, 9);
    if (!label_.isEmpty()) {
      const auto size =
          QFontMetricsF(theme_.labelFont).size(Qt::TextSingleLine, label_);
      const auto center = path_.pointAtPercent(.5);
      labelRect_ =
          QRectF(center.x() - size.width() / 2, center.y() - 6 - size.height(),
                 size.width(), size.height());
      bounds_ = bounds_.united(labelRect_);
    } else {
      labelRect_ = {};
    }
    QGraphicsObject::update();
  }
  void setLinkSelected(bool selected) {
    selected_ = selected;
    QGraphicsObject::update();
  }
  QPainterPath path() const { return path_; }
  QString label() const { return label_; }
  QRectF boundingRect() const override { return bounds_; }
  QPainterPath shape() const override {
    QPainterPathStroker stroker;
    stroker.setWidth(16);
    return stroker.createStroke(path_);
  }
  void paint(QPainter *painter, const QStyleOptionGraphicsItem *,
             QWidget *) override {
    painter->setRenderHint(QPainter::Antialiasing);
    const auto color = selected_ ? theme_.selected : theme_.stroke;
    const double width = selected_ ? 3 : 2;
    QPen pen(color, width, Qt::CustomDashLine, Qt::RoundCap);
    pen.setDashPattern({1 / width, 6 / width});
    painter->setOpacity(selected_ ? 1 : .8);
    painter->setPen(pen);
    painter->setBrush(Qt::NoBrush);
    painter->drawPath(path_);
    if (!label_.isEmpty()) {
      painter->setPen(color);
      painter->setFont(theme_.labelFont);
      painter->drawText(labelRect_, Qt::AlignCenter, label_);
    }
  }

protected:
  void mousePressEvent(QGraphicsSceneMouseEvent *event) override {
    if (event->button() == Qt::MiddleButton) {
      // A synchronous host slot can remove this item before later slots run.
      const QString id = id_;
      event->accept();
      emit layer_.deleteRequested(id);
      return;
    }
    if (event->button() == Qt::LeftButton) {
      const QString id = id_;
      auto *owner = &layer_;
      const bool additive = event->modifiers().testAnyFlags(
          Qt::ShiftModifier | Qt::ControlModifier | Qt::MetaModifier);
      event->accept();
      setFocus(Qt::MouseFocusReason);
      emit owner->selectionRequested(id, additive);
      return;
    }
    if (event->button() == Qt::RightButton) {
      event->accept();
      return;
    }
    event->ignore();
  }
  void mouseMoveEvent(QGraphicsSceneMouseEvent *event) override {
    event->accept();
  }
  void mouseReleaseEvent(QGraphicsSceneMouseEvent *event) override {
    event->accept();
  }
  void contextMenuEvent(QGraphicsSceneContextMenuEvent *event) override {
    const QString id = id_;
    const QPoint position = event->screenPos();
    event->accept();
    emit layer_.contextMenuRequested(id, position);
  }
  void keyPressEvent(QKeyEvent *event) override {
    if (event->key() == Qt::Key_Delete || event->key() == Qt::Key_Backspace) {
      // A synchronous host slot can remove this item before later slots run.
      const QString id = id_;
      event->accept();
      emit layer_.deleteRequested(id);
      return;
    }
    if (event->key() == Qt::Key_Return || event->key() == Qt::Key_Enter ||
        event->key() == Qt::Key_Space) {
      const QString id = id_;
      event->accept();
      emit layer_.selectionRequested(id, false);
      return;
    }
    event->ignore();
  }

private:
  QString id_, label_;
  LineageLayer &layer_;
  QPainterPath path_;
  QRectF bounds_, labelRect_;
  LineageTheme theme_;
  bool selected_ = false;
};
// UI thread only. The QGraphicsScene owns the item; the link removes it from
// the scene and destroys it, unless the scene went first.
class GraphicsLink final : public LineageLayer::Link {
public:
  GraphicsLink(const QString &id, LineageLayer &layer, QGraphicsScene &scene) {
    auto created = std::make_unique<LineageItem>(id, layer);
    item_ = created.get();
    scene.addItem(created.release());
  }
  ~GraphicsLink() override {
    if (!item_) { return; }
    if (auto *scene = item_->scene()) { scene->removeItem(item_); }
    const std::unique_ptr<LineageItem> detached(item_.data());
  }
  void updateGeometry(QPainterPath path, QString label, const LineageTheme &theme, bool selected) override {
    if (item_) { item_->updateGeometry(std::move(path), std::move(label), theme, selected); }
  }
  void setLinkSelected(bool selected) override {
    if (item_) { item_->setLinkSelected(selected); }
  }
  QPainterPath path() const override { return item_ ? item_->path() : QPainterPath{}; }
  QString label() const override { return item_ ? item_->label() : QString{}; }
  QObject *object() const override { return item_.data(); }

private:
  QPointer<LineageItem> item_;
};

bool validRect(const QRectF &rect) {
  return std::isfinite(rect.x()) && std::isfinite(rect.y()) &&
         std::isfinite(rect.width()) && std::isfinite(rect.height()) &&
         std::isfinite(rect.right()) && std::isfinite(rect.bottom()) &&
         rect.width() > 0 && rect.height() > 0;
}
} // namespace
LineageLayer::LineageLayer(QGraphicsScene &scene, QObject *parent)
    : QObject(parent), scene_(&scene) {}
LineageLayer::~LineageLayer() { items_.clear(); }
std::unique_ptr<LineageLayer::Link> LineageLayer::createLink(const QString &id) {
  if (quick_) { return quickLink_(id); }
  return std::make_unique<GraphicsLink>(id, *this, *scene_);
}
bool LineageLayer::isLinkItem(const QGraphicsItem *item) {
  return dynamic_cast<const LineageItem *>(item) != nullptr;
}
QString LineageLayer::update(const QJsonObject &graph,
                             const QHash<QString, QRectF> &geometry) {
  if (quick_ ? !quickScene_ : !scene_) {
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
    if (!item || !item->object()) { item = createLink(id); }
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
QObject *LineageLayer::linkItem(const QString &id) const {
  const auto found = items_.find(id);
  return found != items_.end() ? found->second->object() : nullptr;
}
} // namespace nodetool::node_editor
