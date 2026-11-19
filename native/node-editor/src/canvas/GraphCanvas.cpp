#include "canvas/GraphCanvas.h"

#include "canvas/ConnectionItem.h"
#include "canvas/NodeItem.h"
#include "graph/WorkflowGraphModel.h"
#include "ui/CanvasSurface.h"
#include <QCursor>
#include <QGuiApplication>
#include <QKeyEvent>
#include <QPainter>
#include <QQuickWindow>
#include <QSignalBlocker>
#include <QSGRendererInterface>
#include <QSGRenderNode>
#include <QStyleHints>
#include <algorithm>
#include <cmath>

namespace nodetool::canvas {
using namespace QtNodes;
namespace {
// A zoom gesture scales textures; they are painted again after this pause.
constexpr int kSettleMs = 100;

// UI thread only. The selection of the Quick scene, kept on its items. The
// canvas owns it and destroys it before the scene.
class SceneSelection final : public CanvasSelection {
public:
  explicit SceneSelection(CanvasScene &scene) : scene_(scene) {
    connect(&scene_, &CanvasScene::selectionChanged, this, &CanvasSelection::selectionChanged);
  }
  QList<NodeId> nodes() const override { return scene_.selectedNodes(); }
  QList<ConnectionId> edges() const override { return scene_.selectedConnections(); }
  qsizetype count() const override { return scene_.selectionCount(); }
  bool contains(NodeId id) const override {
    const auto *node = scene_.nodeItem(id);
    return node && node->isSelected();
  }
  void clear() override { scene_.clearSelection(); }
  void setNode(NodeId id, bool selected) override {
    if (auto *node = scene_.nodeItem(id)) { node->setSelected(selected); }
  }
  void selectNodes(const QList<NodeId> &ids, bool replace) override {
    // One notification for the batch, which QtNodesCanvas sends by blocking
    // the scene. A blocked batch on the Quick scene sends none at all.
    {
      const QSignalBlocker blocker(&scene_.selectionGate());
      if (replace) { clear(); }
      for (const auto id : ids) { setNode(id, true); }
    }
    emit scene_.selectionChanged();
  }

private:
  CanvasScene &scene_;
};

// Render thread only. The scene graph owns this node and its frame of
// implicitly shared QImages. Sync copies the handles while the GUI is blocked.
class SoftwareCanvasNode final : public QSGRenderNode {
public:
  explicit SoftwareCanvasNode(QQuickWindow &window) : window_(window) {}
  struct Image {
    QRectF rect;
    QImage pixels;
    qreal opacity;
    bool unscaled;
    bool operator==(const Image &other) const {
      return pixels.cacheKey() == other.pixels.cacheKey() && rect == other.rect && opacity == other.opacity && unscaled == other.unscaled;
    }
  };
  void sync(QRectF bounds) {
    const bool moved = bounds_ != bounds;
    const bool changed = current_ != next;
    if (changed) { current_.swap(next); }
    next.clear();
    if (moved) { bounds_ = bounds; }
    if (moved || changed) { markDirty(DirtyGeometry | DirtyMaterial); }
  }
  QRectF rect() const override { return bounds_; }
  RenderingFlags flags() const override { return BoundedRectRendering; }
  void render(const RenderState *state) override {
    auto *painter = static_cast<QPainter *>(
        window_.rendererInterface()->getResource(&window_, QSGRendererInterface::PainterResource));
    if (!painter) { return; }
    painter->save();
    if (const auto *clip = state->clipRegion()) { painter->setClipRegion(*clip, Qt::ReplaceClip); }
    painter->setTransform(matrix()->toTransform());
    painter->setClipRect(bounds_, Qt::IntersectClip);
    painter->setRenderHint(QPainter::SmoothPixmapTransform);
    for (const auto &image : current_) {
      painter->setOpacity(inheritedOpacity() * image.opacity);
      if (image.unscaled) {
        painter->drawImage(image.rect.topLeft(), image.pixels);
      } else {
        painter->drawImage(image.rect, image.pixels);
      }
    }
    painter->restore();
  }
  QList<Image> next;

private:
  QQuickWindow &window_;
  QRectF bounds_;
  QList<Image> current_;
};

bool zoomedOut(double zoom) { return zoom <= zoomedOutThreshold; }
} // namespace

GraphCanvas::GraphCanvas(WorkflowGraphModel &model, QQuickItem *parent)
    : model_(model), grid_(viewport_, this), band_(&overlay_),
      scene_(std::make_unique<EditorCanvasScene>(model, content_)), selection_(std::make_unique<SceneSelection>(*scene_)) {
  content_.setParentItem(this);
  overlay_.setParentItem(this);
  setFlag(ItemIsFocusScope, true);
  setFlag(ItemHasContents, true);
  setActiveFocusOnTab(true);
  setAcceptedMouseButtons(Qt::AllButtons);
  setAcceptHoverEvents(true);
  grid_.setZ(-1);
  overlay_.setZ(1);
  content_.setTransformOrigin(TopLeft);
  // The foreground draws after every item, the draft wire included.
  foreground_.setParentItem(&content_);
  foreground_.setZ(2e6);
  settle_.setSingleShot(true);
  settle_.setInterval(kSettleMs);
  connect(&settle_, &QTimer::timeout, this, &GraphCanvas::scheduleRaster);
  connect(scene_.get(), &CanvasScene::rasterRequested, this, &GraphCanvas::invalidateRasterWork);
  connect(scene_.get(), &EditorCanvasScene::foregroundChanged, this, &GraphCanvas::invalidateRasterWork);
  connect(scene_.get(), &EditorCanvasScene::themeChanged, this, [this] {
    grid_.setTheme(scene_->theme());
    for (const auto &[key, part] : foregroundParts_) { part->invalidateImage(); }
  });
  scene_->viewCursor = [this](std::optional<Qt::CursorShape> cursor) {
    interactionCursor_ = cursor;
    updatePointerCursor();
  };
  viewChanged(true);
  setParentItem(parent);
}

GraphCanvas::~GraphCanvas() {
  settle_.stop();
  disconnect(scene_.get(), nullptr, this, nullptr);
  // The selection borrows the scene, and the scene's items have content_ as parent.
  foregroundParts_.clear();
  selection_.reset();
  scene_.reset();
}

double GraphCanvas::rasterScale() const {
  const double dpr = window() ? window()->effectiveDevicePixelRatio() : 1.0;
  const double scale = viewport_.zoom() * dpr;
  return settle_.isActive() ? std::pow(2.0, std::round(std::log2(scale) * 2) / 2) : scale;
}

void GraphCanvas::setView(double zoom, QPointF center) {
  viewport_.setZoom(zoom);
  viewport_.centerOn(center);
  viewChanged(true);
}

void GraphCanvas::scaleBy(double factor, bool underPointer, QPointF pointer) {
  viewport_.scaleAnchored(factor, underPointer, pointer, lastMoveScene_);
  viewChanged(true);
}

QList<CanvasItem *> GraphCanvas::orderedItems(const QRectF &area) const {
  auto items = scene_->itemsIn(area);
  std::sort(items.begin(), items.end(), [](const CanvasItem *a, const CanvasItem *b) {
    const auto left = a->stackKey(), right = b->stackKey();
    if (left.first != right.first) { return left.first < right.first; }
    if (left.second != right.second) { return left.second < right.second; }
    return a->indexKey() < b->indexKey();
  });
  return items;
}

double GraphCanvas::itemOpacity(const CanvasItem &item) const {
  double opacity = 1;
  for (const QQuickItem *step = &item; step && step != &content_; step = step->parentItem()) { opacity *= step->opacity(); }
  return opacity;
}

QSGNode *GraphCanvas::updatePaintNode(QSGNode *old, UpdatePaintNodeData *) {
  auto *view = window();
  if (!view || view->rendererInterface()->graphicsApi() != QSGRendererInterface::Software) {
    std::unique_ptr<QSGNode> previous(old);
    return nullptr;
  }
  // Batch nearby draws at fit zoom, but bound damage to the screen
  // tiles whose inputs changed. Quick children would draw above every card
  // in this composite. Place future card overlays in the overlay layer.
  auto root = std::unique_ptr<QSGNode>(old);
  if (!root) { root = std::make_unique<QSGNode>(); }
  const auto dpr = view->effectiveDevicePixelRatio();
  // The transform and grid already damage the full view during a zoom.
  // One batch avoids drawing scaled images into adjacent viewport tiles.
  const auto side = settle_.isActive() ? std::max({1., width(), height()}) : CanvasImageItem::tileSide / dpr;
  const auto columns = int(std::ceil(width() / side));
  const auto rows = int(std::ceil(height() / side));
  while (root->childCount() < rows * columns) {
    root->appendChildNode(std::make_unique<SoftwareCanvasNode>(*view).release());
  }
  while (root->childCount() > rows * columns) {
    std::unique_ptr<QSGNode> removed(root->lastChild());
    root->removeChildNode(removed.get());
  }
  QList<SoftwareCanvasNode *> blocks;
  blocks.reserve(rows * columns);
  for (auto *child = root->firstChild(); child; child = child->nextSibling()) {
    blocks.append(static_cast<SoftwareCanvasNode *>(child));
  }

  QTransform transform;
  transform.translate(content_.x(), content_.y());
  transform.scale(content_.scale(), content_.scale());
  const QRectF frame(QPointF(), size());
  const auto append = [&](const CanvasImageItem &owner, QPointF position, double opacity) {
    for (const auto &tile : owner.tiles()) {
      if (tile.pixels.isNull()) { continue; }
      const auto rect = transform.mapRect(tile.geometry.localRect().translated(position));
      const auto target = CanvasImageItem::alignedImageRect(rect, dpr);
      const auto clip = target.intersected(frame);
      if (clip.isEmpty()) { continue; }
      const auto unscaled = tile.pixels.devicePixelRatio() == dpr &&
                            qFuzzyCompare(target.size(), tile.pixels.deviceIndependentSize());
      const SoftwareCanvasNode::Image image{target, tile.pixels, opacity, unscaled};
      const auto firstRow = int(clip.top() / side);
      const auto lastRow = std::min(rows, int(std::ceil(clip.bottom() / side)));
      const auto firstColumn = int(clip.left() / side);
      const auto lastColumn = std::min(columns, int(std::ceil(clip.right() / side)));
      for (int y = firstRow; y < lastRow; ++y) {
        for (int x = firstColumn; x < lastColumn; ++x) { blocks[y * columns + x]->next.append(image); }
      }
    }
  };
  for (const auto *item : orderedItems(viewport_.visibleSceneRect())) {
    if (item->isVisible()) { append(*item, item->scenePosition(), itemOpacity(*item)); }
  }
  for (const auto &[key, part] : foregroundParts_) { append(*part, part->position(), 1); }
  for (int y = 0; y < rows; ++y) {
    for (int x = 0; x < columns; ++x) {
      const QRectF bounds(x * side, y * side, side, side);
      blocks[y * columns + x]->sync(bounds.intersected(frame));
    }
  }
  return root.release();
}

void GraphCanvas::renderScene(QPainter &painter, const QRectF &area, double zoom) const {
  painter.save();
  scene_->paintBackground(painter, area, zoom);
  for (const auto *item : orderedItems(area)) {
    painter.save();
    painter.setOpacity(itemOpacity(*item));
    painter.translate(item->scenePosition());
    item->paintRaster(painter, zoom);
    painter.restore();
  }
  scene_->paintForeground(painter, area, zoom);
  painter.restore();
}

void GraphCanvas::centerOn(QPointF scenePoint) {
  viewport_.centerOn(scenePoint);
  viewChanged(false);
}

void GraphCanvas::setScroll(int horizontal, int vertical) {
  const auto before = viewport_.scroll();
  viewport_.setScroll(horizontal, vertical);
  if (viewport_.scroll() != before) { viewChanged(false); }
}

void GraphCanvas::ensureVisible(const QRectF &sceneRect, int margin) {
  viewport_.ensureVisible(sceneRect, margin, margin);
  viewChanged(false);
}

void GraphCanvas::setTheme(const CanvasTheme &theme) { scene_->setTheme(theme); }

void GraphCanvas::setHandDrag(bool handDrag) {
  if (handDrag_ == handDrag) { return; }
  handDrag_ = handDrag;
  scene_->setHandDrag(handDrag);
  updatePointerCursor();
}

void GraphCanvas::updatePointerCursor() {
  const auto shape = [&] {
    if (interactionCursor_) { return *interactionCursor_; }
    if (handScrolling_) { return Qt::ClosedHandCursor; }
    if (const auto *grabber = scene_->mouseGrabber()) {
      return grabber->pointerCursor().value_or(Qt::ArrowCursor);
    }
    if (cursorPoint_) {
      for (const auto *item : scene_->itemsAt(*cursorPoint_)) {
        if (const auto cursor = item->pointerCursor()) { return *cursor; }
      }
    }
    return handDrag_ ? Qt::OpenHandCursor : Qt::ArrowCursor;
  }();
  if (pointerCursor_ == shape) { return; }
  pointerCursor_ = shape;
  setCursor(shape);
  emit pointerCursorChanged(QCursor(shape));
}

void GraphCanvas::viewChanged(bool zoomed) {
  content_.setScale(viewport_.zoom());
  const auto dpr = window() ? window()->effectiveDevicePixelRatio() : 1.0;
  const auto translation = -QPointF(viewport_.scroll()) * dpr;
  const auto snapped = QPointF(translation.toPoint());
  content_.setPosition(snapped / dpr);
  // Paint the fractional device phase used by the widget painter. The
  // composite itself places the resulting pixels on the snapped grid.
  // Integer scrolls at fractional DPR reuse the raster phase until zoom
  // changes. The snapped translation keeps every retained pixel aligned.
  if (zoomed) { devicePhase_ = translation - snapped; }
  scene_->setZoom(viewport_.zoom());
  grid_.sync();
  update();
  if (zoomed) { settle_.start(); }
  const auto visible = viewport_.visibleSceneRect();
  // A rejected prefetch needs another chance when it enters the view.
  // A tile already visible when rejected cannot free room on every pan step.
  const auto newlyVisible = [&](const QRectF &rect) { return rect.intersects(visible) && !rect.intersects(plannedVisible_); };
  const auto waiting = rasterJobs_.cbegin() + nextRasterJob_;
  const bool pendingVisible = std::any_of(waiting, rasterJobs_.cend(), [&](const RasterJob &job) {
    return job.priority == 3 && newlyVisible(job.tile.sceneRect);
  });
  if (pendingVisible || std::ranges::any_of(deferredTiles_, newlyVisible) ||
      (visible != plannedVisible_ && (!remainingSwapJobs_.isEmpty() || cachedRasterBytes_ > rasterCacheBudget_))) {
    invalidateRasterWork();
  }
  if (!viewportCovered(visible)) { scheduleRaster(); }
  if (window() && window()->rendererInterface()->graphicsApi() != QSGRendererInterface::Software) {
    // The image nodes round their edges in viewport coordinates. A change
    // to the ancestor transform invalidates those positions on RHI.
    for (auto *item : scene_->itemsIn(visible)) { item->update(); }
    for (const auto &[key, item] : foregroundParts_) { item->update(); }
  }
  emit viewportMoved();
}

void GraphCanvas::geometryChange(const QRectF &newGeometry, const QRectF &oldGeometry) {
  QQuickItem::geometryChange(newGeometry, oldGeometry);
  if (newGeometry.size() == oldGeometry.size()) { return; }
  rasterCoverage_ = {};
  viewport_.resize(newGeometry.size().toSize(), viewShown_);
  grid_.setSize(newGeometry.size());
  overlay_.setSize(newGeometry.size());
  band_.setSize(newGeometry.size());
  viewChanged(false);
}

void GraphCanvas::scheduleRaster() {
  if (rasterQueued_) { return; }
  rasterQueued_ = true;
  polish();
}

void GraphCanvas::updatePolish() {
  rasterQueued_ = false;
  rasterPass(false);
}

void GraphCanvas::flushRaster() {
  settle_.stop();
  rasterPass(true);
}

bool GraphCanvas::viewportCovered(const QRectF &visible) const {
  return indexedRevision_ == scene_->indexRevision() && rasterCoverage_.contains(visible) &&
         (settle_.isActive() || (rasterCoverage_.width() <= 2 * visible.width() &&
                                 rasterCoverage_.height() <= 2 * visible.height()));
}

void GraphCanvas::updateRasterCoverage(const QRectF &visible) {
  indexedRevision_ = scene_->indexRevision();
  const auto w = visible.width(), h = visible.height();
  rasterCoverage_ = visible.adjusted(-w / 3, -h / 3, w / 3, h / 3);
  prefetchArea_ = visible.adjusted(-w / 2, -h / 2, w / 2, h / 2);
  retentionArea_ = visible.adjusted(-w * 1.5, -h * 1.5, w * 1.5, h * 1.5);
  for (auto it = near_.begin(); it != near_.end();) {
    auto *item = scene_->item(*it);
    if (item && item->effectivelyShown() && scene_->itemBounds(*it).intersects(retentionArea_)) {
      ++it;
      continue;
    }
    if (item) {
      item->clearImage();
      item->setVisible(false);
    }
    it = near_.erase(it);
  }
  for (auto *item : scene_->itemsIn(prefetchArea_)) {
    if (!near_.contains(item->indexKey())) {
      near_.insert(item->indexKey());
      item->setVisible(true);
    }
  }
  if (auto *draft = scene_->draftConnection()) {
    near_.insert(draft->indexKey());
    draft->setVisible(true);
  }
}

void GraphCanvas::invalidateRasterWork() {
  rasterWorkDirty_ = true;
  scheduleRaster();
}

void GraphCanvas::syncForeground(const QRectF &area, double zoom) {
  auto current = foregroundParts_.begin();
  ForegroundItem *previous = nullptr;
  for (auto &part : scene_->foregroundParts(area, zoom)) {
    while (current != foregroundParts_.end() && current->first < part.key) {
      current = foregroundParts_.erase(current);
    }
    if (current == foregroundParts_.end() || current->first != part.key) {
      const auto added = foregroundParts_.emplace_hint(current, part.key, std::make_unique<ForegroundItem>(*scene_, foreground_));
      if (previous) {
        added->second->stackAfter(previous);
      } else if (current != foregroundParts_.end()) {
        added->second->stackBefore(current->second.get());
      }
      current = added;
    }
    current->second->setPart(std::move(part));
    previous = current->second.get();
    ++current;
  }
  foregroundParts_.erase(current, foregroundParts_.end());
}

void GraphCanvas::rebuildRasterWork(const QRectF &visible, double scale, double zoom, bool settled) {
  rasterWorkDirty_ = false;
  rasterWorkSettled_ = settled;
  rasterWorkScale_ = scale;
  plannedVisible_ = visible;
  // Keep the age of work deferred across edits, using guarded references to
  // avoid retaining deleted cards or foreground labels in the queue.
  QHash<std::pair<CanvasImageItem *, QPoint>, qsizetype> age;
  age.reserve(rasterJobs_.size() - nextRasterJob_);
  for (auto i = nextRasterJob_; i < rasterJobs_.size(); ++i) {
    const auto &tile = rasterJobs_[i].tile;
    if (tile.owner) { age.insert({tile.owner.data(), tile.key}, i); }
  }
  const auto newJob = rasterJobs_.size();
  nextRasterJob_ = 0;
  rasterJobs_.clear();
  deferredTiles_.clear();
  remainingSwapJobs_.clear();
  QList<TileRef> offscreenTiles;
  cachedRasterBytes_ = 0;
  offscreenRasterBytes_ = 0;
  syncForeground(prefetchArea_, zoom);

  using Image = CanvasImageItem;
  constexpr auto side = Image::tileSide;
  const auto enqueue = [&](Image &owner, QPointF origin, const QRectF &bounds, RasterJob::Kind kind, bool draft,
                           bool group, bool clip) {
    const auto &tiles = owner.tiles();
    // Reuse existing device rasters during gestures, including dirty tiles
    // that need a repaint in the same bucket. Settling switches to exact scale.
    const bool reuseGrid = !settled && !tiles.isEmpty();
    const auto paintScale = reuseGrid ? tiles.cbegin()->geometry.scale : scale;
    const auto phase = reuseGrid ? tiles.cbegin()->geometry.viewportPhase : devicePhase_;
    const auto full = Image::rasterGeometry(bounds, origin, paintScale, phase);
    const bool staging = !tiles.isEmpty() && tiles.cbegin()->geometry.scale != paintScale;
    if (!owner.stagedTiles().isEmpty() &&
        (!staging || !owner.stagedTiles().cbegin()->geometry.sameGrid(full))) {
      owner.discardStagedTiles();
    }
    const auto &target = staging ? owner.stagedTiles() : tiles;
    qsizetype swapJobs = 0;
    const bool tiled = full.device.width() > side || full.device.height() > side;
    const auto toScene = [&](const Image::RasterGeometry &geometry) { return geometry.localRect().translated(origin); };
    const auto priority = [&](const QRectF &rect) { return draft ? 0 : rect.intersects(visible) ? 1 : 3; };
    const auto append = [&](QPoint key, const Image::RasterGeometry &geometry) {
      const auto rect = toScene(geometry);
      auto order = priority(rect);
      const auto existing = target.constFind(key);
      if (existing != target.cend()) {
        const bool sameZoom = !settled || (zoomedOut(existing->zoom) == zoomedOut(zoom) && (!group || existing->zoom == zoom));
        if (existing->revision == owner.rasterRevision() && existing->geometry == geometry && sameZoom) { return; }
        if (order == 1 && !existing->pixels.isNull()) { order = 2; }
      }
      rasterJobs_.append({{&owner, key, rect, staging}, geometry, kind, order, age.value({&owner, key}, newJob)});
      if (staging) { ++swapJobs; }
    };
    const auto sceneBounds = bounds.translated(origin);
    if (sceneBounds.intersects(prefetchArea_) || draft) {
      if (!tiled) {
        if (!full.device.isEmpty()) { append({}, full); }
      } else {
        const auto covered = Image::rasterGeometry(bounds.intersected(prefetchArea_.translated(-origin)), origin, paintScale, phase);
        if (!covered.device.isEmpty()) {
          const auto tileStart = [=](int value) { return int(std::floor(double(value) / side)) * side; };
          for (int y = tileStart(covered.device.top()); y <= covered.device.bottom(); y += side) {
            for (int x = tileStart(covered.device.left()); x <= covered.device.right(); x += side) {
              append(QPoint(x, y), {full.device.intersected(QRect(x, y, side, side)), full.phase, full.scale, full.viewportPhase});
            }
          }
        }
      }
    }

    if (swapJobs) {
      remainingSwapJobs_.insert(reinterpret_cast<quintptr>(&owner), swapJobs);
    } else if (staging && !target.isEmpty()) {
      owner.publishStagedTiles();
    }
    for (auto it = owner.stagedTiles().cbegin(); it != owner.stagedTiles().cend(); ++it) {
      const auto rect = toScene(it->geometry);
      cachedRasterBytes_ += it->bytes();
      if (!rect.intersects(visible) && !draft) {
        offscreenTiles.append({&owner, it.key(), rect, true});
        offscreenRasterBytes_ += it->bytes();
      }
    }

    QList<QPoint> discarded;
    for (auto it = tiles.cbegin(); it != tiles.cend(); ++it) {
      const auto rect = toScene(it->geometry);
      // Trim tiles from both ends of a long wire when sweeping along it.
      if ((tiled || clip) && !rect.intersects(retentionArea_)) {
        discarded.append(it.key());
        continue;
      }
      // A changing path can shorten across a tile boundary. Drop the old
      // cells immediately so they cannot show pixels outside the new bounds.
      if (it->geometry.scale == paintScale && (!rect.intersects(sceneBounds) || (!tiled && it.key() != QPoint()))) {
        discarded.append(it.key());
        continue;
      }
      cachedRasterBytes_ += it->bytes();
      if (!rect.intersects(visible) && !draft) {
        offscreenTiles.append({&owner, it.key(), rect});
        offscreenRasterBytes_ += it->bytes();
      }
    }
    for (const auto key : discarded) { owner.removeTile(key); }
  };
  const auto *draft = scene_->draftConnection();
  for (const auto key : std::as_const(near_)) {
    auto *item = scene_->item(key);
    if (!item) { continue; }
    const auto *node = item->kind() == CanvasItem::Kind::Node ? static_cast<NodeItem *>(item) : nullptr;
    const bool wire = item->kind() == CanvasItem::Kind::Connection;
    enqueue(*item, item->scenePosition(), item->rasterBounds(), node ? RasterJob::Card : wire ? RasterJob::Wire : RasterJob::Other,
            item == draft, node && model_.isGroup(node->nodeId()), wire || item->kind() == CanvasItem::Kind::Lineage);
  }
  for (const auto &[key, item] : foregroundParts_) {
    enqueue(*item, item->position(), item->part().bounds, RasterJob::Foreground, false, true, false);
  }

  if (offscreenRasterBytes_ > rasterCacheBudget_) {
    const auto distance = [&visible](const TileRef &tile) {
      const auto &rect = tile.sceneRect;
      const auto dx = std::max({0., visible.left() - rect.right(), rect.left() - visible.right()});
      const auto dy = std::max({0., visible.top() - rect.bottom(), rect.top() - visible.bottom()});
      return dx * dx + dy * dy;
    };
    std::ranges::sort(offscreenTiles, std::greater{}, distance);
    for (const auto &tile : offscreenTiles) {
      if (offscreenRasterBytes_ <= rasterCacheBudget_) { break; }
      const auto &grid = tile.staged ? tile.owner->stagedTiles() : tile.owner->tiles();
      const auto bytes = grid.constFind(tile.key)->bytes();
      offscreenRasterBytes_ -= bytes;
      cachedRasterBytes_ -= bytes;
      if (tile.staged) {
        tile.owner->removeStagedTile(tile.key);
      } else {
        tile.owner->removeTile(tile.key);
      }
      deferredTiles_.append(tile.sceneRect);
    }
  }

  std::stable_sort(rasterJobs_.begin(), rasterJobs_.end(), [](const RasterJob &left, const RasterJob &right) {
    return std::tie(left.priority, left.age) < std::tie(right.priority, right.age);
  });
}

void GraphCanvas::rasterPass(bool flush) {
  QElapsedTimer clock;
  clock.start();
  const auto zoom = viewport_.zoom();
  const auto scale = rasterScale();
  const bool settled = !settle_.isActive();
  const double dpr = window() ? window()->effectiveDevicePixelRatio() : 1.0;
  const auto visible = viewport_.visibleSceneRect();
  const bool refresh = !viewportCovered(visible) || rasterWorkSettled_ != settled;
  if (refresh) { updateRasterCoverage(visible); }
  const bool planned = refresh || rasterWorkDirty_ || rasterWorkScale_ != scale;
  if (planned) { rebuildRasterWork(visible, scale, zoom, settled); }
  // Large culls can use the raster slot. Start tile painting in the next
  // pass, but allow progress if another edit immediately rebuilds the queue.
  plannedWithoutPainting_ = planned && !flush && !plannedWithoutPainting_ &&
                            rasterTimeBudgetNs_ > 0 && clock.nsecsElapsed() >= rasterTimeBudgetNs_;
  qint64 longest = 0;
  while (!plannedWithoutPainting_ && nextRasterJob_ < rasterJobs_.size() &&
         (flush || !longest || clock.nsecsElapsed() + longest < rasterTimeBudgetNs_)) {
    const auto &job = rasterJobs_[nextRasterJob_++];
    auto *owner = job.tile.owner.data();
    if (!owner) { continue; }
    const auto before = clock.nsecsElapsed();
    const auto &target = job.tile.staged ? owner->stagedTiles() : owner->tiles();
    const auto existing = target.constFind(job.tile.key);
    const auto oldBytes = existing == target.cend() ? 0 : existing->bytes();
    const bool visibleNow = job.priority == 0 || job.tile.sceneRect.intersects(visible);
    const auto estimatedBytes = job.geometry.bytes() + sizeof(CanvasImageItem::Tile) - oldBytes;
    if (!visibleNow && offscreenRasterBytes_ + estimatedBytes > rasterCacheBudget_) {
      deferredTiles_.append(job.tile.sceneRect);
    } else {
      if (job.kind == RasterJob::Card) { ++stats_.cards; }
      if (job.kind == RasterJob::Wire) { ++stats_.wires; }
      if (job.kind == RasterJob::Foreground) { ++stats_.foreground; }
      auto image = CanvasImageItem::rasterize(job.geometry, dpr, [&](QPainter &painter) { owner->paintRaster(painter, zoom); });
      if (!image.isNull()) {
        if (job.kind != RasterJob::Card) {
          // Keep the validity of an empty wire or foreground tile without its pixels.
          const auto *pixels = reinterpret_cast<const QRgb *>(image.constBits());
          if (std::all_of(pixels, pixels + image.width() * image.height(), [](QRgb pixel) { return pixel == 0; })) { image = {}; }
        }
        CanvasImageItem::Tile tile{job.geometry, std::move(image), owner->rasterRevision(), zoom};
        const auto additional = tile.bytes() - oldBytes;
        cachedRasterBytes_ += additional;
        if (!visibleNow) { offscreenRasterBytes_ += additional; }
        stats_.peakBytes = std::max(stats_.peakBytes, cachedRasterBytes_);
        if (job.tile.staged) {
          owner->stageTile(job.tile.key, std::move(tile));
        } else {
          owner->setTile(job.tile.key, std::move(tile));
        }
      }
    }
    if (job.tile.staged) {
      auto remaining = remainingSwapJobs_.find(reinterpret_cast<quintptr>(owner));
      if (--remaining.value() == 0) {
        remainingSwapJobs_.erase(remaining);
        if (!owner->stagedTiles().isEmpty()) {
          // Publishing only after the last job preserves coverage throughout
          // the transition between two different tile grids.
          const auto origin = job.tile.sceneRect.topLeft() - job.geometry.localRect().topLeft();
          for (const auto &tile : owner->tiles()) {
            cachedRasterBytes_ -= tile.bytes();
            if (!tile.geometry.localRect().translated(origin).intersects(visible) && job.priority != 0) {
              offscreenRasterBytes_ -= tile.bytes();
            }
          }
          owner->publishStagedTiles();
        }
      }
    }
    longest = std::max(longest, clock.nsecsElapsed() - before);
  }
  const auto elapsed = clock.nsecsElapsed();
  stats_.nanoseconds += elapsed;
  stats_.slowestPass = std::max(stats_.slowestPass, elapsed);
  ++stats_.passes;
  update();
  if (nextRasterJob_ < rasterJobs_.size()) { QTimer::singleShot(0, this, &GraphCanvas::scheduleRaster); }
}

void GraphCanvas::itemChange(ItemChange change, const ItemChangeData &value) {
  QQuickItem::itemChange(change, value);
  if (change == ItemSceneChange && value.window) {
    // A queued polish belonged to the previous window.
    rasterQueued_ = false;
    invalidateRasterWork();
  }
  if (change == ItemDevicePixelRatioHasChanged) {
    invalidateRasterWork();
    viewChanged(true);
  }
}

CanvasPointerEvent GraphCanvas::pointerEvent(QPointF position, QPointF global, Qt::MouseButton button,
                                             Qt::MouseButtons buttons, Qt::KeyboardModifiers modifiers) const {
  return {viewport_.mapToScene(position.toPoint()), global.toPoint(), button, buttons, modifiers,
          std::clamp(viewport_.zoom(), 0.08, 8.0)};
}

void GraphCanvas::mousePressEvent(QMouseEvent *event) {
  event->accept();
  buttonsDown_ = event->buttons();
  if (skipPress_) { return; }
  if (!hasActiveFocus()) { forceActiveFocus(Qt::MouseFocusReason); }
  const auto position = event->position().toPoint();
  pressPosition_ = position;
  pressScene_ = viewport_.mapToScene(position);
  lastMoveScene_ = pressScene_;
  lastPosition_ = position;
  CanvasMouseEvent mouse{pressScene_, pressScene_, pressScene_, event->globalPosition().toPoint(), event->button(),
                         event->buttons(), event->modifiers(), false};
  pressAccepted_ = scene_->pointer(PointerAction::Press,
                                   pointerEvent(event->position(), event->globalPosition(), event->button(),
                                                event->buttons(), event->modifiers()),
                                   mouse);
  if (pressAccepted_) { return; }
  if (!handDrag_) {
    // QGraphicsView::RubberBandDrag: a press no item took starts a band.
    rubberBanding_ = true;
    bandRect_ = {};
    if (event->modifiers().testFlag(Qt::ControlModifier)) {
      bandOperation_ = Qt::AddToSelection;
    } else {
      bandOperation_ = Qt::ReplaceSelection;
      scene_->clearSelection();
    }
  } else if (event->button() == Qt::LeftButton) {
    // ScrollHandDrag: a left press on the pane scrolls the view.
    handScrolling_ = true;
    handMotions_ = 0;
    updatePointerCursor();
  }
}

bool GraphCanvas::moveGrabbedCard(QMouseEvent &event) {
  const auto *grabber = scene_->mouseGrabber();
  if (!grabber || grabber->kind() != CanvasItem::Kind::Node || event.buttons() != Qt::LeftButton ||
      event.source() != Qt::MouseEventNotSynthesized || !window() || window()->mouseGrabberItem() != this) {
    return false;
  }
  // The widget and the Quick window have already agreed on the grab.
  // A plain card move can go straight to the existing canvas dispatcher.
  mouseMoveEvent(&event);
  return true;
}

void GraphCanvas::mouseMoveEvent(QMouseEvent *event) {
  event->accept();
  pointerMove(event->position(), event->globalPosition(), event->buttons(), event->modifiers());
}

void GraphCanvas::hoverMoveEvent(QHoverEvent *event) {
  // Qt Quick sends synthetic hover moves at the last cursor position when
  // items move under it, also while a button is held. A view gets no moves
  // without buttons while the mouse is grabbed, so those are dropped.
  if (buttonsDown_ != Qt::NoButton) { return; }
  pointerMove(event->position(), mapToGlobal(event->position()), Qt::NoButton, event->modifiers());
}

void GraphCanvas::hoverLeaveEvent(QHoverEvent *) {
  if (buttonsDown_) { return; }
  cursorPoint_.reset();
  scene_->clearHover();
  scene_->interaction().leavePointer();
  updatePointerCursor();
}

void GraphCanvas::pointerMove(QPointF position, QPointF global, Qt::MouseButtons buttons, Qt::KeyboardModifiers modifiers) {
  const auto point = position.toPoint();
  if (handScrolling_) {
    const auto delta = point - lastPosition_;
    setScroll(viewport_.scroll().x() - delta.x(), viewport_.scroll().y() - delta.y());
    ++handMotions_;
  }
  updateRubberBand(point, buttons);
  lastPosition_ = point;
  if (handScrolling_) { return; }
  const auto scenePoint = viewport_.mapToScene(point);
  CanvasMouseEvent mouse{scenePoint, lastMoveScene_, pressScene_, global.toPoint(), Qt::NoButton, buttons, modifiers, false};
  lastMoveScene_ = scenePoint;
  cursorPoint_ = scenePoint;
  scene_->pointer(PointerAction::Move, {scenePoint, mouse.screenPos, Qt::NoButton, buttons, modifiers,
                                       std::clamp(viewport_.zoom(), 0.08, 8.0)}, mouse);
  updatePointerCursor();
}

void GraphCanvas::updateRubberBand(QPoint position, Qt::MouseButtons buttons) {
  if (handDrag_ || !rubberBanding_) { return; }
  // Check for enough drag distance.
  if ((pressPosition_ - position).manhattanLength() < QGuiApplication::styleHints()->startDragDistance()) { return; }
  // Stop rubber banding if the user has let go of all buttons, even without the release events.
  if (!buttons) {
    rubberBanding_ = false;
    endRubberBand();
    return;
  }
  const auto origin = viewport_.mapFromScene(pressScene_);
  const QRect rect(std::min(origin.x(), position.x()), std::min(origin.y(), position.y()),
                   std::abs(origin.x() - position.x()) + 1, std::abs(origin.y() - position.y()) + 1);
  const bool started = bandRect_.isNull();
  bandRect_ = rect;
  band_.setBand(rect);
  if (started) { emit rubberBandChanged(true); }
  // Set the new selection area, as QGraphicsView maps the band to the scene.
  const auto sceneRect = QRectF(viewport_.mapToScene(rect.topLeft()), viewport_.mapToScene(rect.bottomRight() + QPoint(1, 1)));
  scene_->setRubberBandArea(sceneRect);
  QPainterPath area;
  area.addRect(sceneRect);
  scene_->setSelectionArea(area, bandOperation_);
}

void GraphCanvas::endRubberBand() {
  if (bandRect_.isNull()) { return; }
  bandRect_ = {};
  band_.setBand({});
  scene_->setRubberBandArea(std::nullopt);
  emit rubberBandChanged(false);
}

void GraphCanvas::mouseReleaseEvent(QMouseEvent *event) {
  event->accept();
  buttonsDown_ = event->buttons();
  skipPress_ = false;
  if (!handDrag_ && !event->buttons()) {
    if (rubberBanding_) {
      rubberBanding_ = false;
      bandOperation_ = Qt::ReplaceSelection;
      endRubberBand();
    }
  } else if (handDrag_ && event->button() == Qt::LeftButton) {
    handScrolling_ = false;
    // Very little motion and no item took the press: a click on the pane resets the selection.
    if (!pressAccepted_ && handMotions_ <= 6) { scene_->clearSelection(); }
  }
  const auto position = event->position().toPoint();
  const auto scenePoint = viewport_.mapToScene(position);
  CanvasMouseEvent mouse{scenePoint, lastMoveScene_, pressScene_, event->globalPosition().toPoint(), event->button(),
                         event->buttons(), event->modifiers(), false};
  cursorPoint_ = scenePoint;
  scene_->pointer(PointerAction::Release,
                  pointerEvent(event->position(), event->globalPosition(), event->button(), event->buttons(),
                               event->modifiers()),
                  mouse);
  if (!buttonsDown_) {
    if (contains(event->position())) {
      scene_->deliverHover(mouse);
    } else {
      hoverLeaveEvent(nullptr);
    }
  }
  updatePointerCursor();
}

void GraphCanvas::mouseDoubleClickEvent(QMouseEvent *event) {
  event->accept();
  buttonsDown_ = event->buttons();
  skipPress_ = false;
  const auto position = event->position().toPoint();
  pressPosition_ = position;
  pressScene_ = viewport_.mapToScene(position);
  lastMoveScene_ = pressScene_;
  lastPosition_ = position;
  CanvasMouseEvent mouse{pressScene_, pressScene_, pressScene_, event->globalPosition().toPoint(), event->button(),
                         event->buttons(), event->modifiers(), false};
  pressAccepted_ = scene_->pointer(PointerAction::DoubleClick,
                                   pointerEvent(event->position(), event->globalPosition(), event->button(),
                                                event->buttons(), event->modifiers()),
                                   mouse);
}

void GraphCanvas::setViewShown(bool shown) {
  viewShown_ = shown;
  if (shown) {
    viewport_.show();
    viewChanged(false);
  } else {
    cancelPointerGrab();
  }
}

void GraphCanvas::mouseUngrabEvent() { cancelPointerGrab(); }

void GraphCanvas::cancelPointerGrab() {
  if (!buttonsDown_ && !scene_->interaction().viewportPanning()) { return; }
  buttonsDown_ = Qt::NoButton;
  skipPress_ = pressAccepted_ = handScrolling_ = rubberBanding_ = false;
  bandOperation_ = Qt::ReplaceSelection;
  cursorPoint_.reset();
  scene_->interaction().cancelPointerGesture();
  scene_->cancelMouseGrab();
  endRubberBand();
  updatePointerCursor();
}

void GraphCanvas::contextMenu(QPoint position, QPoint screenPosition, Qt::KeyboardModifiers modifiers) {
  scene_->contextMenu({.scenePosition = viewport_.mapToScene(position), .screenPosition = screenPosition, .modifiers = modifiers});
}

void GraphCanvas::keyPressEvent(QKeyEvent *event) {
  if (scene_->keyPress(*event)) {
    event->accept();
    return;
  }
  // QAbstractScrollArea scrolls by a twentieth of the viewport, or a page.
  const auto size = viewport_.size();
  const auto scroll = viewport_.scroll();
  if (event->modifiers() == Qt::NoModifier || event->modifiers() == Qt::KeypadModifier) {
    switch (event->key()) {
    case Qt::Key_Left: setScroll(scroll.x() - size.width() / 20, scroll.y()); event->accept(); return;
    case Qt::Key_Right: setScroll(scroll.x() + size.width() / 20, scroll.y()); event->accept(); return;
    case Qt::Key_Up: setScroll(scroll.x(), scroll.y() - size.height() / 20); event->accept(); return;
    case Qt::Key_Down: setScroll(scroll.x(), scroll.y() + size.height() / 20); event->accept(); return;
    case Qt::Key_PageUp: setScroll(scroll.x(), scroll.y() - size.height()); event->accept(); return;
    case Qt::Key_PageDown: setScroll(scroll.x(), scroll.y() + size.height()); event->accept(); return;
    default: break;
    }
  }
  event->ignore();
}

void GraphCanvas::keyReleaseEvent(QKeyEvent *event) {
  scene_->keyRelease(*event);
  event->ignore();
}

void GraphCanvas::focusOutEvent(QFocusEvent *event) {
  if (!overlayHasFocus_ || !overlayHasFocus_()) { cancelPointerGrab(); }
  scene_->focusOut();
  QQuickItem::focusOutEvent(event);
}

void GraphCanvas::wheelEvent(QWheelEvent *event) { event->ignore(); }

} // namespace nodetool::canvas
