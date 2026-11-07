#include "kernel/graph.h"

namespace gr {

const OutputCorrelation* Node::correlationFor(const std::string& handle) const {
  for (const auto& [h, c] : outputCorrelation) {
    if (h == handle) return &c;
  }
  return nullptr;
}

Graph::Graph(std::vector<Node> nodes, std::vector<Edge> edges)
    : nodes_(std::move(nodes)), edges_(std::move(edges)) {
  for (size_t i = 0; i < nodes_.size(); ++i) index_.emplace(nodes_[i].id, i);
}

const Node* Graph::findNode(const std::string& id) const {
  auto it = index_.find(id);
  return it == index_.end() ? nullptr : &nodes_[it->second];
}

std::vector<const Edge*> Graph::incoming(const std::string& nodeId) const {
  std::vector<const Edge*> out;
  for (const auto& e : edges_) {
    if (e.target == nodeId) out.push_back(&e);
  }
  return out;
}

std::vector<const Edge*> Graph::incomingData(const std::string& nodeId) const {
  std::vector<const Edge*> out;
  for (const auto& e : edges_) {
    if (e.target == nodeId && e.isData()) out.push_back(&e);
  }
  return out;
}

std::vector<const Edge*> Graph::outgoing(const std::string& nodeId) const {
  std::vector<const Edge*> out;
  for (const auto& e : edges_) {
    if (e.source == nodeId) out.push_back(&e);
  }
  return out;
}

std::vector<const Edge*> Graph::edgesFrom(const std::string& nodeId,
                                          const std::string& handle) const {
  std::vector<const Edge*> out;
  for (const auto& e : edges_) {
    if (e.source == nodeId && e.sourceHandle == handle) out.push_back(&e);
  }
  return out;
}

namespace {

std::optional<std::string> optString(const Json& obj, const char* key) {
  if (!obj.is_object()) return std::nullopt;
  auto it = obj.find(key);
  if (it == obj.end() || !it->is_string()) return std::nullopt;
  return it->get<std::string>();
}

Json optObject(const Json& obj, const char* key) {
  if (!obj.is_object()) return nullptr;
  auto it = obj.find(key);
  if (it == obj.end() || !it->is_object()) return nullptr;
  return *it;
}

}  // namespace

std::pair<std::vector<Node>, std::vector<Edge>> parseGraph(const Json& doc) {
  if (!doc.is_object() || !doc.contains("nodes") || !doc.contains("edges")) {
    throw GraphValidationError(
        "Graph data must have 'nodes' and 'edges' fields");
  }
  if (!doc["nodes"].is_array()) {
    throw GraphValidationError("'nodes' must be an array");
  }
  if (!doc["edges"].is_array()) {
    throw GraphValidationError("'edges' must be an array");
  }
  std::vector<Node> nodes;
  for (const auto& n : doc["nodes"]) {
    Node node;
    auto id = optString(n, "id");
    auto type = optString(n, "type");
    if (!id || !type) {
      throw GraphValidationError(
          "Each node must have string 'id' and 'type' fields");
    }
    node.id = *id;
    node.type = *type;
    node.name = optString(n, "name");
    node.raw = n;
    node.properties = optObject(n, "properties");
    node.dynamicProperties = optObject(n, "dynamic_properties");
    node.outputs = optObject(n, "outputs");
    node.propertyTypes = optObject(n, "propertyTypes");
    nodes.push_back(std::move(node));
  }
  std::vector<Edge> edges;
  for (const auto& e : doc["edges"]) {
    Edge edge;
    edge.id = optString(e, "id");
    edge.source = optString(e, "source").value_or("");
    edge.sourceHandle = optString(e, "sourceHandle").value_or("");
    edge.target = optString(e, "target").value_or("");
    edge.targetHandle = optString(e, "targetHandle").value_or("");
    edge.control = optString(e, "edge_type").value_or("") == "control";
    edges.push_back(std::move(edge));
  }
  return {std::move(nodes), std::move(edges)};
}

bool isListTypeString(const std::string& typeString) {
  auto begin = typeString.find_first_not_of(" \t\n\r");
  if (begin == std::string::npos) return false;
  auto end = typeString.find_last_not_of(" \t\n\r");
  std::string s = typeString.substr(begin, end - begin + 1);
  auto bracket = s.find('[');
  if (bracket == std::string::npos || s.back() != ']') return s == "list";
  return s.substr(0, bracket) == "list";
}

}  // namespace gr
