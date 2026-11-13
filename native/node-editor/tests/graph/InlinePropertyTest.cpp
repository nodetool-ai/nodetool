#include "graph/InlinePropertyPresenter.h"
#include "graph/EditorScene.h"
#include "graph/WorkflowGraphModel.h"
#include "document/WorkflowDocument.h"
#include "properties/ResourcePickerController.h"
#include "interfaces/PropertyHost.h"
#include <QJsonDocument>
#include <QTcpServer>
#include <QTcpSocket>
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
    {"inline_fields",QJsonArray{"text","prompt","number","flag","mode"}},
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
  QJsonArray cat;
  node_editor::WorkflowDocument document;
  WorkflowGraphModel model;
  EditorScene scene{model};
  QGraphicsView view{&scene};
  QQmlEngine engine;
  node_editor::PropertyHost host;
  InlinePropertyPresenter presenter{model,scene,view,&engine,host};
  NodeId id = InvalidNodeId;
  explicit Fixture(const QJsonArray &metadata = catalog(), const QJsonObject &workflow = snapshot()) : cat(metadata) {
    document.setNodeMetadata(cat);
    const auto loaded = document.load(workflow);
    Q_ASSERT(loaded.ok);
    model.project(document.snapshot(),cat);
    id = node("node");
    view.resize(900,700);
    view.setSceneRect(0,0,1000,900);
    view.show();
    view.centerOn(300,300);
    scene.nodeGraphicsObject(id)->setSelected(true);
    presenter.commitProperty = [this](const QString &node,const QString &name,const QVariant &value) {
      const auto result = document.applyCommand({{"op","setProperty"},{"id",node},{"name",name},{"value",QJsonValue::fromVariant(value)}});
      if (result) { model.project(document.snapshot(),cat); }
      return bool(result);
    };
  }
  NodeId node(const QString &resource) const {
    for (const auto key : model.allNodeIds()) { if (model.resourceId(key) == resource) { return key; } }
    return InvalidNodeId;
  }
  void open(const QString &name, const QString &resource = "node") {
    // A click on the field selects only its node.
    id = node(resource);
    scene.clearSelection();
    scene.nodeGraphicsObject(id)->setSelected(true);
    presenter.activate(id,name);
    QApplication::processEvents();
  }
  QJsonValue value(const QString &name, const QString &resource = "node") const { return document.node(resource)["data"].toObject()[name]; }
  // Searches visual children, which include Repeater delegates.
  static QQuickItem *find(QQuickItem *root, const QString &name) {
    if (!root) { return nullptr; }
    if (root->objectName() == name) { return root; }
    for (auto *child : root->childItems()) { if (auto *found = find(child, name)) { return found; } }
    return nullptr;
  }
  QQuickItem *item(const QString &name) const {
    const auto widget = presenter.editorWidget();
    return widget ? find(widget->rootObject(), name) : nullptr;
  }
  void click(QQuickItem *target) {
    Q_ASSERT(target);
    QTest::mouseClick(presenter.editorWidget(),Qt::LeftButton,Qt::NoModifier,target->mapToScene(QPointF(target->width()/2,target->height()/2)).toPoint());
  }
};
// The web edits these inline on the card: a constant List or Dict table, a
// string list's chips, JSON, record columns, and the workflow and collection
// selects. Other lists and dictionaries show their label alone.
QJsonObject typed(const QString &type, const QJsonArray &args = {}) { return {{"type",type},{"type_args",args}}; }
QJsonArray structuredCatalog() {
  const auto entry = [](const QString &type, const QJsonArray &properties) {
    QJsonArray names;
    for (const auto &property : properties) { names.append(property.toObject()["name"]); }
    return QJsonObject{{"node_type",type},{"title",type},{"inline_fields",names},{"properties",properties}};
  };
  return {
    entry("nodetool.constant.List",{QJsonObject{{"name","value"},{"type",typed("list",{typed("any")})}}}),
    entry("nodetool.constant.Dict",{QJsonObject{{"name","value"},{"type",typed("dict",{typed("str"),typed("any")})}}}),
    entry("Mixed",{
      QJsonObject{{"name","tags"},{"type",typed("list",{typed("str")})}},
      QJsonObject{{"name","items"},{"type",typed("list",{typed("int")})}},
      QJsonObject{{"name","mapping"},{"type",typed("dict",{typed("str"),typed("int")})}},
      QJsonObject{{"name","payload"},{"type",typed("json")}},
      QJsonObject{{"name","schema"},{"type",typed("record_type")}},
      QJsonObject{{"name","flow"},{"type",typed("workflow")}},
      QJsonObject{{"name","flows"},{"type",typed("list",{typed("workflow")})}},
      QJsonObject{{"name","store"},{"type",typed("collection")}}})};
}
QJsonObject structuredSnapshot() {
  const auto card = [](const QString &id, const QString &type, double x, const QJsonObject &data) {
    return QJsonObject{{"id",id},{"type",type},{"data",data},{"ui_properties",QJsonObject{{"position",QJsonObject{{"x",x},{"y",60}}}}}};
  };
  return QJsonObject{{"graph",QJsonObject{{"edges",QJsonArray{}},{"nodes",QJsonArray{
    card("list","nodetool.constant.List",40,{{"value",QJsonArray{1,"two"}}}),
    card("dict","nodetool.constant.Dict",340,{{"value",QJsonObject{{"a",1}}}}),
    card("node","Mixed",640,{{"tags",QJsonArray{"red"}},{"items",QJsonArray{1}},{"mapping",QJsonObject{{"k",1}}},
      {"payload",QJsonObject{{"type","json"},{"data","{\"a\":1}"}}},{"schema",QJsonObject{{"type","record_type"},{"columns",QJsonArray{}}}},
      {"flow",QJsonObject{{"type","workflow"},{"id","w1"}}},{"flows",QJsonArray{}},{"store",QJsonObject{{"type","collection"},{"name",""}}},{"future",7}})}}}}};
}
// Serves the tRPC procedures the workflow and collection selects call.
struct ResourceServer {
  QTcpServer server;
  node_editor::ResourcePickerController controller;
  ResourceServer() {
    const bool listening=server.listen(QHostAddress::LocalHost);
    Q_ASSERT(listening);
    Q_UNUSED(listening);
    QObject::connect(&server,&QTcpServer::newConnection,&server,[this] {
      auto *socket=server.nextPendingConnection();
      QObject::connect(socket,&QTcpSocket::readyRead,socket,[socket] {
        const auto request=socket->readAll();
        QJsonObject data;
        if (request.contains("workflows.list")) {
          data={{"workflows",QJsonArray{QJsonObject{{"id","w1"},{"name","First"}},QJsonObject{{"id","w2"},{"name","Second"}}}},{"next",QJsonValue::Null}};
        } else if (request.contains("workflows.get")) {
          data={{"id",request.contains("w2") ? "w2" : "w1"}};
        } else {
          data={{"collections",QJsonArray{QJsonObject{{"name","docs"},{"count",1}}}}};
        }
        const auto body=QJsonDocument(QJsonObject{{"result",QJsonObject{{"data",data}}}}).toJson(QJsonDocument::Compact);
        socket->write("HTTP/1.1 200 OK\r\nConnection: close\r\nContent-Type: application/json\r\nContent-Length: "+QByteArray::number(body.size())+"\r\n\r\n"+body);
        socket->disconnectFromHost();
      });
    });
    controller.configure(QUrl(QString("http://127.0.0.1:%1").arg(server.serverPort())),"secret","owner");
  }
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
  void structuredFieldsFollowWebCardRules() {
    Fixture f(structuredCatalog(),structuredSnapshot());
    const QList<QPair<QString,QString>> inlineFields{{"list","value"},{"dict","value"},{"node","tags"},{"node","payload"},{"node","schema"},{"node","flow"},{"node","flows"},{"node","store"}};
    for (const auto &[node,name] : inlineFields) {
      QVERIFY2(!f.model.inlineDescriptor(f.node(node),name).isEmpty(),qPrintable(node+"."+name));
      QVERIFY2(!f.model.inlineFieldRect(f.node(node),name).isEmpty(),qPrintable(node+"."+name));
    }
    // A list or dictionary outside the constant nodes is its label on the web card.
    QVERIFY(f.model.inlineDescriptor(f.id,"items").isEmpty());
    QVERIFY(f.model.inlineDescriptor(f.id,"mapping").isEmpty());
    QHash<QString,NodeRow> rows;
    for (const auto &row : f.model.layout(f.id).rows) { rows.insert(row.propertyName,row); }
    QCOMPARE(rows["payload"].kind,NodeRowKind::Multiline);
    QVERIFY(rows["payload"].value.contains("\"a\":1"));
    QCOMPARE(rows["tags"].value,QString("red"));
    QCOMPARE(rows["flow"].kind,NodeRowKind::Field);
    QVERIFY(rows["flow"].choice);
    QCOMPARE(rows["flow"].value,QString("w1"));
    QVERIFY(rows["flows"].placeholder);
    QVERIFY(rows["store"].placeholder);
    QCOMPARE(rows["items"].kind,NodeRowKind::Label);
  }
  void structuredPanelStaysOpenAcrossEdits() {
    Fixture f(structuredCatalog(),structuredSnapshot());
    f.open("tags");
    QTRY_VERIFY(f.item("structured-add"));
    const auto compact=f.model.inlineFieldRect(f.id,"tags").height()*f.presenter.zoom();
    QTRY_VERIFY(f.presenter.editorRect().height()>compact);
    f.click(f.item("structured-add"));
    QTRY_COMPARE(f.value("tags").toArray().size(),2);
    QVERIFY(f.presenter.active());
    const auto capture=qEnvironmentVariable("NODETOOL_INLINE_CAPTURE");
    if (!capture.isEmpty()) { QTest::qWait(80); QVERIFY(f.view.grab().save(capture+"-structured.png")); }
    QTRY_VERIFY(f.item("structured-text-1"));
    f.click(f.item("structured-text-1"));
    QTest::keyClicks(f.presenter.editorWidget(),"blue");
    QTest::keyClick(f.presenter.editorWidget(),Qt::Key_Return);
    QTRY_COMPARE(f.value("tags").toArray(),(QJsonArray{"red","blue"}));
    QVERIFY(f.presenter.active());
    QCOMPARE(f.document.undoStack()->count(),2);
    QTest::keyClick(f.presenter.editorWidget(),Qt::Key_Escape);
    QTRY_VERIFY(!f.presenter.active());
    QCOMPARE(f.value("tags").toArray(),(QJsonArray{"red","blue"}));
    QCOMPARE(f.document.node("node")["data"].toObject()["future"].toInt(),7);
    // A canvas click commits a typed but unconfirmed entry, then closes.
    f.open("tags");
    QTRY_VERIFY(f.item("structured-text-0"));
    f.click(f.item("structured-text-0"));
    QTest::keyClick(f.presenter.editorWidget(),Qt::Key_A,Qt::ControlModifier);
    QTest::keyClicks(f.presenter.editorWidget(),"green");
    QTest::mouseClick(f.view.viewport(),Qt::LeftButton,Qt::NoModifier,QPoint(880,680));
    QTRY_COMPARE(f.value("tags").toArray(),(QJsonArray{"green","blue"}));
    QTRY_VERIFY(!f.presenter.active());
    QCOMPARE(f.document.undoStack()->count(),3);
    f.document.undo();
    QCOMPARE(f.value("tags").toArray(),(QJsonArray{"red","blue"}));
    // The constant List edits its table rows on the card.
    f.open("value","list");
    QTRY_VERIFY(f.item("data-table-select-0"));
    f.click(f.item("data-table-select-0"));
    QTRY_VERIFY(f.item("data-table-delete")->isEnabled());
    f.click(f.item("data-table-delete"));
    QTRY_COMPARE(f.value("value","list").toArray(),(QJsonArray{"two"}));
  }
  void recordColumnsAndJsonOnCard() {
    Fixture f(structuredCatalog(),structuredSnapshot());
    f.open("schema");
    QTRY_VERIFY(f.item("record-add-column"));
    f.click(f.item("record-add-column"));
    QTRY_COMPARE(f.value("schema").toObject()["columns"].toArray().size(),1);
    QCOMPARE(f.value("schema").toObject()["columns"].toArray().first().toObject()["name"].toString(),QString("Column 1"));
    QVERIFY(f.presenter.active());
    f.open("payload");
    QTRY_VERIFY(f.item("structured-json"));
    f.click(f.item("structured-json"));
    QTest::keyClick(f.presenter.editorWidget(),Qt::Key_A,Qt::ControlModifier);
    QTest::keyClicks(f.presenter.editorWidget(),"{\"b\":2}");
    f.click(f.item("structured-apply-json"));
    QTRY_COMPARE(f.value("payload").toObject()["data"].toString(),QString("{\"b\":2}"));
    QCOMPARE(f.value("payload").toObject()["type"].toString(),QString("json"));
  }
  void workflowAndCollectionSelectsOnCard() {
    ResourceServer resources;
    Fixture f(structuredCatalog(),structuredSnapshot());
    f.host.setServices({.resourcePicker=&resources.controller});
    f.open("flow");
    QTRY_VERIFY(f.item("inline-resource-select"));
    auto select=f.item("inline-resource-select");
    QTRY_COMPARE(select->property("count").toInt(),2);
    QTRY_VERIFY(f.presenter.popupOpen());
    QTest::keyClick(f.presenter.editorWidget(),Qt::Key_Down);
    QTest::keyClick(f.presenter.editorWidget(),Qt::Key_Return);
    QTRY_COMPARE(f.value("flow").toObject(),(QJsonObject{{"type","workflow"},{"id","w2"}}));
    QTRY_VERIFY(!f.presenter.active());
    // The list select toggles one workflow per choice and stays on the card.
    f.open("flows");
    QTRY_VERIFY(f.item("inline-resource-select"));
    select=f.item("inline-resource-select");
    QTRY_COMPARE(select->property("count").toInt(),2);
    QTRY_VERIFY(f.presenter.popupOpen());
    QTest::keyClick(f.presenter.editorWidget(),Qt::Key_Down);
    QTest::keyClick(f.presenter.editorWidget(),Qt::Key_Return);
    QTRY_COMPARE(f.value("flows").toArray(),(QJsonArray{QJsonObject{{"type","workflow"},{"id","w1"}}}));
    QVERIFY(f.presenter.active());
    select=f.item("inline-resource-select");
    QTRY_VERIFY(!f.presenter.popupOpen());
    f.click(select);
    QTRY_VERIFY(f.presenter.popupOpen());
    QTest::keyClick(f.presenter.editorWidget(),Qt::Key_Down);
    QTest::keyClick(f.presenter.editorWidget(),Qt::Key_Return);
    QTRY_COMPARE(f.value("flows").toArray().size(),2);
    QCOMPARE(f.value("flows").toArray().last().toObject()["id"].toString(),QString("w2"));
    QTest::keyClick(f.presenter.editorWidget(),Qt::Key_Escape);
    QTRY_VERIFY(!f.presenter.active());
    f.open("store");
    QTRY_VERIFY(f.item("inline-resource-select"));
    QTRY_COMPARE(f.item("inline-resource-select")->property("count").toInt(),1);
    QTRY_VERIFY(f.presenter.popupOpen());
    QTest::keyClick(f.presenter.editorWidget(),Qt::Key_Down);
    QTest::keyClick(f.presenter.editorWidget(),Qt::Key_Return);
    QTRY_COMPARE(f.value("store").toObject(),(QJsonObject{{"type","collection"},{"name","docs"}}));
    QCOMPARE(f.document.undoStack()->count(),4);
    QCOMPARE(f.document.node("node")["data"].toObject()["future"].toInt(),7);
  }
};
QTEST_MAIN(InlinePropertyTest)
#include "InlinePropertyTest.moc"
