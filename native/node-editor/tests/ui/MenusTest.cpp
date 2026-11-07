#include "ui/EditorWindow.h"
#include <QGraphicsView>
#include <QMenu>
#include <QtTest>
#include <QContextMenuEvent>
#include <QDir>
#include <QLineEdit>
#include <QPainter>
#include <QDialog>
#include <QQuickWidget>
#include <QQuickItem>
#include <QFile>
#include <QRegularExpression>
#include "graph/EditorScene.h"
#include <QtNodes/internal/NodeGraphicsObject.hpp>
using namespace nodetool;
class MenusTest final : public QObject {
 Q_OBJECT
private slots:
 static QMenu *context(EditorWindow &window) {
  auto *view = window.findChild<QGraphicsView *>();
  const QPoint point(30, 100);
  QContextMenuEvent event(QContextMenuEvent::Mouse, point, view->viewport()->mapToGlobal(point));
  QApplication::sendEvent(view->viewport(), &event);
  return window.findChild<QMenu *>("pane-menu");
 }
 void inventoryBindings() {
  QFile file(NODE_EDITOR_PARITY_DOC);
  QVERIFY(file.open(QIODevice::ReadOnly));
  const auto contents = QString::fromUtf8(file.readAll());
  EditorWindow window;
  window.action("Keyboard shortcuts");
  auto *quick = window.findChild<QDialog *>("shortcuts-panel")->findChild<QQuickWidget *>();
  const auto rows = quick->rootObject()->property("rows").toList();
  QSet<QString> bound;
  for (const auto &value : rows) { bound.insert(value.toMap()["label"].toString()); }
  int inspected = 0;
  for (const auto &line : contents.split('\n')) {
   if (!line.startsWith("| shortcuts.ts") || !line.contains("Mapped through this work: ")) { continue; }
   ++inspected;
   const auto command = line.section("Mapped through this work: ", 1).section('.', 0, 0);
   QVERIFY2(bound.contains(command), qPrintable(command));
  }
  QVERIFY(inspected > 0);
 }
 void commandShortcut() {
  EditorWindow window; window.show(); QTest::qWait(50);
  auto *view = window.findChild<QGraphicsView *>(); QVERIFY(view);
  view->setFocus(); QTest::keyClick(view->viewport(), Qt::Key_K, Qt::ControlModifier);
  QTRY_VERIFY(window.findChild<QDialog *>("command-panel"));
  auto *panel = window.findChild<QDialog *>("command-panel");
  auto *quick = panel->findChild<QQuickWidget *>(); QVERIFY(quick);
  QCOMPARE(quick->status(), QQuickWidget::Ready);
  QTest::qWait(50);
  auto *search = quick->rootObject()->findChild<QQuickItem *>("action-search"); QVERIFY(search);
  const auto point = search->mapToScene(QPointF(search->width()/2, search->height()/2)).toPoint();
  QTest::mouseClick(quick, Qt::LeftButton, Qt::NoModifier, point);
  QTest::keyClicks(quick, "Delete");
  QTRY_COMPARE(quick->rootObject()->property("query").toString(), QString("Delete"));
  QTest::keyClick(quick, Qt::Key_Return);
  QVERIFY(panel->isVisible());
  QCOMPARE(window.document()->undoStack()->index(), 0);
  QTest::keyClick(quick, Qt::Key_Escape);
  QTRY_VERIFY(!panel->isVisible());
 }
 void contextClickAndStale() {
  EditorWindow window; window.show(); QTest::qWait(50);
  auto *menu = context(window); QVERIFY(menu);
  QAction *add = nullptr;
  for (auto *item : menu->actions()) { if (item->text() == "Add comment") { add = item; } }
  QVERIFY(add); QVERIFY(add->isEnabled());
  QTest::mouseClick(menu, Qt::LeftButton, Qt::NoModifier, menu->actionGeometry(add).center());
  QTRY_COMPARE(window.document()->graph()["nodes"].toArray().size(), 1);
  QCOMPARE(window.document()->undoStack()->index(), 1);
  menu = context(window); QVERIFY(menu);
  QPointer<QAction> stale;
  for (auto *item : menu->actions()) { if (item->text() == "Add comment") { stale = item; } }
  const QJsonObject replacement{{"id", "replacement"}, {"graph", QJsonObject{{"nodes", QJsonArray{}}, {"edges", QJsonArray{}}}}};
  QVERIFY(window.document()->load(replacement));
  if (stale) { stale->trigger(); }
  QCOMPARE(window.document()->graph()["nodes"].toArray().size(), 0);
 }
 void nodeAndGroupContexts() {
  EditorWindow window;
  window.setCatalog(QJsonArray{QJsonObject{{"node_type", "fixture.Text"}, {"title", "Text"}, {"properties", QJsonArray{}}, {"outputs", QJsonArray{}}}});
  QVERIFY(window.document()->load(QJsonObject{{"id", "menus"}, {"graph", QJsonObject{{"nodes", QJsonArray{
   QJsonObject{{"id", "node"}, {"type", "fixture.Text"}, {"ui_properties", QJsonObject{{"position", QJsonObject{{"x", 0}, {"y", 0}}}}}},
   QJsonObject{{"id", "group"}, {"type", "nodetool.workflows.base_node.Group"}, {"ui_properties", QJsonObject{{"position", QJsonObject{{"x", 500}, {"y", 0}}}, {"width", 300}, {"height", 200}}}}
  }}, {"edges", QJsonArray{}}}}}));
  window.resize(1400,1000); window.show(); QTest::qWait(60);
  auto *view = window.findChild<QGraphicsView *>(); QVERIFY(view);
  auto &model = static_cast<WorkflowGraphModel &>(window.scene()->graphModel());
  for (const auto &resource : {QString("node"), QString("group")}) {
   QVERIFY(window.selectNode(resource));
   QtNodes::NodeId nodeId = QtNodes::InvalidNodeId;
   for (auto id : model.allNodeIds()) { if (model.resourceId(id) == resource) { nodeId = id; } }
   auto *item = window.scene()->nodeGraphicsObject(nodeId); QVERIFY(item);
   view->centerOn(item); QTest::qWait(30);
   const auto pixel = view->mapFromScene(item->scenePos() + QPointF(20, 10));
   QContextMenuEvent event(QContextMenuEvent::Mouse, pixel, view->viewport()->mapToGlobal(pixel));
   QApplication::sendEvent(view->viewport(), &event);
   auto *menu = window.findChild<QMenu *>(resource + "-menu"); QVERIFY(menu);
   menu->close(); QCoreApplication::sendPostedEvents(nullptr, QEvent::DeferredDelete);
  }
  view->setFocus(); QTest::keyClick(view->viewport(), Qt::Key_A, Qt::ControlModifier);
  QCOMPARE(window.selectedCount(), 2);
  QtNodes::NodeId selected = QtNodes::InvalidNodeId;
  for (auto id : model.allNodeIds()) { if (model.resourceId(id) == "node") { selected = id; } }
  auto *card = window.scene()->nodeGraphicsObject(selected); QVERIFY(card);
  view->centerOn(card); QTest::qWait(30);
  const auto pixel = view->mapFromScene(card->scenePos() + QPointF(20,10));
  QContextMenuEvent event(QContextMenuEvent::Mouse, pixel, view->viewport()->mapToGlobal(pixel));
  QApplication::sendEvent(view->viewport(), &event);
  auto *multi = window.findChild<QMenu *>("selection-menu"); QVERIFY(multi);
  QAction *copy = nullptr;
  for (auto *item : multi->actions()) { if (item->text() == "Copy") { copy = item; } }
  QVERIFY(copy); QVERIFY(copy->isEnabled());
  QTest::mouseClick(multi, Qt::LeftButton, Qt::NoModifier, multi->actionGeometry(copy).center());
  QCoreApplication::sendPostedEvents(nullptr, QEvent::DeferredDelete);
  view->setFocus();
  const auto before = window.document()->undoStack()->index();
  QTest::keyClick(view->viewport(), Qt::Key_D, Qt::ControlModifier | Qt::ShiftModifier);
  QCOMPARE(window.document()->nodes().size(), 4);
  QCOMPARE(window.document()->undoStack()->index(), before + 1);
  QTest::keyClick(view->viewport(), Qt::Key_Z, Qt::ControlModifier);
  QCOMPARE(window.document()->nodes().size(), 2);
  view->setFocus(); QTest::keyClick(view->viewport(), Qt::Key_A, Qt::ControlModifier);
  for (const auto modifiers : {Qt::NoModifier, Qt::ShiftModifier}) {
   const auto index = window.document()->undoStack()->index();
   QTest::keyClick(view->viewport(), Qt::Key_A, modifiers);
   QVERIFY(window.document()->undoStack()->index() <= index + 1);
  }
 }
 void accountAndReadOnly() {
  EditorWindow window; window.show(); QTest::qWait(50);
  auto *menu = context(window); QVERIFY(menu);
  QPointer<QAction> stale;
  for (auto *item : menu->actions()) { if (item->text() == "Add comment") { stale = item; } }
  window.session()->connectToServer(QUrl("http://127.0.0.1:1"), "fixture", "replacement-account");
  QVERIFY(!menu->isVisible());
  if (stale) { stale->trigger(); }
  QCOMPARE(window.document()->nodes().size(), 0);
  window.session()->disconnectFromServer();
  QCoreApplication::sendPostedEvents(nullptr, QEvent::DeferredDelete);
  QVERIFY(window.document()->load(QJsonObject{{"graph", QJsonObject{{"nodes", QJsonArray{QJsonObject{{"id", "broken"}}}}, {"edges", QJsonArray{}}}}}));
  QVERIFY(window.readOnly());
  menu = context(window); QVERIFY(menu);
  QAction *add = nullptr;
  for (auto *item : menu->actions()) { if (item->text() == "Add comment") { add = item; } }
  QVERIFY(add); QVERIFY(!add->isEnabled());
  const auto before = window.document()->snapshot();
  QTest::mouseClick(menu, Qt::LeftButton, Qt::NoModifier, menu->actionGeometry(add).center());
  QCOMPARE(window.document()->snapshot(), before);
  QCOMPARE(window.document()->undoStack()->index(), 0);
 }
 void moreOpensDropdownWithDocumentedActions() {
  EditorWindow window; window.show(); QTest::qWait(50);
  window.action("More");
  QTRY_VERIFY(window.findChild<QMenu *>("more-menu"));
  QVERIFY(!window.findChild<QDialog *>("command-panel"));
  QStringList labels;
  for (auto *item : window.findChild<QMenu *>("more-menu")->actions()) { labels << item->text(); }
  for (const auto *expected : {"Auto layout", "Arrange selection", "Link selected", "Find node", "Group selection", "Ungroup", "Remove from group", "Run selected", "Disable selected", "Rename node", "Add comment", "Edit comment", "Server sync", "Canvas uploads"}) {
   QVERIFY2(labels.contains(expected), expected);
  }
  window.findChild<QMenu *>("more-menu")->close();
 }
 void capturesAndHelp() {
  const QString directory = qEnvironmentVariable("NODETOOL_MENUS_CAPTURE_DIR");
  if (!directory.isEmpty()) { QVERIFY(QDir().mkpath(directory)); }
  EditorWindow window; window.resize(1400, 1000); window.show(); QTest::qWait(80);
  for (const auto &theme : {QString("dark"), QString("light")}) {
   window.setDarkTheme(theme == "dark");
   for (const auto &surface : {QString("pane"), QString("command"), QString("shortcuts")}) {
    if (surface == "pane") { QVERIFY(context(window)); }
    else { window.action(surface == "command" ? "Command menu" : "Keyboard shortcuts"); }
    QWidget *menu = surface == "pane" ? static_cast<QWidget *>(window.findChild<QMenu *>(surface + "-menu")) : static_cast<QWidget *>(window.findChild<QDialog *>(surface + "-panel"));
    QVERIFY(menu); QTest::qWait(100);
    if (surface != "pane") {
     auto *quick = menu->findChild<QQuickWidget *>(); QVERIFY(quick);
     QCOMPARE(quick->status(), QQuickWidget::Ready);
     const auto rows = quick->rootObject()->property("rows").toList();
     QSet<QString> seen;
     for (const auto &value : rows) {
      const auto row = value.toMap(); const auto label = row["label"].toString();
      QVERIFY(!seen.contains(label)); seen.insert(label);
      if (surface == "shortcuts") {
       QVERIFY(!row["keys"].toString().isEmpty());
       for (const auto &keys : row["keys"].toString().split(" / ")) {
        const QKeySequence seq(keys, QKeySequence::NativeText);
        QCOMPARE(window.shortcutCommand(int(seq[0].key()), seq[0].keyboardModifiers()), label);
       }
      }
     }
    }
    if (!directory.isEmpty()) {
     QPixmap capture = window.grab();
     QPainter painter(&capture); painter.drawPixmap(window.mapFromGlobal(menu->pos()), menu->grab()); painter.end();
     QVERIFY(capture.save(directory + "/" + surface + "-" + theme + ".png"));
    }
    menu->close(); QCoreApplication::sendPostedEvents(nullptr, QEvent::DeferredDelete);
   }
  }
 }
};
QTEST_MAIN(MenusTest)
#include "MenusTest.moc"
