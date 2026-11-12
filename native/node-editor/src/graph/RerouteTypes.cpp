#include "RerouteTypes.h"
#include "document/ConnectionTypes.h"
#include <QJsonObject>
#include <QSet>
#include <QVector>
namespace nodetool {
QString displayPortKey(const QString &node,const QString &handle) { return node+QChar(0)+handle; }
namespace {
QString forwardInput(const QString &type,const QString &handle) {
  if (type=="nodetool.control.Reroute" && handle=="output") { return "input_value"; }
  if (type=="nodetool.control.If" && (handle=="if_true" || handle=="if_false")) { return "value"; }
  if (type=="nodetool.control.Switch" && (handle=="matched" || handle=="default")) { return "input"; }
  return {};
}
QString displayType(const QJsonObject &type) {
  // DATA_TYPES values from web/src/config/data_types.ts. Unknown schema types
  // use Any in reroute inference rather than the generic file-reference color.
  static const QSet<QString> known{
    "any","notype","asset","audio","video","sketch","timeline","script","storyboard","entity","keyframe","video_element","shot","game_slot","slot_fill","bool","chunk","cv","dataframe","document","dict","enum","file","float","folder","image","int","list","str","tensor","text","union","language_model","embedding_model","asr_model","rerank_model","bytes","collection","font","image_size","llama_cpp_model","llama_model","message","mistral_model","model_3d_model","none","task","thread","model_ref","image_model","tjs.cached","torch_tensor","tts_model","music_model","audio_to_audio_model","video_model","workflow","datetime","date","object","json","model_3d","np_array"};
  const auto value=type["type"].toString();
  if (value=="cached" || value=="tjs_cached") { return "tjs.cached"; }
  return known.contains(value) ? value : QStringLiteral("any");
}
}
bool forwardDisplayInput(const QString &type,const QString &handle) {
  return (type=="nodetool.control.Reroute" && handle=="input_value")
    || (type=="nodetool.control.If" && handle=="value")
    || (type=="nodetool.control.Switch" && handle=="input");
}
ForwardDisplayTypes resolveForwardDisplayTypes(const QJsonArray &nodes,const QJsonArray &edges,const QJsonArray &catalog) {
  QHash<QString,QJsonObject> definitions,byId,incoming;
  for (const auto &value:catalog) { const auto m=value.toObject();definitions[m["node_type"].toString(m["type"].toString())]=m; }
  QHash<QString,QString> declared,dependencies;
  for (const auto &value:nodes) {
    const auto n=value.toObject();const auto id=n["id"].toString();byId[id]=n;
    const auto type=n["type"].toString();const auto meta=definitions.value(type);
    if (meta.isEmpty()) { continue; }
    for (const auto &value:meta["outputs"].toArray()) {
      const auto p=value.toObject();declared[displayPortKey(id,p["name"].toString())]=displayType(node_editor::normalizedDynamicPortType(p["type"]));
    }
    const auto dynamic=n["dynamic_outputs"].toObject();
    for (auto it=dynamic.begin();it!=dynamic.end();++it) {
      const auto key=displayPortKey(id,it.key());
      if (!declared.contains(key)) { declared[key]=displayType(node_editor::normalizedDynamicPortType(it.value())); }
    }
  }
  for (const auto &value:edges) {
    const auto e=value.toObject();const auto key=displayPortKey(e["target"].toString(),e["targetHandle"].toString());
    if (!incoming.contains(key)) { incoming[key]=e; }
  }
  for (auto it=declared.begin();it!=declared.end();++it) {
    const auto split=it.key().indexOf(QChar(0));const auto id=it.key().left(split),handle=it.key().mid(split+1);
    const auto input=forwardInput(byId.value(id)["type"].toString(),handle);
    if (input.isEmpty()) { continue; }
    const auto edge=incoming.value(displayPortKey(id,input));
    if (!edge.isEmpty()) { dependencies[it.key()]=displayPortKey(edge["source"].toString(),edge["sourceHandle"].toString()); }
  }
  ForwardDisplayTypes result;
  // Iterative path compression resolves shared paths once, including reversed
  // document order. Every key entering a malformed cycle resolves to Any.
  for (auto it=declared.cbegin();it!=declared.cend();++it) {
    if (result.sources.contains(it.key())) { continue; }
    QString current=it.key(),resolved;QVector<QString> path;QSet<QString> visited;
    while (true) {
      if (result.sources.contains(current)) { resolved=result.sources.value(current);break; }
      if (visited.contains(current)) { resolved="any";break; }
      visited.insert(current);path.append(current);
      if (!dependencies.contains(current)) { resolved=declared.value(current,"any");break; }
      current=dependencies.value(current);
    }
    for (const auto &key:path) { result.sources[key]=resolved; }
  }
  for (auto it=byId.cbegin();it!=byId.cend();++it) {
    if (it.value()["type"]!="nodetool.control.Reroute") { continue; }
    const auto edge=incoming.value(displayPortKey(it.key(),"input_value"));
    result.rerouteHandles[it.key()]=declared.value(displayPortKey(edge["source"].toString(),edge["sourceHandle"].toString()),"any");
  }
  return result;
}
}
