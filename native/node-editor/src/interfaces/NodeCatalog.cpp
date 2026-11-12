#include "NodeCatalog.h"

#include "graph/CatalogCategories.h"

namespace nodetool::node_editor {

NodeCatalog::NodeCatalog(QObject *parent) : QObject(parent) {}

NodeCatalog::~NodeCatalog() = default;

QVariantList NodeCatalog::categories() const {
    return nodetool::catalogCategories();
}

QVariantList NodeCatalog::quickActions() const {
    return nodetool::catalogQuickActionSections();
}

void NodeCatalog::setNodes(const QVariantList &nodes) {
    if (nodes_ == nodes) {
        return;
    }
    nodes_ = nodes;
    emit nodesChanged();
}

void NodeCatalog::setRecent(const QStringList &recent) {
    if (recent_ == recent) {
        return;
    }
    recent_ = recent;
    emit recentChanged();
}

void NodeCatalog::setFavorites(const QStringList &favorites) {
    if (favorites_ == favorites) {
        return;
    }
    favorites_ = favorites;
    emit favoritesChanged();
}

void NodeCatalog::setReadOnly(bool readOnly) {
    if (readOnly_ == readOnly) {
        return;
    }
    readOnly_ = readOnly;
    emit readOnlyChanged();
}

QVariantList NodeCatalog::rank(const QVariantList &nodes, const QString &query) const {
    QList<CatalogSearchNode> searchNodes;
    searchNodes.reserve(nodes.size());
    for (const auto &value : nodes) {
        const auto node = value.toMap();
        searchNodes.append({node["type"].toString(), node["label"].toString(), node["namespace"].toString(),
                            node["description"].toString(), node["deprecated"].toBool()});
    }
    QVariantList order;
    for (const int index : ranker_.rank(searchNodes, query, recent_)) {
        order.append(index);
    }
    return order;
}

}  // namespace nodetool::node_editor
