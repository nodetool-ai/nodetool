#include "properties/CodeInference.h"
#include "BodyConnectionRules.h"
#include "WorkflowGraphModel.h"
#include "document/ConnectionTypes.h"
#include <QSet>
#include <QUuid>
namespace nodetool {
namespace {
QJsonObject typeOf(const QJsonObject &port) {
  const auto type=port["type"];
  return type.isObject() ? type.toObject() : type.isString() ? QJsonObject{{"type",type}} : QJsonObject{};
}
QJsonObject findType(const QVector<BodyPort> &ports,const QString &name) {
  for (const auto &port:ports) { if (port.name==name) { return port.type; } }
  return {};
}
}
QVector<BodyPort> bodyPorts(const QJsonObject &rawNode,const QJsonObject &metadata,bool output) {
  const auto node = node_editor::withVisibleCodePorts(rawNode);
  QVector<BodyPort> ports;
  QSet<QString> names;
  const auto append=[&](const QString &name,const QJsonObject &type) {
    if (name.isEmpty() || names.contains(name)) { return; }
    names.insert(name); ports.append({name,type});
  };
  for (const auto &value:metadata[output ? "outputs":"properties"].toArray()) {
    const auto port=value.toObject(); append(port["name"].toString(),typeOf(port));
  }
  const auto declarations=node[output ? "dynamic_outputs":"dynamic_inputs"].toObject();
  for (auto it=declarations.begin();it!=declarations.end();++it) {
    append(it.key(),node_editor::normalizedDynamicPortType(it.value()));
  }
  if (!output) {
    const auto values=node["dynamic_properties"].toObject(),outputs=node["dynamic_outputs"].toObject();
    for (auto it=values.begin();it!=values.end();++it) {
      if (node["type"] == "nodetool.code.Code" || !outputs.contains(it.key()) || declarations.contains(it.key())) { append(it.key(),QJsonObject{{"type","any"}}); }
    }
  }
  return ports;
}
bool schemaOnlyInputs(const QString &type) {
  return type=="fal.dynamic.FalDynamic" || type=="fal.DynamicFal" || type=="kie.dynamic_schema.KieAI" || type=="kie.DynamicKie";
}
QString dynamicBodyPortName(const QJsonObject &origin,const QJsonObject &body,
    const QJsonObject &metadata,bool output) {
  auto base=output ? QString{} : origin["ui_properties"].toObject()["title"].toString();
  if (base.isEmpty()) { base=origin["type"].toString().section('.',-1); }
  if (base.isEmpty()) { base="input"; }
  QSet<QString> taken;
  for (const auto &port:bodyPorts(body,metadata,output)) { taken.insert(port.name); }
  if (!output) {
    const auto values=body["dynamic_properties"].toObject();
    for (auto it=values.begin();it!=values.end();++it) { taken.insert(it.key()); }
  }
  auto name=base;
  for (int suffix=1;taken.contains(name);++suffix) { name=base+"_"+QString::number(suffix); }
  return name;
}
QJsonObject bodyConnectionCommand(const WorkflowGraphModel &model,
    QtNodes::NodeId source,const QString &sourceHandle,
    QtNodes::NodeId target,const QString &targetHandle,
    QJsonArray prefix,const QJsonObject &sourceTypeOverride,bool newDynamicInput) {
  const auto from=model.nodeSnapshot(source),to=model.nodeSnapshot(target);
  const auto fromId=model.resourceId(source),toId=model.resourceId(target);
  const auto metadata=model.metadata(target);
  const bool control=sourceHandle=="__control__" || targetHandle=="__control__";
  const auto sh=control ? QString("__control__"):sourceHandle,th=control ? QString("__control__"):targetHandle;
  const auto output=sourceTypeOverride.isEmpty() ? findType(bodyPorts(from,model.metadata(source),true),sh):sourceTypeOverride;
  const auto input=findType(bodyPorts(to,metadata,false),th);
  const auto args=input["type_args"].toArray();
  const bool collect=!control && input["type"]=="list" && args.size()==1 && args[0].toObject()["type"]!="any";
  if (!collect) {
    for (const auto &value:model.edgeSnapshot()) {
      const auto edge=value.toObject();
      if (edge["target"].toString()==toId && edge["targetHandle"].toString()==th) {
        prefix.append(QJsonObject{{"op","removeEdge"},{"id",edge["id"]}});
      }
    }
  }
  const auto values=to["dynamic_properties"].toObject();
  const bool dynamic=values.contains(th) || newDynamicInput;
  if (!control && dynamic && !newDynamicInput && output["type"]!="any" && !output["type"].toString().isEmpty()) {
    auto declarations=to["dynamic_inputs"].toObject();
    const auto type=node_editor::normalizedDynamicPortType(declarations[th]);
    if (type.isEmpty() || type["type"]=="any") {
      declarations[th]=QJsonObject{{"type",output}};
      prefix.append(QJsonObject{{"op","setNodeField"},{"id",toId},{"field","dynamic_inputs"},{"value",declarations}});
    }
  }
  if (!control && !dynamic && !metadata["input_fields"].toArray().contains(th) && !metadata["inline_fields"].toArray().contains(th)) {
    auto ui=to["ui_properties"].toObject(); auto exposed=ui["exposed_inputs"].toArray();
    if (!exposed.contains(th)) {
      exposed.append(th); ui["exposed_inputs"]=exposed;
      prefix.append(QJsonObject{{"op","setNodeField"},{"id",toId},{"field","ui_properties"},{"value",ui}});
    }
  }
  QJsonObject edge{{"id",QUuid::createUuid().toString(QUuid::Id128)},
    {"source",fromId},{"target",toId},{"sourceHandle",sh},{"targetHandle",th}};
  if (control) { edge["edge_type"]="control"; }
  prefix.append(QJsonObject{{"op","addEdge"},{"edge",edge}});
  return {{"op","batch"},{"commands",prefix}};
}
}
