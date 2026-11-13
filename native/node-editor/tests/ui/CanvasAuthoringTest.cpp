#include "ui/EditorWindow.h"
#include "graph/EditorScene.h"
#include "PropertyFixture.h"
#include "server/MsgPack.h"
#include <QWebSocketServer>
#include <QWebSocket>
#include <QApplication>
#include <QDir>
#include <QDragEnterEvent>
#include <QGraphicsView>
#include "EntryMenuSupport.h"
#include <QMimeData>
#include <QQuickItem>
#include <QQuickWidget>
#include <QQuickWindow>
#include <QTimer>
#include <QTemporaryDir>
#include <QtNodes/internal/NodeGraphicsObject.hpp>
#include <QtTest>
using namespace nodetool;
namespace {
QJsonObject node(const QString &id) {
  auto n = property_fixture::node(id);
  n["data"] = QJsonObject{{"Text", "baseline"}, {"Count", 2}, {"Ratio", 0.5}};
  n["ui_properties"] = QJsonObject{{"position", QJsonObject{{"x", 450}, {"y", 400}}}};
  n["future"] = QJsonObject{{"preserved", true}};
  return n;
}
QJsonArray compactCatalog() {
  auto metadata = property_fixture::catalog().first().toObject();
  const auto properties = metadata["properties"].toArray();
  metadata["properties"] = QJsonArray{properties[0], properties[2], properties[3]};
  return {metadata};
}
QJsonObject workflow() {
  QJsonArray nodes;
  for (int i = 0; i < 8; ++i) { nodes.append(node(QString("n%1").arg(i))); }
  QJsonArray edges;
  for (int i = 1; i < 7; ++i) { edges.append(QJsonObject{{"id", QString("e%1").arg(i)}, {"source", QString("n%1").arg((i - 1) / 2)}, {"target", QString("n%1").arg(i)}, {"sourceHandle", "out"}, {"targetHandle", "Text"}}); }
  return {{"name", "Canvas authoring fixture"}, {"graph", QJsonObject{{"nodes", nodes}, {"edges", edges}}}};
}
QPointF position(const QJsonObject &node) {
  const auto p = node["ui_properties"].toObject()["position"].toObject();
  return {p["x"].toDouble(), p["y"].toDouble()};
}
QQuickItem *find(QQuickItem *root, const QString &name) {
  if (root->objectName() == name) { return root; }
  for (auto child : root->childItems()) { if (auto found = find(child, name)) { return found; } }
  return nullptr;
}
}
class CanvasAuthoringTest final : public QObject {
 Q_OBJECT
private slots:
 void runSelectionTransmitsOnlyRequestedRegion() {
  QWebSocketServer server("native selected run", QWebSocketServer::NonSecureMode);
  QVERIFY(server.listen(QHostAddress::LocalHost));
  QList<QJsonObject> commands;
  QPointer<QWebSocket> peer;
  connect(&server, &QWebSocketServer::newConnection, this, [&] {
    peer = server.nextPendingConnection(); peer->setParent(&server);
    connect(peer, &QWebSocket::binaryMessageReceived, this, [&](const QByteArray &bytes) {
      const auto value = node_editor::decodeMsgPack(bytes); QVERIFY(value); commands.append(value->toObject());
    });
  });
  EditorWindow window; window.setCatalog(property_fixture::catalog());
  QVERIFY(window.document()->load(workflow())); window.show(); QTest::qWait(60);
  window.session()->connectToServer(QUrl(QString("http://127.0.0.1:%1").arg(server.serverPort())), {});
  QTRY_VERIFY(window.session()->connected());
  window.setCatalog(compactCatalog());
  window.action("Run selected"); QTest::qWait(20); QVERIFY(commands.isEmpty());
  window.action("Auto layout"); QTest::qWait(60);
  const auto authored = window.document()->snapshot();
  QVERIFY(window.selectNode("n1"));
  QQuickWidget *toolbar = nullptr;
  for (auto panel : window.findChildren<QQuickWidget *>()) { if (panel->source().fileName() == "SelectionToolbar.qml") { toolbar = panel; } }
  QVERIFY(toolbar); QTest::qWait(50);
  const auto control = find(toolbar->rootObject(), "selection-run-selected"); QVERIFY(control); QVERIFY(control->isVisible());
  QSignalSpy clicked(control, SIGNAL(clicked()));
  QTest::mouseClick(toolbar->quickWindow(), Qt::LeftButton, Qt::NoModifier, control->mapToScene(QPointF(control->width()/2, control->height()/2)).toPoint());
  QCOMPARE(clicked.count(), 1);
  QTRY_COMPARE_WITH_TIMEOUT(commands.size(), 1, 1000);
  QCOMPARE(commands.first()["command"].toString(), QString("run_job"));
  const auto graph = commands.first()["data"].toObject()["graph"].toObject();
  QSet<QString> actual;
  for (const auto &value : graph["nodes"].toArray()) { actual.insert(value.toObject()["id"].toString()); }
  QCOMPARE(actual, (QSet<QString>{"n0", "n1"}));
  QCOMPARE(graph["edges"].toArray().size(), 1);
  QCOMPARE(window.runOutput()->runs().size(), 1);
  const auto job = commands.first()["data"].toObject()["job_id"].toString(); QVERIFY(!job.isEmpty());
  // Several cards wait for the active run. A lone card is Run node, an independent job that the web never blocks
  // (useRunFromHere.ts returns isWorkflowRunning: false), which NodeActionsTest covers.
  auto authoringModel = window.findChild<WorkflowGraphModel *>(); QVERIFY(authoringModel);
  for (const auto id : authoringModel->allNodeIds()) { if (authoringModel->resourceId(id) == "n0") { window.scene()->nodeGraphicsObject(id)->setSelected(true); } }
  QCOMPARE(window.selectedCount(), 2);
  window.action("Run selected"); QTest::qWait(20); QCOMPARE(commands.size(), 1);
  QVERIFY(window.selectNode("n1"));
  window.action("Stop"); QTRY_COMPARE(commands.size(), 2);
  QCOMPARE(commands[1]["command"].toString(), QString("cancel_job")); QCOMPARE(commands[1]["data"].toObject()["job_id"].toString(), job);
  window.session()->reconnectRuns(); QTRY_COMPARE(commands.size(), 3);
  QCOMPARE(commands[2]["command"].toString(), QString("reconnect_job")); QCOMPARE(commands[2]["data"].toObject()["job_id"].toString(), job);
  peer->sendBinaryMessage(node_editor::encodeMsgPack(QJsonObject{{"type", "generation_complete"}, {"job_id", job}, {"job_seq", 1}, {"node_id", "n0"}, {"outputs", QJsonObject{{"out", "cached upstream"}}}}));
  peer->sendBinaryMessage(node_editor::encodeMsgPack(QJsonObject{{"type", "node_update"}, {"job_id", job}, {"job_seq", 2}, {"node_id", "n1"}, {"status", "completed"}, {"result", QJsonObject{{"out", "selected result"}}}}));
  peer->sendBinaryMessage(node_editor::encodeMsgPack(QJsonObject{{"type", "job_update"}, {"job_id", job}, {"job_seq", 3}, {"status", "completed"}}));
  QTRY_VERIFY(!window.runActive()); QCOMPARE(window.runOutput()->runs().size(), 1);
  QTRY_COMPARE(window.message(), QString("Run completed"));
  QTRY_VERIFY([&] { for (const auto &entry : window.runOutput()->entries()) { if (entry.toMap()["text"].toString().contains("selected result")) { return true; } } return false; }());
  QCOMPARE(window.document()->snapshot(), authored);
  auto cacheMetadata=compactCatalog().first().toObject(); cacheMetadata["cache_ttl"]="forever"; window.setCatalog({cacheMetadata});
  window.action("Run selected"); QTRY_COMPARE(commands.size(),4);
  const auto reusedGraph=commands.last()["data"].toObject()["graph"].toObject();
  QCOMPARE(reusedGraph["nodes"].toArray().size(),1); QVERIFY(reusedGraph["edges"].toArray().isEmpty());
  QCOMPARE(reusedGraph["nodes"].toArray().first().toObject()["data"].toObject()["Text"].toString(),QString("cached upstream"));
  QVERIFY(window.message().contains("Reused upstream nodes: 1")); QCOMPARE(window.document()->snapshot(),authored);
  QQuickItem *history=nullptr;
  for(auto panel:window.findChildren<QQuickWidget *>()){if(panel->source().fileName()=="RunOutput.qml"){history=find(panel->rootObject(),"run-history");}}
  QVERIFY(history);
  QTRY_COMPARE(history->property("currentValue").toString(),window.runOutput()->selectedRunId());
  for (const bool dark : {true, false}) {
    window.setDarkTheme(dark); window.fit(); QTest::qWait(100);
    const auto output = qEnvironmentVariable("NODETOOL_CANVAS_CAPTURE_DIR");
    if (!output.isEmpty()) { QVERIFY(QDir().mkpath(output)); QVERIFY(window.grab().save(output + (dark ? "/run-selected-reuse-dark.png" : "/run-selected-reuse-light.png"))); }
  }
  const auto reusedJob=commands.last()["data"].toObject()["job_id"].toString();
  peer->sendBinaryMessage(node_editor::encodeMsgPack(QJsonObject{{"type","job_update"},{"job_id",reusedJob},{"job_seq",1},{"status","completed"}}));
  QTRY_VERIFY(!window.runActive());
 }
 void bypassSelectionUndoAndReopen() {
  EditorWindow window; window.setCatalog(compactCatalog());
  QVERIFY(window.document()->load(workflow())); window.show(); QTest::qWait(80);
  window.action("Auto layout"); QTest::qWait(60);
  const auto original = window.document()->snapshot();
  QVERIFY(window.selectNode("n1"));
  auto model = window.findChild<WorkflowGraphModel *>(); QVERIFY(model);
  for (const auto id : model->allNodeIds()) { if (model->resourceId(id) == "n2") { window.scene()->nodeGraphicsObject(id)->setSelected(true); } }
  QCOMPARE(window.selectedCount(), 2); QVERIFY(!window.selectionDisabled());
  QQuickWidget *toolbar = nullptr;
  for (auto panel : window.findChildren<QQuickWidget *>()) { if (panel->source().fileName() == "SelectionToolbar.qml") { toolbar = panel; } }
  QVERIFY(toolbar); QTest::qWait(60);
  auto control = find(toolbar->rootObject(), "selection-disable-selected"); QVERIFY(control); QVERIFY(control->isVisible());
  const auto count = window.document()->undoStack()->count();
  QTest::mouseClick(toolbar->quickWindow(), Qt::LeftButton, Qt::NoModifier, control->mapToScene(QPointF(control->width()/2, control->height()/2)).toPoint());
  QTRY_VERIFY(window.selectionDisabled()); QCOMPARE(window.document()->undoStack()->count(), count + 1);
  const auto disabled = window.document()->snapshot();
  for (const auto &value : original["graph"].toObject()["nodes"].toArray()) {
    auto expected = value.toObject(); const auto id = expected["id"].toString();
    if (id == "n1" || id == "n2") { auto ui = expected["ui_properties"].toObject(); ui["bypassed"] = true; expected["ui_properties"] = ui; }
    QCOMPARE(window.document()->node(id), expected); QVERIFY(!window.document()->node(id).contains("disabled"));
  }
  QTRY_VERIFY([&] { for (const auto id : model->allNodeIds()) { if (model->resourceId(id) == "n1") { return model->bypassed(id); } } return false; }());
  QTemporaryDir directory; QVERIFY(directory.isValid()); const auto path = directory.filePath("disabled.json");
  QVERIFY(window.saveFile(path));
  EditorWindow reopened; reopened.setCatalog(compactCatalog()); QVERIFY(reopened.openFile(path)); QCOMPARE(reopened.document()->snapshot(), disabled);
  window.action("Undo"); QCOMPARE(window.document()->snapshot(), original);
  window.action("Redo"); QCOMPARE(window.document()->snapshot(), disabled);
  QTest::qWait(80); control = find(toolbar->rootObject(), "selection-enable-selected"); QVERIFY(control);
  QTest::mouseClick(toolbar->quickWindow(), Qt::LeftButton, Qt::NoModifier, control->mapToScene(QPointF(control->width()/2, control->height()/2)).toPoint());
  QTRY_VERIFY(!window.selectionDisabled());
  QVERIFY(!window.document()->node("n1")["ui_properties"].toObject()["bypassed"].toBool());
  window.action("Undo"); QCOMPARE(window.document()->snapshot(), disabled);
  window.action("Disable selected");
  QVERIFY(window.selectNode("n1"));
  for (const bool dark : {true, false}) {
    window.setDarkTheme(dark); window.fit(); QTest::qWait(120);
    const auto output = qEnvironmentVariable("NODETOOL_CANVAS_CAPTURE_DIR");
    if (!output.isEmpty()) { QVERIFY(QDir().mkpath(output)); QVERIFY(window.grab().save(output + (dark ? "/disabled-selected-dark.png" : "/disabled-selected-light.png"))); }
  }
 }
 void layoutMenuUndoAndSelection() {
  EditorWindow window;
  window.setCatalog(compactCatalog());
  const auto original = workflow();
  QVERIFY(window.document()->load(original)); window.show(); QTest::qWait(100);
  window.action("More");
  auto menu = entry_menu::host(window, "more"); QVERIFY(menu);
  QVERIFY(entry_menu::click(menu, "Auto layout"));
  QTRY_COMPARE(window.document()->undoStack()->count(), 1);
  QTRY_VERIFY(position(window.document()->node("n0")) != QPointF(450, 400));
    // Document commands precede the coalesced canvas projection.
    QCoreApplication::processEvents();
  auto model = window.findChild<WorkflowGraphModel *>(); QVERIFY(model);
  const auto ids = model->allNodeIds();
  for (const auto a : ids) {
    const auto rectA = window.scene()->nodeGraphicsObject(a)->sceneBoundingRect();
    for (const auto b : ids) { if (a != b) { QVERIFY(!rectA.intersects(window.scene()->nodeGraphicsObject(b)->sceneBoundingRect())); } }
  }
  QCOMPARE(window.document()->graph()["edges"], original["graph"].toObject()["edges"]);
  window.action("Undo"); QCOMPARE(window.document()->snapshot(), original);
  window.action("Redo");
  QTest::qWait(60);
  const auto arranged = window.document()->snapshot();
  QVERIFY(window.selectNode("n1"));
  for (const auto id : model->allNodeIds()) { if (model->resourceId(id) == "n5") { window.scene()->nodeGraphicsObject(id)->setSelected(true); } }
  const auto beforeCount = window.document()->undoStack()->count();
  window.action("Layout selection");
  QCOMPARE(window.document()->undoStack()->count(), beforeCount + 1);
  for (const auto &value : arranged["graph"].toObject()["nodes"].toArray()) {
    const auto n = value.toObject(); const auto id = n["id"].toString();
    if (id != "n1" && id != "n5") { QCOMPARE(window.document()->node(id), n); }
  }
  window.action("Undo"); QCOMPARE(window.document()->snapshot(), arranged);
  window.action("Clear selection");
  window.action("Layout selection"); QCOMPARE(window.document()->snapshot(), arranged);
  QVERIFY(window.message().contains("Select nodes"));
  window.action("Auto layout");
  for (const bool dark : {true, false}) {
    window.setDarkTheme(dark); window.fit(); QVERIFY(window.selectNode("n1")); QTest::qWait(150);
    const auto directory = qEnvironmentVariable("NODETOOL_CANVAS_CAPTURE_DIR");
    if (!directory.isEmpty()) { QVERIFY(QDir().mkpath(directory)); QVERIFY(window.grab().save(directory + (dark ? "/layout-selected-dark.png" : "/layout-selected-light.png"))); }
  }
 }
 void dropCoordinatesDefaultsAndUndo() {
  EditorWindow window; window.setCatalog(property_fixture::catalog()); window.show(); QTest::qWait(80);
  auto view = window.findChild<QGraphicsView *>(); QVERIFY(view);
  view->scale(0.63, 0.63); view->centerOn(721, -213);
  const QPoint point(173, 219); const auto expected = view->mapToScene(point);
  QMimeData mime; mime.setData("application/x-nodetool-node-type", "fixture.Properties");
  QDragEnterEvent enter(QPointF(point), Qt::CopyAction, &mime, Qt::LeftButton, Qt::NoModifier);
  QApplication::sendEvent(view->viewport(), &enter); QVERIFY(enter.isAccepted());
  QDragMoveEvent move(QPointF(point), Qt::CopyAction, &mime, Qt::LeftButton, Qt::NoModifier);
  QApplication::sendEvent(view->viewport(), &move); QVERIFY(move.isAccepted());
  QDropEvent drop(point, Qt::CopyAction, &mime, Qt::LeftButton, Qt::NoModifier);
  QApplication::sendEvent(view->viewport(), &drop); QVERIFY(drop.isAccepted());
  QCOMPARE(window.document()->nodes().size(), 1); QCOMPARE(window.document()->undoStack()->count(), 1);
  const auto added = window.document()->nodes().first().toObject();
  QCOMPARE(position(added), expected); QCOMPARE(added["data"].toObject()["Count"].toInt(), 2);
  window.action("Undo"); QVERIFY(window.document()->nodes().isEmpty());
  window.action("Redo"); QCOMPARE(window.document()->nodes().first().toObject(), added);
 }
 void invalidDropAndReadOnly() {
  EditorWindow window; window.setCatalog(property_fixture::catalog()); window.show(); QTest::qWait(60);
  auto view = window.findChild<QGraphicsView *>(); QVERIFY(view);
  const auto initial = window.document()->snapshot();
  for (const auto bytes : {QByteArray("unknown.Type"), QByteArray("fixture.Properties\0suffix", 25), QByteArray(5000, 'x'), QByteArray("{\"type\":\"fixture.Properties\"}")}) {
    QMimeData mime; mime.setData("application/x-nodetool-node-type", bytes);
    QDragEnterEvent enter(QPointF(30,30), Qt::CopyAction, &mime, Qt::LeftButton, Qt::NoModifier);
    QApplication::sendEvent(view->viewport(), &enter); QVERIFY(!enter.isAccepted());
    QDropEvent drop(QPointF(30,30), Qt::CopyAction, &mime, Qt::LeftButton, Qt::NoModifier);
    QApplication::sendEvent(view->viewport(), &drop); QVERIFY(!drop.isAccepted());
    QCOMPARE(window.document()->snapshot(), initial);
  }
  auto locked = workflow(); auto graph = locked["graph"].toObject(); graph["links"] = QJsonArray{QJsonObject{{"future", true}}}; locked["graph"] = graph;
  QVERIFY(window.document()->load(locked)); QVERIFY(window.readOnly());
  window.action("Auto layout"); window.action("Layout selection");
  window.action("Run selected"); window.action("Disable selected"); window.action("Enable selected");
  window.addNode("fixture.Properties");
  QMimeData mime; mime.setData("application/x-nodetool-node-type", "fixture.Properties");
  QDragEnterEvent enter(QPointF(30,30), Qt::CopyAction, &mime, Qt::LeftButton, Qt::NoModifier);
  QApplication::sendEvent(view->viewport(), &enter); QVERIFY(!enter.isAccepted());
  QCOMPARE(window.document()->snapshot(), locked); QCOMPARE(window.document()->undoStack()->count(), 0);
 }
 void catalogDragGestureDoesNotClick() {
  EditorWindow window; window.setCatalog(property_fixture::catalog()); window.show(); window.action("Toggle nodes"); QTest::qWait(100);
  QQuickWidget *catalog = nullptr;
  for (auto panel : window.findChildren<QQuickWidget *>()) { if (panel->source().fileName() == "Catalog.qml") { catalog = panel; } }
  QVERIFY(catalog); auto row = find(catalog->rootObject(), "catalog-node-fixture.Properties"); QVERIFY(row);
  auto handler = row->findChild<QObject *>("catalog-drag-fixture.Properties"); QVERIFY(handler);
  QSignalSpy activation(handler, SIGNAL(activeChanged())); QVERIFY(activation.isValid());
  const auto point = row->mapToScene(QPointF(row->width()/2,row->height()/2)).toPoint();
  QTest::mousePress(catalog->quickWindow(), Qt::LeftButton, Qt::NoModifier, point);
  QTest::mouseMove(catalog->quickWindow(), point + QPoint(35, 0), 30);
  QTest::mouseMove(catalog->quickWindow(), point + QPoint(70, 0), 30);
  QTest::mouseRelease(catalog->quickWindow(), Qt::LeftButton, Qt::NoModifier, point + QPoint(70, 0));
  QVERIFY(activation.count() >= 1);
  QVERIFY(window.document()->nodes().isEmpty()); QCOMPARE(window.document()->undoStack()->count(), 0);
 }
 void catalogClickStillAdds() {
  EditorWindow window; window.setCatalog(property_fixture::catalog()); window.show(); window.action("Toggle nodes"); QTest::qWait(100);
  QQuickWidget *catalog = nullptr;
  for (auto panel : window.findChildren<QQuickWidget *>()) { if (panel->source().fileName() == "Catalog.qml") { catalog = panel; } }
  QVERIFY(catalog); auto row = find(catalog->rootObject(), "catalog-node-fixture.Properties"); QVERIFY(row);
  const auto point = row->mapToScene(QPointF(row->width()/2,row->height()/2)).toPoint();
  QTest::mouseClick(catalog->quickWindow(), Qt::LeftButton, Qt::NoModifier, point);
  QTRY_COMPARE(window.document()->nodes().size(), 1); QCOMPARE(window.document()->undoStack()->count(), 1);
 }
 // web/src/stores/NodeStore.ts autoLayout and core/graph.ts: the top left of the top-level nodes stays
 // where it was, a group is resized to fit its laid out children plus 50, and it is one undo step.
 void autoLayoutKeepsTheAnchorFitsGroupsAndUndoesOnce() {
  EditorWindow window; window.setCatalog(compactCatalog());
  QJsonObject group{{"id", "g"}, {"type", "nodetool.workflows.base_node.Group"},
      {"ui_properties", QJsonObject{{"position", QJsonObject{{"x", 320}, {"y", 240}}}, {"width", 1400}, {"height", 1200}, {"future", true}}}};
  auto first = node("c1"); first["parent_id"] = "g"; first["ui_properties"] = QJsonObject{{"position", QJsonObject{{"x", 700}, {"y", 700}}}};
  auto second = node("c2"); second["parent_id"] = "g"; second["ui_properties"] = QJsonObject{{"position", QJsonObject{{"x", 10}, {"y", 10}}}};
  auto outside = node("o"); outside["ui_properties"] = QJsonObject{{"position", QJsonObject{{"x", 900}, {"y", 1500}}}};
  const QJsonArray edges{QJsonObject{{"id", "inner"}, {"source", "c1"}, {"target", "c2"}, {"sourceHandle", "out"}, {"targetHandle", "Text"}}};
  QVERIFY(window.document()->load({{"graph", QJsonObject{{"nodes", QJsonArray{group, first, second, outside}}, {"edges", edges}}}}));
  window.resize(1500, 900); window.show(); window.fit(); QTest::qWait(80);
  const auto original = window.document()->snapshot();
  window.action("Auto layout"); QTest::qWait(80);
  QCOMPARE(window.document()->undoStack()->count(), 1);
  // The top left of the top-level nodes is where it was: the group at 320, 240 and the node at 900, 1500.
  const auto g = window.document()->node("g"), c1 = window.document()->node("c1"), c2 = window.document()->node("c2"), o = window.document()->node("o");
  QCOMPARE(std::min(position(g).x(), position(o).x()), 320.0);
  QCOMPARE(std::min(position(g).y(), position(o).y()), 240.0);
  // The padding of 50 leads the children and trails them inside the resized group.
  QCOMPARE(position(c1), QPointF(50, 50));
  const auto right = std::max(position(c1).x() + 280.0, position(c2).x() + 280.0);
  QVERIFY(position(c2).x() > position(c1).x());
  const auto ui = g["ui_properties"].toObject();
  QVERIFY2(ui["width"].toDouble() >= right + 50 && ui["width"].toDouble() < right + 50 + 400, qPrintable(QString::number(ui["width"].toDouble())));
  QVERIFY(ui["width"].toDouble() < 1400 && ui["height"].toDouble() < 1200);
  QCOMPARE(ui["future"].toBool(), true);
  const auto directory = qEnvironmentVariable("NODETOOL_CANVAS_CAPTURE_DIR");
  for (const bool dark : {true, false}) {
    window.setDarkTheme(dark); window.fit(); QTest::qWait(150);
    if (!directory.isEmpty()) { QVERIFY(QDir().mkpath(directory)); QVERIFY(window.grab().save(directory + (dark ? "/layout-group-dark.png" : "/layout-group-light.png"))); }
  }
  window.action("Undo"); QCOMPARE(window.document()->snapshot(), original);
  window.action("Redo"); QCOMPARE(window.document()->node("g")["ui_properties"].toObject()["width"].toDouble(), ui["width"].toDouble());
 }
};
QTEST_MAIN(CanvasAuthoringTest)
#include "CanvasAuthoringTest.moc"
