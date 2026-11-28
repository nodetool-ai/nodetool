// Derived from georgi/fablesynth (https://github.com/georgi/fablesynth) at
// commit af55d51 / ae9fca7 (juce/source/dsp/{Engine,Wavetables,Params,DriveOs,LfoShape,LfoClock}).
// FableSynth is published under PolyForm Noncommercial 1.0.0. Its author, who
// also maintains NodeTool, contributes this code to NodeTool under NodeTool's
// licence (AGPL-3.0).
#pragma once

#include "audio/FadeCurves.h"
#include "audio/Mixer.h"
#include "audio/vst/VstAudioStages.h"
#include "midi/WavetableTables.h"
#include "model/TimelineTypes.h"

#include <array>
#include <cstddef>
#include <cstdint>
#include <limits>
#include <span>
#include <string_view>
#include <vector>

class TestWavetableSynth;

namespace nt::midi {

enum class FilterType : int {
    Lp12 = 0,
    Lp24 = 1,
    Bp12 = 2,
    Hp12 = 3,
    Hp24 = 4,
    Bp24 = 5,
    None = 6
};

enum class SubShape : int {
    Sine = 0,
    Square = 1
};

enum class NoiseType : int {
    White = 0,
    Pink = 1
};

enum class LfoShape : int {
    Sine = 0,
    Tri = 1,
    Saw = 2,
    Square = 3,
    SampleHold = 4
};

// Cycles per quarter-note beat for tempo-synced LFO divisions (1/1 .. 1/32),
// mirroring FableSynth `LFO_DIVS` / `lfoDivFactor`.
inline constexpr int kLfoSyncDivCount = 11;
[[nodiscard]] inline double lfoSyncDivFactor(int index) noexcept {
    static constexpr std::array<double, kLfoSyncDivCount> kFactors = {
        0.25, 0.5, 1.0, 2.0 / 3.0, 1.5, 2.0, 4.0 / 3.0, 3.0, 4.0, 6.0, 8.0};
    const int clamped = index < 0 ? 0 : (index >= kLfoSyncDivCount ? kLfoSyncDivCount - 1 : index);
    return kFactors[static_cast<std::size_t>(clamped)];
}

[[nodiscard]] std::string_view filterTypeName(FilterType type) noexcept;
[[nodiscard]] FilterType filterTypeFromName(std::string_view name) noexcept;
[[nodiscard]] FilterType filterTypeFromIndex(int index) noexcept;
[[nodiscard]] std::string_view subShapeName(SubShape shape) noexcept;
[[nodiscard]] SubShape subShapeFromName(std::string_view name) noexcept;
[[nodiscard]] SubShape subShapeFromIndex(int index) noexcept;
[[nodiscard]] std::string_view noiseTypeName(NoiseType type) noexcept;
[[nodiscard]] NoiseType noiseTypeFromName(std::string_view name) noexcept;
[[nodiscard]] NoiseType noiseTypeFromIndex(int index) noexcept;
[[nodiscard]] std::string_view lfoShapeName(LfoShape shape) noexcept;
[[nodiscard]] LfoShape lfoShapeFromName(std::string_view name) noexcept;
[[nodiscard]] LfoShape lfoShapeFromIndex(int index) noexcept;

// Simplified WT-1 parameter snapshot (no mod matrix, no internal FX rack, no arp/seq).
struct WavetableSynthParams {
    struct Osc {
        bool on = true;
        WavetableId table = WavetableId::Prime;
        float position = 0.0f;    // 0..1 wavetable morph position
        int octave = 0;           // -3..+3 octaves
        int semitones = 0;        // -24..+24 semitones
        float fine = 0.0f;        // -100..+100 cents
        int unison = 1;           // 1..7 unison voices
        float detune = 0.2f;      // 0..1 (up to +/-50 cents spread)
        float spread = 0.6f;      // 0..1 stereo width of unison voices
        float blend = 1.0f;       // 0..1 outer unison voice balance
        float level = 0.75f;      // 0..1.2 oscillator output level
        float pan = 0.0f;         // -1..+1 stereo pan
    };

    struct Sub {
        bool on = false;
        SubShape shape = SubShape::Sine;
        int octave = -1;          // -2..0 octaves
        float level = 0.0f;       // 0..1
    };

    struct Noise {
        bool on = false;
        NoiseType type = NoiseType::White;
        float level = 0.0f;       // 0..1
    };

    struct Filter {
        bool on = true;
        FilterType type = FilterType::Lp24;
        float cutoffHz = 9000.0f; // 20..20000 Hz
        float resonance = 0.18f;  // 0..0.99
        float drive = 0.0f;       // 0..1 (2x oversampled ADAA tanh)
        float envAmount = 0.0f;   // -1..+1 (+/-4 octaves from modEnv)
        float keyTrack = 0.0f;    // 0..1 (1 = 100% keyboard tracking around C4/60)
    };

    struct Env {
        float attackSec = 0.004f;  // 0.001..8 s
        float decaySec = 0.25f;    // 0.005..10 s
        float sustain = 0.8f;      // 0..1
        float releaseSec = 0.3f;   // 0.005..12 s
    };

    struct Lfo {
        LfoShape shape = LfoShape::Sine;
        float rateHz = 2.0f;      // 0.02..30 Hz (free-run)
        bool tempoSync = false;
        int syncDiv = 2;          // 0..10 (1/1 .. 1/32, default 2 = 1/4)
        float riseSec = 0.0f;     // 0..5 s fade-in per note
        float phase = 0.0f;       // 0..1 initial phase offset
        bool retrig = false;      // false = global free/transport-locked, true = per-voice
        // 3 fixed modulation destinations (WT-1 scaling):
        float toPitch = 0.0f;     // -1..+1 (1.0 = +/-12 semitones)
        float toPos = 0.0f;       // -1..+1 (morphs oscA/oscB table position)
        float toCutoff = 0.0f;    // -1..+1 (1.0 = +/-5 octaves)
    };

    Osc oscA{true, WavetableId::Prime, 0.0f, 0, 0, 0.0f, 1, 0.2f, 0.6f, 1.0f, 0.75f, 0.0f};
    Osc oscB{false, WavetableId::Bloom, 0.0f, 0, 0, 0.0f, 1, 0.2f, 0.6f, 1.0f, 0.0f, 0.0f};
    Sub sub{};
    Noise noise{};
    Filter filter{};
    Env ampEnv{0.004f, 0.25f, 0.8f, 0.3f};
    Env modEnv{0.01f, 0.35f, 0.0f, 0.3f};
    Lfo lfo{};

    float velToAmp = 1.0f;        // 0..1 velocity sensitivity on voice amplitude
    float velToCutoff = 0.0f;     // -1..+1 velocity to filter cutoff (1.0 = +5 octaves)
    bool mono = false;
    bool legato = false;
    float glideSec = 0.0f;        // 0..2 s portamento time
    float pitchBendRange = 2.0f;  // 0..24 semitones
    float modWheel = 0.0f;        // 0..1 (CC 1)
    float masterVolume = 0.75f;   // 0..1.5
};

// High-fidelity real-time wavetable synthesizer derived from FableSynth WT-1.
//
// Ownership: owned by value inside `WavetableSynthProcessor` (or a test caller).
// All voice state and chunk scratch buffers live inline (zero heap allocations
// during rendering). Immutable wavetable data is borrowed from `factoryWavetables()`
// and `subSquareTable()`, pre-initialized in `prepare()`.
//
// Thread affinity: `prepare()` runs on the control / plan-build thread before audio
// publication. After publication, `reset()`, `setParams()`, `setParameter()`,
// `noteOn()`, `noteOff()`, `setPitchBend()`, `setModWheel()`, `setSustainPedal()`,
// `setTempo()`, and `renderBlock()` run on the audio render thread (serialized by
// MixRenderLease) with zero allocations, zero locks, and zero syscalls.
class WavetableSynth {
public:
    static constexpr int kMaxVoices = 16;
    static constexpr int kMaxUnison = 7;
    static constexpr int kRenderChunkFrames = 128;
    static constexpr double kStealFadeSec = 0.004;
    static constexpr double kAmpSlewSec = 0.0003;
    static constexpr double kVelSlewSec = 0.004;
    static constexpr double kRetriggerSoftSec = 0.004;
    static constexpr double kDriveOsRampSec = 0.004;
    static constexpr double kParamSmoothSec = 0.020;

    struct ClipEnvelope {
        double startMs = 0.0;
        double durationMs = 0.0;
        float gain = 1.0f;
        audio::ResolvedFades fades{};

        [[nodiscard]] double gainAt(double timeMs) const noexcept;
    };

    struct MidiEvent {
        enum class Type : std::uint8_t { NoteOn, NoteOff, PitchBend, ModWheel, Sustain };
        int frameOffset = 0;      // 0-based frame inside the current block
        Type type = Type::NoteOn;
        int data1 = 0;            // MIDI note number (0..127) for NoteOn/NoteOff
        float value = 0.0f;       // velocity [0..1], bend [-1..1], modWheel/sustain [0..1]
        float clipGain = 1.0f;    // linear clip gain multiplier for NoteOn
        int clipIndex = -1;       // optional index into ClipEnvelope table (-1 = none)
    };

    WavetableSynth();

    // Control thread: prepares sample-rate-dependent constants and ensures the
    // immutable wavetable pyramids are built off the audio thread. Resets voices.
    void prepare(double sampleRate);
    [[nodiscard]] double sampleRate() const noexcept { return sampleRate_; }

    // Real-time safe parameter control (no allocation, no lock).
    // `setParams` snaps all smoothed values immediately (preset load / initialization).
    void setParams(const WavetableSynthParams& params) noexcept;
    [[nodiscard]] const WavetableSynthParams& params() const noexcept { return target_; }
    // Updates one named parameter; continuous parameters smooth over kParamSmoothSec.
    bool setParameter(std::string_view name, double value) noexcept;

    // Real-time safe transport and MIDI control (no allocation, no lock).
    void reset() noexcept;
    void setTempo(double bpm, double ppq = 0.0, bool playing = false) noexcept;
    void noteOn(int midiNote, float velocity, float clipGain = 1.0f, int clipIndex = -1) noexcept;
    void noteOff(int midiNote, int clipIndex = -1) noexcept;
    void setPitchBend(float normalizedMinus1To1) noexcept;
    void setModWheel(float normalized0To1) noexcept;
    void setSustainPedal(bool down) noexcept;
    void processMidiEvent(const MidiEvent& ev) noexcept;

    // Adds interleaved stereo output (`stereo.size() == frames * 2`) into `stereo`,
    // splitting the block at each event's `frameOffset` for sample-accurate MIDI.
    // `events` must be sorted in non-decreasing `frameOffset` order. When
    // `clipEnvelopes` and finite timing are supplied, each voice evaluates its own
    // source-clip envelope before summing.
    void renderBlock(std::span<float> stereo,
                     std::span<const MidiEvent> events = {},
                     double blockStartMs = std::numeric_limits<double>::quiet_NaN(),
                     double msPerFrame = 0.0,
                     std::span<const ClipEnvelope> clipEnvelopes = {}) noexcept;

    [[nodiscard]] int activeVoiceCount() const noexcept;
    [[nodiscard]] bool hasActiveVoices() const noexcept { return activeVoiceCount() > 0; }
    [[nodiscard]] double newestVoicePitch() const noexcept;

private:
    friend class ::TestWavetableSynth;
    struct Rng {
        std::uint32_t state = 0x9e3779b9u;
        inline float next() noexcept {
            state ^= state << 13;
            state ^= state >> 17;
            state ^= state << 5;
            return static_cast<float>(state >> 8) * (1.0f / 16777216.0f);
        }
    };

    struct Env {
        int state = 0;  // 0=idle, 1=attack, 2=decay, 3=sustain, 4=release, 5=steal fade
        double level = 0.0;
        double sustain = 0.8;
        double ca = 0.01;
        double cd = 0.001;
        double cr = 0.001;
        double cs = 0.12;
        double caSoft = 0.0;
        double lastA = -1.0;
        double lastD = -1.0;
        double lastR = -1.0;
        double lastSr = -1.0;

        void set(double a, double d, double sus, double r, double sr) noexcept;
        void trigger() noexcept { state = 1; caSoft = 0.0; }
        void softAttack(double sec) noexcept;
        void release() noexcept { if (state != 0) { state = 4; } }
        void kill() noexcept { state = 0; level = 0.0; caSoft = 0.0; }
        double process() noexcept;
        double processBlock(int n) noexcept;
    };

    struct LfoClock {
        bool ready = false;
        double position = 0.0;
        double rate = 0.0;
        double cycles = 0.0;
        void reset() noexcept { ready = false; }
        double phase(double pos, double r) noexcept;
    };

    struct LfoState {
        LfoClock clock;
        double phase = 0.0;
        double hold = 0.0;
        std::int64_t elapsed = 0;
        void reset(Rng& rng) noexcept;
        [[nodiscard]] double value(LfoShape shape, double phaseOffset) const noexcept;
        [[nodiscard]] double riseGain(double riseSec, double sr) const noexcept;
        void advance(double rateHz, int n, double sr, Rng& rng) noexcept;
    };

    struct DriveAllpass {
        double x1 = 0.0;
        double y1 = 0.0;
        double process(double a, double x) noexcept {
            const double sx = std::abs(x) < 1.0e-24 ? 0.0 : x;
            const double raw = a * (sx - y1) + x1;
            const double y = std::abs(raw) < 1.0e-24 ? 0.0 : raw;
            x1 = sx;
            y1 = y;
            return y;
        }
    };

    // 2x polyphase IIR half-band oversampler + ADAA tanh saturator (from FableSynth DriveOs.h).
    struct DriveOs2 {
        static constexpr std::array<double, 5> kCoef = {
            0.058131122888383423,
            0.21191463147606193,
            0.4170395803350932,
            0.63844438482644794,
            0.87095859811277021,
        };
        static constexpr double kInputLimit = 16.0;
        DriveAllpass u0[3]{};
        DriveAllpass u1[2]{};
        DriveAllpass d0[3]{};
        DriveAllpass d1[2]{};
        double dprev = 0.0;
        double xp = 0.0;
        double w = 0.0;
        void reset() noexcept { *this = DriveOs2{}; }
        void clearFilters() noexcept {
            for (auto& s : u0) s = DriveAllpass{};
            for (auto& s : u1) s = DriveAllpass{};
            for (auto& s : d0) s = DriveAllpass{};
            for (auto& s : d1) s = DriveAllpass{};
            dprev = 0.0;
        }
        static double clampIn(double x) noexcept {
            return std::isfinite(x) ? std::clamp(x, -kInputLimit, kInputLimit) : 0.0;
        }
        void interpolate(double x, double& y0, double& y1) noexcept {
            const double sx = clampIn(x);
            y0 = u0[2].process(kCoef[4], u0[1].process(kCoef[2], u0[0].process(kCoef[0], sx)));
            y1 = u1[1].process(kCoef[3], u1[0].process(kCoef[1], sx));
        }
        double decimate(double e, double o) noexcept {
            const double a = d0[2].process(kCoef[4], d0[1].process(kCoef[2], d0[0].process(kCoef[0], e)));
            const double b = d1[1].process(kCoef[3], d1[0].process(kCoef[1], o));
            const double out = 0.5 * (a + dprev);
            dprev = b;
            return out;
        }
        template <class Sat>
        double run(double x, bool engage, bool satOn, double m, double wStep, Sat&& sat) noexcept {
            const bool wasActive = w > 0.0;
            const double target = engage ? 1.0 : 0.0;
            if (w < target) {
                w = std::min(target, w + wStep);
            } else if (w > target) {
                w = std::max(target, w - wStep);
            }
            const double sx = clampIn(x);
            if (w <= 0.0 && !engage) {
                if (wasActive) {
                    clearFilters();
                }
                xp = sx;
                return sx;
            }
            double y0 = 0.0;
            double y1 = 0.0;
            interpolate(sx, y0, y1);
            const double a0 = clampIn(y0);
            const double a1 = clampIn(y1);
            double o0 = a0;
            double o1 = a1;
            if (satOn) {
                o0 = a0 + m * (sat(a0, xp) - a0);
                o1 = a1 + m * (sat(a1, a0) - a1);
            }
            xp = a1;
            const double y = decimate(o0, o1);
            return w >= 1.0 ? y : sx + w * (y - sx);
        }
    };

    struct FilterState {
        bool active = false;
        FilterType type = FilterType::Lp24;
        double svf[8]{};  // 2 stages x 2 channels x (ic1, ic2)
        DriveOs2 osL;
        DriveOs2 osR;
        double drive = 0.0;
        double driveMix = 0.0;
        double driveMixTarget = 0.0;
        double cutSm = 0.0;
        double cutTarget = 9000.0;
        double cutPrev = -1.0;
        double k1 = 1.65;
        double k2 = 2.0;
        void reset() noexcept;
    };

    struct OscState {
        std::array<double, kMaxUnison> phases{};
        std::array<double, kMaxUnison> incs{};
        std::array<double, kMaxUnison> pIncs{};
        std::array<double, kMaxUnison> ratios{};
        std::array<float, kMaxUnison> gl{};
        std::array<float, kMaxUnison> gr{};
        std::array<float, kMaxUnison> pGl{};
        std::array<float, kMaxUnison> pGr{};
        int uni = 1;
        int pUni = -1;
        int off0 = 0;
        int off1 = 0;
        int off0b = 0;
        int off1b = 0;
        int pOff0 = -1;
        double mipBlend = 0.0;
        double ft = 0.0;
        double pFt = 0.0;
        double gain = 0.0;
        double sumW2 = 1.0;
        int cacheUni = -1;
        double cacheDet = -1.0;
        double cacheSpr = -1.0;
        double cacheBlend = -1.0;
        double cachePan = -2.0;
        const float* data = nullptr;
        double posSm = -1.0;
        bool havePrev = false;
    };

    struct HeldNote {
        int note = 60;
        double vel = 1.0;
        double clipGain = 1.0;
        int clipIndex = -1;
    };

    struct Voice {
        int note = 60;
        double vel = 1.0;
        double clipGain = 1.0;
        int clipIndex = -1;
        bool gate = false;
        bool sustained = false;
        std::uint64_t age = 0;
        double pitch = 60.0;
        double velGain = 1.0;
        double velSm = -1.0;
        double clipGainSm = -1.0;
        double clipEnvSm = -1.0;
        bool clipEnvSlewing = false;
        double ampSm = 0.0;

        bool hasPending = false;
        int pendNote = 60;
        double pendVel = 1.0;
        double pendStart = 60.0;
        double pendClipGain = 1.0;
        int pendClipIndex = -1;
        std::uint64_t pendAge = 0;

        Env ampEnv;
        Env modEnv;
        LfoState lfo;
        OscState oscA;
        OscState oscB;
        double subPhase = 0.0;
        double subIncPrev = -1.0;
        double pb[7]{};  // Kellet pink noise state
        FilterState filter;
        double dcxL = 0.0;
        double dcxR = 0.0;
        double dcyL = 0.0;
        double dcyR = 0.0;

        [[nodiscard]] bool active() const noexcept { return ampEnv.state != 0 || ampSm > 1e-4; }
    };

    void startVoice(Voice& v, int note, double vel, double startPitch, double clipGain, int clipIndex) noexcept;
    void retriggerVoice(Voice& v, int note, double vel, double clipGain, int clipIndex) noexcept;
    void releaseVoice(Voice& v) noexcept;
    void killVoice(Voice& v) noexcept;
    void heldRemove(int note, int clipIndex) noexcept;
    void monoNoteOn(int note, double vel, double clipGain, int clipIndex) noexcept;
    void monoNoteOff(int note, int clipIndex) noexcept;
    void polyNoteOn(int note, double vel, double clipGain, int clipIndex) noexcept;
    void advanceParamSmoothing(int frames) noexcept;
    [[nodiscard]] double computeVelGain(double vel) const noexcept;
    [[nodiscard]] double lfoRateHz() const noexcept;
    bool setupOsc(OscState& o, const WavetableSynthParams::Osc& cfg, const Voice& v,
                  double mPitch, double mPos, int n) noexcept;
    void renderOsc(OscState& o, float* tmpL, float* tmpR, int n) noexcept;
    void setupFilter(FilterState& f, const Voice& v, double modEnvLevel, double mCut, int n) noexcept;
    void runFilter(FilterState& f, const float* inL, const float* inR, float* outL, float* outR, int n) noexcept;
    void renderVoice(Voice& v, float* outL, float* outR, int n,
                     double chunkStartMs, double msPerFrame,
                     std::span<const ClipEnvelope> clipEnvelopes) noexcept;
    void renderChunk(float* stereoOut, int frames, double ppqChunk,
                     double chunkStartMs, double msPerFrame,
                     std::span<const ClipEnvelope> clipEnvelopes) noexcept;
    void renderFrames(std::span<float> stereo, std::size_t startFrame, std::size_t frameCount,
                      double sliceStartMs, double msPerFrame,
                      std::span<const ClipEnvelope> clipEnvelopes) noexcept;

    WavetableSynthParams target_{};
    WavetableSynthParams cur_{};
    const std::array<WavetableData, kWavetableCount>* tables_ = nullptr;
    const float* subSquare_ = nullptr;

    double sampleRate_ = 48000.0;
    int controlChunkFrames_ = 64;
    int svfSubStepFrames_ = 32;
    bool prepared_ = false;
    double bpm_ = 120.0;
    double ppq_ = 0.0;
    bool playing_ = false;

    double bendTarget_ = 0.0;     // -1..+1
    double bendCur_ = 0.0;
    double modWheelTarget_ = 0.0; // 0..1
    double modWheelCur_ = 0.0;
    bool sustainDown_ = false;

    double dcR_ = 0.9998;
    std::array<double, 6> pinkP_{};
    std::array<double, 6> pinkG_{};
    double ampSlewK_ = 0.07;
    double velSlewK_ = 0.005;
    double driveWStep_ = 0.005;
    double lastPitch_ = 60.0;
    bool hasLastPitch_ = false;
    std::uint64_t clock_ = 1;

    Rng rng_{};
    LfoState globalLfo_{};
    std::array<HeldNote, 32> held_{};
    int heldCount_ = 0;
    std::array<Voice, kMaxVoices> voices_{};

    // Inline chunk scratch buffers (no heap allocation in render).
    std::array<float, kRenderChunkFrames> mixL_{};
    std::array<float, kRenderChunkFrames> mixR_{};
    std::array<float, kRenderChunkFrames> tmpL_{};
    std::array<float, kRenderChunkFrames> tmpR_{};
    std::array<float, kRenderChunkFrames> fltL_{};
    std::array<float, kRenderChunkFrames> fltR_{};
};

// Timeline BlockProcessor wrapping WavetableSynth for MIDI tracks with
// `instrument.type == "wavetable"`, matching SubtractiveInstrumentProcessor's contract.
//
// Ownership: owned by MixPlan's TrackPlan::processors vector (shared_ptr per the
// BlockProcessor registry interface). Owns `synth_`, `events_`, `chase_`, `heldNotes_`,
// `clips_`, and `blockEvents_` by value.
// Thread affinity: constructed and prepared on the control / plan-build thread and
// destroyed there after renderer retirement. After publication, MixRenderLease
// serializes `process()`, `reset()`, and `setParameter()` on the render thread with
// zero allocations, zero locks, and zero syscalls.
class WavetableSynthProcessor final : public audio::BlockProcessor {
public:
    WavetableSynthProcessor(const Timeline& timeline, const Track& track);
    ~WavetableSynthProcessor() override = default;
    WavetableSynthProcessor(const WavetableSynthProcessor&) = delete;
    WavetableSynthProcessor& operator=(const WavetableSynthProcessor&) = delete;

    void prepare(double rate) override;
    void reset() noexcept override;
    [[nodiscard]] bool hasPendingOutput(int) const noexcept override;
    bool setParameter(std::string_view name, double value) noexcept override;
    void process(std::span<float> stereo, const audio::BlockContext& context) noexcept override;

    [[nodiscard]] const WavetableSynth& synth() const noexcept { return synth_; }

private:
    static constexpr std::size_t kMaxBlockMidiEvents = 256;

    struct TimedMidiEvent {
        double timeMs = 0.0;
        std::uint8_t status = 0;
        std::uint8_t data1 = 0;
        std::uint8_t data2 = 0;
        bool clipEndReset = false;
        int clipIndex = -1;
    };

    struct HeldMidiNote {
        double onMs = 0.0;
        double offMs = 0.0;
        std::uint8_t pitch = 60;
        std::uint8_t velocity = 100;
        int clipIndex = -1;
    };

    void chaseAt(double timeMs) noexcept;
    void renderSlice(std::span<float> stereo, std::size_t startFrame, std::size_t frameCount,
                     std::span<WavetableSynth::MidiEvent> events, double blockStartMs, double msPerFrame) noexcept;

    WavetableSynth synth_;
    std::vector<TimedMidiEvent> events_;
    std::vector<audio::vst::MidiChaseLane> chase_;
    std::vector<HeldMidiNote> heldNotes_;
    std::vector<WavetableSynth::ClipEnvelope> clips_;
    double bpm_ = 120.0;
    std::size_t eventCursor_ = 0;
    double expectedMs_ = std::numeric_limits<double>::quiet_NaN();
    std::array<WavetableSynth::MidiEvent, kMaxBlockMidiEvents> blockEvents_{};
};

}  // namespace nt::midi
