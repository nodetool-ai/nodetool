#include "kernel/task.h"

namespace gr {

Loop& Loop::current() {
  thread_local Loop loop;
  return loop;
}

void Loop::attach(Frame& frame) {
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
  (frame.prev ? frame.prev->next : head_) = frame.next;
  (frame.next ? frame.next->prev : tail_) = frame.prev;
  frame.prev = frame.next = nullptr;
  frame.handle = {};
  --liveFrames_;
}

void Loop::abandon() {
  ready_.clear();
  clearTimers();
  // Destroying a frame runs its locals' destructors and detaches it.
  while (tail_) tail_->handle.destroy();
  ready_.clear();
}

void Loop::run(const std::function<bool()>& stopWaiting) {
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

uint64_t Loop::setTimer(std::chrono::milliseconds delay,
                        std::function<void()> fire, bool repeat) {
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
  auto it = timers_.find(id);
  if (it == timers_.end()) return false;
  due_.erase(TimerKey{it->second.deadline, it->second.order});
  timers_.erase(it);
  return true;
}

void Loop::clearTimers() {
  due_.clear();
  // A timer's callback may own engine values; release them outside the map.
  auto dropped = std::move(timers_);
  timers_.clear();
  dropped.clear();
  timerLimit_.reset();
}

void Loop::limitTimers(Clock::time_point limit) {
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
  auto first = due_.begin();
  const auto now = Clock::now();
  if (first->first.first > now) {
    std::unique_lock lock(wakeMutex_);
    wakeCv_.wait_until(lock, first->first.first, [this] { return woken_; });
    woken_ = false;
    return;
  }
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
