#include "ui/QtNodesCanvas.h"

#include "graph/EditorScene.h"
#include "graph/LineageLayer.h"
#include "graph/WorkflowGraphModel.h"
#include <QtNodes/internal/ConnectionGraphicsObject.hpp>
#include <QtNodes/internal/NodeGraphicsObject.hpp>
#include <QPainter>
#include <QScrollBar>
#include <QSignalBlocker>

namespace nodetool {
namespace {

// UI thread only. QtNodes items and their selection are owned by the scene.
class SceneSelection final : public CanvasSelection {
public:
  explicit SceneSelection(EditorScene &scene) : scene_(scene) {
    connect(&scene_, &QGraphicsScene::selectionChanged, this, &CanvasSelection::selectionChanged);
  }

  QList<QtNodes::NodeId> nodes() const override {
    QList<QtNodes::NodeId> ids;
    for (auto *item : scene_.selectedItems()) {
      if (auto *node = qgraphicsitem_cast<QtNodes::NodeGraphicsObject *>(item)) { ids.append(node->nodeId()); }
    }
    return ids;
  }

  QList<QtNodes::ConnectionId> edges() const override {
    QList<QtNodes::ConnectionId> ids;
    for (auto *item : scene_.selectedItems()) {
      if (auto *wire = qgraphicsitem_cast<QtNodes::ConnectionGraphicsObject *>(item)) { ids.append(wire->connectionId()); }
    }
    return ids;
  }

  qsizetype count() const override { return scene_.selectedItems().size(); }
  bool contains(QtNodes::NodeId id) const override {
    const auto *node = scene_.nodeGraphicsObject(id);
    return node && node->isSelected();
  }
  void clear() override { scene_.clearSelection(); }
  void setNode(QtNodes::NodeId id, bool selected) override {
    if (auto *node = scene_.nodeGraphicsObject(id)) { node->setSelected(selected); }
  }
  void selectNodes(const QList<QtNodes::NodeId> &ids, bool replace) override {
    QSignalBlocker blocker(&scene_);
    if (replace) { clear(); }
    for (const auto id : ids) { setNode(id, true); }
    blocker.unblock();
    emit scene_.selectionChanged();
  }

private:
  EditorScene &scene_;
};

}

QtNodesCanvas::QtNodesCanvas(EditorScene &scene, QtNodesCanvasView &view)
    : scene_(scene), view_(view), selection_(std::make_unique<SceneSelection>(scene)) {
  connect(&scene_, &QGraphicsScene::changed, this, &CanvasSurface::sceneChanged);
  connect(view_.horizontalScrollBar(), &QScrollBar::valueChanged, this, &CanvasSurface::viewportMoved);
  connect(view_.verticalScrollBar(), &QScrollBar::valueChanged, this, &CanvasSurface::viewportMoved);
  connect(&view_, &QGraphicsView::rubberBandChanged, this, [this](const QRect &rect) { emit rubberBandChanged(!rect.isNull()); });
  connect(&scene_, &QtNodes::BasicGraphicsScene::nodeClicked, this, &CanvasSurface::nodeClicked);
  connect(&scene_, &QtNodes::BasicGraphicsScene::nodeDoubleClicked, this, &CanvasSurface::nodeDoubleClicked);
  connect(&scene_, &EditorScene::branchDimmingChanged, this, &CanvasSurface::branchDimmingChanged);
}

QtNodesCanvasView &QtNodesCanvas::createView(EditorScene &scene, QWidget &parent) {
  // The shell owns the view, which keeps QtNodes' clipboard and undo actions out.
  auto *view = new QtNodesCanvasView(&scene, &parent);
  view->setAcceptDrops(true);
  view->viewport()->setAcceptDrops(true);
  view->setRenderHint(QPainter::Antialiasing);
  view->setRenderHint(QPainter::TextAntialiasing);
  view->setDragMode(QGraphicsView::RubberBandDrag);
  view->setFrameShape(QFrame::NoFrame);
  // Port labels paint outside their items.
  view->setViewportUpdateMode(QGraphicsView::FullViewportUpdate);
  view->setHorizontalScrollBarPolicy(Qt::ScrollBarAlwaysOff);
  view->setVerticalScrollBarPolicy(Qt::ScrollBarAlwaysOff);
  view->setSceneRect(-32767, -32767, 65534, 65534);
  return *view;
}

void QtNodesCanvas::detachScene() { view_.setScene(nullptr); }
QPointF QtNodesCanvas::mapToScene(QPoint p) const { return view_.mapToScene(p); }
QPoint QtNodesCanvas::mapFromScene(QPointF p) const { return view_.mapFromScene(p); }
QRect QtNodesCanvas::mapFromScene(QRectF rect) const { return view_.mapFromScene(rect).boundingRect(); }
QRectF QtNodesCanvas::visibleSceneRect() const { return view_.mapToScene(view_.viewport()->rect()).boundingRect(); }
QTransform QtNodesCanvas::viewportTransform() const { return view_.viewportTransform(); }
double QtNodesCanvas::zoom() const { return view_.transform().m11(); }
QPointF QtNodesCanvas::center() const { return viewportTransform().inverted().map(QRectF(view_.viewport()->rect()).center()); }
void QtNodesCanvas::centerOn(QPointF position) { view_.centerOn(position); }
void QtNodesCanvas::setView(double zoom, QPointF center) {
  view_.setTransformationAnchor(QGraphicsView::AnchorViewCenter);
  view_.setTransform(QTransform::fromScale(zoom, zoom));
  view_.centerOn(center);
}
void QtNodesCanvas::scaleBy(double factor, ZoomAnchor anchor) {
  view_.setTransformationAnchor(anchor == ZoomAnchor::Center ? QGraphicsView::AnchorViewCenter : QGraphicsView::AnchorUnderMouse);
  view_.scale(factor, factor);
}
void QtNodesCanvas::ensureVisible(QRectF rect, int margin) { view_.ensureVisible(rect, margin, margin); }
void QtNodesCanvas::panBy(QPoint pixels) {
  setHorizontalOffset(horizontalOffset() - pixels.x());
  view_.verticalScrollBar()->setValue(view_.verticalScrollBar()->value() - pixels.y());
}
int QtNodesCanvas::horizontalOffset() const { return view_.horizontalScrollBar()->value(); }
void QtNodesCanvas::setHorizontalOffset(int offset) { view_.horizontalScrollBar()->setValue(offset); }

QtNodes::NodeGraphicsObject *QtNodesCanvas::graphicsNode(EditorScene &scene, QtNodes::NodeId id) {
  return scene.nodeGraphicsObject(id);
}
bool QtNodesCanvas::hasNode(QtNodes::NodeId id) const { return graphicsNode(scene_, id); }
QRectF QtNodesCanvas::nodeRect(QtNodes::NodeId id) const {
  return mapRectFromNode(id, QRectF(QPointF(), static_cast<const WorkflowGraphModel &>(scene_.graphModel()).layout(id).size));
}
QRectF QtNodesCanvas::nodeBounds(QtNodes::NodeId id) const {
  const auto *node = graphicsNode(scene_, id);
  return node ? node->sceneBoundingRect() : QRectF{};
}
QRectF QtNodesCanvas::edgeBounds(const QtNodes::ConnectionId &id) const {
  const auto *edge = scene_.connectionGraphicsObject(id);
  return edge ? edge->sceneBoundingRect() : QRectF{};
}
QPointF QtNodesCanvas::nodeOrigin(QtNodes::NodeId id) const {
  const auto *node = graphicsNode(scene_, id);
  return node ? node->scenePos() : QPointF{};
}
QPointF QtNodesCanvas::mapFromNode(QtNodes::NodeId id, QPointF local) const {
  const auto *node = graphicsNode(scene_, id);
  return node ? node->mapToScene(local) : QPointF{};
}
QRectF QtNodesCanvas::mapRectFromNode(QtNodes::NodeId id, QRectF local) const {
  const auto *node = graphicsNode(scene_, id);
  return node ? node->mapRectToScene(local) : QRectF{};
}
QPointF QtNodesCanvas::mapToNode(QtNodes::NodeId id, QPointF point) const {
  const auto *node = graphicsNode(scene_, id);
  return node ? node->mapFromScene(point) : QPointF{};
}
double QtNodesCanvas::nodeOpacity(QtNodes::NodeId id) const {
  const auto *node = graphicsNode(scene_, id);
  return node ? node->opacity() : 0.0;
}
QList<QtNodes::NodeId> QtNodesCanvas::visibleNodes() const {
  QList<QtNodes::NodeId> ids;
  const auto items = scene_.items(view_.mapToScene(view_.viewport()->rect()), Qt::IntersectsItemBoundingRect, Qt::DescendingOrder);
  for (auto *item : items) {
    if (auto *node = qgraphicsitem_cast<QtNodes::NodeGraphicsObject *>(item); node && node->isVisible()) { ids.append(node->nodeId()); }
  }
  return ids;
}
QtNodes::NodeId QtNodesCanvas::nodeAt(QPoint point, bool includeDecorations) const {
  if (!includeDecorations) {
    for (auto *item : scene_.items(mapToScene(point), Qt::IntersectsItemBoundingRect, Qt::DescendingOrder)) {
      if (auto *node = qgraphicsitem_cast<QtNodes::NodeGraphicsObject *>(item); node && node->isVisible()) { return node->nodeId(); }
    }
  } else {
    for (auto *entry : view_.items(point)) {
      for (auto *item = entry; item; item = item->parentItem()) {
        if (auto *node = qgraphicsitem_cast<QtNodes::NodeGraphicsObject *>(item)) { return node->nodeId(); }
      }
    }
  }
  return QtNodes::InvalidNodeId;
}
bool QtNodesCanvas::hasItemAt(QPoint point) const { return view_.itemAt(point); }
bool QtNodesCanvas::lineageAt(QPoint point) const {
  return node_editor::LineageLayer::isLinkItem(view_.itemAt(point));
}
std::optional<QtNodes::ConnectionId> QtNodesCanvas::edgeAt(QPoint point) const {
  const auto *wire = qgraphicsitem_cast<QtNodes::ConnectionGraphicsObject *>(view_.itemAt(point));
  if (wire && !wire->connectionState().requiresPort()) { return wire->connectionId(); }
  return std::nullopt;
}

EditorSceneApi &QtNodesCanvas::scene() const { return scene_; }
CanvasSelection &QtNodesCanvas::selection() const { return *selection_; }
bool QtNodesCanvas::rubberBandActive() const { return !view_.rubberBandRect().isNull(); }
void QtNodesCanvas::setHandDrag(bool enabled) { view_.setDragMode(enabled ? QGraphicsView::ScrollHandDrag : QGraphicsView::RubberBandDrag); }
void QtNodesCanvas::requestRepaint() { view_.viewport()->update(); }
void QtNodesCanvas::setCursor(const QCursor &cursor) { view_.viewport()->setCursor(cursor); }
void QtNodesCanvas::setFocus(Qt::FocusReason reason) { view_.setFocus(reason); }
QImage QtNodesCanvas::capture(canvas_capture::Mode mode) const { return canvas_capture::capture(*view_.window(), mode); }
QImage QtNodesCanvas::renderCard(QtNodes::NodeId id) const {
  auto *node = graphicsNode(scene_, id);
  if (!node) { return {}; }
  const auto rect = nodeRect(id);
  if (rect.isEmpty()) { return {}; }
  QImage image(rect.size().toSize(), QImage::Format_ARGB32_Premultiplied);
  image.fill(Qt::transparent);
  QPainter painter(&image);
  const auto cache = node->cacheMode();
  node->setCacheMode(QGraphicsItem::NoCache);
  scene_.render(&painter, QRectF(image.rect()), rect);
  node->setCacheMode(cache);
  return image;
}
QWidget &QtNodesCanvas::hostWidget() const { return view_; }
QWidget &QtNodesCanvas::viewportWidget() const { return *view_.viewport(); }

}
