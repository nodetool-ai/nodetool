// A runner's cancellation state (docs/plans/graph-runner-async-host.md,
// section 4.6). One mutex guards the run generation, the requested flag, the
// exit deadline and the immediate flag, so every reader sees them together:
// a requested cancellation always comes with its deadline. Readers take a
// snapshot and unlock before they forward a stop or wake the loop.
#pragma once

#include "kernel/task.h"

#include <chrono>
#include <cstdint>
#include <mutex>
#include <optional>

namespace gr {

class CancelState {
public:
  using Clock = std::chrono::steady_clock;

  // Worker. Starts the next run generation and returns it. The previous
  // run's request and deadline are cleared, unless interruptNow() was called.
  uint64_t beginRun();
  // Worker. Ends the current run. Later requests for it are ignored.
  void endRun();
  // Thread-safe. Requests cancellation of run `generation`, which must exit
  // by `deadline`. A repeated request keeps the earlier deadline. Returns
  // false, and changes nothing, when `generation` is not the running one.
  bool request(uint64_t generation, Clock::time_point deadline);
  // Thread-safe. Requests an immediate stop of the current run, and of any
  // later load or run. Used when the runner is destroyed.
  void interruptNow();

  CancelSnapshot snapshot() const;
  // The current run's cancellation, or nullopt while it is not being
  // cancelled. An immediate stop applies to every generation.
  std::optional<CancelSnapshot> cancellation(uint64_t generation) const;
  // The engine interrupt handler's test: an immediate stop, or a requested
  // cancellation whose deadline passed.
  bool interruptDue() const;
  // A requested cancellation of the current run, or an immediate stop.
  bool cancelled() const;

private:
  mutable std::mutex mutex_;
  uint64_t generation_ = 0;
  bool active_ = false;
  bool requested_ = false;
  bool immediate_ = false;
  std::optional<Clock::time_point> deadline_;
};

}  // namespace gr
