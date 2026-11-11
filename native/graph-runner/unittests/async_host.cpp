// Step 1 of docs/plans/graph-runner-async-host.md: the run mailbox's wakes of
// the loop, the settler registry, the cancellation snapshot, the loop's
// normal and cancellation modes and the inline bridge. The runner tracker and
// the mailbox's deliver/close races are tested with the job core
// (native/jobs/tests/job_core.cpp).
//
// `nativeEcho(text)` below is a test-only host function. It submits a native
// job that resolves its promise with `text`.
#include "js/engine.h"
#include "kernel/async_jobs.h"
#include "kernel/cancel_state.h"
#include "kernel/run_control.h"
#include "kernel/task.h"

#include <algorithm>
#include <atomic>
#include <barrier>
#include <chrono>
#include <coroutine>
#include <cstdio>
#include <cstdlib>
#include <functional>
#include <future>
#include <memory>
#include <mutex>
#include <optional>
#include <random>
#include <stdexcept>
#include <string>
#include <thread>
#include <vector>

namespace {

// native-rules #14: file-scope mutable test counters
int failures = 0;
int checks = 0;

#define CHECK(cond)                                                                    \
  do {                                                                                 \
    ++checks;                                                                          \
    if (!(cond)) {                                                                     \
      ++failures;                                                                      \
      std::fprintf(stderr, "%s:%d: CHECK failed: %s\n", __FILE__, __LINE__, #cond);    \
    }                                                                                  \
  } while (0)

using gr::AsyncRun;
using gr::CancelSnapshot;
using gr::CancelState;
using gr::Loop;
using gr::RunExit;
using gr::Task;
using nodetool::jobs::JobOutcome;
using nodetool::jobs::JobPayload;
using nodetool::jobs::JobResult;
using nodetool::jobs::RunMailbox;
using nodetool::jobs::RunnerTracker;
namespace js = gr::js;
using Clock = std::chrono::steady_clock;
using std::chrono::milliseconds;

double msSince(Clock::time_point start) {
  return std::chrono::duration<double, std::milli>(Clock::now() - start).count();
}

// A test that hangs fails the process instead of waiting for ctest.
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

// Records where and how often each result's payload was destroyed.
struct Disposals {
  std::mutex mutex;
  std::vector<std::pair<std::string, std::thread::id>> log;

  void add(std::string text) {
    std::lock_guard lock(mutex);
    log.emplace_back(std::move(text), std::this_thread::get_id());
  }
  std::vector<std::pair<std::string, std::thread::id>> snapshot() {
    std::lock_guard lock(mutex);
    return log;
  }
};

struct TextPayload final : JobPayload {
  TextPayload(std::string t, std::shared_ptr<Disposals> d) : text(std::move(t)), disposals(std::move(d)) {}
  ~TextPayload() override {
    if (disposals) disposals->add(text);
  }
  std::string text;
  // native-rules #1: shared by payloads and the test, no justification
  std::shared_ptr<Disposals> disposals;
};

// Keeps submitted jobs so a test can run them later, on any thread.
struct HeldExecutor final : nodetool::jobs::JobExecutor {
  std::vector<nodetool::jobs::SubmittedJob> jobs;
  void submit(nodetool::jobs::SubmittedJob job) override { jobs.push_back(std::move(job)); }
};

// One engine with the test host functions: nativeEcho(text) and note(text),
// which appends to `notes`.
struct Fixture {
  std::unique_ptr<js::Engine> engine = js::createQuickJsEngine();
  AsyncRun* run = nullptr;
  // native-rules #1: shared by payloads and the test, no justification
  std::shared_ptr<Disposals> disposals = std::make_shared<Disposals>();
  std::vector<std::string> notes;

  Fixture() {
    js::Engine& e = *engine;
    e.set(e.global(), "nativeEcho",
          // native-rules #12: lambda captures raw this and is stored in the engine, runs later
          e.function("nativeEcho", 1, [this](js::Engine& en, const std::vector<js::Value>& a) {
            std::string text = en.toString(a.at(0));
            auto disposals = this->disposals;
            return run->submit(nodetool::jobs::makeJob([text, disposals](std::stop_token) {
                                 return JobOutcome::value(std::make_unique<TextPayload>(text, disposals));
                               }),
                               [](js::Engine& en2, JobPayload* payload) {
                                 return en2.string(static_cast<TextPayload*>(payload)->text);
                               });
          }));
    // native-rules #12: lambda captures raw this and is stored in the engine, runs later
    e.set(e.global(), "note", e.function("note", 1, [this](js::Engine& en, const std::vector<js::Value>& a) {
      notes.push_back(en.toString(a.at(0)));
      return en.undefined();
    }));
  }
  ~Fixture() {
    Loop::current().abandon();
  }
  js::Value eval(const std::string& source) { return engine->evaluateScript(source, "test.js"); }
  std::string str(const std::string& source) { return engine->toString(eval(source)); }
  std::string joined() const {
    std::string out;
    for (const auto& n : notes) out += (out.empty() ? "" : " ") + n;
    return out;
  }
};

// Resumes the awaiting coroutine from the ready queue when a promise settles.
struct AwaitJs {
  struct State {
    std::optional<std::string> value;
    std::coroutine_handle<> handle;
  };
  js::Engine& engine;
  js::Value promise;
  std::shared_ptr<State> state = std::make_shared<State>();

  bool await_ready() const noexcept { return false; }
  void await_suspend(std::coroutine_handle<> h) {
    state->handle = h;
    auto st = state;
    js::then(
        engine, promise,
        [st](js::Engine& e, const js::Value& v) {
          st->value = e.toString(v);
          Loop::current().post(st->handle);
        },
        [st](js::Engine&, const js::Value&) {
          st->value = "rejected";
          Loop::current().post(st->handle);
        });
  }
  std::string await_resume() { return *state->value; }
};

Task<void> awaitPromise(js::Engine& engine, js::Value promise, std::string& out) {
  out = co_await AwaitJs{engine, std::move(promise)};
}

Task<void> tickForever(long& steps) {
  for (;;) {
    ++steps;
    co_await gr::Tick{};
  }
}

// A scripted RunControl without an engine.
struct FakeControl final : gr::RunControl {
  std::function<bool()> isDone = [] { return false; };
  size_t microtasks = 0;
  std::function<size_t(size_t limit, size_t ran)> onDrain;
  std::function<bool()> pendingCompletion = [] { return false; };
  std::function<bool()> dispatch = [] { return false; };
  std::function<bool()> external = [] { return false; };
  std::function<std::optional<CancelSnapshot>()> cancel = [] { return std::nullopt; };
  int cancellations = 0;

  bool done() override { return isDone(); }
  size_t drainMicrotasks(size_t limit) override {
    const size_t ran = std::min(limit, microtasks);
    microtasks -= ran;
    if (onDrain) onDrain(limit, ran);
    return ran;
  }
  bool microtasksPending() override { return microtasks > 0; }
  bool dispatchCompletion() override { return dispatch(); }
  bool completionsPending() override { return pendingCompletion(); }
  bool externalWork() override { return external(); }
  std::optional<CancelSnapshot> cancellation() override { return cancel(); }
  void onCancellation(const CancelSnapshot&) override { ++cancellations; }
};

JobResult textResult(uint64_t id, std::string text, std::shared_ptr<Disposals> disposals,
                     RunnerTracker::Ticket ticket = {}) {
  JobResult result;
  result.ticket = std::move(ticket);
  result.id = id;
  result.outcome = JobOutcome::value(std::make_unique<TextPayload>(std::move(text), std::move(disposals)));
  return result;
}

// --- wake protocol ------------------------------------------------------------

// Runs `body` on a new thread, which has a fresh loop with no pending wake.
template <class F>
void onFreshThread(F body) {
  std::thread(body).join();
}

// Gate: wake before a wait with no timer. The result is delivered after the
// loop found no completion and before it starts waiting, which the
// externalWork() call in between stands for. The wait observer sees the wake
// already pending at wait entry, and the sticky wake ends the wait at once.
void wakeBeforeWaitWithoutTimer() {
  RunExit exit = RunExit::Stalled;
  int dispatched = 0;
  std::vector<bool> wokenAtEntry;
  onFreshThread([&] {
    Loop& loop = Loop::current();
    RunMailbox mailbox(loop);
    bool delivered = false;
    FakeControl control;
    control.isDone = [&] { return dispatched == 1; };
    control.pendingCompletion = [&] { return mailbox.pending(); };
    control.dispatch = [&] {
      if (!mailbox.take()) return false;
      ++dispatched;
      return true;
    };
    control.external = [&] {
      if (!delivered) {
        delivered = true;
        mailbox.deliver(textResult(1, "x", nullptr));
      }
      return dispatched == 0;
    };
    loop.setWaitObserverForTesting([&](bool woken) { wokenAtEntry.push_back(woken); });
    exit = loop.run(control);
    loop.setWaitObserverForTesting({});
    CHECK(mailbox.close().empty());
  });
  CHECK(exit == RunExit::Done);
  CHECK(dispatched == 1);
  CHECK((wokenAtEntry == std::vector<bool>{true}));
}

// Gate: wake during a wait with no timer. Only external work is left, so
// the loop waits without a deadline. The producer delivers only after the
// wait observer reports the wait has started. The observer runs under the
// loop's wake mutex, so the delivery's wake() lands inside the wait.
void wakeDuringWaitWithoutTimer() {
  RunExit exit = RunExit::Stalled;
  int dispatched = 0;
  std::vector<bool> wokenAtEntry;
  onFreshThread([&] {
    Loop& loop = Loop::current();
    auto mailbox = std::make_shared<RunMailbox>(loop);
    FakeControl control;
    control.isDone = [&] { return dispatched == 1; };
    control.pendingCompletion = [&] { return mailbox->pending(); };
    control.dispatch = [&] {
      if (!mailbox->take()) return false;
      ++dispatched;
      return true;
    };
    control.external = [&] { return dispatched == 0; };
    std::promise<void> waiting;
    loop.setWaitObserverForTesting([&](bool woken) {
      wokenAtEntry.push_back(woken);
      if (wokenAtEntry.size() == 1) waiting.set_value();
    });
    std::thread producer([mailbox, entered = waiting.get_future()]() mutable {
      entered.wait();
      mailbox->deliver(textResult(1, "x", nullptr));
    });
    exit = loop.run(control);
    producer.join();
    loop.setWaitObserverForTesting({});
    CHECK(mailbox->close().empty());
  });
  CHECK(exit == RunExit::Done);
  CHECK(dispatched == 1);
  // One wait, entered with no wake pending, ended by the delivery.
  CHECK((wokenAtEntry == std::vector<bool>{false}));
}

// --- deadline checks between control queries and dispatch -----------------------

// A cancellation snapshot a test can change from inside the control's
// queries.
struct InjectedCancel {
  std::optional<CancelSnapshot> current;
  void set(Clock::time_point deadline) { current = CancelSnapshot{1, true, false, deadline}; }
  void expire() { set(Clock::now() - milliseconds(1)); }
};

// Throws from the wait observer, so a test that must not wait fails at once
// instead of hanging.
struct NoWait {
  int waits = 0;
  explicit NoWait(Loop& loop) : loop(loop) {
    loop.setWaitObserverForTesting([this](bool) {
      ++waits;
      throw std::runtime_error("the loop waited");
    });
  }
  ~NoWait() { loop.setWaitObserverForTesting({}); }
  Loop& loop;
};

RunExit runCatching(Loop& loop, gr::RunControl& control, bool& threw) {
  try {
    return loop.run(control);
  } catch (const std::runtime_error&) {
    threw = true;
    return RunExit::Stalled;
  }
}

// Cancellation mode: the deadline passes during completionsPending(), the
// query that chooses the macrotask. The completion is not dispatched.
void deadlineCheckedBeforeCompletion() {
  Loop& loop = Loop::current();
  InjectedCancel cancel;
  cancel.set(Clock::now() + std::chrono::seconds(10));
  FakeControl control;
  int dispatched = 0;
  control.cancel = [&] { return cancel.current; };
  control.pendingCompletion = [&] {
    cancel.expire();
    return true;
  };
  control.dispatch = [&] {
    ++dispatched;
    return true;
  };
  NoWait noWait(loop);
  bool threw = false;
  CHECK(runCatching(loop, control, threw) == RunExit::Deadline);
  CHECK(!threw);
  CHECK(dispatched == 0);
}

// Cancellation mode: the deadline passes during done(), before the due timer
// is chosen. The timer does not fire.
void deadlineCheckedBeforeTimer() {
  Loop& loop = Loop::current();
  InjectedCancel cancel;
  cancel.set(Clock::now() + std::chrono::seconds(10));
  FakeControl control;
  int fired = 0;
  control.cancel = [&] { return cancel.current; };
  control.isDone = [&] {
    cancel.expire();
    return false;
  };
  loop.setTimer(milliseconds(0), [&] { ++fired; });
  std::this_thread::sleep_for(milliseconds(2));
  NoWait noWait(loop);
  bool threw = false;
  CHECK(runCatching(loop, control, threw) == RunExit::Deadline);
  CHECK(!threw);
  CHECK(fired == 0);
  loop.clearTimers();
}

// Cancellation mode: the deadline moves into the past during externalWork(),
// the query that decides to wait. The loop returns without waiting for the
// old deadline.
void deadlineCheckedBeforeWait() {
  Loop& loop = Loop::current();
  InjectedCancel cancel;
  cancel.set(Clock::now() + std::chrono::seconds(10));
  FakeControl control;
  control.cancel = [&] { return cancel.current; };
  control.external = [&] {
    cancel.expire();
    return true;
  };
  NoWait noWait(loop);
  bool threw = false;
  CHECK(runCatching(loop, control, threw) == RunExit::Deadline);
  CHECK(!threw && noWait.waits == 0);
}

// Normal mode: a cancellation with a passed deadline is published during
// the query that chooses the macrotask, and during the query that decides to
// wait. Neither the completion nor the wait happens.
void normalModeChecksCancellationBeforeMacrotaskAndWait() {
  Loop& loop = Loop::current();
  {
    InjectedCancel cancel;
    FakeControl control;
    int dispatched = 0;
    control.cancel = [&] { return cancel.current; };
    control.pendingCompletion = [&] {
      cancel.expire();
      return true;
    };
    control.dispatch = [&] {
      ++dispatched;
      return true;
    };
    NoWait noWait(loop);
    bool threw = false;
    CHECK(runCatching(loop, control, threw) == RunExit::Deadline);
    CHECK(!threw && dispatched == 0 && control.cancellations == 1);
  }
  {
    InjectedCancel cancel;
    FakeControl control;
    control.cancel = [&] { return cancel.current; };
    control.external = [&] {
      cancel.expire();
      return true;
    };
    NoWait noWait(loop);
    bool threw = false;
    CHECK(runCatching(loop, control, threw) == RunExit::Deadline);
    CHECK(!threw && noWait.waits == 0 && control.cancellations == 1);
  }
}

// --- cancellation state -------------------------------------------------------

// Gate: coherent cancellation publication.
void cancelStatePublishesCoherently() {
  CancelState state;
  const auto base = Clock::now() + std::chrono::seconds(10);
  uint64_t gen = state.beginRun();
  CHECK(!state.cancellation(gen));
  CHECK(!state.request(gen + 1, base));  // another run's generation
  CHECK(!state.snapshot().requested);
  CHECK(state.request(gen, base));
  CHECK(state.request(gen, base + milliseconds(5)));  // a later deadline is ignored
  CHECK(state.snapshot().deadline == base);
  CHECK(state.request(gen, base - milliseconds(5)));  // an earlier one wins
  CHECK(state.snapshot().deadline == base - milliseconds(5));
  CHECK(state.cancellation(gen).has_value());
  CHECK(!state.cancellation(gen + 1));
  CHECK(state.cancelled());
  CHECK(!state.interruptDue());
  state.endRun();
  CHECK(!state.cancelled());
  CHECK(!state.request(gen, base));  // the run ended
  gen = state.beginRun();
  CHECK(!state.snapshot().requested && !state.snapshot().deadline);
  CHECK(state.request(gen, Clock::now() - milliseconds(1)));
  CHECK(state.interruptDue());  // the deadline passed
  state.endRun();

  // Readers never see a request without its deadline, and a run's deadline
  // only moves earlier.
  CancelState shared;
  std::atomic<bool> stop{false};
  std::atomic<int> incoherent{0}, later{0};
  std::atomic<long> seen{0};
  std::vector<std::thread> readers;
  for (int r = 0; r < 4; ++r) {
    readers.emplace_back([&] {
      uint64_t lastGeneration = 0;
      std::optional<Clock::time_point> last;
      while (!stop) {
        const CancelSnapshot snap = shared.snapshot();
        ++seen;
        if (snap.requested != snap.deadline.has_value()) ++incoherent;
        if (snap.immediate && !snap.requested) ++incoherent;
        if (snap.generation != lastGeneration) {
          lastGeneration = snap.generation;
          last.reset();
        }
        if (last && snap.deadline && *snap.deadline > *last) ++later;
        if (snap.deadline) last = snap.deadline;
      }
    });
  }
  std::mt19937 random(11);
  for (int i = 0; i < 20000; ++i) {
    const uint64_t g = shared.beginRun();
    for (int k = 0; k < 4; ++k) {
      shared.request(g, base + milliseconds(std::uniform_int_distribution<int>(0, 1000)(random)));
    }
    shared.endRun();
  }
  shared.beginRun();
  shared.interruptNow();
  std::this_thread::sleep_for(milliseconds(5));
  stop = true;
  for (auto& reader : readers) reader.join();
  CHECK(incoherent == 0);
  CHECK(later == 0);
  CHECK(seen > 0);
  const CancelSnapshot final = shared.snapshot();
  CHECK(final.requested && final.immediate && final.deadline && *final.deadline <= Clock::now());
}

// Gate: immediate interruption. interruptNow() publishes requested,
// immediate and a deadline of now together. It stops running JavaScript
// through the engine's interrupt handler, ends a loop waiting with no timer,
// and outlives the run, so a following load or run stops too.
void immediateInterruption() {
  Fixture f;
  CancelState state;
  f.engine->setInterruptHandler([&state] { return state.interruptDue(); });
  const uint64_t gen = state.beginRun();
  std::thread interrupter([&state] {
    std::this_thread::sleep_for(milliseconds(50));
    state.interruptNow();
  });
  const auto start = Clock::now();
  bool threw = false;
  try {
    f.eval("for (;;) {}");
  } catch (const js::JsError&) {
    threw = true;
  }
  interrupter.join();
  CHECK(threw);
  CHECK(msSince(start) < 2000);
  state.endRun();
  f.engine->setInterruptHandler({});

  // A loop waiting for external work only, with no timer and no deadline,
  // returns at once on interruptNow() and a wake.
  CancelState waiting;
  const uint64_t run = waiting.beginRun();
  Loop& loop = Loop::current();
  auto tracker = std::make_shared<RunnerTracker>();
  HeldExecutor held;
  {
    AsyncRun async(*f.engine, loop, tracker, run, held);
    f.run = &async;
    f.eval("nativeEcho('never')");
    std::vector<CancelSnapshot> observed;
    gr::EngineRunControl control(*f.engine, async, waiting, run, [] { return false; },
                                 [&](const CancelSnapshot& s) { observed.push_back(s); });
    std::thread stopper([&] {
      std::this_thread::sleep_for(milliseconds(50));
      waiting.interruptNow();
      loop.wake();
    });
    const auto waitStart = Clock::now();
    const RunExit exit = loop.run(control);
    stopper.join();
    CHECK(exit == RunExit::Deadline);
    CHECK(msSince(waitStart) >= 40 && msSince(waitStart) < 2000);
    CHECK(observed.size() == 1 && observed[0].immediate && observed[0].requested);
    async.teardown();
  }
  f.run = nullptr;
  held.jobs.clear();
  // The immediate stop survives into the next generation.
  CHECK(waiting.beginRun() == run + 1);
  CHECK(waiting.cancellation(run + 1).has_value());
  CHECK(waiting.interruptDue());
  (void)gen;
}

// --- normal mode ordering -----------------------------------------------------

// Gate: completion K1/K2 ordering. Result r1 readies kernel step K1, and K1
// readies K2. Result r2 waits in the mailbox meanwhile, and settles only
// after K1 and K2 ran.
void completionTurnOrdering() {
  Fixture f;
  Loop& loop = Loop::current();
  CancelState state;
  const uint64_t gen = state.beginRun();
  auto tracker = std::make_shared<RunnerTracker>();
  HeldExecutor held;
  AsyncRun async(*f.engine, loop, tracker, gen, held);
  f.run = &async;
  gr::Signal gate;
  auto chain = [&]() -> Task<void> {
    co_await gate.wait();
    f.notes.push_back("K1");
    co_await gr::Tick{};
    f.notes.push_back("K2");
  };
  auto task = chain();
  f.engine->set(f.engine->global(), "kick",
                f.engine->function("kick", 0, [&gate](js::Engine& e, const std::vector<js::Value>&) {
                  gate.notifyAll();
                  return e.undefined();
                }));
  f.eval("nativeEcho('r1').then((v) => { note(v); kick(); }); nativeEcho('r2').then((v) => note(v));");
  for (auto& job : held.jobs) job.execute();  // both results wait in the mailbox
  CHECK(async.resultsPending());
  gr::EngineRunControl control(*f.engine, async, state, gen, [&] { return f.notes.size() == 4; });
  const RunExit exit = loop.run(control);
  CHECK(exit == RunExit::Done);
  CHECK(task.done());
  CHECK(f.joined() == "r1 K1 K2 r2");
  async.teardown();
}

// Gate: timer and result alternation under a full mailbox. With both kinds
// available, macrotasks alternate, timer first. Once timers run out, the
// remaining results run back to back.
void timersAlternateWithCompletions() {
  Fixture f;
  Loop& loop = Loop::current();
  CancelState state;
  const uint64_t gen = state.beginRun();
  auto tracker = std::make_shared<RunnerTracker>();
  nodetool::jobs::InlineExecutor inlineJobs;
  AsyncRun async(*f.engine, loop, tracker, gen, inlineJobs);
  f.run = &async;
  f.eval("for (let i = 1; i <= 5; i++) nativeEcho('R' + i).then(note);");
  CHECK(async.resultsPending());
  for (int i = 1; i <= 3; ++i) {
    loop.setTimer(milliseconds(0), [&f, i] { f.notes.push_back("T" + std::to_string(i)); });
  }
  std::this_thread::sleep_for(milliseconds(2));
  gr::EngineRunControl control(*f.engine, async, state, gen, [&] { return f.notes.size() == 8; });
  CHECK(loop.run(control) == RunExit::Done);
  CHECK(f.joined() == "T1 R1 T2 R2 T3 R3 R4 R5");

  // A long stream of both alternates strictly.
  f.notes.clear();
  f.eval("for (let i = 0; i < 100; i++) nativeEcho('R').then(note);");
  for (int i = 0; i < 100; ++i) loop.setTimer(milliseconds(0), [&f] { f.notes.push_back("T"); });
  std::this_thread::sleep_for(milliseconds(2));
  gr::EngineRunControl longer(*f.engine, async, state, gen, [&] { return f.notes.size() == 200; });
  CHECK(loop.run(longer) == RunExit::Done);
  bool alternating = f.notes.size() == 200;
  for (size_t i = 0; alternating && i < f.notes.size(); ++i) {
    alternating = f.notes[i] == (i % 2 == 0 ? "T" : "R");
  }
  CHECK(alternating);
  async.teardown();
}

// Contended turns start with the timer even when an uncontended timer ran
// before them. T0 runs alone and queues two results and two timers. The
// first turn with both kinds available fires T1, not a result.
void firstContendedTurnFiresTimer() {
  Fixture f;
  Loop& loop = Loop::current();
  CancelState state;
  const uint64_t gen = state.beginRun();
  auto tracker = std::make_shared<RunnerTracker>();
  nodetool::jobs::InlineExecutor inlineJobs;
  AsyncRun async(*f.engine, loop, tracker, gen, inlineJobs);
  f.run = &async;
  loop.setTimer(milliseconds(0), [&] {
    f.notes.push_back("T0");
    f.eval("nativeEcho('R1').then(note); nativeEcho('R2').then(note);");
    loop.setTimer(milliseconds(0), [&f] { f.notes.push_back("T1"); });
    loop.setTimer(milliseconds(0), [&f] { f.notes.push_back("T2"); });
  });
  std::this_thread::sleep_for(milliseconds(2));
  gr::EngineRunControl control(*f.engine, async, state, gen, [&] { return f.notes.size() == 5; });
  CHECK(loop.run(control) == RunExit::Done);
  CHECK(f.joined() == "T0 T1 R1 T2 R2");
  async.teardown();
}

// Gate: complete microtask draining before every timer, result and step in
// normal mode, and a timer only when no kernel step is ready. Each macrotask starts
// a chain of 200 sequential microtasks, more than a cancellation slice.
void normalModeDrainsMicrotasksBeforeMacrotasks() {
  Fixture f;
  Loop& loop = Loop::current();
  CancelState state;
  const uint64_t gen = state.beginRun();
  auto tracker = std::make_shared<RunnerTracker>();
  nodetool::jobs::InlineExecutor inlineJobs;
  AsyncRun async(*f.engine, loop, tracker, gen, inlineJobs);
  f.run = &async;
  f.eval(R"(
    globalThis.chain = (tag, n) => {
      note(tag);
      const step = (k) => {
        if (k === 0) { note(tag + '.done'); return; }
        Promise.resolve().then(() => step(k - 1));
      };
      step(n);
    };
    nativeEcho('R1').then((v) => chain(v, 200));
    nativeEcho('R2').then((v) => chain(v, 200));
  )");
  js::Value chain = f.engine->get(f.engine->global(), "chain");
  for (const char* tag : {"T1", "T2"}) {
    loop.setTimer(milliseconds(0), [&f, chain, tag] {
      f.engine->call(chain, f.engine->undefined(), {f.engine->string(tag), f.engine->number(200)});
    });
  }
  // Kernel steps that are ready run before any due timer.
  long steps = 0;
  auto ticks = [&]() -> Task<void> {
    for (int i = 0; i < 3; ++i) {
      f.notes.push_back("S");
      ++steps;
      co_await gr::Tick{};
    }
  };
  std::this_thread::sleep_for(milliseconds(2));
  auto task = ticks();
  gr::EngineRunControl control(*f.engine, async, state, gen, [&] { return f.notes.size() == 11; });
  CHECK(loop.run(control) == RunExit::Done);
  CHECK(task.done());
  CHECK(f.joined() == "S S S T1 T1.done R1 R1.done T2 T2.done R2 R2.done");

  // A step's microtasks all run before the next ready step.
  f.notes.clear();
  auto stepThenChain = [&]() -> Task<void> {
    co_await gr::Tick{};
    f.engine->call(chain, f.engine->undefined(), {f.engine->string("A"), f.engine->number(200)});
    co_await gr::Tick{};
    f.notes.push_back("A2");
  };
  auto other = [&]() -> Task<void> {
    co_await gr::Tick{};
    co_await gr::Tick{};
    f.notes.push_back("B2");
  };
  auto first = stepThenChain();
  auto second = other();
  gr::EngineRunControl steps2(*f.engine, async, state, gen, [&] { return first.done() && second.done(); });
  CHECK(loop.run(steps2) == RunExit::Done);
  CHECK(f.joined() == "A A.done A2 B2");
  async.teardown();
}

// --- cancellation mode --------------------------------------------------------

// Gate: the switch to bounded slices on cancellation. Each step queues 100
// microtasks. Before the cancellation the loop drains all of them after each
// step and fires no timer while steps are ready. After it, at most 64 run
// after each step, one drain call at a time, and a due timer fires after at
// most 64 steps.
void cancellationSwitchesToBoundedSlices() {
  Loop& loop = Loop::current();
  FakeControl control;
  struct Event {
    char kind;  // 's' step, 'd' drain, 't' timer
    size_t limit = 0;
    size_t ran = 0;
    size_t left = 0;
  };
  std::vector<Event> events;
  bool cancelled = false;
  const auto deadline = Clock::now() + std::chrono::seconds(10);
  control.cancel = [&]() -> std::optional<CancelSnapshot> {
    if (!cancelled) return std::nullopt;
    return CancelSnapshot{1, true, false, deadline};
  };
  control.onDrain = [&](size_t limit, size_t ran) {
    events.push_back({'d', limit, ran, control.microtasks});
    return ran;
  };
  auto steps = [&]() -> Task<void> {
    for (int i = 1; i <= 200; ++i) {
      events.push_back({'s'});
      control.microtasks += 100;
      if (i == 3) cancelled = true;
      co_await gr::Tick{};
    }
  };
  auto task = steps();
  control.isDone = [&] { return task.done(); };
  loop.setTimer(milliseconds(0), [&] { events.push_back({'t'}); });
  std::this_thread::sleep_for(milliseconds(2));
  const RunExit exit = loop.run(control);
  CHECK(exit == RunExit::Done);
  CHECK(control.cancellations == 1);
  // Normal mode: steps 1-3 each followed by one complete drain. Step 1 runs
  // before loop.run(), since a Task starts eagerly.
  int step = 0;
  bool normalComplete = true, slicesBounded = true, singleCalls = true;
  int stepsBeforeTimer = -1;
  size_t sinceStep = 0;
  for (size_t i = 0; i < events.size(); ++i) {
    const Event& ev = events[i];
    if (ev.kind == 's') {
      if (step > 3 && sinceStep > Loop::kSliceMicrotasks) slicesBounded = false;
      ++step;
      sinceStep = 0;
      continue;
    }
    if (ev.kind == 't') {
      stepsBeforeTimer = step;
      continue;
    }
    if (step <= 3 && step > 0 && sinceStep == 0 && (ev.limit != SIZE_MAX || ev.left != 0)) normalComplete = false;
    if (step > 3 && ev.limit != 1) singleCalls = false;
    sinceStep += ev.ran;
  }
  CHECK(step == 200);
  CHECK(normalComplete);
  CHECK(slicesBounded);
  CHECK(singleCalls);
  CHECK(stepsBeforeTimer > 3 && stepsBeforeTimer <= 3 + static_cast<int>(Loop::kSliceSteps));
}

// Gate: deadlines with continuously ready steps. The run starts in normal
// mode, a cancellation arrives from another thread, and the loop returns at
// its deadline although a step is always ready.
void deadlineWithContinuouslyReadySteps() {
  Fixture f;
  Loop& loop = Loop::current();
  CancelState state;
  const uint64_t gen = state.beginRun();
  auto tracker = std::make_shared<RunnerTracker>();
  nodetool::jobs::InlineExecutor inlineJobs;
  AsyncRun async(*f.engine, loop, tracker, gen, inlineJobs);
  long steps = 0;
  auto task = tickForever(steps);
  int observed = 0;
  gr::EngineRunControl control(*f.engine, async, state, gen, [] { return false; },
                               [&](const CancelSnapshot&) { ++observed; });
  Clock::time_point deadline;
  std::thread canceller([&] {
    std::this_thread::sleep_for(milliseconds(30));
    deadline = Clock::now() + milliseconds(50);
    state.request(gen, deadline);
  });
  const RunExit exit = loop.run(control);
  const auto returned = Clock::now();
  canceller.join();
  CHECK(exit == RunExit::Deadline);
  CHECK(returned >= deadline);
  CHECK(returned - deadline < milliseconds(500));
  CHECK(observed == 1);
  CHECK(steps > 100);
  async.teardown();
  loop.abandon();
}

// Gate: deadlines with continuously ready steps and microtasks. A microtask
// that always queues another would keep a complete drain going forever, so
// only the bounded slices let the deadline end the run. No interrupt handler
// is installed.
void deadlineWithContinuousMicrotasks() {
  Fixture f;
  Loop& loop = Loop::current();
  CancelState state;
  const uint64_t gen = state.beginRun();
  auto tracker = std::make_shared<RunnerTracker>();
  nodetool::jobs::InlineExecutor inlineJobs;
  AsyncRun async(*f.engine, loop, tracker, gen, inlineJobs);
  f.eval("globalThis.spins = 0; globalThis.spin = () => { spins++; Promise.resolve().then(spin); }; spin();");
  long steps = 0;
  auto task = tickForever(steps);
  const auto deadline = Clock::now() + milliseconds(60);
  state.request(gen, deadline);
  gr::EngineRunControl control(*f.engine, async, state, gen, [] { return false; });
  const RunExit exit = loop.run(control);
  const auto returned = Clock::now();
  CHECK(exit == RunExit::Deadline);
  CHECK(returned >= deadline);
  CHECK(returned - deadline < milliseconds(500));
  CHECK(steps > 1);
  CHECK(std::stol(f.str("String(spins)")) > static_cast<long>(Loop::kSliceMicrotasks));
  async.teardown();
  loop.abandon();
}

// --- exits ----------------------------------------------------------------------

// Gate: done and stalled exits.
void doneAndStalledExits() {
  Fixture f;
  Loop& loop = Loop::current();
  auto tracker = std::make_shared<RunnerTracker>();
  CancelState state;

  // Done returns without awaiting a job in flight or a pending timer.
  {
    const uint64_t gen = state.beginRun();
    HeldExecutor held;
    AsyncRun async(*f.engine, loop, tracker, gen, held);
    f.run = &async;
    f.eval("nativeEcho('pending')");
    loop.setTimer(milliseconds(60000), [] {});
    gr::EngineRunControl control(*f.engine, async, state, gen, [] { return true; });
    const auto start = Clock::now();
    CHECK(loop.run(control) == RunExit::Done);
    CHECK(msSince(start) < 500);
    CHECK(async.inFlight() == 1);
    async.teardown();
    loop.clearTimers();
    held.jobs.clear();
    state.endRun();
  }
  CHECK(tracker->outstanding() == 0);

  // Stalled: nothing is left and the task is unfinished.
  {
    const uint64_t gen = state.beginRun();
    nodetool::jobs::InlineExecutor inlineJobs;
    AsyncRun async(*f.engine, loop, tracker, gen, inlineJobs);
    gr::Signal never;
    auto parked = [&]() -> Task<void> { co_await never.wait(); };
    auto task = parked();
    gr::EngineRunControl control(*f.engine, async, state, gen, [&] { return task.done(); });
    CHECK(loop.run(control) == RunExit::Stalled);
    CHECK(loop.liveFrames() == 1);
    async.teardown();
    loop.abandon();
    state.endRun();
  }

  // External work alone keeps the run from stalling: the loop waits, with no
  // timer, until another thread delivers, then the run finishes.
  {
    const uint64_t gen = state.beginRun();
    HeldExecutor held;
    AsyncRun async(*f.engine, loop, tracker, gen, held);
    f.run = &async;
    std::string got;
    auto task = awaitPromise(*f.engine, f.eval("nativeEcho('later')"), got);
    std::thread worker([&held] {
      std::this_thread::sleep_for(milliseconds(50));
      held.jobs.front().execute();
    });
    gr::EngineRunControl control(*f.engine, async, state, gen, [&] { return task.done(); });
    const auto start = Clock::now();
    const RunExit exit = loop.run(control);
    worker.join();
    CHECK(exit == RunExit::Done);
    CHECK(got == "later");
    CHECK(msSince(start) >= 40);
    async.teardown();
    held.jobs.clear();
    state.endRun();
  }

  // Stalled while cancelling: the loop does not wait for the deadline when
  // nothing is left.
  {
    const uint64_t gen = state.beginRun();
    nodetool::jobs::InlineExecutor inlineJobs;
    AsyncRun async(*f.engine, loop, tracker, gen, inlineJobs);
    state.request(gen, Clock::now() + std::chrono::seconds(30));
    gr::EngineRunControl control(*f.engine, async, state, gen, [] { return false; });
    const auto start = Clock::now();
    CHECK(loop.run(control) == RunExit::Stalled);
    CHECK(msSince(start) < 1000);
    async.teardown();
    state.endRun();
  }
  f.run = nullptr;
  CHECK(tracker->outstanding() == 0);
}

// --- teardown -------------------------------------------------------------------

// Gate: abandon with jobs in flight. The run ends at its deadline while two
// jobs are still running. Teardown requests stop, closes the mailbox, drops
// the settlers and abandons the frames. The jobs finish afterwards on another
// thread: their results are destroyed there, no promise settles, and the
// tracker reaches zero.
void abandonWithJobsInFlight() {
  Fixture f;
  Loop& loop = Loop::current();
  CancelState state;
  const uint64_t gen = state.beginRun();
  auto tracker = std::make_shared<RunnerTracker>();
  HeldExecutor held;
  std::string got = "unset";
  {
    AsyncRun async(*f.engine, loop, tracker, gen, held);
    f.run = &async;
    f.eval("globalThis.settled = []; nativeEcho('a').then((v) => settled.push(v), () => settled.push('rejected'));");
    auto task = awaitPromise(*f.engine, f.eval("nativeEcho('b')"), got);
    CHECK(held.jobs.size() == 2);
    CHECK(tracker->outstanding(gen) == 2);
    state.request(gen, Clock::now() + milliseconds(30));
    gr::EngineRunControl control(*f.engine, async, state, gen, [&] { return task.done(); });
    CHECK(loop.run(control) == RunExit::Deadline);
    CHECK(loop.liveFrames() > 0);
    async.teardown();
    loop.clearTimers();
    loop.abandon();
    CHECK(loop.liveFrames() == 0);
    CHECK(async.inFlight() == 0);
    CHECK(async.mailbox()->closed());
    for (const auto& job : held.jobs) CHECK(job.stopToken().stop_requested());
  }
  f.run = nullptr;
  state.endRun();
  std::thread::id jobThread;
  std::vector<bool> accepted;
  std::thread late([&] {
    jobThread = std::this_thread::get_id();
    for (auto& job : held.jobs) accepted.push_back(job.execute());
  });
  late.join();
  held.jobs.clear();
  CHECK((accepted == std::vector<bool>{false, false}));
  const auto disposed = f.disposals->snapshot();
  CHECK(disposed.size() == 2);
  for (const auto& [text, where] : disposed) CHECK(where == jobThread);
  CHECK(tracker->outstanding() == 0);
  f.engine->drainJobs();
  CHECK(f.str("String(settled.length)") == "0");
  CHECK(got == "unset");
}

// Gate: engine reuse with a late result from the previous run. Both runs
// number their jobs from 1. Run 1's job finishes while run 2 is running, and
// its result goes to run 1's closed mailbox, never to run 2's settler.
void engineReuseIgnoresLateResult() {
  Fixture f;
  Loop& loop = Loop::current();
  CancelState state;
  auto tracker = std::make_shared<RunnerTracker>();
  HeldExecutor held;
  f.eval("globalThis.log = [];");
  const uint64_t first = state.beginRun();
  {
    AsyncRun async(*f.engine, loop, tracker, first, held);
    f.run = &async;
    f.eval("nativeEcho('one').then((v) => log.push('1:' + v));");
    // The run is done at once, without awaiting its job.
    gr::EngineRunControl control(*f.engine, async, state, first, [] { return true; });
    CHECK(loop.run(control) == RunExit::Done);
    async.teardown();
    loop.clearTimers();
    loop.abandon();
  }
  state.endRun();
  CHECK(tracker->outstanding(first) == 1);

  const uint64_t second = state.beginRun();
  nodetool::jobs::InlineExecutor inlineJobs;
  bool lateAccepted = true;
  std::thread::id lateThread;
  {
    AsyncRun async(*f.engine, loop, tracker, second, inlineJobs);
    f.run = &async;
    std::thread late([&] {
      lateThread = std::this_thread::get_id();
      lateAccepted = held.jobs.front().execute();
    });
    late.join();
    f.eval("nativeEcho('two').then((v) => log.push('2:' + v));");
    gr::EngineRunControl control(*f.engine, async, state, second,
                                 [&] { return f.str("log.length") == "1"; });
    CHECK(loop.run(control) == RunExit::Done);
    CHECK(!async.resultsPending());
    async.teardown();
  }
  f.run = nullptr;
  state.endRun();
  held.jobs.clear();
  f.engine->drainJobs();
  CHECK(!lateAccepted);
  CHECK(f.str("log.join(',')") == "2:two");
  const auto disposed = f.disposals->snapshot();
  bool lateDisposedThere = false;
  for (const auto& [text, where] : disposed) {
    if (text == "one") lateDisposedThere = where == lateThread;
  }
  CHECK(lateDisposedThere);
  CHECK(tracker->outstanding() == 0);
}

// The settler registry: errors, stops, failed conversion and missing
// settlers.
void settlersRejectAndDispose() {
  Fixture f;
  Loop& loop = Loop::current();
  CancelState state;
  const uint64_t gen = state.beginRun();
  auto tracker = std::make_shared<RunnerTracker>();
  nodetool::jobs::InlineExecutor inlineJobs;
  AsyncRun async(*f.engine, loop, tracker, gen, inlineJobs);
  f.eval("globalThis.out = [];");
  auto record = [&](const js::Value& promise) {
    f.engine->set(f.engine->global(), "p", promise);
    f.eval("p.then((v) => out.push('ok:' + v), (e) => out.push(e.name + ':' + e.message));");
  };
  record(async.submit(nodetool::jobs::makeJob([](std::stop_token) { return JobOutcome::failure("disk full"); }), {}));
  record(async.submit(nodetool::jobs::makeJob([](std::stop_token) { return JobOutcome::stopped(); }), {}));
  record(async.submit(nodetool::jobs::makeJob([](std::stop_token) -> JobOutcome { throw std::runtime_error("threw"); }),
                      {}));
  record(async.submit(nodetool::jobs::makeJob([d = f.disposals](std::stop_token) {
                        return JobOutcome::value(std::make_unique<TextPayload>("bad", d));
                      }),
                      [](js::Engine&, JobPayload*) -> js::Value { throw std::runtime_error("cannot convert"); }));
  gr::EngineRunControl control(*f.engine, async, state, gen, [&] { return f.str("out.length") == "4"; });
  CHECK(loop.run(control) == RunExit::Done);
  CHECK(f.str("out.join('|')") ==
        "Error:disk full|AbortError:The operation was aborted|Error:threw|Error:cannot convert");
  // The failed conversion still released the payload.
  CHECK(f.disposals->snapshot().size() == 1);
  // A result whose settler is gone is destroyed without settling anything.
  gr::SettlerRegistry registry(*f.engine);
  CHECK(!registry.settle(textResult(99, "orphan", f.disposals)));
  CHECK(f.disposals->snapshot().size() == 2);
  async.teardown();
  CHECK(tracker->outstanding() == 0);
}

// The tracker counts per run and wakes a waiter when the last ticket goes.
// drainJobs(limit) runs exactly that many jobs.
void drainJobsHonoursLimit() {
  auto e = js::createQuickJsEngine();
  e->evaluateScript("globalThis.n = 0; for (let i = 0; i < 10; i++) Promise.resolve().then(() => n++);", "t.js");
  CHECK(e->drainJobs(3) == 3);
  CHECK(e->toNumber(e->get(e->global(), "n")) == 3);
  CHECK(e->hasPendingJobs());
  CHECK(e->drainJobs() == 7);
  CHECK(!e->hasPendingJobs());
}

}  // namespace

int main() {
  startWatchdog();
  std::vector<std::pair<const char*, std::function<void()>>> tests = {
      {"drainJobsHonoursLimit", drainJobsHonoursLimit},
      {"wakeBeforeWaitWithoutTimer", wakeBeforeWaitWithoutTimer},
      {"wakeDuringWaitWithoutTimer", wakeDuringWaitWithoutTimer},
      {"cancelStatePublishesCoherently", cancelStatePublishesCoherently},
      {"immediateInterruption", immediateInterruption},
      {"completionTurnOrdering", completionTurnOrdering},
      {"timersAlternateWithCompletions", timersAlternateWithCompletions},
      {"firstContendedTurnFiresTimer", firstContendedTurnFiresTimer},
      {"deadlineCheckedBeforeCompletion", deadlineCheckedBeforeCompletion},
      {"deadlineCheckedBeforeTimer", deadlineCheckedBeforeTimer},
      {"deadlineCheckedBeforeWait", deadlineCheckedBeforeWait},
      {"normalModeChecksCancellationBeforeMacrotaskAndWait", normalModeChecksCancellationBeforeMacrotaskAndWait},
      {"normalModeDrainsMicrotasksBeforeMacrotasks", normalModeDrainsMicrotasksBeforeMacrotasks},
      {"cancellationSwitchesToBoundedSlices", cancellationSwitchesToBoundedSlices},
      {"deadlineWithContinuouslyReadySteps", deadlineWithContinuouslyReadySteps},
      {"deadlineWithContinuousMicrotasks", deadlineWithContinuousMicrotasks},
      {"doneAndStalledExits", doneAndStalledExits},
      {"abandonWithJobsInFlight", abandonWithJobsInFlight},
      {"engineReuseIgnoresLateResult", engineReuseIgnoresLateResult},
      {"settlersRejectAndDispose", settlersRejectAndDispose},
  };
  const char* only = std::getenv("GR_ASYNC_ONLY");
  for (const auto& [name, fn] : tests) {
    if (only && std::string(only) != name) continue;
    currentTest = name;
    watchdogDeadline = (Clock::now() + std::chrono::seconds(20)).time_since_epoch().count();
    const int before = failures;
    fn();
    watchdogDeadline = 0;
    std::fprintf(stderr, "%s %s\n", failures == before ? "PASS" : "FAIL", name);
  }
  std::fprintf(stderr, "%d checks, %d failed\n", checks, failures);
  return failures == 0 ? 0 : 1;
}
