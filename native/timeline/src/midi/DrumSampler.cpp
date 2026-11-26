// Derived from georgi/fablesynth (https://github.com/georgi/fablesynth) at
// commit ae9fca7 (juce/source/drum/dsp/{DrumEngine,DrumKits,OneShotSamples.gen.*,KitLevels.gen.h,DrumParams}).
// FableSynth is published under PolyForm Noncommercial 1.0.0. Its author, who
// also maintains NodeTool, contributes this code to NodeTool under NodeTool's
// licence (AGPL-3.0).

#include "midi/DrumSampler.h"

#include "midi/PatternExpand.h"
#include "midi/RegionParams.h"

#include <QJsonArray>
#include <QJsonObject>

#include <algorithm>
#include <charconv>
#include <cmath>
#include <limits>
#include <memory>
#include <numbers>
#include <string>
#include <unordered_map>

namespace nt::midi {
namespace {

constexpr double kExpEnd = 0.011108996538242306;  // std::exp(-4.5)
constexpr double kExpNorm = 1.0 / (1.0 - kExpEnd);
constexpr float kDenormalFloor = 1.0e-30f;
constexpr float kChokeKillThreshold = 1.0e-4f;
constexpr float kInt16ToFloat = 1.0f / 32768.0f;
constexpr float kBusSafetyLimit = std::numeric_limits<float>::max() / 4.0f;

constexpr int kSincZeroCrossings = 16;
constexpr int kSincLutSize = 2048;
constexpr double kKaiserBeta = 6.5;
constexpr double kSincCutoffScale = 0.92;
constexpr double kPlayCutoffScale = 0.86;
constexpr int kMipHalfTaps = 16;
constexpr double kMipCutoff = 0.215;  // cycles/sample (0.5 * kPlayCutoffScale / 2.0, matches octave boundary)
constexpr std::size_t kMixChunkFrames = 256;

inline float flushDenormal(float x) noexcept {
    return (std::fabs(x) < kDenormalFloor) ? 0.0f : x;
}

inline float sanitizeSample(float x) noexcept {
    return std::isfinite(x) ? flushDenormal(x) : 0.0f;
}

inline float sanitizeBusSample(float x) noexcept {
    return std::isfinite(x) ? flushDenormal(std::clamp(x, -kBusSafetyLimit, kBusSafetyLimit)) : 0.0f;
}

inline double dbToLinear(double db) noexcept {
    if (!std::isfinite(db)) return 0.0;
    const double clamped = std::clamp(db, -6000.0, DrumSampler::kMaxGainDb);
    return std::min(static_cast<double>(DrumSampler::kMaxLinearGain), std::pow(10.0, clamped / 20.0));
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

// Builds a normalized Kaiser-windowed sinc table for u in [0, 1] spanning
// kSincZeroCrossings zero crossings. Read-only value returned by value (no
// global mutable state).
std::array<float, kSincLutSize + 1> makeKaiserSincLut() noexcept {
    std::array<float, kSincLutSize + 1> lut{};
    const double invI0Beta = 1.0 / besselI0(kKaiserBeta);
    lut[0] = 1.0f;
    for (int i = 1; i <= kSincLutSize; ++i) {
        const double u = static_cast<double>(i) / static_cast<double>(kSincLutSize);
        const double arg = std::numbers::pi * static_cast<double>(kSincZeroCrossings) * u;
        const double sinc = std::sin(arg) / arg;
        const double rad = std::max(0.0, 1.0 - u * u);
        const double win = besselI0(kKaiserBeta * std::sqrt(rad)) * invI0Beta;
        lut[static_cast<std::size_t>(i)] = static_cast<float>(sinc * win);
    }
    return lut;
}

inline double evalSincLut(const std::array<float, kSincLutSize + 1>& lut, double u) noexcept {
    if (u >= 1.0) return 0.0;
    const double scaled = u * static_cast<double>(kSincLutSize);
    const std::size_t idx = static_cast<std::size_t>(scaled);
    const double frac = scaled - static_cast<double>(idx);
    return static_cast<double>(lut[idx]) + frac * (static_cast<double>(lut[idx + 1]) - static_cast<double>(lut[idx]));
}

// Builds a Kaiser-windowed sinc LUT for real-time band-limited playback across
// arbitrary non-octave pitch ratios. Exact integer zero crossings are zeroed so
// down-pitched playback (fc = 0.5) is strictly interpolating at integer positions.
std::array<float, DrumSampler::kPlaySincLutSize + 1> makePlaySincLut() noexcept {
    std::array<float, DrumSampler::kPlaySincLutSize + 1> lut{};
    const double invI0Beta = 1.0 / besselI0(kKaiserBeta);
    constexpr int kStepsPerCrossing = DrumSampler::kPlaySincLutSize / DrumSampler::kPlaySincZeroCrossings;
    lut[0] = 1.0f;
    for (int i = 1; i <= DrumSampler::kPlaySincLutSize; ++i) {
        if (i % kStepsPerCrossing == 0) {
            lut[static_cast<std::size_t>(i)] = 0.0f;
            continue;
        }
        const double u = static_cast<double>(i) / static_cast<double>(DrumSampler::kPlaySincLutSize);
        const double arg = std::numbers::pi * static_cast<double>(DrumSampler::kPlaySincZeroCrossings) * u;
        const double sinc = std::sin(arg) / arg;
        const double rad = std::max(0.0, 1.0 - u * u);
        const double win = besselI0(kKaiserBeta * std::sqrt(rad)) * invI0Beta;
        lut[static_cast<std::size_t>(i)] = static_cast<float>(sinc * win);
    }
    return lut;
}

// Evaluates a band-limited sample at fractional position `pos` using the
// rate-dependent Kaiser-windowed sinc kernel (cutoff scaled to 0.5*kPlayCutoffScale/step
// for upward pitch shifts, 0.5 interpolating for downward pitch shifts).
inline float evalBandlimitedSample(const float* buf, std::size_t sampleLen, double pos, double halfWidth,
                                   double lutScale, float sincGain, const float* lut) noexcept {
    const std::ptrdiff_t srcLen = static_cast<std::ptrdiff_t>(sampleLen);
    const std::ptrdiff_t kStart =
        std::max<std::ptrdiff_t>(0, static_cast<std::ptrdiff_t>(std::ceil(pos - halfWidth)));
    const std::ptrdiff_t kEnd =
        std::min<std::ptrdiff_t>(srcLen - 1, static_cast<std::ptrdiff_t>(std::floor(pos + halfWidth)));
    float acc = 0.0f;
    for (std::ptrdiff_t k = kStart; k <= kEnd; ++k) {
        const double scaled = std::abs(pos - static_cast<double>(k)) * lutScale;
        const std::size_t idx = static_cast<std::size_t>(scaled);
        if (idx < static_cast<std::size_t>(DrumSampler::kPlaySincLutSize)) {
            const float frac = static_cast<float>(scaled - static_cast<double>(idx));
            const float w = lut[idx] + frac * (lut[idx + 1] - lut[idx]);
            acc += w * buf[static_cast<std::size_t>(k)];
        }
    }
    return acc * sincGain;
}

// Symmetric half-kernel weights w[0..kMipHalfTaps] for 2x octave decimation,
// normalized so w[0] + 2 * sum_{k=1}^{kMipHalfTaps} w[k] == 1.0.
std::array<double, kMipHalfTaps + 1> makeHalfBandKernel() noexcept {
    std::array<double, kMipHalfTaps + 1> w{};
    const double invI0Beta = 1.0 / besselI0(kKaiserBeta);
    w[0] = 2.0 * kMipCutoff;
    double sum = w[0];
    for (int k = 1; k <= kMipHalfTaps; ++k) {
        const double u = static_cast<double>(k) / static_cast<double>(kMipHalfTaps);
        const double arg = 2.0 * std::numbers::pi * kMipCutoff * static_cast<double>(k);
        const double sinc = std::sin(arg) / (std::numbers::pi * static_cast<double>(k));
        const double rad = std::max(0.0, 1.0 - u * u);
        const double win = besselI0(kKaiserBeta * std::sqrt(rad)) * invI0Beta;
        w[static_cast<std::size_t>(k)] = sinc * win;
        sum += 2.0 * w[static_cast<std::size_t>(k)];
    }
    const double invSum = (sum > 0.0) ? (1.0 / sum) : 1.0;
    for (double& coeff : w) {
        coeff *= invSum;
    }
    return w;
}

template <typename ReadSampleFn>
void resampleWindowedSinc(std::size_t srcFrames, double srcRate, double dstRate,
                          std::vector<float>& outBuf, std::size_t& outFramesOut,
                          ReadSampleFn&& readSample) {
    if (srcFrames == 0) {
        outBuf.clear();
        outFramesOut = 0;
        return;
    }
    const double scaledFrames = static_cast<double>(srcFrames) * dstRate / srcRate;
    const double clampedFrames = std::clamp(scaledFrames, 1.0, static_cast<double>(DrumSampler::kMaxResampledFrames));
    const std::size_t outFrames = static_cast<std::size_t>(std::llround(clampedFrames));
    outFramesOut = outFrames;
    outBuf.resize(outFrames + 1);

    const auto lut = makeKaiserSincLut();
    const double ratio = srcRate / dstRate;
    const double fc = 0.5 * kSincCutoffScale * std::min(1.0, dstRate / srcRate);
    const double halfWidth = static_cast<double>(kSincZeroCrossings) / (2.0 * fc);
    const double invHalfWidth = 1.0 / halfWidth;
    const std::ptrdiff_t srcLen = static_cast<std::ptrdiff_t>(srcFrames);

    for (std::size_t i = 0; i < outFrames; ++i) {
        const double pos = static_cast<double>(i) * ratio;
        const std::ptrdiff_t kStart = static_cast<std::ptrdiff_t>(std::ceil(pos - halfWidth));
        const std::ptrdiff_t kEnd = static_cast<std::ptrdiff_t>(std::floor(pos + halfWidth));
        double acc = 0.0;
        double wSum = 0.0;
        for (std::ptrdiff_t k = kStart; k <= kEnd; ++k) {
            const double dist = std::abs(pos - static_cast<double>(k));
            const double u = dist * invHalfWidth;
            if (u >= 1.0) continue;
            const double w = evalSincLut(lut, u);
            wSum += w;
            if (k >= 0 && k < srcLen) {
                acc += w * readSample(static_cast<std::size_t>(k));
            }
        }
        const float val = (wSum > 1.0e-12) ? static_cast<float>(acc / wSum) : 0.0f;
        outBuf[i] = sanitizeSample(val);
    }
    outBuf[outFrames] = 0.0f;
}

bool parsePadParamName(std::string_view name, int& padOut, std::string_view& fieldOut) noexcept {
    if (!name.starts_with("pad")) return false;
    name.remove_prefix(3);
    const std::size_t dot = name.find('.');
    if (dot == std::string_view::npos || dot == 0 || dot + 1 >= name.size()) return false;
    int pad = -1;
    const char* begin = name.data();
    const char* end = begin + dot;
    const auto [ptr, ec] = std::from_chars(begin, end, pad);
    if (ec != std::errc{} || ptr != end || pad < 0 || pad >= DrumSampler::kNumPads) return false;
    padOut = pad;
    fieldOut = name.substr(dot + 1);
    return true;
}

inline int clampDoubleToInt(double v, int lo, int hi, int fallback) noexcept {
    if (!std::isfinite(v)) return fallback;
    const double clamped = std::clamp(v, static_cast<double>(lo), static_cast<double>(hi));
    return static_cast<int>(std::llround(clamped));
}

}  // namespace

DrumSampler::PadParams DrumSampler::sanitizePadParams(const PadParams& params) noexcept {
    PadParams p = params;
    p.level = std::isfinite(p.level) ? std::clamp(p.level, 0.0f, 1.2f) : 0.8f;
    p.sampleLevel = std::isfinite(p.sampleLevel) ? std::clamp(p.sampleLevel, 0.0f, 1.2f) : 0.9f;
    p.zoneGain = std::isfinite(p.zoneGain) ? std::clamp(p.zoneGain, 0.0f, kMaxLinearGain) : 1.0f;
    p.pan = std::isfinite(p.pan) ? std::clamp(p.pan, -1.0f, 1.0f) : 0.0f;
    p.tuneSemitones = std::isfinite(p.tuneSemitones) ? std::clamp(p.tuneSemitones, -48.0f, 48.0f) : 0.0f;
    p.attackSec = std::isfinite(p.attackSec) ? std::clamp(p.attackSec, 0.0f, kMaxAttackHoldSec) : 0.0f;
    p.holdSec = std::isfinite(p.holdSec) ? std::clamp(p.holdSec, 0.0f, kMaxAttackHoldSec) : 0.0f;
    p.decaySec = std::isfinite(p.decaySec) ? std::clamp(p.decaySec, kMinDecaySec, kMaxDecaySec) : 0.5f;
    p.decayCurve = std::isfinite(p.decayCurve) ? std::clamp(p.decayCurve, 0.0f, 1.0f) : 0.35f;
    p.velocityToLevel = std::isfinite(p.velocityToLevel) ? std::clamp(p.velocityToLevel, 0.0f, 1.0f) : 1.0f;
    p.chokeGroup = std::clamp(p.chokeGroup, 0, 4);
    return p;
}

DrumSampler::DrumSampler() : playSincLut_(makePlaySincLut()) {
    setGmNoteMap();
    loadKit(DrumKitId::Classic808);
}

void DrumSampler::loadKit(DrumKitId kit) {
    kit_ = kit;
    const auto& preset = stockDrumKit(kit);
    masterGain_ = std::isfinite(preset.masterVolume) ? std::clamp(preset.masterVolume, 0.0f, kMaxLinearGain) : 0.8f;
    masterGainSmoother_.snap(static_cast<double>(masterGain_));
    for (int i = 0; i < kNumPads; ++i) {
        const auto& src = preset.pads[static_cast<std::size_t>(i)];
        auto& dst = pads_[static_cast<std::size_t>(i)];
        dst.stockSampleIndex = src.sampleIndex;
        dst.useCustom = false;
        dst.customSource.clear();
        PadParams pp{};
        pp.level = src.level;
        pp.sampleLevel = src.sampleLevel;
        pp.zoneGain = 1.0f;
        pp.pan = 0.0f;
        pp.tuneSemitones = src.tuneSemitones;
        pp.attackSec = 0.0f;
        pp.holdSec = 0.01f;
        pp.decaySec = src.decaySec;
        pp.decayCurve = 0.35f;
        pp.velocityToLevel = 1.0f;
        pp.chokeGroup = src.chokeGroup;
        dst.params = sanitizePadParams(pp);
    }
    if (prepared_) {
        for (int i = 0; i < kNumPads; ++i) {
            resamplePad(i);
        }
    }
    reset();
}

void DrumSampler::setCustomSample(int pad, std::span<const float> monoSamples, double sourceRate) {
    if (pad < 0 || pad >= kNumPads) return;
    if (!std::isfinite(sourceRate) || sourceRate < kMinSampleRate || sourceRate > kMaxSampleRate) return;
    if (monoSamples.size() > kMaxResampledFrames) return;

    // Deactivate any voices currently pointing at this pad before reallocating its buffers.
    for (auto& v : voices_) {
        if (v.active && v.pad == pad) {
            deactivateVoice(v);
        }
    }
    activeVoicesAtomic_.store(activeCount_, std::memory_order_relaxed);

    auto& dst = pads_[static_cast<std::size_t>(pad)];
    dst.useCustom = true;
    dst.customSourceRate = sourceRate;
    dst.customSource.resize(monoSamples.size());
    for (std::size_t i = 0; i < monoSamples.size(); ++i) {
        dst.customSource[i] = sanitizeSample(monoSamples[i]);
    }
    if (prepared_) {
        resamplePad(pad);
    }
}

void DrumSampler::clearNoteMap() noexcept {
    noteToPad_.fill(-1);
}

void DrumSampler::setGmNoteMap() noexcept {
    noteToPad_.fill(-1);
    // Standard General MIDI drum notes mapped to the 16 DR-1 pad slots.
    constexpr std::array<std::pair<int, int>, 29> kGmMap{{
        {35, 1},   // Acoustic Bass Drum -> Kick 2
        {36, 0},   // Bass Drum 1        -> Kick
        {37, 4},   // Side Stick         -> Rim
        {38, 2},   // Acoustic Snare     -> Snare
        {39, 3},   // Hand Clap          -> Clap
        {40, 2},   // Electric Snare     -> Snare
        {41, 8},   // Low Floor Tom      -> Low Tom
        {42, 5},   // Closed Hi-Hat      -> CH Hat (choke 1)
        {43, 8},   // High Floor Tom     -> Low Tom
        {44, 5},   // Pedal Hi-Hat       -> CH Hat (choke 1)
        {45, 9},   // Low Tom            -> Mid Tom
        {46, 6},   // Open Hi-Hat        -> OH Hat (choke 1)
        {47, 9},   // Low-Mid Tom        -> Mid Tom
        {48, 10},  // Hi-Mid Tom         -> High Tom
        {49, 11},  // Crash Cymbal 1     -> Crash
        {50, 10},  // High Tom           -> High Tom
        {51, 7},   // Ride Cymbal 1      -> Ride
        {52, 11},  // Chinese Cymbal     -> Crash
        {53, 7},   // Ride Bell          -> Ride
        {54, 14},  // Tambourine         -> Maracas / Tamb
        {55, 11},  // Splash Cymbal      -> Crash
        {56, 12},  // Cowbell            -> Cowbell / Perc 1
        {57, 11},  // Crash Cymbal 2     -> Crash
        {59, 7},   // Ride Cymbal 2      -> Ride
        {62, 15},  // Mute Hi Conga      -> High Conga / Perc
        {63, 15},  // Open Hi Conga      -> High Conga / Perc
        {64, 8},   // Low Conga          -> Low Tom
        {70, 14},  // Maracas            -> Maracas / Tamb
        {75, 13},  // Claves             -> Claves / Shaker
    }};
    for (const auto& [note, pad] : kGmMap) {
        noteToPad_[static_cast<std::size_t>(note)] = static_cast<std::int8_t>(pad);
    }
}

void DrumSampler::setSequentialNoteMap(int baseNote) noexcept {
    noteToPad_.fill(-1);
    for (int pad = 0; pad < kNumPads; ++pad) {
        const int note = baseNote + pad;
        if (note >= 0 && note < 128) {
            noteToPad_[static_cast<std::size_t>(note)] = static_cast<std::int8_t>(pad);
        }
    }
}

void DrumSampler::setNotePad(int midiNote, int padIndex) noexcept {
    if (midiNote < 0 || midiNote >= 128) return;
    if (padIndex < 0 || padIndex >= kNumPads) {
        noteToPad_[static_cast<std::size_t>(midiNote)] = -1;
        return;
    }
    noteToPad_[static_cast<std::size_t>(midiNote)] = static_cast<std::int8_t>(padIndex);
}

int DrumSampler::padForMidiNote(int midiNote) const noexcept {
    if (midiNote < 0 || midiNote >= 128) return -1;
    return static_cast<int>(noteToPad_[static_cast<std::size_t>(midiNote)]);
}

void DrumSampler::prepare(double sampleRate) {
    const bool validRate = std::isfinite(sampleRate) && sampleRate >= kMinSampleRate && sampleRate <= kMaxSampleRate;
    const double targetRate = validRate ? sampleRate : sampleRate_;

    // Redundant prepare() at the same sample rate must not reallocate or kill
    // active voices (shared prepared DSP across mixer-only plan snapshots).
    if (prepared_ && std::abs(targetRate - sampleRate_) < 1.0e-3) {
        return;
    }

    sampleRate_ = targetRate;
    msPerFrame_ = 1000.0 / sampleRate_;
    oneMinusChokeCoef_ = std::exp(-1.0 / (kChokeTauSec * sampleRate_));
    chokeSlew_ = 1.0 - std::exp(-1.0 / (kChokeSlewSec * sampleRate_));
    masterGainSmoother_.prepare(sampleRate_, audio::ParameterSmoother::kDefaultTimeMs, 0.0);
    masterGainSmoother_.snap(static_cast<double>(masterGain_));
    for (int pad = 0; pad < kNumPads; ++pad) {
        resamplePad(pad);
    }
    prepared_ = true;
    reset();
}

void DrumSampler::buildMipmaps(PadData& dst) {
    const auto kernel = makeHalfBandKernel();
    for (int level = 1; level < kMipLevels; ++level) {
        const auto& prev = dst.mips[static_cast<std::size_t>(level - 1)];
        auto& cur = dst.mips[static_cast<std::size_t>(level)];
        const std::size_t nextFrames = prev.frames / 2;
        if (nextFrames == 0) {
            cur.samples.clear();
            cur.frames = 0;
            continue;
        }
        cur.frames = nextFrames;
        cur.samples.resize(nextFrames + 1);
        const float* const src = prev.samples.data();
        const std::size_t prevLen = prev.frames;
        for (std::size_t j = 0; j < nextFrames; ++j) {
            const std::size_t c = j * 2;
            double acc = kernel[0] * static_cast<double>(src[c]);
            for (int k = 1; k <= kMipHalfTaps; ++k) {
                const std::size_t uk = static_cast<std::size_t>(k);
                const double left = (c >= uk) ? static_cast<double>(src[c - uk]) : 0.0;
                const double right = (c + uk < prevLen) ? static_cast<double>(src[c + uk]) : 0.0;
                acc += kernel[uk] * (left + right);
            }
            cur.samples[j] = sanitizeSample(static_cast<float>(acc));
        }
        cur.samples[nextFrames] = 0.0f;
    }
}

void DrumSampler::resamplePad(int pad) {
    auto& dst = pads_[static_cast<std::size_t>(pad)];
    auto& base = dst.mips[0];

    if (dst.useCustom) {
        const auto& src = dst.customSource;
        if (src.empty()) {
            for (auto& m : dst.mips) {
                m.samples.clear();
                m.frames = 0;
            }
            return;
        }
        const double srcRate = dst.customSourceRate;
        if (std::abs(sampleRate_ - srcRate) < 1.0e-3) {
            base.frames = std::min(src.size(), kMaxResampledFrames);
            base.samples.resize(base.frames + 1);
            for (std::size_t i = 0; i < base.frames; ++i) {
                base.samples[i] = sanitizeSample(src[i]);
            }
            base.samples[base.frames] = 0.0f;
        } else {
            resampleWindowedSinc(src.size(), srcRate, sampleRate_, base.samples, base.frames,
                                 [&src](std::size_t k) noexcept { return static_cast<double>(sanitizeSample(src[k])); });
        }
        buildMipmaps(dst);
        return;
    }

    const auto bank = stockDrumSamples();
    if (dst.stockSampleIndex < 0 || static_cast<std::size_t>(dst.stockSampleIndex) >= bank.size()) {
        for (auto& m : dst.mips) {
            m.samples.clear();
            m.frames = 0;
        }
        return;
    }
    const auto& stock = bank[static_cast<std::size_t>(dst.stockSampleIndex)];
    if (stock.data.empty() || stock.sampleRate <= 0) {
        for (auto& m : dst.mips) {
            m.samples.clear();
            m.frames = 0;
        }
        return;
    }
    const double srcRate = static_cast<double>(stock.sampleRate);
    if (std::abs(sampleRate_ - srcRate) < 1.0e-3) {
        base.frames = std::min(stock.data.size(), kMaxResampledFrames);
        base.samples.resize(base.frames + 1);
        for (std::size_t i = 0; i < base.frames; ++i) {
            base.samples[i] = sanitizeSample(static_cast<float>(stock.data[i]) * kInt16ToFloat);
        }
        base.samples[base.frames] = 0.0f;
    } else {
        resampleWindowedSinc(stock.data.size(), srcRate, sampleRate_, base.samples, base.frames,
                             [&stock](std::size_t k) noexcept {
                                 return static_cast<double>(stock.data[k]) * static_cast<double>(kInt16ToFloat);
                             });
    }
    buildMipmaps(dst);
}

std::size_t DrumSampler::preparedSampleFrames(int pad) const noexcept {
    if (pad < 0 || pad >= kNumPads) return 0;
    return pads_[static_cast<std::size_t>(pad)].mips[0].frames;
}

void DrumSampler::setPadParams(int pad, const PadParams& params) noexcept {
    if (pad < 0 || pad >= kNumPads) return;
    pads_[static_cast<std::size_t>(pad)].params = sanitizePadParams(params);
}

const DrumSampler::PadParams& DrumSampler::padParams(int pad) const noexcept {
    const int clamped = std::clamp(pad, 0, kNumPads - 1);
    return pads_[static_cast<std::size_t>(clamped)].params;
}

void DrumSampler::setMasterGain(float linearGain) noexcept {
    if (!std::isfinite(linearGain) || linearGain < 0.0f) return;
    masterGain_ = std::clamp(linearGain, 0.0f, kMaxLinearGain);
    if (prepared_) {
        (void)masterGainSmoother_.setTarget(static_cast<double>(masterGain_));
    } else {
        masterGainSmoother_.snap(static_cast<double>(masterGain_));
    }
}

void DrumSampler::deactivateVoice(Voice& v) noexcept {
    if (v.active) {
        v.active = false;
        v.choking = false;
        v.hasClipFade = false;
        v.lastOutL = 0.0f;
        v.lastOutR = 0.0f;
        if (activeCount_ > 0) --activeCount_;
    }
}

void DrumSampler::stealVoiceDeclick(Voice& v) noexcept {
    if (v.active && v.elapsedFrames > 0) {
        declickL_ = sanitizeBusSample(declickL_ + v.lastOutL);
        declickR_ = sanitizeBusSample(declickR_ + v.lastOutR);
    }
    deactivateVoice(v);
}

void DrumSampler::setVoiceLimit(int limit) noexcept {
    voiceLimit_ = std::clamp(limit, 1, kMaxVoices);
    for (int i = voiceLimit_; i < kMaxVoices; ++i) {
        stealVoiceDeclick(voices_[static_cast<std::size_t>(i)]);
    }
    activeVoicesAtomic_.store(activeCount_, std::memory_order_relaxed);
}

void DrumSampler::reset() noexcept {
    for (auto& voice : voices_) {
        voice.active = false;
        voice.choking = false;
        voice.hasClipFade = false;
        voice.pad = -1;
        voice.lastOutL = 0.0f;
        voice.lastOutR = 0.0f;
    }
    activeCount_ = 0;
    activeVoicesAtomic_.store(0, std::memory_order_relaxed);
    declickL_ = 0.0f;
    declickR_ = 0.0f;
    triggerSeq_ = 0;
    if (prepared_) {
        masterGainSmoother_.snap(static_cast<double>(masterGain_));
    }
}

int DrumSampler::activeVoiceCount() const noexcept {
    return activeCount_;
}

int DrumSampler::activeVoiceCountForPad(int pad) const noexcept {
    if (pad < 0 || pad >= kNumPads) return 0;
    int count = 0;
    for (int i = 0; i < voiceLimit_; ++i) {
        const auto& v = voices_[static_cast<std::size_t>(i)];
        if (v.active && v.pad == pad) ++count;
    }
    return count;
}

void DrumSampler::chokeGroupVoices(int chokeGroup) noexcept {
    if (chokeGroup <= 0) return;
    for (int i = 0; i < voiceLimit_; ++i) {
        auto& v = voices_[static_cast<std::size_t>(i)];
        if (!v.active || v.chokeGroup != chokeGroup) continue;
        if (v.elapsedFrames == 0) {
            // Same-frame choke: voice has emitted no audio yet; cancel cleanly
            // without producing a ghost transient.
            deactivateVoice(v);
        } else if (!v.choking) {
            v.choking = true;
            v.chokeGain = v.ampLevel;
            v.chokeSm = v.ampLevel;
        }
    }
    activeVoicesAtomic_.store(activeCount_, std::memory_order_relaxed);
}

int DrumSampler::allocateVoiceSlot() noexcept {
    int bestIdx = 0;
    float bestAmp = std::numeric_limits<float>::infinity();
    std::uint64_t bestAgeOrder = std::numeric_limits<std::uint64_t>::max();

    for (int i = 0; i < voiceLimit_; ++i) {
        const auto& v = voices_[static_cast<std::size_t>(i)];
        if (!v.active) return i;
        const float env = v.choking ? v.chokeSm : v.ampLevel;
        const float amp = env * std::max(std::abs(v.gainL), std::abs(v.gainR));
        const bool lowerAmp = (amp + 1.0e-6f < bestAmp);
        const bool tiedOlder = (std::abs(amp - bestAmp) <= 1.0e-6f && v.ageOrder < bestAgeOrder);
        if (lowerAmp || tiedOlder) {
            bestAmp = amp;
            bestAgeOrder = v.ageOrder;
            bestIdx = i;
        }
    }
    return bestIdx;
}

int DrumSampler::triggerPad(int pad, float velocity, float clipGain, const ClipFade& clipFade) noexcept {
    if (!prepared_ || pad < 0 || pad >= kNumPads) return -1;
    if (!std::isfinite(velocity) || velocity <= 0.0f) return -1;
    if (!std::isfinite(clipGain) || clipGain <= 0.0f) return -1;

    const auto& padData = pads_[static_cast<std::size_t>(pad)];
    if (padData.mips[0].frames == 0) return -1;

    const auto& p = padData.params;
    const float vel = std::clamp(velocity, 0.0f, 1.0f);
    const float v2l = std::isfinite(p.velocityToLevel) ? std::clamp(p.velocityToLevel, 0.0f, 1.0f) : 1.0f;
    const float velGain = 1.0f - v2l * (1.0f - vel);
    const float lvl = std::isfinite(p.level) ? std::clamp(p.level, 0.0f, 1.2f) : 0.8f;
    const float sLvl = std::isfinite(p.sampleLevel) ? std::clamp(p.sampleLevel, 0.0f, 1.2f) : 0.9f;
    const float zGain = std::isfinite(p.zoneGain) ? std::clamp(p.zoneGain, 0.0f, kMaxLinearGain) : 1.0f;
    const float cGain = std::clamp(clipGain, 0.0f, kMaxLinearGain);

    // Master gain is applied on the summed stereo bus via ParameterSmoother (D8),
    // so per-voice gain excludes masterGain_ and stays strictly bounded (D2).
    const double rawGain = static_cast<double>(velGain) * static_cast<double>(lvl * lvl) *
                           static_cast<double>(sLvl * sLvl) * static_cast<double>(zGain) * static_cast<double>(cGain);
    if (!std::isfinite(rawGain) || rawGain <= 0.0) return -1;
    const float voiceGain = static_cast<float>(std::min(rawGain, static_cast<double>(kMaxLinearGain)));

    if (p.chokeGroup > 0) {
        chokeGroupVoices(p.chokeGroup);
    }

    const int slot = allocateVoiceSlot();
    if (slot < 0) return -1;

    auto& v = voices_[static_cast<std::size_t>(slot)];
    if (v.active) {
        stealVoiceDeclick(v);
    }

    v.active = true;
    ++activeCount_;
    v.choking = false;
    v.pad = pad;
    v.chokeGroup = p.chokeGroup;
    v.ageOrder = ++triggerSeq_;
    v.pos = 0.0;
    v.lastOutL = 0.0f;
    v.lastOutR = 0.0f;

    const float tune = std::isfinite(p.tuneSemitones) ? std::clamp(p.tuneSemitones, -48.0f, 48.0f) : 0.0f;
    const double rawStep = (tune == 0.0f) ? 1.0 : std::exp2(static_cast<double>(tune) / 12.0);
    int mip = 0;
    if (rawStep >= 2.0) {
        mip = std::clamp(static_cast<int>(std::floor(std::log2(rawStep))), 0, kMipLevels - 1);
        while (mip > 0 && padData.mips[static_cast<std::size_t>(mip)].frames == 0) {
            --mip;
        }
    }
    v.mipLevel = mip;
    v.step = rawStep / static_cast<double>(1 << mip);
    const double sincFc = (v.step > 1.0) ? (0.5 * kPlayCutoffScale / v.step) : 0.5;
    v.sincHalfWidth = static_cast<double>(kPlaySincZeroCrossings) / (2.0 * sincFc);
    v.sincLutScale = static_cast<double>(kPlaySincLutSize) / v.sincHalfWidth;
    v.sincGain = static_cast<float>(2.0 * sincFc);
    v.elapsedFrames = 0;

    const double attSec = std::isfinite(p.attackSec)
                              ? std::clamp(static_cast<double>(p.attackSec), 0.0, static_cast<double>(kMaxAttackHoldSec))
                              : 0.0;
    const double holdSec = std::isfinite(p.holdSec)
                               ? std::clamp(static_cast<double>(p.holdSec), 0.0, static_cast<double>(kMaxAttackHoldSec))
                               : 0.0;
    const double decSec = std::isfinite(p.decaySec)
                              ? std::clamp(static_cast<double>(p.decaySec), static_cast<double>(kMinDecaySec),
                                           static_cast<double>(kMaxDecaySec))
                              : 0.5;
    v.attFrames = static_cast<std::uint64_t>(std::llround(attSec * sampleRate_));
    v.holdFrames = static_cast<std::uint64_t>(std::llround(holdSec * sampleRate_));
    v.decFrames = std::max<std::uint64_t>(1, static_cast<std::uint64_t>(std::llround(decSec * sampleRate_)));
    v.invAttFrames = v.attFrames > 0 ? 1.0 / static_cast<double>(v.attFrames) : 0.0;
    v.invDecFrames = 1.0 / static_cast<double>(v.decFrames);
    v.expMul = std::exp(-4.5 / static_cast<double>(v.decFrames));
    v.expState = 1.0;
    v.linState = 1.0;
    v.curve = std::isfinite(p.decayCurve) ? std::clamp(p.decayCurve, 0.0f, 1.0f) : 0.35f;

    const double pan = std::isfinite(p.pan) ? std::clamp(static_cast<double>(p.pan), -1.0, 1.0) : 0.0;
    const double panA = (pan + 1.0) * (std::numbers::pi * 0.25);
    v.gainL = flushDenormal(voiceGain * static_cast<float>(std::cos(panA)));
    v.gainR = flushDenormal(voiceGain * static_cast<float>(std::sin(panA)));
    v.ampLevel = (v.attFrames == 0) ? 1.0f : 0.0f;
    v.chokeGain = v.ampLevel;
    v.chokeSm = v.ampLevel;

    v.hasClipFade = clipFade.active && (clipFade.fades.fadeInMs > 0.0 || clipFade.fades.fadeOutMs > 0.0);
    v.msIntoClip = clipFade.startMsIntoClip;
    v.clipDurationMs = clipFade.clipDurationMs;
    v.clipFades = clipFade.fades;

    activeVoicesAtomic_.store(activeCount_, std::memory_order_relaxed);
    return slot;
}

int DrumSampler::triggerMidiNote(int midiNote, float velocity, float clipGain, const ClipFade& clipFade) noexcept {
    const int pad = padForMidiNote(midiNote);
    if (pad < 0) return -1;
    return triggerPad(pad, velocity, clipGain, clipFade);
}

void DrumSampler::renderFrames(std::span<float> stereo, std::size_t startFrame, std::size_t frameCount) noexcept {
    if (!prepared_ || frameCount == 0) return;
    const std::size_t totalFrames = stereo.size() / 2;
    if (startFrame >= totalFrames) return;
    const std::size_t totalCount = std::min(frameCount, totalFrames - startFrame);

    // Fast path when silent: advance master gain smoother if ramping, then exit.
    if (activeCount_ == 0 && declickL_ == 0.0f && declickR_ == 0.0f) {
        if (masterGainSmoother_.smoothing()) {
            for (std::size_t i = 0; i < totalCount; ++i) {
                (void)masterGainSmoother_.next();
            }
        }
        return;
    }

    std::array<float, kMixChunkFrames * 2> mixBuf{};
    std::size_t rendered = 0;
    bool voiceCountChanged = false;

    while (rendered < totalCount) {
        const std::size_t chunk = std::min(kMixChunkFrames, totalCount - rendered);
        std::fill_n(mixBuf.data(), chunk * 2, 0.0f);

        for (int vi = 0; vi < voiceLimit_; ++vi) {
            auto& v = voices_[static_cast<std::size_t>(vi)];
            if (!v.active) continue;

            const auto& mip = pads_[static_cast<std::size_t>(v.pad)].mips[static_cast<std::size_t>(v.mipLevel)];
            const std::size_t sampleLen = mip.frames;
            if (sampleLen == 0) {
                deactivateVoice(v);
                voiceCountChanged = true;
                continue;
            }
            const float* const buf = mip.samples.data();
            const float* const playLut = playSincLut_.data();
            const double maxPos = static_cast<double>(sampleLen);
            const bool unitStep = (v.step == 1.0);
            const double sincHalfWidth = v.sincHalfWidth;
            const double sincLutScale = v.sincLutScale;
            const float sincGain = v.sincGain;
            const std::uint64_t decayStart = v.attFrames + v.holdFrames;
            const std::uint64_t envEnd = decayStart + v.decFrames;
            const float gainL = v.gainL;
            const float gainR = v.gainR;
            const double curve = static_cast<double>(v.curve);
            const bool hasClipFade = v.hasClipFade;

            if (v.choking) {
                double chokeGain = static_cast<double>(v.chokeGain);
                double chokeSm = static_cast<double>(v.chokeSm);
                double pos = v.pos;
                const double step = v.step;
                std::uint64_t elapsed = v.elapsedFrames;
                double msIntoClip = v.msIntoClip;
                float lastL = v.lastOutL;
                float lastR = v.lastOutR;
                bool finished = false;
                for (std::size_t i = 0; i < chunk; ++i) {
                    if (pos >= maxPos) {
                        finished = true;
                        break;
                    }
                    chokeGain *= oneMinusChokeCoef_;
                    chokeSm += (chokeGain - chokeSm) * chokeSlew_;
                    if (chokeSm < static_cast<double>(kChokeKillThreshold)) {
                        finished = true;
                        break;
                    }
                    float sample = 0.0f;
                    if (unitStep) {
                        sample = buf[static_cast<std::size_t>(pos)];
                        pos += 1.0;
                    } else {
                        sample = evalBandlimitedSample(buf, sampleLen, pos, sincHalfWidth, sincLutScale, sincGain,
                                                       playLut);
                        pos += step;
                    }
                    float scaled = sample * static_cast<float>(chokeSm);
                    if (hasClipFade) {
                        const double fg = audio::clipFadeGain(v.clipFades, v.clipDurationMs, msIntoClip);
                        scaled *= static_cast<float>(fg);
                        msIntoClip += msPerFrame_;
                        if (msIntoClip > v.clipDurationMs && v.clipFades.fadeOutMs > 0.0) {
                            lastL = flushDenormal(scaled * gainL);
                            lastR = flushDenormal(scaled * gainR);
                            mixBuf[i * 2] += lastL;
                            mixBuf[i * 2 + 1] += lastR;
                            ++elapsed;
                            finished = true;
                            break;
                        }
                    }
                    lastL = flushDenormal(scaled * gainL);
                    lastR = flushDenormal(scaled * gainR);
                    mixBuf[i * 2] += lastL;
                    mixBuf[i * 2 + 1] += lastR;
                    ++elapsed;
                }
                v.chokeGain = flushDenormal(static_cast<float>(chokeGain));
                v.chokeSm = flushDenormal(static_cast<float>(chokeSm));
                v.ampLevel = v.chokeSm;
                v.pos = pos;
                v.elapsedFrames = elapsed;
                v.msIntoClip = msIntoClip;
                v.lastOutL = lastL;
                v.lastOutR = lastR;
                if (finished) {
                    deactivateVoice(v);
                    voiceCountChanged = true;
                }
                continue;
            }

            double pos = v.pos;
            const double step = v.step;
            std::uint64_t elapsed = v.elapsedFrames;
            double linState = v.linState;
            double expState = v.expState;
            float amp = v.ampLevel;
            double msIntoClip = v.msIntoClip;
            float lastL = v.lastOutL;
            float lastR = v.lastOutR;
            bool finished = false;

            for (std::size_t i = 0; i < chunk; ++i) {
                if (pos >= maxPos || elapsed >= envEnd) {
                    finished = true;
                    break;
                }
                if (elapsed < v.attFrames) {
                    amp = static_cast<float>(static_cast<double>(elapsed) * v.invAttFrames);
                } else if (elapsed < decayStart) {
                    amp = 1.0f;
                } else {
                    const double ex = (expState - kExpEnd) * kExpNorm;
                    const double env = linState + (ex - linState) * curve;
                    amp = env > 0.0 ? static_cast<float>(env) : 0.0f;
                    linState = std::max(0.0, linState - v.invDecFrames);
                    expState *= v.expMul;
                    if (expState < 1.0e-30) expState = 0.0;
                }
                float sample = 0.0f;
                if (unitStep) {
                    sample = buf[static_cast<std::size_t>(pos)];
                    pos += 1.0;
                } else {
                    sample = evalBandlimitedSample(buf, sampleLen, pos, sincHalfWidth, sincLutScale, sincGain,
                                                   playLut);
                    pos += step;
                }
                float scaled = sample * amp;
                if (hasClipFade) {
                    const double fg = audio::clipFadeGain(v.clipFades, v.clipDurationMs, msIntoClip);
                    scaled *= static_cast<float>(fg);
                    msIntoClip += msPerFrame_;
                    if (msIntoClip > v.clipDurationMs && v.clipFades.fadeOutMs > 0.0) {
                        lastL = flushDenormal(scaled * gainL);
                        lastR = flushDenormal(scaled * gainR);
                        mixBuf[i * 2] += lastL;
                        mixBuf[i * 2 + 1] += lastR;
                        ++elapsed;
                        finished = true;
                        break;
                    }
                }
                lastL = flushDenormal(scaled * gainL);
                lastR = flushDenormal(scaled * gainR);
                mixBuf[i * 2] += lastL;
                mixBuf[i * 2 + 1] += lastR;
                ++elapsed;
            }

            v.pos = pos;
            v.elapsedFrames = elapsed;
            v.linState = linState;
            v.expState = expState;
            v.ampLevel = flushDenormal(amp);
            v.msIntoClip = msIntoClip;
            v.lastOutL = lastL;
            v.lastOutR = lastR;
            if (finished) {
                deactivateVoice(v);
                voiceCountChanged = true;
            }
        }

        // Decay stereo declick residual from stolen or voice-limit-cut voices (D1).
        if (declickL_ != 0.0f || declickR_ != 0.0f) {
            double dL = static_cast<double>(declickL_);
            double dR = static_cast<double>(declickR_);
            for (std::size_t i = 0; i < chunk; ++i) {
                dL *= oneMinusChokeCoef_;
                dR *= oneMinusChokeCoef_;
                if (std::abs(dL) < static_cast<double>(kChokeKillThreshold) &&
                    std::abs(dR) < static_cast<double>(kChokeKillThreshold)) {
                    dL = 0.0;
                    dR = 0.0;
                    break;
                }
                mixBuf[i * 2] += static_cast<float>(dL);
                mixBuf[i * 2 + 1] += static_cast<float>(dR);
            }
            declickL_ = flushDenormal(static_cast<float>(dL));
            declickR_ = flushDenormal(static_cast<float>(dR));
        }

        // Apply smoothed master gain to summed voices and add into destination bus (D8, D2).
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

    if (voiceCountChanged) {
        activeVoicesAtomic_.store(activeCount_, std::memory_order_relaxed);
    }
}

void DrumSampler::renderBlock(std::span<float> stereo, std::span<const NoteEvent> events) noexcept {
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
        (void)triggerMidiNote(ev.midiNote, ev.velocity, ev.clipGain);
    }
    if (curFrame < totalFrames) {
        renderFrames(stereo, curFrame, totalFrames - curFrame);
    }
}

bool DrumSamplerProcessor::handlesInstrument(const QJsonObject& instrument) noexcept {
    const auto type = instrument.value(u"type").toString();
    if (type == u"drum") return true;
    if (type == u"sampler") {
        const bool oneShot = instrument.value(u"oneShot").toBool(false);
        const bool hasZones = !instrument.value(u"zones").toArray().isEmpty();
        return oneShot && !hasZones;
    }
    return false;
}

DrumSamplerProcessor::DrumSamplerProcessor(const Timeline& timeline, const Track& track) {
    id = "instrument";
    const auto instrument = track.raw.value(u"instrument").toObject();
    const auto instType = instrument.value(u"type").toString();

    const auto kitStr = instrument.value(u"kit").toString().toLower();
    const auto presetStr = instrument.value(u"preset").toString().toLower();
    const bool useUzu = (kitStr == u"uzu" || kitStr.contains(u"uzu") || presetStr.contains(u"uzu"));
    sampler_.loadKit(useUzu ? DrumKitId::Uzu : DrumKitId::Classic808);

    if (instrument.value(u"gainDb").isDouble()) {
        const double gainDb = instrument.value(u"gainDb").toDouble();
        if (std::isfinite(gainDb)) {
            sampler_.setMasterGain(static_cast<float>(dbToLinear(gainDb)));
        }
    }
    if (instrument.value(u"voiceLimit").isDouble()) {
        sampler_.setVoiceLimit(
            clampDoubleToInt(instrument.value(u"voiceLimit").toDouble(), 1, DrumSampler::kMaxVoices, DrumSampler::kMaxVoices));
    }

    const auto noteMap = instrument.value(u"noteMap").toString().toLower();
    if (noteMap == u"sequential" || noteMap == u"dr1") {
        sampler_.setSequentialNoteMap(clampDoubleToInt(instrument.value(u"baseNote").toDouble(36.0), 0, 127, 36));
    } else if (instType == u"sampler" && !instrument.value(u"zones").toArray().isEmpty()) {
        // Clear leftover GM drum bindings before mapping declared zones (D7).
        sampler_.clearNoteMap();
        const auto zones = instrument.value(u"zones").toArray();
        for (qsizetype z = 0; z < zones.size() && z < DrumSampler::kNumPads; ++z) {
            const auto zone = zones.at(z).toObject();
            const int defaultRoot = 36 + static_cast<int>(z);
            const int root = clampDoubleToInt(zone.value(u"rootNote").toDouble(defaultRoot), 0, 127, defaultRoot);
            const int lo = clampDoubleToInt(zone.value(u"lowNote").toDouble(root), 0, 127, root);
            const int hi = clampDoubleToInt(zone.value(u"highNote").toDouble(root), lo, 127, root);
            for (int n = lo; n <= hi; ++n) {
                sampler_.setNotePad(n, static_cast<int>(z));
            }
            if (zone.value(u"gainDb").isDouble()) {
                const double zGainDb = zone.value(u"gainDb").toDouble();
                if (std::isfinite(zGainDb)) {
                    auto pp = sampler_.padParams(static_cast<int>(z));
                    pp.zoneGain = static_cast<float>(dbToLinear(zGainDb));
                    sampler_.setPadParams(static_cast<int>(z), pp);
                }
            }
        }
    } else {
        sampler_.setGmNoteMap();
    }

    const auto padsArr = instrument.value(u"pads").toArray();
    for (qsizetype i = 0; i < padsArr.size() && i < DrumSampler::kNumPads; ++i) {
        const auto padObj = padsArr.at(i).toObject();
        auto pp = sampler_.padParams(static_cast<int>(i));
        if (padObj.value(u"level").isDouble()) {
            const double v = padObj.value(u"level").toDouble();
            if (std::isfinite(v)) pp.level = std::clamp(static_cast<float>(v), 0.0f, 1.2f);
        }
        if (padObj.value(u"pan").isDouble()) {
            const double v = padObj.value(u"pan").toDouble();
            if (std::isfinite(v)) pp.pan = std::clamp(static_cast<float>(v), -1.0f, 1.0f);
        }
        if (padObj.value(u"tune").isDouble()) {
            const double v = padObj.value(u"tune").toDouble();
            if (std::isfinite(v)) pp.tuneSemitones = std::clamp(static_cast<float>(v), -48.0f, 48.0f);
        }
        if (padObj.value(u"attackMs").isDouble()) {
            const double v = padObj.value(u"attackMs").toDouble();
            if (std::isfinite(v)) {
                pp.attackSec = static_cast<float>(
                    std::clamp(v / 1000.0, 0.0, static_cast<double>(DrumSampler::kMaxAttackHoldSec)));
            }
        }
        if (padObj.value(u"holdMs").isDouble()) {
            const double v = padObj.value(u"holdMs").toDouble();
            if (std::isfinite(v)) {
                pp.holdSec = static_cast<float>(
                    std::clamp(v / 1000.0, 0.0, static_cast<double>(DrumSampler::kMaxAttackHoldSec)));
            }
        }
        if (padObj.value(u"decayMs").isDouble()) {
            const double v = padObj.value(u"decayMs").toDouble();
            if (std::isfinite(v)) {
                pp.decaySec = static_cast<float>(std::clamp(v / 1000.0, static_cast<double>(DrumSampler::kMinDecaySec),
                                                            static_cast<double>(DrumSampler::kMaxDecaySec)));
            }
        }
        if (padObj.value(u"curve").isDouble()) {
            const double v = padObj.value(u"curve").toDouble();
            if (std::isfinite(v)) pp.decayCurve = std::clamp(static_cast<float>(v), 0.0f, 1.0f);
        }
        if (padObj.value(u"velocityToLevel").isDouble()) {
            const double v = padObj.value(u"velocityToLevel").toDouble();
            if (std::isfinite(v)) pp.velocityToLevel = std::clamp(static_cast<float>(v), 0.0f, 1.0f);
        }
        if (padObj.value(u"chokeGroup").isDouble()) {
            pp.chokeGroup = clampDoubleToInt(padObj.value(u"chokeGroup").toDouble(), 0, 4, pp.chokeGroup);
        } else if (padObj.value(u"choke").isDouble()) {
            pp.chokeGroup = clampDoubleToInt(padObj.value(u"choke").toDouble(), 0, 4, pp.chokeGroup);
        }
        sampler_.setPadParams(static_cast<int>(i), pp);
    }

    // Extract MIDI note start times directly in exact double milliseconds (no
    // 48 kHz pre-quantization) so timing is sample-accurate at 44.1 / 48 / 96 kHz (D5).
    const double documentBpm = timeline.raw.value(u"tempo").toObject().value(u"bpm").toDouble(120.0);
    const double bpm = std::isfinite(documentBpm) && documentBpm > 0.0 ? documentBpm : 120.0;
    const double msPerQuarter = 60000.0 / bpm;
    const double tempoOffsetMs = timeline.raw.value(u"tempo").toObject().value(u"offsetMs").toDouble(0.0);

    for (const auto& clip : timeline.clips) {
        if (clip.trackId != track.id || clip.mediaType != MediaType::Midi || clip.muted || clip.hidden ||
            clip.durationMs <= 0.0) {
            continue;
        }
        const bool isPatternClip = clip.raw.value(u"pattern").isObject();
        double windowStart = std::max(0.0, clip.inPointMs);
        QJsonArray clipNotes;
        if (isPatternClip) {
            QJsonObject effectiveClip = clip.raw;
            effectiveClip.insert(QStringLiteral("inPointMs"), windowStart);
            effectiveClip.insert(QStringLiteral("durationMs"), clip.durationMs);
            auto doc = timeline.raw;
            auto tempo = doc.value(u"tempo").toObject();
            tempo.insert(QStringLiteral("bpm"), bpm);
            if (!tempo.contains(u"offsetMs")) tempo.insert(QStringLiteral("offsetMs"), 0.0);
            doc.insert(QStringLiteral("tempo"), tempo);
            clipNotes = expandPatternClipForPlayback(effectiveClip, doc).value(u"notes").toArray();
            windowStart = 0.0;
        } else {
            auto effectiveClip = clip.raw;
            effectiveClip.insert(QStringLiteral("inPointMs"), windowStart);
            effectiveClip.insert(QStringLiteral("durationMs"), clip.durationMs);
            clipNotes = applyRegionParams(effectiveClip, bpm, tempoOffsetMs).value(u"notes").toArray();
        }

        const auto fades = audio::resolveClipFades(clip.fadeInMs, clip.fadeOutMs,
                                                   audio::parseFadeShape(clip.fadeInShape),
                                                   audio::parseFadeShape(clip.fadeOutShape), clip.durationMs);
        const float clipGain = static_cast<float>(dbToLinear(clip.volumeDb));
        const double loop = isPatternClip ? 0.0 : clip.raw.value(u"loopLengthMs").toDouble();
        const double period = std::isfinite(loop) && loop > 0.0 && loop < clip.durationMs ? loop : clip.durationMs;

        for (int k = 0; k * period < clip.durationMs; ++k) {
            const double offset = static_cast<double>(k) * period;
            const double length = std::min(period, clip.durationMs - offset);
            const double windowEnd = windowStart + length;
            for (const auto& entry : clipNotes) {
                if (!entry.isObject()) continue;
                const QJsonObject n = entry.toObject();
                if (n.value(u"muted").toBool(false)) continue;
                const double startTick = n.value(u"startTick").toDouble(-1.0);
                const double durationTick = n.value(u"durationTick").toDouble(0.0);
                if (!std::isfinite(startTick) || startTick < 0.0 || !std::isfinite(durationTick) || durationTick <= 0.0) {
                    continue;
                }
                const double noteStartMs = (startTick / static_cast<double>(kMidiPpq)) * msPerQuarter;
                if (noteStartMs < windowStart || noteStartMs >= windowEnd) continue;
                const double relStartMs = offset + noteStartMs - windowStart;
                const double start = clip.startMs + relStartMs;
                if (start >= clip.startMs + clip.durationMs) continue;
                const int pitch = clampDoubleToInt(n.value(u"pitch").toDouble(60.0), 0, 127, 60);
                const int vel = clampDoubleToInt(n.value(u"velocity").toDouble(100.0), 1, 127, 100);
                notes_.push_back(ScheduledNote{
                    start,
                    pitch,
                    std::clamp(static_cast<float>(vel) / 127.0f, 0.0f, 1.0f),
                    clip.startMs,
                    clip.durationMs,
                    clipGain,
                    fades,
                });
            }
        }
    }
    std::stable_sort(notes_.begin(), notes_.end(),
                     [](const ScheduledNote& a, const ScheduledNote& b) { return a.startMs < b.startMs; });
    reset();
}

void DrumSamplerProcessor::prepare(double rate) {
    sampler_.prepare(rate);
}

void DrumSamplerProcessor::reset() noexcept {
    audio::BlockProcessor::reset();
    sampler_.reset();
    next_ = 0;
    expectedMs_ = std::numeric_limits<double>::quiet_NaN();
}

bool DrumSamplerProcessor::hasPendingOutput(int) const noexcept {
    return next_ < notes_.size() || sampler_.hasActiveVoices();
}

bool DrumSamplerProcessor::supportsParameter(std::string_view name) noexcept {
    if (name == "gainDb" || name == "master.volume") return true;
    int pad = -1;
    std::string_view field;
    if (!parsePadParamName(name, pad, field)) return false;
    return field == "level" || field == "lvl" || field == "pan" || field == "tune" || field == "oscB.tune" ||
           field == "attackMs" || field == "attack" || field == "aenv.att" || field == "holdMs" || field == "hold" ||
           field == "aenv.hold" || field == "decayMs" || field == "decay" || field == "aenv.dec" ||
           field == "curve" || field == "decayCurve" || field == "aenv.curve" || field == "velocityToLevel" ||
           field == "v2l" || field == "choke" || field == "chokeGroup";
}

bool DrumSamplerProcessor::setParameter(std::string_view name, double value) noexcept {
    if (!std::isfinite(value)) return false;
    if (name == "gainDb") {
        sampler_.setMasterGain(static_cast<float>(dbToLinear(value)));
        return true;
    }
    if (name == "master.volume") {
        sampler_.setMasterGain(std::clamp(static_cast<float>(value), 0.0f, 2.0f));
        return true;
    }
    int pad = -1;
    std::string_view field;
    if (!parsePadParamName(name, pad, field)) return false;

    auto pp = sampler_.padParams(pad);
    if (field == "level" || field == "lvl") {
        pp.level = std::clamp(static_cast<float>(value), 0.0f, 1.2f);
    } else if (field == "pan") {
        pp.pan = std::clamp(static_cast<float>(value), -1.0f, 1.0f);
    } else if (field == "tune" || field == "oscB.tune") {
        pp.tuneSemitones = std::clamp(static_cast<float>(value), -48.0f, 48.0f);
    } else if (field == "attackMs") {
        pp.attackSec = static_cast<float>(
            std::clamp(value / 1000.0, 0.0, static_cast<double>(DrumSampler::kMaxAttackHoldSec)));
    } else if (field == "attack" || field == "aenv.att") {
        pp.attackSec = static_cast<float>(
            std::clamp(value, 0.0, static_cast<double>(DrumSampler::kMaxAttackHoldSec)));
    } else if (field == "holdMs") {
        pp.holdSec = static_cast<float>(
            std::clamp(value / 1000.0, 0.0, static_cast<double>(DrumSampler::kMaxAttackHoldSec)));
    } else if (field == "hold" || field == "aenv.hold") {
        pp.holdSec = static_cast<float>(
            std::clamp(value, 0.0, static_cast<double>(DrumSampler::kMaxAttackHoldSec)));
    } else if (field == "decayMs") {
        pp.decaySec = static_cast<float>(std::clamp(value / 1000.0, static_cast<double>(DrumSampler::kMinDecaySec),
                                                    static_cast<double>(DrumSampler::kMaxDecaySec)));
    } else if (field == "decay" || field == "aenv.dec") {
        pp.decaySec = static_cast<float>(std::clamp(value, static_cast<double>(DrumSampler::kMinDecaySec),
                                                    static_cast<double>(DrumSampler::kMaxDecaySec)));
    } else if (field == "curve" || field == "decayCurve" || field == "aenv.curve") {
        pp.decayCurve = std::clamp(static_cast<float>(value), 0.0f, 1.0f);
    } else if (field == "velocityToLevel" || field == "v2l") {
        pp.velocityToLevel = std::clamp(static_cast<float>(value), 0.0f, 1.0f);
    } else if (field == "choke" || field == "chokeGroup") {
        pp.chokeGroup = clampDoubleToInt(value, 0, 4, pp.chokeGroup);
    } else {
        return false;
    }
    sampler_.setPadParams(pad, pp);
    return true;
}

void DrumSamplerProcessor::process(std::span<float> stereo, const audio::BlockContext& context) noexcept {
    if (!std::isfinite(context.timelineMs) || context.msPerFrame <= 0.0) return;
    const std::size_t frames = stereo.size() / 2;
    if (frames == 0) return;

    // Half-frame rounding partition: notes in [frame - 0.5, frame + 0.5) belong
    // to `frame`. Seek uses the identical -0.5 frame boundary so continuous
    // playback and direct seek agree on every block edge and downbeat ULP (D5).
    const double halfFrameMs = 0.5 * context.msPerFrame;
    if (!std::isfinite(expectedMs_) || std::abs(context.timelineMs - expectedMs_) > 0.001) {
        reset();
        const double seekBoundaryMs = context.timelineMs - halfFrameMs;
        const auto it = std::lower_bound(
            notes_.begin(), notes_.end(), seekBoundaryMs,
            [](const ScheduledNote& note, double boundaryMs) { return note.startMs < boundaryMs; });
        next_ = static_cast<std::size_t>(it - notes_.begin());
    }

    std::size_t curFrame = 0;
    const double framesDouble = static_cast<double>(frames);
    while (next_ < notes_.size()) {
        const auto& note = notes_[next_];
        const double relFrames = (note.startMs - context.timelineMs) / context.msPerFrame;
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
        const double frameTimelineMs = context.timelineMs + static_cast<double>(offset) * context.msPerFrame;
        DrumSampler::ClipFade clipFade{};
        if (note.fades.fadeInMs > 0.0 || note.fades.fadeOutMs > 0.0) {
            clipFade.active = true;
            clipFade.startMsIntoClip = frameTimelineMs - note.clipStartMs;
            clipFade.clipDurationMs = note.clipDurationMs;
            clipFade.fades = note.fades;
        }
        (void)sampler_.triggerMidiNote(note.midiNote, note.velocity, note.clipGain, clipFade);
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

void runDrumInstrumentStage(const Timeline& timeline, audio::MixPlan& plan) {
    const bool soloed = std::any_of(timeline.tracks.begin(), timeline.tracks.end(), [](const Track& track) {
        return (track.type == TrackType::Midi || track.type == TrackType::Audio) && track.solo;
    });
    std::unordered_map<std::string, std::size_t> buses;
    buses.reserve(plan.tracks.size());
    for (std::size_t i = 0; i < plan.tracks.size(); ++i) {
        buses.emplace(plan.tracks[i].trackId, i);
    }
    for (const auto& track : timeline.tracks) {
        const auto instrument = track.raw.value(u"instrument").toObject();
        if (track.type != TrackType::Midi || track.muted || (soloed && !track.solo) ||
            !DrumSamplerProcessor::handlesInstrument(instrument)) {
            continue;
        }
        if (const auto existing = buses.find(track.id); existing != buses.end()) {
            const auto& procs = plan.tracks[existing->second].processors;
            if (std::any_of(procs.begin(), procs.end(),
                            [](const auto& p) { return p && p->id == "instrument"; })) {
                continue;
            }
        }
        // Mixer-only plan snapshots share prepared DSP with the active renderer.
        auto processor = std::make_shared<DrumSamplerProcessor>(timeline, track);
        if (!processor->hasPendingOutput(0)) {
            continue;
        }
        const auto [bus, inserted] = buses.try_emplace(track.id, plan.tracks.size());
        if (inserted) {
            audio::TrackPlan item;
            item.trackId = track.id;
            item.gain = std::pow(10.0, track.volumeDb / 20.0);
            item.pan = std::clamp(track.pan, -1.0, 1.0);
            plan.tracks.push_back(std::move(item));
        }
        auto& processors = plan.tracks[bus->second].processors;
        processors.insert(processors.begin(), std::move(processor));
    }
}

audio::MixPlanStageToken registerDrumSamplerStage() {
    return audio::registerMixPlanStage("drumInstrument", runDrumInstrumentStage, -1, true);
}

}  // namespace nt::midi
