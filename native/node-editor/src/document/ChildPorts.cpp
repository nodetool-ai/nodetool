#include "ChildPorts.h"
#include <QHash>
#include <QQueue>
#include <QRegularExpression>
#include <QSet>
namespace nodetool::node_editor {
namespace {
// The Comfy graph helpers of packages/protocol/src/comfy-graph.ts.
bool isComfyNodeType(const QString &type) { return type.startsWith(QStringLiteral("comfy.")); }
bool isComfyBoundaryNodeType(const QString &type) {
  return type.startsWith(QStringLiteral("nodetool.input.")) || type.startsWith(QStringLiteral("nodetool.output."));
}
bool isComfyGraph(const QJsonArray &nodes) {
  static const QSet<QString> editorOnly{
      QStringLiteral("nodetool.workflows.base_node.Comment"), QStringLiteral("nodetool.workflows.base_node.Group"),
      QStringLiteral("nodetool.workflows.base_node.Preview"), QStringLiteral("nodetool.control.Reroute")};
  int comfy = 0;
  for (const auto &value : nodes) {
    const auto type = value.toObject()["type"].toString();
    if (editorOnly.contains(type) || isComfyBoundaryNodeType(type)) { continue; }
    if (!isComfyNodeType(type)) { return false; }
    ++comfy;
  }
  return comfy > 0;
}
QJsonObject comfyNodeValues(const QJsonObject &node) {
  return node["properties"].isObject() ? node["properties"].toObject() : node["data"].toObject();
}
QString comfyPromptField(const QJsonObject &node) {
  const auto values = comfyNodeValues(node);
  if (node["type"].toString().startsWith(QStringLiteral("comfy.PrimitiveString")) && values["value"].isString()) {
    return QStringLiteral("value");
  }
  for (const auto *field : {"text", "prompt", "tags", "caption"}) {
    if (values[QLatin1String(field)].isString()) { return QLatin1String(field); }
  }
  return {};
}
// The node that holds the positive prompt: upstream from the `positive`
// socket, or the only text encoder of a graph without one.
QJsonObject comfyPositivePrompt(const QJsonArray &nodes, const QJsonArray &edges, QString &field) {
  QHash<QString, QJsonObject> byId;
  for (const auto &value : nodes) { byId.insert(value.toObject()["id"].toString(), value.toObject()); }
  QQueue<QString> pending;
  for (const auto &value : edges) {
    const auto edge = value.toObject();
    if (edge["targetHandle"].toString() == QLatin1String("positive")) { pending.enqueue(edge["source"].toString()); }
  }
  QSet<QString> seen;
  while (!pending.isEmpty()) {
    const auto id = pending.dequeue();
    if (seen.contains(id)) { continue; }
    seen.insert(id);
    if (!byId.contains(id)) { continue; }
    const auto node = byId.value(id);
    field = comfyPromptField(node);
    if (!field.isEmpty()) { return node; }
    for (const auto &value : edges) {
      const auto edge = value.toObject();
      if (edge["target"].toString() == id) { pending.enqueue(edge["source"].toString()); }
    }
  }
  QJsonObject only;
  int encoders = 0;
  for (const auto &value : nodes) {
    const auto node = value.toObject();
    const auto type = node["type"].toString();
    if (isComfyNodeType(type) && type.contains(QStringLiteral("TextEncode")) && !comfyPromptField(node).isEmpty()) {
      only = node;
      ++encoders;
    }
  }
  field = encoders == 1 ? comfyPromptField(only) : QString();
  return encoders == 1 ? only : QJsonObject{};
}
QString comfySaveKind(const QString &classType) {
  static const QRegularExpression save(QStringLiteral("^(Save|VHS_VideoCombine)"));
  static const QRegularExpression image(QStringLiteral("Image|WEBP|PNG"));
  if (!save.match(classType).hasMatch()) { return {}; }
  if (classType.contains(QStringLiteral("Video"))) { return QStringLiteral("video"); }
  if (classType.contains(QStringLiteral("Audio"))) { return QStringLiteral("audio"); }
  return image.match(classType).hasMatch() ? QStringLiteral("image") : QString();
}
QJsonObject comfyNodePosition(const QJsonObject &node) {
  const auto position = node["ui_properties"].toObject()["position"].toObject();
  return position["x"].isDouble() && position["y"].isDouble() ? position : QJsonObject{{"x", 0}, {"y", 0}};
}
} // namespace

QJsonObject exposeComfyInterface(const QJsonObject &graph) {
  const auto nodes = graph["nodes"].toArray();
  if (!isComfyGraph(nodes)) { return graph; }
  for (const auto &value : nodes) {
    if (isComfyBoundaryNodeType(value.toObject()["type"].toString())) { return graph; }
  }
  const auto edges = graph["edges"].toArray();
  QJsonArray added, addedEdges;
  QHash<QString, int> counts;
  const auto uniqueName = [&counts](const QString &base) {
    const auto count = ++counts[base];
    return count == 1 ? base : QStringLiteral("%1_%2").arg(base).arg(count);
  };
  const auto boundary = [](const QString &id, const QString &type, const QJsonObject &values, const QJsonObject &target,
                           double dx) {
    const auto position = comfyNodePosition(target);
    return QJsonObject{{"id", id},
                       {"type", type},
                       {"data", values},
                       {"properties", values},
                       {"ui_properties", QJsonObject{{"position", QJsonObject{{"x", position["x"].toDouble() + dx},
                                                                              {"y", position["y"].toDouble()}}},
                                                     {"width", 280}}},
                       {"dynamic_properties", QJsonObject{}},
                       {"dynamic_outputs", QJsonObject{}}};
  };
  const auto addInput = [&](const QJsonObject &target, const QString &field, const QString &type, const QString &name,
                            const QJsonValue &value) {
    const auto targetId = target["id"].toString();
    const auto id = QStringLiteral("input_%1_%2").arg(targetId, field);
    added.append(boundary(id, type, QJsonObject{{"name", name}, {"description", ""}, {"value", value}}, target, -340));
    addedEdges.append(QJsonObject{{"id", QStringLiteral("%1-%2").arg(id, targetId)}, {"source", id}, {"sourceHandle", "output"},
                                  {"target", targetId}, {"targetHandle", field}, {"ui_properties", QJsonValue::Null}});
  };
  QString promptField;
  const auto prompt = comfyPositivePrompt(nodes, edges, promptField);
  if (!prompt.isEmpty()) {
    addInput(prompt, promptField, QStringLiteral("nodetool.input.StringInput"), uniqueName(QStringLiteral("prompt")),
             comfyNodeValues(prompt)[promptField]);
  }
  struct Load {
    const char *kind;
    const char *type;
    const char *field;
  };
  static const QHash<QString, Load> loads{{QStringLiteral("LoadImage"), {"image", "nodetool.input.ImageInput", "image"}},
                                          {QStringLiteral("LoadAudio"), {"audio", "nodetool.input.AudioInput", "audio"}},
                                          {QStringLiteral("LoadVideo"), {"video", "nodetool.input.VideoInput", "file"}}};
  QJsonArray out;
  for (const auto &value : nodes) {
    auto node = value.toObject();
    const auto type = node["type"].toString();
    if (!isComfyNodeType(type)) {
      out.append(node);
      continue;
    }
    const auto classType = type.mid(int(qstrlen("comfy.")));
    if (loads.contains(classType)) {
      const auto load = loads.value(classType);
      const auto kind = QLatin1String(load.kind);
      addInput(node, QLatin1String(load.field), QLatin1String(load.type), uniqueName(kind),
               QJsonObject{{"type", kind}, {"uri", ""}});
      out.append(node);
      continue;
    }
    const auto kind = comfySaveKind(classType);
    if (kind.isEmpty()) {
      out.append(node);
      continue;
    }
    const auto nodeId = node["id"].toString();
    const auto id = QStringLiteral("output_%1").arg(nodeId);
    added.append(boundary(id, QStringLiteral("nodetool.output.Output"),
                          QJsonObject{{"name", uniqueName(QStringLiteral("output"))}, {"description", ""}}, node, 340));
    addedEdges.append(QJsonObject{{"id", QStringLiteral("%1-%2").arg(nodeId, id)}, {"source", nodeId}, {"sourceHandle", "output"},
                                  {"target", id}, {"targetHandle", "value"}, {"ui_properties", QJsonValue::Null}});
    auto dynamicOutputs = node["dynamic_outputs"].toObject();
    dynamicOutputs["output"] = QJsonObject{{"type", kind}, {"optional", true}, {"type_args", QJsonArray{}}};
    node["dynamic_outputs"] = dynamicOutputs;
    out.append(node);
  }
  for (const auto &value : added) { out.append(value); }
  auto allEdges = edges;
  for (const auto &value : addedEdges) { allEdges.append(value); }
  auto result = graph;
  result["nodes"] = out;
  result["edges"] = allEdges;
  return result;
}

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
  auto graph = childGraph(n);
  QJsonArray nodes = graph["nodes"].toArray();
  if (childGraphKey(n) == "workflow_json" && graph["nodes"].isObject()) {
    const auto object = graph["nodes"].toObject();
    for (auto it = object.begin(); it != object.end(); ++it) {
      nodes.append(it.value());
    }
  }
  // A stored Comfy graph has no Input or Output nodes. extractDynamicIO
  // derives its ports the way the server runs it.
  graph["nodes"] = nodes;
  graph = exposeComfyInterface(graph);
  nodes = graph["nodes"].toArray();
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
