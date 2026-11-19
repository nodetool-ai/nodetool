// Adapted from QtNodes src/NodeConnectionInteraction.cpp at commit
// 829b18457d4e95ac17f4fdb01c6201125681729d.
// Copyright (c) 2022, Dmitry Pinaev. All rights reserved.
// BSD-3-Clause, see licenses/QtNodes-BSD-3-Clause.txt.
// Changed: see NodeConnectionInteraction.h.
#include "canvas/NodeConnectionInteraction.h"

#include "canvas/CanvasScene.h"
#include "canvas/ConnectionItem.h"
#include "canvas/NodeItem.h"
#include <QtNodes/AbstractGraphModel>
#include <QtNodes/ConnectionIdUtils>
#include <QtNodes/internal/AbstractNodeGeometry.hpp>
#include <QTransform>

namespace nodetool::canvas {
using namespace QtNodes;

NodeConnectionInteraction::NodeConnectionInteraction(NodeItem &node, ConnectionItem &connection, CanvasScene &scene)
    : node_(node), connection_(connection), scene_(scene) {}

// This is the check from the perspective of the connection item.
bool NodeConnectionInteraction::canConnect(PortIndex *portIndex) const {
  // 1. Connection requires a port.
  const PortType requiredPort = connection_.connectionState().requiredPort();
  if (requiredPort == PortType::None) { return false; }

  // 2. Connection loose end is above the node port. The item's coordinates are scene coordinates.
  const QPointF connectionPoint = connection_.endPoint(requiredPort);
  *portIndex = nodePortIndexUnderScenePoint(requiredPort, connectionPoint);
  if (*portIndex == InvalidPortIndex) { return false; }

  // 3. Model permits connection.
  const ConnectionId connectionId =
      makeCompleteConnectionId(connection_.connectionId(), node_.nodeId(), *portIndex);
  return scene_.graphModel().connectionPossible(connectionId);
}

bool NodeConnectionInteraction::tryConnect() const {
  // 1. Check conditions from 'canConnect'.
  PortIndex targetPortIndex = InvalidPortIndex;
  if (!canConnect(&targetPortIndex)) { return false; }

  // 2. Create new connection. The draft is destroyed first, so copy its id.
  const ConnectionId incompleteConnectionId = connection_.connectionId();
  const ConnectionId newConnectionId = makeCompleteConnectionId(incompleteConnectionId, node_.nodeId(), targetPortIndex);
  auto &scene = scene_;
  scene.resetDraftConnection();
  // ConnectCommand::redo.
  scene.graphModel().addConnection(newConnectionId);
  return true;
}

bool NodeConnectionInteraction::disconnect(PortType portToDisconnect) const {
  const ConnectionId connectionId = connection_.connectionId();
  const auto scenePos = nodePortScenePosition(portToDisconnect, getPortIndex(portToDisconnect, connectionId));
  const NodeId connectedNodeId = getNodeId(oppositePort(portToDisconnect), connectionId);
  const NodeId disconnectedNodeId = getNodeId(portToDisconnect, connectionId);
  auto &scene = scene_;

  // DisconnectCommand::redo. This destroys the connection item.
  scene.graphModel().deleteConnection(connectionId);

  // Converted to a draft connection with the new incomplete id. It grabs the mouse.
  const ConnectionId incompleteConnectionId = makeIncompleteConnectionId(connectionId, portToDisconnect);
  auto &draft = scene.makeDraftConnection(incompleteConnectionId);
  draft.setEndPoint(portToDisconnect, scenePos);

  // Repaint connection points.
  if (auto *node = scene.nodeItem(connectedNodeId)) { node->markDirty(); }
  if (auto *node = scene.nodeItem(disconnectedNodeId)) { node->markDirty(); }
  return true;
}

PortType NodeConnectionInteraction::connectionRequiredPort() const {
  return connection_.connectionState().requiredPort();
}

QPointF NodeConnectionInteraction::nodePortScenePosition(PortType portType, PortIndex portIndex) const {
  const auto transform = QTransform::fromTranslate(node_.scenePosition().x(), node_.scenePosition().y());
  return scene_.nodeGeometry().portScenePosition(node_.nodeId(), portType, portIndex, transform);
}

PortIndex NodeConnectionInteraction::nodePortIndexUnderScenePoint(PortType portType, const QPointF &scenePoint) const {
  const QPointF nodePoint = scenePoint - node_.scenePosition();
  return scene_.nodeGeometry().checkPortHit(node_.nodeId(), portType, nodePoint);
}

} // namespace nodetool::canvas
