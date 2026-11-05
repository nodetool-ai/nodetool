#include "ui/EditorWindow.h"
#include "PropertyFixture.h"
#include <QGraphicsView>
#include <QDir>
#include <QtTest>
using namespace nodetool;
class ViewportNavigatorTest final : public QObject {
 Q_OBJECT
private slots:
 void navigation() {
  EditorWindow window;
  window.setCatalog(property_fixture::catalog());
  QVERIFY(window.document()->load(property_fixture::workflow()));
  window.resize(1400, 900); window.show();
  QTest::qWait(100);
  auto map = window.findChild<QWidget *>("mini-map");
  QVERIFY(map);
  auto view = window.findChild<QGraphicsView *>(); QVERIFY(view);
  const auto snapshot = window.document()->snapshot();
  const auto count = window.document()->undoStack()->count();
  const auto before = view->mapToScene(view->viewport()->rect().center());
  QTest::mouseClick(map, Qt::LeftButton, Qt::NoModifier, QPoint(20,20));
  QVERIFY(view->mapToScene(view->viewport()->rect().center()) != before);
  QTest::mousePress(map, Qt::LeftButton, Qt::NoModifier, QPoint(30,30));
  QTest::mouseMove(map, QPoint(170,100));
  QTest::mouseRelease(map, Qt::LeftButton, Qt::NoModifier, QPoint(170,100));
  QCOMPARE(window.document()->snapshot(), snapshot);
  QCOMPARE(window.document()->undoStack()->count(), count);
  QVERIFY(window.document()->undoStack()->isClean());
  auto workflow = property_fixture::workflow();
  auto graph = workflow["graph"].toObject();
  QJsonArray nodes;
  for (int i=0; i<1200; ++i) {
    auto node = property_fixture::node(QString::number(i));
    node["ui_properties"] = QJsonObject{{"position", QJsonObject{{"x", (i%40)*400}, {"y", (i/40)*300}}}};
    nodes.append(node);
  }
  graph["nodes"] = nodes; graph["edges"] = QJsonArray{}; workflow["graph"] = graph;
  QVERIFY(window.document()->load(workflow));
  QTRY_COMPARE(map->property("nodeCount").toInt(), 1200);
  const auto largeSnapshot = window.document()->snapshot();
  QTest::mouseClick(map, Qt::LeftButton, Qt::NoModifier, QPoint(150,80));
  QCOMPARE(window.document()->snapshot(), largeSnapshot);
  QVERIFY(window.document()->undoStack()->isClean());
  QVERIFY(window.document()->load(property_fixture::workflow()));
  QTRY_VERIFY(map->property("nodeCount").toInt() < 1200);
  const int smallCount = map->property("nodeCount").toInt();
  QVERIFY(window.document()->applyCommand({{"op", "addNode"}, {"node", property_fixture::node("extra")}}));
  QTRY_COMPARE(map->property("nodeCount").toInt(), smallCount+1);
  QVERIFY(window.document()->applyCommand({{"op", "removeNodes"}, {"ids", QJsonArray{"extra"}}}));
  QTRY_COMPARE(map->property("nodeCount").toInt(), smallCount);
  QVERIFY(window.selectNode("a"));
  window.fit();
  const QString dir = qEnvironmentVariable("NODETOOL_MINIMAP_CAPTURE");
  if (!dir.isEmpty()) {
   QDir().mkpath(dir);
   for (bool dark : {true, false}) {
    window.setDarkTheme(dark);
    for (int width : {1400, 900}) {
     window.resize(width,900); QTest::qWait(150);
     QVERIFY(map->isVisible());
     QVERIFY(window.grab().save(dir + QString("/%1-%2.png").arg(dark ? "dark" : "light").arg(width)));
    }
   }
  }
 }
};
QTEST_MAIN(ViewportNavigatorTest)
#include "ViewportNavigatorTest.moc"
