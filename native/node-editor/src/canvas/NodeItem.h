// Adapted from QtNodes include/QtNodes/internal/NodeGraphicsObject.hpp and
// src/NodeGraphicsObject.cpp at commit 829b18457d4e95ac17f4fdb01c6201125681729d.
// Copyright (c) 2022, Dmitry Pinaev. All rights reserved.
// BSD-3-Clause, see licenses/QtNodes-BSD-3-Clause.txt.
// Changed: a QQuickItem that shows a texture the card painter fills, instead
// of a QGraphicsObject that paints. Moves call the model directly in place of
// MoveNodeCommand. No embedded widget, no shadow effect, no resize handle.
#pragma once

#include "canvas/CanvasItem.h"
#include "canvas/CanvasState.h"
#include <qtnodes/Definitions.hpp>

namespace nodetool::canvas {
class ConnectionItem;

// UI thread only. Owned by its CanvasScene through std::unique_ptr. Its visual
// parent is the scene's content layer and it has no QObject parent. The item
// is positioned at the card's scene position, so its coordinates are card-local.
class NodeItem final : public CanvasItem {
public:
  NodeItem(CanvasScene &scene, QtNodes::NodeId id);
  ~NodeItem() override;

  QtNodes::NodeId nodeId() const { return id_; }
  NodeState &nodeState() { return state_; }
  const NodeState &nodeState() const { return state_; }
  // NodeGeometry::boundingRect: the card with its handles and badges.
  QRectF boundingRect() const;
  QRectF sceneBoundingRect() const override;
  bool isSelected() const;
  void setSelected(bool selected);
  // Locked cards neither move nor select (the model's NodeFlag::Locked).
  bool locked() const;

  // Re-reads the bounds after a size change.
  void setGeometryChanged();
  void moveConnections() const;
  void reactToConnection(const ConnectionItem *connection);
  // Follows the model position.
  void syncPosition();
  // Paints the card into a new texture at scale, for the logical zoom.
  QRectF rasterBounds() const override { return boundingRect(); }
  void paintRaster(QPainter &painter, double zoom) const override;
  // The QtNodes z: 0, or 1 while hovered. Groups sit below every card.
  void setStackZ(double z);
  double stackZ() const { return stackZ_; }
  void setProjectedStack(int order, double z);

  // Painter flags kept as the QGraphicsObject's dynamic properties were.
  bool headerActionHovered = false;
  bool footerHovered = false;

  void mousePress(CanvasMouseEvent &event) override;
  void mouseMove(CanvasMouseEvent &event) override;
  void mouseRelease(CanvasMouseEvent &event) override;
  void mouseDoubleClick(CanvasMouseEvent &event) override;
  void hoverEnter(const CanvasMouseEvent &event) override;
  void hoverLeave(const CanvasMouseEvent &event) override;
  bool contains(const QPointF &point) const override;

private:
  void applyZ();
  QtNodes::NodeId id_;
  NodeState state_;
  QRectF bounds_;
  double stackZ_ = 0;
  int order_ = 0;
};

} // namespace nodetool::canvas
