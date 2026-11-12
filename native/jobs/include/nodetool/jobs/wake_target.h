// What a RunMailbox wakes when a result arrives or admission capacity was
// released: the loop of the thread that owns the run, such as the graph
// runner's Loop (native/graph-runner/src/kernel/task.h).
#pragma once

namespace nodetool::jobs {

// Thread affinity: thread-safe. wake() is called from any thread.
//
// Lock order: RunMailbox calls wake() while it holds its own mutex, so
// close() cannot drop the target during the call. An implementation may
// briefly take its own mutex, which makes the order the mailbox mutex, then
// the target's mutex. It must not wait on anything else, call into the
// mailbox, or take a lock that is held anywhere while a mailbox method is
// called.
//
// Ownership: borrowed. The target must stay alive until every mailbox that
// holds it was closed.
class WakeTarget {
public:
  // Makes the owning thread's next wait return at once. A wake before the
  // wait starts is kept.
  virtual void wake() = 0;

protected:
  WakeTarget() = default;
  WakeTarget(const WakeTarget&) = default;
  WakeTarget& operator=(const WakeTarget&) = default;
  // Not owned through this interface.
  ~WakeTarget() = default;
};

}  // namespace nodetool::jobs
