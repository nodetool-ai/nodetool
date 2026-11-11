#pragma once

// Scene edit detection: find the hard cuts in a clip. A port of FilmCraft's
// crates/render/src/scene.rs (see licenses/FilmCraft-MIT.txt).
//
// Each frame is reduced to a Signature: a 32x18 grid of mean luma and a 16-bin
// histogram per RGB channel. The difference of two consecutive frames mixes the
// histogram distance (half the L1 distance of the normalised histograms) with
// the mean absolute luma difference of the grids. A hard cut changes both.
// Camera or subject motion moves the grid but keeps the histogram, and a
// lighting change shifts the histogram smoothly over many frames. detectCuts
// marks frame i as the first frame of a new shot when its difference is above
// an absolute threshold set by the sensitivity and clearly above the local
// activity (the median of the differences around it). Shots shorter than
// minShotFrames are merged into the previous one.

#include <array>
#include <cstdint>
#include <span>
#include <vector>

namespace nt::shots {

inline constexpr int kGridWidth = 32;
inline constexpr int kGridHeight = 18;
inline constexpr int kHistogramBins = 16;

// The reduced picture of one frame.
struct Signature {
    std::array<float, kGridWidth * kGridHeight> grid{};
    std::array<float, 3 * kHistogramBins> histogram{};
    bool operator==(const Signature&) const = default;
};

// Reduces an RGBA8 frame to its signature. `strideBytes` 0 means tightly
// packed rows. Samples at most about 256x144 pixels. An empty or too small
// buffer gives an all-zero signature.
Signature signature(std::span<const std::uint8_t> rgba, int width, int height, int strideBytes = 0);

// Pointer callers must provide enough storage for every row.
Signature signature(const std::uint8_t* rgba, int width, int height, int strideBytes = 0);

// How different two frames look: 0 (identical) to 1.
float difference(const Signature& a, const Signature& b);

struct SceneOptions {
    // 0 (only the most obvious cuts) to 100 (also subtle ones).
    float sensitivity = 50.0F;
    // The shortest shot kept, in frames. A cut closer than this to the
    // previous one is ignored.
    int minShotFrames = 6;
    // The absolute difference a cut must exceed.
    float threshold() const;
};

// The frames that start a new shot. diffs[i] is the difference between frame
// i - 1 and frame i. diffs[0] is ignored.
std::vector<int> detectCuts(std::span<const float> diffs, const SceneOptions& options);

}  // namespace nt::shots
