#pragma once
// Waveform peaks at more than one resolution (docs/MUSIC-MODE.md AU-7).
//
// A take longer than LONG_TAKE_MS keeps its finest level at PEAKS_PER_MINUTE
// peaks per started minute, and coarser levels that each take the maximum of
// PEAK_LEVEL_FACTOR peaks of the level below. A wide view of a long take then
// draws from a coarse level and never reads the fine one. Takes up to a
// minute keep the one level of FULL_ASSET_PEAK_COUNT peaks that the server
// computes, so the conformance check against it is unchanged.
#include <algorithm>
#include <cmath>
#include <cstddef>
#include <utility>
#include <vector>

namespace nt::ui {

inline constexpr int FULL_ASSET_PEAK_COUNT = 2000;
inline constexpr double LONG_TAKE_MS = 60000;
inline constexpr int PEAKS_PER_MINUTE = 2000;
inline constexpr int MAX_FINE_PEAKS = 24000;  // 12 minutes at the finest level
inline constexpr int PEAK_LEVEL_FACTOR = 8;
// A level with more peaks than this gets a coarser level above it.
inline constexpr size_t COARSEST_LEVEL_PEAKS = 1000;

struct AudioPeaks {
    std::vector<float> peaks;                // the finest level
    std::vector<std::vector<float>> coarse;  // each level PEAK_LEVEL_FACTOR times coarser than the one before
    double durationMs = 0;

    size_t levelCount() const { return 1 + coarse.size(); }
    const std::vector<float>& level(size_t i) const { return i == 0 ? peaks : coarse[i - 1]; }
};

// The finest level's peak count for a source of `durationMs`.
inline int finePeakCount(double durationMs) {
    if (!(durationMs > LONG_TAKE_MS)) return FULL_ASSET_PEAK_COUNT;
    const double minutes = std::ceil(durationMs / 60000.0);
    return static_cast<int>(std::min<double>(MAX_FINE_PEAKS, minutes * PEAKS_PER_MINUTE));
}

// The levels above `fine`: empty for a take up to a minute. A level is
// reduced further only while it has more than COARSEST_LEVEL_PEAKS peaks and
// divides evenly, so that a peak always spans whole peaks of the level below.
inline std::vector<std::vector<float>> reducePeakLevels(const std::vector<float>& fine, double durationMs) {
    std::vector<std::vector<float>> levels;
    if (!(durationMs > LONG_TAKE_MS)) return levels;
    const std::vector<float>* below = &fine;
    while (below->size() > COARSEST_LEVEL_PEAKS && below->size() % PEAK_LEVEL_FACTOR == 0) {
        std::vector<float> next(below->size() / PEAK_LEVEL_FACTOR, 0.0f);
        for (size_t j = 0; j < next.size(); ++j) {
            float max = 0;
            for (size_t k = 0; k < PEAK_LEVEL_FACTOR; ++k) max = std::max(max, (*below)[j * PEAK_LEVEL_FACTOR + k]);
            next[j] = max;
        }
        levels.push_back(std::move(next));
        below = &levels.back();
    }
    return levels;
}

// The coarsest level that still has at least `peakCount` peaks across the
// window [inPointMs, outPointMs] of the source, so that a drawn bar never
// spans less than one peak. The finest level when none does.
inline size_t choosePeakLevel(const AudioPeaks& audio, double inPointMs, double outPointMs, int peakCount) {
    if (audio.durationMs <= 0 || peakCount <= 0) return 0;
    const double inFrac = std::clamp(inPointMs / audio.durationMs, 0.0, 1.0);
    const double outFrac = std::clamp(outPointMs / audio.durationMs, 0.0, 1.0);
    const double window = std::max(0.0, outFrac - inFrac);
    for (size_t i = audio.levelCount(); i-- > 1;) {
        if (static_cast<double>(audio.level(i).size()) * window >= peakCount) return i;
    }
    return 0;
}

}  // namespace nt::ui
