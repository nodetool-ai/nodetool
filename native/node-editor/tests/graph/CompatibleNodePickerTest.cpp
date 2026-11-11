#include "CompatiblePickerFixture.h"
#include "graph/CompatibleNodePicker.h"
#include "graph/EditorScene.h"
#include "graph/CompatibleNodePlacement.h"
#include "document/WorkflowDocument.h"
#include "document/ConnectionTypes.h"
#include <QGraphicsView>
#include <QQmlEngine>
#include <QQuickWidget>
#include <QQuickItem>
#include <QSignalSpy>
#include <QRegularExpression>
#include <QtTest>
using namespace nodetool;
using namespace QtNodes;
namespace {
struct Fixture {
  QJsonArray catalog;
  node_editor::WorkflowDocument document;
  WorkflowGraphModel model;
  EditorScene scene{model};
  QGraphicsView view{&scene};
  QQmlEngine engine;
  CompatibleNodePicker picker{model,scene,view,&engine};
  NodeId node=InvalidNodeId;
  explicit Fixture(QJsonArray nodes=picker_fixture::catalog(),const QJsonObject &workflow=picker_fixture::workflow(),
                   const QString &origin="origin") : catalog(std::move(nodes)) {
    document.setNodeMetadata(catalog);
    const auto result=document.load(workflow); if (!result.ok) { qFatal("fixture load: %s",qPrintable(result.error)); }
    model.project(document.snapshot(),catalog);
    picker.setCatalog(catalog);
    node=picker_fixture::id(model,origin);
    view.resize(900,700); view.setSceneRect(0,0,1200,900); view.show();
    picker.applyCommand=[this](const QJsonObject &command) {
      const auto result=document.applyCommand(command);
      if (result) { model.project(document.snapshot(),catalog); }
      return bool(result);
    };
  }
  void open(PortType direction=PortType::Out,PortIndex index=0) { picker.open(node,direction,index,QPointF(413.5,227.25)); QApplication::processEvents(); }
  PortIndex input(const QString &name) const {
    const auto ports=model.ports(node,PortType::In);
    for (qsizetype i=0;i<ports.size();++i) { if (ports[i].toObject()["name"].toString()==name) { return PortIndex(i); } }
    return PortIndex(-1);
  }
};
QStringList labels(const QVariantList &rows) {
  QStringList result;
  for (const auto &value:rows) { result.append(value.toMap()["label"].toString()); }
  return result;
}
QJsonObject tunerWorkflow() {
  const QJsonObject node{{"id","tuner"},{"type","Tuner"},{"data",QJsonObject{{"count",3}}},
    {"ui_properties",QJsonObject{{"position",QJsonObject{{"x",500},{"y",100}}}}}};
  return {{"name","Tuner"},{"graph",QJsonObject{{"nodes",QJsonArray{node}},{"edges",QJsonArray{}}}}};
}
QString key(const QVariantList &rows,const QString &type,const QString &port={}) {
  for (const auto &value:rows) {
    const auto row=value.toMap();
    if (row["type"].toString()==type && (port.isEmpty() || row["port"].toString()==port)) { return row["key"].toString(); }
  }
  return {};
}
}
class CompatibleNodePickerTest final : public QObject {
  Q_OBJECT
private slots:
  void sharedCreationPolicyForwardNameAndStyle() {
    Fixture f;
    auto catalog=picker_fixture::catalog();
    auto receiver=catalog[1].toObject();
    auto properties=receiver["properties"].toArray();
    properties.append(QJsonObject{{"name","name"},{"default",""},{"type",picker_fixture::type("str")}});
    receiver["properties"]=properties;
    receiver["style"]=QJsonObject{{"width",410},{"height",290}};
    catalog[1]=receiver;
    f.document.setNodeMetadata(catalog);f.model.project(f.document.snapshot(),catalog);f.picker.setCatalog(catalog);
    const auto before=f.document.snapshot();f.open();
    const auto selected=key(f.picker.rows(),"Receiver","prompt");QVERIFY(!selected.isEmpty());
    f.picker.choose(selected,f.picker.generation());
    QCOMPARE(f.document.nodes().size(),2);QCOMPARE(f.document.edges().size(),1);
    auto created=f.document.nodes().last().toObject();
    QCOMPARE(created["data"].toObject()["name"].toString(),QString("out"));
    QCOMPARE(created["data"].toObject()["prompt"].toString(),QString("hello"));
    QCOMPARE(created["ui_properties"].toObject()["width"].toInt(),410);
    QCOMPARE(created["ui_properties"].toObject()["height"].toInt(),290);
    QCOMPARE(f.document.undoStack()->count(),1);f.document.undo();QCOMPARE(f.document.snapshot(),before);
  }
  // With no query the list ranks as the web ConnectableNodes.tsx does: recent
  // nodes first, then node type order (rankSearchNodes), one node's ports together.
  void defaultOrderRanksRecentThenType() {
    Fixture f; QStringList recent{"Multi"};
    f.picker.recentTypes=[&recent] { return recent; };
    f.open();
    QStringList order;
    for (const auto &value:f.picker.rows()) { order.append(value.toMap()["key"].toString()); }
    QCOMPARE(order,QStringList({"Multi\nleft","Multi\nright","Fixed\nin","ListReceiver\nitems","Receiver\nprompt"}));
  }
  void placementMatchesWebNearestFreeBoundary() {
    const QRectF desired(100,100,100,100);
    QCOMPARE(compatibleNodeY(desired,{QRectF(100,80,100,140)}),240.0);
    QCOMPARE(compatibleNodeY(QRectF(100,50,100,100),{QRectF(100,0,100,100),QRectF(100,100,100,100)}),220.0);
    QCOMPARE(compatibleNodeY(desired,{QRectF(0,0,1000,1000)}),100.0);
    QCOMPARE(compatibleNodeY(desired,{QRectF(500,80,100,140)}),100.0);
    QVector<QRectF> many;
    for (int i=0;i<12000;++i) { many.append(QRectF(100,i*30,100,40)); }
    QCOMPARE(compatibleNodeY(desired,many),-120.0);
  }
  void filterUsesNativeRulesAndWebPreferences() {
    Fixture f; f.open(); QVERIFY(f.picker.active());
    const auto rows=f.picker.rows();
    QVERIFY(!key(rows,"Receiver","prompt").isEmpty());
    QVERIFY(key(rows,"Receiver","fallback").isEmpty());
    QVERIFY(key(rows,"Receiver","other").isEmpty());
    QVERIFY(!key(rows,"Multi","left").isEmpty());
    QVERIFY(!key(rows,"Multi","right").isEmpty());
    QVERIFY(key(rows,"FloatOnly").isEmpty());
    QVERIFY(!key(rows,"ListReceiver").isEmpty());
    // The web ranking (rankSearchNodes) also finds "List receiver", below the closer match.
    f.picker.setQuery("receiver prompt"); QCOMPARE(f.picker.rows().size(),2);
    QCOMPARE(f.picker.rows().first().toMap()["key"].toString(),QString("Receiver\nprompt"));
    f.picker.setQuery("no such node"); QVERIFY(f.picker.rows().isEmpty());
    f.open(PortType::In);
    QCOMPARE(key(f.picker.rows(),"Producer","primary"),QString("Producer\nprimary"));
    QVERIFY(key(f.picker.rows(),"Producer","other").isEmpty());
    QVERIFY(key(f.picker.rows(),"Producer","fallback").isEmpty());
  }
  void canonicalBatchOneUndoBothDirections() {
    for (const auto direction:{PortType::Out,PortType::In}) {
      Fixture f; const auto baseline=f.document.snapshot(); f.open(direction);
      QSignalSpy created(&f.picker,&CompatibleNodePicker::nodeCreated);
      f.picker.choose(key(f.picker.rows(),direction==PortType::Out ? "Receiver":"Producer"));
      QCOMPARE(created.size(),1);
      const auto id=created.first().first().toString();
      QVERIFY(QRegularExpression("^[0-9a-f]{32}$").match(id).hasMatch());
      QCOMPARE(f.document.nodes().size(),2); QCOMPARE(f.document.edges().size(),1);
      const auto edge=f.document.edges().first().toObject();
      QCOMPARE(edge[direction==PortType::Out ? "target":"source"].toString(),id);
      QCOMPARE(edge[direction==PortType::Out ? "source":"target"].toString(),QString("origin"));
      const auto expected=direction==PortType::Out ? QJsonObject{{"x",473.5},{"y",181.25}} : QJsonObject{{"x",93.5},{"y",192.0}};
      QCOMPARE(f.document.node(id)["ui_properties"].toObject()["position"].toObject(),expected);
      if (direction==PortType::Out) {
        QCOMPARE(f.document.node(id)["data"].toObject()["prompt"].toString(),QString("hello"));
        QCOMPARE(f.document.node(id)["data"].toObject()["seed"].toInt(),0);
      }
      QCOMPARE(f.document.undoStack()->count(),1);
      f.document.undo(); QCOMPARE(f.document.snapshot(),baseline);
    }
  }
  void arrowKeysChooseExplicitAmbiguousPort() {
    Fixture f; f.open(); auto widget=f.picker.widget(); QVERIFY(widget);
    QTRY_VERIFY(widget->rootObject()->findChild<QQuickItem *>("compatible-search")->hasActiveFocus());
    QTest::keyClicks(widget,"Multi"); QTRY_COMPARE(f.picker.rows().size(),2);
    QTest::keyClick(widget,Qt::Key_Down); QTest::keyClick(widget,Qt::Key_Return);
    QTRY_COMPARE(f.document.edges().size(),1);
    QCOMPARE(f.document.edges().first().toObject()["targetHandle"].toString(),QString("right"));
    QCOMPARE(f.document.undoStack()->count(),1);
  }
  void keyboardCancelAndOldPopupToken() {
    Fixture f; f.open();
    auto widget=f.picker.widget(); QVERIFY(widget);
    auto search=widget->rootObject()->findChild<QQuickItem *>("compatible-search"); QVERIFY(search);
    QTRY_VERIFY(search->hasActiveFocus());
    QTest::keyClicks(widget,"Receiver prompt"); QTRY_COMPARE(f.picker.rows().size(),2);
    QTest::keyClick(widget,Qt::Key_Return);
    QTRY_COMPARE(f.document.nodes().size(),2);
    QCOMPARE(f.document.undoStack()->count(),1);
    f.document.undo(); f.model.project(f.document.snapshot(),picker_fixture::catalog());
    const auto baseline=f.document.snapshot();
    f.open(); widget=f.picker.widget(); QVERIFY(widget);
    QTRY_VERIFY(widget->rootObject()->findChild<QQuickItem *>("compatible-search")->hasActiveFocus());
    const auto token=f.picker.generation();
    const auto oldKey=key(f.picker.rows(),"Receiver");
    QTest::keyClick(widget,Qt::Key_Escape); QTRY_VERIFY(!f.picker.active());
    f.open();
    f.picker.choose(oldKey,token); f.picker.search("stale query",token); f.picker.dismiss(token);
    QVERIFY(f.picker.active()); QVERIFY(f.picker.query().isEmpty());
    QCOMPARE(f.document.snapshot(),baseline);
    f.model.project(f.document.snapshot(),picker_fixture::catalog());
    QVERIFY(!f.picker.active());
    f.picker.choose(oldKey); QCOMPARE(f.document.snapshot(),baseline);
    f.model.project(f.document.snapshot(),picker_fixture::catalog(),true);
    f.open(); QVERIFY(!f.picker.active()); QCOMPARE(f.document.snapshot(),baseline);
  }
  // OutputContextMenu.tsx and InputContextMenu.tsx show their fixed rows only while the search is empty.
  void fixedRowsShowOnlyWithEmptyQuery() {
    Fixture f(picker_fixture::staticCatalog()); f.open();
    QCOMPARE(labels(f.picker.fixedRows()),QStringList({"Preview","Output","Reroute","Save"}));
    f.picker.setQuery("rec"); QVERIFY(f.picker.fixedRows().isEmpty()); QVERIFY(!f.picker.rows().isEmpty());
    f.picker.choose("fixed\npreview",f.picker.generation()); QCOMPARE(f.document.nodes().size(),1);
    // The web test is searchTerm.trim().length === 0, so a blank query keeps the rows.
    f.picker.setQuery("  "); QCOMPARE(f.picker.fixedRows().size(),4);
    f.open(PortType::In);
    QCOMPARE(labels(f.picker.fixedRows()),QStringList({"Constant","Input","Prompt"}));
    // Without the nodes in the catalog, no fixed row shows.
    Fixture bare; bare.open(); QVERIFY(bare.picker.fixedRows().isEmpty());
  }
  void previewAndSaveRowsWireTheOutput() {
    Fixture f(picker_fixture::staticCatalog()); const auto baseline=f.document.snapshot(); f.open();
    QSignalSpy created(&f.picker,&CompatibleNodePicker::nodeCreated);
    f.picker.choose("fixed\npreview",f.picker.generation());
    QCOMPARE(created.size(),1); QVERIFY(!f.picker.active());
    const auto id=created.first().first().toString();
    QCOMPARE(f.document.nodes().size(),2); QCOMPARE(f.document.edges().size(),1);
    const auto node=f.document.node(id);
    QCOMPARE(node["type"].toString(),QString("nodetool.workflows.base_node.Preview"));
    QCOMPARE(node["data"].toObject()["name"].toString(),QString("out"));
    const auto edge=f.document.edges().first().toObject();
    QCOMPARE(edge["source"].toString(),QString("origin")); QCOMPARE(edge["sourceHandle"].toString(),QString("out"));
    QCOMPARE(edge["target"].toString(),id); QCOMPARE(edge["targetHandle"].toString(),QString("value"));
    QCOMPARE(f.document.undoStack()->count(),1); f.document.undo(); QCOMPARE(f.document.snapshot(),baseline);
    f.model.project(f.document.snapshot(),f.catalog);
    // Save <Type> takes the first input that accepts the output type.
    f.open(); f.picker.choose("fixed\nsave",f.picker.generation());
    QCOMPARE(f.document.edges().size(),1);
    QCOMPARE(f.document.edges().first().toObject()["targetHandle"].toString(),QString("text"));
    f.open(); f.picker.choose("fixed\nreroute",f.picker.generation());
    QCOMPARE(f.document.edges().last().toObject()["targetHandle"].toString(),QString("input_value"));
  }
  void inputConstantGetsTypeAndPresets() {
    Fixture f(picker_fixture::staticCatalog(),tunerWorkflow(),"tuner");
    const auto baseline=f.document.snapshot();
    f.open(PortType::In,f.input("mode"));
    QCOMPARE(labels(f.picker.fixedRows()),QStringList({"Constant"}));
    QSignalSpy created(&f.picker,&CompatibleNodePicker::nodeCreated);
    f.picker.choose("fixed\nconstant",f.picker.generation()); QCOMPARE(created.size(),1);
    const auto constant=f.document.node(created.last().first().toString());
    QCOMPARE(constant["type"].toString(),QString("nodetool.constant.Select"));
    const auto data=constant["data"].toObject();
    QCOMPARE(data["options"].toArray(),QJsonArray({"fast","slow"}));
    QCOMPARE(data["value"].toString(),QString("fast"));
    QCOMPARE(data["enum_type_name"].toString(),QString("Mode"));
    auto edge=f.document.edges().first().toObject();
    QCOMPARE(edge["sourceHandle"].toString(),QString("output")); QCOMPARE(edge["targetHandle"].toString(),QString("mode"));
    QCOMPARE(edge["target"].toString(),QString("tuner"));
    QCOMPARE(f.document.undoStack()->count(),1);
    // A second constant replaces the edge into the same input in the same undo step.
    f.open(PortType::In,f.input("mode")); f.picker.choose("fixed\nconstant",f.picker.generation());
    QCOMPARE(f.document.edges().size(),1); QCOMPARE(f.document.undoStack()->count(),2);
    f.document.undo(); f.document.undo(); QCOMPARE(f.document.snapshot(),baseline);
    f.model.project(f.document.snapshot(),f.catalog);
    // A numeric Input takes the target property's min, max and default, and the handle's name.
    f.open(PortType::In,f.input("count"));
    QCOMPARE(labels(f.picker.fixedRows()),QStringList({"Constant","Input"}));
    f.picker.choose("fixed\ninput",f.picker.generation()); QCOMPARE(created.size(),3);
    const auto input=f.document.node(created.last().first().toString())["data"].toObject();
    QCOMPARE(input["min"].toInt(),1); QCOMPARE(input["max"].toInt(),9); QCOMPARE(input["value"].toInt(),3);
    QCOMPARE(input["name"].toString(),QString("count"));
    f.document.undo(); QCOMPARE(f.document.snapshot(),baseline);
  }
};
QTEST_MAIN(CompatibleNodePickerTest)
#include "CompatibleNodePickerTest.moc"
