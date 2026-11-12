#pragma once
#include <cmath>
#include <cstdint>
#include <stdexcept>

namespace nt::spike {
// Render thread only. RT-D7c preparation: the host supplies the predicted
// presentation-time audio/monotonic position and its measured refresh period.
class VisualClock {
public:
    explicit VisualClock(double correctionFraction) : fraction_(correctionFraction) {
        if (!std::isfinite(fraction_) || fraction_ <= 0 || fraction_ >= 1) {
            throw std::invalid_argument("Visual clock correction fraction must be between zero and one");
        }
    }

    // play/reset/device-change/idle-resume must pass reanchor=true. The spike
    // leaves refresh estimation and presentation latency measurement to WP01.
    double tick(double predictedSeconds, double periodSeconds,
                std::uint64_t elapsedPeriods, bool reanchor = false) {
        if (!std::isfinite(predictedSeconds) || !std::isfinite(periodSeconds) ||
            periodSeconds <= 0 || elapsedPeriods == 0) {
            throw std::invalid_argument("Invalid visual clock observation");
        }
        if (!anchored_ || reanchor) {
            seconds_ = predictedSeconds;
            anchored_ = true;
            return seconds_;
        }
        const double advanced = seconds_ + static_cast<double>(elapsedPeriods) * periodSeconds;
        const double error = predictedSeconds - advanced;
        if (!std::isfinite(advanced) || !std::isfinite(error)) {
            throw std::invalid_argument("Visual clock observation overflowed");
        }
        if (std::abs(error) > periodSeconds / 2) {
            seconds_ = predictedSeconds;
            ++corrections_;
        } else {
            seconds_ = advanced + fraction_ * error;
        }
        return seconds_;
    }

    std::uint64_t corrections() const { return corrections_; }
private:
    double fraction_;
    double seconds_ = 0;
    std::uint64_t corrections_ = 0;
    bool anchored_ = false;
};
}
