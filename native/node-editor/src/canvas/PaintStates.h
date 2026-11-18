#pragma once

#include "canvas/NodePainter.h"
#include "canvas/WirePainter.h"
#include <QtNodes/Definitions>
#include <functional>

namespace nodetool {
class EditorSceneApi;
class WorkflowGraphModel;
}

namespace nodetool::canvas {

// UI thread only. What a card item knows about itself, apart from the model.
struct CardItemState {
  QtNodes::NodeId id = QtNodes::InvalidNodeId;
  QRectF bounds;
  // The logical viewport zoom, never the raster scale of a texture.
  double zoom = 1;
  bool selected = false;
  bool hovered = false;
  bool headerActionHovered = false;
  bool footerHovered = false;
};

// UI thread only. Projects the scene, the model and one card into the card
// painter's state. The scene and model outlive the returned state.
CardPaintState cardPaintState(const EditorSceneApi &scene, const WorkflowGraphModel &model, const CardItemState &item);

// The wire's geometry and kind, which both painting and hit testing read.
WirePaintState wireGeometry(const WorkflowGraphModel &model, QtNodes::ConnectionId id, QPointF out, QPointF in, bool draft);

// Fills the run, selection and hover fields of a wire's paint state.
void fillWirePaintState(WirePaintState &state, const EditorSceneApi &scene, const WorkflowGraphModel &model,
                        QtNodes::ConnectionId id, bool selected, bool hovered, double zoom,
                        const std::function<bool(QtNodes::NodeId)> &nodeSelected);

} // namespace nodetool::canvas
