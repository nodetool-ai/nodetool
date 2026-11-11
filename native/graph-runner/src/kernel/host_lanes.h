// The lanes that run native jobs off the worker thread
// (docs/plans/graph-runner-async-host.md, sections 4.4 and 4.10).
//
// A lane is a thread pool with a bounded number of threads and one FIFO
// queue. The process has three: CPU work, file I/O and network calls. They
// outlive every GraphRunner. Inline mode replaces all three with
// InlineExecutor, which runs each job on the worker as it is submitted.
//
// Lock rules: the lane mutex guards the queue, the accepting flag, each
// thread's running job and the reaper's work. A job leaves the queue under
// it, either to run or to be cancelled, never both. Jobs are run, cancelled
// and destroyed, and stop is requested, only after the lane mutex is
// released.
//
// Job code the lane does not control, stop callbacks and the destructors of
// job inputs, never runs on a caller's thread: the run's teardown and
// shutdown() only queue that work for the lane's reaper thread. A stop
// callback that blocks, or an input destructor that blocks, therefore
// delays only the reaper and the lane's later stop requests, and shutdown()
// still returns at its deadline. Section 4.9's contract still applies: stop
// callbacks only set flags or issue a non-blocking wake.
#pragma once

#include "kernel/async_jobs.h"
#include "nodetool/host_lanes.h"

#include <chrono>
#include <condition_variable>
#include <cstddef>
#include <deque>
#include <functional>
#include <list>
#include <memory>
#include <mutex>
#include <optional>
#include <stop_token>
#include <string>
#include <thread>

namespace gr {

// Destroys what a lane must not destroy on the thread that hands it over:
// the inputs of jobs it refused and results it could not give its reaper.
// It also runs the refused() callbacks of detached jobs a lane refused, on
// a second thread of its own, so a refusal is reported even while a
// destructor blocks the destruction thread. One per process, kept by the
// process lane registry and never destroyed, so its threads exist before
// any lane accepts a job and outlive them all. A destructor that blocks
// delays only later disposals, and a refused() callback that blocks only
// later refusals.
//
// Thread affinity: thread-safe. `Queue::mutex` guards both queues. Items are
// destroyed only on the destruction thread, and refused() runs only on the
// refusal thread.
class JobDisposer {
public:
  // Starts both threads. Throws std::system_error when one cannot start.
  JobDisposer();
  // Disposes what is queued, then joins the thread. The process registry
  // never destroys its disposer, so this runs only for a disposer of a test.
  ~JobDisposer();
  JobDisposer(const JobDisposer&) = delete;
  JobDisposer& operator=(const JobDisposer&) = delete;

  void dispose(nodetool::jobs::SubmittedJob job);
  void dispose(std::deque<nodetool::jobs::JobResult> results);
  // Refuses `job` with `outcome` on the refusal thread, then destroys it on
  // the destruction thread: a detached job's NativeJob::refused() callback,
  // such as one that wakes a waiter, never runs on the refusing thread.
  void refuse(nodetool::jobs::SubmittedJob job, nodetool::jobs::JobOutcome outcome);
  // The thread that runs refused() callbacks.
  std::thread::id refusalThread() const { return refuser_.get_id(); }

private:
  struct Item {
    std::optional<nodetool::jobs::SubmittedJob> job;
    // Delivered through job->refuse() before the job is destroyed.
    std::optional<nodetool::jobs::JobOutcome> refusal;
    std::deque<nodetool::jobs::JobResult> results;
  };
  // What the thread shares with the disposer. Thread-safe: `mutex` guards
  // the fields below it.
  struct Queue {
    std::mutex mutex;
    std::condition_variable work;
    std::condition_variable refusalWork;
    std::deque<Item> items;
    // Jobs whose refused() callback has not run yet.
    std::deque<Item> refusals;
    bool stopping = false;
    // The refusal thread left and hands over nothing more.
    bool refuserDone = false;
  };
  void push(Item item);

  // Shared with both threads, which must not reach the disposer itself.
  std::shared_ptr<Queue> queue_;
  std::thread thread_;
  std::thread refuser_;
};

// The process's disposer, started on the first call. Throws
// std::system_error when its thread cannot start.
JobDisposer& processJobDisposer();

// Thread counts of the three lanes. 0 picks the default.
struct LaneSizes {
  size_t cpu = 0;
  size_t io = 0;
  size_t network = 0;
};

// Replaces each 0 in `requested` with its default: CPU
// min(4, hardwareThreads - 1) and at least 1, I/O 8, and network
// ProviderJobs::Limits::maxJobs.
LaneSizes resolveLaneSizes(LaneSizes requested, unsigned hardwareThreads);

// A lane. Threads start on demand, up to `maxThreads`, so a lane that never
// gets a job has no thread. The first job starts the lane's reaper before
// any worker, and no job runs while the lane has no reaper. A submission
// the lane refuses, because no reaper or worker can start or because the
// lane shut down, gets its Error or AbortError through its mailbox first,
// and the process JobDisposer then destroys its inputs. A detached job,
// which has no mailbox, gets its NativeJob::refused() call on the disposer
// too. Job code, input destructors and stop callbacks never run on the
// submitting thread. The
// constructor starts the disposer if needed, so a lane exists only with it.
//
// Thread affinity: thread-safe. `mutex_` guards the queue, the threads and
// the counters below it.
class ThreadPoolExecutor final : public nodetool::jobs::JobExecutor {
public:
  using Clock = std::chrono::steady_clock;
  // Called under the lane mutex before each thread starts, with whether it
  // is the reaper. Returning false fails the start as a failed std::thread
  // would. A test hook: it must not call back into the lane.
  using ThreadStarter = std::function<bool(bool reaper)>;

  // Throws std::system_error when the process disposer cannot start.
  ThreadPoolExecutor(std::string name, size_t maxThreads, ThreadStarter starter = {});
  // Shuts down without a deadline: waits until every thread exited. Call
  // shutdown() first to bound the wait. Every user must have detached: a
  // lane destroyed while a run or provider job registry is attached prints
  // why to stderr and calls std::abort, in every build, since those users
  // still hold its address.
  ~ThreadPoolExecutor() override;
  ThreadPoolExecutor(const ThreadPoolExecutor&) = delete;
  ThreadPoolExecutor& operator=(const ThreadPoolExecutor&) = delete;

  // Queues `job` behind the jobs already queued. A job whose run requested
  // stop before it started is destroyed instead of run. After shutdown
  // began, the job is refused with an AbortError as described above.
  void submit(nodetool::jobs::SubmittedJob job) override;
  // Hands the stopped queued jobs to the reaper, which destroys them.
  size_t discardStopped() override;
  // Hands the results to the reaper, which destroys them.
  void dispose(std::deque<nodetool::jobs::JobResult> results) override;
  // Hands the job to the process JobDisposer.
  void disposeUnrun(nodetool::jobs::SubmittedJob job) override;
  // Relays stop requests to the reaper. After the reaper left at shutdown,
  // or once this lane is being destroyed, the relay requests stop on the
  // calling thread. That never happens on a runner's worker as long as every
  // runner using the lane is destroyed before the lane shuts down, which
  // debug builds assert through attach().
  std::shared_ptr<nodetool::jobs::StopRelay> stopRelay() override;
  // Counts the runs and registries that submit here. See JobExecutor.
  void attach() noexcept override;
  void detach() noexcept override;

  // The first half of shutdown(): stops admission, takes the queued jobs and
  // hands the reaper their cancellation (an AbortError) and a stop request
  // for every running job. Runs no job code itself.
  void beginShutdown();
  // The second half: waits until `deadline` for the lane's threads to exit,
  // joining each one whose exit was confirmed. A thread confirms its exit
  // from a thread_local destroyed after every other thread_local of the
  // thread, so the join that follows does not wait on C++ job code. A
  // pthread key destructor, which the C library runs later, can still delay
  // that join. Complete once every thread was joined. Safe to call from several threads: each
  // thread is joined once, and no caller reports Complete before the last
  // join returned.
  HostShutdownStatus awaitShutdown(Clock::time_point deadline);
  HostShutdownStatus shutdown(Clock::time_point deadline) {
    beginShutdown();
    return awaitShutdown(deadline);
  }

  const std::string& name() const { return name_; }
  size_t maxThreads() const { return maxThreads_; }
  // Threads started, the reaper included, and not joined yet.
  size_t liveThreads() const;
  size_t queued() const;
  size_t running() const;
  // Stop requests and job destructions waiting for, or running on, the
  // reaper.
  size_t pendingReaps() const;

private:
  struct Thread {
    std::thread thread;
    // A worker's running job's stop source, linked to its run's token.
    std::optional<std::stop_source> active;
    // Set when the thread confirms its exit, after its thread_locals.
    bool exited = false;
    bool joining = false;
    bool joined = false;
  };
  // Work for the reaper: a stop request, a job to destroy, or a job to
  // cancel with `outcome` and destroy.
  struct Reap {
    std::optional<std::stop_source> stop;
    std::optional<nodetool::jobs::SubmittedJob> job;
    std::optional<nodetool::jobs::JobOutcome> outcome;
    // Results a closed mailbox handed back.
    std::deque<nodetool::jobs::JobResult> results;
    // Released after `stop` was requested.
    std::shared_ptr<void> keep;
  };
  class ExitNotice;
  class Relay;
  // Locked by the relay, never under the lane mutex. Queues a stop request
  // and its keep reference for the reaper. False, leaving both, when there
  // is no reaper to take them.
  bool queueStop(std::stop_source& stop, std::shared_ptr<void>& keep);
  void work(Thread& self);
  void reap(Thread& self);
  // Locked. Starts a worker when queued jobs outnumber idle workers, and
  // the reaper with the first worker.
  void spawnIfNeeded();
  // Locked. Starts `body` on a new thread. False when it could not start.
  bool startThread(void (ThreadPoolExecutor::*body)(Thread&));
  // Locked. Moves `work` to the reaper's queue. False, leaving `work` as it
  // is, when there is no reaper to take it: the caller then does it itself
  // after unlocking.
  bool queueReap(Reap& work);
  // Refuses a job the lane will not run: a mailbox refusal on this thread,
  // a detached job's refused() callback on the process disposer. Its inputs
  // are destroyed on the disposer either way.
  void refuseAndDispose(nodetool::jobs::SubmittedJob job, nodetool::jobs::JobOutcome outcome);
  // From a running job's link to its run: forwards the run's stop.
  void forwardStop(const std::stop_source& stop);
  void confirmExit(Thread& self);

  const std::string name_;
  const size_t maxThreads_;
  const ThreadStarter starter_;
  // The process disposer, which outlives every lane.
  JobDisposer& disposer_;
  mutable std::mutex mutex_;
  std::condition_variable work_;
  std::condition_variable reapWork_;
  std::condition_variable exited_;
  std::deque<nodetool::jobs::SubmittedJob> queue_;
  std::deque<Reap> reaps_;
  // Stable addresses: each thread keeps a reference to its own entry.
  std::list<Thread> threads_;
  size_t workers_ = 0;
  size_t idle_ = 0;
  size_t running_ = 0;
  size_t reaping_ = 0;
  bool reaper_ = false;
  // The reaper left its loop and takes no more work.
  bool reaperDone_ = false;
  bool accepting_ = true;
  // Runs and registries attached to this lane.
  size_t attached_ = 0;
  // Shared with every state that relays through this lane. Detached in the
  // destructor, before shutdown.
  std::shared_ptr<Relay> relay_;
};

// The executors native jobs run on: the three process lanes, or the worker
// itself in inline mode.
// native-rules #9: shared by every run and lane thread, no thread-safety comment
class HostLanes {
public:
  enum class Kind { Cpu, Io, Network };

  static std::shared_ptr<HostLanes> threaded(LaneSizes resolved);
  static std::shared_ptr<HostLanes> inlined();
  HostLanes(const HostLanes&) = delete;
  HostLanes& operator=(const HostLanes&) = delete;

  nodetool::jobs::JobExecutor& lane(Kind kind);
  nodetool::jobs::JobExecutor& cpu() { return lane(Kind::Cpu); }
  nodetool::jobs::JobExecutor& io() { return lane(Kind::Io); }
  nodetool::jobs::JobExecutor& network() { return lane(Kind::Network); }
  bool isInline() const { return !cpu_; }
  // The thread pool behind `kind`, or null in inline mode.
  ThreadPoolExecutor* pool(Kind kind);

  // Shuts the three lanes down together: admission stops and stop is
  // requested on all of them before the wait. Complete in inline mode.
  HostShutdownStatus shutdown(std::chrono::steady_clock::time_point deadline);
  size_t liveThreads() const;

private:
  HostLanes() = default;
  std::unique_ptr<ThreadPoolExecutor> cpu_, io_, network_;
  nodetool::jobs::InlineExecutor inline_;
};

// The process lanes, created with `sizes` resolved on the first call. Later
// calls return the same lanes and ignore their sizes: pool sizes are set
// once per process. Never destroyed by static teardown.
std::shared_ptr<HostLanes> processHostLanes(LaneSizes sizes);

}  // namespace gr
