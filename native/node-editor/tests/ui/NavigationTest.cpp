#include "ui/EditorWindow.h"
#include "graph/EditorScene.h"
#include <QtNodes/internal/NodeGraphicsObject.hpp>
#include <QApplication>
#include <QGraphicsView>
#include <QInputDialog>
#include <QTimer>
#include <QMenu>
#include <QQuickWidget>
#include <QQuickItem>
#include <QtTest>
using namespace nodetool;
class NavigationTest final : public QObject {
  Q_OBJECT
private slots:
  void arrangeSelectionMenuPreservesUndo() {
    EditorWindow window;
    window.show();
    for (int i = 0; i < 3; ++i) {
      QVERIFY(window.document()->applyCommand({{"op", "addNode"}, {"node", QJsonObject{{"id", QString::number(i)}, {"type", "nodetool.workflows.base_node.Comment"}, {"data", QJsonObject{{"comment", "Text"}}}, {"ui_properties", QJsonObject{{"width", 200 + i * 20}, {"height", 100}, {"position", QJsonObject{{"x", 100 + i * 300}, {"y", i * 40}}}}}}}}));
    }
    auto &model = window.scene()->graphModel();
    for (const auto id : model.allNodeIds()) { window.scene()->nodeGraphicsObject(id)->setSelected(true); }
    const auto initial = window.document()->snapshot();
    const auto undoIndex = window.document()->undoStack()->index();
    QQuickWidget *toolbar = nullptr;
    for (auto panel : window.findChildren<QQuickWidget *>()) {
      if (panel->source().fileName() == "SelectionToolbar.qml") { toolbar = panel; }
    }
    QVERIFY(toolbar);
    QTRY_VERIFY(toolbar->isVisible());
    auto arrangeButton = toolbar->rootObject()->findChild<QQuickItem *>("selection-arrange-selection");
    QVERIFY(arrangeButton);
    QVERIFY(arrangeButton->isEnabled());
    QTest::mouseClick(toolbar->quickWindow(), Qt::LeftButton, Qt::NoModifier,
                     arrangeButton->mapToScene(QPointF(arrangeButton->width() / 2, arrangeButton->height() / 2)).toPoint());
    QAction *align = nullptr;
    for (auto menu : window.findChildren<QMenu *>()) {
      for (auto action : menu->actions()) { if (action->text() == "Align left") { align = action; } }
    }
    QVERIFY(align);
    QVERIFY(align->isEnabled());
    align->trigger();
    for (auto menu : window.findChildren<QMenu *>()) { menu->close(); }
    for (const auto &value : window.document()->nodes()) {
      QCOMPARE(value.toObject()["ui_properties"].toObject()["position"].toObject()["x"].toDouble(), 100.0);
    }
    QCOMPARE(window.document()->undoStack()->index(), undoIndex + 1);
    window.action("Undo");
    QCOMPARE(window.document()->snapshot(), initial);
    window.action("Clear selection");
    QTRY_VERIFY(!toolbar->isVisible());
  }
  void findByIdWithoutDocumentEdits() {
    EditorWindow window;
    window.show();
    for (const auto &id : {QString("first"), QString("second")}) {
      QVERIFY(window.document()->applyCommand({{"op", "addNode"}, {"node", QJsonObject{{"id", id}, {"type", "fixture.Text"}, {"ui_properties", QJsonObject{{"title", "Same title"}, {"position", QJsonObject{{"x", id == "first" ? 0 : 5000}, {"y", 0}}}}}}}}));
    }
    QVERIFY(window.selectNode("first"));
    const auto snapshot = window.document()->snapshot();
    const auto undo = window.document()->undoStack()->index();
    QTimer::singleShot(0, &window, [] {
      auto dialog = qobject_cast<QInputDialog *>(QApplication::activeModalWidget());
      QVERIFY(dialog);
      dialog->setTextValue("SECOND");
      dialog->accept();
    });
    auto view = window.findChild<QGraphicsView *>();
    QVERIFY(view);
    QTest::keyClick(view, Qt::Key_F, Qt::ControlModifier);
    QCOMPARE(window.selection(), QString("second"));
    auto &model = static_cast<WorkflowGraphModel &>(window.scene()->graphModel());
    QtNodes::NodeGraphicsObject *found = nullptr;
    for (const auto id : model.allNodeIds()) {
      if (model.resourceId(id) == "second") { found = window.scene()->nodeGraphicsObject(id); }
    }
    QVERIFY(found);
    QTRY_VERIFY(window.unobstructedViewport().contains(view->mapFromScene(found->scenePos() + QPointF(140, 30))));
    QCOMPARE(window.document()->snapshot(), snapshot);
    QCOMPARE(window.document()->undoStack()->index(), undo);
    QTimer::singleShot(0, &window, [] {
      auto dialog = qobject_cast<QInputDialog *>(QApplication::activeModalWidget());
      QVERIFY(dialog);
      dialog->setTextValue("first");
      dialog->reject();
    });
    window.action("Find node");
    QCOMPARE(window.selection(), QString("second"));
    QCOMPARE(window.document()->snapshot(), snapshot);
  }
  void emptyGraphDoesNotOpenDialog() {
    EditorWindow window;
    window.action("Find node");
    QCOMPARE(window.message(), QString("No nodes to find."));
    QVERIFY(!QApplication::activeModalWidget());
  }
};
QTEST_MAIN(NavigationTest)
#include "NavigationTest.moc"
