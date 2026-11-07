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
