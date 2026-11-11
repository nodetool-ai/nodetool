#include "nodetool/graph_runner.h"
#include "kernel/actor.h"
#include "kernel/state_executor.h"

#include <algorithm>
#include <condition_variable>
#include <iostream>
#include <mutex>
#include <stdexcept>

namespace {
using gr::Json;
// native-rules #14: file-scope mutable test counters
int checks = 0;
void check(bool condition, const char* message) {
  ++checks;
  if (!condition) throw std::runtime_error(message);
}
struct Result {
  std::string status;
  Json outputs = Json::object();
  std::vector<Json> messages;
};
Result run(gr::GraphRunner& runner, const Json& graph, const std::string& job) {
  Result result;
  std::mutex mutex;
  std::condition_variable cv;
  bool finished = false;
  runner.submit(job, "controlled-supervisor", graph.dump(), "{}",
    [&](const std::string& text, bool last) {
      std::lock_guard lock(mutex);
      auto message = Json::parse(text);
      if (message.value("type", "") == "job_update") {
        const auto status = message.value("status", "");
        if (status == "completed" || status == "failed" || status == "cancelled") result.status = status;
        if (message.contains("result") && message["result"].contains("outputs")) result.outputs = message["result"]["outputs"];
      }
      result.messages.push_back(std::move(message));
      if (last) { finished = true; cv.notify_all(); }
    });
  std::unique_lock lock(mutex);
  if (!cv.wait_for(lock, std::chrono::seconds(20), [&] { return finished; })) {
    lock.unlock(); runner.cancel(job); lock.lock();
    cv.wait(lock, [&] { return finished; });
    throw std::runtime_error("controlled supervisor job timed out");
  }
  return result;
}
Json controlledGraph(bool varying = false) {
  Json source = {{"id", "events"}, {"type", "nodetool.control.RepeatValue"},
    {"properties", {{"count", 3}, {"value", Json::object()}}}};
  if (varying) {
    source["type"] = "nodetool.control.ForEach";
    source["properties"] = {{"input_list", Json::array({{{"value", "bad"}}, {{"value", "good"}}, {{"value", "bad"}}, {{"value", "good"}}})}};
  }
  return {{"nodes", Json::array({source,
    {{"id", "pick"}, {"type", "nodetool.constant.Select"}, {"properties", {{"value", "bad"}, {"options", Json::array({"good"})}}}},
    {{"id", "collect"}, {"type", "nodetool.control.Collect"}},
    {{"id", "out"}, {"name", "selected"}, {"type", "nodetool.output.Output"}, {"properties", {{"name", "selected"}}}}
  })}, {"edges", Json::array({
    {{"id", "control"}, {"source", "events"}, {"sourceHandle", "output"}, {"target", "pick"}, {"targetHandle", "__control__"}, {"edge_type", "control"}},
    {{"id", "data"}, {"source", "pick"}, {"sourceHandle", "output"}, {"target", "collect"}, {"targetHandle", "input_item"}},
    {{"id", "collected"}, {"source", "collect"}, {"sourceHandle", "output"}, {"target", "out"}, {"targetHandle", "value"}}
  })}};
}
void loaded(gr::GraphRunner& runner) {
  check(runner.waitUntilLoaded(60000), runner.loadError().c_str());
}
void completed(const Result& result) {
  check(result.status == "completed", "controlled Skip must complete the root job");
  int terminal = 0;
  std::set<std::string> downstreamCompleted;
  for (const auto& message : result.messages) {
    if (message.value("type", "") == "job_update" && message.value("status", "") == "completed" && !message.contains("result")) ++terminal;
    if (message.value("type", "") == "node_update") {
      check(message.value("status", "") != "error", "Skip must not emit a node error");
      const auto node = message.value("node_id", "");
      if ((node == "collect" || node == "out") && message.value("status", "") == "completed") downstreamCompleted.insert(node);
    }
  }
  check(terminal == 1, "exactly one successful terminal job update");
  check(downstreamCompleted == std::set<std::string>({"collect", "out"}), "both downstream consumers must drain and complete after retired invocations");
}
std::string key(const gr::InvocationIdentity& identity) {
  return Json::array({identity.jobId, identity.executionScope, identity.nodeId, identity.invocationKey, identity.attempt, identity.invocationOccurrence}).dump();
}
void publicSkipAndRecovery(const std::string& bundle) {
  gr::HostOptions options;
  enum class Mode { Skip, RetryThenSkip, Fail } mode = Mode::Skip;
  std::vector<gr::SupervisorRequest> decisions;
  std::vector<std::string> begins, effects;
  options.supervisor.beginAttempt = [&](const gr::InvocationIdentity& identity) {
    if (identity.nodeId == "pick") begins.push_back(key(identity));
  };
  options.supervisor.effects = [&](const gr::InvocationIdentity& identity) {
    if (identity.nodeId == "pick") effects.push_back(key(identity));
    return gr::SupervisorEffects{true, 0, false};
  };
  options.supervisor.decide = [&](gr::SupervisorRequest request, std::function<bool()>, gr::SupervisorOptions::Completion done) {
    decisions.push_back(request);
    auto action = mode == Mode::Fail ? gr::SupervisorAction::Fail : gr::SupervisorAction::Skip;
    if (mode == Mode::RetryThenSkip && decisions.size() == 1) action = gr::SupervisorAction::Retry;
    done({action});
  };
  gr::GraphRunner runner(bundle, options);
  loaded(runner);
  auto result = run(runner, controlledGraph(), "three-skips");
  check(decisions.size() == 3, "RepeatValue count three must yield three admitted Skip decisions");
  completed(result);
  check(result.outputs.at("selected") == Json::array({Json::array()}), "all-skipped control events contribute no values to the downstream collector");
  auto identityCheck = [&](const std::string& job, const std::vector<int>& attempts, const std::vector<std::uint64_t>& occurrences) {
    std::vector<std::string> decided;
    check(decisions.size() == attempts.size(), "expected exact decision count");
    check(decisions.size() == occurrences.size(), "expected exact invocation occurrence count");
    for (size_t i = 0; i < decisions.size(); ++i) {
      const auto& identity = decisions[i].invocation;
      check(identity.jobId == job && identity.executionScope == "[]" && identity.nodeId == "pick" && identity.attempt == attempts[i], "controlled recovery preserves exact root scope and attempt identity");
      check(identity.invocationKey == "{}" && identity.invocationOccurrence == occurrences[i], "controlled recovery preserves lineage and distinguishes invocation occurrences");
      decided.push_back(key(identity));
    }
    check(begins == decided && effects == decided, "beginAttempt, effects, and decisions identify the same exact controlled attempts");
  };
  identityCheck("three-skips", {1, 1, 1}, {0, 1, 2});
  decisions.clear(); begins.clear(); effects.clear();
  result = run(runner, controlledGraph(true), "skip-success-skip-success");
  check(decisions.size() == 2, "both invalid events must be skipped around successful events");
  completed(result);
  check(result.outputs.at("selected") == Json::array({Json::array({"good", "good"})}), "Skip retirement must preserve both later successful downstream values in order");
  check(begins.size() == 4, "both failed and both successful control events execute once");
  decisions.clear(); begins.clear(); effects.clear(); mode = Mode::RetryThenSkip;
  result = run(runner, controlledGraph(), "retry-and-three-skips");
  completed(result);
  identityCheck("retry-and-three-skips", {1, 2, 1, 1}, {0, 0, 1, 2});
  check(std::find(decisions.front().allowedActions.begin(), decisions.front().allowedActions.end(), gr::SupervisorAction::Retry) != decisions.front().allowedActions.end(), "known zero-cost Select retry remains admitted");
  decisions.clear(); begins.clear(); effects.clear(); mode = Mode::Fail;
  result = run(runner, controlledGraph(), "controlled-fail");
  check(result.status == "failed" && decisions.size() == 1, "Fail verdict remains terminal at the first controlled event");
  identityCheck("controlled-fail", {1}, {0});
  bool original = false;
  for (const auto& message : result.messages) {
    if (message.value("type", "") == "node_update" && message.value("node_id", "") == "pick" && message.value("status", "") == "error")
      original = message.value("error", "").find("is not one of the allowed options") != std::string::npos;
  }
  check(original, "Fail must preserve the original node exception");
}

// The public control router currently supplies empty lineage. Exercise a
// nonempty lineage directly to verify the per-slot retirement contract too.
struct Host final : gr::ActorHost {
  struct Delivery { Json outputs; gr::RoutingHints hints; };
  std::vector<Delivery> deliveries;
  std::vector<Json> messages;
  gr::Task<void> sendOutputs(std::string, Json outputs, gr::RoutingHints hints) override {
    deliveries.push_back({std::move(outputs), std::move(hints)}); co_return;
  }
  void emitMessage(Json message) override { messages.push_back(std::move(message)); }
  void signalSlotEos(const std::string&, const std::string&) override {}
  bool cancelled() const override { return false; }
};
struct ControlledExecutor final : gr::Executor {
  std::vector<std::string> invocations;
  bool ordinaryError = false;
  int calls = 0, finalizations = 0;
  void beginInvocation(const std::string& value) override { invocations.push_back(value); }
  gr::Task<void> initialize() override { co_return; }
  gr::Task<void> preProcess() override { co_return; }
  gr::Task<void> finalize() override { ++finalizations; co_return; }
  gr::Task<Json> process(Json inputs) override {
    ++calls;
    if (ordinaryError) throw gr::NodeError("Invocation skipped");
    if (inputs.value("skip", false)) throw gr::InvocationSkipped();
    co_return Json{{"output", "kept"}};
  }
  std::unique_ptr<gr::FrameIterator> genProcess(Json) override { throw std::logic_error("controlled fixture must call process"); }
  bool hasRun() const override { return false; }
  gr::Task<Json> run(gr::StreamIO&) override { throw std::logic_error("controlled fixture must call process"); co_return Json(); }
};
void retirementLineage(bool ordinaryError) {
  auto& loop = gr::Loop::current();
  Host host;
  ControlledExecutor executor;
  executor.ordinaryError = ordinaryError;
  gr::Node node;
  node.id = "controlled"; node.type = "fixture.Controlled"; node.isControlled = true;
  node.properties = Json::object(); node.outputs = {{"output", "str"}, {"other", "str"}};
  gr::Inbox inbox;
  inbox.addUpstream("__control__");
  const std::vector<gr::Lineage> lineages = {{{"outer", 2}, {"inner", 0}}, {{"outer", 2}, {"inner", 1}}, {{"outer", 2}, {"inner", 2}}};
  for (size_t i = 0; i < lineages.size(); ++i)
    inbox.put("__control__", {{"event_type", "run"}, {"properties", {{"skip", i != 1}}}}, lineages[i]);
  inbox.put("__control__", {{"event_type", "stop"}}, {{"outer", 2}, {"inner", 3}});
  inbox.put("__control__", {{"event_type", "run"}, {"properties", {{"skip", false}}}}, {{"outer", 2}, {"inner", 4}});
  inbox.markSourceDone("__control__");
  gr::Actor actor(host, node, inbox, executor, nullptr, {});
  auto task = actor.run(); loop.run();
  check(task.done(), "controlled actor must finish");
  auto result = task.get();
  check(executor.finalizations == 1, "controlled actor finalizes exactly once");
  if (ordinaryError) {
    check(result.error == "Invocation skipped" && executor.calls == 1 && host.deliveries.empty(), "only the InvocationSkipped type is caught, other exceptions remain terminal");
    return;
  }
  check(!result.error && executor.calls == 3, "Skip continues events and stop prevents the queued fourth invocation");
  check(executor.invocations == std::vector<std::string>({gr::lineageToJson(lineages[0]).dump(), gr::lineageToJson(lineages[1]).dump(), gr::lineageToJson(lineages[2]).dump()}), "beginInvocation remains once per event with exact F7 lineage");
  check(host.deliveries.size() == 3, "each event produces one output or retirement delivery");
  for (size_t i : {size_t(0), size_t(2)}) {
    const auto& delivery = host.deliveries[i];
    check(delivery.outputs.empty() && delivery.hints.lineageDoneSlots == std::set<std::string>({"output", "other"}), "Skip retires every declared output without emitting values");
    check(delivery.hints.invocationLineage == lineages[i] && delivery.hints.perSlotLineage && delivery.hints.perSlotLineage->at("output") == lineages[i] && delivery.hints.perSlotLineage->at("other") == lineages[i], "retirement supplies the exact skipped event lineage for every output slot");
  }
  check(host.deliveries[1].outputs == Json{{"output", "kept"}} && host.deliveries[1].hints.lineageDoneSlots.empty(), "successful event is routed normally between retired events");
  check(result.outputs == Json{{"output", "kept"}}, "later Skip preserves the latest successful result");
  int generations = 0;
  for (const auto& message : host.messages) if (message.value("type", "") == "generation_complete") ++generations;
  check(generations == 1, "retired events do not emit generation_complete");
}
} // namespace
int main(int argc, char** argv) {
  try {
    if (argc == 2 && std::string(argv[1]) == "--graphs") {
      std::cout << Json{{"repeat", controlledGraph()}, {"varying", controlledGraph(true)}}.dump() << '\n';
      return 0;
    }
    if (argc != 2) throw std::runtime_error("usage: gr_public_control_supervisor_tests guest.js | --graphs");
    publicSkipAndRecovery(argv[1]);
    retirementLineage(false);
    retirementLineage(true);
    std::cout << "controlled supervisor: " << checks << " checks passed\n";
    return 0;
  } catch (const std::exception& error) { std::cerr << error.what() << '\n'; return 1; }
}
