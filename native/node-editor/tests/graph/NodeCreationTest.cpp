#include "graph/NodeCreation.h"
#include "document/WorkflowDocument.h"
#include <QtTest>
using namespace nodetool;
namespace {
QJsonObject metadata(const QString &type,const QJsonArray &properties={},const QString &output={}) {
  QJsonObject result{{"node_type",type},{"properties",properties},{"outputs",QJsonArray{}}};
  if (!output.isEmpty()) { result["outputs"]=QJsonArray{QJsonObject{{"name","output"},{"type",QJsonObject{{"type",output}}}}}; }
  return result;
}
QJsonObject prop(const QString &name,const QJsonValue &value,const QString &type="str") {
  return {{"name",name},{"default",value},{"type",QJsonObject{{"type",type}}}};
}
}
class NodeCreationTest final : public QObject {
  Q_OBJECT
private slots:
  void exactDefaultsOverridesNamesAndPreservation() {
    const auto meta=metadata("nodetool.input.StringInput",{prop("name",""),prop("value","default"),prop("future",QJsonObject{{"nested",QJsonArray{false,0,""}}}),prop("unset",QJsonValue::Null)});
    QJsonArray existing;
    for (int i=1;i<=12000;++i) { existing.append(QJsonObject{{"data",QJsonObject{{"name","string_input_"+QString::number(i)}}}}); }
    const auto before=meta;
    NodeCreationOptions options;options.id="supplied";
    const auto node=createNativeNode(meta,{12.5,-23.25},existing,{{"value",false},{"unrecognized",QJsonObject{{"preserve",7}}}},options);
    QCOMPARE(meta,before);QCOMPARE(node["id"].toString(),QString("supplied"));
    const auto data=node["data"].toObject();QCOMPARE(data["name"].toString(),QString("string_input_12001"));
    QCOMPARE(data["value"],QJsonValue(false));QVERIFY(data["unset"].isNull());QCOMPARE(data["future"],meta["properties"].toArray()[2].toObject()["default"]);
    QCOMPARE(data["unrecognized"].toObject()["preserve"].toInt(),7);
    QCOMPARE(node["ui_properties"].toObject()["position"].toObject(),(QJsonObject{{"x",12.5},{"y",-23.25}}));
    QVERIFY(!node.contains("parent_id"));QVERIFY(!node.contains("dynamic_inputs"));QCOMPARE(node["dynamic_outputs"].toObject(),QJsonObject{});
    QCOMPARE(createNativeNode(meta,{},existing,{{"name","explicit"}})["data"].toObject()["name"].toString(),QString("explicit"));
    QCOMPARE(createNativeNode(metadata("nodetool.input.Folder",{prop("name","")}),{},{} )["data"].toObject()["name"].toString(),QString("folder_1"));
    QCOMPARE(createNativeNode(metadata("nodetool.output.StringOutput",{prop("name","")}),{},{} )["data"].toObject()["name"].toString(),QString());
    options.receivingName="source_handle";
    QCOMPARE(createNativeNode(meta,{},existing,{},options)["data"].toObject()["name"].toString(),QString("source_handle"));
    QCOMPARE(createNativeNode(metadata("nodetool.input.StringInput",{QJsonObject{{"name","name"}}}),{},{} )["data"].toObject()["name"].toString(),QString("string_input_1"));
    QVERIFY(!createNativeNode(metadata("NoName"),{},{},{},options)["data"].toObject().contains("name"));
  }
  void geometry_data() {
    QTest::addColumn<QString>("type");QTest::addColumn<QString>("output");QTest::addColumn<QString>("body");QTest::addColumn<int>("width");QTest::addColumn<int>("height");
    QTest::newRow("generic")<<"Generic"<<"str"<<""<<280<<0;
    QTest::newRow("preview")<<"nodetool.workflows.base_node.Preview"<<""<<""<<400<<300;
    QTest::newRow("compare")<<"nodetool.compare.CompareImages"<<"image"<<""<<450<<350;
    QTest::newRow("constant3d")<<"nodetool.constant.Model3D"<<"model_3d"<<""<<320<<320;
    QTest::newRow("constantImage")<<"nodetool.constant.Image"<<"image"<<""<<280<<0;
    QTest::newRow("inputVideo")<<"nodetool.input.VideoInput"<<"video"<<""<<280<<0;
    QTest::newRow("agent")<<"nodetool.agents.Agent"<<"str"<<"content_card"<<280<<0;
    QTest::newRow("image")<<"Generate"<<"image"<<""<<280<<280;
    QTest::newRow("audio")<<"Generate"<<"audio"<<""<<320<<160;
    QTest::newRow("video")<<"Generate"<<"video"<<""<<320<<220;
    QTest::newRow("text")<<"Generate"<<"str"<<"content_card"<<320<<220;
    QTest::newRow("explicitGeneric")<<"Generate"<<"float"<<"content_card"<<280<<280;
    QTest::newRow("extractCreationWidth")<<"nodetool.video.ExtractFrame"<<"image"<<""<<280<<380;
    QTest::newRow("oscillator")<<"nodetool.audio.synth.Oscillator"<<"audio"<<""<<280<<290;
    QTest::newRow("compress")<<"lib.audio.Compress"<<"audio"<<""<<280<<292;
  }
  // A snippet is a virtual type. Every create path must make a Code node, or no runner knows the type.
  void codeSnippetCreatesCodeNode() {
    auto snippet=metadata("nodetool.math.math_add",{prop("a",0,"float"),prop("b",0,"float")},"float");
    snippet["code_snippet"]=QJsonObject{{"code","return { output: inputs.a + inputs.b };"},{"title","Add"},
      {"data",QJsonObject{{"dynamic_properties",QJsonObject{{"a",""},{"b",""}}}}},
      {"code_node",metadata("nodetool.code.Code",{prop("code","")})}};
    const auto node=createNativeNode(snippet,{},{});
    QCOMPARE(node["type"].toString(),QString("nodetool.code.Code"));
    QCOMPARE(node["data"].toObject()["code"].toString(),QString("return { output: inputs.a + inputs.b };"));
    QCOMPARE(node["ui_properties"].toObject()["title"].toString(),QString("Add"));
    QCOMPARE(node["dynamic_properties"].toObject().keys(),(QStringList{"a","b"}));
  }
  void geometry() {
    QFETCH(QString,type);QFETCH(QString,output);QFETCH(QString,body);QFETCH(int,width);QFETCH(int,height);
    auto meta=metadata(type,{},output);meta["body"]=body;
    const auto ui=createNativeNode(meta,{},{} )["ui_properties"].toObject();
    QCOMPARE(ui["width"].toInt(),width);QCOMPARE(ui["height"].toInt(),height);QCOMPARE(ui.contains("height"),height!=0);
  }
  void primaryOutputPaletteAndGroup() {
    auto meta=metadata("Producer",{},"image");meta["outputs"]=QJsonArray{QJsonObject{{"name","first"},{"type",QJsonObject{{"type","image"}}}},QJsonObject{{"name","chosen"},{"type",QJsonObject{{"type","audio"}}}}};meta["primary_output"]="chosen";
    QCOMPARE(createNativeNode(meta,{},{} )["ui_properties"].toObject()["height"].toInt(),160);
    NodeCreationOptions options;options.paletteStarters=true;
    QCOMPARE(createNativeNode(metadata("nodetool.text.Concat"),{},{},{},options)["dynamic_properties"].toObject(),(QJsonObject{{"input_1",""},{"input_2",""}}));
    QVERIFY(createNativeNode(metadata("nodetool.text.Concat"),{},{} )["dynamic_properties"].toObject().isEmpty());
    meta=metadata("Styled",{},"audio");meta["style"]=QJsonObject{{"width",501},{"height",402},{"background","ignored"}};
    QCOMPARE(createNativeNode(meta,{},{} )["ui_properties"].toObject()["width"].toInt(),320);
    options.useMetadataStyle=true;
    QCOMPARE(createNativeNode(meta,{},{},{},options)["ui_properties"].toObject()["width"].toInt(),501);
    QCOMPARE(createNativeNode(meta,{},{},{},options)["ui_properties"].toObject()["height"].toInt(),402);
    options.useMetadataStyle=false;
    meta=metadata("nodetool.workflows.base_node.Group");meta["title"]="Custom Group";
    QCOMPARE(createNativeNode(meta,{},{} )["ui_properties"].toObject()["title"].toString(),QString("Custom Group"));
  }
  void modelDefaultsTaskValidation() {
    NodeCreationOptions options;
    options.defaultModels={{"image_model",QJsonObject{{"id","generic"},{"provider","p"},{"name","Default"}}},{"image_model:upscale",QJsonObject{{"id","up"},{"provider","q"},{"supported_tasks",QJsonArray{"upscale"}}}}};
    auto meta=metadata("nodetool.image.Upscale",{prop("model",QJsonObject{{"provider","empty"}},"image_model"),prop("code",QJsonValue::Null,"code_model")});
    const auto data=createNativeNode(meta,{},{},{},options)["data"].toObject();QCOMPARE(data["model"].toObject()["id"].toString(),QString("up"));QVERIFY(!data["model"].toObject().contains("supported_tasks"));QVERIFY(data["code"].isNull());
    options.defaultModels["image_model:upscale"]=QJsonObject{{"id","wrong"},{"provider","p"},{"supported_tasks",QJsonArray{}}};
    QCOMPARE(createNativeNode(meta,{},{},{},options)["data"].toObject()["model"].toObject()["provider"].toString(),QString("empty"));
    const QJsonObject chosen{{"id","manual"},{"provider","manual"},{"future",7}};
    QCOMPARE(createNativeNode(meta,{},{},{{"model",chosen}},options)["data"].toObject()["model"].toObject(),chosen);
  }
  void canonicalOneUndo() {
    const auto meta=metadata("nodetool.input.StringInput",{prop("name",""),prop("value","")});
    node_editor::WorkflowDocument document;document.setNodeMetadata(QJsonArray{meta});
    QVERIFY(document.load(QJsonObject{{"graph",QJsonObject{{"nodes",QJsonArray{}},{"edges",QJsonArray{}},{"future",42}}}}));
    const auto before=document.snapshot();const auto node=createNativeNode(meta,{10,20},{});
    QVERIFY(document.applyCommand(QJsonObject{{"op","addNode"},{"node",node}}));
    QCOMPARE(document.undoStack()->count(),1);QCOMPARE(document.node(node["id"].toString()),node);
    document.undo();QCOMPARE(document.snapshot(),before);document.redo();QCOMPARE(document.node(node["id"].toString()),node);
  }
};
QTEST_MAIN(NodeCreationTest)
#include "NodeCreationTest.moc"
