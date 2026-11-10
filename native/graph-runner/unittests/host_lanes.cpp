// Step 2 of docs/plans/graph-runner-async-host.md: the process lanes,
// queued-job cancellation, submission snapshots, inline mode's limits and
// timed shutdown with the supervisor.
//
// The test host functions below submit native jobs the way a converted host
// function will: they copy their arguments at submission and hand the job to
// a lane. nativeEcho(text) is step 1's test host function.
#include "js/engine.h"
#include "kernel/async_jobs.h"
#include "kernel/cancel_state.h"
#include "kernel/host_lanes.h"
#include "kernel/job_inputs.h"
#include "kernel/run_control.h"
#include "kernel/task.h"
#include "nodetool/graph_runner.h"
#include "nodetool/host_lanes.h"
#include "nodetool/provider_jobs.h"

#include <atomic>
#include <chrono>
#include <condition_variable>
#include <coroutine>
#include <cstdio>
#include <cstdlib>
#include <functional>
#include <memory>
#include <mutex>
#include <optional>
#include <random>
#include <set>
#include <stop_token>
#include <string>
#include <thread>
#include <vector>

#include <pthread.h>

namespace {

// native-rules #14: file-scope mutable test counters
// Atomic: lane threads call CHECK concurrently in the stress test.
std::atomic<int> failures{0};
std::atomic<int> checks{0};

#define CHECK(cond)                                                                    \
  do {                                                                                 \
    ++checks;                                                                          \
    if (!(cond)) {                                                                     \
      ++failures;                                                                      \
      std::fprintf(stderr, "%s:%d: CHECK failed: %s\n", __FILE__, __LINE__, #cond);    \
    }                                                                                  \
  } while (0)

using gr::AsyncRun;
using gr::CancelState;
using gr::HostLanes;
using gr::HostShutdownStatus;
using gr::LaneSizes;
using gr::Loop;
using gr::RunExit;
using gr::Task;
using gr::ThreadPoolExecutor;
using nodetool::jobs::JobExecutor;
using nodetool::jobs::JobOutcome;
using nodetool::jobs::JobPayload;
using nodetool::jobs::RunnerTracker;
namespace js = gr::js;
using Clock = std::chrono::steady_clock;
using std::chrono::milliseconds;

double msSince(Clock::time_point start) {
  return std::chrono::duration<double, std::milli>(Clock::now() - start).count();
}

// A test that hangs fails the process instead of waiting for ctest. A
// shutdown that joined a live thread would hang here.
// native-rules #14: file-scope mutable watchdog gate
std::atomic<Clock::rep> watchdogDeadline{0};
// native-rules #14: file-scope mutable current-test name
const char* currentTest = "";

void startWatchdog() {
  // native-rules #13: detached watchdog thread outlives every test object
  std::thread([] {
    for (;;) {
      std::this_thread::sleep_for(milliseconds(50));
      const Clock::rep deadline = watchdogDeadline.load();
      if (deadline != 0 && Clock::now().time_since_epoch().count() > deadline) {
        std::fprintf(stderr, "TIMEOUT %s\n", currentTest);
        std::_Exit(1);
      }
    }
  }).detach();
}

// Polls `ready` until it holds or two seconds pass.
template <class F>
bool eventually(F ready) {
  const auto until = Clock::now() + std::chrono::seconds(2);
  while (!ready()) {
    if (Clock::now() > until) return false;
    std::this_thread::sleep_for(milliseconds(1));
  }
  return true;
}

// A gate jobs wait on. wait(stop) also returns when stop is requested.
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
  // True when the gate opened, false when stop was requested first.
  bool wait(std::stop_token stop) {
    std::unique_lock lock(mutex);
    return cv.wait(lock, stop, [this] { return open; });
  }
};

// Counts live copies of whatever holds it: jobs and payloads.
struct Alive {
  explicit Alive(std::shared_ptr<std::atomic<int>> c) : count(std::move(c)) { ++*count; }
  Alive(const Alive& other) : count(other.count) { ++*count; }
  Alive& operator=(const Alive&) = delete;
  ~Alive() { --*count; }
  // native-rules #1: counter shared by every copy, no justification
  std::shared_ptr<std::atomic<int>> count;
};

struct TextPayload final : JobPayload {
  TextPayload(std::string t, std::shared_ptr<std::atomic<int>> live)
      : text(std::move(t)), alive(std::move(live)) {}
  std::string text;
  Alive alive;
  std::thread::id destroyedOn;
};

// One engine with test host functions that submit to `lane`, or to the
// run's default executor when it is null.
struct Fixture {
  std::unique_ptr<js::Engine> engine = js::createQuickJsEngine();
  AsyncRun* run = nullptr;
  JobExecutor* lane = nullptr;
  // native-rules #1: counter shared with jobs, no justification
  std::shared_ptr<std::atomic<int>> liveJobs = std::make_shared<std::atomic<int>>(0);
  // native-rules #1: counter shared with payloads, no justification
  std::shared_ptr<std::atomic<int>> livePayloads = std::make_shared<std::atomic<int>>(0);
  std::vector<std::string> notes;
  // Threads that converted a payload, which must be the worker.
  std::set<std::thread::id> converters;

  using Work = std::function<JobOutcome(std::stop_token)>;

  // Submits `work`, which returns its text, as a job holding an Alive.
  js::Value submit(Work work) {
    auto job = nodetool::jobs::makeJob(
        [work = std::move(work), alive = Alive(liveJobs)](std::stop_token stop) { return work(std::move(stop)); });
    // native-rules #12: lambda captures raw this and runs on the worker later
    gr::Converter convert = [this](js::Engine& e, JobPayload* payload) {
      converters.insert(std::this_thread::get_id());
      return e.string(static_cast<TextPayload*>(payload)->text);
    };
    return lane ? run->submit(*lane, std::move(job), std::move(convert))
                : run->submit(std::move(job), std::move(convert));
  }
  JobOutcome text(std::string value) {
    return JobOutcome::value(std::make_unique<TextPayload>(std::move(value), livePayloads));
  }

  void bind(const std::string& name, std::function<js::Value(const std::vector<js::Value>&)> fn) {
    engine->set(engine->global(), name,
                engine->function(name, 1, [fn = std::move(fn)](js::Engine&, const std::vector<js::Value>& args) {
                  return fn(args);
                }));
  }

  Fixture() {
    // native-rules #12: lambda captures raw this and is stored in the engine, runs later
    bind("nativeEcho", [this](const std::vector<js::Value>& a) {
      std::string value = gr::snapshotString(*engine, a.at(0), "text");
      // native-rules #12: lambda captures raw this and runs on a lane thread
      return submit([this, value](std::stop_token) { return text(value); });
    });
    bind("note", [this](const std::vector<js::Value>& a) {
      notes.push_back(engine->toString(a.at(0)));
      return engine->undefined();
    });
  }
  ~Fixture() { Loop::current().abandon(); }

  js::Value eval(const std::string& source) { return engine->evaluateScript(source, "test.js"); }
  std::string str(const std::string& source) { return engine->toString(eval(source)); }
  std::string joined() const {
    std::string out;
    for (const auto& n : notes) out += (out.empty() ? "" : " ") + n;
    return out;
  }
  // Runs the loop until `script` evaluates to true.
  RunExit runUntil(CancelState& state, uint64_t generation, const std::string& script) {
    gr::EngineRunControl control(*engine, *run, state, generation, [&] { return str(script) == "true"; });
    return Loop::current().run(control);
  }
};

// Keeps submitted jobs so a test can run them later.
struct HeldExecutor final : JobExecutor {
  std::vector<nodetool::jobs::SubmittedJob> jobs;
  void submit(nodetool::jobs::SubmittedJob job) override { jobs.push_back(std::move(job)); }
};

// --- lane sizing ----------------------------------------------------------------

// Gate: lane sizing and HostOptions. CPU defaults to min(4, cores - 1) and at
// least 1, I/O to 8, network to ProviderJobs' maxJobs. Explicit sizes win,
// and a pool starts threads only for jobs, never more than its size.
void laneSizesAndHostOptions() {
  const size_t maxJobs = gr::host::ProviderJobs::Limits{}.maxJobs;
  auto sized = [](unsigned cores) { return gr::resolveLaneSizes({}, cores); };
  CHECK(sized(0).cpu == 1);
  CHECK(sized(1).cpu == 1);
  CHECK(sized(2).cpu == 1);
  CHECK(sized(4).cpu == 3);
  CHECK(sized(5).cpu == 4);
  CHECK(sized(64).cpu == 4);
  CHECK(sized(8).io == 8);
  CHECK(sized(8).network == maxJobs);
  const LaneSizes explicitSizes = gr::resolveLaneSizes({6, 2, 3}, 16);
  CHECK(explicitSizes.cpu == 6 && explicitSizes.io == 2 && explicitSizes.network == 3);

  const gr::HostOptions defaults;
  CHECK(defaults.cpuThreads == 0 && defaults.ioThreads == 0 && defaults.networkThreads == 0);
  CHECK(!defaults.inlineHostJobs);

  auto inlined = HostLanes::inlined();
  CHECK(inlined->isInline());
  CHECK(dynamic_cast<nodetool::jobs::InlineExecutor*>(&inlined->cpu()) != nullptr);
  CHECK(dynamic_cast<nodetool::jobs::InlineExecutor*>(&inlined->io()) != nullptr);
  CHECK(dynamic_cast<nodetool::jobs::InlineExecutor*>(&inlined->network()) != nullptr);
  CHECK(inlined->shutdown(Clock::now()) == HostShutdownStatus::Complete);

  auto threaded = HostLanes::threaded({3, 5, 7});
  CHECK(!threaded->isInline());
  CHECK(threaded->pool(HostLanes::Kind::Cpu)->maxThreads() == 3);
  CHECK(threaded->pool(HostLanes::Kind::Io)->maxThreads() == 5);
  CHECK(threaded->pool(HostLanes::Kind::Network)->maxThreads() == 7);
  CHECK(&threaded->cpu() == threaded->pool(HostLanes::Kind::Cpu));
  CHECK(threaded->liveThreads() == 0);
  CHECK(threaded->shutdown(Clock::now() + milliseconds(100)) == HostShutdownStatus::Complete);
}

// Gate: a pool runs at most its size of jobs at once, starts them in FIFO
// order, and starts threads only on demand.
void poolBoundsThreadsAndKeepsFifo() {
  Fixture f;
  Loop& loop = Loop::current();
  CancelState state;
  const uint64_t gen = state.beginRun();
  auto tracker = std::make_shared<RunnerTracker>();
  ThreadPoolExecutor pool("bounded", 3);
  ThreadPoolExecutor single("fifo", 1);
  AsyncRun async(*f.engine, loop, tracker, gen, pool);
  f.run = &async;
  CHECK(pool.liveThreads() == 0);

  std::mutex mutex;
  int runningNow = 0, peak = 0;
  std::vector<int> started;
  Gate gate;
  f.bind("nativeHold", [&](const std::vector<js::Value>& a) {
    const int index = static_cast<int>(f.engine->toNumber(a.at(0)));
    return f.submit([&, index](std::stop_token) {
      {
        std::lock_guard lock(mutex);
        ++runningNow;
        peak = std::max(peak, runningNow);
        started.push_back(index);
      }
      gate.wait();
      std::lock_guard lock(mutex);
      --runningNow;
      return f.text(std::to_string(index));
    });
  });
  f.eval("globalThis.done = 0; for (let i = 0; i < 10; i++) nativeHold(i).then(() => done++);");
  CHECK(eventually([&] { return pool.running() == 3; }));
  std::this_thread::sleep_for(milliseconds(30));
  CHECK(pool.running() == 3);
  CHECK(pool.queued() == 7);
  CHECK(pool.liveThreads() == 4);  // three workers and the reaper
  gate.release();
  CHECK(f.runUntil(state, gen, "done === 10") == RunExit::Done);
  {
    std::lock_guard lock(mutex);
    CHECK(peak == 3);
  }
  CHECK(pool.liveThreads() == 4);

  // One thread: jobs start in submission order.
  {
    std::lock_guard lock(mutex);
    started.clear();
  }
  f.lane = &single;
  f.eval("globalThis.done = 0; for (let i = 0; i < 20; i++) nativeHold(i).then(() => done++);");
  CHECK(f.runUntil(state, gen, "done === 20") == RunExit::Done);
  std::vector<int> expected(20);
  for (int i = 0; i < 20; ++i) expected[i] = i;
  {
    std::lock_guard lock(mutex);
    CHECK(started == expected);
  }
  CHECK(single.liveThreads() == 2);
  async.teardown();
  CHECK(tracker->outstanding() == 0);
}

// --- delivery -------------------------------------------------------------------

Task<void> chain(gr::Signal& gate, std::vector<std::string>& notes) {
  co_await gate.wait();
  notes.push_back("K1");
  co_await gr::Tick{};
  notes.push_back("K2");
}

// Gate: jobs on a real pool deliver through the mailbox to the worker, with
// section 4.5's ordering intact. r1 readies kernel step K1, which readies K2.
// r2 reaches the mailbox before K1 runs, and still settles only after K2.
// Jobs run on lane threads, and only the worker converts and settles.
void poolDeliversThroughMailboxInOrder() {
  Fixture f;
  Loop& loop = Loop::current();
  CancelState state;
  const uint64_t gen = state.beginRun();
  auto tracker = std::make_shared<RunnerTracker>();
  ThreadPoolExecutor pool("delivery", 2);
  AsyncRun async(*f.engine, loop, tracker, gen, pool);
  f.run = &async;
  const auto worker = std::this_thread::get_id();
  std::mutex mutex;
  std::set<std::thread::id> jobThreads;
  Gate r2Gate;
  f.bind("nativeLater", [&](const std::vector<js::Value>& a) {
    std::string value = gr::snapshotString(*f.engine, a.at(0), "text");
    return f.submit([&, value](std::stop_token) {
      {
        std::lock_guard lock(mutex);
        jobThreads.insert(std::this_thread::get_id());
      }
      r2Gate.wait();
      return f.text(value);
    });
  });
  gr::Signal gate;
  auto task = chain(gate, f.notes);
  f.bind("kick", [&](const std::vector<js::Value>&) {
    gate.notifyAll();
    r2Gate.release();
    // r2 is in the mailbox before K1 resumes.
    CHECK(eventually([&] { return async.resultsPending(); }));
    return f.engine->undefined();
  });
  f.eval("nativeEcho('r1').then((v) => { note(v); kick(); }); nativeLater('r2').then((v) => note(v));");
  gr::EngineRunControl control(*f.engine, async, state, gen, [&] { return f.notes.size() == 4; });
  CHECK(loop.run(control) == RunExit::Done);
  CHECK(task.done());
  CHECK(f.joined() == "r1 K1 K2 r2");
  CHECK((f.converters == std::set<std::thread::id>{worker}));
  {
    std::lock_guard lock(mutex);
    CHECK(!jobThreads.empty() && !jobThreads.count(worker));
  }
  async.teardown();
  CHECK(tracker->outstanding() == 0);
  CHECK(*f.livePayloads == 0);
}

// --- queued cancellation --------------------------------------------------------

// Gate: queued cancellation. On a one-thread lane, A runs and B, C and D
// wait. Ending the run takes B, C and D off the queue at once, and the
// lane's reaper destroys them: they never run, nothing reaches the closed
// mailbox, and each tracker ticket is released once. A finishes later and
// its result is destroyed on its lane thread.
void queuedJobsCancelledWithRun() {
  Fixture f;
  Loop& loop = Loop::current();
  CancelState state;
  const uint64_t gen = state.beginRun();
  auto tracker = std::make_shared<RunnerTracker>();
  ThreadPoolExecutor pool("queued", 1);
  Gate gate;
  std::atomic<int> ran{0};
  std::atomic<bool> aSawStop{false};
  {
    AsyncRun async(*f.engine, loop, tracker, gen, pool);
    f.run = &async;
    f.bind("nativeA", [&](const std::vector<js::Value>&) {
      return f.submit([&](std::stop_token stop) {
        gate.wait();  // ignores stop
        aSawStop = stop.stop_requested();
        return f.text("A");
      });
    });
    f.bind("nativeQueued", [&](const std::vector<js::Value>& a) {
      std::string value = gr::snapshotString(*f.engine, a.at(0), "text");
      return f.submit([&, value](std::stop_token) {
        ++ran;
        return f.text(value);
      });
    });
    f.eval("globalThis.settled = []; const keep = (v) => settled.push(v);"
           "nativeA().then(keep, keep); for (const n of ['B', 'C', 'D']) nativeQueued(n).then(keep, keep);");
    CHECK(eventually([&] { return pool.running() == 1; }));
    CHECK(pool.queued() == 3);
    CHECK(tracker->outstanding(gen) == 4);
    CHECK(*f.liveJobs == 4);
    async.teardown();
    // Off the queue at once, destroyed by the lane's reaper, and A's stop
    // request forwarded through it.
    CHECK(pool.queued() == 0);
    CHECK(eventually([&] { return pool.pendingReaps() == 0; }));
    CHECK(*f.liveJobs == 1);
    CHECK(tracker->outstanding(gen) == 1);
    CHECK(async.inFlight() == 0);
    loop.abandon();
  }
  f.run = nullptr;
  state.endRun();
  gate.release();
  CHECK(tracker->waitIdle(Clock::now() + std::chrono::seconds(2)));
  CHECK(ran == 0);
  CHECK(aSawStop);
  CHECK(*f.liveJobs == 0);
  CHECK(*f.livePayloads == 0);
  CHECK(tracker->outstanding() == 0);
  CHECK(f.converters.empty());
  f.engine->drainJobs();
  CHECK(f.str("String(settled.length)") == "0");
  CHECK(pool.shutdown(Clock::now() + std::chrono::seconds(2)) == HostShutdownStatus::Complete);
}

// --- submission snapshots -------------------------------------------------------

// Gate: inputs are copied at submission. After each call the script mutates,
// detaches or resizes what it passed, and only then do the jobs run. Each job
// sees the bytes, string or options as they were at the call. Detached and
// out-of-bounds buffers are rejected at the call, leaving no exception
// behind. Runs once with jobs held and run on the worker, once on a pool.
void inputsCopiedAtSubmission(bool onPool) {
  Fixture f;
  Loop& loop = Loop::current();
  CancelState state;
  const uint64_t gen = state.beginRun();
  auto tracker = std::make_shared<RunnerTracker>();
  HeldExecutor held;
  ThreadPoolExecutor pool("snapshot", 2);
  Gate gate;
  AsyncRun async(*f.engine, loop, tracker, gen, onPool ? static_cast<JobExecutor&>(pool) : held);
  f.run = &async;
  f.bind("nativeBytes", [&](const std::vector<js::Value>& a) {
    std::vector<uint8_t> bytes = gr::snapshotBytes(*f.engine, a.at(0), "data");
    return f.submit([&, bytes = std::move(bytes)](std::stop_token) {
      gate.wait();
      std::string out;
      for (uint8_t b : bytes) out += (out.empty() ? "" : ",") + std::to_string(b);
      return f.text(out);
    });
  });
  f.bind("nativeOptions", [&](const std::vector<js::Value>& a) {
    std::string options = gr::snapshotOptions(*f.engine, a.at(0), "options");
    return f.submit([&, options](std::stop_token) {
      gate.wait();
      return f.text(options);
    });
  });
  f.eval(R"JS(
    globalThis.out = [];
    const keep = (label) => (v) => out.push(label + ':' + v);
    const u = new Uint8Array([1, 2, 3, 4]);
    nativeBytes(u).then(keep('mutated'));
    u[0] = 9; u.fill(7, 1);
    const b = new ArrayBuffer(3); new Uint8Array(b).set([5, 6, 7]);
    nativeBytes(b).then(keep('detached'));
    b.transfer();
    const r = new ArrayBuffer(4, { maxByteLength: 8 }); const rv = new Uint8Array(r); rv.set([1, 1, 2, 3]);
    nativeBytes(rv).then(keep('resized'));
    r.resize(1); r.resize(8); rv.fill(9);
    const whole = new Uint8Array([0, 1, 2, 3, 4, 5]);
    nativeBytes(new Uint8Array(whole.buffer, 2, 3)).then(keep('view'));
    whole.fill(0);
    const opts = { size: 1, nested: { k: 'a' } };
    nativeOptions(opts).then(keep('options'));
    opts.size = 2; opts.nested.k = 'b';
    globalThis.rejected = [];
    const reject = (label, fn) => { try { fn(); rejected.push(label + ':accepted'); } catch (e) { rejected.push(label + ':' + e.message); } };
    const gone = new ArrayBuffer(2); const goneView = new Uint8Array(gone); gone.transfer();
    reject('buffer', () => nativeBytes(gone));
    reject('view', () => nativeBytes(goneView));
    const shrunk = new ArrayBuffer(4, { maxByteLength: 8 }); const fixed = new Uint8Array(shrunk, 0, 4); shrunk.resize(2);
    reject('oob', () => nativeBytes(fixed));
    reject('type', () => nativeBytes('text'));
    reject('fn', () => nativeOptions(() => 1));
  )JS");
  CHECK(f.str("rejected.join('|')") ==
        "buffer:data is a detached or out-of-bounds buffer|view:data is a detached or out-of-bounds buffer|"
        "oob:data is a detached or out-of-bounds buffer|type:data must be an ArrayBuffer or a typed array|"
        "fn:options must be an object");
  CHECK(f.str("String(1 + 1)") == "2");  // no exception was left pending
  gate.release();
  if (!onPool) {
    for (auto& job : held.jobs) job.execute();
    held.jobs.clear();
  }
  CHECK(f.runUntil(state, gen, "out.length === 5") == RunExit::Done);
  // Lane results arrive in any order.
  CHECK(f.str("out.sort().join('|')") ==
        "detached:5,6,7|mutated:1,2,3,4|options:{\"size\":1,\"nested\":{\"k\":\"a\"}}|"
        "resized:1,1,2,3|view:2,3,4");
  async.teardown();
  CHECK(tracker->outstanding() == 0);
}

// --- inline responsiveness --------------------------------------------------------

Task<void> callScript(Fixture& f, std::string script) {
  co_await gr::Tick{};
  f.eval(script);
}

// Gate: inline responsiveness limits. A job held on a gate shows what each
// mode allows while it runs. Inline, the job runs inside the host call: a
// timer due meanwhile fires only after the job returned, and a cancelled
// run's deadline ends the loop only after the job returned. On a lane the
// worker fires the timer while the job is held, and the loop returns at the
// deadline with the job still held.
void inlineResponsivenessLimits() {
  for (const bool inlineMode : {true, false}) {
    for (const bool cancelled : {false, true}) {
      Fixture f;
      Loop& loop = Loop::current();
      CancelState state;
      const uint64_t gen = state.beginRun();
      auto tracker = std::make_shared<RunnerTracker>();
      auto lanes = inlineMode ? HostLanes::inlined() : HostLanes::threaded({1, 1, 1});
      Gate gate, started;
      std::atomic<bool> finished{false};
      std::atomic<bool> released{false};
      const auto deadline = Clock::now() + milliseconds(500);
      {
        AsyncRun async(*f.engine, loop, tracker, gen, lanes->cpu());
        f.run = &async;
        f.bind("nativeHeld", [&](const std::vector<js::Value>&) {
          return f.submit([&](std::stop_token) {
            started.release();
            gate.wait();  // a native call that cannot stop
            finished = true;
            return f.text("held");
          });
        });
        // Inline, nothing on the worker can open the gate while the job
        // holds it, so another thread does: after the timer is due, or after
        // the cancel deadline passed.
        std::thread opener;
        if (inlineMode) {
          opener = std::thread([&] {
            started.wait();
            std::this_thread::sleep_until(cancelled ? deadline + milliseconds(50)
                                                    : Clock::now() + milliseconds(20));
            released = true;
            gate.release();
          });
        }
        if (!cancelled) {
          bool timerSawJobHeld = false;
          bool timerFired = false;
          loop.setTimer(milliseconds(1), [&] {
            timerFired = true;
            timerSawJobHeld = !finished;
            if (!inlineMode) gate.release();
          });
          auto task = callScript(f, "globalThis.done = false; nativeHeld().then(() => { done = true; });");
          CHECK(f.runUntil(state, gen, "done") == RunExit::Done);
          CHECK(timerFired);
          CHECK(timerSawJobHeld == !inlineMode);
        } else {
          auto task = callScript(f, "nativeHeld()");
          state.request(gen, deadline);
          gr::EngineRunControl control(*f.engine, async, state, gen, [] { return false; });
          CHECK(loop.run(control) == RunExit::Deadline);
          // Inline, the loop came back only after the job returned. On a lane
          // the job is still held: only this thread opens its gate.
          CHECK(finished == inlineMode);
          CHECK(released == inlineMode);
          if (!inlineMode) gate.release();
        }
        if (opener.joinable()) opener.join();
        async.teardown();
        loop.clearTimers();
        loop.abandon();
      }
      f.run = nullptr;
      CHECK(tracker->waitIdle(Clock::now() + std::chrono::seconds(2)));
      CHECK(lanes->shutdown(Clock::now() + std::chrono::seconds(2)) == HostShutdownStatus::Complete);
    }
  }
}

// --- timed shutdown -------------------------------------------------------------

// Gate: shutdown timeout without joining live threads and without process
// exit. A two-thread lane runs a job that ignores stop and one that honours
// it, with a third queued. shutdown() stops admission, rejects the queued job
// with an AbortError, requests stop, and returns TimedOut at its deadline:
// the cooperative thread was joined, the stuck one was not. The process goes
// on (an at_quick_exit handler fails the test otherwise). A later submission
// is rejected. Once the stuck job returns, a retry completes.
void shutdownTimesOutWithoutJoiningLiveThreads() {
  Fixture f;
  Loop& loop = Loop::current();
  CancelState state;
  const uint64_t gen = state.beginRun();
  auto tracker = std::make_shared<RunnerTracker>();
  ThreadPoolExecutor pool("shutdown", 2);
  Gate stuck, cooperative;
  std::atomic<bool> sawStop{false};
  std::atomic<int> queuedRan{0};
  AsyncRun async(*f.engine, loop, tracker, gen, pool);
  f.run = &async;
  f.bind("nativeStuck", [&](const std::vector<js::Value>&) {
    return f.submit([&](std::stop_token) {
      stuck.wait();
      return f.text("done");
    });
  });
  f.bind("nativeCooperative", [&](const std::vector<js::Value>&) {
    return f.submit([&](std::stop_token stop) {
      if (!cooperative.wait(stop)) {
        sawStop = true;
        return JobOutcome::stopped();
      }
      return f.text("released");
    });
  });
  f.bind("nativeCounted", [&](const std::vector<js::Value>&) {
    return f.submit([&](std::stop_token) {
      ++queuedRan;
      return f.text("ran");
    });
  });
  f.eval("globalThis.out = []; const keep = (label) => [(v) => out.push(label + ':' + v), "
         "(e) => out.push(label + ':' + e.name + ':' + e.message)];"
         "nativeStuck().then(...keep('stuck')); nativeCooperative().then(...keep('coop'));"
         "nativeCounted().then(...keep('queued'));");
  CHECK(eventually([&] { return pool.running() == 2; }));
  CHECK(pool.queued() == 1);

  const auto start = Clock::now();
  const HostShutdownStatus status = pool.shutdown(start + milliseconds(100));
  const double elapsed = msSince(start);
  CHECK(status == HostShutdownStatus::TimedOut);
  CHECK(elapsed >= 95);
  CHECK(elapsed < 1000);
  CHECK(sawStop);
  CHECK(pool.liveThreads() == 1);
  CHECK(pool.running() == 1);

  f.eval("nativeCounted().then(...keep('late'));");
  CHECK(f.runUntil(state, gen, "out.length === 3") == RunExit::Done);
  // The cooperative job and shutdown deliver from different threads.
  CHECK(f.str("out.sort().join('|')") ==
        "coop:AbortError:The operation was aborted|late:AbortError:The host lanes are shut down|"
        "queued:AbortError:The host lanes are shut down");
  CHECK(queuedRan == 0);

  stuck.release();
  CHECK(pool.shutdown(Clock::now() + std::chrono::seconds(5)) == HostShutdownStatus::Complete);
  CHECK(pool.liveThreads() == 0);
  CHECK(f.runUntil(state, gen, "out.length === 4") == RunExit::Done);
  CHECK(f.str("out[3]") == "stuck:done");
  async.teardown();
  CHECK(tracker->outstanding() == 0);
  CHECK(*f.liveJobs == 0);
}

// A detached job whose refused() records its thread and blocks until its
// gate opens, as a refusal callback that wakes a waiter might.
//
// Thread affinity: refused() runs on the refusing thread or the disposer.
// The shared state is atomics and a gate.
struct BlockingRefusal final : nodetool::jobs::NativeJob {
  struct Seen {
    Gate gate;
    Gate entered;
    std::atomic<std::thread::id> thread{};
  };
  explicit BlockingRefusal(std::shared_ptr<Seen> s) : seen(std::move(s)) {}
  JobOutcome run(std::stop_token) override { return JobOutcome::value(nullptr); }
  void refused(const JobOutcome&) override {
    seen->thread = std::this_thread::get_id();
    seen->entered.release();
    seen->gate.wait();
  }
  // Shared with the test, which opens the gate.
  std::shared_ptr<Seen> seen;
};

// Gate: a detached job submitted to a shut-down lane from a worker thread.
// submit() returns while the job's refused() callback is still blocked,
// and that callback runs on the process disposer's refusal thread.
void detachedRefusalLeavesTheSubmitter() {
  ThreadPoolExecutor pool("refused", 1);
  pool.shutdown(Clock::now());
  auto seen = std::make_shared<BlockingRefusal::Seen>();
  auto returned = std::make_shared<Gate>();
  std::thread worker([&pool, seen, returned] {
    pool.submit(
        nodetool::jobs::SubmittedJob(0, std::make_unique<BlockingRefusal>(seen), nullptr, {}, RunnerTracker::Ticket{}));
    returned->release();
  });
  const auto workerId = worker.get_id();
  bool prompt = false;
  {
    std::unique_lock lock(returned->mutex);
    prompt = returned->cv.wait_for(lock, std::chrono::seconds(2), [&] { return returned->open; });
  }
  CHECK(prompt);
  seen->entered.wait();
  CHECK(seen->thread.load() != workerId);
  CHECK(seen->thread.load() == gr::processJobDisposer().refusalThread());
  seen->gate.release();
  worker.join();
}

// Gate: the process lanes and their supervisor. shutdownHostLanes() times out
// while a job ignores stop, and hands back a supervisor. With every strong
// reference the caller held dropped, the lanes and the running thread stay
// alive: the process keeps them. A later shutdown after the job returns
// completes. Runs last: the process lanes stay shut down.
void processLanesSupervisor() {
  Fixture f;
  Loop& loop = Loop::current();
  CancelState state;
  const uint64_t gen = state.beginRun();
  auto tracker = std::make_shared<RunnerTracker>();
  auto lanes = gr::processHostLanes({1, 1, 1});
  CHECK(gr::processHostLanes({5, 5, 5}) == lanes);  // sized once per process
  CHECK(lanes->pool(HostLanes::Kind::Cpu)->maxThreads() == 1);
  std::weak_ptr<HostLanes> weak = lanes;
  Gate stuck;
  AsyncRun async(*f.engine, loop, tracker, gen, lanes->io());
  f.run = &async;
  f.bind("nativeStuck", [&](const std::vector<js::Value>&) {
    return f.submit([&](std::stop_token) {
      stuck.wait();
      return f.text("done");
    });
  });
  f.eval("globalThis.out = []; nativeStuck().then((v) => out.push(v));");
  CHECK(eventually([&] { return lanes->pool(HostLanes::Kind::Io)->running() == 1; }));
  lanes.reset();

  const auto start = Clock::now();
  gr::HostShutdown shutdown = gr::shutdownHostLanes(start + milliseconds(50));
  CHECK(msSince(start) < 1000);
  CHECK(shutdown.status == HostShutdownStatus::TimedOut);
  CHECK(shutdown.supervisor != nullptr);
  CHECK(shutdown.supervisor && shutdown.supervisor->liveThreads() == 1);
  std::weak_ptr<gr::HostLaneSupervisor> weakSupervisor = shutdown.supervisor;
  shutdown = {};  // the last strong reference this test held
  CHECK(!weak.expired());
  CHECK(!weakSupervisor.expired());
  CHECK(weak.lock()->pool(HostLanes::Kind::Io)->running() == 1);

  f.eval("nativeEcho('late').then((v) => out.push(v), (e) => out.push(e.name));");
  stuck.release();
  CHECK(gr::shutdownHostLanes(Clock::now() + std::chrono::seconds(5)).status == HostShutdownStatus::Complete);
  CHECK(weak.lock()->liveThreads() == 0);
  if (auto supervisor = weakSupervisor.lock()) CHECK(supervisor->liveThreads() == 0);
  CHECK(f.runUntil(state, gen, "out.length === 2") == RunExit::Done);
  CHECK(f.str("out.join('|')") == "AbortError|done");
  async.teardown();
  CHECK(tracker->outstanding() == 0);
}

// --- job code on the reaper -----------------------------------------------------

// A job that registers a stop callback which blocks until `release` opens,
// then waits for stop.
std::unique_ptr<nodetool::jobs::NativeJob> blockingCallbackJob(Gate& release, std::atomic<bool>& entered) {
  return nodetool::jobs::makeJob([&release, &entered](std::stop_token stop) {
    std::stop_callback blocker(stop, [&] {
      entered = true;
      release.wait();
    });
    while (!stop.stop_requested()) std::this_thread::sleep_for(milliseconds(1));
    return JobOutcome::stopped();
  });
}

// Gate: a stop callback that blocks cannot extend shutdown's deadline or the
// worker's teardown. Shutdown returns TimedOut at its deadline while the
// callback blocks on the reaper. Teardown returns while the callback blocks.
void blockingStopCallback() {
  Fixture f;
  Loop& loop = Loop::current();
  CancelState state;
  auto tracker = std::make_shared<RunnerTracker>();
  {
    ThreadPoolExecutor pool("callback-shutdown", 1);
    const uint64_t gen = state.beginRun();
    AsyncRun async(*f.engine, loop, tracker, gen, pool);
    Gate release;
    std::atomic<bool> entered{false};
    async.submit(blockingCallbackJob(release, entered), {});
    CHECK(eventually([&] { return pool.running() == 1; }));
    const auto start = Clock::now();
    CHECK(pool.shutdown(start + milliseconds(100)) == HostShutdownStatus::TimedOut);
    CHECK(msSince(start) < 1000);
    CHECK(eventually([&] { return entered.load(); }));
    release.release();
    CHECK(pool.shutdown(Clock::now() + std::chrono::seconds(5)) == HostShutdownStatus::Complete);
    async.teardown();
    state.endRun();
  }
  {
    ThreadPoolExecutor pool("callback-teardown", 1);
    const uint64_t gen = state.beginRun();
    Gate release;
    std::atomic<bool> entered{false};
    {
      AsyncRun async(*f.engine, loop, tracker, gen, pool);
      async.submit(blockingCallbackJob(release, entered), {});
      CHECK(eventually([&] { return pool.running() == 1; }));
      async.teardown();  // returns although the callback blocks
      loop.abandon();
    }
    CHECK(eventually([&] { return entered.load(); }));
    CHECK(pool.running() == 1);
    release.release();
    CHECK(tracker->waitIdle(Clock::now() + std::chrono::seconds(5)));
    CHECK(pool.shutdown(Clock::now() + std::chrono::seconds(5)) == HostShutdownStatus::Complete);
    state.endRun();
  }
  CHECK(tracker->outstanding() == 0);
}

// A job input whose destructor blocks until `release` opens.
struct BlockingInput {
  BlockingInput(Gate& g, std::atomic<bool>& e) : gate(&g), entered(&e) {}
  BlockingInput(BlockingInput&& other) noexcept : gate(std::exchange(other.gate, nullptr)), entered(other.entered) {}
  BlockingInput& operator=(BlockingInput&&) = delete;
  ~BlockingInput() {
    if (!gate) return;
    *entered = true;
    gate->wait();
  }
  Gate* gate;
  std::atomic<bool>* entered;
};

// Gate: destroying a job's inputs cannot extend shutdown's deadline or the
// worker's teardown. A one-thread lane runs a job held on a gate, and a
// second job, whose input's destructor blocks, waits in the queue. Shutdown
// cancels it and returns TimedOut at its deadline. Teardown discards it and
// returns. Each time the destructor blocks on the reaper meanwhile.
void blockingInputDestructor() {
  Fixture f;
  Loop& loop = Loop::current();
  CancelState state;
  auto tracker = std::make_shared<RunnerTracker>();
  for (const bool viaShutdown : {true, false}) {
    ThreadPoolExecutor pool(viaShutdown ? "input-shutdown" : "input-teardown", 1);
    const uint64_t gen = state.beginRun();
    Gate hold, release;
    std::atomic<bool> entered{false};
    {
      AsyncRun async(*f.engine, loop, tracker, gen, pool);
      async.submit(nodetool::jobs::makeJob([&hold](std::stop_token) {
                     hold.wait();
                     return JobOutcome::stopped();
                   }),
                   {});
      async.submit(nodetool::jobs::makeJob(
                       [input = BlockingInput(release, entered)](std::stop_token) { return JobOutcome::stopped(); }),
                   {});
      CHECK(eventually([&] { return pool.running() == 1; }));
      CHECK(pool.queued() == 1);
      if (viaShutdown) {
        const auto start = Clock::now();
        CHECK(pool.shutdown(start + milliseconds(100)) == HostShutdownStatus::TimedOut);
        CHECK(msSince(start) < 1000);
      } else {
        async.teardown();  // returns although the destructor blocks
      }
      CHECK(eventually([&] { return entered.load(); }));
      CHECK(pool.queued() == 0);
      release.release();
      hold.release();
      CHECK(pool.shutdown(Clock::now() + std::chrono::seconds(5)) == HostShutdownStatus::Complete);
      async.teardown();
      loop.abandon();
    }
    CHECK(tracker->waitIdle(Clock::now() + std::chrono::seconds(5)));
    state.endRun();
  }
}

// A job result whose destructor blocks until `gate` opens.
struct BlockingPayload final : JobPayload {
  BlockingPayload(Gate& g, std::atomic<bool>& e, std::atomic<bool>& onWorker)
      : gate(&g), entered(&e), destroyedOnWorker(&onWorker) {}
  ~BlockingPayload() override {
    *entered = true;
    *destroyedOnWorker = std::this_thread::get_id() == teardownThread;
    gate->wait();
  }
  Gate* gate;
  std::atomic<bool>* entered;
  std::atomic<bool>* destroyedOnWorker;
  // native-rules #14: static mutable test gate shared across payload objects
  static inline std::thread::id teardownThread;
};

// Gate: a finished job's result that waits in the mailbox when its run is
// torn down is destroyed by the lane's reaper, so a payload destructor that
// blocks cannot block the worker's teardown.
void blockingResultPayload() {
  Fixture f;
  Loop& loop = Loop::current();
  CancelState state;
  auto tracker = std::make_shared<RunnerTracker>();
  const uint64_t gen = state.beginRun();
  ThreadPoolExecutor pool("payload-teardown", 1);
  Gate release;
  std::atomic<bool> entered{false}, onWorker{false};
  BlockingPayload::teardownThread = std::this_thread::get_id();
  {
    AsyncRun async(*f.engine, loop, tracker, gen, pool);
    async.submit(nodetool::jobs::makeJob([&](std::stop_token) {
                   return JobOutcome::value(std::make_unique<BlockingPayload>(release, entered, onWorker));
                 }),
                 {});
    CHECK(eventually([&] { return async.resultsPending(); }));
    const auto start = Clock::now();
    async.teardown();  // returns although the payload's destructor blocks
    CHECK(msSince(start) < 1000);
    CHECK(eventually([&] { return entered.load(); }));
    CHECK(!onWorker.load());
    release.release();
    CHECK(pool.shutdown(Clock::now() + std::chrono::seconds(5)) == HostShutdownStatus::Complete);
    loop.abandon();
  }
  CHECK(tracker->waitIdle(Clock::now() + std::chrono::seconds(5)));
  state.endRun();
}

// --- thread exit ----------------------------------------------------------------

Gate* tlsGate = nullptr;
// native-rules #14: file-scope mutable test gate
std::atomic<bool> tlsEntered{false};

// A thread_local whose destructor blocks until tlsGate opens.
struct TlsBlocker {
  bool armed = false;
  ~TlsBlocker() {
    if (!armed) return;
    tlsEntered = true;
    tlsGate->wait();
  }
};

// Gate: a lane thread counts as exited only after its thread_locals are
// destroyed. A job leaves a thread_local whose destructor blocks. Shutdown
// returns TimedOut at its deadline without joining that thread, and joins
// it once the destructor returns.
void blockingThreadLocalDestructor() {
  Fixture f;
  Loop& loop = Loop::current();
  CancelState state;
  const uint64_t gen = state.beginRun();
  auto tracker = std::make_shared<RunnerTracker>();
  Gate gate;
  tlsGate = &gate;
  tlsEntered = false;
  ThreadPoolExecutor pool("thread-local", 1);
  AsyncRun async(*f.engine, loop, tracker, gen, pool);
  f.run = &async;
  f.bind("nativeTls", [&](const std::vector<js::Value>&) {
    return f.submit([&](std::stop_token) {
      // native-rules #14: thread_local test gate
      thread_local TlsBlocker blocker;
      blocker.armed = true;
      return f.text("ran");
    });
  });
  f.eval("globalThis.done = false; nativeTls().then(() => { done = true; });");
  CHECK(f.runUntil(state, gen, "done") == RunExit::Done);
  const auto start = Clock::now();
  CHECK(pool.shutdown(start + milliseconds(100)) == HostShutdownStatus::TimedOut);
  CHECK(msSince(start) < 1000);
  CHECK(tlsEntered);
  CHECK(pool.liveThreads() == 1);  // the reaper was joined, the worker not
  gate.release();
  CHECK(pool.shutdown(Clock::now() + std::chrono::seconds(5)) == HostShutdownStatus::Complete);
  CHECK(pool.liveThreads() == 0);
  async.teardown();
  tlsGate = nullptr;
}

Gate* tsdGate = nullptr;
// native-rules #14: file-scope mutable test gate
std::atomic<bool> tsdEntered{false};

// Gate: concurrent retries. A pthread key destructor runs after the lane
// thread confirmed its exit, so caller A, which joins it, waits in the join
// while the destructor blocks. Caller B, retrying meanwhile, must not report
// Complete before A's join returned: it times out with the thread still
// live. A then completes.
void concurrentRetry() {
  Fixture f;
  Loop& loop = Loop::current();
  CancelState state;
  const uint64_t gen = state.beginRun();
  auto tracker = std::make_shared<RunnerTracker>();
  Gate gate;
  tsdGate = &gate;
  tsdEntered = false;
  pthread_key_t key;
  CHECK(pthread_key_create(&key, [](void*) {
          tsdEntered = true;
          tsdGate->wait();
        }) == 0);
  ThreadPoolExecutor pool("retry", 1);
  AsyncRun async(*f.engine, loop, tracker, gen, pool);
  f.run = &async;
  f.bind("nativeTsd", [&](const std::vector<js::Value>&) {
    return f.submit([&](std::stop_token) {
      pthread_setspecific(key, &tsdEntered);
      return f.text("ran");
    });
  });
  f.eval("globalThis.done = false; nativeTsd().then(() => { done = true; });");
  CHECK(f.runUntil(state, gen, "done") == RunExit::Done);
  HostShutdownStatus first = HostShutdownStatus::TimedOut;
  std::thread callerA([&] { first = pool.shutdown(Clock::now() + std::chrono::seconds(10)); });
  CHECK(eventually([&] { return tsdEntered.load(); }));
  const HostShutdownStatus second = pool.awaitShutdown(Clock::now() + milliseconds(200));
  CHECK(second == HostShutdownStatus::TimedOut);
  CHECK(pool.liveThreads() == 1);
  gate.release();
  callerA.join();
  CHECK(first == HostShutdownStatus::Complete);
  CHECK(pool.awaitShutdown(Clock::now()) == HostShutdownStatus::Complete);
  CHECK(pool.liveThreads() == 0);
  pthread_key_delete(key);
  async.teardown();
  tsdGate = nullptr;
}

// Gate: SharedArrayBuffer inputs. The engine has SharedArrayBuffer and
// resizable ArrayBuffer. A growable SharedArrayBuffer throws on creation,
// because the engine installs no SharedArrayBuffer allocator. A typed array
// over a SharedArrayBuffer is copied at the call like any other view, so
// writes afterwards do not reach the job. A SharedArrayBuffer itself is
// rejected: it is not an ArrayBuffer or a typed array.
void sharedBufferInputsCopied() {
  Fixture f;
  Loop& loop = Loop::current();
  CancelState state;
  const uint64_t gen = state.beginRun();
  auto tracker = std::make_shared<RunnerTracker>();
  HeldExecutor held;
  AsyncRun async(*f.engine, loop, tracker, gen, held);
  f.run = &async;
  CHECK(f.str("typeof SharedArrayBuffer") == "function");
  CHECK(f.str("(() => { try { new SharedArrayBuffer(1, { maxByteLength: 4 }); return 'created'; } "
              "catch (e) { return e.message; } })()") == "growable SharedArrayBuffer requires SAB allocator hooks");
  CHECK(f.str("String(new ArrayBuffer(1, { maxByteLength: 4 }).resizable)") == "true");
  f.bind("nativeBytes", [&](const std::vector<js::Value>& a) {
    std::vector<uint8_t> bytes = gr::snapshotBytes(*f.engine, a.at(0), "data");
    return f.submit([&, bytes = std::move(bytes)](std::stop_token) {
      std::string out;
      for (uint8_t b : bytes) out += (out.empty() ? "" : ",") + std::to_string(b);
      return f.text(out);
    });
  });
  f.eval(R"JS(
    globalThis.out = [];
    const keep = (label) => (v) => out.push(label + ':' + v);
    const sab = new SharedArrayBuffer(3); const sv = new Uint8Array(sab); sv.set([4, 5, 6]);
    nativeBytes(sv).then(keep('shared'));
    sv.fill(0);
    const part = new Uint8Array(sab, 1, 2);
    nativeBytes(part).then(keep('view'));
    sv.fill(9);
    try { nativeBytes(sab); out.push('sab:accepted'); } catch (e) { out.push('sab:' + e.message); }
  )JS");
  for (auto& job : held.jobs) job.execute();  // after the writes
  held.jobs.clear();
  CHECK(f.runUntil(state, gen, "out.length === 3") == RunExit::Done);
  CHECK(f.str("out.join('|')") == "sab:data must be an ArrayBuffer or a typed array|shared:4,5,6|view:0,0");
  async.teardown();
  CHECK(tracker->outstanding() == 0);
}

// --- stress ---------------------------------------------------------------------

// What happened to one stress job.
struct JobRecord {
  std::atomic<int> ran{0};
  std::atomic<int> stopped{0};
  std::atomic<int> payloadsDestroyed{0};
  std::atomic<int> converted{0};
};

struct RecordedPayload final : JobPayload {
  explicit RecordedPayload(JobRecord& r) : record(r) {}
  ~RecordedPayload() override { ++record.payloadsDestroyed; }
  JobRecord& record;
};

// Gate: many jobs across three shared lanes from two workers, each run ended
// midway. Every job has exactly one terminal outcome, recorded by its id:
// ran and delivered (its promise settled), ran and disposed (its result
// destroyed without settling), ran and stopped, or discarded (never ran).
// Afterwards no settler, tracker ticket or job is left, and the lanes shut
// down Complete.
void stressManyJobsWithCancellation() {
  constexpr int kWorkers = 2;
  constexpr int kRounds = 12;
  constexpr int kJobs = 200;
  constexpr int kTotal = kWorkers * kRounds * kJobs;
  auto lanes = HostLanes::threaded({3, 2, 2});
  auto tracker = std::make_shared<RunnerTracker>();
  auto liveJobs = std::make_shared<std::atomic<int>>(0);
  // Outlives every job: checked only after the tracker is idle.
  std::vector<JobRecord> records(kTotal);
  std::atomic<int> leftoverSettlers{0}, fulfilled{0}, rejected{0};
  std::atomic<uint64_t> nextRun{1};
  std::vector<std::thread> workers;
  for (int w = 0; w < kWorkers; ++w) {
    workers.emplace_back([&, w] {
      std::mt19937 random(static_cast<unsigned>(w + 11));
      Fixture f;
      f.liveJobs = liveJobs;
      std::vector<JobExecutor*> pick{&lanes->cpu(), &lanes->io(), &lanes->network()};
      Loop& loop = Loop::current();
      CancelState state;
      for (int round = 0; round < kRounds; ++round) {
        const uint64_t gen = state.beginRun();
        AsyncRun async(*f.engine, loop, tracker, nextRun++, lanes->cpu());
        f.run = &async;
        const int base = (w * kRounds + round) * kJobs;
        f.bind("nativeWork", [&, base](const std::vector<js::Value>& a) {
          const int index = static_cast<int>(f.engine->toNumber(a.at(0)));
          JobRecord& record = records[static_cast<size_t>(base + index)];
          const int spin = index % 7 == 0 ? 300 : 20;
          auto job = nodetool::jobs::makeJob([&record, alive = Alive(liveJobs), spin](std::stop_token stop) {
            ++record.ran;
            for (int i = 0; i < spin; ++i) {
              if (stop.stop_requested()) {
                ++record.stopped;
                return JobOutcome::stopped();
              }
              std::this_thread::sleep_for(std::chrono::microseconds(1));
            }
            return JobOutcome::value(std::make_unique<RecordedPayload>(record));
          });
          gr::Converter convert = [](js::Engine& e, JobPayload* payload) {
            ++static_cast<RecordedPayload*>(payload)->record.converted;
            return e.undefined();
          };
          return async.submit(*pick[static_cast<size_t>(index) % pick.size()], std::move(job), std::move(convert));
        });
        const int stopAfter = std::uniform_int_distribution<int>(0, kJobs)(random);
        f.eval("globalThis.ok = 0; globalThis.bad = 0; for (let i = 0; i < " + std::to_string(kJobs) +
               "; i++) nativeWork(i).then(() => ok++, () => bad++);");
        gr::EngineRunControl control(*f.engine, async, state, gen, [&] {
          return std::stoi(f.str("String(ok + bad)")) >= stopAfter;
        });
        CHECK(loop.run(control) == RunExit::Done);
        async.teardown();
        leftoverSettlers += static_cast<int>(async.inFlight());
        // Settlements already queued as microtasks still count.
        f.engine->drainJobs();
        fulfilled += std::stoi(f.str("String(ok)"));
        rejected += std::stoi(f.str("String(bad)"));
        loop.clearTimers();
        loop.abandon();
        f.run = nullptr;
        state.endRun();
      }
    });
  }
  for (auto& worker : workers) worker.join();
  CHECK(tracker->waitIdle(Clock::now() + std::chrono::seconds(10)));
  CHECK(leftoverSettlers == 0);
  CHECK(tracker->outstanding() == 0);
  CHECK(*liveJobs == 0);
  int delivered = 0, disposed = 0, stopped = 0, discarded = 0, broken = 0;
  for (const JobRecord& r : records) {
    const int ran = r.ran, stop = r.stopped, gone = r.payloadsDestroyed, conv = r.converted;
    if (ran == 0 && stop == 0 && gone == 0 && conv == 0) {
      ++discarded;
    } else if (ran == 1 && stop == 1 && gone == 0 && conv == 0) {
      ++stopped;
    } else if (ran == 1 && stop == 0 && gone == 1 && conv == 1) {
      ++delivered;
    } else if (ran == 1 && stop == 0 && gone == 1 && conv == 0) {
      ++disposed;
    } else {
      ++broken;
    }
  }
  CHECK(broken == 0);
  CHECK(delivered + disposed + stopped + discarded == kTotal);
  // Every fulfilled promise is a delivered job, and nothing else fulfils.
  CHECK(fulfilled == delivered);
  // A stopped job settles only while its run lives, so at most every one.
  CHECK(rejected <= stopped);
  // The runs ended midway, so the races happened.
  CHECK(delivered > 0);
  CHECK(discarded + disposed + stopped > 0);
  std::fprintf(stderr, "  stress: %d delivered, %d disposed, %d stopped, %d discarded\n", delivered, disposed,
               stopped, discarded);
  for (auto kind : {HostLanes::Kind::Cpu, HostLanes::Kind::Io, HostLanes::Kind::Network}) {
    CHECK(lanes->pool(kind)->queued() == 0);
    CHECK(lanes->pool(kind)->running() == 0);
  }
  CHECK(lanes->shutdown(Clock::now() + std::chrono::seconds(5)) == HostShutdownStatus::Complete);
  CHECK(lanes->liveThreads() == 0);
}

}  // namespace

int main() {
  // A shutdown must never end the process.
  std::at_quick_exit([] {
    std::fputs("quick_exit called\n", stderr);
    std::_Exit(1);
  });
  startWatchdog();
  std::vector<std::pair<const char*, std::function<void()>>> tests = {
      {"laneSizesAndHostOptions", laneSizesAndHostOptions},
      {"poolBoundsThreadsAndKeepsFifo", poolBoundsThreadsAndKeepsFifo},
      {"poolDeliversThroughMailboxInOrder", poolDeliversThroughMailboxInOrder},
      {"queuedJobsCancelledWithRun", queuedJobsCancelledWithRun},
      {"inputsCopiedAtSubmissionHeld", [] { inputsCopiedAtSubmission(false); }},
      {"inputsCopiedAtSubmissionPool", [] { inputsCopiedAtSubmission(true); }},
      {"inlineResponsivenessLimits", inlineResponsivenessLimits},
      {"shutdownTimesOutWithoutJoiningLiveThreads", shutdownTimesOutWithoutJoiningLiveThreads},
      {"blockingStopCallback", blockingStopCallback},
      {"blockingInputDestructor", blockingInputDestructor},
      {"blockingResultPayload", blockingResultPayload},
      {"blockingThreadLocalDestructor", blockingThreadLocalDestructor},
      {"concurrentRetry", concurrentRetry},
      {"sharedBufferInputsCopied", sharedBufferInputsCopied},
      {"stressManyJobsWithCancellation", stressManyJobsWithCancellation},
      {"processLanesSupervisor", processLanesSupervisor},
      {"detachedRefusalLeavesTheSubmitter", detachedRefusalLeavesTheSubmitter},
  };
  const char* only = std::getenv("GR_LANES_ONLY");
  for (const auto& [name, fn] : tests) {
    if (only && std::string(only) != name) continue;
    currentTest = name;
    watchdogDeadline = (Clock::now() + std::chrono::seconds(60)).time_since_epoch().count();
    const int before = failures;
    fn();
    watchdogDeadline = 0;
    std::fprintf(stderr, "%s %s\n", failures == before ? "PASS" : "FAIL", name);
  }
  std::fprintf(stderr, "%d checks, %d failed\n", checks.load(), failures.load());
  return failures == 0 ? 0 : 1;
}
