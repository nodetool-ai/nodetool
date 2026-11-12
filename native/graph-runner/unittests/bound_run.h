// One graph run bound to an engine, as GraphRunner::Impl::runJob binds it:
// an AsyncRun on the run's lanes, the engine's RunBinding, and a loop that
// runs until a condition holds. Shared by gr_file_handle_tests and
// gr_files_async_tests.
#pragma once

#include "js/engine.h"
#include "kernel/async_jobs.h"
#include "kernel/cancel_state.h"
#include "kernel/run_control.h"
#include "kernel/task.h"
#include "nodetool/context_options.h"
#include "nodetool/jobs/admission.h"

#include <chrono>
#include <functional>
#include <memory>
#include <optional>
#include <string>

namespace grtest {

// Thread affinity: the thread that created it, which owns the engine and
// the loop. The lanes it binds must outlive it.
class BoundRun {
public:
  BoundRun(gr::js::Engine& engine, nodetool::jobs::JobExecutor& io, nodetool::jobs::JobExecutor* network = nullptr,
           std::shared_ptr<nodetool::jobs::RunAccount> account = {},
           std::shared_ptr<nodetool::jobs::RunnerTracker> tracker = std::make_shared<nodetool::jobs::RunnerTracker>())
      : engine_(engine), tracker_(std::move(tracker)) {
    generation_ = cancel_.beginRun();
    async_.emplace(engine_, loop_, tracker_, generation_, io, gr::host::newRunIdentity("test", std::move(account)));
    bound_.emplace(engine_, *async_, io, network);
  }
  ~BoundRun() { end(); }
  BoundRun(const BoundRun&) = delete;
  BoundRun& operator=(const BoundRun&) = delete;

  // Runs the loop until `done` holds, the run stalls or its cancel deadline
  // passes.
  gr::RunExit runUntil(std::function<bool()> done) {
    gr::EngineRunControl control(engine_, *async_, cancel_, generation_, std::move(done));
    return loop_.run(control);
  }
  // Runs until the global `name` is truthy.
  gr::RunExit runUntilGlobal(const std::string& name) {
    return runUntil([this, name] { return engine_.toBoolean(engine_.get(engine_.global(), name)); });
  }
  // Requests the run's cancellation, as GraphRunner::cancel does. The loop
  // sees it at its next scheduling boundary.
  void cancel(std::chrono::milliseconds grace = std::chrono::milliseconds(5000)) {
    cancel_.request(generation_, gr::CancelState::Clock::now() + grace);
  }
  // Ends the run as runJob's teardown does: unbind, stop and detach the
  // jobs, drop timers and frames. Run resources are the caller's: call
  // releaseRunResources() on the engine after it, as runJob does.
  void end() {
    if (!async_) return;
    bound_.reset();
    async_->teardown();
    loop_.clearTimers();
    loop_.abandon();
    async_.reset();
    cancel_.endRun();
  }

  gr::AsyncRun& async() { return *async_; }
  nodetool::jobs::RunnerTracker& tracker() { return *tracker_; }

private:
  gr::js::Engine& engine_;
  gr::Loop& loop_ = gr::Loop::current();
  gr::CancelState cancel_;
  uint64_t generation_ = 0;
  std::shared_ptr<nodetool::jobs::RunnerTracker> tracker_;
  std::optional<gr::AsyncRun> async_;
  std::optional<gr::RunBinding::Scope> bound_;
};

}  // namespace grtest
