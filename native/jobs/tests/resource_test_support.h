// Shared by the resource control tests of this package and the graph
// runner's rollout step 5 tests (native/graph-runner/unittests/
// resource_control.cpp, asset_destinations.cpp, files_async.cpp and
// media_async.cpp): the check counters, a watchdog, a gate, one run's
// mailbox side without an engine, and test resource bodies.
//
// Helpers share state with other threads through shared pointers or
// objects that outlive every thread they are handed to, which each test
// joins before it returns (native/AGENTS.md rule 12).
#pragma once

#include "nodetool/jobs/admission.h"
#include "nodetool/jobs/job_core.h"
#include "nodetool/jobs/resource_control.h"
#include "nodetool/jobs/session_stop.h"
#include "nodetool/jobs/wake_target.h"

#include <atomic>
#include <chrono>
#include <condition_variable>
#include <cstdio>
#include <cstdlib>
#include <functional>
#include <map>
#include <memory>
#include <mutex>
#include <optional>
#include <stop_token>
#include <string>
#include <thread>
#include <utility>
#include <vector>

namespace step5 {

using Clock = std::chrono::steady_clock;
using std::chrono::milliseconds;

// One run of a suite: the check counters and a watchdog that fails the
// process when a test hangs. Constructed in main() and destroyed before it
// returns, which stops and joins the watchdog.
//
// Thread affinity: check() is thread-safe (atomic counters). begin(), end()
// and the destructor run on the main thread. The watchdog thread shares only
// `Watch`, through a shared pointer, guarded by its mutex.
class Suite {
public:
  Suite() : watch_(std::make_shared<Watch>()) {
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
  int failures() const { return failures_; }
  int checks() const { return checks_; }

private:
  // Thread affinity: thread-safe. run() is the watchdog thread's loop and
  // the main thread sets the deadline and stops it, all under `mutex`.
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

  std::atomic<int> failures_{0};
  std::atomic<int> checks_{0};
  std::shared_ptr<Watch> watch_;
  std::thread watchdog_;
};

#define CHECK(cond) t.check(static_cast<bool>(cond), __FILE__, __LINE__, #cond)

// Polls `ready` until it holds or `timeout` passes.
template <class F>
bool eventually(F ready, milliseconds timeout = milliseconds(10000)) {
  const auto until = Clock::now() + timeout;
  while (!ready()) {
    if (Clock::now() > until) return false;
    std::this_thread::sleep_for(milliseconds(1));
  }
  return true;
}

// A one-shot gate jobs wait on.
//
// Thread affinity: thread-safe, `mutex` guards `open`.
struct Gate {
  std::mutex mutex;
  std::condition_variable_any changed;
  bool open = false;

  void release() {
    {
      std::lock_guard lock(mutex);
      open = true;
    }
    changed.notify_all();
  }
  void wait() {
    std::unique_lock lock(mutex);
    changed.wait(lock, [this] { return open; });
  }
  // True when the gate opened, false when `stop` was requested first.
  bool wait(std::stop_token stop) {
    std::unique_lock lock(mutex);
    return changed.wait(lock, stop, [this] { return open; });
  }
};

// One run's side of a job, without an engine: a mailbox, a tracker and a
// stop source, as the graph runner's AsyncRun holds them. Results are
// polled, so the mailbox's wake target records nothing.
//
// Thread affinity: submit() is thread-safe (atomic id, thread-safe mailbox
// and tracker). drain() and the result maps belong to the thread that
// created the run, which owns its loop.
class TestRun {
public:
  // Thread affinity: the run's thread, which drains results into it.
  struct Result {
    nodetool::jobs::JobOutcome::Kind kind;
    std::string error;
    // Whatever the test's payload says, when there was one.
    std::string text;
  };

  explicit TestRun(uint64_t run = 1)
      : mailbox_(std::make_shared<nodetool::jobs::RunMailbox>(wake_)),
        tracker_(std::make_shared<nodetool::jobs::RunnerTracker>()),
        run_(run) {}
  // Closes the mailbox, then waits until every job of the run is destroyed,
  // so a job a lane disposes later cannot outlive the test's lanes.
  ~TestRun() {
    (void)mailbox_->close();
    if (!tracker_->waitIdle(Clock::now() + std::chrono::seconds(30))) {
      std::fprintf(stderr, "a test run's jobs were not destroyed within 30 s\n");
      std::_Exit(1);
    }
  }
  TestRun(const TestRun&) = delete;
  TestRun& operator=(const TestRun&) = delete;

  // `reservation` travels with the job into its result, as AsyncRun passes
  // a job's admission charge.
  uint64_t submit(nodetool::jobs::JobExecutor& executor, std::unique_ptr<nodetool::jobs::NativeJob> job,
                  nodetool::jobs::Reservation reservation = {}) {
    const uint64_t id = next_++;
    executor.submit(nodetool::jobs::SubmittedJob(id, std::move(job), mailbox_, stop_.get_token(), tracker_->acquire(run_),
                                                 std::move(reservation)));
    return id;
  }
  // Takes every waiting result.
  void drain() {
    while (auto result = mailbox_->take()) {
      ++counts_[result->id];
      order_.push_back(result->id);
      std::string text;
      const nodetool::jobs::JobPayload* payload = result->outcome.payload.get();
      if (auto* textPayload = dynamic_cast<const TextPayload*>(payload)) {
        text = textPayload->text;
      } else if (payload && describe) {
        text = describe(*payload);
      }
      results_[result->id] = Result{result->outcome.kind, result->outcome.error, std::move(text)};
    }
  }
  // Drains until `ids` all have results, or `timeout` passes.
  bool await(const std::vector<uint64_t>& ids, milliseconds timeout = milliseconds(10000)) {
    return eventually(
        [&] {
          drain();
          for (uint64_t id : ids) {
            if (!results_.count(id)) return false;
          }
          return true;
        },
        timeout);
  }
  // Ends the run as teardown does: requests stop, then closes the mailbox.
  void teardown() {
    stop_.request_stop();
    (void)mailbox_->close();
  }

  // A Value payload carrying a string.
  //
  // Thread affinity: one thread at a time. Written once by the job's thread
  // before delivery, then read and destroyed by the thread that drains or
  // disposes of the result.
  struct TextPayload final : nodetool::jobs::JobPayload {
    explicit TextPayload(std::string t) : text(std::move(t)) {}
    std::string text;
  };

  // Describes a payload that is not a TextPayload, for result().text.
  std::function<std::string(const nodetool::jobs::JobPayload&)> describe;

  std::stop_source& stop() { return stop_; }
  nodetool::jobs::RunnerTracker& tracker() { return *tracker_; }
  bool has(uint64_t id) const { return results_.count(id) != 0; }
  const Result& result(uint64_t id) const { return results_.at(id); }
  int count(uint64_t id) const {
    auto it = counts_.find(id);
    return it == counts_.end() ? 0 : it->second;
  }
  const std::vector<uint64_t>& order() const { return order_; }
  size_t received() const { return order_.size(); }

private:
  // Nothing waits for a wake: drain() polls.
  //
  // Thread affinity: thread-safe, stateless.
  struct NoWait final : nodetool::jobs::WakeTarget {
    void wake() override {}
  };

  // Declared before the mailbox, which holds it until the destructor
  // closes the mailbox.
  NoWait wake_;
  // Shared with every job's delivery, as AsyncRun shares it.
  std::shared_ptr<nodetool::jobs::RunMailbox> mailbox_;
  // Shared with every job's ticket.
  std::shared_ptr<nodetool::jobs::RunnerTracker> tracker_;
  uint64_t run_;
  std::stop_source stop_;
  std::atomic<uint64_t> next_{1};
  std::map<uint64_t, Result> results_;
  std::map<uint64_t, int> counts_;
  std::vector<uint64_t> order_;
};

inline nodetool::jobs::JobOutcome text(std::string value) {
  return nodetool::jobs::JobOutcome::value(std::make_unique<TestRun::TextPayload>(std::move(value)));
}

inline bool contains(const std::string& haystack, const std::string& needle) {
  return haystack.find(needle) != std::string::npos;
}

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
struct TestBody : nodetool::jobs::ResourceBody {
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
//
// Thread affinity: as TestBody. The bridge is thread-safe, so a stop
// request may reach it from any thread.
struct SessionBody : TestBody {
  SessionBody(std::shared_ptr<Probe> p, nodetool::jobs::SessionStopBridge::Wake wake = {})
      : TestBody(std::move(p), "session"), bridge(std::move(wake)) {}
  nodetool::jobs::SessionStopBridge* stopBridge() override { return &bridge; }
  nodetool::jobs::SessionStopBridge bridge;
};

// An operation that records `tag`, checks it runs alone on a live body, and
// returns `outcome` (Value with the tag by default).
inline std::unique_ptr<nodetool::jobs::NativeJob> record(
    const std::shared_ptr<nodetool::jobs::ResourceControl>& control, std::string tag,
    nodetool::jobs::JobOutcome::Kind outcome = nodetool::jobs::JobOutcome::Kind::Value) {
  return control->operation<TestBody>([tag, outcome](TestBody& body, nodetool::jobs::ResourceOperationContext&) {
    if (body.probe->destroyed.load() != 0) ++body.probe->usedAfterDestroy;
    if (body.probe->running.fetch_add(1) != 0) ++body.probe->overlaps;
    body.applied.push_back(tag);
    body.probe->note(tag);
    std::this_thread::yield();
    --body.probe->running;
    if (outcome == nodetool::jobs::JobOutcome::Kind::Error) {
      return nodetool::jobs::JobOutcome::failure(tag + " failed");
    }
    return text(tag);
  });
}

// A body whose destructor blocks until its gate opens: library cleanup or a
// staging directory removal that takes long.
//
// Thread affinity: as TestBody. Destroyed on whichever thread its control
// destroys bodies on. The gates are thread-safe.
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
inline bool returnsPromptly(std::function<void()> action, const std::shared_ptr<Gate>& gate) {
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

}  // namespace step5
