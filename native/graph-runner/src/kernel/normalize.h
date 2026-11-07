// Prepares a client graph for the runner the way the TypeScript server
// prepares a run_job_request graph: JobExecution.normalizeGraph in
// packages/websocket, then Graph.fromDict and Graph.loadFromDict in
// packages/execution-core with the registry's graph node type resolver.
#pragma once

#include "kernel/json.h"

#include <functional>
#include <optional>
#include <string>

namespace gr {

// The registry entry for a node type, in the shape of node-sdk's
// createGraphNodeTypeResolver (nodeType, propertyTypes, outputs,
// descriptorDefaults), or nullopt for a type the registry does not know.
using TypeResolver = std::function<std::optional<Json>(const std::string&)>;

// Editor-only base nodes (Comment, Group, and the legacy base_node Reroute)
// have no executable class. Mirrors node-sdk isEditorOnlyType.
bool isEditorOnlyType(const std::string& type);

// Editor-only nodes are pruned with the edges that touch them, as
// packages/execution normalizeGraph does. A Group's children keep running:
// the server ignores `parent_id`. Saved properties move from `data` to
// `properties`, `dynamic_properties` merge into them, edges get `edge_type`,
// and malformed nodes and edges are dropped. Each node is then hydrated from its registry entry: the title
// becomes the default name, and the registry's property and output types
// come first. Nodes of unknown type are dropped with their edges, as the
// server does. Throws GraphValidationError when `nodes` or `edges` is
// missing.
Json normalizeGraph(const Json& graph, const TypeResolver& resolve);

}  // namespace gr
