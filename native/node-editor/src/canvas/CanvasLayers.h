#pragma once

#include "canvas/CanvasItem.h"
#include "canvas/CanvasStyle.h"
#include "canvas/EditorCanvasScene.h"
#include <QColor>
#include <functional>

namespace nodetool::canvas {
class CanvasViewport;
class EditorCanvasScene;

// UI thread only. EditorScene::drawBackground in viewport coordinates: the
// canvas color, the cross grid and the origin axes. The grid is one image a
// grid period larger than the viewport; a pan moves the image by the scroll
// offset modulo the period, so it rasters only on a zoom, resize or theme
// change. GraphCanvas owns it as a visual child. It borrows the viewport and
// the theme, which its owner keeps alive.
class GridItem final : public QQuickItem {
public:
  GridItem(const CanvasViewport &viewport, QQuickItem *parent);
  void setTheme(const CanvasTheme &theme);
  // Re-reads the viewport after a pan, zoom or resize.
  void sync();
  int rasterCount() const { return rasters_; }

protected:
  QSGNode *updatePaintNode(QSGNode *old, UpdatePaintNodeData *data) override;
  void releaseResources() override;

private:
  void raster();
  const CanvasViewport &viewport_;
  QImage image_;
  bool upload_ = false;
  QPointF imageOrigin_;
  QColor canvas_;
  QColor grid_;
  QColor axis_;
  double period_ = 0;
  double gap_ = 0;
  QSize rasterSize_;
  int rasters_ = 0;
  QPointF axisOrigin_;
  QSizeF viewportSize_;
};

// UI thread only. A foreground primitive and its tiles, owned by GraphCanvas.
class ForegroundItem final : public CanvasImageItem {
public:
  using Part = EditorCanvasScene::ForegroundPart;
  ForegroundItem(const EditorCanvasScene &scene, QQuickItem &parent);
  void setPart(Part part);
  const Part &part() const { return part_; }
  void paintRaster(QPainter &painter, double zoom) const override;

private:
  const EditorCanvasScene &scene_;
  Part part_{};
};

// UI thread only. The rubber band of QGraphicsView::RubberBandDrag in
// viewport coordinates: a translucent highlight with a darker edge, as
// QCommonStyle draws CE_RubberBand. GraphCanvas owns it as a visual child of
// its overlay layer.
class RubberBandItem final : public QQuickItem {
public:
  explicit RubberBandItem(QQuickItem *parent);
  void setBand(const QRect &rect);
  QRect band() const { return band_; }

protected:
  QSGNode *updatePaintNode(QSGNode *old, UpdatePaintNodeData *) override;

private:
  QRect band_;
};

} // namespace nodetool::canvas
