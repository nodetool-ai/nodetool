#include "BodyConnectionFixture.h"
#include "graph/CompatibleNodePicker.h"
#include "graph/EditorScene.h"
#include "graph/BodyConnectionRules.h"
#include "document/WorkflowDocument.h"
#include <QGraphicsView>
#include <QQmlEngine>
#include <QQuickWidget>
#include <QQuickItem>
#include <QtTest>
using namespace nodetool;
using namespace QtNodes;
namespace {
using namespace nodetool::body_fixture;
struct Fixture {
  node_editor::WorkflowDocument document;
  WorkflowGraphModel model;
  EditorScene scene{model}; QGraphicsView view{&scene}; QQmlEngine engine;
  CompatibleNodePicker picker{model,scene,view,&engine};
  QString error;
  explicit Fixture(const QString &targetType,const QJsonObject &extra={},const QJsonArray &edges={},const QJsonArray &additional={},const QString &originType="Fixed") {
    auto target=node("target",targetType,500);
    for (auto it=extra.begin();it!=extra.end();++it) { target[it.key()]=it.value(); }
    QJsonArray nodes{node("origin",originType,100),target}; for (const auto &value:additional) { nodes.append(value); }
    document.setNodeMetadata(catalog()); const auto loaded=document.load(QJsonObject{{"graph",QJsonObject{{"nodes",nodes},{"edges",edges}}}}); Q_ASSERT(loaded.ok);
    model.project(document.snapshot(),catalog()); picker.setCatalog(catalog());
    view.resize(1000,700); view.show();
    picker.applyCommand=[this](const QJsonObject &command) { const auto result=document.applyCommand(command); error=result.error; if (result) { model.project(document.snapshot(),catalog()); } return bool(result); };
  }
  void drop(PortType direction=PortType::Out) {
    picker.openBody(picker_fixture::id(model,"origin"),direction,0,picker_fixture::id(model,"target"),QPointF(600,150));
    QApplication::processEvents();
  }
};
QJsonObject oldEdge(const QString &handle="message") { return {{"id","previous"},{"source","older"},{"target","target"},{"sourceHandle","out"},{"targetHandle",handle},{"future",7}}; }
}
class BodyConnectionTest final : public QObject {
  Q_OBJECT
private slots:
  void legacyDeclarationsNormalizeWithoutSerializationChanges() {
    const QJsonObject text{{"type","str"}},list{{"type","list"},{"type_args",QJsonArray{text}}};
    const QJsonObject wrapped{{"type",QJsonObject{{"type",text}}}};
    for (const auto &raw:QJsonArray{QJsonValue("str"),wrapped}) {
      Fixture f("Legacy",QJsonObject{{"dynamic_properties",QJsonObject{{"legacy","kept"}}},{"dynamic_inputs",QJsonObject{{"legacy",raw}}}});
      const auto before=f.document.node("target"); f.drop(); QVERIFY2(f.error.isEmpty(),qPrintable(f.error));
      QCOMPARE(f.document.edges().size(),1); QCOMPARE(f.document.node("target"),before);
      QCOMPARE(f.model.ports(picker_fixture::id(f.model,"target"),PortType::In)[0].toObject()["type"].toObject(),text);
      f.document.undo(); QCOMPARE(f.document.node("target"),before);
    }
    Fixture fallback("DynamicIn",QJsonObject{{"dynamic_properties",QJsonObject{{"legacy",0}}},{"dynamic_inputs",QJsonObject{{"legacy","float"}}}});
    const auto prior=fallback.document.snapshot(); fallback.drop(); QVERIFY2(fallback.error.isEmpty(),qPrintable(fallback.error));
    QCOMPARE(fallback.document.node("target")["dynamic_inputs"].toObject()["legacy"].toString(),QString("float"));
    QVERIFY(fallback.document.node("target")["dynamic_inputs"].toObject().contains("Fixed_1"));
    fallback.document.undo(); QCOMPARE(fallback.document.snapshot(),prior);
    const auto projected=bodyPorts(QJsonObject{{"dynamic_outputs",QJsonObject{{"value",list}}}},QJsonObject{},true);
    QCOMPARE(projected.size(),1); QCOMPARE(projected[0].type,list);
    Fixture malformed("Legacy",QJsonObject{{"dynamic_outputs",QJsonObject{{"bad","str"}}}});
    QVERIFY(malformed.document.isReadOnly());
    const auto before=malformed.document.snapshot(); malformed.model.project(before,catalog(),true); malformed.drop();
    QCOMPARE(malformed.document.snapshot(),before);
  }
  void dynamicOutputUsesWebTopLevelTypeShape() {
    Fixture f("DynamicOut",{},{},{},"ListFixed"); f.drop(PortType::In); QVERIFY2(f.error.isEmpty(),qPrintable(f.error));
    const auto type=f.document.node("target")["dynamic_outputs"].toObject()["ListFixed"].toObject();
    QCOMPARE(type["type"].toString(),QString("list")); QVERIFY(type["type_args"].toArray().isEmpty());
    QCOMPARE(type["optional"].toBool(),false); QCOMPARE(type["type_name"].toString(),QString());
    QCOMPARE(f.document.edges().size(),1);
  }
  void singleScalarReplaceAndCollectFanInUndo() {
    for (const auto &type:{QString("Sink"),QString("Collect")}) {
      Fixture f(type,{},QJsonArray{oldEdge()},QJsonArray{node("older","Fixed",100,350)});
      const auto before=f.document.snapshot(); f.drop();
      QVERIFY2(f.error.isEmpty(),qPrintable(f.error));
      QCOMPARE(f.document.edges().size(),type=="Collect" ? 2:1);
      const auto newest=f.document.edges().last().toObject(); QCOMPARE(newest["source"].toString(),QString("origin"));
      const auto ui=f.document.node("target")["ui_properties"].toObject(); QCOMPARE(ui["future"].toInt(),42); QVERIFY(ui["exposed_inputs"].toArray().contains("message"));
      QCOMPARE(f.document.undoStack()->count(),1); f.document.undo(); QCOMPARE(f.document.snapshot(),before);
    }
  }
  void bodyKeepsAllCompatiblePortsAndGenerationGuard() {
    Fixture f("Receiver"); const auto before=f.document.snapshot(); f.drop();
    QVERIFY(f.picker.active()); QCOMPARE(f.picker.rows().size(),3); QCOMPARE(f.document.snapshot(),before);
    const auto old=f.picker.generation(); f.picker.cancel(); f.drop();
    f.picker.choose("prompt",old); QCOMPARE(f.document.snapshot(),before);
    auto widget=f.picker.widget(); QVERIFY(widget);
    QTRY_VERIFY(widget->rootObject()->findChild<QQuickItem *>("compatible-search")->hasActiveFocus());
    QTest::keyClicks(widget,"prompt"); QTRY_COMPARE(f.picker.rows().size(),1); QTest::keyClick(widget,Qt::Key_Return);
    QTRY_COMPARE(f.document.edges().size(),1); QCOMPARE(f.document.edges().first().toObject()["targetHandle"].toString(),QString("prompt"));
    QCOMPARE(f.document.undoStack()->count(),1); f.document.undo(); QCOMPARE(f.document.snapshot(),before);
  }
  void inputBodyKeepsAllCompatibleOutputs() {
    Fixture f("Producer"); const auto before=f.document.snapshot(); f.drop(PortType::In);
    QVERIFY(f.picker.active()); QCOMPARE(f.picker.rows().size(),3);
    f.picker.choose("other"); QVERIFY2(f.error.isEmpty(),qPrintable(f.error));
    QCOMPARE(f.document.edges().size(),1);
    const auto edge=f.document.edges().first().toObject(); QCOMPARE(edge["source"].toString(),QString("target"));
    QCOMPARE(edge["sourceHandle"].toString(),QString("other")); QCOMPARE(edge["target"].toString(),QString("origin"));
    QCOMPARE(f.document.undoStack()->count(),1); f.document.undo(); QCOMPARE(f.document.snapshot(),before);
  }
  void dynamicInputFallbackAndLegacyInference() {
    const auto number=picker_fixture::type("float");
    Fixture f("DynamicIn",QJsonObject{{"dynamic_properties",QJsonObject{{"Fixed_1",0}}},{"dynamic_inputs",QJsonObject{{"Fixed_1",QJsonObject{{"type",number}}}}}});
    const auto before=f.document.snapshot(); f.drop(); QVERIFY2(f.error.isEmpty(),qPrintable(f.error));
    const auto target=f.document.node("target");
    QCOMPARE(target["dynamic_properties"].toObject()["Fixed_2"].toString(),QString());
    QCOMPARE(target["dynamic_inputs"].toObject()["Fixed_2"].toObject()["type"].toObject()["type"].toString(),QString("str"));
    QCOMPARE(f.document.edges().first().toObject()["targetHandle"].toString(),QString("Fixed_2"));
    QCOMPARE(f.document.undoStack()->count(),1); f.document.undo(); QCOMPARE(f.document.snapshot(),before);
    Fixture legacy("Legacy",QJsonObject{{"dynamic_properties",QJsonObject{{"slot","kept"},{"outputOnly","kept too"}}},{"dynamic_outputs",QJsonObject{{"outputOnly",picker_fixture::type("str")}}}});
    const auto prior=legacy.document.snapshot(); legacy.drop(); QVERIFY2(legacy.error.isEmpty(),qPrintable(legacy.error));
    QCOMPARE(legacy.document.edges().first().toObject()["targetHandle"].toString(),QString("slot"));
    const auto inferred=legacy.document.node("target"); QCOMPARE(inferred["dynamic_properties"].toObject()["slot"].toString(),QString("kept"));
    QCOMPARE(inferred["dynamic_inputs"].toObject()["slot"].toObject()["type"].toObject()["type"].toString(),QString("str"));
    QVERIFY(!inferred["ui_properties"].toObject().contains("exposed_inputs"));
    legacy.document.undo(); QCOMPARE(legacy.document.snapshot(),prior);
  }
  void dynamicOutputPrecedesExistingCompatibleOutput() {
    Fixture f("DynamicOut",QJsonObject{{"dynamic_outputs",QJsonObject{{"Fixed_1",picker_fixture::type("str")}}}});
    const auto before=f.document.snapshot(); f.drop(PortType::In); QVERIFY2(f.error.isEmpty(),qPrintable(f.error));
    const auto edge=f.document.edges().first().toObject(); QCOMPARE(edge["source"].toString(),QString("target")); QCOMPARE(edge["sourceHandle"].toString(),QString("Fixed_2"));
    const auto type=f.document.node("target")["dynamic_outputs"].toObject()["Fixed_2"].toObject(); QCOMPARE(type["type"].toString(),QString("str")); QCOMPARE(type["optional"].toBool(),false);
    QCOMPARE(f.document.undoStack()->count(),1); f.document.undo(); QCOMPARE(f.document.snapshot(),before);
  }
  void rejectedCycleRollsBackNewSlotAndSchemaProvidersDoNotGrow() {
    const QJsonObject back{{"id","back"},{"source","target"},{"target","origin"},{"sourceHandle","out"},{"targetHandle","in"}};
    Fixture f("DynamicIn",{},QJsonArray{back}); const auto before=f.document.snapshot(); f.drop();
    QVERIFY(f.error.contains("cycle")); QCOMPARE(f.document.snapshot(),before); QCOMPARE(f.document.undoStack()->count(),0);
    for (const auto &type:{"fal.dynamic.FalDynamic","fal.DynamicFal","kie.dynamic_schema.KieAI","kie.DynamicKie"}) {
      Fixture schema(type); const auto prior=schema.document.snapshot(); schema.drop(); QCOMPARE(schema.document.snapshot(),prior); QVERIFY(!schema.picker.active());
    }
  }
  void previewRerouteAndAgentControlSpecials() {
    for (const auto &type:{QString("nodetool.workflows.base_node.Preview"),QString("nodetool.control.Reroute")}) {
      Fixture f(type); f.drop(); QVERIFY2(f.error.isEmpty(),qPrintable(f.error));
      QCOMPARE(f.document.edges().size(),1); QCOMPARE(f.document.edges().first().toObject()["targetHandle"].toString(),type.endsWith("Preview") ? QString("value"):QString("input_value"));
    }
    Fixture agent("Sink",{},{},{},"nodetool.agents.Agent"); agent.drop(); QVERIFY2(agent.error.isEmpty(),qPrintable(agent.error));
    const auto edge=agent.document.edges().first().toObject(); QCOMPARE(edge["edge_type"].toString(),QString("control")); QCOMPARE(edge["targetHandle"].toString(),QString("__control__"));
  }
};
QTEST_MAIN(BodyConnectionTest)
#include "BodyConnectionTest.moc"
