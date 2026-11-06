#include "CaptureDeadline.h"
#include <cstdio>

int main() {
    using nt::capture::Decision;
    using nt::capture::decide;
    int failures = 0;
    const auto check = [&](bool condition, const char* message) {
        if (!condition) { std::fprintf(stderr, "%s\n", message); ++failures; }
    };
    check(decide(false, false, false, 15000) == Decision::Pending, "15 s must remain pending");
    check(decide(false, false, true, 61000) == Decision::Ready, "ready frame wins over deadline");
    check(decide(true, true, true, 61000) == Decision::Cancelled, "cancellation wins after render");
    check(decide(false, true, true, 61000) == Decision::Error, "render error wins over ready and timeout");
    check(decide(false, false, false, 60000) == Decision::TimedOut, "pending frame times out at deadline");
    bool cancelledDuringRender = false;
    int probes = 0;
    const auto cancelled = [&] { ++probes; return cancelledDuringRender; };
    check(!cancelled(), "initial cancellation probe");
    cancelledDuringRender = true;
    const auto afterRender = nt::capture::decideAfterRender(cancelled, false, true, 61000);
    check(afterRender == Decision::Cancelled && probes == 2, "cancel during render wins over ready and timeout");
    return failures == 0 ? 0 : 1;
}
