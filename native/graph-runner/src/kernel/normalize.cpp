#include "kernel/normalize.h"

#include "kernel/actor.h"
#include "kernel/graph.h"

#include <set>
#include <vector>

namespace gr {
namespace {

const char* kLog = "nodetool.kernel.normalize";

// `{...target, ...source}` for JSON objects: later keys overwrite in place.
void assignInto(Json& target, const Json& source) {
  if (!source.is_object()) return;
  for (const auto& [k, v] : source.items()) target[k] = v;
}

const Json* member(const Json& obj, const char* key) {
  if (!obj.is_object()) return nullptr;
  auto it = obj.find(key);
  return it == obj.end() ? nullptr : &*it;
}

// The JavaScript `a ?? b` for a JSON member: null and absent both fall through.
const Json* defined(const Json& obj, const char* key) {
  const Json* v = member(obj, key);
  return v && !v->is_null() ? v : nullptr;
}

bool isNonEmptyString(const Json* v) {
  return v && v->is_string() && !v->get<std::string>().empty();
}

bool isString(const Json* v) { return v && v->is_string(); }

// execution-core dynamic-slots.ts typeToString.
std::optional<std::string> typeToString(const Json& type) {
  if (type.is_string()) {
    std::string s = type.get<std::string>();
    if (s.empty()) return std::nullopt;
    return s;
  }
  if (!type.is_object()) return std::nullopt;
  const Json* base = member(type, "type");
  if (!isNonEmptyString(base)) return std::nullopt;
  const Json* raw = member(type, "type_args");
  if (!raw || !raw->is_array()) raw = member(type, "args");
  std::vector<std::string> args;
  if (raw && raw->is_array()) {
    for (const auto& a : *raw) {
      if (auto s = typeToString(a)) args.push_back(*s);
    }
  }
  std::string out = base->get<std::string>();
  if (args.empty()) return out;
  out += "[";
  for (size_t i = 0; i < args.size(); ++i) out += (i ? ", " : "") + args[i];
  return out + "]";
}

// execution-core dynamic-slots.ts dynamicSlotPropertyTypes.
Json slotPropertyTypes(const Json* slots) {
  Json out = Json::object();
  if (!slots || !slots->is_object()) return out;
  for (const auto& [name, meta] : slots->items()) {
    const Json* type = member(meta, "type");
    if (!type) continue;
    if (auto s = typeToString(*type)) out[name] = *s;
  }
  return out;
}

bool nonEmptyObject(const Json* v) { return v && v->is_object() && !v->empty(); }

// Graph.fromDict for one node: nullopt when the node is dropped.
std::optional<Json> fromDictNode(const Json& raw) {
  if (!raw.is_object()) return std::nullopt;
  if (!isNonEmptyString(member(raw, "id")) || !isNonEmptyString(member(raw, "type"))) {
    return std::nullopt;
  }
  Json node = raw;
  const Json* props = member(raw, "properties");
  const Json* data = member(raw, "data");
  Json properties = props && props->is_object()   ? *props
                    : data && data->is_object() ? *data
                                                : Json::object();
  assignInto(properties, raw.value("dynamic_properties", Json()));

  Json slots = slotPropertyTypes(member(raw, "dynamic_inputs"));
  if (!slots.empty() && nonEmptyObject(member(raw, "propertyTypes"))) {
    assignInto(slots, raw["propertyTypes"]);
    node["propertyTypes"] = slots;
  }
  node["properties"] = std::move(properties);
  node.erase("data");
  return node;
}

// Graph.loadFromDict for one node with its registry entry.
Json hydrateNode(const Json& node, const Json& resolved) {
  const Json defaults = resolved.value("descriptorDefaults", Json::object());
  Json out = Json::object();
  assignInto(out, defaults);
  assignInto(out, node);
  if (isNonEmptyString(member(resolved, "nodeType"))) out["type"] = resolved["nodeType"];

  const Json registryTypes = resolved.value("propertyTypes", Json::object());
  Json propertyTypes = Json::object();
  assignInto(propertyTypes, registryTypes);
  const Json slots = slotPropertyTypes(member(node, "dynamic_inputs"));
  for (const auto& [name, t] : slots.items()) {
    if (!registryTypes.is_object() || !registryTypes.contains(name)) propertyTypes[name] = t;
  }
  assignInto(propertyTypes, node.value("propertyTypes", Json()));
  out["propertyTypes"] = std::move(propertyTypes);

  Json outputs = Json::object();
  assignInto(outputs, resolved.value("outputs", Json()));
  assignInto(outputs, slotPropertyTypes(member(node,"dynamic_outputs")));
  assignInto(outputs, node.value("outputs", Json()));
  out["outputs"] = std::move(outputs);

  // Registry flags win when the registry states them; saved ones apply
  // otherwise. Correlation metadata and retry safety come only from the
  // registry.
  for (const char* flag : {"is_streaming_input", "is_streaming_output", "is_controlled",
                           "is_join_node", "is_trigger"}) {
    const Json* v = defined(defaults, flag);
    if (!v) v = defined(node, flag);
    out[flag] = v ? *v : Json(false);
  }
  for (const char* key : {"input_mode", "output_correlation"}) {
    const Json* v = defined(defaults, key);
    if (v) {
      out[key] = *v;
    } else {
      out.erase(key);
    }
  }
  const Json* retrySafe = defined(defaults, "retry_safe");
  out["retry_safe"] = retrySafe ? *retrySafe : Json(false);
  return out;
}

}  // namespace

bool isEditorOnlyType(const std::string& type) {
  if (type.find(".workflows.base_node.") == std::string::npos) return false;
  const std::string name = type.substr(type.rfind('.') + 1);
  return name == "Comment" || name == "Group" || name == "Reroute";
}

Json normalizeGraph(const Json& graph, const TypeResolver& resolve) {
  if (!graph.is_object()) throw GraphValidationError("Graph data must be an object");
  if (!graph.contains("nodes") || !graph.contains("edges")) {
    throw GraphValidationError("Graph data must have 'nodes' and 'edges' fields");
  }
  if (!graph["nodes"].is_array()) throw GraphValidationError("'nodes' must be an array");
  if (!graph["edges"].is_array()) throw GraphValidationError("'edges' must be an array");

  Json nodes = Json::array();
  std::set<std::string> ids;
  for (const auto& raw : graph["nodes"]) {
    auto node = fromDictNode(raw);
    if (!node) continue;
    const std::string type = (*node)["type"].get<std::string>();
    if (isEditorOnlyType(type)) continue;
    auto resolved = resolve(type);
    if (!resolved) {
      logLine("WARN", kLog,
              "Dropping node \"" + (*node)["id"].get<std::string>() +
                  "\" of unknown type " + type);
      continue;
    }
    Json hydrated = hydrateNode(*node, *resolved);
    ids.insert(hydrated["id"].get<std::string>());
    nodes.push_back(std::move(hydrated));
  }

  Json edges = Json::array();
  for (const auto& raw : graph["edges"]) {
    if (!raw.is_object()) continue;
    Json edge = raw;
    const Json* rawType = defined(raw, "edge_type");
    if (!rawType) rawType = member(raw, "type");
    const bool control = rawType && rawType->is_string() && *rawType == "control";
    edge.erase("type");
    edge["edge_type"] = control ? "control" : "data";
    if (!isString(member(edge, "source")) || !isString(member(edge, "sourceHandle")) ||
        !isString(member(edge, "target")) || !isString(member(edge, "targetHandle"))) {
      continue;
    }
    if (!ids.count(edge["source"].get<std::string>()) ||
        !ids.count(edge["target"].get<std::string>())) {
      continue;
    }
    edges.push_back(std::move(edge));
  }
  return Json{{"nodes", std::move(nodes)}, {"edges", std::move(edges)}};
}

}  // namespace gr
