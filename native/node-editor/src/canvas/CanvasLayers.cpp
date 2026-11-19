#include "canvas/CanvasLayers.h"

#include "canvas/CanvasViewport.h"
#include "canvas/EditorCanvasScene.h"
#include "graph/NodeLayout.h"
#include <QGuiApplication>
#include <QPainter>
#include <QPalette>
#include <QQuickWindow>
#include <QSGRenderNode>
#include <QSGRendererInterface>
#include <QSGTextureMaterial>
#include <QSGRectangleNode>
#include <cmath>

namespace nodetool::canvas {
namespace nm = node_metrics;

GridItem::GridItem(const CanvasViewport &viewport, QQuickItem *parent) : viewport_(viewport) {
  setParentItem(parent);
  setFlag(ItemHasContents, true);
}

void GridItem::setTheme(const CanvasTheme &theme) {
  canvas_ = theme.canvas;
  grid_ = theme.grid;
  axis_ = axisMarkerColor(theme.canvas.lightnessF() < .5);
  image_ = {};
  sync();
}

void GridItem::sync() {
  const auto zoom = viewport_.zoom();
  // A cross pattern tied to the scene, as React Flow's Background draws it.
  auto gap = nm::gridGap;
  while (gap * zoom < 12) { gap *= 2; }
  const auto period = gap * zoom;
  const auto dpr = window() ? window()->effectiveDevicePixelRatio() : 1.;
  if (image_.isNull() || period != period_ || dpr != dpr_) {
    period_ = period;
    dpr_ = dpr;
    raster();
  }
  // The cross sits at the center of a tile so neither arm crosses its edge.
  const auto scroll = viewport_.scroll();
  const auto first = QPointF(std::floor(scroll.x() / period), std::floor(scroll.y() / period));
  imageOrigin_ = first * period - QPointF(scroll) - QPointF(period, period) / 2;
  axisOrigin_ = viewport_.mapFromSceneF(QPointF(0, 0));
  viewportSize_ = viewport_.size();
  update();
}

void GridItem::raster() {
  ++rasters_;
  const auto devicePeriod = period_ * dpr_;
  int repeats = 1;
  integralTexture_ = false;
  // A non-integral period such as 31.25 device pixels repeats after four
  // crosses. Use that device-pixel period to keep software sampling 1:1.
  for (const int count : {1, 2, 3, 4}) {
    const auto pixels = devicePeriod * count;
    if (qAbs(pixels - qRound(pixels)) < 1e-6) {
      repeats = count;
      integralTexture_ = true;
      break;
    }
  }
  texturePeriod_ = period_ * repeats;
  const auto side = integralTexture_ ? qRound(devicePeriod * repeats) : qCeil(devicePeriod);
  QImage image(side, side, QImage::Format_ARGB32_Premultiplied);
  image.fill(canvas_);
  QPainter painter(&image);
  painter.setPen(QPen(grid_, 0));
  const auto cell = double(side) / repeats;
  const auto half = nm::gridCross / 2 * viewport_.zoom() * side / texturePeriod_;
  for (int y = 0; y < repeats; ++y) {
    for (int x = 0; x < repeats; ++x) {
      const QPointF center((x + .5) * cell, (y + .5) * cell);
      painter.drawLine(QLineF(center - QPointF(half, 0), center + QPointF(half, 0)));
      painter.drawLine(QLineF(center - QPointF(0, half), center + QPointF(0, half)));
    }
  }
  painter.end();
  image_ = std::move(image);
}

namespace {
// Render thread only. The scene graph owns the node and its brush, whose
// texture shares the grid image acquired during sync.
class SoftwareGridNode final : public QSGRenderNode {
public:
  explicit SoftwareGridNode(QQuickWindow &window) : window_(window) {}

  void sync(const QImage &image, QRectF bounds, QPointF origin, double period) {
    if (imageKey_ != image.cacheKey()) {
      imageKey_ = image.cacheKey();
      brush_.setTextureImage(image);
    }
    bounds_ = bounds;
    QTransform transform;
    transform.translate(origin.x(), origin.y());
    transform.scale(period / image.width(), period / image.height());
    brush_.setTransform(transform);
    markDirty(DirtyGeometry | DirtyMaterial);
  }
  QRectF rect() const override { return bounds_; }
  RenderingFlags flags() const override { return BoundedRectRendering | OpaqueRendering; }
  void render(const RenderState *state) override {
    auto *painter = static_cast<QPainter *>(
        window_.rendererInterface()->getResource(&window_, QSGRendererInterface::PainterResource));
    if (!painter) { return; }
    painter->save();
    if (const auto *clip = state->clipRegion()) { painter->setClipRegion(*clip, Qt::ReplaceClip); }
    painter->setTransform(matrix()->toTransform());
    painter->setOpacity(inheritedOpacity());
    painter->fillRect(bounds_, brush_);
    painter->restore();
  }

private:
  QQuickWindow &window_;
  QRectF bounds_;
  QBrush brush_;
  qint64 imageKey_ = 0;
};

// Render thread only. The scene graph owns the node, which owns a single
// repeated texture and embeds its material and geometry.
class RepeatingGridNode final : public QSGGeometryNode {
public:
  RepeatingGridNode() {
    setGeometry(&geometry_);
    setMaterial(&material_);
    material_.setFiltering(QSGTexture::Nearest);
    material_.setHorizontalWrapMode(QSGTexture::Repeat);
    material_.setVerticalWrapMode(QSGTexture::Repeat);
  }
  void sync(QQuickWindow &window, const QImage &image, const QRectF &bounds, QPointF origin, double period) {
    if (imageKey_ != image.cacheKey()) {
      auto texture = std::unique_ptr<QSGTexture>(window.createTextureFromImage(image));
      if (!texture) { return; }
      material_.setTexture(texture.get());
      texture_ = std::move(texture);
      imageKey_ = image.cacheKey();
      markDirty(DirtyMaterial);
    }
    const QRectF coordinates(-origin / period, bounds.size() / period);
    QSGGeometry::updateTexturedRectGeometry(&geometry_, bounds, coordinates);
    markDirty(DirtyGeometry);
  }

private:
  QSGGeometry geometry_{QSGGeometry::defaultAttributes_TexturedPoint2D(), 4};
  QSGTextureMaterial material_;
  std::unique_ptr<QSGTexture> texture_;
  qint64 imageKey_ = 0;
};
} // namespace

QSGNode *GridItem::updatePaintNode(QSGNode *old, UpdatePaintNodeData *) {
  auto root = std::unique_ptr<QSGNode>(old);
  auto *view = window();
  if (!view || image_.isNull()) { return nullptr; }
  const bool software = view->rendererInterface()->graphicsApi() == QSGRendererInterface::Software;
  if (!root) {
    root = std::make_unique<QSGNode>();
    if (software) {
      root->appendChildNode(std::make_unique<SoftwareGridNode>(*view).release());
    } else {
      root->appendChildNode(std::make_unique<RepeatingGridNode>().release());
    }
    root->appendChildNode(view->createRectangleNode());
    root->appendChildNode(view->createRectangleNode());
  }
  const QRectF bounds(QPointF(), viewportSize_);
  if (software) {
    const auto origin = integralTexture_ ? QPointF((imageOrigin_ * dpr_).toPoint()) / dpr_ : imageOrigin_;
    static_cast<SoftwareGridNode *>(root->firstChild())->sync(image_, bounds, origin, texturePeriod_);
  } else {
    static_cast<RepeatingGridNode *>(root->firstChild())->sync(*view, image_, bounds, imageOrigin_, texturePeriod_);
  }
  // Origin axes (web AxisMarker.tsx): 1px lines from (0, 0) running 80000
  // screen pixels right and down.
  const auto clip = QRectF(QPointF(), viewportSize_);
  const auto horizontal = QRectF(axisOrigin_.x(), std::floor(axisOrigin_.y()), axisMarkerLength, 1).intersected(clip);
  const auto vertical = QRectF(std::floor(axisOrigin_.x()), axisOrigin_.y(), 1, axisMarkerLength).intersected(clip);
  auto *axisX = static_cast<QSGRectangleNode *>(root->childAtIndex(1));
  auto *axisY = static_cast<QSGRectangleNode *>(root->childAtIndex(2));
  axisX->setRect(horizontal);
  axisY->setRect(vertical);
  axisX->setColor(axis_);
  axisY->setColor(axis_);
  return root.release();
}

ForegroundItem::ForegroundItem(const EditorCanvasScene &scene, QQuickItem &parent)
    : CanvasImageItem(&parent), scene_(scene) {}

void ForegroundItem::setPart(Part part) {
  if (part_ == part) { return; }
  setPosition(part.origin);
  part_ = std::move(part);
  invalidateImage();
}

void ForegroundItem::paintRaster(QPainter &painter, double) const { scene_.paintForegroundPart(painter, part_); }

RubberBandItem::RubberBandItem(QQuickItem *parent) {
  setParentItem(parent);
  setFlag(ItemHasContents, true);
}

void RubberBandItem::setBand(const QRect &rect) {
  if (band_ == rect) { return; }
  band_ = rect;
  update();
}

QSGNode *RubberBandItem::updatePaintNode(QSGNode *old, UpdatePaintNodeData *) {
  if (band_.isNull() || !window()) {
    delete old;
    return nullptr;
  }
  auto *root = old;
  if (!root) {
    root = new QSGNode;
    for (int i = 0; i < 5; ++i) { root->appendChildNode(window()->createRectangleNode()); }
  }
  // QCommonStyle CE_RubberBand: a dimmed highlight inside a darker highlight edge.
  const auto highlight = QGuiApplication::palette().color(QPalette::Active, QPalette::Highlight);
  QColor dim(std::min(highlight.red() / 2 + 110, 255), std::min(highlight.green() / 2 + 110, 255),
             std::min(highlight.blue() / 2 + 110, 255), 80);
  const auto edge = highlight.darker(120);
  const QRectF rect(band_);
  const QRectF parts[] = {rect.adjusted(1, 1, -1, -1), QRectF(rect.left(), rect.top(), rect.width(), 1),
                          QRectF(rect.left(), rect.bottom(), rect.width(), 1), QRectF(rect.left(), rect.top(), 1, rect.height()),
                          QRectF(rect.right(), rect.top(), 1, rect.height())};
  for (int i = 0; i < 5; ++i) {
    auto *node = static_cast<QSGRectangleNode *>(root->childAtIndex(i));
    node->setRect(parts[i]);
    node->setColor(i == 0 ? dim : edge);
  }
  return root;
}

} // namespace nodetool::canvas
