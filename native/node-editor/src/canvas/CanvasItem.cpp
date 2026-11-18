#include "canvas/CanvasItem.h"

#include "canvas/CanvasScene.h"
#include <QPainter>
#include <QQuickWindow>
#include <QSGImageNode>
#include <QSGRendererInterface>
#include <algorithm>
#include <cmath>

namespace nodetool::canvas {
CanvasImageItem::CanvasImageItem(QQuickItem *parent) {
  // The owning handle, scene, or canvas member controls the lifetime.
  setParentItem(parent);
  setFlag(ItemHasContents, true);
}

void CanvasImageItem::setImage(QImage image, const QRectF &rect, double scale, double zoom) {
  image_ = std::move(image);
  imageRect_ = rect;
  imageScale_ = scale;
  imageZoom_ = zoom;
  upload_ = true;
  contentDirty_ = false;
  update();
}

void CanvasImageItem::clearImage() {
  if (image_.isNull()) { return; }
  image_ = {};
  imageRect_ = {};
  imageScale_ = 0;
  upload_ = true;
  contentDirty_ = true;
  update();
}

QRectF CanvasImageItem::RasterGeometry::localRect() const {
  return QRectF((QPointF(device.topLeft()) - phase) / scale, QSizeF(device.size()) / scale);
}

CanvasImageItem::RasterGeometry CanvasImageItem::rasterGeometry(const QRectF &rect, QPointF sceneOrigin,
                                                                double scale, int maxSide) {
  if (rect.isEmpty() || !(scale > 0)) { return {{}, {}, 1}; }
  scale = std::min({scale, (maxSide - 1) / rect.width(), (maxSide - 1) / rect.height()});
  const auto origin = sceneOrigin * scale;
  const auto phase = origin - QPointF(origin.toPoint());
  const auto device = QRectF(rect.topLeft() * scale + phase, rect.size() * scale).toAlignedRect();
  return {device, phase, scale};
}

QImage CanvasImageItem::rasterize(const RasterGeometry &geometry, const std::function<void(QPainter &)> &paint) {
  if (geometry.device.isEmpty()) { return {}; }
  QImage image(geometry.device.size(), QImage::Format_ARGB32_Premultiplied);
  if (image.isNull()) { return {}; }
  image.fill(Qt::transparent);
  {
    QPainter painter(&image);
    painter.translate(geometry.phase - QPointF(geometry.device.topLeft()));
    painter.scale(geometry.scale, geometry.scale);
    paint(painter);
  }
  return image;
}

QRectF CanvasImageItem::alignedImageRect(const QRectF &windowRect, double dpr) const {
  const auto pixels = windowRect.size() * dpr;
  if (!qFuzzyCompare(pixels, QSizeF(image_.size()))) { return windowRect; }
  return {QPointF((windowRect.topLeft() * dpr).toPoint()) / dpr, QSizeF(image_.size()) / dpr};
}

QSGNode *CanvasImageItem::updatePaintNode(QSGNode *old, UpdatePaintNodeData *) {
  if (image_.isNull() || imageRect_.isEmpty() || !window()) {
    delete old;
    return nullptr;
  }
  auto *node = static_cast<QSGImageNode *>(old);
  if (!node) {
    node = window()->createImageNode();
    node->setFiltering(QSGTexture::Linear);
    upload_ = true;
  }
  if (upload_) {
    node->setTexture(window()->createTextureFromImage(image_, QQuickWindow::TextureCanUseAtlas));
    node->setOwnsTexture(true);
    node->setSourceRect(QRectF(QPointF(), node->texture()->textureSize()));
    upload_ = false;
  }
  const auto rect = mapRectToScene(imageRect_);
  node->setRect(mapRectFromScene(alignedImageRect(rect, window()->effectiveDevicePixelRatio())));
  return node;
}

void CanvasImageItem::geometryChange(const QRectF &geometry, const QRectF &previous) {
  QQuickItem::geometryChange(geometry, previous);
  if (hasImage() && geometry.topLeft() != previous.topLeft()) { update(); }
}

void CanvasImageItem::releaseResources() {
  // The scene graph destroys the node and its texture. The next frame uploads again.
  image_ = {};
  imageScale_ = 0;
  upload_ = true;
  contentDirty_ = true;
}

void CanvasImageItem::itemChange(ItemChange change, const ItemChangeData &value) {
  if (change == ItemSceneChange) {
    image_ = {};
    imageScale_ = 0;
    upload_ = true;
    contentDirty_ = true;
  }
  QQuickItem::itemChange(change, value);
}

CanvasItem::CanvasItem(CanvasScene &scene, Kind kind, QQuickItem *parent)
    : CanvasImageItem(parent), scene_(&scene), kind_(kind), key_(scene.nextKey()) {
  scene.registerItem(*this);
}

CanvasItem::~CanvasItem() {
  if (scene_) { scene_->unregisterItem(*this); }
}

bool CanvasItem::hitTest(const QPointF &scenePoint) const { return sceneBoundingRect().contains(scenePoint); }

QPointF CanvasItem::scenePosition() const {
  QPointF origin;
  for (const QQuickItem *item = this; item && (!scene_ || item != &scene_->layer()); item = item->parentItem()) {
    origin += item->position();
  }
  return origin;
}

void CanvasItem::setShown(bool shown) {
  if (shown_ == shown) { return; }
  shown_ = shown;
  if (scene_) {
    scene_->updateIndex(*this);
    scene_->requestRaster();
  }
}

bool CanvasItem::effectivelyShown() const {
  if (!scene_) { return false; }
  const QQuickItem *item = this;
  while (item && item != &scene_->layer()) {
    if (const auto *canvas = dynamic_cast<const CanvasItem *>(item); canvas && !canvas->shown()) { return false; }
    item = item->parentItem();
  }
  return item == &scene_->layer();
}

std::pair<double, int> CanvasItem::stackKey() const {
  const QQuickItem *top = this;
  int depth = 0;
  while (scene_ && top->parentItem() && top->parentItem() != &scene_->layer()) {
    top = top->parentItem();
    ++depth;
  }
  return {top->z(), depth};
}

void CanvasItem::reindex() {
  if (scene_) { scene_->updateIndex(*this); }
}

void CanvasItem::markDirty() {
  setContentDirty(true);
  if (scene_) {
    scene_->requestRaster();
    scene_->notifyChanged();
  }
}

QSGNode *CanvasItem::updatePaintNode(QSGNode *old, UpdatePaintNodeData *data) {
  // GraphCanvas composites these images in one pass on the software backend.
  if (window() && window()->rendererInterface()->graphicsApi() == QSGRendererInterface::Software) {
    std::unique_ptr<QSGNode> previous(old);
    return nullptr;
  }
  return CanvasImageItem::updatePaintNode(old, data);
}

void CanvasItem::itemChange(ItemChange change, const ItemChangeData &value) {
  CanvasImageItem::itemChange(change, value);
  if (!scene_) { return; }
  if (change == ItemParentHasChanged) { reindex(); }
  if (change == ItemSceneChange && value.window) { scene_->requestRaster(); }
}

} // namespace nodetool::canvas
