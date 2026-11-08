// Native jobs and their completions (docs/plans/graph-runner-async-host.md,
// sections 4.2, 4.3 and 4.10).
//
// A host function submits a NativeJob that owns native inputs only. The job
// runs on an executor, and its JobResult reaches the worker through the
// run's RunMailbox. Only the worker converts the result into a JavaScript
// value and settles the promise its SettlerRegistry holds. Jobs and the
// mailbox never hold a js::Value, a promise capability or a coroutine handle,
// so a job can outlive its run: closing the mailbox ends the job's access to
// the run, and a result delivered after that is destroyed on the delivering
// thread.
#pragma once

#include "js/engine.h"
#include "js/thread_owner.h"
#include "kernel/task.h"

#include <chrono>
#include <condition_variable>
#include <cstdint>
#include <deque>
#include <functional>
#include <map>
#include <memory>
#include <mutex>
#include <optional>
#include <stop_token>
#include <string>
#include <unordered_map>
#include <utility>
#include <vector>

namespace gr {

// A job's native result. Never holds a JavaScript value.
struct JobPayload {
  virtual ~JobPayload() = default;
};

// Counts the jobs of one runner that are not disposed yet, across all of
// its runs. Jobs share it, so it outlives the runner object.
class RunnerTracker : public std::enable_shared_from_this<RunnerTracker> {
public:
  // Held by a job from submission until its result is destroyed.
  class Ticket {
  public:
    Ticket() = default;
    Ticket(Ticket&& other) noexcept
        : tracker_(std::move(other.tracker_)), run_(other.run_) {}
    Ticket& operator=(Ticket&& other) noexcept;
    Ticket(const Ticket&) = delete;
    Ticket& operator=(const Ticket&) = delete;
    ~Ticket() { release(); }

    uint64_t run() const { return run_; }
    explicit operator bool() const { return tracker_ != nullptr; }

  private:
    friend class RunnerTracker;
    Ticket(std::shared_ptr<RunnerTracker> tracker, uint64_t run)
        : tracker_(std::move(tracker)), run_(run) {}
    void release();

    std::shared_ptr<RunnerTracker> tracker_;
    uint64_t run_ = 0;
  };

  Ticket acquire(uint64_t run);
  size_t outstanding() const;
  size_t outstanding(uint64_t run) const;
  // Waits until no ticket is held or `deadline` passes. True when none is.
  bool waitIdle(std::chrono::steady_clock::time_point deadline) const;

private:
  void release(uint64_t run);

  mutable std::mutex mutex_;
  mutable std::condition_variable released_;
  std::map<uint64_t, size_t> perRun_;
  size_t total_ = 0;
};

// What a job produced.
struct JobOutcome {
  enum class Kind { Value, Error, Stopped };
  Kind kind = Kind::Value;
  std::unique_ptr<JobPayload> payload;
  std::string error;

  static JobOutcome value(std::unique_ptr<JobPayload> payload) {
    return {Kind::Value, std::move(payload), {}};
  }
  static JobOutcome failure(std::string message) { return {Kind::Error, nullptr, std::move(message)}; }
  static JobOutcome stopped() { return {Kind::Stopped, nullptr, {}}; }
};

struct JobResult {
  // Declared first so it is released last, after the payload is destroyed.
  RunnerTracker::Ticket ticket;
  uint64_t id = 0;
  JobOutcome outcome;
};

// The results of one run's jobs on their way to the worker.
class RunMailbox {
public:
  explicit RunMailbox(Loop& wake) : wake_(&wake) {}
  RunMailbox(const RunMailbox&) = delete;
  RunMailbox& operator=(const RunMailbox&) = delete;

  // Thread-safe. While the mailbox is open, appends `result` and wakes the
  // loop while still holding the mailbox mutex, so close() cannot take the
  // loop away meanwhile. Lock order: mailbox, then the loop's wake mutex.
  // Once closed, destroys `result` on the calling thread after unlocking.
  // Returns whether the result was accepted.
  bool deliver(JobResult result);
  // Worker. Drops the wake target and hands back the results still waiting,
  // so the caller can destroy them off the worker (a payload's destructor
  // may block). Idempotent: a second call returns nothing.
  [[nodiscard]] std::deque<JobResult> close();
  // Worker. The oldest waiting result.
  std::optional<JobResult> take();
  bool pending() const;
  bool closed() const;

private:
  mutable std::mutex mutex_;
  Loop* wake_;
  std::deque<JobResult> results_;
};

// Turns a Value result's payload into the JavaScript value its promise
// resolves with. Runs on the worker. Throwing rejects the promise.
using Converter = std::function<js::Value(js::Engine&, JobPayload*)>;

// The worker's pending promises, indexed by job id.
class SettlerRegistry {
public:
  explicit SettlerRegistry(js::Engine& engine) : engine_(engine) {}

  void add(uint64_t id, js::PromiseCapability capability, Converter convert);
  // Settles the promise registered under result.id: Value resolves with the
  // converted payload, Error rejects with an Error, Stopped with an
  // AbortError. A result without a settler is destroyed. Returns whether a
  // promise was settled.
  bool settle(JobResult result);
  // Drops every settler. Its promise stays pending.
  void clear();
  size_t size() const;

private:
  struct Settler {
    js::PromiseCapability capability;
    Converter convert;
  };
  js::Value error(const std::string& message, const char* name);

  js::Engine& engine_;
  [[no_unique_address]] ThreadOwner owner_;
  std::unordered_map<uint64_t, Settler> settlers_;
};

// Native work. Runs once, inline on the worker or on another thread, and
// must not touch JavaScript values, coroutine frames or the engine. A stop
// callback registered on run()'s token only sets flags or issues a
// non-blocking wake (design section 4.9), and destroying the job's inputs
// does not wait on other work. A lane (src/kernel/host_lanes.h) runs both
// on its own reaper thread, so a job that breaks this rule delays its lane
// but never the worker's teardown or a timed shutdown.
class NativeJob {
public:
  virtual ~NativeJob() = default;
  virtual JobOutcome run(std::stop_token stop) = 0;
};

template <class F>
std::unique_ptr<NativeJob> makeJob(F work) {
  struct Job final : NativeJob {
    explicit Job(F f) : work(std::move(f)) {}
    JobOutcome run(std::stop_token stop) override { return work(std::move(stop)); }
    F work;
  };
  return std::make_unique<Job>(std::move(work));
}

// A job with everything it owns on its way through an executor: the run's
// stop token, its tracker ticket and its mailbox.
class SubmittedJob {
public:
  SubmittedJob(uint64_t id, std::unique_ptr<NativeJob> job, std::shared_ptr<RunMailbox> mailbox,
               std::stop_token stop, RunnerTracker::Ticket ticket)
      : id_(id), job_(std::move(job)), mailbox_(std::move(mailbox)), stop_(std::move(stop)),
        ticket_(std::move(ticket)) {}
  SubmittedJob(SubmittedJob&&) noexcept = default;
  SubmittedJob& operator=(SubmittedJob&&) noexcept = default;
  // The job's inputs and mailbox go first, so the ticket counts the job
  // until nothing of it is left.
  ~SubmittedJob() {
    job_.reset();
    mailbox_.reset();
  }

  // Runs the job and delivers its result. A job that throws fails with the
  // exception's message. Returns whether the mailbox accepted the result.
  // Call once, or call cancel() instead.
  bool execute() { return execute(stop_); }
  // As execute(), but the job sees `stop`, such as a lane's token linked to
  // stopToken().
  bool execute(std::stop_token stop);
  // Destroys the job without running it and delivers `outcome` in its place,
  // a Stopped one by default. A closed mailbox destroys it on this thread.
  bool cancel(JobOutcome outcome = JobOutcome::stopped());
  const std::stop_token& stopToken() const { return stop_; }

private:
  uint64_t id_;
  std::unique_ptr<NativeJob> job_;
  std::shared_ptr<RunMailbox> mailbox_;
  std::stop_token stop_;
  RunnerTracker::Ticket ticket_;
};

class JobExecutor {
public:
  virtual ~JobExecutor() = default;
  // Takes the job. Never throws: a job that cannot run is cancelled.
  virtual void submit(SubmittedJob job) = 0;
  // Destroys every queued job whose run requested stop, without running or
  // delivering it, outside the executor's locks. Returns how many.
  virtual size_t discardStopped() { return 0; }
  // Destroys results a closed mailbox handed back. The default destroys them
  // on the calling thread. A pool lane hands them to its reaper, so a
  // blocking payload destructor cannot block the worker's teardown.
  virtual void dispose(std::deque<JobResult> results) { results.clear(); }
};

// Runs each job on the worker as it is submitted. Results still go through
// the mailbox, so they settle at a macrotask point in submission order.
class InlineExecutor final : public JobExecutor {
public:
  void submit(SubmittedJob job) override { job.execute(); }
};

// The worker's per-run bridge between host functions and native jobs.
class AsyncRun {
public:
  AsyncRun(js::Engine& engine, Loop& loop, std::shared_ptr<RunnerTracker> tracker, uint64_t run,
           JobExecutor& executor);
  AsyncRun(const AsyncRun&) = delete;
  AsyncRun& operator=(const AsyncRun&) = delete;
  ~AsyncRun() { teardown(); }

  // Worker. Registers a settler and hands `job` to the executor. Returns the
  // promise the job's result settles.
  js::Value submit(std::unique_ptr<NativeJob> job, Converter convert) {
    return submit(executor_, std::move(job), std::move(convert));
  }
  // As above, on `executor`, such as one of the process lanes. The executor
  // must outlive this object.
  js::Value submit(JobExecutor& executor, std::unique_ptr<NativeJob> job, Converter convert);
  // Worker. Settles the oldest waiting result. False when none waits.
  bool dispatchOne();
  bool resultsPending() const { return mailbox_->pending(); }
  // Submitted jobs whose result has not been dispatched.
  size_t inFlight() const { return settlers_.size(); }
  // Worker. Ends the run's side of its jobs, in the order of section 4.10:
  // requests stop outside every lock, closes the mailbox and hands its
  // waiting results to the run's executor for disposal, destroys the jobs
  // still queued on the executors it used, then drops the settlers. The caller then clears timers, abandons frames and releases
  // run resources. Idempotent.
  void teardown();

  uint64_t run() const { return run_; }
  const std::shared_ptr<RunMailbox>& mailbox() const { return mailbox_; }

private:
  js::Engine& engine_;
  JobExecutor& executor_;
  // Every executor submit() used, for teardown's discardStopped().
  std::vector<JobExecutor*> used_;
  std::shared_ptr<RunnerTracker> tracker_;
  uint64_t run_;
  std::stop_source stop_;
  std::shared_ptr<RunMailbox> mailbox_;
  SettlerRegistry settlers_;
  uint64_t nextId_ = 1;
};

}  // namespace gr
