#pragma once

#include <QPoint>
#include <QPointF>
#include <QRect>
#include <QRectF>
#include <QSize>
#include <QTransform>

namespace nodetool::canvas {

// UI thread only. The viewport arithmetic of QGraphicsView with scroll bars
// off: a zoom and whole-pixel scroll offsets over a fixed scene rectangle.
// Viewport point = scene point * zoom - scroll. Mapping, centering and
// ensureVisible round as QGraphicsView does, so both canvases place the same
// scene point on the same pixel.
class CanvasViewport {
public:
  static constexpr double minimumZoom = 0.12;
  static constexpr double maximumZoom = 4.0;

  QSize size() const { return size_; }
  // QGraphicsView keeps a hidden view centered on its last center and a
  // shown one anchored at the top left (NoAnchor).
  void resize(QSize size, bool shown);
  // QGraphicsView::showEvent centers the view on its last center again.
  void show() { centerOn(lastCenter_); }
  double zoom() const { return zoom_; }
  QPoint scroll() const { return {hscroll_, vscroll_}; }
  QRectF sceneRect() const { return sceneRect_; }

  QPointF mapToScene(QPointF viewportPoint) const;
  QPointF mapToScene(QPoint viewportPoint) const { return mapToScene(QPointF(viewportPoint)); }
  QPointF mapFromSceneF(QPointF scenePoint) const;
  QPoint mapFromScene(QPointF scenePoint) const { return mapFromSceneF(scenePoint).toPoint(); }
  QRect mapFromScene(const QRectF &sceneRect) const;
  QRectF visibleSceneRect() const;
  QTransform viewportTransform() const;

  void setScroll(int horizontal, int vertical);
  void centerOn(QPointF scenePoint);
  // QGraphicsView::scale with an anchor. pointer is the cursor in viewport
  // coordinates when it is over the view, and lastMoveScene the scene point
  // of the last mouse move.
  void setZoom(double zoom);
  void scaleAnchored(double factor, bool underPointer, QPointF pointer, QPointF lastMoveScene);
  void ensureVisible(const QRectF &sceneRect, int xMargin, int yMargin);
  QPointF lastCenterPoint() const { return lastCenter_; }

private:
  void clampScroll();
  void updateLastCenterPoint();
  QSize size_;
  double zoom_ = 1;
  int hscroll_ = 0;
  int vscroll_ = 0;
  QPointF lastCenter_;
  QRectF sceneRect_{-32767, -32767, 65534, 65534};
};

} // namespace nodetool::canvas
