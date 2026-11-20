#include "canvas/CanvasViewport.h"

#include <QPolygon>
#include <algorithm>
#include <cmath>

namespace nodetool::canvas {

void CanvasViewport::resize(QSize size, bool shown) {
  size_ = size;
  clampScroll();
  if (shown) {
    updateLastCenterPoint();
  } else {
    centerOn(lastCenter_);
  }
}

QPointF CanvasViewport::mapToScene(QPointF point) const {
  return (point + QPointF(hscroll_, vscroll_)) / zoom_;
}

QPointF CanvasViewport::mapFromSceneF(QPointF point) const { return point * zoom_ - QPointF(hscroll_, vscroll_); }

QRect CanvasViewport::mapFromScene(const QRectF &rect) const {
  // QGraphicsView::mapFromScene(QRectF) maps the four corners to points, and
  // QPolygon::boundingRect spans them inclusively.
  const QPolygon polygon{mapFromScene(rect.topLeft()), mapFromScene(rect.topRight()), mapFromScene(rect.bottomRight()),
                         mapFromScene(rect.bottomLeft())};
  return polygon.boundingRect();
}

QRectF CanvasViewport::visibleSceneRect() const {
  return QRectF(mapToScene(QPointF(0, 0)), QSizeF(size_) / zoom_);
}

QTransform CanvasViewport::viewportTransform() const {
  return QTransform::fromScale(zoom_, zoom_) * QTransform::fromTranslate(-hscroll_, -vscroll_);
}

void CanvasViewport::clampScroll() {
  // QGraphicsView::recalculateContentSize: the scroll range covers the scene rect.
  const auto mapped = QRectF(sceneRect_.topLeft() * zoom_, sceneRect_.size() * zoom_);
  const int left = qRound(mapped.left()), right = qRound(mapped.right() - size_.width());
  const int top = qRound(mapped.top()), bottom = qRound(mapped.bottom() - size_.height());
  if (left < right) { hscroll_ = std::clamp(hscroll_, left, right); }
  if (top < bottom) { vscroll_ = std::clamp(vscroll_, top, bottom); }
}

void CanvasViewport::updateLastCenterPoint() {
  // QRect::center() of the viewport rectangle is a whole pixel.
  lastCenter_ = mapToScene(QRect(QPoint(), size_).center());
}

void CanvasViewport::setScroll(int horizontal, int vertical) {
  hscroll_ = horizontal;
  vscroll_ = vertical;
  clampScroll();
  updateLastCenterPoint();
}

void CanvasViewport::centerOn(QPointF scenePoint) {
  const auto viewPoint = scenePoint * zoom_;
  // Qt 6.12 rounds here, and truncates in ensureVisible.
  hscroll_ = qRound(viewPoint.x() - size_.width() / 2.0);
  vscroll_ = qRound(viewPoint.y() - size_.height() / 2.0);
  clampScroll();
  lastCenter_ = scenePoint;
}

void CanvasViewport::setZoom(double zoom) {
  zoom_ = zoom;
  clampScroll();
  centerOn(lastCenter_);
}

void CanvasViewport::scaleAnchored(double factor, bool underPointer, QPointF pointer, QPointF lastMoveScene) {
  zoom_ *= factor;
  clampScroll();
  if (underPointer) {
    const auto difference = mapToScene(QRectF(QPointF(), QSizeF(size_)).center()) - mapToScene(pointer);
    centerOn(lastMoveScene + difference);
  } else {
    centerOn(lastCenter_);
  }
}

void CanvasViewport::ensureVisible(const QRectF &rect, int xMargin, int yMargin) {
  const auto viewRect = QRectF(rect.topLeft() * zoom_, rect.size() * zoom_);
  const double left = hscroll_, right = left + size_.width();
  const double top = vscroll_, bottom = top + size_.height();
  int horizontal = hscroll_, vertical = vscroll_;
  if (viewRect.left() <= left + xMargin) { horizontal = int(viewRect.left() - xMargin - 0.5); }
  if (viewRect.right() >= right - xMargin) { horizontal = int(viewRect.right() - size_.width() + xMargin + 0.5); }
  if (viewRect.top() <= top + yMargin) { vertical = int(viewRect.top() - yMargin - 0.5); }
  if (viewRect.bottom() >= bottom - yMargin) { vertical = int(viewRect.bottom() - size_.height() + yMargin + 0.5); }
  setScroll(horizontal, vertical);
}

} // namespace nodetool::canvas
