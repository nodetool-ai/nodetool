#include "NodeInfo.h"

#include "graph/NodeDocumentation.h"
#include "interfaces/Assign.h"

namespace nodetool::node_editor {

NodeInfo::NodeInfo(QObject *parent) : QObject(parent) {}

NodeInfo::~NodeInfo() = default;

void NodeInfo::setNode(const QString &nodeId, const QString &title, const QString &nodeNamespace,
                       const QString &documentation, const QString &errorMessage) {
    const auto parts = splitNodeDocumentation(documentation);
    // Bitwise or, so every field is assigned.
    if (assign(nodeId_, nodeId) | assign(title_, title) | assign(namespace_, nodeNamespace)
        | assign(description_, parts.description) | assign(tags_, parts.tags)
        | assign(useCases_, parts.useCases) | assign(errorMessage_, errorMessage)) {
        emit changed();
    }
}

void NodeInfo::clear() {
    setNode({}, {}, {}, {}, {});
}

void NodeInfo::setMaximumHeight(qreal height) {
    if (assign(maximumHeight_, height)) {
        emit maximumHeightChanged();
    }
}

}  // namespace nodetool::node_editor
