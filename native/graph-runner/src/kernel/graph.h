// Graph model. Port of the parts of packages/execution-core/src/graph.ts and
// node-sdk's hydrateGraphNodeFlags that the A1 runner needs.
#pragma once

#include "kernel/json.h"

#include <map>
#include <optional>
#include <stdexcept>
#include <string>
#include <utility>
#include <vector>

namespace gr {

struct OutputCorrelation {
  std::string kind;  // single | forward | chunk | iteration | aggregate
  std::optional<std::string> source;
  std::optional<std::string> group;
  std::optional<std::string> collapse;
};

struct Node {
  std::string id;
  std::string type;
  std::optional<std::string> name;
  Json raw;                // the descriptor as the graph file gave it
  Json properties;         // object, or null when absent
  Json dynamicProperties;  // object, or null when absent
  Json outputs;            // declared outputs from the graph file, or null
  Json propertyTypes;      // from the graph file, or null

  // Hydrated flags (hydrateGraphNodeFlags).
  bool isStreamingInput = false;
  bool isStreamingOutput = false;
  bool isControlled = false;
  bool isJoinNode = false;
  bool isTrigger = false;
  bool retrySafe = false;
  bool alwaysEmitOutputUpdates = false;
  std::optional<std::string> inputMode;
  std::vector<std::pair<std::string, OutputCorrelation>> outputCorrelation;
  bool hasOutputCorrelation = false;
  std::vector<std::string> appendStaticInputs;

  const OutputCorrelation* correlationFor(const std::string& handle) const;
  // The `node.name ?? node.type` label used on node_update messages.
  std::string label() const { return name.value_or(type); }
};

struct Edge {
  std::optional<std::string> id;
  std::string source;
  std::string sourceHandle;
  std::string target;
  std::string targetHandle;
  bool control = false;

  bool isData() const { return !control; }
  // `edge.id ?? syntheticEdgeId(...)`, also the correlation edge key.
  std::string key() const {
    return id ? *id
              : source + ":" + sourceHandle + "->" + target + ":" + targetHandle;
  }
};

struct ValidationIssue {
  std::optional<std::string> nodeId;
  std::optional<std::string> nodeType;
  std::string property;
  std::string message;
};

class GraphValidationError : public std::runtime_error {
public:
  GraphValidationError(const std::string& message,
                       std::vector<ValidationIssue> issues = {})
      : std::runtime_error(message), issues(std::move(issues)) {}
  std::vector<ValidationIssue> issues;
};

class Graph {
public:
  Graph() = default;
  Graph(std::vector<Node> nodes, std::vector<Edge> edges);

  const std::vector<Node>& nodes() const { return nodes_; }
  const std::vector<Edge>& edges() const { return edges_; }
  const Node* findNode(const std::string& id) const;
  std::vector<const Edge*> incoming(const std::string& nodeId) const;
  std::vector<const Edge*> incomingData(const std::string& nodeId) const;
  std::vector<const Edge*> outgoing(const std::string& nodeId) const;
  std::vector<const Edge*> edgesFrom(const std::string& nodeId,
                                     const std::string& handle) const;

private:
  std::vector<Node> nodes_;
  std::vector<Edge> edges_;
  std::map<std::string, size_t> index_;
};

// Parses `{nodes, edges}` from a graph file. Throws GraphValidationError on a
// malformed document.
std::pair<std::vector<Node>, std::vector<Edge>> parseGraph(const Json& doc);

// `TypeMetadata.fromString(t).isListType()`.
bool isListTypeString(const std::string& typeString);

}  // namespace gr
