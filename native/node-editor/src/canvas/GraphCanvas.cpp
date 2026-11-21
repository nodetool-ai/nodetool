#include "canvas/CardOverlay.h"
#include "canvas/GraphCanvas.h"

#include "canvas/ConnectionItem.h"
#include "canvas/LineageItem.h"
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
// Tiles that would leave a visible area blank may use 3 ms of the 4 ms
// settle budget, which leaves room for one tile slower than predicted.
// Other work stops at the 1.4 ms frame budget. The urgent budget keeps this
// ratio to the frame budget, which tests scale for sanitizer builds.
constexpr qint64 kUrgentRasterNs = 3'000'000;
constexpr qint64 kFrameRasterNs = 1'400'000;
// The fixed cost of a raster job: the painter, the card's paint state and the tile.
constexpr qint64 kJobOverheadNs = 30'000;
// Passes this close together come from consecutive frames.
constexpr qint64 kConsecutiveMs = 50;
// A staged tile counts as shown when the published grid covers this share of it.
constexpr double kCoveredShare = .99;

using RasterGeometry = CanvasImageItem::RasterGeometry;
constexpr int kTileSide = CanvasImageItem::tileSide;

bool usesCells(const RasterGeometry &geometry) {
  return geometry.device.width() > kTileSide || geometry.device.height() > kTileSide;
}

RasterGeometry rasterTile(RasterGeometry full, QPoint key) {
  if (full.tiled) { full.device &= QRect(key, QSize(kTileSide, kTileSide)); }
  return full;
}

// Visit the full geometry of each tile that touches the requested item area.
template <typename Visit>
bool visitRasterTiles(const RasterGeometry &full, const QRectF &area, Visit visit) {
  const auto rect = full.localRect();
  const auto covered = rect.intersected(area);
  if (covered.isEmpty()) { return true; }
  if (!full.tiled) { return visit(QPoint(), full); }

  const auto pixels = QRectF(QPointF(full.device.topLeft()) + (covered.topLeft() - rect.topLeft()) * full.scale,
                             covered.size() * full.scale).toAlignedRect().intersected(full.device);
  const auto cellStart = [](int pixel) { return int(std::floor(double(pixel) / kTileSide)) * kTileSide; };
  for (int y = cellStart(pixels.top()); y <= pixels.bottom(); y += kTileSide) {
    for (int x = cellStart(pixels.left()); x <= pixels.right(); x += kTileSide) {
      const QPoint key(x, y);
      const auto cell = rasterTile(full, key);
      if (cell.localRect().intersects(area) && !visit(key, cell)) { return false; }
    }
  }
  return true;
}

bool stagedCoverage(const CanvasImageItem &owner, const RasterGeometry &full, QPointF origin,
                    const QRectF &visible, const QRectF &prefetch) {
  const auto &tiles = owner.stagedTiles();
  if (tiles.isEmpty() || full.device.isEmpty()) { return false; }
  const auto rect = full.localRect();
  const auto view = visible.translated(-origin);
  const auto area = rect.intersects(view) ? view : prefetch.translated(-origin);
  return rect.intersects(area) && visitRasterTiles(full, area, [&](QPoint key, const RasterGeometry &geometry) {
    const auto tile = tiles.constFind(key);
    return tile != tiles.cend() && tile->geometry == geometry;
  });
}

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
    // Block per-item signals and publish one selection change for the batch.
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
    const auto transform = matrix()->toTransform();
    painter->setTransform(transform);
    painter->setClipRect(bounds_, Qt::IntersectClip);
    painter->setRenderHint(QPainter::SmoothPixmapTransform);
    // Unscaled tiles are drawn in device pixels. The painter's transform is
    // then a translation, which the raster engine blits even at fractional
    // device pixel ratios.
    const auto dpr = painter->device()->devicePixelRatio();
    const auto device = QTransform::fromScale(1 / dpr, 1 / dpr);
    for (const auto &image : current_) {
      painter->setOpacity(inheritedOpacity() * image.opacity);
      if (image.unscaled) {
        painter->setTransform(device);
        const auto topLeft = transform.map(image.rect.topLeft()) * dpr;
        painter->drawImage(QRectF(QPointF(topLeft.toPoint()), QSizeF(image.pixels.size())), image.pixels,
                           QRectF(image.pixels.rect()));
        painter->setTransform(transform);
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
  connect(&settle_, &QTimer::timeout, this, [this] {
    grid_.setZooming(false);
    if (window() && window()->rendererInterface()->graphicsApi() != QSGRendererInterface::Software) {
      grid_.sync();
      syncRhiItems();
    }
    scheduleRaster();
  });
  still_.setSingleShot(true);
  still_.setInterval(kSettleMs);
  connect(&still_, &QTimer::timeout, this, &GraphCanvas::settleMotion);
  connect(&model_, &AbstractGraphModel::nodePositionUpdated, this, &GraphCanvas::startMotion);
  connect(scene_.get(), &CanvasScene::rasterRequested, this, &GraphCanvas::invalidateRasterWork);
  connect(scene_.get(), &CanvasScene::draftRasterRequested, this, &GraphCanvas::invalidateDraftRaster);
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
  still_.stop();
  disconnect(&model_, nullptr, this, nullptr);
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

void GraphCanvas::setCardOverlayVisible(CardOverlay &overlay, bool visible) {
  if (visible == visibleCardOverlays_.contains(&overlay)) { return; }
  if (visible) { visibleCardOverlays_.insert(&overlay); }
  else { visibleCardOverlays_.remove(&overlay); }
  updateCardOverlayRendering();
}

void GraphCanvas::updateCardOverlayRendering() {
  if (!window() || window()->rendererInterface()->graphicsApi() != QSGRendererInterface::Software ||
      (visibleCardOverlays_.isEmpty() && !individualSoftwareRendering_)) { return; }
  const auto visible = viewport_.visibleSceneRect();
  // The software batch is one paint node. While there is a live card overlay,
  // use the same per-item tiles as RHI so Quick can interleave cards and QML.
  individualSoftwareRendering_ = std::ranges::any_of(visibleCardOverlays_, [&](const CardOverlay *overlay) {
    const auto *card = static_cast<const CanvasItem *>(overlay->parentItem());
    return card && card->sceneBoundingRect().intersects(visible);
  });
  QList<QPointer<CanvasImageItem>> next;
  QSet<CanvasImageItem *> retained;
  const auto include = [&](CanvasImageItem &item) {
    retained.insert(&item);
    next.append(&item);
    item.setIndividualSoftwareRendering(true);
    item.update();
  };
  if (individualSoftwareRendering_) {
    for (auto *item : scene_->itemsIn(visible)) { include(*item); }
    for (const auto &[key, item] : foregroundParts_) { include(*item); }
  }
  for (const auto &item : std::as_const(individualSoftwareItems_)) {
    if (item && !retained.contains(item)) { item->setIndividualSoftwareRendering(false); }
  }
  individualSoftwareItems_ = std::move(next);
  update();
}

QSGNode *GraphCanvas::updatePaintNode(QSGNode *old, UpdatePaintNodeData *) {
  auto *view = window();
  if (!view || individualSoftwareRendering_ || view->rendererInterface()->graphicsApi() != QSGRendererInterface::Software) {
    std::unique_ptr<QSGNode> previous(old);
    return nullptr;
  }
  // Batch nearby draws at fit zoom and bound damage to changed viewport tiles.
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
      const auto target = CanvasImageItem::tileTarget(rect, tile.pixels, dpr);
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
  // Integer scrolls at fractional DPR reuse the raster phase until the view
  // is still. The snapped translation keeps every retained pixel aligned.
  if (zoomed) {
    devicePhase_ = translation - snapped;
    settle_.start();
  } else {
    startMotion();
  }
  scene_->setZoom(viewport_.zoom());
  grid_.setZooming(settle_.isActive());
  grid_.sync();
  update();
  const auto visible = viewport_.visibleSceneRect();
  // A rejected prefetch needs another chance when it enters the view.
  // A tile already visible when rejected cannot free room on every pan step.
  const auto newlyVisible = [&](const QRectF &rect) { return rect.intersects(visible) && !rect.intersects(plannedVisible_); };
  const auto waiting = rasterJobs_.cbegin() + nextRasterJob_;
  const bool pendingVisible = std::any_of(waiting, rasterJobs_.cend(), [&](const RasterJob &job) {
    return newlyVisible(job.tile.sceneRect);
  });
  // A staged grid needs the keys of the new view. Tiles the view leaves
  // count against the offscreen budget, and evictions follow the distance to
  // the new view. Visible tiles never count against the byte budget.
  const auto offscreenBytes = [&] {
    auto bytes = offscreenRasterBytes_;
    for (const auto &[rect, size] : plannedVisibleTiles_) {
      if (!rect.intersects(visible)) { bytes += size; }
    }
    return bytes;
  };
  if (pendingVisible || std::ranges::any_of(deferredTiles_, newlyVisible) ||
      (visible != plannedVisible_ && (!staging_.isEmpty() || offscreenBytes() > rasterCacheBudget_))) {
    invalidateRasterWork();
  }
  if (scene_->draftConnection()) { invalidateDraftRaster(); }
  if (!viewportCovered(visible)) { scheduleRaster(); }
  if (zoomed && window() && window()->rendererInterface()->graphicsApi() != QSGRendererInterface::Software) {
    const double zoom = viewport_.zoom();
    const double scale = zoom * dpr;
    const bool overview = zoomedOut(zoom);
    const bool featherStale =
        !(lastWireFeatherScale_ > 0) || scale >= lastWireFeatherScale_ * 1.5 || scale <= lastWireFeatherScale_ / 1.5;
    if (overview != lastWireZoomedOut_ || featherStale) {
      lastWireZoomedOut_ = overview;
      lastWireFeatherScale_ = scale;
      for (const auto key : std::as_const(near_)) {
        if (auto *item = scene_->item(key); item && item->isVectorPainted()) { item->update(); }
      }
    }
  }
  emit viewportMoved();
  updateCardOverlayRendering();
}

void GraphCanvas::syncRhiItems() {
  if (!window() || window()->rendererInterface()->graphicsApi() == QSGRendererInterface::Software) { return; }
  const double dpr = window()->effectiveDevicePixelRatio();
  lastWireZoomedOut_ = zoomedOut(viewport_.zoom());
  lastWireFeatherScale_ = viewport_.zoom() * dpr;
  for (const auto key : std::as_const(near_)) {
    if (auto *item = scene_->item(key)) { item->update(); }
  }
  for (const auto &[key, item] : foregroundParts_) { item->update(); }
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
  grid_.setZooming(false);
  if (window() && window()->rendererInterface()->graphicsApi() != QSGRendererInterface::Software) {
    grid_.sync();
  }
  if (still_.isActive()) {
    still_.stop();
    lastMotion_.invalidate();
    settleMotion();
  }
  // A publication during the flush can bring stale tiles that need a plan.
  for (int pass = 0; pass < 4 && (pass == 0 || rasterWorkDirty_ || draftRasterDirty_); ++pass) { rasterPass(true); }
  syncRhiItems();
}

QPointF GraphCanvas::viewPhase() const {
  const auto dpr = window() ? window()->effectiveDevicePixelRatio() : 1.0;
  const auto translation = -QPointF(viewport_.scroll()) * dpr;
  return translation - QPointF(translation.toPoint());
}

void GraphCanvas::startMotion() {
  motion_ = true;
  // Restarting the timer on every pointer move re-registers it with the
  // event dispatcher. The timeout checks the time of the last move instead.
  lastMotion_.start();
  if (!still_.isActive()) { still_.start(kSettleMs); }
}

void GraphCanvas::settleMotion() {
  if (lastMotion_.isValid() && lastMotion_.elapsed() < kSettleMs) {
    still_.start(int(kSettleMs - lastMotion_.elapsed()));
    return;
  }
  motion_ = false;
  // Rasters taken while moving keep their phase. Repaint them at the phase
  // a direct paint of the scene has now. Staging keeps them on screen.
  if (!settle_.isActive()) { devicePhase_ = viewPhase(); }
  invalidateRasterWork();
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
  const bool isRhi = window() && window()->rendererInterface()->graphicsApi() != QSGRendererInterface::Software;
  for (auto *item : scene_->itemsIn(prefetchArea_)) {
    if (!near_.contains(item->indexKey())) {
      near_.insert(item->indexKey());
      item->setVisible(true);
      if (isRhi && item->kind() == CanvasItem::Kind::Connection && item->isVectorPainted()) { item->update(); }
    }
  }
  if (auto *draft = scene_->draftConnection()) {
    near_.insert(draft->indexKey());
    draft->setVisible(true);
    if (isRhi && draft->isVectorPainted()) { draft->update(); }
  }
}

void GraphCanvas::invalidateRasterWork() {
  rasterWorkDirty_ = true;
  scheduleRaster();
}

void GraphCanvas::invalidateDraftRaster() {
  draftRasterDirty_ = true;
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

// The raster scheduler's states.
//
// Grids. Every card, wire, lineage link and foreground primitive has a
// published tile grid, which the renderers draw, and a staged grid, which
// is empty unless the item is changing to another raster grid. A grid is a
// raster scale, the item's sub-pixel phase, the view's device phase and the
// whole-item or cell layout.
//
// Target grid. During a zoom gesture an item keeps the grid it has, and its
// textures scale. Changed tiles repaint in that grid. Once settled, the
// target is the exact zoom times the device pixel ratio at the view's device
// phase. While the view or an item moves, rasters keep their sub-pixel
// phase, as the QtNodes device cache does. A large item keeps its whole
// grid, so no seam opens between old and new tiles. The still timer ends the
// motion and takes the view phase that a direct paint would use. The exact
// grid follows through staging.
//
// Publication. A staged grid replaces the published one as soon as it holds
// a tile with the requested geometry for every key that intersects the live
// view, or every key in the prefetch area for an offscreen item. A stale
// staged tile can publish and repaint in the published grid afterwards. Content that changes on every frame therefore
// cannot hold a grid change back. Publication progress lives in the staged
// grid itself, so rebuilding the plan never loses it.
//
// Content. A tile is current when its revision matches its item's and it
// has no damage. Animated parts, such as a running card's ring, invalidate
// only their rectangles. Tiles they miss stay current, and tiles they touch
// repaint only those rectangles.
//
// Priorities. 0 is the draft wire. 1 is a visible area with nothing on
// screen. 2 includes stale visible tiles and missing tiles within one tile
// of the view. These share age order so animation cannot starve prefetch
// along the viewport edges. 3 is other offscreen work, nearest first.
// Priorities 0 and 1 may use the settle
// budget, and the rest stop at the frame budget. Only offscreen tiles are
// deferred or evicted to stay within the byte budget.
//
// Identity. A model reset keeps the items of nodes and connections that
// still exist (CanvasScene::onModelReset), so their tiles stay on screen
// until their replacements are painted.
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
  staging_.clear();
  plannedVisibleTiles_.clear();
  QList<TileRef> offscreenTiles;
  cachedRasterBytes_ = 0;
  offscreenRasterBytes_ = 0;
  syncForeground(prefetchArea_, zoom);

  using Image = CanvasImageItem;
  constexpr auto side = Image::tileSide;
  const auto prefetchDistance = side / scale;
  const auto distanceToView = [&visible](const QRectF &rect) {
    const auto dx = std::max({0., visible.left() - rect.right(), rect.left() - visible.right()});
    const auto dy = std::max({0., visible.top() - rect.bottom(), rect.top() - visible.bottom()});
    return dx * dx + dy * dy;
  };
  struct Wanted {
    QPoint key;
    Image::RasterGeometry geometry;
    QRectF rect;
    bool visible;
  };
  // Reused for every item, so planning a large view allocates rarely.
  QList<Wanted> wanted;
  rasterJobs_.reserve(newJob + near_.size());
  staging_.reserve(near_.size());
  const auto enqueue = [&](Image &owner, QPointF origin, const QRectF &bounds, RasterJob::Kind kind,
                           bool group, bool clip) {
    const auto &published = owner.tiles();
    const auto *shown = published.isEmpty() ? nullptr : &published.cbegin()->geometry;
    auto full = Image::rasterGeometry(bounds, origin, scale, devicePhase_);
    if (shown && !settled) {
      full = Image::rasterGeometryOnGrid(bounds, *shown);
    } else if (shown && motion_ && (usesCells(full) || shown->tiled) &&
               shown->scale == full.scale && shown->viewportPhase == full.viewportPhase) {
      full = Image::rasterGeometryOnGrid(bounds, *shown);
    }
    full.tiled = usesCells(full);
    const bool tiled = full.tiled;
    // A moving single-tile item keeps its tile until the view is still, and
    // a repaint replaces that one tile at once.
    const auto compatible = [&](const Image::RasterGeometry &geometry) {
      return geometry.tiled == tiled && geometry.scale == full.scale && geometry.viewportPhase == full.viewportPhase &&
             (geometry.phase == full.phase || (motion_ && !tiled));
    };
    // Replacing a one-tile grid at its existing key publishes the entire
    // target in one write. Keep drawing the old tile until that write.
    const bool singleTileSwap = shown && !shown->tiled && !tiled;
    bool staging = shown && !compatible(*shown) && !singleTileSwap;
    if (!owner.stagedTiles().isEmpty() && (!staging || !owner.stagedTiles().cbegin()->geometry.sameGrid(full))) {
      owner.discardStagedTiles();
    }
    const auto toScene = [&](const Image::RasterGeometry &geometry) { return geometry.localRect().translated(origin); };
    const auto sceneBounds = bounds.translated(origin);
    wanted.clear();
    if (sceneBounds.intersects(prefetchArea_)) {
      visitRasterTiles(full, prefetchArea_.translated(-origin), [&](QPoint key, const RasterGeometry &geometry) {
        const auto rect = toScene(geometry);
        wanted.append({key, geometry, rect, rect.intersects(visible)});
        return true;
      });
    }

    if (staging && !wanted.isEmpty()) {
      QList<QPoint> obsolete;
      for (auto it = owner.stagedTiles().cbegin(); it != owner.stagedTiles().cend(); ++it) {
        if (it->geometry != rasterTile(full, it.key())) { obsolete.append(it.key()); }
      }
      for (const auto key : obsolete) { owner.removeStagedTile(key); }
      if (stagedCoverage(owner, full, origin, visible, prefetchArea_)) {
        owner.publishStagedTiles();
        staging = false;
      } else {
        staging_.insert(reinterpret_cast<quintptr>(&owner), full.device);
      }
    }
    // Whether the published grid already shows a staged key's area.
    const auto shownArea = [&](const QRectF &rect) {
      double area = 0;
      for (const auto &tile : published) {
        const auto overlap = toScene(tile.geometry).intersected(rect);
        area += overlap.width() * overlap.height();
      }
      return area >= kCoveredShare * rect.width() * rect.height();
    };
    const auto &target = staging ? owner.stagedTiles() : published;
    for (const auto &tile : std::as_const(wanted)) {
      int priority = tile.visible ? 1 : 3;
      const auto existing = target.constFind(tile.key);
      if (existing != target.cend()) {
        // A staged tile publishes at any revision and repaints afterwards.
        if (staging && existing->geometry == tile.geometry) { continue; }
        const bool sameZoom = !settled || (zoomedOut(existing->zoom) == zoomedOut(zoom) && (!group || existing->zoom == zoom));
        const bool sameRaster = existing->geometry == tile.geometry || (motion_ && !tiled && compatible(existing->geometry));
        if (owner.tileCurrent(*existing) && sameRaster && sameZoom) { continue; }
        if (priority == 1) { priority = 2; }
      } else if (priority == 3 && !staging && distanceToView(tile.rect) <= prefetchDistance * prefetchDistance) {
        priority = 2;
      } else if (staging && priority == 1 && shownArea(tile.rect)) {
        priority = 2;
      }
      rasterJobs_.append({{&owner, tile.key, tile.rect, staging}, tile.geometry, kind, priority,
                          age.value({&owner, tile.key}, newJob), distanceToView(tile.rect)});
    }

    for (auto it = owner.stagedTiles().cbegin(); it != owner.stagedTiles().cend(); ++it) {
      const auto rect = toScene(it->geometry);
      cachedRasterBytes_ += it->bytes();
      if (!rect.intersects(visible)) {
        offscreenTiles.append({&owner, it.key(), rect, true});
        offscreenRasterBytes_ += it->bytes();
      } else {
        plannedVisibleTiles_.append({rect, it->bytes()});
      }
    }

    QList<QPoint> discarded;
    for (auto it = published.cbegin(); it != published.cend(); ++it) {
      const auto rect = toScene(it->geometry);
      // Trim tiles from both ends of a long wire when sweeping along it.
      if ((tiled || clip) && !rect.intersects(retentionArea_)) {
        discarded.append(it.key());
        continue;
      }
      // A changing path can shorten across a tile boundary. Drop the old
      // cells immediately so they cannot show pixels outside the new bounds.
      // The bounds are in painted coordinates, so compare the painted area:
      // the drawn rectangle is offset by the view phase.
      const auto painted = it->geometry.paintRect().translated(origin);
      if (!staging && compatible(it->geometry) && (!painted.intersects(sceneBounds) || (!tiled && it.key() != QPoint()))) {
        discarded.append(it.key());
        continue;
      }
      cachedRasterBytes_ += it->bytes();
      if (!rect.intersects(visible)) {
        offscreenTiles.append({&owner, it.key(), rect});
        offscreenRasterBytes_ += it->bytes();
      } else {
        plannedVisibleTiles_.append({rect, it->bytes()});
      }
    }
    for (const auto key : discarded) { owner.removeTile(key); }
  };
  const bool isRhi = window() && window()->rendererInterface()->graphicsApi() != QSGRendererInterface::Software;
  const auto *draft = scene_->draftConnection();
  for (const auto key : std::as_const(near_)) {
    auto *item = scene_->item(key);
    if (!item) { continue; }
    const bool wire = item->kind() == CanvasItem::Kind::Connection;
    if (isRhi && wire && item->isVectorPainted()) {
      item->clearImage();
      continue;
    }
    // rasterDraft paints the draft wire outside the staged tile plan.
    if (item == draft) {
      for (const auto &tile : item->tiles()) { cachedRasterBytes_ += tile.bytes(); }
      continue;
    }
    const auto *node = item->kind() == CanvasItem::Kind::Node ? static_cast<NodeItem *>(item) : nullptr;
    enqueue(*item, item->scenePosition(), item->rasterBounds(), node ? RasterJob::Card : wire ? RasterJob::Wire : RasterJob::Other,
            node && model_.isGroup(node->nodeId()), wire || item->kind() == CanvasItem::Kind::Lineage);
  }
  for (const auto &[key, item] : foregroundParts_) {
    enqueue(*item, item->position(), item->part().bounds, RasterJob::Foreground, true, false);
  }

  if (offscreenRasterBytes_ > rasterCacheBudget_) {
    std::ranges::sort(offscreenTiles, std::greater{}, [&](const TileRef &tile) { return distanceToView(tile.sceneRect); });
    for (const auto &tile : offscreenTiles) {
      if (offscreenRasterBytes_ <= rasterCacheBudget_) { break; }
      const auto &grid = tile.staged ? tile.owner->stagedTiles() : tile.owner->tiles();
      const auto found = grid.constFind(tile.key);
      if (found == grid.cend()) { continue; }
      const auto bytes = found->bytes();
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

  rasterJobsNeedSort_ = rasterJobs_.size() > 1;
}

void GraphCanvas::sortRasterJobs() {
  rasterJobsNeedSort_ = false;
  std::stable_sort(rasterJobs_.begin(), rasterJobs_.end(), [](const RasterJob &left, const RasterJob &right) {
    const auto leftDistance = left.priority == 3 ? left.distance : 0;
    const auto rightDistance = right.priority == 3 ? right.distance : 0;
    return std::tie(left.priority, leftDistance, left.age) < std::tie(right.priority, rightDistance, right.age);
  });
}

bool GraphCanvas::rasterDraft(const QRectF &visible, double scale, double zoom, bool settled, double dpr) {
  draftRasterDirty_ = false;
  auto *draft = scene_->draftConnection();
  if (!draft) { return false; }
  if (!near_.contains(draft->indexKey())) {
    near_.insert(draft->indexKey());
    draft->setVisible(true);
  }
  draft->discardStagedTiles();
  staging_.remove(reinterpret_cast<quintptr>(draft));
  // On a GPU backend the draft is drawn as vectors, like every other wire.
  if (draft->isVectorPainted()) {
    draft->clearImage();
    draft->update();
    return false;
  }

  using Image = CanvasImageItem;
  const auto origin = draft->scenePosition();
  const auto bounds = draft->rasterBounds();
  auto full = Image::rasterGeometry(bounds, origin, scale, devicePhase_);
  const auto &published = draft->tiles();
  const auto *shown = published.isEmpty() ? nullptr : &published.cbegin()->geometry;
  if (shown && !settled) {
    full = Image::rasterGeometryOnGrid(bounds, *shown);
  }
  full.tiled = usesCells(full);
  const bool tiled = full.tiled;
  const auto compatible = [&](const Image::RasterGeometry &geometry) {
    return geometry.tiled == tiled && geometry.scale == full.scale && geometry.viewportPhase == full.viewportPhase &&
           (geometry.phase == full.phase || (motion_ && !tiled));
  };
  const bool singleTileSwap = shown && !shown->tiled && !tiled;
  // A moving draft wire changes bounds on every pointer move, so a staged grid
  // swap can deadlock while dragging across the tile-size threshold. Replace
  // the grid directly and paint every visible curve tile in one pass.
  if (shown && !compatible(*shown) && !singleTileSwap) {
    for (const auto &tile : published) {
      if (!tile.pixels.isNull()) { keepSpare(tile.pixels); }
      cachedRasterBytes_ -= tile.bytes();
    }
    draft->clearImage();
  }

  const auto area = tiled ? visible.translated(-origin) : full.localRect();
  const auto padding = 1 / full.scale;
  QSet<QPoint> keepKeys;
  QList<std::pair<QPoint, Image::RasterGeometry>> toPaint;
  visitRasterTiles(full, area, [&](QPoint key, const Image::RasterGeometry &geometry) {
    keepKeys.insert(key);
    const bool empty = tiled && !draft->mayPaint(geometry.paintRect().adjusted(-padding, -padding, padding, padding));
    const auto existing = draft->tiles().constFind(key);
    if (existing != draft->tiles().cend()) {
      const bool sameZoom = !settled || zoomedOut(existing->zoom) == zoomedOut(zoom);
      const bool sameRaster = existing->geometry == geometry || (motion_ && !tiled && compatible(existing->geometry));
      if (draft->tileCurrent(*existing) && sameRaster && sameZoom) { return true; }
      if (empty && existing->pixels.isNull() && existing->geometry == geometry && sameZoom) { return true; }
    }
    if (empty) {
      if (existing != draft->tiles().cend()) {
        if (!existing->pixels.isNull()) { keepSpare(existing->pixels); }
        cachedRasterBytes_ -= existing->bytes();
      }
      Image::Tile tile{geometry, {}, draft->rasterRevision(), zoom, {}};
      cachedRasterBytes_ += tile.bytes();
      stats_.peakBytes = std::max(stats_.peakBytes, cachedRasterBytes_);
      draft->setTile(key, std::move(tile));
      return true;
    }
    toPaint.append({key, geometry});
    return true;
  });

  QList<QPoint> discarded;
  for (auto it = draft->tiles().cbegin(); it != draft->tiles().cend(); ++it) {
    if (!keepKeys.contains(it.key())) { discarded.append(it.key()); }
  }
  for (const auto key : discarded) {
    const auto found = draft->tiles().constFind(key);
    if (found != draft->tiles().cend()) {
      if (!found->pixels.isNull()) { keepSpare(found->pixels); }
      cachedRasterBytes_ -= found->bytes();
    }
    draft->removeTile(key);
  }

  const auto paint = [&](QPainter &painter) { draft->paintRaster(painter, zoom); };
  for (const auto &[key, geometry] : toPaint) {
    ++stats_.wires;
    ++stats_.visible;
    const auto existing = draft->tiles().constFind(key);
    const auto oldBytes = existing == draft->tiles().cend() ? 0 : existing->bytes();
    auto image = Image::rasterize(geometry, dpr, paint, {}, {}, spareImage(geometry.device.size()));
    if (!image.isNull()) {
      if (existing != draft->tiles().cend() && !existing->pixels.isNull()) { keepSpare(existing->pixels); }
      Image::Tile tile{geometry, std::move(image), draft->rasterRevision(), zoom, {}};
      cachedRasterBytes_ += tile.bytes() - oldBytes;
      stats_.peakBytes = std::max(stats_.peakBytes, cachedRasterBytes_);
      draft->setTile(key, std::move(tile));
    }
  }
  return !toPaint.isEmpty();
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
  // Large culls can use the raster slot. Start tile painting in the next
  // pass when a typical job would not fit after planning. In that next pass,
  // edits wait for one more pass and the existing queue paints first, so no
  // pass both plans a large view and paints. A changed view or scale plans
  // at once and paints its first job. Blank visible areas may paint until
  // the settle budget is spent.
  const bool consecutive = plannedWithoutPainting_ && planOnly_.isValid() && planOnly_.elapsed() < kConsecutiveMs;
  const bool rescaled = rasterWorkScale_ != scale;
  const bool planned = refresh || rescaled || (rasterWorkDirty_ && (flush || !consecutive));
  // Finish the previous ordering before a replan carries the queued ages over.
  if (rasterJobsNeedSort_) { sortRasterJobs(); }
  if (planned) { rebuildRasterWork(visible, scale, zoom, settled); }
  bool painted = false;
  if (scene_->draftConnection()) {
    if (planned || draftRasterDirty_) { painted = rasterDraft(visible, scale, zoom, settled, dpr); }
  } else {
    draftRasterDirty_ = false;
  }
  const auto urgentBudget = rasterTimeBudgetNs_ * kUrgentRasterNs / kFrameRasterNs;
  // If planning alone used the whole slot, finish ordering in the next
  // polish. As before, covered tiles may wait while missing tiles use the
  // larger budget. Consecutive plans and synchronous flushes always finish.
  const bool deferSort = rasterJobsNeedSort_ && !consecutive && !flush && rasterTimeBudgetNs_ > 0 &&
                         clock.nsecsElapsed() >= urgentBudget;
  if (rasterJobsNeedSort_ && !deferSort) { sortRasterJobs(); }
  const bool urgentFirst = nextRasterJob_ < rasterJobs_.size() && rasterJobs_[nextRasterJob_].priority <= 1;
  // A job's cost follows its pixel count and its kind: a wire tile is mostly
  // empty, a card tile is full. Tiles of one item can differ a lot, so each
  // job is predicted from its own area, with a margin.
  const auto predict = [this](const RasterJob &job) {
    return qint64(double(job.geometry.bytes() / 4) * nsPerPixel_[job.kind] * 1.5) + kJobOverheadNs;
  };
  plannedWithoutPainting_ = deferSort || (!painted && planned && !flush && !consecutive && rasterTimeBudgetNs_ > 0 &&
                            nextRasterJob_ < rasterJobs_.size() &&
                            clock.nsecsElapsed() + predict(rasterJobs_[nextRasterJob_]) >= (urgentFirst ? urgentBudget : rasterTimeBudgetNs_));
  if (plannedWithoutPainting_) { planOnly_.start(); }
  while (!plannedWithoutPainting_ && nextRasterJob_ < rasterJobs_.size()) {
    const auto &job = rasterJobs_[nextRasterJob_];
    const auto limit = job.priority <= 1 ? urgentBudget : rasterTimeBudgetNs_;
    // Every pass that does not only plan paints at least one job.
    if (!flush && painted && clock.nsecsElapsed() + predict(job) >= limit) { break; }
    painted = true;
    ++nextRasterJob_;
    auto *owner = job.tile.owner.data();
    if (!owner) { continue; }
    // A staged job paints into the published grid once its grid was
    // published, and is dropped once another grid is being staged.
    bool staged = job.tile.staged;
    if (staged) {
      const auto &published = owner->tiles();
      const auto &stagedTiles = owner->stagedTiles();
      if (!published.isEmpty() && published.cbegin()->geometry.sameGrid(job.geometry)) {
        staged = false;
      } else if (!stagedTiles.isEmpty() && !stagedTiles.cbegin()->geometry.sameGrid(job.geometry)) {
        continue;
      }
    }
    const auto before = clock.nsecsElapsed();
    // Pixels painted by this job. Deferred and empty tiles paint none.
    qsizetype paintedPixels = 0;
    const auto &target = staged ? owner->stagedTiles() : owner->tiles();
    const auto existing = target.constFind(job.tile.key);
    const auto oldBytes = existing == target.cend() ? 0 : existing->bytes();
    const bool visibleNow = job.tile.sceneRect.intersects(visible);
    const auto estimatedBytes = job.geometry.bytes() + sizeof(CanvasImageItem::Tile) - oldBytes;
    if (!visibleNow && offscreenRasterBytes_ + estimatedBytes > rasterCacheBudget_) {
      deferredTiles_.append(job.tile.sceneRect);
    } else {
      if (job.kind == RasterJob::Card) { ++stats_.cards; }
      if (job.kind == RasterJob::Wire) { ++stats_.wires; }
      if (job.kind == RasterJob::Foreground) { ++stats_.foreground; }
      if (visibleNow) { ++stats_.visible; }
      // A tile whose only change is a damaged area repaints that area.
      const bool partial = existing != target.cend() && existing->revision == owner->rasterRevision() &&
                           !existing->damage.isEmpty() && existing->geometry == job.geometry && !existing->pixels.isNull();
      const auto paint = [&](QPainter &painter) { owner->paintRaster(painter, zoom); };
      // A tile of a long wire away from its path stays empty, which saves
      // painting most tiles of a diagonal wire.
      const auto padding = 1 / job.geometry.scale;
      const bool empty = job.geometry.tiled &&
                         !owner->mayPaint(job.geometry.paintRect().adjusted(-padding, -padding, padding, padding));
      auto image = empty     ? QImage()
                   : partial ? CanvasImageItem::rasterize(job.geometry, dpr, paint, existing->pixels, existing->damage)
                             : CanvasImageItem::rasterize(job.geometry, dpr, paint, {}, {}, spareImage(job.geometry.device.size()));
      if (!empty) {
        const auto area = partial ? existing->damage.size() * job.geometry.scale : QSizeF(job.geometry.device.size());
        paintedPixels = qsizetype(std::ceil(area.width()) * std::ceil(area.height()));
      }
      if (empty || !image.isNull()) {
        // The replaced image is reused once the scene graph has let go of it.
        if (existing != target.cend() && !existing->pixels.isNull()) { keepSpare(existing->pixels); }
        // A tile of a long wire or wide label can miss its path. Keep the
        // validity of such an empty tile without its pixels.
        if (!image.isNull() && job.kind != RasterJob::Card && job.geometry.tiled) {
          const auto *pixels = reinterpret_cast<const QRgb *>(image.constBits());
          if (std::all_of(pixels, pixels + image.width() * image.height(), [](QRgb pixel) { return pixel == 0; })) { image = {}; }
        }
        CanvasImageItem::Tile tile{job.geometry, std::move(image), owner->rasterRevision(), zoom, {}};
        const auto additional = tile.bytes() - oldBytes;
        cachedRasterBytes_ += additional;
        const auto accountViewBytes = [&](const QRectF &rect, qsizetype bytes) {
          if (!rect.intersects(plannedVisible_)) {
            offscreenRasterBytes_ += bytes;
          } else if (bytes != 0) {
            plannedVisibleTiles_.append({rect, bytes});
          }
        };
        const auto *item = job.kind == RasterJob::Foreground ? nullptr : static_cast<const CanvasItem *>(owner);
        const auto origin = item ? item->scenePosition() : owner->position();
        if (existing != target.cend() && existing->geometry.localRect() != job.geometry.localRect()) {
          accountViewBytes(existing->geometry.localRect().translated(origin), -oldBytes);
          accountViewBytes(job.tile.sceneRect, tile.bytes());
        } else {
          accountViewBytes(job.tile.sceneRect, additional);
        }
        stats_.peakBytes = std::max(stats_.peakBytes, cachedRasterBytes_);
        if (staged) {
          owner->stageTile(job.tile.key, std::move(tile));
          const auto bounds = item ? item->rasterBounds() : static_cast<const ForegroundItem *>(owner)->part().bounds;
          auto full = CanvasImageItem::rasterGeometryOnGrid(bounds, job.geometry);
          full.tiled = usesCells(full);
          const auto stageKey = reinterpret_cast<quintptr>(owner);
          // Changed bounds need a new plan to drop obsolete cells and queue
          // replacements. A pan can reuse this plan if its tiles cover the view.
          if (staging_.value(stageKey) == full.device && stagedCoverage(*owner, full, origin, visible, prefetchArea_)) {
            staging_.remove(stageKey);
            for (const auto &previous : owner->tiles()) {
              cachedRasterBytes_ -= previous.bytes();
              accountViewBytes(previous.geometry.localRect().translated(origin), -previous.bytes());
            }
            owner->publishStagedTiles();
            // Stale tiles may publish so animated content cannot block a grid swap.
            if (std::ranges::any_of(owner->tiles(), [&](const auto &tile) { return !owner->tileCurrent(tile); })) {
              rasterWorkDirty_ = true;
            }
          }
        } else {
          owner->setTile(job.tile.key, std::move(tile));
        }
      }
    }
    if (paintedPixels > 0) {
      const auto perPixel = double(clock.nsecsElapsed() - before) / double(paintedPixels);
      nsPerPixel_[job.kind] += (perPixel - nsPerPixel_[job.kind]) / 8;
    }
  }
  const auto elapsed = clock.nsecsElapsed();
  stats_.nanoseconds += elapsed;
  stats_.slowestPass = std::max(stats_.slowestPass, elapsed);
  ++stats_.passes;
  updateCardOverlayRendering();
  update();
  if (nextRasterJob_ < rasterJobs_.size() || rasterWorkDirty_ || draftRasterDirty_) {
    QTimer::singleShot(0, this, &GraphCanvas::scheduleRaster);
  }
}

QImage GraphCanvas::spareImage(QSize size) {
  for (auto it = spareImages_.begin(); it != spareImages_.end(); ++it) {
    // Detached: the scene graph no longer shows it.
    if (it->size() == size && it->isDetached()) {
      auto image = std::move(*it);
      spareImages_.erase(it);
      return image;
    }
  }
  return {};
}

void GraphCanvas::keepSpare(const QImage &image) {
  // Tiles above 128 KiB come from mmap, so a fresh image per repaint costs
  // page faults, zeroing and TLB shootdowns. A few released images suffice
  // for the wires and cards that repaint every frame.
  constexpr qsizetype kSpareImages = 16;
  if (spareImages_.size() == kSpareImages) { spareImages_.removeFirst(); }
  spareImages_.append(image);
}

void GraphCanvas::itemChange(ItemChange change, const ItemChangeData &value) {
  QQuickItem::itemChange(change, value);
  if (change == ItemSceneChange && value.window) {
    // A queued polish belonged to the previous window.
    rasterQueued_ = false;
    lastWireFeatherScale_ = 0;
    syncRhiItems();
    invalidateRasterWork();
  }
  if (change == ItemDevicePixelRatioHasChanged) {
    lastWireFeatherScale_ = 0;
    invalidateRasterWork();
    viewChanged(true);
  }
}

CanvasPointerEvent GraphCanvas::pointerEvent(QPointF position, QPointF global, Qt::MouseButton button,
                                             Qt::MouseButtons buttons, Qt::KeyboardModifiers modifiers) const {
  return {viewport_.mapToScene(position.toPoint()), global.toPoint(), button, buttons, modifiers,
          std::clamp(viewport_.zoom(), 0.08, 8.0)};
}

void GraphCanvas::focusCanvas(Qt::FocusReason reason) {
  if (auto *active = window() ? window()->activeFocusItem() : nullptr;
      active && active != this && isAncestorOf(active)) {
    active->setFocus(false, reason);
  }
  forceActiveFocus(reason);
}

void GraphCanvas::mousePressEvent(QMouseEvent *event) {
  event->accept();
  buttonsDown_ = event->buttons();
  if (skipPress_ || (viewportPointer && viewportPointer(PointerAction::Press, *event))) { return; }
  if (!window() || window()->activeFocusItem() != this) { focusCanvas(Qt::MouseFocusReason); }
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
  const bool directDrag = grabber &&
                          (grabber->kind() == CanvasItem::Kind::Node || grabber == scene_->draftConnection());
  if (!directDrag || event.buttons() != Qt::LeftButton ||
      event.source() != Qt::MouseEventNotSynthesized || !window() || window()->mouseGrabberItem() != this) {
    return false;
  }
  // The widget and the Quick window have already agreed on the grab.
  // A plain card or draft-wire move can go straight to the existing canvas dispatcher.
  mouseMoveEvent(&event);
  return true;
}

void GraphCanvas::mouseMoveEvent(QMouseEvent *event) {
  event->accept();
  if (viewportPointer && viewportPointer(PointerAction::Move, *event)) { return; }
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
  if (viewportPointer && viewportPointer(PointerAction::Release, *event)) { return; }
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
  const auto scenePoint = viewport_.mapToScene(position);
  const auto hits = scene_->itemsAt(scenePoint);
  if (!hits.isEmpty() && hits.first()->kind() == CanvasItem::Kind::Lineage) {
    static_cast<LineageItem *>(hits.first())->openContextMenu(screenPosition);
    return;
  }
  scene_->contextMenu({.scenePosition = scenePoint, .screenPosition = screenPosition, .modifiers = modifiers});
}

void GraphCanvas::keyPressEvent(QKeyEvent *event) {
  if (window() && window()->activeFocusItem() != this) { event->ignore(); return; }
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

void GraphCanvas::wheelEvent(QWheelEvent *event) {
  if (!viewportWheel) { event->ignore(); return; }
  viewportWheel(*event);
  event->accept();
}

} // namespace nodetool::canvas
