#include "kernel/actor.h"
#include "kernel/state_executor.h"

#include <algorithm>
#include <cstdio>
#include <deque>

namespace gr {

void logLine(const char* level, const std::string& logger,
             const std::string& message) {
  std::fprintf(stderr, "%-5s | %s | %s\n", level, logger.c_str(),
               message.c_str());
}

namespace {

const char* kLog = "nodetool.kernel.actor";

bool startsWith(const std::string& s, const char* prefix) {
  return s.rfind(prefix, 0) == 0;
}

bool isConstantOrInput(const std::string& type) {
  return startsWith(type, "nodetool.constant.") ||
         startsWith(type, "nodetool.input.");
}

std::vector<std::string> keysOf(const Json& obj) {
  std::vector<std::string> out;
  if (obj.is_object()) {
    for (const auto& [k, _] : obj.items()) out.push_back(k);
  }
  return out;
}

// `{...a, ...b}` for JSON objects: later keys overwrite in place.
void spreadInto(Json& target, const Json& source) {
  if (!source.is_object()) return;
  for (const auto& [k, v] : source.items()) target[k] = v;
}
// The same, moving the values out of `source`.
void spreadInto(Json& target, Json&& source) {
  if (!source.is_object()) return;
  for (auto& [k, v] : source.items()) target[k] = std::move(v);
}

std::string firstTypeArg(const std::string& inner) {
  int depth = 0;
  for (size_t i = 0; i < inner.size(); ++i) {
    char c = inner[i];
    if (c == '[') ++depth;
    if (c == ']') --depth;
    if (c == ',' && depth == 0) return inner.substr(0, i);
  }
  return inner;
}

Json modelReference(const Json& v) {
  if (!v.is_object()) return nullptr;
  auto type = v.find("type");
  auto id = v.find("id");
  if (type == v.end() || !type->is_string()) return nullptr;
  std::string t = type->get<std::string>();
  if (t.size() < 6 || t.compare(t.size() - 6, 6, "_model") != 0) return nullptr;
  if (id == v.end() || !id->is_string() || id->get<std::string>().empty()) {
    return nullptr;
  }
  Json out = {{"type", t}, {"id", *id}};
  if (v.contains("name") && v["name"].is_string()) out["name"] = v["name"];
  if (v.contains("provider") && v["provider"].is_string()) {
    out["provider"] = v["provider"];
  }
  return out;
}

struct FlagGuard {
  bool& flag;
  explicit FlagGuard(bool& f) : flag(f) { flag = true; }
  ~FlagGuard() { flag = false; }
};

}  // namespace

Json scalarInputProperties(const Json& inputs) {
  Json out = Json::object();
  if (!inputs.is_object()) return nullptr;
  for (const auto& [k, v] : inputs.items()) {
    if (!k.empty() && k[0] == '_') continue;
    if (v.is_string() || v.is_number() || v.is_boolean()) {
      out[k] = v;
      continue;
    }
    Json model = modelReference(v);
    if (!model.is_null()) out[k] = model;
  }
  return out.empty() ? Json(nullptr) : out;
}

Actor::Actor(ActorHost& host, const Node& node, Inbox& inbox,
             Executor& executor, const NodeAnalysis* correlation,
             std::set<std::string> listInputHandles)
    : host_(host),
      node_(node),
      inbox_(inbox),
      executor_(executor),
      correlation_(correlation),
      listInputHandles_(std::move(listInputHandles)) {}

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

Task<ActorResult> Actor::run() {
  std::optional<std::string> error;
  emitNodeStatus("running");
  try {
    co_await executor_.preProcess();
    co_await runExecutionMode();
  } catch (const std::exception& e) {
    error = e.what();
    logLine("ERROR", kLog, "Actor failed " + Json{{"nodeId", node_.id}, {"type", node_.type}, {"error", *error}}.dump());
  }
  try {
    co_await executor_.finalize();
  } catch (const std::exception&) {
    // Finalize errors never mask the original error.
  }
  ActorResult result;
  if (error) {
    emitNodeStatus("error", nullptr, error);
    result.error = error;
    co_return result;
  }
  Json latest = latestResult_.value_or(Json::object());
  emitNodeStatus("completed", isConstantOrInput(node_.type) ? Json(nullptr) : latest);
  result.outputs = std::move(latest);
  for (const auto& [_, v] : invocationResults_) result.invocationOutputs.push_back(v);
  co_return result;
}

Task<void> Actor::runExecutionMode() {
  // A run cancelled before this actor started must not execute the node.
  if (host_.cancelled()) co_return;
  if (node_.isTrigger) {
    auto outputs = co_await host_.triggerEvent(node_,*this);
    if (outputs) { latestResult_ = *outputs; emitGenerationComplete(*outputs,nullptr); co_return; }
  }
  if (node_.type == "nodetool.control.Loop") {
    co_await runLoop();
    co_return;
  }
  if (node_.isStreamingInput) {
    if (executor_.hasRun()) {
      co_await runStreamingInputMode();
    } else {
      co_await runStreamingInputWithoutRun();
    }
    co_return;
  }
  if (node_.isControlled) {
    co_await runControlled();
    co_return;
  }
  if (!correlation_) {
    throw NodeError("Missing correlation analysis for node \"" + node_.id + "\"");
  }
  co_await runCorrelated();
}

// ---------------------------------------------------------------------------
// Streaming input
// ---------------------------------------------------------------------------

Task<void> Actor::runStreamingInputMode() {
  Json collected = co_await executor_.run(*this);
  latestResult_ = collected.is_object() ? collected : Json::object();
  emitGenerationComplete(*latestResult_, nullptr);
}

Task<void> Actor::runStreamingInputWithoutRun() {
  std::vector<std::string> dropped;
  for (const auto& h : inbox_.handles()) {
    if (h != "__control__") dropped.push_back(h);
  }
  if (!dropped.empty()) {
    std::string list;
    for (size_t i = 0; i < dropped.size(); ++i) list += (i ? ", " : "") + dropped[i];
    std::string warning = "streaming-input node " + node_.type +
                          " has no run() implementation but has connected inputs (" +
                          list + "); data would be silently dropped";
    logLine("WARN", kLog, warning);
    emitNodeStatus("warning", nullptr, warning);
  }
  Json inputs = Json::object();
  spreadInto(inputs, node_.properties);
  spreadInto(inputs, node_.dynamicProperties);
  inputs = host_.prepareInputs(node_,std::move(inputs));
  Json outputs = co_await executor_.process(inputs);
  latestResult_ = outputs;
  co_await host_.sendOutputs(node_.id, outputs, {});
  emitGenerationComplete(outputs, nullptr);
}

Task<std::optional<std::pair<std::string, Envelope>>> Actor::next(
    std::optional<std::string> handle) {
  if (handle) {
    auto env = co_await inbox_.nextInput(*handle);
    if (!env) co_return std::nullopt;
    lastEnvelopes_.set(*handle, *env);
    co_return std::make_pair(*handle, std::move(*env));
  }
  auto popped = co_await inbox_.nextAny();
  if (popped) lastEnvelopes_.set(popped->first, popped->second);
  co_return popped;
}

Task<void> Actor::emit(std::string slot, std::optional<Json> value,
                       std::optional<Lineage> lineage) {
  if (slot.empty()) slot = "output";
  RoutingHints hints = streamingEmitHints(slot, lineage);
  Json outputs = Json::object();
  if (value) outputs[slot] = std::move(*value);
  co_await route(std::move(outputs), std::move(hints));
}

Task<void> Actor::emitGroup(Json values, std::optional<Lineage> callerLineage) {
  Lineage parent = callerLineage
                       ? *callerLineage
                       : computeInvocationLineage().value_or(Lineage{});
  std::string parentKey =
      correlation_ ? projectLineageKey(parent, correlation_->invocationScope) : "";
  std::map<std::string, long long> groupTokens;
  std::map<std::string, Lineage> perSlot;
  for (const auto& slot : keysOf(values)) {
    const OutputCorrelation* corr = node_.correlationFor(slot);
    if (corr && corr->kind == "iteration") {
      std::string root = iterationRootId(node_.id, slot, corr->group);
      auto it = groupTokens.find(root);
      long long index = it != groupTokens.end()
                            ? it->second
                            : (groupTokens[root] = mintIterationToken(root, parentKey));
      Lineage l = parent;
      l[root] = index;
      perSlot[slot] = l;
    } else {
      perSlot[slot] = parent;
    }
  }
  RoutingHints hints;
  hints.invocationLineage = parent;
  hints.perSlotLineage = perSlot;
  co_await host_.sendOutputs(node_.id, std::move(values), std::move(hints));
}

Task<void> Actor::drop(std::string slot, Lineage lineage) {
  RoutingHints hints;
  hints.perSlotLineage = std::map<std::string, Lineage>{{slot, lineage}};
  hints.lineageDoneSlots.insert(slot);
  co_await host_.sendOutputs(node_.id, Json::object(), std::move(hints));
}

void Actor::complete(const std::string& slot) {
  host_.signalSlotEos(node_.id, slot.empty() ? "output" : slot);
}

bool Actor::hasBuffered(const std::string& handle) {
  return inbox_.hasBuffered(handle);
}

bool Actor::hasStream(const std::string& handle) { return inbox_.isOpen(handle); }

Scope Actor::scopeFor(const std::string& handle) {
  if (!correlation_) return {};
  const InputAnalysis* in = correlation_->input(handle);
  return in ? in->scope : Scope{};
}

Scope Actor::invocationScope() {
  return correlation_ ? correlation_->invocationScope : Scope{};
}

RoutingHints Actor::streamingEmitHints(const std::string& slot,
                                       const std::optional<Lineage>& caller) {
  RoutingHints hints;
  if (caller) {
    hints.perSlotLineage = std::map<std::string, Lineage>{{slot, *caller}};
    return hints;
  }
  if (auto inherited = computeInvocationLineage()) hints.invocationLineage = inherited;
  auto perSlot = maybeCollapseForSlot(slot, hints);
  if (!perSlot) perSlot = maybeMintForSlot(slot, hints);
  if (perSlot) hints.perSlotLineage = std::map<std::string, Lineage>{{slot, *perSlot}};
  return hints;
}

std::optional<Lineage> Actor::maybeCollapseForSlot(const std::string& slot,
                                                   const RoutingHints& hints) {
  const OutputCorrelation* corr = node_.correlationFor(slot);
  if (!corr || corr->kind != "aggregate") return std::nullopt;
  if (corr->collapse != "innermost") return std::nullopt;
  if (!correlation_) return std::nullopt;
  const InputAnalysis* source =
      corr->source ? correlation_->input(*corr->source) : nullptr;
  if (!source || source->scope.empty()) return std::nullopt;
  const std::string& collapsed = source->scope.back();
  Lineage base = hints.invocationLineage.value_or(Lineage{});
  base.erase(collapsed);
  return base;
}

std::optional<Lineage> Actor::maybeMintForSlot(const std::string& slot,
                                               const RoutingHints& hints) {
  const OutputCorrelation* corr = node_.correlationFor(slot);
  if (!corr || corr->kind != "iteration") return std::nullopt;
  std::string root = iterationRootId(node_.id, slot, corr->group);
  Lineage parent = hints.invocationLineage.value_or(Lineage{});
  std::string parentKey =
      correlation_ ? projectLineageKey(parent, correlation_->invocationScope) : "";
  parent[root] = mintIterationToken(root, parentKey);
  return parent;
}

// ---------------------------------------------------------------------------
// Correlated buffered scheduler
// ---------------------------------------------------------------------------

Task<void> Actor::runCorrelated() {
  FlagGuard guard(inCorrelatedBuffered_);
  const NodeAnalysis& analysis = *correlation_;

  std::vector<std::string> dataHandles;
  for (const auto& h : inbox_.handles()) {
    if (h != "__control__") dataHandles.push_back(h);
  }
  if (dataHandles.empty()) {
    co_await executeWithInputs(Json::object());
    co_return;
  }

  enum class Cls { Max, Prefix, Empty };
  std::map<std::string, Scope> handleScope;
  std::map<std::string, Cls> handleClass;
  std::map<std::string, bool> handleRepeats;
  const Scope& invocation = analysis.invocationScope;
  for (const auto& h : dataHandles) {
    const InputAnalysis* info = analysis.input(h);
    Scope scope = info ? info->scope : Scope{};
    bool repeats = info ? info->repeatsPerKey : false;
    handleScope[h] = scope;
    handleRepeats[h] = repeats;
    if (scope.size() == invocation.size() && (!scope.empty() || repeats)) {
      handleClass[h] = Cls::Max;
    } else if (scope.empty()) {
      handleClass[h] = Cls::Empty;
    } else {
      handleClass[h] = Cls::Prefix;
    }
  }

  std::optional<std::string> driver;
  for (const auto& h : dataHandles) {
    if (handleClass[h] == Cls::Max && handleRepeats[h]) {
      driver = h;
      break;
    }
  }

  using Bucket = std::deque<Envelope>;
  // Per-handle maps, iterated in dataHandles order like the TS Maps.
  std::map<std::string, OMap<Bucket>> maxBuckets;
  std::map<std::string, OMap<Envelope>> prefixSticky;
  OMap<Envelope> emptySticky;
  std::set<std::string> emptyStickyWarned;
  std::map<std::string, std::vector<Envelope>> emptyListEnvelopes;
  std::map<std::string, OMap<std::vector<Envelope>>> prefixListBuckets;
  std::vector<std::string> maxOrder;

  auto isList = [&](const std::string& h) { return listInputHandles_.count(h) > 0; };
  auto isNestedList = [&](const std::string& h) {
    if (!node_.propertyTypes.is_object() || !node_.propertyTypes.contains(h) ||
        !node_.propertyTypes[h].is_string()) {
      return false;
    }
    std::string t = node_.propertyTypes[h].get<std::string>();
    if (!isListTypeString(t)) return false;
    auto open = t.find('[');
    auto close = t.rfind(']');
    if (open == std::string::npos || close == std::string::npos) return false;
    return isListTypeString(firstTypeArg(t.substr(open + 1, close - open - 1)));
  };
  auto aggregate = [&](const std::string& h, const std::vector<Envelope>& envs) {
    Json out = Json::array();
    bool nested = isNestedList(h);
    for (const auto& e : envs) {
      if (!nested && e.data->is_array()) {
        for (const auto& item : *e.data) out.push_back(item);
      } else {
        out.push_back(*e.data);
      }
    }
    return out;
  };

  for (const auto& h : dataHandles) {
    Cls c = handleClass[h];
    if (c == Cls::Max) {
      maxBuckets[h];
      maxOrder.push_back(h);
    } else if (c == Cls::Prefix) {
      prefixSticky[h];
      if (isList(h)) prefixListBuckets[h];
    } else if (isList(h)) {
      emptyListEnvelopes[h];
    }
  }

  std::set<std::string> fired;

  auto trimKey = [](const std::string& key, size_t prefixLength) -> std::string {
    if (prefixLength == 0 || key.empty()) return "";
    size_t pos = 0;
    for (size_t n = 0; n < prefixLength; ++n) {
      pos = key.find(',', pos);
      if (pos == std::string::npos) return key;
      if (n + 1 < prefixLength) ++pos;
    }
    return key.substr(0, pos);
  };

  auto isReady = [&](const std::string& key) {
    for (const auto& h : dataHandles) {
      Cls c = handleClass[h];
      if (c == Cls::Max) {
        const Bucket* b = maxBuckets[h].find(key);
        if (!b || b->empty()) return false;
        if (isList(h) && inbox_.isOpen(h)) return false;
      } else if (c == Cls::Prefix) {
        std::string parentKey = trimKey(key, handleScope[h].size());
        if (isList(h)) {
          if (inbox_.isOpen(h)) return false;
          const auto* b = prefixListBuckets[h].find(parentKey);
          if (!b || b->empty()) return false;
        } else if (!prefixSticky[h].has(parentKey)) {
          return false;
        }
      } else {
        bool awaits = isList(h) || !emptySticky.has(h);
        if (awaits && inbox_.isOpen(h)) return false;
      }
    }
    return true;
  };

  auto collect = [&](const std::string& key, Json& values,
                     OMap<Envelope>& envelopes) {
    values = Json::object();
    for (const auto& h : dataHandles) {
      Cls c = handleClass[h];
      if (c == Cls::Max) {
        Bucket* b = maxBuckets[h].find(key);
        if (!b || b->empty()) continue;
        if (isList(h)) {
          std::vector<Envelope> drained(b->begin(), b->end());
          envelopes.set(h, drained.back());
          values[h] = aggregate(h, drained);
          maxBuckets[h].erase(key);
        } else {
          bool sticky = driver && h != *driver;
          Envelope env = b->front();
          if (!sticky) b->pop_front();
          values[h] = *env.data;
          envelopes.set(h, std::move(env));
          if (!sticky && b->empty()) maxBuckets[h].erase(key);
        }
      } else if (c == Cls::Prefix) {
        std::string parentKey = trimKey(key, handleScope[h].size());
        if (isList(h)) {
          const auto* b = prefixListBuckets[h].find(parentKey);
          if (b && !b->empty()) {
            envelopes.set(h, b->back());
            values[h] = aggregate(h, *b);
          }
        } else if (const Envelope* env = prefixSticky[h].find(parentKey)) {
          envelopes.set(h, *env);
          values[h] = *env->data;
        }
      } else if (isList(h)) {
        const auto& envs = emptyListEnvelopes[h];
        if (!envs.empty()) {
          envelopes.set(h, envs.back());
          values[h] = aggregate(h, envs);
        }
      } else if (const Envelope* env = emptySticky.find(h)) {
        envelopes.set(h, *env);
        values[h] = *env->data;
      }
    }
  };

  auto allPendingKeys = [&]() {
    std::vector<std::string> out;
    std::set<std::string> seen;
    for (const auto& h : maxOrder) {
      for (const auto& [key, _] : maxBuckets[h]) {
        if (seen.insert(key).second) out.push_back(key);
      }
    }
    return out;
  };

  // Fires every ready candidate. A coroutine lambda would dangle its
  // captures, so the loop is written inline at each call site via this
  // helper that returns the keys to fire one at a time.
  auto fireOne = [&](const std::string& key, Json& values,
                     OMap<Envelope>& envelopes) -> bool {
    if (!driver) {
      if (fired.count(key) || !isReady(key)) return false;
    } else if (!isReady(key)) {
      return false;
    }
    collect(key, values, envelopes);
    return true;
  };

  std::vector<std::string> candidates;
  for (;;) {
    auto item = co_await inbox_.nextAny();
    if (!item) break;
    auto& [handle, envelope] = *item;
    if (handle == "__control__") continue;
    auto cit = handleClass.find(handle);
    if (cit == handleClass.end()) continue;
    Cls c = cit->second;

    candidates.clear();
    if (c == Cls::Max) {
      std::string key =
          tryProjectLineageKey(envelope.lineage, handleScope[handle]).value_or("");
      OMap<Bucket>& buckets = maxBuckets[handle];
      Bucket* b = buckets.find(key);
      if (!b) {
        if (buckets.size() >= Inbox::kMaxPendingKeys) {
          throw NodeError("Inbox for node \"" + node_.id +
                          "\" exceeded max_pending_keys (" +
                          std::to_string(Inbox::kMaxPendingKeys) + ") on handle \"" +
                          handle + "\". Likely missing upstream close — see "
                          "docs/correlation-design.md §6.");
        }
        b = &buckets.set(key, Bucket{});
      }
      if (b->size() >= Inbox::kMaxPendingMessagesPerKey) {
        throw NodeError("Inbox for node \"" + node_.id +
                        "\" exceeded max_pending_messages_per_key (" +
                        std::to_string(Inbox::kMaxPendingMessagesPerKey) +
                        ") on handle \"" + handle + "\" for key \"" + key + "\".");
      }
      b->push_back(envelope);
      candidates.push_back(key);
    } else if (c == Cls::Prefix) {
      const Scope& parentScope = handleScope[handle];
      std::string parentKey =
          tryProjectLineageKey(envelope.lineage, parentScope).value_or("");
      if (isList(handle)) {
        prefixListBuckets[handle].at(parentKey).push_back(envelope);
      } else {
        prefixSticky[handle].set(parentKey, envelope);
      }
      std::set<std::string> seen;
      for (const auto& h : maxOrder) {
        for (const auto& [key, _] : maxBuckets[h]) {
          if (seen.count(key)) continue;
          if (trimKey(key, parentScope.size()) == parentKey) {
            seen.insert(key);
            candidates.push_back(key);
          }
        }
      }
    } else {
      if (isList(handle)) {
        emptyListEnvelopes[handle].push_back(envelope);
      } else {
        if (emptySticky.has(handle) && !emptyStickyWarned.count(handle)) {
          emptyStickyWarned.insert(handle);
          logLine("WARN", kLog,
                  "Node \"" + node_.id + "\" handle \"" + handle +
                      "\" received multiple values at empty scope; only the "
                      "last is kept. Declare output_correlation (chunk/iteration) "
                      "on the upstream output to preserve the stream.");
        }
        emptySticky.set(handle, envelope);
      }
      candidates = allPendingKeys();
    }

    for (const auto& key : candidates) {
      Json values;
      OMap<Envelope> envelopes;
      if (!driver) {
        if (!fireOne(key, values, envelopes)) continue;
        lastEnvelopes_ = std::move(envelopes);
        co_await executeWithInputs(std::move(values));
        fired.insert(key);
      } else {
        while (fireOne(key, values, envelopes)) {
          lastEnvelopes_ = std::move(envelopes);
          envelopes = OMap<Envelope>{};
          co_await executeWithInputs(std::move(values));
        }
      }
    }
  }

  // Every handle is closed: multi-edge lists gated on close are ready now.
  for (const auto& key : allPendingKeys()) {
    Json values;
    OMap<Envelope> envelopes;
    if (!driver) {
      if (!fireOne(key, values, envelopes)) continue;
      lastEnvelopes_ = std::move(envelopes);
      co_await executeWithInputs(std::move(values));
      fired.insert(key);
    } else {
      while (fireOne(key, values, envelopes)) {
        lastEnvelopes_ = std::move(envelopes);
        envelopes = OMap<Envelope>{};
        co_await executeWithInputs(std::move(values));
      }
    }
  }

  bool anyMax = false;
  for (const auto& [_, c] : handleClass) anyMax = anyMax || c == Cls::Max;
  if (!anyMax && !fired.count("")) {
    Json values = Json::object();
    OMap<Envelope> envelopes;
    bool readyOrAllowed = true;
    for (const auto& h : dataHandles) {
      if (handleClass[h] == Cls::Prefix) {
        if (isList(h)) {
          std::vector<Envelope> drained;
          for (const auto& [_, bucket] : prefixListBuckets[h]) {
            drained.insert(drained.end(), bucket.begin(), bucket.end());
          }
          if (drained.empty()) continue;
          envelopes.set(h, drained.back());
          values[h] = aggregate(h, drained);
        } else {
          auto& sticky = prefixSticky[h];
          if (sticky.empty()) continue;
          const Envelope& first = sticky.begin()->second;
          envelopes.set(h, first);
          values[h] = *first.data;
        }
      } else if (isList(h)) {
        const auto& envs = emptyListEnvelopes[h];
        if (!envs.empty()) {
          envelopes.set(h, envs.back());
          values[h] = aggregate(h, envs);
        } else if (inbox_.isOpen(h)) {
          readyOrAllowed = false;
        }
      } else if (const Envelope* env = emptySticky.find(h)) {
        envelopes.set(h, *env);
        values[h] = *env->data;
      } else if (inbox_.isOpen(h)) {
        readyOrAllowed = false;
      }
    }
    // Wired to data inputs but received nothing: an untaken branch.
    bool receivedNothing = envelopes.empty();
    if (!receivedNothing && readyOrAllowed) {
      lastEnvelopes_ = std::move(envelopes);
      co_await executeWithInputs(std::move(values));
      fired.insert("");
    }
  }

  for (const auto& h : maxOrder) {
    for (const auto& [key, bucket] : maxBuckets[h]) {
      if (bucket.empty()) continue;
      logLine("WARN", kLog,
              "Node \"" + node_.id + "\" " +
                  (fired.count(key) ? "dropped " : "left ") +
                  std::to_string(bucket.size()) + " envelope(s) on handle \"" +
                  h + "\" for key \"" + key + "\"");
    }
  }
}

// ---------------------------------------------------------------------------
// Invocation
// ---------------------------------------------------------------------------

Json Actor::appendStaticItems(Json edgeInputs) const {
  Json result = std::move(edgeInputs);
  for (const auto& handle : node_.appendStaticInputs) {
    if (!result.contains(handle)) continue;
    if (!node_.properties.is_object() || !node_.properties.contains(handle)) continue;
    const Json& staticItems = node_.properties[handle];
    if (!staticItems.is_array() || staticItems.empty()) continue;
    const Json incoming = std::move(result[handle]);
    Json merged = Json::array();
    if (incoming.is_array()) {
      for (const auto& v : incoming) merged.push_back(v);
    } else if (!incoming.is_null()) {
      merged.push_back(incoming);
    }
    for (const auto& v : staticItems) merged.push_back(v);
    result[handle] = merged;
  }
  return result;
}

Task<void> Actor::executeWithInputs(Json edgeInputs) {
  // Cancel closes the inbox, which ends the scheduler loop with whatever
  // sticky values it holds. Firing on them would run the node on partial
  // input after the run was stopped.
  if (host_.cancelled()) co_return;
  Json inputs;
  if (node_.properties.is_object() || node_.dynamicProperties.is_object()) {
    inputs = Json::object();
    spreadInto(inputs, node_.properties);
    spreadInto(inputs, node_.dynamicProperties);
    spreadInto(inputs, appendStaticItems(std::move(edgeInputs)));
  } else {
    inputs = std::move(edgeInputs);
  }

  inputs = host_.prepareInputs(node_,std::move(inputs));
  if (executionsLogged_ == 0) {
    logLine("INFO", kLog,
            "Executing node " + Json{{"nodeId", node_.id},
                                     {"type", node_.type},
                                     {"inputHandles", keysOf(inputs)},
                                     {"invocation", executionsLogged_ + 1}}
                                    .dump());
  }
  ++executionsLogged_;

  currentInvocationLineage_ = computeInvocationLineage();

  if (node_.isStreamingOutput) {
    co_await executeStreaming(std::move(inputs));
    co_return;
  }

  executor_.beginInvocation(currentInvocationLineage_ ? lineageToJson(*currentInvocationLineage_).dump() : "");
  // What generation_complete reports of the inputs, taken before they move
  // into the executor.
  Json properties = isConstantOrInput(node_.type) ? Json(nullptr) : scalarInputProperties(inputs);
  Json outputs;
  bool skipped = false;
  try { outputs = co_await executor_.process(std::move(inputs)); }
  catch (const InvocationSkipped&) { skipped = true; }
  if (skipped) {
    RoutingHints hints;
    hints.invocationLineage = currentInvocationLineage_;
    for (const auto& [slot, unused] : node_.outputs.items()) {
      (void)unused;
      hints.lineageDoneSlots.insert(slot);
    }
    co_await host_.sendOutputs(node_.id, Json::object(), std::move(hints));
    co_return;
  }
  if (!outputs.is_object()) outputs = Json::object();
  latestResult_ = outputs;
  commitInvocationResult(outputs);
  auto hints = currentHints(keysOf(outputs));
  // generation_complete reports latestResult_, which only this actor sets,
  // so the outputs move into the edges.
  co_await host_.sendOutputs(node_.id, std::move(outputs), hints.value_or(RoutingHints{}));
  emitGenerationCompleteWith(*latestResult_, std::move(properties));
}

void Actor::commitInvocationResult(const Json& outputs) {
  std::string key;
  if (correlation_ && !correlation_->invocationScope.empty() &&
      currentInvocationLineage_) {
    key = tryProjectLineageKey(*currentInvocationLineage_,
                               correlation_->invocationScope)
              .value_or("");
  }
  for (auto& [k, v] : invocationResults_) {
    if (k == key) {
      v = outputs;
      return;
    }
  }
  invocationResults_.push_back({key, outputs});
}

Task<void> Actor::executeStreaming(Json inputs) {
  streamingCollected_ = Json::object();
  executor_.beginInvocation(currentInvocationLineage_ ? lineageToJson(*currentInvocationLineage_).dump() : "");
  auto frames = executor_.genProcess(inputs);
  for (;;) {
    auto partial = co_await frames->next();
    if (!partial) break;
    co_await routeStreamingFrame(*partial);
    // A generator that never reads its inputs does not see the closed
    // inboxes, so stop pulling frames once the run is cancelled.
    if (host_.cancelled()) break;
  }
  latestResult_ = streamingCollected_;
  commitInvocationResult(*latestResult_);
  emitGenerationComplete(*latestResult_, &inputs);
}

Task<bool> Actor::routeStreamingFrame(const Json& partial) {
  Json routed = Json::object();
  if (partial.is_object()) {
    for (const auto& [k, v] : partial.items()) {
      if (!v.is_null()) routed[k] = v;
    }
  }
  if (routed.empty()) co_return false;
  auto overrides = mintIterationFrameOverrides(routed);
  spreadInto(streamingCollected_, routed);
  if (overrides) spreadInto(streamingCollected_, *overrides);
  Json emitted = routed;
  if (overrides) spreadInto(emitted, *overrides);
  latestResult_ = streamingCollected_;
  auto hints = currentHints(keysOf(emitted));
  co_await route(std::move(emitted), hints.value_or(RoutingHints{}));
  co_return true;
}

Task<void> Actor::route(Json outputs, RoutingHints hints) {
  co_await host_.sendOutputs(node_.id, std::move(outputs), std::move(hints));
}

long long Actor::mintIterationToken(const std::string& root,
                                    const std::string& parentKey) {
  long long& next = iterationCounters_[root][parentKey];
  return next++;
}

std::optional<Json> Actor::mintIterationFrameOverrides(const Json& frame) {
  if (!correlation_ || !node_.hasOutputCorrelation) return std::nullopt;
  std::string parentKey;
  if (!correlation_->invocationScope.empty() && currentInvocationLineage_) {
    parentKey = projectLineageKey(*currentInvocationLineage_,
                                  correlation_->invocationScope);
  }
  OMap<std::vector<std::string>> groups;
  for (const auto& handle : keysOf(frame)) {
    const OutputCorrelation* corr = node_.correlationFor(handle);
    if (!corr || corr->kind != "iteration") continue;
    groups.at(iterationRootId(node_.id, handle, corr->group)).push_back(handle);
  }
  if (groups.empty()) return std::nullopt;
  lastMintedFrameTokens_.clear();
  Json overrides = Json::object();
  for (const auto& [root, handles] : groups) {
    long long index = mintIterationToken(root, parentKey);
    for (const auto& h : handles) {
      if (h == "index") overrides[h] = index;
    }
    lastMintedFrameTokens_[root] = index;
  }
  if (overrides.empty()) return std::nullopt;
  return overrides;
}

std::map<std::string, Lineage> Actor::correlatedOutputLineage(
    const Lineage& invocation, const std::vector<std::string>& handles) {
  std::map<std::string, Lineage> perSlot;
  std::map<std::string, long long> groupTokens;
  const Scope& scope = correlation_->invocationScope;
  std::string parentKey = scope.empty() ? "" : projectLineageKey(invocation, scope);
  for (const auto& handle : handles) {
    const OutputCorrelation* corr = node_.correlationFor(handle);
    if (!corr || corr->kind != "iteration") {
      perSlot[handle] = invocation;
      continue;
    }
    std::string root = iterationRootId(node_.id, handle, corr->group);
    auto it = groupTokens.find(root);
    long long index;
    if (it != groupTokens.end()) {
      index = it->second;
    } else {
      auto minted = lastMintedFrameTokens_.find(root);
      index = minted != lastMintedFrameTokens_.end()
                  ? minted->second
                  : mintIterationToken(root, parentKey);
      groupTokens[root] = index;
    }
    Lineage l = invocation;
    l[root] = index;
    perSlot[handle] = l;
  }
  return perSlot;
}

std::optional<RoutingHints> Actor::currentHints(
    const std::vector<std::string>& handles) {
  if (!currentInvocationLineage_) return std::nullopt;
  RoutingHints hints;
  hints.invocationLineage = currentInvocationLineage_;
  if (correlation_ && !handles.empty()) {
    hints.perSlotLineage = correlatedOutputLineage(*currentInvocationLineage_, handles);
  }
  return hints;
}

std::optional<Lineage> Actor::computeInvocationLineage() {
  if (correlation_ && inCorrelatedBuffered_) return correlatedInvocationLineage();
  std::vector<std::string> handles;
  for (const auto& [h, _] : lastEnvelopes_) {
    if (h != "__control__" && !listInputHandles_.count(h)) handles.push_back(h);
  }
  if (handles.size() != 1) return std::nullopt;
  return lastEnvelopes_.find(handles[0])->lineage;
}

Lineage Actor::correlatedInvocationLineage() {
  Lineage out;
  const Scope& scope = correlation_->invocationScope;
  if (scope.empty()) return out;
  for (const auto& [_, env] : lastEnvelopes_) {
    for (const auto& root : scope) {
      auto it = env.lineage.find(root);
      if (it != env.lineage.end()) out[root] = it->second;
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// Messages
// ---------------------------------------------------------------------------

void Actor::emitNodeStatus(const std::string& status, const Json& result,
                           const std::optional<std::string>& error) {
  Json msg = Json::object();
  msg["type"] = "node_update";
  msg["node_id"] = node_.id;
  msg["node_name"] = node_.label();
  msg["node_type"] = node_.type;
  msg["status"] = status;
  msg["result"] = result;
  msg["error"] = error ? Json(*error) : Json(nullptr);
  msg["properties"] = node_.properties.is_object() ? node_.properties : Json(nullptr);
  msg["provider_cost"] = nullptr;
  host_.emitMessage(std::move(msg));
}

void Actor::emitGenerationComplete(const Json& outputs, const Json* inputs) {
  if (isConstantOrInput(node_.type)) return;
  emitGenerationCompleteWith(outputs, inputs ? scalarInputProperties(*inputs) : Json(nullptr));
}

void Actor::emitGenerationCompleteWith(const Json& outputs, Json properties) {
  if (isConstantOrInput(node_.type)) return;
  Json msg = Json::object();
  msg["type"] = "generation_complete";
  msg["node_id"] = node_.id;
  msg["node_name"] = node_.label();
  msg["node_type"] = node_.type;
  msg["outputs"] = outputs;
  msg["properties"] = std::move(properties);
  host_.emitMessage(std::move(msg));
}

}  // namespace gr
