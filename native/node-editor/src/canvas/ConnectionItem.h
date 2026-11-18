// Adapted from QtNodes include/QtNodes/internal/ConnectionGraphicsObject.hpp
// and src/ConnectionGraphicsObject.cpp at commit
// 829b18457d4e95ac17f4fdb01c6201125681729d.
// Copyright (c) 2022, Dmitry Pinaev. All rights reserved.
// BSD-3-Clause, see licenses/QtNodes-BSD-3-Clause.txt.
// Changed: a QQuickItem that shows a texture the wire painter fills. The item
// sits at the scene origin, so its end points are scene coordinates. shape()
// is hitPath(). Only the horizontal control points are kept.
#pragma once

#include "canvas/CanvasItem.h"
#include "canvas/CanvasState.h"
#include <QtNodes/Definitions>
#include <QPainterPath>
#include <utility>

namespace nodetool::canvas {

// UI thread only. Owned by its CanvasScene through std::unique_ptr, as a model
// connection or as the draft. Its visual parent is the content layer.
class ConnectionItem final : public CanvasItem {
public:
  ConnectionItem(CanvasScene &scene, const QtNodes::ConnectionId &id);
  ~ConnectionItem() override;

  const QtNodes::ConnectionId &connectionId() const { return id_; }
  ConnectionState &connectionState() { return state_; }
  const ConnectionState &connectionState() const { return state_; }
  QRectF boundingRect() const;
  QRectF sceneBoundingRect() const override { return boundingRect(); }
  QPainterPath hitPath() const;
  bool hitTest(const QPointF &scenePoint) const override;
  const QPointF &endPoint(QtNodes::PortType side) const;
  void setEndPoint(QtNodes::PortType side, const QPointF &point);
  // Moves both ends onto their ports and repaints.
  void move();
  std::pair<QPointF, QPointF> pointsC1C2() const;
  bool isSelected() const;
  void paintRaster(QPainter &painter, double zoom) const override;
  void setStackZ(double z);

  void mousePress(CanvasMouseEvent &event) override;
  void mouseMove(CanvasMouseEvent &event) override;
  void mouseRelease(CanvasMouseEvent &event) override;
  void hoverEnter(const CanvasMouseEvent &event) override;
  void hoverLeave(const CanvasMouseEvent &event) override;

private:
  void initializePosition();
  void geometryMoved();
  QtNodes::ConnectionId id_;
  ConnectionState state_;
  QPointF out_;
  QPointF in_;
};

} // namespace nodetool::canvas
