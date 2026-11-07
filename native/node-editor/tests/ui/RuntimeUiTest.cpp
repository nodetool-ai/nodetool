#include "graph/EditorScene.h"
#include "graph/WorkflowGraphModel.h"
#include "graph/NodeLayout.h"
#include <QPainter>
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
 void runningRingMatchesWebConicGradient() {
  QCOMPARE(runningRingAngle(0), 90.0);
  QCOMPARE(runningRingAngle(1000), 270.0);
  QCOMPARE(runningRingAngle(2000), 90.0);
  QVERIFY(runningRingAngle(250) < 90 + 360 * 0.125);
  const QJsonArray catalog{QJsonObject{{"node_type","test"},
      {"outputs",QJsonArray{QJsonObject{{"name","output"},{"type",QJsonObject{{"type","image"}}}}}},
      {"properties",QJsonArray{QJsonObject{{"name","prompt"},{"type","str"}},QJsonObject{{"name","count"},{"type","int"}}}}}};
  const QJsonObject snapshot{{"id","w"},{"graph",QJsonObject{{"nodes",QJsonArray{QJsonObject{{"id","n"},{"type","test"},{"ui_properties",QJsonObject{{"position",QJsonObject{{"x",0},{"y",0}}}}},{"data",QJsonObject{}}}}},{"edges",QJsonArray{}}}}};
  WorkflowGraphModel graph; graph.project(snapshot, catalog);
  NodeRuntimeModel runtime; graph.setRuntimeModel(&runtime);
  EditorScene scene(graph);
  const auto id = *graph.allNodeIds().begin();
  const QVector<QColor> expected{typeColor("image"), typeColor("str"), typeColor("int"), typeColor("int"), typeColor("int")};
  QCOMPARE(graph.layout(id).runningColors, expected);
  runtime.beginRun("a");
  runtime.ingest("a",{{"type","node_update"},{"job_id","a"},{"job_seq",1},{"node_id","n"},{"status","running"}});
  scene.setReducedMotion(true);
  QCOMPARE(scene.runningAngle(), 90.0);
  // EditorWindow sets the QtNodes node opacity to 1. The library default is 0.8.
  scene.nodeGraphicsObject(id)->setOpacity(1);
  const QRectF box(scene.nodeGraphicsObject(id)->pos(), graph.layout(id).size);
  const auto source = box.adjusted(-10, -10, 10, 10);
  QImage image(source.size().toSize(), QImage::Format_ARGB32);
  image.fill(Qt::transparent);
  { QPainter painter(&image); scene.render(&painter, QRectF(QPointF(), source.size()), source); }
  const auto pixel = [&](double x, double y) { return image.pixelColor(int(std::floor(x - source.left())), int(std::floor(y - source.top()))); };
  const auto near = [](const QColor &a, const QColor &b) {
    return std::abs(a.red() - b.red()) < 24 && std::abs(a.green() - b.green()) < 24 && std::abs(a.blue() - b.blue()) < 24;
  };
  // At the web's first frame the ring starts on the first color at 3 o'clock
  // and reaches the later stops clockwise, so 9 o'clock shows the int color.
  const auto midY = box.center().y();
  QVERIFY2(near(pixel(box.right() + 2.5, midY), typeColor("image")), qPrintable(pixel(box.right() + 2.5, midY).name()));
  QVERIFY2(near(pixel(box.left() - 3, midY), typeColor("int")), qPrintable(pixel(box.left() - 3, midY).name()));
  QVERIFY2(!near(pixel(box.left() - 8, midY), typeColor("int")), qPrintable(pixel(box.left() - 8, midY).name()));
 }
};
QTEST_MAIN(RuntimeUiTest)
#include "RuntimeUiTest.moc"
