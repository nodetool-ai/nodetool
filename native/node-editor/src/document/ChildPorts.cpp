#include "ChildPorts.h"
#include <QHash>
#include <QQueue>
#include <QSet>
namespace nodetool::node_editor {
QString childGraphKey(const QJsonObject &n) {
  const auto type = n["type"].toString();
  if (type == "nodetool.workflows.subgraph.Subgraph") {
    return "graph";
  }
  if (type == "nodetool.workflows.workflow_node.Workflow") {
    return "workflow_json";
  }
  if (type == "nodetool.workflows.app_node.App") {
    return "app_json";
  }
  return {};
}
bool isChildNode(const QJsonObject &n) { return !childGraphKey(n).isEmpty(); }
QJsonObject childGraph(const QJsonObject &n) {
  auto data = n["data"].toObject();
  if (data["properties"].isObject()) {
    data = data["properties"].toObject();
  }
  const auto key = childGraphKey(n);
  return key == "graph" ? data[key].toObject()
                        : data[key].toObject()["graph"].toObject();
}
QJsonObject withChildPorts(const QJsonObject &raw, const QJsonArray &metadata) {
  if (!isChildNode(raw)) {
    return raw;
  }
  auto n = raw;
  const bool app = childGraphKey(n) == "app_json";
  QJsonObject inputs, outputs, values;
  const QHash<QString, QString> types{{"String", "str"},   {"Text", "str"},
                                      {"Integer", "int"},  {"Float", "float"},
                                      {"Boolean", "bool"}, {"Image", "image"},
                                      {"Audio", "audio"},  {"Video", "video"}};
  const auto graph = childGraph(n);
  QJsonArray nodes = graph["nodes"].toArray();
  if (childGraphKey(n) == "workflow_json" && graph["nodes"].isObject()) {
    const auto object = graph["nodes"].toObject();
    for (auto it = object.begin(); it != object.end(); ++it) {
      nodes.append(it.value());
    }
  }
  const auto data = n["data"].toObject();
  auto snapshot = data["app_json"].toObject();
  const auto bindings = snapshot["input_bindings"].toObject();
  auto constants =
      bindings.isEmpty() ? snapshot["constants"].toObject() : QJsonObject{};
  QHash<QString, QJsonObject> byId, byType;
  for (const auto &v : nodes) {
    byId.insert(v.toObject()["id"].toString(), v.toObject());
  }
  for (const auto &v : metadata) {
    byType.insert(v.toObject()["node_type"].toString(), v.toObject());
  }
  QHash<QString, QStringList> downstream;
  QSet<QString> streaming;
  QQueue<QString> pending;
  for (const auto &v : graph["edges"].toArray()) {
    const auto e = v.toObject();
    if (e["type"] == "control" || e["edge_type"] == "control") {
      continue;
    }
    const auto source = byId.value(e["source"].toString());
    const auto handle = e["sourceHandle"].toString();
    auto correlation =
        byType.value(source["type"].toString())["output_correlation"]
            .toObject()[handle]
            .toObject();
    if (correlation.isEmpty()) {
      correlation =
          source["dynamic_output_correlation"].toObject()[handle].toObject();
    }
    const auto kind = correlation["kind"].toString();
    const auto target = e["target"].toString();
    if (kind == "iteration" || kind == "chunk") {
      if (!streaming.contains(target)) {
        streaming.insert(target);
        pending.enqueue(target);
      }
    } else if (kind != "aggregate") {
      downstream[e["source"].toString()].append(target);
    }
  }
  while (!pending.isEmpty()) {
    for (const auto &target : downstream.value(pending.dequeue())) {
      if (!streaming.contains(target)) {
        streaming.insert(target);
        pending.enqueue(target);
      }
    }
  }
  QJsonObject outputCorrelation;
  for (const auto &v : nodes) {
    const auto node = v.toObject();
    const auto type = node["type"].toString();
    const bool input = type.startsWith("nodetool.input.");
    const bool output = type.startsWith("nodetool.output.");
    if (!input && !output) {
      continue;
    }
    const auto d = node["data"].toObject();
    const auto p = d["properties"].isObject() ? d["properties"].toObject() : d;
    const auto suffix = type.section('.', -1);
    auto name = p["name"].toString(d["title"].toString(suffix));
    const auto mapped = types.value(suffix.chopped(input ? 5 : 6));
    if (app) {
      name = name.trimmed();
      if (name.isEmpty()) {
        name = d["title"].toString().trimmed();
        if (name.isEmpty()) { name = suffix; }
      }
    }
    if (input && (name.isEmpty() ||
                  (!app && mapped.isEmpty() && !p["name"].isString()))) {
      continue;
    }
    if (output && !app && mapped.isEmpty() && suffix != "Output") {
      continue;
    }
    const auto binding = bindings[node["id"].toString()].toObject();
    if (input && app && binding["from"] == "constant") {
      constants[name] = binding["value"];
      continue;
    }
    if (input && app && constants.contains(name)) {
      continue;
    }
    QJsonObject port{{"type", mapped.isEmpty() ? "any" : mapped},
                     {"optional", input},
                     {"type_args", QJsonArray{}}};
    if (input) {
      if (!app) {
        port["values"] = QJsonValue::Null;
        port["type_name"] = QJsonValue::Null;
      }
      for (const auto &m : metadata) {
        const auto meta = m.toObject();
        if (meta["node_type"] == type && !meta["outputs"].toArray().isEmpty()) {
          port =
              meta["outputs"].toArray().first().toObject()["type"].toObject();
          port["optional"] = true;
          break;
        }
      }
      inputs[name] = QJsonObject{{"type", port},
                                 {"description", p["description"].toString()}};
      const auto previous = n["dynamic_properties"].toObject();
      QJsonValue seed = p["value"];
      if (app && binding["from"] == "variable") {
        for (const auto &v : snapshot["variables"].toArray()) {
          const auto variable = v.toObject();
          if (variable["id"] == binding["variableId"] &&
              !variable["default"].isUndefined() && !variable["default"].isNull()) {
            seed = variable["default"];
          }
        }
      }
      values[name] =
          previous.contains(name) && childGraphKey(n) != "workflow_json"
              ? previous[name]
          : !seed.isUndefined() && !seed.isNull()
              ? seed
              : (app ? QJsonValue(QJsonValue::Null) : QJsonValue(""));
    } else {
      outputs[name] = port;
      if (app && streaming.contains(node["id"].toString())) {
        outputCorrelation[name] =
            QJsonObject{{"kind", "chunk"}, {"source", "__execution__"}};
      }
    }
  }
  if (app) {
    snapshot["constants"] = constants;
    auto d = n["data"].toObject();
    d["app_json"] = snapshot;
    n["data"] = d;
    n["dynamic_output_correlation"] = outputCorrelation;
  }
  n["dynamic_inputs"] = inputs;
  n["dynamic_outputs"] = outputs;
  n["dynamic_properties"] = values;
  return n;
}
void removeStaleChildEdges(const QJsonObject &old, const QJsonObject &next,
                           QJsonArray &edges) {
  // AppLoader uses updateNodeData rather than replaceDynamicSlots. Its saved
  // incident edges remain available as fallback handles on the next projection.
  if (childGraphKey(old) == "app_json") {
    return;
  }
  const auto previousInputs = old["dynamic_inputs"].toObject();
  const auto previousValues = old["dynamic_properties"].toObject();
  const auto previousOutputs = old["dynamic_outputs"].toObject();
  QJsonArray kept;
  for (const auto &v : edges) {
    const auto e = v.toObject();
    const auto in = e["targetHandle"].toString(),
               out = e["sourceHandle"].toString();
    if (e["target"] == old["id"] &&
        (previousInputs.contains(in) || previousValues.contains(in)) &&
        !next["dynamic_inputs"].toObject().contains(in)) {
      continue;
    }
    if (e["source"] == old["id"] && previousOutputs.contains(out) &&
        !next["dynamic_outputs"].toObject().contains(out)) {
      continue;
    }
    kept.append(v);
  }
  edges = kept;
}
} // namespace nodetool::node_editor
