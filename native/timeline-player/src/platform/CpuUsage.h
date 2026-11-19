#pragma once

// CPU time counters for the bench: the whole process and single threads, so
// the bench can separate the decode work zero copy must remove from the GUI
// and render threads.

#include <cstdint>
#if defined(__linux__)
#include <functional>
#endif

namespace nt::cpu {

// User plus system CPU time of the whole process, in nanoseconds; -1 when the
// query fails.
int64_t processNs();
// A handle for the calling thread, for threadNs() from any thread.
unsigned currentThread();
// User plus system CPU time of a thread from currentThread(); -1 when the
// query fails (the thread is gone, or the handle is 0).
int64_t threadNs(unsigned thread);
// Threads registered by currentThread() and still alive (tests). A thread
// registers once; its entry and any owned handle go when it ends.
int registeredThreads();

#if defined(__linux__)
namespace testing {
// Replaces the native query under the registration lock. Empty restores it.
// Install only while no samples are running. The argument identifies the
// native pthread, so tests can detect attribution to the wrong registration.
using NativeQuery = std::function<int64_t(std::uintptr_t)>;
void setNativeQuery(NativeQuery query);
}  // namespace testing
#endif

// The calling thread's QoS class ("user-interactive", "user-initiated",
// "default", "utility", "background" or "unspecified").
const char* currentThreadQos();
// The process's nice value.
int processNice();

}  // namespace nt::cpu
