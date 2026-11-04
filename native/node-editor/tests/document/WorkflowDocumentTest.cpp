#include "document/WorkflowDocument.h"
#include <QJsonDocument>
#include <QSignalSpy>
#include <QtTest>
using namespace nodetool::node_editor;
namespace {
QJsonObject fixture() {
    return QJsonDocument::fromJson(R"({"id":"0123456789abcdef0123456789abcdef","future":{"a":[null,7]},"graph":{"futureGraph":true,"nodes":[{"id":"a","type":"unknown.Provider","data":{"prompt":"hello","future":[1,2]},"dynamic_properties":{"input":2},"dynamic_inputs":{"input":{"type":{"type":"int"}}},"dynamic_outputs":{"out":{"type":"int"}},"futureNode":42,"ui_properties":{"position":{"x":2,"y":3},"bypassed":true}},{"id":"b","type":"nodetool.text.Output","data":{}}],"edges":[{"id":"e","source":"a","sourceHandle":"out","target":"b","targetHandle":"value","futureEdge":42}],"links":[{"id":"l","source":"a","target":"b","kind":"lineage","futureLink":true}]}})").object();
}
}
class WorkflowDocumentTest final : public QObject {
    Q_OBJECT
private slots:
    void dynamicPortsAtomic() {
        WorkflowDocument d;
        QVERIFY(d.load(fixture()));
        d.setNodeMetadata(QJsonArray{QJsonObject{{"node_type", "unknown.Provider"}, {"supports_dynamic_inputs", true}, {"supports_dynamic_outputs", true}, {"properties", QJsonArray{QJsonObject{{"name", "reserved"}}}}}});
        const auto original = d.snapshot();
        QVERIFY(d.applyCommand({{"op", "renameDynamicOutput"}, {"id", "a"}, {"name", "out"}, {"newName", "result"}}));
        QCOMPARE(d.edges()[0].toObject()["sourceHandle"].toString(), "result");
        QCOMPARE(d.edges()[0].toObject()["futureEdge"].toInt(), 42);
        QCOMPARE(d.undoStack()->count(), 1);
        d.undo(); QCOMPARE(d.snapshot(), original); d.redo();
        QVERIFY(d.applyCommand({{"op", "removeDynamicOutput"}, {"id", "a"}, {"name", "result"}}));
        QVERIFY(d.edges().isEmpty());
        QCOMPARE(d.graph()["links"], original["graph"].toObject()["links"]);
        d.undo(); QCOMPARE(d.edges().size(), 1);
        QVERIFY(d.applyCommand({{"op", "addDynamicInput"}, {"id", "a"}, {"name", "count"}, {"type", QJsonObject{{"type", "int"}}}}));
        QCOMPARE(d.node("a")["dynamic_properties"].toObject()["count"].toInt(), 0);
        QVERIFY(d.applyCommand({{"op", "renameDynamicInput"}, {"id", "a"}, {"name", "count"}, {"newName", "total"}}));
        QCOMPARE(d.node("a")["dynamic_inputs"].toObject()["total"].toObject()["type"].toObject()["type"].toString(), "int");
        QVERIFY(d.applyCommand({{"op", "removeDynamicInput"}, {"id", "a"}, {"name", "total"}}));
        QVERIFY(!d.node("a")["dynamic_properties"].toObject().contains("total"));
        d.undo();
        const auto beforeInvalid = d.snapshot(); const auto count = d.undoStack()->count();
        for (const auto& name : {QString("reserved"), QString("total"), QString("__control__"), QString(" bad ")}) {
            QVERIFY(!d.applyCommand({{"op", "addDynamicInput"}, {"id", "a"}, {"name", name}}));
        }
        QVERIFY(!d.applyCommand({{"op", "addDynamicOutput"}, {"id", "a"}, {"name", "bad"}, {"type", QJsonObject{{"type", 7}}}}));
        QVERIFY(!d.applyCommand({{"op", "addDynamicInput"}, {"id", "b"}, {"name", "bad"}}));
        QCOMPARE(d.snapshot(), beforeInvalid); QCOMPARE(d.undoStack()->count(), count);
        WorkflowDocument restored; QVERIFY(restored.loadJson(QJsonDocument(d.snapshot()).toJson())); QCOMPARE(restored.snapshot(), d.snapshot());
    }
    void dynamicOutputCorrelationAndUnsupportedContainers() {
        WorkflowDocument d;
        QVERIFY(d.loadJson(R"({"graph":{"nodes":[{"id":"a","type":"Node","dynamic_outputs":{"out":{"type":"str","future":9}},"dynamic_output_correlation":{"out":{"mode":"single","future":42}}}],"edges":[]}})"));
        d.setNodeMetadata(QJsonArray{QJsonObject{{"node_type", "Node"}, {"supports_dynamic_outputs", true}, {"supports_dynamic_inputs", true}}});
        const auto before = d.snapshot();
        QVERIFY(d.applyCommand({{"op", "renameDynamicOutput"}, {"id", "a"}, {"name", "out"}, {"newName", "result"}}));
        QCOMPARE(d.node("a")["dynamic_outputs"].toObject()["result"].toObject()["future"].toInt(), 9);
        QCOMPARE(d.node("a")["dynamic_output_correlation"].toObject()["result"].toObject()["future"].toInt(), 42);
        d.undo(); QCOMPARE(d.snapshot(), before);
        QVERIFY(d.applyCommand({{"op", "removeDynamicOutput"}, {"id", "a"}, {"name", "out"}}));
        QVERIFY(d.node("a")["dynamic_output_correlation"].toObject().isEmpty());
        auto malformed = before; auto graph = malformed["graph"].toObject(); auto nodes = graph["nodes"].toArray(); auto node = nodes[0].toObject();
        node["dynamic_properties"] = QJsonArray{1}; nodes[0] = node; graph["nodes"] = nodes; malformed["graph"] = graph;
        QVERIFY(d.load(malformed));
        QVERIFY(!d.applyCommand({{"op", "addDynamicInput"}, {"id", "a"}, {"name", "new"}}));
        QCOMPARE(d.snapshot(), malformed); QCOMPARE(d.undoStack()->count(), 0);
    }
    void linkedDynamicInput() {
        WorkflowDocument d;
        QVERIFY(d.loadJson(R"({"graph":{"nodes":[{"id":"a","type":"Node"},{"id":"b","type":"Node","dynamic_properties":{"slot":"value"},"dynamic_inputs":{"slot":{"type":{"type":"str"},"future":42}}}],"edges":[{"id":"e","source":"a","sourceHandle":"out","target":"b","targetHandle":"slot"}]}})"));
        d.setNodeMetadata(QJsonArray{QJsonObject{{"node_type", "Node"}, {"supports_dynamic_inputs", true}}});
        const auto before = d.snapshot();
        QVERIFY(d.applyCommand({{"op", "renameDynamicInput"}, {"id", "b"}, {"name", "slot"}, {"newName", "renamed"}}));
        QCOMPARE(d.edges()[0].toObject()["targetHandle"].toString(), "renamed");
        QCOMPARE(d.node("b")["dynamic_inputs"].toObject()["renamed"].toObject()["future"].toInt(), 42);
        d.undo(); QCOMPARE(d.snapshot(), before); d.redo();
        QVERIFY(d.applyCommand({{"op", "removeDynamicInput"}, {"id", "b"}, {"name", "renamed"}})); QVERIFY(d.edges().isEmpty());
        d.undo(); QCOMPARE(d.edges().size(), 1);
    }
    void detachedGeometry() {
        WorkflowDocument d;
        QVERIFY(d.loadJson(R"({"graph":{"nodes":[{"id":"g","type":"Group","ui_properties":{"position":{"x":1000,"y":500}}},{"id":"a","type":"Node","parent_id":"g","ui_properties":{"position":{"x":10,"y":20}}}],"edges":[]}})"));
        const auto result = d.duplicate({"a"}); QVERIFY(result);
        const auto position = d.node(result.idMap["a"].toString())["ui_properties"].toObject()["position"].toObject();
        QCOMPARE(position["x"].toDouble(), 1042.0); QCOMPARE(position["y"].toDouble(), 552.0);
    }
    void nestedGeometry() {
        WorkflowDocument d;
        QVERIFY(d.loadJson(R"({"graph":{"nodes":[{"id":"outer","type":"Group","ui_properties":{"position":{"x":1000,"y":500}}},{"id":"inner","type":"Group","parent_id":"outer","ui_properties":{"position":{"x":100,"y":50}}},{"id":"a","type":"Node","parent_id":"inner","ui_properties":{"position":{"x":10,"y":20}}}],"edges":[]}})"));
        const auto result = d.duplicate({"inner"}); QVERIFY(result);
        const auto inner = d.node(result.idMap["inner"].toString());
        const auto position = inner["ui_properties"].toObject()["position"].toObject();
        QCOMPARE(position["x"].toDouble(), 1132.0); QCOMPARE(position["y"].toDouble(), 582.0);
        const auto child = d.node(result.idMap["a"].toString());
        QCOMPARE(child["parent_id"], result.idMap["inner"]);
        QCOMPARE(child["ui_properties"].toObject()["position"], d.node("a")["ui_properties"].toObject()["position"]);
        d.undo();
        const auto all = d.duplicate({"outer"}); QVERIFY(all);
        QCOMPARE(d.node(all.idMap["inner"].toString())["parent_id"], all.idMap["outer"]);
    }
    void malformedDynamicOutput() {
        WorkflowDocument d; QVERIFY(d.load(fixture()));
        QVERIFY(!d.applyCommand({{"op", "setNodeField"}, {"id", "a"}, {"field", "dynamic_outputs"}, {"value", QJsonObject{{"out", 42}}}}));
        auto source = fixture(); auto graph = source["graph"].toObject(); auto nodes = graph["nodes"].toArray(); auto n = nodes[0].toObject();
        n["dynamic_outputs"] = QJsonObject{{"out", 42}}; nodes[0] = n; graph["nodes"] = nodes; source["graph"] = graph;
        QVERIFY(d.load(source)); QVERIFY(d.isReadOnly()); QCOMPARE(d.snapshot(), source);
    }
    void connectionValidation() {
        WorkflowDocument d;
        QVERIFY(d.loadJson(R"({"graph":{"nodes":[{"id":"a","type":"Node"},{"id":"b","type":"Node"},{"id":"loop","type":"nodetool.control.Loop"}],"edges":[]}})"));
        const QJsonArray inputs{QJsonObject{{"name", "in"}, {"type", QJsonObject{{"type", "any"}}}}, QJsonObject{{"name", "next"}, {"type", QJsonObject{{"type", "any"}}}}};
        const QJsonArray outputs{QJsonObject{{"name", "out"}, {"type", QJsonObject{{"type", "any"}}}}};
        const auto connect = [&](const QString& source, const QString& target, const QString& handle) {
            return d.applyCommand({{"op", "addEdge"}, {"edge", QJsonObject{{"source", source}, {"target", target}, {"sourceHandle", "out"}, {"targetHandle", handle}}}});
        };
        QVERIFY(!connect("a", "b", "in"));
        d.setNodeMetadata(QJsonArray{QJsonObject{{"node_type", "Node"}, {"properties", inputs}, {"outputs", outputs}}, QJsonObject{{"node_type", "nodetool.control.Loop"}, {"properties", inputs}, {"outputs", outputs}}});
        QVERIFY(!connect("a", "b", "")); QVERIFY(!connect("a", "b", "missing"));
        QVERIFY(connect("a", "b", "in"));
        const auto before = d.snapshot();
        QVERIFY(!connect("b", "a", "in")); QCOMPARE(d.snapshot(), before);
        QVERIFY(connect("loop", "a", "in")); QVERIFY(connect("b", "loop", "next"));
        d.undo(); d.redo();
        QCOMPARE(d.edges().size(), 3);
    }
    void typedConnections() {
        WorkflowDocument d;
        QVERIFY(d.loadJson(R"({"graph":{"nodes":[{"id":"a","type":"Source"},{"id":"b","type":"Target"}],"edges":[]}})"));
        const auto type = [](const char* name) { return QJsonObject{{"type", name}}; };
        const auto connect = [&](QJsonObject source, QJsonObject target) {
            d.setNodeMetadata(QJsonArray{
                QJsonObject{{"node_type", "Source"}, {"outputs", QJsonArray{QJsonObject{{"name", "out"}, {"type", source}}}}},
                QJsonObject{{"node_type", "Target"}, {"properties", QJsonArray{QJsonObject{{"name", "in"}, {"type", target}}}}}});
            return d.applyCommand({{"op", "addEdge"}, {"edge", QJsonObject{{"source", "a"}, {"target", "b"}, {"sourceHandle", "out"}, {"targetHandle", "in"}}}});
        };
        QVERIFY(!connect(type("str"), type("int")));
        QVERIFY(!connect(type("int"), type("float")));
        QVERIFY(connect(type("str"), QJsonObject{{"type", "list"}, {"type_args", QJsonArray{type("str")}}}));
        d.undo();
        QVERIFY(!connect(QJsonObject{{"type", "list"}, {"type_args", QJsonArray{type("str")}}},
                         QJsonObject{{"type", "list"}, {"type_args", QJsonArray{type("int")}}}));
        QVERIFY(connect(QJsonObject{{"type", "union"}, {"type_args", QJsonArray{type("str"), type("int")}}}, type("int")));
        d.undo();
        QVERIFY(connect(type("any"), type("image")));
    }
    void externalPasteValidation() {
        WorkflowDocument d; QVERIFY(d.load(fixture()));
        const auto copied = d.copy({"a", "b"});
        QVERIFY(d.applyCommand({{"op", "paste"}, {"fragment", copied}}));
        d.undo();
        auto changed = copied;
        auto nodes = changed["nodes"].toArray();
        auto source = nodes[0].toObject(); source["type"] = "external.Unknown"; nodes[0] = source;
        changed["nodes"] = nodes;
        const auto before = d.snapshot();
        QVERIFY(!d.applyCommand({{"op", "paste"}, {"fragment", changed}}));
        QCOMPARE(d.snapshot(), before);
        QCOMPARE(d.undoStack()->index(), 0);
    }
    void controlConnections() {
        WorkflowDocument d;
        QVERIFY(d.loadJson(R"({"graph":{"nodes":[{"id":"a","type":"nodetool.agents.Agent"},{"id":"b","type":"Unknown"},{"id":"c","type":"nodetool.agents.Other"}],"edges":[]}})"));
        const auto edge = [](const char* source, const char* target) {
            return QJsonObject{{"source", source}, {"target", target}, {"sourceHandle", "__control__"}, {"targetHandle", "__control__"}, {"edge_type", "control"}};
        };
        QVERIFY(d.applyCommand({{"op", "addEdge"}, {"edge", edge("a", "b")}}));
        QVERIFY(!d.applyCommand({{"op", "addEdge"}, {"edge", edge("b", "c")}}));
        QVERIFY(!d.applyCommand({{"op", "addEdge"}, {"edge", edge("a", "a")}}));
        QVERIFY(d.applyCommand({{"op", "addEdge"}, {"edge", edge("c", "a")}}));
        QVERIFY(!d.applyCommand({{"op", "addEdge"}, {"edge", edge("a", "c")}}));
        auto malformed = edge("a", "c"); malformed["targetHandle"] = "in";
        QVERIFY(!d.applyCommand({{"op", "addEdge"}, {"edge", malformed}}));
        malformed = edge("a", "c"); malformed.remove("edge_type");
        QVERIFY(!d.applyCommand({{"op", "addEdge"}, {"edge", malformed}}));
        const auto original = d.snapshot(); d.undo(); d.redo(); QCOMPARE(d.snapshot(), original);
    }
    void dynamicAndPastedConnections() {
        WorkflowDocument d;
        QVERIFY(d.loadJson(R"({"graph":{"nodes":[{"id":"a","type":"Node","dynamic_outputs":{"out":{"type":"str"}}},{"id":"b","type":"Node","dynamic_inputs":{"in":{"type":{"type":"int"}}}}],"edges":[]}})"));
        d.setNodeMetadata(QJsonArray{QJsonObject{{"node_type", "Node"}}});
        const QJsonObject edge{{"source", "a"}, {"target", "b"}, {"sourceHandle", "out"}, {"targetHandle", "in"}};
        QVERIFY(!d.applyCommand({{"op", "addEdge"}, {"edge", edge}}));
        QVERIFY(d.applyCommand({{"op", "setNodeField"}, {"id", "b"}, {"field", "dynamic_inputs"},
                                {"value", QJsonObject{{"in", QJsonObject{{"type", "str"}}}}}}));
        auto fragment = d.graph(); fragment["edges"] = QJsonArray{edge};
        QVERIFY(d.applyCommand({{"op", "paste"}, {"fragment", fragment}}));
        d.undo();
        auto bad = fragment;
        auto badEdges = bad["edges"].toArray();
        auto missing = edge; missing["targetHandle"] = "missing"; badEdges.append(missing); bad["edges"] = badEdges;
        const auto before = d.snapshot(); const auto count = d.undoStack()->count();
        QVERIFY(!d.applyCommand({{"op", "paste"}, {"fragment", bad}}));
        QCOMPARE(d.snapshot(), before); QCOMPARE(d.undoStack()->count(), count);
        badEdges = QJsonArray{edge, edge}; bad["edges"] = badEdges;
        QVERIFY(!d.applyCommand({{"op", "paste"}, {"fragment", bad}}));
        auto nodes = fragment["nodes"].toArray();
        for (qsizetype i = 0; i < nodes.size(); ++i) {
            auto n = nodes[i].toObject();
            n["dynamic_inputs"] = QJsonObject{{"in", QJsonObject{{"type", "str"}}}};
            n["dynamic_outputs"] = QJsonObject{{"out", QJsonObject{{"type", "str"}}}};
            nodes[i] = n;
        }
        bad["nodes"] = nodes;
        auto reverse = edge; reverse["source"] = "b"; reverse["target"] = "a";
        bad["edges"] = QJsonArray{edge, reverse};
        QVERIFY(!d.applyCommand({{"op", "paste"}, {"fragment", bad}}));
        bad["edges"] = QJsonArray{reverse, edge};
        QVERIFY(!d.applyCommand({{"op", "paste"}, {"fragment", bad}}));
        QCOMPARE(d.snapshot(), before);
    }
    void metadataFreePropertyRejected() {
        WorkflowDocument document;
        QVERIFY(document.load(fixture()));
        const auto before = document.snapshot();
        QSignalSpy spy(&document, &WorkflowDocument::changed);
        const auto result = document.applyCommand({{"op", "setProperty"}, {"id", "a"}, {"name", "prompt"}, {"value", "new"}});
        QVERIFY(!result);
        QVERIFY(!result.error.isEmpty());
        QCOMPARE(document.snapshot(), before);
        QCOMPARE(document.undoStack()->count(), 0);
        QCOMPARE(spy.count(), 0);
    }
    void roundtrip() {
        WorkflowDocument document;
        document.setNodeMetadata({QJsonObject{{"node_type", "unknown.Provider"},
            {"properties", QJsonArray{QJsonObject{{"name", "prompt"}, {"type", QJsonObject{{"type", "str"}}}}}}}});
        const auto source = fixture();
        QVERIFY(document.load(source));
        QCOMPARE(document.snapshot(), source);
        QVERIFY(!document.isReadOnly());
        QVERIFY(document.applyCommand({{"op", "setProperty"}, {"id", "a"}, {"name", "prompt"}, {"value", "new"}}));
        auto expected = source; auto graph = expected["graph"].toObject(); auto nodes = graph["nodes"].toArray(); auto node = nodes[0].toObject(); auto data = node["data"].toObject(); data["prompt"] = "new"; node["data"] = data; nodes[0] = node; graph["nodes"] = nodes; expected["graph"] = graph;
        QCOMPARE(document.snapshot(), expected);
        document.undo(); QCOMPARE(document.snapshot(), source);
        document.redo(); QCOMPARE(document.snapshot(), expected);
    }
    void atomicBatch() {
        WorkflowDocument d;
        d.setNodeMetadata({QJsonObject{{"node_type", "unknown.Provider"},
            {"properties", QJsonArray{QJsonObject{{"name", "prompt"}, {"type", QJsonObject{{"type", "str"}}}}}}}});
        QVERIFY(d.load(fixture())); const auto before = d.snapshot(); QSignalSpy spy(&d, &WorkflowDocument::changed);
        QJsonArray commands{QJsonObject{{"op", "setProperty"}, {"id", "a"}, {"name", "prompt"}, {"value", "changed"}}, QJsonObject{{"op", "removeEdge"}, {"id", "missing"}}};
        QVERIFY(!d.applyCommand({{"op", "batch"}, {"commands", commands}}));
        QCOMPARE(d.snapshot(), before); QCOMPARE(d.undoStack()->count(), 0); QCOMPARE(spy.count(), 0);
        commands[1] = QJsonObject{{"op", "removeEdge"}, {"id", "e"}};
        QVERIFY(d.applyCommand({{"op", "batch"}, {"commands", commands}}));
        QCOMPARE(d.undoStack()->count(), 1); QCOMPARE(spy.count(), 1); QCOMPARE(d.edges().size(), 0);
        d.undo(); QCOMPARE(d.snapshot(), before); d.redo(); QCOMPARE(d.edges().size(), 0);
    }
    void pasteAndDelete() {
        WorkflowDocument d; QVERIFY(d.load(fixture())); const auto original = d.snapshot();
        const auto result = d.duplicate({"a", "b"}); QVERIFY(result); QCOMPARE(result.idMap.size(), 2);
        QCOMPARE(d.nodes().size(), 4); QCOMPARE(d.edges().size(), 2);
        const auto e = d.edges()[1].toObject(); QCOMPARE(e["source"], result.idMap["a"]); QCOMPARE(e["sourceHandle"].toString(), QString("out"));
        QCOMPARE(d.graph()["links"].toArray().size(), 2);
        QCOMPARE(d.node(result.idMap["a"].toString())["dynamic_inputs"], d.node("a")["dynamic_inputs"]);
        QVERIFY(result.idMap["a"].toString().size() == 32);
        d.undo(); QCOMPARE(d.snapshot(), original); d.redo();
        QVERIFY(d.applyCommand({{"op", "removeNodes"}, {"ids", QJsonArray{"a"}}}));
        QCOMPARE(d.nodes().size(), 3); QCOMPARE(d.edges().size(), 1); QCOMPARE(d.graph()["links"].toArray().size(), 1);
        d.undo(); QCOMPARE(d.nodes().size(), 4);
    }
    void invalidAndReadOnly() {
        WorkflowDocument d; QVERIFY(d.load(fixture())); const auto before = d.snapshot();
        QVERIFY(!d.applyCommand({{"op", "addEdge"}, {"edge", QJsonObject{{"source", "a"}, {"sourceHandle", "out"}, {"target", "missing"}, {"targetHandle", "in"}}}}));
        QVERIFY(!d.applyCommand({{"op", "setNodeField"}, {"id", "a"}, {"field", "id"}, {"value", "replacement"}}));
        QVERIFY(!d.loadJson("not JSON")); QCOMPARE(d.snapshot(), before);
        auto broken = before; auto graph = broken["graph"].toObject(); graph["links"] = "future encoding"; broken["graph"] = graph;
        QVERIFY(d.load(broken)); QVERIFY(d.isReadOnly()); QCOMPARE(d.snapshot(), broken);
        QVERIFY(!d.applyCommand({{"op", "removeNodes"}, {"ids", QJsonArray{"a"}}})); QCOMPARE(d.snapshot(), broken);
    }
    void largeGraph() {
        QJsonArray nodes, edges;
        for (int i = 0; i < 1000; ++i) {
            nodes.append(QJsonObject{{"id", QString::number(i)}, {"type", "test.Node"}});
        }
        for (int i = 0; i < 2000; ++i) {
            edges.append(QJsonObject{{"id", QString("edge%1").arg(i)}, {"source", QString::number(i % 999)}, {"target", QString::number((i % 999) + 1)}, {"sourceHandle", QString("out%1").arg(i)}, {"targetHandle", QString("in%1").arg(i)}});
        }
        WorkflowDocument d;
        const QJsonObject source{{"graph", QJsonObject{{"nodes", nodes}, {"edges", edges}}}};
        QVERIFY(d.load(source));
        QCOMPARE(d.snapshot(), source);
        const auto result = d.duplicate({"0", "1", "2"}); QVERIFY(result);
        QCOMPARE(d.nodes().size(), 1003);
        d.undo(); QCOMPARE(d.snapshot(), source);
        QVERIFY(d.applyCommand({{"op", "removeNodes"}, {"ids", QJsonArray{"1"}}}));
        d.undo(); QCOMPARE(d.snapshot(), source);
    }
    void groupsAndDisabled() {
        WorkflowDocument d; QVERIFY(d.load(fixture()));
        QVERIFY(d.applyCommand({{"op", "addNode"}, {"node", QJsonObject{{"id", "group"}, {"type", "nodetool.workflows.Group"}, {"data", QJsonObject{{"comment", "keep"}}}}}}));
        QVERIFY(d.applyCommand({{"op", "setNodeField"}, {"id", "a"}, {"field", "parent_id"}, {"value", "group"}}));
        const auto grouped = d.snapshot();
        QVERIFY(d.applyCommand({{"op", "setDisabled"}, {"ids", QJsonArray{"a", "b"}}, {"disabled", false}}));
        QVERIFY(!d.node("a")["ui_properties"].toObject()["bypassed"].toBool()); d.undo(); QCOMPARE(d.snapshot(), grouped);
        const auto result = d.duplicate({"group"}); QVERIFY(result); QCOMPARE(result.idMap.size(), 2);
        QCOMPARE(d.node(result.idMap["a"].toString())["parent_id"], result.idMap["group"]);
        d.undo(); QCOMPARE(d.snapshot(), grouped);
        QVERIFY(d.applyCommand({{"op", "removeNodes"}, {"ids", QJsonArray{"group"}}})); QCOMPARE(d.nodes().size(), 1); QCOMPARE(d.edges().size(), 0); d.undo(); QCOMPARE(d.snapshot(), grouped);
    }
};
QTEST_GUILESS_MAIN(WorkflowDocumentTest)
#include "WorkflowDocumentTest.moc"
