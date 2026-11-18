#pragma once

#include "canvas/CanvasItem.h"
#include "canvas/CanvasStyle.h"
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

// UI thread only. EditorScene::drawForeground as a scene-space image above the
// cards. It covers the visible scene rect with a margin and rasters when the
// foreground changes, when the view leaves the covered area, or after a zoom
// settles. GraphCanvas owns it as a visual child of the content layer.
class ForegroundItem final : public CanvasImageItem {
public:
  explicit ForegroundItem(QQuickItem *parent);
  void invalidate() { setContentDirty(true); }
  // Paints again when dirty or when visible is not inside the covered area.
  // Returns whether it rastered.
  bool needsRaster(const QRectF &visible, double scale, double zoom, bool settled) const;
  bool raster(const EditorCanvasScene &scene, const QRectF &visible, double scale, double zoom, int maxSide);

private:
  QRectF area_;
  double scale_ = 0;
  double zoom_ = 0;
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
