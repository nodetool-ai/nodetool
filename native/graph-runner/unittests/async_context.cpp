// Step 3 of docs/plans/graph-runner-async-host.md: the asynchronous context
// transport (__host.context.callAsync and ContextOptions::asyncOperations)
// and the grant rules it shares with __host.context.call.
//
//   gr_async_context_tests [guest.js]
//
// The kernel tests need no bundle. With a guest bundle that has
// nodetool.image.TextToImage (CMake builds a parity bundle of the image
// module), the runner tests also run that node through the public
// GraphRunner with an asynchronous prediction grant. Every grant here is a
// test-only callback: no test reaches a provider, a secret or the network.
//
// Callbacks and helper threads share state with the test through shared
// pointers they capture by value, never through references to the test's
// stack (native/AGENTS.md rule 12).
#include "host/capabilities.h"
#include "host/context.h"
#include "js/engine.h"
#include "kernel/async_jobs.h"
#include "kernel/cancel_state.h"
#include "kernel/guest.h"
#include "kernel/host_lanes.h"
#include "kernel/run_control.h"
#include "kernel/task.h"
#include "nodetool/graph_runner.h"

#include <nlohmann/json.hpp>

#include <algorithm>
#include <array>
#include <atomic>
#include <barrier>
#include <chrono>
#include <condition_variable>
#include <csignal>
#include <cstdio>
#include <cstdlib>
#include <deque>
#include <functional>
#include <map>
#include <memory>
#include <mutex>
#include <optional>
#include <random>
#include <stdexcept>
#include <string>
#include <sys/wait.h>
#include <thread>
#include <unistd.h>
#include <utility>
#include <vector>

namespace {

using gr::AsyncRun;
using gr::CancelState;
using gr::Loop;
using gr::RunExit;
using gr::host::ContextCompletion;
using gr::host::ContextOptions;
using gr::host::ContextResult;
using nodetool::jobs::RunnerTracker;
namespace js = gr::js;
using Json = nlohmann::json;
using Clock = std::chrono::steady_clock;
using std::chrono::milliseconds;

// One run of the suite: the check counters, the bundle path and a watchdog
// that fails the process when a test hangs. Constructed in main() and
// destroyed before it returns, which stops and joins the watchdog.
//
// Thread affinity: check() is thread-safe (atomic counters). begin(), end()
// and the destructor run on the main thread. The watchdog thread shares only
// `Watch`, through a shared pointer, guarded by its mutex.
class Suite {
public:
  explicit Suite(std::string bundle) : bundle_(std::move(bundle)), watch_(std::make_shared<Watch>()) {
    watchdog_ = std::thread([watch = watch_] { watch->run(); });
  }
  ~Suite() {
    {
      std::lock_guard lock(watch_->mutex);
      watch_->stopping = true;
    }
    watch_->changed.notify_all();
    watchdog_.join();
  }
  Suite(const Suite&) = delete;
  Suite& operator=(const Suite&) = delete;

  void check(bool ok, const char* file, int line, const char* expression) {
    ++checks_;
    if (ok) return;
    ++failures_;
    std::fprintf(stderr, "%s:%d: CHECK failed: %s\n", file, line, expression);
  }
  void begin(const char* name, std::chrono::seconds limit) {
    std::lock_guard lock(watch_->mutex);
    watch_->test = name;
    watch_->deadline = Clock::now() + limit;
  }
  void end() {
    std::lock_guard lock(watch_->mutex);
    watch_->deadline.reset();
  }
  const std::string& bundle() const { return bundle_; }
  int failures() const { return failures_; }
  int checks() const { return checks_; }

private:
  struct Watch {
    std::mutex mutex;
    std::condition_variable changed;
    std::optional<Clock::time_point> deadline;  // guarded by mutex
    std::string test;                           // guarded by mutex
    bool stopping = false;                      // guarded by mutex

    void run() {
      std::unique_lock lock(mutex);
      while (!stopping) {
        changed.wait_for(lock, milliseconds(50));
        if (deadline && Clock::now() > *deadline) {
          std::fprintf(stderr, "TIMEOUT %s\n", test.c_str());
          std::_Exit(1);
        }
      }
    }
  };

  const std::string bundle_;
  std::atomic<int> failures_{0};
  std::atomic<int> checks_{0};
  std::shared_ptr<Watch> watch_;
  std::thread watchdog_;
};

#define CHECK(cond) t.check(static_cast<bool>(cond), __FILE__, __LINE__, #cond)

// Completions an asynchronous callback handed over, for another thread to
// call or drop.
//
// Thread affinity: thread-safe, `mutex` guards `held`.
struct Held {
  std::mutex mutex;
  std::condition_variable changed;
  std::deque<ContextCompletion> held;

  void put(ContextCompletion done) {
    {
      std::lock_guard lock(mutex);
      held.push_back(std::move(done));
    }
    changed.notify_all();
  }
  // Waits for a completion. Returns an empty one after `timeout`.
  ContextCompletion take(milliseconds timeout = milliseconds(30000)) {
    std::unique_lock lock(mutex);
    if (!changed.wait_for(lock, timeout, [&] { return !held.empty(); })) return {};
    ContextCompletion done = std::move(held.front());
    held.pop_front();
    return done;
  }
  // Waits until a completion is held. False after `timeout`.
  bool waitAny(milliseconds timeout = milliseconds(30000)) {
    std::unique_lock lock(mutex);
    return changed.wait_for(lock, timeout, [&] { return !held.empty(); });
  }
  size_t size() {
    std::lock_guard lock(mutex);
    return held.size();
  }
};

// A one-shot flag another thread waits on.
//
// Thread affinity: thread-safe, `mutex` guards `open`.
struct Gate {
  std::mutex mutex;
  std::condition_variable changed;
  bool open = false;

  void release() {
    {
      std::lock_guard lock(mutex);
      open = true;
    }
    changed.notify_all();
  }
  bool wait(milliseconds timeout = milliseconds(30000)) {
    std::unique_lock lock(mutex);
    return changed.wait_for(lock, timeout, [&] { return open; });
  }
  bool isOpen() {
    std::lock_guard lock(mutex);
    return open;
  }
};

// A value one thread sets and others read.
//
// Thread affinity: thread-safe, `mutex` guards `value`.
template <class T>
struct Shared {
  std::mutex mutex;
  T value{};
  void set(T next) {
    std::lock_guard lock(mutex);
    value = std::move(next);
  }
  T get() {
    std::lock_guard lock(mutex);
    return value;
  }
};

// One engine with __host.context (and __host.providers) installed from
// `options`, and one bound run at a time, as GraphRunner::Impl::runJob
// binds it. Like the runner, the context's cancellation predicate also
// reports the run's CancelState.
//
// Thread affinity: the thread that created it only.
struct Harness {
  std::unique_ptr<js::Engine> engine = js::createQuickJsEngine();
  Loop& loop = Loop::current();
  // Shared with the installed cancellation predicate, which the engine keeps.
  std::shared_ptr<CancelState> cancel = std::make_shared<CancelState>();
  std::shared_ptr<RunnerTracker> tracker;
  // The lane the run submits to. The caller keeps it alive.
  nodetool::jobs::JobExecutor& io;
  uint64_t generation = 0;
  std::optional<AsyncRun> async;
  std::optional<gr::RunBinding::Scope> bound;

  Harness(gr::HostOptions options, nodetool::jobs::JobExecutor& lane,
          std::shared_ptr<RunnerTracker> shared = std::make_shared<RunnerTracker>())
      : tracker(std::move(shared)), io(lane) {
    auto granted = options.context.cancelled;
    options.context.cancelled = [state = cancel, granted] { return state->cancelled() || (granted && granted()); };
    install(*engine, options);
    eval("globalThis.log = [];"
         "globalThis.record = (p) => p.then((v) => { log.push('ok:' + v); }, "
         "  (e) => { log.push(e.name + ':' + e.message); });"
         "globalThis.attempt = (f) => { try { return String(f()); } catch (e) { return 'error: ' + e.message; } };");
    beginRun();
  }
  ~Harness() { endRun(); }
  Harness(const Harness&) = delete;
  Harness& operator=(const Harness&) = delete;

  static void install(js::Engine& e, const gr::HostOptions& options) {
    js::Value host = e.object();
    for (const auto& capability : gr::host::capabilities()) {
      const std::string name = capability.name;
      if (name != "context" && name != "providers") continue;
      js::Value object = e.object();
      capability.install(e, object, options);
      e.set(host, capability.name, object);
    }
    e.set(e.global(), "__host", host);
  }

  void beginRun() {
    generation = cancel->beginRun();
    async.emplace(*engine, loop, tracker, generation, io);
    bound.emplace(*engine, *async, io);
    eval("log = [];");
  }
  // As runJob's teardown: unbind, stop and detach jobs, drop timers and
  // frames, release run resources.
  void endRun() {
    if (!async) return;
    bound.reset();
    async->teardown();
    loop.clearTimers();
    loop.abandon();
    async.reset();
    engine->releaseRunResources();
    cancel->endRun();
  }

  js::Value eval(const std::string& source) { return engine->evaluateScript(source, "test.js"); }
  std::string str(const std::string& source) { return engine->toString(eval(source)); }
  // Runs `body` and returns its string, or "error: <message>".
  std::string attempt(const std::string& body) { return str("attempt(() => " + body + ")"); }
  RunExit runUntil(const std::string& condition) {
    gr::EngineRunControl control(*engine, *async, *cancel, generation,
                                 [&] { return engine->toBoolean(eval(condition)); });
    return loop.run(control);
  }
  // Records the promise of callAsync(operation, payload) in `log`.
  void callAsync(const std::string& operation, const std::string& payload = "{}") {
    eval("record(__host.context.callAsync(" + Json(operation).dump() + ", " + Json(payload).dump() + "));");
  }
  std::vector<std::string> logged() {
    return Json::parse(str("JSON.stringify(log)")).get<std::vector<std::string>>();
  }
};

std::string missingMessage(const std::string& operation) {
  return "Error:The context callback for '" + operation + "' dropped its completion without calling it";
}

// Waits until `predicate` holds or `timeout` passes.
template <class P>
bool eventually(P predicate, milliseconds timeout = milliseconds(10000)) {
  const auto deadline = Clock::now() + timeout;
  while (!predicate()) {
    if (Clock::now() > deadline) return false;
    std::this_thread::sleep_for(milliseconds(2));
  }
  return true;
}

// --- retained completion ------------------------------------------------------

// Gate: retained done. The callback runs on the I/O lane, keeps its
// completion and returns. Another thread calls it later, and the promise
// settles then, through the run's mailbox.
void retainedDoneFromAnotherThread(Suite& t) {
  struct Probe {
    Held held;
    Shared<std::thread::id> callbackThread;
    Shared<std::thread::id> completer;
    Shared<std::string> request;
  };
  auto probe = std::make_shared<Probe>();
  gr::ThreadPoolExecutor io("io", 2);
  gr::HostOptions options;
  options.context.asyncOperations["model:slow"] = [probe](std::string body, std::stop_token stop,
                                                          ContextCompletion done) {
    probe->callbackThread.set(std::this_thread::get_id());
    probe->request.set(std::move(body));
    if (!stop.stop_requested()) probe->held.put(std::move(done));
  };
  Harness h(options, io);
  std::thread later([probe] {
    ContextCompletion done = probe->held.take();
    std::this_thread::sleep_for(milliseconds(20));
    probe->completer.set(std::this_thread::get_id());
    if (done) done(ContextResult::value("\"later\""));
  });
  h.callAsync("model:slow", "{\"a\":1}");
  CHECK(h.runUntil("log.length === 1") == RunExit::Done);
  later.join();
  CHECK(h.logged() == std::vector<std::string>{"ok:\"later\""});
  CHECK(probe->request.get() == "{\"a\":1}");
  CHECK(probe->callbackThread.get() != std::this_thread::get_id());
  CHECK(probe->callbackThread.get() != std::thread::id{});
  CHECK(probe->completer.get() != std::this_thread::get_id());
  CHECK(h.async->inFlight() == 0);
  h.endRun();
  CHECK(h.tracker->waitIdle(Clock::now() + std::chrono::seconds(5)));
}

// Gate: delivery goes through the mailbox. In inline mode the callback runs
// on the worker and completes before callAsync returns, yet the promise
// settles only at the loop's macrotask point, not in the microtasks after
// the call.
void inlineDoneSettlesAsMacrotask(Suite& t) {
  auto callbackThread = std::make_shared<Shared<std::thread::id>>();
  nodetool::jobs::InlineExecutor io;
  gr::HostOptions options;
  options.context.asyncOperations["model:now"] = [callbackThread](std::string body, std::stop_token,
                                                                  ContextCompletion done) {
    callbackThread->set(std::this_thread::get_id());
    done(ContextResult::value(body));
  };
  Harness h(options, io);
  h.callAsync("model:now", "\"x\"");
  h.engine->drainJobs();
  CHECK(h.logged().empty());
  CHECK(h.async->resultsPending());
  CHECK(h.runUntil("log.length === 1") == RunExit::Done);
  CHECK(h.logged() == std::vector<std::string>{"ok:\"x\""});
  CHECK(callbackThread->get() == std::this_thread::get_id());
}

// Gate: move destruction. Moving a completion leaves an empty one whose
// destruction does nothing, so only the final call reaches the promise. The
// moved-from objects are destroyed both inside the callback and on another
// thread after it returned, before the final call.
void movedFromCompletionIsInert(Suite& t) {
  struct Probe {
    Held held;
    std::atomic<bool> movedFromEmpty{false};
  };
  auto probe = std::make_shared<Probe>();
  gr::ThreadPoolExecutor io("io", 1);
  gr::HostOptions options;
  options.context.asyncOperations["model:move"] = [probe](std::string, std::stop_token, ContextCompletion done) {
    ContextCompletion first = std::move(done);
    ContextCompletion second = std::move(first);
    probe->movedFromEmpty = !done && !first && static_cast<bool>(second);
    probe->held.put(std::move(second));
    // `done`, `first` and `second` are destroyed empty here.
  };
  Harness h(options, io);
  h.callAsync("model:move");
  std::thread mover([probe] {
    ContextCompletion third;
    {
      ContextCompletion taken = probe->held.take();
      third = std::move(taken);
    }
    // The call is still pending after the moved-from objects are gone.
    std::this_thread::sleep_for(milliseconds(20));
    if (third) third(ContextResult::value("\"moved\""));
  });
  CHECK(h.runUntil("log.length === 1") == RunExit::Done);
  mover.join();
  CHECK(h.logged() == std::vector<std::string>{"ok:\"moved\""});
  CHECK(probe->movedFromEmpty);
  // No second settlement is waiting.
  CHECK(!h.async->resultsPending());
  CHECK(h.async->inFlight() == 0);
}

// Moving onto an uncalled completion drops it, as destroying it would.
void moveAssignOverPendingDropsIt(Suite& t) {
  auto held = std::make_shared<Held>();
  gr::ThreadPoolExecutor io("io", 2);
  gr::HostOptions options;
  options.context.asyncOperations["model:keep"] = [held](std::string, std::stop_token, ContextCompletion done) {
    held->put(std::move(done));
  };
  Harness h(options, io);
  h.callAsync("model:keep");
  h.callAsync("model:keep");
  ContextCompletion a = held->take();
  ContextCompletion b = held->take();
  a = std::move(b);  // drops the first call's completion
  CHECK(h.runUntil("log.length === 1") == RunExit::Done);
  CHECK(h.logged() == std::vector<std::string>{missingMessage("model:keep")});
  a(ContextResult::value("\"second\""));
  CHECK(h.runUntil("log.length === 2") == RunExit::Done);
  CHECK(h.logged()[1] == "ok:\"second\"");
}

// Gate: missing done. A callback that neither calls nor keeps its completion
// fails the call. So does a kept completion destroyed later uncalled, on the
// destroying thread.
void missingDoneFails(Suite& t) {
  auto held = std::make_shared<Held>();
  gr::ThreadPoolExecutor io("io", 2);
  gr::HostOptions options;
  options.context.asyncOperations["model:forget"] = [](std::string, std::stop_token, ContextCompletion) {};
  options.context.asyncOperations["model:keep"] = [held](std::string, std::stop_token, ContextCompletion done) {
    held->put(std::move(done));
  };
  Harness h(options, io);
  h.callAsync("model:forget");
  CHECK(h.runUntil("log.length === 1") == RunExit::Done);
  CHECK(h.logged() == std::vector<std::string>{missingMessage("model:forget")});
  h.callAsync("model:keep");
  std::thread dropper([held] { ContextCompletion done = held->take(); });
  CHECK(h.runUntil("log.length === 2") == RunExit::Done);
  dropper.join();
  CHECK(h.logged()[1] == missingMessage("model:keep"));
  CHECK(h.async->inFlight() == 0);
  h.endRun();
  CHECK(h.tracker->waitIdle(Clock::now() + std::chrono::seconds(5)));
}

// Gate: double done. The second call on the same completion is ignored, and
// asserts in a debug build. A debug build checks the assertion in a forked
// child with everything inline, so no lane thread is needed there.
void doubleDoneIsIgnored(Suite& t) {
#ifdef NDEBUG
  gr::ThreadPoolExecutor io("io", 1);
  gr::HostOptions options;
  options.context.asyncOperations["model:twice"] = [](std::string, std::stop_token, ContextCompletion done) {
    done(ContextResult::value("1"));
    done(ContextResult::value("2"));
    done(ContextResult::error("3"));
  };
  Harness h(options, io);
  h.callAsync("model:twice");
  CHECK(h.runUntil("log.length === 1") == RunExit::Done);
  CHECK(h.logged() == std::vector<std::string>{"ok:1"});
  CHECK(!h.async->resultsPending());
  h.endRun();
  CHECK(h.tracker->waitIdle(Clock::now() + std::chrono::seconds(5)));
#else
  std::fflush(nullptr);
  const pid_t child = fork();
  if (child == 0) {
    alarm(10);
    nodetool::jobs::InlineExecutor io;
    gr::HostOptions options;
    options.context.asyncOperations["model:twice"] = [](std::string, std::stop_token, ContextCompletion done) {
      done(ContextResult::value("1"));
      done(ContextResult::value("2"));
    };
    Harness h(options, io);
    h.callAsync("model:twice");
    std::_Exit(0);
  }
  int status = 0;
  CHECK(waitpid(child, &status, 0) == child);
  CHECK(WIFSIGNALED(status) && WTERMSIG(status) == SIGABRT);
#endif
}

// --- races --------------------------------------------------------------------

// Gate: done, throw and cancellation race. Each round starts one call on a
// new run of the same engine. The contenders meet at a barrier, then the
// test thread requests the run's stop, a second thread calls done, and the
// callback throws, in the combinations below. Exactly one outcome settles
// the promise, and it is one of the contenders'. A missing-completion error
// never appears: a throw beats destruction of the unwinding completion.
enum Contender : unsigned { kDone = 1, kThrow = 2, kStop = 4 };

// Shared between a race's test thread, its callback and its done thread.
//
// Thread affinity: thread-safe. `start` and `spins` are written by the test
// thread before a round's barrier and read by the others after it.
struct Race {
  explicit Race(unsigned contenders)
      : withDone(contenders & kDone), withThrow(contenders & kThrow), withStop(contenders & kStop) {}
  const bool withDone;
  const bool withThrow;
  const bool withStop;
  std::optional<std::barrier<>> start;
  std::array<int, 3> spins{};
  Held held;

  static void spin(int count) {
    for (volatile int i = 0; i < count; i = i + 1) {
    }
  }
};

void raceRounds(Suite& t, unsigned contenders, int rounds) {
  auto race = std::make_shared<Race>(contenders);
  gr::ThreadPoolExecutor io("io", 2);
  auto tracker = std::make_shared<RunnerTracker>();
  std::map<std::string, int> seen;
  int wrong = 0;
  int notOnce = 0;
  const int arrivals = (race->withStop ? 1 : 0) + (race->withDone ? 1 : 0) + (race->withThrow ? 1 : 0);
  std::mt19937 random(static_cast<unsigned>(contenders));
  gr::HostOptions options;
  options.context.asyncOperations["model:race"] = [race](std::string, std::stop_token, ContextCompletion done) {
    if (race->withDone) race->held.put(std::move(done));
    if (race->withThrow) {
      race->start->arrive_and_wait();
      Race::spin(race->spins[1]);
      throw std::runtime_error("thrown");
    }
    // Stop alone: the call stays pending until the stop settles it.
    if (!race->withDone) race->held.put(std::move(done));
  };
  Harness h(options, io, tracker);
  for (int round = 0; round < rounds; ++round) {
    if (round > 0) h.beginRun();
    for (int& count : race->spins) count = std::uniform_int_distribution<int>(0, 20000)(random);
    race->start.emplace(arrivals);
    h.callAsync("model:race");
    std::thread doneThread;
    if (race->withDone) {
      doneThread = std::thread([race] {
        ContextCompletion done = race->held.take();
        race->start->arrive_and_wait();
        Race::spin(race->spins[0]);
        if (done) done(ContextResult::value("\"done\""));
      });
    }
    if (race->withStop) {
      race->start->arrive_and_wait();
      Race::spin(race->spins[2]);
      h.async->requestStop();
    }
    if (h.runUntil("log.length >= 1") != RunExit::Done) ++wrong;
    if (doneThread.joinable()) doneThread.join();
    // A call whose callback neither threw nor completed holds its
    // completion here: drop it after the race.
    while (race->held.size() > 0) race->held.take();
    h.engine->drainJobs();
    const auto log = h.logged();
    if (log.size() != 1) {
      ++notOnce;
    } else {
      const std::string& outcome = log[0];
      ++seen[outcome];
      const bool fromDone = outcome == "ok:\"done\"";
      const bool fromThrow = outcome == "Error:thrown";
      const bool fromStop = outcome == "AbortError:The operation was aborted";
      if (!((race->withDone && fromDone) || (race->withThrow && fromThrow) || (race->withStop && fromStop))) ++wrong;
    }
    if (h.async->resultsPending() || h.async->inFlight() != 0) ++notOnce;
    h.endRun();
    // Every job and completion of the round is gone, the callback returned.
    if (!tracker->waitIdle(Clock::now() + std::chrono::seconds(5))) ++notOnce;
  }
  std::fprintf(stderr, "  contenders %u:", contenders);
  for (const auto& [outcome, count] : seen) std::fprintf(stderr, " [%s]=%d", outcome.c_str(), count);
  std::fprintf(stderr, "\n");
  CHECK(wrong == 0);
  CHECK(notOnce == 0);
}

void doneThrowCancelRaces(Suite& t) {
  constexpr int kRounds = 150;
  raceRounds(t, kDone | kThrow, kRounds);
  raceRounds(t, kDone | kStop, kRounds);
  raceRounds(t, kThrow | kStop, kRounds);
  raceRounds(t, kDone | kThrow | kStop, kRounds);
}

// Fixed orders of the same contenders: the first terminal transition wins.
void firstTerminalOutcomeWins(Suite& t) {
  auto held = std::make_shared<Held>();
  gr::ThreadPoolExecutor io("io", 2);
  gr::HostOptions options;
  // Done, then throw: done wins.
  options.context.asyncOperations["model:doneThenThrow"] = [](std::string, std::stop_token, ContextCompletion done) {
    done(ContextResult::value("\"first\""));
    throw std::runtime_error("second");
  };
  // Throw with the completion still in the callback's parameter: the throw
  // wins over the parameter's destruction during unwinding.
  options.context.asyncOperations["model:throw"] = [](std::string, std::stop_token, ContextCompletion) {
    throw std::runtime_error("thrown first");
  };
  options.context.asyncOperations["model:error"] = [](std::string, std::stop_token, ContextCompletion done) {
    done(ContextResult::error("embedder failed"));
  };
  // Kept, then stopped, then completed: the stop wins and the late done is
  // discarded.
  options.context.asyncOperations["model:keep"] = [held](std::string, std::stop_token, ContextCompletion done) {
    held->put(std::move(done));
  };
  Harness h(options, io);
  h.callAsync("model:doneThenThrow");
  CHECK(h.runUntil("log.length === 1") == RunExit::Done);
  h.callAsync("model:throw");
  CHECK(h.runUntil("log.length === 2") == RunExit::Done);
  h.callAsync("model:error");
  CHECK(h.runUntil("log.length === 3") == RunExit::Done);
  CHECK((h.logged() == std::vector<std::string>{"ok:\"first\"", "Error:thrown first", "Error:embedder failed"}));

  h.callAsync("model:keep");
  ContextCompletion kept = held->take();
  h.async->requestStop();
  CHECK(h.runUntil("log.length === 4") == RunExit::Done);
  CHECK(h.logged()[3] == "AbortError:The operation was aborted");
  kept(ContextResult::value("\"late\""));
  h.engine->drainJobs();
  CHECK(!h.async->resultsPending());
  CHECK(h.logged().size() == 4);
}

// --- lifetimes ----------------------------------------------------------------

// Gate: retained work across teardown. The run's loop lives on its own
// thread, which exits after the run, so a late completion that touched the
// loop or the engine would touch freed memory (reported by the sanitizer
// builds). The late result is destroyed on the completing thread. The
// tracker counts the call until its completion is gone, and the callback's
// token was stopped by the teardown, on the lane's reaper.
void retainedWorkAcrossTeardown(Suite& t) {
  struct Probe {
    Held held;
    Shared<std::stop_token> token;
    std::atomic<int> stopCallbacks{0};
    Shared<std::thread::id> stopThread;
    std::atomic<uint64_t> run{0};
    std::atomic<bool> keptOneCall{false};
  };
  auto probe = std::make_shared<Probe>();
  auto io = std::make_shared<gr::ThreadPoolExecutor>("io", 2);
  auto tracker = std::make_shared<RunnerTracker>();
  // Registered on the callback's token by the worker thread, destroyed by
  // this thread after the stop ran.
  auto onStop = std::make_shared<Shared<std::shared_ptr<std::stop_callback<std::function<void()>>>>>();
  auto worker = std::make_shared<Shared<std::thread::id>>();
  std::thread runThread([probe, io, tracker, onStop, worker] {
    worker->set(std::this_thread::get_id());
    gr::HostOptions options;
    options.context.asyncOperations["model:keep"] = [probe](std::string, std::stop_token stop, ContextCompletion done) {
      probe->token.set(stop);
      probe->held.put(std::move(done));
    };
    Harness h(options, *io, tracker);
    probe->run = h.generation;
    h.callAsync("model:keep");
    // The run then has external work only.
    if (!probe->held.waitAny()) return;
    std::weak_ptr<Probe> weak = probe;
    onStop->set(std::make_shared<std::stop_callback<std::function<void()>>>(
        probe->token.get(), std::function<void()>([weak] {
          if (auto p = weak.lock()) {
            p->stopThread.set(std::this_thread::get_id());
            ++p->stopCallbacks;
          }
        })));
    probe->keptOneCall = h.async->inFlight() == 1;
    h.endRun();
    // The engine and the thread's loop go with the thread.
  });
  runThread.join();
  CHECK(probe->keptOneCall);
  CHECK(eventually([&] { return probe->stopCallbacks.load() == 1; }));
  CHECK(probe->token.get().stop_requested());
  CHECK(probe->stopThread.get() != worker->get());
  CHECK(probe->stopThread.get() != std::this_thread::get_id());
  // The call's own ticket, until its completion is gone. The teardown's
  // Stopped result is disposed on the reaper, so its ticket may still be
  // on the way out.
  CHECK(eventually([&] { return tracker->outstanding(probe->run) == 1; }));
  std::thread late([probe] {
    ContextCompletion done = probe->held.take();
    if (done) done(ContextResult::value("\"after teardown\""));
  });
  late.join();
  onStop->set(nullptr);
  CHECK(tracker->waitIdle(Clock::now() + std::chrono::seconds(5)));
}

// Item 1 of the step 3 review: an embedder stop callback that blocks runs on
// the I/O lane's reaper, not on the worker. The run's teardown and the
// destruction of its engine finish while the callback is still blocked on a
// gate. Once the gate opens, the callback runs to completion on the reaper.
void blockedStopCallbackRunsOnReaper(Suite& t) {
  struct Probe {
    Held held;
    Shared<std::stop_token> token;
    Gate entered;
    Gate gate;
    Gate finished;
    Shared<std::thread::id> stopThread;
    Gate runEnded;
    Shared<std::thread::id> worker;
    // Destroyed by the test thread after the callback finished.
    Shared<std::shared_ptr<std::stop_callback<std::function<void()>>>> onStop;
  };
  auto probe = std::make_shared<Probe>();
  auto io = std::make_shared<gr::ThreadPoolExecutor>("io", 2);
  auto tracker = std::make_shared<RunnerTracker>();
  std::thread runThread([probe, io, tracker] {
    probe->worker.set(std::this_thread::get_id());
    {
      gr::HostOptions options;
      options.context.asyncOperations["model:keep"] = [probe](std::string, std::stop_token stop,
                                                              ContextCompletion done) {
        std::weak_ptr<Probe> weak = probe;
        probe->onStop.set(std::make_shared<std::stop_callback<std::function<void()>>>(
            stop, std::function<void()>([weak] {
              auto p = weak.lock();
              if (!p) return;
              p->stopThread.set(std::this_thread::get_id());
              p->entered.release();
              p->gate.wait(milliseconds(60000));
              p->finished.release();
            })));
        probe->held.put(std::move(done));
      };
      Harness h(options, *io, tracker);
      h.callAsync("model:keep");
      if (!probe->held.waitAny()) return;
      h.endRun();
      // The engine, the binding and the grant table go here.
    }
    probe->runEnded.release();
  });
  const bool endedBeforeGate = probe->runEnded.wait(milliseconds(10000));
  CHECK(endedBeforeGate);
  CHECK(!probe->gate.isOpen());
  CHECK(probe->entered.wait(milliseconds(10000)));
  CHECK(!probe->finished.isOpen());
  probe->gate.release();
  runThread.join();
  CHECK(probe->finished.wait(milliseconds(10000)));
  CHECK(probe->stopThread.get() != probe->worker.get());
  CHECK(probe->stopThread.get() != std::thread::id{});
  probe->onStop.set(nullptr);
  ContextCompletion kept = probe->held.take(milliseconds(1000));
  kept = {};
  CHECK(tracker->waitIdle(Clock::now() + std::chrono::seconds(5)));
}

// Gate: owner lifetime. The callback's captures stay alive while a
// completion is retained, even after the engine and every run object are
// gone, and are released with the last completion. They are never used
// after that.
void ownerOutlivesRunnerObjects(Suite& t) {
  struct Owner {
    std::atomic<int> uses{0};
  };
  auto held = std::make_shared<Held>();
  auto owner = std::make_shared<Owner>();
  std::weak_ptr<Owner> watch = owner;
  auto tracker = std::make_shared<RunnerTracker>();
  gr::ThreadPoolExecutor io("io", 2);
  {
    gr::HostOptions options;
    options.context.asyncOperations["model:owned"] = [owner, held](std::string, std::stop_token, ContextCompletion done) {
      ++owner->uses;
      held->put(std::move(done));
    };
    owner.reset();
    Harness h(options, io, tracker);
    h.callAsync("model:owned");
    CHECK(held->waitAny());
    // Ends the run before the completion: the engine, its grant table and
    // the options go too.
  }
  // Only the call's state keeps the callback, and so the owner. The
  // teardown's Stopped result is disposed on the reaper.
  CHECK(!watch.expired());
  CHECK(eventually([&] { return tracker->outstanding() == 1; }));
  std::thread([done = held->take()]() mutable {
    if (done) done(ContextResult::value("\"owned\""));
  }).join();
  // Physical disposal: the invocation may still have been returning.
  CHECK(tracker->waitIdle(Clock::now() + std::chrono::seconds(5)));
  CHECK(watch.expired());
}

// Item 2 of the step 3 review: the completion is called while the callback
// is still blocked inside its invocation. The promise settles at once, but
// the callback's captures and the call's tracker ticket stay until the
// invocation returns, even after the run and the engine are gone.
void completionDuringBlockedInvocation(Suite& t) {
  struct Owner {};
  struct Probe {
    Held held;
    Gate gate;
    Gate returned;
  };
  auto probe = std::make_shared<Probe>();
  auto owner = std::make_shared<Owner>();
  std::weak_ptr<Owner> watch = owner;
  auto tracker = std::make_shared<RunnerTracker>();
  gr::ThreadPoolExecutor io("io", 2);
  {
    gr::HostOptions options;
    options.context.asyncOperations["model:blocked"] = [owner, probe](std::string, std::stop_token, ContextCompletion done) {
      probe->held.put(std::move(done));
      probe->gate.wait(milliseconds(60000));
      probe->returned.release();
    };
    owner.reset();
    Harness h(options, io, tracker);
    h.callAsync("model:blocked");
    ContextCompletion done = probe->held.take();
    if (done) done(ContextResult::value("\"early\""));
    CHECK(h.runUntil("log.length === 1") == RunExit::Done);
    CHECK(h.logged() == std::vector<std::string>{"ok:\"early\""});
  }
  // The run and the engine are gone; the invocation still runs.
  CHECK(!probe->returned.isOpen());
  CHECK(!watch.expired());
  CHECK(eventually([&] { return tracker->outstanding() == 1; }));
  CHECK(!tracker->waitIdle(Clock::now() + milliseconds(50)));
  CHECK(!watch.expired());
  probe->gate.release();
  CHECK(probe->returned.wait());
  CHECK(tracker->waitIdle(Clock::now() + std::chrono::seconds(5)));
  CHECK(watch.expired());
}

// --- cancellation -------------------------------------------------------------

// Item 4 of the step 3 review: when the run's cancellation begins, a pending
// non-cleanup call rejects with an AbortError at once, during the grace
// period, and its callback's token is stopped on the reaper. Guest code's
// finally block then runs. A new non-cleanup call is refused at the call,
// and a cleanup call (provider:x:close) still runs and completes before the
// run ends.
void cancellationRejectsPendingCalls(Suite& t) {
  struct Probe {
    Held held;
    Shared<std::stop_token> token;
    std::atomic<int> closes{0};
  };
  auto probe = std::make_shared<Probe>();
  gr::ThreadPoolExecutor io("io", 2);
  gr::HostOptions options;
  options.context.asyncOperations["model:slow"] = [probe](std::string, std::stop_token stop, ContextCompletion done) {
    probe->token.set(stop);
    probe->held.put(std::move(done));
  };
  options.context.asyncOperations["provider:x:close"] = [probe](std::string in, std::stop_token,
                                                                ContextCompletion done) {
    ++probe->closes;
    done(ContextResult::value(in));
  };
  Harness h(options, io);
  h.eval(R"(globalThis.done = false;
    (async () => {
      try {
        await __host.context.callAsync('model:slow', '{}');
        log.push('resolved');
      } catch (e) {
        log.push(e.name + ':' + e.message);
      } finally {
        log.push(attempt(() => __host.context.callAsync('model:slow', '{}')));
        log.push('close:' + await __host.context.callAsync('provider:x:close', '"c"'));
        done = true;
      }
    })();)");
  CHECK(probe->held.waitAny());
  const auto grace = std::chrono::seconds(3);
  const auto started = Clock::now();
  CHECK(h.cancel->request(h.generation, started + grace));
  CHECK(h.runUntil("done") == RunExit::Done);
  CHECK(Clock::now() - started < grace);
  CHECK((h.logged() == std::vector<std::string>{"AbortError:The operation was aborted",
                                                "error: Run cancelled", "close:\"c\""}));
  CHECK(probe->closes == 1);
  CHECK(eventually([&] { return probe->token.get().stop_requested(); }));
  // The kept completion's late call is discarded.
  ContextCompletion kept = probe->held.take(milliseconds(1000));
  if (kept) kept(ContextResult::value("\"late\""));
  h.engine->drainJobs();
  CHECK(!h.async->resultsPending());
  CHECK(h.logged().size() == 3);
}

// Gate: cancellation settles one pending call per completion round (design
// section 4.5). Three calls wait. Each records its rejection, then in its
// finally block waits two microtask turns, records and makes a cleanup
// call. Each call's continuation and cleanup run before the next call's
// rejection settles.
void cancellationSettlesOnePerRound(Suite& t) {
  struct Probe {
    Held held;
    std::atomic<int> closes{0};
  };
  auto probe = std::make_shared<Probe>();
  gr::ThreadPoolExecutor io("io", 2);
  gr::HostOptions options;
  options.context.asyncOperations["model:slow"] = [probe](std::string, std::stop_token, ContextCompletion done) {
    probe->held.put(std::move(done));
  };
  options.context.operations["provider:x:close"] = [probe](const std::string& in) {
    ++probe->closes;
    return in;
  };
  Harness h(options, io);
  h.eval(R"(globalThis.finished = 0;
    for (const i of [1, 2, 3]) {
      (async () => {
        try {
          await __host.context.callAsync('model:slow', '{}');
          log.push('resolved' + i);
        } catch (e) {
          log.push(e.name + i);
        } finally {
          await null;
          await null;
          log.push('cleanup' + i + ':' + __host.context.call('provider:x:close', '"c"'));
          finished++;
        }
      })();
    })");
  CHECK(eventually([&] { return probe->held.size() == 3; }));
  CHECK(h.cancel->request(h.generation, Clock::now() + std::chrono::seconds(5)));
  CHECK(h.runUntil("finished === 3") == RunExit::Done);
  const auto log = h.logged();
  CHECK((log == std::vector<std::string>{"AbortError1", "cleanup1:\"c\"", "AbortError2", "cleanup2:\"c\"",
                                         "AbortError3", "cleanup3:\"c\""}));
  if (log.size() != 6 || log[1] != "cleanup1:\"c\"") std::fprintf(stderr, "  order: %s\n", Json(log).dump().c_str());
  CHECK(probe->closes == 3);
  for (int i = 0; i < 3; ++i) {
    ContextCompletion kept = probe->held.take(milliseconds(1000));
    if (kept) kept(ContextResult::value("\"late\""));
  }
}

// Gate: a lane whose reaper cannot start runs no job. The call is refused
// with an Error through the run's mailbox, its callback never runs, and so
// no stop callback can run on the worker when the run is cancelled.
void laneWithoutReaperRunsNoJob(Suite& t) {
  struct Probe {
    std::atomic<int> invoked{0};
    std::atomic<int> stops{0};
    Shared<std::thread::id> stopThread;
    // What a misbehaving callback keeps: its completion and a stop callback.
    Shared<std::shared_ptr<void>> kept;
  };
  auto probe = std::make_shared<Probe>();
  gr::ThreadPoolExecutor io("io", 2, [](bool reaper) { return !reaper; });
  gr::HostOptions options;
  options.context.asyncOperations["model:slow"] = [probe](std::string, std::stop_token stop, ContextCompletion done) {
    ++probe->invoked;
    std::weak_ptr<Probe> weak = probe;
    // Thread affinity: created on the I/O lane, then only destroyed.
    struct Kept {
      Kept(ContextCompletion completion, std::stop_token token, std::function<void()> callback)
          : done(std::move(completion)), onStop(std::move(token), std::move(callback)) {}
      ContextCompletion done;
      std::stop_callback<std::function<void()>> onStop;
    };
    probe->kept.set(std::make_shared<Kept>(std::move(done), stop, [weak] {
      auto p = weak.lock();
      if (!p) return;
      p->stopThread.set(std::this_thread::get_id());
      ++p->stops;
    }));
  };
  Harness h(options, io);
  h.callAsync("model:slow");
  CHECK(eventually([&] { return probe->invoked > 0 || h.async->resultsPending(); }));
  CHECK(h.cancel->request(h.generation, Clock::now() + std::chrono::seconds(5)));
  CHECK(h.runUntil("log.length === 1") == RunExit::Done);
  CHECK(h.logged() == std::vector<std::string>{"Error:cannot start the reaper thread for the io lane"});
  CHECK(probe->invoked == 0);
  CHECK(probe->stops == 0);
  CHECK(probe->stopThread.get() != std::this_thread::get_id());
  h.endRun();
  probe->kept.set(nullptr);
}

// A refused job's inputs: their destructor blocks until the test releases
// it, and records the thread it ran on.
//
// Thread affinity: thread-safe. Gates and Shared lock themselves.
struct BlockingInputProbe {
  Gate entered;
  Gate release;
  Shared<std::thread::id> thread;
  std::atomic<bool> destroyed{false};
};

// A job whose only input is a BlockingInputProbe reference that blocks in
// its destructor.
//
// Thread affinity: the executor thread that runs or destroys it.
class BlockingInputJob final : public nodetool::jobs::NativeJob {
public:
  explicit BlockingInputJob(std::shared_ptr<BlockingInputProbe> probe) : probe_(std::move(probe)) {}
  ~BlockingInputJob() override {
    probe_->thread.set(std::this_thread::get_id());
    probe_->entered.release();
    probe_->release.wait(milliseconds(3000));
    probe_->destroyed = true;
  }
  nodetool::jobs::JobOutcome run(std::stop_token) override { return nodetool::jobs::JobOutcome::value(nullptr); }

private:
  std::shared_ptr<BlockingInputProbe> probe_;
};

// Gate: a refused submission never destroys the job's inputs on the
// submitting worker. The refusal settles first, and the inputs go on a
// thread off the worker: when the reaper cannot start, after the lane shut
// down, and when no worker thread can start.
void refusedJobInputsLeaveTheWorker(Suite& t) {
  enum class Case { NoReaper, AfterShutdown, NoWorker };
  for (const Case which : {Case::NoReaper, Case::AfterShutdown, Case::NoWorker}) {
    const char* name = which == Case::NoReaper ? "no reaper" : which == Case::AfterShutdown ? "after shutdown" : "no worker";
    auto probe = std::make_shared<BlockingInputProbe>();
    gr::ThreadPoolExecutor::ThreadStarter starter;
    if (which == Case::NoReaper) starter = [](bool reaper) { return !reaper; };
    if (which == Case::NoWorker) starter = [](bool reaper) { return reaper; };
    gr::ThreadPoolExecutor io("io", 2, starter);
    if (which == Case::AfterShutdown) {
      CHECK(io.shutdown(Clock::now() + std::chrono::seconds(1)) == gr::HostShutdownStatus::Complete);
    }
    {
      Harness h(gr::HostOptions{}, io);
      const auto began = Clock::now();
      js::Value promise = h.async->submit(io, std::make_unique<BlockingInputJob>(probe), {}, false);
      const bool returned = Clock::now() - began < milliseconds(1000);
      CHECK(returned);
      h.engine->set(h.engine->global(), "pending", promise);
      h.eval("record(pending);");
      CHECK(h.runUntil("log.length === 1") == RunExit::Done);
      const auto log = h.logged();
      CHECK(log.size() == 1 && (log[0].starts_with("Error:") || log[0].starts_with("AbortError:")));
      CHECK(!probe->destroyed);
      if (!returned || probe->destroyed) std::fprintf(stderr, "  %s: inputs destroyed on the worker\n", name);
      CHECK(probe->entered.wait(milliseconds(5000)));
      CHECK(probe->thread.get() != std::this_thread::get_id());
      probe->release.release();
      CHECK(eventually([&] { return probe->destroyed.load(); }));
    }
  }
}

// Gate: AsyncRun::submit's early refusals, after the run ended and after
// its cancellation began, throw to the caller without destroying the job's
// inputs on the worker. The process disposer destroys them later.
void earlyRefusalLeavesInputsOffTheWorker(Suite& t) {
  for (const bool ended : {true, false}) {
    auto probe = std::make_shared<BlockingInputProbe>();
    gr::ThreadPoolExecutor io("io", 2);
    Harness h(gr::HostOptions{}, io);
    if (ended) {
      h.async->teardown();
    } else {
      h.async->cancel();
    }
    const auto began = Clock::now();
    std::string thrown;
    try {
      h.async->submit(io, std::make_unique<BlockingInputJob>(probe), {}, !ended);
    } catch (const std::exception& e) {
      thrown = e.what();
    }
    const bool returned = Clock::now() - began < milliseconds(1000);
    CHECK(returned);
    CHECK(thrown == (ended ? "the run has ended" : "Run cancelled"));
    CHECK(!probe->destroyed);
    if (!returned || probe->destroyed) {
      std::fprintf(stderr, "  %s: inputs destroyed on the worker\n", ended ? "ended" : "cancelled");
    }
    CHECK(probe->entered.wait(milliseconds(5000)));
    CHECK(probe->thread.get() != std::this_thread::get_id());
    probe->release.release();
    CHECK(eventually([&] { return probe->destroyed.load(); }));
  }
}

// --- grants and limits --------------------------------------------------------

// Gate: shared limits. The call count and the payload limits are one budget
// for call and callAsync, checked in the same order. The response checks of
// an asynchronous call run on the worker when its result settles.
void limitsAreShared(Suite& t) {
  gr::ThreadPoolExecutor io("io", 2);
  auto echo = [](const std::string& in) { return in; };
  auto asyncEcho = [](std::string in, std::stop_token, ContextCompletion done) {
    done(ContextResult::value(in == "\"big\"" ? std::string(9, 'x') : in));
  };
  // The call count.
  {
    gr::HostOptions options;
    options.context.maxCalls = 3;
    options.context.operations["model:sync"] = echo;
    options.context.asyncOperations["model:async"] = asyncEcho;
    options.context.asyncOperations["provider:p:close"] = asyncEcho;
    Harness h(options, io);
    CHECK(h.attempt("__host.context.call('model:sync', '1')") == "1");
    CHECK(h.attempt("__host.context.callAsync('model:async', '2') instanceof Promise") == "true");
    CHECK(h.attempt("__host.context.call('model:sync', '3')") == "3");
    CHECK(h.attempt("__host.context.callAsync('model:async', '4')") == "error: Context call limit exceeded");
    CHECK(h.attempt("__host.context.call('model:sync', '5')") == "error: Context call limit exceeded");
    // Cleanup is exempt from the count on the asynchronous transport too.
    h.callAsync("provider:p:close", "6");
    CHECK(h.runUntil("log.length === 1") == RunExit::Done);
    CHECK(h.logged() == std::vector<std::string>{"ok:6"});
    // Run cleanup restores the budget for both.
    h.endRun();
    h.beginRun();
    CHECK(h.attempt("__host.context.call('model:sync', '7')") == "7");
    h.callAsync("model:async", "8");
    CHECK(h.runUntil("log.length === 1") == RunExit::Done);
    CHECK(h.logged() == std::vector<std::string>{"ok:8"});
  }
  // Payload limits, on both sides, for cleanup too.
  {
    gr::HostOptions options;
    options.context.maxPayloadBytes = 8;
    options.context.asyncOperations["model:async"] = asyncEcho;
    options.context.asyncOperations["provider:p:close"] = asyncEcho;
    Harness h(options, io);
    CHECK(h.attempt("__host.context.callAsync('model:async', '123456789')") ==
          "error: Context request size limit exceeded");
    CHECK(h.attempt("__host.context.callAsync('provider:p:close', '123456789')") ==
          "error: Context request size limit exceeded");
    h.callAsync("model:async", "12345678");
    h.callAsync("model:async", "\"big\"");
    h.callAsync("provider:p:close", "\"big\"");
    CHECK(h.runUntil("log.length === 3") == RunExit::Done);
    const auto log = h.logged();
    CHECK(std::count(log.begin(), log.end(), "ok:12345678") == 1);
    CHECK(std::count(log.begin(), log.end(), "Error:Context response size limit exceeded") == 2);
  }
  // Order: grant, cancellation, count, payload conversion, size. Payload code
  // runs only after admission and consumes a call even if it throws.
  {
    auto cancelled = std::make_shared<std::atomic<bool>>(false);
    gr::HostOptions options;
    options.context.maxCalls = 2;
    options.context.cancelled = [cancelled] { return cancelled->load(); };
    options.context.asyncOperations["model:async"] = asyncEcho;
    options.context.operations["model:sync"] = echo;
    Harness h(options, io);
    h.eval("globalThis.hits = 0; globalThis.p = { toString() { hits++; return '{}'; } };"
           "globalThis.q = { toString() { hits++; throw new Error('boom'); } };");
    *cancelled = true;
    CHECK(h.attempt("__host.context.callAsync('model:async', p)") == "error: Run cancelled");
    CHECK(h.str("hits") == "0");
    *cancelled = false;
    CHECK(h.attempt("__host.context.callAsync('model:async', q)") == "error: boom");  // call 1
    CHECK(h.attempt("__host.context.call('model:sync', p)") == "{}");                // call 2
    CHECK(h.str("hits") == "2");
    CHECK(h.attempt("__host.context.callAsync('model:async', p)") == "error: Context call limit exceeded");
    CHECK(h.str("hits") == "2");
    CHECK(h.attempt("__host.context.callAsync('model:missing', q)") ==
          "error: ProcessingContext service 'model:missing' is not granted");
    CHECK(h.str("hits") == "2");
  }
  // Cancellation while the callback runs fails the response at delivery
  // with an AbortError, except for cleanup.
  {
    auto cancelled = std::make_shared<std::atomic<bool>>(false);
    gr::HostOptions options;
    options.context.cancelled = [cancelled] { return cancelled->load(); };
    auto cancelling = [cancelled](std::string in, std::stop_token, ContextCompletion done) {
      *cancelled = true;
      done(ContextResult::value(in));
    };
    options.context.asyncOperations["model:async"] = cancelling;
    options.context.asyncOperations["provider:p:close"] = cancelling;
    Harness h(options, io);
    h.callAsync("model:async", "1");
    CHECK(h.runUntil("log.length === 1") == RunExit::Done);
    // Admission is exempt for cleanup after cancellation, and so is the
    // response check.
    h.callAsync("provider:p:close", "2");
    CHECK(h.runUntil("log.length === 2") == RunExit::Done);
    CHECK((h.logged() == std::vector<std::string>{"AbortError:Run cancelled", "ok:2"}));
  }
}

// Gate: has() covers both maps, and each transport refuses the other's names.
void hasCoversBothMaps(Suite& t) {
  nodetool::jobs::InlineExecutor io;
  gr::HostOptions options;
  options.context.operations["model:sync"] = [](const std::string& in) { return in; };
  options.context.asyncOperations["model:async"] = [](std::string in, std::stop_token, ContextCompletion done) {
    done(ContextResult::value(in));
  };
  Harness h(options, io);
  CHECK(h.str("__host.context.has('model:sync')") == "true");
  CHECK(h.str("__host.context.has('model:async')") == "true");
  CHECK(h.str("__host.context.has('model:none')") == "false");
  CHECK(h.str("__host.context.isAsync('model:async')") == "true");
  CHECK(h.str("__host.context.isAsync('model:sync')") == "false");
  CHECK(h.str("__host.context.isAsync('model:none')") == "false");
  CHECK(h.attempt("__host.context.call('model:async', '{}')") ==
        "error: ProcessingContext service 'model:async' is granted for asynchronous calls only");
  CHECK(h.attempt("__host.context.callAsync('model:sync', '{}')") ==
        "error: ProcessingContext service 'model:sync' is granted for synchronous calls only");
  CHECK(h.attempt("__host.context.callAsync('model:async')") ==
        "error: Context call requires operation and JSON payload");
  // Without a bound run, as while the guest loads.
  h.endRun();
  CHECK(h.attempt("__host.context.callAsync('model:async', '{}')") ==
        "error: Asynchronous context calls need a running graph");
}

// Gate: a name in both maps is a configuration error when the context is
// installed, with or without fake providers.
void bothMapsIsAConfigurationError(Suite& t) {
  for (const bool fake : {false, true}) {
    gr::HostOptions options;
    options.fakeProviders = fake;
    options.context.operations["model:twice"] = [](const std::string& in) { return in; };
    options.context.asyncOperations["model:twice"] = [](std::string, std::stop_token, ContextCompletion) {};
    auto engine = js::createQuickJsEngine();
    std::string error;
    try {
      Harness::install(*engine, options);
    } catch (const std::invalid_argument& e) {
      error = e.what();
    }
    CHECK(error == "Context operation 'model:twice' is granted both synchronously and asynchronously");
  }
  // The same holds for a provider grant that fake mode would drop.
  gr::HostOptions options;
  options.fakeProviders = true;
  options.context.operations["provider:p:open"] = [](const std::string& in) { return in; };
  options.context.asyncOperations["provider:p:open"] = [](std::string, std::stop_token, ContextCompletion) {};
  auto engine = js::createQuickJsEngine();
  bool threw = false;
  try {
    Harness::install(*engine, options);
  } catch (const std::invalid_argument&) {
    threw = true;
  }
  CHECK(threw);
}

// Gate: fake mode. Asynchronous provider and prediction grants are dropped
// like synchronous ones, so a guest attempt reaches no callback: no grant
// runs, no secret is read and no connection is attempted. Other grants
// stay. Without fake mode the same grants are reachable, so the counters
// would see a leak.
void fakeModeDropsAsyncProviderGrants(Suite& t) {
  struct Counters {
    std::atomic<int> grantCalls{0};
    std::atomic<int> secretReads{0};
    std::atomic<int> connections{0};
  };
  auto counters = std::make_shared<Counters>();
  gr::ThreadPoolExecutor io("io", 2);
  const std::vector<std::string> provider = {
      "provider:fixture:generateMessage", "provider:fixture:open",   "provider:fixture:next",
      "provider:fixture:close",           "provider:fixture:jobs:start",
      "prediction:fixture:text_to_image", "prediction:fixture:generate_message"};
  auto makeOptions = [&](bool fake) {
    gr::HostOptions options;
    options.fakeProviders = fake;
    options.secrets["FIXTURE_API_KEY"] = "sk-fixture";
    for (const auto& name : provider) {
      // What an embedder's provider adapter does: read the key, connect.
      options.context.asyncOperations[name] = [counters](std::string, std::stop_token, ContextCompletion done) {
        ++counters->grantCalls;
        ++counters->secretReads;
        ++counters->connections;
        done(ContextResult::value("\"provider\""));
      };
    }
    options.context.operations["prediction:fixture:image_to_image"] = [counters](const std::string&) {
      ++counters->grantCalls;
      return std::string("\"provider\"");
    };
    options.context.asyncOperations["model:get"] = [](std::string in, std::stop_token, ContextCompletion done) {
      done(ContextResult::value(in));
    };
    return options;
  };
  {
    Harness h(makeOptions(true), io);
    CHECK(h.str("__host.providers.fake()") == "true");
    for (const auto& name : provider) {
      const std::string quoted = Json(name).dump();
      CHECK(h.str("__host.context.has(" + quoted + ")") == "false");
      CHECK(h.str("__host.context.isAsync(" + quoted + ")") == "false");
      CHECK(h.attempt("__host.context.callAsync(" + quoted + ", '{}')") ==
            "error: ProcessingContext service '" + name + "' is not granted");
      CHECK(h.attempt("__host.context.call(" + quoted + ", '{}')") ==
            "error: ProcessingContext service '" + name + "' is not granted");
    }
    CHECK(h.str("__host.context.has('prediction:fixture:image_to_image')") == "false");
    // Other asynchronous grants stay, and the refused attempts used no call.
    h.callAsync("model:get", "\"kept\"");
    CHECK(h.runUntil("log.length === 1") == RunExit::Done);
    CHECK(h.logged() == std::vector<std::string>{"ok:\"kept\""});
    CHECK(h.async->inFlight() == 0);
    CHECK(io.queued() == 0);
  }
  CHECK(counters->grantCalls == 0);
  CHECK(counters->secretReads == 0);
  CHECK(counters->connections == 0);
  {
    Harness h(makeOptions(false), io);
    CHECK(h.str("__host.context.isAsync('prediction:fixture:text_to_image')") == "true");
    h.callAsync("prediction:fixture:text_to_image");
    CHECK(h.runUntil("log.length === 1") == RunExit::Done);
    CHECK(h.logged() == std::vector<std::string>{"ok:\"provider\""});
  }
  CHECK(counters->grantCalls == 1);
}

// --- the public runner --------------------------------------------------------

// The fixture's 1x1 PNG, as FakeProvider returns it.
constexpr const char* kPngBase64 =
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==";

std::string imageGraph(const std::string& provider) {
  auto node = [](const char* id, const char* type, Json data) {
    return Json{{"id", id}, {"type", type}, {"data", std::move(data)}};
  };
  Json model = {{"type", "image_model"}, {"provider", provider}, {"id", "m"}, {"name", "M"}};
  Json graph = {
      {"nodes",
       {node("image", "nodetool.image.TextToImage", {{"prompt", "a lighthouse"}, {"model", model}}),
        node("out", "nodetool.output.Output", {{"name", "image"}})}},
      {"edges",
       {{{"id", "e1"}, {"source", "image"}, {"sourceHandle", "output"}, {"target", "out"},
         {"targetHandle", "value"}}}}};
  return graph.dump();
}

// Collects one job's messages, and the thread they arrive on: the worker's.
// The handler holds the shared state, so it stays valid however long the
// runner keeps the handler. Construct the collector before the runner.
//
// Thread affinity: thread-safe, `State::mutex` guards every member of State.
class Collector {
public:
  gr::GraphRunner::MessageHandler handler() const {
    return [state = state_](const std::string& text, bool last) {
      std::lock_guard lock(state->mutex);
      state->worker = std::this_thread::get_id();
      state->messages.push_back(Json::parse(text));
      if (last) state->finished = true;
      state->changed.notify_all();
    };
  }
  bool waitFinished(int timeoutMs = 60000) const {
    std::unique_lock lock(state_->mutex);
    return state_->changed.wait_for(lock, milliseconds(timeoutMs), [&] { return state_->finished; });
  }
  std::string status() const {
    std::lock_guard lock(state_->mutex);
    for (auto it = state_->messages.rbegin(); it != state_->messages.rend(); ++it) {
      if (it->value("type", std::string()) == "job_update") return it->value("status", std::string());
    }
    return {};
  }
  std::vector<Json> where(const std::string& type) const {
    std::lock_guard lock(state_->mutex);
    std::vector<Json> out;
    for (const auto& m : state_->messages) {
      if (m.value("type", std::string()) == type) out.push_back(m);
    }
    return out;
  }
  std::thread::id worker() const {
    std::lock_guard lock(state_->mutex);
    return state_->worker;
  }

private:
  struct State {
    std::mutex mutex;
    std::condition_variable changed;
    std::vector<Json> messages;
    std::thread::id worker;
    bool finished = false;
  };
  // Shared with every handler the runner holds.
  std::shared_ptr<State> state_ = std::make_shared<State>();
};

// The runner binds each run, the guest's context services choose callAsync
// for an asynchronous grant, the callback runs off the worker, and a
// completion from a third thread settles the node's prediction.
void runnerSettlesAsyncPrediction(Suite& t) {
  if (t.bundle().empty()) return;
  struct Probe {
    Held held;
    Shared<std::thread::id> callbackThread;
    std::atomic<int> assets{0};
  };
  auto probe = std::make_shared<Probe>();
  gr::HostOptions options;
  options.context.asyncOperations["prediction:fixture:text_to_image"] =
      [probe](std::string, std::stop_token, ContextCompletion done) {
        probe->callbackThread.set(std::this_thread::get_id());
        probe->held.put(std::move(done));
      };
  // The output node saves the image through a second asynchronous grant,
  // completed inside its callback.
  options.context.asyncOperations["model:createAsset"] = [probe](std::string request, std::stop_token,
                                                                 ContextCompletion done) {
    const Json args = Json::parse(request);
    if (args.value("contentType", std::string()) == "image/png") ++probe->assets;
    done(ContextResult::value(Json{{"id", "0123456789abcdef0123456789abcdef"}}.dump()));
  };
  // Outlives the runner, which may deliver to its handler until destroyed.
  const Collector c;
  gr::GraphRunner runner(t.bundle(), options);
  CHECK(runner.waitUntilLoaded(60000));
  const std::string reason = runner.unsupportedReason(imageGraph("fixture"));
  if (!reason.empty()) std::fprintf(stderr, "  unsupported: %s\n", reason.c_str());
  CHECK(reason.empty());
  runner.submit("job", "wf", imageGraph("fixture"), "", c.handler());
  std::thread completer([probe] {
    ContextCompletion done = probe->held.take();
    if (!done) return;
    std::this_thread::sleep_for(milliseconds(20));
    done(ContextResult::value(Json{{"__bytes__", kPngBase64}}.dump()));
  });
  CHECK(c.waitFinished());
  completer.join();
  CHECK(c.status() == "completed");
  const auto outputs = c.where("output_update");
  CHECK(outputs.size() == 1);
  if (!outputs.empty()) {
    CHECK(outputs[0]["value"].value("type", std::string()) == "image");
    CHECK(outputs[0]["value"].value("asset_id", std::string()) == "0123456789abcdef0123456789abcdef");
  }
  CHECK(probe->assets == 1);
  CHECK(probe->callbackThread.get() != std::thread::id{});
  CHECK(probe->callbackThread.get() != c.worker());
}

// Gate: owner lifetime through the public runner. Destroying the runner
// while the embedder keeps a completion stops the callback's token and ends
// the job. The callback's captures stay alive until the completion is gone,
// and calling it after the runner is destroyed is safe.
void retainedCompletionOutlivesRunner(Suite& t) {
  if (t.bundle().empty()) return;
  struct Owner {};
  struct Probe {
    Held held;
    Shared<std::stop_token> token;
  };
  auto probe = std::make_shared<Probe>();
  auto owner = std::make_shared<Owner>();
  std::weak_ptr<Owner> watch = owner;
  const Collector c;
  {
    gr::HostOptions options;
    options.context.asyncOperations["prediction:fixture:text_to_image"] =
        [owner, probe](std::string, std::stop_token stop, ContextCompletion done) {
          probe->token.set(stop);
          probe->held.put(std::move(done));
        };
    owner.reset();
    gr::GraphRunner runner(t.bundle(), options);
    CHECK(runner.waitUntilLoaded(60000));
    runner.submit("job", "wf", imageGraph("fixture"), "", c.handler());
    CHECK(probe->held.waitAny());
  }
  CHECK(c.waitFinished(5000));
  CHECK(c.status() == "cancelled");
  // The stop reaches the token through the I/O lane's reaper.
  CHECK(eventually([&] { return probe->token.get().stop_requested(); }));
  CHECK(!watch.expired());
  std::thread late([probe] {
    ContextCompletion done = probe->held.take();
    if (done) done(ContextResult::value("\"late\""));
  });
  late.join();
  // The runner's tracker is not reachable here, so wait for the physical
  // end: the lane thread may still be leaving the invocation, and the
  // owner goes with the call's state when that ends.
  CHECK(eventually([&] { return watch.expired(); }));
}

// Item 1 of the step 3 review through the public runner: destroying the
// runner finishes while an embedder stop callback is blocked on a gate.
void runnerDestroyedWhileStopCallbackBlocks(Suite& t) {
  if (t.bundle().empty()) return;
  struct Probe {
    Held held;
    Gate entered;
    Gate gate;
    Gate finished;
    Gate destroyed;
    Shared<std::shared_ptr<std::stop_callback<std::function<void()>>>> onStop;
  };
  auto probe = std::make_shared<Probe>();
  const Collector c;
  gr::HostOptions options;
  options.context.asyncOperations["prediction:fixture:text_to_image"] =
      [probe](std::string, std::stop_token stop, ContextCompletion done) {
        std::weak_ptr<Probe> weak = probe;
        probe->onStop.set(std::make_shared<std::stop_callback<std::function<void()>>>(
            stop, std::function<void()>([weak] {
              auto p = weak.lock();
              if (!p) return;
              p->entered.release();
              p->gate.wait(milliseconds(60000));
              p->finished.release();
            })));
        probe->held.put(std::move(done));
      };
  // Owned by the shared pointer so another thread can destroy the runner.
  auto runner = std::make_shared<Shared<std::unique_ptr<gr::GraphRunner>>>();
  runner->set(std::make_unique<gr::GraphRunner>(t.bundle(), options));
  {
    std::lock_guard lock(runner->mutex);
    CHECK(runner->value->waitUntilLoaded(60000));
    runner->value->submit("job", "wf", imageGraph("fixture"), "", c.handler());
  }
  CHECK(probe->held.waitAny());
  std::thread destroyer([runner, probe] {
    std::unique_ptr<gr::GraphRunner> gone;
    {
      std::lock_guard lock(runner->mutex);
      gone = std::move(runner->value);
    }
    gone.reset();
    probe->destroyed.release();
  });
  const bool destroyedBeforeGate = probe->destroyed.wait(milliseconds(10000));
  CHECK(destroyedBeforeGate);
  CHECK(probe->entered.wait(milliseconds(10000)));
  CHECK(!probe->finished.isOpen());
  probe->gate.release();
  destroyer.join();
  CHECK(probe->finished.wait(milliseconds(10000)));
  CHECK(c.status() == "cancelled");
  probe->onStop.set(nullptr);
  ContextCompletion kept = probe->held.take(milliseconds(1000));
  kept = {};
}

// A name in both maps fails the runner's load with the configuration error,
// and so does an asynchronous "message" grant.
void runnerReportsBothMaps(Suite& t) {
  if (t.bundle().empty()) return;
  gr::HostOptions options;
  options.context.operations["model:twice"] = [](const std::string& in) { return in; };
  options.context.asyncOperations["model:twice"] = [](std::string, std::stop_token, ContextCompletion) {};
  gr::GraphRunner runner(t.bundle(), options);
  CHECK(!runner.waitUntilLoaded(60000));
  CHECK(runner.loadError().find("'model:twice' is granted both synchronously and asynchronously") !=
        std::string::npos);
  // The runner serves "message" itself, so it cannot be asynchronous.
  gr::HostOptions message;
  message.context.asyncOperations["message"] = [](std::string, std::stop_token, ContextCompletion) {};
  gr::GraphRunner observer(t.bundle(), message);
  CHECK(!observer.waitUntilLoaded(60000));
  CHECK(observer.loadError().find("The context operation 'message' cannot be asynchronous") != std::string::npos);
}

}  // namespace

// S3: a guest promise that settles after Loop::abandon() destroyed the
// awaiting frame posts no step. A drain then resumes nothing.
void abandonedAwaitPostsNoStep(Suite& t) {
  auto engine = js::createQuickJsEngine();
  gr::Guest guest(*engine);
  Loop& loop = Loop::current();
  engine->evaluateScript(
      "globalThis.__settle = null;"
      "globalThis.__pending = new Promise(r => { __settle = r; });",
      "abandon.js");
  {
    auto task = guest.callSettled(engine->evaluateScript("__pending", "p.js"));
    CHECK(!task.done());
    CHECK(loop.liveFrames() >= 1);
    loop.abandon();
  }
  CHECK(loop.liveFrames() == 0);
  engine->evaluateScript("__settle(JSON.stringify({ok:true,value:1}));", "s.js");
  while (engine->drainJobs() > 0) {
  }
  CHECK(loop.idle());
  loop.run();
}

int main(int argc, char** argv) {
  Suite suite(argc > 1 ? argv[1] : "");
  const std::vector<std::pair<const char*, void (*)(Suite&)>> tests = {
      {"abandonedAwaitPostsNoStep", abandonedAwaitPostsNoStep},
      {"retainedDoneFromAnotherThread", retainedDoneFromAnotherThread},
      {"inlineDoneSettlesAsMacrotask", inlineDoneSettlesAsMacrotask},
      {"movedFromCompletionIsInert", movedFromCompletionIsInert},
      {"moveAssignOverPendingDropsIt", moveAssignOverPendingDropsIt},
      {"missingDoneFails", missingDoneFails},
      {"doubleDoneIsIgnored", doubleDoneIsIgnored},
      {"firstTerminalOutcomeWins", firstTerminalOutcomeWins},
      {"doneThrowCancelRaces", doneThrowCancelRaces},
      {"retainedWorkAcrossTeardown", retainedWorkAcrossTeardown},
      {"blockedStopCallbackRunsOnReaper", blockedStopCallbackRunsOnReaper},
      {"ownerOutlivesRunnerObjects", ownerOutlivesRunnerObjects},
      {"completionDuringBlockedInvocation", completionDuringBlockedInvocation},
      {"cancellationRejectsPendingCalls", cancellationRejectsPendingCalls},
      {"cancellationSettlesOnePerRound", cancellationSettlesOnePerRound},
      {"laneWithoutReaperRunsNoJob", laneWithoutReaperRunsNoJob},
      {"refusedJobInputsLeaveTheWorker", refusedJobInputsLeaveTheWorker},
      {"earlyRefusalLeavesInputsOffTheWorker", earlyRefusalLeavesInputsOffTheWorker},
      {"limitsAreShared", limitsAreShared},
      {"hasCoversBothMaps", hasCoversBothMaps},
      {"bothMapsIsAConfigurationError", bothMapsIsAConfigurationError},
      {"fakeModeDropsAsyncProviderGrants", fakeModeDropsAsyncProviderGrants},
      {"runnerSettlesAsyncPrediction", runnerSettlesAsyncPrediction},
      {"retainedCompletionOutlivesRunner", retainedCompletionOutlivesRunner},
      {"runnerDestroyedWhileStopCallbackBlocks", runnerDestroyedWhileStopCallbackBlocks},
      {"runnerReportsBothMaps", runnerReportsBothMaps},
  };
  const char* only = std::getenv("GR_ASYNC_CONTEXT_ONLY");
  for (const auto& [name, fn] : tests) {
    if (only && std::string(only) != name) continue;
    suite.begin(name, std::chrono::seconds(120));
    const int before = suite.failures();
    fn(suite);
    suite.end();
    std::fprintf(stderr, "%s %s\n", suite.failures() == before ? "PASS" : "FAIL", name);
  }
  std::fprintf(stderr, "%d checks, %d failed\n", suite.checks(), suite.failures());
  return suite.failures() == 0 ? 0 : 1;
}
