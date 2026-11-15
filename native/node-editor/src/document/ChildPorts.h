#pragma once
#include <QJsonArray>
#include <QJsonObject>
namespace nodetool::node_editor {
bool isChildNode(const QJsonObject &node);
QString childGraphKey(const QJsonObject &node);
QJsonObject childGraph(const QJsonObject &node);
// The graph with the Input and Output nodes the server derives for a stored
// Comfy graph (exposeComfyInterface in packages/protocol/src/comfy-graph.ts).
// Any other graph is returned unchanged.
QJsonObject exposeComfyInterface(const QJsonObject &graph);
QJsonObject withChildPorts(const QJsonObject &node,
                           const QJsonArray &metadata = {});
void removeStaleChildEdges(const QJsonObject &previous, const QJsonObject &next,
                           QJsonArray &edges);
} // namespace nodetool::node_editor
