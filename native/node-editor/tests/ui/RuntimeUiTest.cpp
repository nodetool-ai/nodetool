#include "graph/EditorScene.h"
#include "graph/WorkflowGraphModel.h"
#include "document/WorkflowDocument.h"
#include "run/NodeRuntimeModel.h"
#include <QtNodes/internal/NodeGraphicsObject.hpp>
#include <QtNodes/internal/AbstractNodeGeometry.hpp>
#include <QtTest>
using namespace nodetool;
using namespace nodetool::node_editor;
class RuntimeUiTest final : public QObject {
 Q_OBJECT
private slots:
 void projectionPreservesEditingAndItems() {
  WorkflowDocument document;
  const QJsonObject snapshot{{"id","w"},{"graph",QJsonObject{{"nodes",QJsonArray{QJsonObject{{"id","n"},{"type","text"},{"ui_properties",QJsonObject{{"position",QJsonObject{{"x",10},{"y",20}}}}},{"data",QJsonObject{}}}}},{"edges",QJsonArray{}}}}};
  QVERIFY(document.load(snapshot));
  WorkflowGraphModel graph; graph.project(document.snapshot());
  NodeRuntimeModel runtime; graph.setRuntimeModel(&runtime);
  EditorScene scene(graph);
  const auto ids = graph.allNodeIds(); QVERIFY(!ids.empty()); const auto id = *ids.begin();
  auto item = scene.nodeGraphicsObject(id); QVERIFY(item);
  item->setSelected(true);
  const auto before = document.snapshot();
  const auto undoCount = document.undoStack()->count();
  const auto originalSize = graph.layout(id).size;
  runtime.beginRun("a");
  runtime.ingest("a",{{"type","node_update"},{"job_id","a"},{"job_seq",1},{"node_id","n"},{"status","running"}});
  QVERIFY(scene.animationActive());
  QCOMPARE(scene.nodeGraphicsObject(id),item);
  QVERIFY(item->isSelected());
  QVERIFY(graph.layout(id).size.height() > originalSize.height());
  QCOMPARE(item->pos(),QPointF(10,20));
  QCOMPARE(document.snapshot(),before); QCOMPARE(document.undoStack()->count(),undoCount);
  scene.setReducedMotion(true); QVERIFY(!scene.animationActive());
  scene.setReducedMotion(false); QVERIFY(scene.animationActive());
  runtime.setConnected(false); QVERIFY(!scene.animationActive());
  runtime.setConnected(true); QVERIFY(scene.animationActive());
  runtime.ingest("a",{{"type","job_update"},{"job_id","a"},{"job_seq",2},{"status","completed"}});
  QVERIFY(!scene.animationActive());
  QCOMPARE(document.snapshot(),before); QCOMPARE(document.undoStack()->count(),undoCount);
  runtime.beginRun("b");
  QCOMPARE(graph.layout(id).size,originalSize);
  QCOMPARE(scene.nodeGraphicsObject(id),item);
 }
};
QTEST_MAIN(RuntimeUiTest)
#include "RuntimeUiTest.moc"
