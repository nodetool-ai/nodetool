// Rollout step 5 infrastructure of docs/plans/graph-runner-async-host.md:
// resource control blocks (section 4.8), their serial queue (section 4.4)
// and session stop bridges (section 4.9). No host function is converted;
// the bodies here are test objects.
#include "js/engine.h"
#include "kernel/async_jobs.h"
#include "kernel/cancel_state.h"
#include "kernel/host_lanes.h"
#include "kernel/resource_control.h"
#include "kernel/run_control.h"
#include "kernel/session_stop.h"
#include "kernel/task.h"
#include "resource_test_support.h"

#include <algorithm>
#include <array>
#include <atomic>
#include <barrier>
#include <functional>
#include <future>
#include <memory>
#include <mutex>
#include <optional>
#include <random>
#include <stdexcept>
#include <set>
#include <string>
#include <thread>
#include <vector>

namespace {

using gr::InlineExecutor;
using gr::JobOutcome;
using gr::ResourceBody;
using gr::ResourceControl;
using gr::ResourceLease;
using gr::ResourceOperationContext;
using gr::SessionStopBridge;
using gr::ThreadPoolExecutor;
using step5::Clock;
using step5::contains;
using step5::eventually;
using step5::Gate;
using step5::milliseconds;
using step5::Suite;
using step5::TestRun;
using step5::text;
using Kind = JobOutcome::Kind;
using State = ResourceControl::State;

// What a test body reports, shared between the test and the body.
//
// Thread affinity: thread-safe. `mutex` guards `log` and `destroyedOn`.
struct Probe {
  std::mutex mutex;
  std::vector<std::string> log;
  std::thread::id destroyedOn;
  std::atomic<int> destroyed{0};
  std::atomic<int> running{0};
  std::atomic<int> overlaps{0};
  std::atomic<int> usedAfterDestroy{0};

  void note(const std::string& entry) {
    std::lock_guard lock(mutex);
    log.push_back(entry);
  }
  std::vector<std::string> entries() {
    std::lock_guard lock(mutex);
    return log;
  }
  std::thread::id destroyer() {
    std::lock_guard lock(mutex);
    return destroyedOn;
  }
};

// A wrapped resource that records its operations and its destruction.
//
// Thread affinity: `applied` is touched only by the control's active
// operation. The probe is thread-safe.
struct TestBody : ResourceBody {
  TestBody(std::shared_ptr<Probe> p, std::string n) : probe(std::move(p)), name(std::move(n)) {}
  ~TestBody() override {
    {
      std::lock_guard lock(probe->mutex);
      probe->destroyedOn = std::this_thread::get_id();
      probe->log.push_back(name + " destroyed");
    }
    ++probe->destroyed;
  }
  // Shared with the test, which reads it after the body is gone.
  std::shared_ptr<Probe> probe;
  std::string name;
  std::vector<std::string> applied;
};

// A body that wraps a library session with a stop bridge.
struct SessionBody : TestBody {
  SessionBody(std::shared_ptr<Probe> p, SessionStopBridge::Wake wake = {})
      : TestBody(std::move(p), "session"), bridge(std::move(wake)) {}
  SessionStopBridge* stopBridge() override { return &bridge; }
  SessionStopBridge bridge;
};

// An operation that records `tag`, checks it runs alone on a live body, and
// returns `outcome` (Value with the tag by default).
std::unique_ptr<gr::NativeJob> record(const std::shared_ptr<ResourceControl>& control, std::string tag,
                                      Kind outcome = Kind::Value) {
  return control->operation<TestBody>([tag, outcome](TestBody& body, ResourceOperationContext&) {
    if (body.probe->destroyed.load() != 0) ++body.probe->usedAfterDestroy;
    if (body.probe->running.fetch_add(1) != 0) ++body.probe->overlaps;
    body.applied.push_back(tag);
    body.probe->note(tag);
    std::this_thread::yield();
    --body.probe->running;
    if (outcome == Kind::Error) return JobOutcome::failure(tag + " failed");
    return text(tag);
  });
}

// An operation that waits on `gate`, or until its stop.
std::unique_ptr<gr::NativeJob> blocked(const std::shared_ptr<ResourceControl>& control, std::string tag,
                                       std::shared_ptr<Gate> gate) {
  return control->operation<TestBody>([tag, gate](TestBody& body, ResourceOperationContext& context) {
    body.probe->note(tag + " started");
    if (!gate->wait(context.stop())) {
      body.probe->note(tag + " stopped");
      return JobOutcome::stopped();
    }
    body.probe->note(tag);
    return text(tag);
  });
}

// --- 1. Open, Retiring, Retired under concurrent acquisition -----------------------

// Gate: acquisition and queue insertion are atomic. Three threads submit
// operations and take leases while a fourth closes (or aborts) the control,
// started together at a barrier, many times. Every job gets exactly one
// result. close() runs every accepted operation and refuses later ones with
// an Error; abort() also rejects queued ones with an AbortError. Each
// submitter's accepted operations run in its order, never two at once and
// never after the body is gone. The body is destroyed exactly once, only
// after the last lease, and no lease is granted after retirement began.
void concurrentAcquisitionAndRetirement(Suite& t, bool abortInstead) {
  ThreadPoolExecutor lane("resource", 4);
  std::mt19937 random(abortInstead ? 7 : 3);
  constexpr int kIterations = 300;
  constexpr int kSubmitters = 3;
  constexpr int kPerSubmitter = 6;
  for (int iteration = 0; iteration < kIterations; ++iteration) {
    auto probe = std::make_shared<Probe>();
    auto control = ResourceControl::create("resource " + std::to_string(iteration),
                                           std::make_unique<TestBody>(probe, "body"), lane);
    TestRun run;
    std::barrier start(kSubmitters + 2);
    std::vector<std::vector<uint64_t>> ids(kSubmitters);
    std::atomic<int> leasedWhileDestroyed{0};
    std::atomic<int> leasesAfterRetirement{0};
    std::vector<std::thread> threads;
    const int retireAfter = int(random() % 4);
    for (int s = 0; s < kSubmitters; ++s) {
      threads.emplace_back([&, s] {
        start.arrive_and_wait();
        for (int i = 0; i < kPerSubmitter; ++i) {
          ids[s].push_back(run.submit(control->operations(),
                                      record(control, std::to_string(s) + ":" + std::to_string(i))));
          if (i % 2 == 0) {
            if (auto lease = control->lease()) {
              std::this_thread::yield();
              if (probe->destroyed.load() != 0) ++leasedWhileDestroyed;
            }
          }
        }
      });
    }
    threads.emplace_back([&] {
      start.arrive_and_wait();
      for (int i = 0; i < retireAfter; ++i) std::this_thread::yield();
      if (abortInstead) {
        control->abort("aborted by the test");
      } else {
        control->close();
      }
      if (control->lease()) ++leasesAfterRetirement;
    });
    start.arrive_and_wait();
    for (auto& thread : threads) thread.join();

    std::vector<uint64_t> all;
    for (const auto& list : ids) all.insert(all.end(), list.begin(), list.end());
    CHECK(run.await(all));
    CHECK(eventually([&] { return control->state() == State::Retired; }));
    CHECK(eventually([&] { return probe->destroyed.load() == 1; }));
    CHECK(probe->overlaps.load() == 0);
    CHECK(probe->usedAfterDestroy.load() == 0);
    CHECK(leasedWhileDestroyed.load() == 0);
    CHECK(leasesAfterRetirement.load() == 0);
    CHECK(!control->lease());
    for (uint64_t id : all) CHECK(run.count(id) == 1);
    // Each submitter's operations ran in its submission order, and every
    // operation that ran had been accepted.
    const auto log = probe->entries();
    for (int s = 0; s < kSubmitters; ++s) {
      int last = -1;
      int ran = 0;
      for (const auto& entry : log) {
        if (entry.rfind(std::to_string(s) + ":", 0) != 0) continue;
        const int i = std::stoi(entry.substr(entry.find(':') + 1));
        CHECK(i > last);
        last = i;
        ++ran;
      }
      int values = 0;
      for (uint64_t id : ids[s]) {
        const auto& result = run.result(id);
        if (result.kind == Kind::Value) ++values;
        if (result.kind == Kind::Error) CHECK(contains(result.error, "is closed"));
        if (!abortInstead) CHECK(result.kind != Kind::Stopped);
        if (result.kind == Kind::Stopped) CHECK(contains(result.error, "aborted by the test"));
      }
      CHECK(values == ran);
      // Under close(), what was accepted ran: refusals come after the run.
      if (!abortInstead) {
        bool refused = false;
        for (uint64_t id : ids[s]) {
          if (run.result(id).kind == Kind::Error) refused = true;
          if (refused) CHECK(run.result(id).kind == Kind::Error);
        }
      }
    }
    control.reset();
    CHECK(eventually([&] { return run.tracker().outstanding() == 0; }));
  }
}

void concurrentClose(Suite& t) { concurrentAcquisitionAndRetirement(t, false); }
void concurrentAbort(Suite& t) { concurrentAcquisitionAndRetirement(t, true); }

// --- 2. finish versus abort ----------------------------------------------------------

// Gate: finish versus abort races. One thread submits two writes and a
// terminal finish, another aborts at a random point. Each job gets one
// result. A finish that ran (Value) ran after both writes, which ran first;
// an abort before the finish was accepted refuses it (Error), and an abort
// while it was queued rejects it (AbortError). The body is destroyed once,
// after whatever ran.
void finishVersusAbort(Suite& t) {
  ThreadPoolExecutor lane("finish", 3);
  std::mt19937 random(11);
  int finished = 0, superseded = 0, refused = 0;
  for (int iteration = 0; iteration < 400; ++iteration) {
    auto probe = std::make_shared<Probe>();
    auto control = ResourceControl::create("encoder", std::make_unique<TestBody>(probe, "body"), lane);
    TestRun run;
    std::barrier start(3);
    uint64_t w1 = 0, w2 = 0, fin = 0;
    // The aborter waits for this many submissions, then a few yields, so
    // the abort lands before, between and after them.
    // 4 waits until the finish started instead.
    const int abortAfterSubmissions = int(random() % 5);
    auto finishStarted = std::make_shared<std::atomic<bool>>(false);
    const int abortYields = int(random() % 4);
    std::atomic<int> submitted{0};
    std::thread writer([&] {
      start.arrive_and_wait();
      w1 = run.submit(control->operations(), record(control, "w1"));
      ++submitted;
      w2 = run.submit(control->operations(), record(control, "w2"));
      ++submitted;
      fin = run.submit(control->terminal(),
                       control->operation<TestBody>([finishStarted](TestBody& body,
                                                                    ResourceOperationContext& context) {
                         finishStarted->store(true);
                         if (body.probe->destroyed.load() != 0) ++body.probe->usedAfterDestroy;
                         body.probe->note(context.precedingFailed() ? "finish unpublished" : "finish");
                         return text("finish");
                       }));
      ++submitted;
    });
    std::thread aborter([&] {
      start.arrive_and_wait();
      if (abortAfterSubmissions == 4) {
        // Nothing aborts or fails before it, so the finish starts.
        while (!finishStarted->load()) std::this_thread::yield();
      } else {
        while (submitted.load() < abortAfterSubmissions) std::this_thread::yield();
      }
      for (int i = 0; i < abortYields; ++i) std::this_thread::yield();
      control->abort("aborted");
    });
    start.arrive_and_wait();
    writer.join();
    aborter.join();
    CHECK(run.await({w1, w2, fin}));
    CHECK(eventually([&] { return control->state() == State::Retired; }));
    CHECK(run.count(w1) == 1 && run.count(w2) == 1 && run.count(fin) == 1);
    CHECK(eventually([&] { return probe->destroyed.load() == 1; }));
    CHECK(probe->usedAfterDestroy.load() == 0);
    const auto log = probe->entries();
    CHECK(!log.empty() && log.back() == "body destroyed");
    switch (run.result(fin).kind) {
      case Kind::Value:
        ++finished;
        CHECK(run.result(w1).kind == Kind::Value && run.result(w2).kind == Kind::Value);
        CHECK((log == std::vector<std::string>{"w1", "w2", "finish", "body destroyed"}));
        break;
      case Kind::Stopped:
        ++superseded;
        CHECK(std::find(log.begin(), log.end(), "finish") == log.end());
        break;
      case Kind::Error:
        ++refused;
        CHECK(contains(run.result(fin).error, "is closed"));
        CHECK(std::find(log.begin(), log.end(), "finish") == log.end());
        break;
    }
  }
  std::fprintf(stderr, "  finish ran %d, superseded %d, refused %d\n", finished, superseded, refused);
  CHECK(finished + superseded + refused == 400);
  // Every branch of the race happened.
  CHECK(finished > 0 && superseded > 0 && refused > 0);
}

// --- 3. terminal barrier ordering ----------------------------------------------------

// Gate: a terminal operation is a barrier after every operation accepted
// before it, nothing enters after it, and it sees whether an earlier
// operation failed, so finish publishes only after preceding writes
// succeeded. close() without a terminal operation runs what was accepted.
void terminalBarrierOrdering(Suite& t) {
  ThreadPoolExecutor lane("barrier", 3);
  for (bool fail : {false, true}) {
    auto probe = std::make_shared<Probe>();
    auto control = ResourceControl::create("encoder", std::make_unique<TestBody>(probe, "body"), lane);
    TestRun run;
    auto gate = std::make_shared<Gate>();
    const uint64_t a = run.submit(control->operations(), blocked(control, "a", gate));
    CHECK(eventually([&] { return control->active(); }));
    const uint64_t b = run.submit(control->operations(), record(control, "b"));
    const uint64_t c = run.submit(control->operations(), record(control, "c", fail ? Kind::Error : Kind::Value));
    const uint64_t fin = run.submit(
        control->terminal(), control->operation<TestBody>([](TestBody& body, ResourceOperationContext& context) {
          if (context.precedingFailed()) {
            body.probe->note("finish refused");
            return JobOutcome::failure("not published: an earlier write failed");
          }
          body.probe->note("finish");
          return text("finish");
        }));
    CHECK(control->state() == State::Retiring);
    CHECK(control->queued() == 3);
    const uint64_t late = run.submit(control->operations(), record(control, "late"));
    const uint64_t second = run.submit(control->terminal(), record(control, "second finish"));
    CHECK(run.await({late, second}));
    CHECK(run.result(late).kind == Kind::Error && contains(run.result(late).error, "encoder is closed"));
    CHECK(run.result(second).kind == Kind::Error);
    CHECK(probe->destroyed.load() == 0);
    gate->release();
    CHECK(run.await({a, b, c, fin}));
    CHECK(eventually([&] { return control->state() == State::Retired; }));
    CHECK(eventually([&] { return probe->destroyed.load() == 1; }));
    const auto log = probe->entries();
    CHECK((log == std::vector<std::string>{"a started", "a", "b", "c", fail ? "finish refused" : "finish",
                                           "body destroyed"}));
    CHECK(run.result(fin).kind == (fail ? Kind::Error : Kind::Value));
    // Results arrive in queue order, after the two refusals.
    CHECK((run.order() == std::vector<uint64_t>{late, second, a, b, c, fin}));
  }
  // close(): the accepted operations run, then the body goes.
  auto probe = std::make_shared<Probe>();
  auto control = ResourceControl::create("reader", std::make_unique<TestBody>(probe, "body"), lane);
  TestRun run;
  auto gate = std::make_shared<Gate>();
  const uint64_t a = run.submit(control->operations(), blocked(control, "a", gate));
  const uint64_t b = run.submit(control->operations(), record(control, "b"));
  control->close();
  const uint64_t late = run.submit(control->operations(), record(control, "late"));
  CHECK(run.await({late}));
  CHECK(run.result(late).kind == Kind::Error);
  gate->release();
  CHECK(run.await({a, b}));
  CHECK(eventually([&] { return probe->destroyed.load() == 1; }));
  CHECK(control->state() == State::Retired);
  CHECK((probe->entries() == std::vector<std::string>{"a started", "a", "b", "body destroyed"}));
}

// Gate: abort rejects the queued operations at once, a queued finish
// included, with an AbortError, before the active operation returns, and
// asks the active one to stop. Nothing queued runs after it.
void abortRejectsQueue(Suite& t) {
  ThreadPoolExecutor lane("abort", 2);
  auto probe = std::make_shared<Probe>();
  auto control = ResourceControl::create("encoder", std::make_unique<TestBody>(probe, "body"), lane);
  TestRun run;
  auto gate = std::make_shared<Gate>();
  const uint64_t a = run.submit(control->operations(), blocked(control, "a", gate));
  // Running, not only dispatched: abort() relays a running operation's stop
  // after it delivered the rejections.
  CHECK(eventually([&] { return !probe->entries().empty(); }));
  const uint64_t b = run.submit(control->operations(), record(control, "b"));
  const uint64_t fin = run.submit(control->terminal(), record(control, "finish"));
  control->abort("aborted by the test");
  CHECK(run.await({a, b, fin}));
  CHECK(run.result(b).kind == Kind::Stopped && contains(run.result(b).error, "aborted by the test"));
  CHECK(run.result(fin).kind == Kind::Stopped);
  CHECK(run.result(a).kind == Kind::Stopped);
  // The rejections are delivered before the active operation is asked to
  // stop, so they come first.
  CHECK((run.order() == std::vector<uint64_t>{b, fin, a}));
  CHECK(eventually([&] { return probe->destroyed.load() == 1; }));
  CHECK((probe->entries() == std::vector<std::string>{"a started", "a stopped", "body destroyed"}));
}

// --- 4. where the body is destroyed ---------------------------------------------------

// The thread of `lane`'s reaper: starts the lane with a job, then relays a
// stop whose callback reports the thread it runs on.
std::thread::id reaperOf(ThreadPoolExecutor& lane) {
  auto started = std::make_shared<Gate>();
  lane.submit(gr::SubmittedJob(0, gr::makeJob([started](std::stop_token) {
                                 started->release();
                                 return JobOutcome::value(nullptr);
                               }),
                               nullptr, {}, gr::RunnerTracker::Ticket{}));
  started->wait();
  std::stop_source source;
  auto seen = std::make_shared<std::promise<std::thread::id>>();
  std::future<std::thread::id> reaper = seen->get_future();
  std::stop_callback report(source.get_token(), [seen] { seen->set_value(std::this_thread::get_id()); });
  lane.stopRelay()->relay(source, nullptr);
  return reaper.get();
}

// Gate: the body is destroyed on the reaper of its destruction lane, never
// on the thread that dropped the last lease, finished the last operation or
// dropped the control. Options::destroyOn names another lane, an owner
// lane, and the dependencies are released there after the body, so a
// dependency's own body then goes to its own lane's reaper.
void destructionThread(Suite& t) {
  ThreadPoolExecutor lane("destroy", 2);
  const std::thread::id reaper = reaperOf(lane);
  {
    auto probe = std::make_shared<Probe>();
    auto control = ResourceControl::create("handle", std::make_unique<TestBody>(probe, "body"), lane);
    auto lease = control->lease();
    CHECK(lease.has_value());
    control->close();
    CHECK(control->state() == State::Retiring);
    CHECK(probe->destroyed.load() == 0);
    std::thread::id releaser;
    std::thread holder([&, held = std::move(*lease)]() mutable {
      releaser = std::this_thread::get_id();
      held.release();
    });
    holder.join();
    CHECK(control->state() == State::Retired);
    CHECK(eventually([&] { return probe->destroyed.load() == 1; }));
    CHECK(probe->destroyer() == reaper);
    CHECK(probe->destroyer() != releaser);
  }
  {
    auto probe = std::make_shared<Probe>();
    auto control = ResourceControl::create("input", std::make_unique<TestBody>(probe, "body"), lane);
    TestRun run;
    auto gate = std::make_shared<Gate>();
    auto opThread = std::make_shared<std::atomic<std::thread::id>>();
    const uint64_t op = run.submit(control->operations(),
                                   control->operation<TestBody>([gate, opThread](TestBody&, ResourceOperationContext&) {
                                     opThread->store(std::this_thread::get_id());
                                     // Ignores its stop: an operation that cannot be interrupted.
                                     gate->wait();
                                     return text("done");
                                   }));
    CHECK(eventually([&] { return control->active(); }));
    control->abort();
    CHECK(control->state() == State::Retiring);
    CHECK(probe->destroyed.load() == 0);
    gate->release();
    CHECK(run.await({op}));
    CHECK(run.result(op).kind == Kind::Value);
    CHECK(eventually([&] { return probe->destroyed.load() == 1; }));
    CHECK(control->state() == State::Retired);
    CHECK(probe->destroyer() == reaper);
    CHECK(probe->destroyer() != opThread->load());
  }
  {
    ThreadPoolExecutor owner("media owner", 1);
    const std::thread::id ownerReaper = reaperOf(owner);
    auto log = std::make_shared<Probe>();
    auto depProbe = std::make_shared<Probe>();
    auto dependency = ResourceControl::create("staging", std::make_unique<TestBody>(depProbe, "staging"), lane);
    ResourceControl::Options options;
    options.destroyOn = &owner;
    options.dependencies.push_back(*dependency->lease());
    auto control =
        ResourceControl::create("encoder", std::make_unique<TestBody>(log, "encoder"), lane, std::move(options));
    dependency->close();
    CHECK(dependency->state() == State::Retiring);
    TestRun run;
    const uint64_t op = run.submit(control->operations(), record(control, "write"));
    CHECK(run.await({op}));
    control->close();
    CHECK(eventually([&] { return log->destroyed.load() == 1 && depProbe->destroyed.load() == 1; }));
    CHECK(log->destroyer() == ownerReaper);
    CHECK(depProbe->destroyer() == reaper);
    CHECK(dependency->state() == State::Retired);
    control.reset();
    dependency.reset();
  }
  {
    auto probe = std::make_shared<Probe>();
    auto control = ResourceControl::create("dropped", std::make_unique<TestBody>(probe, "body"), lane);
    std::thread dropper([held = std::move(control)]() mutable { held.reset(); });
    const auto dropperId = dropper.get_id();
    dropper.join();
    CHECK(eventually([&] { return probe->destroyed.load() == 1; }));
    CHECK(probe->destroyer() == reaper);
    CHECK(probe->destroyer() != dropperId);
  }
}

// A body whose destructor blocks until its gate opens: library cleanup or a
// staging directory removal that takes long.
struct BlockingBody : TestBody {
  BlockingBody(std::shared_ptr<Probe> p, std::shared_ptr<Gate> g, std::shared_ptr<Gate> e)
      : TestBody(std::move(p), "blocking"), gate(std::move(g)), entered(std::move(e)) {}
  ~BlockingBody() override {
    entered->release();
    gate->wait();
  }
  // Shared with the test, which opens it.
  std::shared_ptr<Gate> gate;
  std::shared_ptr<Gate> entered;
};

// Runs `action` on a helper thread standing in for the worker, and reports
// whether it returned within two seconds. Afterwards opens `gate` and joins,
// so a destructor that blocked the helper cannot hang the suite.
bool returnsPromptly(std::function<void()> action, const std::shared_ptr<Gate>& gate) {
  auto returned = std::make_shared<Gate>();
  std::thread worker([action = std::move(action), returned] {
    action();
    returned->release();
  });
  std::unique_lock lock(returned->mutex);
  const bool prompt =
      returned->changed.wait_for(lock, std::chrono::seconds(2), [&] { return returned->open; });
  lock.unlock();
  gate->release();
  worker.join();
  return prompt;
}

// Gate: dropping the last lease, and aborting an idle resource, return at
// once on the calling thread while the body's destructor blocks: the
// destructor runs on the lane's reaper.
void blockingDestructorLeavesTheWorker(Suite& t) {
  ThreadPoolExecutor lane("cleanup", 1);
  (void)reaperOf(lane);
  for (bool abortIdle : {false, true}) {
    auto probe = std::make_shared<Probe>();
    auto gate = std::make_shared<Gate>();
    auto entered = std::make_shared<Gate>();
    auto control = ResourceControl::create("staging", std::make_unique<BlockingBody>(probe, gate, entered), lane);
    std::optional<ResourceLease> lease;
    if (!abortIdle) {
      lease = control->lease();
      control->close();
    }
    std::shared_ptr<ResourceControl> held = control;
    auto drop = std::make_shared<std::optional<ResourceLease>>(std::move(lease));
    const bool prompt = returnsPromptly(
        [held, drop, abortIdle] {
          if (abortIdle) {
            held->abort("run cleanup");
          } else {
            drop->reset();
          }
        },
        gate);
    CHECK(prompt);
    CHECK(eventually([&] { return probe->destroyed.load() == 1; }));
    CHECK(control->state() == State::Retired);
  }
}

// Gate: a destruction lane whose reaper is blocked in a body's destructor
// shuts down by its deadline with TimedOut, without joining the blocked
// thread, and completes once the destructor returns.
void blockedDestructionTimesOutShutdown(Suite& t) {
  auto lane = std::make_unique<ThreadPoolExecutor>("owner", 1);
  (void)reaperOf(*lane);
  auto probe = std::make_shared<Probe>();
  auto gate = std::make_shared<Gate>();
  auto entered = std::make_shared<Gate>();
  auto control = ResourceControl::create("encoder", std::make_unique<BlockingBody>(probe, gate, entered), *lane);
  CHECK(returnsPromptly([held = control] { held->abort("run cleanup"); }, std::make_shared<Gate>()));
  entered->wait();
  control.reset();
  const auto start = Clock::now();
  CHECK(lane->shutdown(Clock::now() + milliseconds(200)) == gr::HostShutdownStatus::TimedOut);
  const auto waited = Clock::now() - start;
  CHECK(waited >= milliseconds(150) && waited < std::chrono::seconds(2));
  CHECK(lane->liveThreads() > 0);
  CHECK(probe->destroyed.load() == 0);
  gate->release();
  CHECK(lane->awaitShutdown(Clock::now() + std::chrono::seconds(10)) == gr::HostShutdownStatus::Complete);
  CHECK(probe->destroyed.load() == 1);
  lane.reset();
}

// Gate: abort() never runs an operation's stop callback on its own thread.
// The interleaving is forced with the abort hook: abort() decides while the
// operation is dispatched to its lane but not started, then, before abort()
// requests anything, the lane starts the operation, which registers a stop
// callback. The callback must run on the lane, never on the aborting
// thread.
void abortRacesOperationStart(Suite& t) {
  ThreadPoolExecutor lane("start", 1);
  auto blocker = std::make_shared<Gate>();
  lane.submit(gr::SubmittedJob(0, gr::makeJob([blocker](std::stop_token) {
                                 blocker->wait();
                                 return JobOutcome::value(nullptr);
                               }),
                               nullptr, {}, gr::RunnerTracker::Ticket{}));
  CHECK(eventually([&] { return lane.running() == 1; }));
  auto registered = std::make_shared<Gate>();
  auto callbackThread = std::make_shared<std::atomic<std::thread::id>>();
  auto opThread = std::make_shared<std::atomic<std::thread::id>>();
  ResourceControl::Options options;
  options.hooks.abortUnlocked = [blocker, registered] {
    blocker->release();
    registered->wait();
  };
  auto probe = std::make_shared<Probe>();
  auto control =
      ResourceControl::create("decoder", std::make_unique<TestBody>(probe, "body"), lane, std::move(options));
  TestRun run;
  const uint64_t op = run.submit(
      control->operations(),
      control->operation<TestBody>([registered, callbackThread, opThread](TestBody&, ResourceOperationContext& context) {
        opThread->store(std::this_thread::get_id());
        std::stop_callback onStop(context.stop(),
                                  [callbackThread] { callbackThread->store(std::this_thread::get_id()); });
        registered->release();
        Gate never;
        never.wait(context.stop());
        return JobOutcome::stopped();
      }));
  CHECK(control->active());
  CHECK(lane.queued() == 1);
  control->abort("run cleanup");
  CHECK(run.await({op}));
  CHECK(run.result(op).kind == Kind::Stopped);
  CHECK(callbackThread->load() != std::thread::id{});
  CHECK(callbackThread->load() != std::this_thread::get_id());
  CHECK(callbackThread->load() == opThread->load());
  CHECK(eventually([&] { return probe->destroyed.load() == 1; }));
}

// --- 5. dependents release before staging cleanup --------------------------------------

// Gate: run cleanup retires a staging directory before its reader. The
// staging body, whose destructor stands for the directory removal, is
// destroyed only after the reader's body: the reader's dependency lease is
// released after the reader body goes. Retirement grants no new lease, and
// the reader's active operation is asked to stop through the lane's relay.
void dependentsReleaseBeforeStagingCleanup(Suite& t) {
  ThreadPoolExecutor lane("staging", 2);
  auto log = std::make_shared<Probe>();
  auto staging = ResourceControl::create("staging", std::make_unique<TestBody>(log, "staging"), lane);
  ResourceControl::Options options;
  options.dependencies.push_back(*staging->lease());
  auto reader = ResourceControl::create("reader", std::make_unique<TestBody>(log, "reader"), lane,
                                        std::move(options));
  TestRun run;
  auto gate = std::make_shared<Gate>();
  const uint64_t op = run.submit(reader->operations(), blocked(reader, "read", gate));
  CHECK(eventually([&] { return reader->active(); }));
  // Run cleanup, staging first.
  staging->abort("run cleanup");
  CHECK(staging->state() == State::Retiring);
  CHECK(!staging->lease());
  CHECK(log->destroyed.load() == 0);
  reader->abort("run cleanup");
  CHECK(run.await({op}));
  CHECK(run.result(op).kind == Kind::Stopped);
  CHECK(eventually([&] { return log->destroyed.load() == 2; }));
  CHECK(staging->state() == State::Retired);
  CHECK(reader->state() == State::Retired);
  CHECK((log->entries() ==
         std::vector<std::string>{"read started", "read stopped", "reader destroyed", "staging destroyed"}));
}

// --- 6. session stop bridge -------------------------------------------------------------

// Gate: the bridge's flags. A binding sets the active operation, resets the
// operation flag and registers its stop; unbinding clears both. A stop of an
// earlier operation does not reach a later one. Retirement is permanent and
// later bindings cannot clear it. The interrupt callback reads the OR.
void stopBridgeFlags(Suite& t) {
  std::atomic<int> wakes{0};
  SessionStopBridge bridge([&wakes] { ++wakes; });
  CHECK(!bridge.stopped() && bridge.activeOperation() == 0);
  std::stop_source first;
  {
    SessionStopBridge::Binding binding(bridge, 1, first.get_token());
    CHECK(bridge.activeOperation() == 1 && !bridge.operationStopped());
    first.request_stop();
    CHECK(bridge.operationStopped() && bridge.stopped() && !bridge.sessionStopped());
    CHECK(SessionStopBridge::interrupt(&bridge) == 1);
  }
  CHECK(!bridge.stopped() && bridge.activeOperation() == 0);
  std::stop_source second;
  {
    SessionStopBridge::Binding binding(bridge, 2, second.get_token());
    CHECK(bridge.activeOperation() == 2 && !bridge.stopped());
    first.request_stop();
    CHECK(!bridge.stopped());
  }
  {
    // A token that stopped before binding sets the flag at once.
    SessionStopBridge::Binding binding(bridge, 3, first.get_token());
    CHECK(bridge.operationStopped());
  }
  CHECK(wakes.load() == 2);
  bridge.retire();
  bridge.retire();
  CHECK(wakes.load() == 3);
  CHECK(bridge.sessionStopped() && bridge.stopped());
  std::stop_source fourth;
  {
    SessionStopBridge::Binding binding(bridge, 4, fourth.get_token());
    CHECK(!bridge.operationStopped() && bridge.stopped());
    CHECK(SessionStopBridge::interrupt(&bridge) == 1);
  }
  CHECK(bridge.sessionStopped() && bridge.stopped());
}

// Gate: serial token rebinding through a control. Operation 1 of run A is
// bound to the bridge; stopping run A sets operationStopped for it. Operation
// 2 of run B, queued behind it, starts with the flag reset and its own id,
// and a later stop of run A does not reach it. abort() sets sessionStopped
// permanently, and no operation enters after it.
void stopBridgeRebinding(Suite& t) {
  ThreadPoolExecutor lane("rebind", 2);
  auto probe = std::make_shared<Probe>();
  auto body = std::make_unique<SessionBody>(probe);
  SessionStopBridge* bridge = &body->bridge;
  auto control = ResourceControl::create("decoder", std::move(body), lane);
  TestRun runA(1), runB(2);
  auto sawOwnId = std::make_shared<std::atomic<int>>(0);
  auto ids = std::make_shared<std::array<std::atomic<uint64_t>, 2>>();
  auto gate = std::make_shared<Gate>();
  const uint64_t op1 = runA.submit(
      control->operations(),
      control->operation<SessionBody>([sawOwnId, ids](SessionBody& session, ResourceOperationContext& context) {
        (*ids)[0] = context.id();
        if (session.bridge.activeOperation() == context.id() && !session.bridge.stopped()) ++*sawOwnId;
        // Waits, as a library call would, until the interrupt flag is set.
        while (!session.bridge.stopped()) std::this_thread::sleep_for(milliseconds(1));
        if (session.bridge.operationStopped() && !session.bridge.sessionStopped()) ++*sawOwnId;
        return JobOutcome::stopped();
      }));
  const uint64_t op2 = runB.submit(control->operations(), control->operation<SessionBody>(
                                                              [sawOwnId, ids, gate](SessionBody& session,
                                                                                    ResourceOperationContext& context) {
                                                                (*ids)[1] = context.id();
                                                                if (session.bridge.activeOperation() == context.id() &&
                                                                    !session.bridge.stopped()) {
                                                                  ++*sawOwnId;
                                                                }
                                                                gate->wait();
                                                                if (!session.bridge.stopped()) ++*sawOwnId;
                                                                return text("op2");
                                                              }));
  CHECK(eventually([&] { return sawOwnId->load() == 1; }));
  runA.stop().request_stop();
  CHECK(runA.await({op1}));
  CHECK(runA.result(op1).kind == Kind::Stopped);
  CHECK(eventually([&] { return sawOwnId->load() == 3; }));
  CHECK((*ids)[1].load() != (*ids)[0].load() && (*ids)[1].load() != 0);
  CHECK(!bridge->stopped());
  gate->release();
  CHECK(runB.await({op2}));
  CHECK(runB.result(op2).kind == Kind::Value);
  CHECK(sawOwnId->load() == 4);
  control->abort("run cleanup");
  CHECK(eventually([&] { return control->state() == State::Retired; }));
  const uint64_t late = runB.submit(control->operations(), record(control, "late"));
  CHECK(runB.await({late}));
  CHECK(runB.result(late).kind == Kind::Error);
}

// Gate: a cancelled operation that may leave codec state unusable retires
// the session. The bridge's session flag is set once it returns, its own
// result is delivered first, and the operations queued behind it, from
// another run, reject with an Error naming the reason.
void cancelledOperationRetiresSession(Suite& t) {
  ThreadPoolExecutor lane("codec", 2);
  auto probe = std::make_shared<Probe>();
  auto body = std::make_unique<SessionBody>(probe);
  auto control = ResourceControl::create("decoder", std::move(body), lane);
  TestRun runA(1), runB(2);
  auto started = std::make_shared<Gate>();
  const uint64_t op1 = runA.submit(control->operations(), control->operation<SessionBody>(
                                                              [started](SessionBody& session,
                                                                        ResourceOperationContext& context) {
                                                                started->release();
                                                                while (!session.bridge.stopped()) {
                                                                  std::this_thread::sleep_for(milliseconds(1));
                                                                }
                                                                context.retireSession("codec state lost");
                                                                return JobOutcome::stopped();
                                                              }));
  started->wait();
  const uint64_t op2 = runB.submit(control->operations(), record(control, "op2"));
  const uint64_t op3 = runB.submit(control->operations(), record(control, "op3"));
  CHECK(control->queued() == 2);
  runA.stop().request_stop();
  CHECK(runA.await({op1}));
  CHECK(runB.await({op2, op3}));
  CHECK(runA.result(op1).kind == Kind::Stopped);
  CHECK(runB.result(op2).kind == Kind::Error && contains(runB.result(op2).error, "codec state lost"));
  CHECK(runB.result(op3).kind == Kind::Error && contains(runB.result(op3).error, "codec state lost"));
  CHECK(eventually([&] { return control->state() == State::Retired; }));
  CHECK(eventually([&] { return probe->destroyed.load() == 1; }));
  CHECK((probe->entries() == std::vector<std::string>{"session destroyed"}));
}

// Gate: the stop callback registration is destroyed outside every lock of
// the control. The bridge's wake stands in for a callback that takes a lock
// the executor might hold: it waits until the operation returned, then
// reads the control's state, which takes the control's mutex. A control
// that destroyed the binding under that mutex would wait for the callback
// forever while the callback waited for the mutex. The operation returns
// without waiting for the callback to finish.
void callbackDestroyedOutsideLocks(Suite& t) {
  ThreadPoolExecutor lane("unbind", 2);
  for (int iteration = 0; iteration < 20; ++iteration) {
    struct Signals {
      std::atomic<bool> armed{false};
      Gate entered;
      std::atomic<int> readState{0};
      std::weak_ptr<ResourceControl> control;
      std::mutex mutex;  // guards `control`
    };
    auto signals = std::make_shared<Signals>();
    auto probe = std::make_shared<Probe>();
    auto body = std::make_unique<SessionBody>(probe, [signals] {
      if (!signals->armed.exchange(false)) return;
      signals->entered.release();
      // Lets the operation return and the executor reach the unbinding.
      std::this_thread::sleep_for(milliseconds(30));
      std::shared_ptr<ResourceControl> control;
      {
        std::lock_guard lock(signals->mutex);
        control = signals->control.lock();
      }
      if (control) {
        (void)control->state();
        ++signals->readState;
      }
    });
    auto control = ResourceControl::create("unbind", std::move(body), lane);
    {
      std::lock_guard lock(signals->mutex);
      signals->control = control;
    }
    TestRun run;
    auto stopper = std::make_shared<std::optional<std::thread>>();
    const uint64_t op = run.submit(
        control->operations(),
        control->operation<SessionBody>([signals, stopper, stop = run.stop()](SessionBody&,
                                                                               ResourceOperationContext&) mutable {
          signals->armed = true;
          stopper->emplace([stop]() mutable { stop.request_stop(); });
          signals->entered.wait();
          return text("returned");
        }));
    const auto deadline = Clock::now() + std::chrono::seconds(10);
    while (!run.has(op) && Clock::now() < deadline) {
      run.drain();
      std::this_thread::sleep_for(milliseconds(1));
    }
    if (!run.has(op)) {
      std::fprintf(stderr, "DEADLOCK: the binding was destroyed under the control's mutex\n");
      std::_Exit(1);
    }
    CHECK(run.result(op).kind == Kind::Value);
    CHECK(eventually([&] { return signals->readState.load() == 1; }));
    if (*stopper) (*stopper)->join();
    control->close();
    CHECK(control->state() == State::Retired);
  }
}

// --- 7. through AsyncRun ----------------------------------------------------------------

// Gate: host functions submit through AsyncRun::submit to a control's
// ports. Promises settle in queue order, and an operation after finish
// rejects as closed. The run attaches to the port, keeping the
// control alive after the test drops it until the run is destroyed.
void throughAsyncRun(Suite& t) {
  ThreadPoolExecutor lane("async", 2);
  auto engine = gr::js::createQuickJsEngine();
  gr::Loop& loop = gr::Loop::current();
  gr::CancelState state;
  const uint64_t generation = state.beginRun();
  auto tracker = std::make_shared<gr::RunnerTracker>();
  auto probe = std::make_shared<Probe>();
  std::weak_ptr<ResourceControl> weak;
  {
    // A shared pointer only so the host functions can hold weak references.
    // The test owns it alone, and destroying it here detaches the run.
    auto async = std::make_shared<gr::AsyncRun>(*engine, loop, tracker, generation, lane);
    auto control = ResourceControl::create("encoder", std::make_unique<TestBody>(probe, "body"), lane);
    weak = control;
    gr::Converter convert = [](gr::js::Engine& e, gr::JobPayload* payload) {
      return e.string(static_cast<TestRun::TextPayload*>(payload)->text);
    };
    auto bind = [&](const char* name, bool terminal) {
      std::weak_ptr<gr::AsyncRun> weakRun = async;
      engine->set(engine->global(), name,
                  engine->function(name, 1,
                                   [weakRun, weak, convert, terminal](gr::js::Engine& e,
                                                                      const std::vector<gr::js::Value>& a) {
                                     auto run = weakRun.lock();
                                     auto target = weak.lock();
                                     if (!run || !target) throw std::runtime_error("the test run ended");
                                     const std::string tag = e.toString(a.at(0));
                                     gr::JobExecutor& port = terminal ? target->terminal() : target->operations();
                                     return run->submit(port, record(target, tag), convert);
                                   }));
    };
    bind("op", false);
    bind("finish", true);
    engine->evaluateScript(
        "globalThis.out = [];"
        "op('a').then((v) => out.push(v));"
        "op('b').then((v) => out.push(v));"
        "finish('f').then((v) => out.push(v));"
        "op('late').catch((e) => out.push('late: ' + e.message));",
        "async.js");
    gr::EngineRunControl run(*engine, *async, state, generation, [&] {
      return engine->toString(engine->evaluateScript("String(out.length === 4)", "check.js")) == "true";
    });
    CHECK(loop.run(run) == gr::RunExit::Done);
    // a, b and f settle in queue order. The refusal settles at its own
    // macrotask, which can come after a when a finished before late was
    // submitted.
    const std::string settled = engine->toString(engine->evaluateScript(
        "out.filter((v) => !v.startsWith('late')).join(',') + '|' + out.filter((v) => v.startsWith('late')).join()",
        "out.js"));
    CHECK(settled == "a,b,f|late: encoder is closed");
    CHECK(eventually([&] { return control->state() == State::Retired; }));
    CHECK(eventually([&] { return probe->destroyed.load() == 1; }));
    async->teardown();
    control.reset();
    // The run still holds the port, so the control lives on.
    CHECK(!weak.expired());
    async.reset();
  }
  // The refused job goes to the process disposer, which destroys it, and
  // its reference to the control, later.
  CHECK(tracker->waitIdle(Clock::now() + std::chrono::seconds(10)));
  CHECK(weak.expired());
  loop.abandon();
}

// Gate: inline mode. On the worker's InlineExecutor, operations run at
// submission and their results still go through the mailbox in order.
void inlineLane(Suite& t) {
  InlineExecutor lane;
  auto probe = std::make_shared<Probe>();
  auto control = ResourceControl::create("inline", std::make_unique<TestBody>(probe, "body"), lane);
  TestRun run;
  const uint64_t a = run.submit(control->operations(), record(control, "a"));
  const uint64_t b = run.submit(control->operations(), record(control, "b"));
  const uint64_t fin = run.submit(control->terminal(), record(control, "finish"));
  CHECK(control->state() == State::Retired);
  CHECK(probe->destroyer() == std::this_thread::get_id());
  CHECK(run.await({a, b, fin}));
  CHECK((run.order() == std::vector<uint64_t>{a, b, fin}));
}

}  // namespace

int main() {
  Suite suite;
  Suite& t = suite;
  const std::vector<std::pair<const char*, void (*)(Suite&)>> tests = {
      {"concurrentClose", concurrentClose},
      {"concurrentAbort", concurrentAbort},
      {"finishVersusAbort", finishVersusAbort},
      {"terminalBarrierOrdering", terminalBarrierOrdering},
      {"abortRejectsQueue", abortRejectsQueue},
      {"destructionThread", destructionThread},
      {"blockingDestructorLeavesTheWorker", blockingDestructorLeavesTheWorker},
      {"blockedDestructionTimesOutShutdown", blockedDestructionTimesOutShutdown},
      {"abortRacesOperationStart", abortRacesOperationStart},
      {"dependentsReleaseBeforeStagingCleanup", dependentsReleaseBeforeStagingCleanup},
      {"stopBridgeFlags", stopBridgeFlags},
      {"stopBridgeRebinding", stopBridgeRebinding},
      {"cancelledOperationRetiresSession", cancelledOperationRetiresSession},
      {"callbackDestroyedOutsideLocks", callbackDestroyedOutsideLocks},
      {"throughAsyncRun", throughAsyncRun},
      {"inlineLane", inlineLane},
  };
  const char* only = std::getenv("GR_RESOURCE_ONLY");
  for (const auto& [name, fn] : tests) {
    if (only && std::string(only) != name) continue;
    suite.begin(name, std::chrono::seconds(240));
    const int before = suite.failures();
    fn(suite);
    suite.end();
    std::fprintf(stderr, "%s %s\n", suite.failures() == before ? "PASS" : "FAIL", name);
  }
  (void)t;
  std::fprintf(stderr, "%d checks, %d failed\n", suite.checks(), suite.failures());
  return suite.failures() == 0 ? 0 : 1;
}
