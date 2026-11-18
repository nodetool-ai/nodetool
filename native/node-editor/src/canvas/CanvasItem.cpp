#include "canvas/CanvasItem.h"

#include "canvas/CanvasScene.h"
#include <QPainter>
#include <QQuickWindow>
#include <QSGImageNode>
#include <algorithm>
#include <cmath>

namespace nodetool::canvas {

CanvasImageItem::CanvasImageItem(QQuickItem *parent) : QQuickItem(parent) { setFlag(ItemHasContents, true); }

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

CanvasImageItem::Raster CanvasImageItem::rasterize(const QRectF &rect, double scale,
                                                   const std::function<void(QPainter &)> &paint, int maxSide) {
  if (rect.isEmpty() || !(scale > 0)) { return {}; }
  // A texture side never exceeds maxSide pixels (plan R4).
  scale = std::min({scale, maxSide / rect.width(), maxSide / rect.height()});
  const auto device = QRectF(rect.topLeft() * scale, rect.size() * scale).toAlignedRect();
  if (device.isEmpty()) { return {}; }
  QImage image(device.size(), QImage::Format_ARGB32_Premultiplied);
  image.fill(Qt::transparent);
  {
    QPainter painter(&image);
    painter.translate(-device.topLeft());
    painter.scale(scale, scale);
    paint(painter);
  }
  return {std::move(image), QRectF(QPointF(device.topLeft()) / scale, QSizeF(device.size()) / scale), scale};
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
  node->setRect(imageRect_);
  return node;
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

void CanvasItem::itemChange(ItemChange change, const ItemChangeData &value) {
  CanvasImageItem::itemChange(change, value);
  if (change == ItemParentHasChanged && scene_) { scene_->updateIndex(*this); }
}

} // namespace nodetool::canvas
