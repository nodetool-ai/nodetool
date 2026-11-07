#include "document/WorkflowDocument.h"
#include "document/WorkflowMerge.h"
#include <QtTest>
using namespace nodetool::node_editor;
namespace {
QJsonObject node(const QString& id, const QJsonObject& data = {}, double x = 0, double y = 0) {
    return {{"id", id}, {"type", "fixture"}, {"data", data}, {"ui_properties", QJsonObject{{"position", QJsonObject{{"x", x}, {"y", y}}}}}};
}
QJsonObject edge(const QString& id, const QString& source, const QString& target) {
    return {{"id", id}, {"source", source}, {"sourceHandle", "out"}, {"target", target}, {"targetHandle", "in"}};
}
QJsonObject graph(const QJsonArray& nodes, const QJsonArray& edges = {}) { return {{"nodes", nodes}, {"edges", edges}}; }
QJsonArray op(const QString& tool, const QJsonObject& input) { return {QJsonObject{{"tool", tool}, {"input", input}}}; }
QJsonObject withData(QJsonObject value, const QJsonObject& data) { value["data"] = data; return value; }
QJsonObject withUi(QJsonObject value, const QString& key, const QJsonValue& entry) {
    auto ui = value["ui_properties"].toObject(); ui[key] = entry; value["ui_properties"] = ui; return value;
}
QJsonObject nodeById(const QJsonObject& merged, const QString& id) {
    for (const auto& value : merged["nodes"].toArray()) { if (value.toObject()["id"] == id) { return value.toObject(); } }
    return {};
}
QStringList ids(const QJsonArray& values) {
    QStringList result; for (const auto& value : values) { result.append(value.toObject()["id"].toString()); } return result;
}
}
class WorkflowMergeTest final : public QObject {
    Q_OBJECT
private slots:
    void disjointNodeEditsMerge() {
        const auto base = graph({node("a", {{"v", 1}}), node("b", {{"v", 1}})});
        const auto local = graph({node("a", {{"v", 2}}), node("b", {{"v", 1}})});
        const auto remote = graph({node("a", {{"v", 1}}), node("b", {{"v", 3}})});
        const auto result = mergeWorkflowGraphs(base, local, remote, op("ui_update_node_data", {{"node_id", "b"}}));
        QVERIFY(result.conflicts.isEmpty());
        QCOMPARE(nodeById(result.graph, "a")["data"].toObject()["v"].toInt(), 2);
        QCOMPARE(nodeById(result.graph, "b")["data"].toObject()["v"].toInt(), 3);
    }
    void positionDataAndRestOfOneNodeMergeSeparately() {
        const auto a = node("a", {{"v", 1}}, 10, 20);
        const auto base = graph({a});
        // Local moves and resizes the node. The remote edits its properties.
        const auto local = graph({withUi(withUi(a, "position", QJsonObject{{"x", 50}, {"y", 60}}), "width", 300)});
        const auto remote = graph({withData(a, {{"v", 9}})});
        const auto result = mergeWorkflowGraphs(base, local, remote, op("ui_update_node_data", {{"id", "a"}}));
        QVERIFY(result.conflicts.isEmpty());
        const auto merged = nodeById(result.graph, "a");
        QCOMPARE(merged["data"].toObject()["v"].toInt(), 9);
        QCOMPARE(merged["ui_properties"].toObject()["position"].toObject(), (QJsonObject{{"x", 50}, {"y", 60}}));
        QCOMPARE(merged["ui_properties"].toObject()["width"].toInt(), 300);
    }
    void touchedContestKeepsLocalAndReportsConflict() {
        const auto a = node("a", {{"v", 1}});
        // The title belongs to the web's node data group, so it contests a property edit.
        const auto local = graph({withUi(a, "title", "Mine")});
        const auto remote = graph({withData(a, {{"v", 7}})});
        const auto result = mergeWorkflowGraphs(graph({a}), local, remote, op("ui_update_node_data", {{"node_id", "a"}}));
        QCOMPARE(result.graph, local);
        QCOMPARE(result.conflicts.size(), 1);
        const auto conflict = result.conflicts.first();
        QCOMPARE(conflict.kind, QString("node")); QCOMPARE(conflict.id, QString("a")); QCOMPARE(conflict.reason, QString("edited"));
        QCOMPARE(conflict.label, QString("Mine"));
        QCOMPARE(conflict.external.toObject(), withData(a, {{"v", 7}}));
        QCOMPARE(conflict.local.toObject(), withUi(a, "title", "Mine"));
    }
    void untouchedContestKeepsLocalSilently() {
        const auto base = graph({node("a", {{"v", 1}}), node("b")});
        const auto local = graph({node("a", {{"v", 2}}), node("b")});
        const auto remote = graph({node("a", {{"v", 3}}), node("b", {{"w", 1}})});
        const auto result = mergeWorkflowGraphs(base, local, remote, op("ui_update_node_data", {{"node_id", "b"}}));
        QVERIFY(result.conflicts.isEmpty());
        QCOMPARE(nodeById(result.graph, "a")["data"].toObject()["v"].toInt(), 2);
        QCOMPARE(nodeById(result.graph, "b")["data"].toObject()["w"].toInt(), 1);
    }
    void remoteAdditionsInsertAtRemoteIndex() {
        const auto base = graph({node("a"), node("b")});
        const auto local = graph({node("a"), node("b"), node("c")}, {edge("lc", "b", "c")});
        auto ops = op("ui_add_node", {{"id", "x"}});
        ops.append(QJsonObject{{"tool", "ui_connect_nodes"}, {"input", QJsonObject{{"edge_id", "rx"}}}});
        const auto remote = graph({node("a"), node("x"), node("b")}, {edge("rx", "a", "x")});
        const auto result = mergeWorkflowGraphs(base, local, remote, ops);
        QVERIFY(result.conflicts.isEmpty());
        QCOMPARE(ids(result.graph["nodes"].toArray()), (QStringList{"a", "x", "b", "c"}));
        QCOMPARE(ids(result.graph["edges"].toArray()), (QStringList{"rx", "lc"}));
    }
    void remoteDeleteDropsUntouchedNodeAndDanglingLocalEdge() {
        const auto base = graph({node("a"), node("b")});
        const auto local = graph({node("a"), node("b")}, {edge("le", "a", "b")});
        const auto remote = graph({node("a")});
        const auto result = mergeWorkflowGraphs(base, local, remote, op("ui_delete_node", {{"node_id", "b"}}));
        QCOMPARE(ids(result.graph["nodes"].toArray()), (QStringList{"a"}));
        QVERIFY(result.graph["edges"].toArray().isEmpty());
        QCOMPARE(result.conflicts.size(), 1);
        QCOMPARE(result.conflicts.first().kind, QString("edge")); QCOMPARE(result.conflicts.first().id, QString("le"));
        QCOMPARE(result.conflicts.first().reason, QString("dangling"));
        QCOMPARE(result.conflicts.first().label, QString("a → b"));
        QVERIFY(result.conflicts.first().external.isNull());
    }
    void remoteDeleteOfEditedNodeKeepsItAsConflict() {
        const auto base = graph({node("a"), node("b")});
        const auto local = graph({node("a"), node("b", {{"v", 2}})});
        const auto remote = graph({node("a")});
        const auto result = mergeWorkflowGraphs(base, local, remote, op("ui_delete_node", {{"id", "b"}}));
        QCOMPARE(result.graph, local);
        QCOMPARE(result.conflicts.size(), 1);
        QCOMPARE(result.conflicts.first().reason, QString("deleted"));
        QVERIFY(result.conflicts.first().external.isNull());
        QCOMPARE(result.conflicts.first().local.toObject(), node("b", {{"v", 2}}));
    }
    void localDeleteOfRemoteEditedNodeStaysDeletedAsConflict() {
        const auto base = graph({node("a"), node("b")});
        const auto local = graph({node("a")});
        const auto remote = graph({node("a"), node("b", {{"v", 5}})});
        const auto result = mergeWorkflowGraphs(base, local, remote, op("ui_update_node_data", {{"node_id", "b"}}));
        QCOMPARE(result.graph, local);
        QCOMPARE(result.conflicts.size(), 1);
        QCOMPARE(result.conflicts.first().reason, QString("deleted"));
        QCOMPARE(result.conflicts.first().external.toObject(), node("b", {{"v", 5}}));
    }
    void missingOpsReplaceTheWholeDocument() {
        const auto base = graph({node("a", {{"v", 1}})});
        const auto local = graph({node("a", {{"v", 2}})});
        const auto remote = graph({node("b")});
        const auto result = mergeWorkflowGraphs(base, local, remote, {});
        QCOMPARE(result.graph, local);
        QCOMPARE(result.conflicts.size(), 1);
        QCOMPARE(result.conflicts.first().kind, QString("document"));
        QCOMPARE(result.conflicts.first().reason, QString("replaced"));
    }
    void unattributedOpsMergeByDiff() {
        const auto base = graph({node("a", {{"v", 1}}), node("b", {{"v", 1}}), node("c")});
        const auto local = graph({node("a", {{"v", 2}}), node("b", {{"v", 1}}), node("c", {{"v", 4}})});
        const auto remote = graph({node("a", {{"v", 3}}), node("b", {{"v", 5}}), node("c")});
        const auto result = mergeWorkflowGraphs(base, local, remote, op("update_graph", {}));
        QCOMPARE(nodeById(result.graph, "a")["data"].toObject()["v"].toInt(), 2);
        QCOMPARE(nodeById(result.graph, "b")["data"].toObject()["v"].toInt(), 5);
        QCOMPARE(nodeById(result.graph, "c")["data"].toObject()["v"].toInt(), 4);
        QCOMPARE(result.conflicts.size(), 1);
        QCOMPARE(result.conflicts.first().id, QString("a"));
    }
    void unknownMembersSurviveFromBothSides() {
        auto a = node("a"); auto b = node("b");
        auto base = graph({a, b}, {edge("e", "a", "b")});
        auto local = base; local["futureGraph"] = true;
        auto localNodes = QJsonArray{withUi(a, "futureUi", 1), b}; local["nodes"] = localNodes;
        auto remote = base; remote["otherGraph"] = QJsonArray{1};
        auto movedA = withUi(a, "position", QJsonObject{{"x", 5}, {"y", 5}});
        auto futureB = b; futureB["futureNode"] = QJsonObject{{"k", "v"}};
        auto futureEdge = edge("e", "a", "b"); futureEdge["futureEdge"] = 42;
        remote["nodes"] = QJsonArray{movedA, futureB}; remote["edges"] = QJsonArray{futureEdge};
        auto ops = op("ui_move_node", {{"node_id", "a"}});
        ops.append(QJsonObject{{"tool", "ui_update_node_data"}, {"input", QJsonObject{{"node_id", "b"}}}});
        const auto result = mergeWorkflowGraphs(base, local, remote, ops);
        QVERIFY(result.conflicts.isEmpty());
        QCOMPARE(result.graph["futureGraph"], QJsonValue(true));
        QCOMPARE(result.graph["otherGraph"], QJsonValue(QJsonArray{1}));
        const auto mergedA = nodeById(result.graph, "a")["ui_properties"].toObject();
        QCOMPARE(mergedA["futureUi"].toInt(), 1);
        QCOMPARE(mergedA["position"].toObject(), (QJsonObject{{"x", 5}, {"y", 5}}));
        QCOMPARE(nodeById(result.graph, "b")["futureNode"].toObject()["k"].toString(), QString("v"));
        QCOMPARE(result.graph["edges"].toArray().first().toObject()["futureEdge"].toInt(), 42);
    }
    void linksFollowTheWebLinkMerge() {
        const auto link = [](const QString& id) { return QJsonObject{{"id", id}, {"source", "a"}, {"target", "b"}}; };
        auto base = graph({node("a"), node("b")}); base["links"] = QJsonArray{link("l1"), link("l2")};
        auto local = base; local["links"] = QJsonArray{link("l1"), link("l2"), link("l3")};
        auto remote = base; remote["links"] = QJsonArray{link("l1"), link("l4")};
        const auto result = mergeWorkflowGraphs(base, local, remote, op("add_workflow_link", {}));
        QCOMPARE(ids(result.graph["links"].toArray()), (QStringList{"l1", "l3", "l4"}));
    }
    void snapshotsMergeRootMembersAndTakeTheRemoteRevision() {
        const QJsonObject base{{"id", "w"}, {"name", "A"}, {"updated_at", "r1"}, {"graph", graph({node("a")})}};
        auto local = base; local["description"] = "local"; local["graph"] = graph({node("a", {{"v", 1}})});
        auto remote = base; remote["name"] = "B"; remote["updated_at"] = "r2"; remote["etag"] = "e2";
        remote["graph"] = graph({node("a"), node("b")});
        const auto result = mergeWorkflowSnapshots(base, local, remote, op("ui_add_node", {{"id", "b"}}));
        QVERIFY(result.conflicts.isEmpty());
        QCOMPARE(result.graph["name"].toString(), QString("B"));
        QCOMPARE(result.graph["description"].toString(), QString("local"));
        QCOMPARE(result.graph["updated_at"].toString(), QString("r2"));
        QCOMPARE(result.graph["etag"].toString(), QString("e2"));
        QCOMPARE(ids(result.graph["graph"].toObject()["nodes"].toArray()), (QStringList{"a", "b"}));
        QCOMPARE(nodeById(result.graph["graph"].toObject(), "a")["data"].toObject()["v"].toInt(), 1);
    }
    void applyingAMergedGraphIsOneUndoStep() {
        const auto base = graph({node("a", {{"v", 1}}), node("b")}, {edge("e", "a", "b")});
        auto local = base; local["nodes"] = QJsonArray{node("a", {{"v", 2}}), node("b")};
        auto remote = base; auto futureB = node("b"); futureB["futureNode"] = 1; remote["nodes"] = QJsonArray{node("a", {{"v", 1}}), futureB};
        const auto merged = mergeWorkflowGraphs(base, local, remote, op("ui_update_node_data", {{"node_id", "b"}}));
        WorkflowDocument document;
        QVERIFY(document.load(QJsonObject{{"id", "w"}, {"graph", local}}));
        const auto before = document.snapshot();
        QVERIFY(document.applyCommand({{"op", "replaceGraph"}, {"graph", merged.graph}}, "Merge server changes"));
        QCOMPARE(document.undoStack()->count(), 1);
        QCOMPARE(document.undoStack()->undoText(), QString("Merge server changes"));
        QCOMPARE(document.node("b")["futureNode"].toInt(), 1);
        QCOMPARE(document.node("a")["data"].toObject()["v"].toInt(), 2);
        document.undo();
        QCOMPARE(document.snapshot(), before);
    }
};
QTEST_GUILESS_MAIN(WorkflowMergeTest)
#include "WorkflowMergeTest.moc"
