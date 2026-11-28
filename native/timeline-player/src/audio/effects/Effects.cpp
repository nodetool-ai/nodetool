#include "audio/effects/Effects.h"
#include "audio/effects/Oversampler.h"
#include "audio/effects/fable/FableColorTimeEffects.h"
#include "audio/effects/fable/FableDynamicsEffects.h"
#include "audio/Mixer.h"
#include "audio/ParameterSmoother.h"
#include "nodetool/kernels.h"
#include <QJsonArray>
#include <QJsonObject>
#include <algorithm>
#include <array>
#include <cmath>
#include <cstdint>
#include <memory>
#include <stdexcept>
#include <unordered_map>
extern "C" {
#include <libavutil/tx.h>
}

namespace nt::audio::effects {
namespace {
double get(const QJsonObject& p, const char* key, double fallback) {
    return p.value(QLatin1String(key)).toDouble(fallback);
}
float lin(double db) { return static_cast<float>(std::pow(10., db / 20.)); }

struct Biquad {
    double b0 = 1, b1 = 0, b2 = 0, a1 = 0, a2 = 0;
    std::array<double, 2> x1{}, x2{}, y1{}, y2{};
    void reset() { x1.fill(0); x2.fill(0); y1.fill(0); y2.fill(0); }
    float tick(float input, int c) {
        // Input/output history remains valid when automation changes coefficients.
        const double y = b0 * input + b1 * x1[c] + b2 * x2[c] - a1 * y1[c] - a2 * y2[c];
        x2[c] = x1[c]; x1[c] = input;
        y2[c] = y1[c]; y1[c] = y;
        return static_cast<float>(y);
    }
    // Web Audio BiquadFilterNode, designed by the kernel the lib.audio nodes
    // use (native/kernels): low/highpass Q is in dB, unlike bandpass.
    void configure(std::string_view type, double frequency, double q, double gain, double rate) {
        double k[NT_BIQUAD_COEFFS_LEN];
        if (nt_biquad_design_webaudio(biquadType(type), rate, frequency, q, gain, k) != NT_OK) {
            // An invalid rate: pass the input through.
            b0 = 1; b1 = b2 = a1 = a2 = 0;
            return;
        }
        b0 = k[0]; b1 = k[1]; b2 = k[2]; a1 = k[3]; a2 = k[4];
    }
    static int biquadType(std::string_view type) {
        if (type == "lowpass") return NT_BIQUAD_LOWPASS;
        if (type == "highpass") return NT_BIQUAD_HIGHPASS;
        if (type == "bandpass") return NT_BIQUAD_BANDPASS;
        if (type == "lowshelf") return NT_BIQUAD_LOWSHELF;
        if (type == "peaking") return NT_BIQUAD_PEAKING;
        // highshelf, and an unknown mode from a malformed document, which the
        // design before the kernel also treated as highshelf.
        return NT_BIQUAD_HIGHSHELF;
    }
};

struct TxDeleter { void operator()(AVTXContext* p) const { av_tx_uninit(&p); } };
using Tx = std::unique_ptr<AVTXContext, TxDeleter>;
// Direct head plus 1024-frame RDFT partitions. The larger FFT partitions
// bound spectral accumulation for long IRs. The direct head keeps zero
// latency, including callers supplying fewer than 128 frames per mixBlock.
class Convolver {
    static constexpr int B = 1024, N = 2 * B, F = B + 1;
    Tx forward_, inverse_;
    av_tx_fn forwardFn_ = nullptr, inverseFn_ = nullptr;
    std::array<float, B> head_{}, history_{}, input_{}, output_{}, overlap_{};
    std::array<float, N> time_{};
    std::array<AVComplexFloat, F> sum_{};
    std::vector<std::array<AVComplexFloat, F>> impulse_, spectra_;
    std::size_t slot_ = 0;
    int cursor_ = 0;
public:
    void prepare(std::span<const float> ir) {
        AVTXContext* context = nullptr;
        float scale = 1;
        if (av_tx_init(&context, &forwardFn_, AV_TX_FLOAT_RDFT, 0, N, &scale, AV_TX_UNALIGNED) < 0) {
            throw std::runtime_error("Cannot prepare reverb RDFT");
        }
        forward_.reset(context); context = nullptr; scale = 1.f / N;
        if (av_tx_init(&context, &inverseFn_, AV_TX_FLOAT_RDFT, 1, N, &scale, AV_TX_UNALIGNED) < 0) {
            throw std::runtime_error("Cannot prepare inverse reverb RDFT");
        }
        inverse_.reset(context);
        head_.fill(0);
        std::copy_n(ir.begin(), std::min<std::size_t>(B, ir.size()), head_.begin());
        const auto partitions = (ir.size() + B - 1) / B - 1;
        impulse_.resize(partitions); spectra_.resize(partitions);
        for (std::size_t p = 0; p < partitions; ++p) {
            time_.fill(0);
            const auto offset = (p + 1) * B;
            std::copy_n(ir.begin() + offset, std::min<std::size_t>(B, ir.size() - offset), time_.begin());
            forwardFn_(forward_.get(), impulse_[p].data(), time_.data(), sizeof(float));
        }
        reset();
    }
    void reset() noexcept {
        history_.fill(0); input_.fill(0); output_.fill(0); overlap_.fill(0);
        for (auto& spectrum : spectra_) { spectrum.fill({0, 0}); }
        slot_ = 0; cursor_ = 0;
    }
    float tick(float x) noexcept {
        history_[cursor_] = x; input_[cursor_] = x;
        double y = output_[cursor_];
        for (int i = 0; i < B; ++i) { y += head_[i] * history_[(cursor_ - i + B) % B]; }
        if (++cursor_ == B) {
            cursor_ = 0;
            if (!impulse_.empty()) {
                std::copy(input_.begin(), input_.end(), time_.begin());
                std::fill(time_.begin() + B, time_.end(), 0);
                forwardFn_(forward_.get(), spectra_[slot_].data(), time_.data(), sizeof(float));
                sum_.fill({0, 0});
                for (std::size_t p = 0; p < impulse_.size(); ++p) {
                    const auto& xspec = spectra_[(slot_ + impulse_.size() - p) % impulse_.size()];
                    for (int f = 0; f < F; ++f) {
                        const auto a = xspec[f], b = impulse_[p][f];
                        sum_[f].re += a.re * b.re - a.im * b.im;
                        sum_[f].im += a.re * b.im + a.im * b.re;
                    }
                }
                inverseFn_(inverse_.get(), time_.data(), sum_.data(), sizeof(AVComplexFloat));
                for (int i = 0; i < B; ++i) { output_[i] = time_[i] + overlap_[i]; overlap_[i] = time_[i + B]; }
                slot_ = (slot_ + 1) % impulse_.size();
            }
        }
        return static_cast<float>(y);
    }
};

class Effect final : public BlockProcessor {
    struct NumericParam { std::string_view key; double value = 0; bool present = false; };
    std::array<NumericParam, 21> params_{{
        {"gainDb"}, {"lowFreq"}, {"lowGainDb"}, {"midFreq"}, {"midQ"}, {"midGainDb"}, {"highFreq"}, {"highGainDb"},
        {"frequency"}, {"q"}, {"thresholdDb"}, {"ratio"}, {"attackMs"}, {"releaseMs"}, {"kneeDb"},
        {"mix"}, {"delayMs"}, {"feedback"}, {"decaySec"}, {"driveDb"}, {"outputDb"}
    }};
    std::string type_, mode_;
    double number(std::string_view key, double fallback) const noexcept {
        for (const auto& p : params_) { if (p.key == key) { return p.present ? p.value : fallback; } }
        return fallback;
    }
    double rate_ = 48000;
    bool prepared_ = false;
    bool hasExpectedMs_ = false;
    double expectedMs_ = 0.0;
    std::array<Biquad, 3> filters_;
    std::vector<float> delay_;
    std::array<Convolver, 2> convolver_;
    std::array<float, 4096> curve_{};
    Oversampler oversampler_;
    std::size_t cursor_ = 0;
    double delayFrames_ = 0;
    double maxDelayFrames_ = 0;
    std::int64_t reverbRemaining_ = 0, reverbLength_ = 0;
    float detector_ = 0;
    float gain_ = 1, wet_ = 1, feedback_ = 0;
    float threshold_ = 0, halfKnee_ = 0, ratio_ = 1, kneePartial_ = 0, attack_ = 0, release_ = 0, makeup_ = 0;

    // Per-block / per-sample parameter smoothers (audio-thread owned, zero allocation).
    ParameterSmoother gainSmooth_;
    ParameterSmoother wetSmooth_;
    ParameterSmoother feedbackSmooth_;
    ParameterSmoother delaySmooth_;
    ParameterSmoother fFreqSmooth_;
    ParameterSmoother fQSmooth_;
    double targetFilterFreq_ = 1000.0;
    std::array<ParameterSmoother, 3> eqFreqSmooth_{};
    std::array<ParameterSmoother, 3> eqGainSmooth_{};
    std::array<double, 3> targetEqFreq_{{200.0, 1000.0, 5000.0}};
    ParameterSmoother eqMidQSmooth_;
    ParameterSmoother compThreshSmooth_;
    ParameterSmoother compRatioSmooth_;
    ParameterSmoother compAttackSmooth_;
    ParameterSmoother compReleaseSmooth_;
    ParameterSmoother compKneeSmooth_;

    static double freqToLog2(double hz) noexcept {
        return std::log2(std::max(1.0, hz));
    }
    static double smoothedFreq(const ParameterSmoother& s, double targetHz) noexcept {
        if (!s.smoothing() && targetHz <= 0.0) { return targetHz; }
        return std::exp2(s.current());
    }
    void applyFilter() noexcept {
        filters_[0].configure(mode_, smoothedFreq(fFreqSmooth_, targetFilterFreq_), fQSmooth_.current(), 0, rate_);
    }
    void applyEqBand(std::size_t band) noexcept {
        if (band == 0) {
            filters_[0].configure("lowshelf", smoothedFreq(eqFreqSmooth_[0], targetEqFreq_[0]), 1, eqGainSmooth_[0].current(), rate_);
        } else if (band == 1) {
            filters_[1].configure("peaking", smoothedFreq(eqFreqSmooth_[1], targetEqFreq_[1]), eqMidQSmooth_.current(), eqGainSmooth_[1].current(), rate_);
        } else {
            filters_[2].configure("highshelf", smoothedFreq(eqFreqSmooth_[2], targetEqFreq_[2]), 1, eqGainSmooth_[2].current(), rate_);
        }
    }
    void applyCompressor() noexcept {
        const float knee = std::clamp(static_cast<float>(compKneeSmooth_.current()), 0.f, 40.f);
        halfKnee_ = knee / 2;
        threshold_ = std::clamp(static_cast<float>(compThreshSmooth_.current()), -100.f, 0.f) + halfKnee_;
        ratio_ = std::clamp(static_cast<float>(compRatioSmooth_.current()), 1.f, 20.f);
        kneePartial_ = knee > 0 ? (1 / ratio_ - 1) / (2 * knee) : 0;
        const float attackSec = std::clamp(static_cast<float>(compAttackSmooth_.current() / 1000.0), 0.f, 1.f);
        const float releaseSec = std::clamp(static_cast<float>(compReleaseSmooth_.current() / 1000.0), 0.f, 1.f);
        attack_ = attackSec > 0 ? std::exp(-1.f / (attackSec * static_cast<float>(rate_))) : 0;
        release_ = releaseSec > 0 ? std::exp(-1.f / (releaseSec * static_cast<float>(rate_))) : 0;
        const float full = threshold_ - threshold_ / ratio_;
        makeup_ = 20.f * std::log10(std::pow(1.f / std::pow(10.f, full / 20.f), 0.6f));
    }
    void snapAllSmoothers() noexcept {
        const auto g = [this](const char* key, double d) { return number(key, d); };
        if (type_ == "gain") {
            gainSmooth_.snap(lin(g("gainDb", 0)));
            gain_ = static_cast<float>(gainSmooth_.current());
        } else if (type_ == "eq3") {
            targetEqFreq_ = {g("lowFreq", 200), g("midFreq", 1000), g("highFreq", 5000)};
            eqFreqSmooth_[0].snap(freqToLog2(targetEqFreq_[0]));
            eqGainSmooth_[0].snap(g("lowGainDb", 0));
            eqFreqSmooth_[1].snap(freqToLog2(targetEqFreq_[1]));
            eqMidQSmooth_.snap(g("midQ", 1));
            eqGainSmooth_[1].snap(g("midGainDb", 0));
            eqFreqSmooth_[2].snap(freqToLog2(targetEqFreq_[2]));
            eqGainSmooth_[2].snap(g("highGainDb", 0));
            for (std::size_t b = 0; b < 3; ++b) { applyEqBand(b); }
        } else if (type_ == "filter") {
            targetFilterFreq_ = g("frequency", 1000);
            fFreqSmooth_.snap(freqToLog2(targetFilterFreq_));
            fQSmooth_.snap(g("q", 1));
            applyFilter();
        } else if (type_ == "compressor") {
            compThreshSmooth_.snap(std::clamp(g("thresholdDb", -24), -100.0, 0.0));
            compRatioSmooth_.snap(std::clamp(g("ratio", 12), 1.0, 20.0));
            compAttackSmooth_.snap(std::clamp(g("attackMs", 3), 0.0, 1000.0));
            compReleaseSmooth_.snap(std::clamp(g("releaseMs", 250), 0.0, 1000.0));
            compKneeSmooth_.snap(std::clamp(g("kneeDb", 30), 0.0, 40.0));
            applyCompressor();
        } else if (type_ == "echo") {
            wetSmooth_.snap(std::clamp(g("mix", 1), 0.0, 1.0));
            wet_ = static_cast<float>(wetSmooth_.current());
            feedbackSmooth_.snap(std::clamp(g("feedback", .4), 0.0, 0.95));
            feedback_ = static_cast<float>(feedbackSmooth_.current());
            const double rawFrames = static_cast<float>(std::clamp(g("delayMs", 350) / 1000, 0.001, 5.)) * rate_;
            const double clampedFrames = std::clamp(rawFrames, static_cast<double>(kMixBlockFrames),
                                                    std::max<double>(kMixBlockFrames, maxDelayFrames_));
            delaySmooth_.snap(clampedFrames);
            delayFrames_ = delaySmooth_.current();
        } else if (type_ == "reverb") {
            wetSmooth_.snap(std::clamp(g("mix", 1), 0.0, 1.0));
            wet_ = static_cast<float>(wetSmooth_.current());
        } else if (type_ == "distortion") {
            gainSmooth_.snap(lin(g("outputDb", 0)));
            gain_ = static_cast<float>(gainSmooth_.current());
        }
    }
public:
    explicit Effect(const QJsonObject& p) : type_(p.value("type").toString().toStdString()),
        mode_(p.value("mode").toString("lowpass").toStdString()) {
        id = p.value("id").toString().toStdString();
        for (auto& param : params_) {
            const auto value = p.value(QString::fromUtf8(param.key.data(), static_cast<qsizetype>(param.key.size())));
            param.present = value.isDouble(); param.value = value.toDouble();
        }
    }
    bool setParameter(std::string_view key, double value) noexcept override {
        if (!std::isfinite(value)) { return false; }
        const bool supported = (type_ == "gain" && key == "gainDb") ||
            (type_ == "eq3" && (key == "lowFreq" || key == "lowGainDb" || key == "midFreq" || key == "midQ" ||
                               key == "midGainDb" || key == "highFreq" || key == "highGainDb")) ||
            (type_ == "filter" && (key == "frequency" || key == "q")) ||
            (type_ == "compressor" && (key == "thresholdDb" || key == "ratio" || key == "attackMs" || key == "releaseMs" || key == "kneeDb")) ||
            (type_ == "echo" && (key == "mix" || key == "feedback" || key == "delayMs")) ||
            (type_ == "reverb" && key == "mix") ||
            (type_ == "distortion" && key == "outputDb");
        if (!supported) { return false; }
        for (auto& param : params_) {
            if (param.key != key) { continue; }
            param.value = value;
            param.present = true;
            if (!prepared_) { return true; }
            if (type_ == "gain" && key == "gainDb") {
                if (gainSmooth_.setTarget(lin(value))) { gain_ = static_cast<float>(gainSmooth_.current()); }
            } else if (type_ == "filter") {
                if (key == "frequency") {
                    targetFilterFreq_ = value;
                    if (fFreqSmooth_.setTarget(freqToLog2(value))) { applyFilter(); }
                } else if (key == "q") {
                    if (fQSmooth_.setTarget(value)) { applyFilter(); }
                }
            } else if (type_ == "eq3") {
                if (key == "lowFreq") {
                    targetEqFreq_[0] = value;
                    if (eqFreqSmooth_[0].setTarget(freqToLog2(value))) { applyEqBand(0); }
                } else if (key == "lowGainDb") {
                    if (eqGainSmooth_[0].setTarget(value)) { applyEqBand(0); }
                } else if (key == "midFreq") {
                    targetEqFreq_[1] = value;
                    if (eqFreqSmooth_[1].setTarget(freqToLog2(value))) { applyEqBand(1); }
                } else if (key == "midQ") {
                    if (eqMidQSmooth_.setTarget(value)) { applyEqBand(1); }
                } else if (key == "midGainDb") {
                    if (eqGainSmooth_[1].setTarget(value)) { applyEqBand(1); }
                } else if (key == "highFreq") {
                    targetEqFreq_[2] = value;
                    if (eqFreqSmooth_[2].setTarget(freqToLog2(value))) { applyEqBand(2); }
                } else if (key == "highGainDb") {
                    if (eqGainSmooth_[2].setTarget(value)) { applyEqBand(2); }
                }
            } else if (type_ == "compressor") {
                bool immediate = false;
                if (key == "thresholdDb") { immediate = compThreshSmooth_.setTarget(std::clamp(value, -100.0, 0.0)); }
                else if (key == "ratio") { immediate = compRatioSmooth_.setTarget(std::clamp(value, 1.0, 20.0)); }
                else if (key == "attackMs") { immediate = compAttackSmooth_.setTarget(std::clamp(value, 0.0, 1000.0)); }
                else if (key == "releaseMs") { immediate = compReleaseSmooth_.setTarget(std::clamp(value, 0.0, 1000.0)); }
                else if (key == "kneeDb") { immediate = compKneeSmooth_.setTarget(std::clamp(value, 0.0, 40.0)); }
                if (immediate) { applyCompressor(); }
            } else if (type_ == "echo") {
                if (key == "mix") {
                    if (wetSmooth_.setTarget(std::clamp(value, 0.0, 1.0))) { wet_ = static_cast<float>(wetSmooth_.current()); }
                } else if (key == "feedback") {
                    if (feedbackSmooth_.setTarget(std::clamp(value, 0.0, 0.95))) { feedback_ = static_cast<float>(feedbackSmooth_.current()); }
                } else if (key == "delayMs") {
                    const double rawFrames = static_cast<float>(std::clamp(value / 1000.0, 0.001, 5.0)) * rate_;
                    const double clampedFrames = std::clamp(rawFrames, static_cast<double>(kMixBlockFrames),
                                                            std::max<double>(kMixBlockFrames, maxDelayFrames_));
                    if (delaySmooth_.setTarget(clampedFrames)) { delayFrames_ = delaySmooth_.current(); }
                }
            } else if (type_ == "reverb" && key == "mix") {
                if (wetSmooth_.setTarget(std::clamp(value, 0.0, 1.0))) { wet_ = static_cast<float>(wetSmooth_.current()); }
            } else if (type_ == "distortion" && key == "outputDb") {
                if (gainSmooth_.setTarget(lin(value))) { gain_ = static_cast<float>(gainSmooth_.current()); }
            }
            return true;
        }
        return false;
    }
    void prepare(double rate) override {
        rate_ = rate;
        constexpr double kMs = ParameterSmoother::kDefaultTimeMs;
        gainSmooth_.prepare(rate, kMs);
        wetSmooth_.prepare(rate, kMs);
        feedbackSmooth_.prepare(rate, kMs);
        delaySmooth_.prepare(rate, kMs);
        fFreqSmooth_.prepare(rate, kMs);
        fQSmooth_.prepare(rate, kMs);
        for (std::size_t b = 0; b < 3; ++b) {
            eqFreqSmooth_[b].prepare(rate, kMs);
            eqGainSmooth_[b].prepare(rate, kMs);
        }
        eqMidQSmooth_.prepare(rate, kMs);
        compThreshSmooth_.prepare(rate, kMs);
        compRatioSmooth_.prepare(rate, kMs);
        compAttackSmooth_.prepare(rate, kMs);
        compReleaseSmooth_.prepare(rate, kMs);
        compKneeSmooth_.prepare(rate, kMs);
        wet_ = static_cast<float>(std::clamp(number("mix", 1), 0., 1.));
        if (type_ == "echo") {
            delayFrames_ = static_cast<float>(std::clamp(number("delayMs", 350) / 1000, 0.001, 5.)) * rate;
            // A feedback cycle's DelayNode is at least one render quantum.
            delayFrames_ = std::max<double>(kMixBlockFrames, delayFrames_);
            // Preallocate the full 5.0 s max delay line on prepare() so upward delayMs
            // changes work without audio-thread reallocation or clamping to the initial delay.
            constexpr double kMaxEchoDelaySec = 5.0;
            const std::size_t capFrames = std::max<std::size_t>(
                static_cast<std::size_t>(std::ceil(kMaxEchoDelaySec * rate)) + 1,
                static_cast<std::size_t>(std::ceil(delayFrames_)) + 1);
            delay_.resize(capFrames * 2);
            maxDelayFrames_ = static_cast<double>(capFrames - 1);
            feedback_ = static_cast<float>(std::clamp(number("feedback", .4), 0., .95));
        } else if (type_ == "compressor") {
            delay_.resize(static_cast<std::size_t>(std::ceil(rate * .006 / 128)) * 128 * 2);
        } else if (type_ == "reverb") {
            const auto length = std::max<std::size_t>(1, std::llround(std::max(.05, number("decaySec", 2)) * rate));
            reverbLength_ = static_cast<std::int64_t>(length);
            std::array<std::vector<float>, 2> ir;
            float energy = 0;
            for (int c = 0; c < 2; ++c) {
                ir[c].resize(length); std::uint32_t seed = c + 1;
                float channelEnergy = 0;
                for (std::size_t i = 0; i < length; ++i) {
                    // Keep PRNG as a double until the Float32Array assignment.
                    seed += 0x6d2b79f5u;
                    auto t = (seed ^ (seed >> 15)) * (1u | seed);
                    t = (t + (t ^ (t >> 7)) * (61u | t)) ^ t;
                    const double noise = static_cast<double>(t ^ (t >> 14)) / 4294967296. * 2 - 1;
                    ir[c][i] = static_cast<float>(noise * std::exp(-std::log(1000.) * i / length));
                    channelEnergy += ir[c][i] * ir[c][i];
                }
                energy += channelEnergy;
            }
            // ConvolverNode normalize=true, stereo IR, calibrated at 44.1kHz.
            const float power = std::max(.000125f, std::sqrt(energy / static_cast<float>(2 * length)));
            float scale = 1.f / power;
            scale *= .00125f;
            scale *= 44100.f / static_cast<float>(rate);
            for (int c = 0; c < 2; ++c) {
                for (auto& x : ir[c]) { x *= scale; }
                convolver_[c].prepare(ir[c]);
            }
        } else if (type_ == "distortion") {
            const double k = std::pow(10., std::max(0., number("driveDb", 0)) / 20);
            for (std::size_t i = 0; i < curve_.size(); ++i) {
                curve_[i] = static_cast<float>(std::tanh(k * (static_cast<double>(i) / 4095 * 2 - 1)) / std::tanh(k));
            }
            oversampler_.prepare();
        }
        prepared_ = true;
        snapAllSmoothers();
        reset();
    }
    // A feedback DelayNode marks a zero output quantum silent independently
    // of whether its source is still scheduled (Web Audio cycle activity rule).
    bool keepsActiveInput() const noexcept override { return type_ != "echo" || wet_ < 1; }
    bool hasPendingOutput(int frames) const noexcept override {
        if (type_ == "reverb") { return reverbRemaining_ > 0; }
        if (type_ == "filter" || type_ == "eq3") {
            for (const auto& f : filters_) {
                for (int c = 0; c < 2; ++c) {
                    if (f.x1[c] != 0 || f.x2[c] != 0 || f.y1[c] != 0 || f.y2[c] != 0) { return true; }
                }
            }
        }
        if (type_ == "echo" || type_ == "compressor") {
            const auto size = delay_.size() / 2;
            for (int i = 0; i < frames; ++i) {
                const double read = cursor_ + size + i - (type_ == "echo" ? delayFrames_ : 0);
                const auto a = static_cast<std::size_t>(std::floor(read)) % size;
                const auto b = (a + 1) % size;
                for (int c = 0; c < 2; ++c) {
                    if (delay_[2 * a + c] != 0 || (read != std::floor(read) && delay_[2 * b + c] != 0)) { return true; }
                }
            }
        }
        return false;
    }
    void reset() noexcept override {
        BlockProcessor::reset();
        reverbRemaining_ = 0;
        cursor_ = 0; detector_ = 0;
        oversampler_.reset();
        std::ranges::fill(delay_, 0.f);
        for (auto& filter : filters_) { filter.reset(); }
        if (type_ == "reverb") { for (auto& c : convolver_) { c.reset(); } }
        hasExpectedMs_ = false;
        if (prepared_) { snapAllSmoothers(); }
    }
    void process(std::span<float> stereo, const BlockContext& context) noexcept override {
        // Snap smoothers on the first rendered block or after a timeline seek,
        // while smoothing all parameter changes during continuous playback.
        const bool discontinuous = !hasExpectedMs_ ||
            (std::isfinite(context.timelineMs) && std::abs(context.timelineMs - expectedMs_) > 0.5);
        if (discontinuous && prepared_) {
            snapAllSmoothers();
        }
        if (std::isfinite(context.timelineMs) && std::isfinite(context.msPerFrame)) {
            expectedMs_ = context.timelineMs + static_cast<double>(stereo.size() / 2) * context.msPerFrame;
            hasExpectedMs_ = true;
        }
        // WaveShaperNode has no tail: a silent input quantum propagates
        // silence immediately, even while oversampling state holds samples.
        // Snap gainSmooth_ while silent so outputDb changes during silence take effect immediately on resume.
        if (type_ == "distortion" && context.silent) {
            gainSmooth_.snapToTarget();
            gain_ = static_cast<float>(gainSmooth_.current());
            std::ranges::fill(stereo, 0.f);
            return;
        }
        for (std::size_t i = 0; i < stereo.size(); i += 2) {
            if (type_ == "distortion") {
                if (gainSmooth_.smoothing()) { gain_ = static_cast<float>(gainSmooth_.next()); }
                oversampler_.tick(std::span<float, 2>(stereo.data() + i, 2), curve_, gain_);
                continue;
            }
            if (type_ == "compressor") {
                if (compThreshSmooth_.smoothing() || compRatioSmooth_.smoothing() ||
                    compAttackSmooth_.smoothing() || compReleaseSmooth_.smoothing() ||
                    compKneeSmooth_.smoothing()) {
                    (void)compThreshSmooth_.next();
                    (void)compRatioSmooth_.next();
                    (void)compAttackSmooth_.next();
                    (void)compReleaseSmooth_.next();
                    (void)compKneeSmooth_.next();
                    applyCompressor();
                }
                const float peak = std::max(std::abs(stereo[i]), std::abs(stereo[i + 1]));
                const float db = peak == 0 ? -1000 : 20.f * std::log10(peak);
                float attenuated = db;
                if (db > threshold_ + halfKnee_) { attenuated = threshold_ + (db - threshold_) / ratio_; }
                else if (db > threshold_ - halfKnee_) { attenuated = db + (db - threshold_ + halfKnee_) * (db - threshold_ + halfKnee_) * kneePartial_; }
                const float attenuation = db - attenuated;
                const float tau = attenuation > detector_ ? attack_ : release_;
                detector_ = tau * detector_ + (1 - tau) * attenuation;
                const float scale = std::pow(10.f, (-detector_ + makeup_) / 20.f);
                for (int c = 0; c < 2; ++c) {
                    const float x = stereo[i + c];
                    stereo[i + c] = delay_[cursor_ * 2 + c] * scale;
                    delay_[cursor_ * 2 + c] = x;
                }
                cursor_ = (cursor_ + 1) % (delay_.size() / 2);
                continue;
            }
            if (type_ == "gain") {
                if (gainSmooth_.smoothing()) { gain_ = static_cast<float>(gainSmooth_.next()); }
            } else if (type_ == "filter") {
                if (fFreqSmooth_.smoothing() || fQSmooth_.smoothing()) {
                    (void)fFreqSmooth_.next();
                    (void)fQSmooth_.next();
                    applyFilter();
                }
            } else if (type_ == "eq3") {
                if (eqFreqSmooth_[0].smoothing() || eqGainSmooth_[0].smoothing()) {
                    (void)eqFreqSmooth_[0].next();
                    (void)eqGainSmooth_[0].next();
                    applyEqBand(0);
                }
                if (eqFreqSmooth_[1].smoothing() || eqMidQSmooth_.smoothing() || eqGainSmooth_[1].smoothing()) {
                    (void)eqFreqSmooth_[1].next();
                    (void)eqMidQSmooth_.next();
                    (void)eqGainSmooth_[1].next();
                    applyEqBand(1);
                }
                if (eqFreqSmooth_[2].smoothing() || eqGainSmooth_[2].smoothing()) {
                    (void)eqFreqSmooth_[2].next();
                    (void)eqGainSmooth_[2].next();
                    applyEqBand(2);
                }
            } else if (type_ == "echo") {
                if (wetSmooth_.smoothing()) { wet_ = static_cast<float>(wetSmooth_.next()); }
                if (feedbackSmooth_.smoothing()) { feedback_ = static_cast<float>(feedbackSmooth_.next()); }
                if (delaySmooth_.smoothing()) { delayFrames_ = delaySmooth_.next(); }
            } else if (type_ == "reverb") {
                if (wetSmooth_.smoothing()) { wet_ = static_cast<float>(wetSmooth_.next()); }
                if (stereo[i] != 0 || stereo[i + 1] != 0) { reverbRemaining_ = reverbLength_; }
                else if (reverbRemaining_ > 0) { --reverbRemaining_; }
            }
            for (int c = 0; c < 2; ++c) {
                const float x = stereo[i + c];
                float y = x;
                if (type_ == "gain") { y *= gain_; }
                else if (type_ == "eq3") { for (auto& f : filters_) { y = f.tick(y, c); } }
                else if (type_ == "filter") { y = filters_[0].tick(y, c); }
                else if (type_ == "echo") {
                    const std::size_t size = delay_.size() / 2;
                    const double read = cursor_ + size - delayFrames_;
                    const auto a = static_cast<std::size_t>(std::floor(read)) % size;
                    const auto b = (a + 1) % size;
                    const float fraction = static_cast<float>(read - std::floor(read));
                    const float delayed = delay_[a * 2 + c] + fraction * (delay_[b * 2 + c] - delay_[a * 2 + c]);
                    delay_[cursor_ * 2 + c] = x + delayed * feedback_;
                    y = x * (1 - wet_) + delayed * wet_;
                } else if (type_ == "reverb") { y = x * (1 - wet_) + convolver_[c].tick(x) * wet_; }

                stereo[i + c] = y;
            }
            if (type_ == "echo") { cursor_ = (cursor_ + 1) % (delay_.size() / 2); }
        }
    }
};

void append(const QJsonArray& effects, Processors& processors, double* tailMs = nullptr, double tempoBpm = 120.0) {
    for (const auto& value : effects) {
        const auto e = value.toObject();
        if (!e.value("enabled").toBool()) { continue; }
        const auto type = e.value("type").toString();
        if (type == "fable") {
            if (auto fx = fable::createFableDynamicsEffect(e)) {
                processors.push_back(std::shared_ptr<BlockProcessor>(std::move(fx)));
                continue;
            }
            if (auto fx = fable::createFableColorTimeEffect(e, tempoBpm)) {
                processors.push_back(std::shared_ptr<BlockProcessor>(std::move(fx)));
                const auto kind = e.value("kind").toString();
                if (tailMs && kind == "reverb") {
                    const double size = std::clamp(e.value("params").toObject().value("fx.reverb.size").toDouble(0.5), 0.0, 1.0);
                    const double rt60Sec = (-3.0 * 0.0312) / std::log10(0.7 + 0.28 * size);
                    *tailMs += std::clamp(rt60Sec * 1000.0, 500.0, 20000.0);
                }
                if (tailMs && kind == "echo") {
                    const auto ep = e.value("params").toObject();
                    const auto syncVal = ep.value("fx.delay.sync");
                    const bool synced = syncVal.isBool() ? syncVal.toBool() : (syncVal.toDouble(0.0) > 0.5);
                    const int div = std::clamp(static_cast<int>(std::lround(ep.value("fx.delay.div").toDouble(3.0))), 0, 5);
                    const double sec = std::clamp(synced ? 60.0 / std::max(1.0, tempoBpm) * fable::kEchoDivisions[static_cast<std::size_t>(div)]
                                                         : ep.value("fx.delay.time").toDouble(0.36), 0.02, 1.5);
                    const double delay = sec * 1000.0;
                    const double fb = std::clamp(ep.value("fx.delay.fb").toDouble(0.35), 0.0, 0.92);
                    *tailMs += fb <= 0.001 ? delay : std::min(20000.0, delay * (std::log(0.001) / std::log(fb) + 1.0));
                }
            }
            continue;
        }
        // Fable instruments and video effects are outside P1, pass through.
        if (type != "gain" && type != "eq3" && type != "filter" && type != "compressor" &&
            type != "echo" && type != "reverb" && type != "distortion") { continue; }
        processors.push_back(std::make_shared<Effect>(e));
        if (tailMs && type == "reverb") { *tailMs += get(e, "decaySec", 2) * 1000; }
        if (tailMs && type == "echo") {
            const double delay = get(e, "delayMs", 350), feedback = std::clamp(get(e, "feedback", .4), 0., .95);
            *tailMs += feedback <= .001 ? delay : std::min(20000., delay * (std::log(.001) / std::log(feedback) + 1));
        }
    }
}
void stage(const Timeline& tl, MixPlan& plan) {
    const double rawBpm = tl.raw.value("tempo").toObject().value("bpm").toDouble(120.0);
    const double tempoBpm = (std::isfinite(rawBpm) && rawBpm > 0.0) ? rawBpm : 120.0;
    std::unordered_map<std::string, const Clip*> clips;
    for (const auto& c : tl.clips) { clips.emplace(c.id, &c); }
    for (auto& voice : plan.voices) {
        const auto found = clips.find(voice.clipId);
        if (found != clips.end()) { append(found->second->raw.value("audioEffects").toArray(), voice.processors, &voice.tailMs, tempoBpm); }
    }
    std::unordered_map<std::string, const Track*> tracks;
    for (const auto& track : tl.tracks) { tracks.emplace(track.id, &track); }
    for (auto& bus : plan.tracks) {
        const auto found = tracks.find(bus.trackId);
        const auto* track = found == tracks.end() ? nullptr : found->second;
        // AudioGraph.updateTracks never applies inserts on video tracks.
        if (track && (track->type == TrackType::Audio || track->type == TrackType::Midi)) {
            append(track->raw.value("effects").toArray(), bus.processors, nullptr, tempoBpm);
        }
    }
    append(tl.raw.value("master").toObject().value("effects").toArray(), plan.processors, nullptr, tempoBpm);
}
} // namespace
void ensureRegistered() {
    static const auto token = registerMixPlanStage("audioEffects", stage, 0);
    (void)token;
}
} // namespace nt::audio::effects
