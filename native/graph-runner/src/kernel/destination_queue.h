// The destination queue (docs/plans/graph-runner-async-host.md, section 4.8,
// last paragraph).
//
// Persistent writes to one destination, and its removal, commit in the order
// they were accepted, across every run and runner of the process. A host
// takes a ticket on the worker when it accepts the operation, so the order
// is submission order. The operation then does its slow part, such as
// writing a temporary file, on a lane, in parallel with other operations on
// the same destination, and hands its commit step to the ticket. The queue
// runs each destination's steps one at a time in ticket order. A ticket
// destroyed without a step, because its operation was cancelled or failed
// before it could commit, leaves the line.
//
// Handing a step over and leaving the line only update the order. When a
// step's turn comes, the queue submits it as a job to the executor its
// ticket named, normally the process I/O lane, and the step's file
// operations run on that lane's thread. No thread that readies, abandons or
// destroys a ticket, such as a lane's reaper or the process disposer, runs
// another operation's step. In inline mode the executor is the worker's
// InlineExecutor, which runs the step on the submitting thread: the
// documented inline exception. The queue knows nothing about files.
// host/asset_destinations.h builds the asset store's write and removal
// steps on it.
#pragma once

#include "kernel/async_jobs.h"

#include <cstddef>
#include <cstdint>
#include <functional>
#include <map>
#include <memory>
#include <mutex>
#include <optional>
#include <string>
#include <string_view>
#include <unordered_map>

namespace gr {

// One serialized step: a commit or a removal. Runs once, on its ticket's
// executor. It must not throw. A step that never runs, because its executor
// refused it at shutdown, is destroyed instead, and its destructor reports
// and cleans up.
class DestinationStep {
public:
  virtual ~DestinationStep() = default;
  virtual void run() noexcept = 0;
};

// Test seams of a DestinationQueue. Production leaves them empty. `at` runs
// on the thread that hands a step to the line, outside the queue mutex:
// "published" once a ready step, or a synchronous step's claim, is visible
// to other schedulers and before this thread runs or submits it.
struct DestinationQueueHooks {
  std::function<void(std::string_view point)> at;
};

// Serializes steps per destination key, in ticket order.
//
// Thread affinity: thread-safe. `State::mutex` guards the lines. Steps run
// on their executors and are destroyed there, never under the mutex.
//
// Ownership: the queue, each of its tickets and each submitted step job
// share its state, so they may outlive the queue object. The process queue
// (processDestinationQueue) is never destroyed. A test may own its own
// queue.
class DestinationQueue {
  struct State;

public:
  // A place in one destination's line.
  //
  // Thread affinity: none. It can move to any thread, used by one at a
  // time. Readying or destroying it on any thread only updates the line and
  // may submit the next runnable step to its executor.
  //
  // Ownership: move-only. A moved-from or readied ticket is empty.
  class Ticket {
  public:
    Ticket() = default;
    Ticket(Ticket&& other) noexcept;
    Ticket& operator=(Ticket&& other) noexcept;
    Ticket(const Ticket&) = delete;
    Ticket& operator=(const Ticket&) = delete;
    ~Ticket();

    // Hands this place its step, and empties the ticket. The step runs on
    // the ticket's executor once every earlier ticket for the key is done.
    void ready(std::unique_ptr<DestinationStep> step);
    // Leaves the line without a step. The destructor does this.
    void abandon();
    // For a place that is its line's head, such as one from
    // enqueueIfIdle(): claims the head under the queue mutex, so no other
    // scheduler can take it, runs `step` on the calling thread outside the
    // mutex, then hands the line on. Returns after `step` ran. Throws
    // std::logic_error, running nothing, when the place is not the head.
    // Empties the ticket.
    void runHere(std::unique_ptr<DestinationStep> step);

    const std::string& key() const { return key_; }
    explicit operator bool() const { return state_ != nullptr; }

  private:
    friend class DestinationQueue;
    Ticket(std::shared_ptr<State> state, std::string key, uint64_t place)
        : state_(std::move(state)), key_(std::move(key)), place_(place) {}

    // Shared with the queue and the other tickets: see the class comment.
    std::shared_ptr<State> state_;
    std::string key_;
    uint64_t place_ = 0;
  };

  explicit DestinationQueue(DestinationQueueHooks hooks = {});
  DestinationQueue(const DestinationQueue&) = delete;
  DestinationQueue& operator=(const DestinationQueue&) = delete;

  // A place at the end of `key`'s line, whose step runs on `executor`. The
  // executor must outlive the place: the process lanes and a runner's
  // InlineExecutor during its run do.
  Ticket enqueue(std::string key, nodetool::jobs::JobExecutor& executor);
  // A place in `key`'s line only when the line is empty, so the place is
  // its head at once; otherwise nothing. For an operation that must never
  // wait for another one, such as a synchronous asset write, which then
  // runs its step with Ticket::runHere().
  std::optional<Ticket> enqueueIfIdle(std::string key);
  // Tickets in `key`'s line that are not done, the running one included.
  size_t pending(const std::string& key) const;
  // Destinations with a line. A line that empties is removed.
  size_t destinations() const;

private:
  class StepJob;
  // A place in a line, owned by value by its line under `State::mutex`.
  struct Slot {
    std::unique_ptr<DestinationStep> step;
    // Non-owning. See enqueue(). Null for a place that runs its step with
    // Ticket::runHere(), which is never submitted.
    nodetool::jobs::JobExecutor* executor = nullptr;
    bool abandoned = false;
    // Submitted to its executor and not done.
    bool running = false;
  };
  // Thread-safe: `mutex` guards `next` and `lines`. schedule() submits
  // after releasing it.
  struct State {
    explicit State(DestinationQueueHooks h) : hooks(std::move(h)) {}
    // Immutable.
    const DestinationQueueHooks hooks;
    mutable std::mutex mutex;
    uint64_t next = 1;
    // Each destination's line, by place.
    std::unordered_map<std::string, std::map<uint64_t, Slot>> lines;
  };
  // Drops abandoned places at the head of `key`'s line, and submits the
  // head's step to its executor when it is ready and not running.
  static void schedule(const std::shared_ptr<State>& state, const std::string& key);
  // The step at `place` is done or was dropped: removes it and schedules.
  static void finished(const std::shared_ptr<State>& state, const std::string& key, uint64_t place);

  // Shared with every ticket and step job.
  std::shared_ptr<State> state_;
};

// The process's destination queue, created on the first call and never
// destroyed. Kept in the process lane registry (src/kernel/host_lanes.cpp).
DestinationQueue& processDestinationQueue();

}  // namespace gr
