#include "nodetool/jobs/resource_control.h"

#include <cassert>
#include <exception>
#include <utility>

namespace nodetool::jobs {

// --- ResourceLease -------------------------------------------------------------

ResourceLease& ResourceLease::operator=(ResourceLease&& other) noexcept {
  if (this != &other) {
    release();
    control_ = std::move(other.control_);
  }
  return *this;
}

void ResourceLease::release() {
  if (auto control = std::exchange(control_, nullptr)) control->releaseLease();
}

// --- ResourceOperation ---------------------------------------------------------

JobOutcome ResourceOperation::run(std::stop_token stop) {
  ResourceBody* body = nullptr;
  uint64_t id = 0;
  bool precedingFailed = false;
  if (!control_->beginOperation(body, id, precedingFailed)) {
    return JobOutcome::failure("a resource operation ran outside its resource's queue");
  }
  ResourceOperationContext context(stop, id, precedingFailed);
  SessionStopBridge* bridge = body->stopBridge();
  JobOutcome outcome;
  {
    std::optional<SessionStopBridge::Binding> binding;
    if (bridge) binding.emplace(*bridge, id, stop);
    try {
      outcome = apply(*body, context);
    } catch (const std::exception& e) {
      outcome = JobOutcome::failure(e.what());
    } catch (...) {
      outcome = JobOutcome::failure("the resource operation failed");
    }
    // The binding goes here, before endOperation() takes the control's
    // mutex: its destructor waits for a stop callback running elsewhere.
  }
  if (context.retire_ && bridge) bridge->retire();
  control_->endOperation(outcome.kind == JobOutcome::Kind::Error, std::move(context.retire_));
  return outcome;
}

// --- ResourceControl::Dispatched -----------------------------------------------

// The job the lane runs for the active operation: runs the operation's
// submitted job, which delivers its result, and tells the control when it is
// gone, however it goes: run, refused by the lane, or dropped unrun.
//
// Thread affinity: the lane thread that runs it, then the thread that
// destroys it (a lane thread, the lane's reaper or the process disposer).
class ResourceControl::Dispatched final : public NativeJob {
public:
  Dispatched(std::shared_ptr<ResourceControl> control, SubmittedJob job, std::stop_source stop)
      : control_(std::move(control)), job_(std::move(job)), stop_(std::move(stop)) {}
  Dispatched(const Dispatched&) = delete;
  Dispatched& operator=(const Dispatched&) = delete;

  ~Dispatched() override {
    if (job_ && !handled_ && !job_->stopToken().stop_requested()) {
      // The lane shut down with this job queued. Its run is still live, so
      // its promise gets an AbortError, as the lane gives its own jobs.
      job_->cancel(JobOutcome{JobOutcome::Kind::Stopped, nullptr, "The host lanes are shut down"});
    }
    // A job whose run stopped before it started is dropped without a
    // result, as a lane drops it.
    job_.reset();
    control_->completed();
  }

  JobOutcome run(std::stop_token laneStop) override {
    handled_ = true;
    // The lane's stop, linked to the run's, reaches the operation through
    // the control's stop source, which abort() also requests.
    std::stop_callback link(laneStop, [stop = stop_]() mutable { stop.request_stop(); });
    job_->execute(stop_.get_token());
    // This job is detached: the lane destroys this outcome.
    return JobOutcome::value(nullptr);
  }

  void refused(const JobOutcome& outcome) override {
    handled_ = true;
    job_->refuse(JobOutcome{outcome.kind, nullptr, outcome.error});
  }

private:
  // Shared: keeps the control alive until completed() returned.
  std::shared_ptr<ResourceControl> control_;
  std::optional<SubmittedJob> job_;
  std::stop_source stop_;
  bool handled_ = false;
};

// --- ResourceControl -----------------------------------------------------------

std::shared_ptr<ResourceControl> ResourceControl::create(std::string name, std::unique_ptr<ResourceBody> body,
                                                         JobExecutor& lane, Options options) {
  return std::make_shared<ResourceControl>(Key{}, std::move(name), std::move(body), lane, std::move(options));
}

ResourceControl::ResourceControl(Key, std::string name, std::unique_ptr<ResourceBody> body, JobExecutor& lane,
                                 Options options)
    : name_(std::move(name)),
      lane_(lane),
      destroyOn_(options.destroyOn ? *options.destroyOn : lane),
      hooks_(std::move(options.hooks)),
      operations_(*this, false),
      terminal_(*this, true),
      body_(std::move(body)),
      dependencies_(std::move(options.dependencies)) {
  lane_.attach();
  if (&destroyOn_ != &lane_) destroyOn_.attach();
}

ResourceControl::~ResourceControl() {
  // Nothing else can reach the control now: no operation, lease or run.
  if (body_ || !dependencies_.empty()) destroy(Remains{std::move(body_), std::move(dependencies_)});
  if (&destroyOn_ != &lane_) destroyOn_.detach();
  lane_.detach();
}

void ResourceControl::accept(SubmittedJob job, bool terminal) {
  After after;
  {
    std::lock_guard lock(mutex_);
    if (state_ != State::Open) {
      after.rejected.push_back(std::move(job));
      after.outcome = JobOutcome::failure(name_ + " is closed");
    } else {
      queue_.push_back(Entry{std::move(job), terminal});
      if (terminal) state_ = State::Retiring;
      dispatchLocked(after);
    }
  }
  perform(std::move(after));
}

size_t ResourceControl::discardStopped() {
  After after;
  {
    std::lock_guard lock(mutex_);
    std::deque<Entry> kept;
    for (auto& entry : queue_) {
      if (entry.job.stopToken().stop_requested()) {
        after.dropped.push_back(std::move(entry.job));
      } else {
        kept.push_back(std::move(entry));
      }
    }
    queue_.swap(kept);
    finalizeLocked(after);
  }
  const size_t count = after.dropped.size();
  perform(std::move(after));
  return count;
}

void ResourceControl::attachRun() noexcept {
  std::lock_guard lock(mutex_);
  if (attachedRuns_++ == 0) selfWhileAttached_ = weak_from_this().lock();
}

void ResourceControl::detachRun() noexcept {
  // Declared first, so it is released after the lock: it may hold the last
  // reference to this control.
  std::shared_ptr<ResourceControl> self;
  std::lock_guard lock(mutex_);
  assert(attachedRuns_ > 0);
  if (--attachedRuns_ == 0) self = std::move(selfWhileAttached_);
}

std::optional<ResourceLease> ResourceControl::lease() {
  {
    std::lock_guard lock(mutex_);
    if (state_ != State::Open) return std::nullopt;
    ++leases_;
  }
  return ResourceLease(shared_from_this());
}

void ResourceControl::releaseLease() {
  After after;
  {
    std::lock_guard lock(mutex_);
    assert(leases_ > 0);
    --leases_;
    finalizeLocked(after);
  }
  perform(std::move(after));
}

void ResourceControl::close() {
  After after;
  {
    std::lock_guard lock(mutex_);
    if (state_ != State::Open) return;
    state_ = State::Retiring;
    dispatchLocked(after);
    finalizeLocked(after);
  }
  perform(std::move(after));
}

void ResourceControl::abort(std::string reason) {
  After after;
  SessionStopBridge* bridge = nullptr;
  std::optional<std::stop_source> stop;
  {
    std::lock_guard lock(mutex_);
    if (state_ == State::Retired) return;
    abortLocked(after, JobOutcome{JobOutcome::Kind::Stopped, nullptr, std::move(reason)});
    if (body_) bridge = body_->stopBridge();
    // Keeps the body, and so its bridge, alive while this call works
    // unlocked.
    if (bridge) ++holds_;
    if (activeStop_) {
      if (running_) {
        stop = activeStop_;
      } else {
        // The operation requests its own stop on its lane thread when it
        // starts, so no callback of it can run here.
        stopBeforeStart_ = true;
      }
    }
    finalizeLocked(after);
  }
  perform(std::move(after));
  if (hooks_.abortUnlocked) hooks_.abortUnlocked();
  if (bridge) bridge->retire();
  // A running operation runs on a lane thread, so its lane has a reaper to
  // relay to, and its stop callbacks run there, never on this thread.
  if (stop) lane_.stopRelay()->relay(std::move(*stop), nullptr);
  if (!bridge) return;
  After released;
  {
    std::lock_guard lock(mutex_);
    --holds_;
    finalizeLocked(released);
  }
  perform(std::move(released));
}

ResourceControl::State ResourceControl::state() const {
  std::lock_guard lock(mutex_);
  return state_;
}

size_t ResourceControl::queued() const {
  std::lock_guard lock(mutex_);
  return queue_.size();
}

bool ResourceControl::active() const {
  std::lock_guard lock(mutex_);
  return active_;
}

size_t ResourceControl::leases() const {
  std::lock_guard lock(mutex_);
  return leases_;
}

bool ResourceControl::beginOperation(ResourceBody*& body, uint64_t& id, bool& precedingFailed) {
  std::optional<std::stop_source> stopNow;
  {
    std::lock_guard lock(mutex_);
    if (!active_ || running_ || !body_) return false;
    running_ = true;
    body = body_.get();
    id = activeId_;
    precedingFailed = failed_;
    if (stopBeforeStart_) stopNow = activeStop_;
  }
  // On the lane thread, before the operation registers any callback.
  if (stopNow) stopNow->request_stop();
  return true;
}

void ResourceControl::endOperation(bool failed, std::optional<std::string> retire) {
  std::lock_guard lock(mutex_);
  running_ = false;
  if (failed) failed_ = true;
  if (retire) retireReason_ = std::move(retire);
}

void ResourceControl::completed() {
  After after;
  {
    std::lock_guard lock(mutex_);
    active_ = false;
    running_ = false;
    activeStop_.reset();
    stopBeforeStart_ = false;
    // After the operation's own result, so the guest sees it settle before
    // the operations queued behind it reject.
    if (auto reason = std::exchange(retireReason_, std::nullopt); reason && state_ != State::Retired) {
      abortLocked(after, JobOutcome::failure(std::move(*reason)));
    }
    dispatchLocked(after);
    finalizeLocked(after);
  }
  perform(std::move(after));
}

void ResourceControl::dispatchLocked(After& after) {
  if (active_ || state_ == State::Retired) return;
  while (!queue_.empty()) {
    Entry entry = std::move(queue_.front());
    queue_.pop_front();
    if (entry.job.stopToken().stop_requested()) {
      // Its run ended while it was queued: dropped, never run.
      after.dropped.push_back(std::move(entry.job));
      continue;
    }
    active_ = true;
    ++activeId_;
    activeStop_.emplace();
    stopBeforeStart_ = false;
    after.next = Dispatch{std::move(entry.job), *activeStop_};
    return;
  }
}

void ResourceControl::finalizeLocked(After& after) {
  if (state_ != State::Retiring || active_ || !queue_.empty() || leases_ != 0 || holds_ != 0) return;
  state_ = State::Retired;
  after.remains = Remains{std::move(body_), std::move(dependencies_)};
}

void ResourceControl::abortLocked(After& after, JobOutcome outcome) {
  state_ = State::Retiring;
  for (auto& entry : queue_) after.rejected.push_back(std::move(entry.job));
  queue_.clear();
  after.outcome = std::move(outcome);
}

void ResourceControl::perform(After after) {
  for (auto& job : after.rejected) {
    job.refuse(JobOutcome{after.outcome.kind, nullptr, after.outcome.error});
    lane_.disposeUnrun(std::move(job));
  }
  for (auto& job : after.dropped) lane_.disposeUnrun(std::move(job));
  if (after.next) forward(std::move(*after.next));
  if (after.remains) destroy(std::move(*after.remains));
}

void ResourceControl::forward(Dispatch next) {
  std::stop_token stop = next.job.stopToken();
  lane_.submit(SubmittedJob(0, std::make_unique<Dispatched>(shared_from_this(), std::move(next.job), std::move(next.stop)),
                            nullptr, std::move(stop), RunnerTracker::Ticket{}));
}

namespace {

// A retired body and its dependency leases on their way to the destruction
// lane's reaper, as a result payload, which every lane knows how to destroy
// away from the handing thread.
//
// Thread affinity: created under no lock by the retiring thread, destroyed
// on the reaper (or the process disposer, or in inline mode the calling
// thread). Ownership: unique, inside its JobResult.
struct RetiredBody final : JobPayload {
  RetiredBody(std::unique_ptr<ResourceBody> b, std::vector<ResourceLease> d)
      : body(std::move(b)), dependencies(std::move(d)) {}
  ~RetiredBody() override {
    // The body first: a dependency such as a staging directory is cleaned
    // up only after its dependents are gone.
    body.reset();
    dependencies.clear();
  }
  std::unique_ptr<ResourceBody> body;
  std::vector<ResourceLease> dependencies;
};

}  // namespace

void ResourceControl::destroy(Remains remains) {
  JobResult retired;
  retired.outcome = JobOutcome::value(
      std::make_unique<RetiredBody>(std::move(remains.body), std::move(remains.dependencies)));
  std::deque<JobResult> results;
  results.push_back(std::move(retired));
  destroyOn_.dispose(std::move(results));
}

}  // namespace nodetool::jobs
