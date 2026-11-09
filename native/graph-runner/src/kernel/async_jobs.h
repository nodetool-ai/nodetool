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
#include "nodetool/context_options.h"

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
    // A second ticket for the same runner and run, or an empty one when this
    // ticket is empty.
    Ticket share() const { return tracker_ ? tracker_->acquire(run_) : Ticket{}; }

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

// Thrown by a Converter to reject its promise with an AbortError instead of
// an Error, such as when the run was cancelled before the result settled.
struct JobAborted : std::runtime_error {
  using std::runtime_error::runtime_error;
};

// Turns a Value result's payload into the JavaScript value its promise
// resolves with. Runs on the worker. Throwing rejects the promise: with an
// AbortError for JobAborted, with an Error otherwise.
using Converter = std::function<js::Value(js::Engine&, JobPayload*)>;

// The worker's pending promises, indexed by job id.
class SettlerRegistry {
public:
  explicit SettlerRegistry(js::Engine& engine) : engine_(engine) {}

  // A cancellable settler is listed by cancellable().
  void add(uint64_t id, js::PromiseCapability capability, Converter convert, bool cancellable = false);
  // Settles the promise registered under result.id: Value resolves with the
  // converted payload, Error rejects with an Error, Stopped with an
  // AbortError. A result without a settler is destroyed. Returns whether a
  // promise was settled.
  bool settle(JobResult result);
  // The ids of the cancellable settlers, in submission order.
  std::vector<uint64_t> cancellable() const;
  // Drops every settler. Its promise stays pending.
  void clear();
  size_t size() const;

private:
  struct Settler {
    js::PromiseCapability capability;
    Converter convert;
    bool cancellable = false;
  };
  js::Value error(const std::string& message, const char* name);

  js::Engine& engine_;
  [[no_unique_address]] ThreadOwner owner_;
  std::unordered_map<uint64_t, Settler> settlers_;
};

// The right to deliver one submitted job's result: its id, its run's mailbox,
// its tracker ticket and its run's stop token. A job that finishes after
// NativeJob::start() returns takes it from start() and delivers later.
//
// Thread affinity: none. The object can move to and be used on any thread,
// but by one thread at a time. deliver() relies on RunMailbox's mutex.
class JobDelivery {
public:
  JobDelivery(uint64_t id, std::shared_ptr<RunMailbox> mailbox, RunnerTracker::Ticket ticket,
              std::stop_token runStop)
      : ticket_(std::move(ticket)), id_(id), mailbox_(std::move(mailbox)), runStop_(std::move(runStop)) {}
  // A moved-from delivery is empty, and destroying it does nothing.
  JobDelivery(JobDelivery&&) noexcept = default;
  JobDelivery& operator=(JobDelivery&&) = delete;
  JobDelivery(const JobDelivery&) = delete;
  JobDelivery& operator=(const JobDelivery&) = delete;
  // Destroying an undelivered delivery delivers an Error, so the job's
  // promise always settles while its run is live.
  ~JobDelivery();

  // Delivers `outcome` once, as SubmittedJob::execute() would, and empties
  // the delivery. Returns whether the mailbox accepted it. A closed mailbox
  // destroys it on the calling thread.
  bool deliver(JobOutcome outcome);
  // A second tracker ticket for the job's runner and run, for work that
  // outlives the delivered result.
  RunnerTracker::Ticket retain() const { return ticket_.share(); }
  const std::stop_token& runStop() const { return runStop_; }
  explicit operator bool() const { return mailbox_ != nullptr; }

private:
  RunnerTracker::Ticket ticket_;
  uint64_t id_;
  std::shared_ptr<RunMailbox> mailbox_;
  std::stop_token runStop_;
};

// Native work. Runs once, inline on the worker or on another thread, and
// must not touch JavaScript values, coroutine frames or the engine. A stop
// callback registered on run()'s token only sets flags or issues a
// non-blocking wake (design section 4.9), and destroying the job's inputs
// does not wait on other work. A lane (src/kernel/host_lanes.h) runs both
// on its own reaper thread, so a job that breaks this rule delays its lane
// but never the worker's teardown or a timed shutdown.
//
// Thread affinity: the executor thread that runs it, one call at a time.
class NativeJob {
public:
  virtual ~NativeJob() = default;
  virtual JobOutcome run(std::stop_token stop) = 0;
  // What SubmittedJob::execute() calls. The default returns run()'s outcome,
  // which execute() delivers after destroying the job. A job that finishes
  // later moves `delivery` out, delivers through it from any thread, and
  // returns nullopt. A job that returns nullopt without taking `delivery`
  // fails with an Error.
  virtual std::optional<JobOutcome> start(std::stop_token stop, JobDelivery& delivery) {
    (void)delivery;
    return run(std::move(stop));
  }
  // An executor refused the job, which will never run: `outcome` says why.
  // Called on the refusing thread before the job goes to disposal, so a
  // detached job, which has no mailbox, can report the refusal first. It
  // must not block. The default does nothing.
  virtual void refused(const JobOutcome& outcome) { (void)outcome; }
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
// stop token, its tracker ticket and its mailbox. A detached job, such as a
// provider endpoint call (nodetool/provider_jobs.h), has no mailbox and
// reports through its own channel: what execute() or cancel() would deliver
// is destroyed on the calling thread instead.
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
  // exception's message. Returns whether the mailbox accepted the result,
  // and true when the job took its delivery to deliver later. Call once, or
  // call cancel() instead.
  bool execute() { return execute(stop_); }
  // As execute(), but the job sees `stop`, such as a lane's token linked to
  // stopToken().
  bool execute(std::stop_token stop);
  // Destroys the job without running it and delivers `outcome` in its place,
  // a Stopped one by default. A closed mailbox destroys it on this thread.
  bool cancel(JobOutcome outcome = JobOutcome::stopped());
  // Delivers `outcome` in the job's place without destroying the job, so the
  // caller can destroy its inputs on another thread. The tracker ticket
  // stays with the job until then. Returns whether the mailbox accepted the
  // outcome. A detached job has no mailbox: NativeJob::refused() reports for
  // it, here, before its inputs go.
  bool refuse(JobOutcome outcome);
  const std::stop_token& stopToken() const { return stop_; }

private:
  uint64_t id_;
  std::unique_ptr<NativeJob> job_;
  // native-rules #1: mailbox shared with lane threads, no comment explains why unique fails
  std::shared_ptr<RunMailbox> mailbox_;
  std::stop_token stop_;
  RunnerTracker::Ticket ticket_;
};

// Requests stop on a stop source away from the caller when it can, so a stop
// callback that blocks delays the relay's thread instead of the caller
// (design section 4.9). A pool lane relays to its reaper thread.
//
// Thread affinity: thread-safe.
class StopRelay {
public:
  virtual ~StopRelay() = default;
  // Requests stop on `stop`, then releases `keep`. Without a thread to do it
  // on, both happen on the calling thread before relay() returns.
  virtual void relay(std::stop_source stop, std::shared_ptr<void> keep) = 0;
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
  // Destroys a job that will never run, such as one AsyncRun::submit refused
  // before handing it over. The default destroys it on the calling thread,
  // as an inline executor runs every job there. A pool lane hands it to the
  // process JobDisposer, so a blocking input destructor cannot block the
  // worker.
  virtual void disposeUnrun(SubmittedJob job) { (void)job; }
  // Where work this executor ran requests a later stop. The default relays
  // on the calling thread. Shared: the executor and every state that may
  // relay later hold it, and such a state can outlive the executor.
  virtual std::shared_ptr<StopRelay> stopRelay();
  // A run or registry that submits here attaches before its first job and
  // detaches when it is done. Neither throws, so a caller that records the
  // executor first never detaches an attachment that did not happen. The
  // executor must outlive every attachment: a pool lane destroyed while
  // attached aborts the process. The default does nothing.
  virtual void attach() noexcept {}
  virtual void detach() noexcept {}
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
  // `identity` names the run to host code, such as the provider job grants,
  // which read it from a context call's completion. It may be empty.
  AsyncRun(js::Engine& engine, Loop& loop, std::shared_ptr<RunnerTracker> tracker, uint64_t run,
           JobExecutor& executor, host::RunIdentity identity = {});
  AsyncRun(const AsyncRun&) = delete;
  AsyncRun& operator=(const AsyncRun&) = delete;
  // Tears down, then detaches from every executor it used.
  ~AsyncRun();

  // Worker. Registers a settler and hands `job` to the executor. Returns the
  // promise the job's result settles.
  js::Value submit(std::unique_ptr<NativeJob> job, Converter convert) {
    return submit(executor_, std::move(job), std::move(convert));
  }
  // As above, on `executor`, such as one of the process lanes. The executor
  // must outlive this object, which attaches to it on first use.
  // A cancellable job sees cancel() as a stop, and its promise rejects with
  // an AbortError from cancel(). Submitting one after cancel() throws, and
  // so does submitting after teardown(). Either way the job goes to the
  // executor's disposeUnrun() first, never destroyed on this thread by a
  // pool lane.
  js::Value submit(JobExecutor& executor, std::unique_ptr<NativeJob> job, Converter convert,
                   bool cancellable = false);
  // Worker. Settles the oldest waiting result. False when none waits.
  bool dispatchOne();
  bool resultsPending() const { return mailbox_->pending(); }
  // Submitted jobs whose result has not been dispatched.
  size_t inFlight() const { return settlers_.size(); }
  // Worker. Requests stop on every job of the run, cancellable or not,
  // outside every lock, without closing the mailbox: results still settle, a
  // job's Stopped outcome as an AbortError. teardown() starts with it. The
  // runner calls only cancel() during a cancel grace period, so a job that
  // is not cancellable, such as a provider cursor's close, still runs.
  void requestStop() {
    cancel_.request_stop();
    stop_.request_stop();
  }
  // Worker. The run's cancellation began (design section 4.6): a Stopped
  // result for every cancellable job goes into the mailbox, in submission
  // order, and those jobs are asked to stop. Each result settles at the
  // loop's completion point, one per turn like any result, as an AbortError
  // unless a result for that job was dispatched first. The result that is
  // dispatched first settles the promise, and later ones are destroyed.
  // Other jobs, such as cleanup calls, keep running until teardown.
  // Idempotent.
  void cancel();
  bool cancelled() const { return cancel_.stop_requested(); }
  // Worker. Ends the run's side of its jobs, in the order of section 4.10:
  // requests stop outside every lock, closes the mailbox and hands its
  // waiting results to the run's executor for disposal, destroys the jobs
  // still queued on the executors it used, then drops the settlers. The caller then clears timers, abandons frames and releases
  // run resources. Idempotent.
  void teardown();

  uint64_t run() const { return run_; }
  const host::RunIdentity& identity() const { return identity_; }
  const std::shared_ptr<RunMailbox>& mailbox() const { return mailbox_; }

private:
  js::Engine& engine_;
  JobExecutor& executor_;
  // Every executor submit() used, for teardown's discardStopped().
  std::vector<JobExecutor*> used_;
  std::shared_ptr<RunnerTracker> tracker_;
  uint64_t run_;
  const host::RunIdentity identity_;
  std::stop_source stop_;
  // The stop of cancellable jobs: requested by cancel() and by requestStop().
  std::stop_source cancel_;
  // native-rules #1: mailbox shared with lane threads, no comment explains why unique fails
  std::shared_ptr<RunMailbox> mailbox_;
  SettlerRegistry settlers_;
  uint64_t nextId_ = 1;
};

// Where host functions find the run they submit to. The runner binds its
// AsyncRun and the run's I/O lane for the length of a run, and the binding is
// empty otherwise, such as while the guest loads. One per engine, kept in
// the engine's host state.
//
// Thread affinity: worker only, checked in debug builds (ThreadOwner).
class RunBinding final : public js::NativePayload {
public:
  // The engine's binding, created on first use.
  static std::shared_ptr<RunBinding> of(js::Engine& engine);

  // Binds `run` and `io` until the scope ends. `run` and `io` must outlive
  // the scope. Throws when the engine already has a bound run. Worker only,
  // like the binding.
  class Scope {
  public:
    Scope(js::Engine& engine, AsyncRun& run, JobExecutor& io);
    ~Scope();
    Scope(const Scope&) = delete;
    Scope& operator=(const Scope&) = delete;

  private:
    std::shared_ptr<RunBinding> binding_;
  };

  // The bound run, or null.
  AsyncRun* run() const;
  // The bound run's I/O lane, or null.
  JobExecutor* io() const;

private:
  [[no_unique_address]] ThreadOwner owner_;
  // Non-owning. Set and cleared by Scope, which ends before either object.
  AsyncRun* run_ = nullptr;
  JobExecutor* io_ = nullptr;
};

}  // namespace gr
