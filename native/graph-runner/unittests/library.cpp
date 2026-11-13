// Tests for the gr::GraphRunner library API against a real guest bundle:
// loading, the support check, runs of an editor-shaped graph, the job
// summary, cancellation, context reuse, live property changes, and teardown
// with work in flight.
//
//   gr_library_tests <guest.js|guest.bin>
#include "nodetool/graph_runner.h"
#include "sanitizer_build.h"

#include <nlohmann/json.hpp>

#include <algorithm>
#include <chrono>
#include <condition_variable>
#include <cstdio>
#include <functional>
#include <mutex>
#include <string>
#include <vector>

namespace {

using Json = nlohmann::json;

// native-rules #14: file-scope mutable test counters
int failures = 0;
int checks = 0;
// native-rules #14: file-scope mutable bundle path
std::string bundlePath;

#define CHECK(cond)                                                    \
  do {                                                                 \
    ++checks;                                                          \
    if (!(cond)) {                                                     \
      ++failures;                                                      \
      std::fprintf(stderr, "%s:%d: CHECK failed: %s\n", __FILE__,      \
                   __LINE__, #cond);                                   \
    }                                                                  \
  } while (0)

// Collects one job's messages from the worker thread.
struct Collector {
  std::mutex mutex;
  std::condition_variable changed;
  std::vector<Json> messages;
  std::string status;
  int terminals = 0;
  bool finished = false;
  // Messages that arrived after the handler saw `last`.
  int afterLast = 0;

  gr::GraphRunner::MessageHandler handler() {
    // native-rules #12: lambda captures raw this and runs on the worker thread
    return [this](const std::string& text, bool last) {
      std::lock_guard lock(mutex);
      if (finished) ++afterLast;
      Json msg = Json::parse(text);
      const std::string s = msg.value("status", std::string());
      if (msg.value("type", std::string()) == "job_update" &&
          (s == "completed" || s == "failed" || s == "cancelled")) {
        if (status.empty()) status = s;
        ++terminals;
      }
      messages.push_back(std::move(msg));
      if (last) finished = true;
      changed.notify_all();
    };
  }

  bool waitFor(const std::function<bool()>& predicate, int timeoutMs = 30000) {
    std::unique_lock lock(mutex);
    return changed.wait_for(lock, std::chrono::milliseconds(timeoutMs * gr::test::timeBudgetScale()),
                            predicate);
  }

  // Waits for the job's last message. Returns the first terminal status.
  std::string waitTerminal() {
    waitFor([this] { return finished; });
    std::lock_guard lock(mutex);
    return status;
  }

  // The job_update messages with a terminal status, in arrival order.
  std::vector<Json> terminalUpdates() {
    std::lock_guard lock(mutex);
    std::vector<Json> out;
    for (const auto& m : messages) {
      const std::string s = m.value("status", std::string());
      if (m.value("type", std::string()) == "job_update" &&
          (s == "completed" || s == "failed" || s == "cancelled")) {
        out.push_back(m);
      }
    }
    return out;
  }

  std::vector<Json> where(const std::string& type, const std::string& nodeId) {
    std::lock_guard lock(mutex);
    std::vector<Json> out;
    for (const auto& m : messages) {
      if (m.value("type", std::string()) == type && m.value("node_id", std::string()) == nodeId) {
        out.push_back(m);
      }
    }
    return out;
  }
};

// The repeat-collect fixture in the node editor's snapshot shape: saved
// properties under `data`, UI state under `ui_properties`.
std::string editorGraph(long long count) {
  auto node = [](const char* id, const char* type, Json data) {
    return Json{{"id", id},
                {"type", type},
                {"data", std::move(data)},
                {"ui_properties", {{"position", {{"x", 0}, {"y", 0}}}}},
                {"dynamic_properties", Json::object()}};
  };
  auto edge = [](const char* id, const char* s, const char* sh, const char* t, const char* th) {
    return Json{{"id", id}, {"source", s}, {"sourceHandle", sh}, {"target", t},
                {"targetHandle", th}, {"ui_properties", {{"className", "any"}}}};
  };
  Json graph = {
      {"nodes",
       {node("count", "nodetool.constant.Integer", {{"value", count}}),
        node("repeat", "nodetool.control.RepeatCount", {{"count", 1}}),
        node("collect", "nodetool.control.Collect", Json::object()),
        node("out", "nodetool.output.Output", {{"name", "items"}})}},
      {"edges",
       {edge("e1", "count", "output", "repeat", "count"),
        edge("e2", "repeat", "output", "collect", "input_item"),
        edge("e3", "collect", "output", "out", "value")}}};
  return graph.dump();
}

void loadsAndListsTypes() {
  gr::GraphRunner runner(bundlePath);
  CHECK(runner.waitUntilLoaded(60000));
  CHECK(runner.loadError().empty());
  auto types = runner.supportedNodeTypes();
  auto has = [&](const char* t) { return std::find(types.begin(), types.end(), t) != types.end(); };
  CHECK(has("nodetool.control.RepeatCount"));
  CHECK(has("nodetool.output.Output"));
  CHECK(has("nodetool.control.Loop"));
  CHECK(runner.contextLoads() == 1);
}

void checksSupport() {
  gr::GraphRunner runner(bundlePath);
  // Never runnable before the guest is ready.
  CHECK(!runner.canRun(editorGraph(3)) || runner.ready());
  CHECK(runner.waitUntilLoaded(60000));
  CHECK(runner.canRun(editorGraph(3)));
  Json unknown = Json::parse(editorGraph(3));
  unknown["nodes"][0]["type"] = "nodetool.test.NoSuchNode";
  CHECK(runner.unsupportedReason(unknown.dump()).find("nodetool.test.NoSuchNode") != std::string::npos);
  Json control = Json::parse(editorGraph(3));
  control["edges"][0]["edge_type"] = "control";
  CHECK(runner.canRun(control.dump()));
  Json bypassed = Json::parse(editorGraph(3));
  bypassed["nodes"][1]["ui_properties"]["bypassed"] = true;
  CHECK(runner.canRun(bypassed.dump()));
  CHECK(!runner.canRun("not json"));
  // A type whose code reaches an unavailable export of the module contract
  // (the bundle's node requirements) does not run locally, with the reason.
  Json watcher = Json::parse(editorGraph(3));
  watcher["nodes"][0]["type"] = "nodetool.triggers.FileWatchTrigger";
  CHECK(runner.unsupportedReason(watcher.dump()).find("it needs node:fs.watch (server-only)") != std::string::npos);
  auto types = runner.supportedNodeTypes();
  CHECK(std::find(types.begin(), types.end(), "nodetool.triggers.FileWatchTrigger") == types.end());
  CHECK(std::find(types.begin(), types.end(), "nodetool.triggers.ManualTrigger") != types.end());
}

void runsEditorGraph() {
  gr::GraphRunner runner(bundlePath);
  Collector c;
  runner.submit("job-1", "wf-1", editorGraph(3), "", c.handler());
  CHECK(c.waitTerminal() == "completed");
  auto outputs = c.where("output_update", "out");
  CHECK(outputs.size() == 1);
  if (!outputs.empty()) {
    CHECK(outputs[0]["value"] == Json::array({0, 1, 2}));
    CHECK(outputs[0]["output_name"] == "items");
  }
  // The registry title becomes the default name, as on the server.
  auto updates = c.where("node_update", "repeat");
  CHECK(!updates.empty() && updates[0]["node_name"] == "Repeat Count");
  std::lock_guard lock(c.mutex);
  CHECK(c.terminals == 2);
  CHECK(c.afterLast == 0);
  CHECK(c.messages.back()["job_id"] == "job-1");
  CHECK(c.messages.back()["workflow_id"] == "wf-1");
}

// The kernel's terminal job_update, then the server's job summary with the
// run's outputs. The summary is the job's last message.
void sendsJobSummaryWhenCompleted() {
  gr::GraphRunner runner(bundlePath);
  Collector c;
  runner.submit("job", "wf", editorGraph(3), "", c.handler());
  CHECK(c.waitTerminal() == "completed");
  auto updates = c.terminalUpdates();
  CHECK(updates.size() == 2);
  if (updates.size() != 2) return;
  CHECK(!updates[0].contains("result"));
  const Json expected = {{"type", "job_update"},
                         {"status", "completed"},
                         {"job_id", "job"},
                         {"workflow_id", "wf"},
                         {"result", {{"outputs", {{"items", {Json::array({0, 1, 2})}}}}}}};
  CHECK(updates[1] == expected);
  std::lock_guard lock(c.mutex);
  CHECK(c.messages.back() == expected);
  CHECK(c.afterLast == 0);
}

void sendsJobSummaryWhenFailed() {
  gr::GraphRunner runner(bundlePath);
  Collector c;
  // The failing-node fixture: the Select node rejects its value.
  const Json graph = {
      {"nodes",
       {{{"id", "pick"}, {"type", "nodetool.constant.Select"},
         {"data", {{"value", "c"}, {"options", {"a", "b"}}}}},
        {{"id", "out"}, {"type", "nodetool.output.Output"}, {"data", {{"name", "picked"}}}}}},
      {"edges",
       {{{"id", "e1"}, {"source", "pick"}, {"sourceHandle", "output"}, {"target", "out"},
         {"targetHandle", "value"}}}}};
  runner.submit("job", "wf", graph.dump(), "", c.handler());
  CHECK(c.waitTerminal() == "failed");
  auto updates = c.terminalUpdates();
  CHECK(updates.size() == 2);
  if (updates.size() != 2) return;
  CHECK(updates[1]["status"] == "failed");
  CHECK(updates[1]["error"] == updates[0]["error"]);
  CHECK(updates[1]["error"].get<std::string>().find("Node \"pick\" failed") == 0);
  // The Output node finished without a value, so its key holds no values.
  CHECK(updates[1]["result"] == Json({{"outputs", {{"picked", Json::array()}}}}));
}

void sendsNoJobSummaryWithoutOutputs() {
  gr::GraphRunner runner(bundlePath);
  Collector c;
  // Graph validation rejects the self-loop before any actor runs.
  Json graph = Json::parse(editorGraph(3));
  graph["edges"].push_back({{"id", "loop"}, {"source", "collect"}, {"sourceHandle", "output"},
                            {"target", "collect"}, {"targetHandle", "input_item"}});
  runner.submit("job", "wf", graph.dump(), "", c.handler());
  CHECK(c.waitTerminal() == "failed");
  auto updates = c.terminalUpdates();
  CHECK(updates.size() == 1);
  CHECK(updates.size() == 1 && !updates[0].contains("result"));
}

void sendsJobSummaryWhenCancelled() {
  gr::GraphRunner runner(bundlePath);
  Collector c;
  runner.submit("long", "wf", editorGraph(1000000000), "", c.handler());
  CHECK(c.waitFor([&] { return c.messages.size() > 4; }));
  CHECK(runner.cancel("long"));
  CHECK(c.waitTerminal() == "cancelled");
  auto updates = c.terminalUpdates();
  CHECK(updates.size() == 2);
  if (updates.size() != 2) return;
  CHECK(updates[1]["status"] == "cancelled");
  CHECK(!updates[1].contains("error"));
  CHECK(updates[1]["result"]["outputs"].contains("items"));
}

// Comment and Group nodes are pruned with their edges, as on the server. The
// Group's child still runs.
void runsGraphWithEditorOnlyNodes() {
  gr::GraphRunner runner(bundlePath);
  CHECK(runner.waitUntilLoaded(60000));
  Json graph = Json::parse(editorGraph(3));
  graph["nodes"].push_back({{"id", "note"},
                            {"type", "nodetool.workflows.base_node.Comment"},
                            {"data", {{"comment", "a note"}}}});
  graph["nodes"].push_back({{"id", "group"},
                            {"type", "nodetool.workflows.base_node.Group"},
                            {"data", Json::object()}});
  graph["nodes"][1]["parent_id"] = "group";
  graph["edges"].push_back({{"id", "c1"}, {"source", "note"}, {"sourceHandle", "output"},
                            {"target", "out"}, {"targetHandle", "value"}});
  graph["edges"].push_back({{"id", "c2"}, {"source", "group"}, {"sourceHandle", "output"},
                            {"target", "repeat"}, {"targetHandle", "count"},
                            {"edge_type", "control"}});
  CHECK(runner.unsupportedReason(graph.dump()).empty());
  Collector c;
  runner.submit("job", "wf", graph.dump(), "", c.handler());
  CHECK(c.waitTerminal() == "completed");
  auto outputs = c.where("output_update", "out");
  CHECK(outputs.size() == 1 && outputs[0]["value"] == Json::array({0, 1, 2}));
  CHECK(c.where("node_update", "repeat").size() > 0);
  CHECK(c.where("node_update", "note").empty());
  CHECK(c.where("node_update", "group").empty());
}

void cancelsAndReusesTheContext() {
  gr::GraphRunner runner(bundlePath);
  Collector longRun;
  runner.submit("long", "wf", editorGraph(1000000000), "", longRun.handler());
  CHECK(longRun.waitFor([&] {
    for (const auto& m : longRun.messages) {
      if (m.value("type", std::string()) == "edge_update" && m.value("edge_id", std::string()) == "e2") {
        return true;
      }
    }
    return false;
  }));
  CHECK(runner.cancel("long"));
  CHECK(longRun.waitTerminal() == "cancelled");

  Collector next;
  runner.submit("next", "wf", editorGraph(3), "", next.handler());
  CHECK(next.waitTerminal() == "completed");
  auto outputs = next.where("output_update", "out");
  CHECK(outputs.size() == 1 && outputs[0]["value"] == Json::array({0, 1, 2}));
  // A clean cancel keeps the loaded context.
  CHECK(runner.contextLoads() == 1);
  CHECK(!runner.cancel("next"));
}

// A Trigger node into an Audio Out node, which sends one output_update for
// each block of the gate stream, paced by the wall clock, until the run is
// cancelled.
std::string triggerGraph() {
  Json graph = {
      {"nodes",
       {{{"id", "trig"}, {"type", "nodetool.audio.synth.Trigger"}, {"data", {{"length", 0.02}}}},
        {{"id", "out"}, {"type", "nodetool.audio.realtime.AudioOutput"}, {"data", Json::object()}}}},
      {"edges",
       {{{"id", "e1"}, {"source", "trig"}, {"sourceHandle", "gate"}, {"target", "out"},
         {"targetHandle", "chunk"}}}}};
  return graph.dump();
}

// Whether the chunk of an output_update holds a sample that is not zero.
// The samples cross as {"__bytes__": "<base64>"}, and zero bytes encode as 'A'.
bool soundingChunk(const Json& message) {
  if (!message.contains("value") || !message["value"].is_object()) return false;
  const Json& value = message["value"];
  if (!value.contains("content") || !value["content"].is_object()) return false;
  const std::string bytes = value["content"].value("__bytes__", std::string());
  return bytes.find_first_not_of("A=") != std::string::npos;
}

// A live property change reaches the node of the running job, and only that
// job takes one.
void appliesLivePropertyChanges() {
  gr::GraphRunner runner(bundlePath);
  CHECK(runner.waitUntilLoaded(60000));
  // No job runs yet.
  CHECK(!runner.updateNodeProperties("live", "trig", R"({"trigger":true})"));
  CHECK(runner.unsupportedReason(triggerGraph()).empty());
  Collector c;
  runner.submit("live", "wf", triggerGraph(), "", c.handler());
  auto blocks = [&] {
    size_t count = 0;
    for (const auto& m : c.messages) {
      if (m.value("type", std::string()) == "output_update" && m.value("node_id", std::string()) == "out") ++count;
    }
    return count;
  };
  auto sounding = [&] {
    return std::any_of(c.messages.begin(), c.messages.end(), soundingChunk);
  };
  // The gate is low until the switch changes.
  CHECK(c.waitFor([&] { return blocks() >= 3; }));
  {
    std::lock_guard lock(c.mutex);
    CHECK(!sounding());
  }
  // Refused: another job, no node, and values that are not an object.
  CHECK(!runner.updateNodeProperties("other", "trig", R"({"trigger":true})"));
  CHECK(!runner.updateNodeProperties("live", "", R"({"trigger":true})"));
  CHECK(!runner.updateNodeProperties("live", "trig", "[true]"));
  CHECK(!runner.updateNodeProperties("live", "trig", "not json"));
  {
    std::lock_guard lock(c.mutex);
    CHECK(!sounding());
  }
  // A node the graph does not have drops the change, and the run goes on.
  CHECK(runner.updateNodeProperties("live", "missing", R"({"trigger":true})"));
  size_t before = 0;
  {
    std::lock_guard lock(c.mutex);
    before = blocks();
  }
  CHECK(c.waitFor([&] { return blocks() >= before + 2; }));
  {
    std::lock_guard lock(c.mutex);
    CHECK(!sounding());
  }
  // The change fires the pulse at the node's next block.
  CHECK(runner.updateNodeProperties("live", "trig", R"({"trigger":true})"));
  CHECK(c.waitFor(sounding));
  CHECK(runner.cancel("live"));
  CHECK(c.waitTerminal() == "cancelled");
  // A cancelled or finished job takes none.
  CHECK(!runner.updateNodeProperties("live", "trig", R"({"trigger":false})"));
  // The run unwound cleanly, so the context stays.
  CHECK(runner.contextLoads() == 1);
}

void cancelsQueuedJobs() {
  gr::GraphRunner runner(bundlePath);
  Collector first;
  Collector second;
  runner.submit("first", "wf", editorGraph(1000000000), "", first.handler());
  runner.submit("second", "wf", editorGraph(3), "", second.handler());
  CHECK(runner.cancel("second"));
  CHECK(runner.cancel("first"));
  CHECK(first.waitTerminal() == "cancelled");
  CHECK(second.waitTerminal() == "cancelled");
  std::lock_guard lock(second.mutex);
  CHECK(second.messages.size() == 1);
}

void teardownEndsRunningJobs() {
  Collector running;
  Collector queued;
  {
    gr::GraphRunner runner(bundlePath);
    CHECK(runner.waitUntilLoaded(60000));
    runner.submit("running", "wf", editorGraph(1000000000), "", running.handler());
    runner.submit("queued", "wf", editorGraph(3), "", queued.handler());
    CHECK(running.waitFor([&] { return running.messages.size() > 2; }));
  }
  std::lock_guard a(running.mutex);
  std::lock_guard b(queued.mutex);
  CHECK(running.finished && running.status == "cancelled" && running.afterLast == 0);
  CHECK(queued.terminals == 1 && queued.status == "cancelled");
}

void teardownDuringLoad() {
  Collector queued;
  {
    gr::GraphRunner runner(bundlePath);
    runner.submit("queued", "wf", editorGraph(3), "", queued.handler());
  }
  std::lock_guard lock(queued.mutex);
  CHECK(queued.terminals == 1);
}

void reportsBadInput() {
  gr::GraphRunner runner(bundlePath);
  CHECK(runner.waitUntilLoaded(60000));
  Collector c;
  runner.submit("bad", "wf", "{not json", "", c.handler());
  CHECK(c.waitTerminal() == "failed");
  Collector next;
  runner.submit("ok", "wf", editorGraph(2), "", next.handler());
  CHECK(next.waitTerminal() == "completed");
}

void reportsMissingBundle() {
  gr::GraphRunner runner("/nonexistent/guest.js");
  CHECK(!runner.waitUntilLoaded(10000));
  CHECK(!runner.loadError().empty());
  CHECK(!runner.canRun(editorGraph(3)));
  Collector c;
  runner.submit("job", "wf", editorGraph(3), "", c.handler());
  CHECK(c.waitTerminal() == "failed");
}

// A Code node that recurses without end fails with a RangeError. The worker
// thread has a stack larger than the JS limit, so no signal ends the process.
std::string codeGraph(const std::string& code) {
  const Json graph = {
      {"nodes",
       {{{"id", "code"}, {"type", "nodetool.code.Code"}, {"data", {{"code", code}}}}}},
      {"edges", Json::array()}};
  return graph.dump();
}

void deepRecursionFailsTheNode() {
  gr::GraphRunner runner(bundlePath);
  for (const char* code : {"function f(){f()} f()",
                           "JSON.parse('['.repeat(1000000)+']'.repeat(1000000))"}) {
    Collector c;
    runner.submit("job", "wf", codeGraph(code), "", c.handler());
    CHECK(c.waitTerminal() == "failed");
    auto updates = c.terminalUpdates();
    CHECK(!updates.empty() && updates[0]["error"].dump().find("RangeError") != std::string::npos);
  }
}

}  // namespace

int main(int argc, char** argv) {
  if (argc < 2) {
    std::fprintf(stderr, "usage: gr_library_tests <guest.js|guest.bin>\n");
    return 2;
  }
  bundlePath = argv[1];
  if (std::FILE* f = std::fopen(bundlePath.c_str(), "rb")) {
    std::fclose(f);
  } else {
    std::fprintf(stderr, "cannot read %s; build it with node guest/build.mjs\n",
                 bundlePath.c_str());
    return 1;
  }
  std::vector<std::pair<const char*, std::function<void()>>> tests = {
      {"loadsAndListsTypes", loadsAndListsTypes},
      {"checksSupport", checksSupport},
      {"runsEditorGraph", runsEditorGraph},
      {"sendsJobSummaryWhenCompleted", sendsJobSummaryWhenCompleted},
      {"sendsJobSummaryWhenFailed", sendsJobSummaryWhenFailed},
      {"sendsNoJobSummaryWithoutOutputs", sendsNoJobSummaryWithoutOutputs},
      {"sendsJobSummaryWhenCancelled", sendsJobSummaryWhenCancelled},
      {"runsGraphWithEditorOnlyNodes", runsGraphWithEditorOnlyNodes},
      {"cancelsAndReusesTheContext", cancelsAndReusesTheContext},
      {"appliesLivePropertyChanges", appliesLivePropertyChanges},
      {"cancelsQueuedJobs", cancelsQueuedJobs},
      {"teardownEndsRunningJobs", teardownEndsRunningJobs},
      {"teardownDuringLoad", teardownDuringLoad},
      {"reportsBadInput", reportsBadInput},
      {"reportsMissingBundle", reportsMissingBundle},
      {"deepRecursionFailsTheNode", deepRecursionFailsTheNode},
  };
  for (const auto& [name, fn] : tests) {
    int before = failures;
    fn();
    std::fprintf(stderr, "%s %s\n", failures == before ? "PASS" : "FAIL", name);
  }
  std::fprintf(stderr, "%d checks, %d failed\n", checks, failures);
  return failures == 0 ? 0 : 1;
}
