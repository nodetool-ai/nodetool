#include "graph/LineageLayer.h"

#include "graph/WorkflowGraphModel.h"
#include "ui/CanvasSurface.h"

namespace nodetool::node_editor {

QString LineageLayer::update(const QJsonObject &graph, const WorkflowGraphModel &model,
                             const CanvasSurface &canvas) {
  QHash<QString, QRectF> geometry;
  for (const auto id : model.allNodeIds()) {
    if (canvas.hasNode(id)) {
      geometry.insert(model.resourceId(id), canvas.nodeRect(id));
    }
  }
  return update(graph, geometry);
}

}
