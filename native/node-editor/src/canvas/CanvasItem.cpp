#include "canvas/CanvasItem.h"

#include "canvas/CanvasScene.h"
#include <QPainter>
#include <QQuickWindow>
#include <QSGImageNode>
#include <QSGRendererInterface>
#include <algorithm>
#include <cmath>
#include <memory>

namespace nodetool::canvas {
CanvasImageItem::CanvasImageItem(QQuickItem *parent) {
  // The owning handle, scene, or canvas member controls the lifetime.
  setParentItem(parent);
  setFlag(ItemHasContents, true);
}

void CanvasImageItem::setTile(QPoint key, Tile tile) {
  tiles_.insert(key, std::move(tile));
  update();
}

void CanvasImageItem::removeTile(QPoint key) {
  tiles_.remove(key);
  update();
}

void CanvasImageItem::publishStagedTiles() {
  tiles_ = std::exchange(staged_, {});
  update();
}

void CanvasImageItem::clearImage() {
  staged_.clear();
  if (tiles_.isEmpty()) { return; }
  tiles_.clear();
  update();
}

bool CanvasImageItem::hasImage() const {
  return std::ranges::any_of(tiles_, [](const Tile &tile) { return !tile.pixels.isNull(); });
}

qsizetype CanvasImageItem::rasterBytes() const {
  qsizetype bytes = 0;
  for (const auto &tile : tiles_) { bytes += tile.bytes(); }
  return bytes;
}

QRectF CanvasImageItem::RasterGeometry::localRect() const {
  return QRectF((QPointF(device.topLeft()) - phase + viewportPhase) / scale, QSizeF(device.size()) / scale);
}

CanvasImageItem::RasterGeometry CanvasImageItem::rasterGeometry(const QRectF &rect, QPointF sceneOrigin,
                                                                double scale, QPointF viewportPhase) {
  if (rect.isEmpty() || !(scale > 0)) { return {{}, {}, 1, {}}; }
  const auto origin = sceneOrigin * scale + viewportPhase;
  const auto phase = origin - QPointF(origin.toPoint());
  const auto device = QRectF(rect.topLeft() * scale + phase, rect.size() * scale).toAlignedRect();
  return {device, phase, scale, viewportPhase};
}

QImage CanvasImageItem::rasterize(const RasterGeometry &geometry, double dpr, const std::function<void(QPainter &)> &paint) {
  if (geometry.device.isEmpty()) { return {}; }
  QImage image(geometry.device.size(), QImage::Format_ARGB32_Premultiplied);
  if (image.isNull()) { return {}; }
  image.setDevicePixelRatio(dpr);
  image.fill(Qt::transparent);
  {
    QPainter painter(&image);
    painter.translate((geometry.phase - QPointF(geometry.device.topLeft())) / dpr);
    painter.scale(geometry.scale / dpr, geometry.scale / dpr);
    paint(painter);
  }
  return image;
}

QRectF CanvasImageItem::alignedImageRect(const QRectF &windowRect, double dpr) {
  // The two projections of a shared edge can differ by arithmetic noise
  // at half pixels. Use the same tie break for both sides of the edge.
  const auto roundEdge = [](QPointF point) {
    const auto round = [](double coordinate) { return int(std::floor(coordinate + 0.5 + 1e-7)); };
    return QPoint(round(point.x()), round(point.y()));
  };
  const auto start = roundEdge(windowRect.topLeft() * dpr);
  const auto end = roundEdge(windowRect.bottomRight() * dpr);
  return {QPointF(start) / dpr, QSizeF(end.x() - start.x(), end.y() - start.y()) / dpr};
}

namespace {
// Render thread only. The scene graph owns the root, its child nodes and
// their textures. The cache keys identify the last uploaded images.
class TileTextureNode final : public QSGNode {
public:
  struct Entry {
    QSGImageNode *node;
    qint64 imageKey;
  };
  QHash<QPoint, Entry> entries;
};
} // namespace

QSGNode *CanvasImageItem::updatePaintNode(QSGNode *old, UpdatePaintNodeData *) {
  auto root = std::unique_ptr<TileTextureNode>(static_cast<TileTextureNode *>(old));
  if (!window() || tiles_.isEmpty() || window()->rendererInterface()->graphicsApi() == QSGRendererInterface::Software) {
    return nullptr;
  }
  if (!root) { root = std::make_unique<TileTextureNode>(); }
  for (auto it = root->entries.begin(); it != root->entries.end();) {
    const auto tile = tiles_.constFind(it.key());
    if (tile != tiles_.cend() && !tile->pixels.isNull()) {
      ++it;
      continue;
    }
    std::unique_ptr<QSGImageNode> removed(it->node);
    root->removeChildNode(removed.get());
    it = root->entries.erase(it);
  }
  for (auto it = tiles_.cbegin(); it != tiles_.cend(); ++it) {
    if (it->pixels.isNull()) { continue; }
    auto entry = root->entries.find(it.key());
    if (entry == root->entries.end() || entry->imageKey != it->pixels.cacheKey()) {
      auto texture = std::unique_ptr<QSGTexture>(
          window()->createTextureFromImage(it->pixels, QQuickWindow::TextureCanUseAtlas));
      if (!texture) { continue; }
      if (entry == root->entries.end()) {
        auto node = std::unique_ptr<QSGImageNode>(window()->createImageNode());
        node->setFiltering(QSGTexture::Linear);
        node->setOwnsTexture(true);
        node->setTexture(texture.release());
        entry = root->entries.insert(it.key(), {node.get(), it->pixels.cacheKey()});
        root->appendChildNode(node.release());
      } else {
        entry->node->setTexture(texture.release());
        entry->imageKey = it->pixels.cacheKey();
      }
      entry->node->setSourceRect(QRectF(QPointF(), entry->node->texture()->textureSize()));
    }
    auto *node = entry->node;
    const auto rect = mapRectToScene(it->geometry.localRect());
    node->setRect(mapRectFromScene(alignedImageRect(rect, window()->effectiveDevicePixelRatio())));
  }
  return root.release();
}

void CanvasImageItem::geometryChange(const QRectF &geometry, const QRectF &previous) {
  QQuickItem::geometryChange(geometry, previous);
  if (!tiles_.isEmpty() && geometry.topLeft() != previous.topLeft()) { update(); }
}

void CanvasImageItem::releaseResources() { clearImage(); }

void CanvasImageItem::itemChange(ItemChange change, const ItemChangeData &value) {
  if (change == ItemSceneChange) { clearImage(); }
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
  if (!scene_ || !shown_) { return false; }
  const QQuickItem *item = parentItem();
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
  invalidateImage();
  if (scene_) {
    scene_->requestRaster();
    scene_->notifyChanged();
  }
}

void CanvasItem::itemChange(ItemChange change, const ItemChangeData &value) {
  CanvasImageItem::itemChange(change, value);
  if (!scene_) { return; }
  if (change == ItemParentHasChanged) { reindex(); }
  if (change == ItemSceneChange && value.window) { scene_->requestRaster(); }
}

} // namespace nodetool::canvas
