// Tests for the guest's JavaScript environment: module loading with
// top-level await (source and bytecode), timers on the kernel loop, the Intl
// subset and structuredClone in the real guest bundle, and timers across a
// cancelled run of the library.
//
//   gr_env_tests <guest.js>
#include "js/engine.h"
#include "kernel/guest.h"
#include "kernel/task.h"
#include "nodetool/graph_runner.h"
#include "sanitizer_build.h"

#include <nlohmann/json.hpp>

#include <atomic>
#include <chrono>
#include <condition_variable>
#include <cstdio>
#include <filesystem>
#include <fstream>
#include <functional>
#include <iterator>
#include <mutex>
#include <string>
#include <thread>
#include <vector>

namespace {

using Json = nlohmann::json;
using gr::Loop;
namespace js = gr::js;
using Clock = std::chrono::steady_clock;

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

#define CHECK_EQ(a, b)                                                           \
  do {                                                                           \
    ++checks;                                                                    \
    auto va = (a);                                                               \
    auto vb = (b);                                                               \
    if (!(va == vb)) {                                                           \
      ++failures;                                                                \
      std::fprintf(stderr, "%s:%d: CHECK_EQ failed: %s\n  got:      %s\n  expected: %s\n", \
                   __FILE__, __LINE__, #a, std::string(va).c_str(),              \
                   std::string(vb).c_str());                                     \
    }                                                                            \
  } while (0)

#include "env_cases.inc"

std::vector<uint8_t> bytesOf(const std::string& s) { return {s.begin(), s.end()}; }

std::string readFile(const std::string& path) {
  std::ifstream in(path, std::ios::binary);
  return {std::istreambuf_iterator<char>(in), std::istreambuf_iterator<char>()};
}

double msSince(Clock::time_point start) {
  return std::chrono::duration<double, std::milli>(Clock::now() - start).count();
}

// --- module loading ---------------------------------------------------------

// A bundle-shaped module whose evaluation waits on a host timer.
const char* kAwaitingModule = R"(
const log = [];
log.push("start");
await new Promise((resolve) => __host.timers.set(resolve, 5, false));
log.push("after timer");
await null;
globalThis.__nodetool = { log };
)";

std::string evaluatedLog(js::Engine& e) {
  js::Value log = e.get(e.get(e.global(), "__nodetool"), "log");
  return e.toString(e.call(e.get(log, "join"), log, {e.string(",")}));
}

void moduleTopLevelAwaitFromSource() {
  auto e = js::createQuickJsEngine();
  gr::Guest guest(*e);
  guest.load(bytesOf(kAwaitingModule), "awaiting.mjs");
  CHECK_EQ(evaluatedLog(*e), "start,after timer");
  CHECK(Loop::current().pendingTimers() == 0);
}

void moduleTopLevelAwaitFromBytecode() {
  std::vector<uint8_t> bc;
  {
    auto e = js::createQuickJsEngine();
    gr::Guest guest(*e);
    bc = guest.compile(kAwaitingModule, "awaiting.mjs");
  }
  CHECK(gr::Guest::isBytecode(bc));
  auto e = js::createQuickJsEngine();
  gr::Guest guest(*e);
  guest.load(bc, "awaiting.bin");
  CHECK_EQ(evaluatedLog(*e), "start,after timer");
}

// A guest.bin with a changed header or a wrong hash is refused by name.
void bytecodeHeaderIsChecked() {
  std::vector<uint8_t> bc;
  {
    auto e = js::createQuickJsEngine();
    gr::Guest guest(*e);
    bc = guest.compile("globalThis.__nodetool = {};", "h.mjs");
  }
  auto loadWith = [](const std::vector<uint8_t>& bundle) {
    auto e = js::createQuickJsEngine();
    gr::Guest guest(*e);
    try {
      guest.load(bundle, "h.bin");
    } catch (const std::exception& err) {
      return std::string(err.what());
    }
    return std::string();
  };
  CHECK_EQ(loadWith(bc), "");
  auto bad = bc;
  bad[10] ^= 0x55;  // inside the QuickJS version field
  CHECK(loadWith(bad).find("QuickJS version") != std::string::npos);
  bad = bc;
  bad.back() ^= 0x55;  // inside the bytecode payload
  CHECK(loadWith(bad).find("hash") != std::string::npos);
  bad = bc;
  bad.resize(12);  // truncated header
  CHECK(loadWith(bad).find("header") != std::string::npos);
}

std::string loadError(const std::string& source, bool bytecode) {
  std::vector<uint8_t> bundle = bytesOf(source);
  if (bytecode) {
    auto e = js::createQuickJsEngine();
    gr::Guest guest(*e);
    bundle = guest.compile(source, "m.mjs");
  }
  auto e = js::createQuickJsEngine();
  gr::Guest guest(*e);
  try {
    guest.load(bundle, "m.mjs");
  } catch (const std::exception& err) {
    return err.what();
  }
  return "";
}

// The guest cannot queue an unbounded number of timers.
void timerCountIsBounded() {
  CHECK_EQ(loadError("let stopped = false;"
                     "try { for (let i = 0; i < 20000; i++) __host.timers.set(() => {}, 60000, false); }"
                     "catch (e) { stopped = String(e.message).includes('timers'); }"
                     "if (!stopped) throw new Error('no timer quota');"
                     "globalThis.__nodetool = {};",
                     false),
           "");
  CHECK(Loop::current().pendingTimers() == 0);
}

void moduleFailuresAreLoadErrors() {
  for (bool bytecode : {false, true}) {
    CHECK_EQ(loadError("await null; throw new TypeError('late');", bytecode), "TypeError: late");
    CHECK_EQ(loadError("throw new Error('early');", bytecode), "Error: early");
    CHECK_EQ(loadError("await new Promise(() => {});", bytecode),
             "the bundle's top-level await never settled");
    // Timers the module leaves behind do not survive the load.
    CHECK_EQ(loadError("__host.timers.set(() => {}, 60000, true); globalThis.__nodetool = {};",
                       bytecode),
             "");
    CHECK(Loop::current().pendingTimers() == 0);
  }
  CHECK(!loadError("export const x = ;", false).empty());
}

void loadStopsWhenAsked() {
  auto e = js::createQuickJsEngine();
  gr::Guest guest(*e);
  std::atomic<bool> stop{false};
  // The load sleeps until its timer is due. The runner's teardown sets its
  // stop flag and wakes the loop; this thread does the same.
  Loop* loop = &Loop::current();
  std::thread stopper([&] {
    std::this_thread::sleep_for(std::chrono::milliseconds(50));
    stop = true;
    loop->wake();
  });
  const auto start = Clock::now();
  std::string error;
  try {
    guest.load(bytesOf("await new Promise((r) => __host.timers.set(r, 60000, false));"),
               "slow.mjs", [&] { return stop.load(); });
  } catch (const std::exception& err) {
    error = err.what();
  }
  stopper.join();
  CHECK_EQ(error, "the bundle load was stopped");
  CHECK(msSince(start) < 5000);
  CHECK(Loop::current().pendingTimers() == 0);
}

// --- the loop's timers ------------------------------------------------------

void loopTimersFireInDeadlineOrder() {
  Loop& loop = Loop::current();
  std::vector<std::string> log;
  loop.setTimer(std::chrono::milliseconds(20), [&] { log.push_back("20"); });
  loop.setTimer(std::chrono::milliseconds(0), [&] { log.push_back("0a"); });
  loop.setTimer(std::chrono::milliseconds(0), [&] { log.push_back("0b"); });
  const uint64_t cleared = loop.setTimer(std::chrono::milliseconds(5), [&] { log.push_back("5"); });
  int ticks = 0;
  uint64_t interval = 0;
  interval = loop.setTimer(std::chrono::milliseconds(2), [&] {
    log.push_back("i");
    if (++ticks == 3) loop.clearTimer(interval);
  }, true);
  CHECK(loop.clearTimer(cleared));
  CHECK(!loop.clearTimer(cleared));
  const auto start = Clock::now();
  loop.run();
  CHECK(msSince(start) >= 19);
  CHECK(loop.pendingTimers() == 0);
  std::string joined;
  for (const auto& s : log) joined += s + " ";
  CHECK_EQ(joined, "0a 0b i i i 20 ");
}

void loopLimitDropsLaterTimers() {
  Loop& loop = Loop::current();
  int fired = 0;
  loop.setTimer(std::chrono::milliseconds(5), [&] { ++fired; });
  loop.setTimer(std::chrono::milliseconds(60000), [&] { ++fired; });
  loop.limitTimers(Clock::now() + std::chrono::milliseconds(200));
  CHECK(loop.pendingTimers() == 1);
  // Set past the limit: dropped at once. A repeating timer stops at the limit.
  loop.setTimer(std::chrono::milliseconds(1000), [&] { ++fired; });
  CHECK(loop.pendingTimers() == 1);
  int repeats = 0;
  loop.setTimer(std::chrono::milliseconds(30), [&] { ++repeats; }, true);
  const auto start = Clock::now();
  loop.run();
  CHECK(fired == 1);
  CHECK(repeats >= 1 && repeats <= 7);
  CHECK(msSince(start) < 1000);
  loop.clearTimers();
  // clearTimers lifts the limit.
  loop.setTimer(std::chrono::milliseconds(300), [&] { ++fired; });
  CHECK(loop.pendingTimers() == 1);
  loop.clearTimers();
}

void loopWakeEndsAWait() {
  Loop& loop = Loop::current();
  loop.setTimer(std::chrono::milliseconds(60000), [] {});
  std::atomic<bool> stop{false};
  std::thread waker([&] {
    std::this_thread::sleep_for(std::chrono::milliseconds(50));
    stop = true;
    loop.wake();
  });
  const auto start = Clock::now();
  loop.run([&] { return stop.load(); });
  waker.join();
  CHECK(msSince(start) < 5000);
  CHECK(loop.pendingTimers() == 1);
  loop.clearTimers();
}

// --- the guest environment ---------------------------------------------------

// The default guest bundle, loaded once for the environment checks.
struct LoadedGuest {
  std::unique_ptr<js::Engine> engine = js::createQuickJsEngine();
  std::unique_ptr<gr::Guest> guest = std::make_unique<gr::Guest>(*engine, withBundleAssets());

  static gr::HostOptions withBundleAssets() {
    gr::HostOptions options;
    options.bundleAssetsDir = gr::defaultBundleAssetsDir(bundlePath);
    return options;
  }

  LoadedGuest() { guest->load(bytesOf(readFile(bundlePath)), bundlePath); }
  ~LoadedGuest() { Loop::current().clearTimers(); }

  std::string eval(const std::string& expr) {
    return engine->toString(engine->evaluateScript(expr, "check.js"));
  }

  // The name of the error `expr` throws, or "no error".
  std::string errorName(const std::string& expr) {
    return eval("(() => { try { " + expr + "; return 'no error'; } catch (e) { return e.name; } })()");
  }

  // Runs jobs and timers until nothing is left, as a run does.
  void settle() {
    Loop& loop = Loop::current();
    loop.setPump([this] { return guest->pump(); });
    loop.run();
    loop.setPump(nullptr);
  }
};

// PT7: with the type snapshot that `compile` writes, a module outside core
// is evaluated when one of its types is first needed, and the catalog still
// lists every type. Without a snapshot every module loads at once.
void lazyNodeModulesLoadOnFirstUse(LoadedGuest& g) {
  const bool snapshot = std::filesystem::exists(std::filesystem::path(gr::defaultBundleAssetsDir(bundlePath)) / "types.json");
  if (!snapshot || g.eval("String(!!globalThis.__nodetoolLazyNodes?.snapshot)") != "true") {
    CHECK(!snapshot);  // a snapshot must put the guest in lazy mode
    return;
  }
  const std::string type = g.eval(
      "Object.keys(globalThis.__nodetoolLazyNodes.snapshot.types)"
      ".find((t) => globalThis.__nodetool.pending(t)) ?? ''");
  CHECK(!type.empty());
  CHECK(g.guest->types().contains(type));
  CHECK(g.guest->describe(gr::Json{{"type", type}}).has_value());  // from the snapshot
  CHECK(g.eval("String(__nodetool.pending(" + gr::Json(type).dump() + "))") == "true");
  CHECK(g.guest->describe(gr::Json{{"type", type}, {"id", "n"}, {"properties", gr::Json::object()}}).has_value());
  CHECK(g.eval("String(__nodetool.pending(" + gr::Json(type).dump() + "))") == "false");
}

void intlMatchesNode(LoadedGuest& g) {
  for (const auto& [expr, expected] : kIntlCases) CHECK_EQ(g.eval(expr), expected);
  for (const auto& [expr, name] : kIntlErrors) {
    const auto actual = g.errorName(expr);
    if (actual != name) std::fprintf(stderr,"Intl expression: %s\n",expr.c_str());
    CHECK_EQ(actual, name);
  }
}

void intlRefusesWhatItCannotFormat(LoadedGuest& g) {
  const std::map<std::string,std::string> nowSupported = {
    {"new Intl.NumberFormat('de-DE').format(1234.5)", "1.234,5"},
    {"new Intl.NumberFormat(['fr', 'en']).format(1)", "1"},
    {"new Intl.NumberFormat('en-GB').format(1)", "1"},
    {"new Intl.NumberFormat('en', { style: 'currency', currency: 'USD' }).format(1)", "$1.00"},
    {"(1234.5).toLocaleString('de')", "1.234,5"},
    {"new Date(0).toLocaleString('en-US', { timeZone: 'UTC' })", "1/1/1970, 12:00:00 AM"},
    {"new Date(0).toLocaleDateString('ja')", "1970/1/1"}
  };
  for (const auto& expr : kIntlRefusals) {
    auto it = nowSupported.find(expr);
    if (it != nowSupported.end()) CHECK_EQ(g.eval(expr),it->second);
    else CHECK_EQ(g.errorName(expr), "IntlUnsupportedError");
  }
  CHECK_EQ(g.eval("typeof Intl.Segmenter + typeof Intl.DateTimeFormat + typeof Intl.Collator"),
           "undefinedfunctionfunction");
}

void structuredCloneMatchesNode(LoadedGuest& g) {
  for (const auto& [expr, expected] : kCloneCases) CHECK_EQ(g.eval(expr), expected);
  for (const auto& expr : kCloneErrors) CHECK_EQ(g.errorName(expr), "DataCloneError");
  // A failed clone leaves the transfer list attached.
  CHECK_EQ(g.eval("(() => { const b = new ArrayBuffer(4); try { structuredClone({ b, f() {} }, "
                  "{ transfer: [b] }); } catch {} return String(b.byteLength); })()"),
           "4");
}

void timersOrderAfterMicrotasks(LoadedGuest& g) {
  g.eval(R"(
    globalThis.order = [];
    const log = (s) => order.push(s);
    setTimeout(() => log("timeout 5"), 5);
    setTimeout((a, b) => log(`timeout 1 ${a}${b}`), 1, "x", "y");
    setTimeout(() => {
      log("timeout 1 second");
      Promise.resolve().then(() => log("micro from timer"));
      queueMicrotask(() => log("queued from timer"));
    }, 1);
    setTimeout(() => log("timeout 1 third"), 1);
    setImmediate(() => log("immediate"));
    const dropped = setTimeout(() => log("cleared"), 2);
    clearTimeout(dropped);
    const byNumber = setTimeout(() => log("cleared by number"), 2);
    clearTimeout(Number(byNumber));
    let n = 0;
    const iv = setInterval(() => { log(`interval ${++n}`); if (n === 2) clearInterval(iv); }, 2);
    Promise.resolve().then(() => log("micro"));
    queueMicrotask(() => log("queued"));
    log("sync");
  )");
  g.settle();
  // Intervals interleave with the 5 ms timer by wall clock, so check them apart.
  CHECK_EQ(g.eval("order.filter((s) => !s.startsWith('interval')).join('|')"),
           "sync|micro|queued|immediate|timeout 1 xy|timeout 1 second|micro from timer|"
           "queued from timer|timeout 1 third|timeout 5");
  CHECK_EQ(g.eval("order.filter((s) => s.startsWith('interval')).join('|')"),
           "interval 1|interval 2");
  CHECK(Loop::current().pendingTimers() == 0);
}

void timersFollowNodeApi(LoadedGuest& g) {
  CHECK_EQ(g.eval("String(__host.timers.clear(Infinity)) + String(__host.timers.clear(1.5))"), "falsefalse");
  CHECK_EQ(g.errorName("__host.timers.set(() => {}, 1e30, false)"), "Error");
  CHECK_EQ(g.eval("(() => { const t = setTimeout(() => {}, 10); const r = [typeof t, t.hasRef(), "
                  "t.unref() === t, t.hasRef(), typeof +t, Number.isInteger(+t)]; clearTimeout(t); "
                  "return r.join(); })()"),
           "object,true,true,false,number,true");
  CHECK_EQ(g.errorName("setTimeout('code', 1)"), "TypeError");
  CHECK_EQ(g.eval("(() => { try { setInterval(null); } catch (e) { return e.code; } })()"),
           "ERR_INVALID_ARG_TYPE");
  // Node's delay rule: anything outside 1 .. 2^31-1 is 1 ms.
  g.eval(R"(
    globalThis.delays = [];
    setTimeout(() => delays.push("nan"), NaN);
    setTimeout(() => delays.push("huge"), 2 ** 40);
    setTimeout(() => delays.push("negative"), -5);
  )");
  const auto start = Clock::now();
  g.settle();
  CHECK(msSince(start) < 1000);
  CHECK_EQ(g.eval("delays.join()"), "nan,huge,negative");
  // An error in a timer callback is reported and does not stop later timers.
  g.eval("globalThis.after = false; setTimeout(() => { throw new Error('in timer'); }, 1); "
         "setTimeout(() => { after = true; }, 2);");
  g.settle();
  CHECK_EQ(g.eval("String(after)"), "true");
  CHECK_EQ(g.eval("typeof globalThis.process + ':' + process.cwd() + ':' + process.getuid()"), "object:/:1000");
  CHECK_EQ(g.eval("typeof __host.process.platform + typeof __host.process.arch"), "stringstring");
  CHECK_EQ(g.eval("Object.keys(__host.process).sort().join()"), "arch,platform");
}

// --- timers in library runs -------------------------------------------------

// Test node types added to the default guest: test.Sleep resolves after
// `value` ms, test.Interval leaves an interval running, and test.Pending
// reports the pending host timers and the interval's ticks.
const char* kTestNodes = R"(
{
  const base = globalThis.__nodetool;
  const TEMPLATE = "nodetool.constant.Integer";
  const behaviors = {
    "test.Sleep": (p) => new Promise((resolve) => setTimeout(() => resolve({ output: p.value }), p.value)),
    "test.Interval": (p) => {
      setInterval(() => { globalThis.__ticks = (globalThis.__ticks ?? 0) + 1; }, p.value);
      return { output: 0 };
    },
    "test.Pending": async () => ({ output: { pending: __host.timers.pending(), ticks: globalThis.__ticks ?? 0, abortFired: globalThis.__abortFired ?? 0, listenerTimers: globalThis.__listenerTimers ?? -1 } }),
    "test.AbortListener": () => new Promise((resolve) => {
      // A long timer stands for the job the node waits on, so the run is not stalled.
      const wait = setTimeout(() => resolve({ output: 1 }), 60000);
      const before = __host.timers.pending();
      const signal = __hostAbort.signal();
      signal.addEventListener("abort", () => {
        globalThis.__abortFired = (globalThis.__abortFired ?? 0) + 1;
        clearTimeout(wait);
        resolve({ output: 0 });
      });
      globalThis.__listenerTimers = __host.timers.pending() - before;
    })
  };
  const isTest = (type) => Object.hasOwn(behaviors, type);
  const own = new Map();
  let next = 1e9;
  globalThis.__nodetool = {
    ...base,
    types() {
      return base.types().then((json) => {
        const t = JSON.parse(json);
        for (const type of Object.keys(behaviors)) t[type] = { ...t[TEMPLATE], nodeType: type };
        return JSON.stringify(t);
      });
    },
    describe(nodeJson) {
      const n = JSON.parse(nodeJson);
      return base.describe(isTest(n.type) ? JSON.stringify({ ...n, type: TEMPLATE }) : nodeJson);
    },
    validate(nodeJson, connected) {
      return isTest(JSON.parse(nodeJson).type) ? "[]" : base.validate(nodeJson, connected);
    },
    create(nodeJson) {
      const n = JSON.parse(nodeJson);
      if (!isTest(n.type)) return base.create(nodeJson);
      const id = next++;
      own.set(id, n);
      return id;
    },
    release(id) {
      if (!own.delete(id)) base.release(id);
    },
    call(id, method, inputsJson) {
      const n = own.get(id);
      if (!n) return base.call(id, method, inputsJson);
      return Promise.resolve(method === "process" ? behaviors[n.type]({ ...n.properties, ...JSON.parse(inputsJson) }) : null)
        .then((value) => JSON.stringify({ ok: true, value }), (err) => JSON.stringify({ ok: false, error: String(err) }));
    }
  };
}
)";

// native-rules #9: written from the worker thread and read by the test, no affinity comment
struct Collector {
  std::mutex mutex;
  std::condition_variable changed;
  std::vector<Json> messages;
  bool finished = false;
  std::string status;

  gr::GraphRunner::MessageHandler handler() {
    // native-rules #12: lambda captures raw this and runs on the worker thread
    return [this](const std::string& text, bool last) {
      std::lock_guard lock(mutex);
      Json msg = Json::parse(text);
      if (msg.value("type", std::string()) == "job_update" && status.empty()) {
        const std::string s = msg.value("status", std::string());
        if (s == "completed" || s == "failed" || s == "cancelled") status = s;
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
  std::string waitTerminal() {
    waitFor([this] { return finished; });
    std::lock_guard lock(mutex);
    return status;
  }
  bool started(const std::string& nodeId) {
    for (const auto& m : messages) {
      if (m.value("type", std::string()) == "node_update" && m.value("node_id", std::string()) == nodeId &&
          m.value("status", std::string()) == "running") {
        return true;
      }
    }
    return false;
  }
  Json output(const std::string& nodeId) {
    std::lock_guard lock(mutex);
    for (const auto& m : messages) {
      if (m.value("type", std::string()) == "output_update" && m.value("node_id", std::string()) == nodeId) {
        return m["value"];
      }
    }
    return nullptr;
  }
};

std::string graphOf(const std::string& type, long long value) {
  return Json{{"nodes",
               {{{"id", "n"}, {"type", type}, {"properties", {{"value", value}}}},
                {{"id", "out"}, {"type", "nodetool.output.Output"}, {"properties", {{"name", "o"}}}}}},
              {"edges",
               {{{"id", "e"}, {"source", "n"}, {"sourceHandle", "output"}, {"target", "out"},
                 {"targetHandle", "value"}}}}}
      .dump();
}

// The default guest with the test nodes appended, as source or bytecode.
std::string testBundle(bool bytecode) {
  const auto dir = std::filesystem::temp_directory_path();
  const std::string source = readFile(bundlePath) + "\n" + kTestNodes;
  const auto js = (dir / "gr-env-test-guest.js").string();
  std::ofstream(js, std::ios::binary) << source;
  if (!bytecode) return js;
  const auto bc = gr::compileBundle(source, js);
  const auto bin = (dir / "gr-env-test-guest.bin").string();
  std::ofstream(bin, std::ios::binary).write(reinterpret_cast<const char*>(bc.data()),
                                             std::streamsize(bc.size()));
  return bin;
}

Json pendingAfter(gr::GraphRunner& runner, const std::string& job) {
  const auto deadline = Clock::now() + std::chrono::seconds(60 * gr::test::timeBudgetScale());
  while (!runner.ready() && Clock::now() < deadline) {
    std::this_thread::sleep_for(std::chrono::milliseconds(1));
  }
  CHECK(runner.ready());
  Collector c;
  runner.submit(job, "wf", graphOf("test.Pending", 0), "", c.handler());
  CHECK_EQ(c.waitTerminal(), "completed");
  return c.output("out");
}

void runsWaitForTimersAndDropThemAfter(bool bytecode) {
  gr::GraphRunner runner(testBundle(bytecode));
  CHECK(runner.waitUntilLoaded(60000));
  CHECK_EQ(runner.loadError(), "");

  Collector sleep;
  runner.submit("sleep", "wf", graphOf("test.Sleep", 30), "", sleep.handler());
  CHECK_EQ(sleep.waitTerminal(), "completed");
  CHECK(sleep.output("out") == 30);

  // An interval the run leaves behind is dropped when the run ends.
  Collector interval;
  runner.submit("interval", "wf", graphOf("test.Interval", 1), "", interval.handler());
  CHECK_EQ(interval.waitTerminal(), "completed");
  Json first = pendingAfter(runner, "pending-1");
  std::this_thread::sleep_for(std::chrono::milliseconds(30));
  Json second = pendingAfter(runner, "pending-2");
  CHECK(first.is_object() && first["pending"] == 0);
  CHECK(second.is_object() && second["pending"] == 0 && second["ticks"] == first["ticks"]);
  CHECK(runner.contextLoads() == 1);
}

void cancelledRunsLeaveNoTimers(bool bytecode) {
  gr::GraphRunner runner(testBundle(bytecode));
  CHECK(runner.waitUntilLoaded(60000));

  // A timer inside the cancel grace period still fires, so the node
  // finishes and the context stays.
  // The pause lets the node reach its setTimeout call: a cancel that lands
  // between the node_update and the call stops the node before it starts.
  const auto pause = std::chrono::milliseconds(50);
  Collector shortSleep;
  runner.submit("short", "wf", graphOf("test.Sleep", 300), "", shortSleep.handler());
  CHECK(shortSleep.waitFor([&] { return shortSleep.started("n"); }));
  std::this_thread::sleep_for(pause);
  CHECK(runner.cancel("short"));
  CHECK_EQ(shortSleep.waitTerminal(), "cancelled");
  CHECK(runner.contextLoads() == 1);
  Json pending = pendingAfter(runner, "after-short");
  CHECK(pending.is_object() && pending["pending"] == 0);

  // A timer past the grace period is dropped at once: the cancel does not
  // wait for it, and the stalled node's context is replaced.
  Collector longSleep;
  runner.submit("long", "wf", graphOf("test.Sleep", 60000), "", longSleep.handler());
  CHECK(longSleep.waitFor([&] { return longSleep.started("n"); }));
  std::this_thread::sleep_for(pause);
  const auto start = Clock::now();
  CHECK(runner.cancel("long"));
  CHECK_EQ(longSleep.waitTerminal(), "cancelled");
  CHECK(msSince(start) < 3000);
  pending = pendingAfter(runner, "after-long");
  CHECK(pending.is_object() && pending["pending"] == 0);
  CHECK(runner.contextLoads() == 2);
}

// PT16: a cancel reaches an abort listener without a poll timer.
void cancelReachesAbortListenerWithoutPoll() {
  gr::GraphRunner runner(testBundle(true));
  CHECK(runner.waitUntilLoaded(60000));
  Collector c;
  runner.submit("abort", "wf", graphOf("test.AbortListener", 0), "", c.handler());
  CHECK(c.waitFor([&] { return c.started("n"); }));
  std::this_thread::sleep_for(std::chrono::milliseconds(50));
  const auto start = Clock::now();
  CHECK(runner.cancel("abort"));
  CHECK_EQ(c.waitTerminal(), "cancelled");
  std::fprintf(stderr, "cancel to terminal: %.0f ms\n", msSince(start));
  Json pending = pendingAfter(runner, "after-abort");
  CHECK(pending.is_object() && pending["abortFired"] == 1);
  CHECK(pending["listenerTimers"] == 0);
  CHECK(runner.contextLoads() == 1);
}

// PT8: the spare context, loaded while the runner is idle, replaces a
// discarded context, so the next run starts without a bundle load.
void spareContextReplacesADiscardedContext(bool withSpare) {
  const std::string bundle = testBundle(true);
  Clock::time_point start = Clock::now();
  gr::HostOptions options;
  options.spareContext = withSpare;
  gr::GraphRunner runner(bundle, options);
  CHECK(runner.waitUntilLoaded(60000));
  const double coldMs = msSince(start);
  // Idle time for the spare load, which starts after one second of idle time
  // and takes about as long as the first.
  std::this_thread::sleep_for(std::chrono::milliseconds(int(coldMs) * 3 + 1500));

  Collector longSleep;
  runner.submit("long", "wf", graphOf("test.Sleep", 60000), "", longSleep.handler());
  CHECK(longSleep.waitFor([&] { return longSleep.started("n"); }));
  std::this_thread::sleep_for(std::chrono::milliseconds(50));
  CHECK(runner.cancel("long"));
  CHECK_EQ(longSleep.waitTerminal(), "cancelled");
  start = Clock::now();
  Json pending = pendingAfter(runner, "after-discard");
  const double nextMs = msSince(start);
  std::fprintf(stderr, "%s spare: cold load %.0f ms, run after a discarded context %.0f ms\n",
               withSpare ? "with" : "without", coldMs, nextMs);
  CHECK(pending.is_object() && pending["pending"] == 0);
  CHECK(runner.contextLoads() == 2);
  if (withSpare) CHECK(nextMs < coldMs / 2);
}

// A job sent right after the first load starts before the spare load, so it
// does not wait one more bundle load.
void firstJobGoesBeforeTheSpareLoad() {
  const std::string bundle = testBundle(true);
  Clock::time_point start = Clock::now();
  gr::GraphRunner runner(bundle);
  CHECK(runner.waitUntilLoaded(60000));
  const double coldMs = msSince(start);
  start = Clock::now();
  Json pending = pendingAfter(runner, "first-job");
  const double firstMs = msSince(start);
  std::fprintf(stderr, "cold load %.0f ms, first job %.0f ms\n", coldMs, firstMs);
  CHECK(pending.is_object());
  CHECK(firstMs < coldMs / 2);
  CHECK(runner.contextLoads() == 1);
}

void teardownDuringATimerWait() {
  Clock::time_point start;
  // The collector outlives the runner, whose teardown sends it the
  // cancelled job_update.
  Collector c;
  {
    gr::GraphRunner runner(testBundle(false));
    runner.submit("long", "wf", graphOf("test.Sleep", 60000), "", c.handler());
    CHECK(c.waitFor([&] { return c.started("n"); }));
    start = Clock::now();
  }
  CHECK(msSince(start) < 10000);
  CHECK_EQ(c.waitTerminal(), "cancelled");
}

}  // namespace

int main(int argc, char** argv) {
  if (argc < 2) {
    std::fprintf(stderr, "usage: gr_env_tests <guest.js>\n");
    return 2;
  }
  bundlePath = argv[1];
  if (argc > 2) {
    // Separate engines must each import memfs and retain the virtual identity.
    for (int i = 0; i < 2; ++i) {
      CHECK_EQ(loadError(readFile(argv[2]), false), "");
    }
  }
  std::vector<std::pair<const char*, std::function<void()>>> tests = {
      {"moduleTopLevelAwaitFromSource", moduleTopLevelAwaitFromSource},
      {"moduleTopLevelAwaitFromBytecode", moduleTopLevelAwaitFromBytecode},
      {"moduleFailuresAreLoadErrors", moduleFailuresAreLoadErrors},
      {"timerCountIsBounded", timerCountIsBounded},
      {"bytecodeHeaderIsChecked", bytecodeHeaderIsChecked},
      {"loadStopsWhenAsked", loadStopsWhenAsked},
      {"loopTimersFireInDeadlineOrder", loopTimersFireInDeadlineOrder},
      {"loopLimitDropsLaterTimers", loopLimitDropsLaterTimers},
      {"loopWakeEndsAWait", loopWakeEndsAWait},
  };
  std::unique_ptr<LoadedGuest> guest;
  auto withGuest = [&](void (*fn)(LoadedGuest&)) {
    return [&guest, fn] {
      if (!guest) guest = std::make_unique<LoadedGuest>();
      fn(*guest);
    };
  };
  tests.push_back({"lazyNodeModulesLoadOnFirstUse", withGuest(lazyNodeModulesLoadOnFirstUse)});
  tests.push_back({"intlMatchesNode", withGuest(intlMatchesNode)});
  tests.push_back({"intlRefusesWhatItCannotFormat", withGuest(intlRefusesWhatItCannotFormat)});
  tests.push_back({"structuredCloneMatchesNode", withGuest(structuredCloneMatchesNode)});
  tests.push_back({"timersOrderAfterMicrotasks", withGuest(timersOrderAfterMicrotasks)});
  tests.push_back({"timersFollowNodeApi", withGuest(timersFollowNodeApi)});
  tests.push_back({"runsWaitForTimersAndDropThemAfter (source)", [] { runsWaitForTimersAndDropThemAfter(false); }});
  tests.push_back({"runsWaitForTimersAndDropThemAfter (bytecode)", [] { runsWaitForTimersAndDropThemAfter(true); }});
  tests.push_back({"cancelledRunsLeaveNoTimers (source)", [] { cancelledRunsLeaveNoTimers(false); }});
  tests.push_back({"cancelledRunsLeaveNoTimers (bytecode)", [] { cancelledRunsLeaveNoTimers(true); }});
  tests.push_back({"cancelReachesAbortListenerWithoutPoll", [] { cancelReachesAbortListenerWithoutPoll(); }});
  tests.push_back({"spareContextReplacesADiscardedContext (without)", [] { spareContextReplacesADiscardedContext(false); }});
  tests.push_back({"spareContextReplacesADiscardedContext (with)", [] { spareContextReplacesADiscardedContext(true); }});
  tests.push_back({"firstJobGoesBeforeTheSpareLoad", [] { firstJobGoesBeforeTheSpareLoad(); }});
  tests.push_back({"teardownDuringATimerWait", teardownDuringATimerWait});
  for (const auto& [name, fn] : tests) {
    int before = failures;
    try {
      fn();
    } catch (const std::exception& e) {
      ++failures;
      std::fprintf(stderr, "%s threw: %s\n", name, e.what());
    }
    std::fprintf(stderr, "%s %s\n", failures == before ? "PASS" : "FAIL", name);
  }
  guest.reset();
  std::fprintf(stderr, "%d checks, %d failed\n", checks, failures);
  return failures == 0 ? 0 : 1;
}
