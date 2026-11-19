// Adapted from QtNodes include/QtNodes/internal/NodeState.hpp, src/NodeState.cpp,
// include/QtNodes/internal/ConnectionState.hpp and src/ConnectionState.cpp at
// commit 829b18457d4e95ac17f4fdb01c6201125681729d.
// Copyright (c) 2022, Dmitry Pinaev. All rights reserved.
// BSD-3-Clause, see licenses/QtNodes-BSD-3-Clause.txt.
// Changed: the states refer to the Quick canvas items, the node state keeps a
// QPointer to the reacting connection item, and both classes are in
// nodetool::canvas.
#pragma once

#include <qtnodes/Definitions.hpp>
#include <QPointer>

namespace nodetool::canvas {
class ConnectionItem;
class NodeItem;

// UI thread only. Stores the hover flag, the resizing flag and the draft
// connection a card reacts to. The card item owns its state.
class NodeState {
public:
  explicit NodeState(NodeItem &item) : item_(item) {}
  bool hovered() const { return hovered_; }
  void setHovered(bool hovered = true) { hovered_ = hovered; }
  void setResizing(bool resizing) { resizing_ = resizing; }
  bool resizing() const { return resizing_; }
  const ConnectionItem *connectionForReaction() const;
  void storeConnectionForReaction(const ConnectionItem *item);
  void resetConnectionForReaction();

private:
  NodeItem &item_;
  bool hovered_ = false;
  bool resizing_ = false;
  // QPointer clears itself when the connection item is destroyed.
  QPointer<const ConnectionItem> connectionForReaction_;
};

// UI thread only. Stores the dragged end and the last hovered card of a
// connection. The connection item owns its state.
class ConnectionState {
public:
  explicit ConnectionState(ConnectionItem &item) : item_(item) {}
  ConnectionState(const ConnectionState &) = delete;
  ConnectionState &operator=(const ConnectionState &) = delete;

  // The port a draft still needs, or None for a complete connection.
  QtNodes::PortType requiredPort() const;
  bool requiresPort() const;
  bool hovered() const { return hovered_; }
  void setHovered(bool hovered) { hovered_ = hovered; }
  void setLastHoveredNode(QtNodes::NodeId id) { lastHoveredNode_ = id; }
  QtNodes::NodeId lastHoveredNode() const { return lastHoveredNode_; }
  void resetLastHoveredNode();

private:
  ConnectionItem &item_;
  bool hovered_ = false;
  QtNodes::NodeId lastHoveredNode_ = QtNodes::InvalidNodeId;
};

} // namespace nodetool::canvas
