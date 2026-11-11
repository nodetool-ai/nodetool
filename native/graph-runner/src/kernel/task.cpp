#include "kernel/task.h"

namespace gr {

Loop& Loop::current() {
  // native-rules #14: thread_local Loop::current() is hidden per-thread global state
  thread_local Loop loop;
  return loop;
}

void Loop::attach(Frame& frame) {
  owner_.check("gr::Loop");
  frame.prev = tail_;
  frame.next = nullptr;
  if (tail_) {
    tail_->next = &frame;
  } else {
    head_ = &frame;
  }
  tail_ = &frame;
  ++liveFrames_;
}

void Loop::detach(Frame& frame) {
  if (!frame.handle) return;
  owner_.check("gr::Loop");
  (frame.prev ? frame.prev->next : head_) = frame.next;
  (frame.next ? frame.next->prev : tail_) = frame.prev;
  frame.prev = frame.next = nullptr;
  frame.handle = {};
  --liveFrames_;
}

void Loop::abandon() {
  owner_.check("gr::Loop");
  ready_.clear();
  clearTimers();
  // Destroying a frame runs its locals' destructors and detaches it.
  while (tail_) tail_->handle.destroy();
  ready_.clear();
}

void Loop::run(const std::function<bool()>& stopWaiting) {
  owner_.check("gr::Loop");
  for (;;) {
    if (!ready_.empty()) {
      auto h = ready_.front();
      ready_.pop_front();
      h.resume();
      if (pump_) pump_();
      continue;
    }
    if (pump_ && pump_()) continue;
    if (!ready_.empty()) continue;
    if (timers_.empty() || (stopWaiting && stopWaiting())) return;
    fireOrWait();
    if (pump_) pump_();
  }
}

RunExit Loop::run(RunControl& control) {
  owner_.check("gr::Loop");
  constexpr size_t kAll = SIZE_MAX;
  bool timerNext = true;
  for (;;) {
    if (auto cancel = control.cancellation()) return runCancelling(control, *cancel, timerNext);
    if (!ready_.empty()) {
      resumeNext();
      control.drainMicrotasks(kAll);
      continue;
    }
    if (control.drainMicrotasks(kAll) > 0 || !ready_.empty()) continue;
    if (control.done()) return RunExit::Done;
    const auto choice = chooseMacrotask(control, timerNext);
    // The queries above can race a cancellation. Check after them, right
    // before the macrotask or the wait.
    if (auto cancel = control.cancellation()) return runCancelling(control, *cancel, timerNext);
    if (choice) {
      runMacrotask(control, *choice, timerNext);
      control.drainMicrotasks(kAll);
      continue;
    }
    const bool timers = !due_.empty();
    if (!timers && !control.externalWork()) return RunExit::Stalled;
    if (auto cancel = control.cancellation()) return runCancelling(control, *cancel, timerNext);
    waitForWake(timers ? std::optional(due_.begin()->first.first) : std::nullopt);
    control.drainMicrotasks(kAll);
  }
}

RunExit Loop::runCancelling(RunControl& control, CancelSnapshot cancel, bool timerNext) {
  control.onCancellation(cancel);
  // Takes a fresh snapshot, since interruptNow() can move the deadline
  // closer, and reports whether the deadline passed.
  auto expired = [&] {
    if (auto latest = control.cancellation();
        latest && (latest->deadline != cancel.deadline || latest->immediate != cancel.immediate)) {
      cancel = *latest;
      control.onCancellation(cancel);
    }
    return cancel.expired(Clock::now());
  };
  // At most kSliceMicrotasks microtasks. False when the deadline passed.
  auto drainSlice = [&] {
    for (size_t ran = 0; ran < kSliceMicrotasks; ++ran) {
      if (expired()) return false;
      if (control.drainMicrotasks(1) == 0) break;
    }
    return !expired();
  };
  for (;;) {
    if (expired()) return RunExit::Deadline;
    size_t steps = 0;
    for (; steps < kSliceSteps && !ready_.empty(); ++steps) {
      if (expired()) return RunExit::Deadline;
      resumeNext();
      if (!drainSlice()) return RunExit::Deadline;
    }
    if (steps == 0 && !drainSlice()) return RunExit::Deadline;
    const bool idle = ready_.empty() && !control.microtasksPending();
    if (idle && control.done()) return RunExit::Done;
    if (const auto choice = chooseMacrotask(control, timerNext)) {
      if (expired()) return RunExit::Deadline;
      runMacrotask(control, *choice, timerNext);
      continue;
    }
    if (!idle) continue;
    const bool timers = !due_.empty();
    if (!timers && !control.externalWork()) return RunExit::Stalled;
    if (expired()) return RunExit::Deadline;
    std::optional<Clock::time_point> until = cancel.deadline;
    if (timers && (!until || due_.begin()->first.first < *until)) until = due_.begin()->first.first;
    waitForWake(until);
  }
}

std::optional<Loop::MacrotaskChoice> Loop::chooseMacrotask(RunControl& control, bool timerNext) const {
  const bool timer = timerDue();
  const bool completion = control.completionsPending();
  if (timer && completion) {
    return MacrotaskChoice{timerNext ? Macrotask::Timer : Macrotask::Completion, true};
  }
  if (timer) return MacrotaskChoice{Macrotask::Timer, false};
  if (completion) return MacrotaskChoice{Macrotask::Completion, false};
  return std::nullopt;
}

void Loop::runMacrotask(RunControl& control, MacrotaskChoice choice, bool& timerNext) {
  if (choice.contended) timerNext = choice.kind == Macrotask::Completion;
  if (choice.kind == Macrotask::Timer) {
    fireFirstTimer();
  } else {
    control.dispatchCompletion();
  }
}

void Loop::resumeNext() {
  auto h = ready_.front();
  ready_.pop_front();
  h.resume();
}

uint64_t Loop::setTimer(std::chrono::milliseconds delay,
                        std::function<void()> fire, bool repeat) {
  owner_.check("gr::Loop");
  const uint64_t id = nextTimerId_++;
  const auto deadline = Clock::now() + delay;
  if (timerLimit_ && deadline > *timerLimit_) return id;
  Timer& timer = timers_[id];
  timer.interval = delay;
  timer.repeat = repeat;
  timer.fire = std::move(fire);
  schedule(id, timer, deadline);
  return id;
}

void Loop::schedule(uint64_t id, Timer& timer, Clock::time_point deadline) {
  timer.deadline = deadline;
  timer.order = nextOrder_++;
  due_.emplace(TimerKey{deadline, timer.order}, id);
}

bool Loop::clearTimer(uint64_t id) {
  owner_.check("gr::Loop");
  auto it = timers_.find(id);
  if (it == timers_.end()) return false;
  due_.erase(TimerKey{it->second.deadline, it->second.order});
  timers_.erase(it);
  return true;
}

void Loop::clearTimers() {
  owner_.check("gr::Loop");
  due_.clear();
  // A timer's callback may own engine values; release them outside the map.
  auto dropped = std::move(timers_);
  timers_.clear();
  dropped.clear();
  timerLimit_.reset();
}

void Loop::limitTimers(Clock::time_point limit) {
  owner_.check("gr::Loop");
  timerLimit_ = limit;
  while (!due_.empty() && std::prev(due_.end())->first.first > limit) {
    clearTimer(std::prev(due_.end())->second);
  }
}

void Loop::wake() {
  {
    std::lock_guard lock(wakeMutex_);
    woken_ = true;
  }
  wakeCv_.notify_all();
}

void Loop::fireOrWait() {
  if (!timerDue()) {
    waitForWake(due_.begin()->first.first);
    return;
  }
  fireFirstTimer();
}

bool Loop::timerDue() const {
  return !due_.empty() && due_.begin()->first.first <= Clock::now();
}

void Loop::waitForWake(std::optional<Clock::time_point> until) {
  std::unique_lock lock(wakeMutex_);
  if (waitObserver_) waitObserver_(woken_);
  if (until) {
    wakeCv_.wait_until(lock, *until, [this] { return woken_; });
  } else {
    wakeCv_.wait(lock, [this] { return woken_; });
  }
  woken_ = false;
}

void Loop::fireFirstTimer() {
  auto first = due_.begin();
  const uint64_t id = first->second;
  due_.erase(first);
  // The callback may clear this timer, or every timer, while it runs.
  std::function<void()> fire = std::move(timers_.at(id).fire);
  fire();
  auto it = timers_.find(id);
  if (it == timers_.end()) return;
  if (!it->second.repeat) {
    timers_.erase(it);
    return;
  }
  const auto deadline = Clock::now() + it->second.interval;
  if (timerLimit_ && deadline > *timerLimit_) {
    timers_.erase(it);
    return;
  }
  it->second.fire = std::move(fire);
  schedule(id, it->second, deadline);
}

}  // namespace gr
