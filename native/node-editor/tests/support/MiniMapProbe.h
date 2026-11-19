#pragma once

#include "OverlayProbe.h"
#include "canvas/MiniMapItem.h"
#include <QTest>

namespace nodetool::test {

// UI thread only. Borrows the mini-map and its input surface from the window.
class MiniMapProbe {
public:
 explicit MiniMapProbe(EditorWindow &window)
     : window_(window), quick_(overlay(window, "mini-map", false, false)) {}
 explicit operator bool() const { return bool(quick_); }
 bool isVisible() const { return quick_->isVisible(); }
 QRect geometry() const { return quick_->geometry(); }
 QWidget *inputWidget() const { return quick_->inputWidget(); }
 QPoint inputPoint(QPoint local) const { return quick_->pos() + local; }
 qsizetype nodeCount() const {
  return static_cast<canvas::MiniMapItem *>(quick_->rootObject())->nodeCount();
 }
 QImage image() const {
  QTest::qWait(60);
  const auto viewport = CanvasProbe(window_).grabViewport();
  const auto ratio = viewport.devicePixelRatio();
  const QRectF bounds = geometry();
  const QRectF pixelBounds(bounds.topLeft() * ratio, bounds.size() * ratio);
  return viewport.copy(pixelBounds.toAlignedRect()).convertToFormat(QImage::Format_RGB32);
 }
private:
 EditorWindow &window_;
 OverlayProbe quick_;
};

} // namespace nodetool::test
