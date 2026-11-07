#include "graph/EditorScene.h"
#include "graph/InlineTitlePresenter.h"
#include "graph/WorkflowGraphModel.h"
#include "document/WorkflowDocument.h"
#include <QGraphicsView>
#include <QJsonDocument>
#include <QPointer>
#include <QSignalSpy>
#include <QtNodes/internal/ConnectionGraphicsObject.hpp>
#include <QtNodes/internal/NodeGraphicsObject.hpp>
#include <QtTest>
using namespace nodetool;
using namespace nodetool::node_editor;
using namespace QtNodes;
// moc does not parse the raw string fixture.
#ifndef Q_MOC_RUN
namespace {
QJsonArray catalog() {
  const QJsonObject str{{"type", "str"}};
  return {
      QJsonObject{{"node_type", "t.Source"}, {"title", "Source"}, {"inline_fields", QJsonArray{"text"}},
                  {"properties", QJsonArray{QJsonObject{{"name", "text"}, {"type", str}, {"default", "hello"}}}},
                  {"outputs", QJsonArray{QJsonObject{{"name", "out"}, {"type", str}}}},
                  {"supports_dynamic_outputs", true}},
      QJsonObject{{"node_type", "t.Sink"}, {"title", "Sink"}, {"inline_fields", QJsonArray{"value", "note"}},
                  {"properties", QJsonArray{QJsonObject{{"name", "value"}, {"type", str}}, QJsonObject{{"name", "note"}, {"type", str}}}},
                  {"outputs", QJsonArray{QJsonObject{{"name", "out"}, {"type", str}}}}}};
}
QJsonObject workflow() {
  return QJsonDocument::fromJson(R"JSON({"id":"wf","name":"Incremental","graph":{"nodes":[
    {"id":"a","type":"t.Source","data":{"text":"one"},"ui_properties":{"position":{"x":0,"y":0}},"dynamic_outputs":{"zeta":{"type":"str"}}},
    {"id":"b","type":"t.Sink","data":{"note":"b"},"ui_properties":{"position":{"x":400,"y":0}}},
    {"id":"c","type":"t.Sink","data":{"note":"c"},"ui_properties":{"position":{"x":400,"y":300}}},
    {"id":"group","type":"nodetool.workflows.base_node.Group","data":{"headline":"Frame"},"ui_properties":{"position":{"x":-600,"y":0},"width":400,"height":300}},
    {"id":"child","parent_id":"group","type":"t.Sink","data":{},"ui_properties":{"position":{"x":40,"y":60}}},
    {"id":"reroute","type":"nodetool.control.Reroute","data":{},"ui_properties":{"position":{"x":200,"y":200}}},
    {"id":"comment","type":"nodetool.workflows.base_node.Comment","data":{"comment":"Hello"},"ui_properties":{"position":{"x":0,"y":600},"width":200,"height":100}}
  ],"edges":[
    {"id":"ab","source":"a","sourceHandle":"out","target":"b","targetHandle":"value"},
    {"id":"zc","source":"a","sourceHandle":"zeta","target":"c","targetHandle":"value"},
    {"id":"ar","source":"a","sourceHandle":"out","target":"reroute","targetHandle":"input_value"}
  ]}})JSON").object();
}
NodeId idFor(const WorkflowGraphModel &model, const QString &resource) {
  for (const auto id : model.allNodeIds()) { if (model.resourceId(id) == resource) { return id; } }
  return InvalidNodeId;
}
struct Fixture {
  WorkflowDocument document;
  WorkflowGraphModel model;
  EditorScene scene{model};
  Fixture() {
    document.setNodeMetadata(catalog());
    if (!document.load(workflow())) { qFatal("fixture workflow does not load"); }
    model.commit = [this](const QJsonObject &command) { return apply(command); };
    model.project(document.snapshot(), catalog());
  }
  bool apply(const QJsonObject &command) {
    const auto result = document.applyCommand(command);
    if (result) { model.project(document.snapshot(), catalog()); }
    return bool(result);
  }
  void project() { model.project(document.snapshot(), catalog()); }
  NodeGraphicsObject *item(const QString &resource) { return scene.nodeGraphicsObject(idFor(model, resource)); }
  // Builds every card layout, as the painters do, and returns the build count.
  quint64 buildAllLayouts() {
    for (const auto id : model.allNodeIds()) { model.layout(id); }
    return model.layoutBuildCount();
  }
};
// The incremental scene must equal a scene projected from scratch.
void expectMatchesFresh(Fixture &f) {
  WorkflowGraphModel fresh;
  EditorScene freshScene(fresh);
  fresh.project(f.document.snapshot(), catalog());
  const auto describe = [](WorkflowGraphModel &model, EditorScene &scene) {
    QStringList nodes, wires;
    for (auto *item : scene.items()) {
      if (auto *node = qgraphicsitem_cast<NodeGraphicsObject *>(item)) {
        const auto size = model.layout(node->nodeId()).size;
        nodes.append(QString("%1 %2,%3 %4x%5 z%6").arg(model.resourceId(node->nodeId())).arg(node->pos().x()).arg(node->pos().y())
                         .arg(size.width()).arg(size.height()).arg(node->zValue()));
      } else if (auto *wire = qgraphicsitem_cast<ConnectionGraphicsObject *>(item)) {
        const auto id = wire->connectionId();
        const auto edge = model.edge(id);
        const auto out = wire->mapToScene(wire->endPoint(PortType::Out));
        const auto in = wire->mapToScene(wire->endPoint(PortType::In));
        const auto expectedOut = scene.nodeGeometry().portScenePosition(id.outNodeId, PortType::Out, id.outPortIndex, scene.nodeGraphicsObject(id.outNodeId)->sceneTransform());
        const auto expectedIn = scene.nodeGeometry().portScenePosition(id.inNodeId, PortType::In, id.inPortIndex, scene.nodeGraphicsObject(id.inNodeId)->sceneTransform());
        wires.append(QString("%1.%2>%3.%4 %5,%6>%7,%8 attached=%9").arg(edge["source"].toString(), edge["sourceHandle"].toString(),
            edge["target"].toString(), edge["targetHandle"].toString()).arg(out.x()).arg(out.y()).arg(in.x()).arg(in.y())
            .arg(QLineF(out, expectedOut).length() < 0.5 && QLineF(in, expectedIn).length() < 0.5));
      }
    }
    nodes.sort();
    wires.sort();
    return nodes + QStringList{"--"} + wires;
  };
  QCOMPARE(describe(f.model, f.scene), describe(fresh, freshScene));
  QCOMPARE(f.model.allNodeIds().size(), fresh.allNodeIds().size());
}
} // namespace
#endif
class IncrementalProjectionTest final : public QObject {
  Q_OBJECT
private slots:
  void moveKeepsItemsSelectionAndLayouts();
  void propertyChangeRebuildsOnlyThatCard();
  void addConnectDisconnectDeleteAndUndo();
  void dynamicPortShiftRebindsWires();
  void groupsReroutesAndCommentsFollowIncrementalEdits();
  void notesFollowIncrementalProjection();
  void unsafeDiffsFallBackToReset();
};
#ifndef Q_MOC_RUN
void IncrementalProjectionTest::moveKeepsItemsSelectionAndLayouts() {
  Fixture f;
  QSignalSpy reset(&f.model, &WorkflowGraphModel::modelReset);
  QSignalSpy changed(&f.model, &WorkflowGraphModel::projectionChanged);
  const QPointer<NodeGraphicsObject> a = f.item("a"), b = f.item("b"), c = f.item("c");
  b->setSelected(true);
  const auto builds = f.buildAllLayouts();
  QVERIFY(f.apply({{"op", "moveNodes"}, {"positions", QJsonObject{{"a", QJsonObject{{"x", 50}, {"y", 70}}}}}}));
  QCOMPARE(reset.count(), 0);
  QCOMPARE(changed.count(), 1);
  QCOMPARE(f.item("a"), a.data());
  QCOMPARE(f.item("b"), b.data());
  QCOMPARE(f.item("c"), c.data());
  QCOMPARE(a->pos(), QPointF(50, 70));
  QVERIFY(b->isSelected());
  QCOMPARE(f.buildAllLayouts(), builds);
  expectMatchesFresh(f);
}
void IncrementalProjectionTest::propertyChangeRebuildsOnlyThatCard() {
  Fixture f;
  QSignalSpy reset(&f.model, &WorkflowGraphModel::modelReset);
  const QPointer<NodeGraphicsObject> b = f.item("b"), c = f.item("c");
  const auto builds = f.buildAllLayouts();
  QVERIFY(f.apply({{"op", "setProperty"}, {"id", "c"}, {"name", "note"}, {"value", "changed"}}));
  QCOMPARE(reset.count(), 0);
  QCOMPARE(f.item("b"), b.data());
  QCOMPARE(f.item("c"), c.data());
  QCOMPARE(f.buildAllLayouts(), builds + 1);
  bool shown = false;
  for (const auto &row : f.model.layout(idFor(f.model, "c")).rows) { shown = shown || (row.propertyName == "note" && row.value == "changed"); }
  QVERIFY(shown);
  expectMatchesFresh(f);
}
void IncrementalProjectionTest::addConnectDisconnectDeleteAndUndo() {
  Fixture f;
  QSignalSpy reset(&f.model, &WorkflowGraphModel::modelReset);
  const QPointer<NodeGraphicsObject> b = f.item("b");
  const auto before = f.document.snapshot();
  QVERIFY(f.apply({{"op", "addNode"}, {"node", QJsonObject{{"id", "d"}, {"type", "t.Sink"}, {"data", QJsonObject{}},
      {"ui_properties", QJsonObject{{"position", QJsonObject{{"x", 800}, {"y", 100}}}}}}}}));
  QVERIFY(f.item("d"));
  QCOMPARE(f.item("d")->pos(), QPointF(800, 100));
  expectMatchesFresh(f);
  const auto builds = f.buildAllLayouts();
  QVERIFY(f.apply({{"op", "addEdge"}, {"edge", QJsonObject{{"id", "bd"}, {"source", "b"}, {"sourceHandle", "out"}, {"target", "d"}, {"targetHandle", "value"}}}}));
  // A wire changes the cards at its two ends: the target input becomes connected.
  QCOMPARE(f.buildAllLayouts(), builds + 2);
  QCOMPARE(f.model.allConnectionIds(idFor(f.model, "d")).size(), size_t(1));
  expectMatchesFresh(f);
  QVERIFY(f.apply({{"op", "removeEdge"}, {"id", "ab"}}));
  QVERIFY(f.model.allConnectionIds(idFor(f.model, "b")).size() == 1);
  expectMatchesFresh(f);
  const auto d = idFor(f.model, "d");
  QVERIFY(f.apply({{"op", "removeNodes"}, {"ids", QJsonArray{"d"}}}));
  QVERIFY(!f.scene.nodeGraphicsObject(d));
  expectMatchesFresh(f);
  for (int i = 0; i < 4; ++i) { f.document.undo(); f.project(); expectMatchesFresh(f); }
  QCOMPARE(f.document.snapshot(), before);
  QVERIFY(!f.item("d"));
  QCOMPARE(f.item("b"), b.data());
  for (int i = 0; i < 4; ++i) { f.document.redo(); f.project(); expectMatchesFresh(f); }
  // An undone deletion restores the node under its previous item id.
  f.document.undo(); f.project();
  QCOMPARE(idFor(f.model, "d"), d);
  expectMatchesFresh(f);
  QCOMPARE(reset.count(), 0);
}
void IncrementalProjectionTest::dynamicPortShiftRebindsWires() {
  Fixture f;
  QSignalSpy reset(&f.model, &WorkflowGraphModel::modelReset);
  const QPointer<NodeGraphicsObject> a = f.item("a");
  const auto zeta = f.model.ports(idFor(f.model, "a"), PortType::Out).size() - 1;
  // "alpha" sorts before "zeta", so the connected dynamic output moves down one port.
  QVERIFY(f.apply({{"op", "addDynamicOutput"}, {"id", "a"}, {"name", "alpha"}, {"type", QJsonObject{{"type", "str"}}}}));
  QCOMPARE(f.item("a"), a.data());
  const auto wires = f.model.connections(idFor(f.model, "a"), PortType::Out, PortIndex(zeta + 1));
  QCOMPARE(wires.size(), size_t(1));
  QVERIFY(f.scene.connectionGraphicsObject(*wires.begin()));
  expectMatchesFresh(f);
  f.document.undo(); f.project();
  expectMatchesFresh(f);
  QCOMPARE(reset.count(), 0);
}
void IncrementalProjectionTest::groupsReroutesAndCommentsFollowIncrementalEdits() {
  Fixture f;
  QSignalSpy reset(&f.model, &WorkflowGraphModel::modelReset);
  const QPointer<NodeGraphicsObject> child = f.item("child");
  QVERIFY(f.apply({{"op", "moveNodes"}, {"positions", QJsonObject{{"group", QJsonObject{{"x", -700}, {"y", 50}}}}}}));
  QCOMPARE(f.item("child"), child.data());
  QCOMPARE(child->pos(), QPointF(-660, 110));
  QVERIFY(f.apply({{"op", "addNode"}, {"node", QJsonObject{{"id", "inner"}, {"parent_id", "group"}, {"type", "nodetool.workflows.base_node.Group"},
      {"data", QJsonObject{{"headline", "Inner"}}}, {"ui_properties", QJsonObject{{"position", QJsonObject{{"x", 10}, {"y", 20}}}, {"width", 200}, {"height", 200}}}}}}));
  QCOMPARE(f.item("inner")->zValue(), -1000000.0 + 1);
  QVERIFY(f.apply({{"op", "setComment"}, {"id", "comment"}, {"value", "Edited"}}));
  QCOMPARE(f.model.comment(idFor(f.model, "comment")).toString(), QString("Edited"));
  QVERIFY(f.apply({{"op", "renameNode"}, {"id", "group"}, {"title", "Renamed frame"}}));
  QCOMPARE(f.model.layout(idFor(f.model, "group")).title, QString("Renamed frame"));
  // The reroute shows the type that reaches it, so it follows a rewired source.
  QCOMPARE(f.model.rerouteHandleType(idFor(f.model, "reroute")), QString("str"));
  QVERIFY(f.apply({{"op", "removeEdge"}, {"id", "ar"}}));
  QCOMPARE(f.model.rerouteHandleType(idFor(f.model, "reroute")), QString("any"));
  expectMatchesFresh(f);
  QCOMPARE(reset.count(), 0);
}
void IncrementalProjectionTest::notesFollowIncrementalProjection() {
  Fixture f;
  QGraphicsView view(&f.scene);
  InlineTitlePresenter titles(f.model, f.scene, view, nullptr);
  QSignalSpy reset(&f.model, &WorkflowGraphModel::modelReset);
  QVERIFY(f.apply({{"op", "setNodeField"}, {"id", "b"}, {"field", "ui_properties"},
      {"value", QJsonObject{{"position", QJsonObject{{"x", 400}, {"y", 0}}}, {"title", "Below the card"}}}}));
  const auto note = [&f] {
    for (auto *child : f.item("b")->childItems()) {
      if (auto *object = dynamic_cast<QGraphicsObject *>(child); object && object->objectName() == "node-note-b") { return true; }
    }
    return false;
  };
  QTRY_VERIFY(note());
  QVERIFY(f.apply({{"op", "moveNodes"}, {"positions", QJsonObject{{"c", QJsonObject{{"x", 420}, {"y", 320}}}}}}));
  QTRY_VERIFY(note());
  QCOMPARE(reset.count(), 0);
}
void IncrementalProjectionTest::unsafeDiffsFallBackToReset() {
  Fixture f;
  QSignalSpy reset(&f.model, &WorkflowGraphModel::modelReset);
  QSignalSpy changed(&f.model, &WorkflowGraphModel::projectionChanged);
  f.model.project(f.document.snapshot(), catalog(), true);
  QCOMPARE(reset.count(), 1);
  QVERIFY(f.model.nodeFlags(idFor(f.model, "a")) & NodeFlag::Locked);
  f.model.project(f.document.snapshot(), catalog(), false);
  QCOMPARE(reset.count(), 2);
  auto other = f.document.snapshot();
  other["id"] = "another";
  f.model.project(other, catalog());
  QCOMPARE(reset.count(), 3);
  auto changedCatalog = catalog();
  auto sink = changedCatalog[1].toObject(); sink["title"] = "Renamed"; changedCatalog[1] = sink;
  f.model.project(other, changedCatalog);
  QCOMPARE(reset.count(), 4);
  QCOMPARE(f.model.layout(idFor(f.model, "b")).title, QString("Renamed"));
  // A replaced document resets even when its snapshot is identical.
  f.model.resetOnNextProjection();
  f.model.project(other, changedCatalog);
  QCOMPARE(reset.count(), 5);
  f.model.project(other, changedCatalog);
  QCOMPARE(reset.count(), 5);
  QCOMPARE(changed.count(), 6);
}
#endif
QTEST_MAIN(IncrementalProjectionTest)
#include "IncrementalProjectionTest.moc"
