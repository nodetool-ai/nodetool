#pragma once

#include "canvas/MiniMapPainter.h"
#include <QQuickPaintedItem>
#include <functional>

namespace nodetool {
class CanvasSurface;
class EditorSceneApi;
class WorkflowGraphModel;
}

namespace nodetool::canvas {

// UI thread only. The mini-map as a Quick item, with the paint and navigation
// code of the MiniMap widget. Its owner keeps the model, scene and canvas
// alive; the item uses them as context of its connections, which end with it.
class MiniMapItem final : public QQuickPaintedItem {
public:
  MiniMapItem(WorkflowGraphModel &model, EditorSceneApi &scene, CanvasSurface &canvas, QQuickItem *parent = nullptr);
  void paint(QPainter *painter) override;
  // Collects the card rectangles again, once per event loop turn.
  void schedule();
  void rebuild();
  qsizetype nodeCount() const { return nodes_.size(); }
  // True while the web "Color by type" mode is on.
  std::function<bool()> colorByType;
  std::function<void()> navigated;
  std::function<void()> zoomed;

protected:
  void mousePressEvent(QMouseEvent *event) override;
  void mouseMoveEvent(QMouseEvent *event) override;
  void wheelEvent(QWheelEvent *event) override;

private:
  void navigate(QPointF point);
  WorkflowGraphModel &model_;
  EditorSceneApi &scene_;
  CanvasSurface &canvas_;
  QVector<MiniMapNode> nodes_;
  QRectF bounds_;
  bool pending_ = false;
};

} // namespace nodetool::canvas
