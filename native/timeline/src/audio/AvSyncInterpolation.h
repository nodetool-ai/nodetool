#pragma once
#include <cstdint>
#include <optional>
#include <span>

namespace nt::audio {
struct AvSyncSample {
    double audible;
    double clockMs;
    std::uint64_t generation;
    bool held = false;
    std::int64_t anchorFrame = 0;
};
struct AvSyncClick {
    double clockMs;
    std::uint64_t generation;
};
inline std::optional<AvSyncClick> interpolateAvSyncClick(std::span<const AvSyncSample> samples, double frame) {
    // A device-change seek can hold the playhead while earlier PCM is still
    // audible. Fit only running samples from the anchor that rendered the click.
    const AvSyncSample* first = nullptr;
    const AvSyncSample* second = nullptr;
    std::int64_t anchor = -1;
    for (const auto& sample : samples) {
        if (sample.anchorFrame <= frame && sample.anchorFrame > anchor) {
            anchor = sample.anchorFrame;
        }
    }
    for (const auto& sample : samples) {
        if (sample.held || sample.anchorFrame != anchor) { continue; }
        if (!first || sample.generation != first->generation) {
            first = &sample;
            second = nullptr;
        } else if (sample.audible > (second ? second->audible : first->audible)) {
            if (second) { first = second; }
            second = &sample;
            if (frame < sample.audible) { break; }
        }
    }
    // The click can precede the first running tick after an anchor. The
    // mapping is linear there, so extrapolate from the running side of it.
    if (!first || !second || second->clockMs <= first->clockMs) { return {}; }
    const double ms = first->clockMs + (second->clockMs - first->clockMs) *
                      (frame - first->audible) / (second->audible - first->audible);
    return AvSyncClick{ms, first->generation};
}
} // namespace nt::audio
