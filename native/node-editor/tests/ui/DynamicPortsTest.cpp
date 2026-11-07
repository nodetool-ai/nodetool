#include "graph/WorkflowGraphModel.h"
#include "document/WorkflowDocument.h"
#include <QtTest>
#include <QtNodes/NodeData>
using namespace nodetool;
using namespace nodetool::node_editor;
class DynamicPortsTest final : public QObject {
 Q_OBJECT
private slots:
 void conditionalPortsPreserveValuesAndConnections() {
  WorkflowDocument document;
  const QJsonObject field{{"name", "detail"}, {"type", "str"}, {"json_schema_extra", QJsonObject{{"visible_when", QJsonObject{{"property", "enabled"}, {"equals", true}}}}}};
  const QJsonArray catalog{QJsonObject{{"node_type", "test"}, {"inline_fields", QJsonArray{"enabled", "detail"}}, {"properties", QJsonArray{QJsonObject{{"name", "enabled"}, {"type", "bool"}}, field}}}};
  document.setNodeMetadata(catalog);
  QVERIFY(document.load({{"graph", QJsonObject{{"nodes", QJsonArray{QJsonObject{{"id", "n"}, {"type", "test"}, {"data", QJsonObject{{"enabled", false}, {"detail", "keep"}}}}}}, {"edges", QJsonArray{}}}}}));
  const auto before = document.snapshot();
  WorkflowGraphModel graph; graph.project(before, catalog);
  const auto id = *graph.allNodeIds().begin();
  QCOMPARE(graph.ports(id, QtNodes::PortType::In).size(), 1);
  QVERIFY(graph.inlineFieldRect(id, "detail").isEmpty());
  QVERIFY(document.applyCommand({{"op", "setProperty"}, {"id", "n"}, {"name", "enabled"}, {"value", true}}));
  graph.project(document.snapshot(), catalog);
  QCOMPARE(graph.ports(id, QtNodes::PortType::In).size(), 2);
  QVERIFY(!graph.inlineFieldRect(id, "detail").isEmpty());
  document.undo(); graph.project(document.snapshot(), catalog);
  QCOMPARE(graph.ports(id, QtNodes::PortType::In).size(), 1);
  QCOMPARE(document.snapshot(), before);
  auto connected = before;
  auto body = connected["graph"].toObject();
  body["edges"] = QJsonArray{QJsonObject{{"id", "e"}, {"source", "missing"}, {"sourceHandle", "out"}, {"target", "n"}, {"targetHandle", "detail"}}};
  connected["graph"] = body;
  graph.project(connected, catalog);
  QCOMPARE(graph.ports(id, QtNodes::PortType::In).size(), 2);
  QCOMPARE(graph.ports(id, QtNodes::PortType::In)[1].toObject()["type"].toString(), QString("str"));
  QVERIFY(graph.inlineDescriptor(id, "detail").isEmpty());
  bool warning = false;
  for (const auto &row : graph.layout(id).rows) { if (row.propertyName == "detail") { warning = row.conditionalUnavailable; } }
  QVERIFY(warning);
  auto handles = catalog;
  auto meta = handles[0].toObject(); meta["input_fields"] = QJsonArray{"detail"}; meta["body"] = "content_card"; handles[0] = meta;
  graph.project(connected, handles);
  warning = false;
  for (const auto &row : graph.layout(id).rows) { if (row.kind == NodeRowKind::Handle && row.port == 1) { warning = row.conditionalUnavailable; } }
  QVERIFY(!warning);
  graph.project(before, handles);
  QCOMPARE(graph.ports(id, QtNodes::PortType::In).size(), 2);
  auto promoted = before; auto promotedGraph = promoted["graph"].toObject();
  auto nodes = promotedGraph["nodes"].toArray(); auto exposed = nodes[0].toObject();
  exposed["ui_properties"] = QJsonObject{{"exposed_inputs", QJsonArray{"detail"}}};
  nodes[0] = exposed; promotedGraph["nodes"] = nodes; promoted["graph"] = promotedGraph;
  graph.project(promoted, catalog);
  QCOMPARE(graph.ports(id, QtNodes::PortType::In).size(), 2);
  QCOMPARE(graph.layout(id).rows.first().kind, NodeRowKind::Handle);
  QCOMPARE(document.snapshot(), before);
 }
 void declarationsOrderTypesAndUndo() {
  WorkflowDocument document;
  const QJsonObject node{{"id","n"},{"type","test"},{"data",QJsonObject{}},
    {"dynamic_inputs",QJsonObject{{"extra",QJsonObject{{"type",QJsonObject{{"type","str"}}}}},{"static",QJsonObject{{"type","float"}}}}},
    {"dynamic_properties",QJsonObject{{"extra","hello"},{"fallback",7}}},
    {"dynamic_outputs",QJsonObject{{"answer",QJsonObject{{"type","int"}}}}}};
  const QJsonArray catalog{QJsonObject{{"node_type","test"},{"inline_fields",QJsonArray{"static"}},{"properties",QJsonArray{QJsonObject{{"name","static"},{"type","bool"}}}},{"outputs",QJsonArray{}}}};
  QVERIFY(document.load({{"graph",QJsonObject{{"nodes",QJsonArray{node}},{"edges",QJsonArray{}}}}}));
  const auto before = document.snapshot();
  WorkflowGraphModel graph; graph.project(before,catalog);
  const auto id = *graph.allNodeIds().begin();
  const auto ports = graph.ports(id,QtNodes::PortType::In);
  QCOMPARE(ports.size(),3);
  QCOMPARE(ports[0].toObject()["name"].toString(),"static");
  QCOMPARE(ports[1].toObject()["name"].toString(),"extra");
  QCOMPARE(ports[2].toObject()["name"].toString(),"fallback");
  QCOMPARE(graph.portData<QtNodes::NodeDataType>(id,QtNodes::PortType::In,0,QtNodes::PortRole::DataType).id,"bool");
  QCOMPARE(graph.portData<QtNodes::NodeDataType>(id,QtNodes::PortType::In,1,QtNodes::PortRole::DataType).id,"str");
  QCOMPARE(graph.portData<QtNodes::NodeDataType>(id,QtNodes::PortType::In,2,QtNodes::PortRole::DataType).id,"any");
  QCOMPARE(graph.portData<QtNodes::NodeDataType>(id,QtNodes::PortType::Out,0,QtNodes::PortRole::DataType).id,"int");
  QCOMPARE(document.snapshot(),before); QCOMPARE(document.undoStack()->count(),0);
  QVERIFY(document.applyCommand({{"op","setNodeField"},{"id","n"},{"field","dynamic_inputs"},{"value",QJsonObject{}}}));
  graph.project(document.snapshot(),catalog);
  document.undo(); graph.project(document.snapshot(),catalog);
  const auto restored = *graph.allNodeIds().begin();
  QCOMPARE(graph.ports(restored,QtNodes::PortType::In),ports);
  QCOMPARE(document.snapshot(),before);
 }
 void unknownIncidentFallback() {
  WorkflowGraphModel graph;
  graph.project({{"nodes",QJsonArray{QJsonObject{{"id","n"},{"type","unknown"},{"dynamic_outputs",QJsonObject{{"declared",QJsonObject{{"type","str"}}}}}}}},{"edges",QJsonArray{QJsonObject{{"source","n"},{"sourceHandle","incident"},{"target","missing"},{"targetHandle","value"}}}}});
  const auto id = *graph.allNodeIds().begin();
  const auto ports = graph.ports(id,QtNodes::PortType::Out);
  QCOMPARE(ports.size(),2);
  QCOMPARE(ports[0].toObject()["name"].toString(),"declared");
  QCOMPARE(ports[1].toObject()["name"].toString(),"incident");
 }
};
QTEST_MAIN(DynamicPortsTest)
#include "DynamicPortsTest.moc"
