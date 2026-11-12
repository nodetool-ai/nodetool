#include "document/WorkflowDocument.h"
#include "properties/PropertyFields.h"
#include <QtTest>
using namespace nodetool::node_editor;
class PropertyFieldsTest : public QObject {
 Q_OBJECT
private slots:
 void conditionalRuleSemantics() {
  const auto check = [](QJsonValue rule, QJsonObject values) { return propertyConditionSatisfied(QJsonObject{{"json_schema_extra", QJsonObject{{"visible_when", rule}}}}, values); };
  QVERIFY(check("future", {}));
  QVERIFY(check(QJsonObject{{"property", 7}}, {}));
  const QJsonObject nested{{"property", "model"}, {"path", "capabilities"}, {"includes", "clone"}};
  QVERIFY(check(nested, {{"model", QJsonObject{{"capabilities", QJsonArray{"clone"}}}}}));
  QVERIFY(!check(nested, {{"model", QJsonObject{{"capabilities", QJsonArray{}}}}}));
  QVERIFY(!check(nested, {{"model", QJsonArray{}}}));
  QVERIFY(check(QJsonObject{{"property", "flags"}, {"includes_any", QJsonArray{"a", "b"}}, {"equals", false}}, {{"flags", QJsonArray{"b"}}}));
  QVERIFY(!check(QJsonObject{{"property", "flags"}, {"includes_any", QJsonArray{}}}, {{"flags", QJsonArray{"b"}}}));
  QVERIFY(!check(QJsonObject{{"property", "v"}, {"equals", false}}, {}));
  QVERIFY(!check(QJsonObject{{"property", "v"}, {"equals", false}}, {{"v", 0}}));
  QVERIFY(check(QJsonObject{{"property", "v"}, {"equals", QJsonValue::Null}}, {{"v", QJsonValue::Null}}));
  QVERIFY(!check(QJsonObject{{"property", "v"}, {"equals", QJsonObject{}}}, {{"v", QJsonObject{}}}));
  QVERIFY(!check(QJsonObject{{"property", "v"}, {"includes", QJsonObject{}}}, {{"v", QJsonArray{QJsonObject{}}}}));
  for (const auto &v : QJsonArray{false, 0, "", QJsonValue::Null}) { QVERIFY(!check(QJsonObject{{"property", "v"}}, {{"v", v}})); }
  for (const auto &v : QJsonArray{true, 1, "false", QJsonArray{}, QJsonObject{}}) { QVERIFY(check(QJsonObject{{"property", "v"}}, {{"v", v}})); }
 }
 // web PropertyInput.tsx: a property resets only with a non-null default, and counts as changed once
 // its stored value differs from that default. A value that is absent follows the default.
 void changedAndResettableState() {
  const auto field=[](const QJsonObject &property,const QJsonObject &data,const QString &storage="data") {
    QJsonObject node{{"id","n"},{"data",storage=="data" ? data : QJsonObject{}}};
    if (storage!="data") { node["dynamic_properties"]=data; node["dynamic_inputs"]=QJsonObject{{property["name"].toString(),property}}; }
    for (const auto &row : propertyFields(node,QJsonObject{{"properties",storage=="data" ? QJsonArray{property} : QJsonArray{}}},{})) { if (row.toMap()["name"]==property["name"].toString()) { return row.toMap(); } }
    return QVariantMap{};
  };
  const QJsonObject count{{"name","Count"},{"type",QJsonObject{{"type","int"}}},{"default",2}};
  auto row=field(count,{{"Count",5}});
  QVERIFY(row["hasResetDefault"].toBool()); QVERIFY(row["changed"].toBool());
  row=field(count,{{"Count",2}}); QVERIFY(row["hasResetDefault"].toBool()); QVERIFY(!row["changed"].toBool());
  row=field(count,{{"Count",2.0}}); QVERIFY(!row["changed"].toBool());
  row=field(count,{}); QVERIFY(row["hasResetDefault"].toBool()); QVERIFY(!row["changed"].toBool());
  // Stored null differs from a real default, so it stays resettable and is distinct from the default.
  row=field(count,{{"Count",QJsonValue::Null}}); QVERIFY(row["changed"].toBool());
  // A null default has nothing to reset to, as the web's `property.default != null` guard.
  const QJsonObject nullable{{"name","Note"},{"type",QJsonObject{{"type","str"},{"optional",true}}},{"default",QJsonValue::Null}};
  row=field(nullable,{{"Note","x"}}); QVERIFY(!row["hasResetDefault"].toBool()); QVERIFY(!row["changed"].toBool());
  const QJsonObject missing{{"name","Note"},{"type",QJsonObject{{"type","str"}}}};
  row=field(missing,{{"Note","x"}}); QVERIFY(!row["hasResetDefault"].toBool());
  // A dynamic input resets to the default its own declaration carries.
  const QJsonObject dynamic{{"name","Slot"},{"type",QJsonObject{{"type","int"}}},{"default",7}};
  row=field(dynamic,{{"Slot",1}},"dynamic_properties"); QVERIFY(row["hasResetDefault"].toBool()); QVERIFY(row["changed"].toBool());
  row=field(dynamic,{{"Slot",7}},"dynamic_properties"); QVERIFY(!row["changed"].toBool());
 }
 void conditionalVisibility() {
  const QJsonObject field{{"name", "folder"}, {"type", "str"}, {"json_schema_extra", QJsonObject{{"visible_when", QJsonObject{{"property", "workspace"}, {"equals", false}}}}}};
  const QJsonObject metadata{{"properties", QJsonArray{field}}};
  QJsonObject node{{"id", "n"}, {"data", QJsonObject{{"folder", "keep"}, {"workspace", true}}}};
  const auto find = [](const QVariantList &rows) { for (const auto &row : rows) { if (row.toMap()["name"] == "folder") { return row.toMap(); } } return QVariantMap{}; };
  QVERIFY(find(propertyFields(node, metadata, {})).isEmpty());
  const QJsonArray edges{QJsonObject{{"target", "n"}, {"targetHandle", "folder"}}};
  const auto connected = find(propertyFields(node, metadata, edges));
  QVERIFY(!connected.isEmpty());
  QVERIFY(connected["conditionalUnavailable"].toBool());
  QVERIFY(!connected["editable"].toBool());
  node["data"] = QJsonObject{{"folder", "keep"}, {"workspace", false}};
  const auto shown = find(propertyFields(node, metadata, {}));
  QCOMPARE(shown["value"].toString(), QString("keep"));
  QVERIFY(shown["editable"].toBool());
  node["data"] = QJsonObject{{"workspace", true}};
  node["dynamic_inputs"] = QJsonObject{{"extra", field}};
  node["dynamic_properties"] = QJsonObject{{"extra", "preserve and edit"}};
  const auto rows = propertyFields(node, metadata, {});
  bool dynamicVisible = false;
  for (const auto &entry : rows) {
    const auto row = entry.toMap();
    if (row["name"] == "extra") { dynamicVisible = true; QVERIFY(row["editable"].toBool()); QCOMPARE(row["value"].toString(), QString("preserve and edit")); }
  }
  QVERIFY(dynamicVisible);
 }
 void structuredTransactions() {
  const QJsonObject intType{{"type", "int"}};
  const QJsonObject listType{{"type", "list"}, {"type_args", QJsonArray{intType}}};
  const QJsonObject dictType{{"type", "dict"}, {"type_args", QJsonArray{QJsonObject{{"type", "str"}}, listType}}};
  const QJsonObject declaration{{"name", "values"}, {"type", dictType}};
  QCOMPARE(propertyKind(declaration), QString("dict"));
  QCOMPARE(propertyKind({{"type", QJsonObject{{"type", "list"}, {"type_args", QJsonArray{QJsonObject{{"type", "image"}}}}}}}), QString("media_list"));
  QCOMPARE(propertyKind({{"type", QJsonObject{{"type", "str"}}}, {"json_schema_extra", QJsonObject{{"type", "json"}}}}), QString("json"));
  QVERIFY(validatePropertyValue(declaration, QJsonObject{{"numbers", QJsonArray{1, 2}}}).isEmpty());
  QVERIFY(!validatePropertyValue(declaration, QJsonObject{{"numbers", QJsonArray{1, "two"}}}).isEmpty());
  QVERIFY(!validatePropertyValue(declaration, QJsonArray{}).isEmpty());
  const QJsonObject optionalList{{"type", QJsonObject{{"type", "union"}, {"type_args", QJsonArray{listType, QJsonObject{{"type", "none"}}}}}}};
  QVERIFY(validatePropertyValue(optionalList, QJsonValue::Null).isEmpty());
  QVERIFY(validatePropertyValue(optionalList, QJsonArray{1}).isEmpty());
  QVERIFY(!validatePropertyValue(optionalList, QJsonArray{"bad"}).isEmpty());
  QJsonArray oversized;
  for (int i = 0; i < 10001; ++i) { oversized.append(i); }
  QVERIFY(!validatePropertyValue(QJsonObject{{"type", listType}}, oversized).isEmpty());
  const QJsonObject json{{"name", "json"}, {"type", QJsonObject{{"type", "json"}}}};
  QVERIFY(validatePropertyValue(json, QJsonObject{{"type", "json"}, {"data", "true"}, {"future", 4}}).isEmpty());
  QVERIFY(!validatePropertyValue(json, QJsonObject{{"type", "json"}, {"data", "{"}}).isEmpty());
  const QJsonObject record{{"name", "record"}, {"type", QJsonObject{{"type", "record_type"}}}};
  const QJsonObject column{{"name", "a"}, {"data_type", "string"}, {"future", 3}};
  QVERIFY(validatePropertyValue(record, QJsonObject{{"type", "record_type"}, {"columns", QJsonArray{column}}, {"future", 9}}).isEmpty());
  QVERIFY(!validatePropertyValue(record, QJsonObject{{"type", "record_type"}, {"columns", QJsonArray{column, column}}}).isEmpty());
  QJsonValue deep = 1;
  for (int i = 0; i < 30; ++i) { deep = QJsonArray{deep}; }
  int budget = 10000;
  QVERIFY(!validateTypedValue(QJsonObject{{"type", "any"}}, deep, 0, budget).isEmpty());
  WorkflowDocument d;
  d.setNodeMetadata({QJsonObject{{"node_type", "test"}, {"properties", QJsonArray{declaration, json, record}}}});
  QVERIFY(d.load(QJsonObject{{"graph", QJsonObject{{"nodes", QJsonArray{QJsonObject{{"id", "n"}, {"type", "test"}, {"data", QJsonObject{{"unknown", QJsonObject{{"future", true}}}}}}}}, {"edges", QJsonArray{}}}}}));
  QVERIFY(!d.applyCommand({{"op", "setProperty"}, {"id", "n"}, {"name", "values"}, {"value", QJsonObject{{"bad", QJsonArray{"wrong"}}}}}));
  QCOMPARE(d.undoStack()->count(), 0);
  QVERIFY(d.applyCommand({{"op", "setProperty"}, {"id", "n"}, {"name", "values"}, {"value", QJsonObject{{"good", QJsonArray{1, 2}}}}}));
  QCOMPARE(d.undoStack()->count(), 1);
  QCOMPARE(d.node("n")["data"].toObject()["unknown"].toObject()["future"], QJsonValue(true));
  d.undo(); QVERIFY(!d.node("n")["data"].toObject().contains("values"));
 }
 void validatedTransactions() {
  WorkflowDocument d;
  const QJsonObject integer{{"name", "count"}, {"type", QJsonObject{{"type", "int"}, {"optional", true}}}, {"min", 0}, {"max", 5}, {"default", 2}};
  d.setNodeMetadata({QJsonObject{{"node_type", "test"}, {"properties", QJsonArray{integer}}}});
  const QJsonObject n{{"id", "n"}, {"type", "test"}, {"data", QJsonObject{{"opaque", QJsonObject{{"id", "model"}}}}}, {"dynamic_inputs", QJsonObject{{"flag", QJsonObject{{"type", "bool"}}}}}};
  QVERIFY(d.load(QJsonObject{{"graph", QJsonObject{{"nodes", QJsonArray{n}}, {"edges", QJsonArray{}}}}}));
  const auto command = [](QJsonValue v) { return QJsonObject{{"op", "setProperty"}, {"id", "n"}, {"name", "count"}, {"value", v}}; };
  QVERIFY(!d.applyCommand(command(1.5))); QVERIFY(!d.applyCommand(command(6))); QVERIFY(!d.applyCommand(command("3")));
  QCOMPARE(d.undoStack()->count(), 0);
  QVERIFY(d.applyCommand(command(3))); QCOMPARE(d.undoStack()->count(), 1);
  d.undo(); QVERIFY(!d.node("n")["data"].toObject().contains("count"));
  QVERIFY(d.applyCommand(command(QJsonValue::Null)));
  QVERIFY(d.node("n")["data"].toObject()["count"].isNull());
  QVERIFY(d.applyCommand({{"op", "setProperty"}, {"id", "n"}, {"name", "flag"}, {"value", true}}));
  QVERIFY(d.node("n")["dynamic_properties"].toObject()["flag"].toBool());
  QVERIFY(!d.applyCommand({{"op", "setProperty"}, {"id", "n"}, {"name", "opaque"}, {"value", "model"}}));
  QCOMPARE(d.node("n")["data"].toObject()["opaque"], n["data"].toObject()["opaque"]);
 }
 void resolverEnumShapes() {
  const QJsonArray values{1, 2, "two"};
  const QJsonObject str{{"type", "str"}};
  const QJsonArray declarations{
   QJsonObject{{"name", "mode"}, {"type", str}, {"enum", values}},
   QJsonObject{{"name", "mode"}, {"type", QJsonObject{{"type", "enum"}, {"type_args", QJsonArray{QJsonObject{{"type", "str"}, {"values", values}}}}}}}
  };
  for (const auto& declaration : declarations) {
   WorkflowDocument d;
   d.setNodeMetadata({QJsonObject{{"node_type", "test"}, {"properties", QJsonArray{declaration}}}});
   const QJsonObject node{{"id", "n"}, {"type", "test"}, {"data", QJsonObject{}}};
   QVERIFY(d.load({{"graph", QJsonObject{{"nodes", QJsonArray{node}}, {"edges", QJsonArray{}}}}}));
   const auto rows = propertyFields(node, {{"properties", QJsonArray{declaration}}}, {});
   QCOMPARE(rows.first().toMap()["kind"].toString(), "choice");
   const auto options = rows.first().toMap()["options"].toList();
   QCOMPARE(QJsonValue::fromVariant(options.first().toMap()["value"]), QJsonValue(1));
   const auto commit = [&d](QJsonValue value) { return d.applyCommand({{"op", "setProperty"}, {"id", "n"}, {"name", "mode"}, {"value", value}}); };
   QVERIFY(!commit("1")); QVERIFY(!commit(true)); QCOMPARE(d.undoStack()->count(), 0);
   QVERIFY(commit(1)); QCOMPARE(d.node("n")["data"].toObject()["mode"], QJsonValue(1));
   QVERIFY(commit("two")); QCOMPARE(d.node("n")["data"].toObject()["mode"], QJsonValue("two"));
   d.undo(); QCOMPARE(d.node("n")["data"].toObject()["mode"], QJsonValue(1));
  }
 }
 void scalarUnionsAndStringPresentation() {
  const auto declaration = [](QJsonArray args) { return QJsonObject{{"type", QJsonObject{{"type", "union"}, {"type_args", args}}}}; };
  const QJsonObject none{{"type", "none"}}, str{{"type", "str"}}, integer{{"type", "int"}}, number{{"type", "float"}};
  const auto text = declaration({none, str});
  QCOMPARE(propertyKind(text), "multiline"); QVERIFY(propertyNullable(text));
  QVERIFY(validatePropertyValue(text, QJsonValue::Null).isEmpty()); QVERIFY(validatePropertyValue(text, "prompt").isEmpty());
  QVERIFY(!validatePropertyValue(text, QJsonObject{{"id", "model"}}).isEmpty());
  const auto count = declaration({integer, none}); QCOMPARE(propertyKind(count), "integer");
  QVERIFY(!validatePropertyValue(count, 1.5).isEmpty());
  const auto numeric = declaration({integer, number, none}); QCOMPARE(propertyKind(numeric), "number");
  QVERIFY(validatePropertyValue(numeric, 1.5).isEmpty());
  QCOMPARE(propertyKind(declaration({str, QJsonObject{{"type", "model"}}})), "unsupported");
  QCOMPARE(propertyKind({{"type", str}}), "multiline");
  QCOMPARE(propertyKind({{"type", str}, {"json_schema_extra", QJsonObject{{"multiline", false}}}}), "text");
 }
 void descriptorsAndChoices() {
  const QJsonObject p{{"name", "mode"}, {"type", QJsonObject{{"type", "enum"}, {"values", QJsonArray{1, "1"}}}}, {"title", "Mode"}};
  QVERIFY(validatePropertyValue(p, 1).isEmpty()); QVERIFY(!validatePropertyValue(p, true).isEmpty());
  const auto rows = propertyFields({{"id", "n"}}, {{"properties", QJsonArray{p}}}, {QJsonObject{{"target", "n"}, {"targetHandle", "mode"}}});
  const auto row = rows.first().toMap();
  QVERIFY(row["connected"].toBool()); QVERIFY(!row["editable"].toBool()); QVERIFY(!row["hasValue"].toBool());
  QCOMPARE(row["label"].toString(), "Mode");
  QVERIFY(row["options"].toList().first().toMap()["value"].metaType().id() != QMetaType::QString);
 }
};
QTEST_GUILESS_MAIN(PropertyFieldsTest)
#include "PropertyFieldsTest.moc"
