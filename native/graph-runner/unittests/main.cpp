// Unit tests for the engine boundary, the inbox, the scheduler, the
// correlation analysis, and graph normalization. Run with
// `ctest --test-dir build`.
#include "js/engine.h"
#include "kernel/correlation.h"
#include "kernel/graph.h"
#include "kernel/inbox.h"
#include "kernel/normalize.h"
#include "kernel/runner.h"
#include "kernel/task.h"
#include "kernel/wire.h"
#include "nodetool/jobs/admission.h"

#include <chrono>
#include <cstdio>
#include <functional>
#include <string>
#include <vector>

namespace {

// native-rules #14: file-scope mutable test counters
int failures = 0;
int checks = 0;

#define CHECK(cond)                                                    \
  do {                                                                 \
    ++checks;                                                          \
    if (!(cond)) {                                                     \
      ++failures;                                                      \
      std::fprintf(stderr, "%s:%d: CHECK failed: %s\n", __FILE__,      \
                   __LINE__, #cond);                                   \
    }                                                                  \
  } while (0)

using gr::Json;
using gr::Loop;
using gr::Task;
namespace js = gr::js;

// --- engine boundary ------------------------------------------------------

void engineEvaluatesAndCalls() {
  auto e = js::createQuickJsEngine();
  js::Value v = e->evaluateScript("1 + 2", "t.js");
  CHECK(e->isNumber(v));
  CHECK(e->toNumber(v) == 3);
  e->evaluateScript("globalThis.add = (a, b) => a + b;", "t.js");
  js::Value add = e->get(e->global(), "add");
  CHECK(e->isFunction(add));
  js::Value r = e->call(add, e->undefined(), {e->string("a"), e->string("b")});
  CHECK(e->toString(r) == "ab");
}

void engineHostFunctionRoundTrip() {
  auto e = js::createQuickJsEngine();
  std::vector<std::string> seen;
  e->set(e->global(), "hostUpper",
         e->function("hostUpper", 1, [&seen](js::Engine& en, const std::vector<js::Value>& a) {
           std::string s = en.toString(a.at(0));
           seen.push_back(s);
           for (auto& c : s) c = char(std::toupper(c));
           return en.string(s);
         }));
  js::Value r = e->evaluateScript("hostUpper('quick') + '!'", "t.js");
  CHECK(e->toString(r) == "QUICK!");
  CHECK(seen.size() == 1 && seen[0] == "quick");
}

void engineErrorsCrossTheBoundary() {
  auto e = js::createQuickJsEngine();
  bool threw = false;
  try {
    e->evaluateScript("throw new Error('boom')", "t.js");
  } catch (const js::JsError& err) {
    threw = std::string(err.what()) == "boom";
  }
  CHECK(threw);

  // A C++ exception in a host function becomes a JavaScript Error.
  e->set(e->global(), "fail", e->function("fail", 0, [](js::Engine&, const std::vector<js::Value>&) -> js::Value {
    throw std::runtime_error("host said no");
  }));
  js::Value r = e->evaluateScript(
      "(() => { try { fail(); return 'no'; } catch (x) { return x.message; } })()",
      "t.js");
  CHECK(e->toString(r) == "host said no");
}

void engineBytesRoundTrip() {
  auto e = js::createQuickJsEngine();
  const uint8_t data[] = {0, 1, 2, 250, 255};
  js::Value bytes = e->bytes(data, sizeof data);
  CHECK(e->isBytes(bytes));
  CHECK(e->toBytes(bytes) == std::vector<uint8_t>(data, data + sizeof data));
  // A view covers only its own range of the buffer.
  js::Value view = e->evaluateScript(
      "new Uint8Array([9, 8, 7, 6, 5]).subarray(1, 3)", "view.js");
  CHECK(e->isBytes(view));
  CHECK((e->toBytes(view) == std::vector<uint8_t>{8, 7}));
  js::Value buffer = e->evaluateScript("new Uint16Array([258]).buffer", "buffer.js");
  CHECK(e->isBytes(buffer) && e->toBytes(buffer).size() == 2);
  CHECK(!e->isBytes(e->string("abc")) && !e->isBytes(e->object()));
}

void enginePromisesSettleThroughJobs() {
  auto e = js::createQuickJsEngine();
  js::Value p = e->evaluateScript("(async () => { await null; return 'done'; })()", "t.js");
  std::string got;
  js::then(*e, p, [&](js::Engine& en, const js::Value& v) { got = en.toString(v); },
           [&](js::Engine&, const js::Value&) { got = "rejected"; });
  CHECK(got.empty());  // nothing runs until the job queue drains
  CHECK(e->hasPendingJobs());
  CHECK(e->drainJobs() > 0);
  CHECK(got == "done");

  // A host-made promise resolved from C++.
  auto cap = e->newPromise();
  e->set(e->global(), "pending", cap.promise);
  js::Value chained = e->evaluateScript("pending.then((x) => x * 2)", "t.js");
  std::string doubled;
  js::then(*e, chained, [&](js::Engine& en, const js::Value& v) { doubled = en.toString(v); },
           [](js::Engine&, const js::Value&) {});
  e->call(cap.resolve, e->undefined(), {e->number(21)});
  e->drainJobs();
  CHECK(doubled == "42");
}

// A long host error message arrives whole, and a host error can carry a name.
void engineHostErrorsKeepMessageAndName() {
  auto e = js::createQuickJsEngine();
  e->set(e->global(), "failLong", e->function("failLong", 0, [](js::Engine&, const std::vector<js::Value>&) -> js::Value {
    throw std::runtime_error(std::string(999, 'x') + "\xc3\xa9");
  }));
  e->set(e->global(), "failAbort", e->function("failAbort", 0, [](js::Engine&, const std::vector<js::Value>&) -> js::Value {
    throw js::JsError("stopped", "AbortError");
  }));
  js::Value r = e->evaluateScript(
      "(() => { try { failLong(); } catch (x) { return x instanceof Error && x.message.length === 1000 && x.message.endsWith('x\\u00e9'); } })()",
      "t.js");
  CHECK(e->toBoolean(r));
  r = e->evaluateScript(
      "(() => { try { failAbort(); } catch (x) { return x.name + ':' + x.message; } })()", "t.js");
  CHECK(e->toString(r) == "AbortError:stopped");
  // A JS exception thrown through a re-entrant host call keeps its object.
  e->set(e->global(), "reenter", e->function("reenter", 1, [](js::Engine& en, const std::vector<js::Value>& a) -> js::Value {
    return en.call(a.at(0), en.undefined(), {});
  }));
  r = e->evaluateScript(
      "(() => { const original = new TypeError('inner'); try { reenter(() => { throw original; }); } catch (x) { return x === original; } })()",
      "t.js");
  CHECK(e->toBoolean(r));
}

// Bytecode without source still names the file and line in a stack trace.
void engineBytecodeKeepsStackLines() {
  std::vector<uint8_t> bc;
  {
    auto e = js::createQuickJsEngine();
    bc = e->compileScript("\n\nglobalThis.trace = () => { try { throw new Error('x'); } catch (x) { return x.stack; } };", "lines.js");
  }
  auto e = js::createQuickJsEngine();
  e->evaluateBytecode(bc);
  const std::string stack = e->toString(e->call(e->get(e->global(), "trace"), e->undefined(), {}));
  CHECK(stack.find("lines.js:3") != std::string::npos);
  const std::string source = e->toString(e->evaluateScript("String(globalThis.trace)", "t.js"));
  CHECK(source.find("throw new Error") == std::string::npos);
}

// A runaway allocation past the heap limit raises an out-of-memory error.
void engineHeapLimitRaisesOutOfMemory() {
  auto e = js::createQuickJsEngine();
  e->setMemoryLimit(64u * 1024 * 1024);
  std::string message;
  try {
    e->evaluateScript("globalThis.hog = []; for (;;) hog.push(new Array(100000).fill(1));", "oom.js");
  } catch (const js::JsError& err) {
    message = err.what();
  }
  CHECK(message.find("out of memory") != std::string::npos);
  e->evaluateScript("globalThis.hog = undefined;", "t.js");
  e->collectGarbage();
  CHECK(e->toNumber(e->evaluateScript("1 + 1", "t.js")) == 2);
}

void engineBytecodeRoundTrip() {
  std::vector<uint8_t> bc;
  {
    auto e = js::createQuickJsEngine();
    bc = e->compileScript("globalThis.answer = 6 * 7;", "t.js");
  }
  CHECK(!bc.empty());
  auto e = js::createQuickJsEngine();
  e->evaluateBytecode(bc);
  CHECK(e->toNumber(e->get(e->global(), "answer")) == 42);
}

// --- scheduler and inbox --------------------------------------------------

Task<void> collectHandle(gr::Inbox& inbox, std::string handle, std::vector<Json>& out) {
  for (;;) {
    auto env = co_await inbox.nextInput(handle);
    if (!env) break;
    out.push_back(*env->data);
  }
}

Task<void> collectAny(gr::Inbox& inbox, std::vector<std::string>& out) {
  for (;;) {
    auto item = co_await inbox.nextAny();
    if (!item) break;
    out.push_back(item->first + "=" + item->second.data->dump());
  }
}

void inboxEndsStreamWhenAllUpstreamsAreDone() {
  gr::Inbox inbox;
  inbox.addUpstream("a", 2);
  std::vector<Json> got;
  auto t = collectHandle(inbox, "a", got);
  Loop::current().run();
  CHECK(!t.done());  // parked: two open sources, nothing buffered

  inbox.put("a", 1);
  inbox.markSourceDone("a");
  Loop::current().run();
  CHECK(got.size() == 1);
  CHECK(!t.done());  // one source still open
  CHECK(inbox.isOpen("a"));

  inbox.put("a", 2);
  inbox.markSourceDone("a");
  Loop::current().run();
  CHECK(t.done());
  CHECK(got.size() == 2 && got[1] == 2);
  CHECK(inbox.isFullyDrained());
}

void inboxAnyFollowsArrivalOrder() {
  gr::Inbox inbox;
  inbox.addUpstream("x");
  inbox.addUpstream("y");
  inbox.put("y", 1);
  inbox.put("x", 2);
  inbox.put("y", 3);
  inbox.markSourceDone("x");
  inbox.markSourceDone("y");
  std::vector<std::string> got;
  auto t = collectAny(inbox, got);
  Loop::current().run();
  CHECK(t.done());
  CHECK((got == std::vector<std::string>{"y=1", "x=2", "y=3"}));
  CHECK((inbox.handles() == std::vector<std::string>{"x", "y"}));
}

void inboxDrainAndClose() {
  gr::Inbox inbox;
  inbox.addUpstream("a");
  inbox.put("a", "p");
  inbox.put("a", "q");
  auto drained = inbox.drainHandle("a");
  CHECK(drained.size() == 2);
  CHECK(!inbox.hasBuffered("a"));
  CHECK(inbox.hasPendingWork());  // upstream still open
  std::vector<std::string> got;
  auto t = collectAny(inbox, got);
  Loop::current().run();
  CHECK(!t.done());
  inbox.closeAll();
  inbox.put("a", "ignored");
  Loop::current().run();
  CHECK(t.done());
  CHECK(got.empty());
}

Task<int> produceLater() {
  co_await gr::Tick{};
  co_return 7;
}

Task<void> awaitTwice(std::vector<int>& out) {
  out.push_back(co_await produceLater());
  out.push_back(co_await produceLater());
}

void tasksResumeThroughTheLoop() {
  std::vector<int> out;
  auto t = awaitTwice(out);
  CHECK(out.empty());  // eager start stops at the first Tick
  Loop::current().run();
  CHECK(t.done());
  CHECK((out == std::vector<int>{7, 7}));
}

void inboxLargeStreamIsLinear() {
  gr::Inbox inbox;
  inbox.addUpstream("a");
  const int n = 200000;
  for (int i = 0; i < n; ++i) inbox.put("a", i);
  inbox.markSourceDone("a");
  std::vector<Json> got;
  auto t = collectHandle(inbox, "a", got);
  Loop::current().run();
  CHECK(t.done());
  CHECK(int(got.size()) == n);
  CHECK(got.back() == n - 1);
}

Task<int> waitOn(gr::Signal& signal, std::shared_ptr<int> held) {
  co_await signal.wait();
  co_return *held;
}

Task<void> awaitWaiter(gr::Signal& signal, std::shared_ptr<int> held, bool& resumed) {
  co_await waitOn(signal, std::move(held));
  resumed = true;
}

void abandonDestroysSuspendedFrames() {
  gr::Signal never;
  auto held = std::make_shared<int>(1);
  bool resumed = false;
  {
    auto t = awaitWaiter(never, held, resumed);
    Loop::current().run();
    CHECK(!t.done());
  }
  CHECK(Loop::current().liveFrames() == 2);
  CHECK(held.use_count() == 2);
  Loop::current().abandon();
  CHECK(Loop::current().liveFrames() == 0);
  CHECK(held.use_count() == 1);  // the frame's locals were destroyed
  CHECK(!resumed);
}

void finishedTasksLeaveNoFrames() {
  std::vector<int> out;
  auto t = awaitTwice(out);
  Loop::current().run();
  CHECK(t.done());
  CHECK(Loop::current().liveFrames() == 0);
}

// --- graph normalization ---------------------------------------------------

std::optional<Json> resolveTestTypes(const std::string& type) {
  if (type == "test.Echo") {
    return Json{{"nodeType", "test.Echo"},
                {"propertyTypes", {{"text", "str"}, {"items", "list[int]"}}},
                {"outputs", {{"output", "str"}}},
                {"descriptorDefaults", {{"name", "Echo"}, {"is_streaming_output", false},
                                        {"input_mode", "buffered"}}}};
  }
  return std::nullopt;
}

void normalizeMovesEditorFields() {
  Json graph = Json::parse(R"({
    "nodes": [
      {"id": "a", "type": "test.Echo", "data": {"text": "hi"},
       "dynamic_properties": {"extra": 2}, "ui_properties": {"position": {"x": 1}},
       "input_mode": "stream"},
      {"id": "b", "type": "test.Echo", "name": "Mine", "properties": {"text": "p"},
       "data": {"text": "ignored"}, "outputs": {"output": "any"},
       "dynamic_inputs": {"slot": {"type": {"type": "list", "type_args": [{"type": "int"}]}}}},
      {"id": "c", "type": "test.Unknown"},
      {"id": "", "type": "test.Echo"},
      "not a node"
    ],
    "edges": [
      {"id": "e1", "source": "a", "sourceHandle": "output", "target": "b", "targetHandle": "text", "type": "default"},
      {"id": "e2", "source": "a", "sourceHandle": "output", "target": "b", "targetHandle": "slot", "type": "control"},
      {"id": "e3", "source": "a", "sourceHandle": "output", "target": "c", "targetHandle": "text"},
      {"id": "e4", "source": "a", "target": "b", "targetHandle": "text"}
    ]})");
  Json out = gr::normalizeGraph(graph, resolveTestTypes);
  CHECK(out["nodes"].size() == 2);
  const Json& a = out["nodes"][0];
  CHECK(a["properties"] == Json::parse(R"({"text": "hi", "extra": 2})"));
  CHECK(!a.contains("data"));
  CHECK(a["name"] == "Echo");
  CHECK(a["input_mode"] == "buffered");  // the registry is authoritative
  CHECK(a["outputs"] == Json::parse(R"({"output": "str"})"));
  CHECK(a["ui_properties"]["position"]["x"] == 1);
  const Json& b = out["nodes"][1];
  CHECK(b["name"] == "Mine");
  CHECK(b["properties"] == Json::parse(R"({"text": "p"})"));
  CHECK(b["outputs"]["output"] == "any");
  CHECK(b["propertyTypes"]["slot"] == "list[int]");
  CHECK(b["propertyTypes"]["items"] == "list[int]");
  CHECK(out["edges"].size() == 2);
  CHECK(out["edges"][0]["edge_type"] == "data");
  CHECK(!out["edges"][0].contains("type"));
  CHECK(out["edges"][1]["edge_type"] == "control");

  bool threw = false;
  try {
    (void)gr::normalizeGraph(Json::parse(R"({"nodes": []})"), resolveTestTypes);
  } catch (const gr::GraphValidationError&) {
    threw = true;
  }
  CHECK(threw);
}

// Editor-only nodes go even when the registry would resolve their type, and
// the edges that touch them go with them. A Group's child stays.
void normalizePrunesEditorOnlyNodes() {
  auto resolveAll = [](const std::string& type) -> std::optional<Json> {
    return Json{{"nodeType", type}, {"descriptorDefaults", {{"name", type}}}};
  };
  Json graph = Json::parse(R"({
    "nodes": [
      {"id": "note", "type": "nodetool.workflows.base_node.Comment"},
      {"id": "group", "type": "nodetool.workflows.base_node.Group"},
      {"id": "old", "type": "nodetool.workflows.base_node.Reroute"},
      {"id": "child", "type": "test.Echo", "parent_id": "group"},
      {"id": "reroute", "type": "nodetool.control.Reroute"},
      {"id": "preview", "type": "nodetool.workflows.base_node.Preview"}
    ],
    "edges": [
      {"source": "note", "sourceHandle": "output", "target": "child", "targetHandle": "text"},
      {"source": "child", "sourceHandle": "output", "target": "group", "targetHandle": "x"},
      {"source": "child", "sourceHandle": "output", "target": "reroute", "targetHandle": "input_value"}
    ]})");
  Json out = gr::normalizeGraph(graph, resolveAll);
  std::vector<std::string> ids;
  for (const auto& n : out["nodes"]) ids.push_back(n["id"].get<std::string>());
  CHECK((ids == std::vector<std::string>{"child", "reroute", "preview"}));
  CHECK(out["nodes"][0]["parent_id"] == "group");
  CHECK(out["edges"].size() == 1);
  CHECK(out["edges"][0]["target"] == "reroute");
  CHECK(gr::isEditorOnlyType("nodetool.workflows.base_node.Group"));
  CHECK(!gr::isEditorOnlyType("nodetool.control.Reroute"));
  CHECK(!gr::isEditorOnlyType("Comment"));
}

// --- runner ----------------------------------------------------------------

// A node whose process() waits on a signal nobody raises.
class StallExecutor final : public gr::Executor {
public:
  Task<void> initialize() override { co_return; }
  Task<void> preProcess() override { co_return; }
  Task<void> finalize() override { co_return; }
  Task<Json> process(Json) override {
    co_await never_.wait();
    co_return Json::object();
  }
  std::unique_ptr<gr::FrameIterator> genProcess(Json) override { return nullptr; }
  bool hasRun() const override { return false; }
  Task<Json> run(gr::StreamIO&) override { co_return Json::object(); }

private:
  gr::Signal never_;
};

class StallCatalog final : public gr::NodeCatalog {
public:
  std::optional<Json> describe(const Json&) override { return Json::object(); }
  std::optional<Json> resolve(const std::string& type) override {
    if (type != "test.Stall") return std::nullopt;
    return Json{{"nodeType", type}, {"descriptorDefaults", {{"name", "Stall"}}}};
  }
  Json validate(const Json&, const std::vector<std::string>&) override {
    return Json::array();
  }
  std::unique_ptr<gr::Executor> create(const Json&) override {
    return std::make_unique<StallExecutor>();
  }
};

void stalledRunIsAbandoned() {
  StallCatalog catalog;
  std::vector<Json> messages;
  {
    gr::Runner runner(catalog, [&](const Json& m) { messages.push_back(m); });
    auto task = runner.run(
        Json::parse(R"({"nodes": [{"id": "s", "type": "test.Stall", "data": {}}], "edges": []})"),
        Json::object());
    Loop::current().run();
    CHECK(!task.done());
    CHECK(Loop::current().liveFrames() > 0);
    // Cancelling closes inboxes, but this node waits on its own signal.
    runner.cancel();
    Loop::current().run();
    CHECK(!task.done());
    Loop::current().abandon();
    CHECK(Loop::current().liveFrames() == 0);
  }
  CHECK(messages.size() == 2);
  CHECK(messages.back()["type"] == "node_update");
  CHECK(messages.back()["node_name"] == "Stall");
}

// PT11: an output of 1.5 million numbers crosses a fan-out of 4 edges. The
// source's value reaches every sink intact, and the time of the run is
// printed: the kernel shares one value between the edges and inboxes
// instead of copying it for each edge.
constexpr size_t kFanOutCount = 1500000;

class BigExecutor final : public gr::Executor {
public:
  Task<void> initialize() override { co_return; }
  Task<void> preProcess() override { co_return; }
  Task<void> finalize() override { co_return; }
  Task<Json> process(Json) override {
    Json list = Json::array();
    list.get_ref<Json::array_t&>().reserve(kFanOutCount);
    for (size_t i = 0; i < kFanOutCount; ++i) list.push_back(static_cast<double>(i));
    co_return Json{{"output", std::move(list)}};
  }
  std::unique_ptr<gr::FrameIterator> genProcess(Json) override { return nullptr; }
  bool hasRun() const override { return false; }
  Task<Json> run(gr::StreamIO&) override { co_return Json::object(); }
};

// Records what reached it. Thread affinity: the test's worker thread.
struct SinkSeen {
  size_t calls = 0;
  size_t intact = 0;
};

class SinkExecutor final : public gr::Executor {
public:
  explicit SinkExecutor(SinkSeen& seen) : seen_(seen) {}
  Task<void> initialize() override { co_return; }
  Task<void> preProcess() override { co_return; }
  Task<void> finalize() override { co_return; }
  Task<Json> process(Json inputs) override {
    ++seen_.calls;
    const Json& list = inputs["input"];
    if (list.is_array() && list.size() == kFanOutCount && list[0] == 0.0 &&
        list[kFanOutCount - 1] == static_cast<double>(kFanOutCount - 1)) {
      ++seen_.intact;
    }
    co_return Json::object();
  }
  std::unique_ptr<gr::FrameIterator> genProcess(Json) override { return nullptr; }
  bool hasRun() const override { return false; }
  Task<Json> run(gr::StreamIO&) override { co_return Json::object(); }

private:
  SinkSeen& seen_;
};

class FanOutCatalog final : public gr::NodeCatalog {
public:
  SinkSeen seen;
  std::optional<Json> describe(const Json&) override { return Json::object(); }
  std::optional<Json> resolve(const std::string& type) override {
    if (type == "test.Big") {
      return Json{{"nodeType", type}, {"descriptorDefaults", {{"name", "Big"}}}, {"outputs", {{"output", "list"}}}};
    }
    if (type == "test.Sink") return Json{{"nodeType", type}, {"descriptorDefaults", {{"name", "Sink"}}}};
    return std::nullopt;
  }
  Json validate(const Json&, const std::vector<std::string>&) override { return Json::array(); }
  std::unique_ptr<gr::Executor> create(const Json& node) override {
    if (node.value("type", std::string()) == "test.Big") return std::make_unique<BigExecutor>();
    return std::make_unique<SinkExecutor>(seen);
  }
};

void fanOutSharesLargeValues() {
  FanOutCatalog catalog;
  Json graph = Json::parse(R"({"nodes": [{"id": "big", "type": "test.Big", "data": {}}], "edges": []})");
  for (int i = 0; i < 4; ++i) {
    const std::string id = "sink" + std::to_string(i);
    graph["nodes"].push_back({{"id", id}, {"type", "test.Sink"}, {"data", Json::object()}});
    graph["edges"].push_back({{"id", "e" + std::to_string(i)}, {"source", "big"}, {"sourceHandle", "output"},
                              {"target", id}, {"targetHandle", "input"}});
  }
  std::vector<std::string> failed;
  const auto start = std::chrono::steady_clock::now();
  {
    gr::Runner runner(catalog, [&](const Json& m) {
      if (m.value("status", std::string()) == "error") failed.push_back(m.dump());
    });
    auto task = runner.run(graph, Json::object());
    Loop::current().run();
    CHECK(task.done());
  }
  const auto ms = std::chrono::duration_cast<std::chrono::milliseconds>(std::chrono::steady_clock::now() - start).count();
  std::fprintf(stderr, "PT11 fan-out of %zu numbers to 4 edges: %lld ms\n", kFanOutCount, static_cast<long long>(ms));
  CHECK(failed.empty());
  CHECK(catalog.seen.calls == 4);
  CHECK(catalog.seen.intact == 4);

  // Inboxes hold the shared value itself: two readers see one Json.
  gr::SharedValue value(Json::array({1, 2, 3}));
  gr::Inbox a, b;
  a.addUpstream("in");
  b.addUpstream("in");
  a.put("in", value);
  b.put("in", value);
  auto fromA = a.drainHandle("in"), fromB = b.drainHandle("in");
  CHECK(fromA.size() == 1 && fromB.size() == 1);
  CHECK(&*fromA[0].data == &*fromB[0].data);
  CHECK(*fromA[0].data == Json::array({1, 2, 3}));
  // take() copies while another holder remains, and moves from the last.
  Json copied = fromA[0].data.take();
  CHECK(copied == Json::array({1, 2, 3}) && fromA[0].data->is_null());
  value = gr::SharedValue();
  Json moved = fromB[0].data.take();
  CHECK(moved == Json::array({1, 2, 3}));
}

// PT13: bytes in a value are a Blob. The text a host reads holds them as
// tagged base64, byte for byte as guest/values.mjs writes it, and the text
// the guest reads holds markers next to the blobs.
void bytesHaveTheirWireText() {
  using gr::Blob;
  using gr::BlobKind;
  const Json plain = Json::binary(Blob({1, 2, 3}));
  const Json value = {{"a", plain},
                      {"b", Json::binary(Blob({4, 5, 6}, BlobKind::Buffer))},
                      {"c", Json::binary(Blob({0, 0, 192, 63, 0, 0, 16, 192}, BlobKind::Float32Array))},
                      {"d", Json::array({Json::binary(Blob({}, BlobKind::ArrayBuffer)), 1.0, "x\n", nullptr})},
                      {"e", {{"k\"", Json::binary(Blob({255, 254}, BlobKind::DataView))}}},
                      {"f", {{"n", 1}, {"list", {1, 2.5, true}}}}};
  CHECK(gr::dumpWire(value) ==
        R"({"a":{"__bytes__":"AQID"},"b":{"__bytes__":"BAUG","__buffer__":true},)"
        R"("c":{"__typed__":"Float32Array","__bytes__":"AADAPwAAEMA="},)"
        R"("d":[{"__typed__":"ArrayBuffer","__bytes__":""},1.0,"x\n",null],)"
        R"("e":{"k\"":{"__typed__":"DataView","__bytes__":"//4="}},"f":{"n":1,"list":[1,2.5,true]}})");
  // Without bytes the text is the one dump() gives.
  const Json numbers = {{"n", 1.0}, {"s", "\xff"}};
  CHECK(gr::dumpWire(numbers, Json::error_handler_t::replace) == numbers.dump(-1, ' ', false, Json::error_handler_t::replace));
  CHECK(gr::holdsBytes(value) && !gr::holdsBytes(numbers));

  // The guest text names each blob by its index, and attachBlobs is the
  // way back.
  std::vector<Blob> blobs;
  const std::string transit = gr::dumpTransit(value, blobs);
  CHECK(transit ==
        R"({"a":{"__blob__":0},"b":{"__blob__":1,"__buffer__":true},"c":{"__typed__":"Float32Array","__blob__":2},)"
        R"("d":[{"__typed__":"ArrayBuffer","__blob__":3},1.0,"x\n",null],)"
        R"("e":{"k\"":{"__typed__":"DataView","__blob__":4}},"f":{"n":1,"list":[1,2.5,true]}})");
  CHECK(blobs.size() == 5);
  Json back = Json::parse(transit);
  gr::attachBlobs(back, blobs);
  CHECK(back == value);
  CHECK(back["c"].get_binary().kind() == BlobKind::Float32Array);
  // A copy shares the bytes.
  CHECK(back["a"].get_binary().data() == plain.get_binary().data());
  const Json copy = value;
  CHECK(copy["b"].get_binary().data() == value["b"].get_binary().data());
  // Equal bytes of another kind, or other bytes, are another value.
  CHECK(Json::binary(Blob({1, 2, 3})) == plain);
  CHECK(Json::binary(Blob({1, 2, 3}, BlobKind::Int8Array)) != plain);
  CHECK(Json::binary(Blob({1, 2, 4})) != plain);

  // An object that is no marker stays an object.
  std::vector<Blob> one{Blob({9})};
  Json lookalikes = Json::parse(R"([{"__blob__":0,"other":1},{"__blob__":5},{"__blob__":"0"},{"__typed__":"Nope","__blob__":0},{"__blob__":0}])");
  gr::attachBlobs(lookalikes, one);
  CHECK(lookalikes[0].is_object() && lookalikes[1].is_object() && lookalikes[2].is_object() && lookalikes[3].is_object());
  CHECK(lookalikes[4].is_binary());
  // A value that already has a "__blob__" key cannot use markers.
  std::vector<Blob> none;
  const Json clash = {{"bytes", plain}, {"user", {{"__blob__", 0}}}};
  CHECK(gr::dumpTransit(clash, none) == R"({"bytes":{"__bytes__":"AQID"},"user":{"__blob__":0}})");
  CHECK(none.empty());

  // The charge of a blob lasts as long as its last copy.
  auto ledger = std::make_shared<nodetool::jobs::AdmissionLedger>();
  auto account = ledger->openRunner()->openRun();
  {
    nodetool::jobs::Reservation charge(account);
    charge.reserveSnapshot(1000);
    charge.retain();
    Json held = Json::binary(Blob(std::vector<uint8_t>(1000, 7), BlobKind::Uint8Array, std::move(charge)));
    CHECK(ledger->usage().bytes == 1000);
    {
      gr::SharedValue shared(held);
      Json other = *shared;
      held = nullptr;
      CHECK(ledger->usage().bytes == 1000);
      CHECK(other.get_binary().chargedBytes() == 1000);
    }
    CHECK(ledger->usage().bytes == 0);
  }
}

// --- correlation analysis -------------------------------------------------

gr::Node makeNode(std::string id, std::string type,
                  std::vector<std::pair<std::string, gr::OutputCorrelation>> corr,
                  std::optional<std::string> mode) {
  gr::Node n;
  n.id = std::move(id);
  n.type = std::move(type);
  n.outputCorrelation = std::move(corr);
  n.hasOutputCorrelation = !n.outputCorrelation.empty();
  n.inputMode = std::move(mode);
  return n;
}

gr::Edge makeEdge(std::string id, std::string s, std::string sh, std::string t, std::string th) {
  gr::Edge e;
  e.id = std::move(id);
  e.source = std::move(s);
  e.sourceHandle = std::move(sh);
  e.target = std::move(t);
  e.targetHandle = std::move(th);
  return e;
}

void correlationIterationThenAggregate() {
  std::vector<gr::Node> nodes;
  nodes.push_back(makeNode("src", "c.Const", {}, std::nullopt));
  nodes.push_back(makeNode(
      "each", "c.ForEach",
      {{"output", {"iteration", "__execution__", "items", std::nullopt}},
       {"index", {"iteration", "__execution__", "items", std::nullopt}}},
      "buffered"));
  nodes.push_back(makeNode("add", "c.Add", {}, std::nullopt));
  nodes.back().outputs = Json{{"output", "int"}};
  nodes.push_back(makeNode("collect", "c.Collect",
                           {{"output", {"aggregate", "input_item", std::nullopt, "innermost"}}},
                           "stream"));
  nodes.push_back(makeNode("out", "c.Out", {{"output", {"forward", "value", std::nullopt, std::nullopt}}},
                           "buffered"));
  std::vector<gr::Edge> edges = {
      makeEdge("e1", "src", "output", "each", "input_list"),
      makeEdge("e2", "each", "output", "add", "a"),
      makeEdge("e3", "src", "output", "add", "b"),
      makeEdge("e4", "add", "output", "collect", "input_item"),
      makeEdge("e5", "collect", "output", "out", "value")};
  gr::Graph g(std::move(nodes), std::move(edges));
  auto r = gr::analyzeCorrelation(g);
  CHECK(r.issues.empty());
  const auto& add = r.nodes.at("add");
  CHECK((add.invocationScope == gr::Scope{"each:items"}));
  CHECK(add.input("b")->scope.empty());
  CHECK((r.nodes.at("collect").input("input_item")->scope == gr::Scope{"each:items"}));
  CHECK(r.nodes.at("out").invocationScope.empty());
  CHECK(r.nodes.at("collect").output("output")->scope.empty());
}

// As in the TypeScript analyzer, a node whose descriptor lists no outputs
// and declares no output_correlation produces no output facts, so its
// downstream edges sit at the empty scope.
void correlationUndeclaredOutputsResetScope() {
  std::vector<gr::Node> nodes;
  nodes.push_back(makeNode("src", "c.Const", {}, std::nullopt));
  nodes.push_back(makeNode(
      "each", "c.ForEach",
      {{"output", {"iteration", "__execution__", "items", std::nullopt}}}, "buffered"));
  nodes.push_back(makeNode("add", "c.Add", {}, std::nullopt));
  nodes.push_back(makeNode("sink", "c.Sink", {}, std::nullopt));
  std::vector<gr::Edge> edges = {makeEdge("e1", "src", "output", "each", "input_list"),
                                 makeEdge("e2", "each", "output", "add", "a"),
                                 makeEdge("e3", "add", "output", "sink", "x")};
  gr::Graph g(std::move(nodes), std::move(edges));
  auto r = gr::analyzeCorrelation(g);
  CHECK(r.issues.empty());
  CHECK((r.nodes.at("add").invocationScope == gr::Scope{"each:items"}));
  CHECK(r.nodes.at("sink").input("x")->scope.empty());
}

void correlationRejectsCycles() {
  std::vector<gr::Node> nodes;
  nodes.push_back(makeNode("a", "t.A", {}, std::nullopt));
  nodes.push_back(makeNode("b", "t.B", {}, std::nullopt));
  std::vector<gr::Edge> edges = {makeEdge("e1", "a", "output", "b", "x"),
                                 makeEdge("e2", "b", "output", "a", "y")};
  gr::Graph g(std::move(nodes), std::move(edges));
  auto r = gr::analyzeCorrelation(g);
  CHECK(r.issues.size() == 1);
  CHECK(r.issues[0].message.find("Involved nodes: a, b") != std::string::npos);
}

void lineageProjection() {
  gr::Lineage l{{"a:items", 2}, {"b:items", 5}};
  CHECK(gr::projectLineageKey(l, {"b:items", "a:items"}) == "b:items=5,a:items=2");
  CHECK(!gr::tryProjectLineageKey(l, {"c:items"}).has_value());
  CHECK(gr::tryProjectLineageKey(l, {}).value() == "");
}

void engineViewBytesLendsWithoutCopy() {
  // F8: viewBytes lends the bytes a view covers; two views share memory.
  auto e = js::createQuickJsEngine();
  js::Value whole = e->evaluateScript("globalThis.buf = new Uint8Array([9, 1, 2, 3, 4]); buf", "t.js");
  js::Value part = e->evaluateScript("buf.subarray(1, 4)", "t.js");
  const auto a = e->viewBytes(whole);
  const auto b = e->viewBytes(part);
  CHECK(a.size() == 5 && b.size() == 3);
  CHECK(b.data() == a.data() + 1);
  CHECK(b[0] == 1 && b[2] == 3);
  js::Value detached = e->evaluateScript("const d = new ArrayBuffer(8); d.transfer(); d", "t.js");
  CHECK(e->viewBytes(detached).empty());
}

void engineInterruptStaysUncatchableInHostCalls() {
  // S4: a host function that calls back into JavaScript and wraps the
  // interrupt in its own C++ error must not make the interrupt catchable.
  auto e = js::createQuickJsEngine();
  bool stop = false;
  e->evaluateScript("globalThis.spin = () => { for (;;) {} };", "t.js");
  e->set(e->global(), "reenter", e->function("reenter", 0, [&stop](js::Engine& en, const std::vector<js::Value>&) -> js::Value {
    stop = true;
    try {
      en.call(en.get(en.global(), "spin"), en.undefined(), {});
    } catch (const js::JsError&) {
      throw std::runtime_error("wrapped");
    }
    return en.undefined();
  }));
  e->setInterruptHandler([&stop] { return stop; });
  bool escaped = false;
  try {
    e->evaluateScript("(() => { try { reenter(); } catch (x) { return 'caught'; } return 'none'; })()", "t.js");
  } catch (const js::JsError&) {
    escaped = true;
  }
  e->setInterruptHandler({});
  CHECK(escaped);
}

}  // namespace

int main() {
  std::vector<std::pair<const char*, std::function<void()>>> tests = {
      {"engineEvaluatesAndCalls", engineEvaluatesAndCalls},
      {"engineHostFunctionRoundTrip", engineHostFunctionRoundTrip},
      {"engineErrorsCrossTheBoundary", engineErrorsCrossTheBoundary},
      {"engineBytesRoundTrip", engineBytesRoundTrip},
      {"enginePromisesSettleThroughJobs", enginePromisesSettleThroughJobs},
      {"engineBytecodeRoundTrip", engineBytecodeRoundTrip},
      {"engineHeapLimitRaisesOutOfMemory", engineHeapLimitRaisesOutOfMemory},
      {"engineBytecodeKeepsStackLines", engineBytecodeKeepsStackLines},
      {"engineHostErrorsKeepMessageAndName", engineHostErrorsKeepMessageAndName},
      {"engineViewBytesLendsWithoutCopy", engineViewBytesLendsWithoutCopy},
      {"engineInterruptStaysUncatchableInHostCalls", engineInterruptStaysUncatchableInHostCalls},
      {"tasksResumeThroughTheLoop", tasksResumeThroughTheLoop},
      {"abandonDestroysSuspendedFrames", abandonDestroysSuspendedFrames},
      {"finishedTasksLeaveNoFrames", finishedTasksLeaveNoFrames},
      {"normalizeMovesEditorFields", normalizeMovesEditorFields},
      {"normalizePrunesEditorOnlyNodes", normalizePrunesEditorOnlyNodes},
      {"stalledRunIsAbandoned", stalledRunIsAbandoned},
      {"fanOutSharesLargeValues", fanOutSharesLargeValues},
      {"bytesHaveTheirWireText", bytesHaveTheirWireText},
      {"inboxEndsStreamWhenAllUpstreamsAreDone", inboxEndsStreamWhenAllUpstreamsAreDone},
      {"inboxAnyFollowsArrivalOrder", inboxAnyFollowsArrivalOrder},
      {"inboxDrainAndClose", inboxDrainAndClose},
      {"inboxLargeStreamIsLinear", inboxLargeStreamIsLinear},
      {"correlationIterationThenAggregate", correlationIterationThenAggregate},
      {"correlationUndeclaredOutputsResetScope", correlationUndeclaredOutputsResetScope},
      {"correlationRejectsCycles", correlationRejectsCycles},
      {"lineageProjection", lineageProjection},
  };
  for (const auto& [name, fn] : tests) {
    int before = failures;
    fn();
    std::fprintf(stderr, "%s %s\n", failures == before ? "PASS" : "FAIL", name);
  }
  std::fprintf(stderr, "%d checks, %d failed\n", checks, failures);
  return failures == 0 ? 0 : 1;
}
