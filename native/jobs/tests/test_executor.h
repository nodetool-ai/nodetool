// A JobExecutor for this package's tests: worker threads that run submitted
// jobs off the calling thread, a FIFO queue, stop handling and a reaper
// thread. It stands in for the graph runner's ThreadPoolExecutor
// (native/graph-runner/src/kernel/host_lanes.h) without its process
// registry, timed shutdown or supervisor, and keeps the lane's thread rules
// for job code it does not control:
//
// - A queued job whose run requested stop is destroyed, never run and never
//   delivered: by the reaper when discardStopped() takes it, or by the
//   worker that dequeues it.
// - A running job's stop is forwarded to the reaper, which requests it, so
//   the job's stop callbacks never run on the thread that stopped its run.
//   Shutdown queues its stop requests there too.
// - Shutdown hands every queued job to the reaper, which cancels it with a
//   Stopped outcome and destroys it.
// - dispose(), disposeUnrun() and relayed stops run on the reaper. The lane
//   hands disposeUnrun() to its process disposer instead, another thread
//   that is not the caller.
//
// Test support, not package API. job_core.cpp's testExecutorThreadsMatchTheLane
// pins these thread identities.
#pragma once

#include "nodetool/jobs/job_core.h"

#include <condition_variable>
#include <cstddef>
#include <cstdio>
#include <cstdlib>
#include <deque>
#include <memory>
#include <mutex>
#include <optional>
#include <stop_token>
#include <string>
#include <thread>
#include <utility>
#include <vector>

namespace jobs_test {

// Ownership: the test owns the executor by value or through
// std::unique_ptr. Its threads, its stop relays and nothing else share its
// State, so a relay can outlive the executor.
//
// Thread affinity: thread-safe. State::mutex guards every field of State
// that the constructor does not write. Jobs run on the worker threads.
// Disposal, discarded jobs, forwarded and relayed stops and shutdown
// cancellations run on the reaper thread while it is open, else on the
// calling thread, as a lane whose reaper left does.
class TestExecutor final : public nodetool::jobs::JobExecutor {
public:
  explicit TestExecutor(size_t workers = 1) : state_(std::make_shared<State>()) {
    std::lock_guard lock(state_->mutex);
    state_->active.resize(workers);
    for (size_t i = 0; i < workers; ++i) {
      std::thread worker([state = state_, i] { State::work(state, i); });
      state_->workerIds.push_back(worker.get_id());
      workers_.push_back(std::move(worker));
    }
    std::thread reaper([state = state_] { state->reap(); });
    state_->reaperId = reaper.get_id();
    reaper_ = std::move(reaper);
  }

  // As a lane's shutdown: stops admission, hands the reaper a stop request
  // for every running job and then each queued job to cancel with a Stopped
  // outcome, joins the workers, lets the reaper finish what it holds and
  // joins it. Aborts the process when a resource control or run is still
  // attached, as a pool lane does.
  ~TestExecutor() override {
    std::vector<Item> unreaped;
    {
      std::lock_guard lock(state_->mutex);
      state_->stopping = true;
      // Stop requests first, so running jobs hear them even while a queued
      // job's destruction blocks the reaper.
      for (const auto& stop : state_->active) {
        if (!stop) continue;
        Item item;
        item.stop = *stop;
        if (!state_->queueLocked(item, nullptr)) unreaped.push_back(std::move(item));
      }
      for (auto& job : state_->queue) {
        Item item;
        item.job.emplace(std::move(job));
        item.outcome.emplace(nodetool::jobs::JobOutcome{nodetool::jobs::JobOutcome::Kind::Stopped, nullptr,
                                                        "the test executor shut down"});
        if (!state_->queueLocked(item, nullptr)) unreaped.push_back(std::move(item));
      }
      state_->queue.clear();
    }
    state_->changed.notify_all();
    for (auto& item : unreaped) item.perform();
    unreaped.clear();
    for (auto& worker : workers_) worker.join();
    {
      std::lock_guard lock(state_->mutex);
      state_->reaperClosing = true;
    }
    state_->changed.notify_all();
    reaper_.join();
    std::lock_guard lock(state_->mutex);
    if (state_->attached != 0) {
      std::fprintf(stderr, "a test executor was destroyed with %zu attachments\n", state_->attached);
      std::abort();
    }
  }
  TestExecutor(const TestExecutor&) = delete;
  TestExecutor& operator=(const TestExecutor&) = delete;

  void submit(nodetool::jobs::SubmittedJob job) override {
    {
      std::lock_guard lock(state_->mutex);
      ++state_->submitted;
      if (!state_->stopping) {
        state_->queue.push_back(std::move(job));
        state_->changed.notify_all();
        return;
      }
    }
    // Shut down: refused, as a lane refuses, then destroyed off the caller.
    job.refuse(nodetool::jobs::JobOutcome{nodetool::jobs::JobOutcome::Kind::Stopped, nullptr,
                                          "the test executor is shut down"});
    disposeUnrun(std::move(job));
  }

  // As a lane: hands each stopped queued job to the reaper, which destroys
  // it without running or delivering it.
  size_t discardStopped() override {
    std::vector<Item> unreaped;
    size_t count = 0;
    {
      std::lock_guard lock(state_->mutex);
      std::deque<nodetool::jobs::SubmittedJob> kept;
      for (auto& job : state_->queue) {
        if (!job.stopToken().stop_requested()) {
          kept.push_back(std::move(job));
          continue;
        }
        ++count;
        Item item;
        item.job.emplace(std::move(job));
        if (!state_->queueLocked(item, &State::discarded)) unreaped.push_back(std::move(item));
      }
      state_->queue.swap(kept);
      state_->changed.notify_all();
    }
    for (auto& item : unreaped) item.perform();
    return count;
  }

  void dispose(std::deque<nodetool::jobs::JobResult> results) override {
    Item item;
    item.results = std::move(results);
    state_->hand(std::move(item), &State::disposedResults);
  }

  void disposeUnrun(nodetool::jobs::SubmittedJob job) override {
    Item item;
    item.job.emplace(std::move(job));
    state_->hand(std::move(item), &State::disposedUnrun);
  }

  std::shared_ptr<nodetool::jobs::StopRelay> stopRelay() override { return std::make_shared<Relay>(state_); }

  void attach() noexcept override {
    std::lock_guard lock(state_->mutex);
    ++state_->attached;
  }
  void detach() noexcept override {
    std::lock_guard lock(state_->mutex);
    if (state_->attached == 0) {
      std::fprintf(stderr, "a test executor was detached more often than attached\n");
      std::abort();
    }
    --state_->attached;
  }

  // Waits until nothing is queued, running, being dropped or waiting for
  // the reaper.
  void quiesce() {
    std::unique_lock lock(state_->mutex);
    state_->changed.wait(lock, [this] { return state_->idleLocked(); });
  }

  // Inspection.
  size_t queued() const {
    std::lock_guard lock(state_->mutex);
    return state_->queue.size();
  }
  size_t running() const { return locked(&State::running); }
  size_t submitted() const { return locked(&State::submitted); }
  size_t executed() const { return locked(&State::executed); }
  // Queued jobs a worker dequeued after their run stopped and destroyed.
  size_t dropped() const { return locked(&State::dropped); }
  // Queued jobs discardStopped() handed to the reaper.
  size_t discarded() const { return locked(&State::discarded); }
  // Stops of running jobs' runs forwarded to the reaper.
  size_t forwarded() const { return locked(&State::forwarded); }
  size_t disposedResults() const { return locked(&State::disposedResults); }
  size_t disposedUnrun() const { return locked(&State::disposedUnrun); }
  size_t relayed() const { return locked(&State::relayed); }
  size_t attached() const { return locked(&State::attached); }
  std::thread::id reaperThread() const { return state_->reaperId; }
  bool isWorker(std::thread::id id) const {
    for (const auto& worker : state_->workerIds) {
      if (worker == id) return true;
    }
    return false;
  }

private:
  // One piece of reaper work: results, a job to destroy or, with an
  // outcome, to cancel first, or a stop to request and something to release
  // after it. Plain data, owned by value.
  //
  // Thread affinity: one thread at a time. Built by the thread that hands
  // the work over, queued under State::mutex, then performed and destroyed
  // by the reaper, or by the caller when no reaper takes it.
  struct Item {
    std::deque<nodetool::jobs::JobResult> results;
    std::optional<nodetool::jobs::SubmittedJob> job;
    std::optional<nodetool::jobs::JobOutcome> outcome;
    std::optional<std::stop_source> stop;
    std::shared_ptr<void> keep;

    void perform() {
      if (stop) stop->request_stop();
      if (job && outcome) job->cancel(std::move(*outcome));
      keep.reset();
      results.clear();
      job.reset();
    }
  };

  // Shared by the executor, its threads and its relays (see the class
  // comment). `mutex` guards every field below it except the thread ids,
  // which the constructor writes before any thread reads them.
  //
  // Thread affinity: thread-safe, as described above.
  struct State {
    std::mutex mutex;
    std::condition_variable changed;
    std::vector<std::thread::id> workerIds;
    std::thread::id reaperId;
    std::deque<nodetool::jobs::SubmittedJob> queue;
    std::deque<Item> reapQueue;
    // Each worker's running job's stop source, by worker index.
    std::vector<std::optional<std::stop_source>> active;
    bool stopping = false;
    bool reaperClosing = false;
    bool reaperGone = false;
    size_t running = 0;
    size_t dropping = 0;
    size_t reaping = 0;
    size_t submitted = 0;
    size_t executed = 0;
    size_t dropped = 0;
    size_t discarded = 0;
    size_t forwarded = 0;
    size_t disposedResults = 0;
    size_t disposedUnrun = 0;
    size_t relayed = 0;
    size_t attached = 0;

    bool idleLocked() const {
      return queue.empty() && running == 0 && dropping == 0 && reapQueue.empty() && reaping == 0;
    }

    // Worker `index`. Holds `state` while it runs, so the stop link's weak
    // reference resolves until the link is gone.
    static void work(const std::shared_ptr<State>& state, size_t index) {
      std::unique_lock lock(state->mutex);
      for (;;) {
        state->changed.wait(lock, [&] { return state->stopping || !state->queue.empty(); });
        if (state->stopping) return;
        std::optional<nodetool::jobs::SubmittedJob> job(std::move(state->queue.front()));
        state->queue.pop_front();
        if (job->stopToken().stop_requested()) {
          // As a lane worker: its run ended while it was queued, so it is
          // destroyed here, never run and never delivered.
          ++state->dropping;
          lock.unlock();
          job.reset();
          lock.lock();
          --state->dropping;
          ++state->dropped;
          state->changed.notify_all();
          continue;
        }
        std::stop_source jobStop;
        state->active[index] = jobStop;
        ++state->running;
        lock.unlock();
        {
          // The run's stop goes to the reaper, which requests it, so the
          // job's stop callbacks never run on the thread that stopped the
          // run. Shutdown requests the lane's stop through the reaper too.
          std::weak_ptr<State> weak = state;
          std::stop_callback link(job->stopToken(), [weak, jobStop] {
            if (auto shared = weak.lock()) shared->forward(jobStop);
          });
          job->execute(jobStop.get_token());
        }
        job.reset();
        lock.lock();
        state->active[index].reset();
        --state->running;
        ++state->executed;
        state->changed.notify_all();
      }
    }

    void reap() {
      for (;;) {
        Item item;
        {
          std::unique_lock lock(mutex);
          changed.wait(lock, [this] { return reaperClosing || !reapQueue.empty(); });
          if (reapQueue.empty()) {
            reaperGone = true;
            changed.notify_all();
            return;
          }
          item = std::move(reapQueue.front());
          reapQueue.pop_front();
          ++reaping;
        }
        item.perform();
        {
          std::lock_guard lock(mutex);
          --reaping;
        }
        changed.notify_all();
      }
    }

    // Locked. Counts `item` in `counter`, when one is given, and moves it to
    // the reaper's queue. False, leaving `item`, once the reaper left: the
    // caller then performs it after unlocking.
    bool queueLocked(Item& item, size_t State::*counter) {
      if (counter) ++(this->*counter);
      if (reaperGone) return false;
      reapQueue.push_back(std::move(item));
      changed.notify_all();
      return true;
    }

    // Hands `item` to the reaper, or performs it on the calling thread once
    // the reaper left.
    void hand(Item item, size_t State::*counter) {
      {
        std::lock_guard lock(mutex);
        if (queueLocked(item, counter)) return;
      }
      item.perform();
    }

    // From a running job's link to its run: queues the job's stop for the
    // reaper.
    void forward(const std::stop_source& stop) {
      Item item;
      item.stop = stop;
      hand(std::move(item), &State::forwarded);
    }
  };

  // Relays stops to the reaper. Holds the State, never the executor.
  //
  // Thread affinity: thread-safe through State::mutex.
  class Relay final : public nodetool::jobs::StopRelay {
  public:
    explicit Relay(std::shared_ptr<State> state) : state_(std::move(state)) {}
    void relay(std::stop_source stop, std::shared_ptr<void> keep) override {
      Item item;
      item.stop.emplace(std::move(stop));
      item.keep = std::move(keep);
      state_->hand(std::move(item), &State::relayed);
    }

  private:
    std::shared_ptr<State> state_;
  };

  size_t locked(size_t State::*field) const {
    std::lock_guard lock(state_->mutex);
    return (*state_).*field;
  }

  std::shared_ptr<State> state_;
  std::vector<std::thread> workers_;
  std::thread reaper_;
};

}  // namespace jobs_test
