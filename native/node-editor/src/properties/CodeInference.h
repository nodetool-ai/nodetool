#pragma once
#include <QJsonObject>
#include <QJsonArray>
namespace nodetool::node_editor {
QJsonObject withVisibleCodePorts(QJsonObject node);
QJsonObject withInferredCodePorts(QJsonObject node, const QJsonArray& edges = {});
}
