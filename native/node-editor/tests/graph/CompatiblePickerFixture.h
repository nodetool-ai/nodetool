#pragma once
#include "graph/WorkflowGraphModel.h"
#include <QJsonArray>
#include <QJsonObject>
namespace nodetool::picker_fixture {
inline QJsonObject type(const QString &name) { return {{"type",name}}; }
inline QJsonObject slot(const QString &name,const QJsonObject &value) { return {{"name",name},{"type",value}}; }
inline QJsonArray catalog() {
  const auto text=type("str"),any=type("any"),number=type("float");
  auto prompt=slot("prompt",text); prompt["default"]="hello";
  auto seed=slot("seed",number); seed["default"]=0;
  return {
    QJsonObject{{"node_type","Fixed"},{"title","Fixed"},{"input_fields",QJsonArray{"in"}},
      {"properties",QJsonArray{slot("in",text)}},{"outputs",QJsonArray{slot("out",text)}}},
    QJsonObject{{"node_type","Receiver"},{"title","Receiver"},{"input_fields",QJsonArray{"prompt"}},
      {"inline_fields",QJsonArray{"fallback","other","seed"}},
      {"properties",QJsonArray{slot("fallback",any),slot("other",text),prompt,seed}},{"outputs",QJsonArray{}}},
    QJsonObject{{"node_type","Producer"},{"title","Producer"},{"primary_output","primary"},
      {"properties",QJsonArray{}},{"outputs",QJsonArray{slot("fallback",any),slot("other",text),slot("primary",text)}}},
    QJsonObject{{"node_type","Multi"},{"title","Multi"},{"input_fields",QJsonArray{"left","right"}},
      {"properties",QJsonArray{slot("left",text),slot("right",text)}},{"outputs",QJsonArray{}}},
    QJsonObject{{"node_type","FloatOnly"},{"title","Float only"},{"inline_fields",QJsonArray{"in"}},
      {"properties",QJsonArray{slot("in",number)}},{"outputs",QJsonArray{slot("out",number)}}},
    QJsonObject{{"node_type","ListReceiver"},{"title","List receiver"},{"inline_fields",QJsonArray{"items"}},
      {"properties",QJsonArray{slot("items",QJsonObject{{"type","list"},{"type_args",QJsonArray{text}}})}},{"outputs",QJsonArray{}}}
  };
}
// catalog() plus the nodes that the fixed rows create, and a node with typed numeric and enum inputs.
inline QJsonArray staticCatalog() {
  auto result=catalog();
  const auto any=type("any"),text=type("str"),integer=type("int");
  const auto node=[](const QString &type,const QJsonArray &properties,const QJsonArray &outputs) {
    return QJsonObject{{"node_type",type},{"title",type.section('.',-1)},{"properties",properties},{"outputs",outputs}};
  };
  auto name=slot("name",text); name["default"]="";
  result.append(node("nodetool.workflows.base_node.Preview",{slot("value",any),name},{}));
  result.append(node("nodetool.output.Output",{slot("value",any),name},{}));
  result.append(node("nodetool.control.Reroute",{slot("input_value",any)},{slot("output",any)}));
  result.append(node("nodetool.string.SaveString",{slot("folder",integer),slot("text",text)},{}));
  auto value=slot("value",text); value["default"]="";
  result.append(node("nodetool.constant.String",{value},{slot("output",text)}));
  result.append(node("nodetool.input.StringInput",{value,name},{slot("output",text)}));
  result.append(node("nodetool.text.Prompt",{value},{slot("output",text)}));
  auto number=slot("value",integer); number["default"]=0;
  auto minimum=slot("min",integer); minimum["default"]=0;
  auto maximum=slot("max",integer); maximum["default"]=100;
  result.append(node("nodetool.input.IntegerInput",{number,minimum,maximum,name},{slot("output",integer)}));
  result.append(node("nodetool.constant.Integer",{number},{slot("output",integer)}));
  auto options=slot("options",type("list")); options["default"]=QJsonArray{};
  auto choice=slot("value",text); choice["default"]="";
  auto enumName=slot("enum_type_name",text); enumName["default"]="";
  const QJsonObject mode{{"type","enum"},{"type_name","Mode"},{"values",QJsonArray{"fast","slow"}}};
  result.append(node("nodetool.constant.Select",{choice,options,enumName},{slot("output",mode)}));
  auto count=slot("count",integer); count["min"]=1; count["max"]=9; count["default"]=3;
  auto tuner=node("Tuner",{count,slot("mode",mode)},{});
  tuner["input_fields"]=QJsonArray{"count","mode"};
  result.append(tuner);
  return result;
}
inline QJsonObject workflow() {
  const QJsonObject node{{"id","origin"},{"type","Fixed"},{"data",QJsonObject{{"in","existing"}}},
    {"ui_properties",QJsonObject{{"position",QJsonObject{{"x",100},{"y",100}}}}}};
  return {{"name","Compatible node fixture"},{"graph",QJsonObject{{"nodes",QJsonArray{node}},{"edges",QJsonArray{}}}}};
}
inline QtNodes::NodeId id(const WorkflowGraphModel &model,const QString &resource) {
  for (const auto id:model.allNodeIds()) { if (model.resourceId(id)==resource) { return id; } }
  return QtNodes::InvalidNodeId;
}
}
