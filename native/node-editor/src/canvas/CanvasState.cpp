// Adapted from QtNodes src/NodeState.cpp and src/ConnectionState.cpp at commit
// 829b18457d4e95ac17f4fdb01c6201125681729d.
// Copyright (c) 2022, Dmitry Pinaev. All rights reserved.
// BSD-3-Clause, see licenses/QtNodes-BSD-3-Clause.txt.
// Changed: see CanvasState.h.
#include "canvas/CanvasState.h"

#include "canvas/CanvasScene.h"
#include "canvas/ConnectionItem.h"
#include "canvas/NodeItem.h"

namespace nodetool::canvas {
using namespace QtNodes;

const ConnectionItem *NodeState::connectionForReaction() const { return connectionForReaction_.data(); }

void NodeState::storeConnectionForReaction(const ConnectionItem *item) { connectionForReaction_ = item; }

void NodeState::resetConnectionForReaction() { connectionForReaction_.clear(); }

PortType ConnectionState::requiredPort() const {
  if (item_.connectionId().outNodeId == InvalidNodeId) { return PortType::Out; }
  if (item_.connectionId().inNodeId == InvalidNodeId) { return PortType::In; }
  return PortType::None;
}

bool ConnectionState::requiresPort() const {
  const auto &id = item_.connectionId();
  return id.outNodeId == InvalidNodeId || id.inNodeId == InvalidNodeId;
}

void ConnectionState::resetLastHoveredNode() {
  if (lastHoveredNode_ != InvalidNodeId) {
    if (auto *scene = item_.canvasScene()) {
      if (auto *node = scene->nodeItem(lastHoveredNode_)) { node->markDirty(); }
    }
  }
  lastHoveredNode_ = InvalidNodeId;
}

} // namespace nodetool::canvas
