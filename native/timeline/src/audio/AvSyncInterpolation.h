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
};
struct AvSyncClick {
    double clockMs;
    std::uint64_t generation;
};
inline std::optional<AvSyncClick> interpolateAvSyncClick(std::span<const AvSyncSample> samples, double frame) {
    for (std::size_t i = 1; i < samples.size(); ++i) {
        const auto& a = samples[i - 1];
        const auto& b = samples[i];
        if (a.generation != b.generation || !(a.audible <= frame && frame < b.audible)) { continue; }
        if (b.clockMs <= a.clockMs) { return {}; }
        double ms = a.clockMs + (b.clockMs - a.clockMs) * (frame - a.audible) / (b.audible - a.audible);
        // A single sampled hold need not have a previous equal clock value.
        // Extrapolate from the running side of the anchor, rather than across it.
        if (a.held && !b.held && i + 1 < samples.size() && !samples[i + 1].held && samples[i + 1].generation == b.generation &&
            samples[i + 1].audible > b.audible) {
            const auto& c = samples[i + 1];
            ms = b.clockMs + (c.clockMs - b.clockMs) * (frame - b.audible) / (c.audible - b.audible);
        }
        return AvSyncClick{ms, a.generation};
    }
    return {};
}
} // namespace nt::audio
