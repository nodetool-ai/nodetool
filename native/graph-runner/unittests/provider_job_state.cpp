// ProviderJobs job states and next() waiters, without an engine: the
// registration and production race, durable stopped and closed state,
// precedence of cancellation over queued output, the single waiter,
// maxJobs while closed workers run, completion delivery, destruction, run
// retirement, start racing shutdown and stop callbacks.
// Built from src/provider_jobs.cpp alone, so a ThreadSanitizer build is cheap.
#include "nodetool/provider_jobs.h"
#include <atomic>
#include <barrier>
#include <chrono>
#include <condition_variable>
#include <cstdlib>
#include <future>
#include <iostream>
#include <latch>
#include <memory>
#include <mutex>
#include <nlohmann/json.hpp>
#include <optional>
#include <stdexcept>
#include <string>
#include <thread>
#include <utility>

using Json = nlohmann::json;
using gr::host::ProviderJobs;
using Outcome = ProviderJobs::Outcome;
using Kind = ProviderJobs::Outcome::Kind;
using namespace std::chrono_literals;

namespace {
std::atomic<int> checks{0};
void check(bool ok, const std::string &reason) {
  ++checks;
  if (!ok)
    throw std::runtime_error(reason);
}

// A deadlock or a lost wakeup must fail the test, not hang it.
std::atomic<std::chrono::steady_clock::rep> deadline{0};
std::atomic<const char *> currentTest{""};
void watchdog() {
  for (;;) {
    std::this_thread::sleep_for(50ms);
    const auto limit = deadline.load();
    if (limit != 0 && std::chrono::steady_clock::now().time_since_epoch().count() > limit) {
      std::cerr << "Timed out in " << currentTest.load() << '\n';
      std::_Exit(1);
    }
  }
}

std::string describe(const Outcome &outcome) {
  const char *kind = outcome.kind == Kind::Value   ? "value"
                     : outcome.kind == Kind::Error ? "error"
                                                   : "stopped";
  return std::string(kind) + " " + outcome.text;
}
void expectState(const Outcome &outcome, const std::string &state, const std::string &what) {
  check(outcome.kind == Kind::Value && Json::parse(outcome.text).at("state") == state,
        what + ": expected " + state + ", got " + describe(outcome));
}
void expectKind(const Outcome &outcome, Kind kind, const std::string &text,
                const std::string &what) {
  check(outcome.kind == kind && outcome.text.find(text) != std::string::npos,
        what + ": expected '" + text + "', got " + describe(outcome));
}

// Spins until `ready` is true or two seconds pass.
template <typename F> bool eventually(F ready) {
  const auto end = std::chrono::steady_clock::now() + 2s;
  while (!ready()) {
    if (std::chrono::steady_clock::now() > end)
      return false;
    std::this_thread::sleep_for(1ms);
  }
  return true;
}

// One ProviderJobs with its grants for provider "p".
struct Fixture {
  explicit Fixture(ProviderJobs::Worker worker, ProviderJobs::Limits limits = {})
      : jobs(std::move(worker), limits) {
    jobs.grant(options, {"p"});
  }
  std::string op(const std::string &name, const std::string &payload) {
    return options.operations.at("provider:p:jobs:" + name)(payload);
  }
  std::string start(const Json &args, const std::string &run = "") {
    const auto object = args.is_null() ? Json::object() : args;
    return Json::parse(
               op("start",
                  Json{{"run", run}, {"method", "callEndpoint"}, {"args", object}}.dump()))
        .at("job")
        .get<std::string>();
  }
  static std::string payload(const std::string &id) { return Json{{"job", id}}.dump(); }
  Json poll(const std::string &id) { return Json::parse(op("poll", payload(id))); }
  void close(const std::string &id) { check(op("close", payload(id)) == "null", "close answers null"); }
  void stop(const std::string &id) { jobs.stop("p", payload(id)); }

  // next() that must complete before it returns.
  Outcome nextNow(const std::string &id) {
    std::optional<Outcome> got;
    int calls = 0;
    jobs.next("p", payload(id), [&](Outcome outcome) {
      ++calls;
      got = std::move(outcome);
    });
    check(calls == 1 && got.has_value(), "next() completed before returning");
    return std::move(*got);
  }

  // next() that may wait. The future receives the outcome, and `calls`
  // counts deliveries.
  struct Pending {
    std::future<Outcome> future;
    std::shared_ptr<std::atomic<int>> calls;
    bool ready() const { return future.wait_for(0s) == std::future_status::ready; }
    Outcome get() {
      check(future.wait_for(5s) == std::future_status::ready, "pending next() completed");
      return future.get();
    }
  };
  Pending nextLater(const std::string &id) {
    std::promise<Outcome> promise;
    Pending pending{promise.get_future(), std::make_shared<std::atomic<int>>(0)};
    jobs.next("p", payload(id),
              [promise = std::move(promise), calls = pending.calls](Outcome outcome) mutable {
                if (++*calls == 1)
                  promise.set_value(std::move(outcome));
              });
    return pending;
  }

  gr::host::ContextOptions options;
  ProviderJobs jobs;
};

// Waits until the fixture's only worker has returned: with maxJobs 1 a start
// succeeds only after that worker gave back its ticket, which it does after
// recording its result.
void waitForWorkerReturn(Fixture &fixture) {
  bool started = eventually([&] {
    try {
      fixture.close(fixture.start({{"mode", "instant"}}));
      return true;
    } catch (const std::exception &e) {
      if (std::string(e.what()).find("Too many") == std::string::npos)
        throw;
      return false;
    }
  });
  check(started, "worker returned");
}

// Waits until cancelled() and throws, like a vendor call that honours stop.
std::string blockUntilCancelled(const ProviderJobs::Call &call) {
  while (!call.cancelled())
    std::this_thread::sleep_for(1ms);
  throw std::runtime_error("cancelled");
}

// 1. A waiter registers while the worker produces, many times over.
void registrationRace() {
  std::barrier sync(2);
  Fixture fixture(
      [&](const ProviderJobs::Call &call) {
        const auto mode = Json::parse(call.argsJson).at("mode").get<std::string>();
        if (mode == "instant")
          return std::string("null");
        sync.arrive_and_wait();
        if (mode != "finish")
          call.progress(R"({"n":1})");
        if (mode == "stop")
          return blockUntilCancelled(call);
        return std::string(R"({"ok":true})");
      },
      {.maxJobs = 1 << 16});
  constexpr int kIterations = 3000;
  for (int i = 0; i < kIterations; ++i) {
    const char *mode = i % 3 == 0 ? "progress" : i % 3 == 1 ? "finish" : "stop";
    const auto id = fixture.start({{"mode", mode}});
    if (i % 3 == 0) {
      // next() races the progress event, then the terminal result.
      sync.arrive_and_wait();
      auto first = fixture.nextLater(id);
      expectState(first.get(), "progress", "first item");
      auto second = fixture.nextLater(id);
      const auto done = second.get();
      expectState(done, "done", "terminal after progress");
      check(Json::parse(done.text).at("value").at("ok") == true, "terminal value");
      check(*first.calls == 1 && *second.calls == 1, "each completion ran once");
      expectState(fixture.nextNow(id), "done", "terminal result is stable");
    } else if (i % 3 == 1) {
      // next() races the terminal result alone.
      sync.arrive_and_wait();
      auto first = fixture.nextLater(id);
      expectState(first.get(), "done", "terminal without progress");
      check(*first.calls == 1, "completion ran once");
      expectState(fixture.nextNow(id), "done", "terminal result is stable");
    } else {
      // A registered waiter races the progress event and stop().
      auto first = fixture.nextLater(id);
      sync.arrive_and_wait();
      fixture.stop(id);
      const auto outcome = first.get();
      check((outcome.kind == Kind::Value && Json::parse(outcome.text).at("state") == "progress") ||
                outcome.kind == Kind::Stopped,
            "progress or stop wins: " + describe(outcome));
      check(*first.calls == 1, "completion ran once");
      expectKind(fixture.nextNow(id), Kind::Stopped, "stopped", "next after the stop race");
    }
    fixture.close(id);
  }
}

// 2. next() and poll after stop and after close answer at once, every time.
void repeatedNextAfterStopAndClose() {
  std::atomic<int> returned{0};
  Fixture fixture([&](const ProviderJobs::Call &call) -> std::string {
    try {
      return blockUntilCancelled(call);
    } catch (...) {
      ++returned;
      throw;
    }
  });
  const auto id = fixture.start({});
  auto waiting = fixture.nextLater(id);
  check(!waiting.ready(), "next() waits while the job runs");
  fixture.stop(id);
  expectKind(waiting.get(), Kind::Stopped, "stopped", "waiter after stop");
  for (int i = 0; i < 3; ++i)
    expectKind(fixture.nextNow(id), Kind::Stopped, "stopped", "next after stop");
  check(fixture.poll(id).at("message") == "Provider job was stopped", "poll after stop");
  check(eventually([&] { return returned == 1; }), "worker saw the stop");
  fixture.close(id);
  for (int i = 0; i < 3; ++i)
    expectKind(fixture.nextNow(id), Kind::Stopped, "closed", "next after close");
  check(fixture.poll(id).at("message") == "Provider job was closed", "poll after close");
  fixture.close(id);
  fixture.stop(id);
  expectKind(fixture.nextNow(id), Kind::Stopped, "closed", "close and stop again");

  // Close without stop, while the worker runs.
  const auto running = fixture.start({});
  auto closing = fixture.nextLater(running);
  fixture.close(running);
  expectKind(closing.get(), Kind::Stopped, "closed", "waiter after close");
  for (int i = 0; i < 3; ++i)
    expectKind(fixture.nextNow(running), Kind::Stopped, "closed", "next after close");
  check(eventually([&] { return returned == 2; }), "closed worker saw the stop");
}

// 3. Stop wins over queued progress, result parts and an untaken terminal
// result. A taken terminal result survives stop but not close.
void cancellationPrecedence() {
  const ProviderJobs::Limits limits{.partBytes = 16, .maxJobs = 1};
  auto worker = [](std::latch *produced) {
    return [produced](const ProviderJobs::Call &call) -> std::string {
      const auto args = Json::parse(call.argsJson);
      const auto mode = args.at("mode").get<std::string>();
      if (mode == "instant")
        return "null";
      for (int i = 0; i < args.value("events", 0); ++i)
        call.progress(Json{{"n", i}}.dump());
      if (produced)
        produced->count_down();
      if (mode == "block")
        return blockUntilCancelled(call);
      if (mode == "fail")
        throw std::runtime_error("vendor refused");
      if (mode == "large")
        return Json(std::string(100, 'x')).dump();
      return R"({"ok":1})";
    };
  };

  {
    // Queued progress while running.
    std::latch produced(1);
    Fixture fixture(worker(&produced), limits);
    const auto id = fixture.start({{"mode", "block"}, {"events", 3}});
    produced.wait();
    fixture.stop(id);
    expectKind(fixture.nextNow(id), Kind::Stopped, "stopped", "stop drops queued progress");
  }
  {
    // Without stop: progress in order, then the terminal result.
    Fixture fixture(worker(nullptr), limits);
    const auto id = fixture.start({{"mode", "small"}, {"events", 2}});
    waitForWorkerReturn(fixture);
    const auto first = fixture.nextNow(id);
    expectState(first, "progress", "first progress");
    check(Json::parse(first.text).at("event").at("n") == 0, "progress keeps its order");
    expectState(fixture.nextNow(id), "progress", "second progress");
    expectState(fixture.nextNow(id), "done", "terminal after progress");
  }
  {
    // Queued progress and an untaken terminal result after the worker returned.
    Fixture fixture(worker(nullptr), limits);
    const auto id = fixture.start({{"mode", "small"}, {"events", 2}});
    waitForWorkerReturn(fixture);
    expectState(fixture.nextNow(id), "progress", "progress before stop");
    fixture.stop(id);
    expectKind(fixture.nextNow(id), Kind::Stopped, "stopped", "stop drops progress and result");
    check(fixture.poll(id).at("state") == "error", "poll reports the stop");
  }
  {
    // Result parts.
    Fixture fixture(worker(nullptr), limits);
    const auto id = fixture.start({{"mode", "large"}});
    waitForWorkerReturn(fixture);
    expectState(fixture.nextNow(id), "part", "first part");
    fixture.stop(id);
    expectKind(fixture.nextNow(id), Kind::Stopped, "stopped", "stop drops remaining parts");
  }
  {
    // A taken terminal result.
    Fixture fixture(worker(nullptr), limits);
    const auto id = fixture.start({{"mode", "small"}});
    waitForWorkerReturn(fixture);
    expectState(fixture.nextNow(id), "done", "terminal result");
    fixture.stop(id);
    expectState(fixture.nextNow(id), "done", "taken terminal result survives stop");
    check(fixture.poll(id).at("value").at("ok") == 1, "poll sees the same result");
    fixture.close(id);
    expectKind(fixture.nextNow(id), Kind::Stopped, "closed", "close replaces the result");
  }
  {
    // A taken and an untaken worker error.
    Fixture fixture(worker(nullptr), limits);
    const auto taken = fixture.start({{"mode", "fail"}});
    waitForWorkerReturn(fixture);
    expectKind(fixture.nextNow(taken), Kind::Error, "vendor refused", "worker error");
    fixture.stop(taken);
    expectKind(fixture.nextNow(taken), Kind::Error, "vendor refused", "taken error survives stop");
  }
  {
    Fixture fixture(worker(nullptr), limits);
    const auto untaken = fixture.start({{"mode", "fail"}});
    waitForWorkerReturn(fixture);
    fixture.stop(untaken);
    expectKind(fixture.nextNow(untaken), Kind::Stopped, "stopped", "stop replaces an untaken error");
  }
}

// 4. A second next() while one waits is rejected, and the first still waits.
void secondWaiterRejected() {
  Fixture fixture(blockUntilCancelled);
  const auto id = fixture.start({});
  auto first = fixture.nextLater(id);
  expectKind(fixture.nextNow(id), Kind::Error, "Provider job already has a pending next()",
             "second waiter");
  check(!first.ready(), "first waiter still waits");
  fixture.stop(id);
  expectKind(first.get(), Kind::Stopped, "stopped", "first waiter after stop");
  check(*first.calls == 1, "first waiter ran once");
  expectKind(fixture.nextNow("j999"), Kind::Error, "Unknown provider job", "unknown job");
  expectKind([&] {
    std::optional<Outcome> got;
    fixture.jobs.next("p", "not json", [&](Outcome outcome) { got = std::move(outcome); });
    return *got;
  }(), Kind::Error, "parse", "malformed payload");
}

// 5. A closed job whose worker ignores the stop keeps its maxJobs slot until
// the worker returns, and close() does not wait for it.
void closedRunningJobsCount() {
  std::mutex mutex;
  std::condition_variable changed;
  bool release = false;
  std::atomic<int> sawCancel{0};
  Fixture fixture(
      [&](const ProviderJobs::Call &call) -> std::string {
        if (Json::parse(call.argsJson).value("mode", "") == "instant")
          return "null";
        std::unique_lock lock(mutex);
        changed.wait(lock, [&] { return release; });
        if (call.cancelled())
          ++sawCancel;
        return "null";
      },
      {.maxJobs = 2});
  const auto a = fixture.start({});
  const auto b = fixture.start({});
  fixture.close(a);
  fixture.close(b);
  std::string refused;
  try {
    fixture.start({{"mode", "instant"}});
  } catch (const std::runtime_error &e) {
    refused = e.what();
  }
  check(refused == "Too many provider jobs are running",
        "a third job must wait for two closed workers, got: " + refused);
  {
    std::lock_guard lock(mutex);
    release = true;
  }
  changed.notify_all();
  bool started = eventually([&] {
    try {
      fixture.start({{"mode", "instant"}});
      return true;
    } catch (const std::runtime_error &) {
      return false;
    }
  });
  check(started, "slots return when the closed workers return");
  check(sawCancel == 2, "closed workers saw cancelled()");
}

// 6. Completions run once and outside the job mutex: each one calls back
// into the same job, which would deadlock under the mutex.
void completionsRunOutsideTheLock() {
  std::latch go(1);
  std::latch produced(1);
  Fixture fixture([&](const ProviderJobs::Call &call) -> std::string {
    const auto mode = Json::parse(call.argsJson).at("mode").get<std::string>();
    if (mode == "queued") {
      call.progress(R"({"n":0})");
      produced.count_down();
      return blockUntilCancelled(call);
    }
    go.wait();
    if (mode == "progress")
      call.progress(R"({"n":1})");
    if (mode == "finish")
      return R"({"ok":1})";
    return blockUntilCancelled(call);
  });

  // Immediate delivery from next().
  const auto queued = fixture.start({{"mode", "queued"}});
  produced.wait();
  std::atomic<int> immediateCalls{0};
  Json polled;
  fixture.jobs.next("p", Fixture::payload(queued), [&](Outcome outcome) {
    ++immediateCalls;
    expectState(outcome, "progress", "immediate item");
    polled = fixture.poll(queued);
  });
  check(immediateCalls == 1 && polled.at("state") == "pending", "immediate completion re-entered");

  // Delivery from the producer: the completion registers the next waiter.
  const auto producing = fixture.start({{"mode", "progress"}});
  std::atomic<int> outerCalls{0};
  auto inner = std::make_shared<std::optional<Fixture::Pending>>();
  std::promise<void> outerDone;
  fixture.jobs.next("p", Fixture::payload(producing), [&, inner](Outcome outcome) {
    ++outerCalls;
    expectState(outcome, "progress", "produced item");
    *inner = fixture.nextLater(producing);
    outerDone.set_value();
  });

  // Delivery from the finishing producer: the completion polls.
  const auto finishing = fixture.start({{"mode", "finish"}});
  std::atomic<int> finishCalls{0};
  std::promise<Json> finishPolled;
  fixture.jobs.next("p", Fixture::payload(finishing), [&](Outcome outcome) {
    ++finishCalls;
    expectState(outcome, "done", "finished item");
    finishPolled.set_value(fixture.poll(finishing));
  });

  go.count_down();
  check(outerDone.get_future().wait_for(5s) == std::future_status::ready, "producer completed");
  check(!(*inner)->ready(), "re-registered waiter waits");
  auto polledAfterFinish = finishPolled.get_future();
  check(polledAfterFinish.wait_for(5s) == std::future_status::ready, "finish completed");
  check(polledAfterFinish.get().at("state") == "done", "poll inside completion");

  // Delivery from stop(): the completion closes the job and reads it again.
  std::atomic<int> stopCalls{0};
  std::optional<Outcome> afterClose;
  const auto stopping = fixture.start({{"mode", "block"}});
  fixture.jobs.next("p", Fixture::payload(stopping), [&](Outcome outcome) {
    ++stopCalls;
    expectKind(outcome, Kind::Stopped, "stopped", "stopped item");
    fixture.close(stopping);
    afterClose = fixture.nextNow(stopping);
  });
  fixture.stop(stopping);
  check(stopCalls == 1, "stop completed the waiter before returning");
  expectKind(*afterClose, Kind::Stopped, "closed", "next inside the stop completion");

  fixture.stop(producing);
  expectKind((*inner)->get(), Kind::Stopped, "stopped", "re-registered waiter after stop");
  check(immediateCalls == 1 && outerCalls == 1 && finishCalls == 1 && stopCalls == 1 &&
            *(*inner)->calls == 1,
        "every completion ran exactly once");
}

// 7. A completion destroyed or overwritten without a call delivers an error.
void droppedCompletion() {
  std::vector<Outcome> seen;
  auto record = [&seen](Outcome outcome) { seen.push_back(std::move(outcome)); };
  { ProviderJobs::Completion dropped(record); }
  check(seen.size() == 1, "dropped completion ran once");
  expectKind(seen[0], Kind::Error, "dropped", "dropped completion");

  seen.clear();
  {
    ProviderJobs::Completion first(record);
    ProviderJobs::Completion second(std::move(first));
    check(!first && second, "move empties the source");
    std::move(second)(Outcome{Kind::Value, "null"});
    check(!second, "a call empties the completion");
    std::move(second)(Outcome{Kind::Value, "again"});
  }
  check(seen.size() == 1 && seen[0].text == "null", "moved and called completion ran once");

  seen.clear();
  {
    // A move-only callable.
    auto owned = std::make_unique<int>(7);
    ProviderJobs::Completion first(
        [owned = std::move(owned), &seen](Outcome outcome) { seen.push_back(std::move(outcome)); });
    first = ProviderJobs::Completion(record);
    check(seen.size() == 1 && seen[0].kind == Kind::Error, "overwritten completion dropped");
  }
  check(seen.size() == 2 && seen[1].kind == Kind::Error, "replacement dropped on destruction");
}

// 8. Destroying ProviderJobs stops running workers, completes their waiters
// and joins every thread before it returns.
void destructorWithRunningJobs() {
  std::atomic<int> returned{0};
  gr::host::ContextOptions options;
  std::optional<Fixture::Pending> waiting;
  std::vector<std::string> ids;
  // The worker owns a copy, so its use count shows whether anything still
  // holds the worker function, and with it the jobs' shared state.
  auto sentinel = std::make_shared<int>(0);
  {
    ProviderJobs jobs([&, sentinel](const ProviderJobs::Call &call) -> std::string {
      while (!call.cancelled())
        std::this_thread::sleep_for(1ms);
      // A worker that takes a while to return after the stop.
      std::this_thread::sleep_for(30ms);
      ++returned;
      return "null";
    });
    jobs.grant(options, {"p"});
    for (int i = 0; i < 3; ++i)
      ids.push_back(Json::parse(options.operations.at("provider:p:jobs:start")(
                                    R"({"method":"callEndpoint","args":{}})"))
                        .at("job")
                        .get<std::string>());
    std::promise<Outcome> promise;
    waiting = Fixture::Pending{promise.get_future(), std::make_shared<std::atomic<int>>(0)};
    jobs.next("p", Fixture::payload(ids[0]),
              [promise = std::move(promise), calls = waiting->calls](Outcome outcome) mutable {
                ++*calls;
                promise.set_value(std::move(outcome));
              });
  }
  check(returned == 3, "destructor joined every worker");
  check(waiting->ready(), "destructor completed the waiter");
  expectKind(waiting->get(), Kind::Stopped, "stopped", "waiter after destruction");
  check(*waiting->calls == 1, "waiter ran once");
  // The grants outlive the object but hold none of its state.
  check(sentinel.use_count() == 1, "grants keep no job state alive");
  check(options.operations.at("provider:p:jobs:close")(Fixture::payload(ids[1])) == "null",
        "close after destruction");
  std::string polled;
  try {
    options.operations.at("provider:p:jobs:poll")(Fixture::payload(ids[1]));
  } catch (const std::runtime_error &e) {
    polled = e.what();
  }
  check(polled == "Provider jobs are shut down", "poll after destruction: " + polled);
  try {
    options.operations.at("provider:p:jobs:start")(R"({"method":"callEndpoint","args":{}})");
    check(false, "start after destruction");
  } catch (const std::runtime_error &e) {
    check(std::string(e.what()) == "Provider jobs are shut down", e.what());
  }
}

// 9. Retiring a run releases its tombstones, uploads and jobs, many times
// over, while a live run keeps its tombstones.
void runRetirement() {
  Fixture fixture(
      [](const ProviderJobs::Call &call) -> std::string {
        const auto mode = Json::parse(call.argsJson).value("mode", "");
        if (mode == "block")
          return blockUntilCancelled(call);
        call.progress(R"({"n":0})");
        return R"({"ok":1})";
      },
      {.maxJobs = 256});
  const auto kept = fixture.start({{"mode", "block"}}, "live");
  fixture.close(kept);
  for (int round = 0; round < 200; ++round) {
    const auto run = "run-" + std::to_string(round);
    std::vector<Fixture::Pending> waiting;
    std::vector<std::string> ids;
    for (int i = 0; i < 12; ++i) {
      const auto id = fixture.start({{"mode", i % 3 == 0 ? "instant" : "block"}}, run);
      ids.push_back(id);
      if (i % 3 == 1)
        waiting.push_back(fixture.nextLater(id));
      else if (i % 6 == 2)
        fixture.close(id);
      else if (i % 6 == 5)
        fixture.stop(id);
    }
    fixture.op("put", Json{{"run", run}, {"data", "{"}}.dump());
    fixture.jobs.retireRun(run);
    for (auto &pending : waiting) {
      expectKind(pending.get(), Kind::Stopped, "closed", "waiter of a retired run");
      check(*pending.calls == 1, "retired waiter ran once");
    }
    expectKind(fixture.nextNow(ids[1]), Kind::Error, "Unknown provider job",
               "next on a retired job");
    expectKind(fixture.nextNow(kept), Kind::Stopped, "closed", "live run keeps its tombstone");
  }
  check(fixture.jobs.stats().registered == 1, "only the live run's tombstone is registered");
  fixture.jobs.retireRun("live");
  bool released = eventually([&] {
    const auto stats = fixture.jobs.stats();
    return stats.registered == 0 && stats.executing == 0 && stats.alive == 0;
  });
  const auto stats = fixture.jobs.stats();
  check(released, "no job held after retirement: registered " + std::to_string(stats.registered) +
                      ", executing " + std::to_string(stats.executing) + ", alive " +
                      std::to_string(stats.alive));
}

// 10. Retirement races producing workers and pending next() calls.
void retirementRacesWaiters() {
  Fixture fixture(
      [](const ProviderJobs::Call &call) -> std::string {
        for (int n = 0; !call.cancelled(); ++n) {
          call.progress(Json{{"n", n}}.dump());
          std::this_thread::yield();
        }
        throw std::runtime_error("cancelled");
      },
      {.maxJobs = 1024});
  std::atomic<long> calls{0}, nexts{0}, unexpected{0};
  for (int round = 0; round < 300; ++round) {
    const auto run = "race-" + std::to_string(round);
    std::vector<std::string> ids;
    for (int i = 0; i < 3; ++i)
      ids.push_back(fixture.start({}, run));
    std::barrier sync(static_cast<std::ptrdiff_t>(ids.size() + 1));
    std::vector<std::jthread> readers;
    for (const auto &id : ids) {
      readers.emplace_back([&, id] {
        sync.arrive_and_wait();
        for (;;) {
          std::promise<Outcome> promise;
          auto future = promise.get_future();
          ++nexts;
          fixture.jobs.next("p", Fixture::payload(id),
                            [&calls, promise = std::move(promise)](Outcome outcome) mutable {
                              ++calls;
                              promise.set_value(std::move(outcome));
                            });
          const auto outcome = future.get();
          if (outcome.kind == Kind::Value)
            continue;
          if (outcome.kind != Kind::Stopped &&
              outcome.text.find("Unknown provider job") == std::string::npos)
            ++unexpected;
          break;
        }
      });
    }
    sync.arrive_and_wait();
    fixture.jobs.retireRun(run);
    readers.clear();
  }
  check(unexpected == 0, "readers end with Stopped or an unknown job");
  check(calls == nexts, "every next() completed once: " + std::to_string(calls.load()) + " of " +
                            std::to_string(nexts.load()));
  check(eventually([&] { return fixture.jobs.stats().alive == 0; }), "retired jobs released");
}

// 11. start() racing the destructor either registers a job the destructor
// joins or fails as shut down. No worker outlives the destructor.
void startRacesShutdown() {
  for (int round = 0; round < 200; ++round) {
    std::atomic<int> entered{0}, returned{0};
    gr::host::ContextOptions options;
    auto jobs = std::make_unique<ProviderJobs>(
        [&](const ProviderJobs::Call &call) -> std::string {
          ++entered;
          while (!call.cancelled())
            std::this_thread::sleep_for(1ms);
          ++returned;
          return "null";
        },
        ProviderJobs::Limits{.maxJobs = 64});
    jobs->grant(options, {"p"});
    const auto start = options.operations.at("provider:p:jobs:start");
    std::barrier sync(2);
    std::string unexpected;
    std::jthread starter([&] {
      sync.arrive_and_wait();
      for (;;) {
        try {
          start(R"({"method":"callEndpoint","args":{}})");
        } catch (const std::exception &e) {
          const std::string what = e.what();
          if (what == "Too many provider jobs are running")
            continue;
          if (what != "Provider jobs are shut down")
            unexpected = what;
          return;
        }
      }
    });
    sync.arrive_and_wait();
    std::this_thread::sleep_for(std::chrono::microseconds(round % 7 * 100));
    jobs.reset();
    const int enteredAtReturn = entered, returnedAtReturn = returned;
    starter.join();
    check(enteredAtReturn == returnedAtReturn,
          "a worker outlived the destructor: " + std::to_string(enteredAtReturn) + " entered, " +
              std::to_string(returnedAtReturn) + " returned");
    check(unexpected.empty(), "start failed with: " + unexpected);
  }
}

// 12. A worker's stop callback runs while several threads stop and close
// the same jobs. The worker reports progress while it holds the mutex its
// callback takes, so a stop requested under the job mutex would deadlock.
void stopCallbacksUnderConcurrentStops() {
  std::atomic<int> callbacks{0}, returned{0};
  Fixture fixture(
      [&](const ProviderJobs::Call &call) -> std::string {
        std::mutex mutex;
        std::condition_variable wake;
        bool stopped = false;
        std::stop_callback onStop(call.stop, [&] {
          ++callbacks;
          {
            std::lock_guard lock(mutex);
            stopped = true;
          }
          wake.notify_all();
        });
        // Holds the mutex nearly all the time, releasing it only briefly.
        std::unique_lock lock(mutex);
        while (!stopped) {
          for (int i = 0; i < 50; ++i)
            call.progress(R"({"tick":1})");
          wake.wait_for(lock, 1us);
        }
        ++returned;
        return "null";
      },
      {.maxJobs = 4096});
  constexpr int kRounds = 300, kJobs = 3, kStoppers = 4;
  for (int round = 0; round < kRounds; ++round) {
    std::vector<std::string> ids;
    for (int i = 0; i < kJobs; ++i)
      ids.push_back(fixture.start({}));
    std::barrier sync(kStoppers);
    std::vector<std::jthread> stoppers;
    for (int s = 0; s < kStoppers; ++s) {
      stoppers.emplace_back([&, s] {
        sync.arrive_and_wait();
        for (int i = 0; i < kJobs; ++i) {
          const auto &id = ids[(i + s) % kJobs];
          if ((s + i) % 2 == 0)
            fixture.stop(id);
          else
            fixture.close(id);
        }
      });
    }
    stoppers.clear();
    for (const auto &id : ids)
      fixture.close(id);
  }
  check(eventually([&] { return returned == kRounds * kJobs; }), "every worker returned");
  check(callbacks == kRounds * kJobs, "each stop callback ran once");
}
} // namespace

// An optional argument runs only the test with that name.
int main(int argc, char **argv) {
  std::thread(watchdog).detach();
  const std::string only = argc > 1 ? argv[1] : "";
  const std::pair<const char *, void (*)()> tests[] = {
      {"registrationRace", registrationRace},
      {"repeatedNextAfterStopAndClose", repeatedNextAfterStopAndClose},
      {"cancellationPrecedence", cancellationPrecedence},
      {"secondWaiterRejected", secondWaiterRejected},
      {"closedRunningJobsCount", closedRunningJobsCount},
      {"completionsRunOutsideTheLock", completionsRunOutsideTheLock},
      {"droppedCompletion", droppedCompletion},
      {"destructorWithRunningJobs", destructorWithRunningJobs},
      {"runRetirement", runRetirement},
      {"retirementRacesWaiters", retirementRacesWaiters},
      {"startRacesShutdown", startRacesShutdown},
      {"stopCallbacksUnderConcurrentStops", stopCallbacksUnderConcurrentStops},
  };
  int failed = 0;
  for (const auto &[name, test] : tests) {
    if (!only.empty() && only != name)
      continue;
    currentTest = name;
    deadline = (std::chrono::steady_clock::now() + 60s).time_since_epoch().count();
    try {
      test();
      std::cout << "ok " << name << '\n';
    } catch (const std::exception &e) {
      ++failed;
      std::cout << "FAIL " << name << ": " << e.what() << '\n';
    }
  }
  deadline = 0;
  std::cout << checks << " checks, " << failed << " failed\n";
  return failed == 0 ? 0 : 1;
}
