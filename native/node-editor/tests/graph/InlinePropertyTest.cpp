#include "graph/InlinePropertyPresenter.h"
#include "graph/EditorScene.h"
#include "graph/WorkflowGraphModel.h"
#include "document/WorkflowDocument.h"
#include <QApplication>
#include <QGraphicsView>
#include <QQuickWidget>
#include <QQuickItem>
#include <QQmlEngine>
#include <QShortcut>
#include <QScrollBar>
#include <QSignalSpy>
#include <QtNodes/internal/NodeGraphicsObject.hpp>
#include <QtTest>
using namespace nodetool;
using namespace QtNodes;
namespace {
QJsonArray catalog() {
  return QJsonArray{QJsonObject{{"node_type","Scalar"},{"title","Scalar controls"},
    {"input_fields",QJsonArray{"hidden"}},
    {"properties",QJsonArray{
      QJsonObject{{"name","text"},{"type",QJsonObject{{"type","str"}}},{"json_schema_extra",QJsonObject{{"multiline",false}}}},
      QJsonObject{{"name","prompt"},{"type",QJsonObject{{"type","str"}}}},
      QJsonObject{{"name","number"},{"type",QJsonObject{{"type","float"}}},{"min",0},{"max",10}},
      QJsonObject{{"name","flag"},{"type",QJsonObject{{"type","bool"}}}},
      QJsonObject{{"name","mode"},{"type",QJsonObject{{"type","enum"},{"values",QJsonArray{"First","Second"}}}}},
      QJsonObject{{"name","hidden"},{"type",QJsonObject{{"type","str"}}}}
    }}}};
}
QJsonObject snapshot() {
  const QJsonObject node{{"id","node"},{"type","Scalar"},
    {"data",QJsonObject{{"text","original"},{"prompt","Original prompt"},{"number",2.5},{"flag",false},{"mode","First"},{"hidden","secret"},{"future",42}}},
    {"ui_properties",QJsonObject{{"position",QJsonObject{{"x",100},{"y",100}}}}}};
  return QJsonObject{{"graph",QJsonObject{{"nodes",QJsonArray{node}},{"edges",QJsonArray{}}}}};
}

struct Fixture {
  node_editor::WorkflowDocument document;
  WorkflowGraphModel model;
  EditorScene scene{model};
  QGraphicsView view{&scene};
  QQmlEngine engine;
  InlinePropertyPresenter presenter{model,scene,view,&engine};
  NodeId id = InvalidNodeId;
  Fixture() {
    document.setNodeMetadata(catalog());
    const auto loaded = document.load(snapshot());
    Q_ASSERT(loaded.ok);
    model.project(document.snapshot(),catalog());
    id = *model.allNodeIds().begin();
    view.resize(900,700);
    view.setSceneRect(0,0,1000,900);
    view.show();
    view.centerOn(300,300);
    scene.nodeGraphicsObject(id)->setSelected(true);
    presenter.commitProperty = [this](const QString &node,const QString &name,const QVariant &value) {
      const auto result = document.applyCommand({{"op","setProperty"},{"id",node},{"name",name},{"value",QJsonValue::fromVariant(value)}});
      if (result) { model.project(document.snapshot(),catalog()); }
      return bool(result);
    };
  }
  void open(const QString &name) {
    scene.nodeGraphicsObject(id)->setSelected(true);
    presenter.activate(id,name);
    QApplication::processEvents();
  }
  QJsonValue value(const QString &name) const { return document.node("node")["data"].toObject()[name]; }
};
}
class InlinePropertyTest final : public QObject {
  Q_OBJECT
private slots:
  void canvasBlurCommitsBeforeSelection() {
    Fixture f;
    const QJsonObject other{{"id","other"},{"type","Scalar"},{"data",QJsonObject{}},
      {"ui_properties",QJsonObject{{"position",QJsonObject{{"x",600},{"y",100}}}}}};
    QVERIFY(f.document.applyCommand({{"op","addNode"},{"node",other}}));
    f.document.undoStack()->clear();
    f.model.project(f.document.snapshot(),catalog());
    NodeId otherId=InvalidNodeId;
    for (const auto id:f.model.allNodeIds()) { if (f.model.resourceId(id)=="other") { otherId=id; } }
    QVERIFY(otherId!=InvalidNodeId);
    f.open("text"); auto widget=f.presenter.editorWidget(); QVERIFY(widget);
    QTRY_VERIFY(widget->rootObject()->findChild<QQuickItem *>("inline-text")->hasActiveFocus());
    QTest::keyClick(widget,Qt::Key_A,Qt::ControlModifier);
    QTest::keyClicks(widget,"saved before switch");
    const auto otherPoint=f.view.mapFromScene(f.scene.nodeGraphicsObject(otherId)->sceneBoundingRect().center());
    QVERIFY(f.view.viewport()->rect().contains(otherPoint));
    QTest::mouseClick(f.view.viewport(),Qt::LeftButton,Qt::NoModifier,otherPoint);
    QTRY_COMPARE(f.value("text").toString(),QString("saved before switch"));
    QVERIFY(!f.document.node("other")["data"].toObject().contains("text"));
    QCOMPARE(f.document.undoStack()->count(),1);
    QCOMPARE(f.document.undoStack()->index(),1);
    f.document.undo(); f.model.project(f.document.snapshot(),catalog());
    QCOMPARE(f.value("text").toString(),QString("original"));
    f.open("text"); widget=f.presenter.editorWidget(); QVERIFY(widget);
    QTRY_VERIFY(widget->rootObject()->findChild<QQuickItem *>("inline-text")->hasActiveFocus());
    QTest::keyClick(widget,Qt::Key_A,Qt::ControlModifier); QTest::keyClicks(widget,"saved on canvas blur");
    QTest::mouseClick(f.view.viewport(),Qt::LeftButton,Qt::NoModifier,QPoint(800,600));
    QTRY_COMPARE(f.value("text").toString(),QString("saved on canvas blur"));
    QCOMPARE(f.document.undoStack()->count(),1);
    QApplication::processEvents();
    QCOMPARE(f.document.undoStack()->count(),1);
  }
  void nativeFieldClickAndIdle() {
    Fixture f;
    QTest::qWait(20);
    const auto field=f.model.inlineFieldRect(f.id,"text").translated(f.scene.nodeGraphicsObject(f.id)->scenePos());
    const auto point=f.view.mapFromScene(field.center());
    QVERIFY(f.view.viewport()->rect().contains(point));
    QTest::mouseClick(f.view.viewport(),Qt::LeftButton,Qt::NoModifier,point);
    QTRY_VERIFY(f.presenter.active());
    auto widget=f.presenter.editorWidget(); QVERIFY(widget);
    QTRY_VERIFY(widget->rootObject()->findChild<QQuickItem *>("inline-text")->hasActiveFocus());
    QSignalSpy idleGeometry(&f.presenter,&InlinePropertyPresenter::geometryChanged);
    QTest::qWait(40);
    QCOMPARE(idleGeometry.count(),0);
    QTest::keyClick(widget,Qt::Key_A,Qt::ControlModifier);
    QTest::keyClicks(widget,"clicked field");
    QTest::keyClick(widget,Qt::Key_Return);
    QTRY_COMPARE(f.value("text").toString(),QString("clicked field"));
    f.document.undo(); QCOMPARE(f.value("text").toString(),QString("original"));
  }
  void textCommitEscapeAndShortcuts() {
    Fixture f;
    f.open("text");
    QVERIFY(f.presenter.active());
    auto widget = f.presenter.editorWidget(); QVERIFY(widget);
    QTRY_VERIFY(widget->rootObject()->findChild<QQuickItem *>("inline-text"));
    auto input = widget->rootObject()->findChild<QQuickItem *>("inline-text");
    QTRY_VERIFY(input->hasActiveFocus());
    QShortcut graphShortcut(QKeySequence("Ctrl+G"),&f.view);
    QSignalSpy triggered(&graphShortcut,&QShortcut::activated);
    QTest::keyClick(widget,Qt::Key_G,Qt::ControlModifier);
    QCOMPARE(triggered.count(),0);
    QWidget unrelated(&f.view);
    unrelated.show();
    QShortcut unrelatedShortcut(QKeySequence("Ctrl+J"),&unrelated);
    QSignalSpy unrelatedTriggered(&unrelatedShortcut,&QShortcut::activated);
    QTest::keyClick(&unrelated,Qt::Key_J,Qt::ControlModifier);
    QCOMPARE(unrelatedTriggered.count(),1);
    QVERIFY(f.presenter.active());
    QTest::keyClick(widget,Qt::Key_A,Qt::ControlModifier);
    QTest::keyClicks(widget,"changed");
    QCOMPARE(f.value("text").toString(),QString("original"));
    QTest::keyClick(widget,Qt::Key_Return);
    QTRY_COMPARE(f.value("text").toString(),QString("changed"));
    QCOMPARE(f.document.undoStack()->count(),1);
    QCOMPARE(f.document.node("node")["data"].toObject()["future"].toInt(),42);
    f.document.undo(); f.model.project(f.document.snapshot(),catalog());
    QCOMPARE(f.value("text").toString(),QString("original"));
    f.open("text"); widget = f.presenter.editorWidget(); QVERIFY(widget);
    QTRY_VERIFY(widget->rootObject()->findChild<QQuickItem *>("inline-text")->hasActiveFocus());
    QTest::keyClicks(widget,"discarded");
    QTest::keyClick(widget,Qt::Key_Escape);
    QTRY_VERIFY(!f.presenter.active());
    QCOMPARE(f.value("text").toString(),QString("original"));
  }
  void numericBooleanAndEnum() {
    Fixture f;
    f.open("number"); auto widget=f.presenter.editorWidget(); QVERIFY(widget);
    QTRY_VERIFY(widget->rootObject()->findChild<QQuickItem *>("inline-number")->hasActiveFocus());
    QTest::keyClick(widget,Qt::Key_A,Qt::ControlModifier);
    QTest::keyClicks(widget,"-1"); QTest::keyClick(widget,Qt::Key_Return);
    QApplication::processEvents();
    QCOMPARE(f.value("number").toDouble(),2.5);
    QVERIFY(f.presenter.active());
    QTest::keyClick(widget,Qt::Key_A,Qt::ControlModifier);
    QTest::keyClicks(widget,"3.5"); QTest::keyClick(widget,Qt::Key_Return);
    QTRY_COMPARE(f.value("number").toDouble(),3.5);
    f.open("flag"); QTRY_VERIFY(f.value("flag").toBool());
    f.open("mode"); widget=f.presenter.editorWidget(); QVERIFY(widget);
    QTRY_VERIFY(widget->rootObject()->findChild<QQuickItem *>("inline-choice"));
    const auto capture=qEnvironmentVariable("NODETOOL_INLINE_CAPTURE");
    if (!capture.isEmpty()) { QTest::qWait(40); QVERIFY(f.view.grab().save(capture+"-enum.png")); }
    // The real Select popup handles navigation and Return itself.
    QTest::keyClick(widget,Qt::Key_Down);
    QTest::keyClick(widget,Qt::Key_Return);
    QTRY_COMPARE(f.value("mode").toString(),QString("Second"));
    QCOMPARE(f.document.undoStack()->count(),3);
  }
  void scopeAndGeometry() {
    Fixture f;
    QVERIFY(f.model.inlineDescriptor(f.id,"hidden").isEmpty());
    f.open("text");
    const auto before=f.presenter.editorRect();
    f.view.scale(1.5,1.5); f.presenter.reposition();
    QCOMPARE(f.presenter.editorRect().width(),before.width()*1.5);
    const auto zoomed=f.presenter.editorRect();
    f.view.horizontalScrollBar()->setValue(f.view.horizontalScrollBar()->value()+20);
    QVERIFY(f.presenter.editorRect().left()!=zoomed.left());
    f.presenter.commit("stale",f.presenter.generation());
    f.scene.clearSelection();
    QApplication::processEvents();
    QCOMPARE(f.value("text").toString(),QString("original"));
    f.open("text"); const auto old=f.presenter.generation();
    f.model.project(f.document.snapshot(),catalog());
    f.presenter.commit("wrong source",old);
    QApplication::processEvents();
    QCOMPARE(f.value("text").toString(),QString("original"));
    auto graph=f.document.snapshot()["graph"].toObject();
    graph["edges"]=QJsonArray{QJsonObject{{"id","edge"},{"source","node"},{"target","node"},{"sourceHandle","out"},{"targetHandle","text"}}};
    f.model.project(QJsonObject{{"graph",graph}},catalog());
    QVERIFY(f.model.inlineDescriptor(f.id,"text").isEmpty());
  }
  void multilineExpansionAndCapture() {
    Fixture f;
    f.open("prompt"); auto widget=f.presenter.editorWidget(); QVERIFY(widget);
    QTRY_VERIFY(widget->rootObject()->findChild<QQuickItem *>("inline-multiline")->hasActiveFocus());
    QTest::keyClick(widget,Qt::Key_A,Qt::ControlModifier);
    QTest::keyClicks(widget,"Line one"); QTest::keyClick(widget,Qt::Key_Return); QTest::keyClicks(widget,"Line two");
    const auto compact=f.presenter.editorRect().height();
    auto expand=widget->rootObject()->findChild<QQuickItem *>("inline-expand");
    QVERIFY(expand);
    const auto expandPoint=expand->mapToScene(QPointF(expand->width()/2,expand->height()/2)).toPoint();
    QTest::mouseClick(widget,Qt::LeftButton,Qt::NoModifier,expandPoint);
    QVERIFY(f.presenter.editorRect().height()>compact);
    QCOMPARE(widget->rootObject()->findChild<QQuickItem *>("inline-multiline")->property("text").toString(),QString("Line one\nLine two"));
    const auto path=qEnvironmentVariable("NODETOOL_INLINE_CAPTURE");
    if (!path.isEmpty()) {
      QTest::qWait(80);
      QVERIFY(f.view.grab().save(path+"-dark.png"));
      auto theme=f.engine.singletonInstance<QObject *>("NodeTool.UiPrimitives","Theme");
      QVERIFY(theme); theme->setProperty("preference",3);
      auto light=f.scene.theme(); light.canvas=QColor("#f5f5f6"); light.node=QColor("#ffffff"); light.textPrimary=QColor("#18181b"); light.textSecondary=QColor("#5b5b66"); light.grid=QColor("#dcdce1"); light.field=QColor("#f9f9f9"); light.divider=QColor("#e4e4e7");
      f.scene.setTheme(light);
      QTest::qWait(80);
      QVERIFY(f.view.grab().save(path+"-light.png"));
    }
    QTest::keyClick(widget,Qt::Key_Return,Qt::ControlModifier);
    QTRY_COMPARE(f.value("prompt").toString(),QString("Line one\nLine two"));
    QCOMPARE(f.document.undoStack()->count(),1);
  }
};
QTEST_MAIN(InlinePropertyTest)
#include "InlinePropertyTest.moc"
