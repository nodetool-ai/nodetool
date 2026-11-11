#include "kernel/correlation.h"

#include <algorithm>
#include <deque>

namespace gr {

const InputAnalysis* NodeAnalysis::input(const std::string& handle) const {
  for (const auto& [h, a] : inputs) {
    if (h == handle) return &a;
  }
  return nullptr;
}

const OutputAnalysis* NodeAnalysis::output(const std::string& handle) const {
  for (const auto& [h, a] : outputs) {
    if (h == handle) return &a;
  }
  return nullptr;
}

std::string iterationRootId(const std::string& nodeId,
                            const std::string& handle,
                            const std::optional<std::string>& group) {
  return group && !group->empty() ? nodeId + ":" + *group
                                  : nodeId + ":" + handle;
}

bool isPrefixOf(const Scope& a, const Scope& b) {
  if (a.size() > b.size()) return false;
  for (size_t i = 0; i < a.size(); ++i) {
    if (a[i] != b[i]) return false;
  }
  return true;
}

namespace {

bool comparable(const Scope& a, const Scope& b) {
  return isPrefixOf(a, b) || isPrefixOf(b, a);
}

std::optional<Scope> largerScope(const Scope& a, const Scope& b) {
  if (isPrefixOf(a, b)) return b;
  if (isPrefixOf(b, a)) return a;
  return std::nullopt;
}

std::string formatScope(const Scope& s) {
  std::string out = "[";
  for (size_t i = 0; i < s.size(); ++i) {
    if (i) out += ", ";
    out += s[i];
  }
  return out + "]";
}

struct EdgeFacts {
  Scope scope;
  bool repeatsPerKey = false;
  RootSet possibleChildRoots;
};

bool isListTypeHandle(const Node& node, const std::string& handle) {
  if (!node.propertyTypes.is_object()) return false;
  auto it = node.propertyTypes.find(handle);
  if (it == node.propertyTypes.end() || !it->is_string()) return false;
  std::string t = it->get<std::string>();
  return !t.empty() && isListTypeString(t);
}

}  // namespace

CorrelationResult analyzeCorrelation(const Graph& graph) {
  CorrelationResult result;
  auto& issues = result.issues;
  std::map<std::string, EdgeFacts> edgeFacts;

  auto backEdge = [&](const Edge& e) {
    const auto* target = graph.findNode(e.target);
    return e.isData() && target && target->type == "nodetool.control.Loop" &&
      (e.targetHandle == "next" || e.targetHandle == "condition");
  };
  // Feedback edges are checked after their source has been analyzed.
  std::map<std::string, int> incomingCount;
  std::map<std::string, std::vector<std::string>> successors;
  std::vector<std::string> selfLoops;
  for (const auto& n : graph.nodes()) incomingCount[n.id] = 0;
  for (const auto& e : graph.edges()) {
    if (!e.isData() || backEdge(e)) continue;
    if (!graph.findNode(e.source) || !graph.findNode(e.target)) continue;
    if (e.source == e.target) {
      if (std::find(selfLoops.begin(), selfLoops.end(), e.source) ==
          selfLoops.end()) {
        selfLoops.push_back(e.source);
      }
      continue;
    }
    successors[e.source].push_back(e.target);
    ++incomingCount[e.target];
  }
  std::deque<std::string> queue;
  for (const auto& n : graph.nodes()) {
    if (incomingCount[n.id] == 0) queue.push_back(n.id);
  }
  std::vector<const Node*> order;
  std::set<std::string> ordered;
  while (!queue.empty()) {
    std::string id = queue.front();
    queue.pop_front();
    order.push_back(graph.findNode(id));
    ordered.insert(id);
    for (const auto& t : successors[id]) {
      if (--incomingCount[t] == 0) queue.push_back(t);
    }
  }
  if (order.size() < graph.nodes().size() || !selfLoops.empty()) {
    std::vector<std::string> remaining;
    for (const auto& n : graph.nodes()) {
      if (!ordered.count(n.id)) remaining.push_back(n.id);
    }
    for (const auto& id : selfLoops) {
      if (std::find(remaining.begin(), remaining.end(), id) == remaining.end()) {
        remaining.push_back(id);
      }
    }
    std::string list;
    for (size_t i = 0; i < remaining.size(); ++i) {
      if (i) list += ", ";
      list += remaining[i];
    }
    issues.push_back(
        {std::nullopt, std::nullopt, std::nullopt,
         "Cycle detected in graph; a cycle may only close on the \"next\" or "
         "\"condition\" input of a Loop node. Involved nodes: " +
             list});
    return result;
  }

  auto issue = [&](const Node& node, std::optional<std::string> handle,
                   std::string message) {
    issues.push_back({node.id, node.type, std::move(handle), std::move(message)});
  };

  for (const Node* nodePtr : order) {
    const Node& node = *nodePtr;
    NodeAnalysis facts;
    auto incoming = graph.incomingData(node.id);
    if (node.type == "nodetool.control.Loop") {
      int initialCount = 0;
      RootSet initialRoots;
      for (const auto* e : incoming) {
        if (backEdge(*e)) continue;
        if (e->targetHandle != "initial") { issue(node,e->targetHandle,"Loop input \"" + e->targetHandle + "\" cannot be wired; set it as a property."); continue; }
        ++initialCount;
        const auto& ef = edgeFacts[e->key()];
        facts.invocationScope = ef.scope;
        initialRoots = ef.possibleChildRoots;
        facts.inputs.push_back({"initial",{ef.scope,false,false,ef.possibleChildRoots}});
        if (ef.repeatsPerKey) issue(node,"initial","Loop input \"initial\" receives a chunk stream; a loop run starts from one value. Collect the stream first.");
      }
      if (initialCount > 1) issue(node,"initial","Loop input \"initial\" receives " + std::to_string(initialCount) + " edges; a loop run starts from one value.");
      Scope scope = facts.invocationScope; scope.push_back(node.id + ":loop");
      RootSet roots = initialRoots; roots.insert(node.id + ":loop");
      for (const auto& handle : {"next","condition"}) {
        int count = 0;
        for (const auto* e : incoming) if (backEdge(*e) && e->targetHandle == handle) ++count;
        if (count) facts.inputs.push_back({handle,{scope,false,count > 1,roots}});
        if (count > 1) issue(node,handle,"Loop input \"" + std::string(handle) + "\" receives " + std::to_string(count) + " edges; each iteration feeds back one value.");
        if (!count && std::string(handle) == "next") issue(node,handle,"Loop has no feedback: connect the loop body's result to its \"next\" input.");
      }
      facts.outputs.push_back({"value",{scope,false,roots}});
      facts.outputs.push_back({"index",{scope,false,roots}});
      RootSet parentRoots = initialRoots;
      facts.outputs.push_back({"done",{facts.invocationScope,false,parentRoots}});
      for (const auto* e : graph.outgoing(node.id)) {
        if (!e->isData()) continue;
        const auto* out = facts.output(e->sourceHandle);
        if (out) edgeFacts[e->key()] = {out->scope,out->repeatsPerKey,out->possibleChildRoots};
      }
      result.nodes.emplace(node.id,std::move(facts));
      continue;
    }


    std::vector<std::pair<std::string, std::vector<const Edge*>>> byHandle;
    for (const Edge* e : incoming) {
      auto it = std::find_if(byHandle.begin(), byHandle.end(),
                             [&](const auto& p) { return p.first == e->targetHandle; });
      if (it == byHandle.end()) {
        byHandle.push_back({e->targetHandle, {e}});
      } else {
        it->second.push_back(e);
      }
    }

    for (const auto& [handle, edges] : byHandle) {
      bool isList = edges.size() > 1 && isListTypeHandle(node, handle);
      if (edges.size() > 1 && !isList) {
        issue(node, handle,
              "Handle \"" + handle + "\" receives " +
                  std::to_string(edges.size()) +
                  " edges but is not a list type; this is invalid under "
                  "correlation analysis. To gather several values into one "
                  "list, wire them into a list-typed input such as `value` on "
                  "nodetool.constant.List.");
      }
      Scope effective;
      bool repeats = false;
      RootSet roots;
      for (const Edge* e : edges) {
        auto ef = edgeFacts.find(e->key());
        if (ef == edgeFacts.end()) continue;
        if (effective.empty()) {
          effective = ef->second.scope;
        } else {
          auto larger = largerScope(effective, ef->second.scope);
          if (!larger) {
            issue(node, handle,
                  "Multi-edge list handle \"" + handle +
                      "\" has incomparable source-edge scopes (" +
                      formatScope(effective) + " vs " +
                      formatScope(ef->second.scope) +
                      "); reject the graph or aggregate upstream.");
            continue;
          }
          effective = *larger;
        }
        if (ef->second.repeatsPerKey) repeats = true;
        roots.insert(ef->second.possibleChildRoots.begin(),
                     ef->second.possibleChildRoots.end());
      }
      facts.inputs.push_back(
          {handle, InputAnalysis{effective, repeats, edges.size() > 1, roots}});
    }

    // Invocation scope.
    Scope invocation;
    std::vector<std::string> nonEmpty;
    for (const auto& [h, info] : facts.inputs) {
      if (!info.scope.empty()) nonEmpty.push_back(h);
    }
    if (!node.isJoinNode) {
      for (size_t i = 0; i < nonEmpty.size(); ++i) {
        for (size_t j = i + 1; j < nonEmpty.size(); ++j) {
          const Scope& a = facts.input(nonEmpty[i])->scope;
          const Scope& b = facts.input(nonEmpty[j])->scope;
          if (!comparable(a, b)) {
            issue(node, std::nullopt,
                  "Inputs \"" + nonEmpty[i] + "\" and \"" + nonEmpty[j] +
                      "\" come from independent iteration sources (scopes " +
                      formatScope(a) + " and " + formatScope(b) +
                      "). Add Zip or Cross to declare how they should join.");
          }
        }
      }
      for (const auto& h : nonEmpty) {
        const Scope& sc = facts.input(h)->scope;
        if (sc.size() > invocation.size()) invocation = sc;
      }
    } else {
      std::optional<Scope> common;
      for (const auto& h : nonEmpty) {
        const Scope& sc = facts.input(h)->scope;
        if (!common) {
          common = sc;
          continue;
        }
        size_t i = 0;
        while (i < common->size() && i < sc.size() && (*common)[i] == sc[i]) ++i;
        common->resize(i);
      }
      invocation = common.value_or(Scope{});
    }
    facts.invocationScope = invocation;

    const bool isBuffered = !node.inputMode || *node.inputMode == "buffered" ||
                            *node.inputMode == "controlled";

    std::vector<std::string> handles;
    if (node.outputs.is_object() && !node.outputs.empty()) {
      for (const auto& [h, _] : node.outputs.items()) handles.push_back(h);
    } else {
      for (const auto& [h, _] : node.outputCorrelation) handles.push_back(h);
    }

    for (const auto& handle : handles) {
      const OutputCorrelation* corr = node.correlationFor(handle);
      std::string kind = corr ? corr->kind : "single";
      std::string source = corr && corr->source ? *corr->source : "__execution__";

      Scope baseScope;
      bool baseRepeats = false;
      RootSet baseRoots;
      if (source == "__execution__") {
        for (const auto& [h, info] : facts.inputs) {
          if (info.scope.empty()) continue;
          if (!comparable(info.scope, invocation)) continue;
          if (info.repeatsPerKey && info.scope.size() == invocation.size()) {
            baseRepeats = true;
          }
          baseRoots.insert(info.possibleChildRoots.begin(),
                           info.possibleChildRoots.end());
        }
        baseScope = invocation;
      } else if (const InputAnalysis* src = facts.input(source)) {
        baseScope = src->scope;
        baseRepeats = src->repeatsPerKey;
        baseRoots = src->possibleChildRoots;
        if (kind == "forward" && src->isMultiEdge) {
          issue(node, handle,
                "forward outputs may not name a multi-edge list handle (\"" +
                    source + "\") as source.");
        }
      }

      if (corr && !corr->source) {
        issue(node, handle, "Output \"" + handle + "\" omits required \"source\".");
      }
      if (kind == "forward" && source == "__execution__") {
        issue(node, handle, "forward outputs may not use source \"__execution__\".");
      }
      if (kind == "aggregate") {
        if (!corr->collapse) {
          issue(node, handle, "aggregate output requires \"collapse\".");
        }
        if (isBuffered) {
          issue(node, handle,
                "aggregate outputs are only valid on input_mode: \"stream\"; "
                "node is buffered.");
        }
      }

      OutputAnalysis out{baseScope, baseRepeats, baseRoots};
      if (kind == "chunk") {
        out.repeatsPerKey = true;
      } else if (kind == "iteration") {
        std::string root = iterationRootId(node.id, handle, corr->group);
        out.scope.push_back(root);
        out.repeatsPerKey = false;
        out.possibleChildRoots.insert(root);
      } else if (kind == "aggregate" && corr->collapse == "innermost" &&
                 !baseScope.empty()) {
        std::string dropped = baseScope.back();
        out.scope.pop_back();
        out.repeatsPerKey = false;
        out.possibleChildRoots.erase(dropped);
      }

      if (isBuffered && kind != "aggregate" && !invocation.empty() &&
          out.scope.size() < invocation.size() &&
          isPrefixOf(out.scope, invocation)) {
        issue(node, handle,
              "Buffered output \"" + handle + "\" has scope " +
                  formatScope(out.scope) +
                  " which is a strict prefix of the invocation scope " +
                  formatScope(invocation) + ".");
      }
      facts.outputs.push_back({handle, std::move(out)});
    }

    if (isBuffered) {
      std::vector<std::string> repeating;
      for (const auto& [h, info] : facts.inputs) {
        if (info.scope.size() != invocation.size()) continue;
        if (!info.repeatsPerKey) continue;
        repeating.push_back(h);
      }
      if (repeating.size() > 1) {
        std::string list;
        for (size_t i = 0; i < repeating.size(); ++i) {
          if (i) list += ", ";
          list += repeating[i];
        }
        issue(node, std::nullopt,
              "Buffered node has more than one repeats_per_key input at the "
              "execution scope: " +
                  list + ".");
      }
      if (repeating.size() == 1 && facts.input(repeating[0])->isMultiEdge) {
        issue(node, repeating[0],
              "Buffered node's only repeats_per_key execution-scope input \"" +
                  repeating[0] +
                  "\" is a multi-edge list handle; repeating list handles "
                  "need stream/aggregate handling.");
      }
      for (const auto& [h, info] : facts.inputs) {
        if (!info.repeatsPerKey || info.scope.empty()) continue;
        if (info.scope.size() < invocation.size()) {
          issue(node, h,
                "Buffered node may not use repeats_per_key input \"" + h +
                    "\" as a strict-prefix sticky value.");
        }
      }
    }

    // Record outgoing edge facts.
    for (const Edge* e : graph.outgoing(node.id)) {
      if (!e->isData()) continue;
      const OutputAnalysis* out = facts.output(e->sourceHandle);
      edgeFacts[e->key()] =
          out ? EdgeFacts{out->scope, out->repeatsPerKey, out->possibleChildRoots}
              : EdgeFacts{};
    }
    result.nodes.emplace(node.id, std::move(facts));
  }
  std::map<std::string,std::vector<std::string>> forward, backward;
  for (const auto& e : graph.edges()) {
    if (!e.isData() || backEdge(e)) continue;
    forward[e.source].push_back(e.target); backward[e.target].push_back(e.source);
  }
  auto reach = [](const std::vector<std::string>& starts, const auto& adjacency) {
    std::set<std::string> seen; auto pending = starts;
    while (!pending.empty()) {
      auto id = pending.back(); pending.pop_back();
      if (!seen.insert(id).second) continue;
      auto it = adjacency.find(id); if (it != adjacency.end()) pending.insert(pending.end(),it->second.begin(),it->second.end());
    }
    return seen;
  };
  for (const auto& node : graph.nodes()) {
    if (node.type != "nodetool.control.Loop") continue;
    const auto& facts = result.nodes.at(node.id);
    const auto name = node.name.value_or(node.id);
    std::vector<std::string> sources;
    for (const auto& e : graph.edges()) {
      if (e.target != node.id || !backEdge(e)) continue;
      sources.push_back(e.source);
      const auto* expected = facts.input(e.targetHandle);
      const auto& actual = edgeFacts[e.key()];
      if (!expected) continue;
      const auto prefix = "Loop \"" + name + "\" input \"" + e.targetHandle + "\" ";
      if (actual.repeatsPerKey) issue(node,e.targetHandle,prefix + "receives a chunk stream from \"" + e.source + "\"; each iteration must feed back one value.");
      if (actual.scope == expected->scope) continue;
      if (actual.scope.size() < expected->scope.size() && isPrefixOf(actual.scope,expected->scope)) {
        issue(node,e.targetHandle,prefix + "is wired from \"" + e.source + "\", which is outside the loop body (scope " + formatScope(actual.scope) + ", expected " + formatScope(expected->scope) + "). Wire it from a node downstream of the loop's \"value\" or \"index\" output, or set it as a property.");
      } else if (isPrefixOf(expected->scope,actual.scope)) {
        issue(node,e.targetHandle,prefix + "receives one value per item of a nested iteration (scope " + formatScope(actual.scope) + ", expected " + formatScope(expected->scope) + "). Each iteration must feed back exactly one value.");
      } else issue(node,e.targetHandle,prefix + "is wired from \"" + e.source + "\", which belongs to a different iteration (scope " + formatScope(actual.scope) + ", expected " + formatScope(expected->scope) + ").");
    }
    const auto fromLoop = reach(forward[node.id],forward), toBack = reach(sources,backward);
    for (const auto& id : fromLoop) {
      if (id == node.id || !toBack.count(id)) continue;
      const auto* body = graph.findNode(id);
      for (const auto& [handle,corr] : body->outputCorrelation) if (corr.kind == "aggregate") {
        issue(*body,handle,"Node \"" + body->name.value_or(id) + "\" aggregates a stream inside the body of loop \"" + name + "\". An aggregate emits when its input stream ends, which inside a loop body happens only after the loop has finished.");
      }
    }
  }
  return result;
}

}  // namespace gr
