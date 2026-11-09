#pragma once
#include "nodetool/context_options.h"
#include <concepts>
#include <cstddef>
#include <cstdint>
#include <functional>
#include <memory>
#include <stop_token>
#include <string>
#include <type_traits>
#include <utility>
#include <vector>
namespace nodetool::jobs {
// The executor interface of the host lanes
// (native/jobs/include/nodetool/jobs/job_core.h). Only the lane constructor
// below names it.
class JobExecutor;
} // namespace nodetool::jobs
namespace gr::host {
// Provider endpoint calls (callEndpoint, uploadMedia, downloadMedia) can run
// for minutes. ProviderJobs runs each call as a job on the network lane
// (src/kernel/host_lanes.h) and grants the guest four context operations per
// provider, so the runner thread never waits on a vendor:
//
//   provider:<id>:jobs:put    {upload?, data}          -> {upload}
//   provider:<id>:jobs:start  {method, args | upload}  -> {job}
//   provider:<id>:jobs:next   {job}                    -> {state, ...}
//   provider:<id>:jobs:close  {job}                    -> null
//
// put, start and close are synchronous grants. next is an asynchronous grant
// (ContextOptions::asyncOperations) whose promise settles with the job's next
// item: "progress" with `event`, "part" with `data`, "done" with `value`
// (absent after parts), or "stopped" with `message` once the job was stopped
// or closed. A worker error rejects it with the worker's message. A request
// or result larger than one part travels as consecutive parts of its JSON
// text: `put` appends request parts under an upload id that `start` names,
// and `next` returns result parts before "done". `close` requests stop for a
// running call and returns without waiting for it. Its name ends in ":close",
// so the context lets it through after the run is cancelled. next is
// cancellable: when the run's cancellation begins, a waiting next rejects
// with an AbortError at the loop's next completion turn, and the guest then
// closes the job.
//
// Each job keeps a state that every later call observes:
//
//   Running   the worker has not returned.
//   Finished  the worker returned a result.
//   Failed    the worker threw. The message is the terminal result.
//   Stopped   stop() or the destructor cancelled the job before its terminal
//             result was taken. Queued progress and result parts are dropped.
//   Closed    close() released the job. Its data is dropped.
//
// A reader takes queued progress first, then result parts, then the terminal
// result. Stopped and Closed take precedence over everything queued. Once the
// terminal result has been taken it stays the answer to every later read, and
// stop() no longer changes it. Only close() does.
//
// Every job and upload belongs to a run, which the host names with a
// RunIdentity (nodetool/context_options.h): put, start and close ask their
// RunSource on the runner thread, and next uses the identity its context
// call carried from submission, so a next still running after its run ended
// cannot reach a later run's job. Runs are told apart by identity, not by
// their public job id, so two runs with the same job id, in one runner or in
// two sharing this object, reach and retire only their own jobs. A request
// whose `run` field differs from its run's public job id is refused. A
// stopped or closed job keeps its id until retireRun() releases its run or
// this object is destroyed. GraphRunner does both for the ProviderJobs in
// HostOptions::providerJobs: it creates an identity for each run and retires
// the run after its terminal job_update. The grants hold no reference to the
// jobs, so they keep nothing alive once either has happened.
//
// Workers run on lane threads, never on a thread of their own, and nothing
// joins them: the destructor stops every job and returns. It never destroys
// the lane either, since the lane is not this object's to own. A worker that
// ignores the stop keeps its lane thread, and its job keeps a maxJobs slot,
// until it returns. shutdownHostLanes() (nodetool/host_lanes.h) bounds the
// wait for such a worker with a deadline.
//
// Thread affinity: thread-safe. A registry mutex guards the job and upload
// tables, and each job has its own mutex. Registry lookups release the
// registry mutex before taking a job mutex, and no completion, stop request
// or lane submission happens under either.
class ProviderJobs {
public:
  struct Call {
    std::string provider;
    // The public job id of the run the job belongs to.
    std::string run;
    // callEndpoint, uploadMedia or downloadMedia.
    std::string method;
    // The guest's arguments as JSON text. Bytes are {"__bytes__": base64}.
    std::string argsJson;
    // Reports a progress event, given as JSON text. Safe from any thread.
    std::function<void(const std::string &eventJson)> progress;
    // True once the job was stopped or closed, this object is shutting down,
    // or the lane is shutting down.
    std::function<bool()> cancelled;
    // Requested shortly after cancelled() turns true. A worker may register
    // a std::stop_callback on it to interrupt blocking work. On a lane with
    // threads the request runs such callbacks on the lane's reaper thread,
    // never on the thread that stops or closes the job, so a callback that
    // blocks delays only the lane's later stop requests. After the lane shut
    // down, or on an inline executor, they run on the stopping thread. A
    // callback should still only set flags or issue a non-blocking wake, such
    // as notifying a condition variable or cancelling a socket read.
    std::stop_token stop;
  };
  // Runs on a lane thread. Returns the result as JSON text or throws. It and
  // everything it captures stay alive while any of its calls runs, which can
  // be after this object is destroyed, so its captures must own what they
  // use.
  using Worker = std::function<std::string(const Call &)>;
  // The run the calling guest belongs to: in a GraphRunner, the identity of
  // the run in progress. Empty while no run is in progress, which refuses
  // put and start. Called on the runner thread for put, start and close.
  // next does not call it: it uses the identity of its context call.
  using RunSource = std::function<RunIdentity()>;
  struct Limits {
    // Largest JSON text a single put or next answer carries.
    size_t partBytes = 256 * 1024;
    // Calls whose worker has not returned: queued on the lane, running, or
    // closed while running.
    size_t maxJobs = 8;
    // Largest request a sequence of puts may assemble.
    size_t maxRequestBytes = 256 * 1024 * 1024;
    // Most bytes a job keeps of its result and queued progress events. A
    // start reserves this much in the host admission ledger, with its
    // request bytes and one operation slot, and fails when the ledger cannot
    // admit it. A result larger than this fails the job, and progress events
    // that would exceed it drop the oldest ones first.
    size_t maxResultBytes = 64 * 1024 * 1024;
    // Progress events kept per job before the oldest are dropped.
    size_t maxQueuedEvents = 64;
  };

  // What next() delivers.
  struct Outcome {
    enum class Kind {
      // `text` is the answer as JSON text: "progress", "part" or "done".
      Value,
      // `text` is the message: the worker's error or a misuse of next().
      Error,
      // The job was stopped or closed. `text` says which.
      Stopped
    };
    Kind kind = Kind::Error;
    std::string text;
  };

  // A move-only callback that receives one Outcome. Calling it empties it,
  // so it runs at most once. Destroying or overwriting a completion that was
  // never called delivers an Error instead, so it runs exactly once. It
  // never runs under a ProviderJobs lock, so it may call back into
  // ProviderJobs, but it must not destroy the ProviderJobs object.
  //
  // The callback is invoked from a noexcept context: a throw terminates the
  // process. It runs on whichever thread produces the item or stops the job:
  // a worker, a thread calling progress, the caller of next(), stop(),
  // close() or retireRun(), the destructor, or the lane thread that destroys
  // a job that never ran. An adapter that forwards outcomes to a run mailbox
  // must therefore be noexcept, safe to call from any of those threads, and
  // safe after the mailbox has closed, where it disposes the outcome instead
  // of delivering it. The granted next operation uses such an adapter over
  // its ContextCompletion.
  class Completion {
  public:
    Completion() = default;
    template <typename F>
      requires(!std::same_as<std::remove_cvref_t<F>, Completion> &&
               std::invocable<std::remove_cvref_t<F> &, Outcome>)
    Completion(F &&callback)
        : impl_(std::make_unique<Model<std::remove_cvref_t<F>>>(
              std::forward<F>(callback))) {}
    Completion(Completion &&) noexcept = default;
    Completion &operator=(Completion &&other) noexcept {
      if (this != &other) {
        drop();
        impl_ = std::move(other.impl_);
      }
      return *this;
    }
    ~Completion() { drop(); }

    explicit operator bool() const noexcept { return impl_ != nullptr; }
    // Delivers `outcome` and empties this completion. Does nothing when empty.
    void operator()(Outcome outcome) && noexcept {
      if (auto impl = std::move(impl_))
        impl->call(std::move(outcome));
    }

  private:
    struct Base {
      virtual ~Base() = default;
      virtual void call(Outcome outcome) = 0;
    };
    template <typename F> struct Model final : Base {
      template <typename G> explicit Model(G &&callback) : callback(std::forward<G>(callback)) {}
      void call(Outcome outcome) override { callback(std::move(outcome)); }
      F callback;
    };
    void drop() noexcept {
      if (auto impl = std::move(impl_))
        impl->call({Outcome::Kind::Error, "Provider job completion was dropped"});
    }
    std::unique_ptr<Base> impl_;
  };

  // Workers run on the process network lane (HostOptions::networkThreads),
  // looked up on the first start(), so a GraphRunner created before then
  // sets its size.
  explicit ProviderJobs(Worker worker);
  ProviderJobs(Worker worker, Limits limits);
  // Workers run on `lane`, which this object borrows: the caller owns it and
  // keeps it alive until this object and every context its grants went into
  // are gone. This object attaches to it, which a pool lane checks in debug
  // builds when it is destroyed. For tests and hosts that own a lane.
  ProviderJobs(Worker worker, Limits limits, nodetool::jobs::JobExecutor &lane);
  // Stops every job and completes pending next() calls with Stopped, then
  // returns without waiting for workers. A worker still running keeps its
  // job, its maxJobs slot and the Worker function alive until it returns.
  ~ProviderJobs();
  ProviderJobs(const ProviderJobs &) = delete;
  ProviderJobs &operator=(const ProviderJobs &) = delete;

  // Adds the four operations for each provider id to `options`: put, start
  // and close to `operations`, next to `asyncOperations`, removing the same
  // names from the other map. Each operation stamps or checks its run: put
  // and start file the upload or job under what `run` answers and refuse a
  // request that names another run, close treats a job of another run as
  // unknown, and so does next, by the run its context call was submitted
  // in. The operations hold a weak reference: once this object is
  // destroyed, put and start throw, next fails and close answers null.
  void grant(ContextOptions &options, const std::vector<std::string> &providers, RunSource run);

  // Waits for the next item of job `{job}` without blocking the caller.
  // When an item is ready, or the job is stopped or closed, `done` runs
  // before next returns. Otherwise `done` becomes the job's single waiter and
  // runs on the thread that produces the item or stops the job. A second
  // next() while one is waiting completes with Error "Provider job already
  // has a pending next()". An unknown job or malformed payload completes with
  // Error. This and stop() serve the host, so they reach a job of any run.
  void next(const std::string &provider, const std::string &payload, Completion done);

  // Requests stop for job `{job}` and completes its waiter with Stopped. A
  // job whose terminal result was already taken keeps it. Unknown jobs are
  // ignored. Returns without waiting for the worker.
  void stop(const std::string &provider, const std::string &payload);

  // Ends run `run`: closes its jobs, which stops those still running and
  // completes their waiters with Stopped, then releases their ids and its
  // pending uploads. A worker still executing keeps its own job alive until
  // it returns. Later calls with a released id fail as unknown. Jobs of
  // other runs, the same public job id included, are untouched.
  void retireRun(const RunIdentity &run);

  struct Stats {
    // Job ids the registry still answers for, tombstones included.
    size_t registered = 0;
    // Workers that have not returned, queued ones included.
    size_t executing = 0;
    // Job objects in memory: registered ones and retired ones a queued or
    // running worker still holds.
    size_t alive = 0;
    // Bytes charged to the private admission ledger that holds the jobs and
    // uploads of runs whose RunIdentity carries no account.
    uint64_t fallbackBytes = 0;
  };
  Stats stats();

private:
  struct State;
  std::shared_ptr<State> state_;
};
} // namespace gr::host
