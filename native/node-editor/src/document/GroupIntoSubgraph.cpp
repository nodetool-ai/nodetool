#include "GroupIntoSubgraph.h"
#include "ChildPorts.h"
#include <QHash>
#include <QSet>
#include <QUuid>

namespace nodetool::node_editor {
namespace {
QString newId() {
    return QUuid::createUuid().toString(QUuid::Id128);
}
}
QJsonObject groupIntoSubgraph(const QJsonObject &graph, const QStringList &ids,
                             const QJsonObject &subgraph) {
    QSet<QString> selected(ids.begin(), ids.end());
    QHash<QString, QStringList> children;
    const auto nodes = graph["nodes"].toArray();
    for (const auto &value : nodes) {
        const auto node = value.toObject();
        children[node["parent_id"].toString()].append(node["id"].toString());
    }
    auto pending = selected.values();
    while (!pending.isEmpty()) {
        for (const auto &id : children.value(pending.takeLast())) {
            if (!selected.contains(id)) {
                selected.insert(id);
                pending.append(id);
            }
        }
    }
    QJsonArray innerNodes;
    QJsonArray outerNodes;
    double x = 0;
    double y = 0;
    for (const auto &value : nodes) {
        const auto node = value.toObject();
        if (selected.contains(node["id"].toString())) {
            innerNodes.append(node);
            const auto position = node["ui_properties"].toObject()["position"].toObject();
            x += position["x"].toDouble();
            y += position["y"].toDouble();
        } else {
            outerNodes.append(node);
        }
    }
    if (innerNodes.isEmpty()) { return graph; }
    const auto count = innerNodes.size();
    QJsonArray innerEdges;
    QJsonArray outerEdges;
    QHash<QString, QString> inputs;
    QHash<QString, QString> outputs;
    int inputCounter = 1;
    int outputCounter = 1;
    for (const auto &value : graph["edges"].toArray()) {
        auto edge = value.toObject();
        const bool sourceIn = selected.contains(edge["source"].toString());
        const bool targetIn = selected.contains(edge["target"].toString());
        if (sourceIn && targetIn) {
            innerEdges.append(edge);
        } else if (sourceIn || targetIn) {
            const bool incoming = targetIn;
            const auto endpoint = edge[incoming ? "target" : "source"].toString();
            const auto handle = edge[incoming ? "targetHandle" : "sourceHandle"].toString(incoming ? "" : "output");
            const auto key = endpoint + ":" + handle;
            auto &ports = incoming ? inputs : outputs;
            auto &counter = incoming ? inputCounter : outputCounter;
            if (!ports.contains(key)) {
                const auto port = QString(incoming ? "in%1" : "out%1").arg(counter++);
                ports.insert(key, port);
                const auto boundaryId = newId();
                innerNodes.append(QJsonObject{
                    {"id", boundaryId},
                    {"type", incoming ? "nodetool.input.StringInput" : "nodetool.output.Output"},
                    {"data", QJsonObject{{"name", port}, {"value", incoming ? QJsonValue("") : QJsonValue(QJsonValue::Null)}, {"description", ""}}},
                    {"ui_properties", QJsonObject{{"position", QJsonObject{{"x", incoming ? -200 : 400}, {"y", counter * 80}}}}}
                });
                innerEdges.append(QJsonObject{
                    {"id", newId()}, {"edge_type", "data"},
                    {"source", incoming ? boundaryId : endpoint},
                    {"sourceHandle", incoming ? "output" : handle},
                    {"target", incoming ? endpoint : boundaryId},
                    {"targetHandle", incoming ? handle : "value"}
                });
            }
            edge["id"] = newId();
            edge[incoming ? "target" : "source"] = subgraph["id"];
            edge[incoming ? "targetHandle" : "sourceHandle"] = ports.value(key);
            outerEdges.append(edge);
        } else {
            outerEdges.append(edge);
        }
    }
    auto grouped = subgraph;
    auto data = grouped["data"].toObject();
    data["graph"] = QJsonObject{{"nodes", innerNodes}, {"edges", innerEdges}};
    grouped["data"] = data;
    auto ui = grouped["ui_properties"].toObject();
    ui["position"] = QJsonObject{{"x", x / count}, {"y", y / count}};
    grouped["ui_properties"] = ui;
    outerNodes.append(withChildPorts(grouped));
    auto result = graph;
    result["nodes"] = outerNodes;
    result["edges"] = outerEdges;
    return result;
}
}
