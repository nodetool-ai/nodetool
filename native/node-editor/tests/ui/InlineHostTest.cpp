#include "ui/EditorWindow.h"
#include "graph/EditorScene.h"
#include "graph/InlinePropertyPresenter.h"
#include "PropertyFixture.h"
#include <QGraphicsView>
#include <QQuickWidget>
#include <QQuickItem>
#include <QtNodes/internal/NodeGraphicsObject.hpp>
#include <QtTest>
using namespace nodetool;
class InlineHostTest final : public QObject {
  Q_OBJECT
private slots:
  void canvasClickCommitUndoAndAccountCancellation() {
    EditorWindow window;
    window.setCatalog(property_fixture::catalog());
    auto workflow = property_fixture::workflow();
    auto graph = workflow["graph"].toObject();
    auto nodes = graph["nodes"].toArray();
    for (qsizetype i = 0; i < nodes.size(); ++i) {
      auto node = nodes[i].toObject();
      auto ui = node["ui_properties"].toObject();
      ui["position"] = QJsonObject{{"x", double(i) * 600}, {"y", 0}};
      node["ui_properties"] = ui; nodes[i] = node;
    }
    graph["nodes"] = nodes; workflow["graph"] = graph;
    QVERIFY(window.document()->load(workflow));
    window.show();
    QVERIFY(window.selectNode("a"));
    window.action("Reset zoom");
    QTest::qWait(80);
    auto view = window.findChild<QGraphicsView *>();
    auto presenter = window.findChild<InlinePropertyPresenter *>();
    QVERIFY(view); QVERIFY(presenter);
    auto &model = static_cast<WorkflowGraphModel &>(window.scene()->graphModel());
    QtNodes::NodeId id = QtNodes::InvalidNodeId;
    for (const auto candidate : model.allNodeIds()) { if (model.resourceId(candidate) == "a") { id = candidate; } }
    QVERIFY(id != QtNodes::InvalidNodeId);
    const auto baseline = window.document()->snapshot();
    const auto open = [&] {
      const auto node = window.scene()->nodeGraphicsObject(id);
      const auto point = node->scenePos() + model.inlineFieldRect(id, "Text").center();
      QTest::mouseClick(view->viewport(), Qt::LeftButton, Qt::NoModifier, view->mapFromScene(point));
    };
    open();
    QTRY_VERIFY(presenter->active());
    auto widget = presenter->editorWidget(); QVERIFY(widget);
    auto field = widget->rootObject()->findChild<QQuickItem *>("inline-text");
    QVERIFY(field); field->forceActiveFocus();
    QTRY_VERIFY(field->hasActiveFocus());
    QTest::keyClick(widget, Qt::Key_A, Qt::ControlModifier);
    QTest::keyClicks(widget, "Inline host edit");
    QCOMPARE(field->property("text").toString(), QString("Inline host edit"));
    QTest::keyClick(widget, Qt::Key_Return);
    QTRY_COMPARE(window.document()->node("a")["data"].toObject()["Text"].toString(), QString("Inline host edit"));
    QCOMPARE(window.document()->undoStack()->count(), 1);
    window.action("Undo");
    QCOMPARE(window.document()->snapshot(), baseline);
    QVERIFY(window.selectNode("a"));
    QTest::qWait(60);
    open();
    QTRY_VERIFY(presenter->active());
    const auto token = presenter->generation();
    window.session()->credentialsChanged(QUrl{}, {}, "different-user");
    QVERIFY(!presenter->active());
    presenter->commit("stale edit", token);
    QCoreApplication::processEvents();
    QCOMPARE(window.document()->snapshot(), baseline);
  }
};
QTEST_MAIN(InlineHostTest)
#include "InlineHostTest.moc"
