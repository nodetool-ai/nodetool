#pragma once

// High-quality Kaiser-windowed sinc varispeed resampler for real-time and offline
// mixing. Uses an immutable read-only oversampled prototype kernel table built once
// at static initialization (zero mutable global state, zero audio-thread allocation,
// zero locks, zero syscalls).
// Thread affinity: read-only / pure functions; safe to call concurrently from any
// audio or offline render thread.

#include <algorithm>
#include <array>
#include <cmath>
#include <cstdint>
#include <numbers>

namespace nt::audio {

namespace detail {

inline constexpr int kSincHalfZeroCrossings = 24;
inline constexpr int kSincPhasesPerCrossing = 512;
inline constexpr std::size_t kSincTableSize =
    static_cast<std::size_t>(kSincHalfZeroCrossings) * static_cast<std::size_t>(kSincPhasesPerCrossing) + 1;
inline constexpr double kSincKaiserBeta = 9.5;
// Cutoff in normalized Nyquist units (0.90 * 24 kHz = 21.6 kHz at 48 kHz; at 2x speed,
// -6 dB sits at 10.8 kHz and stopband attenuation exceeds 85-95 dB past 12.2 kHz).
inline constexpr double kSincCutoff = 0.90;
inline constexpr int kSincMaxRadius = 128;
inline constexpr std::size_t kKaiserWindowTableSize = 1025;

inline double besselI0(double x) noexcept {
    double sum = 1.0;
    double term = 1.0;
    const double halfX = 0.5 * x;
    for (int k = 1; k <= 32; ++k) {
        const double r = halfX / static_cast<double>(k);
        term *= r * r;
        sum += term;
        if (term < 1e-16 * sum) { break; }
    }
    return sum;
}

inline std::array<float, kSincTableSize> buildSincKernelTable() {
    std::array<float, kSincTableSize> table{};
    const double invI0 = 1.0 / besselI0(kSincKaiserBeta);
    const double L = static_cast<double>(kSincHalfZeroCrossings);
    table[0] = 1.0f;
    for (std::size_t i = 1; i < kSincTableSize - 1; ++i) {
        const double u = static_cast<double>(i) / static_cast<double>(kSincPhasesPerCrossing);
        const double piU = std::numbers::pi * u;
        const double sinc = std::sin(piU) / piU;
        const double ratio = u / L;
        const double arg = std::max(0.0, 1.0 - ratio * ratio);
        const double window = besselI0(kSincKaiserBeta * std::sqrt(arg)) * invI0;
        table[i] = static_cast<float>(sinc * window);
    }
    table[kSincTableSize - 1] = 0.0f;
    return table;
}

inline std::array<float, kKaiserWindowTableSize> buildKaiserWindowTable() {
    std::array<float, kKaiserWindowTableSize> table{};
    const double invI0 = 1.0 / besselI0(kSincKaiserBeta);
    const double maxIdx = static_cast<double>(kKaiserWindowTableSize - 1);
    table[0] = 1.0f;
    for (std::size_t i = 1; i < kKaiserWindowTableSize - 1; ++i) {
        const double r = static_cast<double>(i) / maxIdx;
        const double arg = std::max(0.0, 1.0 - r * r);
        table[i] = static_cast<float>(besselI0(kSincKaiserBeta * std::sqrt(arg)) * invI0);
    }
    table[kKaiserWindowTableSize - 1] = 0.0f;
    return table;
}

inline const std::array<float, kSincTableSize> kSincKernelTable = buildSincKernelTable();
inline const std::array<float, kKaiserWindowTableSize> kKaiserWindowTable = buildKaiserWindowTable();

inline double lookupSincKernel(double u) noexcept {
    if (u >= static_cast<double>(kSincHalfZeroCrossings)) { return 0.0; }
    const double pos = u * static_cast<double>(kSincPhasesPerCrossing);
    const auto idx = static_cast<std::size_t>(pos);
    if (idx >= kSincTableSize - 1) { return 0.0; }
    const double frac = pos - static_cast<double>(idx);
    const double a = static_cast<double>(kSincKernelTable[idx]);
    const double b = static_cast<double>(kSincKernelTable[idx + 1]);
    return a + (b - a) * frac;
}

inline double lookupKaiserWindow(double r) noexcept {
    if (r >= 1.0) { return 0.0; }
    if (r <= 0.0) { return 1.0; }
    const double pos = r * static_cast<double>(kKaiserWindowTableSize - 1);
    const auto idx = static_cast<std::size_t>(pos);
    if (idx >= kKaiserWindowTableSize - 1) { return 0.0; }
    const double frac = pos - static_cast<double>(idx);
    const double a = static_cast<double>(kKaiserWindowTable[idx]);
    const double b = static_cast<double>(kKaiserWindowTable[idx + 1]);
    return a + (b - a) * frac;
}

}  // namespace detail

// Maximum half-width (in source frames) read on either side of a sample point.
inline constexpr int kSincMaxRadius = detail::kSincMaxRadius;

// Half-width (in source frames) read on each side of the sample point for `sourceRate`.
[[nodiscard]] inline int sincRadiusForRate(double sourceRate) noexcept {
    const double absRate = std::abs(sourceRate);
    if (!std::isfinite(absRate) || absRate <= 0.0) { return 0; }
    const double fc = detail::kSincCutoff / std::max(1.0, absRate);
    const double halfSpan = std::min<double>(
        static_cast<double>(detail::kSincMaxRadius),
        static_cast<double>(detail::kSincHalfZeroCrossings) / fc);
    return static_cast<int>(std::ceil(halfSpan));
}

struct SincSupport {
    std::int64_t first = 0;
    std::int64_t last = 0;
};

// Inclusive source-frame index range [first, last] read by sampleSinc(s, sourceRate, ...).
[[nodiscard]] inline SincSupport sincSupportForSample(double s, double sourceRate) noexcept {
    const double absRate = (std::isfinite(sourceRate) && std::abs(sourceRate) > 0.0) ? std::abs(sourceRate) : 1.0;
    const double fc = detail::kSincCutoff / std::max(1.0, absRate);
    const double rawHalfSpan = static_cast<double>(detail::kSincHalfZeroCrossings) / fc;
    const double halfSpan = std::min<double>(static_cast<double>(detail::kSincMaxRadius), rawHalfSpan);
    return {
        static_cast<std::int64_t>(std::ceil(s - halfSpan)),
        static_cast<std::int64_t>(std::floor(s + halfSpan))
    };
}

// Evaluates the band-limited Kaiser-windowed sinc interpolation at continuous source
// frame `s` for speed ratio `sourceRate`. `fetch(frame, l, r)` returns true when `frame`
// is available in the source buffer (writing stereo PCM) and false when out of bounds,
// without allocating or locking.
template <typename FetchFn>
inline void sampleSinc(double s, double sourceRate, FetchFn&& fetch, double& outL, double& outR) noexcept {
    const double absRate = (std::isfinite(sourceRate) && std::abs(sourceRate) > 0.0) ? std::abs(sourceRate) : 1.0;
    const double fc = detail::kSincCutoff / std::max(1.0, absRate);
    const double rawHalfSpan = static_cast<double>(detail::kSincHalfZeroCrossings) / fc;
    const bool capped = rawHalfSpan > static_cast<double>(detail::kSincMaxRadius);
    const double halfSpan = capped ? static_cast<double>(detail::kSincMaxRadius) : rawHalfSpan;
    const double invHalfSpan = 1.0 / halfSpan;
    const SincSupport support = sincSupportForSample(s, absRate);
    double accL = 0.0;
    double accR = 0.0;
    double weightSum = 0.0;
    for (std::int64_t k = support.first; k <= support.last; ++k) {
        const double d = std::abs(s - static_cast<double>(k));
        double w = 0.0;
        if (!capped) {
            w = detail::lookupSincKernel(d * fc);
        } else {
            const double u = d * fc;
            const double piU = std::numbers::pi * u;
            const double sinc = (u < 1e-9) ? 1.0 : (std::sin(piU) / piU);
            w = sinc * detail::lookupKaiserWindow(d * invHalfSpan);
        }
        if (w == 0.0) { continue; }
        // Always include every tap in the kernel denominator so out-of-bounds edges
        // zero-pad cleanly without cancelling signed sidelobes in weightSum.
        weightSum += w;
        float l = 0.0f;
        float r = 0.0f;
        if (!fetch(k, l, r)) { continue; }
        accL += w * static_cast<double>(l);
        accR += w * static_cast<double>(r);
    }
    if (std::abs(weightSum) > 1e-12) {
        const double inv = 1.0 / weightSum;
        outL = accL * inv;
        outR = accR * inv;
    } else {
        outL = 0.0;
        outR = 0.0;
    }
}

}  // namespace nt::audio
