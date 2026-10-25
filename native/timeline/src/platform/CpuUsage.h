#pragma once

// CPU time counters for the bench: the whole process and single threads, so
// the bench can separate the decode work zero copy must remove from the GUI
// and render threads.

#include <cstdint>

namespace nt::cpu {

// User plus system CPU time of the whole process, in nanoseconds; -1 when the
// query fails.
int64_t processNs();
// A handle for the calling thread, for threadNs() from any thread.
unsigned currentThread();
// User plus system CPU time of a thread from currentThread(); -1 when the
// query fails (the thread is gone, or the handle is 0).
int64_t threadNs(unsigned thread);

// The calling thread's QoS class ("user-interactive", "user-initiated",
// "default", "utility", "background" or "unspecified").
const char* currentThreadQos();
// The process's nice value.
int processNice();

}  // namespace nt::cpu
