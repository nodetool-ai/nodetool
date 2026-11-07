#pragma once
#include "CompatiblePickerFixture.h"
namespace nodetool::body_fixture {
inline QJsonArray catalog() {
  auto result=picker_fixture::catalog(); const auto str=picker_fixture::type("str"),boolean=picker_fixture::type("bool");
  const auto out=QJsonArray{picker_fixture::slot("out",str)};
  const QJsonObject list{{"type","list"},{"type_args",QJsonArray{str}}};
  result.append(QJsonObject{{"node_type","ListFixed"},{"input_fields",QJsonArray{"in"}},
    {"properties",QJsonArray{picker_fixture::slot("in",list)}},{"outputs",QJsonArray{picker_fixture::slot("out",list)}}});
  result.append(QJsonObject{{"node_type","Sink"},{"properties",QJsonArray{picker_fixture::slot("message",str)}},{"outputs",out}});
  // A Sink whose message is a handle, for drags that end on a physical port.
  result.append(QJsonObject{{"node_type","SinkHandle"},{"input_fields",QJsonArray{"message"}},{"properties",QJsonArray{picker_fixture::slot("message",str)}},{"outputs",out}});
  result.append(QJsonObject{{"node_type","Collect"},{"properties",QJsonArray{picker_fixture::slot("message",QJsonObject{{"type","list"},{"type_args",QJsonArray{str}}})}},{"outputs",out}});
  result.append(QJsonObject{{"node_type","DynamicIn"},{"supports_dynamic_inputs",true},{"inline_fields",QJsonArray{"Fixed"}},{"properties",QJsonArray{picker_fixture::slot("Fixed",boolean)}},{"outputs",out}});
  result.append(QJsonObject{{"node_type","DynamicOut"},{"supports_dynamic_outputs",true},{"properties",QJsonArray{}},{"outputs",QJsonArray{picker_fixture::slot("Fixed",str)}}});
  result.append(QJsonObject{{"node_type","Legacy"},{"properties",QJsonArray{}},{"outputs",QJsonArray{}}});
  for (const auto &name:{"fal.dynamic.FalDynamic","fal.DynamicFal","kie.dynamic_schema.KieAI","kie.DynamicKie"}) {
    result.append(QJsonObject{{"node_type",name},{"supports_dynamic_inputs",true},{"properties",QJsonArray{picker_fixture::slot("blocked",boolean)}},{"outputs",out}});
  }
  result.append(QJsonObject{{"node_type","nodetool.workflows.base_node.Preview"},{"properties",QJsonArray{picker_fixture::slot("value",picker_fixture::type("any")),picker_fixture::slot("caption",str)}},{"outputs",QJsonArray{}}});
  result.append(QJsonObject{{"node_type","nodetool.control.Reroute"},{"properties",QJsonArray{picker_fixture::slot("input_value",picker_fixture::type("any")),picker_fixture::slot("other",str)}},{"outputs",QJsonArray{picker_fixture::slot("output",picker_fixture::type("any"))}}});
  result.append(QJsonObject{{"node_type","nodetool.agents.Agent"},{"properties",QJsonArray{}},{"outputs",QJsonArray{picker_fixture::slot("__control__",picker_fixture::type("any"))}}});
  return result;
}
inline QJsonObject node(const QString &id,const QString &type,int x,int y=100) {
  return {{"id",id},{"type",type},{"data",QJsonObject{}},{"ui_properties",QJsonObject{{"position",QJsonObject{{"x",x},{"y",y}}},{"future",42}}}};
}
}
