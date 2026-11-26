#include "midi/MultisampleSampler.h"

#include "audio/AudioSource.h"
#include "audio/SincResampler.h"
#include "audio/vst/VstAudioStages.h"

#include <QDir>
#include <QDirIterator>
#include <QFileInfo>
#include <QJsonArray>
#include <QJsonObject>
#include <QStandardPaths>
#include <QString>

#include <algorithm>
#include <cmath>
#include <limits>
#include <numbers>
#include <unordered_map>

namespace nt::midi {
namespace {

constexpr float kDenormalFloor = 1.0e-30f;
constexpr double kDeclickKillThreshold = 1.0e-4;
constexpr double kEndDeclickSec = 0.002;
constexpr std::size_t kMaxZones = 64;
constexpr std::size_t kMixChunkFrames = 256;
constexpr std::size_t kDefaultMaxDecodeFrames = 16U * 1024U * 1024U;

// Half-band FIR kernel for off-thread 2x octave mipmap decimation.
constexpr int kMipHalfTaps = 16;
constexpr double kMipCutoff = 0.225;
constexpr double kMipKaiserBeta = 7.5;

// Real-time continuous Kaiser-windowed sinc LUT (immutable read-only static table,
// zero mutable global state, zero audio-thread sin() calls).
constexpr int kRtSincHalfCrossings = 6;
constexpr int kRtSincPhases = 256;
constexpr std::size_t kRtSincTableSize =
    static_cast<std::size_t>(kRtSincHalfCrossings) * static_cast<std::size_t>(kRtSincPhases) + 1;
constexpr double kRtSincBeta = 7.0;
constexpr double kRtSincCutoff = 0.88;

inline float sanitizeSample(float x) noexcept {
    return (!std::isfinite(x) || std::fabs(x) < kDenormalFloor) ? 0.0f : x;
}

inline double sanitizeDouble(double x) noexcept {
    return (!std::isfinite(x) || std::abs(x) < 1.0e-30) ? 0.0 : x;
}

inline float sanitizeBusSample(float x) noexcept {
    constexpr float kLimit = std::numeric_limits<float>::max() / 4.0f;
    return std::isfinite(x) ? sanitizeSample(std::clamp(x, -kLimit, kLimit)) : 0.0f;
}

inline double dbToLinear(double db) noexcept {
    if (!std::isfinite(db)) return 0.0;
    const double maxGainDb = 20.0 * std::log10(static_cast<double>(std::numeric_limits<float>::max()) / 4.0);
    return std::pow(10.0, std::clamp(db, -6000.0, maxGainDb) / 20.0);
}

inline double boundedDouble(const QJsonObject& obj, QStringView key, double fallback, double lo, double hi) {
    const QJsonValue v = obj.value(key);
    if (!v.isDouble()) return fallback;
    const double d = v.toDouble();
    return std::isfinite(d) ? std::clamp(d, lo, hi) : fallback;
}

inline int boundedInt(const QJsonObject& obj, QStringView key, int fallback, int lo, int hi) {
    const QJsonValue v = obj.value(key);
    if (!v.isDouble()) return fallback;
    const double d = v.toDouble();
    return std::isfinite(d) ? std::clamp(static_cast<int>(std::llround(d)), lo, hi) : fallback;
}

inline double besselI0(double x) noexcept {
    double sum = 1.0;
    double term = 1.0;
    const double halfX = 0.5 * x;
    const double halfX2 = halfX * halfX;
    for (int k = 1; k <= 25; ++k) {
        term *= halfX2 / (static_cast<double>(k) * static_cast<double>(k));
        sum += term;
        if (term < 1.0e-15 * sum) break;
    }
    return sum;
}

std::array<double, kMipHalfTaps + 1> makeHalfBandKernel() noexcept {
    std::array<double, kMipHalfTaps + 1> w{};
    const double invI0 = 1.0 / besselI0(kMipKaiserBeta);
    w[0] = 2.0 * kMipCutoff;
    double sum = w[0];
    for (int k = 1; k <= kMipHalfTaps; ++k) {
        const double u = static_cast<double>(k) / static_cast<double>(kMipHalfTaps);
        const double arg = 2.0 * std::numbers::pi * kMipCutoff * static_cast<double>(k);
        const double sinc = std::sin(arg) / (std::numbers::pi * static_cast<double>(k));
        const double rad = std::max(0.0, 1.0 - u * u);
        const double win = besselI0(kMipKaiserBeta * std::sqrt(rad)) * invI0;
        w[static_cast<std::size_t>(k)] = sinc * win;
        sum += 2.0 * w[static_cast<std::size_t>(k)];
    }
    const double invSum = (sum > 0.0) ? (1.0 / sum) : 1.0;
    for (double& coeff : w) coeff *= invSum;
    return w;
}

std::array<float, kRtSincTableSize> buildRtSincTable() noexcept {
    std::array<float, kRtSincTableSize> lut{};
    const double invI0 = 1.0 / besselI0(kRtSincBeta);
    const double L = static_cast<double>(kRtSincHalfCrossings);
    lut[0] = 1.0f;
    for (std::size_t i = 1; i < kRtSincTableSize - 1; ++i) {
        const double u = static_cast<double>(i) / static_cast<double>(kRtSincPhases);
        const double piU = std::numbers::pi * u;
        const double sinc = std::sin(piU) / piU;
        const double ratio = u / L;
        const double rad = std::max(0.0, 1.0 - ratio * ratio);
        const double win = besselI0(kRtSincBeta * std::sqrt(rad)) * invI0;
        lut[i] = static_cast<float>(sinc * win);
    }
    lut[kRtSincTableSize - 1] = 0.0f;
    return lut;
}

const std::array<float, kRtSincTableSize> kRtSincTable = buildRtSincTable();

inline double lookupRtSinc(double u) noexcept {
    if (u >= static_cast<double>(kRtSincHalfCrossings)) return 0.0;
    const double pos = u * static_cast<double>(kRtSincPhases);
    const auto idx = static_cast<std::size_t>(pos);
    if (idx >= kRtSincTableSize - 1) return 0.0;
    const double frac = pos - static_cast<double>(idx);
    const double a = static_cast<double>(kRtSincTable[idx]);
    const double b = static_cast<double>(kRtSincTable[idx + 1]);
    return a + (b - a) * frac;
}

inline double hermite4(double ym1, double y0, double y1, double y2, double f) noexcept {
    const double c1 = 0.5 * (y1 - ym1);
    const double c2 = ym1 - 2.5 * y0 + 2.0 * y1 - 0.5 * y2;
    const double c3 = 0.5 * (y2 - ym1) + 1.5 * (y0 - y1);
    return ((c3 * f + c2) * f + c1) * f + y0;
}

// Resamples interleaved stereo PCM from `srcRate` to `targetRate` using the
// Kaiser-windowed sinc resampler (SincResampler.h). Sanitizes all non-finite
// inputs/outputs. Runs off the audio thread.
std::vector<float> resampleStereoSinc(std::span<const float> srcStereo, double srcRate, double targetRate) {
    const std::size_t srcFrames = srcStereo.size() / 2;
    if (srcFrames == 0 || !std::isfinite(srcRate) || srcRate <= 0.0 || !std::isfinite(targetRate) || targetRate <= 0.0) {
        return {};
    }
    if (std::abs(srcRate - targetRate) < 1.0e-3) {
        std::vector<float> out(srcFrames * 2);
        for (std::size_t i = 0; i < out.size(); ++i) {
            out[i] = sanitizeSample(srcStereo[i]);
        }
        return out;
    }
    const std::size_t outFrames = std::max<std::size_t>(
        1, static_cast<std::size_t>(std::llround(static_cast<double>(srcFrames) * targetRate / srcRate)));
    std::vector<float> out(outFrames * 2, 0.0f);
    const double ratio = srcRate / targetRate;
    const auto fetch = [&](std::int64_t k, float& l, float& r) noexcept -> bool {
        if (k < 0 || k >= static_cast<std::int64_t>(srcFrames)) return false;
        const auto idx = static_cast<std::size_t>(k) * 2;
        l = sanitizeSample(srcStereo[idx]);
        r = sanitizeSample(srcStereo[idx + 1]);
        return true;
    };
    for (std::size_t i = 0; i < outFrames; ++i) {
        double l = 0.0;
        double r = 0.0;
        nt::audio::sampleSinc(static_cast<double>(i) * ratio, ratio, fetch, l, r);
        out[i * 2] = sanitizeSample(static_cast<float>(l));
        out[i * 2 + 1] = sanitizeSample(static_cast<float>(r));
    }
    return out;
}

// Pre-bakes a C1-continuous raised-cosine crossfade across the sustain loop seam
// off the audio thread into `loopBaseStereo` (leaving unmodified one-shot PCM untouched)
// so modular loop wrapping is click-free at any pitch.
void prepareSustainLoop(PreparedSamplerZone& zone, std::vector<float>& loopBaseStereo,
                        double loopStartNorm, double loopEndNorm,
                        float loopCrossfadeMs, double sampleRate) {
    zone.hasLoop = false;
    zone.loopWrapStart = 0;
    zone.loopEnd = 0;
    if (zone.loopModeOverride == SamplerLoopMode::OneShot || zone.mainFrames < 8 ||
        loopBaseStereo.size() < zone.mainFrames * 2) {
        return;
    }
    const double loNorm = std::clamp(loopStartNorm, 0.0, 1.0);
    const double hiNorm = std::clamp(loopEndNorm, 0.0, 1.0);
    if (hiNorm <= loNorm) return;

    const std::size_t rawStart =
        std::min<std::size_t>(zone.mainFrames - 2,
                              static_cast<std::size_t>(std::llround(loNorm * static_cast<double>(zone.mainFrames))));
    const std::size_t rawEnd =
        std::min<std::size_t>(zone.mainFrames,
                              static_cast<std::size_t>(std::llround(hiNorm * static_cast<double>(zone.mainFrames))));
    if (rawEnd <= rawStart + 4) return;

    const std::size_t rawLen = rawEnd - rawStart;
    const double xfadeSec = std::clamp(static_cast<double>(loopCrossfadeMs), 0.0, 500.0) / 1000.0;
    const std::size_t desiredXfade = static_cast<std::size_t>(std::llround(xfadeSec * sampleRate));
    const std::size_t xfade = std::min<std::size_t>(desiredXfade, rawLen / 3);

    if (xfade == 0) {
        zone.loopWrapStart = rawStart;
        zone.loopEnd = rawEnd;
        zone.hasLoop = true;
        return;
    }

    const bool hasPreLoop = (rawStart >= xfade);
    const std::size_t blendSrcStart = hasPreLoop ? (rawStart - xfade) : rawStart;
    const std::size_t wrapStart = hasPreLoop ? rawStart : (rawStart + xfade);
    if (rawEnd <= wrapStart + 2) return;

    std::vector<float> srcCopy(xfade * 2);
    for (std::size_t k = 0; k < xfade; ++k) {
        srcCopy[k * 2] = loopBaseStereo[(blendSrcStart + k) * 2];
        srcCopy[k * 2 + 1] = loopBaseStereo[(blendSrcStart + k) * 2 + 1];
    }

    const std::size_t dstStart = rawEnd - xfade;
    const double invDenom = 1.0 / static_cast<double>(xfade + 1);
    for (std::size_t k = 0; k < xfade; ++k) {
        const double t = static_cast<double>(k + 1) * invDenom;
        const double wIn = 0.5 * (1.0 - std::cos(std::numbers::pi * t));
        const double wOut = 1.0 - wIn;
        const std::size_t dstIdx = (dstStart + k) * 2;
        const double outL = wOut * static_cast<double>(loopBaseStereo[dstIdx]) +
                            wIn * static_cast<double>(srcCopy[k * 2]);
        const double outR = wOut * static_cast<double>(loopBaseStereo[dstIdx + 1]) +
                            wIn * static_cast<double>(srcCopy[k * 2 + 1]);
        loopBaseStereo[dstIdx] = sanitizeSample(static_cast<float>(outL));
        loopBaseStereo[dstIdx + 1] = sanitizeSample(static_cast<float>(outR));
    }

    zone.loopWrapStart = wrapStart;
    zone.loopEnd = rawEnd;
    zone.hasLoop = true;
}

// Builds band-limited octave mipmaps (levels 1..kMipLevels-1) off the audio thread.
// For looped buffers, each mip level keeps exact integer loop periodicity so modular
// wrapping produces zero seam discontinuity at any pitch up to +60 semitones.
// Short periodic loops (`(baseLoopLen >> level) < 8`) use exact spectral DFT band-limiting
// so all above-Nyquist harmonics are rejected even when decimated below 8 frames.
void buildStereoMipmaps(std::array<PreparedSamplerZone::MipLevel, PreparedSamplerZone::kMipLevels>& mips,
                        bool hasLoop, std::size_t baseLoopStart, std::size_t baseLoopEnd) {
    auto& base = mips[0];
    base.frames = base.stereo.size() / 2;
    base.loopStart = hasLoop ? baseLoopStart : 0;
    base.loopEnd = hasLoop ? baseLoopEnd : 0;
    base.preScale = 1.0;
    base.loopScale = 1.0;
    base.valid = (base.frames > 0);
    if (!base.valid) return;

    const auto kernel = makeHalfBandKernel();
    const std::size_t baseLoopLen = hasLoop ? (baseLoopEnd - baseLoopStart) : 0;

    for (int level = 1; level < PreparedSamplerZone::kMipLevels; ++level) {
        const auto& prev = mips[static_cast<std::size_t>(level - 1)];
        auto& cur = mips[static_cast<std::size_t>(level)];
        cur.valid = false;
        if (!prev.valid) break;

        if (!hasLoop) {
            if (prev.frames < 2) break;
            const std::size_t nextFrames = prev.frames / 2;
            if (nextFrames < 1) break;
            cur.frames = nextFrames;
            cur.stereo.resize(nextFrames * 2);
            cur.loopStart = 0;
            cur.loopEnd = 0;
            cur.preScale = 1.0 / static_cast<double>(1 << level);
            cur.loopScale = cur.preScale;
            const float* const src = prev.stereo.data();
            const std::size_t prevLen = prev.frames;
            for (std::size_t j = 0; j < nextFrames; ++j) {
                const std::size_t c = j * 2;
                double accL = kernel[0] * static_cast<double>(src[c * 2]);
                double accR = kernel[0] * static_cast<double>(src[c * 2 + 1]);
                for (int k = 1; k <= kMipHalfTaps; ++k) {
                    const auto uk = static_cast<std::size_t>(k);
                    const double lL = (c >= uk) ? static_cast<double>(src[(c - uk) * 2]) : 0.0;
                    const double lR = (c >= uk) ? static_cast<double>(src[(c - uk) * 2 + 1]) : 0.0;
                    const double rL = (c + uk < prevLen) ? static_cast<double>(src[(c + uk) * 2]) : 0.0;
                    const double rR = (c + uk < prevLen) ? static_cast<double>(src[(c + uk) * 2 + 1]) : 0.0;
                    accL += kernel[uk] * (lL + rL);
                    accR += kernel[uk] * (lR + rR);
                }
                cur.stereo[j * 2] = sanitizeSample(static_cast<float>(accL));
                cur.stereo[j * 2 + 1] = sanitizeSample(static_cast<float>(accR));
            }
            cur.valid = true;
            continue;
        }

        // Looped mipmap: keep exact periodic loop length at each octave level.
        const std::size_t decimation = static_cast<std::size_t>(1) << level;
        const std::size_t prevLoopLen = prev.loopEnd - prev.loopStart;
        if (baseLoopLen == 0 || prevLoopLen == 0) break;

        const bool shortLoop = (baseLoopLen >> level) < 8;
        std::size_t nextLoopLen = 0;
        std::size_t maxHarmonic = 0;
        if (shortLoop) {
            if (baseLoopLen > 2 * decimation) {
                maxHarmonic = (baseLoopLen - 1) / (2 * decimation);
                // Ceiling length M = ceil(L / D) guarantees M / 2 > maxHarmonic strictly,
                // preserving both cosine and sine phases of every retained harmonic.
                nextLoopLen = (baseLoopLen + decimation - 1) >> level;
            } else {
                maxHarmonic = 0;
                nextLoopLen = 1;  // DC only (every non-DC harmonic exceeds Nyquist at speed D).
            }
        } else {
            nextLoopLen = baseLoopLen >> level;
        }

        const std::size_t nextLoopStart = baseLoopStart >> level;
        const std::size_t nextLoopEnd = nextLoopStart + nextLoopLen;
        const std::size_t nextTailLen = (base.frames - baseLoopEnd) >> level;
        const std::size_t nextFrames = nextLoopEnd + nextTailLen;
        if (nextFrames == 0) break;

        cur.frames = nextFrames;
        cur.stereo.assign(nextFrames * 2, 0.0f);
        cur.loopStart = nextLoopStart;
        cur.loopEnd = nextLoopEnd;
        cur.preScale = (baseLoopStart > 0 && nextLoopStart > 0)
                           ? (static_cast<double>(nextLoopStart) / static_cast<double>(baseLoopStart))
                           : (1.0 / static_cast<double>(decimation));
        cur.loopScale = static_cast<double>(nextLoopLen) / static_cast<double>(baseLoopLen);

        const bool needPrevLp = (!shortLoop) || (nextLoopStart > 0) || (nextTailLen > 0);
        if (needPrevLp) {
            // Low-pass filter `prev` at full resolution with loop-aware boundary reads.
            std::vector<float> lp(prev.frames * 2, 0.0f);
            const float* const src = prev.stereo.data();
            const auto pFramesI = static_cast<std::int64_t>(prev.frames);
            const auto pLoopStartI = static_cast<std::int64_t>(prev.loopStart);
            const auto pLoopEndI = static_cast<std::int64_t>(prev.loopEnd);
            const auto pLoopLenI = static_cast<std::int64_t>(prevLoopLen);

            auto readPrev = [&](std::int64_t idx, bool wrapLoop, double& l, double& r) noexcept {
                if (wrapLoop) {
                    if (idx >= pLoopEndI) {
                        idx = pLoopStartI + ((idx - pLoopStartI) % pLoopLenI);
                    } else if (idx < pLoopStartI) {
                        std::int64_t rel = (idx - pLoopStartI) % pLoopLenI;
                        if (rel < 0) rel += pLoopLenI;
                        idx = pLoopStartI + rel;
                    }
                }
                if (idx < 0 || idx >= pFramesI) {
                    l = 0.0;
                    r = 0.0;
                    return;
                }
                const auto u = static_cast<std::size_t>(idx) * 2;
                l = static_cast<double>(src[u]);
                r = static_cast<double>(src[u + 1]);
            };

            for (std::size_t i = 0; i < prev.frames; ++i) {
                const bool inLoop = (i >= prev.loopStart && i < prev.loopEnd);
                double accL = kernel[0] * static_cast<double>(src[i * 2]);
                double accR = kernel[0] * static_cast<double>(src[i * 2 + 1]);
                for (int k = 1; k <= kMipHalfTaps; ++k) {
                    double lL = 0.0, lR = 0.0, rL = 0.0, rR = 0.0;
                    readPrev(static_cast<std::int64_t>(i) - k, inLoop, lL, lR);
                    readPrev(static_cast<std::int64_t>(i) + k, inLoop, rL, rR);
                    accL += kernel[static_cast<std::size_t>(k)] * (lL + rL);
                    accR += kernel[static_cast<std::size_t>(k)] * (lR + rR);
                }
                lp[i * 2] = sanitizeSample(static_cast<float>(accL));
                lp[i * 2 + 1] = sanitizeSample(static_cast<float>(accR));
            }

            // Resample the already band-limited `lp` buffer onto the exact periodic grid.
            auto sampleLp = [&](double pos, bool wrapLoop, float& outL, float& outR) noexcept {
                const auto i1 = static_cast<std::int64_t>(std::floor(pos));
                const double f = pos - static_cast<double>(i1);
                auto fetchLp = [&](std::int64_t idx, double& l, double& r) noexcept {
                    if (wrapLoop) {
                        if (idx >= pLoopEndI) {
                            idx = pLoopStartI + ((idx - pLoopStartI) % pLoopLenI);
                        } else if (idx < pLoopStartI) {
                            std::int64_t rel = (idx - pLoopStartI) % pLoopLenI;
                            if (rel < 0) rel += pLoopLenI;
                            idx = pLoopStartI + rel;
                        }
                    }
                    if (idx < 0 || idx >= pFramesI) {
                        l = 0.0;
                        r = 0.0;
                        return;
                    }
                    const auto u = static_cast<std::size_t>(idx) * 2;
                    l = static_cast<double>(lp[u]);
                    r = static_cast<double>(lp[u + 1]);
                };
                double lm1 = 0, rm1 = 0, l0 = 0, r0 = 0, l1 = 0, r1 = 0, l2 = 0, r2 = 0;
                fetchLp(i1 - 1, lm1, rm1);
                fetchLp(i1, l0, r0);
                fetchLp(i1 + 1, l1, r1);
                fetchLp(i1 + 2, l2, r2);
                outL = sanitizeSample(static_cast<float>(hermite4(lm1, l0, l1, l2, f)));
                outR = sanitizeSample(static_cast<float>(hermite4(rm1, r0, r1, r2, f)));
            };

            if (nextLoopStart > 0) {
                const double stepPre = static_cast<double>(prev.loopStart) / static_cast<double>(nextLoopStart);
                for (std::size_t j = 0; j < nextLoopStart; ++j) {
                    sampleLp(static_cast<double>(j) * stepPre, false, cur.stereo[j * 2], cur.stereo[j * 2 + 1]);
                }
            }
            if (!shortLoop) {
                const double stepLoop = static_cast<double>(prevLoopLen) / static_cast<double>(nextLoopLen);
                for (std::size_t j = 0; j < nextLoopLen; ++j) {
                    const std::size_t dst = nextLoopStart + j;
                    sampleLp(static_cast<double>(prev.loopStart) + static_cast<double>(j) * stepLoop, true,
                             cur.stereo[dst * 2], cur.stereo[dst * 2 + 1]);
                }
            }
            if (nextTailLen > 0) {
                const double prevTailLen = static_cast<double>(prev.frames - prev.loopEnd);
                const double stepTail = prevTailLen / static_cast<double>(nextTailLen);
                for (std::size_t j = 0; j < nextTailLen; ++j) {
                    const std::size_t dst = nextLoopEnd + j;
                    sampleLp(static_cast<double>(prev.loopEnd) + static_cast<double>(j) * stepTail, false,
                             cur.stereo[dst * 2], cur.stereo[dst * 2 + 1]);
                }
            }
        }

        if (shortLoop) {
            const float* const baseSrc = base.stereo.data();
            const double invL = 1.0 / static_cast<double>(baseLoopLen);
            double dcL = 0.0;
            double dcR = 0.0;
            for (std::size_t n = 0; n < baseLoopLen; ++n) {
                const std::size_t idx = (baseLoopStart + n) * 2;
                dcL += static_cast<double>(baseSrc[idx]);
                dcR += static_cast<double>(baseSrc[idx + 1]);
            }
            dcL *= invL;
            dcR *= invL;

            if (maxHarmonic == 0) {
                cur.stereo[nextLoopStart * 2] = sanitizeSample(static_cast<float>(dcL));
                cur.stereo[nextLoopStart * 2 + 1] = sanitizeSample(static_cast<float>(dcR));
            } else {
                std::vector<double> cosL(maxHarmonic + 1, 0.0);
                std::vector<double> sinL(maxHarmonic + 1, 0.0);
                std::vector<double> cosR(maxHarmonic + 1, 0.0);
                std::vector<double> sinR(maxHarmonic + 1, 0.0);
                const double twoPiInvL = 2.0 * std::numbers::pi * invL;
                const double scale = 2.0 * invL;
                for (std::size_t k = 1; k <= maxHarmonic; ++k) {
                    double aL = 0.0, bL = 0.0, aR = 0.0, bR = 0.0;
                    const double omega = twoPiInvL * static_cast<double>(k);
                    for (std::size_t n = 0; n < baseLoopLen; ++n) {
                        const double phase = omega * static_cast<double>(n);
                        const double c = std::cos(phase);
                        const double s = std::sin(phase);
                        const std::size_t idx = (baseLoopStart + n) * 2;
                        const double xL = static_cast<double>(baseSrc[idx]);
                        const double xR = static_cast<double>(baseSrc[idx + 1]);
                        aL += xL * c;
                        bL += xL * s;
                        aR += xR * c;
                        bR += xR * s;
                    }
                    cosL[k] = aL * scale;
                    sinL[k] = bL * scale;
                    cosR[k] = aR * scale;
                    sinR[k] = bR * scale;
                }

                const double twoPiInvM = 2.0 * std::numbers::pi / static_cast<double>(nextLoopLen);
                for (std::size_t j = 0; j < nextLoopLen; ++j) {
                    double yL = dcL;
                    double yR = dcR;
                    for (std::size_t k = 1; k <= maxHarmonic; ++k) {
                        const double phase = twoPiInvM * static_cast<double>(k * j);
                        const double c = std::cos(phase);
                        const double s = std::sin(phase);
                        yL += cosL[k] * c + sinL[k] * s;
                        yR += cosR[k] * c + sinR[k] * s;
                    }
                    const std::size_t dst = (nextLoopStart + j) * 2;
                    cur.stereo[dst] = sanitizeSample(static_cast<float>(yL));
                    cur.stereo[dst + 1] = sanitizeSample(static_cast<float>(yR));
                }
            }
        }
        cur.valid = true;
    }
}

inline int eventSortPriority(MultisampleSampler::EventKind kind) noexcept {
    switch (kind) {
        case MultisampleSampler::EventKind::NoteOff: return 0;
        case MultisampleSampler::EventKind::AllNotesOff: return 1;
        case MultisampleSampler::EventKind::PitchBend: return 2;
        case MultisampleSampler::EventKind::NoteOn: return 3;
    }
    return 3;
}

bool isSafeAssetId(const std::string& assetId) noexcept {
    if (assetId.empty() || assetId.size() > 128) return false;
    if (assetId == "." || assetId == "..") return false;
    for (char c : assetId) {
        const bool ok = (c >= 'a' && c <= 'z') || (c >= 'A' && c <= 'Z') || (c >= '0' && c <= '9') ||
                        c == '_' || c == '-' || c == '.';
        if (!ok) return false;
    }
    return assetId.find("..") == std::string::npos;
}

QString defaultAssetCacheDir() {
    const QString env = qEnvironmentVariable("NODETOOL_TIMELINE_CACHE_DIR");
    if (!env.isEmpty()) return env;
    const QString base = QStandardPaths::writableLocation(QStandardPaths::GenericCacheLocation);
    return QDir(base).filePath(QStringLiteral("nodetool-timeline/assets"));
}

QString findAudioFileInDirForId(const QDir& dir, const QString& assetId) {
    if (!dir.exists()) return {};
    const QString exact = dir.filePath(assetId);
    if (QFileInfo::exists(exact) && QFileInfo(exact).isFile()) return exact;
    static const std::array<QString, 7> kExts{
        QStringLiteral("wav"), QStringLiteral("flac"), QStringLiteral("aiff"), QStringLiteral("aif"),
        QStringLiteral("mp3"), QStringLiteral("ogg"),  QStringLiteral("m4a"),
    };
    for (const auto& ext : kExts) {
        const QString cand = dir.filePath(assetId + u'.' + ext);
        if (QFileInfo::exists(cand) && QFileInfo(cand).isFile()) return cand;
    }
    return {};
}

QString pickNewestCachedFile(const QDir& originalDir) {
    if (!originalDir.exists()) return {};
    const QFileInfoList entries = originalDir.entryInfoList(QDir::Files | QDir::NoDotAndDotDot, QDir::Time);
    for (const QFileInfo& fi : entries) {
        const QString name = fi.fileName();
        if (name.endsWith(u".part") || name.endsWith(u".total") || name.endsWith(u".lock")) continue;
        return fi.absoluteFilePath();
    }
    return {};
}

// Searches `<cacheRoot>/<serverKey>/<userKey>/<assetId>/original/*` (the AssetCache layout),
// plus `<cacheRoot>/<assetId>/original/*` and `<cacheRoot>/<assetId>.*`.
QString findAssetInCacheDir(const QString& cacheRootPath, const QString& assetId) {
    if (cacheRootPath.isEmpty()) return {};
    const QDir cacheRoot(cacheRootPath);
    if (!cacheRoot.exists()) return {};

    if (const QString direct = pickNewestCachedFile(QDir(cacheRoot.filePath(assetId + QStringLiteral("/original"))));
        !direct.isEmpty()) {
        return direct;
    }
    if (const QString flat = findAudioFileInDirForId(cacheRoot, assetId); !flat.isEmpty()) {
        return flat;
    }

    const QFileInfoList servers = cacheRoot.entryInfoList(QDir::Dirs | QDir::NoDotAndDotDot);
    for (const QFileInfo& serverInfo : servers) {
        const QDir serverDir(serverInfo.absoluteFilePath());
        const QFileInfoList users = serverDir.entryInfoList(QDir::Dirs | QDir::NoDotAndDotDot);
        for (const QFileInfo& userInfo : users) {
            const QDir origDir(QDir(userInfo.absoluteFilePath()).filePath(assetId + QStringLiteral("/original")));
            if (const QString hit = pickNewestCachedFile(origDir); !hit.isEmpty()) {
                return hit;
            }
        }
    }
    return {};
}

// Continuous Kaiser-windowed sinc interpolation at `mipPos` on `mip` with speed `effStep`.
// Never jumps between kernels across unity; tap count is strictly bounded by mipmap selection.
inline void sampleMipContinuousSinc(const PreparedSamplerZone::MipLevel& mip, double mipPos, double effStep,
                                    bool loopActive, bool hasLooped, float& outL, float& outR) noexcept {
    const float* const buf = mip.stereo.data();
    const auto framesI = static_cast<std::int64_t>(mip.frames);
    const auto loopStartI = static_cast<std::int64_t>(mip.loopStart);
    const auto loopEndI = static_cast<std::int64_t>(mip.loopEnd);
    const auto loopLenI = loopActive ? (loopEndI - loopStartI) : 0;

    const double clampedStep = std::clamp(effStep, 1.0, 8.0);
    const double fc = kRtSincCutoff / clampedStep;
    const double halfSpan = static_cast<double>(kRtSincHalfCrossings) / fc;
    const auto first = static_cast<std::int64_t>(std::ceil(mipPos - halfSpan));
    const auto last = static_cast<std::int64_t>(std::floor(mipPos + halfSpan));

    double accL = 0.0;
    double accR = 0.0;
    double weightSum = 0.0;

    // Fast interior path when the entire tap window lies cleanly inside buffer/loop bounds.
    const bool interiorNoLoop = !loopActive && first >= 0 && last < framesI;
    const bool interiorInLoop = loopActive && first >= loopStartI && last < loopEndI && last < framesI;
    if (interiorNoLoop || interiorInLoop) {
        for (std::int64_t k = first; k <= last; ++k) {
            const double d = std::abs(mipPos - static_cast<double>(k));
            const double w = lookupRtSinc(d * fc);
            if (w == 0.0) continue;
            weightSum += w;
            const auto idx = static_cast<std::size_t>(k) * 2;
            accL += w * static_cast<double>(buf[idx]);
            accR += w * static_cast<double>(buf[idx + 1]);
        }
    } else {
        for (std::int64_t k = first; k <= last; ++k) {
            const double d = std::abs(mipPos - static_cast<double>(k));
            const double w = lookupRtSinc(d * fc);
            if (w == 0.0) continue;
            weightSum += w;
            std::int64_t rk = k;
            if (loopActive && loopLenI > 0) {
                if (rk >= loopEndI) {
                    rk = loopStartI + ((rk - loopStartI) % loopLenI);
                } else if (hasLooped && rk < loopStartI) {
                    std::int64_t rel = (rk - loopStartI) % loopLenI;
                    if (rel < 0) rel += loopLenI;
                    rk = loopStartI + rel;
                }
            }
            if (rk < 0 || rk >= framesI) continue;
            const auto idx = static_cast<std::size_t>(rk) * 2;
            accL += w * static_cast<double>(buf[idx]);
            accR += w * static_cast<double>(buf[idx + 1]);
        }
    }

    if (std::abs(weightSum) > 1.0e-12) {
        const double inv = 1.0 / weightSum;
        outL = sanitizeSample(static_cast<float>(accL * inv));
        outR = sanitizeSample(static_cast<float>(accR * inv));
    } else {
        outL = 0.0f;
        outR = 0.0f;
    }
}

}  // namespace

std::string_view samplerLoopModeName(SamplerLoopMode mode) noexcept {
    return mode == SamplerLoopMode::Sustain ? "sustain" : "oneShot";
}

std::optional<SamplerLoopMode> samplerLoopModeFromName(std::string_view name) noexcept {
    if (name == "sustain" || name == "loop") return SamplerLoopMode::Sustain;
    if (name == "oneShot" || name == "oneshot") return SamplerLoopMode::OneShot;
    return std::nullopt;
}

SamplerInstrumentSpec samplerSpecFromJson(const QJsonObject& instrument) {
    SamplerInstrumentSpec spec;
    spec.params.oneShot = instrument.value(u"oneShot").toBool(false);
    spec.params.attackMs = static_cast<float>(boundedDouble(instrument, u"attackMs", 2.0, 0.0, 10000.0));
    spec.params.decayMs = static_cast<float>(boundedDouble(instrument, u"decayMs", 100.0, 0.0, 10000.0));
    spec.params.sustain = static_cast<float>(boundedDouble(instrument, u"sustain", 1.0, 0.0, 1.0));
    spec.params.releaseMs = static_cast<float>(boundedDouble(instrument, u"releaseMs", 120.0, 0.0, 30000.0));
    spec.params.velocityCurve = static_cast<float>(boundedDouble(instrument, u"velocityCurve", 0.0, -1.0, 1.0));
    spec.params.glideMs = static_cast<float>(boundedDouble(instrument, u"glideMs", 0.0, 0.0, 2000.0));
    spec.params.voiceLimit = boundedInt(instrument, u"voiceLimit", 32, 1, MultisampleSampler::kMaxVoices);
    spec.params.pitchBendRange = static_cast<float>(boundedDouble(instrument, u"pitchBendRange", 2.0, 1.0, 24.0));
    spec.params.gainDb = static_cast<float>(boundedDouble(instrument, u"gainDb", -6.0, -60.0, 12.0));

    const auto zonesArr = instrument.value(u"zones").toArray();
    spec.zones.reserve(std::min<std::size_t>(static_cast<std::size_t>(zonesArr.size()), kMaxZones));
    for (qsizetype i = 0; i < zonesArr.size() && spec.zones.size() < kMaxZones; ++i) {
        const auto obj = zonesArr.at(i).toObject();
        SamplerZoneSpec z;
        z.id = obj.value(u"id").toString().toStdString();
        if (z.id.empty()) {
            z.id = "zone-" + std::to_string(i + 1);
        }
        z.name = obj.value(u"name").toString().toStdString();
        z.assetId = obj.value(u"assetId").toString().toStdString();
        z.mediaPath = obj.value(u"mediaPath").toString().toStdString();
        z.rootNote = boundedInt(obj, u"rootNote", 60, 0, 127);
        z.lowNote = boundedInt(obj, u"lowNote", 0, 0, 127);
        z.highNote = boundedInt(obj, u"highNote", 127, z.lowNote, 127);
        z.lowVelocity = boundedInt(obj, u"lowVelocity", 0, 0, 127);
        z.highVelocity = boundedInt(obj, u"highVelocity", 127, z.lowVelocity, 127);
        z.gainDb = static_cast<float>(boundedDouble(obj, u"gainDb", 0.0, -60.0, 12.0));
        z.pan = static_cast<float>(boundedDouble(obj, u"pan", 0.0, -1.0, 1.0));
        z.tuneCents = static_cast<float>(boundedDouble(obj, u"tuneCents", 0.0, -100.0, 100.0));
        if (const QJsonValue lm = obj.value(u"loopMode"); lm.isString()) {
            z.loopMode = samplerLoopModeFromName(lm.toString().toStdString());
        }
        z.loopStart = boundedDouble(obj, u"loopStart", 0.0, 0.0, 1.0);
        z.loopEnd = boundedDouble(obj, u"loopEnd", 1.0, z.loopStart, 1.0);
        z.loopCrossfadeMs = static_cast<float>(boundedDouble(obj, u"loopCrossfadeMs", 10.0, 0.0, 500.0));
        z.releaseAssetId = obj.value(u"releaseAssetId").toString().toStdString();
        z.releaseMediaPath = obj.value(u"releaseMediaPath").toString().toStdString();
        z.releaseGainDb = static_cast<float>(boundedDouble(obj, u"releaseGainDb", 0.0, -60.0, 12.0));
        spec.zones.push_back(std::move(z));
    }
    return spec;
}

QJsonObject samplerSpecToJson(const SamplerInstrumentSpec& spec) {
    QJsonArray zonesArr;
    for (const auto& z : spec.zones) {
        QJsonObject obj;
        obj.insert(u"id", QString::fromStdString(z.id));
        obj.insert(u"name", QString::fromStdString(z.name));
        // Always emit `assetId` (empty string for file-only zones) to match the required
        // `assetId: z.string().regex(/^$|^[a-f0-9]{32}$/)` contract in packages/protocol
        // and `SamplerZone.assetId: string` in packages/timeline.
        obj.insert(u"assetId", QString::fromStdString(z.assetId));
        if (!z.mediaPath.empty()) {
            obj.insert(u"mediaPath", QString::fromStdString(z.mediaPath));
        }
        obj.insert(u"rootNote", std::clamp(z.rootNote, 0, 127));
        const int lo = std::clamp(z.lowNote, 0, 127);
        const int hi = std::clamp(z.highNote, lo, 127);
        obj.insert(u"lowNote", lo);
        obj.insert(u"highNote", hi);
        const int loVel = std::clamp(z.lowVelocity, 0, 127);
        const int hiVel = std::clamp(z.highVelocity, loVel, 127);
        obj.insert(u"lowVelocity", loVel);
        obj.insert(u"highVelocity", hiVel);
        obj.insert(u"gainDb", static_cast<double>(std::clamp(z.gainDb, -60.0f, 12.0f)));
        if (z.pan != 0.0f) {
            obj.insert(u"pan", static_cast<double>(std::clamp(z.pan, -1.0f, 1.0f)));
        }
        if (z.tuneCents != 0.0f) {
            obj.insert(u"tuneCents", static_cast<double>(std::clamp(z.tuneCents, -100.0f, 100.0f)));
        }
        if (z.loopMode.has_value()) {
            obj.insert(u"loopMode", QString::fromUtf8(samplerLoopModeName(*z.loopMode)));
        }
        const double lStart = std::clamp(z.loopStart, 0.0, 1.0);
        const double lEnd = std::clamp(z.loopEnd, lStart, 1.0);
        if (lStart > 0.0 || lEnd < 1.0 || z.loopMode == SamplerLoopMode::Sustain) {
            obj.insert(u"loopStart", lStart);
            obj.insert(u"loopEnd", lEnd);
            obj.insert(u"loopCrossfadeMs", static_cast<double>(std::clamp(z.loopCrossfadeMs, 0.0f, 500.0f)));
        }
        if (!z.releaseAssetId.empty()) {
            obj.insert(u"releaseAssetId", QString::fromStdString(z.releaseAssetId));
        }
        if (!z.releaseMediaPath.empty()) {
            obj.insert(u"releaseMediaPath", QString::fromStdString(z.releaseMediaPath));
        }
        if (!z.releaseAssetId.empty() || !z.releaseMediaPath.empty() || z.releaseGainDb != 0.0f) {
            obj.insert(u"releaseGainDb", static_cast<double>(std::clamp(z.releaseGainDb, -60.0f, 12.0f)));
        }
        zonesArr.append(obj);
    }

    QJsonObject out;
    out.insert(u"type", QStringLiteral("sampler"));
    out.insert(u"zones", zonesArr);
    out.insert(u"oneShot", spec.params.oneShot);
    out.insert(u"attackMs", static_cast<double>(std::clamp(spec.params.attackMs, 0.0f, 10000.0f)));
    out.insert(u"decayMs", static_cast<double>(std::clamp(spec.params.decayMs, 0.0f, 10000.0f)));
    out.insert(u"sustain", static_cast<double>(std::clamp(spec.params.sustain, 0.0f, 1.0f)));
    out.insert(u"releaseMs", static_cast<double>(std::clamp(spec.params.releaseMs, 0.0f, 30000.0f)));
    out.insert(u"velocityCurve", static_cast<double>(std::clamp(spec.params.velocityCurve, -1.0f, 1.0f)));
    out.insert(u"glideMs", static_cast<double>(std::clamp(spec.params.glideMs, 0.0f, 2000.0f)));
    out.insert(u"voiceLimit", std::clamp(spec.params.voiceLimit, 1, MultisampleSampler::kMaxVoices));
    out.insert(u"pitchBendRange", static_cast<double>(std::clamp(spec.params.pitchBendRange, 1.0f, 24.0f)));
    out.insert(u"gainDb", static_cast<double>(std::clamp(spec.params.gainDb, -60.0f, 12.0f)));
    return out;
}

std::optional<DecodedAudioBuffer> decodeAudioFileToStereo(const std::string& path, double targetSampleRate,
                                                          std::string* error, std::size_t maxFrames,
                                                          std::function<bool()> cancelled,
                                                          std::size_t* totalDurationFramesOut) {
    if (path.empty() || !std::isfinite(targetSampleRate) || targetSampleRate <= 0.0) {
        if (error) *error = "invalid audio path or sample rate";
        return std::nullopt;
    }
    if (cancelled && cancelled()) {
        if (error) *error = "cancelled";
        return std::nullopt;
    }
    const int rateInt = std::max(8000, static_cast<int>(std::llround(targetSampleRate)));
    auto src = nt::audio::AudioSource::open(path, rateInt, error, cancelled);
    if (!src) return std::nullopt;

    const std::size_t capFrames = (maxFrames > 0) ? maxFrames : kDefaultMaxDecodeFrames;
    const std::size_t containerFrames =
        src->durationFrames() > 0 ? static_cast<std::size_t>(src->durationFrames()) : 0;

    DecodedAudioBuffer out;
    out.sampleRate = static_cast<double>(rateInt);
    if (containerFrames > 0) {
        out.interleavedStereo.reserve(std::min(containerFrames, capFrames) * 2);
    }

    constexpr std::size_t kChunkFrames = 8192;
    std::vector<float> chunk(kChunkFrames * 2);
    std::size_t framesRead = 0;
    while (framesRead < capFrames) {
        if (cancelled && cancelled()) {
            if (error) *error = "cancelled";
            return std::nullopt;
        }
        const std::size_t toRead = std::min(kChunkFrames, capFrames - framesRead);
        const std::int64_t n = src->read(chunk.data(), static_cast<std::int64_t>(toRead));
        if (n <= 0) break;
        const auto countSamples = static_cast<std::size_t>(n) * 2;
        const std::size_t prevSize = out.interleavedStereo.size();
        out.interleavedStereo.resize(prevSize + countSamples);
        for (std::size_t i = 0; i < countSamples; ++i) {
            out.interleavedStereo[prevSize + i] = sanitizeSample(chunk[i]);
        }
        framesRead += static_cast<std::size_t>(n);
    }

    if (cancelled && cancelled()) {
        if (error) *error = "cancelled";
        return std::nullopt;
    }
    if (out.empty()) {
        if (error && error->empty()) *error = "decoded audio stream is empty";
        return std::nullopt;
    }
    if (totalDurationFramesOut) {
        *totalDurationFramesOut = std::max(containerFrames, out.frameCount());
    }
    return out;
}

int detectRootMidiNote(std::span<const float> interleavedStereo, double sampleRate, int fallbackNote) {
    const std::size_t totalFrames = interleavedStereo.size() / 2;
    if (totalFrames < 128 || !std::isfinite(sampleRate) || sampleRate < 8000.0) {
        return std::clamp(fallbackNote, 0, 127);
    }

    // Size the YIN window by duration (~85 ms) so MIDI 24 (~32.7 Hz) fits at 44.1/48/96 kHz.
    constexpr double kWindowSec = 0.085;
    const std::size_t targetWindow = std::clamp<std::size_t>(
        static_cast<std::size_t>(std::llround(sampleRate * kWindowSec)), 2048, 16384);
    const std::size_t winLen = std::min<std::size_t>(totalFrames, targetWindow);
    std::size_t bestStart = 0;
    double bestEnergy = 0.0;
    const std::size_t stride = std::max<std::size_t>(1, winLen / 4);
    for (std::size_t start = 0; start + winLen <= totalFrames; start += stride) {
        double energy = 0.0;
        for (std::size_t i = 0; i < winLen; i += 4) {
            const double l = static_cast<double>(sanitizeSample(interleavedStereo[(start + i) * 2]));
            const double r = static_cast<double>(sanitizeSample(interleavedStereo[(start + i) * 2 + 1]));
            const double m = 0.5 * (l + r);
            energy += m * m;
        }
        if (energy > bestEnergy) {
            bestEnergy = energy;
            bestStart = start;
        }
    }
    const double rms = std::sqrt(bestEnergy / static_cast<double>(std::max<std::size_t>(1, winLen / 4)));
    if (rms < 1.0e-4) {
        return std::clamp(fallbackNote, 0, 127);
    }

    std::vector<double> mono(winLen);
    double mean = 0.0;
    for (std::size_t i = 0; i < winLen; ++i) {
        const double l = static_cast<double>(sanitizeSample(interleavedStereo[(bestStart + i) * 2]));
        const double r = static_cast<double>(sanitizeSample(interleavedStereo[(bestStart + i) * 2 + 1]));
        const double m = 0.5 * (l + r);
        mono[i] = m;
        mean += m;
    }
    mean /= static_cast<double>(winLen);
    for (double& s : mono) s -= mean;

    // YIN cumulative mean normalized difference over MIDI 24 (~32.7 Hz) .. 96 (~2093 Hz).
    const std::size_t halfLen = winLen / 2;
    const std::size_t tauMin = std::max<std::size_t>(2, static_cast<std::size_t>(std::floor(sampleRate / 2200.0)));
    const std::size_t tauMax = std::min<std::size_t>(halfLen - 1, static_cast<std::size_t>(std::ceil(sampleRate / 31.0)));
    if (tauMax <= tauMin + 2) {
        return std::clamp(fallbackNote, 0, 127);
    }

    std::vector<double> diff(tauMax + 1, 0.0);
    for (std::size_t tau = 1; tau <= tauMax; ++tau) {
        double sum = 0.0;
        for (std::size_t j = 0; j < halfLen; ++j) {
            const double delta = mono[j] - mono[j + tau];
            sum += delta * delta;
        }
        diff[tau] = sum;
    }

    std::vector<double> cmndf(tauMax + 1, 1.0);
    double runningSum = 0.0;
    for (std::size_t tau = 1; tau <= tauMax; ++tau) {
        runningSum += diff[tau];
        cmndf[tau] = (runningSum > 1.0e-18) ? (diff[tau] * static_cast<double>(tau) / runningSum) : 1.0;
    }

    constexpr double kYinThreshold = 0.15;
    std::size_t bestTau = 0;
    for (std::size_t tau = tauMin; tau + 1 <= tauMax; ++tau) {
        if (cmndf[tau] < kYinThreshold) {
            while (tau + 1 <= tauMax && cmndf[tau + 1] < cmndf[tau]) {
                ++tau;
            }
            bestTau = tau;
            break;
        }
    }
    if (bestTau == 0) {
        return std::clamp(fallbackNote, 0, 127);
    }

    double refinedTau = static_cast<double>(bestTau);
    if (bestTau > 1 && bestTau < tauMax) {
        const double s0 = cmndf[bestTau - 1];
        const double s1 = cmndf[bestTau];
        const double s2 = cmndf[bestTau + 1];
        const double denom = 2.0 * (2.0 * s1 - s2 - s0);
        if (std::abs(denom) > 1.0e-12) {
            refinedTau += std::clamp((s2 - s0) / denom, -0.5, 0.5);
        }
    }

    const double freqHz = sampleRate / std::max(1.0, refinedTau);
    if (!std::isfinite(freqHz) || freqHz <= 0.0) {
        return std::clamp(fallbackNote, 0, 127);
    }
    const int midi = static_cast<int>(std::llround(69.0 + 12.0 * std::log2(freqHz / 440.0)));
    if (midi < 24 || midi > 96) {
        return std::clamp(fallbackNote, 0, 127);
    }
    return midi;
}

SamplerZoneSpec createSingleFileZone(std::string id, std::string name, std::string assetId,
                                     std::string mediaPath, std::span<const float> previewStereo,
                                     double sampleRate) {
    SamplerZoneSpec z;
    z.id = id.empty() ? std::string("zone-1") : std::move(id);
    z.name = std::move(name);
    z.assetId = std::move(assetId);
    z.mediaPath = std::move(mediaPath);
    z.rootNote = previewStereo.empty() ? 60 : detectRootMidiNote(previewStereo, sampleRate, 60);
    z.lowNote = 0;
    z.highNote = 127;
    z.lowVelocity = 0;
    z.highVelocity = 127;
    z.gainDb = 0.0f;
    z.pan = 0.0f;
    z.tuneCents = 0.0f;
    z.loopStart = 0.0;
    z.loopEnd = 1.0;
    z.loopCrossfadeMs = 10.0f;
    return z;
}

SampleResolver makeProjectFileSampleResolver(const std::string& projectDir,
                                             AssetPathResolver assetPathResolver,
                                             const std::string& assetCacheDir) {
    return [projectDir, assetPathResolver = std::move(assetPathResolver), assetCacheDir](
               const std::string& assetId, const std::string& mediaPath,
               double targetRate) -> std::optional<DecodedAudioBuffer> {
        if (!mediaPath.empty()) {
            QString resolved = QString::fromStdString(mediaPath);
            const QFileInfo fi(resolved);
            if (fi.isRelative() && !projectDir.empty()) {
                resolved = QDir(QString::fromStdString(projectDir)).filePath(resolved);
            }
            if (auto decoded = decodeAudioFileToStereo(resolved.toStdString(), targetRate)) {
                return decoded;
            }
        }

        if (!assetId.empty() && isSafeAssetId(assetId)) {
            if (assetPathResolver) {
                const std::string mapped = assetPathResolver(assetId);
                if (!mapped.empty()) {
                    if (auto decoded = decodeAudioFileToStereo(mapped, targetRate)) {
                        return decoded;
                    }
                }
            }

            const QString qAssetId = QString::fromStdString(assetId);
            if (!projectDir.empty()) {
                const QDir proj(QString::fromStdString(projectDir));
                if (const QString p1 = findAudioFileInDirForId(QDir(proj.filePath(QStringLiteral("assets"))), qAssetId);
                    !p1.isEmpty()) {
                    if (auto decoded = decodeAudioFileToStereo(p1.toStdString(), targetRate)) {
                        return decoded;
                    }
                }
                if (const QString p2 =
                        findAudioFileInDirForId(QDir(proj.filePath(QStringLiteral(".nodetool/assets"))), qAssetId);
                    !p2.isEmpty()) {
                    if (auto decoded = decodeAudioFileToStereo(p2.toStdString(), targetRate)) {
                        return decoded;
                    }
                }
            }

            const QString cacheDir =
                assetCacheDir.empty() ? defaultAssetCacheDir() : QString::fromStdString(assetCacheDir);
            if (const QString cached = findAssetInCacheDir(cacheDir, qAssetId); !cached.isEmpty()) {
                if (auto decoded = decodeAudioFileToStereo(cached.toStdString(), targetRate)) {
                    return decoded;
                }
            }
        }
        return std::nullopt;
    };
}

std::unique_ptr<PreparedSampleSet> prepareSampleSet(const SamplerInstrumentSpec& spec, double sampleRate,
                                                    const SampleResolver& resolver) {
    auto set = std::make_unique<PreparedSampleSet>();
    set->sampleRate = (std::isfinite(sampleRate) && sampleRate > 0.0) ? sampleRate : 48000.0;
    if (!resolver) return set;

    set->zones.reserve(spec.zones.size());
    for (const auto& zSpec : spec.zones) {
        auto decoded = resolver(zSpec.assetId, zSpec.mediaPath, set->sampleRate);
        if (!decoded || decoded->empty()) continue;

        PreparedSamplerZone z;
        z.rootNote = std::clamp(zSpec.rootNote, 0, 127);
        z.lowNote = std::clamp(zSpec.lowNote, 0, 127);
        z.highNote = std::clamp(zSpec.highNote, z.lowNote, 127);
        z.lowVelocity = std::clamp(zSpec.lowVelocity, 0, 127);
        z.highVelocity = std::clamp(zSpec.highVelocity, z.lowVelocity, 127);
        z.linearGain = static_cast<float>(dbToLinear(std::clamp(static_cast<double>(zSpec.gainDb), -60.0, 12.0)));
        const double pan = std::clamp(static_cast<double>(zSpec.pan), -1.0, 1.0);
        const double panA = (pan + 1.0) * (std::numbers::pi * 0.25);
        z.panL = static_cast<float>(std::cos(panA));
        z.panR = static_cast<float>(std::sin(panA));
        z.tuneSemitones = std::clamp(zSpec.tuneCents, -100.0f, 100.0f) / 100.0f;
        z.loopModeOverride = zSpec.loopMode;

        std::vector<float> baseStereo =
            resampleStereoSinc(decoded->interleavedStereo, decoded->sampleRate, set->sampleRate);
        z.mainFrames = baseStereo.size() / 2;
        if (z.mainFrames == 0) continue;

        if (z.loopModeOverride == SamplerLoopMode::OneShot) {
            z.mainMips[0].stereo = std::move(baseStereo);
            buildStereoMipmaps(z.mainMips, false, 0, 0);
        } else if (z.loopModeOverride == SamplerLoopMode::Sustain) {
            z.loopMips[0].stereo = std::move(baseStereo);
            prepareSustainLoop(z, z.loopMips[0].stereo, zSpec.loopStart, zSpec.loopEnd, zSpec.loopCrossfadeMs,
                               set->sampleRate);
            if (z.hasLoop) {
                buildStereoMipmaps(z.loopMips, true, z.loopWrapStart, z.loopEnd);
            } else {
                z.mainMips[0].stereo = std::move(z.loopMips[0].stereo);
                buildStereoMipmaps(z.mainMips, false, 0, 0);
            }
        } else {
            // Inherited loop mode: keep unmodified one-shot PCM/mips separate from crossfaded sustain loop mips.
            std::vector<float> loopStereo = baseStereo;
            prepareSustainLoop(z, loopStereo, zSpec.loopStart, zSpec.loopEnd, zSpec.loopCrossfadeMs, set->sampleRate);
            if (z.hasLoop) {
                z.loopMips[0].stereo = std::move(loopStereo);
                buildStereoMipmaps(z.loopMips, true, z.loopWrapStart, z.loopEnd);
            }
            z.mainMips[0].stereo = std::move(baseStereo);
            buildStereoMipmaps(z.mainMips, false, 0, 0);
        }

        if (!zSpec.releaseAssetId.empty() || !zSpec.releaseMediaPath.empty()) {
            if (auto relDecoded = resolver(zSpec.releaseAssetId, zSpec.releaseMediaPath, set->sampleRate);
                relDecoded && !relDecoded->empty()) {
                z.releaseMips[0].stereo =
                    resampleStereoSinc(relDecoded->interleavedStereo, relDecoded->sampleRate, set->sampleRate);
                z.releaseFrames = z.releaseMips[0].stereo.size() / 2;
                if (z.releaseFrames > 0) {
                    buildStereoMipmaps(z.releaseMips, false, 0, 0);
                }
                z.releaseLinearGain =
                    static_cast<float>(dbToLinear(std::clamp(static_cast<double>(zSpec.releaseGainDb), -60.0, 12.0)));
            }
        }
        set->zones.push_back(std::move(z));
    }
    return set;
}

MultisampleSampler::MultisampleSampler() {
    for (auto& slot : retiredRing_) {
        slot.store(0, std::memory_order_relaxed);
    }
    setParams(params_);
}

MultisampleSampler::~MultisampleSampler() {
    // Control thread destructor after audio thread stops: clears all owned sample sets.
    pendingSet_.store(nullptr, std::memory_order_release);
    activeSet_ = nullptr;
    drainingSets_.fill(nullptr);
    ownedSets_.clear();
}

void MultisampleSampler::prepare(double sampleRate) {
    if (std::isfinite(sampleRate) && sampleRate > 0.0) {
        sampleRate_ = sampleRate;
    }
    msPerFrame_ = 1000.0 / sampleRate_;
    oneMinusDeclickCoef_ = std::exp(-1.0 / (kDeclickTauSec * sampleRate_));
    declickSlew_ = 1.0 - std::exp(-1.0 / (kDeclickSlewSec * sampleRate_));
    pitchBendCoef_ = 1.0 - std::exp(-1.0 / (kPitchBendSmoothTauSec * sampleRate_));
    masterGainSmoother_.prepare(sampleRate_, audio::ParameterSmoother::kDefaultTimeMs, 0.0);
    masterGainSmoother_.snap(static_cast<double>(masterGain_));
    prepared_ = true;
    reset();
}

void MultisampleSampler::publishPreparedSet(std::unique_ptr<PreparedSampleSet> nextSet) {
    (void)reclaimRetired();
    if (!nextSet) return;
    nextSet->generation = ++nextGen_;
    const PreparedSampleSet* raw = nextSet.get();
    ownedSets_.push_back(std::move(nextSet));

    const PreparedSampleSet* overwritten = pendingSet_.exchange(raw, std::memory_order_acq_rel);
    if (overwritten != nullptr) {
        // Never observed by the audio thread: safe to reclaim immediately on control thread.
        const std::uint64_t deadGen = overwritten->generation;
        std::erase_if(ownedSets_, [deadGen](const std::unique_ptr<PreparedSampleSet>& p) {
            return p && p->generation == deadGen;
        });
    }
}

std::size_t MultisampleSampler::reclaimRetired() {
    std::size_t reclaimed = 0;
    std::size_t r = retiredRead_.load(std::memory_order_relaxed);
    const std::size_t w = retiredWrite_.load(std::memory_order_acquire);
    while (r != w) {
        const std::uint64_t gen = retiredRing_[r % kRetiredRingSize].load(std::memory_order_acquire);
        ++r;
        const std::size_t before = ownedSets_.size();
        std::erase_if(ownedSets_, [gen](const std::unique_ptr<PreparedSampleSet>& p) {
            return p && p->generation == gen;
        });
        if (ownedSets_.size() < before) {
            reclaimed += (before - ownedSets_.size());
        }
    }
    retiredRead_.store(r, std::memory_order_release);
    return reclaimed;
}

void MultisampleSampler::pushRetiredGeneration(std::uint64_t gen) noexcept {
    if (gen == 0) return;
    const std::size_t w = retiredWrite_.load(std::memory_order_relaxed);
    const std::size_t r = retiredRead_.load(std::memory_order_acquire);
    if (w - r >= kRetiredRingSize) {
        return;  // Ring full; destructor still owns and cleans up `ownedSets_`.
    }
    retiredRing_[w % kRetiredRingSize].store(gen, std::memory_order_release);
    retiredWrite_.store(w + 1, std::memory_order_release);
}

SamplerLoopMode MultisampleSampler::effectiveLoopMode(const PreparedSamplerZone& z) const noexcept {
    return z.loopModeOverride.value_or(params_.oneShot ? SamplerLoopMode::OneShot : SamplerLoopMode::Sustain);
}

void MultisampleSampler::moveVoiceToDeclick(Voice& v) noexcept {
    if (!v.active) return;
    if (v.elapsedFrames == 0 || v.envLevel <= 1.0e-6 || !v.sampleSet) {
        v.active = false;
        v.declicking = false;
        v.sampleSet = nullptr;
        v.zoneIndex = -1;
        return;
    }

    int targetSlot = -1;
    int quietestSlot = 0;
    double quietestAmp = std::numeric_limits<double>::infinity();
    std::uint64_t quietestAge = std::numeric_limits<std::uint64_t>::max();
    for (int i = 0; i < kMaxVoices; ++i) {
        const auto& dv = declickVoices_[static_cast<std::size_t>(i)];
        if (!dv.active) {
            targetSlot = i;
            break;
        }
        const double amp = dv.declickSm * static_cast<double>(std::max(std::abs(dv.gainL), std::abs(dv.gainR)));
        if (amp + 1.0e-6 < quietestAmp || (std::abs(amp - quietestAmp) <= 1.0e-6 && dv.ageOrder < quietestAge)) {
            quietestAmp = amp;
            quietestAge = dv.ageOrder;
            quietestSlot = i;
        }
    }

    if (targetSlot < 0) {
        targetSlot = quietestSlot;
        const auto& evicted = declickVoices_[static_cast<std::size_t>(targetSlot)];
        if (evicted.active) {
            declickResL_ = sanitizeDouble(declickResL_ + static_cast<double>(evicted.lastOutL));
            declickResR_ = sanitizeDouble(declickResR_ + static_cast<double>(evicted.lastOutR));
        }
    }

    auto& dst = declickVoices_[static_cast<std::size_t>(targetSlot)];
    dst = v;
    dst.gateOn = false;
    if (!dst.declicking) {
        dst.declicking = true;
        dst.declickGain = dst.envLevel;
        dst.declickSm = dst.envLevel;
    }

    v.active = false;
    v.declicking = false;
    v.isReleaseSample = false;
    v.sampleSet = nullptr;
    v.zoneIndex = -1;
    v.lastOutL = 0.0f;
    v.lastOutR = 0.0f;
}

void MultisampleSampler::adoptPendingSet() noexcept {
    const PreparedSampleSet* incoming = pendingSet_.exchange(nullptr, std::memory_order_acq_rel);
    if (!incoming) return;

    checkDrainingRetirement();

    auto retireSetWithResidual = [&](const PreparedSampleSet* deadSet) noexcept {
        auto clearBank = [&](std::array<Voice, kMaxVoices>& bank) noexcept {
            for (auto& v : bank) {
                if (v.active && v.sampleSet == deadSet) {
                    if (v.elapsedFrames > 0) {
                        declickResL_ = sanitizeDouble(declickResL_ + static_cast<double>(v.lastOutL));
                        declickResR_ = sanitizeDouble(declickResR_ + static_cast<double>(v.lastOutR));
                    }
                    v.active = false;
                    v.declicking = false;
                    v.isReleaseSample = false;
                    v.sampleSet = nullptr;
                    v.zoneIndex = -1;
                    v.lastOutL = 0.0f;
                    v.lastOutR = 0.0f;
                }
            }
        };
        clearBank(voices_);
        clearBank(declickVoices_);
        pushRetiredGeneration(deadSet->generation);
    };

    if (activeSet_ != nullptr) {
        bool anyUsingOld = false;
        auto drainBank = [&](std::array<Voice, kMaxVoices>& bank) noexcept {
            for (auto& v : bank) {
                if (v.active && v.sampleSet == activeSet_) {
                    anyUsingOld = true;
                    if (!v.declicking) {
                        v.declicking = true;
                        v.gateOn = false;
                        v.declickGain = v.envLevel;
                        v.declickSm = v.envLevel;
                    }
                }
            }
        };
        drainBank(voices_);
        drainBank(declickVoices_);
        if (anyUsingOld) {
            bool placed = false;
            for (auto& slot : drainingSets_) {
                if (slot == nullptr) {
                    slot = activeSet_;
                    placed = true;
                    break;
                }
            }
            if (!placed) {
                std::size_t oldestIdx = 0;
                for (std::size_t i = 1; i < kMaxDrainingSets; ++i) {
                    if (drainingSets_[i]->generation < drainingSets_[oldestIdx]->generation) {
                        oldestIdx = i;
                    }
                }
                retireSetWithResidual(drainingSets_[oldestIdx]);
                drainingSets_[oldestIdx] = activeSet_;
            }
        } else {
            pushRetiredGeneration(activeSet_->generation);
        }
    }

    activeSet_ = incoming;
    activeGeneration_.store(activeSet_->generation, std::memory_order_release);

    if (incoming->params.has_value()) {
        setParams(*incoming->params);
    }
}

void MultisampleSampler::checkDrainingRetirement() noexcept {
    for (auto& slot : drainingSets_) {
        if (!slot) continue;
        bool inUse = false;
        for (const auto& v : voices_) {
            if (v.active && v.sampleSet == slot) {
                inUse = true;
                break;
            }
        }
        if (!inUse) {
            for (const auto& v : declickVoices_) {
                if (v.active && v.sampleSet == slot) {
                    inUse = true;
                    break;
                }
            }
        }
        if (!inUse) {
            pushRetiredGeneration(slot->generation);
            slot = nullptr;
        }
    }
}

void MultisampleSampler::setParams(const SamplerParams& params) noexcept {
    params_ = params;
    params_.attackMs = std::isfinite(params.attackMs) ? std::clamp(params.attackMs, 0.0f, 10000.0f) : 2.0f;
    params_.decayMs = std::isfinite(params.decayMs) ? std::clamp(params.decayMs, 0.0f, 10000.0f) : 100.0f;
    params_.sustain = std::isfinite(params.sustain) ? std::clamp(params.sustain, 0.0f, 1.0f) : 1.0f;
    params_.releaseMs = std::isfinite(params.releaseMs) ? std::clamp(params.releaseMs, 0.0f, 30000.0f) : 120.0f;
    params_.velocityCurve = std::isfinite(params.velocityCurve) ? std::clamp(params.velocityCurve, -1.0f, 1.0f) : 0.0f;
    params_.glideMs = std::isfinite(params.glideMs) ? std::clamp(params.glideMs, 0.0f, 2000.0f) : 0.0f;
    params_.voiceLimit = std::clamp(params.voiceLimit, 1, kMaxVoices);
    params_.pitchBendRange = std::isfinite(params.pitchBendRange) ? std::clamp(params.pitchBendRange, 1.0f, 24.0f) : 2.0f;
    params_.gainDb = std::isfinite(params.gainDb) ? std::clamp(params.gainDb, -60.0f, 12.0f) : -6.0f;
    masterGain_ = static_cast<float>(dbToLinear(params_.gainDb));

    if (prepared_) {
        (void)masterGainSmoother_.setTarget(static_cast<double>(masterGain_));
    } else {
        masterGainSmoother_.snap(static_cast<double>(masterGain_));
    }

    for (int i = params_.voiceLimit; i < kMaxVoices; ++i) {
        moveVoiceToDeclick(voices_[static_cast<std::size_t>(i)]);
    }
}

bool MultisampleSampler::setParameter(std::string_view name, double value) noexcept {
    if (!std::isfinite(value)) return false;
    SamplerParams next = params_;
    if (name == "gainDb") {
        next.gainDb = static_cast<float>(value);
    } else if (name == "attackMs") {
        next.attackMs = static_cast<float>(value);
    } else if (name == "decayMs") {
        next.decayMs = static_cast<float>(value);
    } else if (name == "sustain") {
        next.sustain = static_cast<float>(value);
    } else if (name == "releaseMs") {
        next.releaseMs = static_cast<float>(value);
    } else if (name == "velocityCurve") {
        next.velocityCurve = static_cast<float>(value);
    } else if (name == "glideMs") {
        next.glideMs = static_cast<float>(value);
    } else if (name == "pitchBendRange") {
        next.pitchBendRange = static_cast<float>(value);
    } else if (name == "oneShot") {
        next.oneShot = (value >= 0.5);
    } else if (name == "voiceLimit") {
        next.voiceLimit = static_cast<int>(std::llround(value));
    } else {
        return false;
    }
    setParams(next);
    return true;
}

void MultisampleSampler::reset() noexcept {
    auto clearBank = [](std::array<Voice, kMaxVoices>& bank) noexcept {
        for (auto& v : bank) {
            v.active = false;
            v.declicking = false;
            v.isReleaseSample = false;
            v.hasClipFade = false;
            v.sampleSet = nullptr;
            v.zoneIndex = -1;
            v.lastOutL = 0.0f;
            v.lastOutR = 0.0f;
        }
    };
    clearBank(voices_);
    clearBank(declickVoices_);
    declickResL_ = 0.0;
    declickResR_ = 0.0;
    pitchBendTarget_ = 0.0;
    pitchBendSmoothed_ = 0.0;
    lastTriggeredMidi_ = -1.0;
    triggerSeq_ = 0;
    if (prepared_) {
        masterGainSmoother_.snap(static_cast<double>(masterGain_));
    }
    checkDrainingRetirement();
}

int MultisampleSampler::activeVoiceCount() const noexcept {
    int count = 0;
    for (int i = 0; i < params_.voiceLimit; ++i) {
        if (voices_[static_cast<std::size_t>(i)].active) ++count;
    }
    return count;
}

bool MultisampleSampler::hasActiveVoices() const noexcept {
    if (activeVoiceCount() > 0) return true;
    for (const auto& dv : declickVoices_) {
        if (dv.active) return true;
    }
    return declickResL_ != 0.0 || declickResR_ != 0.0;
}

int MultisampleSampler::activeReleaseVoiceCount() const noexcept {
    int count = 0;
    for (int i = 0; i < params_.voiceLimit; ++i) {
        const auto& v = voices_[static_cast<std::size_t>(i)];
        if (v.active && v.isReleaseSample) ++count;
    }
    return count;
}

int MultisampleSampler::allocateVoiceSlot() noexcept {
    int oldestDeclickIdx = -1;
    std::uint64_t oldestDeclickOrder = std::numeric_limits<std::uint64_t>::max();
    int oldestReleaseIdx = -1;
    std::uint64_t oldestReleaseOrder = std::numeric_limits<std::uint64_t>::max();
    int oldestIdx = 0;
    std::uint64_t oldestOrder = std::numeric_limits<std::uint64_t>::max();

    for (int i = 0; i < params_.voiceLimit; ++i) {
        const auto& v = voices_[static_cast<std::size_t>(i)];
        if (!v.active) return i;
        if (v.declicking && v.ageOrder < oldestDeclickOrder) {
            oldestDeclickOrder = v.ageOrder;
            oldestDeclickIdx = i;
        }
        if (v.stage == EnvStage::Release && v.ageOrder < oldestReleaseOrder) {
            oldestReleaseOrder = v.ageOrder;
            oldestReleaseIdx = i;
        }
        if (v.ageOrder < oldestOrder) {
            oldestOrder = v.ageOrder;
            oldestIdx = i;
        }
    }
    if (oldestDeclickIdx >= 0) return oldestDeclickIdx;
    if (oldestReleaseIdx >= 0) return oldestReleaseIdx;
    return oldestIdx;
}

void MultisampleSampler::startZoneVoice(const PreparedSampleSet* set, int zoneIdx, int midiNote, int midiVelocity,
                                        float clipGain, const ClipFade& clipFade, bool releaseSample) noexcept {
    if (!set || zoneIdx < 0 || static_cast<std::size_t>(zoneIdx) >= set->zones.size()) return;
    const auto& z = set->zones[static_cast<std::size_t>(zoneIdx)];
    if (releaseSample && z.releaseFrames == 0) return;
    if (!releaseSample && z.mainFrames == 0) return;

    const int slot = allocateVoiceSlot();
    if (slot < 0) return;

    auto& v = voices_[static_cast<std::size_t>(slot)];
    if (v.active) {
        moveVoiceToDeclick(v);
    }

    v.active = true;
    v.declicking = false;
    v.isReleaseSample = releaseSample;
    v.hasLooped = false;
    v.gateOn = !releaseSample;
    v.sampleSet = set;
    v.zoneIndex = zoneIdx;
    v.midiNote = midiNote;
    v.midiVelocity = midiVelocity;
    v.ageOrder = ++triggerSeq_;
    v.elapsedFrames = 0;
    v.pos = 0.0;
    v.lastOutL = 0.0f;
    v.lastOutR = 0.0f;
    v.targetMidiPitch = static_cast<double>(midiNote);
    if (!releaseSample && params_.glideMs > 0.1f && lastTriggeredMidi_ >= 0.0 &&
        std::abs(lastTriggeredMidi_ - v.targetMidiPitch) > 1.0e-4) {
        v.currentMidiPitch = lastTriggeredMidi_;
        const double tauSec = (static_cast<double>(params_.glideMs) / 1000.0) / 3.0;
        v.glideCoef = 1.0 - std::exp(-1.0 / std::max(1.0, tauSec * sampleRate_));
    } else {
        v.currentMidiPitch = v.targetMidiPitch;
        v.glideCoef = 1.0;
    }

    // Master gain is applied on the summed stereo bus via masterGainSmoother_,
    // so per-voice gain excludes masterGain_ and gainDb automation affects sustaining voices.
    const double velNorm = std::clamp(static_cast<double>(midiVelocity) / 127.0, 0.0, 1.0);
    const double curveExp = std::exp2(std::clamp(static_cast<double>(params_.velocityCurve), -1.0, 1.0));
    const float velGain = static_cast<float>(std::pow(velNorm, curveExp));
    const float zoneGain = releaseSample ? (z.linearGain * z.releaseLinearGain) : z.linearGain;
    const float totalGain = velGain * zoneGain * clipGain;
    v.gainL = totalGain * z.panL;
    v.gainR = totalGain * z.panR;
    v.clipGain = clipGain;

    v.hasClipFade = clipFade.active && (clipFade.fades.fadeInMs > 0.0 || clipFade.fades.fadeOutMs > 0.0);
    v.msIntoClip = clipFade.startMsIntoClip;
    v.clipDurationMs = clipFade.clipDurationMs;
    v.clipFades = clipFade.fades;

    if (releaseSample) {
        v.stage = EnvStage::Sustain;
        v.envLevel = 1.0;
        v.sustainLevel = 1.0;
        v.attackInc = 1.0;
        v.decayInc = 1.0;
        v.releaseInc = 1.0;
        v.releaseStartLevel = 1.0;
    } else {
        const double attFrames = (static_cast<double>(params_.attackMs) / 1000.0) * sampleRate_;
        const double decFrames = (static_cast<double>(params_.decayMs) / 1000.0) * sampleRate_;
        const double effReleaseMs = std::max(static_cast<double>(params_.releaseMs), kMinReleaseMs);
        const double relFrames = (effReleaseMs / 1000.0) * sampleRate_;
        v.sustainLevel = static_cast<double>(params_.sustain);
        v.attackInc = attFrames > 1.0 ? (1.0 / attFrames) : 1.0;
        v.decayInc = decFrames > 1.0 ? ((1.0 - v.sustainLevel) / decFrames) : 1.0;
        v.releaseInc = relFrames > 1.0 ? (1.0 / relFrames) : 1.0;
        if (attFrames <= 1.0) {
            v.envLevel = 1.0;
            v.stage = (v.sustainLevel >= 1.0 - 1.0e-6 || decFrames <= 1.0) ? EnvStage::Sustain : EnvStage::Decay;
            if (v.stage == EnvStage::Sustain && decFrames <= 1.0) {
                v.envLevel = v.sustainLevel;
            }
        } else {
            v.envLevel = 0.0;
            v.stage = EnvStage::Attack;
        }
        v.releaseStartLevel = v.envLevel;
    }
    v.declickGain = v.envLevel;
    v.declickSm = v.envLevel;
}

void MultisampleSampler::noteOn(int midiNote, int midiVelocity, float clipGain, const ClipFade& clipFade) noexcept {
    adoptPendingSet();
    if (!prepared_ || !activeSet_) return;
    if (midiNote < 0 || midiNote > 127 || midiVelocity <= 0) return;
    if (!std::isfinite(clipGain) || clipGain <= 0.0f) return;

    const int vel = std::clamp(midiVelocity, 1, 127);
    bool triggeredAny = false;
    for (std::size_t zi = 0; zi < activeSet_->zones.size(); ++zi) {
        const auto& z = activeSet_->zones[zi];
        if (midiNote < z.lowNote || midiNote > z.highNote) continue;
        if (vel < z.lowVelocity || vel > z.highVelocity) continue;
        startZoneVoice(activeSet_, static_cast<int>(zi), midiNote, vel, clipGain, clipFade, false);
        triggeredAny = true;
    }
    if (triggeredAny) {
        lastTriggeredMidi_ = static_cast<double>(midiNote);
    }
}

void MultisampleSampler::noteOff(int midiNote) noexcept {
    adoptPendingSet();
    if (!prepared_ || midiNote < 0 || midiNote > 127) return;

    struct PendingRelease {
        const PreparedSampleSet* set = nullptr;
        int zoneIdx = -1;
        int velocity = 100;
        float clipGain = 1.0f;
        ClipFade clipFade{};
    };
    std::array<PendingRelease, kMaxVoices> releases{};
    int releaseCount = 0;

    const double effReleaseMs = std::max(static_cast<double>(params_.releaseMs), kMinReleaseMs);
    const double relFrames = (effReleaseMs / 1000.0) * sampleRate_;

    for (int i = 0; i < params_.voiceLimit; ++i) {
        auto& v = voices_[static_cast<std::size_t>(i)];
        if (!v.active || v.declicking || v.isReleaseSample || !v.gateOn || v.midiNote != midiNote) {
            continue;
        }
        if (!v.sampleSet || v.zoneIndex < 0 || static_cast<std::size_t>(v.zoneIndex) >= v.sampleSet->zones.size()) {
            continue;
        }
        const auto& z = v.sampleSet->zones[static_cast<std::size_t>(v.zoneIndex)];
        if (effectiveLoopMode(z) == SamplerLoopMode::OneShot) {
            continue;  // One-shot ignores note-off.
        }
        v.gateOn = false;
        if (v.stage != EnvStage::Release && v.stage != EnvStage::Done) {
            v.stage = EnvStage::Release;
            v.releaseStartLevel = v.envLevel;
            v.releaseInc = relFrames > 1.0 ? (v.releaseStartLevel / relFrames) : v.releaseStartLevel;
        }
        if (z.releaseFrames > 0 && releaseCount < kMaxVoices) {
            ClipFade relFade{};
            if (v.hasClipFade) {
                relFade.active = true;
                relFade.startMsIntoClip = v.msIntoClip;
                relFade.clipDurationMs = v.clipDurationMs;
                relFade.fades = v.clipFades;
            }
            releases[static_cast<std::size_t>(releaseCount++)] = {
                v.sampleSet, v.zoneIndex, v.midiVelocity, v.clipGain, relFade};
        }
    }

    for (int r = 0; r < releaseCount; ++r) {
        const auto& rel = releases[static_cast<std::size_t>(r)];
        startZoneVoice(rel.set, rel.zoneIdx, midiNote, rel.velocity, rel.clipGain, rel.clipFade, true);
    }
}

void MultisampleSampler::setPitchBend(float normalizedBend) noexcept {
    if (!std::isfinite(normalizedBend)) return;
    pitchBendTarget_ = std::clamp(static_cast<double>(normalizedBend), -1.0, 1.0);
    if (!prepared_ || !hasActiveVoices()) {
        pitchBendSmoothed_ = pitchBendTarget_;
    }
}

void MultisampleSampler::allNotesOff() noexcept {
    for (int i = 0; i < params_.voiceLimit; ++i) {
        auto& v = voices_[static_cast<std::size_t>(i)];
        if (v.active && !v.declicking) {
            v.gateOn = false;
            v.declicking = true;
            v.declickGain = v.envLevel;
            v.declickSm = v.envLevel;
        }
    }
}

void MultisampleSampler::renderVoiceChunk(Voice& v, float* mixBuf, std::size_t chunk, double endRampFrames,
                                          const double* bendSemisBuf, bool bendVarying,
                                          double constBendSemis) noexcept {
    if (!v.active || !v.sampleSet) return;
    if (v.zoneIndex < 0 || static_cast<std::size_t>(v.zoneIndex) >= v.sampleSet->zones.size()) {
        v.active = false;
        v.sampleSet = nullptr;
        return;
    }

    const auto& z = v.sampleSet->zones[static_cast<std::size_t>(v.zoneIndex)];
    const bool loopActive = !v.isReleaseSample && z.hasLoop && (effectiveLoopMode(z) == SamplerLoopMode::Sustain);
    const auto& mips = v.isReleaseSample ? z.releaseMips : (loopActive ? z.loopMips : z.mainMips);
    const std::size_t sampleFrames = v.isReleaseSample ? z.releaseFrames : z.mainFrames;
    if (sampleFrames == 0 || !mips[0].valid) {
        v.active = false;
        v.sampleSet = nullptr;
        return;
    }

    const double baseLoopStart = static_cast<double>(z.loopWrapStart);
    const double baseLoopEnd = static_cast<double>(z.loopEnd);
    const double baseLoopLen = loopActive ? (baseLoopEnd - baseLoopStart) : 0.0;

    auto selectMip = [&](double step) noexcept -> const PreparedSamplerZone::MipLevel& {
        int idx = 0;
        if (step >= 2.0) {
            idx = std::clamp(static_cast<int>(std::floor(std::log2(step))), 0, PreparedSamplerZone::kMipLevels - 1);
            while (idx > 0 && !mips[static_cast<std::size_t>(idx)].valid) {
                --idx;
            }
        }
        return mips[static_cast<std::size_t>(idx)];
    };

    auto readAt = [&](double basePos, double step, float& sL, float& sR) noexcept {
        const auto& mip = selectMip(step);
        double mipPos = 0.0;
        double mipStep = step;
        if (!loopActive) {
            mipPos = basePos * mip.preScale;
            mipStep = step * mip.preScale;
        } else if (basePos < baseLoopStart) {
            mipPos = basePos * mip.preScale;
            mipStep = step * mip.preScale;
        } else {
            mipPos = static_cast<double>(mip.loopStart) + (basePos - baseLoopStart) * mip.loopScale;
            mipStep = step * mip.loopScale;
        }
        sampleMipContinuousSinc(mip, mipPos, mipStep, loopActive, v.hasLooped, sL, sR);
    };

    double pos = v.pos;
    double curPitch = v.currentMidiPitch;
    const double targetPitch = v.targetMidiPitch;
    const double glideCoef = v.glideCoef;
    const double rootPlusTune = static_cast<double>(z.rootNote) - static_cast<double>(z.tuneSemitones);
    const float gainL = v.gainL;
    const float gainR = v.gainR;
    const bool hasClipFade = v.hasClipFade;
    double msIntoClip = v.msIntoClip;
    std::uint64_t elapsed = v.elapsedFrames;
    float lastL = v.lastOutL;
    float lastR = v.lastOutR;

    if (v.declicking) {
        double dg = v.declickGain;
        double dsm = v.declickSm;
        // Hoist std::exp2() out of the declick sample loop.
        const double semi = (curPitch - rootPlusTune) + constBendSemis;
        const double step = std::exp2(std::clamp(semi, -60.0, 60.0) / 12.0);
        for (std::size_t i = 0; i < chunk; ++i) {
            if (!loopActive && pos >= static_cast<double>(sampleFrames)) {
                v.active = false;
                v.sampleSet = nullptr;
                break;
            }
            dg *= oneMinusDeclickCoef_;
            dsm += (dg - dsm) * declickSlew_;
            if (dsm < kDeclickKillThreshold) {
                v.active = false;
                v.sampleSet = nullptr;
                break;
            }
            float sL = 0.0f, sR = 0.0f;
            readAt(pos, step, sL, sR);
            double amp = dsm;
            if (hasClipFade) {
                amp *= std::max(0.0, audio::clipFadeGain(v.clipFades, v.clipDurationMs, msIntoClip));
                msIntoClip += msPerFrame_;
            }
            const float ampF = static_cast<float>(amp);
            lastL = sanitizeSample(sL * ampF * gainL);
            lastR = sanitizeSample(sR * ampF * gainR);
            mixBuf[i * 2] += lastL;
            mixBuf[i * 2 + 1] += lastR;
            ++elapsed;
            pos += step;
            if (loopActive && pos >= baseLoopEnd) {
                pos = baseLoopStart + std::fmod(pos - baseLoopStart, baseLoopLen);
                v.hasLooped = true;
            }
        }
        v.declickGain = sanitizeDouble(dg);
        v.declickSm = sanitizeDouble(dsm);
        v.envLevel = v.declickSm;
        v.pos = pos;
        v.msIntoClip = msIntoClip;
        v.elapsedFrames = elapsed;
        v.lastOutL = lastL;
        v.lastOutR = lastR;
        return;
    }

    double env = v.envLevel;
    EnvStage stage = v.stage;
    const bool needsGlide = std::abs(targetPitch - curPitch) > 1.0e-5;
    double cachedStep =
        std::exp2(std::clamp((curPitch - rootPlusTune) + (bendVarying ? bendSemisBuf[0] : constBendSemis), -60.0, 60.0) /
                  12.0);

    for (std::size_t i = 0; i < chunk; ++i) {
        if (!loopActive && pos >= static_cast<double>(sampleFrames)) {
            v.active = false;
            v.sampleSet = nullptr;
            break;
        }
        if (stage == EnvStage::Done) {
            v.active = false;
            v.sampleSet = nullptr;
            break;
        }

        // Advance amp ADSR in double precision (prevents float32 ULP stall at 96 kHz).
        switch (stage) {
            case EnvStage::Attack:
                env = std::min(1.0, env + v.attackInc);
                if (env >= 1.0 - 1.0e-6) {
                    env = 1.0;
                    stage = (v.sustainLevel >= 1.0 - 1.0e-6) ? EnvStage::Sustain : EnvStage::Decay;
                }
                break;
            case EnvStage::Decay:
                env = std::max(v.sustainLevel, env - v.decayInc);
                if (env <= v.sustainLevel + 1.0e-9) {
                    env = v.sustainLevel;
                    stage = EnvStage::Sustain;
                }
                break;
            case EnvStage::Sustain:
                break;
            case EnvStage::Release:
                env = std::max(0.0, env - v.releaseInc);
                if (env <= 1.0e-6) {
                    env = 0.0;
                    stage = EnvStage::Done;
                }
                break;
            case EnvStage::Done:
                env = 0.0;
                break;
        }

        bool stepDirty = bendVarying;
        if (needsGlide && std::abs(targetPitch - curPitch) > 1.0e-5) {
            curPitch += (targetPitch - curPitch) * glideCoef;
            if (std::abs(targetPitch - curPitch) <= 1.0e-5) curPitch = targetPitch;
            stepDirty = true;
        }
        if (stepDirty) {
            const double bSemi = bendVarying ? bendSemisBuf[i] : constBendSemis;
            cachedStep = std::exp2(std::clamp((curPitch - rootPlusTune) + bSemi, -60.0, 60.0) / 12.0);
        }

        float sL = 0.0f;
        float sR = 0.0f;
        readAt(pos, cachedStep, sL, sR);

        double amp = env;
        if (!loopActive) {
            const double remaining = (static_cast<double>(sampleFrames) - pos) / std::max(1.0e-6, cachedStep);
            if (remaining < endRampFrames) {
                amp *= std::clamp(remaining / endRampFrames, 0.0, 1.0);
            }
        }
        if (hasClipFade) {
            amp *= std::max(0.0, audio::clipFadeGain(v.clipFades, v.clipDurationMs, msIntoClip));
            msIntoClip += msPerFrame_;
        }
        const float ampF = static_cast<float>(amp);
        lastL = sanitizeSample(sL * ampF * gainL);
        lastR = sanitizeSample(sR * ampF * gainR);
        mixBuf[i * 2] += lastL;
        mixBuf[i * 2 + 1] += lastR;
        ++elapsed;

        pos += cachedStep;
        if (loopActive && pos >= baseLoopEnd) {
            pos = baseLoopStart + std::fmod(pos - baseLoopStart, baseLoopLen);
            v.hasLooped = true;
        }
    }

    v.pos = pos;
    v.currentMidiPitch = curPitch;
    v.envLevel = sanitizeDouble(env);
    v.stage = stage;
    v.msIntoClip = msIntoClip;
    v.elapsedFrames = elapsed;
    v.lastOutL = lastL;
    v.lastOutR = lastR;
}

void MultisampleSampler::renderFrames(std::span<float> stereo, std::size_t startFrame,
                                      std::size_t frameCount) noexcept {
    if (!prepared_ || frameCount == 0) return;
    const std::size_t totalOutFrames = stereo.size() / 2;
    if (startFrame >= totalOutFrames) return;
    const std::size_t totalCount = std::min(frameCount, totalOutFrames - startFrame);

    // Fast path when completely silent: keep smoothers aligned and exit.
    if (!hasActiveVoices()) {
        if (masterGainSmoother_.smoothing()) {
            for (std::size_t i = 0; i < totalCount; ++i) {
                (void)masterGainSmoother_.next();
            }
        }
        pitchBendSmoothed_ = pitchBendTarget_;
        checkDrainingRetirement();
        return;
    }

    const double endRampFrames = std::max(1.0, kEndDeclickSec * sampleRate_);
    std::array<float, kMixChunkFrames * 2> mixBuf{};
    std::array<double, kMixChunkFrames> bendSemisBuf{};
    std::size_t rendered = 0;

    while (rendered < totalCount) {
        const std::size_t chunk = std::min(kMixChunkFrames, totalCount - rendered);
        std::fill_n(mixBuf.data(), chunk * 2, 0.0f);

        const bool bendVarying = std::abs(pitchBendTarget_ - pitchBendSmoothed_) > 1.0e-6;
        double constBendSemis = pitchBendSmoothed_ * static_cast<double>(params_.pitchBendRange);
        if (bendVarying) {
            const double pbRange = static_cast<double>(params_.pitchBendRange);
            for (std::size_t i = 0; i < chunk; ++i) {
                pitchBendSmoothed_ += (pitchBendTarget_ - pitchBendSmoothed_) * pitchBendCoef_;
                if (std::abs(pitchBendTarget_ - pitchBendSmoothed_) <= 1.0e-7) {
                    pitchBendSmoothed_ = pitchBendTarget_;
                }
                bendSemisBuf[i] = pitchBendSmoothed_ * pbRange;
            }
            constBendSemis = bendSemisBuf[0];
        } else {
            pitchBendSmoothed_ = pitchBendTarget_;
            constBendSemis = pitchBendSmoothed_ * static_cast<double>(params_.pitchBendRange);
        }

        for (int vi = 0; vi < params_.voiceLimit; ++vi) {
            auto& v = voices_[static_cast<std::size_t>(vi)];
            if (v.active) {
                renderVoiceChunk(v, mixBuf.data(), chunk, endRampFrames, bendSemisBuf.data(), bendVarying,
                                 constBendSemis);
            }
        }
        for (auto& dv : declickVoices_) {
            if (dv.active) {
                renderVoiceChunk(dv, mixBuf.data(), chunk, endRampFrames, bendSemisBuf.data(), false, constBendSemis);
            }
        }

        if (declickResL_ != 0.0 || declickResR_ != 0.0) {
            double dL = declickResL_;
            double dR = declickResR_;
            for (std::size_t i = 0; i < chunk; ++i) {
                dL *= oneMinusDeclickCoef_;
                dR *= oneMinusDeclickCoef_;
                if (std::abs(dL) < kDeclickKillThreshold && std::abs(dR) < kDeclickKillThreshold) {
                    dL = 0.0;
                    dR = 0.0;
                    break;
                }
                mixBuf[i * 2] += static_cast<float>(dL);
                mixBuf[i * 2 + 1] += static_cast<float>(dR);
            }
            declickResL_ = sanitizeDouble(dL);
            declickResR_ = sanitizeDouble(dR);
        }

        float* const chunkOut = stereo.data() + (startFrame + rendered) * 2;
        if (masterGainSmoother_.smoothing()) {
            for (std::size_t i = 0; i < chunk; ++i) {
                const float g = static_cast<float>(masterGainSmoother_.next());
                chunkOut[i * 2] = sanitizeBusSample(chunkOut[i * 2] + mixBuf[i * 2] * g);
                chunkOut[i * 2 + 1] = sanitizeBusSample(chunkOut[i * 2 + 1] + mixBuf[i * 2 + 1] * g);
            }
        } else {
            const float g = static_cast<float>(masterGainSmoother_.current());
            for (std::size_t i = 0; i < chunk; ++i) {
                chunkOut[i * 2] = sanitizeBusSample(chunkOut[i * 2] + mixBuf[i * 2] * g);
                chunkOut[i * 2 + 1] = sanitizeBusSample(chunkOut[i * 2 + 1] + mixBuf[i * 2 + 1] * g);
            }
        }

        rendered += chunk;
    }

    checkDrainingRetirement();
}

void MultisampleSampler::renderBlock(std::span<float> stereo, std::span<const MidiEvent> events) noexcept {
    adoptPendingSet();
    const std::size_t totalFrames = stereo.size() / 2;
    if (totalFrames == 0) return;

    std::size_t curFrame = 0;
    for (const auto& ev : events) {
        if (ev.frameOffset >= static_cast<int>(totalFrames)) break;
        const std::size_t offset = static_cast<std::size_t>(std::max(0, ev.frameOffset));
        if (offset > curFrame) {
            renderFrames(stereo, curFrame, offset - curFrame);
            curFrame = offset;
        }
        switch (ev.kind) {
            case EventKind::NoteOn:
                noteOn(ev.midiNote, ev.midiVelocity, ev.clipGain);
                break;
            case EventKind::NoteOff:
                noteOff(ev.midiNote);
                break;
            case EventKind::PitchBend:
                setPitchBend(ev.pitchBendNorm);
                break;
            case EventKind::AllNotesOff:
                allNotesOff();
                break;
        }
    }
    if (curFrame < totalFrames) {
        renderFrames(stereo, curFrame, totalFrames - curFrame);
    }
}

MultisampleSamplerProcessor::MultisampleSamplerProcessor(const Timeline& timeline, const Track& track,
                                                         SampleResolver resolver)
    : spec_(samplerSpecFromJson(track.raw.value(u"instrument").toObject())),
      resolver_(std::move(resolver)),
      timelineRaw_(timeline.raw) {
    id = "instrument";
    if (!resolver_) {
        const QString projectDir = timeline.sourcePath.isEmpty()
            ? QString{}
            : QFileInfo(timeline.sourcePath).absolutePath();
        // Capture already-resolved clip asset paths from the timeline snapshot.
        std::unordered_map<std::string, std::string> clipAssetPaths;
        for (const auto& clip : timeline.clips) {
            const std::string aid = clip.raw.value(u"currentAssetId").toString().toStdString();
            if (aid.empty()) continue;
            const std::string& p = !clip.audioPath.empty() ? clip.audioPath : clip.mediaPath;
            if (!p.empty()) {
                clipAssetPaths.try_emplace(aid, p);
            }
        }
        AssetPathResolver clipLookup;
        if (!clipAssetPaths.empty()) {
            clipLookup = [map = std::move(clipAssetPaths)](const std::string& assetId) -> std::string {
                if (const auto it = map.find(assetId); it != map.end()) return it->second;
                return {};
            };
        }
        resolver_ = makeProjectFileSampleResolver(projectDir.toStdString(), std::move(clipLookup));
    }
    sampler_.setParams(spec_.params);

    const double documentBpm = timeline.raw.value(u"tempo").toObject().value(u"bpm").toDouble(120.0);
    bpm_ = std::isfinite(documentBpm) && documentBpm > 0.0 ? documentBpm : 120.0;

    for (const auto& clip : timeline.clips) {
        if (clip.trackId != track.id || clip.mediaType != MediaType::Midi || clip.muted || clip.hidden ||
            clip.durationMs <= 0.0) {
            continue;
        }
        clips_.push_back(MidiClipSnapshot{
            clip.raw,
            clip.startMs,
            clip.durationMs,
            clip.inPointMs,
            static_cast<float>(dbToLinear(clip.volumeDb)),
            audio::resolveClipFades(clip.fadeInMs, clip.fadeOutMs,
                                    audio::parseFadeShape(clip.fadeInShape),
                                    audio::parseFadeShape(clip.fadeOutShape), clip.durationMs),
        });
    }

    const auto stream = audio::vst::buildTrackMidiStream(timeline, track.id, bpm_);
    for (const auto& ev : stream.events) {
        if ((ev.status & 0xF0u) == 0xE0u) {
            const int raw14 = (static_cast<int>(ev.data2) << 7) | static_cast<int>(ev.data1);
            const float norm = std::clamp(static_cast<float>(raw14 - 8192) / 8192.0f, -1.0f, 1.0f);
            pitchBendEvents_.push_back(ScheduledEvent{
                ev.timeMs,
                MultisampleSampler::EventKind::PitchBend,
                0,
                0,
                0.0,
                0.0,
                1.0f,
                {},
                norm,
            });
        }
    }

    rebuildEventsForRate(48000.0);
    reset();
}

void MultisampleSamplerProcessor::rebuildEventsForRate(double rate) {
    const double targetRate = (std::isfinite(rate) && rate > 0.0) ? rate : 48000.0;
    if (std::abs(targetRate - extractedRate_) < 1.0e-3 && !events_.empty()) {
        return;
    }
    extractedRate_ = targetRate;
    const double framesPerMs = targetRate / 1000.0;

    events_.clear();
    events_.reserve(pitchBendEvents_.size() + clips_.size() * 8);
    events_.insert(events_.end(), pitchBendEvents_.begin(), pitchBendEvents_.end());

    for (const auto& clip : clips_) {
        const auto noteEvents = audio::vst::extractMidiNoteEvents(
            clip.raw, bpm_, targetRate, clip.inPointMs, clip.durationMs, timelineRaw_);
        const double clipEndMs = clip.startMs + clip.durationMs;
        for (const auto& ev : noteEvents) {
            const double startMs = clip.startMs + static_cast<double>(ev.startFrame) / framesPerMs;
            if (startMs >= clipEndMs) continue;
            const double offMs = std::min(clipEndMs, clip.startMs + static_cast<double>(ev.gateOffFrame) / framesPerMs);
            events_.push_back(ScheduledEvent{
                startMs,
                MultisampleSampler::EventKind::NoteOn,
                ev.pitch,
                std::clamp(ev.velocity, 1, 127),
                clip.startMs,
                clip.durationMs,
                clip.clipGain,
                clip.fades,
                0.0f,
            });
            if (offMs > startMs) {
                events_.push_back(ScheduledEvent{
                    offMs,
                    MultisampleSampler::EventKind::NoteOff,
                    ev.pitch,
                    0,
                    clip.startMs,
                    clip.durationMs,
                    clip.clipGain,
                    clip.fades,
                    0.0f,
                });
            }
        }
    }

    std::stable_sort(events_.begin(), events_.end(), [](const ScheduledEvent& a, const ScheduledEvent& b) {
        if (a.timeMs != b.timeMs) return a.timeMs < b.timeMs;
        return eventSortPriority(a.kind) < eventSortPriority(b.kind);
    });
}

void MultisampleSamplerProcessor::prepare(double rate) {
    if (std::isfinite(rate) && rate > 0.0) {
        preparedRate_ = rate;
    }
    rebuildEventsForRate(preparedRate_);
    sampler_.prepare(preparedRate_);
    auto set = prepareSampleSet(spec_, preparedRate_, resolver_);
    set->params = spec_.params;
    sampler_.publishPreparedSet(std::move(set));
    reset();
}

void MultisampleSamplerProcessor::publishSpec(const SamplerInstrumentSpec& spec) {
    spec_ = spec;
    auto nextSet = prepareSampleSet(spec_, preparedRate_, resolver_);
    nextSet->params = spec_.params;
    sampler_.publishPreparedSet(std::move(nextSet));
}

void MultisampleSamplerProcessor::publishPreparedSet(std::unique_ptr<PreparedSampleSet> nextSet) {
    sampler_.publishPreparedSet(std::move(nextSet));
}

void MultisampleSamplerProcessor::serviceControlThread() {
    (void)sampler_.reclaimRetired();
}

void MultisampleSamplerProcessor::reset() noexcept {
    audio::BlockProcessor::reset();
    sampler_.reset();
    next_ = 0;
    expectedMs_ = std::numeric_limits<double>::quiet_NaN();
}

bool MultisampleSamplerProcessor::hasPendingOutput(int) const noexcept {
    return next_ < events_.size() || sampler_.hasActiveVoices();
}

bool MultisampleSamplerProcessor::setParameter(std::string_view name, double value) noexcept {
    return sampler_.setParameter(name, value);
}

void MultisampleSamplerProcessor::process(std::span<float> stereo, const audio::BlockContext& context) noexcept {
    if (!std::isfinite(context.timelineMs) || context.msPerFrame <= 0.0) return;
    const std::size_t frames = stereo.size() / 2;
    if (frames == 0) return;

    const double halfFrameMs = 0.5 * context.msPerFrame;
    if (!std::isfinite(expectedMs_) || std::abs(context.timelineMs - expectedMs_) > 0.001) {
        reset();
        const double seekBoundaryMs = context.timelineMs - halfFrameMs;
        const auto it = std::lower_bound(
            events_.begin(), events_.end(), seekBoundaryMs,
            [](const ScheduledEvent& ev, double boundaryMs) { return ev.timeMs < boundaryMs; });
        next_ = static_cast<std::size_t>(it - events_.begin());
        // Restore the latest PitchBend event prior to the seek position.
        for (std::size_t i = next_; i > 0; --i) {
            if (events_[i - 1].kind == MultisampleSampler::EventKind::PitchBend) {
                sampler_.setPitchBend(events_[i - 1].pitchBendNorm);
                break;
            }
        }
    }

    // Adopt any pending sample set + params cleanly before dispatching this block's events.
    sampler_.renderBlock(stereo.subspan(0, 0));

    std::size_t curFrame = 0;
    const double framesDouble = static_cast<double>(frames);
    while (next_ < events_.size()) {
        const auto& ev = events_[next_];
        const double relFrames = (ev.timeMs - context.timelineMs) / context.msPerFrame;
        if (relFrames >= framesDouble - 0.5) break;
        const std::ptrdiff_t rawOffset =
            (relFrames <= -0.5) ? 0 : static_cast<std::ptrdiff_t>(std::floor(relFrames + 0.5));
        if (rawOffset >= static_cast<std::ptrdiff_t>(frames)) break;
        const std::size_t offset =
            static_cast<std::size_t>(std::max<std::ptrdiff_t>(static_cast<std::ptrdiff_t>(curFrame), rawOffset));
        if (offset > curFrame) {
            sampler_.renderFrames(stereo, curFrame, offset - curFrame);
            curFrame = offset;
        }
        switch (ev.kind) {
            case MultisampleSampler::EventKind::NoteOn: {
                const double frameTimelineMs = context.timelineMs + static_cast<double>(offset) * context.msPerFrame;
                MultisampleSampler::ClipFade clipFade{};
                if (ev.fades.fadeInMs > 0.0 || ev.fades.fadeOutMs > 0.0) {
                    clipFade.active = true;
                    clipFade.startMsIntoClip = frameTimelineMs - ev.clipStartMs;
                    clipFade.clipDurationMs = ev.clipDurationMs;
                    clipFade.fades = ev.fades;
                }
                sampler_.noteOn(ev.midiNote, ev.midiVelocity, ev.clipGain, clipFade);
                break;
            }
            case MultisampleSampler::EventKind::NoteOff:
                sampler_.noteOff(ev.midiNote);
                break;
            case MultisampleSampler::EventKind::PitchBend:
                sampler_.setPitchBend(ev.pitchBendNorm);
                break;
            case MultisampleSampler::EventKind::AllNotesOff:
                sampler_.allNotesOff();
                break;
        }
        ++next_;
    }

    if (curFrame < frames) {
        sampler_.renderFrames(stereo, curFrame, frames - curFrame);
    }

    for (float& s : stereo) {
        s = sanitizeBusSample(s);
    }
    expectedMs_ = context.timelineMs + static_cast<double>(frames) * context.msPerFrame;
}

}  // namespace nt::midi
