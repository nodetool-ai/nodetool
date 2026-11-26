#pragma once

// Real-time-safe per-block / per-sample parameter smoother for audio effects
// and instruments. Bounds sample-to-sample steps on knob moves and abrupt
// automation jumps while passing continuous low-slope sample-rate ramps through
// without lag.
// Thread affinity: owned by a single BlockProcessor and touched on the render
// thread (serialized by MixRenderLease). Never allocates, locks, or calls the OS.

#include <algorithm>
#include <cmath>

namespace nt::audio {

class ParameterSmoother {
public:
    static constexpr double kDefaultTimeMs = 5.0;

    void prepare(double sampleRate, double timeMs = kDefaultTimeMs, double directThreshold = 0.0) noexcept {
        const double sr = (std::isfinite(sampleRate) && sampleRate > 0.0) ? sampleRate : 48000.0;
        const double ms = (std::isfinite(timeMs) && timeMs > 0.0) ? timeMs : kDefaultTimeMs;
        rampFrames_ = std::max(1, static_cast<int>(std::llround(sr * ms / 1000.0)));
        directThreshold_ = std::max(0.0, directThreshold);
    }

    void snap(double value) noexcept {
        if (!std::isfinite(value)) { return; }
        current_ = value;
        target_ = value;
        step_ = 0.0;
        remaining_ = 0;
        initialized_ = true;
    }

    void snapToTarget() noexcept {
        if (!initialized_) { return; }
        current_ = target_;
        step_ = 0.0;
        remaining_ = 0;
    }

    // Returns true if the active value changed immediately (snapped without ramping).
    bool setTarget(double value) noexcept {
        if (!std::isfinite(value)) { return false; }
        if (!initialized_) {
            snap(value);
            return true;
        }
        if (value == target_) { return false; }
        target_ = value;
        const double delta = target_ - current_;
        if (remaining_ == 0 && std::abs(delta) <= std::max(directThreshold_, 1e-12)) {
            current_ = target_;
            step_ = 0.0;
            return true;
        }
        remaining_ = rampFrames_;
        step_ = delta / static_cast<double>(remaining_);
        return false;
    }

    [[nodiscard]] double next() noexcept {
        if (remaining_ > 0) {
            --remaining_;
            if (remaining_ == 0) {
                current_ = target_;
                step_ = 0.0;
            } else {
                current_ += step_;
            }
        }
        return current_;
    }

    [[nodiscard]] double current() const noexcept { return current_; }
    [[nodiscard]] double target() const noexcept { return target_; }
    [[nodiscard]] bool smoothing() const noexcept { return remaining_ > 0; }
    [[nodiscard]] int rampFrames() const noexcept { return rampFrames_; }

private:
    double current_ = 0.0;
    double target_ = 0.0;
    double step_ = 0.0;
    double directThreshold_ = 0.0;
    int rampFrames_ = 240;
    int remaining_ = 0;
    bool initialized_ = false;
};

}  // namespace nt::audio
