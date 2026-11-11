#pragma once

// Keeps macOS from napping the process (App Nap, timer coalescing) while a
// measured run is in progress. A background-mode run is never frontmost, so
// without an activity the system may throttle its rendering. No-op elsewhere.

#include <memory>

namespace nt {

class ProcessActivity {
public:
    // Begins a user-initiated, latency-critical activity with `reason`.
    explicit ProcessActivity(const char* reason);
    ~ProcessActivity();
    ProcessActivity(const ProcessActivity&) = delete;
    ProcessActivity& operator=(const ProcessActivity&) = delete;

private:
    void* m_token = nullptr;  // id<NSObject> on macOS
};

}  // namespace nt
