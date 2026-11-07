#pragma once
#include <QHash>
#include <QJsonArray>
#include <QJsonObject>
#include <QSet>
#include <QString>
#include <functional>

namespace nodetool::node_editor {
// Which part of the graph a run will not execute because an If or Switch took
// the other branch. Ports web/src/utils/untakenBranches.ts. A branch node's
// untaken output reaches `completed` on its outgoing edges without ever
// carrying a message. Those edges are dead, and a node whose data inputs are all
// dead is dead too. A node with one live input still runs.
struct UntakenBranch {
    QSet<QString> nodeIds;
    QSet<QString> edgeIds;
    bool empty() const { return nodeIds.isEmpty() && edgeIds.isEmpty(); }
    bool operator==(const UntakenBranch &) const = default;
};

inline bool isBranchNodeType(const QString &type) {
    return type == QLatin1String("nodetool.control.If") || type == QLatin1String("nodetool.control.Switch");
}

// nodeTypes maps node ID to type for the nodes on the canvas. edgeState returns
// the focused run's {status, counter} for an edge, or an empty object before it
// reports one.
inline UntakenBranch findUntakenBranch(const QHash<QString, QString> &nodeTypes, const QJsonArray &edges,
                                       const std::function<QJsonObject(const QString &)> &edgeState) {
    const auto isControl = [](const QJsonObject &edge) {
        return edge.value("type") == QLatin1String("control") || edge.value("edge_type") == QLatin1String("control")
            || edge.value("data").toObject().value("edge_type") == QLatin1String("control");
    };
    QSet<QString> deadEdges;
    QHash<QString, QVector<QJsonObject>> outgoing;
    QHash<QString, int> incomingCount, deadIncomingCount;
    QVector<QString> queue;
    for (const auto &value : edges) {
        const auto edge = value.toObject();
        if (isControl(edge)) { continue; }
        outgoing[edge.value("source").toString()].append(edge);
        ++incomingCount[edge.value("target").toString()];
    }
    const auto markDead = [&](const QJsonObject &edge) {
        const auto id = edge.value("id").toString();
        if (deadEdges.contains(id)) { return; }
        deadEdges.insert(id);
        const auto target = edge.value("target").toString();
        if (++deadIncomingCount[target] == incomingCount.value(target)) { queue.append(target); }
    };
    for (const auto &value : edges) {
        const auto edge = value.toObject();
        if (isControl(edge) || !isBranchNodeType(nodeTypes.value(edge.value("source").toString()))) { continue; }
        const auto state = edgeState(edge.value("id").toString());
        if (state.value("status") == QLatin1String("completed") && state.value("counter").toDouble() == 0) { markDead(edge); }
    }
    QSet<QString> deadNodes;
    for (qsizetype i = 0; i < queue.size(); ++i) {
        const auto nodeId = queue[i];
        if (deadNodes.contains(nodeId) || !nodeTypes.contains(nodeId)) { continue; }
        deadNodes.insert(nodeId);
        for (const auto &edge : outgoing.value(nodeId)) { markDead(edge); }
    }
    return {deadNodes, deadEdges};
}
}
