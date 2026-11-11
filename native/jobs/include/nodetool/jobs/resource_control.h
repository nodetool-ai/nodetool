// Resource control blocks (docs/plans/graph-runner-async-host.md, sections
// 4.4, 4.8 and 4.9).
//
// A host resource that outlives one call, such as a media input, an encoder,
// a file handle or a track staging directory, is wrapped in a ResourceBody
// and handed to a ResourceControl. The control block is the resource's
// serial queue: host functions submit operations on the worker through
// AsyncRun::submit(control->operations(), ...), the control keeps them in a
// FIFO, and it hands at most one at a time to its lane. Only the active
// operation touches the body.
//
// Retirement replaces the host's immediate erase on close, finish, abort
// and run cleanup:
//
//   Open --close()/terminal()--> Retiring (accepted operations run in order,
//                                 the terminal operation last)
//   Open or Retiring --abort()-> Retiring (queued operations are rejected,
//                                 the active one is asked to stop)
//   Retiring ------------------> Retired once no operation is queued or
//                                 active and every lease is released
//
// No operation and no lease enters after Open. Reaching Retired hands the
// body and the control's dependency leases to the reaper thread of the
// control's destruction lane (its own lane unless Options::destroyOn names
// another), which destroys the body and then releases the leases. Library
// cleanup and staging directory removal therefore never run on the thread
// that finished the last operation, dropped the last lease or aborted,
// which may be the worker. The reaper is part of its lane's timed shutdown
// (native/graph-runner/src/kernel/host_lanes.h). A lane whose reaper never started or already
// left hands the work to the process JobDisposer instead. In inline mode
// the lane is the worker's InlineExecutor, which destroys on the calling
// thread: the documented inline exception.
//
// Lock rules: one mutex per control. Operations are submitted to the lane,
// jobs are refused and destroyed, stop is requested, stop bridges are
// retired and bodies are handed over only after it is released.
//
// Stop: abort() never runs an operation's stop callbacks on its own thread.
// A running operation's stop goes through the lane's stop relay, which
// requests it on the lane's reaper. An operation that has not entered its
// function yet is marked under the mutex, and it requests its own stop on
// its lane thread when it starts, before it can register a callback. After
// the lane shut down, its relay requests stop on the calling thread, as it
// does for every lane job. No control
// takes another control's mutex while holding its own: dependency leases
// are released after unlocking.
#pragma once

#include "nodetool/jobs/job_core.h"
#include "nodetool/jobs/session_stop.h"

#include <cstddef>
#include <cstdint>
#include <deque>
#include <functional>
#include <memory>
#include <mutex>
#include <optional>
#include <stop_token>
#include <string>
#include <vector>

namespace nodetool::jobs {

class ResourceControl;

// The native object a control wraps. Hosts derive from it.
//
// Thread affinity: only the control's active operation touches it, one
// thread at a time, each handoff ordered by the control's mutex. It is
// destroyed once, after its last operation, on the thread named in
// ResourceControl's header comment.
//
// Ownership: uniquely owned by its ResourceControl.
class ResourceBody {
public:
  virtual ~ResourceBody() = default;
  // The session's stop bridge, when the body wraps a library session that
  // keeps an interrupt callback. Each operation binds its stop token to it,
  // and retirement retires it. Must return the same object for the body's
  // life, and the body must own it.
  virtual SessionStopBridge* stopBridge() { return nullptr; }
};

// Keeps a control's body from being destroyed: a dependent's hold on a
// resource it reads, such as a media input's hold on its staging directory.
// A lease grants no access to the body.
//
// Thread affinity: none. It can move to and be destroyed on any thread, by
// one thread at a time. The destroying thread may destroy the body.
//
// Ownership: holds a shared reference to its control. A moved-from lease is
// empty and its destructor does nothing.
class ResourceLease {
public:
  ResourceLease() = default;
  ResourceLease(ResourceLease&&) noexcept = default;
  ResourceLease& operator=(ResourceLease&& other) noexcept;
  ResourceLease(const ResourceLease&) = delete;
  ResourceLease& operator=(const ResourceLease&) = delete;
  ~ResourceLease() { release(); }

  // Releases now. The lease is empty afterwards.
  void release();
  explicit operator bool() const { return control_ != nullptr; }

private:
  friend class ResourceControl;
  explicit ResourceLease(std::shared_ptr<ResourceControl> control) : control_(std::move(control)) {}

  // Shared: a lease is one of several owners of the control block (the
  // host's handle table, queued operations, other leases), none of which can
  // own it alone.
  std::shared_ptr<ResourceControl> control_;
};

// What an operation sees while it is its control's active operation.
//
// Thread affinity: the thread running the operation, for the length of
// apply(). Not copyable.
class ResourceOperationContext {
public:
  ResourceOperationContext(const ResourceOperationContext&) = delete;
  ResourceOperationContext& operator=(const ResourceOperationContext&) = delete;

  // The operation's stop: its run's stop, its lane's stop and abort().
  const std::stop_token& stop() const { return stop_; }
  // The operation's id within its control, starting at 1. A stop bridge
  // sees it as the active operation.
  uint64_t id() const { return id_; }
  // Whether an operation accepted before this one returned an Error. A
  // terminal operation such as finish checks it before it publishes.
  bool precedingFailed() const { return precedingFailed_; }
  // The operation left the session unusable, such as a cancelled codec
  // call: once this operation returns, the stop bridge is retired, and once
  // its result is delivered, the control retires and rejects every queued
  // operation with an Error naming `reason`.
  void retireSession(std::string reason) { retire_ = std::move(reason); }

private:
  friend class ResourceOperation;
  ResourceOperationContext(std::stop_token stop, uint64_t id, bool precedingFailed)
      : stop_(std::move(stop)), id_(id), precedingFailed_(precedingFailed) {}

  std::stop_token stop_;
  uint64_t id_;
  bool precedingFailed_;
  std::optional<std::string> retire_;
};

// An operation on one control's body. Create it with
// ResourceControl::operation(). It runs only as its control's active
// operation: run anywhere else, it fails without touching the body. It must
// finish in apply(): the control starts the next operation after this
// one's result was delivered.
//
// Thread affinity: the lane thread that runs it.
class ResourceOperation : public NativeJob {
public:
  explicit ResourceOperation(std::shared_ptr<ResourceControl> control) : control_(std::move(control)) {}
  JobOutcome run(std::stop_token stop) final;

protected:
  // Runs with exclusive access to `body`. Throwing fails the operation.
  virtual JobOutcome apply(ResourceBody& body, ResourceOperationContext& context) = 0;

private:
  // Shared: the operation keeps its control alive while it is queued
  // anywhere, as do the host's table and the control's other operations.
  std::shared_ptr<ResourceControl> control_;
};

// Test seams of a ResourceControl. Production leaves them empty. Plain
// data, moved into the control by create().
//
// Thread affinity: one thread at a time until create(), then immutable.
// abort() calls abortUnlocked on the aborting thread, outside the mutex.
struct ResourceTestHooks {
  // Called by abort() after it released the mutex and before it requests
  // the active operation's stop.
  std::function<void()> abortUnlocked;
};

// How a ResourceControl destroys its body. Plain data, moved into the
// control by create().
//
// Thread affinity: one thread at a time until create(), then owned by the
// control under its mutex.
struct ResourceOptions {
  // The lane whose reaper destroys the body: an owner lane for a resource
  // that must not be destroyed on an arbitrary thread. Null means the
  // control's own lane. It must outlive the control.
  JobExecutor* destroyOn = nullptr;
  // Leases on the resources this one depends on. They are released after
  // the body is destroyed, so a staging directory outlives its readers.
  std::vector<ResourceLease> dependencies;
  ResourceTestHooks hooks;
};

// One resource's control block.
//
// Thread affinity: thread-safe. `mutex_` guards every field below it.
//
// Ownership: shared, through std::shared_ptr from create(). The host's
// handle table, every queued and active operation, every lease and every
// run attached to its ports hold it, and none of them can own it alone. The
// control owns its body until Retired, and its dependency leases until the
// body is handed to its destruction lane. A control destroyed before it
// retired hands its body over the same way.
//
// The lane and the destruction lane must outlive the control: the control
// attaches to both on creation and detaches when destroyed, so a pool lane
// destroyed first aborts the process.
class ResourceControl final : public std::enable_shared_from_this<ResourceControl> {
  // Restricts construction to create(), which std::make_shared needs to
  // reach a public constructor.
  //
  // Thread affinity: none. An empty tag.
  struct Key {
    explicit Key() = default;
  };

public:
  enum class State { Open, Retiring, Retired };

  using TestHooks = ResourceTestHooks;
  using Options = ResourceOptions;

  // `name` appears in refusal messages, such as "native media reader 3 is
  // closed". `lane` runs the operations.
  static std::shared_ptr<ResourceControl> create(std::string name, std::unique_ptr<ResourceBody> body,
                                                 JobExecutor& lane, Options options = {});
  ResourceControl(Key, std::string name, std::unique_ptr<ResourceBody> body, JobExecutor& lane, Options options);
  ~ResourceControl();
  ResourceControl(const ResourceControl&) = delete;
  ResourceControl& operator=(const ResourceControl&) = delete;

  // The executor ordinary operations go to, through AsyncRun::submit. An
  // operation submitted after the control left Open is refused with an
  // Error, its inputs destroyed off the worker by the lane's disposeUnrun().
  JobExecutor& operations() { return operations_; }
  // The executor a terminal operation, such as an encoder's finish, goes
  // to. Accepting it moves Open to Retiring: it runs after every operation
  // accepted before it, and nothing is accepted after it. Refused like an
  // ordinary operation when the control is not Open.
  JobExecutor& terminal() { return terminal_; }

  // An operation running `fn(Body&, ResourceOperationContext&) ->
  // JobOutcome` on this control's body. `Body` is the ResourceBody subclass
  // given to create(). `fn` runs on the lane and is destroyed with the job.
  template <class Body, class F>
  std::unique_ptr<NativeJob> operation(F fn) {
    // Thread affinity: as ResourceOperation.
    struct Op final : ResourceOperation {
      Op(std::shared_ptr<ResourceControl> c, F f) : ResourceOperation(std::move(c)), fn(std::move(f)) {}
      JobOutcome apply(ResourceBody& body, ResourceOperationContext& context) override {
        return fn(static_cast<Body&>(body), context);
      }
      F fn;
    };
    return std::make_unique<Op>(shared_from_this(), std::move(fn));
  }

  // A lease while the control is Open, otherwise nothing.
  std::optional<ResourceLease> lease();
  // Explicit close: Open moves to Retiring, and the operations already
  // accepted run in order before the body is destroyed. Does nothing unless
  // Open.
  void close();
  // Abort or run cleanup: moves to Retiring from Open or Retiring, retires
  // the body's stop bridge, rejects every queued operation (a queued
  // terminal operation included) with an AbortError naming `reason`, and
  // asks the active operation to stop through the lane's stop relay. The
  // body is destroyed once the active operation returned and the last
  // lease is gone. An executing terminal operation may already have
  // committed its persistent effect, which abort cannot undo. Idempotent.
  void abort(std::string reason = "The resource was aborted");

  // Retired is set under the mutex when the body is handed to its
  // destruction lane, which destroys it later on its reaper.
  State state() const;
  // Operations accepted and not started yet.
  size_t queued() const;
  bool active() const;
  size_t leases() const;
  const std::string& name() const { return name_; }

private:
  friend class ResourceOperation;
  friend class ResourceLease;

  // One of the two executors a run submits to. Forwards to its control.
  //
  // Thread affinity: thread-safe, like its control. Non-owning: a member of
  // the control it references.
  class Port final : public JobExecutor {
  public:
    Port(ResourceControl& control, bool terminal) : control_(control), terminal_(terminal) {}
    void submit(SubmittedJob job) override { control_.accept(std::move(job), terminal_); }
    size_t discardStopped() override { return control_.discardStopped(); }
    void dispose(std::deque<JobResult> results) override { control_.lane_.dispose(std::move(results)); }
    void disposeUnrun(SubmittedJob job) override { control_.lane_.disposeUnrun(std::move(job)); }
    std::shared_ptr<StopRelay> stopRelay() override { return control_.lane_.stopRelay(); }
    // A run that attached keeps the control alive until it detaches, since
    // AsyncRun keeps the port's address until its destructor.
    void attach() noexcept override { control_.attachRun(); }
    void detach() noexcept override { control_.detachRun(); }

  private:
    ResourceControl& control_;
    const bool terminal_;
  };

  class Dispatched;
  // The structs below are plain data. Entry lives in `queue_` under
  // `mutex_`. Dispatch, Remains and After move out from under the mutex to
  // the thread that does the work after unlocking, and are owned by value.
  //
  // Thread affinity: guarded by `mutex_` while in `queue_`.
  struct Entry {
    SubmittedJob job;
    bool terminal = false;
  };
  // An operation leaving the queue for the lane.
  //
  // Thread affinity: one thread at a time, moved out from under `mutex_`.
  struct Dispatch {
    SubmittedJob job;
    std::stop_source stop;
  };
  // What retirement destroys outside the mutex.
  //
  // Thread affinity: one thread at a time, moved out from under `mutex_`.
  struct Remains {
    std::unique_ptr<ResourceBody> body;
    std::vector<ResourceLease> dependencies;
  };
  // Work the caller does after unlocking, in this order.
  //
  // Thread affinity: one thread at a time, moved out from under `mutex_`.
  struct After {
    std::vector<SubmittedJob> rejected;  // refused with `outcome`, then disposed
    JobOutcome outcome;
    std::vector<SubmittedJob> dropped;   // stopped before they started: disposed, no result
    std::optional<Dispatch> next;
    std::optional<Remains> remains;
  };

  void accept(SubmittedJob job, bool terminal);
  size_t discardStopped();
  void attachRun() noexcept;
  void detachRun() noexcept;
  void releaseLease();
  // From the active operation, on its lane thread. Requests the
  // operation's stop there, before it returns, when abort() came first.
  bool beginOperation(ResourceBody*& body, uint64_t& id, bool& precedingFailed);
  void endOperation(bool failed, std::optional<std::string> retire);
  // From the dispatched job's destructor, after the result was delivered
  // or the job was refused or dropped.
  void completed();

  // Locked. Starts the next queued operation when none is active.
  void dispatchLocked(After& after);
  // Locked. Moves Retiring to Retired when nothing holds the body.
  void finalizeLocked(After& after);
  // Locked. The abort transition: moves to Retiring and rejects the queue
  // with `outcome`.
  void abortLocked(After& after, JobOutcome outcome);
  // Unlocked. Does `after`.
  void perform(After after);
  void forward(Dispatch next);
  void destroy(Remains remains);

  const std::string name_;
  JobExecutor& lane_;
  // Where the body is destroyed: `lane_` or Options::destroyOn.
  JobExecutor& destroyOn_;
  const TestHooks hooks_;
  Port operations_;
  Port terminal_;

  mutable std::mutex mutex_;
  State state_ = State::Open;
  std::deque<Entry> queue_;
  bool active_ = false;
  // The active operation entered apply() and has not returned.
  bool running_ = false;
  uint64_t activeId_ = 0;
  // Abort's target: the active operation's stop.
  std::optional<std::stop_source> activeStop_;
  // abort() came before the active operation entered its function, which
  // then requests its own stop when it starts.
  bool stopBeforeStart_ = false;
  // An accepted operation returned an Error.
  bool failed_ = false;
  // Set by an operation that retired its session, acted on at completion.
  std::optional<std::string> retireReason_;
  size_t leases_ = 0;
  // Short holds that keep the body alive while abort() works unlocked.
  size_t holds_ = 0;
  size_t attachedRuns_ = 0;
  // Keeps this control alive while a run is attached to a port, since the
  // run holds the port's address and no owner of the control can promise to
  // outlive the run. Shared, as a reference to itself: the last detach
  // clears it, which may destroy the control.
  std::shared_ptr<ResourceControl> selfWhileAttached_;
  std::unique_ptr<ResourceBody> body_;
  std::vector<ResourceLease> dependencies_;
};

}  // namespace nodetool::jobs
