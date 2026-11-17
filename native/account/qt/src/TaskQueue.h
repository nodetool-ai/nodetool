// One thread that runs posted tasks in order, shared by the account
// service's Qt classes.
#pragma once

#include <condition_variable>
#include <deque>
#include <functional>
#include <mutex>
#include <thread>

namespace nodetool::account::qt::detail {

// Thread affinity: thread-safe. `mutex_` guards the queue and `stopping_`.
// The destructor stops the thread and drops the tasks that did not start.
class TaskQueue {
public:
  TaskQueue() : thread_([this] { run(); }) {}
  TaskQueue(const TaskQueue&) = delete;
  TaskQueue& operator=(const TaskQueue&) = delete;
  ~TaskQueue() {
    {
      const std::lock_guard lock(mutex_);
      stopping_ = true;
    }
    wake_.notify_all();
    thread_.join();
  }

  void post(std::function<void()> task) {
    {
      const std::lock_guard lock(mutex_);
      queue_.push_back(std::move(task));
    }
    wake_.notify_one();
  }

private:
  void run() {
    for (;;) {
      std::function<void()> task;
      {
        std::unique_lock lock(mutex_);
        wake_.wait(lock, [this] { return stopping_ || !queue_.empty(); });
        if (stopping_) {
          return;
        }
        task = std::move(queue_.front());
        queue_.pop_front();
      }
      task();
    }
  }

  std::mutex mutex_;
  std::condition_variable wake_;
  std::deque<std::function<void()>> queue_;
  bool stopping_ = false;
  // Declared last, so it starts after the members it reads.
  std::thread thread_;
};

} // namespace nodetool::account::qt::detail
