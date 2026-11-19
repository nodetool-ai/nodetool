#include "canvas/LineageItem.h"

#include "canvas/CanvasScene.h"
#include <QCursor>
#include <QFontMetricsF>
#include <QKeyEvent>
#include <QPainter>
#include <QPainterPathStroker>

namespace nodetool::canvas {
namespace {
// UI thread only. Owns the Quick link item; the scene borrows it.
class QuickLink final : public node_editor::LineageLayer::Link {
public:
  QuickLink(const QString &id, node_editor::LineageLayer &layer, CanvasScene &scene)
      : item_(std::make_unique<LineageItem>(scene, id)) {
    item_->selectionRequested = [&layer](const QString &link, bool additive) { emit layer.selectionRequested(link, additive); };
    item_->deleteRequested = [&layer](const QString &link) { emit layer.deleteRequested(link); };
  }
  void updateGeometry(QPainterPath path, QString label, const node_editor::LineageTheme &theme, bool selected) override {
    item_->updateGeometry(std::move(path), std::move(label), theme, selected);
  }
  void setLinkSelected(bool selected) override { item_->setLinkSelected(selected); }
  QPainterPath path() const override { return item_->path(); }
  QString label() const override { return item_->label(); }
  QObject *object() const override { return item_.get(); }

private:
  std::unique_ptr<LineageItem> item_;
};
} // namespace

LineageItem::LineageItem(CanvasScene &scene, QString id)
    : CanvasItem(scene, Kind::Lineage, &scene.layer()), id_(std::move(id)) {
  setCanvasButtons(Qt::LeftButton | Qt::MiddleButton | Qt::RightButton);
  setPointerCursor(Qt::PointingHandCursor);
  // Group frames are background panels at -1e6. Links sit above those
  // panels, while ordinary nodes and data wires stay above links.
  setZ(-100000);
}

void LineageItem::updateGeometry(QPainterPath path, QString label, const node_editor::LineageTheme &theme, bool selected) {
  path_ = std::move(path);
  label_ = std::move(label);
  theme_ = theme;
  selected_ = selected;
  QPainterPathStroker stroker;
  stroker.setWidth(16);
  shape_ = stroker.createStroke(path_);
  bounds_ = path_.boundingRect().adjusted(-9, -9, 9, 9);
  if (!label_.isEmpty()) {
    const auto size = QFontMetricsF(theme_.labelFont).size(Qt::TextSingleLine, label_);
    const auto center = path_.pointAtPercent(.5);
    labelRect_ = QRectF(center.x() - size.width() / 2, center.y() - 6 - size.height(), size.width(), size.height());
    bounds_ = bounds_.united(labelRect_);
  } else {
    labelRect_ = {};
  }
  setPosition(bounds_.topLeft());
  setSize(bounds_.size());
  reindex();
  markDirty();
}

void LineageItem::setLinkSelected(bool selected) {
  selected_ = selected;
  markDirty();
}

bool LineageItem::hitTest(const QPointF &scenePoint) const { return shape_.contains(scenePoint); }

void LineageItem::paintRaster(QPainter &painter, double) const {
  painter.translate(-bounds_.topLeft());
  painter.setRenderHint(QPainter::Antialiasing);
  const auto color = selected_ ? theme_.selected : theme_.stroke;
  const double width = selected_ ? 3 : 2;
  QPen pen(color, width, Qt::CustomDashLine, Qt::RoundCap);
  pen.setDashPattern({1 / width, 6 / width});
  painter.setOpacity(painter.opacity() * (selected_ ? 1 : .8));
  painter.setPen(pen);
  painter.setBrush(Qt::NoBrush);
  painter.drawPath(path_);
  if (!label_.isEmpty()) {
    painter.setPen(color);
    painter.setFont(theme_.labelFont);
    painter.drawText(labelRect_, Qt::AlignCenter, label_);
  }
}

void LineageItem::mousePress(CanvasMouseEvent &event) {
  if (event.button == Qt::MiddleButton) {
    // A synchronous host slot can remove this item before later slots run.
    const QString id = id_;
    event.accept();
    if (deleteRequested) { deleteRequested(id); }
    return;
  }
  if (event.button == Qt::LeftButton) {
    const QString id = id_;
    const bool additive = event.modifiers.testAnyFlags(Qt::ShiftModifier | Qt::ControlModifier | Qt::MetaModifier);
    event.accept();
    if (auto *scene = canvasScene()) { scene->setFocusItem(this); }
    if (selectionRequested) { selectionRequested(id, additive); }
    return;
  }
  if (event.button == Qt::RightButton) {
    event.accept();
    return;
  }
  event.ignore();
}

bool LineageItem::keyPress(QKeyEvent &event) {
  if (event.key() == Qt::Key_Delete || event.key() == Qt::Key_Backspace) {
    const QString id = id_;
    event.accept();
    if (deleteRequested) { deleteRequested(id); }
    return true;
  }
  if (event.key() == Qt::Key_Return || event.key() == Qt::Key_Enter || event.key() == Qt::Key_Space) {
    const QString id = id_;
    event.accept();
    if (selectionRequested) { selectionRequested(id, false); }
    return true;
  }
  return false;
}

} // namespace nodetool::canvas

namespace nodetool::node_editor {
// The Quick canvas's constructor lives here, so LineageLayer.cpp needs no Qt Quick.
LineageLayer::LineageLayer(canvas::CanvasScene &scene, QObject *parent)
    : QObject(parent), quickScene_(&scene), quick_(true) {
  // Link items survive a model reset, as on the QtNodes scene. Loading
  // another document clears them (EditorWindow).
  quickLink_ = [this, &scene](const QString &id) -> std::unique_ptr<Link> {
    return std::make_unique<canvas::QuickLink>(id, *this, scene);
  };
}
} // namespace nodetool::node_editor
