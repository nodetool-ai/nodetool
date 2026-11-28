#pragma once
// The render thread's visual clock (realtime design 8, D7c to D7e, and 9.7).
// The picture does not follow the audio position directly, because the
// interpolation between device callbacks jitters (F22). The clock advances by
// whole refresh periods and removes a small part of its error against the
// audio position predicted for each presentation.
#include <cstdint>

namespace nt::realtime {

// D7d: the refresh period is measured, never assumed. The first estimate is
// the display mode's period. Each interval between two paced acquires (the
// `Fifo` surface returns a target once per refresh) that is close to a whole
// number of periods refines it. Render thread only.
class RefreshEstimator {
public:
    // A mode period outside (0, 1] s falls back to 1/60 s.
    explicit RefreshEstimator(double modePeriodSeconds) noexcept;

    // The monotonic time of a paced acquire. Returns false when the interval
    // since the last call was not used: the first call, a non-finite or
    // backward time, an interval of more than 8 periods, or one that is not
    // within 10% of a whole number of periods.
    bool observe(double acquireSeconds) noexcept;
    double period() const noexcept { return m_period; }
    std::uint64_t samples() const noexcept { return m_samples; }
    // An idle gap or a reconfigured surface breaks the interval chain.
    void breakChain() noexcept { m_hasLast = false; }

private:
    double m_period;
    double m_last = 0;
    bool m_hasLast = false;
    std::uint64_t m_samples = 0;
};

struct VisualClockOptions {
    double correctionFraction = 0.05; // Part of the error removed each frame (D7c step 4).
    double latencyOffsetSeconds = 0;  // D7e: the host's offset for the output device.
};

// One frame of the render loop, read after the acquire (section 9.3).
struct VisualFrame {
    double acquireSeconds = 0;   // monotonic time after the acquire
    double predictedSeconds = 0; // audio position predicted for presentationTime(acquireSeconds),
                                 // or elapsed monotonic time when no audio device runs (D7b)
};

struct VisualTick {
    double seconds = 0;         // the session time this frame shows
    std::uint64_t periods = 0;  // refresh periods since the last active frame, 0 on an anchor
    bool anchored = false;      // the clock was set to the prediction
    bool corrected = false;     // the error exceeded half a period and was removed in one step
    bool rejected = false;      // the observation was not finite; the clock did not change
};

// The visual clock of D7c. Render thread only.
//  1. A play, reset, device change or the first active frame after an idle
//     skip anchors the clock to the prediction (reanchor() or idle()).
//  2. Each consecutive active frame advances it by k refresh periods, where k
//     is the count of periods since the last active frame. k > 1 counts k - 1
//     missed refreshes (section 9.7).
//  3. The error is the prediction minus the advanced time.
//  4. A small part of the error is removed each frame.
//  5. An error over half a period is removed in one step and counted.
class VisualClock {
public:
    explicit VisualClock(double modePeriodSeconds, VisualClockOptions options = {}) noexcept;

    // D7e: the presentation time of a frame is its acquire time plus one
    // refresh period plus the host's latency offset.
    double presentationTime(double acquireSeconds) const noexcept {
        return acquireSeconds + m_refresh.period() + m_options.latencyOffsetSeconds;
    }
    VisualTick tick(const VisualFrame& frame) noexcept;
    // Play, reset or a device change: the next tick anchors.
    void reanchor() noexcept { m_anchored = false; }
    // A frame without work presented nothing: the next active frame anchors
    // instead of advancing by the skipped periods (9.4, F51).
    void idle() noexcept {
        m_anchored = false;
        m_refresh.breakChain();
    }
    void setLatencyOffset(double seconds) noexcept;

    double period() const noexcept { return m_refresh.period(); }
    double seconds() const noexcept { return m_seconds; }
    std::uint64_t corrections() const noexcept { return m_corrections; }
    std::uint64_t missedRefreshes() const noexcept { return m_missed; }

private:
    VisualClockOptions m_options;
    RefreshEstimator m_refresh;
    double m_seconds = 0;
    double m_lastAcquire = 0;
    bool m_anchored = false;
    std::uint64_t m_corrections = 0;
    std::uint64_t m_missed = 0;
};

} // namespace nt::realtime
