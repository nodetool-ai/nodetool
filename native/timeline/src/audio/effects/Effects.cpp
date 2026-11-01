#include "audio/effects/Effects.h"
#include "audio/effects/Oversampler.h"
#include "audio/Mixer.h"
#include <QJsonArray>
#include <QJsonObject>
#include <algorithm>
#include <array>
#include <cmath>
#include <cstdint>
#include <memory>
#include <numbers>
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
    // Web Audio BiquadFilterNode: low/highpass Q is in dB, unlike bandpass.
    // https://webaudio.github.io/web-audio-api/#filters-characteristics
    void configure(std::string_view type, double frequency, double q, double gain, double rate) {
        frequency = std::clamp<double>(static_cast<float>(frequency), 0., rate / 2);
        q = static_cast<float>(q); gain = static_cast<float>(gain);
        const auto constant = [this](double value) { b0 = value; b1 = b2 = a1 = a2 = 0; };
        if (frequency == 0 || frequency == rate / 2) {
            const bool top = frequency > 0;
            if (type == "lowpass") { constant(top ? 1 : 0); }
            else if (type == "highpass") { constant(top ? 0 : 1); }
            else if (type == "bandpass") { constant(0); }
            else if (type == "lowshelf") { constant(top ? std::pow(10., gain / 20) : 1); }
            else if (type == "highshelf") { constant(top ? 1 : std::pow(10., gain / 20)); }
            else { constant(1); }
            return;
        }
        if (q <= 0 && (type == "bandpass" || type == "peaking")) {
            constant(type == "bandpass" ? 1 : std::pow(10., gain / 20)); return;
        }
        const double w = 2 * std::numbers::pi * frequency / rate;
        const double c = std::cos(w), s = std::sin(w), A = std::pow(10., gain / 40.);
        double a0 = 1;
        if (type == "lowpass" || type == "highpass") {
            const double alpha = s / (2 * std::pow(10., q / 20.));
            b0 = (1 + (type == "lowpass" ? -c : c)) / 2;
            b1 = type == "lowpass" ? 1 - c : -(1 + c); b2 = b0;
            a0 = 1 + alpha; a1 = -2 * c; a2 = 1 - alpha;
        } else if (type == "bandpass" || type == "peaking") {
            const double alpha = s / (2 * std::max(q, 1e-12));
            if (type == "bandpass") {
                b0 = alpha; b1 = 0; b2 = -alpha;
                a0 = 1 + alpha; a1 = -2 * c; a2 = 1 - alpha;
            } else {
                b0 = 1 + alpha * A; b1 = -2 * c; b2 = 1 - alpha * A;
                a0 = 1 + alpha / A; a1 = -2 * c; a2 = 1 - alpha / A;
            }
        } else {
            const double t = 2 * std::sqrt(A) * s / std::sqrt(2.);
            if (type == "lowshelf") {
                b0 = A * ((A + 1) - (A - 1) * c + t);
                b1 = 2 * A * ((A - 1) - (A + 1) * c);
                b2 = A * ((A + 1) - (A - 1) * c - t);
                a0 = (A + 1) + (A - 1) * c + t;
                a1 = -2 * ((A - 1) + (A + 1) * c);
                a2 = (A + 1) + (A - 1) * c - t;
            } else {
                b0 = A * ((A + 1) + (A - 1) * c + t);
                b1 = -2 * A * ((A - 1) + (A + 1) * c);
                b2 = A * ((A + 1) + (A - 1) * c - t);
                a0 = (A + 1) - (A - 1) * c + t;
                a1 = 2 * ((A - 1) - (A + 1) * c);
                a2 = (A + 1) - (A - 1) * c - t;
            }
        }
        b0 /= a0; b1 /= a0; b2 /= a0; a1 /= a0; a2 /= a0;
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
    std::array<Biquad, 3> filters_;
    std::vector<float> delay_;
    std::array<Convolver, 2> convolver_;
    std::array<float, 4096> curve_{};
    Oversampler oversampler_;
    std::size_t cursor_ = 0;
    double delayFrames_ = 0;
    std::int64_t reverbRemaining_ = 0, reverbLength_ = 0;
    float detector_ = 0;
    float gain_ = 1, wet_ = 1, feedback_ = 0;
    float threshold_ = 0, halfKnee_ = 0, ratio_ = 1, kneePartial_ = 0, attack_ = 0, release_ = 0, makeup_ = 0;
    void coefficients() {
        const auto g = [this](const char* key, double d) { return number(key, d); };
        if (type_ == "gain") { gain_ = lin(g("gainDb", 0)); }
        if (type_ == "eq3") {
            filters_[0].configure("lowshelf", g("lowFreq", 200), 1, g("lowGainDb", 0), rate_);
            filters_[1].configure("peaking", g("midFreq", 1000), g("midQ", 1), g("midGainDb", 0), rate_);
            filters_[2].configure("highshelf", g("highFreq", 5000), 1, g("highGainDb", 0), rate_);
        }
        if (type_ == "filter") {
            filters_[0].configure(mode_, g("frequency", 1000), g("q", 1), 0, rate_);
        }
        if (type_ == "compressor") {
            const float knee = std::clamp(static_cast<float>(g("kneeDb", 30)), 0.f, 40.f);
            halfKnee_ = knee / 2;
            threshold_ = std::clamp(static_cast<float>(g("thresholdDb", -24)), -100.f, 0.f) + halfKnee_;
            ratio_ = std::clamp(static_cast<float>(g("ratio", 12)), 1.f, 20.f);
            kneePartial_ = knee > 0 ? (1 / ratio_ - 1) / (2 * knee) : 0;
            const float attackSec = std::clamp(static_cast<float>(g("attackMs", 3) / 1000), 0.f, 1.f);
            const float releaseSec = std::clamp(static_cast<float>(g("releaseMs", 250) / 1000), 0.f, 1.f);
            attack_ = attackSec > 0 ? std::exp(-1.f / (attackSec * static_cast<float>(rate_))) : 0;
            release_ = releaseSec > 0 ? std::exp(-1.f / (releaseSec * static_cast<float>(rate_))) : 0;
            const float full = threshold_ - threshold_ / ratio_;
            makeup_ = 20.f * std::log10(std::pow(1.f / std::pow(10.f, full / 20.f), 0.6f));
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
            (type_ == "compressor" && (key == "thresholdDb" || key == "ratio" || key == "attackMs" || key == "releaseMs" || key == "kneeDb"));
        if (!supported) { return false; }
        for (auto& param : params_) {
            if (param.key == key) { param.value = value; param.present = true; coefficients(); return true; }
        }
        return false;
    }
    void prepare(double rate) override {
        rate_ = rate; coefficients();
        wet_ = static_cast<float>(std::clamp(number("mix", 1), 0., 1.));
        if (type_ == "echo") {
            delayFrames_ = static_cast<float>(std::clamp(number("delayMs", 350) / 1000, 0.001, 5.)) * rate;
            // A feedback cycle's DelayNode is at least one render quantum.
            delayFrames_ = std::max<double>(kMixBlockFrames, delayFrames_);
            delay_.resize((static_cast<std::size_t>(std::ceil(delayFrames_)) + 1) * 2);
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
            gain_ = lin(number("outputDb", 0));
            oversampler_.prepare();
        }
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
    }
    void process(std::span<float> stereo, const BlockContext& context) noexcept override {
        // WaveShaperNode has no tail: a silent input quantum propagates
        // silence immediately, even while oversampling state holds samples.
        if (type_ == "distortion" && context.silent) { std::ranges::fill(stereo, 0.f); return; }
        for (std::size_t i = 0; i < stereo.size(); i += 2) {
            if (type_ == "distortion") {
                oversampler_.tick(std::span<float, 2>(stereo.data() + i, 2), curve_, gain_);
                continue;
            }
            if (type_ == "compressor") {
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
            if (type_ == "reverb") {
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

void append(const QJsonArray& effects, Processors& processors, double* tailMs = nullptr) {
    for (const auto& value : effects) {
        const auto e = value.toObject();
        if (!e.value("enabled").toBool()) { continue; }
        const auto type = e.value("type").toString();
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
    std::unordered_map<std::string, const Clip*> clips;
    for (const auto& c : tl.clips) { clips.emplace(c.id, &c); }
    for (auto& voice : plan.voices) {
        const auto found = clips.find(voice.clipId);
        if (found != clips.end()) { append(found->second->raw.value("audioEffects").toArray(), voice.processors, &voice.tailMs); }
    }
    std::unordered_map<std::string, const Track*> tracks;
    for (const auto& track : tl.tracks) { tracks.emplace(track.id, &track); }
    for (auto& bus : plan.tracks) {
        const auto found = tracks.find(bus.trackId);
        const auto* track = found == tracks.end() ? nullptr : found->second;
        // AudioGraph.updateTracks never applies inserts on video tracks.
        if (track && (track->type == TrackType::Audio || track->type == TrackType::Midi)) {
            append(track->raw.value("effects").toArray(), bus.processors);
        }
    }
    append(tl.raw.value("master").toObject().value("effects").toArray(), plan.processors);
}
} // namespace
void ensureRegistered() {
    static const auto token = registerMixPlanStage("audioEffects", stage, 0);
    (void)token;
}
} // namespace nt::audio::effects
