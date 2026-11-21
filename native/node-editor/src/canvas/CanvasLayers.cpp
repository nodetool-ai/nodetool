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
  zoom_ = viewport_.zoom();
  scroll_ = viewport_.scroll();
  viewportSize_ = viewport_.size();
  axisOrigin_ = viewport_.mapFromSceneF(QPointF(0, 0));
  update();
}

// The texture repeats in device pixels. Pixel u shows the scene point whose
// device coordinate is u plus the view's fractional offset, so it is painted
// with the transform QtNodes uses less a whole number of pixels. A period
// that repeats on whole pixels within a few crosses gives an exact pattern.
void GridItem::raster(double dpr, QPointF phase) {
  ++rasters_;
  imageZoom_ = zoom_;
  imageDpr_ = dpr;
  imagePhase_ = phase;
  const auto gap = gridGap(zoom_);
  const auto devicePeriod = gap * zoom_ * dpr;
  int crosses = 1;
  double error = 1;
  for (int count = 1; count <= 8; ++count) {
    const auto pixels = devicePeriod * count;
    const auto off = std::abs(pixels - std::round(pixels));
    if (off < error - 1e-9 && pixels <= 2048) {
      crosses = count;
      error = off;
    }
    if (error < 1e-6) { break; }
  }
  const auto side = std::max(1, int(std::round(devicePeriod * crosses)));
  QImage image(side, side, QImage::Format_ARGB32_Premultiplied);
  image.fill(canvas_);
  QPainter painter(&image);
  painter.setRenderHint(QPainter::Antialiasing, false);
  painter.setPen(QPen(grid_, 0));
  painter.setTransform(QTransform(zoom_ * dpr, 0, 0, zoom_ * dpr, -phase.x(), -phase.y()));
  const auto half = node_metrics::gridCross / 2;
  QVector<QLineF> lines;
  // The crosses at both ends paint the arms that wrap around the edges.
  for (int y = -1; y <= crosses; ++y) {
    for (int x = -1; x <= crosses; ++x) {
      const QPointF center(x * gap, y * gap);
      lines.append({center - QPointF(half, 0), center + QPointF(half, 0)});
      lines.append({center - QPointF(0, half), center + QPointF(0, half)});
    }
  }
  painter.drawLines(lines);
  painter.end();
  image_ = std::move(image);
}

namespace {
// Render thread only. The scene graph owns the node. It keeps copies of the
// colours and view values taken during sync and paints only the damaged clip
// directly onto the software backing store, avoiding a full-viewport cache
// allocation and blit on zoom and pan frames.
class SoftwareGridNode final : public QSGRenderNode {
public:
  explicit SoftwareGridNode(QQuickWindow &window) : window_(window) {}
  struct View {
    QColor canvas, grid, axis;
    double zoom;
    QPoint scroll;
    QSizeF size;
    bool operator==(const View &) const = default;
  };

  void sync(const View &view) {
    if (view == view_) { return; }
    view_ = view;
    markDirty(DirtyGeometry | DirtyMaterial);
  }
  QRectF rect() const override { return QRectF(QPointF(), view_.size); }
  RenderingFlags flags() const override { return BoundedRectRendering | OpaqueRendering; }
  void render(const RenderState *state) override {
    auto *painter = static_cast<QPainter *>(
        window_.rendererInterface()->getResource(&window_, QSGRendererInterface::PainterResource));
    if (!painter || !(view_.zoom > 0)) { return; }
    painter->save();
    const auto itemTransform = matrix()->toTransform();
    const auto itemBounds = itemTransform.mapRect(QRectF(QPointF(), view_.size));
    if (const auto *clip = state->clipRegion()) {
      painter->setClipRegion(*clip, Qt::ReplaceClip);
      painter->setClipRect(itemBounds, Qt::IntersectClip);
    } else {
      painter->setClipRect(itemBounds, Qt::ReplaceClip);
    }
    painter->setOpacity(inheritedOpacity());
    const QPointF scroll(view_.scroll);
    const auto viewTransform =
        QTransform(view_.zoom, 0, 0, view_.zoom, -scroll.x(), -scroll.y()) * itemTransform;
    const auto inverse = viewTransform.inverted();
    const QRectF exposed(scroll / view_.zoom, view_.size / view_.zoom);
    painter->setTransform(viewTransform);
    if (const auto *clip = state->clipRegion(); clip && !clip->isEmpty()) {
      for (const QRect &rect : *clip) {
        const auto damaged = QRectF(rect).intersected(itemBounds);
        if (damaged.isEmpty()) { continue; }
        paintGrid(*painter, exposed, inverse.mapRect(damaged), view_.zoom, view_.canvas, view_.grid, view_.axis);
      }
    } else {
      paintGrid(*painter, exposed, exposed, view_.zoom, view_.canvas, view_.grid, view_.axis);
    }
    painter->restore();
  }

private:
  QQuickWindow &window_;
  View view_{};
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
  // offset is the whole device-pixel position of the view's origin in the
  // repeating pattern.
  void sync(QQuickWindow &window, const QImage &image, const QRectF &bounds, QPointF offset, double dpr) {
    if (imageKey_ != image.cacheKey()) {
      auto texture = std::unique_ptr<QSGTexture>(window.createTextureFromImage(image));
      if (!texture) { return; }
      material_.setTexture(texture.get());
      texture_ = std::move(texture);
      imageKey_ = image.cacheKey();
      markDirty(DirtyMaterial);
    }
    const QSizeF side(image.size());
    const QRectF coordinates(QPointF(offset.x() / side.width(), offset.y() / side.height()),
                             QSizeF(bounds.width() * dpr / side.width(), bounds.height() * dpr / side.height()));
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
  if (!view || !canvas_.isValid()) { return nullptr; }
  const bool software = view->rendererInterface()->graphicsApi() == QSGRendererInterface::Software;
  const QRectF bounds(QPointF(), viewportSize_);
  if (software) {
    if (!root) {
      root = std::make_unique<QSGNode>();
      root->appendChildNode(std::make_unique<SoftwareGridNode>(*view).release());
    }
    static_cast<SoftwareGridNode *>(root->firstChild())->sync({canvas_, grid_, axis_, zoom_, scroll_, viewportSize_});
    return root.release();
  }
  const auto dpr = view->effectiveDevicePixelRatio();
  const auto device = QPointF(scroll_) * dpr;
  const auto whole = QPointF(std::floor(device.x()), std::floor(device.y()));
  const auto phase = device - whole;
  if (image_.isNull() || imageZoom_ != zoom_ || imageDpr_ != dpr || imagePhase_ != phase) { raster(dpr, phase); }
  if (!root) {
    root = std::make_unique<QSGNode>();
    root->appendChildNode(std::make_unique<RepeatingGridNode>().release());
    root->appendChildNode(view->createRectangleNode());
    root->appendChildNode(view->createRectangleNode());
  }
  static_cast<RepeatingGridNode *>(root->firstChild())->sync(*view, image_, bounds, whole, dpr);
  // Origin axes (web AxisMarker.tsx): 1px lines from (0, 0) running 80000
  // screen pixels right and down.
  const auto horizontal = QRectF(axisOrigin_.x(), std::floor(axisOrigin_.y()), axisMarkerLength, 1).intersected(bounds);
  const auto vertical = QRectF(std::floor(axisOrigin_.x()), axisOrigin_.y(), 1, axisMarkerLength).intersected(bounds);
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
