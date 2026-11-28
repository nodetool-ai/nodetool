// Derived from georgi/fablesynth (https://github.com/georgi/fablesynth) at
// commit af55d51 / ae9fca7 (juce/source/dsp/Wavetables.{h,cpp}).
// FableSynth is published under PolyForm Noncommercial 1.0.0. Its author, who
// also maintains NodeTool, contributes this code to NodeTool under NodeTool's
// licence (AGPL-3.0).
#pragma once

#include <algorithm>
#include <array>
#include <cmath>
#include <cstddef>
#include <string_view>
#include <vector>

namespace nt::midi {

inline constexpr int kWavetableSize = 2048;
inline constexpr int kWavetableMask = kWavetableSize - 1;
inline constexpr int kWavetableFrames = 16;
inline constexpr int kWavetableMips = 11;  // maxHarm: 1024, 512, ..., 1 (coarsest mip is pure sine)
inline constexpr int kSubSquareSize = 4096;
inline constexpr int kSubSquareStride = kSubSquareSize + 3;  // 1 guard sample before, 2 after

enum class WavetableId : int {
    Prime = 0,
    Bloom = 1,
    Pulse = 2,
    Vox = 3,
    Chime = 4,
    Glitch = 5,
    Count = 6
};

inline constexpr int kWavetableCount = static_cast<int>(WavetableId::Count);

// Immutable mip-mapped wavetable pyramid (kWavetableFrames x kWavetableMips x kWavetableSize).
// Ownership: owned by the process-wide immutable array returned by `factoryWavetables()`.
// Thread affinity: built once on first call (forced by `WavetableSynth::prepare()` on the
// control thread); read-only from the audio thread thereafter.
struct WavetableData {
    std::string_view name;
    std::vector<float> data;  // frame-major then mip-major: (f * kWavetableMips + m) * kWavetableSize + i
};

// Process-wide immutable build of the six procedural tables (prime, bloom, pulse, vox, chime, glitch).
// Call during prepare() on the control thread so the audio thread never allocates or initializes.
[[nodiscard]] const std::array<WavetableData, kWavetableCount>& factoryWavetables();

// Process-wide immutable band-limited square wave pyramid for the sub oscillator.
// Call during prepare() on the control thread so the audio thread never allocates or initializes.
[[nodiscard]] const float* subSquareTable();

[[nodiscard]] std::string_view wavetableName(WavetableId id) noexcept;
[[nodiscard]] WavetableId wavetableIdFromName(std::string_view name) noexcept;
[[nodiscard]] WavetableId wavetableIdFromIndex(int index) noexcept;

// Mip selection for the band-limited sub square table (mirrors FableSynth subSquareMip).
struct SubSquareMip {
    int off = 0;
    int offFine = 0;
    double blend = 0.0;
};

[[nodiscard]] inline SubSquareMip selectSubSquareMip(double phaseInc) noexcept {
    SubSquareMip r;
    const double mipF = std::log2((phaseInc * 1024.0) / 0.475);
    int mip = 0;
    if (mipF > 0.0) {
        mip = std::min(kWavetableMips - 1, static_cast<int>(std::ceil(mipF)));
        const double over = mipF - static_cast<double>(mip - 1);
        if (over < 0.07) {
            r.blend = 1.0 - over / 0.07;
        }
    }
    r.off = mip * kSubSquareStride;
    r.offFine = (mip > 0 ? mip - 1 : 0) * kSubSquareStride;
    return r;
}

// 4-point cubic Hermite read of one sub-square mip at phase `ph` in [0, 1).
[[nodiscard]] inline double readSubSquareMip(const float* table, int off, double ph) noexcept {
    const double p = ph * static_cast<double>(kSubSquareSize);
    const int idx = static_cast<int>(p);
    const double f = p - static_cast<double>(idx);
    const float* q = table + off + idx;
    const double ym1 = q[0];
    const double y0 = q[1];
    const double y1 = q[2];
    const double y2 = q[3];
    const double c1 = 0.5 * (y1 - ym1);
    const double c2 = ym1 - 2.5 * y0 + 2.0 * y1 - 0.5 * y2;
    const double c3 = 0.5 * (y2 - ym1) + 1.5 * (y0 - y1);
    return ((c3 * f + c2) * f + c1) * f + y0;
}

[[nodiscard]] inline double readSubSquare(const float* table, const SubSquareMip& mip, double ph) noexcept {
    const double sc = readSubSquareMip(table, mip.off, ph);
    if (mip.blend < 0.001) {
        return sc;
    }
    return sc + mip.blend * (readSubSquareMip(table, mip.offFine, ph) - sc);
}

// In-place iterative radix-2 complex FFT (power-of-two `n`). Exposed for wavetable
// generation and deterministic spectral tests.
void wavetableFft(double* re, double* im, int n, bool inverse) noexcept;

}  // namespace nt::midi
