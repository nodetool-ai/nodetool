#include "../support/DarkCanvasTheme.h"
#include "graph/EditorScene.h"
#include "graph/WorkflowGraphModel.h"
#include "graph/NodeLayout.h"
#include <QPainter>
#include "document/WorkflowDocument.h"
#include "run/NodeRuntimeModel.h"
#include <QtNodes/internal/NodeGraphicsObject.hpp>
#include <QtNodes/internal/ConnectionGraphicsObject.hpp>
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
  // The ring shows once the running state holds for runningDelayMs.
  QTRY_VERIFY(scene.animationActive());
  QCOMPARE(scene.nodeGraphicsObject(id),item);
  QVERIFY(item->isSelected());
  // A status alone changes no card size, as on the web.
  QCOMPARE(graph.layout(id).size, originalSize);
  QCOMPARE(item->pos(),QPointF(10,20));
  QCOMPARE(document.snapshot(),before); QCOMPARE(document.undoStack()->count(),undoCount);
  scene.setReducedMotion(true); QVERIFY(!scene.animationActive());
  scene.setReducedMotion(false); QVERIFY(scene.animationActive());
  runtime.setConnected(false); QVERIFY(!scene.animationActive());
  runtime.setConnected(true); QVERIFY(scene.animationActive());
  runtime.ingest("a",{{"type","job_update"},{"job_id","a"},{"job_seq",2},{"status","completed"}});
  QTRY_VERIFY(!scene.animationActive());
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
  scene.setTheme(nodetool::test::darkCanvasTheme());
  const auto id = *graph.allNodeIds().begin();
  const QVector<QColor> expected{typeColor("image"), typeColor("str"), typeColor("int"), typeColor("int"), typeColor("int")};
  QCOMPARE(graph.layout(id).runningColors, expected);
  runtime.beginRun("a");
  runtime.ingest("a",{{"type","node_update"},{"job_id","a"},{"job_seq",1},{"node_id","n"},{"status","running"}});
  QTRY_VERIFY(graph.runningShown(id));
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
 // An If or Switch graph: i feeds a through its true output and b through its false output.
 // b feeds c, and d takes one input from a and one from b, so d still runs on its live input.
 private:
 static QJsonObject branchGraph(QJsonObject *catalogOut = nullptr, QJsonArray *catalogArray = nullptr) {
  const auto text = QJsonObject{{"type","str"}};
  const auto port = [&](const char *name) { return QJsonObject{{"name",name},{"type",text}}; };
  const QJsonArray catalog{
    QJsonObject{{"node_type","t"},{"input_fields",QJsonArray{"in","in2"}},{"properties",QJsonArray{port("in"),port("in2")}},{"outputs",QJsonArray{port("out")}}},
    QJsonObject{{"node_type","nodetool.control.If"},{"input_fields",QJsonArray{"in"}},{"properties",QJsonArray{port("in")}},{"outputs",QJsonArray{port("if_true"),port("if_false")}}}};
  const auto placed = [](const char *id, const char *type, double x, double y) { return QJsonObject{{"id",id},{"type",type},{"ui_properties",QJsonObject{{"position",QJsonObject{{"x",x},{"y",y}}}}},{"data",QJsonObject{}}}; };
  const auto wire = [](const char *id, const char *from, const char *out, const char *to, const char *in) { return QJsonObject{{"id",id},{"source",from},{"sourceHandle",out},{"target",to},{"targetHandle",in}}; };
  if (catalogArray) { *catalogArray = catalog; }
  (void)catalogOut;
  return {{"id","w"},{"graph",QJsonObject{{"nodes",QJsonArray{placed("i","nodetool.control.If",0,0),placed("a","t",400,0),placed("b","t",400,200),placed("c","t",800,200),placed("d","t",800,0),placed("x","t",0,400)}},
    {"edges",QJsonArray{wire("ia","i","if_true","a","in"),wire("ib","i","if_false","b","in"),wire("bc","b","out","c","in"),wire("ad","a","out","d","in"),wire("bd","b","out","d","in2")}}}}};
 }
 static QtNodes::NodeId nodeOf(WorkflowGraphModel &graph, const QString &resource) {
  for (const auto id : graph.allNodeIds()) { if (graph.resourceId(id) == resource) { return id; } }
  return QtNodes::InvalidNodeId;
 }
 static QtNodes::ConnectionId wireOf(WorkflowGraphModel &graph, const QString &edgeId) {
  for (const auto id : graph.allNodeIds()) { for (const auto &c : graph.allConnectionIds(id)) { if (graph.edge(c)["id"].toString() == edgeId) { return c; } } }
  return {QtNodes::InvalidNodeId,0,QtNodes::InvalidNodeId,0};
 }
 static void reportBranch(NodeRuntimeModel &runtime, const QString &job) {
  runtime.beginRun(job);
  runtime.ingest(job,{{"type","edge_update"},{"job_id",job},{"job_seq",1},{"edge_id","ia"},{"status","completed"},{"counter",1}});
  runtime.ingest(job,{{"type","edge_update"},{"job_id",job},{"job_seq",2},{"edge_id","ib"},{"status","completed"}});
 }
 private slots:
 // web/src/utils/untakenBranches.ts and styles/nodes.states.css: the untaken side of an If or
 // Switch fades to 0.4, a node with one live input keeps running, and a selection's 0.2 wins.
 void untakenBranchFadesAfterTheRunReportsIt() {
  QJsonArray catalog; const auto snapshot = branchGraph(nullptr,&catalog);
  WorkflowGraphModel graph; graph.project(snapshot,catalog);
  NodeRuntimeModel runtime; graph.setRuntimeModel(&runtime);
  EditorScene scene(graph);
  const auto opacity = [&](const char *id) { return scene.nodeGraphicsObject(nodeOf(graph,id))->opacity(); };
  const auto wireOpacity = [&](const char *edge) { return scene.connectionGraphicsObject(wireOf(graph,edge))->opacity(); };
  // EditorWindow sets full item opacity. The library default is 0.8.
  for (auto item : scene.items()) { item->setOpacity(1); }
  reportBranch(runtime,"run");
  QTRY_COMPARE(opacity("b"),node_metrics::notRunOpacity);
  QCOMPARE(opacity("c"),node_metrics::notRunOpacity);
  QCOMPARE(wireOpacity("ib"),node_metrics::notRunOpacity); QCOMPARE(wireOpacity("bc"),node_metrics::notRunOpacity); QCOMPARE(wireOpacity("bd"),node_metrics::notRunOpacity);
  for (const char *live : {"i","a","d","x"}) { QCOMPARE(opacity(live),1.0); }
  QCOMPARE(wireOpacity("ia"),1.0); QCOMPARE(wireOpacity("ad"),1.0);
  // The finished run still shows which branch ran.
  runtime.ingest("run",{{"type","job_update"},{"job_id","run"},{"job_seq",3},{"status","completed"}});
  QTest::qWait(30); QCOMPARE(opacity("b"),node_metrics::notRunOpacity);
  // A selection fades everything off its branch to 0.2, even an untaken node.
  scene.nodeGraphicsObject(nodeOf(graph,"x"))->setSelected(true);
  QTRY_COMPARE(opacity("b"),branchDimmedOpacity);
  scene.clearSelection(); QTRY_COMPARE(opacity("b"),node_metrics::notRunOpacity);
  // The next run reports nothing yet, so nothing fades.
  runtime.beginRun("next"); QTRY_COMPARE(opacity("b"),1.0); QCOMPARE(wireOpacity("ib"),1.0);
 }
 // A branch that fired on every output marks nothing, and counters above zero are live.
 void everyBranchTakenFadesNothing() {
  QJsonArray catalog; const auto snapshot = branchGraph(nullptr,&catalog);
  WorkflowGraphModel graph; graph.project(snapshot,catalog);
  NodeRuntimeModel runtime; graph.setRuntimeModel(&runtime);
  EditorScene scene(graph);
  runtime.beginRun("run");
  runtime.ingest("run",{{"type","edge_update"},{"job_id","run"},{"job_seq",1},{"edge_id","ia"},{"status","completed"},{"counter",1}});
  runtime.ingest("run",{{"type","edge_update"},{"job_id","run"},{"job_seq",2},{"edge_id","ib"},{"status","completed"},{"counter",2}});
  QTest::qWait(30);
  QVERIFY(graph.untakenBranch().empty());
  QCOMPARE(scene.nodeGraphicsObject(nodeOf(graph,"b"))->opacity(),1.0);
 }
 // web/src/hooks/useProcessedEdges.ts: an edge flows while its source node runs or it reports
 // message_sent. A running target does not make its inputs flow.
 void wiresFlowFromRunningSourcesOnly() {
  QJsonArray catalog; const auto snapshot = branchGraph(nullptr,&catalog);
  WorkflowGraphModel graph; graph.project(snapshot,catalog);
  NodeRuntimeModel runtime; graph.setRuntimeModel(&runtime);
  EditorScene scene(graph);
  const auto ia = wireOf(graph,"ia"), ad = wireOf(graph,"ad");
  QVERIFY(!graph.runtimeWireFlowing(ia));
  runtime.beginRun("run");
  runtime.ingest("run",{{"type","node_update"},{"job_id","run"},{"job_seq",1},{"node_id","a"},{"status","running"}});
  QVERIFY(graph.runtimeWireFlowing(ad)); QVERIFY(!graph.runtimeWireFlowing(ia));
  QVERIFY(scene.animationActive());
  runtime.ingest("run",{{"type","node_update"},{"job_id","run"},{"job_seq",2},{"node_id","a"},{"status","completed"}});
  QVERIFY(!graph.runtimeWireFlowing(ad)); QVERIFY(!scene.animationActive());
  runtime.ingest("run",{{"type","edge_update"},{"job_id","run"},{"job_seq",3},{"edge_id","ia"},{"status","message_sent"}});
  QVERIFY(graph.runtimeWireFlowing(ia)); QVERIFY(scene.animationActive());
  // Kernel counters are not an animation signal.
  runtime.ingest("run",{{"type","edge_update"},{"job_id","run"},{"job_seq",4},{"edge_id","ib"},{"status","active"},{"counter",3}});
  QVERIFY(!graph.runtimeWireFlowing(wireOf(graph,"ib")));
 }
 // web/src/components/node_editor/CustomEdge.tsx: a pill shows the stream count when it passes 1.
 void streamCountPillAppearsAboveOne() {
  QJsonArray catalog; const auto snapshot = branchGraph(nullptr,&catalog);
  WorkflowGraphModel graph; graph.project(snapshot,catalog);
  NodeRuntimeModel runtime; graph.setRuntimeModel(&runtime);
  EditorScene scene(graph);
  scene.setTheme(nodetool::test::darkCanvasTheme());
  const auto ad = wireOf(graph,"ad");
  const auto path = wireCurve(scene.connectionGraphicsObject(ad)->endPoint(QtNodes::PortType::Out), scene.connectionGraphicsObject(ad)->endPoint(QtNodes::PortType::In));
  const auto mid = path.pointAtPercent(0.5);
  const QRectF region(mid - QPointF(20,14),QSizeF(40,28));
  const auto bright = [&] {
    QImage image(region.size().toSize(),QImage::Format_ARGB32); image.fill(Qt::transparent);
    { QPainter painter(&image); scene.render(&painter,QRectF(QPointF(),region.size()),region); }
    int count = 0;
    for (int y = 0; y < image.height(); ++y) { for (int x = 0; x < image.width(); ++x) { const auto c = image.pixelColor(x,y); count += c.red() > 200 && c.green() > 200 && c.blue() > 200 && c.alpha() > 200; } }
    return count;
  };
  runtime.beginRun("run");
  const auto before = bright();
  runtime.ingest("run",{{"type","edge_update"},{"job_id","run"},{"job_seq",1},{"edge_id","ad"},{"status","active"},{"counter",1}});
  QCOMPARE(bright(),before);
  runtime.ingest("run",{{"type","edge_update"},{"job_id","run"},{"job_seq",2},{"edge_id","ad"},{"status","active"},{"counter",12}});
  QVERIFY2(bright() > before + 8, qPrintable(QString::number(bright())));
 }
};
QTEST_MAIN(RuntimeUiTest)
#include "RuntimeUiTest.moc"
