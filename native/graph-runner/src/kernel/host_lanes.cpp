#include "kernel/host_lanes.h"

#include "host/image_vips.h"
#include "kernel/destination_queue.h"

#include "nodetool/provider_jobs.h"

#include <algorithm>
#include <array>
#include <cassert>
#include <cstdio>
#include <cstdlib>
#include <system_error>
#include <utility>
#include <functional>
#include <vector>

#if !defined(_WIN32)
#include <pthread.h>
#endif

using nodetool::jobs::JobOutcome;
using nodetool::jobs::SubmittedJob;

namespace gr {
namespace {

constexpr size_t kLaneStackBytes = 8u * 1024 * 1024;

// Runs `body` on a new thread with a stack of `bytes` and waits for it. The
// calling thread only waits. Without pthreads the body runs on the caller.
void runWithStack(size_t bytes, const std::function<void()>& body) {
#if defined(_WIN32)
  (void)bytes;
  body();
#else
  pthread_attr_t attr;
  pthread_attr_init(&attr);
  pthread_attr_setstacksize(&attr, bytes);
  pthread_t thread;
  auto entry = [](void* arg) -> void* {
    (*static_cast<const std::function<void()>*>(arg))();
    return nullptr;
  };
  const bool started = pthread_create(&thread, &attr, entry, const_cast<std::function<void()>*>(&body)) == 0;
  pthread_attr_destroy(&attr);
  if (started) pthread_join(thread, nullptr);
  else body();
#endif
}

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

// --- JobDisposer ----------------------------------------------------------------

JobDisposer::JobDisposer() : queue_(std::make_shared<Queue>()) {
  thread_ = std::thread([queue = queue_] {
    std::unique_lock lock(queue->mutex);
    for (;;) {
      // Exits only after the refusal thread left, since it hands its
      // refused jobs here for destruction.
      queue->work.wait(lock, [&] { return !queue->items.empty() || (queue->stopping && queue->refuserDone); });
      if (queue->items.empty()) return;
      Item item = std::move(queue->items.front());
      queue->items.pop_front();
      lock.unlock();
      item = {};
      lock.lock();
    }
  });
  try {
    refuser_ = std::thread([queue = queue_] {
      std::unique_lock lock(queue->mutex);
      for (;;) {
        queue->refusalWork.wait(lock, [&] { return !queue->refusals.empty() || queue->stopping; });
        if (queue->refusals.empty()) break;
        Item item = std::move(queue->refusals.front());
        queue->refusals.pop_front();
        lock.unlock();
        item.job->refuse(std::move(*item.refusal));
        item.refusal.reset();
        lock.lock();
        // The refused job's inputs go to the destruction thread.
        queue->items.push_back(std::move(item));
        queue->work.notify_one();
      }
      queue->refuserDone = true;
      queue->work.notify_all();
    });
  } catch (...) {
    {
      std::lock_guard lock(queue_->mutex);
      queue_->stopping = true;
      queue_->refuserDone = true;
    }
    queue_->work.notify_all();
    thread_.join();
    throw;
  }
}

JobDisposer::~JobDisposer() {
  {
    std::lock_guard lock(queue_->mutex);
    queue_->stopping = true;
  }
  queue_->refusalWork.notify_all();
  queue_->work.notify_all();
  refuser_.join();
  thread_.join();
}

void JobDisposer::dispose(SubmittedJob job) {
  Item item;
  item.job.emplace(std::move(job));
  push(std::move(item));
}

void JobDisposer::refuse(SubmittedJob job, JobOutcome outcome) {
  Item item;
  item.job.emplace(std::move(job));
  item.refusal.emplace(std::move(outcome));
  {
    std::lock_guard lock(queue_->mutex);
    queue_->refusals.push_back(std::move(item));
  }
  queue_->refusalWork.notify_one();
}

void JobDisposer::dispose(std::deque<nodetool::jobs::JobResult> results) {
  Item item;
  item.results = std::move(results);
  push(std::move(item));
}

void JobDisposer::push(Item item) {
  {
    std::lock_guard lock(queue_->mutex);
    queue_->items.push_back(std::move(item));
  }
  queue_->work.notify_one();
}

// --- ThreadPoolExecutor -------------------------------------------------------

// A checked reference from relaying states to their lane.
//
// Thread affinity: thread-safe. `mutex_` guards `lane_`, which the lane's
// destructor clears. Lock order: relay mutex, then lane mutex. Stop requests
// that fall back run after both are released.
class ThreadPoolExecutor::Relay final : public nodetool::jobs::StopRelay {
public:
  explicit Relay(ThreadPoolExecutor& lane) : lane_(&lane) {}
  void relay(std::stop_source stop, std::shared_ptr<void> keep) override {
    {
      std::lock_guard lock(mutex_);
      if (lane_ && lane_->queueStop(stop, keep)) return;
    }
    stop.request_stop();
    keep.reset();
  }
  void detach() {
    std::lock_guard lock(mutex_);
    lane_ = nullptr;
  }

private:
  std::mutex mutex_;
  // Non-owning. Null once the lane is being destroyed.
  ThreadPoolExecutor* lane_;
};

ThreadPoolExecutor::ThreadPoolExecutor(std::string name, size_t maxThreads, ThreadStarter starter)
    : name_(std::move(name)), maxThreads_(std::max<size_t>(1, maxThreads)), starter_(std::move(starter)),
      disposer_(processJobDisposer()), relay_(std::make_shared<Relay>(*this)) {}

ThreadPoolExecutor::~ThreadPoolExecutor() {
  {
    std::lock_guard lock(mutex_);
    if (attached_ != 0) {
      // Each attached user still holds this lane's address. Going on would
      // leave them a dangling pointer, so a broken lifetime contract is a
      // deterministic crash instead.
      std::fprintf(stderr,
                   "nodetool graph runner: the %s lane was destroyed while %zu %s still %s it; destroy runners "
                   "and provider job registries before their lanes\n",
                   name_.c_str(), attached_,
                   attached_ == 1 ? "run or provider job registry" : "runs or provider job registries",
                   attached_ == 1 ? "uses" : "use");
      std::fflush(stderr);
      std::abort();
    }
  }
  relay_->detach();
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
  if (starter_ && !starter_(body == &ThreadPoolExecutor::reap)) return false;
  Thread& thread = threads_.emplace_back();
  try {
    // The thread blocks on the lane mutex, held here, until the caller
    // unlocks it.
    // native-rules #12: lambda captures raw this and runs on a lane thread
    thread.thread = std::thread([this, body, &thread] {
      // libav, libvips and libcurl run here: give them an explicit stack.
      runWithStack(kLaneStackBytes, [this, body, &thread] {
        // native-rules #14: thread_local mutable state
        thread_local ExitNotice notice;
        notice.arm(this, &thread);
        (this->*body)(thread);
      });
    });
  } catch (const std::system_error&) {
    threads_.pop_back();
    return false;
  }
  return true;
}

void ThreadPoolExecutor::spawnIfNeeded() {
  // The reaper first: a job that runs may leave stop requests and
  // destructions that only the reaper may perform.
  if (!reaper_) {
    if (!startThread(&ThreadPoolExecutor::reap)) return;
    reaper_ = true;
  }
  if (queue_.size() > idle_ && workers_ < maxThreads_ && startThread(&ThreadPoolExecutor::work)) ++workers_;
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
      if (reaper_ && workers_ > 0) {
        work_.notify_one();
        return;
      }
      // No reaper, or no worker, could start: the job must not run.
      refused.emplace(std::move(queue_.back()));
      queue_.pop_back();
      outcome = JobOutcome::failure(std::string("cannot start ") + (reaper_ ? "a worker" : "the reaper") +
                                    " thread for the " + name_ + " lane");
    } else {
      refused.emplace(std::move(job));
    }
  }
  refuseAndDispose(std::move(*refused), std::move(outcome));
}

void ThreadPoolExecutor::refuseAndDispose(SubmittedJob job, JobOutcome outcome) {
  if (job.detached()) {
    // Its refused() callback is job code: it runs on the disposer, then the
    // disposer destroys the inputs.
    disposer_.refuse(std::move(job), std::move(outcome));
    return;
  }
  // A mailbox refusal is delivered here, at once; the inputs go off this
  // thread.
  job.refuse(std::move(outcome));
  disposer_.dispose(std::move(job));
}

void ThreadPoolExecutor::dispose(std::deque<nodetool::jobs::JobResult> results) {
  Reap work;
  work.results = std::move(results);
  {
    std::lock_guard lock(mutex_);
    if (queueReap(work)) return;
  }
  // No reaper takes them: the disposer does.
  disposer_.dispose(std::move(work.results));
}

void ThreadPoolExecutor::disposeUnrun(SubmittedJob job) { disposer_.dispose(std::move(job)); }

std::shared_ptr<nodetool::jobs::StopRelay> ThreadPoolExecutor::stopRelay() { return relay_; }

void ThreadPoolExecutor::attach() noexcept {
  std::lock_guard lock(mutex_);
  ++attached_;
}

void ThreadPoolExecutor::detach() noexcept {
  std::lock_guard lock(mutex_);
  assert(attached_ > 0);
  --attached_;
}

bool ThreadPoolExecutor::queueStop(std::stop_source& stop, std::shared_ptr<void>& keep) {
  std::lock_guard lock(mutex_);
  // A relayed stop comes from work that ran, and no work runs before the
  // reaper started.
  assert(reaper_ && "a stop was relayed on a lane whose reaper never started");
  if (reaperDone_) {
    // The fallback runs the stop on the calling thread. Runners are destroyed
    // before their lanes shut down, so no run is left to stop from a worker.
    assert(attached_ == 0 && "a run's stop came after its lane shut down; destroy runners first");
    return false;
  }
  if (!reaper_) return false;
  Reap work;
  work.stop = std::move(stop);
  work.keep = std::move(keep);
  reaps_.push_back(std::move(work));
  reapWork_.notify_one();
  return true;
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
  // No reaper takes them: the disposer does.
  for (auto& job : unreaped) disposer_.dispose(std::move(job));
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
  // No reaper takes them: stop requests run here, and the refused jobs go
  // to the disposer after their AbortError.
  for (auto& work : unreaped) {
    if (work.stop) work.stop->request_stop();
    if (work.job && work.outcome) {
      refuseAndDispose(std::move(*work.job), std::move(*work.outcome));
    }
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
  // native-rules #2: naked new (private constructor), wrapped straight into shared_ptr
  std::shared_ptr<HostLanes> lanes(new HostLanes);
  lanes->cpu_ = std::make_unique<ThreadPoolExecutor>("cpu", resolved.cpu);
  lanes->io_ = std::make_unique<ThreadPoolExecutor>("io", resolved.io);
  lanes->network_ = std::make_unique<ThreadPoolExecutor>("network", resolved.network);
  return lanes;
}

// native-rules #2: naked new (private constructor), wrapped straight into shared_ptr
std::shared_ptr<HostLanes> HostLanes::inlined() { return std::shared_ptr<HostLanes>(new HostLanes); }

ThreadPoolExecutor* HostLanes::pool(Kind kind) {
  switch (kind) {
    case Kind::Cpu: return cpu_.get();
    case Kind::Io: return io_.get();
    case Kind::Network: return network_.get();
  }
  return nullptr;
}

nodetool::jobs::JobExecutor& HostLanes::lane(Kind kind) {
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

// native-rules #9: used from every thread that asks for lanes, no affinity comment
struct ProcessLanes {
  std::mutex mutex;
  std::shared_ptr<HostLanes> lanes;
  // native-rules #14: process-wide supervisor list, grows and is never destroyed
  std::vector<std::shared_ptr<HostLaneSupervisor>> supervisors;
  // Guards `disposer` alone, so a lane built under `mutex` can reach it.
  std::mutex disposerMutex;
  // Created on first use. The registry is never destroyed, so neither is it.
  // native-rules #14: process-wide disposer thread, kept alive by the never-destroyed registry
  std::unique_ptr<JobDisposer> disposer;
  // Guards `destinations` alone.
  std::mutex destinationsMutex;
  // Created on first use and never destroyed, like the disposer.
  // native-rules #14: process-wide asset destination queue, kept alive by the never-destroyed registry
  std::unique_ptr<DestinationQueue> destinations;
};

ProcessLanes& processLanes() {
  // Never destroyed: a lane thread can still be running a job when static
  // destructors run, and destroying its lane then would wait for it.
  // native-rules #14: process-wide host lane registry, never destroyed
  // native-rules #2: naked new for a leaked singleton
  static ProcessLanes* lanes = new ProcessLanes;
  return *lanes;
}

}  // namespace

JobDisposer& processJobDisposer() {
  // libvips must start while no other thread can be inside it (docs/plans/
  // graph-runner-async-host-evidence.md, Q1.6). Every pool thread starts
  // after the disposer exists, so starting it here, once, comes first. A
  // failure is recorded, never retried, and rejects image calls.
  host::vipsStartup();
  ProcessLanes& process = processLanes();
  std::lock_guard lock(process.disposerMutex);
  if (!process.disposer) process.disposer = std::make_unique<JobDisposer>();
  return *process.disposer;
}

DestinationQueue& processDestinationQueue() {
  ProcessLanes& process = processLanes();
  std::lock_guard lock(process.destinationsMutex);
  if (!process.destinations) process.destinations = std::make_unique<DestinationQueue>();
  return *process.destinations;
}

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
