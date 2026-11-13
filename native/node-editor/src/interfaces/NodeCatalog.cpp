#include "NodeCatalog.h"

#include "graph/CatalogCategories.h"
#include "graph/TypeStyle.h"
#include "interfaces/Assign.h"

namespace nodetool::node_editor {

NodeCatalog::NodeCatalog(QObject *parent) : QObject(parent) {}

NodeCatalog::~NodeCatalog() = default;

QVariantList NodeCatalog::entriesFromMetadata(const QJsonArray &metadata) {
    QVariantList entries;
    for (const auto &value : metadata) {
        const auto m = value.toObject();
        // Hidden nodes stay runnable but never appear in the web node library.
        if (m["hidden"].toBool()) {
            continue;
        }
        const auto type = m["node_type"].toString(m["type"].toString());
        const auto ns = m["namespace"].toString(type.section('.', 0, -2));
        const auto outputs = m["outputs"].toArray();
        const auto output = outputs.isEmpty() ? QJsonValue{} : outputs[0].toObject()["type"];
        const auto outputType = output.isString() ? output.toString() : output.toObject()["type"].toString();
        const auto provider = catalogProviderId(ns);
        entries.append(QVariantMap{{"type", type}, {"label", m["title"].toString(type)},
                                   {"namespace", ns}, {"categories", catalogCategoryIds(m)},
                                   {"description", m["description"].toString()},
                                   {"deprecated", m["deprecated"].toBool()},
                                   {"inputTypes", catalogTypeNames(m["properties"].toArray())},
                                   {"outputTypes", catalogTypeNames(outputs)},
                                   {"provider", provider}, {"providerName", catalogProviderName(provider)},
                                   {"keyGate", catalogKeyGate(ns)},
                                   {"icon", typeIcon(outputType)}, {"color", typeColor(outputType)}});
    }
    return entries;
}

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

void NodeCatalog::setWindowHeight(int height) {
    if (assign(windowHeight_, height)) { emit windowHeightChanged(); }
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
