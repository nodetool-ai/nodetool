#include "midi/PatternAudioStage.h"

#include "audio/automation/AutomationCurves.h"
#include "midi/PatternExpand.h"
#include "audio/vst/VstAudioStages.h"

#include <QJsonArray>
#include <QJsonObject>
#include <QStringList>

#include <algorithm>
#include <cmath>
#include <memory>
#include <numbers>
#include <unordered_map>
#include <limits>
#include <string>
#include <vector>

namespace nt::midi {
namespace {

// MixPlan owns the processor through the registry's shared_ptr interface. Note
// storage is owned by this processor, and active voices only borrow its entries.
// Thread affinity: built/prepared on the control thread and destroyed there
// after renderer retirement. After publication, MixRenderLease serializes
// process(), reset() and setParameter() on the render thread. These callback
// methods never allocate, lock or wait.
class SubtractiveInstrumentProcessor final : public audio::BlockProcessor {
    struct Note {
        double startMs, offMs, endMs, frequency, velocity, clipStartMs, clipDurationMs, clipGain;
        audio::ResolvedFades fades;
    };
    enum class EnvelopeStage { Attack, Decay, Sustain, Release, Done };
    enum class Waveform { Saw, Square, Triangle, Sine };
    struct Voice {
        const Note* note = nullptr;
        double phase = 0, level = 0, releaseFrom = 0;
        EnvelopeStage stage = EnvelopeStage::Attack;
        double x1 = 0, x2 = 0, y1 = 0, y2 = 0;
    };
public:
    SubtractiveInstrumentProcessor(const SubtractiveInstrumentProcessor&) = delete;
    SubtractiveInstrumentProcessor& operator=(const SubtractiveInstrumentProcessor&) = delete;
    ~SubtractiveInstrumentProcessor() override = default;
    SubtractiveInstrumentProcessor(const Timeline& timeline, const Track& track) {
        id = "instrument";
        const auto instrument = track.raw.value(u"instrument").toObject();
        const auto waveform = instrument.value(u"waveform").toString(QStringLiteral("saw"));
        if (waveform == u"square") { waveform_ = Waveform::Square; }
        if (waveform == u"triangle") { waveform_ = Waveform::Triangle; }
        if (waveform == u"sine") { waveform_ = Waveform::Sine; }
        const double maximum = std::numeric_limits<double>::max();
        const double maxGainDb = 20 * std::log10(static_cast<double>(std::numeric_limits<float>::max()) / 4);
        attack_ = bounded(instrument, "attackMs", 5, 0, maximum);
        decay_ = bounded(instrument, "decayMs", 120, 0, maximum);
        sustain_ = bounded(instrument, "sustain", 0.7, 0, 1);
        release_ = bounded(instrument, "releaseMs", 150, 0, maximum);
        cutoff_ = bounded(instrument, "cutoffHz", 4000, 1, maximum);
        resonance_ = bounded(instrument, "resonance", 0.7, 0.0001, maximum);
        gain_ = std::pow(10.0, bounded(instrument, "gainDb", -6, -6000, maxGainDb) / 20.0);
        const double documentBpm = timeline.raw.value(u"tempo").toObject().value(u"bpm").toDouble(120);
        const double bpm = std::isfinite(documentBpm) && documentBpm > 0 ? documentBpm : 120;
        for (const auto& clip : timeline.clips) {
            if (clip.trackId != track.id || clip.mediaType != MediaType::Midi || clip.muted || clip.hidden || clip.durationMs <= 0) { continue; }
            const auto events = audio::vst::extractMidiNoteEvents(clip.raw, bpm, 48000, clip.inPointMs, clip.durationMs, timeline.raw);
            const auto fades = audio::resolveClipFades(clip.fadeInMs, clip.fadeOutMs,
                audio::parseFadeShape(clip.fadeInShape), audio::parseFadeShape(clip.fadeOutShape), clip.durationMs);
            for (const auto& event : events) {
                const double start = clip.startMs + static_cast<double>(event.startFrame) / 48.0;
                const double off = clip.startMs + static_cast<double>(event.gateOffFrame) / 48.0;
                const double end = std::min(off + release_, clip.startMs + clip.durationMs);
                if (end <= start) { continue; }
                notes_.push_back({start, off, end,
                    440.0 * std::pow(2.0, (event.pitch - 69) / 12.0), event.velocity / 127.0,
                    clip.startMs, clip.durationMs, std::pow(10.0, std::clamp(clip.volumeDb, -6000.0, maxGainDb) / 20.0), fades});
            }
        }
        std::stable_sort(notes_.begin(), notes_.end(), [](const Note& a, const Note& b) { return a.startMs < b.startMs; });
        // Reserve exactly the peak overlap on the control thread. Callback
        // polyphony needs no growth and never drops a document note.
        std::vector<double> ends;
        ends.reserve(notes_.size());
        for (const auto& note : notes_) { ends.push_back(note.endMs); }
        std::sort(ends.begin(), ends.end());
        std::size_t active = 0, peak = 0, ended = 0;
        for (const auto& note : notes_) {
            while (ended < ends.size() && ends[ended] <= note.startMs) { --active; ++ended; }
            peak = std::max(peak, ++active);
        }
        voices_.resize(peak); freeSlots_.resize(peak); reset();
    }
    void prepare(double rate) override {
        if (std::isfinite(rate) && rate > 0) { rate_ = rate; }
        configureFilter();
    }
    bool setParameter(std::string_view name, double value) noexcept override {
        if (!std::isfinite(value)) { return false; }
        if (name == "cutoffHz" || name == "filter.cutoff") {
            const double cutoff = std::clamp(value, 20.0, std::max(20.0, rate_ / 2 - 1));
            if (cutoff != cutoff_) { cutoff_ = cutoff; configureFilter(); }
            return true;
        }
        return false;
    }
    void reset() noexcept override {
        audio::BlockProcessor::reset();
        std::fill(voices_.begin(), voices_.end(), Voice{});
        for (std::size_t i = 0; i < freeSlots_.size(); ++i) { freeSlots_[i] = i; }
        freeCount_ = freeSlots_.size(); next_ = 0;
        expectedMs_ = std::numeric_limits<double>::quiet_NaN();
    }
    bool hasPendingOutput(int) const noexcept override {
        return next_ < notes_.size() || std::any_of(voices_.begin(), voices_.end(), [](const Voice& voice) { return voice.note != nullptr; });
    }
    void process(std::span<float> stereo, const audio::BlockContext& context) noexcept override {
        if (!std::isfinite(context.timelineMs) || context.msPerFrame <= 0) { return; }
        if (!std::isfinite(expectedMs_) || std::abs(context.timelineMs - expectedMs_) > 0.001) {
            reset();
            // A seek chases held notes without replaying samples or allocating.
            while (next_ < notes_.size() && notes_[next_].startMs < context.timelineMs) {
                if (notes_[next_].endMs > context.timelineMs) { activate(notes_[next_], context.timelineMs); }
                ++next_;
            }
        }
        for (std::size_t sample = 0; sample + 1 < stereo.size(); sample += 2) {
            const std::size_t frame = sample / 2;
            const double time = context.timelineMs + static_cast<double>(frame) * context.msPerFrame;
            for (std::size_t i = 0; i < voices_.size(); ++i) {
                if (voices_[i].note && voices_[i].note->endMs <= time) {
                    voices_[i].note = nullptr; freeSlots_[freeCount_++] = i;
                }
            }
            while (next_ < notes_.size() && notes_[next_].startMs <= time) {
                const auto& note = notes_[next_++];
                if (note.endMs > time) { activate(note, time); }
            }
            double output = 0;
            for (auto& voice : voices_) {
                if (!voice.note) { continue; }
                const auto& note = *voice.note;
                const double dt = std::min(note.frequency / rate_, 0.4999);
                const double phase = voice.phase;
                double wave = 0;
                switch (waveform_) {
                case Waveform::Saw: wave = 2 * phase - 1 - blep(phase, dt); break;
                case Waveform::Square: {
                    const double secondEdge = phase < 0.5 ? phase + 0.5 : phase - 0.5;
                    wave = (phase < 0.5 ? 1 : -1) + blep(phase, dt) - blep(secondEdge, dt);
                    break;
                }
                case Waveform::Triangle: wave = 1 - 4 * std::abs(phase - 0.5); break;
                case Waveform::Sine: wave = std::sin(2 * std::numbers::pi * phase); break;
                }
                const double level = envelope(voice, time < note.offMs);
                voice.phase = phase + dt;
                if (voice.phase >= 1) { voice.phase -= 1; }
                const double input = wave * level * note.velocity;
                const double filtered = b0_ * input + b1_ * voice.x1 + b0_ * voice.x2 - a1_ * voice.y1 - a2_ * voice.y2;
                voice.x2 = voice.x1; voice.x1 = input; voice.y2 = voice.y1; voice.y1 = filtered;
                output += filtered * note.clipGain * audio::clipFadeGain(note.fades, note.clipDurationMs, time - note.clipStartMs);
            }
            // Bound conversion at the PCM boundary, after summing the voices.
            const double limit = static_cast<double>(std::numeric_limits<float>::max()) / 4;
            const float value = static_cast<float>(std::clamp(output * gain_, -limit, limit));
            stereo[sample] += value; stereo[sample + 1] += value;
        }
        const std::size_t frames = stereo.size() / 2;
        expectedMs_ = context.timelineMs + static_cast<double>(frames) * context.msPerFrame;
    }
private:
    static double bounded(const QJsonObject& object, const char* key, double fallback, double lo, double hi) {
        const double value = object.value(QLatin1String(key)).toDouble(fallback);
        return std::isfinite(value) ? std::clamp(value, lo, hi) : fallback;
    }
    static double blep(double phase, double dt) noexcept {
        if (phase < dt) { const double t = phase / dt; return 2 * t - t * t - 1; }
        if (phase > 1 - dt) { const double t = (phase - 1) / dt; return t * t + 2 * t + 1; }
        return 0;
    }
    double heldLevel(double age) const noexcept {
        if (attack_ > 0 && age < attack_) { return std::max(0.0, age / attack_); }
        if (decay_ > 0 && age < attack_ + decay_) { return 1 - (1 - sustain_) * (age - attack_) / decay_; }
        return sustain_;
    }
    double envelope(Voice& voice, bool gateOn) const noexcept {
        if (!gateOn && voice.stage != EnvelopeStage::Release && voice.stage != EnvelopeStage::Done) {
            voice.stage = EnvelopeStage::Release; voice.releaseFrom = voice.level;
        }
        switch (voice.stage) {
        case EnvelopeStage::Attack:
            voice.level = attack_ <= 0 ? 1 : std::min(1.0, voice.level + 1000 / (attack_ * rate_));
            if (voice.level >= 1 - 1e-9) {
                voice.level = 1; voice.stage = sustain_ >= 1 ? EnvelopeStage::Sustain : EnvelopeStage::Decay;
            }
            break;
        case EnvelopeStage::Decay:
            voice.level = decay_ <= 0 ? sustain_ : std::max(sustain_, voice.level - (1 - sustain_) * 1000 / (decay_ * rate_));
            if (voice.level - sustain_ <= 1e-9) { voice.level = sustain_; voice.stage = EnvelopeStage::Sustain; }
            break;
        case EnvelopeStage::Sustain: voice.level = sustain_; break;
        case EnvelopeStage::Release:
            voice.level = release_ <= 0 ? 0 : std::max(0.0, voice.level - voice.releaseFrom * 1000 / (release_ * rate_));
            if (voice.level <= 1e-9) { voice.level = 0; voice.stage = EnvelopeStage::Done; }
            break;
        case EnvelopeStage::Done: voice.level = 0; break;
        }
        return voice.level;
    }
    void activate(const Note& note, double time) noexcept {
        if (freeCount_ == 0) { return; }  // Peak overlap was reserved by the constructor.
        auto& voice = voices_[freeSlots_[--freeCount_]];
        voice = {}; voice.note = &note;
        const double age = std::max(0.0, time - note.startMs);
        if (age > 0.001) {
            voice.phase = std::fmod(age * note.frequency / 1000, 1.0);
            voice.level = heldLevel(age);
            voice.stage = age < attack_ ? EnvelopeStage::Attack :
                (age < attack_ + decay_ ? EnvelopeStage::Decay : EnvelopeStage::Sustain);
            if (time >= note.offMs) {
                voice.stage = EnvelopeStage::Release; voice.releaseFrom = heldLevel(note.offMs - note.startMs);
                voice.level = release_ <= 0 ? 0 : voice.releaseFrom * std::max(0.0, 1 - (time - note.offMs) / release_);
            }
        }
    }
    void configureFilter() noexcept {
        const double frequency = std::min(std::max(cutoff_, 1.0), rate_ * 0.49995);
        const double w = 2 * std::numbers::pi * frequency / rate_;
        const double cosine = std::cos(w), alpha = std::sin(w) / (2 * resonance_);
        b0_ = (1 - cosine) / (2 * (1 + alpha)); b1_ = 2 * b0_;
        a1_ = -2 * cosine / (1 + alpha); a2_ = (1 - alpha) / (1 + alpha);
    }
    std::vector<Note> notes_;
    std::vector<Voice> voices_;
    std::vector<std::size_t> freeSlots_;
    std::size_t freeCount_ = 0;
    Waveform waveform_ = Waveform::Saw;
    std::size_t next_ = 0;
    double attack_ = 5, decay_ = 120, sustain_ = 0.7, release_ = 150;
    double cutoff_ = 4000, resonance_ = 0.7, gain_ = 0.5, rate_ = 48000;
    double b0_ = 1, b1_ = 0, a1_ = 0, a2_ = 0;
    double expectedMs_ = std::numeric_limits<double>::quiet_NaN();
};

void runSubtractiveInstrumentsStage(const Timeline& timeline, audio::MixPlan& plan) {
    const bool soloed = std::any_of(timeline.tracks.begin(), timeline.tracks.end(), [](const Track& track) {
        return (track.type == TrackType::Midi || track.type == TrackType::Audio) && track.solo;
    });
    std::unordered_map<std::string, std::size_t> buses;
    buses.reserve(plan.tracks.size());
    for (std::size_t i = 0; i < plan.tracks.size(); ++i) { buses.emplace(plan.tracks[i].trackId, i); }
    for (const auto& track : timeline.tracks) {
        const auto type = track.raw.value(u"instrument").toObject().value(u"type").toString();
        if (track.type != TrackType::Midi || track.muted || (soloed && !track.solo) ||
            (!type.isEmpty() && type != u"subtractive")) { continue; }
        // Mixer-only plan snapshots share prepared DSP with the active renderer.
        auto processor = std::make_shared<SubtractiveInstrumentProcessor>(timeline, track);
        if (!processor->hasPendingOutput(0)) { continue; }
        const auto [bus, inserted] = buses.try_emplace(track.id, plan.tracks.size());
        if (inserted) {
            audio::TrackPlan item; item.trackId = track.id;
            item.gain = std::pow(10.0, track.volumeDb / 20.0); item.pan = std::clamp(track.pan, -1.0, 1.0);
            plan.tracks.push_back(std::move(item));
        }
        auto& processors = plan.tracks[bus->second].processors;
        processors.insert(processors.begin(), std::move(processor));
    }
}

struct Breakpoint {
    double time = 0.0;
    float value = 0.0f;
};

// Precomputed piecewise-linear parameter curve built on the control/plan-build
// thread and evaluated read-only on the audio thread with zero locks and zero
// heap allocations (mirrors nt::automation::Ramp in AutomationStage.cpp).
class PatternRamp {
public:
    PatternRamp(const QJsonArray& points, bool gain, bool subdivide, bool eqGain) {
        const double limit = static_cast<double>(std::numeric_limits<float>::max()) / 4.0;
        // EQ band gain uses the target range in Tracks/automation/automationTargets.ts.
        const double minimum = eqGain ? -24.0 : (gain ? -6000.0 : -limit);
        const double maximum = eqGain ? 24.0 : (gain ? 20.0 * std::log10(limit) : limit);
        // Bound values before curve subdivision and f32 conversion. This also
        // keeps endpoint subtraction finite during callback interpolation.
        QJsonArray bounded;
        for (const auto& value : points) {
            auto point = value.toObject();
            point.insert("value", std::clamp(point.value(u"value").toDouble(), minimum, maximum));
            bounded.append(point);
        }
        const auto breakpoints = nt::automation::automationBreakpoints(
            bounded, 0.0, QJsonObject{{QStringLiteral("maxStepMs"), 10}, {QStringLiteral("subdivideLinear"), subdivide}});
        points_.reserve(static_cast<std::size_t>(breakpoints.size()));
        for (const auto& value : breakpoints) {
            const auto bp = value.toObject();
            double v = bp.value(u"value").toDouble();
            if (gain) v = std::pow(10.0, v / 20.0);
            points_.push_back({bp.value(u"timeMs").toDouble(), static_cast<float>(v)});
        }
    }

    double valueAt(double time, double base) const noexcept {
        if (points_.empty()) return base;
        const auto next = std::upper_bound(points_.begin(), points_.end(), time,
                                           [](double t, const Breakpoint& p) { return t < p.time; });
        if (next == points_.begin()) return next->value;
        const auto& a = *(next - 1);
        if (next == points_.end()) return a.value;
        const float fraction = static_cast<float>((time - a.time) / (next->time - a.time));
        return std::fma(fraction, next->value - a.value, a.value);
    }

private:
    std::vector<Breakpoint> points_;
};

struct PatternAutomatedParam {
    std::string name;
    PatternRamp ramp;
    bool gain = false;
};

// Wraps a native instrument or built-in insert to drive parameters from the
// merged stored + pattern-derived device automation curves (SQ41).
//
// Ownership: owned by the MixPlan's TrackPlan::processors vector (shared_ptr
// matching the BlockProcessor registry interface); holds a shared_ptr to the
// wrapped insert processor.
// Thread affinity: constructed on the plan-build/control thread; prepare() runs
// on the control thread; process() and reset() run on the real-time audio
// callback (or offline render) thread with zero locks, zero heap allocations,
// and zero blocking.
class PatternDeviceAutomationProcessor final : public audio::BlockProcessor {
public:
    PatternDeviceAutomationProcessor(std::shared_ptr<audio::BlockProcessor> inner,
                                     std::vector<PatternAutomatedParam> parameters, bool quantum)
        : inner_(std::move(inner)), parameters_(std::move(parameters)), quantum_(quantum) {
        id = inner_->id;
    }

    bool drivesDeviceAutomation() const noexcept override { return true; }
    void prepare(double rate) override { inner_->prepare(rate); }
    void reset() noexcept override {
        audio::BlockProcessor::reset();
        inner_->reset();
    }
    bool hasPendingOutput(int n) const noexcept override { return inner_->hasPendingOutput(n); }
    bool keepsActiveInput() const noexcept override { return inner_->keepsActiveInput(); }
    bool setParameter(std::string_view name, double value) noexcept override {
        return inner_->setParameter(name, value);
    }

    void process(std::span<float> stereo, const audio::BlockContext& context) noexcept override {
        if (quantum_) {
            if (context.quantumOffset == 0) apply(context.timelineMs);
            inner_->process(stereo, context);
            return;
        }
        for (std::size_t i = 0; i < stereo.size(); i += 2) {
            auto sample = context;
            const std::size_t frame = i / 2;
            sample.timelineMs += static_cast<double>(frame) * context.msPerFrame;
            sample.quantumOffset += static_cast<int>(frame);
            apply(sample.timelineMs);
            inner_->process(stereo.subspan(i, 2), sample);
        }
    }

private:
    void apply(double time) noexcept {
        for (const auto& p : parameters_) {
            const double value = p.ramp.valueAt(time, 0.0);
            inner_->setParameter(p.name, p.gain ? 20.0 * std::log10(std::max(value, 1e-300)) : value);
        }
    }

    // Shared during plan construction while its bus slot is replaced with this wrapper.
    std::shared_ptr<audio::BlockProcessor> inner_;
    std::vector<PatternAutomatedParam> parameters_;
    bool quantum_ = false;
};

bool supportsDeviceParam(const QString& type, const QString& param) {
    if (type == u"instrument") { return param == u"cutoffHz" || param == u"filter.cutoff"; }
    if (type == u"gain") return param == u"gainDb";
    if (type == u"filter") return param == u"frequency" || param == u"q";
    if (type == u"eq3") {
        return param == u"lowFreq" || param == u"lowGainDb" || param == u"midFreq" || param == u"midQ" ||
               param == u"midGainDb" || param == u"highFreq" || param == u"highGainDb";
    }
    if (type == u"compressor") {
        return param == u"thresholdDb" || param == u"ratio" || param == u"attackMs" || param == u"releaseMs" ||
               param == u"kneeDb";
    }
    return false;
}

bool trackHasPatternDeviceAutomation(const Timeline& timeline, const std::string& trackId) {
    for (const Clip& clip : timeline.clips) {
        if (clip.trackId != trackId || clip.muted || clip.hidden || clip.durationMs <= 0.0) continue;
        const auto patVal = clip.raw.value(u"pattern");
        if (!patVal.isObject()) continue;
        for (const auto& rv : patVal.toObject().value(u"rows").toArray()) {
            const auto assign = rv.toObject().value(u"assignment").toObject();
            if (assign.value(u"type").toString() == u"automation" &&
                assign.value(u"target").toObject().value(u"kind").toString() == u"device") {
                return true;
            }
        }
    }
    return false;
}

}  // namespace

void runPatternDeviceAutomationStage(const Timeline& timeline, audio::MixPlan& plan) {
    const auto clipsArr = timeline.raw.value(u"clips").toArray();
    for (auto& bus : plan.tracks) {
        const Track* track = timeline.findTrack(bus.trackId);
        if (!track || track->raw.value(u"automationMode").toString() == u"off" ||
            (track->type != TrackType::Audio && track->type != TrackType::Midi)) {
            continue;
        }
        if (!trackHasPatternDeviceAutomation(timeline, track->id)) continue;

        const QJsonArray mergedLanes = deriveTrackAutomationFromPatterns(track->raw, clipsArr, timeline.raw);
        if (mergedLanes.isEmpty()) continue;

        const auto effects = track->raw.value(u"effects").toArray();
        for (auto& processor : bus.processors) {
            if (!processor || processor->id.empty() || processor->drivesDeviceAutomation()) continue;
            QString type;
            const bool instrument = processor->id == "instrument";
            if (instrument) type = QStringLiteral("instrument");
            for (const auto& fx : effects) {
                if (fx.toObject().value(u"id").toString().toStdString() == processor->id) {
                    type = fx.toObject().value(u"type").toString();
                    break;
                }
            }
            if (type.isEmpty()) continue;

            std::vector<PatternAutomatedParam> params;
            for (const auto& lv : mergedLanes) {
                const auto lane = lv.toObject();
                const auto target = lane.value(u"target").toObject();
                const auto points = lane.value(u"points").toArray();
                const auto param = target.value(u"param").toString();
                if (lane.value(u"enabled") == false || points.isEmpty() ||
                    target.value(u"kind").toString() != u"device" ||
                    target.value(u"deviceId").toString().toStdString() != (instrument ? "instrument" : processor->id) ||
                    !supportsDeviceParam(type, param)) {
                    continue;
                }
                const bool gain = (type == u"gain");
                const bool curved = gain || (type == u"eq3" && param.endsWith(u"Freq")) ||
                                    (type == u"filter" && param == u"frequency");
                params.push_back({param.toStdString(), PatternRamp(points, gain, curved, type == u"eq3" && param.endsWith(u"GainDb")), gain});
            }
            if (!params.empty()) {
                processor = std::make_shared<PatternDeviceAutomationProcessor>(
                    std::move(processor), std::move(params), type == u"compressor");
            }
        }
    }
}

audio::MixPlanStageToken registerPatternAutomationStage() {
    (void)audio::registerMixPlanStage("subtractiveInstrument", runSubtractiveInstrumentsStage, -1, true);
    return audio::registerMixPlanStage("patternDeviceAutomation", runPatternDeviceAutomationStage, 99, true);
}

}  // namespace nt::midi
