// Step 4 of docs/plans/graph-runner-async-host.md: provider endpoint jobs
// read through the asynchronous next grant, workers on the network lane,
// runs stamped by the host and retired at run teardown.
//
//   gr_provider_next_tests [guest.js]
//
// The transport and lane tests need no bundle. With a guest bundle that has
// minimax.TextToImage (CMake builds a parity bundle of the MiniMax nodes),
// the runner tests also run that node through the public GraphRunner. Every
// worker here is a test function: no test reaches a provider, a secret or
// the network.
//
// Workers, callbacks and helper threads share state with the test through
// shared pointers they capture by value (native/AGENTS.md rule 12).
#include "host/capabilities.h"
#include "host/context.h"
#include "host/provider_job_grants.h"
#include "js/engine.h"
#include "kernel/async_jobs.h"
#include "kernel/cancel_state.h"
#include "kernel/host_lanes.h"
#include "kernel/run_control.h"
#include "kernel/task.h"
#include "nodetool/graph_runner.h"
#include "nodetool/provider_jobs.h"

#include <nlohmann/json.hpp>

#include <atomic>
#include <barrier>
#include <csignal>
#include <chrono>
#include <condition_variable>
#include <cstdio>
#include <cstdlib>
#include <future>
#include <memory>
#include <mutex>
#include <optional>
#include <stdexcept>
#include <string>
#include <thread>
#include <utility>
#include <vector>

#include <sys/resource.h>
#include <sys/wait.h>
#include <unistd.h>

namespace {

using gr::AsyncRun;
using gr::CancelState;
using gr::Loop;
using gr::RunExit;
using gr::host::ContextCompletion;
using gr::host::ContextOptions;
using gr::host::ProviderJobs;
using nodetool::jobs::RunnerTracker;
using Outcome = ProviderJobs::Outcome;
using Kind = ProviderJobs::Outcome::Kind;
namespace js = gr::js;
using Json = nlohmann::json;
using Clock = std::chrono::steady_clock;
using std::chrono::milliseconds;

// One run of the suite: the check counters, the bundle path and a watchdog
// that fails the process when a test hangs.
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

template <class P>
bool eventually(P predicate, milliseconds timeout = milliseconds(10000)) {
  const auto deadline = Clock::now() + timeout;
  while (!predicate()) {
    if (Clock::now() > deadline) return false;
    std::this_thread::sleep_for(milliseconds(2));
  }
  return true;
}

// The answer next gives for a stopped or closed job.
std::string stopped(const std::string& message) {
  return Json{{"state", "stopped"}, {"message", message}}.dump();
}

std::string jobPayload(const std::string& job) { return Json{{"job", job}}.dump(); }

// The host's own next(), which reaches a job of any run.
std::future<Outcome> nextLater(ProviderJobs& jobs, const std::string& job) {
  std::promise<Outcome> promise;
  auto future = promise.get_future();
  jobs.next("p", jobPayload(job), [promise = std::move(promise)](Outcome outcome) mutable {
    promise.set_value(std::move(outcome));
  });
  return future;
}

// Waits until cancelled(), like a vendor call that honours stop.
std::string blockUntilCancelled(const ProviderJobs::Call& call) {
  while (!call.cancelled()) std::this_thread::sleep_for(milliseconds(1));
  throw std::runtime_error("cancelled");
}

// The identity of the run in progress, as GraphRunner's current run holds
// it. Shared with the grants' RunSource.
using RunSlot = Shared<gr::host::RunIdentity>;

ProviderJobs::RunSource runSource(const std::shared_ptr<RunSlot>& slot) {
  return [slot] { return slot->get(); };
}

// A RunSource with one fixed run, for tests that call the grants directly.
ProviderJobs::RunSource fixedRun(const std::string& jobId) {
  return [run = gr::host::newRunIdentity(jobId)] { return run; };
}

// One engine with __host.context installed from `grants`, and one bound run
// at a time, as GraphRunner::Impl::runJob binds it. Each run gets a new
// identity, published in `slot` while the run lasts. The context's
// cancellation predicate also reports the run's CancelState, as in the
// runner.
//
// Thread affinity: the thread that created it only.
struct Harness {
  std::unique_ptr<js::Engine> engine = js::createQuickJsEngine();
  Loop& loop = Loop::current();
  // Shared with the installed cancellation predicate, which the engine keeps.
  std::shared_ptr<CancelState> cancel = std::make_shared<CancelState>();
  std::shared_ptr<RunnerTracker> tracker = std::make_shared<RunnerTracker>();
  // The context's I/O lane. The caller keeps it alive.
  nodetool::jobs::JobExecutor& io;
  uint64_t generation = 0;
  // Shared with the grants' RunSource. May be null.
  std::shared_ptr<RunSlot> slot;
  gr::host::RunIdentity identity;
  std::optional<AsyncRun> async;
  std::optional<gr::RunBinding::Scope> bound;

  Harness(ContextOptions grants, nodetool::jobs::JobExecutor& lane, std::shared_ptr<RunSlot> runs = {},
          const std::string& label = "run")
      : io(lane), slot(std::move(runs)) {
    auto granted = grants.cancelled;
    grants.cancelled = [state = cancel, granted] { return state->cancelled() || (granted && granted()); };
    js::Value host = engine->object();
    js::Value context = engine->object();
    gr::host::installContext(*engine, context, grants);
    engine->set(host, "context", context);
    engine->set(engine->global(), "__host", host);
    eval("globalThis.log = [];"
         "globalThis.op = (name) => 'provider:p:jobs:' + name;"
         "globalThis.start = (args, extra) => JSON.parse(__host.context.call(op('start'),"
         "  JSON.stringify(Object.assign({ method: 'callEndpoint', args: args || {} }, extra || {})))).job;"
         "globalThis.put = (request) => JSON.parse(__host.context.call(op('put'), JSON.stringify(request))).upload;"
         "globalThis.next = (job, extra) => __host.context.callAsync(op('next'),"
         "  JSON.stringify(Object.assign({ job }, extra || {})));"
         "globalThis.close = (job) => __host.context.call(op('close'), JSON.stringify({ job }));"
         "globalThis.record = (p) => p.then((v) => { log.push('ok:' + v); },"
         "  (e) => { log.push(e.name + ':' + e.message); });"
         "globalThis.attempt = (f) => { try { return String(f()); } catch (e) { return 'error: ' + e.message; } };");
    beginRun(label);
  }
  ~Harness() { endRun(); }
  Harness(const Harness&) = delete;
  Harness& operator=(const Harness&) = delete;

  void beginRun(const std::string& label = "run") {
    generation = cancel->beginRun();
    identity = gr::host::newRunIdentity(label);
    if (slot) slot->set(identity);
    async.emplace(*engine, loop, tracker, generation, io, identity);
    bound.emplace(*engine, *async, io);
    eval("log = [];");
  }
  void endRun() {
    if (!async) return;
    bound.reset();
    async->teardown();
    loop.clearTimers();
    loop.abandon();
    async.reset();
    engine->releaseRunResources();
    cancel->endRun();
    if (slot) slot->set({});
  }

  js::Value eval(const std::string& source) { return engine->evaluateScript(source, "test.js"); }
  std::string str(const std::string& source) { return engine->toString(eval(source)); }
  std::string attempt(const std::string& body) { return str("attempt(() => " + body + ")"); }
  RunExit runUntil(const std::string& condition) {
    gr::EngineRunControl control(*engine, *async, *cancel, generation,
                                 [&] { return engine->toBoolean(eval(condition)); });
    return loop.run(control);
  }
  std::vector<std::string> logged() {
    return Json::parse(str("JSON.stringify(log)")).get<std::vector<std::string>>();
  }
};

// Wraps the granted next of provider "p": `before` runs on the I/O lane
// with the request before the grant, `after` once the grant returned, by
// which time the call registered its waiter or completed.
void wrapNext(ContextOptions& grants, std::function<void(const std::string&)> before,
              std::function<void()> after) {
  auto& next = grants.asyncOperations.at("provider:p:jobs:next");
  next = [inner = next, before = std::move(before), after = std::move(after)](
             std::string request, std::stop_token stop, ContextCompletion done) {
    if (before) before(request);
    inner(std::move(request), std::move(stop), std::move(done));
    if (after) after();
  };
}

// --- through the transport ------------------------------------------------------

// Gate: registration/production race through the transport. Each next of a
// job and the worker's production of the item it waits for meet at a
// barrier, so the waiter's registration on the I/O lane races the production
// on the network lane. In progress mode the worker produces the result only
// after the guest received the progress and asked again, so the progress
// cannot ride along with the result. Every item arrives once and in order.
void registrationRaceThroughTransport(Suite& t) {
  constexpr int kJobs = 300;
  struct Probe {
    std::barrier<> sync{2};
  };
  auto probe = std::make_shared<Probe>();
  gr::ThreadPoolExecutor io("io", 2);
  gr::ThreadPoolExecutor network("network", 4);
  ProviderJobs jobs(
      [probe](const ProviderJobs::Call& call) -> std::string {
        const auto mode = Json::parse(call.argsJson).at("mode").get<std::string>();
        probe->sync.arrive_and_wait();
        if (mode == "progress") {
          call.progress(R"({"n":1})");
          probe->sync.arrive_and_wait();
        }
        return R"({"ok":true})";
      },
      ProviderJobs::Limits{.maxJobs = 64}, network);
  ContextOptions grants;
  auto slot = std::make_shared<RunSlot>();
  jobs.grant(grants, {"p"}, runSource(slot));
  wrapNext(
      grants,
      [probe](const std::string& request) {
        if (Json::parse(request).value("sync", false)) probe->sync.arrive_and_wait();
      },
      {});
  Harness h(std::move(grants), io, slot);
  h.eval("globalThis.race = { done: false, results: [], error: '' };"
         "(async () => {"
         "  for (let i = 0; i < " + std::to_string(kJobs) + "; ++i) {"
         "    const mode = i % 2 ? 'progress' : 'finish';"
         "    const job = start({ mode });"
         "    const states = [];"
         "    let synced = mode === 'progress' ? 2 : 1;"
         "    for (;;) {"
         "      const answer = JSON.parse(await next(job, synced-- > 0 ? { sync: true } : undefined));"
         "      states.push(answer.state);"
         "      if (answer.state === 'done' || states.length > 3) break;"
         "    }"
         "    close(job);"
         "    race.results.push(mode + ':' + states.join(','));"
         "  }"
         "})().then(() => { race.done = true; }, (e) => { race.error = String(e); race.done = true; });");
  CHECK(h.runUntil("race.done") == RunExit::Done);
  CHECK(h.str("race.error").empty());
  const auto results = Json::parse(h.str("JSON.stringify(race.results)")).get<std::vector<std::string>>();
  CHECK(results.size() == static_cast<size_t>(kJobs));
  int wrong = 0;
  for (size_t i = 0; i < results.size(); ++i) {
    const std::string expected = i % 2 ? "progress:progress,done" : "finish:done";
    if (results[i] != expected) {
      if (++wrong <= 3) std::fprintf(stderr, "  job %zu: %s\n", i, results[i].c_str());
    }
  }
  CHECK(wrong == 0);
  CHECK(h.async->inFlight() == 0);
  const auto run = h.identity;
  h.endRun();
  jobs.retireRun(run);
  CHECK(eventually([&] { return jobs.stats().alive == 0; }));
}

// Gate: repeated next after stop and after close. A waiting next settles
// with "stopped" when the host stops the job, and every later next answers
// the same at once. After close, every next answers "closed".
void repeatedNextAfterStopAndClose(Suite& t) {
  auto returned = std::make_shared<std::atomic<int>>(0);
  auto registered = std::make_shared<Gate>();
  gr::ThreadPoolExecutor io("io", 2);
  gr::ThreadPoolExecutor network("network", 2);
  ProviderJobs jobs(
      [returned](const ProviderJobs::Call& call) -> std::string {
        try {
          return blockUntilCancelled(call);
        } catch (...) {
          ++*returned;
          throw;
        }
      },
      ProviderJobs::Limits{}, network);
  ContextOptions grants;
  auto slot = std::make_shared<RunSlot>();
  jobs.grant(grants, {"p"}, runSource(slot));
  wrapNext(grants, {}, [registered] { registered->release(); });
  Harness h(std::move(grants), io, slot);
  h.eval("globalThis.job = start({}); record(next(job));");
  const std::string job = h.str("job");
  // The next is waiting when the host stops the job.
  CHECK(registered->wait());
  CHECK(h.async->inFlight() == 1);
  jobs.stop("p", jobPayload(job));
  CHECK(h.runUntil("log.length === 1") == RunExit::Done);
  h.eval("for (let i = 0; i < 3; ++i) record(next(job));");
  CHECK(h.runUntil("log.length === 4") == RunExit::Done);
  CHECK(h.logged() == std::vector<std::string>(4, "ok:" + stopped("Provider job was stopped")));
  CHECK(eventually([&] { return *returned == 1; }));
  CHECK(h.str("close(job)") == "null");
  h.eval("log = []; for (let i = 0; i < 3; ++i) record(next(job));");
  CHECK(h.runUntil("log.length === 3") == RunExit::Done);
  CHECK(h.logged() == std::vector<std::string>(3, "ok:" + stopped("Provider job was closed")));
  CHECK(h.str("close(job)") == "null");
  h.eval("record(next(job));");
  CHECK(h.runUntil("log.length === 4") == RunExit::Done);
  CHECK(h.logged().back() == "ok:" + stopped("Provider job was closed"));
}

// Gate: cancellation versus queued progress, parts and terminal results,
// end to end. A next is waiting and the worker produces one item.
//
// When the item reached the run's mailbox before the cancellation, it is
// dispatched first and settles the next (design section 5.3: a removed
// delivery wins its own race). The shared response check then sees the
// cancelled run and rejects it with an AbortError "Run cancelled", and the
// cancellation's own AbortError for that call finds no settler. When the
// cancellation comes first, the next rejects with an AbortError and the item
// produced after the guest's close is dropped. Either way the guest never
// sees the item, its finally closes the job, and nothing settles twice.
void cancellationVersusQueuedOutput(Suite& t) {
  for (const std::string kind : {"progress", "part", "done", "cancel-first"}) {
    struct Probe {
      Gate registered;
      Gate produce;
    };
    auto probe = std::make_shared<Probe>();
    gr::ThreadPoolExecutor io("io", 2);
    gr::ThreadPoolExecutor network("network", 2);
    ProviderJobs jobs(
        [probe](const ProviderJobs::Call& call) -> std::string {
          if (!probe->produce.wait()) throw std::runtime_error("never released");
          const auto kind = Json::parse(call.argsJson).at("kind").get<std::string>();
          if (kind == "progress" || kind == "cancel-first") {
            call.progress(R"({"n":1})");
            return blockUntilCancelled(call);
          }
          if (kind == "part") return Json(std::string(200, 'x')).dump();
          return R"({"ok":1})";
        },
        ProviderJobs::Limits{.partBytes = 16}, network);
    ContextOptions grants;
    auto slot = std::make_shared<RunSlot>();
    jobs.grant(grants, {"p"}, runSource(slot));
    wrapNext(grants, {}, [probe] { probe->registered.release(); });
    Harness h(std::move(grants), io, slot);
    h.eval("globalThis.job = start({ kind: '" + kind + "' });"
           "(async () => {"
           "  try { log.push('ok:' + await next(job)); }"
           "  catch (e) { log.push(e.name + ':' + e.message); }"
           "  finally { log.push('close:' + close(job)); }"
           "})();");
    const std::string job = h.str("job");
    CHECK(probe->registered.wait());
    const bool cancelFirst = kind == "cancel-first";
    if (!cancelFirst) {
      probe->produce.release();
      CHECK(eventually([&] { return h.async->resultsPending(); }));
    }
    CHECK(h.cancel->request(h.generation, Clock::now() + std::chrono::seconds(5)));
    CHECK(h.runUntil("log.length === 2") == RunExit::Done);
    if (cancelFirst) probe->produce.release();
    // Every result left in the mailbox, the duplicate stops included, finds
    // no settler.
    CHECK(h.runUntil("true") == RunExit::Done);
    while (h.async->dispatchOne()) {
    }
    h.engine->drainJobs();
    const auto log = h.logged();
    CHECK(log.size() == 2);
    const std::string first = cancelFirst ? "AbortError:The operation was aborted" : "AbortError:Run cancelled";
    CHECK(log == (std::vector<std::string>{first, "close:null"}));
    if (log.size() != 2 || log[0] != first) std::fprintf(stderr, "  %s: %s\n", kind.c_str(), Json(log).dump().c_str());
    auto after = nextLater(jobs, job);
    CHECK(after.wait_for(milliseconds(0)) == std::future_status::ready);
    const Outcome outcome = after.get();
    CHECK(outcome.kind == Kind::Stopped && outcome.text == "Provider job was closed");
    h.endRun();
    CHECK(h.tracker->waitIdle(Clock::now() + std::chrono::seconds(5)));
  }
}

// Gate: a second waiter is rejected through the transport, and the first
// one still waits until the job is closed.
void secondWaiterRejected(Suite& t) {
  gr::ThreadPoolExecutor io("io", 2);
  gr::ThreadPoolExecutor network("network", 2);
  ProviderJobs jobs(blockUntilCancelled, ProviderJobs::Limits{}, network);
  ContextOptions grants;
  auto slot = std::make_shared<RunSlot>();
  jobs.grant(grants, {"p"}, runSource(slot));
  Harness h(std::move(grants), io, slot);
  h.eval("globalThis.job = start({}); record(next(job)); record(next(job));");
  CHECK(h.runUntil("log.length === 1") == RunExit::Done);
  CHECK(h.logged() == std::vector<std::string>{"Error:Provider job already has a pending next()"});
  CHECK(h.async->inFlight() == 1);
  CHECK(h.str("close(job)") == "null");
  CHECK(h.runUntil("log.length === 2") == RunExit::Done);
  CHECK(h.logged().back() == "ok:" + stopped("Provider job was closed"));
}

// Gate: a waiting next whose run ended. The run's teardown settles it, the
// job keeps the completion as its waiter, and retiring the run completes
// that waiter into the closed mailbox and releases the run's tracker ticket.
void waiterOutlivesItsRun(Suite& t) {
  gr::ThreadPoolExecutor io("io", 2);
  gr::ThreadPoolExecutor network("network", 2);
  ProviderJobs jobs(blockUntilCancelled, ProviderJobs::Limits{}, network);
  ContextOptions grants;
  auto slot = std::make_shared<RunSlot>();
  jobs.grant(grants, {"p"}, runSource(slot));
  Harness h(std::move(grants), io, slot);
  h.eval("globalThis.job = start({}); record(next(job));");
  // The lane ran the grant, so the job holds the completion as its waiter.
  CHECK(eventually([&] { return io.running() == 0 && io.queued() == 0; }));
  const auto run = h.identity;
  h.endRun();
  // The waiter's completion holds a ticket of the ended run.
  CHECK(h.tracker->outstanding() > 0);
  jobs.retireRun(run);
  CHECK(h.tracker->waitIdle(Clock::now() + std::chrono::seconds(5)));
  CHECK(eventually([&] { return jobs.stats().alive == 0 && jobs.stats().executing == 0; }));
}

// Gate: closed-but-running maxJobs pressure on the network lane. Two closed
// jobs whose workers ignore the stop keep both lane threads and both slots,
// so a third start is refused until they return.
void closedRunningJobsHoldMaxJobs(Suite& t) {
  struct Probe {
    Gate release;
    std::atomic<int> entered{0}, sawCancel{0};
    Shared<std::thread::id> workerThread;
  };
  auto probe = std::make_shared<Probe>();
  gr::ThreadPoolExecutor io("io", 2);
  gr::ThreadPoolExecutor network("network", 4);
  ProviderJobs jobs(
      [probe](const ProviderJobs::Call& call) -> std::string {
        if (Json::parse(call.argsJson).value("mode", "") == "instant") return "null";
        probe->workerThread.set(std::this_thread::get_id());
        ++probe->entered;
        probe->release.wait();
        if (call.cancelled()) ++probe->sawCancel;
        return "null";
      },
      ProviderJobs::Limits{.maxJobs = 2}, network);
  ContextOptions grants;
  auto slot = std::make_shared<RunSlot>();
  jobs.grant(grants, {"p"}, runSource(slot));
  Harness h(std::move(grants), io, slot);
  h.eval("globalThis.a = start({}); globalThis.b = start({});");
  CHECK(eventually([&] { return probe->entered == 2; }));
  CHECK(network.running() == 2);
  CHECK(probe->workerThread.get() != std::this_thread::get_id());
  CHECK(h.str("close(a)") == "null");
  CHECK(h.str("close(b)") == "null");
  CHECK(h.attempt("start({ mode: 'instant' })") == "error: Too many provider jobs are running");
  CHECK(network.running() == 2);
  CHECK(jobs.stats().executing == 2);
  CHECK(jobs.stats().registered == 2);
  probe->release.release();
  CHECK(eventually([&] { return h.attempt("close(start({ mode: 'instant' }))") == "null"; }));
  CHECK(eventually([&] { return probe->sawCancel == 2; }));
  CHECK(eventually([&] { return network.running() == 0 && jobs.stats().executing == 0; }));
}

// Gate: the host stamps the run. A request naming another run is refused,
// a job or upload of another run is unknown, close leaves another run's job
// alone, and retiring one run leaves the other's jobs.
void hostStampedRun(Suite& t) {
  gr::ThreadPoolExecutor io("io", 2);
  gr::ThreadPoolExecutor network("network", 4);
  ProviderJobs jobs(blockUntilCancelled, ProviderJobs::Limits{}, network);
  ContextOptions grants;
  auto slot = std::make_shared<RunSlot>();
  jobs.grant(grants, {"p"}, runSource(slot));
  Harness h(std::move(grants), io, slot, "run-a");
  const gr::host::RunIdentity runA = h.identity;
  const std::string foreign = "error: Provider job requests cannot name another run";
  CHECK(h.attempt("start({}, { run: 'run-b' })") == foreign);
  CHECK(h.attempt("start({}, { run: '' })") == foreign);
  CHECK(h.attempt("put({ run: 'run-b', data: '{}' })") == foreign);
  CHECK(h.attempt("close(start({}, { run: 'run-a' }))") == "null");
  h.eval("globalThis.a = start({}); globalThis.u = put({ data: '{}' });");
  const std::string a = h.str("a");
  CHECK(jobs.stats().registered == 2);
  h.endRun();
  h.beginRun("run-b");
  const gr::host::RunIdentity runB = h.identity;
  CHECK(h.attempt("start(undefined, { upload: u })") == "error: Unknown provider upload: " + h.str("u"));
  CHECK(h.attempt("put({ upload: u, data: '{}' })") == "error: Unknown provider upload: " + h.str("u"));
  h.eval("record(next(a));");
  CHECK(h.runUntil("log.length === 1") == RunExit::Done);
  CHECK(h.logged() == std::vector<std::string>{"Error:Unknown provider job: " + a});
  CHECK(h.str("close(a)") == "null");
  // close() left run-a's job running: the host's next still waits on it.
  auto waiting = nextLater(jobs, a);
  CHECK(waiting.wait_for(milliseconds(50)) == std::future_status::timeout);
  jobs.retireRun(runB);
  CHECK(jobs.stats().registered == 2);
  h.endRun();
  CHECK(h.attempt("start({})") == "error: Provider jobs need a run in progress");
  jobs.retireRun(runA);
  CHECK(jobs.stats().registered == 0);
  CHECK(waiting.wait_for(milliseconds(5000)) == std::future_status::ready);
  const Outcome outcome = waiting.get();
  CHECK(outcome.kind == Kind::Stopped && outcome.text == "Provider job was closed");
  CHECK(eventually([&] { return jobs.stats().alive == 0; }));
}

// Item 3: a next invocation paused across run replacement cannot reach the
// next run's job, even when it names that job's id.
void pausedNextCannotReachNextRun(Suite& t) {
  struct Probe {
    Gate entered;
    Gate release;
    Gate returned;
    Gate produce;
  };
  auto probe = std::make_shared<Probe>();
  gr::ThreadPoolExecutor io("io", 2);
  gr::ThreadPoolExecutor network("network", 2);
  ProviderJobs jobs(
      [probe](const ProviderJobs::Call& call) -> std::string {
        if (!probe->produce.wait()) throw std::runtime_error("never released");
        call.progress(R"({"n":1})");
        return blockUntilCancelled(call);
      },
      ProviderJobs::Limits{}, network);
  ContextOptions grants;
  auto slot = std::make_shared<RunSlot>();
  jobs.grant(grants, {"p"}, runSource(slot));
  wrapNext(
      grants,
      [probe](const std::string& request) {
        if (!Json::parse(request).value("paused", false)) return;
        probe->entered.release();
        probe->release.wait();
      },
      [probe] { probe->returned.release(); });
  Harness h(std::move(grants), io, slot, "A");
  // Run A guesses the id run B's first job will get, and its next pauses on
  // the I/O lane.
  h.eval("record(next('j1', { paused: true }));");
  CHECK(probe->entered.wait());
  h.endRun();
  h.beginRun("B");
  CHECK(h.str("globalThis.b = start({})") == "j1");
  probe->release.release();
  CHECK(probe->returned.wait());
  // Run B's own next is the job's only waiter, and gets its item.
  h.eval("record(next(b));");
  probe->produce.release();
  CHECK(h.runUntil("log.length === 1") == RunExit::Done);
  const auto log = h.logged();
  CHECK(log.size() == 1 && log[0].starts_with("ok:") && log[0].find("progress") != std::string::npos);
  if (!log.empty()) std::fprintf(stderr, "  run B saw: %s\n", log[0].c_str());
  CHECK(h.str("close(b)") == "null");
}

// Item 4 at the transport: two runs with the same public job id, on two
// engines sharing one ProviderJobs, reach only their own jobs, and retiring
// one leaves the other's jobs.
void sameJobIdIsolation(Suite& t) {
  gr::ThreadPoolExecutor io("io", 2);
  gr::ThreadPoolExecutor network("network", 4);
  ProviderJobs jobs(blockUntilCancelled, ProviderJobs::Limits{}, network);
  ContextOptions grantsOne, grantsTwo;
  auto slotOne = std::make_shared<RunSlot>();
  auto slotTwo = std::make_shared<RunSlot>();
  jobs.grant(grantsOne, {"p"}, runSource(slotOne));
  jobs.grant(grantsTwo, {"p"}, runSource(slotTwo));
  Harness one(std::move(grantsOne), io, slotOne, "job-1");
  Harness two(std::move(grantsTwo), io, slotTwo, "job-1");
  one.eval("globalThis.a = start({}); globalThis.u = put({ data: '{}' });");
  const std::string a = one.str("a");
  const std::string u = one.str("u");
  CHECK(two.attempt("start(undefined, { upload: '" + u + "' })") == "error: Unknown provider upload: " + u);
  two.eval("record(next('" + a + "'));");
  CHECK(two.runUntil("log.length === 1") == RunExit::Done);
  CHECK(two.logged() == std::vector<std::string>{"Error:Unknown provider job: " + a});
  CHECK(two.str("close('" + a + "')") == "null");
  auto waiting = nextLater(jobs, a);
  CHECK(waiting.wait_for(milliseconds(50)) == std::future_status::timeout);
  jobs.retireRun(two.identity);
  CHECK(jobs.stats().registered == 1);
  CHECK(waiting.wait_for(milliseconds(50)) == std::future_status::timeout);
  jobs.retireRun(one.identity);
  CHECK(jobs.stats().registered == 0);
  CHECK(waiting.wait_for(milliseconds(5000)) == std::future_status::ready);
  two.endRun();
  one.endRun();
}

// --- the network lane -----------------------------------------------------------

// Gate: timed shutdown with a worker that ignores stop. The destructor stops
// the job and returns at once, the lane's shutdown reports TimedOut by its
// deadline instead of joining the worker, and a retry completes once the
// worker returns.
void timedShutdownWithStubbornWorker(Suite& t) {
  struct Probe {
    Gate entered;
    Gate release;
    std::atomic<bool> sawStop{false};
  };
  auto probe = std::make_shared<Probe>();
  gr::ThreadPoolExecutor network("network", 2);
  auto jobs = std::make_unique<ProviderJobs>(
      [probe](const ProviderJobs::Call& call) -> std::string {
        probe->entered.release();
        probe->release.wait(milliseconds(60000));
        probe->sawStop = call.stop.stop_requested() && call.cancelled();
        return "null";
      },
      ProviderJobs::Limits{}, network);
  ContextOptions grants;
  jobs->grant(grants, {"p"}, fixedRun("run"));
  grants.operations.at("provider:p:jobs:start")(R"({"method":"callEndpoint","args":{}})");
  CHECK(probe->entered.wait());
  auto began = Clock::now();
  jobs.reset();
  CHECK(Clock::now() - began < std::chrono::seconds(1));
  began = Clock::now();
  const auto deadline = began + milliseconds(200);
  CHECK(network.shutdown(deadline) == gr::HostShutdownStatus::TimedOut);
  CHECK(Clock::now() >= deadline);
  CHECK(Clock::now() - began < std::chrono::seconds(2));
  CHECK(network.liveThreads() > 0);
  probe->release.release();
  CHECK(network.awaitShutdown(Clock::now() + std::chrono::seconds(10)) == gr::HostShutdownStatus::Complete);
  CHECK(probe->sawStop);
  CHECK(network.liveThreads() == 0);
}

// Item 5: ProviderJobs borrows its lane and never destroys it. Its
// destruction returns at once while a worker ignores the stop, the lane its
// owner keeps goes on running that worker, and the lane's own timed shutdown
// is what bounds the wait. (Before, the registry could hold the last
// reference, and destroying it ran the lane's unbounded join.)
void providerJobsNeverDestroysItsLane(Suite& t) {
  struct Probe {
    Gate entered;
    Gate release;
    std::atomic<bool> returned{false};
  };
  auto probe = std::make_shared<Probe>();
  auto network = std::make_unique<gr::ThreadPoolExecutor>("network", 2);
  auto jobs = std::make_unique<ProviderJobs>(
      [probe](const ProviderJobs::Call&) -> std::string {
        probe->entered.release();
        probe->release.wait(milliseconds(5000));
        probe->returned = true;
        return "null";
      },
      ProviderJobs::Limits{}, *network);
  ContextOptions grants;
  jobs->grant(grants, {"p"}, fixedRun("run"));
  grants.operations.at("provider:p:jobs:start")(R"({"method":"callEndpoint","args":{}})");
  CHECK(probe->entered.wait());
  const auto began = Clock::now();
  jobs.reset();
  grants = {};
  CHECK(Clock::now() - began < std::chrono::seconds(1));
  CHECK(!probe->returned);
  CHECK(network->running() == 1);
  CHECK(network->shutdown(Clock::now() + milliseconds(100)) == gr::HostShutdownStatus::TimedOut);
  probe->release.release();
  CHECK(network->awaitShutdown(Clock::now() + std::chrono::seconds(10)) == gr::HostShutdownStatus::Complete);
  CHECK(probe->returned);
  network.reset();
}

// A job whose input destructor blocks until released, to keep the process
// disposer busy.
//
// Thread affinity: the thread that destroys it. The gates lock themselves.
class DisposerBlocker final : public nodetool::jobs::NativeJob {
public:
  struct Gates {
    Gate entered;
    Gate release;
  };
  explicit DisposerBlocker(std::shared_ptr<Gates> gates) : gates_(std::move(gates)) {}
  ~DisposerBlocker() override {
    gates_->entered.release();
    gates_->release.wait(milliseconds(10000));
  }
  nodetool::jobs::JobOutcome run(std::stop_token) override { return nodetool::jobs::JobOutcome::value(nullptr); }

private:
  std::shared_ptr<Gates> gates_;
};

// Gate: a provider job its lane refuses fails at once, waking its waiter,
// even while the process disposer is blocked and has not destroyed it yet.
void refusedProviderJobFailsBeforeDisposal(Suite& t) {
  // Blocks the process disposer with a refused job's blocking input.
  auto gates = std::make_shared<DisposerBlocker::Gates>();
  gr::ThreadPoolExecutor blocked("blocked", 1, [](bool reaper) { return !reaper; });
  blocked.submit(nodetool::jobs::SubmittedJob(0, std::make_unique<DisposerBlocker>(gates), nullptr, {}, {}));
  CHECK(gates->entered.wait(milliseconds(5000)));

  auto ran = std::make_shared<std::atomic<int>>(0);
  gr::ThreadPoolExecutor network("network", 1, [](bool reaper) { return !reaper; });
  {
    ProviderJobs jobs(
        [ran](const ProviderJobs::Call&) -> std::string {
          ++*ran;
          return "null";
        },
        ProviderJobs::Limits{}, network);
    ContextOptions grants;
    jobs.grant(grants, {"p"}, fixedRun("run"));
    const auto id = Json::parse(grants.operations.at("provider:p:jobs:start")(
                                    R"({"method":"callEndpoint","args":{}})"))
                        .at("job")
                        .get<std::string>();
    auto outcome = nextLater(jobs, id);
    const bool reported = outcome.wait_for(milliseconds(1000)) == std::future_status::ready;
    CHECK(reported);
    if (reported) {
      const Outcome got = outcome.get();
      CHECK(got.kind == Kind::Error);
      CHECK(got.text == "cannot start the reaper thread for the network lane");
      if (got.kind != Kind::Error) std::fprintf(stderr, "  outcome: %s\n", got.text.c_str());
    }
    CHECK(*ran == 0);
    gates->release.release();
    CHECK(eventually([&] { return jobs.stats().executing == 0 && jobs.stats().alive == 1; }));
  }
}

// Gate: a worker's stop callback runs on the lane's reaper, never on the
// thread that closes the job or destroys ProviderJobs. One that blocks
// delays neither.
void stopCallbacksRunOnReaper(Suite& t) {
  struct Probe {
    Gate entered;
    Gate callbackEntered;
    Gate gate;
    Shared<std::thread::id> callbackThread;
    std::atomic<int> returned{0};
  };
  auto probe = std::make_shared<Probe>();
  gr::ThreadPoolExecutor network("network", 2);
  auto jobs = std::make_unique<ProviderJobs>(
      [probe](const ProviderJobs::Call& call) -> std::string {
        std::weak_ptr<Probe> weak = probe;
        std::stop_callback onStop(call.stop, [weak] {
          auto p = weak.lock();
          if (!p) return;
          p->callbackThread.set(std::this_thread::get_id());
          p->callbackEntered.release();
          p->gate.wait(milliseconds(60000));
        });
        probe->entered.release();
        while (!call.stop.stop_requested()) std::this_thread::sleep_for(milliseconds(1));
        ++probe->returned;
        return "null";
      },
      ProviderJobs::Limits{}, network);
  ContextOptions grants;
  jobs->grant(grants, {"p"}, fixedRun("run"));
  const auto started = Json::parse(grants.operations.at("provider:p:jobs:start")(
      R"({"method":"callEndpoint","args":{}})"));
  CHECK(probe->entered.wait());
  auto began = Clock::now();
  CHECK(grants.operations.at("provider:p:jobs:close")(started.dump()) == "null");
  CHECK(probe->callbackEntered.wait(milliseconds(10000)));
  CHECK(probe->callbackThread.get() != std::this_thread::get_id());
  jobs.reset();
  CHECK(Clock::now() - began < std::chrono::seconds(2));
  CHECK(!probe->gate.isOpen());
  probe->gate.release();
  CHECK(eventually([&] { return probe->returned == 1; }));
}

// Attaching never throws, so a run or registry that records a lane before
// attaching cannot detach an attachment that did not happen.
static_assert(noexcept(std::declval<nodetool::jobs::JobExecutor&>().attach()));
static_assert(noexcept(std::declval<nodetool::jobs::JobExecutor&>().detach()));

// Runs `body` in a child process with its stderr captured in `err`. Returns
// the signal that ended the child, 0 when it exited with status 0, or -1.
int inChild(const std::function<void()>& body, std::string& err) {
  int fds[2];
  if (pipe(fds) != 0) return -1;
  std::fflush(stderr);
  const pid_t pid = fork();
  if (pid == 0) {
    close(fds[0]);
    dup2(fds[1], 2);
    // The expected aborts leave no core dump.
    const rlimit none{0, 0};
    setrlimit(RLIMIT_CORE, &none);
    body();
    std::_Exit(0);
  }
  close(fds[1]);
  char buffer[512];
  for (ssize_t n; (n = read(fds[0], buffer, sizeof buffer)) > 0;) err.append(buffer, static_cast<size_t>(n));
  close(fds[0]);
  int status = 0;
  waitpid(pid, &status, 0);
  if (WIFSIGNALED(status)) return WTERMSIG(status);
  return WIFEXITED(status) && WEXITSTATUS(status) == 0 ? 0 : -1;
}

// Gate: destroying a lane that a provider job registry borrows, or that a
// run still uses, aborts with a message in every build instead of leaving
// a dangling pointer behind.
void lanesAbortWhenDestroyedInUse(Suite& t) {
  // Started here, so a child's lane finds the process disposer and starts
  // no thread of its own.
  gr::processJobDisposer();
  std::string registryErr;
  const int registry = inChild(
      [] {
        auto lane = std::make_unique<gr::ThreadPoolExecutor>("network", 1);
        auto jobs = std::make_unique<ProviderJobs>([](const ProviderJobs::Call&) { return std::string("null"); },
                                                   ProviderJobs::Limits{}, *lane);
        lane.reset();
        jobs.reset();
      },
      registryErr);
  CHECK(registry == SIGABRT);
  CHECK(registryErr.find("network lane was destroyed while 1 run or provider job registry still uses it") !=
        std::string::npos);
  if (registry != SIGABRT) std::fprintf(stderr, "  registry case ended with %d: %s\n", registry, registryErr.c_str());

  std::string runErr;
  const int run = inChild(
      [] {
        // A lane that shut down refuses the run's job without starting a
        // thread (a forked child must not start one under ThreadSanitizer),
        // and the run still registers with it.
        auto lane = std::make_unique<gr::ThreadPoolExecutor>("io", 1);
        lane->shutdown(Clock::now());
        auto engine = js::createQuickJsEngine();
        AsyncRun async(*engine, Loop::current(), std::make_shared<RunnerTracker>(), 1, *lane);
        async.submit(*lane, nodetool::jobs::makeJob([](std::stop_token) {
          return nodetool::jobs::JobOutcome::value(nullptr);
        }),
                     {});
        lane.reset();
      },
      runErr);
  CHECK(run == SIGABRT);
  CHECK(runErr.find("io lane was destroyed while 1 run or provider job registry still uses it") !=
        std::string::npos);
  if (run != SIGABRT) std::fprintf(stderr, "  run case ended with %d: %s\n", run, runErr.c_str());
}

// --- the public runner ----------------------------------------------------------

constexpr const char* kPngBase64 =
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==";

std::string minimaxGraph() {
  auto node = [](const char* id, const char* type, Json data) {
    return Json{{"id", id}, {"type", type}, {"data", std::move(data)}};
  };
  Json graph = {
      {"nodes",
       {node("image", "minimax.TextToImage", {{"prompt", "a lighthouse"}}),
        node("out", "nodetool.output.Output", {{"name", "image"}})}},
      {"edges",
       {{{"id", "e1"}, {"source", "image"}, {"sourceHandle", "output"}, {"target", "out"},
         {"targetHandle", "value"}}}}};
  return graph.dump();
}

// Collects one job's messages. The handler holds the shared state, so it
// stays valid however long the runner keeps the handler.
//
// Thread affinity: thread-safe, `State::mutex` guards every member of State.
class Collector {
public:
  gr::GraphRunner::MessageHandler handler() const {
    return [state = state_](const std::string& text, bool last) {
      std::lock_guard lock(state->mutex);
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
  std::string dump() const {
    std::lock_guard lock(state_->mutex);
    return Json(state_->messages).dump();
  }

private:
  struct State {
    std::mutex mutex;
    std::condition_variable changed;
    std::vector<Json> messages;
    bool finished = false;
  };
  // Shared with every handler the runner holds.
  std::shared_ptr<State> state_ = std::make_shared<State>();
};

// What the runner tests' workers record.
//
// Thread affinity: thread-safe. The counters are atomic, the Shared members
// lock themselves.
struct RunnerProbe {
  std::atomic<int> calls{0};
  std::atomic<int> sawCancel{0};
  Shared<std::vector<std::string>> runs;
  // Registered jobs the worker saw while it ran, for the run's tombstone.
  std::atomic<size_t> registeredDuringRun{0};
  // Weak, so the worker that ProviderJobs owns does not keep it alive.
  Shared<std::weak_ptr<ProviderJobs>> jobs;
  Gate entered;
};

std::string minimaxReply() {
  return Json{{"output", {{"data", {{"image_base64", {kPngBase64}}}}}}}.dump();
}

// Gate: the runner stamps each job with the run's job id and retires the run
// after its terminal update, so the registry's tombstones return to zero
// after every one of many runs.
void runnerRetiresEachRun(Suite& t) {
  if (t.bundle().empty()) return;
  auto probe = std::make_shared<RunnerProbe>();
  auto jobs = std::make_shared<ProviderJobs>([probe](const ProviderJobs::Call& call) -> std::string {
    ++probe->calls;
    auto runs = probe->runs.get();
    runs.push_back(call.run);
    probe->runs.set(std::move(runs));
    if (auto owner = probe->jobs.get().lock()) probe->registeredDuringRun = owner->stats().registered;
    call.progress(R"({"message":"running"})");
    return minimaxReply();
  });
  probe->jobs.set(jobs);
  gr::HostOptions options;
  options.providerJobs = jobs;
  options.providerJobProviders = {"minimax"};
  options.secrets["MINIMAX_API_KEY"] = "test-key";
  // The output node saves the image as an asset.
  options.context.operations["model:createAsset"] = [](const std::string&) {
    return Json{{"id", "0123456789abcdef0123456789abcdef"}}.dump();
  };
  gr::GraphRunner runner(t.bundle(), options);
  CHECK(runner.waitUntilLoaded(60000));
  const std::string reason = runner.unsupportedReason(minimaxGraph());
  if (!reason.empty()) std::fprintf(stderr, "  unsupported: %s\n", reason.c_str());
  CHECK(reason.empty());
  constexpr int kRuns = 12;
  std::vector<std::string> expected;
  for (int i = 0; i < kRuns; ++i) {
    const std::string id = "job-" + std::to_string(i);
    expected.push_back(id);
    const Collector c;
    runner.submit(id, "wf", minimaxGraph(), "", c.handler());
    CHECK(c.waitFinished());
    const std::string status = c.status();
    if (status != "completed") std::fprintf(stderr, "  %s: %s\n", id.c_str(), c.dump().c_str());
    CHECK(status == "completed");
    CHECK(probe->registeredDuringRun == 1);
    // Retirement follows the terminal update the handler just received.
    CHECK(eventually([&] { return jobs->stats().registered == 0; }));
  }
  CHECK(probe->calls == kRuns);
  CHECK(probe->runs.get() == expected);
  CHECK(eventually([&] { return jobs->stats().alive == 0 && jobs->stats().executing == 0; }));
}

// Gate: cancelling a run whose node waits in next(). The pending next
// rejects with an AbortError at the cancellation, the guest's finally closes
// the job, the worker sees the stop, and the run's tombstone goes with the
// run.
void runnerCancelsWaitingNext(Suite& t) {
  if (t.bundle().empty()) return;
  auto probe = std::make_shared<RunnerProbe>();
  auto jobs = std::make_shared<ProviderJobs>([probe](const ProviderJobs::Call& call) -> std::string {
    ++probe->calls;
    probe->entered.release();
    while (!call.cancelled()) std::this_thread::sleep_for(milliseconds(2));
    ++probe->sawCancel;
    throw std::runtime_error("cancelled");
  });
  gr::HostOptions options;
  options.providerJobs = jobs;
  options.providerJobProviders = {"minimax"};
  options.secrets["MINIMAX_API_KEY"] = "test-key";
  gr::GraphRunner runner(t.bundle(), options);
  CHECK(runner.waitUntilLoaded(60000));
  const Collector c;
  runner.submit("job-cancel", "wf", minimaxGraph(), "", c.handler());
  CHECK(probe->entered.wait());
  CHECK(runner.cancel("job-cancel"));
  CHECK(c.waitFinished(10000));
  CHECK(c.status() == "cancelled");
  CHECK(eventually([&] { return probe->sawCancel == 1; }));
  CHECK(eventually([&] { return jobs->stats().registered == 0 && jobs->stats().alive == 0; }));
}

// The fixture's text-to-image graph on provider `provider`.
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

// Gate: the provider job grants, as the runner installs them, are absent in
// fake mode. The context the runner's grant helper builds is installed into
// an engine and probed with has() and isAsync() for all four operations.
// Without fake providers the same probe finds them, so it can see a grant.
void fakeModeExposesNoJobGrants(Suite& t) {
  auto jobs = std::make_shared<ProviderJobs>([](const ProviderJobs::Call&) { return std::string("null"); });
  for (const bool fake : {true, false}) {
    gr::HostOptions options;
    options.fakeProviders = fake;
    options.providerJobs = jobs;
    options.providerJobProviders = {"minimax"};
    gr::host::grantProviderJobs(options, options.context, fixedRun("run"));
    auto engine = js::createQuickJsEngine();
    js::Value host = engine->object();
    for (const auto& capability : gr::host::capabilities()) {
      const std::string name = capability.name;
      if (name != "context" && name != "providers") continue;
      js::Value object = engine->object();
      capability.install(*engine, object, options);
      engine->set(host, capability.name, object);
    }
    engine->set(engine->global(), "__host", host);
    auto probe = [&](const std::string& expression) {
      return engine->toString(engine->evaluateScript(expression, "probe.js"));
    };
    for (const std::string op : {"start", "put", "next", "close"}) {
      const std::string quoted = Json("provider:minimax:jobs:" + op).dump();
      const std::string has = probe("String(__host.context.has(" + quoted + "))");
      const std::string isAsync = probe("String(__host.context.isAsync(" + quoted + "))");
      if (fake) {
        CHECK(has == "false");
        CHECK(isAsync == "false");
        if (has != "false" || isAsync != "false") std::fprintf(stderr, "  fake mode exposes %s\n", op.c_str());
      } else {
        CHECK(has == "true");
        CHECK(isAsync == (op == "next" ? "true" : "false"));
      }
    }
  }
}

// Gate: fake providers grant no provider jobs, through the public runner. A
// fake-mode graph completes, and a MiniMax node in fake mode reaches the
// fake provider, which has no endpoint calls, instead of a job.
void runnerFakeModeGrantsNoJobs(Suite& t) {
  if (t.bundle().empty()) return;
  auto probe = std::make_shared<RunnerProbe>();
  auto jobs = std::make_shared<ProviderJobs>([probe](const ProviderJobs::Call&) -> std::string {
    ++probe->calls;
    return minimaxReply();
  });
  gr::HostOptions options;
  options.fakeProviders = true;
  options.providerJobs = jobs;
  options.providerJobProviders = {"minimax"};
  options.context.operations["model:createAsset"] = [](const std::string&) {
    return Json{{"id", "0123456789abcdef0123456789abcdef"}}.dump();
  };
  gr::GraphRunner runner(t.bundle(), options);
  CHECK(runner.waitUntilLoaded(60000));
  {
    const Collector c;
    runner.submit("job-fake-image", "wf", imageGraph("fixture"), "", c.handler());
    CHECK(c.waitFinished());
    const std::string status = c.status();
    if (status != "completed") std::fprintf(stderr, "  fake image: %s\n", c.dump().c_str());
    CHECK(status == "completed");
  }
  {
    const Collector c;
    runner.submit("job-fake", "wf", minimaxGraph(), "", c.handler());
    CHECK(c.waitFinished());
    CHECK(c.dump().find("minimax does not support endpoint calls") != std::string::npos);
  }
  CHECK(probe->calls == 0);
  CHECK(jobs->stats().registered == 0);
}

// Gate: two runners share one ProviderJobs and run the same public job id
// at once. The second run's retirement leaves the first run's job running,
// and the first run then completes.
void runnersShareRegistryWithSameJobId(Suite& t) {
  if (t.bundle().empty()) return;
  struct Probe {
    std::atomic<int> calls{0};
    std::atomic<int> sawCancel{0};
    Gate entered;
    Gate release;
  };
  auto probe = std::make_shared<Probe>();
  auto jobs = std::make_shared<ProviderJobs>([probe](const ProviderJobs::Call& call) -> std::string {
    if (++probe->calls == 1) {
      probe->entered.release();
      while (!probe->release.isOpen()) {
        if (call.cancelled()) {
          ++probe->sawCancel;
          throw std::runtime_error("cancelled");
        }
        std::this_thread::sleep_for(milliseconds(2));
      }
    }
    return minimaxReply();
  });
  gr::HostOptions options;
  options.providerJobs = jobs;
  options.providerJobProviders = {"minimax"};
  options.secrets["MINIMAX_API_KEY"] = "test-key";
  options.context.operations["model:createAsset"] = [](const std::string&) {
    return Json{{"id", "0123456789abcdef0123456789abcdef"}}.dump();
  };
  gr::GraphRunner first(t.bundle(), options);
  gr::GraphRunner second(t.bundle(), options);
  CHECK(first.waitUntilLoaded(60000));
  CHECK(second.waitUntilLoaded(60000));
  const Collector a;
  const Collector b;
  first.submit("job-1", "wf", minimaxGraph(), "", a.handler());
  CHECK(probe->entered.wait());
  second.submit("job-1", "wf", minimaxGraph(), "", b.handler());
  CHECK(b.waitFinished());
  CHECK(b.status() == "completed");
  // The second run's retirement follows its terminal update. It must leave
  // the first run's job, which has the same public job id.
  CHECK(eventually([&] { return jobs->stats().registered == 1; }));
  std::this_thread::sleep_for(milliseconds(100));
  CHECK(jobs->stats().registered == 1);
  CHECK(probe->sawCancel == 0);
  probe->release.release();
  CHECK(a.waitFinished());
  CHECK(a.status() == "completed");
  CHECK(eventually([&] { return jobs->stats().registered == 0 && jobs->stats().alive == 0; }));
}

}  // namespace

int main(int argc, char** argv) {
  Suite suite(argc > 1 ? argv[1] : "");
  const std::vector<std::pair<const char*, void (*)(Suite&)>> tests = {
      {"registrationRaceThroughTransport", registrationRaceThroughTransport},
      {"repeatedNextAfterStopAndClose", repeatedNextAfterStopAndClose},
      {"cancellationVersusQueuedOutput", cancellationVersusQueuedOutput},
      {"secondWaiterRejected", secondWaiterRejected},
      {"waiterOutlivesItsRun", waiterOutlivesItsRun},
      {"closedRunningJobsHoldMaxJobs", closedRunningJobsHoldMaxJobs},
      {"hostStampedRun", hostStampedRun},
      {"pausedNextCannotReachNextRun", pausedNextCannotReachNextRun},
      {"sameJobIdIsolation", sameJobIdIsolation},
      {"timedShutdownWithStubbornWorker", timedShutdownWithStubbornWorker},
      {"stopCallbacksRunOnReaper", stopCallbacksRunOnReaper},
      {"refusedProviderJobFailsBeforeDisposal", refusedProviderJobFailsBeforeDisposal},
      {"lanesAbortWhenDestroyedInUse", lanesAbortWhenDestroyedInUse},
      {"providerJobsNeverDestroysItsLane", providerJobsNeverDestroysItsLane},
      {"runnerRetiresEachRun", runnerRetiresEachRun},
      {"runnerCancelsWaitingNext", runnerCancelsWaitingNext},
      {"fakeModeExposesNoJobGrants", fakeModeExposesNoJobGrants},
      {"runnerFakeModeGrantsNoJobs", runnerFakeModeGrantsNoJobs},
      {"runnersShareRegistryWithSameJobId", runnersShareRegistryWithSameJobId},
  };
  const char* only = std::getenv("GR_PROVIDER_NEXT_ONLY");
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
