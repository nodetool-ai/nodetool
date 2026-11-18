#pragma once
#include "canvas/EditorSceneApi.h"
#include "canvas/MiniMapPainter.h"
#include "graph/WorkflowGraphModel.h"
#include "ui/CanvasSurface.h"
#include <QMouseEvent>
#include <QPainter>
#include <QTimer>
#include <QWidget>
#include <QHash>
#include <QPair>
#include <QStringList>
#include <functional>
#include <cmath>
#include <QWheelEvent>

namespace nodetool {
// Scene notifications coalesce geometry collection. Navigation changes only the
// view scroll bars, never the graph model or document history.
// UI thread only. The canvas host widget owns the mini-map.
class MiniMap final : public QWidget {
public:
  MiniMap(WorkflowGraphModel &model, EditorSceneApi &scene, CanvasSurface &canvas)
      : QWidget(&canvas.hostWidget()), model_(model), scene_(scene), canvas_(canvas) {
    setObjectName("mini-map");
    setAccessibleName(tr("Mini-map navigator"));
    setFixedSize(200, 150); // React Flow MiniMap defaults.
    connect(&canvas, &CanvasSurface::sceneChanged, this, [this] { schedule(); });
    connect(&canvas, &CanvasSurface::viewportMoved, this, [this] { update(); });
    schedule();
  }
  // True while the web "Color by type" mode is on (createMinimapNodeColorFn useTypeColors).
  std::function<bool()> colorByType;
  std::function<void()> navigated;
  std::function<void()> zoomed;
  void schedule() {
    if (pending_) { return; }
    pending_ = true;
    QTimer::singleShot(0, this, [this] {
      pending_ = false;
      rects_.clear(); bounds_ = {};
      for (auto id : model_.allNodeIds()) {
        if (canvas_.hasNode(id)) {
          const auto rect = canvas_.nodeRect(id);
          rects_.push_back({rect, canvas_.selection().contains(id), model_.isGroup(id), model_.isComment(id), model_.nodeSnapshot(id)["type"].toString()}); bounds_ |= rect;
        }
      }
      setProperty("nodeCount", rects_.size());
      update();
    });
  }
protected:
  void paintEvent(QPaintEvent *) override {
    QPainter painter(this);
    const auto viewport = canvas_.visibleSceneRect();
    geometry_ = miniMapGeometry(QSizeF(size()), bounds_, viewport);
    paintMiniMap(painter, QSizeF(size()), scene_.theme(), rects_, viewport, colorByType && colorByType(), geometry_);
  }
  void wheelEvent(QWheelEvent *event) override {
    const double current = canvas_.zoom();
    const double zoom = std::clamp(current * std::pow(1.2, event->angleDelta().y()/120.), .1, 5.);
    if (navigated) { navigated(); }
    canvas_.scaleBy(zoom / current, CanvasSurface::ZoomAnchor::Center);
    if (zoomed) { zoomed(); }
    update(); event->accept();
  }
  void mousePressEvent(QMouseEvent *event) override {
    if (event->button() == Qt::LeftButton) { navigate(event->position()); event->accept(); }
  }
  void mouseMoveEvent(QMouseEvent *event) override {
    if (event->buttons() & Qt::LeftButton) { navigate(event->position()); event->accept(); }
  }
private:
  void navigate(QPointF point) { if (geometry_.scale > 0) { if (navigated) { navigated(); } canvas_.centerOn(geometry_.toScene(point)); } }
  WorkflowGraphModel &model_;
  EditorSceneApi &scene_;
  CanvasSurface &canvas_;
  QVector<MiniMapNode> rects_;
  QRectF bounds_;
  MiniMapGeometry geometry_;
  bool pending_ = false;
};
}
