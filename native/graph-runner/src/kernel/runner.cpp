#include "kernel/runner.h"

#include "kernel/normalize.h"
#include "kernel/subgraph.h"

#include <algorithm>
#include <unordered_map>

namespace gr {
namespace {

const char* kLog = "nodetool.kernel.runner";
constexpr auto kEdgeUpdateMinInterval = std::chrono::milliseconds(1000);
const char* kOutputType = "nodetool.output.Output";
const char* kSetVariableType = "nodetool.variable.SetVariable";

// _variableChannelName: the trimmed `name` property of a Set Variable node.
std::string variableChannelName(const Node& node) {
  if (!node.properties.is_object() || !node.properties.contains("name") ||
      !node.properties["name"].is_string()) {
    return "";
  }
  std::string name = node.properties["name"].get<std::string>();
  const char* ws = " \t\n\r\f\v";
  size_t a = name.find_first_not_of(ws);
  if (a == std::string::npos) return "";
  size_t b = name.find_last_not_of(ws);
  return name.substr(a, b - a + 1);
}

bool startsWith(const std::string& s, const char* prefix) {
  return s.rfind(prefix, 0) == 0;
}

bool endsWith(const std::string& s, const std::string& suffix) {
  return s.size() >= suffix.size() &&
         s.compare(s.size() - suffix.size(), suffix.size(), suffix) == 0;
}

std::string trim(const std::string& s) {
  auto b = s.find_first_not_of(" \t\n\r\f\v");
  if (b == std::string::npos) return "";
  auto e = s.find_last_not_of(" \t\n\r\f\v");
  return s.substr(b, e - b + 1);
}

bool hasDefinedOwn(const Json& obj, const std::string& key) {
  return obj.is_object() && obj.contains(key);
}

std::string propertyName(const Node& node) {
  if (node.properties.is_object() && node.properties.contains("name") &&
      node.properties["name"].is_string()) {
    return trim(node.properties["name"].get<std::string>());
  }
  return "";
}

std::string clientFacingOutputName(const Node& node, const std::string& handle) {
  std::string key = propertyName(node);
  if (node.type == kOutputType || endsWith(node.type, ".output.Output") ||
      node.type == "nodetool.workflows.base_node.Preview" ||
      endsWith(node.type, ".workflows.base_node.Preview")) {
    return key.empty() ? handle : key;
  }
  return handle;
}

std::optional<bool> optBool(const Json& obj, const char* key) {
  if (!obj.is_object()) return std::nullopt;
  auto it = obj.find(key);
  if (it == obj.end() || !it->is_boolean()) return std::nullopt;
  return it->get<bool>();
}

std::vector<std::pair<std::string, OutputCorrelation>> parseCorrelation(
    const Json& j) {
  std::vector<std::pair<std::string, OutputCorrelation>> out;
  if (!j.is_object()) return out;
  for (const auto& [handle, c] : j.items()) {
    OutputCorrelation oc;
    oc.kind = c.value("kind", std::string("single"));
    if (c.contains("source") && c["source"].is_string()) oc.source = c["source"];
    if (c.contains("group") && c["group"].is_string()) oc.group = c["group"];
    if (c.contains("collapse") && c["collapse"].is_string()) {
      oc.collapse = c["collapse"];
    }
    out.push_back({handle, oc});
  }
  return out;
}

Json outputFlags() {
  return Json{{"is_streaming_input", false},
              {"is_streaming_output", true},
              {"is_controlled", false},
              {"is_join_node", false},
              {"is_trigger", false},
              {"retry_safe", false},
              {"always_emit_output_updates", false},
              {"input_mode", "buffered"},
              {"output_correlation",
               {{"output", {{"kind", "forward"}, {"source", "value"}}}}},
              {"append_static_inputs", Json::array()},
              {"has_run", false}};
}

// The registry entry of audio-nodes' OutputNode, which the kernel runs
// natively (createGraphNodeTypeResolver's output for it).
Json outputType() {
  return Json{{"nodeType", kOutputType},
              {"propertyTypes", {{"name", "str"}, {"value", "any"}, {"description", "str"}}},
              {"outputs", {{"output", "any"}}},
              {"supportsDynamicInputs", false},
              {"descriptorDefaults",
               {{"name", "Output"},
                {"is_streaming_input", false},
                {"is_streaming_output", true},
                {"is_controlled", false},
                {"is_join_node", false},
                {"is_trigger", false},
                {"retry_safe", false},
                {"input_mode", "buffered"},
                {"output_correlation",
                 {{"output", {{"kind", "forward"}, {"source", "value"}}}}}}}};
}

Json issuesToJson(const std::vector<ValidationIssue>& issues) {
  Json out = Json::array();
  for (const auto& i : issues) {
    if (!i.nodeId) continue;
    out.push_back({{"node_id", *i.nodeId},
                   {"node_type", i.nodeType ? Json(*i.nodeType) : Json(nullptr)},
                   {"property", i.property},
                   {"message", i.message}});
  }
  return out;
}

}  // namespace

// ---------------------------------------------------------------------------
// GuestCatalog
// ---------------------------------------------------------------------------

std::optional<Json> GuestCatalog::describe(const Json& node) {
  if (node.value("type", std::string()) == kOutputType) return outputFlags();
  return guest_.describe(node);
}

const Json& GuestCatalog::table() {
  if (!types_) types_ = guest_.types();
  return *types_;
}

std::optional<Json> GuestCatalog::resolve(const std::string& type) {
  if (type == kOutputType) return outputType();
  const Json& t = table();
  auto it = t.find(type);
  if (it == t.end() || !it->is_object()) return std::nullopt;
  return *it;
}

std::vector<std::string> GuestCatalog::types() {
  std::vector<std::string> out;
  for (const auto& [type, _] : table().items()) out.push_back(type);
  out.push_back(kOutputType);
  return out;
}

Json GuestCatalog::validate(const Json& node,
                            const std::vector<std::string>& connected) {
  if (node.value("type", std::string()) == kOutputType) return Json::array();
  return guest_.validate(node, connected);
}

namespace {

// A coroutine of its own, so its arguments live in its frame.
Task<Json> outputValue(Guest* guest, std::string nodeId, Json value) {
  js::Engine& e = guest->engine();
  Guest::Passed in = Guest::pass(e, value);
  co_return co_await guest->callSettled(
      e.call(guest->api("outputValue"), e.undefined(), {e.string(nodeId), in.text, in.blobs}));
}

}  // namespace

void GuestCatalog::variableChannel(const std::string& op, const std::string& name) {
  js::Engine& e = guest_.engine();
  js::Value fn = guest_.api("variableChannel");
  if (e.isFunction(fn)) e.call(fn, e.undefined(), {e.string(op), e.string(name)});
}

std::unique_ptr<Executor> GuestCatalog::create(const Json& node) {
  if (node.value("type", std::string()) == kOutputType) {
    OutputValueStep step;
    js::Engine& e = guest_.engine();
    if (e.isFunction(guest_.api("outputValue"))) {
      Guest* guest = &guest_;
      step = [guest, id = node.value("id", std::string())](Json value) {
        return outputValue(guest, id, std::move(value));
      };
    }
    return makeOutputExecutor(node.contains("properties") ? node["properties"] : Json(),
                              std::move(step));
  }
  if (!guest_.describe(node)) {
    throw std::runtime_error("Unknown node type: " + node.value("type", std::string()));
  }
  return guest_.create(node);
}

// ---------------------------------------------------------------------------
// Runner
// ---------------------------------------------------------------------------

Runner::Runner(NodeCatalog& catalog, Emit emit, RunOptions options)
    : catalog_(catalog), emit_(std::move(emit)), options_(std::move(options)) {}

Runner::~Runner() = default;

void Runner::emit(Json msg) { emit_(msg); }

void Runner::emitJobUpdate(const std::string& status,
                           const std::optional<std::string>& error,
                           const Json* validationIssues) {
  Json msg = Json::object();
  msg["type"] = "job_update";
  msg["status"] = status;
  msg["job_id"] = options_.jobId;
  msg["workflow_id"] = options_.workflowId;
  if (error) msg["error"] = *error;
  if (validationIssues) msg["validation_issues"] = *validationIssues;
  emit(std::move(msg));
}

void Runner::hydrate(std::vector<Node>& nodes) {
  for (auto& node : nodes) {
    std::optional<Json> flags = catalog_.describe(node.raw);
    const Json f = flags.value_or(Json::object());
    auto flag = [&](const char* key) {
      return optBool(f, key).value_or(optBool(node.raw, key).value_or(false));
    };
    node.isStreamingInput = flag("is_streaming_input");
    node.isStreamingOutput = flag("is_streaming_output");
    node.isControlled = flag("is_controlled");
    node.isJoinNode = flag("is_join_node");
    node.isTrigger = flag("is_trigger");
    node.retrySafe = optBool(f, "retry_safe").value_or(false);
    node.alwaysEmitOutputUpdates = flag("always_emit_output_updates");
    if (f.contains("input_mode") && f["input_mode"].is_string()) {
      node.inputMode = f["input_mode"];
    } else if (node.raw.contains("input_mode") && node.raw["input_mode"].is_string()) {
      node.inputMode = node.raw["input_mode"];
    }
    const Json* corr = nullptr;
    if (f.contains("output_correlation") && f["output_correlation"].is_object()) {
      corr = &f["output_correlation"];
    } else if (node.raw.contains("output_correlation") &&
               node.raw["output_correlation"].is_object()) {
      corr = &node.raw["output_correlation"];
    }
    if (corr) {
      node.outputCorrelation = parseCorrelation(*corr);
      node.hasOutputCorrelation = true;
    }
    if (f.contains("append_static_inputs") && f["append_static_inputs"].is_array()) {
      for (const auto& h : f["append_static_inputs"]) {
        if (h.is_string()) node.appendStaticInputs.push_back(h);
      }
    }
  }
}

Task<RunStatus> Runner::run(Json graphDoc, Json params) {
  if (!params.is_object()) params = Json::object();
  if (!options_.rootJobId) options_.rootJobId = options_.jobId;
  logLine("INFO", kLog,
          "Workflow started " +
              Json{{"jobId", options_.jobId}, {"workflowId", options_.workflowId}}
                  .dump());
  emitJobUpdate("running", std::nullopt, nullptr);

  std::optional<std::string> failure;
  std::optional<Json> validationIssues;
  try {
    graphDoc = normalizeGraph(
        graphDoc, [this](const std::string& type) { return catalog_.resolve(type); });
    graphDoc = catalog_.prepareGraph(std::move(graphDoc));
    auto [nodes, edges] = parseGraph(graphDoc);
    hydrate(nodes);
    // _filterInvalidEdges: drop edges whose endpoints do not exist.
    std::set<std::string> ids;
    for (const auto& n : nodes) ids.insert(n.id);
    std::vector<Edge> valid;
    for (auto& e : edges) {
      if (ids.count(e.source) && ids.count(e.target)) valid.push_back(std::move(e));
    }
    std::set<std::string> controlled;
    for (const auto& e : valid) {
      if (e.control) controlled.insert(e.target);
    }
    for (auto& n : nodes) {
      if (controlled.count(n.id)) n.isControlled = true;

    }
    graph_ = Graph(std::move(nodes), std::move(valid));
    haveGraph_ = true;

    correlation_ = analyzeCorrelation(graph_);
    if (!correlation_.issues.empty()) {
      std::string lines;
      std::vector<ValidationIssue> issues;
      for (size_t i = 0; i < correlation_.issues.size(); ++i) {
        const auto& is = correlation_.issues[i];
        lines += (i ? "\n" : "") + std::string("  - ") + is.message;
        if (is.nodeId) {
          issues.push_back({is.nodeId, is.nodeType, is.handle.value_or(""), is.message});
        }
      }
      throw GraphValidationError("Correlation analysis failed:\n" + lines, issues);
    }

    for (const auto& e : graph_.edges()) {
      if (e.source == e.target) {
        throw GraphValidationError(
            "Edge " + e.key() + " connects node \"" + e.source +
                "\" to itself; self-loop edges are not supported",
            {{e.source, std::nullopt, e.targetHandle, "Self-loop edges are not supported"}});
      }
    }

    validateNodes();
    validateRequiredInputs(params);
    detectMultiEdgeListInputs();
    initializeInboxes();
    if (options_.executionPolicy) {
      options_.executionPolicy->executionScope = options_.executionScope;
      // Descendants keep the root's decision ceiling and serialization state.
      // Only a new root submission starts a new decision budget.
      if (options_.innerGraphDepth == 0) {
        options_.executionPolicy->decisionBudget = std::make_shared<SupervisorDecisionBudget>();
      }
      options_.executionPolicy->retries.clear();
      options_.executionPolicy->sticky.clear();
    }
    // Public runs carry the granted owner in their policy. Policy-free kernel
    // runs use the context's default owner. An explicit empty owner stays empty.
    const std::string owner = options_.executionPolicy ? options_.executionPolicy->userId : "default";
    const auto scope = Json::parse(options_.executionScope);
    if (!scope.is_array()) throw GraphValidationError("Execution scope must be a path");
    const auto durableAddress = scope.empty()
      ? DurableDelivery::address(owner, options_.workflowId, *options_.rootJobId)
      : Json::array({owner,options_.workflowId,*options_.rootJobId,scope}).dump();
    durableDelivery_ = std::make_unique<DurableDelivery>(options_.durableState,durableAddress);
    for (auto& [id, inbox] : inboxes_) durableDelivery_->restore(id, *inbox);
    // A cancel before the inboxes existed could not close them.
    if (cancelled_) {
      for (auto& [_, inbox] : inboxes_) inbox->closeAll();
    }
    co_await initializeGraph();
    co_await dispatchInputs(params);
    // _registerVariableChannels: readers of a channel no Set Variable writes
    // to end at once instead of waiting.
    for (const auto& node : graph_.nodes()) {
      if (node.type != kSetVariableType) continue;
      std::string name = variableChannelName(node);
      if (!name.empty()) catalog_.variableChannel("register", name);
    }
    co_await processGraph();
    drainActiveEdges();
  } catch (const GraphValidationError& e) {
    failure = e.what();
    validationIssues = e.issues.empty() ? Json(nullptr) : issuesToJson(e.issues);
  } catch (const std::exception& e) {
    failure = e.what();
    validationIssues = Json(nullptr);
  }

  if (failure) {
    logLine("ERROR", kLog,
            "Workflow failed " + Json{{"jobId", options_.jobId}, {"error", *failure}}.dump());
    drainActiveEdges();
    emitJobUpdate("failed", failure, &*validationIssues);
    co_return RunStatus::Failed;
  }

  if (!cancelled_ && !nodeErrors_.empty()) {
    std::string error;
    for (size_t i = 0; i < nodeErrors_.size(); ++i) {
      error += (i ? "; " : "") + std::string("Node \"") + nodeErrors_[i].first +
               "\" failed: " + nodeErrors_[i].second;
    }
    logLine("ERROR", kLog,
            "Workflow failed " + Json{{"jobId", options_.jobId}, {"error", error}}.dump());
    emitJobUpdate("failed", error, nullptr);
    co_return RunStatus::Failed;
  }

  const char* status = cancelled_ ? "cancelled" : "completed";
  logLine("INFO", kLog,
          "Workflow completed " + Json{{"jobId", options_.jobId}, {"status", status}}.dump());
  emitJobUpdate(status, std::nullopt, nullptr);
  co_return cancelled_ ? RunStatus::Cancelled : RunStatus::Completed;
}

void Runner::cancel() {
  if (cancelled_) return;
  logLine("INFO", kLog, "Job cancelled " + Json{{"jobId", options_.jobId}}.dump());
  cancelled_ = true;
  for (auto& [_, inbox] : inboxes_) inbox->closeAll();
  notifyCancelListeners();
}

void Runner::validateNodes() {
  std::map<std::string, std::vector<std::string>> connected;
  for (const auto& e : graph_.edges()) {
    if (!e.isData()) continue;
    auto& v = connected[e.target];
    if (std::find(v.begin(), v.end(), e.targetHandle) == v.end()) {
      v.push_back(e.targetHandle);
    }
  }
  std::vector<ValidationIssue> issues;
  for (const auto& node : graph_.nodes()) {
    Json found = catalog_.validate(node.raw, connected[node.id]);
    for (const auto& i : found) {
      ValidationIssue issue;
      issue.nodeId = i.contains("nodeId") && i["nodeId"].is_string()
                         ? i["nodeId"].get<std::string>()
                         : node.id;
      issue.nodeType = i.contains("nodeType") && i["nodeType"].is_string()
                           ? i["nodeType"].get<std::string>()
                           : node.type;
      issue.property = i.value("property", std::string());
      issue.message = i.value("message", std::string());
      issues.push_back(std::move(issue));
    }
  }
  if (issues.empty()) return;
  std::string lines;
  for (size_t i = 0; i < issues.size(); ++i) {
    const auto& is = issues[i];
    lines += (i ? "\n" : "") + std::string("  - ") + is.message + " on node \"" +
             *is.nodeId + "\"" + (is.nodeType ? " (" + *is.nodeType + ")" : "");
  }
  throw GraphValidationError("Graph validation failed with " +
                                 std::to_string(issues.size()) + " issue(s):\n" + lines,
                             issues);
}

bool Runner::isExternalInputNode(const Node& node) const {
  return startsWith(node.type, "nodetool.input.") || node.type == "test.Input";
}

std::string Runner::externalInputName(const Node& node) const {
  std::string name = propertyName(node);
  if (!name.empty()) return name;
  return node.name.value_or(node.id);
}

void Runner::validateRequiredInputs(const Json& params) {
  std::set<std::string> withData;
  std::set<std::string> withControl;
  for (const auto& e : graph_.edges()) {
    (e.isData() ? withData : withControl).insert(e.target);
  }
  std::vector<std::string> missing;
  std::vector<ValidationIssue> issues;
  for (const auto& node : graph_.nodes()) {
    if (!startsWith(node.type, "nodetool.input.")) continue;
    if (node.isStreamingOutput) continue;
    if (withData.count(node.id) || withControl.count(node.id)) continue;
    std::string name = externalInputName(node);
    if (hasDefinedOwn(params, name) || hasDefinedOwn(node.properties, "value")) continue;
    if (std::find(missing.begin(), missing.end(), name) == missing.end()) {
      missing.push_back(name);
    }
    issues.push_back({node.id, node.type, "value",
                      "Missing required workflow input \"" + name + "\""});
  }
  if (issues.empty()) return;
  std::string list;
  for (size_t i = 0; i < missing.size(); ++i) list += (i ? ", " : "") + missing[i];
  throw GraphValidationError("Missing required workflow inputs: " + list, issues);
}

void Runner::detectMultiEdgeListInputs() {
  std::map<std::pair<std::string, std::string>, int> byHandle;
  std::vector<std::pair<std::string, std::string>> order;
  for (const auto& e : graph_.edges()) {
    if (e.control) continue;
    auto key = std::make_pair(e.target, e.targetHandle);
    if (byHandle[key]++ == 0) order.push_back(key);
  }
  for (const auto& key : order) {
    if (byHandle[key] < 2) continue;
    const Node* node = graph_.findNode(key.first);
    if (!node) continue;
    if (node->propertyTypes.is_object() && node->propertyTypes.contains(key.second) &&
        node->propertyTypes[key.second].is_string()) {
      std::string t = node->propertyTypes[key.second];
      if (!t.empty() && !isListTypeString(t)) continue;
    }
    multiEdgeListInputs_[key.first].insert(key.second);
  }
}

void Runner::initializeInboxes() {
  bool loops = false;
  for (const auto& n : graph_.nodes()) loops = loops || n.type == "nodetool.control.Loop";
  if (loops) quiescence_ = std::make_shared<Quiescence>();
  for (const auto& node : graph_.nodes()) {
    auto inbox = std::make_unique<Inbox>();
    std::vector<std::pair<std::string, int>> counts;
    for (const Edge* e : graph_.incoming(node.id)) {
      const auto handle = e->control ? std::string("__control__") : e->targetHandle;
      auto it = std::find_if(counts.begin(), counts.end(),
                             [&](const auto& p) { return p.first == handle; });
      if (it == counts.end()) {
        counts.push_back({handle, 1});
      } else {
        ++it->second;
      }
    }
    for (const auto& [h, n] : counts) inbox->addUpstream(h, n);
    if (quiescence_) quiescence_->add(node.id,*inbox,node.type == "nodetool.control.Loop");
    inboxes_[node.id] = std::move(inbox);
  }
}

Executor& Runner::resolveExecutor(const Node& node) {
  auto it = executors_.find(node.id);
  if (it != executors_.end()) return *it->second;
  auto created = node.type == "nodetool.workflows.subgraph.Subgraph"
    ? makeSubgraphExecutor(catalog_, *this, node.id, options_)
    : catalog_.create(node.raw);
  if (!created) throw std::runtime_error("Unknown node type: " + node.type);
  // native-rules #12: lambda captures raw this and is stored in the executor, runs later
  created = statefulExecutor(std::move(created), node, options_.executionPolicy, [this] { return cancelled_; });
  Executor& ref = *created;
  executors_[node.id] = std::move(created);
  return ref;
}

Task<void> Runner::initializeGraph() {
  std::vector<Executor*> initialized;
  for (const auto& node : graph_.nodes()) {
    Executor& executor = resolveExecutor(node);
    std::optional<std::string> error;
    try {
      co_await executor.initialize();
      initialized.push_back(&executor);
    } catch (const std::exception& e) {
      error = e.what();
    }
    if (error) {
      for (Executor* ex : initialized) {
        try {
          co_await ex->finalize();
        } catch (const std::exception& e) {
          logLine("WARN", kLog, std::string("Executor finalize failed ") + e.what());
        }
      }
      throw std::runtime_error("Node \"" + node.name.value_or(node.id) + "\" (" +
                               node.type + ") failed to initialize: " + *error);
    }
  }
}

Task<void> Runner::dispatchInputs(Json params) {
  for (const auto& node : graph_.nodes()) {
    if (!graph_.incomingData(node.id).empty()) continue;
    bool controlIn = false;
    for (const Edge* e : graph_.incoming(node.id)) controlIn = controlIn || e->control;
    if (controlIn) continue;
    if (!isExternalInputNode(node)) continue;
    if (cancelled_) co_return;

    std::string name = externalInputName(node);
    bool hasParam = hasDefinedOwn(params, name);
    bool hasDefault = hasDefinedOwn(node.properties, "value");
    if (!hasParam && (node.isStreamingOutput || !hasDefault)) continue;
    Json value = hasParam ? params[name] : node.properties["value"];

    Executor& executor = resolveExecutor(node);
    Json outputs;
    std::optional<std::string> error;
    try {
      outputs = co_await executor.process(Json{{"value", value}});
    } catch (const std::exception& e) {
      error = e.what();
    }
    if (error) {
      throw std::runtime_error("Input node \"" + node.name.value_or(node.id) + "\" (" +
                               node.type + ") failed: " + *error);
    }
    if (!outputs.is_object()) outputs = Json::object();
    bool outputsEmpty = true;
    for (const auto& [k, v] : outputs.items()) outputsEmpty = false;

    std::vector<const Edge*> out;
    for (const Edge* e : graph_.outgoing(node.id)) {
      if (e->isData()) out.push_back(e);
    }
    // One shared value per handle, read by every edge from it.
    std::map<std::string, SharedValue> shared;
    std::optional<SharedValue> sharedInput;
    for (const Edge* e : out) {
      bool hasHandle = outputs.contains(e->sourceHandle);
      if (!outputsEmpty && !hasHandle) continue;
      auto it = inboxes_.find(e->target);
      if (it != inboxes_.end()) {
        SharedValue delivered;
        if (hasHandle) {
          auto found = shared.find(e->sourceHandle);
          if (found == shared.end()) {
            found = shared.emplace(e->sourceHandle, SharedValue(outputs[e->sourceHandle])).first;
          }
          delivered = found->second;
        } else {
          if (!sharedInput) sharedInput.emplace(value);
          delivered = *sharedInput;
        }
        durableDelivery_->put(e->target, *it->second, e->targetHandle, std::move(delivered), {}, e->key());
      }
      incrementEdgeCounter(*e);
    }
    if (!node.isStreamingOutput) {
      for (const Edge* e : out) {
        auto it = inboxes_.find(e->target);
        if (it != inboxes_.end()) it->second->markSourceDone(e->targetHandle);
      }
    }
  }
}

Task<void> Runner::processGraph() {
  std::vector<Task<void>> tasks;
  std::vector<Executor*> inputExecutors;
  for (const auto& node : graph_.nodes()) {
    bool anyIncoming = !graph_.incoming(node.id).empty();
    if (!anyIncoming && isExternalInputNode(node)) {
      inputExecutors.push_back(&resolveExecutor(node));
      continue;
    }
    tasks.push_back(runActor(&node));
  }
  for (auto& t : tasks) co_await t;
  for (Executor* ex : inputExecutors) {
    try {
      co_await ex->finalize();
    } catch (const std::exception& e) {
      logLine("WARN", kLog, std::string("Executor finalize failed ") + e.what());
    }
  }
  // Backstop: release any reader still waiting on a channel.
  catalog_.variableChannel("closeAll", "");
  std::vector<std::string> pending;
  for (const auto& [id, inbox] : inboxes_) {
    if (inbox->hasPendingWork()) pending.push_back(id);
  }
  if (!pending.empty()) {
    logLine("WARN", kLog,
            "Pending inbox work detected after all actors completed — possible data loss " +
                Json{{"pendingNodes", pending}}.dump());
  }
}

Task<void> Runner::runActor(const Node* node) {
  if (quiescence_) quiescence_->start(node->id);
  Inbox& inbox = *inboxes_.at(node->id);
  Executor& executor = resolveExecutor(*node);
  auto cit = correlation_.nodes.find(node->id);
  const NodeAnalysis* analysis = cit == correlation_.nodes.end() ? nullptr : &cit->second;
  std::set<std::string> lists;
  if (auto it = multiEdgeListInputs_.find(node->id); it != multiEdgeListInputs_.end()) {
    lists = it->second;
  }
  actors_.push_back(
      std::make_unique<Actor>(*this, *node, inbox, executor, analysis, lists));
  Actor& actor = *actors_.back();
  try {
    ActorResult result = co_await actor.run();
    if (result.error) {
      auto it = std::find_if(nodeErrors_.begin(), nodeErrors_.end(),
                             [&](const auto& p) { return p.first == node->id; });
      if (it == nodeErrors_.end()) {
        nodeErrors_.push_back({node->id, *result.error});
      } else {
        it->second = *result.error;
      }
    }
    if (!result.error && !cancelled_) durableDelivery_->acknowledge(node->id);
    if (quiescence_) quiescence_->finish(node->id);
    sendEos(node->id);
    // The last Set Variable writer of a channel closes it, so its readers
    // drain and end.
    if (node->type == kSetVariableType) {
      std::string name = variableChannelName(*node);
      if (!name.empty()) catalog_.variableChannel("done", name);
    }
    collectOutputs(*node, result);
  } catch (const std::exception& e) {
    logLine("ERROR", kLog, "Actor completion handling failed " + std::string(e.what()));
    auto it = std::find_if(nodeErrors_.begin(), nodeErrors_.end(),
                           [&](const auto& p) { return p.first == node->id; });
    if (it == nodeErrors_.end()) nodeErrors_.push_back({node->id, e.what()});
  }
}

// _isOutputNode and the collection in _processGraph: a node without
// outgoing data edges contributes one entry per invocation. A node that
// failed or never ran still creates its key.
void Runner::collectOutputs(const Node& node, const ActorResult& result) {
  for (const Edge* e : graph_.outgoing(node.id)) {
    if (e->isData()) return;
  }
  const std::string key = outputCollectionKey(node);
  if (!outputs_.contains(key)) outputs_[key] = Json::array();
  Json& values = outputs_[key];
  auto append = [&values](const Json& outputs) {
    if (!outputs.is_object()) return;
    for (const auto& [_, v] : outputs.items()) values.push_back(v);
  };
  if (result.invocationOutputs.empty()) {
    append(result.outputs);
  } else {
    for (const auto& outputs : result.invocationOutputs) append(outputs);
  }
}

// _outputCollectionKey: an Output node's `name` property, else the node's
// name, else its id. The property wins: a saved workflow carries the type
// title ("Output") as the node name.
std::string Runner::outputCollectionKey(const Node& node) const {
  if (startsWith(node.type, "nodetool.output.")) {
    std::string name = propertyName(node);
    if (!name.empty()) return name;
  }
  if (node.name && !trim(*node.name).empty()) return *node.name;
  return node.id;
}

// ---------------------------------------------------------------------------
// Routing
// ---------------------------------------------------------------------------

Task<void> Runner::sendOutputs(std::string nodeId, Json outputs,
                               RoutingHints hints) {
  const Node* source = graph_.findNode(nodeId);
  // Each data output read by an edge becomes one SharedValue, which every
  // edge from that handle and the output_update share, so a fan-out of N
  // edges copies nothing.
  std::unordered_map<std::string, SharedValue> shared;
  auto sharedOutput = [&](const std::string& handle) -> SharedValue& {
    auto found = shared.find(handle);
    if (found == shared.end()) {
      found = shared.emplace(handle, SharedValue(std::move(outputs[handle]))).first;
    }
    return found->second;
  };
  for (const Edge* edge : graph_.outgoing(nodeId)) {
    if (edge->control) {
      const auto handle = outputs.contains("__control_output__") ? std::string("__control_output__") : edge->sourceHandle;
      if (!outputs.contains(handle)) continue;
      auto sharedHandle = shared.find(handle);
      const Json& controlValue = sharedHandle != shared.end() ? *sharedHandle->second : outputs[handle];
      if (!controlValue.is_object()) continue;
      Json event = controlValue;
      if (!event.contains("event_type") || !event["event_type"].is_string()) {
        Json properties = event.contains("properties") && event["properties"].is_object() ? event["properties"] : event;
        event = {{"event_type","run"},{"properties",properties}};
      }
      auto target = inboxes_.find(edge->target);
      if (target != inboxes_.end()) target->second->put("__control__",event,{},edge->key());
      continue;
    }
    const std::string edgeId = edge->key();
    if (hints.lineageDoneSlots.count(edge->sourceHandle)) {
      auto it = inboxes_.find(edge->target);
      if (it == inboxes_.end()) continue;
      Lineage lineage;
      if (hints.perSlotLineage) {
        auto p = hints.perSlotLineage->find(edge->sourceHandle);
        if (p != hints.perSlotLineage->end()) lineage = p->second;
      }
      Scope scope;
      auto nit = correlation_.nodes.find(edge->target);
      if (nit != correlation_.nodes.end()) {
        if (const InputAnalysis* in = nit->second.input(edge->targetHandle)) scope = in->scope;
      }
      it->second->signalLineageDone(edge->targetHandle, edgeId,
                                    tryProjectLineageKey(lineage, scope).value_or(""));
      continue;
    }
    if (!outputs.is_object() || !outputs.contains(edge->sourceHandle)) continue;
    auto it = inboxes_.find(edge->target);
    if (it == inboxes_.end()) continue;
    Lineage lineage;
    bool found = false;
    if (hints.perSlotLineage) {
      auto p = hints.perSlotLineage->find(edge->sourceHandle);
      if (p != hints.perSlotLineage->end()) {
        lineage = p->second;
        found = true;
      }
    }
    if (!found && hints.invocationLineage) lineage = *hints.invocationLineage;
    durableDelivery_->put(edge->target, *it->second, edge->targetHandle,
                          sharedOutput(edge->sourceHandle), lineage, edgeId);
    incrementEdgeCounter(*edge);
  }

  if (source && !startsWith(source->type, "nodetool.constant.") &&
      !startsWith(source->type, "nodetool.input.") && outputs.is_object()) {
    for (auto&& [handle, value] : outputs.items()) {
      if (handle == "__control__" || handle == "__control_output__") continue;
      auto sharedValue = shared.find(handle);
      if (!source->alwaysEmitOutputUpdates) {
        bool connected = false;
        for (const Edge* e : graph_.edgesFrom(nodeId, handle)) {
          connected = connected || e->isData();
        }
        if (connected) continue;
      }
      Json declared = source->outputs.is_object() && source->outputs.contains(handle)
                          ? source->outputs[handle]
                          : Json("any");
      Json msg = Json::object();
      msg["type"] = "output_update";
      msg["node_id"] = nodeId;
      msg["node_name"] = source->name.value_or(nodeId);
      msg["output_name"] = clientFacingOutputName(*source, handle);
      msg["value"] = Json();
      msg["output_type"] = declared;
      msg["metadata"] = Json::object();
      msg["disposition"] = "append";
      if (sharedValue == shared.end()) {
        msg["value"] = std::move(value);
        emit(std::move(msg));
      } else {
        // The edges hold the value. The message borrows it for the
        // synchronous emit and gives it back, instead of copying it.
        sharedValue->second.lend([&](Json& lent) {
          std::swap(msg["value"], lent);
          emit_(msg);
          std::swap(msg["value"], lent);
        });
      }
    }
  }
  co_return;
}

bool Runner::markEdgeSourceDoneOnce(const Edge& edge) {
  if (!eosSentEdges_.insert(edge.key()).second) return false;
  auto it = inboxes_.find(edge.target);
  if (it != inboxes_.end()) it->second->markSourceDone(edge.control ? "__control__" : edge.targetHandle);
  return true;
}

void Runner::signalSlotEos(const std::string& nodeId, const std::string& slot) {
  for (const Edge* e : graph_.edgesFrom(nodeId, slot)) {
    if (e->control) continue;
    markEdgeSourceDoneOnce(*e);
  }
}

void Runner::sendEos(const std::string& nodeId) {
  for (const Edge* edge : graph_.outgoing(nodeId)) {
    if (edge->control) { markEdgeSourceDoneOnce(*edge); continue; }
    markEdgeSourceDoneOnce(*edge);
    const std::string edgeId = edge->key();
    auto it = inboxes_.find(edge->target);
    auto nit = correlation_.nodes.find(nodeId);
    if (it != inboxes_.end() && nit != correlation_.nodes.end()) {
      if (const OutputAnalysis* out = nit->second.output(edge->sourceHandle)) {
        for (const auto& root : out->possibleChildRoots) {
          it->second->signalLineageScopeClosed(edge->targetHandle, edgeId, "", root);
        }
      }
    }
    edgeDirty_.erase(std::remove(edgeDirty_.begin(), edgeDirty_.end(), edgeId),
                     edgeDirty_.end());
    auto c = edgeCounters_.find(edgeId);
    Json msg = Json::object();
    msg["type"] = "edge_update";
    msg["job_id"] = options_.jobId;
    msg["edge_id"] = edgeId;
    msg["status"] = "completed";
    msg["counter"] = c == edgeCounters_.end() ? Json(nullptr) : Json(c->second);
    emit(std::move(msg));
  }
}

void Runner::incrementEdgeCounter(const Edge& edge) {
  const std::string id = edge.key();
  long long counter = ++edgeCounters_[id];
  auto now = std::chrono::steady_clock::now();
  auto last = edgeLastEmit_.find(id);
  if (last != edgeLastEmit_.end() && now - last->second < kEdgeUpdateMinInterval) {
    if (std::find(edgeDirty_.begin(), edgeDirty_.end(), id) == edgeDirty_.end()) {
      edgeDirty_.push_back(id);
    }
    return;
  }
  edgeLastEmit_[id] = now;
  edgeDirty_.erase(std::remove(edgeDirty_.begin(), edgeDirty_.end(), id),
                   edgeDirty_.end());
  Json msg = Json::object();
  msg["type"] = "edge_update";
  msg["job_id"] = options_.jobId;
  msg["edge_id"] = id;
  msg["status"] = "active";
  msg["counter"] = counter;
  emit(std::move(msg));
}

void Runner::flushEdgeCounters() {
  for (const auto& id : edgeDirty_) {
    auto c = edgeCounters_.find(id);
    Json msg = Json::object();
    msg["type"] = "edge_update";
    msg["job_id"] = options_.jobId;
    msg["edge_id"] = id;
    msg["status"] = "active";
    msg["counter"] = c == edgeCounters_.end() ? Json(nullptr) : Json(c->second);
    emit(std::move(msg));
  }
  edgeDirty_.clear();
}

void Runner::drainActiveEdges() {
  if (!haveGraph_ || graph_.edges().empty()) return;
  flushEdgeCounters();
  for (const auto& edge : graph_.edges()) {
    auto it = inboxes_.find(edge.target);
    if (it == inboxes_.end()) continue;
    if (it->second->hasBuffered(edge.targetHandle) || it->second->isOpen(edge.targetHandle)) {
      const std::string id = edge.key();
      auto c = edgeCounters_.find(id);
      Json msg = Json::object();
      msg["type"] = "edge_update";
      msg["job_id"] = options_.jobId;
      msg["edge_id"] = id;
      msg["status"] = "drained";
      msg["counter"] = c == edgeCounters_.end() ? Json(nullptr) : Json(c->second);
      emit(std::move(msg));
    }
  }
}

}  // namespace gr
