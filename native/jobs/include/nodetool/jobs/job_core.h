// Native jobs and their completions (docs/plans/graph-runner-async-host.md,
// sections 4.2, 4.3 and 4.10).
//
// A host function submits a NativeJob that owns native inputs only. The job
// runs on a JobExecutor, and its JobResult reaches the run's owner through
// the run's RunMailbox. Jobs and the mailbox never hold an engine value, a
// promise or a coroutine handle, so a job can outlive its run: closing the
// mailbox ends the job's access to the run, and a result delivered after
// that is destroyed on the delivering thread. The graph runner converts
// results into JavaScript values and settles promises
// (native/graph-runner/src/kernel/async_jobs.h).
#pragma once

#include "nodetool/jobs/admission.h"
#include "nodetool/jobs/wake_target.h"

#include <chrono>
#include <condition_variable>
#include <cstddef>
#include <cstdint>
#include <deque>
#include <map>
#include <memory>
#include <mutex>
#include <optional>
#include <stdexcept>
#include <stop_token>
#include <string>
#include <utility>

namespace nodetool::jobs {

// A job's native result. Never holds a JavaScript value.
//
// Thread affinity: one thread at a time. It moves with its result from the
// job's thread to the thread that converts or disposes of it, which
// destroys it.
struct JobPayload {
  virtual ~JobPayload() = default;
};

// Counts the jobs of one runner that are not disposed yet, across all of
// its runs. Jobs share it, so it outlives the runner object.
//
// Thread affinity: thread-safe. `mutex_` guards the counts, and `released_`
// signals each release to waitIdle().
class RunnerTracker : public std::enable_shared_from_this<RunnerTracker> {
public:
  // Held by a job from submission until its result is destroyed.
  //
  // Thread affinity: one thread at a time. It moves with its job, and
  // releasing it takes the tracker's mutex.
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
//
// Thread affinity: one thread at a time. Made on the job's thread and moved
// into its result.
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

// Thread affinity: one thread at a time. Built on the delivering thread and
// handed to the worker through the mailbox, under the mailbox mutex.
struct JobResult {
  // Declared first so it is released last, after the payload is destroyed.
  RunnerTracker::Ticket ticket;
  // The job's admission charge (design section 4.7). Released after the
  // payload, when the result is disposed or the worker converted it.
  Reservation reservation;
  uint64_t id = 0;
  JobOutcome outcome;
};

// The results of one run's jobs on their way to the worker, the thread that
// owns the run and its wake target.
//
// Ownership: shared by the run and by every job it submitted that is not
// destroyed yet, each through a SubmittedJob or a JobDelivery. Unique
// ownership is impossible because neither side outlives the other: a run can
// end while a lane still runs or delivers one of its jobs, and a job can
// finish long before its run. Closing the mailbox ends the jobs' access to the
// run, and the last holder, on whichever thread drops it, destroys it.
//
// Thread affinity: thread-safe where marked, otherwise worker only.
// `mutex_` guards `wake_` and `results_`.
class RunMailbox {
public:
  // `wake` must stay alive until close() returns.
  explicit RunMailbox(WakeTarget& wake) : wake_(&wake) {}
  RunMailbox(const RunMailbox&) = delete;
  RunMailbox& operator=(const RunMailbox&) = delete;

  // Thread-safe. While the mailbox is open, appends `result` and wakes the
  // target while still holding the mailbox mutex, so close() cannot take the
  // target away meanwhile. Lock order: the mailbox mutex, then the target's
  // own mutex (WakeTarget). Once closed, destroys `result` on the calling
  // thread after unlocking. Returns whether the result was accepted.
  bool deliver(JobResult result);
  // Thread-safe. Wakes the target while the mailbox is open, under the
  // mailbox mutex as deliver() does. A run's admission waiter calls it when
  // capacity was released, after the ledger mutex was unlocked.
  void wake();
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
  // Non-owning. Null once closed.
  WakeTarget* wake_;
  std::deque<JobResult> results_;
};

// Thrown by a Converter to reject its promise with an AbortError instead of
// an Error, such as when the run was cancelled before the result settled.
//
// Thread affinity: none. An exception value, owned by the code that catches it.
struct JobAborted : std::runtime_error {
  using std::runtime_error::runtime_error;
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
              std::stop_token runStop, Reservation reservation = {})
      : ticket_(std::move(ticket)), reservation_(std::move(reservation)), id_(id), mailbox_(std::move(mailbox)),
        runStop_(std::move(runStop)) {}
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
  // A second reference to the job's admission charge, for work that may
  // still use memory after its result was delivered, such as an embedder
  // that keeps a context call's completion. The charge goes when both the
  // result and this reference are gone.
  Reservation retainReservation() const { return reservation_.share(); }
  const std::stop_token& runStop() const { return runStop_; }
  explicit operator bool() const { return mailbox_ != nullptr; }

private:
  RunnerTracker::Ticket ticket_;
  Reservation reservation_;
  uint64_t id_;
  // Shared: see RunMailbox. The delivery may outlive both its job and its run.
  std::shared_ptr<RunMailbox> mailbox_;
  std::stop_token runStop_;
};

// Native work. Runs once, inline on the worker or on another thread, and
// must not touch JavaScript values, coroutine frames or the engine. A stop
// callback registered on run()'s token only sets flags or issues a
// non-blocking wake (design section 4.9), and destroying the job's inputs
// does not wait on other work. A graph runner lane
// (native/graph-runner/src/kernel/host_lanes.h) runs both on its own reaper
// thread, so a job that breaks this rule delays its lane but never the
// worker's teardown or a timed shutdown.
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
  // What the job needs from the admission ledger (design section 4.7),
  // computed from the inputs it owns, with checked arithmetic. Called on the
  // worker at submission and again when a deferred start is admitted, never
  // after start(). Throws AdmissionError when the size overflows. The
  // default needs nothing but the operation slot.
  virtual JobCost cost() const { return {}; }
};

template <class F>
std::unique_ptr<NativeJob> makeJob(F work) {
  // Thread affinity: as NativeJob.
  struct Job final : NativeJob {
    explicit Job(F f) : work(std::move(f)) {}
    JobOutcome run(std::stop_token stop) override { return work(std::move(stop)); }
    F work;
  };
  return std::make_unique<Job>(std::move(work));
}

// A job with everything it owns on its way through an executor: the run's
// stop token, its tracker ticket and its mailbox. A detached job, such as a
// provider endpoint call
// (native/graph-runner/include/nodetool/provider_jobs.h), has no mailbox and
// reports through its own channel: what execute() or cancel() would deliver
// is destroyed on the calling thread instead.
//
// Thread affinity: one thread at a time. It moves from the submitting
// thread through an executor's queue to the thread that executes, cancels
// or disposes of it.
class SubmittedJob {
public:
  SubmittedJob(uint64_t id, std::unique_ptr<NativeJob> job, std::shared_ptr<RunMailbox> mailbox,
               std::stop_token stop, RunnerTracker::Ticket ticket, Reservation reservation = {})
      : id_(id), job_(std::move(job)), mailbox_(std::move(mailbox)), stop_(std::move(stop)),
        ticket_(std::move(ticket)), reservation_(std::move(reservation)) {}
  SubmittedJob(SubmittedJob&&) noexcept = default;
  SubmittedJob& operator=(SubmittedJob&&) noexcept = default;
  // The job's inputs and mailbox go first, then the reservation, so the
  // ticket counts the job until nothing of it is left.
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
  // No mailbox: the job reports a refusal through NativeJob::refused().
  bool detached() const { return !mailbox_; }
  // The job's admission charge. It travels into the result.
  Reservation& reservation() { return reservation_; }
  // NativeJob::cost() of the job. Before execute() or cancel() only.
  JobCost cost() const { return job_->cost(); }

private:
  uint64_t id_;
  std::unique_ptr<NativeJob> job_;
  // Shared: see RunMailbox. The job may run on a lane after its run ended.
  std::shared_ptr<RunMailbox> mailbox_;
  std::stop_token stop_;
  RunnerTracker::Ticket ticket_;
  // Declared after the ticket, so it is released before it.
  Reservation reservation_;
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

// Executes submitted jobs.
//
// Thread affinity: thread-safe. Every member may be called from any thread.
// Each implementation names the synchronization it uses.
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
//
// Thread affinity: thread-safe and stateless. Each job runs on the thread
// that submits it.
class InlineExecutor final : public JobExecutor {
public:
  void submit(SubmittedJob job) override { job.execute(); }
};

}  // namespace nodetool::jobs
