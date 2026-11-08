#pragma once
#include "nodetool/context_options.h"
#include <concepts>
#include <cstddef>
#include <functional>
#include <memory>
#include <stop_token>
#include <string>
#include <type_traits>
#include <utility>
#include <vector>
namespace gr::host {
// Provider endpoint calls (callEndpoint, uploadMedia, downloadMedia) can run
// for minutes. ProviderJobs runs each call on its own thread and grants the
// guest four short context operations per provider, so the runner thread never
// waits on a vendor:
//
//   provider:<id>:jobs:put    {run?, upload?, data}          -> {upload}
//   provider:<id>:jobs:start  {run?, method, args | upload}  -> {job}
//   provider:<id>:jobs:poll   {job}                    -> {state, ...}
//   provider:<id>:jobs:close  {job}                    -> null
//
// Poll answers one state at a time: "pending", "progress" with `event`,
// "part" with `data`, "done" with `value` (absent after parts), or "error"
// with `message`. A request or result larger than one part travels as
// consecutive parts of its JSON text: `put` appends request parts under an
// upload id that `start` names, and `poll` returns result parts before "done".
// `close` requests stop for a running call and returns without waiting for it.
// Its name ends in ":close", so the context lets it through after the run is
// cancelled.
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
// Every job and upload belongs to a run: the `run` string of put and start,
// which the guest sets to the workflow run's job id (empty when absent). A
// stopped or closed job keeps its id until retireRun() releases its run or
// this object is destroyed. The grants hold no reference to the jobs, so
// they keep nothing alive once either has happened.
//
// Known gap: the destructor joins every worker thread without a deadline,
// so a worker that ignores cancellation blocks it. The async host design
// (docs/plans/graph-runner-async-host.md, section 4.10) moves these jobs
// onto the network lane with a timed shutdown.
class ProviderJobs {
public:
  struct Call {
    std::string provider;
    // The run the job belongs to, as given to start.
    std::string run;
    // callEndpoint, uploadMedia or downloadMedia.
    std::string method;
    // The guest's arguments as JSON text. Bytes are {"__bytes__": base64}.
    std::string argsJson;
    // Reports a progress event, given as JSON text. Safe from any thread.
    std::function<void(const std::string &eventJson)> progress;
    // True once the job was stopped or closed, or this object is shutting
    // down. Same as stop.stop_requested().
    std::function<bool()> cancelled;
    // Requested together with cancelled(). A worker may register a
    // std::stop_callback on it to interrupt blocking work. request_stop runs
    // such callbacks synchronously on the thread that stops or closes the
    // job, which may be the runner thread or the destructor. A callback must
    // therefore be bounded and non-blocking, must take no lock the stopping
    // thread may hold, and should only set flags or issue a non-blocking
    // wake, such as notifying a condition variable or cancelling a socket
    // read. ProviderJobs requests stop outside all of its own locks.
    std::stop_token stop;
  };
  // Runs on the job's thread. Returns the result as JSON text or throws.
  using Worker = std::function<std::string(const Call &)>;
  struct Limits {
    // Largest JSON text a single put or poll carries.
    size_t partBytes = 256 * 1024;
    // Calls whose worker has not returned, closed ones included.
    size_t maxJobs = 8;
    // Largest request a sequence of puts may assemble.
    size_t maxRequestBytes = 256 * 1024 * 1024;
    // Progress events kept per job before the oldest are dropped.
    size_t maxQueuedEvents = 64;
  };

  // What next() delivers.
  struct Outcome {
    enum class Kind {
      // `text` is the answer as JSON text, shaped like a poll answer:
      // "progress", "part" or "done".
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
  // close() or retireRun(), or the destructor. An adapter that forwards
  // outcomes to a run mailbox must therefore be noexcept, safe to call from
  // any of those threads, and safe after the mailbox has closed, where it
  // disposes the outcome instead of delivering it.
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

  explicit ProviderJobs(Worker worker);
  ProviderJobs(Worker worker, Limits limits);
  // Stops every job, completes pending next() calls with Stopped and waits
  // for every worker thread, so no worker outlives this object. See the
  // known gap above.
  ~ProviderJobs();
  ProviderJobs(const ProviderJobs &) = delete;
  ProviderJobs &operator=(const ProviderJobs &) = delete;

  // Adds the four operations for each provider id to `options`. The
  // operations hold a weak reference: once this object is destroyed, put,
  // start and poll throw and close answers null.
  void grant(ContextOptions &options, const std::vector<std::string> &providers);

  // Waits for the next item of job `{job}` without blocking the caller.
  // When an item is ready, or the job is stopped or closed, `done` runs
  // before next returns. Otherwise `done` becomes the job's single waiter and
  // runs on the thread that produces the item or stops the job. A second
  // next() while one is waiting completes with Error "Provider job already
  // has a pending next()". An unknown job or malformed payload completes with
  // Error.
  void next(const std::string &provider, const std::string &payload, Completion done);

  // Requests stop for job `{job}` and completes its waiter with Stopped. A
  // job whose terminal result was already taken keeps it. Unknown jobs are
  // ignored. Returns without waiting for the worker.
  void stop(const std::string &provider, const std::string &payload);

  // Ends run `run`: closes its jobs, which stops those still running and
  // completes their waiters with Stopped, then releases their ids and its
  // pending uploads. A worker still executing keeps its own job alive until
  // it returns. Later calls with a released id fail as unknown. Jobs of
  // other runs are untouched. A later start may reuse the run id.
  void retireRun(const std::string &run);

  struct Stats {
    // Job ids the registry still answers for, tombstones included.
    size_t registered = 0;
    // Workers that have not returned.
    size_t executing = 0;
    // Job objects in memory: registered ones and retired ones a worker or
    // an unjoined thread still holds.
    size_t alive = 0;
  };
  // Joins threads whose worker has returned, then counts.
  Stats stats();

private:
  struct State;
  std::shared_ptr<State> state_;
};
} // namespace gr::host
