// Timed shutdown of the process-wide lanes that run native host jobs
// (docs/plans/graph-runner-async-host.md, sections 4.4 and 4.10).
//
// The lanes outlive every GraphRunner. A process that wants its lane threads
// gone before it exits calls shutdownHostLanes() once its runners are
// destroyed. Nothing calls it implicitly, and no destructor in the library
// ends the process.
#pragma once

#include <chrono>
#include <cstddef>
#include <memory>

namespace gr {

enum class HostShutdownStatus {
  // Every lane thread exited and was joined.
  Complete,
  // The deadline passed while a lane thread was still running a job.
  TimedOut,
};

// Keeps lanes that did not shut down in time alive: their executor state,
// their thread objects and the jobs still running on them, with everything
// those jobs own. The process keeps its own reference, so dropping this
// handle destroys nothing, and normal static teardown never destroys a lane
// whose thread still runs. The caller either retries or ends the process
// explicitly, for example with std::quick_exit.
// native-rules #9: retried from any thread, no thread-safety comment
class HostLaneSupervisor {
public:
  struct State;
  explicit HostLaneSupervisor(std::shared_ptr<State> state);
  ~HostLaneSupervisor();
  HostLaneSupervisor(const HostLaneSupervisor&) = delete;
  HostLaneSupervisor& operator=(const HostLaneSupervisor&) = delete;

  // Waits again until `deadline` for the remaining threads to exit, and
  // joins those that did.
  HostShutdownStatus retry(std::chrono::steady_clock::time_point deadline);
  // Lane threads not joined yet.
  size_t liveThreads() const;

private:
  std::shared_ptr<State> state_;
};

struct HostShutdown {
  HostShutdownStatus status = HostShutdownStatus::Complete;
  // Set when the status is TimedOut.
  std::shared_ptr<HostLaneSupervisor> supervisor;
};

// Shuts the process lanes down: stops admission, so later submissions are
// rejected with an AbortError, and hands each lane's reaper thread the
// cancellation of queued jobs and a stop request for running jobs, so no
// job code runs on the calling thread. Then waits until `deadline` for the
// lane threads to exit. A thread confirms its exit after its C++
// thread_locals are destroyed, and only such threads are joined: the wait is
// never a join. Destructors the C library runs later in thread exit, such as
// pthread key destructors, are outside the deadline. Complete when the lanes
// were never used, or were already shut down.
HostShutdown shutdownHostLanes(std::chrono::steady_clock::time_point deadline);

}  // namespace gr
