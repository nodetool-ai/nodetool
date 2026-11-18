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
#include <QStyleHints>
#include <algorithm>
#include <cmath>

namespace nodetool::canvas {
using namespace QtNodes;
namespace {
// Raster work spread over frames stays under 4 ms a frame (plan, Large
// graphs). Half a millisecond is kept for the foreground and the cull.
constexpr qint64 kFrameBudgetNs = 3'500'000;
// A zoom gesture scales textures; they are painted again after this pause.
constexpr int kSettleMs = 100;
// The largest raster scale, so that a card at zoom 4 on a high-density screen
// keeps a bounded texture (plan R4).
constexpr double kMaxRasterScale = 4;

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

bool zoomedOut(double zoom) { return zoom <= zoomedOutThreshold; }
} // namespace

GraphCanvas::GraphCanvas(WorkflowGraphModel &model, QQuickItem *parent)
    : QQuickItem(parent), model_(model), grid_(viewport_, this), content_(this), foreground_(&content_), overlay_(this),
      band_(&overlay_), scene_(std::make_unique<EditorCanvasScene>(model, content_)),
      selection_(std::make_unique<SceneSelection>(*scene_)) {
  setFlag(ItemIsFocusScope, true);
  setActiveFocusOnTab(true);
  setAcceptedMouseButtons(Qt::AllButtons);
  setAcceptHoverEvents(true);
  grid_.setZ(-1);
  overlay_.setZ(1);
  content_.setTransformOrigin(TopLeft);
  // The foreground draws after every item, the draft wire included.
  foreground_.setZ(2e6);
  settle_.setSingleShot(true);
  settle_.setInterval(kSettleMs);
  connect(&settle_, &QTimer::timeout, this, [this] { scheduleRaster(); });
  connect(scene_.get(), &CanvasScene::rasterRequested, this, &GraphCanvas::scheduleRaster);
  connect(scene_.get(), &EditorCanvasScene::foregroundChanged, this, [this] {
    foreground_.invalidate();
    scheduleRaster();
  });
  connect(scene_.get(), &CanvasScene::selectionChanged, this, [this] { foreground_.invalidate(); });
  connect(scene_.get(), &EditorCanvasScene::themeChanged, this, [this] { grid_.setTheme(scene_->theme()); });
  scene_->viewCursor = [this](std::optional<Qt::CursorShape> cursor) {
    if (cursor) {
      setCursor(*cursor);
    } else {
      unsetCursor();
    }
  };
  viewChanged(true);
}

GraphCanvas::~GraphCanvas() {
  settle_.stop();
  disconnect(scene_.get(), nullptr, this, nullptr);
  // The selection borrows the scene, and the scene's items have content_ as parent.
  selection_.reset();
  scene_.reset();
}

double GraphCanvas::rasterScale() const {
  const double dpr = window() ? window()->effectiveDevicePixelRatio() : 1.0;
  const double scale = std::clamp(viewport_.zoom() * dpr, 1.0 / 64, kMaxRasterScale * dpr);
  return std::pow(2.0, std::round(std::log2(scale) * 2) / 2);
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

void GraphCanvas::renderScene(QPainter &painter, const QRectF &area, double zoom) const {
  painter.save();
  scene_->paintBackground(painter, area, zoom);
  auto items = scene_->itemsIn(area);
  std::sort(items.begin(), items.end(), [](const CanvasItem *a, const CanvasItem *b) {
    const auto left = a->stackKey(), right = b->stackKey();
    if (left.first != right.first) { return left.first < right.first; }
    if (left.second != right.second) { return left.second < right.second; }
    return a->indexKey() < b->indexKey();
  });
  for (const auto *item : items) {
    painter.save();
    double opacity = 1;
    for (const QQuickItem *step = item; step && step != &content_; step = step->parentItem()) { opacity *= step->opacity(); }
    painter.setOpacity(opacity);
    if (const auto *node = dynamic_cast<const NodeItem *>(item)) {
      painter.translate(node->scenePosition());
      scene_->paintNode(painter, *node, zoom);
    } else if (const auto *wire = dynamic_cast<const ConnectionItem *>(item)) {
      scene_->paintConnection(painter, *wire, zoom);
    } else if (item->hasImage()) {
      painter.setRenderHint(QPainter::SmoothPixmapTransform);
      painter.drawImage(item->imageRect().translated(item->scenePosition()), item->image());
    }
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
  // QGraphicsView sets the open hand on the viewport in ScrollHandDrag mode.
  if (handDrag) {
    setCursor(Qt::OpenHandCursor);
  } else {
    unsetCursor();
  }
}

void GraphCanvas::viewChanged(bool zoomed) {
  content_.setScale(viewport_.zoom());
  content_.setPosition(-QPointF(viewport_.scroll()));
  scene_->setZoom(viewport_.zoom());
  grid_.sync();
  if (zoomed) { settle_.start(); }
  scheduleRaster();
  emit viewportMoved();
}

void GraphCanvas::geometryChange(const QRectF &newGeometry, const QRectF &oldGeometry) {
  QQuickItem::geometryChange(newGeometry, oldGeometry);
  if (newGeometry.size() == oldGeometry.size()) { return; }
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

void GraphCanvas::rasterPass(bool flush) {
  QElapsedTimer clock;
  clock.start();
  const auto zoom = viewport_.zoom();
  const auto scale = rasterScale();
  const bool settled = flush || !settle_.isActive();
  const auto visible = viewport_.visibleSceneRect();
  const auto nearRect = visible.adjusted(-visible.width() / 2, -visible.height() / 2, visible.width() / 2, visible.height() / 2);
  const auto keepRect = visible.adjusted(-visible.width() * 1.5, -visible.height() * 1.5, visible.width() * 1.5, visible.height() * 1.5);
  // Cull: cards and wires far from the view hold no image and are not visible.
  for (auto it = near_.begin(); it != near_.end();) {
    auto *item = scene_->item(*it);
    if (item && item->effectivelyShown() && item->sceneBoundingRect().intersects(keepRect)) {
      ++it;
      continue;
    }
    if (item) {
      item->clearImage();
      if (item->parentItem() == &content_) { item->setVisible(false); }
    }
    it = near_.erase(it);
  }
  QList<CanvasItem *> onScreen, prefetch;
  for (auto *item : scene_->itemsIn(nearRect)) {
    // Links and notes paint themselves when they change.
    if (item->kind() != CanvasItem::Kind::Node && item->kind() != CanvasItem::Kind::Connection) { continue; }
    if (!near_.contains(item->indexKey())) {
      near_.insert(item->indexKey());
      item->setVisible(true);
    }
    (item->sceneBoundingRect().intersects(visible) ? onScreen : prefetch).append(item);
  }
  // The draft follows the pointer, so it is always painted.
  if (auto *draft = scene_->draftConnection()) {
    if (!onScreen.contains(draft)) { onScreen.append(draft); }
    draft->setVisible(true);
  }
  const auto stale = [&](const CanvasItem &item) {
    if (!item.hasImage() || item.contentDirty()) { return true; }
    if (!settled) { return false; }
    if (item.imageScale() != scale || zoomedOut(item.imageZoom()) != zoomedOut(zoom)) { return true; }
    const auto *node = dynamic_cast<const NodeItem *>(&item);
    return node && model_.isGroup(node->nodeId()) && item.imageZoom() != zoom;
  };
  const auto paint = [&](CanvasItem &item) {
    if (auto *node = dynamic_cast<NodeItem *>(&item)) {
      node->raster(scale, zoom);
      ++stats_.cards;
    } else if (auto *wire = dynamic_cast<ConnectionItem *>(&item)) {
      wire->raster(scale, zoom);
      ++stats_.wires;
    }
  };
  bool pending = false;
  // On screen: a card with no image or with changed content paints now.
  for (auto *item : std::as_const(onScreen)) {
    if (!item->hasImage() || item->contentDirty()) { paint(*item); }
  }
  // Then stale scales on screen and prefetch near it, within the frame budget.
  // A raster that would likely cross the budget waits for the next frame.
  qint64 longest = 0;
  for (const auto *list : {&onScreen, &prefetch}) {
    for (auto *item : *list) {
      if (!stale(*item)) { continue; }
      const auto before = clock.nsecsElapsed();
      if (!flush && before + longest > kFrameBudgetNs) {
        pending = true;
        break;
      }
      paint(*item);
      longest = std::max(longest, clock.nsecsElapsed() - before);
    }
  }
  if (foreground_.raster(*scene_, visible, scale, zoom, settled)) { ++stats_.other; }
  const auto elapsed = clock.nsecsElapsed();
  stats_.nanoseconds += elapsed;
  stats_.slowestPass = std::max(stats_.slowestPass, elapsed);
  ++stats_.passes;
  if (pending) {
    // Continue in the next frame.
    QTimer::singleShot(0, this, [this] { scheduleRaster(); });
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
    setCursor(Qt::ClosedHandCursor);
  }
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
  scene_->clearHover();
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
  scene_->pointer(PointerAction::Move, pointerEvent(position, global, Qt::NoButton, buttons, modifiers), mouse);
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
    setCursor(Qt::OpenHandCursor);
    handScrolling_ = false;
    // Very little motion and no item took the press: a click on the pane resets the selection.
    if (!pressAccepted_ && handMotions_ <= 6) { scene_->clearSelection(); }
  }
  const auto position = event->position().toPoint();
  const auto scenePoint = viewport_.mapToScene(position);
  CanvasMouseEvent mouse{scenePoint, lastMoveScene_, pressScene_, event->globalPosition().toPoint(), event->button(),
                         event->buttons(), event->modifiers(), false};
  scene_->pointer(PointerAction::Release,
                  pointerEvent(event->position(), event->globalPosition(), event->button(), event->buttons(),
                               event->modifiers()),
                  mouse);
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
  }
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
  scene_->focusOut();
  QQuickItem::focusOutEvent(event);
}

void GraphCanvas::wheelEvent(QWheelEvent *event) { event->ignore(); }

} // namespace nodetool::canvas
