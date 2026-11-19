#pragma once

#include "OverlayProbe.h"
#include "canvas/MiniMapItem.h"
#include <QTest>

namespace nodetool::test {

// UI thread only. Borrows the mini-map and its input surface from the window.
class MiniMapProbe {
public:
 explicit MiniMapProbe(EditorWindow &window)
     : window_(window), widget_(window.findChild<QWidget *>("mini-map")),
       quick_(overlay(window, "mini-map", false, false)) {}
 explicit operator bool() const { return widget_ || bool(quick_); }
 bool isVisible() const { return widget_ ? widget_->isVisible() : quick_->isVisible(); }
 QRect geometry() const { return widget_ ? widget_->geometry() : quick_->geometry(); }
 QWidget *inputWidget() const { return widget_ ? widget_ : quick_->inputWidget(); }
 QPoint inputPoint(QPoint local) const { return widget_ ? local : quick_->pos() + local; }
 qsizetype nodeCount() const {
  if (widget_) { return widget_->property("nodeCount").toInt(); }
  return static_cast<canvas::MiniMapItem *>(quick_->rootObject())->nodeCount();
 }
 QImage image() const {
  QTest::qWait(60);
  if (widget_) {
   return widget_->grab().toImage().convertToFormat(QImage::Format_RGB32);
  }
  const auto viewport = CanvasProbe(window_).grabViewport();
  const auto ratio = viewport.devicePixelRatio();
  const QRectF bounds = geometry();
  const QRectF pixelBounds(bounds.topLeft() * ratio, bounds.size() * ratio);
  return viewport.copy(pixelBounds.toAlignedRect()).convertToFormat(QImage::Format_RGB32);
 }
private:
 EditorWindow &window_;
 QWidget *widget_;
 OverlayProbe quick_;
};

} // namespace nodetool::test
