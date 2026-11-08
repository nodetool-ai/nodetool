#include "kernel/host_lanes.h"

#include "nodetool/provider_jobs.h"

#include <algorithm>
#include <array>
#include <system_error>
#include <utility>
#include <vector>

namespace gr {
namespace {

constexpr size_t kMaxDefaultCpuThreads = 4;
constexpr size_t kDefaultIoThreads = 8;

JobOutcome shutDown() {
  return {JobOutcome::Kind::Stopped, nullptr, "The host lanes are shut down"};
}

}  // namespace

LaneSizes resolveLaneSizes(LaneSizes requested, unsigned hardwareThreads) {
  LaneSizes sizes = requested;
  if (sizes.cpu == 0) {
    const size_t spare = hardwareThreads > 1 ? hardwareThreads - 1 : 1;
    sizes.cpu = std::min(spare, kMaxDefaultCpuThreads);
  }
  if (sizes.io == 0) sizes.io = kDefaultIoThreads;
  if (sizes.network == 0) sizes.network = host::ProviderJobs::Limits{}.maxJobs;
  return sizes;
}

// --- ThreadPoolExecutor -------------------------------------------------------

ThreadPoolExecutor::ThreadPoolExecutor(std::string name, size_t maxThreads)
    : name_(std::move(name)), maxThreads_(std::max<size_t>(1, maxThreads)) {}

ThreadPoolExecutor::~ThreadPoolExecutor() {
  beginShutdown();
  awaitShutdown(Clock::time_point::max());
}

// Confirms a lane thread's exit. Each lane thread constructs it before
// anything else, so it is its first thread_local and is destroyed after all
// the others, job code's included. What runs after it is the C library's own
// thread teardown, such as pthread key destructors.
class ThreadPoolExecutor::ExitNotice {
public:
  void arm(ThreadPoolExecutor* lane, Thread* self) {
    lane_ = lane;
    self_ = self;
  }
  ~ExitNotice() {
    if (lane_) lane_->confirmExit(*self_);
  }

private:
  ThreadPoolExecutor* lane_ = nullptr;
  Thread* self_ = nullptr;
};

void ThreadPoolExecutor::confirmExit(Thread& self) {
  std::lock_guard lock(mutex_);
  self.exited = true;
  // Notified under the mutex: a waiter that sees the flag joins before it
  // can destroy the lane, and the join waits for this thread to finish.
  exited_.notify_all();
}

bool ThreadPoolExecutor::startThread(void (ThreadPoolExecutor::*body)(Thread&)) {
  Thread& thread = threads_.emplace_back();
  try {
    // The thread blocks on the lane mutex, held here, until the caller
    // unlocks it.
    thread.thread = std::thread([this, body, &thread] {
      thread_local ExitNotice notice;
      notice.arm(this, &thread);
      (this->*body)(thread);
    });
  } catch (const std::system_error&) {
    threads_.pop_back();
    return false;
  }
  return true;
}

void ThreadPoolExecutor::spawnIfNeeded() {
  if (queue_.size() > idle_ && workers_ < maxThreads_ && startThread(&ThreadPoolExecutor::work)) ++workers_;
  if (workers_ > 0 && !reaper_ && startThread(&ThreadPoolExecutor::reap)) reaper_ = true;
}

bool ThreadPoolExecutor::queueReap(Reap& work) {
  if (!reaper_ || reaperDone_) return false;
  reaps_.push_back(std::move(work));
  reapWork_.notify_one();
  return true;
}

void ThreadPoolExecutor::submit(SubmittedJob job) {
  std::optional<SubmittedJob> refused;
  JobOutcome outcome = shutDown();
  {
    std::lock_guard lock(mutex_);
    if (accepting_) {
      queue_.push_back(std::move(job));
      spawnIfNeeded();
      if (workers_ > 0) {
        work_.notify_one();
        return;
      }
      // No thread could start, so nothing would ever run the job.
      refused.emplace(std::move(queue_.back()));
      queue_.pop_back();
      outcome = JobOutcome::failure("cannot start a thread for the " + name_ + " lane");
    } else {
      refused.emplace(std::move(job));
    }
  }
  refused->cancel(std::move(outcome));
}

void ThreadPoolExecutor::dispose(std::deque<JobResult> results) {
  Reap work;
  work.results = std::move(results);
  {
    std::lock_guard lock(mutex_);
    if (queueReap(work)) return;
  }
  // Only when the reaper could not start.
  work = {};
}

size_t ThreadPoolExecutor::discardStopped() {
  std::deque<SubmittedJob> unreaped;
  size_t count = 0;
  {
    std::lock_guard lock(mutex_);
    std::deque<SubmittedJob> kept;
    for (auto& job : queue_) {
      if (!job.stopToken().stop_requested()) {
        kept.push_back(std::move(job));
        continue;
      }
      ++count;
      Reap work;
      work.job.emplace(std::move(job));
      if (!queueReap(work)) unreaped.push_back(std::move(*work.job));
    }
    queue_.swap(kept);
  }
  // Only when the reaper could not start.
  unreaped.clear();
  return count;
}

void ThreadPoolExecutor::forwardStop(const std::stop_source& stop) {
  bool queued = false;
  {
    std::lock_guard lock(mutex_);
    Reap work;
    work.stop = stop;
    queued = queueReap(work);
  }
  // Without a reaper, shutdown already requested this job's stop, or the
  // reaper never started and the request runs here.
  if (!queued && !stop.stop_requested()) std::stop_source(stop).request_stop();
}

void ThreadPoolExecutor::work(Thread& self) {
  std::unique_lock lock(mutex_);
  for (;;) {
    ++idle_;
    work_.wait(lock, [this] { return !queue_.empty() || !accepting_; });
    --idle_;
    if (queue_.empty()) break;
    std::optional<SubmittedJob> job(std::move(queue_.front()));
    queue_.pop_front();
    if (job->stopToken().stop_requested()) {
      // Its run ended while it was queued: destroyed, never run.
      lock.unlock();
      job.reset();
      lock.lock();
      continue;
    }
    std::stop_source stop;
    self.active = stop;
    ++running_;
    lock.unlock();
    {
      // The job stops when its run or the lane does. The run's teardown
      // only queues the request for the reaper, so it never runs the job's
      // stop callbacks.
      std::stop_callback link(job->stopToken(), [this, stop] { forwardStop(stop); });
      job->execute(stop.get_token());
    }
    job.reset();
    lock.lock();
    --running_;
    self.active.reset();
  }
}

void ThreadPoolExecutor::reap(Thread&) {
  std::unique_lock lock(mutex_);
  for (;;) {
    reapWork_.wait(lock, [this] { return !reaps_.empty() || !accepting_; });
    if (reaps_.empty()) {
      reaperDone_ = true;
      break;
    }
    Reap work = std::move(reaps_.front());
    reaps_.pop_front();
    ++reaping_;
    lock.unlock();
    if (work.stop) work.stop->request_stop();
    if (work.job && work.outcome) work.job->cancel(std::move(*work.outcome));
    work = {};
    lock.lock();
    --reaping_;
  }
}

void ThreadPoolExecutor::beginShutdown() {
  std::vector<Reap> unreaped;
  {
    std::lock_guard lock(mutex_);
    accepting_ = false;
    // Stop requests first, so running jobs hear them even while a queued
    // job's destruction blocks the reaper.
    for (auto& thread : threads_) {
      if (!thread.active) continue;
      Reap work;
      work.stop = *thread.active;
      if (!queueReap(work)) unreaped.push_back(std::move(work));
    }
    for (auto& job : queue_) {
      // A queued job's run may still be live, so it gets an AbortError.
      Reap work;
      work.job.emplace(std::move(job));
      work.outcome = shutDown();
      if (!queueReap(work)) unreaped.push_back(std::move(work));
    }
    queue_.clear();
  }
  work_.notify_all();
  reapWork_.notify_all();
  // Only when the reaper could not start.
  for (auto& work : unreaped) {
    if (work.stop) work.stop->request_stop();
    if (work.job && work.outcome) work.job->cancel(std::move(*work.outcome));
  }
}

HostShutdownStatus ThreadPoolExecutor::awaitShutdown(Clock::time_point deadline) {
  std::unique_lock lock(mutex_);
  for (;;) {
    // Joins one confirmed thread at a time, so each counts as joined as
    // soon as its own join returned.
    auto confirmed = std::find_if(threads_.begin(), threads_.end(),
                                  [](const Thread& t) { return t.exited && !t.joining; });
    if (confirmed != threads_.end()) {
      confirmed->joining = true;
      lock.unlock();
      // The thread confirmed its exit after its thread_locals.
      confirmed->thread.join();
      lock.lock();
      confirmed->joined = true;
      exited_.notify_all();
      continue;
    }
    auto allJoined = [this] {
      return std::all_of(threads_.begin(), threads_.end(), [](const Thread& t) { return t.joined; });
    };
    if (allJoined()) return HostShutdownStatus::Complete;
    auto progress = [&] {
      return allJoined() || std::any_of(threads_.begin(), threads_.end(),
                                        [](const Thread& t) { return t.exited && !t.joining; });
    };
    if (deadline == Clock::time_point::max()) {
      exited_.wait(lock, progress);
    } else if (!exited_.wait_until(lock, deadline, progress)) {
      return HostShutdownStatus::TimedOut;
    }
  }
}

size_t ThreadPoolExecutor::liveThreads() const {
  std::lock_guard lock(mutex_);
  return static_cast<size_t>(
      std::count_if(threads_.begin(), threads_.end(), [](const Thread& t) { return !t.joined; }));
}

size_t ThreadPoolExecutor::queued() const {
  std::lock_guard lock(mutex_);
  return queue_.size();
}

size_t ThreadPoolExecutor::running() const {
  std::lock_guard lock(mutex_);
  return running_;
}

size_t ThreadPoolExecutor::pendingReaps() const {
  std::lock_guard lock(mutex_);
  return reaps_.size() + reaping_;
}

// --- HostLanes ----------------------------------------------------------------

std::shared_ptr<HostLanes> HostLanes::threaded(LaneSizes resolved) {
  std::shared_ptr<HostLanes> lanes(new HostLanes);
  lanes->cpu_ = std::make_unique<ThreadPoolExecutor>("cpu", resolved.cpu);
  lanes->io_ = std::make_unique<ThreadPoolExecutor>("io", resolved.io);
  lanes->network_ = std::make_unique<ThreadPoolExecutor>("network", resolved.network);
  return lanes;
}

std::shared_ptr<HostLanes> HostLanes::inlined() { return std::shared_ptr<HostLanes>(new HostLanes); }

ThreadPoolExecutor* HostLanes::pool(Kind kind) {
  switch (kind) {
    case Kind::Cpu: return cpu_.get();
    case Kind::Io: return io_.get();
    case Kind::Network: return network_.get();
  }
  return nullptr;
}

JobExecutor& HostLanes::lane(Kind kind) {
  if (ThreadPoolExecutor* threads = pool(kind)) return *threads;
  return inline_;
}

HostShutdownStatus HostLanes::shutdown(std::chrono::steady_clock::time_point deadline) {
  if (isInline()) return HostShutdownStatus::Complete;
  const std::array pools{cpu_.get(), io_.get(), network_.get()};
  for (ThreadPoolExecutor* threads : pools) threads->beginShutdown();
  auto status = HostShutdownStatus::Complete;
  for (ThreadPoolExecutor* threads : pools) {
    if (threads->awaitShutdown(deadline) == HostShutdownStatus::TimedOut) status = HostShutdownStatus::TimedOut;
  }
  return status;
}

size_t HostLanes::liveThreads() const {
  if (isInline()) return 0;
  return cpu_->liveThreads() + io_->liveThreads() + network_->liveThreads();
}

// --- Process lanes and the supervisor -----------------------------------------

namespace {

struct ProcessLanes {
  std::mutex mutex;
  std::shared_ptr<HostLanes> lanes;
  std::vector<std::shared_ptr<HostLaneSupervisor>> supervisors;
};

ProcessLanes& processLanes() {
  // Never destroyed: a lane thread can still be running a job when static
  // destructors run, and destroying its lane then would wait for it.
  static ProcessLanes* lanes = new ProcessLanes;
  return *lanes;
}

}  // namespace

std::shared_ptr<HostLanes> processHostLanes(LaneSizes sizes) {
  ProcessLanes& process = processLanes();
  std::lock_guard lock(process.mutex);
  if (!process.lanes) {
    process.lanes = HostLanes::threaded(resolveLaneSizes(sizes, std::thread::hardware_concurrency()));
  }
  return process.lanes;
}

struct HostLaneSupervisor::State {
  std::shared_ptr<HostLanes> lanes;
};

HostLaneSupervisor::HostLaneSupervisor(std::shared_ptr<State> state) : state_(std::move(state)) {}
HostLaneSupervisor::~HostLaneSupervisor() = default;

HostShutdownStatus HostLaneSupervisor::retry(std::chrono::steady_clock::time_point deadline) {
  return state_->lanes->shutdown(deadline);
}

size_t HostLaneSupervisor::liveThreads() const { return state_->lanes->liveThreads(); }

HostShutdown shutdownHostLanes(std::chrono::steady_clock::time_point deadline) {
  ProcessLanes& process = processLanes();
  std::shared_ptr<HostLanes> lanes;
  {
    std::lock_guard lock(process.mutex);
    lanes = process.lanes;
  }
  if (!lanes || lanes->shutdown(deadline) == HostShutdownStatus::Complete) return {};
  auto supervisor = std::make_shared<HostLaneSupervisor>(std::make_shared<HostLaneSupervisor::State>(
      HostLaneSupervisor::State{std::move(lanes)}));
  {
    std::lock_guard lock(process.mutex);
    process.supervisors.push_back(supervisor);
  }
  return {HostShutdownStatus::TimedOut, std::move(supervisor)};
}

}  // namespace gr
