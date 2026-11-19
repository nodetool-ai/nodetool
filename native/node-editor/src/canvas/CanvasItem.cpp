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

QRectF CanvasImageItem::RasterGeometry::paintRect() const {
  return QRectF((QPointF(device.topLeft()) - phase) / scale, QSizeF(device.size()) / scale);
}

void CanvasImageItem::invalidateRegion(const QList<QRectF> &region) {
  const auto previous = revision_++;
  for (auto *grid : {&tiles_, &staged_}) {
    for (auto &tile : *grid) {
      // A tile that was already stale repaints in full.
      if (tile.revision != previous) { continue; }
      tile.revision = revision_;
      const auto area = tile.geometry.paintRect();
      for (const auto &rect : region) {
        const auto touched = rect.intersected(area);
        if (!touched.isEmpty()) { tile.damage = tile.damage.isEmpty() ? touched : tile.damage.united(touched); }
      }
    }
  }
}

CanvasImageItem::RasterGeometry CanvasImageItem::rasterGeometry(const QRectF &rect, QPointF sceneOrigin,
                                                                double scale, QPointF viewportPhase) {
  if (rect.isEmpty() || !(scale > 0)) { return {{}, {}, 1, {}}; }
  const auto origin = sceneOrigin * scale + viewportPhase;
  const auto phase = origin - QPointF(origin.toPoint());
  const auto device = QRectF(rect.topLeft() * scale + phase, rect.size() * scale).toAlignedRect();
  return {device, phase, scale, viewportPhase};
}

CanvasImageItem::RasterGeometry CanvasImageItem::rasterGeometryOnGrid(const QRectF &rect, const RasterGeometry &grid) {
  if (rect.isEmpty() || !(grid.scale > 0)) { return {{}, {}, 1, {}}; }
  const auto device = QRectF(rect.topLeft() * grid.scale + grid.phase, rect.size() * grid.scale).toAlignedRect();
  return {device, grid.phase, grid.scale, grid.viewportPhase};
}

QImage CanvasImageItem::rasterize(const RasterGeometry &geometry, double dpr, const std::function<void(QPainter &)> &paint,
                                  const QImage &base, const QRectF &damage, QImage spare) {
  if (geometry.device.isEmpty()) { return {}; }
  // A partial repaint covers whole device pixels around the damaged area.
  QRect pixels(QPoint(), geometry.device.size());
  if (!base.isNull() && !damage.isEmpty() && base.size() == pixels.size()) {
    pixels = QRectF(damage.topLeft() * geometry.scale + geometry.phase - QPointF(geometry.device.topLeft()),
                    damage.size() * geometry.scale)
                 .toAlignedRect()
                 .intersected(pixels);
    if (pixels.isEmpty()) { return base; }
  }
  // The painter code sets its own clips, so the damaged area is painted into
  // an image of its own size. An integral offset paints the same pixels.
  const bool reuse = spare.size() == pixels.size() && spare.format() == QImage::Format_ARGB32_Premultiplied && spare.isDetached();
  QImage image = reuse ? std::move(spare) : QImage(pixels.size(), QImage::Format_ARGB32_Premultiplied);
  if (image.isNull()) { return {}; }
  image.setDevicePixelRatio(dpr);
  image.fill(Qt::transparent);
  {
    QPainter painter(&image);
    painter.translate((geometry.phase - QPointF(geometry.device.topLeft() + pixels.topLeft())) / dpr);
    painter.scale(geometry.scale / dpr, geometry.scale / dpr);
    paint(painter);
  }
  if (pixels.size() == geometry.device.size()) { return image; }
  auto merged = base.copy();
  merged.setDevicePixelRatio(dpr);
  QPainter painter(&merged);
  painter.setCompositionMode(QPainter::CompositionMode_Source);
  painter.drawImage(QPointF(pixels.topLeft()) / dpr, image);
  painter.end();
  return merged;
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

QRectF CanvasImageItem::tileTarget(const QRectF &windowRect, const QImage &pixels, double dpr) {
  const auto aligned = alignedImageRect(windowRect, dpr);
  const auto device = windowRect.size() * dpr;
  if (pixels.isNull() || std::abs(device.width() - pixels.width()) > 1e-3 || std::abs(device.height() - pixels.height()) > 1e-3) {
    return aligned;
  }
  return {aligned.topLeft(), QSizeF(pixels.size()) / dpr};
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

void CanvasImageItem::setIndividualSoftwareRendering(bool enabled) {
  if (individualSoftwareRendering_ == enabled) { return; }
  individualSoftwareRendering_ = enabled;
  update();
}

QSGNode *CanvasImageItem::updatePaintNode(QSGNode *old, UpdatePaintNodeData *) {
  auto root = std::unique_ptr<TileTextureNode>(static_cast<TileTextureNode *>(old));
  if (!window() || tiles_.isEmpty() ||
      (!individualSoftwareRendering_ && window()->rendererInterface()->graphicsApi() == QSGRendererInterface::Software)) {
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
    node->setRect(mapRectFromScene(tileTarget(rect, it->pixels, window()->effectiveDevicePixelRatio())));
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

void CanvasItem::markDirty(const QList<QRectF> &region) {
  invalidateRegion(region);
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
