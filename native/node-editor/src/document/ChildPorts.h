#pragma once
#include <QJsonArray>
#include <QJsonObject>
namespace nodetool::node_editor {
bool isChildNode(const QJsonObject &node);
QString childGraphKey(const QJsonObject &node);
QJsonObject childGraph(const QJsonObject &node);
QJsonObject withChildPorts(const QJsonObject &node,
                           const QJsonArray &metadata = {});
void removeStaleChildEdges(const QJsonObject &previous, const QJsonObject &next,
                           QJsonArray &edges);
} // namespace nodetool::node_editor
