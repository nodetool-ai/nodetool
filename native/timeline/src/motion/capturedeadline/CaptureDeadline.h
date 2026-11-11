#pragma once

namespace nt::capture {
constexpr long long kDeadlineMs = 60000;
enum class Decision { Pending, Cancelled, Error, Ready, TimedOut };

inline Decision decide(bool cancelled, bool error, bool ready, long long elapsedMs) {
    if (cancelled) {
        return Decision::Cancelled;
    }
    if (error) {
        return Decision::Error;
    }
    if (ready) {
        return Decision::Ready;
    }
    if (elapsedMs >= kDeadlineMs) {
        return Decision::TimedOut;
    }
    return Decision::Pending;
}

template <typename CancelProbe>
Decision decideAfterRender(CancelProbe&& cancelled, bool error, bool ready, long long elapsedMs) {
    return decide(cancelled(), error, ready, elapsedMs);
}
}
