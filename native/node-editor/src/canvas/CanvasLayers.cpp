#include "canvas/CanvasLayers.h"

#include "canvas/CanvasViewport.h"
#include "canvas/EditorCanvasScene.h"
#include "graph/NodeLayout.h"
#include <QGuiApplication>
#include <QPainter>
#include <QPalette>
#include <QQuickWindow>
#include <QSGImageNode>
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
  const auto size = viewport_.size();
  if (image_.isNull() || period != period_ || size != rasterSize_) {
    gap_ = gap;
    period_ = period;
    rasterSize_ = size;
    raster();
  }
  // The first cross at or left of the viewport edge, one period further out
  // for the arms, in viewport pixels.
  const auto scroll = viewport_.scroll();
  const auto first = QPointF(std::floor(scroll.x() / zoom / gap_) * gap_, std::floor(scroll.y() / zoom / gap_) * gap_);
  imageOrigin_ = first * zoom - QPointF(scroll) - QPointF(period_, period_);
  axisOrigin_ = viewport_.mapFromSceneF(QPointF(0, 0));
  viewportSize_ = QSizeF(size);
  update();
}

void GridItem::raster() {
  if (rasterSize_.isEmpty() || !(period_ > 0)) {
    image_ = {};
    return;
  }
  ++rasters_;
  const QSize size(int(std::ceil(rasterSize_.width() + 3 * period_)), int(std::ceil(rasterSize_.height() + 3 * period_)));
  QImage image(size, QImage::Format_ARGB32_Premultiplied);
  image.fill(Qt::transparent);
  QPainter painter(&image);
  painter.setRenderHint(QPainter::Antialiasing, false);
  painter.setPen(QPen(grid_, 0));
  const auto half = nm::gridCross / 2 * viewport_.zoom();
  QVector<QLineF> crosses;
  for (double x = 0; x <= size.width(); x += period_) {
    for (double y = 0; y <= size.height(); y += period_) {
      crosses.append({x - half, y, x + half, y});
      crosses.append({x, y - half, x, y + half});
    }
  }
  painter.drawLines(crosses);
  painter.end();
  image_ = std::move(image);
  upload_ = true;
}

QSGNode *GridItem::updatePaintNode(QSGNode *old, UpdatePaintNodeData *) {
  if (!window()) {
    delete old;
    return nullptr;
  }
  auto *root = old;
  if (!root) {
    root = new QSGNode;
    auto *background = window()->createRectangleNode();
    root->appendChildNode(background);
    auto *grid = window()->createImageNode();
    // Nearest sampling places the aliased crosses on whole pixels, as QPainter does.
    grid->setFiltering(QSGTexture::Nearest);
    grid->setOwnsTexture(true);
    root->appendChildNode(grid);
    root->appendChildNode(window()->createRectangleNode());
    root->appendChildNode(window()->createRectangleNode());
    upload_ = true;
  }
  auto *background = static_cast<QSGRectangleNode *>(root->childAtIndex(0));
  background->setRect(QRectF(QPointF(), viewportSize_));
  background->setColor(canvas_);
  auto *grid = static_cast<QSGImageNode *>(root->childAtIndex(1));
  if (upload_ && !image_.isNull()) {
    grid->setTexture(window()->createTextureFromImage(image_));
    grid->setSourceRect(QRectF(QPointF(), grid->texture()->textureSize()));
    upload_ = false;
  }
  grid->setRect(image_.isNull() || !grid->texture() ? QRectF() : QRectF(imageOrigin_, QSizeF(image_.size())));
  // Origin axes (web AxisMarker.tsx): 1px lines from (0, 0) running 80000
  // screen pixels right and down.
  const auto clip = QRectF(QPointF(), viewportSize_);
  const auto horizontal = QRectF(axisOrigin_.x(), std::floor(axisOrigin_.y()), axisMarkerLength, 1).intersected(clip);
  const auto vertical = QRectF(std::floor(axisOrigin_.x()), axisOrigin_.y(), 1, axisMarkerLength).intersected(clip);
  auto *axisX = static_cast<QSGRectangleNode *>(root->childAtIndex(2));
  auto *axisY = static_cast<QSGRectangleNode *>(root->childAtIndex(3));
  axisX->setRect(horizontal);
  axisY->setRect(vertical);
  axisX->setColor(axis_);
  axisY->setColor(axis_);
  return root;
}

void GridItem::releaseResources() { upload_ = true; }

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
