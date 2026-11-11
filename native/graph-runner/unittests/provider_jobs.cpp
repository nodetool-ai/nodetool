// Runs guest endpoint calls against ProviderJobs with a fixture worker:
// progress, parts in both directions, errors, cancellation, concurrency and
// abort listener removal. The guest awaits each item through the
// asynchronous next grant, so the test binds a run as GraphRunner does and
// checks that no timer is pending while a job waits.
//
// Callbacks and workers share state with the test through shared pointers
// they capture by value (native/AGENTS.md rule 12).
#include "host/context.h"
#include "kernel/async_jobs.h"
#include "kernel/cancel_state.h"
#include "kernel/guest.h"
#include "kernel/host_lanes.h"
#include "kernel/run_control.h"
#include "kernel/task.h"
#include "nodetool/provider_jobs.h"
#include <atomic>
#include <chrono>
#include <condition_variable>
#include <fstream>
#include <iostream>
#include <iterator>
#include <memory>
#include <mutex>
#include <nlohmann/json.hpp>
#include <optional>
#include <stdexcept>
#include <thread>
using Json = nlohmann::json;
using namespace std::chrono_literals;

namespace {
// What the fixture worker and the test share.
//
// Thread affinity: thread-safe. The counters are atomic, `mutex` guards
// `gateOpen`.
struct Probe {
  std::atomic<int> cancelledCalls{0}, maxConcurrent{0}, running{0}, slowEntered{0}, heldEntered{0};
  std::mutex mutex;
  std::condition_variable changed;
  bool gateOpen = false;
  bool heldOpen = false;
  void openHeld() {
    {
      std::lock_guard lock(mutex);
      heldOpen = true;
    }
    changed.notify_all();
  }
  void openGate() {
    {
      std::lock_guard lock(mutex);
      gateOpen = true;
    }
    changed.notify_all();
  }
  bool waitGate() {
    std::unique_lock lock(mutex);
    return changed.wait_for(lock, 30s, [&] { return gateOpen; });
  }
};

std::string fixtureWorker(const std::shared_ptr<Probe> &probe, const gr::host::ProviderJobs::Call &call) {
  const auto args = Json::parse(call.argsJson);
  if (call.method == "uploadMedia") {
    const auto size = args.at("bytes").at("__bytes__").get<std::string>().size();
    return Json("https://cdn.fixture.invalid/upload/" + std::to_string(size) + "/" +
                args.at("mimeType").get<std::string>())
        .dump();
  }
  if (call.method == "downloadMedia") {
    if (args.at("url") != "https://cdn.fixture.invalid/result.bin")
      throw std::runtime_error("Unexpected download URL");
    return Json{{"__bytes__", "YWJj"}}.dump();
  }
  const auto model = args.at("model").get<std::string>();
  if (model == "fail")
    throw std::runtime_error("vendor refused the request");
  if (model == "gated") {
    call.progress(R"({"message":"waiting"})");
    if (!probe->waitGate())
      throw std::runtime_error("the gate never opened");
    return Json{{"output", {{"model", model}}}, {"requestId", "g"}}.dump();
  }
  if (model == "held") {
    ++probe->heldEntered;
    std::unique_lock lock(probe->mutex);
    probe->changed.wait_for(lock, 30s, [&] { return probe->heldOpen; });
    return Json{{"output", {{"model", model}}}, {"requestId", "h"}}.dump();
  }
  if (model == "slow") {
    ++probe->slowEntered;
    while (!call.cancelled())
      std::this_thread::sleep_for(5ms);
    ++probe->cancelledCalls;
    throw std::runtime_error("cancelled");
  }
  if (model == "large") {
    return Json{{"output",
                 {{"inputChars", call.argsJson.size()},
                  {"padding", std::string(3 * 1024 * 1024, 'a')},
                  {"text", "Grüße"}}},
                {"requestId", nullptr}}
        .dump();
  }
  if (model == "concurrent") {
    const int now = ++probe->running;
    int seen = probe->maxConcurrent.load();
    while (now > seen && !probe->maxConcurrent.compare_exchange_weak(seen, now)) {
    }
    std::this_thread::sleep_for(150ms);
    --probe->running;
    return Json{{"output", {{"model", model}}}, {"requestId", "c"}}.dump();
  }
  call.progress(R"({"message":"queued","progress":0.25})");
  call.progress(R"({"message":"running","progress":0.75})");
  return Json{{"output",
               {{"echo", args.at("input")},
                {"model", model},
                {"route", args.value("route", "")},
                {"capability", args.at("capability")},
                {"nodeId", args.value("nodeId", "")}}},
              {"requestId", "req-1"},
              {"metadata", {{"credits", 3}}}}
      .dump();
}
} // namespace

int main(int argc, char **argv) {
  try {
    if (argc != 2)
      throw std::runtime_error("Expected fixture bundle");
    auto probe = std::make_shared<Probe>();
    // The lanes outlive the jobs and the run: declared first, destroyed last.
    gr::ThreadPoolExecutor io("io", 4);
    gr::ThreadPoolExecutor network("network", 8);
    gr::host::ProviderJobs jobs(
        [probe](const gr::host::ProviderJobs::Call &call) { return fixtureWorker(probe, call); },
        gr::host::ProviderJobs::Limits{}, network);

    auto engine = gr::js::createQuickJsEngine();
    gr::HostOptions options;
    gr::Guest guest(*engine, options);
    auto host = engine->get(engine->global(), "__host");
    auto context = engine->object();
    gr::host::ContextOptions grants;
    // Shared with the context's cancellation predicate, which the engine
    // keeps, as GraphRunner wires its CancelState.
    auto cancel = std::make_shared<gr::CancelState>();
    grants.cancelled = [cancel] { return cancel->cancelled(); };
    const gr::host::RunIdentity run = gr::host::newRunIdentity("fixture-run");
    jobs.grant(grants, {"fixture"}, [run] { return run; });
    // An operation that fails at once, for a cancellation that comes after
    // its Error was delivered.
    grants.asyncOperations["model:fails"] = [](std::string, std::stop_token, gr::host::ContextCompletion done) {
      done(gr::host::ContextResult::error("model refused the request"));
    };
    if (grants.operations.contains("provider:fixture:jobs:poll"))
      throw std::runtime_error("ProviderJobs still grants poll");
    gr::host::installContext(*engine, context, grants);
    engine->set(host, "context", context);
    std::ifstream input(argv[1]);
    std::string source{std::istreambuf_iterator<char>(input), {}};
    guest.load({source.begin(), source.end()}, argv[1]);

    // One run, bound as GraphRunner::Impl::runJob binds it.
    gr::Loop &loop = gr::Loop::current();
    const uint64_t generation = cancel->beginRun();
    std::optional<gr::AsyncRun> async;
    async.emplace(*engine, loop,
                  std::make_shared<nodetool::jobs::RunnerTracker>(), generation,
                  io, run);
    std::optional<gr::RunBinding::Scope> bound;
    bound.emplace(*engine, *async, io);
    auto runUntil = [&](const std::string &condition) {
      gr::EngineRunControl control(*engine, *async, *cancel, generation, [&] {
        return engine->toBoolean(engine->evaluateScript(condition, "condition.js"));
      });
      return loop.run(control);
    };
    engine->evaluateScript("globalThis.__providerJobsResult = undefined;"
                           "__providerJobTests().then(() => { __providerJobsResult = 'ok'; },"
                           "  (e) => { __providerJobsResult = String(e && e.stack || e); });",
                           "start.js");
    if (runUntil("globalThis.__phase === 'waiting' || globalThis.__providerJobsResult !== undefined") !=
        gr::RunExit::Done)
      throw std::runtime_error("The gated job never reported progress");
    // The guest now awaits the job's next item. Polling would hold a timer.
    const size_t timersWhileWaiting = loop.pendingTimers();
    const size_t waitingCalls = async->inFlight();
    probe->openGate();
    if (runUntil("globalThis.__providerJobsResult !== undefined") != gr::RunExit::Done)
      throw std::runtime_error("The guest checks did not finish");
    const size_t timersAfter = loop.pendingTimers();
    const auto result = engine->toString(
        engine->evaluateScript("JSON.stringify(globalThis.__providerJobsResult)", "result.js"));
    std::cout << result << '\n';
    bound.reset();
    async->teardown();
    loop.clearTimers();
    loop.abandon();
    async.reset();
    cancel->endRun();
    if (result != "\"ok\"")
      throw std::runtime_error("Guest provider job checks did not complete");
    if (timersWhileWaiting != 0)
      throw std::runtime_error("A timer was pending while a job waited for its next item: " +
                               std::to_string(timersWhileWaiting));
    if (waitingCalls != 1)
      throw std::runtime_error("Expected one waiting next(), saw " + std::to_string(waitingCalls));
    if (timersAfter != 0)
      throw std::runtime_error("Timers were left pending: " + std::to_string(timersAfter));
    for (int i = 0; i < 400 && probe->cancelledCalls != 1; ++i)
      std::this_thread::sleep_for(5ms);
    if (probe->cancelledCalls != 1)
      throw std::runtime_error("Aborting the guest call did not cancel the worker");
    if (probe->maxConcurrent < 2)
      throw std::runtime_error("Provider jobs did not run concurrently");
    jobs.retireRun(run);
    for (int i = 0; i < 400 && jobs.stats().alive != 0; ++i)
      std::this_thread::sleep_for(5ms);
    if (jobs.stats().registered != 0 || jobs.stats().alive != 0)
      throw std::runtime_error("Retiring the run left jobs behind");

    // A cancelled run's endpoint call rejects with an AbortError in either
    // order: the job's result already in the mailbox when the cancellation
    // begins ("held"), or the cancellation before any result ("slow"). An
    // Error delivered before the cancellation stays that Error, through the
    // provider job ("fail") and through contextCall ("context-fail").
    for (const std::string model : {"held", "slow", "fail", "context-fail"}) {
      const uint64_t caseRun = cancel->beginRun();
      async.emplace(*engine, loop,
                    std::make_shared<nodetool::jobs::RunnerTracker>(), caseRun,
                    io, run);
      bound.emplace(*engine, *async, io);
      const std::string call =
          model == "context-fail" ? "__contextCallCase()" : "__cancelCase('" + model + "')";
      engine->evaluateScript("globalThis.__cancelResult = undefined;" + call +
                                 ".then((r) => { __cancelResult = r; });",
                             "case.js");
      if (model == "fail" || model == "context-fail") {
        for (int i = 0; i < 2000 && !async->resultsPending(); ++i)
          std::this_thread::sleep_for(5ms);
        if (!async->resultsPending())
          throw std::runtime_error("The failing call's Error never reached the mailbox: " + model);
      } else if (model == "held") {
        for (int i = 0; i < 2000 && probe->heldEntered == 0; ++i)
          std::this_thread::sleep_for(5ms);
        probe->openHeld();
        for (int i = 0; i < 2000 && !async->resultsPending(); ++i)
          std::this_thread::sleep_for(5ms);
        if (!async->resultsPending())
          throw std::runtime_error("The held job's result never reached the mailbox");
      } else {
        for (int i = 0; i < 2000 && probe->slowEntered < 2; ++i)
          std::this_thread::sleep_for(5ms);
        std::this_thread::sleep_for(50ms);
      }
      cancel->request(caseRun, std::chrono::steady_clock::now() + 5s);
      gr::EngineRunControl control(*engine, *async, *cancel, caseRun, [&] {
        return engine->toBoolean(engine->evaluateScript("globalThis.__cancelResult !== undefined", "c.js"));
      });
      if (loop.run(control) != gr::RunExit::Done)
        throw std::runtime_error("The cancelled call never settled: " + model);
      const auto settled = engine->toString(engine->evaluateScript("__cancelResult", "r.js"));
      std::cout << model << ": " << settled << '\n';
      bound.reset();
      async->teardown();
      loop.clearTimers();
      loop.abandon();
      async.reset();
      cancel->endRun();
      // An AbortError from the host becomes the run signal's reason, itself
      // an AbortError.
      const std::string expected = model == "fail"           ? "Error:vendor refused the request"
                                   : model == "context-fail" ? "Error:model refused the request"
                                                             : "AbortError:";
      if (!settled.starts_with(expected))
        throw std::runtime_error("A cancelled call settled wrong (" + model + "): " + settled);
    }
    jobs.retireRun(run);
    return 0;
  } catch (const std::exception &e) {
    std::cerr << e.what() << '\n';
    return 1;
  }
}
