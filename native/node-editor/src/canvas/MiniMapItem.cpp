#include "canvas/MiniMapItem.h"

#include "canvas/EditorSceneApi.h"
#include "graph/WorkflowGraphModel.h"
#include "ui/CanvasSurface.h"
#include <QMouseEvent>
#include <QTimer>
#include <QWheelEvent>
#include <cmath>

namespace nodetool::canvas {

MiniMapItem::MiniMapItem(WorkflowGraphModel &model, EditorSceneApi &scene, CanvasSurface &canvas, QQuickItem *parent)
    : QQuickPaintedItem(parent), model_(model), scene_(scene), canvas_(canvas) {
  setObjectName(QStringLiteral("mini-map"));
  setAcceptedMouseButtons(Qt::LeftButton);
  // React Flow MiniMap defaults.
  setSize(QSizeF(200, 150));
  connect(&canvas, &CanvasSurface::sceneChanged, this, &MiniMapItem::schedule);
  connect(&canvas, &CanvasSurface::viewportMoved, this, [this] { update(); });
  schedule();
}

void MiniMapItem::schedule() {
  if (pending_) { return; }
  pending_ = true;
  QTimer::singleShot(0, this, &MiniMapItem::rebuild);
}

void MiniMapItem::rebuild() {
  pending_ = false;
  nodes_.clear();
  bounds_ = {};
  for (const auto id : model_.allNodeIds()) {
    if (!canvas_.hasNode(id)) { continue; }
    const auto rect = canvas_.nodeRect(id);
    nodes_.push_back({rect, canvas_.selection().contains(id), model_.isGroup(id), model_.isComment(id),
                      model_.nodeSnapshot(id)["type"].toString()});
    bounds_ |= rect;
  }
  update();
}

void MiniMapItem::paint(QPainter *painter) {
  const auto viewport = canvas_.visibleSceneRect();
  geometry_ = miniMapGeometry(size(), bounds_, viewport);
  paintMiniMap(*painter, size(), scene_.theme(), nodes_, viewport, colorByType && colorByType(), geometry_);
}

void MiniMapItem::navigate(QPointF point) {
  if (geometry_.scale <= 0) { return; }
  if (navigated) { navigated(); }
  canvas_.centerOn(geometry_.toScene(point));
}

void MiniMapItem::mousePressEvent(QMouseEvent *event) {
  if (event->button() != Qt::LeftButton) {
    event->ignore();
    return;
  }
  navigate(event->position());
  event->accept();
}

void MiniMapItem::mouseMoveEvent(QMouseEvent *event) {
  if (event->buttons() & Qt::LeftButton) { navigate(event->position()); }
  event->accept();
}

void MiniMapItem::wheelEvent(QWheelEvent *event) {
  const double current = canvas_.zoom();
  const double zoom = std::clamp(current * std::pow(1.2, event->angleDelta().y() / 120.), .1, 5.);
  if (navigated) { navigated(); }
  canvas_.scaleBy(zoom / current, CanvasSurface::ZoomAnchor::Center);
  if (zoomed) { zoomed(); }
  update();
  event->accept();
}

} // namespace nodetool::canvas
