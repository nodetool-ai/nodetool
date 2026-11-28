#include "nodetool/realtime/visual_clock.h"

#include <algorithm>
#include <cmath>

namespace nt::realtime {
namespace {
constexpr double kDefaultPeriod = 1.0 / 60;
constexpr double kMaxPeriods = 8;
constexpr double kTolerance = 0.1; // of one period
constexpr double kWeight = 1.0 / 32;
} // namespace

RefreshEstimator::RefreshEstimator(double modePeriodSeconds) noexcept
    : m_period(std::isfinite(modePeriodSeconds) && modePeriodSeconds > 0 && modePeriodSeconds <= 1 ? modePeriodSeconds
                                                                                                    : kDefaultPeriod) {}

bool RefreshEstimator::observe(double acquireSeconds) noexcept {
    if (!std::isfinite(acquireSeconds)) { return false; }
    const bool hadLast = m_hasLast;
    const double interval = acquireSeconds - m_last;
    m_last = acquireSeconds;
    m_hasLast = true;
    if (!hadLast || interval <= 0) { return false; }
    const double periods = std::round(interval / m_period);
    if (periods < 1 || periods > kMaxPeriods) { return false; }
    const double sample = interval / periods;
    if (std::abs(sample - m_period) > kTolerance * m_period) { return false; }
    m_period += kWeight * (sample - m_period);
    ++m_samples;
    return true;
}

VisualClock::VisualClock(double modePeriodSeconds, VisualClockOptions options) noexcept
    : m_options(options), m_refresh(modePeriodSeconds) {
    if (!std::isfinite(m_options.correctionFraction) || m_options.correctionFraction <= 0 ||
        m_options.correctionFraction >= 1) {
        m_options.correctionFraction = VisualClockOptions{}.correctionFraction;
    }
    setLatencyOffset(m_options.latencyOffsetSeconds);
}

void VisualClock::setLatencyOffset(double seconds) noexcept {
    m_options.latencyOffsetSeconds = std::isfinite(seconds) && std::abs(seconds) <= 1 ? seconds : 0;
}

VisualTick VisualClock::tick(const VisualFrame& frame) noexcept {
    VisualTick result;
    if (!std::isfinite(frame.acquireSeconds) || !std::isfinite(frame.predictedSeconds) ||
        (m_anchored && frame.acquireSeconds <= m_lastAcquire)) {
        result.rejected = true;
        result.seconds = m_seconds;
        return result;
    }
    m_refresh.observe(frame.acquireSeconds);
    const double period = m_refresh.period();
    if (!m_anchored) {
        m_seconds = frame.predictedSeconds;
        m_lastAcquire = frame.acquireSeconds;
        m_anchored = true;
        result.seconds = m_seconds;
        result.anchored = true;
        return result;
    }
    const double elapsed = (frame.acquireSeconds - m_lastAcquire) / period;
    const auto periods = static_cast<std::uint64_t>(std::max(1.0, std::round(elapsed)));
    m_lastAcquire = frame.acquireSeconds;
    m_missed += periods - 1;
    const double advanced = m_seconds + static_cast<double>(periods) * period;
    const double error = frame.predictedSeconds - advanced;
    if (std::abs(error) > period / 2) {
        m_seconds = frame.predictedSeconds;
        ++m_corrections;
        result.corrected = true;
    } else {
        m_seconds = advanced + m_options.correctionFraction * error;
    }
    result.seconds = m_seconds;
    result.periods = periods;
    return result;
}

} // namespace nt::realtime
