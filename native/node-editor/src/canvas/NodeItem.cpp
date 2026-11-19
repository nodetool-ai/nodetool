// Adapted from QtNodes src/NodeGraphicsObject.cpp at commit
// 829b18457d4e95ac17f4fdb01c6201125681729d.
// Copyright (c) 2022, Dmitry Pinaev. All rights reserved.
// BSD-3-Clause, see licenses/QtNodes-BSD-3-Clause.txt.
// Changed: see NodeItem.h.
#include "canvas/NodeItem.h"

#include "canvas/CanvasScene.h"
#include "canvas/ConnectionItem.h"
#include "canvas/NodeConnectionInteraction.h"
#include <QtNodes/AbstractGraphModel>
#include <QtNodes/ConnectionIdUtils>
#include <QtNodes/internal/AbstractNodeGeometry.hpp>
#include <QPainter>

namespace nodetool::canvas {
using namespace QtNodes;

NodeItem::NodeItem(CanvasScene &scene, NodeId id) : CanvasItem(scene, Kind::Node, &scene.layer()), id_(id), state_(*this) {
  setAcceptsCanvasHover(true);
  // The raster pass shows the item once it is near the view.
  setVisible(false);
  setStackZ(0);
  setGeometryChanged();
  syncPosition();
}

NodeItem::~NodeItem() = default;

QRectF NodeItem::boundingRect() const {
  auto *scene = canvasScene();
  return scene ? scene->nodeGeometry().boundingRect(id_) : QRectF{};
}

QRectF NodeItem::sceneBoundingRect() const { return boundingRect().translated(scenePosition()); }

bool NodeItem::isSelected() const {
  auto *scene = canvasScene();
  return scene && scene->isSelected(*this);
}

void NodeItem::setSelected(bool selected) {
  // A locked card is not selectable, as QGraphicsItem ignores setSelected without ItemIsSelectable.
  if (selected && locked()) { return; }
  if (auto *scene = canvasScene()) { scene->setSelected(*this, selected); }
}

bool NodeItem::locked() const {
  auto *scene = canvasScene();
  return scene && scene->graphModel().nodeFlags(id_).testFlag(NodeFlag::Locked);
}

void NodeItem::setGeometryChanged() {
  if (auto *scene = canvasScene()) {
    setSize(scene->nodeGeometry().size(id_));
    reindex();
    for (auto *child : childItems()) {
      if (auto *decoration = dynamic_cast<CanvasItem *>(child)) { decoration->reindex(); }
    }
  }
  markDirty();
}

void NodeItem::moveConnections() const {
  auto *scene = canvasScene();
  if (!scene) { return; }
  for (const auto &id : scene->graphModel().allConnectionIds(id_)) {
    if (auto *connection = scene->connectionItem(id)) { connection->move(); }
  }
}

void NodeItem::reactToConnection(const ConnectionItem *connection) {
  state_.storeConnectionForReaction(connection);
  markDirty();
}

void NodeItem::syncPosition() {
  auto *scene = canvasScene();
  if (!scene) { return; }
  const auto position = scene->graphModel().nodeData(id_, NodeRole::Position).value<QPointF>();
  if (position != this->position()) {
    setPosition(position);
    reindex();
    for (auto *child : childItems()) {
      if (auto *decoration = dynamic_cast<CanvasItem *>(child)) {
        decoration->reindex();
        decoration->update();
      }
    }
    scene->notifyChanged();
  }
  // ItemScenePositionHasChanged moves the connections.
  moveConnections();
}

void NodeItem::paintRaster(QPainter &painter, double zoom) const {
  if (auto *scene = canvasScene()) { scene->paintNode(painter, *this, zoom); }
}

void NodeItem::setStackZ(double z) {
  stackZ_ = z;
  applyZ();
}

void NodeItem::setProjectedStack(int order, double z) {
  if (order_ == order && stackZ_ == z) { return; }
  order_ = order;
  setStackZ(z);
}

// Cards of equal z keep the document's stacking order, as stackBefore orders
// QtNodes items, so every card has a z of its own.
void NodeItem::applyZ() { setZ(stackZ_ + order_ * 1e-7); }

void NodeItem::mousePress(CanvasMouseEvent &event) {
  auto *scene = canvasScene();
  if (!scene || locked()) { return; }
  auto &model = scene->graphModel();
  auto &geometry = scene->nodeGeometry();
  for (const PortType portToCheck : {PortType::In, PortType::Out}) {
    const QPointF nodeCoord = event.scenePos - scenePosition();
    const PortIndex portIndex = geometry.checkPortHit(id_, portToCheck, nodeCoord);
    if (portIndex == InvalidPortIndex) { continue; }
    const auto connected = model.connections(id_, portToCheck, portIndex);
    // Start dragging an existing connection.
    if (!connected.empty() && portToCheck == PortType::In) {
      const auto connectionId = *connected.begin();
      if (auto *connection = scene->connectionItem(connectionId)) {
        NodeConnectionInteraction interaction(*this, *connection, *scene);
        if (model.detachPossible(connectionId)) { interaction.disconnect(portToCheck); }
      }
    } else {
      // Initialize a new connection.
      if (portToCheck == PortType::Out) {
        const auto outPolicy =
            model.portData(id_, portToCheck, portIndex, PortRole::ConnectionPolicyRole).value<ConnectionPolicy>();
        if (!connected.empty() && outPolicy == ConnectionPolicy::One) {
          for (const auto &id : connected) { model.deleteConnection(id); }
        }
      }
      const ConnectionId incompleteConnectionId = makeIncompleteConnectionId(id_, portToCheck, portIndex);
      // From the moment of creation a draft connection grabs the mouse events
      // and waits for the mouse button release.
      scene->makeDraftConnection(incompleteConnectionId);
    }
  }
  // QGraphicsItem::mousePressEvent with ItemIsSelectable and ItemIsMovable.
  if (event.button == Qt::LeftButton && !event.modifiers.testFlag(Qt::ControlModifier) && !isSelected()) {
    {
      CanvasScene::SelectionBatch batch(*scene);
      scene->clearSelection();
      setSelected(true);
    }
  }
  if (isSelected()) { emit scene->nodeSelected(id_); }
}

void NodeItem::mouseMove(CanvasMouseEvent &event) {
  auto *scene = canvasScene();
  if (!scene) { return; }
  // Deselect all other items after this one is selected, unless Ctrl adds
  // this item to the selected group before moving.
  if (!isSelected()) {
    CanvasScene::SelectionBatch batch(*scene);
    if (!event.modifiers.testFlag(Qt::ControlModifier)) { scene->clearSelection(); }
    setSelected(true);
  }
  const auto diff = event.scenePos - event.lastScenePos;
  // MoveNodeCommand::redo over the selected cards.
  auto &model = scene->graphModel();
  for (const auto id : scene->selectedNodes()) {
    auto position = model.nodeData(id, NodeRole::Position).value<QPointF>();
    position += diff;
    model.setNodeData(id, NodeRole::Position, position);
  }
  event.accept();
}

void NodeItem::mouseRelease(CanvasMouseEvent &event) {
  auto *scene = canvasScene();
  if (!scene) { return; }
  state_.setResizing(false);
  // QGraphicsItem::mouseReleaseEvent: a click without movement selects this
  // card alone, or toggles it with Ctrl.
  if (event.button == Qt::LeftButton && !locked() && event.scenePos == event.buttonDownScenePos) {
    if (event.modifiers.testFlag(Qt::ControlModifier)) {
      setSelected(!isSelected());
    } else {
      CanvasScene::SelectionBatch batch(*scene);
      const auto selected = scene->selectedNodes();
      for (const auto id : selected) {
        if (id != id_) {
          if (auto *other = scene->nodeItem(id)) { other->setSelected(false); }
        }
      }
      for (const auto &id : scene->selectedConnections()) {
        if (auto *wire = scene->connectionItem(id)) { scene->setSelected(*wire, false); }
      }
      setSelected(true);
    }
  }
  // Position connections precisely after a fast node move.
  moveConnections();
  emit scene->nodeClicked(id_);
}

void NodeItem::mouseDoubleClick(CanvasMouseEvent &event) {
  // QGraphicsItem::mouseDoubleClickEvent calls the press handler.
  mousePress(event);
  if (auto *scene = canvasScene()) { emit scene->nodeDoubleClicked(id_); }
}

void NodeItem::hoverEnter(const CanvasMouseEvent &event) {
  auto *scene = canvasScene();
  if (!scene) { return; }
  // Bring all the colliding cards to the background, and this card forward.
  for (auto *item : scene->itemsIn(sceneBoundingRect())) {
    auto *node = dynamic_cast<NodeItem *>(item);
    if (node && node != this && node->stackZ() > 0) { node->setStackZ(0); }
  }
  setStackZ(1);
  state_.setHovered(true);
  markDirty();
  emit scene->nodeHovered(id_, event.screenPos);
}

void NodeItem::hoverLeave(const CanvasMouseEvent &) {
  auto *scene = canvasScene();
  state_.setHovered(false);
  setStackZ(0);
  markDirty();
  if (scene) { emit scene->nodeHoverLeft(id_); }
}

bool NodeItem::contains(const QPointF &point) const { return boundingRect().contains(point); }

} // namespace nodetool::canvas
