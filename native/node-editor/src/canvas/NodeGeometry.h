#pragma once

#include <qtnodes/AbstractNodeGeometry.hpp>

namespace nodetool {
class WorkflowGraphModel;
}

namespace nodetool::canvas {

// UI thread only. Card geometry in card-local coordinates, shared by the QtNodes
// scene and the Quick scene. The model owns the cached bounds in its layouts.
class NodeGeometry final : public QtNodes::AbstractNodeGeometry {
public:
  explicit NodeGeometry(WorkflowGraphModel &model);
  QRectF boundingRect(QtNodes::NodeId id) const override;
  QSize size(QtNodes::NodeId id) const override;
  void recomputeSize(QtNodes::NodeId) const override {}
  QPointF portPosition(QtNodes::NodeId id, QtNodes::PortType type, QtNodes::PortIndex index) const override;
  QtNodes::PortIndex checkPortHit(QtNodes::NodeId id, QtNodes::PortType side, QPointF point) const override;
  QPointF portTextPosition(QtNodes::NodeId id, QtNodes::PortType type, QtNodes::PortIndex index) const override;
  QPointF captionPosition(QtNodes::NodeId) const override;
  QRectF captionRect(QtNodes::NodeId id) const override;
  QPointF widgetPosition(QtNodes::NodeId) const override { return {}; }
  QRect resizeHandleRect(QtNodes::NodeId) const override { return {}; }

private:
  WorkflowGraphModel &model_;
};

} // namespace nodetool::canvas
