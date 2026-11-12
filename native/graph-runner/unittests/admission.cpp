// Step 7 of docs/plans/graph-runner-async-host.md: the admission ledger and
// the JavaScript external-byte ledger (section 4.7).
//
// The test host functions below submit native jobs as converted host
// functions do: they find the bound run through RunBinding, reserve snapshot
// bytes before copying, and hand the job and its reservation to the run.
#include "host/capabilities.h"
#include "js/engine.h"
#include "kernel/async_jobs.h"
#include "kernel/cancel_state.h"
#include "kernel/host_lanes.h"
#include "kernel/job_inputs.h"
#include "kernel/run_control.h"
#include "kernel/task.h"
#include "nodetool/graph_runner.h"
#include "nodetool/jobs/admission.h"
#include "nodetool/provider_jobs.h"

#include <nlohmann/json.hpp>

#include <atomic>
#include <barrier>
#include <chrono>
#include <condition_variable>
#include <cstdint>
#include <cstdio>
#include <cstdlib>
#include <deque>
#include <functional>
#include <future>
#include <memory>
#include <mutex>
#include <optional>
#include <stdexcept>
#include <stop_token>
#include <string>
#include <thread>
#include <vector>

namespace {

// native-rules #14: file-scope mutable test counters
// Atomic: lane threads and stress threads call CHECK.
std::atomic<int> failures{0};
std::atomic<int> checks{0};

#define CHECK(cond)                                                                 \
  do {                                                                              \
    ++checks;                                                                       \
    if (!(cond)) {                                                                  \
      ++failures;                                                                   \
      std::fprintf(stderr, "%s:%d: CHECK failed: %s\n", __FILE__, __LINE__, #cond); \
    }                                                                               \
  } while (0)

using gr::AsyncRun;
using gr::CancelState;
using gr::Loop;
using gr::RunExit;
using gr::ThreadPoolExecutor;
using nodetool::jobs::AdmissionError;
using nodetool::jobs::AdmissionLedger;
using nodetool::jobs::JobCost;
using nodetool::jobs::JobExecutor;
using nodetool::jobs::JobOutcome;
using nodetool::jobs::JobPayload;
using nodetool::jobs::LedgerUsage;
using nodetool::jobs::ProcessLimits;
using nodetool::jobs::Reservation;
using nodetool::jobs::RunAccount;
using nodetool::jobs::RunnerAccount;
using nodetool::jobs::RunnerLimits;
using nodetool::jobs::RunnerTracker;
using nodetool::jobs::kKiB;
using nodetool::jobs::kMiB;
namespace js = gr::js;
using Clock = std::chrono::steady_clock;
using std::chrono::milliseconds;
using Json = nlohmann::json;

// A deadlock fails the process instead of waiting for ctest. A ledger lock
// held while a lane, mailbox or ledger lock is taken would hang here.
// native-rules #14: file-scope mutable watchdog gate
std::atomic<Clock::rep> watchdogDeadline{0};
// native-rules #14: file-scope mutable current-test name
std::atomic<const char*> currentTest{""};

void startWatchdog() {
  // native-rules #13: detached watchdog thread outlives every test object
  std::thread([] {
    for (;;) {
      std::this_thread::sleep_for(milliseconds(50));
      const Clock::rep deadline = watchdogDeadline.load();
      if (deadline != 0 && Clock::now().time_since_epoch().count() > deadline) {
        std::fprintf(stderr, "TIMEOUT %s\n", currentTest.load());
        std::_Exit(1);
      }
    }
  }).detach();
}

// Polls `ready` until it holds or five seconds pass.
template <class F>
bool eventually(F ready) {
  const auto until = Clock::now() + std::chrono::seconds(5);
  while (!ready()) {
    if (Clock::now() > until) return false;
    std::this_thread::sleep_for(milliseconds(1));
  }
  return true;
}

bool zero(const LedgerUsage& u) {
  return u.bytes == 0 && u.operations == 0 && u.deferredBytes == 0 && u.deferredEntries == 0 &&
         u.javaScriptBytes == 0;
}

template <class F>
std::string thrown(F f) {
  try {
    f();
  } catch (const std::exception& e) {
    return e.what();
  }
  return "";
}

bool contains(const std::string& text, const std::string& part) { return text.find(part) != std::string::npos; }

// A gate jobs wait on.
//
// Thread affinity: thread-safe, `mutex` guards `open`.
struct Gate {
  std::mutex mutex;
  std::condition_variable_any cv;
  bool open = false;

  void release() {
    {
      std::lock_guard lock(mutex);
      open = true;
    }
    cv.notify_all();
  }
  void wait() {
    std::unique_lock lock(mutex);
    cv.wait(lock, [this] { return open; });
  }
  void wait(std::stop_token stop) {
    std::unique_lock lock(mutex);
    cv.wait(lock, stop, [this] { return open; });
  }
};

// What the test jobs saw.
//
// Thread affinity: thread-safe. Counters are atomic, `mutex` guards the
// rest.
struct Probe {
  std::atomic<int> runs{0};
  std::atomic<int> alive{0};
  std::atomic<int> costCalls{0};
  std::mutex mutex;
  std::vector<std::string> seen;
  // Usage read by a converter right after it handed bytes to JavaScript.
  LedgerUsage runAfterConversion;
  LedgerUsage runnerAfterConversion;
  void see(std::string what) {
    std::lock_guard lock(mutex);
    seen.push_back(std::move(what));
  }
  std::vector<std::string> sawAll() {
    std::lock_guard lock(mutex);
    return seen;
  }
};

struct TextPayload final : JobPayload {
  explicit TextPayload(std::string t) : text(std::move(t)) {}
  std::string text;
};

struct BytesPayload final : JobPayload {
  explicit BytesPayload(std::vector<uint8_t> b) : bytes(std::move(b)) {}
  std::vector<uint8_t> bytes;
};

std::string listed(const std::vector<uint8_t>& bytes) {
  std::string out;
  for (uint8_t b : bytes) out += (out.empty() ? "" : ",") + std::to_string(b);
  return out;
}

// A test job: holds a snapshot, reports a cost, may wait on a gate, and
// returns text or bytes.
//
// Thread affinity: the executor thread that runs it, then the thread that
// destroys it.
class TestJob final : public nodetool::jobs::NativeJob {
public:
  struct Spec {
    std::vector<uint8_t> snapshot;
    std::string text;
    uint64_t output = 0;
    uint64_t width = 0;
    uint64_t height = 0;
    size_t resultBytes = 0;
    // Shared with the test, which opens it.
    std::shared_ptr<Gate> gate;
    bool ignoreStop = false;
    // Replaces the cost from the snapshot. Called with the call's number.
    std::function<JobCost(int)> cost;
  };
  // `probe` is shared with the test, which reads it while the job runs on a
  // lane thread.
  TestJob(Spec spec, std::shared_ptr<Probe> probe) : spec_(std::move(spec)), probe_(std::move(probe)) {
    ++probe_->alive;
  }
  ~TestJob() override { --probe_->alive; }

  JobCost cost() const override {
    const int call = ++probe_->costCalls;
    if (spec_.cost) return spec_.cost(call);
    JobCost cost{spec_.snapshot.size(), spec_.output, 0};
    if (spec_.width || spec_.height)
      cost.outputBytes = nodetool::jobs::checkedMul(nodetool::jobs::checkedMul(spec_.width, spec_.height), 4);
    return cost;
  }

  JobOutcome run(std::stop_token stop) override {
    ++probe_->runs;
    if (spec_.gate) {
      if (spec_.ignoreStop) {
        spec_.gate->wait();
      } else {
        spec_.gate->wait(stop);
      }
    }
    const std::string text = spec_.text.empty() ? listed(spec_.snapshot) : spec_.text;
    probe_->see(text);
    if (spec_.resultBytes > 0) {
      return JobOutcome::value(std::make_unique<BytesPayload>(std::vector<uint8_t>(spec_.resultBytes, 7)));
    }
    return JobOutcome::value(std::make_unique<TextPayload>(text));
  }

private:
  Spec spec_;
  std::shared_ptr<Probe> probe_;
};

js::Value textOf(js::Engine& e, JobPayload* payload) { return e.string(static_cast<TextPayload*>(payload)->text); }

double number(js::Engine& e, const js::Value& object, const char* name) {
  js::Value v = e.get(object, name);
  return e.isUndefined(v) ? 0 : e.toNumber(v);
}

// One engine with test host functions that submit to the bound run:
//   nativeSnapshot(bytes)  reserves, copies and submits; resolves with the
//                          bytes the job saw.
//   nativeJob(options)     {text, output, width, height, gated: 1|2,
//                          ignoreStop, cancellable, result, adopt, copy}
//   nativeRevalidate(kind) a deferred start whose second cost() is larger
//                          ('grow') or overflows ('overflow').
struct Fixture {
  std::unique_ptr<js::Engine> engine = js::createQuickJsEngine();
  // Shared with every job, which may outlive the test function on a lane.
  std::shared_ptr<Probe> probe = std::make_shared<Probe>();
  // Shared with the jobs that wait on them.
  std::shared_ptr<Gate> gate = std::make_shared<Gate>();
  std::shared_ptr<Gate> gate2 = std::make_shared<Gate>();

  Fixture() {
    js::Engine& e = *engine;
    auto binding = gr::RunBinding::of(e);
    auto probe = this->probe;
    auto gate = this->gate;
    auto gate2 = this->gate2;
    bind("nativeSnapshot", [binding, probe](js::Engine& en, const std::vector<js::Value>& a) {
      AsyncRun& run = *binding->run();
      Reservation reservation = run.reserve();
      TestJob::Spec spec;
      spec.snapshot = gr::snapshotBytes(en, a.at(0), "bytes", reservation);
      return run.submit(*binding->io(), std::make_unique<TestJob>(std::move(spec), probe), textOf, false,
                        std::move(reservation));
    });
    bind("nativeJob", [binding, probe, gate, gate2](js::Engine& en, const std::vector<js::Value>& a) {
      AsyncRun& run = *binding->run();
      const js::Value o = a.at(0);
      TestJob::Spec spec;
      js::Value text = en.get(o, "text");
      if (en.isString(text)) spec.text = en.toString(text);
      spec.output = static_cast<uint64_t>(number(en, o, "output"));
      spec.width = static_cast<uint64_t>(number(en, o, "width"));
      spec.height = static_cast<uint64_t>(number(en, o, "height"));
      spec.resultBytes = static_cast<size_t>(number(en, o, "result"));
      const int gated = static_cast<int>(number(en, o, "gated"));
      if (gated == 1) spec.gate = gate;
      if (gated == 2) spec.gate = gate2;
      spec.ignoreStop = number(en, o, "ignoreStop") != 0;
      const bool cancellable = number(en, o, "cancellable") != 0;
      gr::ResultConverter convert = textOf;
      if (number(en, o, "adopt") != 0) {
        convert = [probe, account = run.account()](gr::ResultConversion& c) {
          js::Value out = c.adoptBytes(std::move(static_cast<BytesPayload*>(c.payload())->bytes));
          probe->runAfterConversion = account->usage();
          probe->runnerAfterConversion = account->runner()->usage();
          return out;
        };
      } else if (number(en, o, "copy") != 0) {
        convert = [probe, account = run.account()](gr::ResultConversion& c) {
          const auto& bytes = static_cast<BytesPayload*>(c.payload())->bytes;
          js::Value out = c.copyBytes(bytes.data(), bytes.size());
          probe->runAfterConversion = account->usage();
          probe->runnerAfterConversion = account->runner()->usage();
          return out;
        };
      }
      return run.submit(*binding->io(), std::make_unique<TestJob>(std::move(spec), probe), std::move(convert),
                        cancellable);
    });
    bind("nativeRevalidate", [binding, probe, gate2](js::Engine& en, const std::vector<js::Value>& a) {
      AsyncRun& run = *binding->run();
      const std::string kind = en.toString(a.at(0));
      TestJob::Spec spec;
      spec.text = kind;
      if (kind == "grow") spec.gate = gate2;
      // Shared by the job's copies of the cost function.
      auto calls = std::make_shared<int>(0);
      spec.cost = [kind, calls](int) -> JobCost {
        if (++*calls == 1) return {8, 0, 0};
        if (kind == "grow") return {16, 0, 0};
        return {nodetool::jobs::checkedMul(uint64_t{1} << 40, uint64_t{1} << 40), 0, 0};
      };
      return run.submit(*binding->io(), std::make_unique<TestJob>(std::move(spec), probe), textOf);
    });
    eval("globalThis.log = [];"
         "globalThis.record = (p) => p.then((v) => { log.push('ok:' + v); },"
         "  (e) => { log.push(e.name + ':' + e.message); });"
         "globalThis.attempt = (f) => { try { f(); return 'returned'; } catch (e) { return 'error: ' + e.message; } };");
  }
  ~Fixture() { Loop::current().abandon(); }

  void bind(const std::string& name, js::HostFunction fn) {
    engine->set(engine->global(), name, engine->function(name, 1, std::move(fn)));
  }
  js::Value eval(const std::string& source) { return engine->evaluateScript(source, "test.js"); }
  std::string str(const std::string& source) { return engine->toString(eval(source)); }
  size_t logged() { return static_cast<size_t>(engine->toNumber(eval("log.length"))); }
  std::string log() { return str("log.join(' | ')"); }
};

// One run on `runner`, with the run's account in its identity.
struct Run {
  Run(js::Engine& engine, const std::shared_ptr<RunnerAccount>& runner, JobExecutor& lane)
      : identity(gr::host::newRunIdentity("job", runner->openRun())), generation(cancel.beginRun()),
        async(engine, Loop::current(), tracker, generation, lane, identity) {}
  LedgerUsage usage() const { return identity->account->usage(); }
  RunExit runUntil(js::Engine& engine, std::function<bool()> done) {
    gr::EngineRunControl control(engine, async, cancel, generation, std::move(done));
    return Loop::current().run(control);
  }

  CancelState cancel;
  std::shared_ptr<RunnerTracker> tracker = std::make_shared<RunnerTracker>();
  gr::host::RunIdentity identity;
  uint64_t generation;
  AsyncRun async;
};

RunnerLimits runnerLimits(size_t runOperations = 0, uint64_t runBytes = 0, uint64_t javaScriptBytes = 0) {
  RunnerLimits limits;
  if (runOperations) limits.runOperations = runOperations;
  if (runBytes) limits.runBytes = runBytes;
  if (javaScriptBytes) limits.javaScriptBytes = javaScriptBytes;
  return limits;
}

std::unique_ptr<nodetool::jobs::NativeJob> sized(const std::shared_ptr<Probe>& probe, std::string text, uint64_t output,
                                                 size_t snapshot = 0) {
  TestJob::Spec spec;
  spec.text = std::move(text);
  spec.output = output;
  spec.snapshot.assign(snapshot, 1);
  return std::make_unique<TestJob>(std::move(spec), probe);
}

// Keeps submitted jobs so the test runs them when it wants.
//
// Thread affinity: worker only.
struct HeldExecutor final : JobExecutor {
  std::vector<nodetool::jobs::SubmittedJob> jobs;
  void submit(nodetool::jobs::SubmittedJob job) override { jobs.push_back(std::move(job)); }
};

// --- tests ------------------------------------------------------------------

// Gate: deferred mutation, detach and resize after submission. With the
// run's one operation slot held, two snapshots wait as deferred starts with
// their bytes reserved before the copy. The guest then writes into one
// buffer, shrinks it, and detaches the other. Each job still sees the bytes
// of the call, and its cost is recomputed from that snapshot at admission.
void deferredSnapshotsIgnoreLaterMutation() {
  Fixture f;
  ThreadPoolExecutor lane("deferred-snapshots", 2);
  auto ledger = std::make_shared<AdmissionLedger>();
  Run r(*f.engine, ledger->openRunner(runnerLimits(1)), lane);
  gr::RunBinding::Scope bound(*f.engine, r.async, lane);
  f.eval("record(nativeJob({text: 'hold', gated: 1}));"
         "globalThis.ab = new ArrayBuffer(8, { maxByteLength: 16 });"
         "globalThis.u = new Uint8Array(ab); u.set([1, 2, 3, 4, 5, 6, 7, 8]);"
         "record(nativeSnapshot(u));"
         "globalThis.ab2 = new ArrayBuffer(4); new Uint8Array(ab2).set([9, 8, 7, 6]);"
         "record(nativeSnapshot(new Uint8Array(ab2, 1, 2)));");
  CHECK(r.async.deferred() == 2);
  const LedgerUsage waiting = r.usage();
  CHECK(waiting.operations == 1);
  CHECK(waiting.deferredEntries == 2);
  CHECK(waiting.deferredBytes == 10);
  CHECK(waiting.bytes == 10);
  f.eval("u[0] = 99; ab.resize(2); ab2.transfer();");
  CHECK(f.str("ab.byteLength + ':' + ab2.detached") == "2:true");
  f.gate->release();
  CHECK(r.runUntil(*f.engine, [&] { return f.logged() == 3; }) == RunExit::Done);
  CHECK(f.log() == "ok:hold | ok:1,2,3,4,5,6,7,8 | ok:8,7");
  // The hold job once, each deferred start at submission and at every
  // admission attempt.
  CHECK(f.probe->costCalls >= 5);
  CHECK(zero(r.usage()));
  r.async.teardown();
  CHECK(eventually([&] { return zero(ledger->usage()); }));
}

// Gate: revalidation and overflow. A submission whose cost overflows fails
// before it is charged or runs. At admission, a deferred start's cost is
// computed again: a larger snapshot is charged as such, and one that
// overflows fails with an Error without running. The checked arithmetic and
// the reservation's own overflow checks are tested with the ledger
// (native/jobs/tests/admission.cpp, checkedArithmeticAndSnapshotLimits).
void revalidationAndOverflow() {
  auto ledger = std::make_shared<AdmissionLedger>();
  auto runner = ledger->openRunner(runnerLimits(1));

  Fixture f;
  ThreadPoolExecutor lane("revalidate", 2);
  Run r(*f.engine, runner, lane);
  gr::RunBinding::Scope bound(*f.engine, r.async, lane);
  CHECK(contains(f.str("attempt(() => nativeJob({ width: 2 ** 32, height: 2 ** 32 }))"), "error: the size of a host "
                                                                                          "operation overflows"));
  CHECK(zero(r.usage()));
  CHECK(eventually([&] { return f.probe->alive == 0; }));
  CHECK(f.probe->runs == 0);

  f.eval("record(nativeJob({ text: 'hold', gated: 1 }));"
         "record(nativeRevalidate('grow'));"
         "record(nativeRevalidate('overflow'));");
  CHECK(r.async.deferred() == 2);
  CHECK(r.usage().deferredEntries == 2);
  f.gate->release();
  // 'grow' runs and waits on gate2. 'overflow' fails at its revalidation.
  CHECK(r.runUntil(*f.engine, [&] { return f.logged() == 2 && f.probe->runs == 2; }) == RunExit::Done);
  const LedgerUsage running = r.usage();
  CHECK(running.operations == 1);
  CHECK(running.bytes == 16);
  // The refused start's charge goes with its inputs, on the disposer.
  CHECK(eventually([&] { return r.usage().deferredEntries == 0; }));
  f.gate2->release();
  CHECK(r.runUntil(*f.engine, [&] { return f.logged() == 3; }) == RunExit::Done);
  CHECK(f.log() == "ok:hold | Error:the size of a host operation overflows | ok:grow");
  CHECK(f.probe->runs == 2);
  r.async.teardown();
  CHECK(eventually([&] { return zero(ledger->usage()); }));
}

// Gate: cross-run and cross-runner pressure. The process has 1 MiB. Run A of
// runner 1 holds 768 KiB. Run B of runner 2 needs 512 KiB and waits; run C of
// runner 2 needs 1 KiB, which would fit, but waits behind B's turn. When A's
// result is drained, B goes first, and B's admission lets C in. A run's own
// limit blocks only that run and takes no turn.
void crossRunAndRunnerPressure() {
  Fixture f;
  ProcessLimits process;
  process.bytes = 1 * kMiB;
  auto ledger = std::make_shared<AdmissionLedger>(process);
  auto runner1 = ledger->openRunner();
  auto runner2 = ledger->openRunner();
  HeldExecutor held;
  Run a(*f.engine, runner1, held);
  Run b(*f.engine, runner2, held);
  Run c(*f.engine, runner2, held);
  std::vector<js::Value> promises;
  promises.push_back(a.async.submit(sized(f.probe, "A", 768 * kKiB), textOf));
  promises.push_back(b.async.submit(sized(f.probe, "B", 512 * kKiB), textOf));
  promises.push_back(c.async.submit(sized(f.probe, "C", 1 * kKiB), textOf));
  CHECK(held.jobs.size() == 1);
  CHECK(b.async.deferred() == 1);
  CHECK(c.async.deferred() == 1);
  CHECK(ledger->waitingRuns() == 2);
  CHECK(ledger->usage().bytes == 768 * kKiB);
  CHECK(runner1->usage().bytes == 768 * kKiB);
  CHECK(runner2->usage().bytes == 0);

  held.jobs[0].execute();
  // The result waits in A's mailbox, still charged: nothing moves.
  CHECK(!c.async.resultsPending());
  c.async.pollAdmission();
  CHECK(c.async.deferred() == 1);
  CHECK(ledger->usage().bytes == 768 * kKiB);
  CHECK(a.async.dispatchOne());
  CHECK(b.async.resultsPending() && c.async.resultsPending());
  // C asks first, but B holds the earlier turn.
  c.async.pollAdmission();
  CHECK(c.async.deferred() == 1);
  b.async.pollAdmission();
  CHECK(b.async.deferred() == 0);
  // B's admission gave up its turn and told C.
  CHECK(c.async.resultsPending());
  c.async.pollAdmission();
  CHECK(c.async.deferred() == 0);
  CHECK(held.jobs.size() == 3);
  CHECK(f.probe->runs == 1);
  CHECK(ledger->usage().bytes == 513 * kKiB);
  CHECK(runner1->usage().bytes == 0);
  CHECK(runner2->usage().bytes == 513 * kKiB);
  CHECK(ledger->waitingRuns() == 0);

  // A run at its own operation limit waits alone.
  auto tight = ledger->openRunner(runnerLimits(1));
  Run d(*f.engine, tight, held);
  Run e(*f.engine, tight, held);
  promises.push_back(d.async.submit(sized(f.probe, "D1", 0), textOf));
  promises.push_back(d.async.submit(sized(f.probe, "D2", 0), textOf));
  promises.push_back(e.async.submit(sized(f.probe, "E", 0), textOf));
  CHECK(d.async.deferred() == 1);
  CHECK(e.async.deferred() == 0);
  CHECK(held.jobs.size() == 5);

  for (size_t i = 1; i < held.jobs.size(); ++i) held.jobs[i].execute();
  for (Run* run : {&b, &c, &d, &e}) {
    while (run->async.dispatchOne()) {
    }
  }
  d.async.pollAdmission();
  CHECK(d.async.deferred() == 0);
  promises.clear();
  for (Run* run : {&a, &b, &c, &d, &e}) run->async.teardown();
  held.jobs.clear();
  CHECK(zero(ledger->usage()));
}

// Gate: result retention. A finished job's result keeps its reservation
// while it waits in the mailbox, inline or from a lane, and releases it
// only when the worker drained it or the closed mailbox disposed of it.
void resultsKeepReservationsUntilDrainedOrDisposed() {
  Fixture f;
  auto ledger = std::make_shared<AdmissionLedger>();
  auto runner = ledger->openRunner();
  nodetool::jobs::InlineExecutor inlineJobs;
  {
    Run r(*f.engine, runner, inlineJobs);
    js::Value promise = r.async.submit(sized(f.probe, "inline", 1000, 10), textOf);
    CHECK(f.probe->runs == 1);
    CHECK(r.async.resultsPending());
    CHECK(r.usage().operations == 1);
    CHECK(r.usage().bytes == 1010);
    CHECK(r.async.dispatchOne());
    CHECK(zero(r.usage()));
    r.async.teardown();
  }
  ThreadPoolExecutor lane("retention", 1);
  {
    Run r(*f.engine, runner, lane);
    js::Value promise = r.async.submit(sized(f.probe, "lane", 500), textOf);
    CHECK(eventually([&] { return r.async.resultsPending(); }));
    std::this_thread::sleep_for(milliseconds(10));
    CHECK(r.usage().operations == 1);
    CHECK(r.usage().bytes == 500);
    // The worker never drains it: closing the mailbox disposes of it.
    r.async.teardown();
    CHECK(eventually([&] { return zero(r.usage()); }));
  }
  CHECK(zero(ledger->usage()));
}

// Gate: abandoned runs keep backpressure. Run A's job ignores stop. A is
// torn down and destroyed while it runs, and its operation slot stays taken,
// so run B of another runner waits. Only when A's job ends and its result is
// disposed in the closed mailbox does B start.
void abandonedRunsKeepBackpressure() {
  Fixture f;
  ProcessLimits process;
  process.operations = 1;
  auto ledger = std::make_shared<AdmissionLedger>(process);
  ThreadPoolExecutor lane("abandoned", 2);
  {
    Run a(*f.engine, ledger->openRunner(), lane);
    gr::RunBinding::Scope bound(*f.engine, a.async, lane);
    f.eval("nativeJob({ text: 'A', gated: 1, ignoreStop: 1 });");
    CHECK(eventually([&] { return f.probe->runs == 1; }));
    a.async.teardown();
  }
  CHECK(ledger->usage().operations == 1);
  Run b(*f.engine, ledger->openRunner(), lane);
  gr::RunBinding::Scope bound(*f.engine, b.async, lane);
  f.eval("record(nativeJob({ text: 'B' }));");
  CHECK(b.async.deferred() == 1);
  std::this_thread::sleep_for(milliseconds(30));
  b.async.pollAdmission();
  CHECK(f.probe->runs == 1);
  CHECK(ledger->usage().operations == 1);
  f.gate->release();
  CHECK(b.runUntil(*f.engine, [&] { return f.logged() == 1; }) == RunExit::Done);
  CHECK(f.log() == "ok:B");
  CHECK((f.probe->sawAll() == std::vector<std::string>{"A", "B"}));
  b.async.teardown();
  CHECK(eventually([&] { return zero(ledger->usage()); }));
}

// Gate: JavaScript transfer charges. A 1 MiB result handed over without a
// copy leaves the run's charge and enters the runner's and the process's
// JavaScript ledger in one step. A same-length transfer keeps the charge, a
// longer one grows it, and finalizing the buffer releases it. A copied
// result is charged in both ledgers while both copies exist, then only
// natively until disposal.
void javaScriptTransferCharges() {
  Fixture f;
  auto ledger = std::make_shared<AdmissionLedger>();
  auto runner = ledger->openRunner();
  nodetool::jobs::InlineExecutor inlineJobs;
  Run r(*f.engine, runner, inlineJobs);
  gr::RunBinding::Scope bound(*f.engine, r.async, inlineJobs);
  f.eval("nativeJob({ result: 1048576, output: 1048576, adopt: 1 })"
         "  .then((b) => { globalThis.buf = b; log.push('ok:' + b.byteLength); },"
         "        (e) => log.push(e.name + ':' + e.message));");
  CHECK(r.usage().bytes == 1 * kMiB);
  CHECK(r.usage().operations == 1);
  CHECK(r.runUntil(*f.engine, [&] { return f.logged() == 1; }) == RunExit::Done);
  CHECK(f.log() == "ok:1048576");
  // Right after the handover: the native charge is gone, the JavaScript one
  // is there, and the operation slot waits for the result's disposal.
  CHECK(f.probe->runAfterConversion.bytes == 0);
  CHECK(f.probe->runAfterConversion.operations == 1);
  CHECK(f.probe->runnerAfterConversion.javaScriptBytes == 1 * kMiB);
  CHECK(zero(r.usage()));
  CHECK(runner->usage().javaScriptBytes == 1 * kMiB);
  CHECK(ledger->usage().javaScriptBytes == 1 * kMiB);
  CHECK(f.str("buf[0] === 7 && buf[1048575] === 7") == "true");
  f.eval("globalThis.moved = buf.buffer.transfer();");
  CHECK(f.str("buf.byteLength + ':' + moved.byteLength") == "0:1048576");
  CHECK(runner->usage().javaScriptBytes == 1 * kMiB);
  f.eval("globalThis.grown = moved.transfer(2 * 1048576);");
  CHECK(f.str("new Uint8Array(grown)[0] + ':' + grown.byteLength") == "7:2097152");
  CHECK(runner->usage().javaScriptBytes == 2 * kMiB);
  f.eval("buf = undefined; moved = undefined; grown = undefined;");
  CHECK(runner->usage().javaScriptBytes == 0);
  CHECK(ledger->usage().javaScriptBytes == 0);

  // Copies, including a small result that adoptBytes copies.
  f.eval("log = [];"
         "nativeJob({ result: 1024, copy: 1 }).then((b) => log.push('copy:' + b.length));");
  CHECK(r.runUntil(*f.engine, [&] { return f.logged() == 1; }) == RunExit::Done);
  CHECK(f.probe->runnerAfterConversion.javaScriptBytes == 1024);
  CHECK(runner->usage().javaScriptBytes == 0);
  f.eval("nativeJob({ result: 1000, adopt: 1 }).then((b) => log.push('small:' + b.length));");
  CHECK(r.runUntil(*f.engine, [&] { return f.logged() == 2; }) == RunExit::Done);
  CHECK(f.probe->runnerAfterConversion.javaScriptBytes == 1000);
  CHECK(f.log() == "copy:1024 | small:1000");
  CHECK(runner->usage().javaScriptBytes == 0);
  CHECK(zero(ledger->usage()));
  r.async.teardown();
}

// Gate: ledger exhaustion rejects conversion. The runner's JavaScript cap is
// 1 MiB. One 768 KiB buffer is kept. A second adoption and a copy that would
// pass the cap reject their promises with an Error, and their native charge
// is still released. Once the kept buffer is collected, adoption works
// again.
void conversionRejectedWhenJavaScriptLedgerIsFull() {
  Fixture f;
  auto ledger = std::make_shared<AdmissionLedger>();
  auto runner = ledger->openRunner(runnerLimits(0, 0, 1 * kMiB));
  nodetool::jobs::InlineExecutor inlineJobs;
  Run r(*f.engine, runner, inlineJobs);
  gr::RunBinding::Scope bound(*f.engine, r.async, inlineJobs);
  f.eval("const fail = (e) => log.push(e.name + ':' + e.message);"
         "nativeJob({ result: 786432, adopt: 1 }).then((b) => { globalThis.keep = b; log.push('kept'); }, fail);"
         "nativeJob({ result: 786432, adopt: 1 }).then(() => log.push('second'), fail);"
         "nativeJob({ result: 300000, copy: 1 }).then(() => log.push('copied'), fail);");
  CHECK(r.runUntil(*f.engine, [&] { return f.logged() == 3; }) == RunExit::Done);
  CHECK(f.log() ==
        "kept | Error:the runner's JavaScript buffers would exceed 1 MiB | "
        "Error:the runner's JavaScript buffers would exceed 1 MiB");
  CHECK(runner->usage().javaScriptBytes == 786432);
  CHECK(r.usage().bytes == 0 && r.usage().operations == 0);
  f.eval("keep = undefined; log = [];"
         "nativeJob({ result: 786432, adopt: 1 }).then((b) => log.push('again:' + b.length), fail);");
  CHECK(r.runUntil(*f.engine, [&] { return f.logged() == 1; }) == RunExit::Done);
  CHECK(f.log() == "again:786432");
  r.async.teardown();
}

// Cyclic garbage holds an adopted 768 KiB buffer under a 1 MiB cap. Only a
// garbage collection frees it, so the next adoption collects and succeeds.
void conversionCollectsGarbageBeforeRefusal() {
  Fixture f;
  auto ledger = std::make_shared<AdmissionLedger>();
  auto runner = ledger->openRunner(runnerLimits(0, 0, 1 * kMiB));
  nodetool::jobs::InlineExecutor inlineJobs;
  Run r(*f.engine, runner, inlineJobs);
  gr::RunBinding::Scope bound(*f.engine, r.async, inlineJobs);
  f.eval("const fail = (e) => log.push(e.name + ':' + e.message);"
         "nativeJob({ result: 786432, adopt: 1 }).then((b) => {"
         "  const a = { b }; const c = { a }; a.c = c; log.push('cycle'); }, fail);");
  CHECK(r.runUntil(*f.engine, [&] { return f.logged() == 1; }) == RunExit::Done);
  CHECK(runner->usage().javaScriptBytes == 786432);
  f.eval("log = []; nativeJob({ result: 786432, adopt: 1 }).then((b) => log.push('after:' + b.length), fail);");
  CHECK(r.runUntil(*f.engine, [&] { return f.logged() == 1; }) == RunExit::Done);
  CHECK(f.log() == "after:786432");
  r.async.teardown();
}

// Gate: cancellation of deferred starts. With the run's slot held, a
// cancellable start and a cleanup start wait. cancel() drops the cancellable
// one, which never runs and rejects with an AbortError, and releases its
// snapshot. The cleanup start runs once the slot frees. teardown() drops
// what still waits.
void cancellationDropsDeferredStarts() {
  Fixture f;
  auto ledger = std::make_shared<AdmissionLedger>();
  auto runner = ledger->openRunner(runnerLimits(1));
  ThreadPoolExecutor lane("cancel-deferred", 2);
  {
    Run r(*f.engine, runner, lane);
    gr::RunBinding::Scope bound(*f.engine, r.async, lane);
    f.eval("record(nativeJob({ text: 'hold', gated: 1 }));"
           "record(nativeJob({ text: 'X', cancellable: 1 }));"
           "record(nativeJob({ text: 'Y' }));");
    CHECK(r.async.deferred() == 2);
    CHECK(r.usage().deferredEntries == 2);
    CHECK(f.probe->alive == 3);
    r.async.cancel();
    CHECK(r.async.deferred() == 1);
    CHECK(eventually([&] { return r.usage().deferredEntries == 1 && f.probe->alive == 2; }));
    f.gate->release();
    CHECK(r.runUntil(*f.engine, [&] { return f.logged() == 3; }) == RunExit::Done);
    CHECK(f.log() == "AbortError:The operation was aborted | ok:hold | ok:Y");
    CHECK((f.probe->sawAll() == std::vector<std::string>{"hold", "Y"}));
    r.async.teardown();
  }
  CHECK(eventually([&] { return zero(ledger->usage()); }));

  Fixture g;
  {
    Run r(*g.engine, runner, lane);
    gr::RunBinding::Scope bound(*g.engine, r.async, lane);
    g.eval("nativeJob({ text: 'hold', gated: 1 }); nativeJob({ text: 'Z' });");
    CHECK(eventually([&] { return g.probe->runs == 1; }));
    CHECK(r.async.deferred() == 1);
    r.async.teardown();
    CHECK(r.async.deferred() == 0);
  }
  CHECK(eventually([&] { return zero(ledger->usage()) && g.probe->alive == 0; }));
  CHECK(g.probe->runs == 1);
}

// Gate: oversized operations reject. A cost above the run's or the process's
// byte limit fails at submission, before it is charged or runs. A snapshot
// that cannot fit fails before it is copied. A start that must wait but
// exceeds the deferred limits fails, while the same start is admitted when
// it need not wait.
void oversizedOperationsReject() {
  Fixture f;
  ThreadPoolExecutor lane("oversized", 2);
  ProcessLimits process;
  process.bytes = 2 * kMiB;
  auto ledger = std::make_shared<AdmissionLedger>(process);
  {
    Run r(*f.engine, ledger->openRunner(runnerLimits(0, 1 * kMiB)), lane);
    gr::RunBinding::Scope bound(*f.engine, r.async, lane);
    CHECK(f.str("attempt(() => nativeJob({ output: 2 * 1048576 }))") ==
          "error: a host operation needs 2097152 bytes, more than the run limit of 1 MiB");
    CHECK(f.str("attempt(() => nativeSnapshot(new Uint8Array(2 * 1048576)))") ==
          "error: a host operation's inputs need 2097152 bytes, more than the run limit of 1 MiB");
    CHECK(zero(r.usage()));
    r.async.teardown();
  }
  {
    Run r(*f.engine, ledger->openRunner(), lane);
    gr::RunBinding::Scope bound(*f.engine, r.async, lane);
    CHECK(f.str("attempt(() => nativeJob({ output: 3 * 1048576 }))") ==
          "error: a host operation needs 3145728 bytes, more than the process limit of 2 MiB");
    r.async.teardown();
  }
  CHECK(eventually([&] { return f.probe->alive == 0; }));
  CHECK(f.probe->runs == 0);
  CHECK(zero(ledger->usage()));

  RunnerLimits deferring = runnerLimits(1);
  deferring.runDeferredEntries = 2;
  deferring.runDeferredBytes = 64;
  {
    Run r(*f.engine, ledger->openRunner(deferring), lane);
    gr::RunBinding::Scope bound(*f.engine, r.async, lane);
    // Admitted at once, so the deferred limits do not apply.
    CHECK(f.str("attempt(() => record(nativeSnapshot(new Uint8Array(100))))") == "returned");
    CHECK(r.runUntil(*f.engine, [&] { return f.logged() == 1; }) == RunExit::Done);
    f.eval("record(nativeJob({ text: 'hold', gated: 1 }));");
    CHECK(f.str("attempt(() => nativeSnapshot(new Uint8Array(10)))") == "returned");
    CHECK(f.str("attempt(() => nativeSnapshot(new Uint8Array(100)))") ==
          "error: the run cannot defer more host operations (2 entries, 64 bytes)");
    CHECK(f.str("attempt(() => nativeSnapshot(new Uint8Array(10)))") == "returned");
    CHECK(f.str("attempt(() => nativeSnapshot(new Uint8Array(1)))") ==
          "error: the run cannot defer more host operations (2 entries, 64 bytes)");
    CHECK(r.async.deferred() == 2);
    CHECK(r.usage().deferredBytes == 20);
    f.gate->release();
    r.async.teardown();
  }
  CHECK(eventually([&] { return zero(ledger->usage()); }));
}

// Takes the ledger lock, and a mailbox lock, in every executor entry point.
// If AsyncRun called an executor while holding the ledger lock, the second
// lock of the same mutex would deadlock, and the watchdog fails the test.
//
// Thread affinity: worker only.
struct NestingExecutor final : JobExecutor {
  explicit NestingExecutor(std::shared_ptr<AdmissionLedger> l) : ledger(std::move(l)) {}
  void touch() {
    (void)ledger->usage();
    if (auto locked = mailbox.lock()) (void)locked->pending();
    ++touched;
  }
  void submit(nodetool::jobs::SubmittedJob job) override {
    touch();
    job.execute();
  }
  void disposeUnrun(nodetool::jobs::SubmittedJob job) override {
    touch();
    (void)job;
  }
  void dispose(std::deque<nodetool::jobs::JobResult> results) override {
    touch();
    results.clear();
  }
  std::shared_ptr<AdmissionLedger> ledger;
  std::weak_ptr<nodetool::jobs::RunMailbox> mailbox;
  int touched = 0;
};

// Told about released capacity. Takes the ledger lock, a lane lock and a
// mailbox lock: if the ledger told waiters while holding its lock, the first
// of these would deadlock.
//
// Thread affinity: thread-safe. `told` is atomic, the rest is set before it
// is registered.
struct NestingWaiter final : nodetool::jobs::AdmissionWaiter {
  void admissionChanged() noexcept override {
    (void)ledger->usage();
    (void)lane->queued();
    if (auto locked = mailbox.lock()) (void)locked->pending();
    ++told;
  }
  std::shared_ptr<AdmissionLedger> ledger;
  ThreadPoolExecutor* lane = nullptr;
  std::weak_ptr<nodetool::jobs::RunMailbox> mailbox;
  std::atomic<int> told{0};
};

// Gate: no lock nesting. Executors are called and waiters are told outside
// the ledger lock, on the worker and on lane threads. Then lane threads
// release charges while the worker submits, admits and drains, and other
// threads reserve and release, so ThreadSanitizer sees every lock order the
// ledger takes part in.
void ledgerLocksNeverNest() {
  Fixture f;
  auto ledger = std::make_shared<AdmissionLedger>();
  auto runner = ledger->openRunner();
  ThreadPoolExecutor lane("nesting", 2);
  NestingExecutor nesting(ledger);
  Run r(*f.engine, runner, nesting);
  nesting.mailbox = r.async.mailbox();

  // A waiting run whose waiter takes the other locks.
  auto tight = ledger->openRunner(runnerLimits(1));
  auto other = tight->openRun();
  auto waiter = std::make_shared<NestingWaiter>();
  waiter->ledger = ledger;
  waiter->lane = &lane;
  waiter->mailbox = r.async.mailbox();
  other->setWaiter(waiter);
  Reservation first(other);
  CHECK(first.admit({}, Reservation::Order::Queue) == Reservation::Admission::Admitted);
  Reservation second(other);
  CHECK(second.admit({}, Reservation::Order::Queue) == Reservation::Admission::Blocked);
  CHECK(ledger->waitingRuns() == 1);

  {
    gr::RunBinding::Scope bound(*f.engine, r.async, nesting);
    f.eval("record(nativeJob({ text: 'a', output: 10 })); record(nativeJob({ text: 'b' }));");
    CHECK(f.str("attempt(() => nativeJob({ output: 2 * 1024 * 1048576 }))").starts_with("error:"));
    CHECK(r.runUntil(*f.engine, [&] { return f.logged() == 2; }) == RunExit::Done);
  }
  CHECK(nesting.touched >= 3);
  // Released on the worker, while draining.
  CHECK(waiter->told >= 1);
  const int toldOnWorker = waiter->told;

  // Released on a lane thread, which disposes of a result in a closed
  // mailbox.
  {
    Run onLane(*f.engine, runner, lane);
    gr::RunBinding::Scope bound(*f.engine, onLane.async, lane);
    f.eval("nativeJob({ text: 'late', gated: 2 });");
    CHECK(eventually([&] { return f.probe->runs == 3; }));
    onLane.async.teardown();
    f.gate2->release();
    CHECK(eventually([&] { return waiter->told > toldOnWorker; }));
  }
  other->stopWaiting();

  // Stress: charges released on lane threads and stress threads while the
  // worker submits, admits and drains.
  std::atomic<bool> stop{false};
  std::vector<std::thread> stressors;
  for (int t = 0; t < 3; ++t) {
    stressors.emplace_back([&, t] {
      auto account = runner->openRun();
      while (!stop) {
        Reservation reservation(account);
        reservation.reserveSnapshot(64 + t);
        if (reservation.admit({64, 128, 0}, Reservation::Order::Immediate) == Reservation::Admission::Admitted) {
          nodetool::jobs::ExternalCharge charge = reservation.transferToJavaScript(32);
          (void)charge.resize(48);
        }
      }
    });
  }
  {
    Run stressed(*f.engine, runner, lane);
    gr::RunBinding::Scope bound(*f.engine, stressed.async, lane);
    f.eval("log = []; for (let i = 0; i < 300; i++) nativeJob({ text: 's', output: 256 }).then(() => log.push(1));");
    CHECK(stressed.runUntil(*f.engine, [&] { return f.logged() == 300; }) == RunExit::Done);
    stressed.async.teardown();
  }
  stop = true;
  for (auto& thread : stressors) thread.join();
  first = {};
  second = {};
  r.async.teardown();
  CHECK(eventually([&] { return zero(ledger->usage()); }));
}

// Gate: inline mode is accounted. Inline jobs run at submission, and their
// results hold the run's 64 operation slots until drained, so the 65th to
// 100th start wait. Draining admits them in order.
void inlineJobsAreAccounted() {
  Fixture f;
  auto ledger = std::make_shared<AdmissionLedger>();
  nodetool::jobs::InlineExecutor inlineJobs;
  Run r(*f.engine, ledger->openRunner(), inlineJobs);
  gr::RunBinding::Scope bound(*f.engine, r.async, inlineJobs);
  f.eval("for (let i = 0; i < 100; i++) nativeJob({ text: 't' + i }).then((v) => log.push(v));");
  CHECK(f.probe->runs == 64);
  CHECK(r.async.deferred() == 36);
  CHECK(r.usage().operations == 64);
  CHECK(r.usage().deferredEntries == 36);
  CHECK(r.runUntil(*f.engine, [&] { return f.logged() == 100; }) == RunExit::Done);
  std::string expected;
  for (int i = 0; i < 100; ++i) expected += (i ? " | t" : "t") + std::to_string(i);
  CHECK(f.log() == expected);
  CHECK(zero(r.usage()));
  r.async.teardown();
}

// The context capability on its own, as the runner installs it.
void installContext(js::Engine& e, const gr::HostOptions& options) {
  js::Value host = e.object();
  for (const auto& capability : gr::host::capabilities()) {
    if (std::string(capability.name) != "context") continue;
    js::Value object = e.object();
    capability.install(e, object, options);
    e.set(host, capability.name, object);
  }
  e.set(e.global(), "__host", host);
}

// Gate: the context transport is accounted. A call charges its request and
// its response cap at submission. A call that settled Stopped while the
// embedder still holds its completion keeps its charge until the completion
// is gone. A response larger than the cap is dropped on arrival and rejects
// as too large.
void contextCallsAreAccounted() {
  // Shared with the callback, which the engine and the lane keep.
  struct Kept {
    std::mutex mutex;
    std::optional<gr::host::ContextCompletion> completion;
  };
  auto kept = std::make_shared<Kept>();
  gr::HostOptions options;
  options.context.maxPayloadBytes = 1024;
  options.context.asyncOperations["keep"] = [kept](std::string, std::stop_token, gr::host::ContextCompletion done) {
    std::lock_guard lock(kept->mutex);
    kept->completion.emplace(std::move(done));
  };
  options.context.asyncOperations["big"] = [](std::string, std::stop_token, gr::host::ContextCompletion done) {
    done(gr::host::ContextResult::value(std::string(4096, 'x')));
  };
  Fixture f;
  installContext(*f.engine, options);
  auto ledger = std::make_shared<AdmissionLedger>();
  auto runner = ledger->openRunner();
  ThreadPoolExecutor io("context", 2);
  {
    Run r(*f.engine, runner, io);
    gr::RunBinding::Scope bound(*f.engine, r.async, io);
    f.eval("record(__host.context.callAsync('keep', '{\"a\":1}'));");
    CHECK(r.usage().operations == 1);
    CHECK(r.usage().bytes == 7 + 1024);
    CHECK(eventually([&] {
      std::lock_guard lock(kept->mutex);
      return kept->completion.has_value();
    }));
    r.async.cancel();
    CHECK(r.runUntil(*f.engine, [&] { return f.logged() == 1; }) == RunExit::Done);
    CHECK(f.log() == "AbortError:The operation was aborted");
    // Drain the second Stopped result, from the run's stop.
    while (r.async.dispatchOne()) {
    }
    CHECK(r.usage().operations == 1);
    CHECK(r.usage().bytes == 7 + 1024);
    {
      std::lock_guard lock(kept->mutex);
      kept->completion.reset();
    }
    CHECK(eventually([&] { return zero(r.usage()); }));
    r.async.teardown();
  }
  {
    Run r(*f.engine, runner, io);
    gr::RunBinding::Scope bound(*f.engine, r.async, io);
    f.eval("log = []; record(__host.context.callAsync('big', '{}'));");
    CHECK(r.runUntil(*f.engine, [&] { return f.logged() == 1; }) == RunExit::Done);
    CHECK(f.log() == "Error:Context response size limit exceeded");
    CHECK(zero(r.usage()));
    r.async.teardown();
  }
  CHECK(eventually([&] { return zero(ledger->usage()); }));
}

// Gate: provider jobs are accounted. A start charges its request, the
// result cap and an operation slot, and fails when the process cannot admit
// it. Upload parts are charged as they arrive. A result larger than the cap
// fails the job. Closing the jobs and retiring the run release everything
// once the workers returned.
void providerJobsAreAccounted() {
  using gr::host::ProviderJobs;
  // Shared with the worker, which runs on lane threads.
  auto gate = std::make_shared<Gate>();
  ProviderJobs::Worker worker = [gate](const ProviderJobs::Call& call) {
    const Json args = Json::parse(call.argsJson);
    if (args.value("wait", false)) gate->wait(call.stop);
    return Json(std::string(args.value("size", size_t{1}), 'a')).dump();
  };
  ProviderJobs::Limits limits;
  limits.maxResultBytes = 1 * kMiB;
  ThreadPoolExecutor network("provider", 4);
  ProcessLimits process;
  process.bytes = 3 * kMiB;
  auto ledger = std::make_shared<AdmissionLedger>(process);
  auto runner = ledger->openRunner();
  const auto identity = gr::host::newRunIdentity("job", runner->openRun());
  {
    ProviderJobs jobs(worker, limits, network);
    gr::host::ContextOptions options;
    jobs.grant(options, {"p"}, [identity] { return identity; });
    auto& start = options.operations.at("provider:p:jobs:start");
    auto& put = options.operations.at("provider:p:jobs:put");
    auto& close = options.operations.at("provider:p:jobs:close");
    const std::string waiting = R"({"method":"callEndpoint","args":{"size":10,"wait":true}})";
    const uint64_t args = Json::parse(waiting).at("args").dump().size();
    const auto first = Json::parse(start(waiting)).at("job").get<std::string>();
    CHECK(identity->account->usage().operations == 1);
    CHECK(identity->account->usage().bytes == args + 1 * kMiB);
    const auto second = Json::parse(start(waiting)).at("job").get<std::string>();
    CHECK(identity->account->usage().operations == 2);
    CHECK(contains(thrown([&] { start(waiting); }), "Provider job cannot start: the host job budget is exhausted"));
    CHECK(identity->account->usage().operations == 2);
    gate->release();
    close(Json{{"job", first}}.dump());
    close(Json{{"job", second}}.dump());
    CHECK(eventually([&] { return zero(identity->account->usage()); }));

    // A result larger than the cap fails the job.
    const auto big = Json::parse(start(R"({"method":"callEndpoint","args":{"size":2097152}})")).at("job").get<std::string>();
    std::promise<ProviderJobs::Outcome> answered;
    auto answer = answered.get_future();
    CHECK(eventually([&] { return jobs.stats().executing == 0; }));
    jobs.next("p", Json{{"job", big}}.dump(),
              [&answered](ProviderJobs::Outcome outcome) noexcept { answered.set_value(std::move(outcome)); });
    const ProviderJobs::Outcome outcome = answer.get();
    CHECK(outcome.kind == ProviderJobs::Outcome::Kind::Error);
    CHECK(contains(outcome.text, "exceeds its reserved 1048576 bytes"));

    // Upload parts are charged before they are appended.
    put(R"({"data":")" + std::string(1000, 'u') + R"("})");
    CHECK(identity->account->usage().bytes > 1000);
    jobs.retireRun(identity);
    CHECK(eventually([&] { return zero(identity->account->usage()); }));
  }
  CHECK(eventually([&] { return zero(ledger->usage()); }));
}

// Submits a job whose snapshot of `snapshot` bytes was reserved first, as a
// host function does, with `output` more bytes of cost.
js::Value submitReserved(Run& run, JobExecutor& executor, const std::shared_ptr<Probe>& probe, std::string text,
                         uint64_t snapshot, uint64_t output) {
  Reservation reservation = run.async.reserve();
  reservation.reserveSnapshot(snapshot);
  return run.async.submit(executor, sized(probe, std::move(text), output, snapshot), textOf, false,
                          std::move(reservation));
}

// Gate (review F1, run level): deferred snapshots never block their own
// FIFO head. The run may hold 100 bytes. An active job holds 60. B waits
// with a 20-byte snapshot and needs 90 in all. C would wait behind B with
// another 20-byte snapshot, but then B could never start once the active
// job drained (40 held, 70 more needed), and C could never pass B. C is
// refused instead, and B starts when the active job drains.
void deferredSnapshotsLeaveRoomForTheirHead() {
  Fixture f;
  auto ledger = std::make_shared<AdmissionLedger>();
  HeldExecutor held;
  Run r(*f.engine, ledger->openRunner(runnerLimits(0, 100)), held);
  std::vector<js::Value> promises;
  promises.push_back(r.async.submit(sized(f.probe, "active", 60), textOf));
  promises.push_back(submitReserved(r, held, f.probe, "B", 20, 70));
  CHECK(r.async.deferred() == 1);
  CHECK(contains(thrown([&] { promises.push_back(submitReserved(r, held, f.probe, "C", 20, 0)); }),
                 "would leave too little room"));
  CHECK(r.async.deferred() == 1);
  CHECK(r.usage().bytes == 80);
  held.jobs[0].execute();
  CHECK(r.async.dispatchOne());
  r.async.pollAdmission();
  CHECK(r.async.deferred() == 0);
  CHECK(held.jobs.size() == 2);
  CHECK(r.usage().bytes == 90);
  promises.clear();
  r.async.teardown();
  held.jobs.clear();
  CHECK(eventually([&] { return zero(ledger->usage()); }));
}

// Gate (review F1, process level): the same across runs through the turn
// order. The process may hold 100 bytes. Run X holds 60. Run A's head waits
// for the process with a 20-byte snapshot and 90 in all, and holds the turn.
// Run B's 20-byte start would wait behind A's turn and leave A no room once
// X drained. It is refused, and A starts when X drains.
void deferredSnapshotsLeaveRoomAcrossRuns() {
  Fixture f;
  ProcessLimits process;
  process.bytes = 100;
  auto ledger = std::make_shared<AdmissionLedger>(process);
  HeldExecutor held;
  Run x(*f.engine, ledger->openRunner(), held);
  Run a(*f.engine, ledger->openRunner(), held);
  Run b(*f.engine, ledger->openRunner(), held);
  std::vector<js::Value> promises;
  promises.push_back(x.async.submit(sized(f.probe, "X", 60), textOf));
  promises.push_back(submitReserved(a, held, f.probe, "A", 20, 70));
  CHECK(a.async.deferred() == 1);
  CHECK(contains(thrown([&] { promises.push_back(submitReserved(b, held, f.probe, "B", 20, 0)); }),
                 "would leave too little room"));
  CHECK(b.async.deferred() == 0);
  held.jobs[0].execute();
  CHECK(x.async.dispatchOne());
  a.async.pollAdmission();
  CHECK(a.async.deferred() == 0);
  CHECK(held.jobs.size() == 2);
  promises.clear();
  for (Run* run : {&x, &a, &b}) run->async.teardown();
  held.jobs.clear();
  CHECK(eventually([&] { return zero(ledger->usage()); }));
}

// Gate (review F2): an asynchronous context call's error is bounded like
// its response. An embedder's oversized error message, and an oversized
// message thrown by the callback, reach the guest as a short diagnostic.
void contextErrorsAreBounded() {
  gr::HostOptions options;
  options.context.maxPayloadBytes = 1024;
  options.context.asyncOperations["fail"] = [](std::string, std::stop_token, gr::host::ContextCompletion done) {
    done(gr::host::ContextResult::error(std::string(4096, 'e')));
  };
  options.context.asyncOperations["throw"] = [](std::string, std::stop_token, gr::host::ContextCompletion) {
    throw std::runtime_error(std::string(4096, 't'));
  };
  Fixture f;
  installContext(*f.engine, options);
  auto ledger = std::make_shared<AdmissionLedger>();
  ThreadPoolExecutor io("context-errors", 2);
  Run r(*f.engine, ledger->openRunner(), io);
  gr::RunBinding::Scope bound(*f.engine, r.async, io);
  f.eval("record(__host.context.callAsync('fail', '{}'));"
         "record(__host.context.callAsync('throw', '{}'));");
  CHECK(r.runUntil(*f.engine, [&] { return f.logged() == 2; }) == RunExit::Done);
  for (int i = 0; i < 2; ++i) {
    const std::string entry = f.str("log[" + std::to_string(i) + "]");
    CHECK(entry.starts_with("Error:Context error message exceeds the response limit"));
    CHECK(entry.size() < 1024);
  }
  CHECK(f.str("log[0].includes('eeee') && log[1].includes('tttt')") == "true");
  r.async.teardown();
}

// Gate (review F3): a provider progress event that does not fit the result
// cap with its envelope is dropped, whether it would be queued or handed to
// a waiting next(). An event that fits is delivered both ways.
void providerProgressIsBounded() {
  using gr::host::ProviderJobs;
  using Outcome = ProviderJobs::Outcome;
  constexpr size_t cap = 4096;
  // Shared with the worker on a lane thread.
  struct Script {
    Gate emitQueued, queuedEmitted, emitWaiting, finish;
  };
  auto script = std::make_shared<Script>();
  ProviderJobs::Worker worker = [script](const ProviderJobs::Call& call) {
    // A JSON string event of exactly `size` bytes.
    auto event = [](size_t size) { return Json(std::string(size - 2, 'p')).dump(); };
    script->emitQueued.wait(call.stop);
    call.progress(event(20));
    call.progress(event(cap - 10));  // fits alone, not with its envelope
    script->queuedEmitted.release();
    script->emitWaiting.wait(call.stop);
    call.progress(event(cap - 10));
    call.progress(event(30));
    script->finish.wait(call.stop);
    return std::string("1");
  };
  ProviderJobs::Limits limits;
  limits.maxResultBytes = cap;
  ThreadPoolExecutor network("provider-progress", 2);
  auto ledger = std::make_shared<AdmissionLedger>();
  const auto identity = gr::host::newRunIdentity("job", ledger->openRunner()->openRun());
  ProviderJobs jobs(worker, limits, network);
  gr::host::ContextOptions options;
  jobs.grant(options, {"p"}, [identity] { return identity; });
  const auto id = Json::parse(options.operations.at("provider:p:jobs:start")(R"({"method":"callEndpoint"})"))
                      .at("job")
                      .get<std::string>();
  const std::string payload = Json{{"job", id}}.dump();
  auto next = [&] {
    // Shared with the completion, which may run on a lane thread.
    auto promise = std::make_shared<std::promise<Outcome>>();
    auto future = promise->get_future();
    jobs.next("p", payload, [promise](Outcome outcome) noexcept { promise->set_value(std::move(outcome)); });
    return future;
  };
  auto eventSize = [](const Outcome& outcome) {
    return Json::parse(outcome.text).at("event").get<std::string>().size() + 2;
  };
  // Queued: the oversized event is dropped, the small one is kept.
  script->emitQueued.release();
  script->queuedEmitted.wait();
  Outcome queued = next().get();
  CHECK(queued.kind == Outcome::Kind::Value && eventSize(queued) == 20);
  // Waiting: next() waits before the events are produced.
  auto waiting = next();
  std::this_thread::sleep_for(milliseconds(20));
  script->emitWaiting.release();
  Outcome handed = waiting.get();
  CHECK(handed.kind == Outcome::Kind::Value && eventSize(handed) == 30);
  script->finish.release();
  Outcome done = next().get();
  CHECK(done.kind == Outcome::Kind::Value && contains(done.text, "\"done\""));
  options.operations.at("provider:p:jobs:close")(payload);
}

// Gate (review): an adopted buffer keeps at least the 64 KiB adoption
// minimum charged when a transfer shrinks it, so the JavaScript cap still
// bounds the number of adopted buffers.
void shrunkBuffersKeepTheMinimumCharge() {
  Fixture f;
  auto ledger = std::make_shared<AdmissionLedger>();
  auto runner = ledger->openRunner();
  nodetool::jobs::InlineExecutor inlineJobs;
  Run r(*f.engine, runner, inlineJobs);
  gr::RunBinding::Scope bound(*f.engine, r.async, inlineJobs);
  f.eval("nativeJob({ result: 1048576, adopt: 1 }).then((b) => { globalThis.buf = b; log.push('ok'); });");
  CHECK(r.runUntil(*f.engine, [&] { return f.logged() == 1; }) == RunExit::Done);
  CHECK(runner->usage().javaScriptBytes == 1 * kMiB);
  f.eval("globalThis.tiny = buf.buffer.transfer(1);");
  CHECK(f.str("tiny.byteLength") == "1");
  CHECK(runner->usage().javaScriptBytes == gr::ResultConversion::kAdoptMinimum);
  f.eval("buf = undefined; tiny = undefined;");
  CHECK(runner->usage().javaScriptBytes == 0);
  r.async.teardown();
}

// Gate (review): a provider start that fails keeps its upload. A start
// over the budget fails, and the same upload starts once capacity frees.
void failedProviderStartsKeepTheirUpload() {
  using gr::host::ProviderJobs;
  // Shared with the worker on a lane thread.
  auto gate = std::make_shared<Gate>();
  ProviderJobs::Worker worker = [gate](const ProviderJobs::Call& call) {
    if (Json::parse(call.argsJson).is_object()) gate->wait(call.stop);
    return std::string("1");
  };
  ProviderJobs::Limits limits;
  limits.maxResultBytes = 1 * kMiB;
  ThreadPoolExecutor network("provider-upload", 2);
  ProcessLimits process;
  process.bytes = 3 * kMiB / 2;
  auto ledger = std::make_shared<AdmissionLedger>(process);
  const auto identity = gr::host::newRunIdentity("job", ledger->openRunner()->openRun());
  {
    ProviderJobs jobs(worker, limits, network);
    gr::host::ContextOptions options;
    jobs.grant(options, {"p"}, [identity] { return identity; });
    auto& start = options.operations.at("provider:p:jobs:start");
    auto& put = options.operations.at("provider:p:jobs:put");
    auto& close = options.operations.at("provider:p:jobs:close");
    const auto holding = Json::parse(start(R"({"method":"callEndpoint","args":{}})")).at("job").get<std::string>();
    // Arguments that are not an object: the worker returns at once.
    const auto upload = Json::parse(put(R"({"data":"[1]"})")).at("upload").get<std::string>();
    const std::string fromUpload = Json{{"method", "callEndpoint"}, {"upload", upload}}.dump();
    CHECK(contains(thrown([&] { start(fromUpload); }), "the host job budget is exhausted"));
    gate->release();
    close(Json{{"job", holding}}.dump());
    CHECK(eventually([&] { return identity->account->usage().operations == 0; }));
    std::string started;
    CHECK(thrown([&] { started = start(fromUpload); }).empty());
    CHECK(contains(started, "\"job\""));
    jobs.retireRun(identity);
    CHECK(eventually([&] { return zero(identity->account->usage()); }));
  }
  CHECK(eventually([&] { return zero(ledger->usage()); }));
}

// A ProviderJobs whose grants file uploads under `identity`, so their parts
// are charged to that run.
struct Uploads {
  explicit Uploads(gr::host::RunIdentity run)
      : identity(std::move(run)),
        jobs([](const gr::host::ProviderJobs::Call&) { return std::string("1"); }, {}, lane) {
    jobs.grant(options, {"p"}, [run = identity] { return run; });
  }
  std::string put(size_t bytes) {
    return options.operations.at("provider:p:jobs:put")(Json{{"data", std::string(bytes, 'u')}}.dump());
  }
  gr::host::RunIdentity identity;
  ThreadPoolExecutor lane{"uploads", 1};
  gr::host::ContextOptions options;
  gr::host::ProviderJobs jobs;
};

// Gate (re-check 1, upload first): a retained upload that only the guest can
// release never leaves a start waiting forever. The run may hold 100 bytes
// and an upload holds 30. With nothing running, a start needing 80 could
// never be admitted, so it fails at the call instead of waiting.
void uploadsBeforeAStartCannotStallIt() {
  Fixture f;
  auto ledger = std::make_shared<AdmissionLedger>();
  HeldExecutor held;
  Run r(*f.engine, ledger->openRunner(runnerLimits(0, 100)), held);
  Uploads uploads(r.identity);
  uploads.put(30);
  CHECK(r.usage().bytes == 30);
  std::optional<js::Value> promise;
  CHECK(contains(thrown([&] { promise = r.async.submit(sized(f.probe, "late", 80), textOf); }),
                 "can never start"));
  CHECK(r.async.deferred() == 0);
  promise.reset();
  r.async.teardown();
}

// Gate (re-check 1, upload second): an upload added while a start waits.
// The start waits for a running job. Then a 30-byte upload arrives. When the
// running job drains, the start still does not fit and nothing else can
// drain, so it fails instead of waiting forever.
void uploadsAfterADeferralCannotStallIt() {
  Fixture f;
  auto ledger = std::make_shared<AdmissionLedger>();
  HeldExecutor held;
  Run r(*f.engine, ledger->openRunner(runnerLimits(0, 100)), held);
  Uploads uploads(r.identity);
  f.engine->set(f.engine->global(), "active", r.async.submit(sized(f.probe, "active", 60), textOf));
  f.engine->set(f.engine->global(), "late", r.async.submit(sized(f.probe, "late", 80), textOf));
  f.eval("record(active); record(late);");
  CHECK(r.async.deferred() == 1);
  uploads.put(30);
  held.jobs[0].execute();
  CHECK(r.runUntil(*f.engine, [&] { return f.logged() == 2; }) == RunExit::Done);
  CHECK(contains(f.log(), "ok:active | Error:a waiting host operation can never start"));
  CHECK(r.async.deferred() == 0);
  CHECK(held.jobs.size() == 1);
  r.async.teardown();
}

// Gate (re-check 2): cancelling the head retries its successor. The run may
// hold 100 bytes and a job holds 60. A cancellable head needing 50 waits;
// behind it, a cleanup start needing 10 would fit. The admission signal is
// consumed. Cancelling drops the head, a slotless charge of nothing whose
// release reports nothing, and the successor is still admitted.
void cancellingTheHeadRetriesItsSuccessor() {
  Fixture f;
  auto ledger = std::make_shared<AdmissionLedger>();
  HeldExecutor held;
  Run r(*f.engine, ledger->openRunner(runnerLimits(0, 100)), held);
  std::vector<js::Value> promises;
  promises.push_back(r.async.submit(sized(f.probe, "active", 60), textOf));
  promises.push_back(r.async.submit(held, sized(f.probe, "head", 50), textOf, true));
  promises.push_back(r.async.submit(held, sized(f.probe, "cleanup", 10), textOf, false));
  CHECK(r.async.deferred() == 2);
  r.async.pollAdmission();
  CHECK(!r.async.resultsPending());
  r.async.cancel();
  CHECK(r.async.deferred() == 1);
  r.async.pollAdmission();
  CHECK(r.async.deferred() == 0);
  CHECK(held.jobs.size() == 2);
  promises.clear();
  r.async.teardown();
  held.jobs.clear();
}

// Gate (re-check 4): the replacement for an oversized error fits the
// response cap, header included: a short text for a small cap, and nothing
// more than the cap for a tiny one.
void errorDiagnosticsFitTheCap() {
  for (const size_t cap : {size_t{100}, size_t{30}, size_t{8}}) {
    gr::HostOptions options;
    options.context.maxPayloadBytes = cap;
    options.context.asyncOperations["fail"] = [](std::string, std::stop_token, gr::host::ContextCompletion done) {
      done(gr::host::ContextResult::error(std::string(4096, 'e')));
    };
    Fixture f;
    installContext(*f.engine, options);
    auto ledger = std::make_shared<AdmissionLedger>();
    nodetool::jobs::InlineExecutor io;
    Run r(*f.engine, ledger->openRunner(), io);
    gr::RunBinding::Scope bound(*f.engine, r.async, io);
    f.eval("__host.context.callAsync('fail', '{}').catch((e) => log.push(e.message));");
    CHECK(r.runUntil(*f.engine, [&] { return f.logged() == 1; }) == RunExit::Done);
    const std::string message = f.str("log[0]");
    CHECK(message.size() <= cap);
    if (cap == 100) CHECK(message.starts_with("Context error message exceeds the response limit") &&
                          message.ends_with("eee"));
    if (cap == 30) CHECK(message.starts_with("Context error"));
    r.async.teardown();
  }
}

// Gate (re-check 3): runs without an account share one fallback ledger,
// also when their first calls race. Eight threads put an upload for eight
// such runs at once, released by a barrier, on a fresh ProviderJobs each
// round. Every upload lands on the same ledger.
void fallbackRunsShareOneLedger() {
  using gr::host::ProviderJobs;
  constexpr int kRuns = 8;
  ThreadPoolExecutor lane("fallback", 1);
  int split = 0;
  for (int round = 0; round < 1000; ++round) {
    ProviderJobs jobs([](const ProviderJobs::Call&) { return std::string("1"); }, {}, lane);
    std::vector<gr::host::ContextOptions> options(kRuns);
    for (int i = 0; i < kRuns; ++i) {
      jobs.grant(options[i], {"p"}, [run = gr::host::newRunIdentity(std::to_string(i))] { return run; });
    }
    std::barrier sync(kRuns);
    std::vector<std::thread> threads;
    for (int i = 0; i < kRuns; ++i) {
      threads.emplace_back([&sync, &put = options[i].operations.at("provider:p:jobs:put")] {
        sync.arrive_and_wait();
        put(Json{{"data", std::string(100, 'u')}}.dump());
      });
    }
    for (auto& thread : threads) thread.join();
    if (jobs.stats().fallbackBytes != 100 * kRuns) ++split;
  }
  CHECK(split == 0);
  if (split != 0) std::fprintf(stderr, "%d of 1000 rounds split the fallback ledger\n", split);
}

// Gate: HostOptions and newAdmissionLedger lower the limits and cannot raise
// them. The limits' own clamping is tested with the ledger
// (native/jobs/tests/admission.cpp, limitsClampToTheDefaults).
void limitsOnlyLower() {
  const gr::HostJobLimits defaults;
  CHECK(defaults.runBytes == 0 && defaults.runOperations == 0);
  // The embedder configures a shared ledger when it creates it.
  CHECK(!gr::HostOptions{}.admissionLedger);
  const auto shared =
      gr::newAdmissionLedger({.bytes = 100, .operations = 0, .javaScriptBytes = 8 * nodetool::jobs::kGiB});
  CHECK(shared->limits().bytes == 100);
  CHECK(shared->limits().operations == 256);
  CHECK(shared->limits().javaScriptBytes == 4 * nodetool::jobs::kGiB);
}

struct Case {
  const char* name;
  void (*run)();
};

}  // namespace

// An argument runs only the case of that name.
int main(int argc, char** argv) {
  startWatchdog();
  const std::string only = argc > 1 ? argv[1] : "";
  const Case cases[] = {
      {"deferredSnapshotsIgnoreLaterMutation", deferredSnapshotsIgnoreLaterMutation},
      {"revalidationAndOverflow", revalidationAndOverflow},
      {"conversionCollectsGarbageBeforeRefusal", conversionCollectsGarbageBeforeRefusal},
      {"crossRunAndRunnerPressure", crossRunAndRunnerPressure},
      {"resultsKeepReservationsUntilDrainedOrDisposed", resultsKeepReservationsUntilDrainedOrDisposed},
      {"abandonedRunsKeepBackpressure", abandonedRunsKeepBackpressure},
      {"javaScriptTransferCharges", javaScriptTransferCharges},
      {"conversionRejectedWhenJavaScriptLedgerIsFull", conversionRejectedWhenJavaScriptLedgerIsFull},
      {"cancellationDropsDeferredStarts", cancellationDropsDeferredStarts},
      {"oversizedOperationsReject", oversizedOperationsReject},
      {"ledgerLocksNeverNest", ledgerLocksNeverNest},
      {"inlineJobsAreAccounted", inlineJobsAreAccounted},
      {"contextCallsAreAccounted", contextCallsAreAccounted},
      {"providerJobsAreAccounted", providerJobsAreAccounted},
      {"limitsOnlyLower", limitsOnlyLower},
      {"deferredSnapshotsLeaveRoomForTheirHead", deferredSnapshotsLeaveRoomForTheirHead},
      {"deferredSnapshotsLeaveRoomAcrossRuns", deferredSnapshotsLeaveRoomAcrossRuns},
      {"contextErrorsAreBounded", contextErrorsAreBounded},
      {"providerProgressIsBounded", providerProgressIsBounded},
      {"shrunkBuffersKeepTheMinimumCharge", shrunkBuffersKeepTheMinimumCharge},
      {"failedProviderStartsKeepTheirUpload", failedProviderStartsKeepTheirUpload},
      {"uploadsBeforeAStartCannotStallIt", uploadsBeforeAStartCannotStallIt},
      {"uploadsAfterADeferralCannotStallIt", uploadsAfterADeferralCannotStallIt},
      {"cancellingTheHeadRetriesItsSuccessor", cancellingTheHeadRetriesItsSuccessor},
      {"errorDiagnosticsFitTheCap", errorDiagnosticsFitTheCap},
      {"fallbackRunsShareOneLedger", fallbackRunsShareOneLedger},
  };
  for (const Case& c : cases) {
    if (!only.empty() && only != c.name) continue;
    currentTest = c.name;
    const int before = failures;
    watchdogDeadline = (Clock::now() + std::chrono::seconds(30)).time_since_epoch().count();
    try {
      c.run();
    } catch (const std::exception& e) {
      ++failures;
      std::fprintf(stderr, "%s threw: %s\n", c.name, e.what());
    }
    watchdogDeadline = 0;
    std::printf("%s %s\n", failures == before ? "PASS" : "FAIL", c.name);
  }
  std::printf("%d checks, %d failures\n", checks.load(), failures.load());
  return failures == 0 ? 0 : 1;
}
