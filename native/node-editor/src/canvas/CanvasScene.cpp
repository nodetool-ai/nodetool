// Adapted from QtNodes src/BasicGraphicsScene.cpp at commit
// 829b18457d4e95ac17f4fdb01c6201125681729d.
// Copyright (c) 2022, Dmitry Pinaev. All rights reserved.
// BSD-3-Clause, see licenses/QtNodes-BSD-3-Clause.txt.
// Changed: see CanvasScene.h. The selection, hit test and mouse delivery
// below follow QGraphicsScene's documented behavior.
#include "canvas/CanvasScene.h"

#include "canvas/ConnectionItem.h"
#include "canvas/NodeItem.h"
#include <QtNodes/AbstractGraphModel>
#include <QtNodes/ConnectionIdUtils>
#include <QtNodes/internal/AbstractNodeGeometry.hpp>
#include <QtNodes/internal/StyleCollection.hpp>
#include <QKeyEvent>
#include <QTimer>
#include <algorithm>
#include <unordered_set>

namespace nodetool::canvas {
using namespace QtNodes;
namespace {
bool topmostFirst(const CanvasItem *a, const CanvasItem *b) {
  const auto left = a->stackKey(), right = b->stackKey();
  if (left.first != right.first) { return left.first > right.first; }
  if (left.second != right.second) { return left.second > right.second; }
  return a->indexKey() > b->indexKey();
}
} // namespace

CanvasScene::CanvasScene(AbstractGraphModel &model, QQuickItem &layer, QObject *parent)
    : QObject(parent), model_(model), layer_(layer) {
  connect(&model_, &AbstractGraphModel::connectionCreated, this, &CanvasScene::onConnectionCreated);
  connect(&model_, &AbstractGraphModel::connectionDeleted, this, &CanvasScene::onConnectionDeleted);
  connect(&model_, &AbstractGraphModel::nodeCreated, this, &CanvasScene::onNodeCreated);
  connect(&model_, &AbstractGraphModel::nodeDeleted, this, &CanvasScene::onNodeDeleted);
  connect(&model_, &AbstractGraphModel::nodePositionUpdated, this, &CanvasScene::onNodePositionUpdated);
  connect(&model_, &AbstractGraphModel::nodeUpdated, this, &CanvasScene::onNodeUpdated);
  connect(&model_, &AbstractGraphModel::nodeFlagsUpdated, this, [this](NodeId id) {
    // setLockedState: a locked card cannot stay selected.
    if (auto *node = nodeItem(id); node && node->locked()) { setSelected(*node, false); }
  });
  connect(this, &CanvasScene::nodeClicked, this, &CanvasScene::onNodeClicked);
  connect(&model_, &AbstractGraphModel::modelReset, this, &CanvasScene::onModelReset);
}

CanvasScene::~CanvasScene() {
  disconnect(&model_, nullptr, this, nullptr);
  // Destroy owned items first, without selection notifications, then detach
  // the presenters' items that outlive the scene.
  const QSignalBlocker blocker(this);
  destroying_ = true;
  grabber_ = hover_ = hoverChild_ = focus_ = lastGrabber_ = nullptr;
  draft_.reset();
  connections_.clear();
  nodes_.clear();
  for (auto *item : std::as_const(items_)) { item->detachScene(); }
  items_.clear();
  index_.clear();
}

void CanvasScene::setNodeGeometry(std::unique_ptr<AbstractNodeGeometry> geometry) {
  geometry_ = std::move(geometry);
  onModelReset();
}

double CanvasScene::connectionMargin() const { return StyleCollection::connectionStyle().pointDiameter(); }

NodeItem *CanvasScene::nodeItem(NodeId id) const {
  const auto found = nodes_.find(id);
  return found == nodes_.end() ? nullptr : found->second.get();
}

ConnectionItem *CanvasScene::connectionItem(const ConnectionId &id) const {
  const auto found = connections_.find(id);
  return found == connections_.end() ? nullptr : found->second.get();
}

QList<NodeItem *> CanvasScene::nodeItems() const {
  QList<NodeItem *> items;
  items.reserve(qsizetype(nodes_.size()));
  for (const auto &[id, item] : nodes_) { items.append(item.get()); }
  return items;
}

QList<ConnectionItem *> CanvasScene::connectionItems() const {
  QList<ConnectionItem *> items;
  items.reserve(qsizetype(connections_.size()));
  for (const auto &[id, item] : connections_) { items.append(item.get()); }
  return items;
}

ConnectionItem &CanvasScene::makeDraftConnection(const ConnectionId &incomplete) {
  resetDraftConnection();
  draft_ = std::make_unique<ConnectionItem>(*this, incomplete);
  grabMouse(*draft_);
  return *draft_;
}

void CanvasScene::resetDraftConnection() {
  // The item unregisters itself, which releases its grab.
  draft_.reset();
}

void CanvasScene::traverseGraphAndPopulateGraphicsObjects() {
  const auto allNodeIds = model_.allNodeIds();
  // First create all the nodes. A reset keeps the items that exist.
  for (const NodeId nodeId : allNodeIds) {
    if (!nodes_.contains(nodeId)) { nodes_[nodeId] = std::make_unique<NodeItem>(*this, nodeId); }
  }
  // Then for each node check output connections and insert them.
  for (const NodeId nodeId : allNodeIds) {
    const auto nOutPorts = model_.nodeData<PortCount>(nodeId, NodeRole::OutPortCount);
    for (PortIndex index = 0; index < nOutPorts; ++index) {
      for (const auto &cid : model_.connections(nodeId, PortType::Out, index)) {
        if (!connections_.contains(cid)) { connections_[cid] = std::make_unique<ConnectionItem>(*this, cid); }
      }
    }
  }
}

void CanvasScene::updateAttachedNodes(const ConnectionId &id, PortType side) {
  if (auto *node = nodeItem(getNodeId(side, id))) { node->markDirty(); }
}

void CanvasScene::onConnectionDeleted(const ConnectionId &id) {
  if (const auto found = connections_.find(id); found != connections_.end()) {
    // Move the item out first: its destructor can run selection slots that read the map.
    auto item = std::move(found->second);
    connections_.erase(found);
    item.reset();
  }
  if (draft_ && draft_->connectionId() == id) { draft_.reset(); }
  updateAttachedNodes(id, PortType::Out);
  updateAttachedNodes(id, PortType::In);
  emit modified(this);
}

void CanvasScene::onConnectionCreated(const ConnectionId &id) {
  connections_[id] = std::make_unique<ConnectionItem>(*this, id);
  updateAttachedNodes(id, PortType::Out);
  updateAttachedNodes(id, PortType::In);
  emit modified(this);
}

void CanvasScene::onNodeDeleted(NodeId id) {
  if (const auto found = nodes_.find(id); found != nodes_.end()) {
    auto item = std::move(found->second);
    nodes_.erase(found);
    item.reset();
    emit modified(this);
  }
}

void CanvasScene::onNodeCreated(NodeId id) {
  nodes_[id] = std::make_unique<NodeItem>(*this, id);
  emit modified(this);
}

void CanvasScene::onNodePositionUpdated(NodeId id) {
  if (auto *node = nodeItem(id)) {
    node->syncPosition();
    nodeDrag_ = true;
  }
}

void CanvasScene::onNodeUpdated(NodeId id) {
  if (auto *node = nodeItem(id)) {
    node->setGeometryChanged();
    geometry_->recomputeSize(id);
    node->moveConnections();
  }
}

void CanvasScene::onNodeClicked(NodeId id) {
  if (nodeDrag_) {
    emit nodeMoved(id, model_.nodeData(id, NodeRole::Position).value<QPointF>());
    emit modified(this);
  }
  nodeDrag_ = false;
}

// QtNodes clears the scene and rebuilds every item. This scene keeps the
// items of nodes and connections that still exist, with their rasters, so a
// reset never shows a blank card. Each kept item reads the model again. The
// selection is cleared, as a rebuilt QGraphicsScene starts without one.
void CanvasScene::onModelReset() {
  {
    SelectionBatch batch(*this);
    draft_.reset();
    clearSelection();
    cancelMouseGrab();
    setFocusItem(nullptr);
    if (!geometry_) {
      connections_.clear();
      nodes_.clear();
    } else {
      std::unordered_set<NodeId> nodes;
      std::unordered_set<ConnectionId> connections;
      for (const auto id : model_.allNodeIds()) {
        nodes.insert(id);
        for (const auto &connection : model_.allConnectionIds(id)) { connections.insert(connection); }
      }
      // Move each removed item out first: its destructor can run selection
      // slots that read the maps.
      for (auto it = connections_.begin(); it != connections_.end();) {
        if (connections.contains(it->first)) {
          ++it;
          continue;
        }
        auto item = std::move(it->second);
        it = connections_.erase(it);
        item.reset();
      }
      for (auto it = nodes_.begin(); it != nodes_.end();) {
        if (nodes.contains(it->first)) {
          ++it;
          continue;
        }
        auto item = std::move(it->second);
        it = nodes_.erase(it);
        item.reset();
      }
    }
  }
  if (geometry_) {
    for (const auto id : model_.allNodeIds()) {
      if (auto *node = nodeItem(id)) {
        geometry_->recomputeSize(id);
        node->setGeometryChanged();
        node->syncPosition();
      }
    }
    traverseGraphAndPopulateGraphicsObjects();
    for (auto &[id, connection] : connections_) {
      connection->move();
      connection->markDirty();
    }
  }
  notifyChanged();
}

QList<NodeId> CanvasScene::selectedNodes() const {
  QList<NodeId> ids;
  for (const auto key : selected_) {
    if (const auto *node = dynamic_cast<const NodeItem *>(items_.value(key))) { ids.append(node->nodeId()); }
  }
  return ids;
}

QList<ConnectionId> CanvasScene::selectedConnections() const {
  QList<ConnectionId> ids;
  for (const auto key : selected_) {
    if (const auto *wire = dynamic_cast<const ConnectionItem *>(items_.value(key))) { ids.append(wire->connectionId()); }
  }
  return ids;
}

void CanvasScene::setSelected(CanvasItem &item, bool selected) {
  if (selected == selected_.contains(item.indexKey())) { return; }
  if (selected) {
    selected_.insert(item.indexKey());
  } else {
    selected_.remove(item.indexKey());
  }
  item.markDirty();
  selectionTouched();
}

void CanvasScene::clearSelection() {
  SelectionBatch batch(*this);
  const auto keys = selected_;
  for (const auto key : keys) {
    if (auto *item = items_.value(key)) { setSelected(*item, false); }
  }
  selected_.clear();
}

void CanvasScene::selectionTouched() {
  selectionDirty_ = true;
  if (selectionBatch_ == 0) {
    selectionDirty_ = false;
    if (!selectionGate_.signalsBlocked()) { emit selectionChanged(); }
  }
}

CanvasScene::SelectionBatch::SelectionBatch(CanvasScene &scene) : scene_(scene) { ++scene_.selectionBatch_; }

CanvasScene::SelectionBatch::~SelectionBatch() {
  if (--scene_.selectionBatch_ == 0 && scene_.selectionDirty_) {
    scene_.selectionDirty_ = false;
    if (!scene_.selectionGate_.signalsBlocked()) { emit scene_.selectionChanged(); }
  }
}

void CanvasScene::setSelectionArea(const QPainterPath &area, Qt::ItemSelectionOperation operation) {
  SelectionBatch batch(*this);
  QSet<quint64> inside;
  for (auto *item : itemsIn(area.boundingRect())) {
    const bool selectable = item->kind() == CanvasItem::Kind::Connection
                                ? !static_cast<ConnectionItem *>(item)->connectionState().requiresPort()
                                : item->kind() == CanvasItem::Kind::Node && !static_cast<NodeItem *>(item)->locked();
    if (!selectable) { continue; }
    // Qt::IntersectsItemShape: a card's shape is its bounding rectangle.
    QPainterPath shape;
    if (item->kind() == CanvasItem::Kind::Connection) {
      shape = static_cast<ConnectionItem *>(item)->hitPath();
    } else {
      shape.addRect(item->sceneBoundingRect());
    }
    if (!area.intersects(shape) && !area.contains(shape)) { continue; }
    inside.insert(item->indexKey());
    setSelected(*item, true);
  }
  if (operation == Qt::ReplaceSelection) {
    const auto keys = selected_;
    for (const auto key : keys) {
      if (inside.contains(key)) { continue; }
      if (auto *item = items_.value(key)) { setSelected(*item, false); }
    }
  }
}

QList<CanvasItem *> CanvasScene::itemsIn(const QRectF &area) const {
  QList<CanvasItem *> items;
  for (const auto key : index_.query(area)) {
    auto *item = items_.value(key);
    if (item && item->effectivelyShown()) { items.append(item); }
  }
  return items;
}

QList<CanvasItem *> CanvasScene::itemsAt(const QPointF &point) const {
  QList<CanvasItem *> items;
  for (const auto key : index_.query(point)) {
    auto *item = items_.value(key);
    if (item && item->effectivelyShown() && item->hitTest(point)) { items.append(item); }
  }
  std::sort(items.begin(), items.end(), topmostFirst);
  return items;
}

NodeItem *CanvasScene::nodeAt(const QPointF &point) const {
  NodeItem *top = nullptr;
  for (const auto key : index_.query(point)) {
    auto *item = items_.value(key);
    if (item && item->kind() == CanvasItem::Kind::Node && item->effectivelyShown() && item->hitTest(point) &&
        (!top || topmostFirst(item, top))) {
      top = static_cast<NodeItem *>(item);
    }
  }
  return top;
}

void CanvasScene::grabMouse(CanvasItem &item) { grabber_ = &item; }

void CanvasScene::ungrabMouse(CanvasItem &item) {
  if (grabber_ == &item) { grabber_ = nullptr; }
}

void CanvasScene::setFocusItem(CanvasItem *item) { focus_ = item; }

bool CanvasScene::deliverPress(CanvasMouseEvent &event, bool doubleClick) {
  // Deliver to an existing mouse grabber. The mouse is grabbed, so the event counts as taken.
  if (grabber_) {
    event.accept();
    if (doubleClick) {
      grabber_->mouseDoubleClick(event);
    } else {
      grabber_->mousePress(event);
    }
    return true;
  }
  const auto candidates = itemsAt(event.scenePos);
  // Lineage links take keyboard focus on a click. Nothing else here takes focus.
  CanvasItem *focus = nullptr;
  for (auto *item : candidates) {
    if (item->kind() == CanvasItem::Kind::Lineage) { focus = item; }
    break;
  }
  if (focus_ != focus) { setFocusItem(focus); }
  for (auto *item : candidates) {
    // Skip items that do not accept the event's mouse button.
    if (!(item->canvasButtons() & event.button)) { continue; }
    const QPointer<CanvasItem> guard(item);
    grabber_ = item;
    event.accept();
    // A double-click on an item other than the last grabber is a press.
    if (doubleClick && (item == lastGrabber_ || !lastGrabber_)) {
      item->mouseDoubleClick(event);
    } else {
      item->mousePress(event);
    }
    if (event.accepted) {
      lastGrabber_ = guard ? item : nullptr;
      return true;
    }
    if (grabber_ == item) { grabber_ = nullptr; }
    if (!guard) { break; }
  }
  // No item took the press. Clear the selection unless the view drags by hand
  // or Ctrl extends it, and leave the event to the view.
  grabber_ = nullptr;
  event.ignore();
  if (!handDrag_ && !event.modifiers.testFlag(Qt::ControlModifier)) { clearSelection(); }
  return false;
}

void CanvasScene::deliverMove(CanvasMouseEvent &event) {
  // QGraphicsScene keeps the hover state while an item holds the mouse.
  if (grabber_) {
    event.accept();
    grabber_->mouseMove(event);
    return;
  }
  deliverHover(event);
}

void CanvasScene::deliverHover(const CanvasMouseEvent &event) {
  // Hover goes to the topmost item that accepts hover. A decoration keeps
  // its card hovered too, as QGraphicsScene hovers the common ancestors.
  CanvasItem *target = nullptr;
  CanvasItem *child = nullptr;
  for (auto *item : itemsAt(event.scenePos)) {
    if (!item->acceptsCanvasHover()) { continue; }
    if (item->kind() == CanvasItem::Kind::Decoration) {
      child = item;
      target = dynamic_cast<NodeItem *>(item->parentItem());
    } else {
      target = item;
    }
    break;
  }
  setHoverItem(target, child, event);
  if (target) { target->hoverMove(event); }
  if (child) { child->hoverMove(event); }
}

void CanvasScene::deliverRelease(CanvasMouseEvent &event) {
  if (!grabber_) {
    event.ignore();
    return;
  }
  auto *item = grabber_;
  const QPointer<CanvasItem> guard(item);
  event.accept();
  item->mouseRelease(event);
  if (!event.buttons && guard && grabber_ == item) { grabber_ = nullptr; }
}

bool CanvasScene::deliverKey(QKeyEvent &event) { return focus_ && focus_->keyPress(event); }

void CanvasScene::cancelMouseGrab() {
  if (auto *node = dynamic_cast<NodeItem *>(grabber_)) { node->nodeState().setResizing(false); }
  grabber_ = lastGrabber_ = nullptr;
  nodeDrag_ = false;
  clearHover();
}

void CanvasScene::clearHover() { setHoverItem(nullptr, nullptr, {}); }

void CanvasScene::setHoverItem(CanvasItem *item, CanvasItem *child, const CanvasMouseEvent &event) {
  if (hoverChild_ != child) {
    if (auto *previous = std::exchange(hoverChild_, nullptr)) { previous->hoverLeave(event); }
  }
  if (hover_ != item) {
    if (auto *previous = std::exchange(hover_, item)) { previous->hoverLeave(event); }
    if (hover_) { hover_->hoverEnter(event); }
  }
  if (hoverChild_ != child) {
    hoverChild_ = child;
    if (hoverChild_) { hoverChild_->hoverEnter(event); }
  }
}

void CanvasScene::registerItem(CanvasItem &item) { items_.insert(item.indexKey(), &item); }

void CanvasScene::unregisterItem(CanvasItem &item) {
  const auto key = item.indexKey();
  if (!items_.remove(key)) { return; }
  index_.remove(key);
  ++indexRevision_;
  if (grabber_ == &item) { grabber_ = nullptr; }
  if (hover_ == &item) { hover_ = nullptr; }
  if (focus_ == &item) { focus_ = nullptr; }
  if (lastGrabber_ == &item) { lastGrabber_ = nullptr; }
  if (hoverChild_ == &item) { hoverChild_ = nullptr; }
  if (destroying_) { return; }
  if (selected_.remove(key)) { selectionTouched(); }
  notifyChanged();
  requestRaster();
}

void CanvasScene::updateIndex(CanvasItem &item) {
  const auto key = item.indexKey();
  if (!items_.contains(key)) { return; }
  if (item.effectivelyShown()) {
    const auto bounds = item.sceneBoundingRect();
    if (index_.contains(key) && index_.bounds(key) == bounds) { return; }
    index_.insert(key, bounds);
  } else {
    if (!index_.contains(key)) { return; }
    index_.remove(key);
  }
  ++indexRevision_;
}

void CanvasScene::forgetItem(CanvasItem &item) { unregisterItem(item); }

void CanvasScene::requestRaster() { emit rasterRequested(); }

void CanvasScene::notifyChanged() {
  if (changedPending_) { return; }
  changedPending_ = true;
  QTimer::singleShot(0, this, &CanvasScene::emitChanged);
}

void CanvasScene::emitChanged() {
  changedPending_ = false;
  emit changed();
}

} // namespace nodetool::canvas
