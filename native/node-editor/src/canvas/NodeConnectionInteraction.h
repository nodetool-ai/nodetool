// Adapted from QtNodes include/QtNodes/internal/NodeConnectionInteraction.hpp
// and src/NodeConnectionInteraction.cpp at commit
// 829b18457d4e95ac17f4fdb01c6201125681729d.
// Copyright (c) 2022, Dmitry Pinaev. All rights reserved.
// BSD-3-Clause, see licenses/QtNodes-BSD-3-Clause.txt.
// Changed: works on the Quick canvas items and scene. tryConnect and
// disconnect call addConnection and deleteConnection on the model, as
// ConnectCommand::redo and DisconnectCommand::redo did, instead of pushing
// undo commands.
#pragma once

#include <QtNodes/Definitions>
#include <QPointF>

namespace nodetool::canvas {
class CanvasScene;
class ConnectionItem;
class NodeItem;

// UI thread only. Wraps the connect and disconnect checks of one card and one
// connection. Create it on the stack; it borrows all three objects.
class NodeConnectionInteraction {
public:
  NodeConnectionInteraction(NodeItem &node, ConnectionItem &connection, CanvasScene &scene);

  // Can connect when the connection requires a port, its loose end is over a
  // port of this card, and the model permits the connection.
  bool canConnect(QtNodes::PortIndex *portIndex) const;
  // Creates the connection if possible. The draft is destroyed first.
  bool tryConnect() const;
  // Deletes the connection, makes a draft with the incomplete id and puts its
  // loose end on the port, then repaints both cards.
  bool disconnect(QtNodes::PortType portToDisconnect) const;

private:
  QtNodes::PortType connectionRequiredPort() const;
  QPointF nodePortScenePosition(QtNodes::PortType portType, QtNodes::PortIndex portIndex) const;
  QtNodes::PortIndex nodePortIndexUnderScenePoint(QtNodes::PortType portType, const QPointF &scenePoint) const;

  NodeItem &node_;
  ConnectionItem &connection_;
  CanvasScene &scene_;
};

} // namespace nodetool::canvas
