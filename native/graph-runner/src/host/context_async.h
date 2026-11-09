// The asynchronous context transport (docs/plans/graph-runner-async-host.md,
// section 5.2). __host.context.callAsync submits a ContextJob to the run's
// I/O lane. The job invokes the embedder's AsyncCallback there with a
// ContextCompletion, and the completion's shared state delivers the outcome
// through the run's mailbox, now or later, from whichever thread wins.
#pragma once

#include "kernel/async_jobs.h"
#include "nodetool/context_options.h"

#include <memory>
#include <mutex>
#include <optional>
#include <stop_token>
#include <string>

namespace gr::host {

// A Value result of an asynchronous context call: the callback's JSON text.
// The worker checks its size when it settles the promise. A response larger
// than the call's reserved response bytes keeps only its size, so the text
// is freed on the completing thread and the worker still reports it as too
// large.
//
// Thread affinity: none. Created on the completing thread, it travels in its
// JobResult to the worker, or is destroyed on the completing thread when the
// mailbox is closed.
struct ContextResponse final : nodetool::jobs::JobPayload {
  explicit ContextResponse(std::string json) : text(std::move(json)), bytes(text.size()) {}
  ContextResponse(size_t oversized, std::nullptr_t) : bytes(oversized) {}
  std::string text;
  // The size of the callback's response.
  size_t bytes;
};

// The outcome state one asynchronous call shares between its job, its
// completion and the run's stop.
//
// Thread affinity: thread-safe. `mutex_` guards the outcome fields below it.
// Delivery to the mailbox, stop requests, and destruction of stop callback
// registrations happen outside `mutex_`. The state never touches the engine
// or the loop.
//
// Ownership: shared by the ContextCompletion the embedder holds (any thread)
// and by the ContextJob while the callback runs (I/O lane). Neither can own it
// alone, because the embedder may keep the completion after the job ended,
// and the job must still see the outcome when the embedder drops it during
// the call. Stop callbacks hold only a weak reference.
//
// The state keeps the callback (and so everything it captures), the stop
// source handed to the callback, a tracker ticket and a reference to the
// call's admission charge alive until the last owner is gone, so a call that
// settled Stopped while the embedder still works keeps its memory charged.
// The result's delivery right, with its own tracker ticket, reservation
// reference and mailbox reference, leaves the state at the first terminal
// outcome.
class ContextCompletionState {
public:
  enum class Phase { Pending, Value, Error, Stopped };

  // `responseCap` is the most response bytes the call reserved. A larger
  // response is dropped on arrival and fails as too large, and a larger
  // error message is replaced by a short diagnostic with its first bytes.
  ContextCompletionState(std::string operation, std::shared_ptr<const ContextOptions::AsyncCallback> owner,
                         std::shared_ptr<nodetool::jobs::StopRelay> relay, nodetool::jobs::JobDelivery delivery,
                         nodetool::jobs::RunnerTracker::Ticket retention, RunIdentity run, uint64_t responseCap,
                         nodetool::jobs::Reservation reservation);
  ContextCompletionState(const ContextCompletionState&) = delete;
  ContextCompletionState& operator=(const ContextCompletionState&) = delete;

  // Registers the run's stop (the run's cancellation, for a cancellable
  // call). Call once, from the owner that created the state, before the
  // callback starts. The stop settles Stopped on the thread that requested
  // it, then hands the request to stop the callback's token to the relay,
  // with a reference that keeps the state alive until the request ran.
  static void linkRunStop(const std::shared_ptr<ContextCompletionState>& state);

  const ContextOptions::AsyncCallback& callback() const { return *owner_; }
  // The submitting run. Immutable.
  const RunIdentity& run() const { return run_; }

  // The token handed to the callback.
  std::stop_token token() const { return stop_.get_token(); }
  // Stops the callback's token. Only for a stop that is not the run's, such
  // as a lane shutdown during the call; it settles nothing.
  void requestStop() { stop_.request_stop(); }

  // ContextCompletion: the embedder's result.
  void complete(ContextResult result);
  // ContextCompletion: destroyed without a call.
  void dropped();
  // ContextJob: the callback returned, or threw `thrown`, a message the job
  // already bounded to the response cap.
  void endInvocation(std::optional<std::string> thrown);

private:
  // The run's stop callback. Runs on the thread that requests the run's
  // stop (the worker, at cancellation or teardown), or on the registering
  // thread when the run already stopped. Only settles and queues.
  struct RunStopLink {
    std::weak_ptr<ContextCompletionState> state;
    void operator()() const;
  };
  // Settles `outcome` if nothing settled yet. Delivers outside the mutex.
  // Returns whether this call settled.
  bool settle(Phase phase, nodetool::jobs::JobOutcome outcome);
  static void onRunStop(std::shared_ptr<ContextCompletionState> self);
  std::string missing() const;

  // Declared first so it is released last, after the callback and its
  // captures: the runner's tracker counts the call until nothing of it is
  // left. Touched only by the constructor and the destructor.
  nodetool::jobs::RunnerTracker::Ticket retention_;
  // The call's admission charge, shared with its result: released when the
  // state and the result are both gone. Touched only by the constructor and
  // the destructor.
  nodetool::jobs::Reservation reservation_;
  const std::string operation_;
  const uint64_t responseCap_;
  // The callback, which owns the embedder's captures. Immutable.
  const std::shared_ptr<const ContextOptions::AsyncCallback> owner_;
  // The I/O lane's relay: where the run's stop reaches the callback's token.
  // Immutable.
  const std::shared_ptr<nodetool::jobs::StopRelay> relay_;
  const RunIdentity run_;
  // std::stop_source is thread-safe.
  std::stop_source stop_;

  mutable std::mutex mutex_;
  Phase phase_ = Phase::Pending;     // guarded by mutex_
  bool invoking_ = true;             // guarded by mutex_
  bool dropped_ = false;             // guarded by mutex_
  std::optional<nodetool::jobs::JobDelivery> delivery_;  // guarded by mutex_

  // Set once by linkRunStop() before any other thread sees the state, and
  // destroyed with it. Declared last so it is deregistered first.
  std::optional<std::stop_callback<RunStopLink>> runLink_;
};

// The job callAsync submits to the I/O lane.
// `relay` is the I/O lane's stop relay. `run` is the submitting run, which
// the callback reads from its completion. Its cost is the request plus
// `responseCap` response bytes, the most a response may hold.
std::unique_ptr<nodetool::jobs::NativeJob> makeContextJob(std::string operation, std::string request,
                                                          std::shared_ptr<const ContextOptions::AsyncCallback> callback,
                                                          std::shared_ptr<nodetool::jobs::StopRelay> relay,
                                                          RunIdentity run, uint64_t responseCap);

}  // namespace gr::host
