// The RunControl a graph run gives Loop::run: the engine's job queue as the
// microtasks, the run's AsyncRun as the completions and external work, and
// the runner's CancelState for the run's generation.
#pragma once

#include "js/engine.h"
#include "kernel/async_jobs.h"
#include "kernel/cancel_state.h"
#include "kernel/task.h"

#include <functional>

namespace gr {

class EngineRunControl final : public RunControl {
public:
  EngineRunControl(js::Engine& engine, AsyncRun& async, const CancelState& cancel, uint64_t generation,
                   std::function<bool()> done, std::function<void(const CancelSnapshot&)> onCancel = {})
      : engine_(engine), async_(async), cancel_(cancel), generation_(generation), done_(std::move(done)),
        onCancel_(std::move(onCancel)) {}

  bool done() override { return done_ && done_(); }
  size_t drainMicrotasks(size_t limit) override { return engine_.drainJobs(limit); }
  bool microtasksPending() override { return engine_.hasPendingJobs(); }
  bool dispatchCompletion() override { return async_.dispatchOne(); }
  // Admits deferred starts first, so a start the ledger now lets through
  // reaches its executor before the loop decides to wait. Admission runs no
  // JavaScript. In inline mode it runs the admitted jobs here.
  bool completionsPending() override {
    async_.pollAdmission();
    return async_.resultsPending();
  }
  bool externalWork() override { return async_.inFlight() > 0; }
  std::optional<CancelSnapshot> cancellation() override { return cancel_.cancellation(generation_); }
  // The first observation also cancels the run's cancellable jobs, before
  // the caller's callback runs.
  void onCancellation(const CancelSnapshot& snapshot) override {
    async_.cancel();
    if (onCancel_) onCancel_(snapshot);
  }

private:
  js::Engine& engine_;
  AsyncRun& async_;
  const CancelState& cancel_;
  uint64_t generation_;
  std::function<bool()> done_;
  std::function<void(const CancelSnapshot&)> onCancel_;
};

}  // namespace gr
