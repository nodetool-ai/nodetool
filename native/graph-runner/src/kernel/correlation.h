// Static correlation analysis. Port of
// packages/execution-core/src/correlation-analysis.ts, including Loop scopes.
#pragma once

#include "kernel/graph.h"
#include "kernel/json.h"

#include <map>
#include <optional>
#include <set>
#include <string>
#include <utility>
#include <vector>

namespace gr {

using RootSet = std::set<std::string>;

struct InputAnalysis {
  Scope scope;
  bool repeatsPerKey = false;
  bool isMultiEdge = false;
  RootSet possibleChildRoots;
};

struct OutputAnalysis {
  Scope scope;
  bool repeatsPerKey = false;
  RootSet possibleChildRoots;
};

struct NodeAnalysis {
  Scope invocationScope;
  // Insertion-ordered, as the TypeScript Maps are.
  std::vector<std::pair<std::string, InputAnalysis>> inputs;
  std::vector<std::pair<std::string, OutputAnalysis>> outputs;

  const InputAnalysis* input(const std::string& handle) const;
  const OutputAnalysis* output(const std::string& handle) const;
};

struct CorrelationIssue {
  std::optional<std::string> nodeId;
  std::optional<std::string> nodeType;
  std::optional<std::string> handle;
  std::string message;
};

struct CorrelationResult {
  std::map<std::string, NodeAnalysis> nodes;
  std::vector<CorrelationIssue> issues;
};

CorrelationResult analyzeCorrelation(const Graph& graph);

std::string iterationRootId(const std::string& nodeId,
                            const std::string& handle,
                            const std::optional<std::string>& group);

bool isPrefixOf(const Scope& a, const Scope& b);

}  // namespace gr
