// Single-threaded cooperative scheduling for the kernel.
//
// Task<T> is an eagerly started coroutine, like a JavaScript async function:
// it runs synchronously until its first suspension. Awaiting a Task always
// resumes the awaiter from the loop's ready queue, never inline, which mirrors
// how `await` costs at least one microtask in JavaScript.
#pragma once

#include <chrono>
#include <condition_variable>
#include <coroutine>
#include <cstdint>
#include <deque>
#include <exception>
#include <functional>
#include <map>
#include <memory>
#include <mutex>
#include <optional>
#include <unordered_map>
#include <utility>

#include "js/thread_owner.h"
#include "nodetool/jobs/wake_target.h"

namespace gr {

// One coherent reading of a run's cancellation, taken under CancelState's
// mutex (src/kernel/cancel_state.h).
struct CancelSnapshot {
  uint64_t generation = 0;
  bool requested = false;
  // Runner destruction: stop at once.
  bool immediate = false;
  std::optional<std::chrono::steady_clock::time_point> deadline;

  bool expired(std::chrono::steady_clock::time_point now) const {
    return immediate || (deadline && now >= *deadline);
  }
};

enum class RunExit {
  // The root task finished.
  Done,
  // No step, microtask, timer or external work is left, and the task did
  // not finish.
  Stalled,
  // The run was being cancelled and its deadline passed.
  Deadline,
};

// What Loop::run(RunControl&) schedules besides kernel steps and timers:
// the engine's microtasks, completions of native jobs (src/kernel/async_jobs.h)
// and the run's cancellation.
class RunControl {
public:
  virtual ~RunControl() = default;
  virtual bool done() = 0;
  // Runs at most `limit` queued microtasks. Returns how many ran.
  virtual size_t drainMicrotasks(size_t limit) = 0;
  virtual bool microtasksPending() = 0;
  // Settles one waiting completion. Returns false when none waits.
  virtual bool dispatchCompletion() = 0;
  virtual bool completionsPending() = 0;
  // True while a submitted job can still deliver a completion.
  virtual bool externalWork() = 0;
  // The run's cancellation, or nullopt while it is not being cancelled.
  virtual std::optional<CancelSnapshot> cancellation() = 0;
  // Called when the loop first observes the cancellation, and again when its
  // deadline moves.
  virtual void onCancellation(const CancelSnapshot&) {}
};

// The run loop of one thread, and the wake target of the mailboxes of the
// runs it schedules.
//
// Thread affinity: the thread that created it, checked by ThreadOwner in
// debug builds, except wake(), which is thread-safe: `wakeMutex_` guards
// `woken_`. A RunMailbox calls wake() under its own mutex, so the lock order
// is the mailbox mutex, then `wakeMutex_` (nodetool/jobs/wake_target.h).
class Loop final : public nodetool::jobs::WakeTarget {
public:
  using Clock = std::chrono::steady_clock;
  // Cancellation mode runs at most this many ready steps per round, and at
  // most this many microtasks after each step.
  static constexpr size_t kSliceSteps = 64;
  static constexpr size_t kSliceMicrotasks = 64;

  // The calling thread's loop. Each thread schedules its own coroutines.
  static Loop& current();

  void post(std::coroutine_handle<> h) {
    owner_.check("gr::Loop");
    ready_.push_back(h);
  }

  // Called after every resumed step and whenever the ready queue runs dry.
  // Returns true when it did work that may have posted more steps.
  void setPump(std::function<bool()> pump) { pump_ = std::move(pump); }

  // Runs until no step is ready, the pump reports no work, and no timer is
  // pending, or `stopWaiting` returns true (checked only once nothing else
  // is left to do; the remaining timers stay queued for the caller to clear).
  // While only timers remain, the thread sleeps until the next one is due or
  // wake() is called, then calls the pump again.
  void run(const std::function<bool()>& stopWaiting = {});

  // Runs a graph run. In normal mode the ordering is run()'s: microtasks
  // drain completely after every step, and a macrotask runs only when no
  // step is ready and no microtask is pending. A macrotask is one due timer
  // or one completion (section 4.5 of docs/plans/graph-runner-async-host.md).
  // Returns Done when the task is done at a macrotask point, without
  // awaiting outstanding jobs.
  //
  // Once control.cancellation() reports the run's cancellation, before a
  // step, a macrotask or a wait, the loop switches to cancellation mode for
  // the rest of the call: rounds of at most kSliceSteps steps, each followed
  // by at most kSliceMicrotasks microtasks, then at most one macrotask. A
  // fresh snapshot is taken immediately before every step, microtask,
  // macrotask and wait, after the control queries that chose it, and again
  // after each returns. The call returns Deadline once the deadline passed.
  //
  // Waits until the next timer (or the deadline when cancelling), or
  // indefinitely when only external work is left, unless wake() is called.
  RunExit run(RunControl& control);

  bool idle() const { return ready_.empty(); }

  // Timers are macrotasks, as in Node. A due timer fires only when no step
  // is ready and the pump reports no work, so every queued kernel step and
  // microtask, including those the previous timer queued, runs first. One
  // timer fires per turn. Timers fire in deadline order, and timers with the
  // same deadline in the order they were set. A repeating timer is set
  // again `delay` after it fired, unless its callback cleared it.
  uint64_t setTimer(std::chrono::milliseconds delay, std::function<void()> fire,
                    bool repeat = false);
  // Returns false for an unknown, fired or cleared timer.
  bool clearTimer(uint64_t id);
  // Drops every timer and lifts limitTimers().
  void clearTimers();
  size_t pendingTimers() const { return timers_.size(); }
  // Drops every timer due after `limit`, and drops new or repeating timers
  // due after it, until clearTimers(). Used when a run is cancelled: work
  // waiting on a timer inside the grace period still finishes, and nothing
  // keeps the loop waiting past it.
  void limitTimers(Clock::time_point limit);
  // For tests: called on every wait, under the wake mutex, right before the
  // thread blocks, with whether a wake is already pending. A wake() from
  // another thread can only take effect once the wait has started. The
  // observer must not call wake().
  void setWaitObserverForTesting(std::function<void(bool woken)> observer) {
    waitObserver_ = std::move(observer);
  }

  // Thread-safe. Makes a run() that is sleeping, for its next timer or for
  // external work, return from the wait at once. A wake before the wait
  // starts is kept, so the next wait returns at once.
  void wake() override;

  // Every Task coroutine frame links itself here while it is alive.
  struct Frame {
    Frame* prev = nullptr;
    Frame* next = nullptr;
    std::coroutine_handle<> handle;
  };
  void attach(Frame& frame);
  void detach(Frame& frame);
  size_t liveFrames() const { return liveFrames_; }

  // Destroys every live frame, newest first, without resuming it, and drops
  // queued steps and timers. For a run that can no longer finish: its
  // suspended frames and timers still hold engine values, so they must go
  // before the engine does.
  void abandon();

private:
  struct Timer {
    Clock::time_point deadline;
    uint64_t order = 0;
    std::chrono::milliseconds interval{0};
    bool repeat = false;
    std::function<void()> fire;
  };
  using TimerKey = std::pair<Clock::time_point, uint64_t>;
  enum class Macrotask { Timer, Completion };
  void schedule(uint64_t id, Timer& timer, Clock::time_point deadline);
  // Fires the first timer when it is due. Otherwise sleeps until it is due
  // or wake() is called. Returns after either.
  void fireOrWait();
  bool timerDue() const;
  void fireFirstTimer();
  // Sleeps until `until`, or without limit, unless woken. Consumes the wake.
  void waitForWake(std::optional<Clock::time_point> until);
  void resumeNext();
  struct MacrotaskChoice {
    Macrotask kind;
    bool contended;
  };
  // The next macrotask, or nullopt when no timer is due and no completion
  // waits. Section 4.5: when a due timer and a completion are both
  // available, the turn is contended, and contended turns alternate between
  // them, starting with the timer on the first contended turn of the run()
  // call. A turn with only one kind available runs that kind and does not
  // change the alternation. `timerNext` holds whose contended turn is next.
  std::optional<MacrotaskChoice> chooseMacrotask(RunControl& control, bool timerNext) const;
  void runMacrotask(RunControl& control, MacrotaskChoice choice, bool& timerNext);
  RunExit runCancelling(RunControl& control, CancelSnapshot cancel, bool timerNext);

  std::deque<std::coroutine_handle<>> ready_;
  std::function<bool()> pump_;
  std::unordered_map<uint64_t, Timer> timers_;
  std::map<TimerKey, uint64_t> due_;
  uint64_t nextTimerId_ = 1;
  uint64_t nextOrder_ = 1;
  std::optional<Clock::time_point> timerLimit_;
  std::mutex wakeMutex_;
  std::condition_variable wakeCv_;
  bool woken_ = false;
  std::function<void(bool)> waitObserver_;
  Frame* head_ = nullptr;
  Frame* tail_ = nullptr;
  size_t liveFrames_ = 0;
  [[no_unique_address]] ThreadOwner owner_;
};

// Suspends the current coroutine for one turn of the ready queue.
struct Tick {
  bool await_ready() const noexcept { return false; }
  void await_suspend(std::coroutine_handle<> h) const { Loop::current().post(h); }
  void await_resume() const noexcept {}
};

template <class T>
struct TaskState {
  std::optional<T> value;
  std::exception_ptr error;
  bool done = false;
  std::coroutine_handle<> continuation;

  void finish() {
    done = true;
    if (continuation) Loop::current().post(std::exchange(continuation, {}));
  }
};

template <>
struct TaskState<void> {
  std::exception_ptr error;
  bool done = false;
  std::coroutine_handle<> continuation;

  void finish() {
    done = true;
    if (continuation) Loop::current().post(std::exchange(continuation, {}));
  }
};

template <class T>
class Task;

namespace detail {

template <class T>
struct PromiseBase {
  // native-rules #1: shared by promise and task, no comment explains why unique fails
  std::shared_ptr<TaskState<T>> state = std::make_shared<TaskState<T>>();
  Loop* loop = &Loop::current();
  Loop::Frame frame;

  PromiseBase() = default;
  PromiseBase(const PromiseBase&) = delete;
  PromiseBase& operator=(const PromiseBase&) = delete;
  ~PromiseBase() { loop->detach(frame); }

  void link(std::coroutine_handle<> h) {
    frame.handle = h;
    loop->attach(frame);
  }
  std::suspend_never initial_suspend() noexcept { return {}; }
  std::suspend_never final_suspend() noexcept { return {}; }
  void unhandled_exception() {
    state->error = std::current_exception();
    state->finish();
  }
};

}  // namespace detail

template <class T>
class [[nodiscard]] Task {
public:
  struct promise_type : detail::PromiseBase<T> {
    Task get_return_object() {
      this->link(std::coroutine_handle<promise_type>::from_promise(*this));
      return Task(this->state);
    }
    template <class U>
    void return_value(U&& v) {
      this->state->value.emplace(std::forward<U>(v));
      this->state->finish();
    }
  };

  explicit Task(std::shared_ptr<TaskState<T>> s) : state_(std::move(s)) {}

  bool done() const { return state_->done; }

  auto operator co_await() const {
    struct Awaiter {
      std::shared_ptr<TaskState<T>> s;
      bool await_ready() const noexcept { return false; }
      void await_suspend(std::coroutine_handle<> h) {
        if (s->done) {
          Loop::current().post(h);
        } else {
          s->continuation = h;
        }
      }
      T await_resume() {
        if (s->error) std::rethrow_exception(s->error);
        return std::move(*s->value);
      }
    };
    return Awaiter{state_};
  }

  // Result of a finished task. Rethrows its exception.
  T get() const {
    if (state_->error) std::rethrow_exception(state_->error);
    return *state_->value;
  }

private:
  std::shared_ptr<TaskState<T>> state_;
};

template <>
class [[nodiscard]] Task<void> {
public:
  struct promise_type : detail::PromiseBase<void> {
    Task get_return_object() {
      this->link(std::coroutine_handle<promise_type>::from_promise(*this));
      return Task(this->state);
    }
    void return_void() { this->state->finish(); }
  };

  explicit Task(std::shared_ptr<TaskState<void>> s) : state_(std::move(s)) {}

  bool done() const { return state_->done; }

  auto operator co_await() const {
    struct Awaiter {
      std::shared_ptr<TaskState<void>> s;
      bool await_ready() const noexcept { return false; }
      void await_suspend(std::coroutine_handle<> h) {
        if (s->done) {
          Loop::current().post(h);
        } else {
          s->continuation = h;
        }
      }
      void await_resume() {
        if (s->error) std::rethrow_exception(s->error);
      }
    };
    return Awaiter{state_};
  }

  void get() const {
    if (state_->error) std::rethrow_exception(state_->error);
  }

private:
  std::shared_ptr<TaskState<void>> state_;
};

// A one-shot signal that coroutines can wait on. Waking posts every waiter.
class Signal {
public:
  struct Awaiter {
    Signal* s;
    bool await_ready() const noexcept { return false; }
    void await_suspend(std::coroutine_handle<> h) { s->waiters_.push_back(h); }
    void await_resume() const noexcept {}
  };
  Awaiter wait() { return Awaiter{this}; }
  void notifyAll() {
    while (!waiters_.empty()) {
      Loop::current().post(waiters_.front());
      waiters_.pop_front();
    }
  }
  bool hasWaiters() const { return !waiters_.empty(); }

private:
  std::deque<std::coroutine_handle<>> waiters_;
};

}  // namespace gr
