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
// canvas color, a repeating cross texture and the origin axes. GraphCanvas
// owns the item, which borrows the viewport and keeps its own theme colors.
class GridItem final : public QQuickItem {
public:
  GridItem(const CanvasViewport &viewport, QQuickItem *parent);
  void setTheme(const CanvasTheme &theme);
  // Re-reads the viewport after a pan, zoom or resize.
  void sync();
  int rasterCount() const { return rasters_; }

protected:
  QSGNode *updatePaintNode(QSGNode *old, UpdatePaintNodeData *data) override;

private:
  void raster();
  const CanvasViewport &viewport_;
  QImage image_;
  QPointF imageOrigin_;
  QColor canvas_;
  QColor grid_;
  QColor axis_;
  double period_ = 0;
  double texturePeriod_ = 0;
  bool integralTexture_ = false;
  double dpr_ = 0;
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
