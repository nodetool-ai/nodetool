#pragma once
#include <QJsonObject>
#include <QStringList>

namespace nodetool::node_editor {
// Rewrites the graph without dropping extension fields on existing records.
QJsonObject groupIntoSubgraph(const QJsonObject &graph, const QStringList &ids,
                             const QJsonObject &subgraph);
}
