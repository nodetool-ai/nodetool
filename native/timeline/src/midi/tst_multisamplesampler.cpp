// Tests for nt::midi::MultisampleSampler, MultisampleSamplerProcessor, and SamplerEdits.
// Covers key/velocity zone selection, pitch tracking accuracy (cents), loop crossfade
// without clicks, release sample trigger, amp ADSR, velocity curve, glide, voice limit
// and oldest-voice stealing, pitch bend, WAV file decode & pitch detection, 44.1/48/96 kHz
// preparation, atomic zone swap without allocation or glitch, document round trip,
// zero audio-thread allocations (TestAllocationCounter.h), and a polyphonic CPU bound.

#include "../../tests/RequireValue.h"
#include "audio/Mixer.h"
#include "audio/TestAllocationCounter.h"
#include "audio/vst/VstAudioStages.h"
#include "midi/MultisampleSampler.h"
#include "midi/SamplerEdits.h"
#include "midi/SamplerHelper.h"
#include "model/TimelineJson.h"

#include <QDir>
#include <QJsonArray>
#include <QJsonObject>
#include <QSignalSpy>
#include <QTemporaryDir>
#include <QThreadPool>
#include <QtTest>

#include <algorithm>
#include <array>
#include <atomic>
#include <chrono>
#include <cmath>
#include <cstdio>
#include <limits>
#include <memory>
#include <numbers>
#include <thread>
#include <vector>

using namespace nt::midi;

namespace {

float peakAbs(std::span<const float> buf, std::size_t startFrame, std::size_t frameCount) {
    float peak = 0.0f;
    const std::size_t end = std::min(buf.size() / 2, startFrame + frameCount);
    for (std::size_t f = startFrame; f < end; ++f) {
        peak = std::max(peak, std::abs(buf[f * 2]));
        peak = std::max(peak, std::abs(buf[f * 2 + 1]));
    }
    return peak;
}

double rmsLeft(std::span<const float> buf, std::size_t startFrame, std::size_t frameCount) {
    const std::size_t end = std::min(buf.size() / 2, startFrame + frameCount);
    if (end <= startFrame) return 0.0;
    double sum = 0.0;
    for (std::size_t f = startFrame; f < end; ++f) {
        const double v = buf[f * 2];
        sum += v * v;
    }
    return std::sqrt(sum / static_cast<double>(end - startFrame));
}

DecodedAudioBuffer makeSineBuffer(double freqHz, double sampleRate, std::size_t frames, float amp = 0.8f) {
    DecodedAudioBuffer out;
    out.sampleRate = sampleRate;
    out.interleavedStereo.resize(frames * 2);
    for (std::size_t i = 0; i < frames; ++i) {
        const float s = amp * static_cast<float>(std::sin(2.0 * std::numbers::pi * freqHz * static_cast<double>(i) / sampleRate));
        out.interleavedStereo[i * 2] = s;
        out.interleavedStereo[i * 2 + 1] = s;
    }
    return out;
}

DecodedAudioBuffer makeConstBuffer(float leftVal, float rightVal, double sampleRate, std::size_t frames) {
    DecodedAudioBuffer out;
    out.sampleRate = sampleRate;
    out.interleavedStereo.resize(frames * 2);
    for (std::size_t i = 0; i < frames; ++i) {
        out.interleavedStereo[i * 2] = leftVal;
        out.interleavedStereo[i * 2 + 1] = rightVal;
    }
    return out;
}

// Measures fundamental frequency of a clean sine wave via sub-sample rising zero-crossings.
double measureSineFrequencyHz(std::span<const float> stereo, std::size_t startFrame, std::size_t frameCount,
                              double sampleRate) {
    const std::size_t end = std::min(stereo.size() / 2, startFrame + frameCount);
    double firstCross = -1.0;
    double lastCross = -1.0;
    int crossings = 0;
    for (std::size_t f = startFrame + 1; f < end; ++f) {
        const double prev = stereo[(f - 1) * 2];
        const double curr = stereo[f * 2];
        if (prev <= 0.0 && curr > 0.0) {
            const double frac = (curr - prev) > 1e-12 ? (-prev / (curr - prev)) : 0.0;
            const double pos = static_cast<double>(f - 1) + frac;
            if (firstCross < 0.0) firstCross = pos;
            lastCross = pos;
            ++crossings;
        }
    }
    if (crossings < 2 || lastCross <= firstCross) return 0.0;
    const double avgPeriodFrames = (lastCross - firstCross) / static_cast<double>(crossings - 1);
    return sampleRate / avgPeriodFrames;
}

SampleResolver mapResolver(std::unordered_map<std::string, DecodedAudioBuffer> table) {
    return [t = std::move(table)](const std::string& assetId, const std::string& mediaPath,
                                  double) -> std::optional<DecodedAudioBuffer> {
        if (!assetId.empty()) {
            if (const auto it = t.find(assetId); it != t.end()) return it->second;
        }
        if (!mediaPath.empty()) {
            if (const auto it = t.find(mediaPath); it != t.end()) return it->second;
        }
        return std::nullopt;
    };
}

}  // namespace

class TestMultisampleSampler : public QObject {
    Q_OBJECT

private slots:
    void keyAndVelocityZoneSelection() {
        SamplerInstrumentSpec spec;
        spec.params.oneShot = true;
        spec.params.attackMs = 0.0f;
        spec.params.decayMs = 0.0f;
        spec.params.sustain = 1.0f;
        spec.params.releaseMs = 50.0f;
        spec.params.gainDb = 0.0f;

        // Zone A: keys 36..59, vel 1..64 -> +0.25 DC
        SamplerZoneSpec zA;
        zA.id = "zA";
        zA.name = "LowSoft";
        zA.mediaPath = "a.wav";
        zA.rootNote = 48;
        zA.lowNote = 36;
        zA.highNote = 59;
        zA.lowVelocity = 1;
        zA.highVelocity = 64;

        // Zone B: keys 36..59, vel 65..127 -> +0.75 DC
        SamplerZoneSpec zB = zA;
        zB.id = "zB";
        zB.name = "LowLoud";
        zB.mediaPath = "b.wav";
        zB.lowVelocity = 65;
        zB.highVelocity = 127;

        // Zone C: keys 55..84, vel 1..127 -> -0.50 DC (overlaps 55..59!)
        SamplerZoneSpec zC;
        zC.id = "zC";
        zC.name = "HighLayer";
        zC.mediaPath = "c.wav";
        zC.rootNote = 60;
        zC.lowNote = 55;
        zC.highNote = 84;
        zC.lowVelocity = 1;
        zC.highVelocity = 127;

        spec.zones = {zA, zB, zC};

        auto resolver = mapResolver({
            {"a.wav", makeConstBuffer(0.25f, 0.25f, 48000.0, 2048)},
            {"b.wav", makeConstBuffer(0.75f, 0.75f, 48000.0, 2048)},
            {"c.wav", makeConstBuffer(-0.50f, -0.50f, 48000.0, 2048)},
        });

        MultisampleSampler sampler;
        sampler.setParams(spec.params);
        sampler.prepare(48000.0);
        sampler.publishPreparedSet(prepareSampleSet(spec, 48000.0, resolver));

        auto renderSingle = [&](int note, int vel) {
            sampler.reset();
            std::array<float, 128 * 2> out{};
            const std::array<MultisampleSampler::MidiEvent, 1> ev{{
                {0, MultisampleSampler::EventKind::NoteOn, note, vel, 1.0f, 0.0f},
            }};
            sampler.renderBlock(out, ev);
            return out[16 * 2];
        };

        // Out of range -> silence.
        QCOMPARE(renderSingle(24, 100), 0.0f);
        QCOMPARE(renderSingle(100, 100), 0.0f);

        // LowSoft only (note 48, vel 64).
        const float vLowSoft = renderSingle(48, 64);
        QCOMPARE(sampler.activeVoiceCount(), 1);
        QVERIFY2(vLowSoft > 0.05f && vLowSoft < 0.25f, qPrintable(QString("vLowSoft=%1").arg(vLowSoft)));

        // LowLoud only (note 48, vel 127).
        const float vLowLoud = renderSingle(48, 127);
        QCOMPARE(sampler.activeVoiceCount(), 1);
        QVERIFY2(vLowLoud > 0.45f, qPrintable(QString("vLowLoud=%1").arg(vLowLoud)));

        // HighLayer only (note 72, vel 127) -> negative polarity.
        const float vHigh = renderSingle(72, 127);
        QCOMPARE(sampler.activeVoiceCount(), 1);
        QVERIFY2(vHigh < -0.25f, qPrintable(QString("vHigh=%1").arg(vHigh)));

        // Overlap zone (note 57, vel 127) -> layers zB (+0.75) + zC (-0.50) = +0.25 net, 2 voices!
        const float vOverlap = renderSingle(57, 127);
        QCOMPARE(sampler.activeVoiceCount(), 2);
        QVERIFY2(vOverlap > 0.05f && vOverlap < vLowLoud * 0.6f,
                 qPrintable(QString("vOverlap=%1 vLowLoud=%2").arg(vOverlap).arg(vLowLoud)));
    }

    void pitchTrackingAccuracyInCents() {
        constexpr double kRate = 48000.0;
        constexpr double kRootFreq = 440.0;  // MIDI 69 (A4)
        SamplerInstrumentSpec spec;
        spec.params.oneShot = false;
        spec.params.attackMs = 0.0f;
        spec.params.decayMs = 0.0f;
        spec.params.sustain = 1.0f;
        spec.params.releaseMs = 50.0f;
        spec.params.pitchBendRange = 2.0f;
        spec.params.gainDb = 0.0f;

        SamplerZoneSpec z;
        z.id = "sine";
        z.name = "A4Sine";
        z.mediaPath = "a4.wav";
        z.rootNote = 69;
        z.lowNote = 0;
        z.highNote = 127;
        z.loopMode = SamplerLoopMode::Sustain;
        z.loopStart = 0.1;
        z.loopEnd = 0.9;
        z.loopCrossfadeMs = 5.0f;
        spec.zones = {z};

        auto resolver = mapResolver({{"a4.wav", makeSineBuffer(kRootFreq, kRate, 48000, 0.8f)}});

        auto verifyPitch = [&](int midiNote, float tuneCents, float pitchBendNorm, double expectedSemisFrom69) {
            spec.zones[0].tuneCents = tuneCents;
            MultisampleSampler sampler;
            sampler.setParams(spec.params);
            sampler.prepare(kRate);
            sampler.publishPreparedSet(prepareSampleSet(spec, kRate, resolver));

            constexpr std::size_t kFrames = 8192;
            std::vector<float> out(kFrames * 2, 0.0f);
            std::vector<MultisampleSampler::MidiEvent> evs;
            if (pitchBendNorm != 0.0f) {
                evs.push_back({0, MultisampleSampler::EventKind::PitchBend, 0, 0, 1.0f, pitchBendNorm});
            }
            evs.push_back({0, MultisampleSampler::EventKind::NoteOn, midiNote, 127, 1.0f, 0.0f});
            sampler.renderBlock(out, evs);

            const double measuredHz = measureSineFrequencyHz(out, 512, kFrames - 1024, kRate);
            const double expectedHz = kRootFreq * std::exp2(expectedSemisFrom69 / 12.0);
            QVERIFY2(measuredHz > 20.0, qPrintable(QString("No pitch measured for note=%1").arg(midiNote)));
            const double errorCents = 1200.0 * std::abs(std::log2(measuredHz / expectedHz));
            QVERIFY2(errorCents < 1.5,
                     qPrintable(QString("Pitch error %1 cents (measured=%2 Hz expected=%3 Hz)")
                                    .arg(errorCents)
                                    .arg(measuredHz)
                                    .arg(expectedHz)));
        };

        verifyPitch(69, 0.0f, 0.0f, 0.0);     // Root (unity)
        verifyPitch(76, 0.0f, 0.0f, 7.0);     // +7 semitones (up-pitched, Sinc)
        verifyPitch(81, 0.0f, 0.0f, 12.0);    // +1 octave (2x speed, Sinc)
        verifyPitch(57, 0.0f, 0.0f, -12.0);   // -1 octave (0.5x speed, Hermite)
        verifyPitch(72, 50.0f, 0.0f, 3.5);    // +3 semitones + 50 cents fine tune
        verifyPitch(69, 0.0f, 1.0f, 2.0);     // +2 semitones via full pitch bend
        verifyPitch(69, 0.0f, -0.5f, -1.0);   // -1 semitone via half negative pitch bend
    }

    void loopCrossfadeWithoutClicks() {
        constexpr double kRate = 48000.0;

        auto testLoopConfig = [&](double loopStart, double loopEnd, int playNote) {
            // Create a ramp from -0.6 to +0.6 across the buffer so raw loop wrap
            // without crossfade would produce a huge ~1.2 step click!
            constexpr std::size_t kSrcFrames = 4800;  // 100 ms
            DecodedAudioBuffer buf;
            buf.sampleRate = kRate;
            buf.interleavedStereo.resize(kSrcFrames * 2);
            for (std::size_t i = 0; i < kSrcFrames; ++i) {
                const float v = -0.6f + 1.2f * static_cast<float>(i) / static_cast<float>(kSrcFrames - 1);
                buf.interleavedStereo[i * 2] = v;
                buf.interleavedStereo[i * 2 + 1] = v;
            }

            SamplerInstrumentSpec spec;
            spec.params.oneShot = false;
            spec.params.attackMs = 5.0f;
            spec.params.decayMs = 0.0f;
            spec.params.sustain = 1.0f;
            spec.params.releaseMs = 20.0f;
            spec.params.gainDb = 0.0f;

            SamplerZoneSpec z;
            z.id = "loop";
            z.name = "LoopZone";
            z.mediaPath = "ramp.wav";
            z.rootNote = 60;
            z.lowNote = 0;
            z.highNote = 127;
            z.loopMode = SamplerLoopMode::Sustain;
            z.loopStart = loopStart;
            z.loopEnd = loopEnd;
            z.loopCrossfadeMs = 12.0f;
            spec.zones = {z};

            MultisampleSampler sampler;
            sampler.setParams(spec.params);
            sampler.prepare(kRate);
            sampler.publishPreparedSet(prepareSampleSet(spec, kRate, mapResolver({{"ramp.wav", buf}})));

            // Render 300 ms (at least 4+ loop wraps) while held.
            constexpr std::size_t kOutFrames = 14400;
            std::vector<float> out(kOutFrames * 2, 0.0f);
            const std::array<MultisampleSampler::MidiEvent, 1> ev{{
                {0, MultisampleSampler::EventKind::NoteOn, playNote, 127, 1.0f, 0.0f},
            }};
            sampler.renderBlock(out, ev);

            // Must still be active after 300 ms (looping, not finished at 100 ms).
            QCOMPARE(sampler.activeVoiceCount(), 1);
            QVERIFY(rmsLeft(out, 10000, 4000) > 0.05);

            // Check maximum sample-to-sample step after initial attack settling (frame 400..end).
            float maxStep = 0.0f;
            for (std::size_t f = 400; f + 1 < kOutFrames; ++f) {
                maxStep = std::max(maxStep, std::abs(out[(f + 1) * 2] - out[f * 2]));
            }
            // Without crossfade the seam jump would be > 0.35; with 12 ms crossfade it must be < 0.02!
            QVERIFY2(maxStep < 0.025f,
                     qPrintable(QString("Loop click detected: maxStep=%1 (loopStart=%2 loopEnd=%3 note=%4)")
                                    .arg(maxStep)
                                    .arg(loopStart)
                                    .arg(loopEnd)
                                    .arg(playNote)));
        };

        testLoopConfig(0.25, 0.75, 60);  // loopStart > 0, unity pitch
        testLoopConfig(0.25, 0.75, 65);  // loopStart > 0, +5 semitones (sinc wrap)
        testLoopConfig(0.0, 0.50, 60);   // loopStart == 0 edge case, unity pitch
        testLoopConfig(0.0, 0.50, 55);   // loopStart == 0 edge case, -5 semitones (Hermite wrap)
    }

    void releaseSampleTrigger() {
        constexpr double kRate = 48000.0;
        SamplerInstrumentSpec spec;
        spec.params.oneShot = false;
        spec.params.attackMs = 0.0f;
        spec.params.decayMs = 0.0f;
        spec.params.sustain = 1.0f;
        spec.params.releaseMs = 2.0f;  // fast main release so release sample stands out
        spec.params.gainDb = 0.0f;

        SamplerZoneSpec z;
        z.id = "piano";
        z.name = "KeyWithRelease";
        z.mediaPath = "main.wav";
        z.releaseMediaPath = "rel.wav";
        z.releaseGainDb = 0.0f;
        z.rootNote = 60;
        z.lowNote = 0;
        z.highNote = 127;
        z.loopMode = SamplerLoopMode::Sustain;
        z.loopStart = 0.1;
        z.loopEnd = 0.9;
        spec.zones = {z};

        auto resolver = mapResolver({
            {"main.wav", makeConstBuffer(0.6f, 0.6f, kRate, 4800)},
            {"rel.wav", makeConstBuffer(-0.8f, -0.8f, kRate, 2400)},
        });

        MultisampleSampler sampler;
        sampler.setParams(spec.params);
        sampler.prepare(kRate);
        sampler.publishPreparedSet(prepareSampleSet(spec, kRate, resolver));

        // Phase 1: Note-on for 20 ms -> positive main sample only, 0 release voices.
        std::vector<float> held(960 * 2, 0.0f);
        const std::array<MultisampleSampler::MidiEvent, 1> onEv{{
            {0, MultisampleSampler::EventKind::NoteOn, 60, 127, 1.0f, 0.0f},
        }};
        sampler.renderBlock(held, onEv);
        QCOMPARE(sampler.activeReleaseVoiceCount(), 0);
        QVERIFY2(held[500 * 2] > 0.3f, qPrintable(QString("held=%1").arg(held[500 * 2])));

        // Phase 2: Note-off at frame 100 -> release sample triggers at frame 100 (negative polarity).
        std::vector<float> afterOff(2000 * 2, 0.0f);
        const std::array<MultisampleSampler::MidiEvent, 1> offEv{{
            {100, MultisampleSampler::EventKind::NoteOff, 60, 0, 1.0f, 0.0f},
        }};
        sampler.renderBlock(afterOff, offEv);
        QCOMPARE(sampler.activeReleaseVoiceCount(), 1);
        // After main 2 ms release (96 frames -> frame 250), only the negative release sample sounds.
        QVERIFY2(afterOff[400 * 2] < -0.35f, qPrintable(QString("release sample=%1").arg(afterOff[400 * 2])));

        // Render past release sample end (2400 frames = 50 ms) -> decays cleanly to silence.
        std::vector<float> tail(3000 * 2, 0.0f);
        sampler.renderBlock(tail);
        QCOMPARE(sampler.activeVoiceCount(), 0);
        QCOMPARE(sampler.activeReleaseVoiceCount(), 0);
    }

    void adsrVelocityCurveGlideAndVoiceStealing() {
        constexpr double kRate = 48000.0;
        SamplerInstrumentSpec spec;
        spec.params.oneShot = false;
        spec.params.attackMs = 20.0f;   // 960 frames
        spec.params.decayMs = 20.0f;    // 960 frames
        spec.params.sustain = 0.5f;
        spec.params.releaseMs = 20.0f;  // 960 frames
        spec.params.voiceLimit = 4;
        spec.params.gainDb = 0.0f;

        SamplerZoneSpec z;
        z.id = "dc";
        z.name = "DC";
        z.mediaPath = "dc.wav";
        z.rootNote = 60;
        z.lowNote = 0;
        z.highNote = 127;
        z.loopMode = SamplerLoopMode::Sustain;
        z.loopStart = 0.1;
        z.loopEnd = 0.9;
        spec.zones = {z};

        auto dcSet = prepareSampleSet(spec, kRate, mapResolver({{"dc.wav", makeConstBuffer(1.0f, 1.0f, kRate, 4800)}}));

        MultisampleSampler sampler;
        sampler.setParams(spec.params);
        sampler.prepare(kRate);
        sampler.publishPreparedSet(std::move(dcSet));

        // 1. ADSR envelope shape.
        std::vector<float> adsrBuf(4800 * 2, 0.0f);
        const std::array<MultisampleSampler::MidiEvent, 2> adsrEv{{
            {0, MultisampleSampler::EventKind::NoteOn, 60, 127, 1.0f, 0.0f},
            {3000, MultisampleSampler::EventKind::NoteOff, 60, 0, 1.0f, 0.0f},
        }};
        sampler.renderBlock(adsrBuf, adsrEv);
        const float earlyAtt = adsrBuf[100 * 2];
        const float peakAtt = adsrBuf[960 * 2];
        const float sustainVal = adsrBuf[2500 * 2];
        const float midRel = adsrBuf[3480 * 2];
        const float endRel = adsrBuf[4500 * 2];
        QVERIFY(earlyAtt < peakAtt * 0.3f);
        QVERIFY(peakAtt > 0.5f);
        QVERIFY2(std::abs(sustainVal / peakAtt - 0.5f) < 0.06f,
                 qPrintable(QString("sustain ratio=%1").arg(sustainVal / peakAtt)));
        QVERIFY(midRel > 0.05f && midRel < sustainVal * 0.75f);
        QVERIFY(std::abs(endRel) < 1e-4f);

        // 2. Velocity curve: curve=+1 (soft) < curve=0 (linear) < curve=-1 (hard) at mid velocity 64.
        auto renderAtCurve = [&](float curve) {
            auto p = spec.params;
            p.attackMs = 0.0f;
            p.decayMs = 0.0f;
            p.sustain = 1.0f;
            p.velocityCurve = curve;
            sampler.setParams(p);
            sampler.reset();
            std::array<float, 64 * 2> b{};
            const std::array<MultisampleSampler::MidiEvent, 1> ev{{
                {0, MultisampleSampler::EventKind::NoteOn, 60, 64, 1.0f, 0.0f},
            }};
            sampler.renderBlock(b, ev);
            return b[16 * 2];
        };
        const float soft = renderAtCurve(1.0f);
        const float lin = renderAtCurve(0.0f);
        const float hard = renderAtCurve(-1.0f);
        QVERIFY2(soft < lin * 0.75f && lin < hard * 0.85f,
                 qPrintable(QString("vel curves soft=%1 lin=%2 hard=%3").arg(soft).arg(lin).arg(hard)));

        // 3. Voice limit & oldest-voice stealing (voiceLimit = 4).
        auto pSteal = spec.params;
        pSteal.attackMs = 0.0f;
        pSteal.voiceLimit = 4;
        sampler.setParams(pSteal);
        sampler.reset();
        for (int n = 60; n < 66; ++n) {
            sampler.noteOn(n, 100);
        }
        QCOMPARE(sampler.activeVoiceCount(), 4);

        // 4. Glide: note 60 -> note 72 with 80 ms glide must ramp pitch gradually.
        SamplerInstrumentSpec glideSpec = spec;
        glideSpec.params.attackMs = 0.0f;
        glideSpec.params.decayMs = 0.0f;
        glideSpec.params.sustain = 1.0f;
        glideSpec.params.glideMs = 80.0f;
        glideSpec.zones[0].rootNote = 69;
        glideSpec.zones[0].mediaPath = "sine.wav";

        MultisampleSampler glideSampler;
        glideSampler.setParams(glideSpec.params);
        glideSampler.prepare(kRate);
        glideSampler.publishPreparedSet(
            prepareSampleSet(glideSpec, kRate, mapResolver({{"sine.wav", makeSineBuffer(440.0, kRate, 48000, 0.8f)}})));

        std::vector<float> glideOut(14400 * 2, 0.0f);
        const std::array<MultisampleSampler::MidiEvent, 3> glideEv{{
            {0, MultisampleSampler::EventKind::NoteOn, 69, 127, 1.0f, 0.0f},
            {480, MultisampleSampler::EventKind::NoteOff, 69, 0, 1.0f, 0.0f},
            {480, MultisampleSampler::EventKind::NoteOn, 81, 127, 1.0f, 0.0f},  // +1 octave target (880 Hz)
        }};
        glideSampler.renderBlock(glideOut, glideEv);
        const double earlyFreq = measureSineFrequencyHz(glideOut, 700, 1400, kRate);
        const double lateFreq = measureSineFrequencyHz(glideOut, 10000, 4000, kRate);
        // Early frequency must be strictly between 440 Hz and 850 Hz (in-flight glide); late settles near 880 Hz.
        QVERIFY2(earlyFreq > 460.0 && earlyFreq < 840.0,
                 qPrintable(QString("Expected mid-glide freq, got %1 Hz").arg(earlyFreq)));
        QVERIFY2(std::abs(lateFreq - 880.0) < 10.0,
                 qPrintable(QString("Expected settled glide ~880 Hz, got %1 Hz").arg(lateFreq)));
    }

    void atomicZoneSwapWithoutAllocationOrGlitch() {
        QVERIFY(nt::testing::countsAnAllocation());
        constexpr double kRate = 48000.0;

        SamplerInstrumentSpec specA;
        specA.params.oneShot = false;
        specA.params.attackMs = 0.0f;
        specA.params.decayMs = 0.0f;
        specA.params.sustain = 1.0f;
        specA.params.releaseMs = 100.0f;
        specA.params.gainDb = 0.0f;
        SamplerZoneSpec zA;
        zA.id = "a";
        zA.name = "A";
        zA.mediaPath = "a.wav";
        zA.rootNote = 60;
        zA.lowNote = 0;
        zA.highNote = 127;
        zA.loopMode = SamplerLoopMode::Sustain;
        zA.loopStart = 0.1;
        zA.loopEnd = 0.9;
        specA.zones = {zA};

        SamplerInstrumentSpec specB = specA;
        specB.zones[0].id = "b";
        specB.zones[0].mediaPath = "b.wav";

        auto resolver = mapResolver({
            {"a.wav", makeConstBuffer(0.8f, 0.8f, kRate, 4800)},
            {"b.wav", makeConstBuffer(-0.6f, -0.6f, kRate, 4800)},
        });

        MultisampleSampler sampler;
        sampler.setParams(specA.params);
        sampler.prepare(kRate);
        sampler.publishPreparedSet(prepareSampleSet(specA, kRate, resolver));

        // Start a sustained note on Set A.
        std::vector<float> pre(256 * 2, 0.0f);
        const std::array<MultisampleSampler::MidiEvent, 1> onA{{
            {0, MultisampleSampler::EventKind::NoteOn, 60, 127, 1.0f, 0.0f},
        }};
        sampler.renderBlock(pre, onA);
        const std::uint64_t genA = sampler.activeGeneration();
        QVERIFY(genA > 0);
        const float steadyA = pre[255 * 2];
        QVERIFY(steadyA > 0.4f);

        // Prepare Set B off the audio thread and publish atomically.
        auto setB = prepareSampleSet(specB, kRate, resolver);
        sampler.publishPreparedSet(std::move(setB));

        // Audio thread renders across the swap with ZERO allocations and smooth declick fade.
        std::vector<float> during(1024 * 2, 0.0f);
        nt::testing::allocations = 0;
        nt::testing::countAllocations = true;
        sampler.renderBlock(during);
        nt::testing::countAllocations = false;
        const std::size_t swapAllocs = nt::testing::allocations;
        QCOMPARE(swapAllocs, std::size_t{0});

        const std::uint64_t genB = sampler.activeGeneration();
        QVERIFY(genB > genA);

        // Verify smooth declick (no hard drop from steadyA to 0 in a single sample).
        float maxStep = std::abs(during[0] - steadyA);
        for (std::size_t f = 0; f + 1 < 1024; ++f) {
            maxStep = std::max(maxStep, std::abs(during[(f + 1) * 2] - during[f * 2]));
        }
        QVERIFY2(maxStep < steadyA * 0.10f,
                 qPrintable(QString("Swap glitch/click: maxStep=%1 steadyA=%2").arg(maxStep).arg(steadyA)));
        // After ~10 ms (480 frames), the drained Set A voice must have reached silence.
        QVERIFY(peakAbs(during, 600, 400) < 1e-3f);

        // Control thread reclaims retired Set A cleanly.
        const std::size_t reclaimed = sampler.reclaimRetired();
        QCOMPARE(reclaimed, std::size_t{1});

        // New note plays Set B (negative polarity) with zero allocations.
        std::array<float, 256 * 2> post{};
        const std::array<MultisampleSampler::MidiEvent, 1> onB{{
            {0, MultisampleSampler::EventKind::NoteOn, 60, 127, 1.0f, 0.0f},
        }};
        nt::testing::allocations = 0;
        nt::testing::countAllocations = true;
        sampler.renderBlock(post, onB);
        nt::testing::countAllocations = false;
        QCOMPARE(static_cast<std::size_t>(nt::testing::allocations), std::size_t{0});
        QVERIFY2(post[16 * 2] < -0.3f, qPrintable(QString("Expected Set B negative output, got %1").arg(post[16 * 2])));
    }

    void fileDecodePitchDetectionAndMultiSampleRates() {
        QTemporaryDir tempDir;
        QVERIFY(tempDir.isValid());

        // Write a 440 Hz stereo float WAV file into a subfolder (project-relative path).
        const QString subDir = tempDir.filePath(QStringLiteral("samples"));
        QVERIFY(QDir().mkpath(subDir));
        const QString wavPath = subDir + QStringLiteral("/a4_tone.wav");
        const auto srcBuf = makeSineBuffer(440.0, 48000.0, 24000, 0.7f);  // 0.5 s
        QVERIFY(nt::audio::vst::writeStereoFloatWav(wavPath, 48000, srcBuf.interleavedStereo));

        // Verify pitch detection on pitched sine waves and C3 fallback on unpitched noise.
        QCOMPARE(detectRootMidiNote(srcBuf.interleavedStereo, 48000.0), 69);
        const auto c3Buf = makeSineBuffer(261.625565, 48000.0, 16000, 0.7f);
        QCOMPARE(detectRootMidiNote(c3Buf.interleavedStereo, 48000.0), 60);
        // Deterministic pseudo-random white noise -> fallback C3 (60).
        std::vector<float> noise(8192 * 2, 0.0f);
        std::uint32_t rng = 0x12345678u;
        for (float& s : noise) {
            rng = rng * 1664525u + 1013904223u;
            s = (static_cast<float>(rng >> 8) / static_cast<float>(1 << 24)) * 2.0f - 1.0f;
        }
        QCOMPARE(detectRootMidiNote(noise, 48000.0, 60), 60);

        // Single-file drop helper spans all keys 0..127 and velocities 0..127 with detected root note.
        const auto dropped = createSingleFileZone("z1", "a4_tone", "", "samples/a4_tone.wav",
                                                  srcBuf.interleavedStereo, 48000.0);
        QCOMPARE(dropped.lowNote, 0);
        QCOMPARE(dropped.highNote, 127);
        QCOMPARE(dropped.lowVelocity, 0);
        QCOMPARE(dropped.highVelocity, 127);
        QCOMPARE(dropped.rootNote, 69);

        // Decode & render at 44.1 kHz, 48 kHz, and 96 kHz via project-relative mediaPath resolver.
        SamplerInstrumentSpec spec;
        spec.params.oneShot = true;
        spec.params.attackMs = 0.0f;
        spec.params.gainDb = 0.0f;
        spec.zones = {dropped};
        auto resolver = makeProjectFileSampleResolver(tempDir.path().toStdString());

        for (double rate : {44100.0, 48000.0, 96000.0}) {
            MultisampleSampler sampler;
            sampler.setParams(spec.params);
            sampler.prepare(rate);
            sampler.publishPreparedSet(prepareSampleSet(spec, rate, resolver));

            const std::size_t frames = static_cast<std::size_t>(rate * 0.25);
            std::vector<float> out(frames * 2, 0.0f);
            const std::array<MultisampleSampler::MidiEvent, 1> ev{{
                {0, MultisampleSampler::EventKind::NoteOn, 69, 127, 1.0f, 0.0f},
            }};
            sampler.renderBlock(out, ev);
            for (float s : out) {
                QVERIFY(std::isfinite(s));
                QVERIFY(std::fpclassify(s) != FP_SUBNORMAL);
            }
            const double hz = measureSineFrequencyHz(out, static_cast<std::size_t>(rate * 0.02),
                                                     static_cast<std::size_t>(rate * 0.15), rate);
            const double cents = 1200.0 * std::abs(std::log2(hz / 440.0));
            QVERIFY2(cents < 2.0, qPrintable(QString("Rate %1 Hz: pitch err %2 cents").arg(rate).arg(cents)));
        }
    }

    void documentRoundTripAndEdits() {
        SamplerInstrumentSpec original;
        original.params.oneShot = false;
        original.params.attackMs = 12.5f;
        original.params.decayMs = 240.0f;
        original.params.sustain = 0.65f;
        original.params.releaseMs = 310.0f;
        original.params.velocityCurve = 0.35f;
        original.params.glideMs = 45.0f;
        original.params.voiceLimit = 24;
        original.params.pitchBendRange = 7.0f;
        original.params.gainDb = -3.5f;

        SamplerZoneSpec z1;
        z1.id = "zone-asset";
        z1.name = "Grand C3";
        z1.assetId = "0123456789abcdef0123456789abcdef";
        z1.rootNote = 60;
        z1.lowNote = 0;
        z1.highNote = 64;
        z1.lowVelocity = 0;
        z1.highVelocity = 90;
        z1.gainDb = -1.5f;
        z1.pan = -0.2f;
        z1.tuneCents = -7.5f;
        z1.loopMode = SamplerLoopMode::Sustain;
        z1.loopStart = 0.15;
        z1.loopEnd = 0.85;
        z1.loopCrossfadeMs = 15.0f;
        z1.releaseAssetId = "fedcba9876543210fedcba9876543210";
        z1.releaseGainDb = -4.0f;

        SamplerZoneSpec z2;
        z2.id = "zone-file";
        z2.name = "Grand F#4";
        z2.mediaPath = "samples/piano_fs4.flac";
        z2.rootNote = 78;
        z2.lowNote = 65;
        z2.highNote = 127;
        z2.lowVelocity = 91;
        z2.highVelocity = 127;
        z2.gainDb = 1.0f;
        z2.pan = 0.25f;
        z2.tuneCents = 4.0f;
        z2.loopMode = SamplerLoopMode::OneShot;
        z2.releaseMediaPath = "samples/key_release.wav";
        z2.releaseGainDb = -6.0f;

        original.zones = {z1, z2};

        const QJsonObject json = samplerSpecToJson(original);
        QCOMPARE(json.value(u"type").toString(), QStringLiteral("sampler"));

        // Round-trip through full timeline JSON parser.
        const QJsonObject docJson{
            {"id", "tl1"},
            {"name", "SamplerRoundTrip"},
            {"fps", 30.0},
            {"width", 1920},
            {"height", 1080},
            {"durationMs", 4000.0},
            {"tracks", QJsonArray{QJsonObject{
                {"id", "t1"},
                {"name", "Keys"},
                {"type", "midi"},
                {"index", 0},
                {"instrument", json},
            }}},
            {"clips", QJsonArray{}},
        };
        const auto parsed = nt::parseTimeline(docJson);
        QVERIFY(parsed.timeline);
        const auto& tl = requireValue(parsed.timeline);
        QCOMPARE(tl.tracks.size(), std::size_t{1});

        const SamplerInstrumentSpec restored = samplerSpecFromJson(tl.tracks[0].raw.value(u"instrument").toObject());
        QCOMPARE(restored.params.oneShot, original.params.oneShot);
        QVERIFY(std::abs(restored.params.attackMs - original.params.attackMs) < 1e-4f);
        QVERIFY(std::abs(restored.params.decayMs - original.params.decayMs) < 1e-4f);
        QVERIFY(std::abs(restored.params.sustain - original.params.sustain) < 1e-4f);
        QVERIFY(std::abs(restored.params.releaseMs - original.params.releaseMs) < 1e-4f);
        QVERIFY(std::abs(restored.params.velocityCurve - original.params.velocityCurve) < 1e-4f);
        QVERIFY(std::abs(restored.params.glideMs - original.params.glideMs) < 1e-4f);
        QCOMPARE(restored.params.voiceLimit, original.params.voiceLimit);
        QVERIFY(std::abs(restored.params.pitchBendRange - original.params.pitchBendRange) < 1e-4f);
        QVERIFY(std::abs(restored.params.gainDb - original.params.gainDb) < 1e-4f);

        QCOMPARE(restored.zones.size(), std::size_t{2});
        QCOMPARE(restored.zones[0].id, z1.id);
        QCOMPARE(restored.zones[0].assetId, z1.assetId);
        QCOMPARE(restored.zones[0].rootNote, z1.rootNote);
        QCOMPARE(restored.zones[0].lowVelocity, z1.lowVelocity);
        QCOMPARE(restored.zones[0].highVelocity, z1.highVelocity);
        QVERIFY(restored.zones[0].loopMode.has_value());
        QCOMPARE(*restored.zones[0].loopMode, SamplerLoopMode::Sustain);
        QVERIFY(std::abs(restored.zones[0].loopStart - z1.loopStart) < 1e-6);
        QVERIFY(std::abs(restored.zones[0].loopEnd - z1.loopEnd) < 1e-6);
        QCOMPARE(restored.zones[0].releaseAssetId, z1.releaseAssetId);

        QCOMPARE(restored.zones[1].id, z2.id);
        QCOMPARE(restored.zones[1].mediaPath, z2.mediaPath);
        QCOMPARE(restored.zones[1].releaseMediaPath, z2.releaseMediaPath);
        QVERIFY(restored.zones[1].loopMode.has_value());
        QCOMPARE(*restored.zones[1].loopMode, SamplerLoopMode::OneShot);

        // Verify SamplerEdits document edit functions.
        QJsonObject edited = setSamplerParamsEdit(docJson, QJsonObject{
            {"trackId", "t1"},
            {"attackMs", 5.0},
            {"glideMs", 80.0},
            {"oneShot", true},
        });
        auto afterParams = samplerSpecFromJson(edited.value(u"tracks").toArray()[0].toObject().value(u"instrument").toObject());
        QCOMPARE(afterParams.params.oneShot, true);
        QVERIFY(std::abs(afterParams.params.attackMs - 5.0f) < 1e-4f);
        QVERIFY(std::abs(afterParams.params.glideMs - 80.0f) < 1e-4f);

        edited = addSamplerZoneEdit(edited, QJsonObject{
            {"trackId", "t1"},
            {"id", "zone-3"},
            {"name", "Drop"},
            {"mediaPath", "samples/drop.wav"},
            {"rootNote", 62},
        });
        auto afterAdd = samplerSpecFromJson(edited.value(u"tracks").toArray()[0].toObject().value(u"instrument").toObject());
        QCOMPARE(afterAdd.zones.size(), std::size_t{3});
        QCOMPARE(afterAdd.zones[2].id, std::string("zone-3"));
        QCOMPARE(afterAdd.zones[2].lowNote, 0);
        QCOMPARE(afterAdd.zones[2].highNote, 127);

        edited = updateSamplerZoneEdit(edited, QJsonObject{
            {"trackId", "t1"},
            {"zoneId", "zone-3"},
            {"rootNote", 64},
            {"loopMode", "sustain"},
            {"loopStart", 0.2},
            {"loopEnd", 0.8},
        });
        auto afterUpdate = samplerSpecFromJson(edited.value(u"tracks").toArray()[0].toObject().value(u"instrument").toObject());
        QCOMPARE(afterUpdate.zones[2].rootNote, 64);
        QVERIFY(afterUpdate.zones[2].loopMode.has_value());
        QCOMPARE(*afterUpdate.zones[2].loopMode, SamplerLoopMode::Sustain);

        edited = removeSamplerZoneEdit(edited, QJsonObject{{"trackId", "t1"}, {"zoneId", "zone-3"}});
        auto afterRemove = samplerSpecFromJson(edited.value(u"tracks").toArray()[0].toObject().value(u"instrument").toObject());
        QCOMPARE(afterRemove.zones.size(), std::size_t{2});
    }

    void blockProcessorSampleAccurateAndZeroAlloc() {
        QVERIFY(nt::testing::countsAnAllocation());
        constexpr double kRate = 48000.0;

        SamplerInstrumentSpec spec;
        spec.params.oneShot = false;
        spec.params.attackMs = 0.0f;
        spec.params.decayMs = 20.0f;
        spec.params.sustain = 0.8f;
        spec.params.releaseMs = 40.0f;
        spec.params.pitchBendRange = 2.0f;
        spec.params.gainDb = 0.0f;
        SamplerZoneSpec z;
        z.id = "lead";
        z.name = "Lead";
        z.mediaPath = "lead.wav";
        z.releaseMediaPath = "rel.wav";
        z.rootNote = 69;
        z.lowNote = 0;
        z.highNote = 127;
        z.loopMode = SamplerLoopMode::Sustain;
        z.loopStart = 0.1;
        z.loopEnd = 0.9;
        spec.zones = {z};

        // Note starts at 10 ms (= frame 480 at 48 kHz) inside first 512-frame block!
        const auto parsed = nt::parseTimeline(QJsonObject{
            {"tempo", QJsonObject{{"bpm", 120.0}}},
            {"tracks", QJsonArray{QJsonObject{
                {"id", "t1"},
                {"type", "midi"},
                {"instrument", samplerSpecToJson(spec)},
            }}},
            {"clips", QJsonArray{QJsonObject{
                {"id", "c1"},
                {"trackId", "t1"},
                {"mediaType", "midi"},
                {"startMs", 10.0},
                {"durationMs", 2000.0},
                {"notes", QJsonArray{
                    QJsonObject{{"id", "n1"}, {"pitch", 69}, {"velocity", 120}, {"startTick", 0}, {"durationTick", 480}},
                    QJsonObject{{"id", "n2"}, {"pitch", 76}, {"velocity", 100}, {"startTick", 480}, {"durationTick", 480}},
                }},
                {"controllers", QJsonArray{QJsonObject{
                    {"kind", "pitchBend"},
                    {"channel", 0},
                    {"interpolation", "linear"},
                    {"points", QJsonArray{
                        QJsonObject{{"tick", 0}, {"value", 0}},
                        QJsonObject{{"tick", 480}, {"value", 8191}},
                    }},
                }}},
            }}},
        });
        QVERIFY(parsed.timeline);
        const auto& tl = requireValue(parsed.timeline);

        auto resolver = mapResolver({
            {"lead.wav", makeSineBuffer(440.0, kRate, 24000, 0.7f)},
            {"rel.wav", makeConstBuffer(-0.2f, -0.2f, kRate, 1024)},
        });

        MultisampleSamplerProcessor proc(tl, tl.tracks[0], resolver);
        QVERIFY(proc.hasPendingOutput(0));
        proc.prepare(kRate);

        // First block: exact silence before frame 480, active audio from frame 480 onward.
        std::array<float, 512 * 2> firstBlock{};
        nt::audio::BlockContext ctx{kRate, 0.0, 1000.0 / kRate, false, 0};
        proc.process(firstBlock, ctx);
        QCOMPARE(peakAbs(firstBlock, 0, 480), 0.0f);
        QVERIFY(peakAbs(firstBlock, 480, 32) > 0.05f);

        // Zero audio-thread allocations across 64 blocks + parameter automation + reset + seek.
        std::array<float, 128 * 2> stereo{};
        float maxRendered = 0.0f;
        nt::testing::allocations = 0;
        nt::testing::countAllocations = true;
        for (int b = 0; b < 64; ++b) {
            stereo.fill(0.0f);
            ctx.timelineMs = 10.0 + static_cast<double>(b * 128) * ctx.msPerFrame;
            proc.process(stereo, ctx);
            maxRendered = std::max(maxRendered, peakAbs(stereo, 0, 128));
        }
        (void)proc.setParameter("gainDb", -3.0);
        (void)proc.setParameter("attackMs", 5.0);
        (void)proc.setParameter("releaseMs", 60.0);
        (void)proc.setParameter("glideMs", 25.0);
        proc.reset();
        ctx.timelineMs = 260.0;
        stereo.fill(0.0f);
        proc.process(stereo, ctx);
        nt::testing::countAllocations = false;

        QCOMPARE(static_cast<std::size_t>(nt::testing::allocations), std::size_t{0});
        QVERIFY2(maxRendered > 0.05f, "Zero-alloc BlockProcessor test must render non-silent audio");
        QVERIFY(!proc.setParameter("unknown.param", 1.0));
    }

    void cpuBoundPolyphonicPitchedVoices() {
        constexpr double kRate = 48000.0;
        SamplerInstrumentSpec spec;
        spec.params.oneShot = false;
        spec.params.attackMs = 2.0f;
        spec.params.decayMs = 100.0f;
        spec.params.sustain = 0.8f;
        spec.params.releaseMs = 200.0f;
        spec.params.voiceLimit = 32;
        spec.params.gainDb = -6.0f;

        SamplerZoneSpec z;
        z.id = "pad";
        z.name = "Pad";
        z.mediaPath = "pad.wav";
        z.rootNote = 60;
        z.lowNote = 0;
        z.highNote = 127;
        z.loopMode = SamplerLoopMode::Sustain;
        z.loopStart = 0.15;
        z.loopEnd = 0.85;
        z.loopCrossfadeMs = 10.0f;
        spec.zones = {z};

        MultisampleSampler sampler;
        sampler.setParams(spec.params);
        sampler.prepare(kRate);
        sampler.publishPreparedSet(
            prepareSampleSet(spec, kRate, mapResolver({{"pad.wav", makeSineBuffer(261.63, kRate, 24000, 0.5f)}})));

        // Trigger 32 polyphonic voices spanning unity, down-pitched, and up-pitched notes.
        for (int v = 0; v < 32; ++v) {
            const int note = 48 + (v % 25);  // C2..C4 around root C3 (60)
            sampler.noteOn(note, 100);
        }
        QCOMPARE(sampler.activeVoiceCount(), 32);

        constexpr int kIterations = 120;
        constexpr std::size_t kBlockFrames = 512;
        std::array<float, kBlockFrames * 2> stereo{};
        sampler.renderBlock(stereo);  // warm-up

        const auto t0 = std::chrono::steady_clock::now();
        for (int it = 0; it < kIterations; ++it) {
            stereo.fill(0.0f);
            sampler.renderBlock(stereo);
        }
        const auto t1 = std::chrono::steady_clock::now();
        const double totalMs = std::chrono::duration<double, std::milli>(t1 - t0).count();
        const double perBlockMs = totalMs / kIterations;
        const double budgetMs = 1000.0 * static_cast<double>(kBlockFrames) / kRate;  // 10.667 ms

        std::fprintf(stderr, "SMP1 CPU benchmark: 32 pitched voices x 512 frames = %.4f ms/block (%.2f%% of %.2f ms RT budget)\n",
                     perBlockMs, 100.0 * perBlockMs / budgetMs, budgetMs);

        QVERIFY2(perBlockMs < budgetMs * 0.40,
                 qPrintable(QString("Too slow: %1 ms vs %2 ms budget").arg(perBlockMs).arg(budgetMs)));
        QVERIFY(peakAbs(stereo, 0, kBlockFrames) > 0.01f);
    }

    // D1: Control/audio thread safety on publishSpec() + declicking excess voices when voiceLimit shrinks.
    void concurrentPublishSpecAndVoiceLimitDeclick() {
        constexpr double kRate = 48000.0;
        SamplerInstrumentSpec spec;
        spec.params.oneShot = false;
        spec.params.attackMs = 0.0f;
        spec.params.decayMs = 0.0f;
        spec.params.sustain = 1.0f;
        spec.params.releaseMs = 50.0f;
        spec.params.voiceLimit = 4;
        spec.params.gainDb = 0.0f;
        SamplerZoneSpec z;
        z.id = "dc";
        z.name = "DC";
        z.mediaPath = "dc.wav";
        z.rootNote = 60;
        z.lowNote = 0;
        z.highNote = 127;
        z.loopMode = SamplerLoopMode::Sustain;
        z.loopStart = 0.1;
        z.loopEnd = 0.9;
        spec.zones = {z};

        auto resolver = mapResolver({
            {"dc.wav", makeConstBuffer(0.8f, 0.8f, kRate, 4800)},
            {"alt.wav", makeSineBuffer(440.0, kRate, 4800, 0.5f)},
        });

        // Part A: Shrinking voiceLimit must declick excess voices rather than hard-cutting them.
        {
            MultisampleSampler sampler;
            sampler.setParams(spec.params);
            sampler.prepare(kRate);
            sampler.publishPreparedSet(prepareSampleSet(spec, kRate, resolver));

            std::vector<float> pre(256 * 2, 0.0f);
            const std::array<MultisampleSampler::MidiEvent, 4> onEv{{
                {0, MultisampleSampler::EventKind::NoteOn, 60, 127, 1.0f, 0.0f},
                {0, MultisampleSampler::EventKind::NoteOn, 62, 127, 1.0f, 0.0f},
                {0, MultisampleSampler::EventKind::NoteOn, 64, 127, 1.0f, 0.0f},
                {0, MultisampleSampler::EventKind::NoteOn, 65, 127, 1.0f, 0.0f},
            }};
            sampler.renderBlock(pre, onEv);
            const float steady4 = pre[255 * 2];
            QVERIFY(steady4 > 1.5f);

            SamplerParams shrunk = spec.params;
            shrunk.voiceLimit = 2;
            sampler.setParams(shrunk);
            QCOMPARE(sampler.activeVoiceCount(), 2);

            std::vector<float> post(512 * 2, 0.0f);
            sampler.renderBlock(post);
            float maxStep = std::abs(post[0] - steady4);
            for (std::size_t f = 0; f + 1 < 512; ++f) {
                maxStep = std::max(maxStep, std::abs(post[(f + 1) * 2] - post[f * 2]));
            }
            const float steady2 = post[511 * 2];
            QVERIFY2(std::abs(steady2 - steady4 * 0.5f) < 0.05f,
                     qPrintable(QString("steady2=%1 steady4=%2").arg(steady2).arg(steady4)));
            QVERIFY2(maxStep < steady4 * 0.08f,
                     qPrintable(QString("Voice-limit shrink click: maxStep=%1 steady4=%2").arg(maxStep).arg(steady4)));
        }

        // Part B: Concurrent publishSpec() from control thread while audio thread calls process().
        {
            const auto parsed = nt::parseTimeline(QJsonObject{
                {"tempo", QJsonObject{{"bpm", 120.0}}},
                {"tracks", QJsonArray{QJsonObject{
                    {"id", "t1"},
                    {"type", "midi"},
                    {"instrument", samplerSpecToJson(spec)},
                }}},
                {"clips", QJsonArray{QJsonObject{
                    {"id", "c1"},
                    {"trackId", "t1"},
                    {"mediaType", "midi"},
                    {"startMs", 0.0},
                    {"durationMs", 5000.0},
                    {"notes", QJsonArray{
                        QJsonObject{{"id", "n1"}, {"pitch", 60}, {"velocity", 120}, {"startTick", 0}, {"durationTick", 3840}},
                        QJsonObject{{"id", "n2"}, {"pitch", 64}, {"velocity", 110}, {"startTick", 240}, {"durationTick", 3600}},
                        QJsonObject{{"id", "n3"}, {"pitch", 67}, {"velocity", 100}, {"startTick", 480}, {"durationTick", 3360}},
                    }},
                }}},
            });
            QVERIFY(parsed.timeline);
            const auto& tl = requireValue(parsed.timeline);

            MultisampleSamplerProcessor proc(tl, tl.tracks[0], resolver);
            proc.prepare(kRate);

            std::atomic<bool> stop{false};
            std::thread controlThread([&]() {
                for (int iter = 0; iter < 40 && !stop.load(std::memory_order_acquire); ++iter) {
                    SamplerInstrumentSpec next = spec;
                    next.params.gainDb = (iter % 2 == 0) ? -3.0f : -9.0f;
                    next.params.voiceLimit = (iter % 3) + 2;
                    next.zones[0].mediaPath = (iter % 2 == 0) ? "dc.wav" : "alt.wav";
                    proc.publishSpec(next);
                    proc.serviceControlThread();
                    std::this_thread::sleep_for(std::chrono::microseconds(250));
                }
            });

            std::array<float, 128 * 2> stereo{};
            nt::audio::BlockContext ctx{kRate, 0.0, 1000.0 / kRate, false, 0};
            for (int b = 0; b < 180; ++b) {
                stereo.fill(0.0f);
                ctx.timelineMs = static_cast<double>(b * 128) * ctx.msPerFrame;
                proc.process(stereo, ctx);
                for (float s : stereo) {
                    QVERIFY(std::isfinite(s));
                }
            }
            stop.store(true, std::memory_order_release);
            controlThread.join();
            proc.serviceControlThread();
        }
    }

    // D2: SamplerHelper caps decoded analysis frames and survives destruction during in-flight analysis.
    void samplerHelperDestroyInFlightAndCappedDecode() {
        QTemporaryDir tempDir;
        QVERIFY(tempDir.isValid());

        // Write a 16-second stereo float WAV (768,000 frames @ 48 kHz > 15 s analysis cap).
        const QString wavPath = tempDir.filePath(QStringLiteral("long_a4.wav"));
        const auto longBuf = makeSineBuffer(440.0, 48000.0, 48000 * 16, 0.6f);
        QVERIFY(nt::audio::vst::writeStereoFloatWav(wavPath, 48000, longBuf.interleavedStereo));

        {
            SamplerHelper helper;
            QSignalSpy spy(&helper, &SamplerHelper::fileAnalyzed);
            helper.analyzeAudioFile(QStringLiteral("cap_req"), wavPath, tempDir.path());
            QVERIFY(spy.wait(5000));
            QCOMPARE(spy.count(), 1);
            const QVariantMap res = spy.at(0).at(1).toMap();
            QCOMPARE(res.value(QStringLiteral("ok")).toBool(), true);
            QCOMPARE(res.value(QStringLiteral("rootNote")).toInt(), 69);
            const qint64 analyzed = res.value(QStringLiteral("analyzedFrames")).toLongLong();
            QVERIFY2(analyzed > 0 && analyzed <= 48000 * 15,
                     qPrintable(QString("Expected capped analyzedFrames in (0, 720000], got %1").arg(analyzed)));
            QVERIFY2(res.value(QStringLiteral("durationSec")).toDouble() > 15.5,
                     qPrintable(QString("Expected full container durationSec ~16s, got %1")
                                    .arg(res.value(QStringLiteral("durationSec")).toDouble())));
        }

        // Destroy SamplerHelper repeatedly while worker-thread analysis tasks are in flight.
        for (int iter = 0; iter < 16; ++iter) {
            auto helper = std::make_unique<SamplerHelper>();
            for (int r = 0; r < 3; ++r) {
                helper->analyzeAudioFile(QStringLiteral("race_%1_%2").arg(iter).arg(r), wavPath, tempDir.path());
            }
            helper.reset();
            QCoreApplication::processEvents();
        }
        QVERIFY(QThreadPool::globalInstance()->waitForDone(10000));
        QCoreApplication::processEvents();
    }

    // D3: Voice stealing and zero releaseMs must both declick smoothly without 1-sample jumps.
    void voiceStealingAndZeroReleaseNoClicks() {
        constexpr double kRate = 48000.0;

        // Part A: Voice stealing declick (zone 1 = +0.8 DC on keys 60..64, zone 2 = silence on key 67).
        {
            SamplerInstrumentSpec spec;
            spec.params.oneShot = false;
            spec.params.attackMs = 0.0f;
            spec.params.decayMs = 0.0f;
            spec.params.sustain = 1.0f;
            spec.params.releaseMs = 50.0f;
            spec.params.voiceLimit = 2;
            spec.params.gainDb = 0.0f;

            SamplerZoneSpec zLoud;
            zLoud.id = "loud";
            zLoud.name = "Loud";
            zLoud.mediaPath = "loud.wav";
            zLoud.rootNote = 60;
            zLoud.lowNote = 60;
            zLoud.highNote = 65;
            zLoud.loopMode = SamplerLoopMode::Sustain;
            zLoud.loopStart = 0.1;
            zLoud.loopEnd = 0.9;

            SamplerZoneSpec zSilent = zLoud;
            zSilent.id = "silent";
            zSilent.name = "Silent";
            zSilent.mediaPath = "silent.wav";
            zSilent.rootNote = 67;
            zSilent.lowNote = 66;
            zSilent.highNote = 72;

            spec.zones = {zLoud, zSilent};

            MultisampleSampler sampler;
            sampler.setParams(spec.params);
            sampler.prepare(kRate);
            sampler.publishPreparedSet(prepareSampleSet(
                spec, kRate,
                mapResolver({
                    {"loud.wav", makeConstBuffer(0.8f, 0.8f, kRate, 4800)},
                    {"silent.wav", makeConstBuffer(0.0f, 0.0f, kRate, 4800)},
                })));

            std::vector<float> pre(256 * 2, 0.0f);
            const std::array<MultisampleSampler::MidiEvent, 2> on2{{
                {0, MultisampleSampler::EventKind::NoteOn, 60, 127, 1.0f, 0.0f},
                {16, MultisampleSampler::EventKind::NoteOn, 64, 127, 1.0f, 0.0f},
            }};
            sampler.renderBlock(pre, on2);
            const float steady2 = pre[255 * 2];
            QVERIFY(steady2 > 1.0f);

            // Trigger note 67 (silent zone) -> steals oldest active voice (note 60).
            std::vector<float> stealBlock(512 * 2, 0.0f);
            const std::array<MultisampleSampler::MidiEvent, 1> stealEv{{
                {0, MultisampleSampler::EventKind::NoteOn, 67, 127, 1.0f, 0.0f},
            }};
            sampler.renderBlock(stealBlock, stealEv);
            QCOMPARE(sampler.activeVoiceCount(), 2);

            float maxStep = std::abs(stealBlock[0] - steady2);
            for (std::size_t f = 0; f + 1 < 512; ++f) {
                maxStep = std::max(maxStep, std::abs(stealBlock[(f + 1) * 2] - stealBlock[f * 2]));
            }
            const float steady1 = stealBlock[511 * 2];
            QVERIFY2(std::abs(steady1 - steady2 * 0.5f) < 0.05f,
                     qPrintable(QString("steady1=%1 steady2=%2").arg(steady1).arg(steady2)));
            QVERIFY2(maxStep < steady2 * 0.08f,
                     qPrintable(QString("Voice-steal click: maxStep=%1 steady2=%2").arg(maxStep).arg(steady2)));
        }

        // Part B: releaseMs == 0 must floor to a ~1-2 ms declick ramp instead of 1-sample step.
        {
            SamplerInstrumentSpec spec;
            spec.params.oneShot = false;
            spec.params.attackMs = 0.0f;
            spec.params.decayMs = 0.0f;
            spec.params.sustain = 1.0f;
            spec.params.releaseMs = 0.0f;
            spec.params.gainDb = 0.0f;
            SamplerZoneSpec z;
            z.id = "dc";
            z.name = "DC";
            z.mediaPath = "dc.wav";
            z.rootNote = 60;
            z.loopMode = SamplerLoopMode::Sustain;
            z.loopStart = 0.1;
            z.loopEnd = 0.9;
            spec.zones = {z};

            MultisampleSampler sampler;
            sampler.setParams(spec.params);
            sampler.prepare(kRate);
            sampler.publishPreparedSet(
                prepareSampleSet(spec, kRate, mapResolver({{"dc.wav", makeConstBuffer(0.8f, 0.8f, kRate, 4800)}})));

            std::vector<float> pre(128 * 2, 0.0f);
            const std::array<MultisampleSampler::MidiEvent, 1> onEv{{
                {0, MultisampleSampler::EventKind::NoteOn, 60, 127, 1.0f, 0.0f},
            }};
            sampler.renderBlock(pre, onEv);
            const float steady = pre[127 * 2];
            QVERIFY(steady > 0.5f);

            std::vector<float> relBlock(512 * 2, 0.0f);
            const std::array<MultisampleSampler::MidiEvent, 1> offEv{{
                {0, MultisampleSampler::EventKind::NoteOff, 60, 0, 1.0f, 0.0f},
            }};
            sampler.renderBlock(relBlock, offEv);

            float maxStep = std::abs(relBlock[0] - steady);
            for (std::size_t f = 0; f + 1 < 512; ++f) {
                maxStep = std::max(maxStep, std::abs(relBlock[(f + 1) * 2] - relBlock[f * 2]));
            }
            QVERIFY2(maxStep < steady * 0.05f,
                     qPrintable(QString("Zero-release click: maxStep=%1 steady=%2").arg(maxStep).arg(steady)));
            QVERIFY(peakAbs(relBlock, 300, 200) < 1e-4f);
        }
    }

    // D4: Upward-pitch anti-aliasing, unity kernel continuity, and 96 kHz worst-case CPU (step >= 8).
    void upwardPitchAliasingUnityContinuityAnd96kWorstCaseCpu() {
        // Part A: Upward-pitch anti-aliasing (14 kHz sine @ 48 kHz pitched +12 st and +36 st -> above Nyquist).
        {
            constexpr double kRate = 48000.0;
            SamplerInstrumentSpec spec;
            spec.params.oneShot = false;
            spec.params.attackMs = 0.0f;
            spec.params.decayMs = 0.0f;
            spec.params.sustain = 1.0f;
            spec.params.releaseMs = 20.0f;
            spec.params.gainDb = 0.0f;
            SamplerZoneSpec z;
            z.id = "hf";
            z.name = "HF";
            z.mediaPath = "hf.wav";
            z.rootNote = 36;
            z.loopMode = SamplerLoopMode::Sustain;
            z.loopStart = 0.1;
            z.loopEnd = 0.9;
            spec.zones = {z};

            MultisampleSampler sampler;
            sampler.setParams(spec.params);
            sampler.prepare(kRate);
            sampler.publishPreparedSet(prepareSampleSet(
                spec, kRate, mapResolver({{"hf.wav", makeSineBuffer(14000.0, kRate, 24000, 0.8f)}})));

            for (int note : {48, 72}) {  // +12 st (2x), +36 st (8x)
                sampler.reset();
                std::vector<float> out(4096 * 2, 0.0f);
                const std::array<MultisampleSampler::MidiEvent, 1> ev{{
                    {0, MultisampleSampler::EventKind::NoteOn, note, 127, 1.0f, 0.0f},
                }};
                sampler.renderBlock(out, ev);
                const double aliasRms = rmsLeft(out, 256, 3072);
                QVERIFY2(aliasRms < 0.015,
                         qPrintable(QString("Excessive upward-pitch aliasing at note %1: RMS=%2").arg(note).arg(aliasRms)));
            }
        }

        // Part B: Continuous interpolator across unity (step = 0.9999 vs 1.0001 on high-frequency sine).
        {
            constexpr double kRate = 48000.0;
            SamplerInstrumentSpec spec;
            spec.params.oneShot = false;
            spec.params.attackMs = 0.0f;
            spec.params.decayMs = 0.0f;
            spec.params.sustain = 1.0f;
            spec.params.pitchBendRange = 1.0f;
            spec.params.gainDb = 0.0f;
            SamplerZoneSpec z;
            z.id = "hf";
            z.name = "HF";
            z.mediaPath = "hf.wav";
            z.rootNote = 60;
            z.loopMode = SamplerLoopMode::Sustain;
            z.loopStart = 0.1;
            z.loopEnd = 0.9;
            spec.zones = {z};

            auto resolver = mapResolver({{"hf.wav", makeSineBuffer(18000.0, kRate, 4800, 0.8f)}});

            auto renderAtBend = [&](float bendNorm) {
                MultisampleSampler sampler;
                sampler.setParams(spec.params);
                sampler.prepare(kRate);
                sampler.publishPreparedSet(prepareSampleSet(spec, kRate, resolver));
                std::vector<float> out(128 * 2, 0.0f);
                const std::array<MultisampleSampler::MidiEvent, 2> evs{{
                    {0, MultisampleSampler::EventKind::PitchBend, 0, 0, 1.0f, bendNorm},
                    {0, MultisampleSampler::EventKind::NoteOn, 60, 127, 1.0f, 0.0f},
                }};
                sampler.renderBlock(out, evs);
                return out;
            };

            const auto below = renderAtBend(-0.001f);  // step ~ 0.99994
            const auto above = renderAtBend(+0.001f);  // step ~ 1.00006
            float maxDiff = 0.0f;
            for (std::size_t f = 16; f < 64; ++f) {
                maxDiff = std::max(maxDiff, std::abs(below[f * 2] - above[f * 2]));
            }
            QVERIFY2(maxDiff < 0.02f,
                     qPrintable(QString("Kernel discontinuity across unity: maxDiff=%1").arg(maxDiff)));
        }

        // Part C: 96 kHz worst-case CPU with 32 voices transposed +36..+48 st (step = 8..16).
        {
            constexpr double kRate = 96000.0;
            SamplerInstrumentSpec spec;
            spec.params.oneShot = false;
            spec.params.attackMs = 2.0f;
            spec.params.decayMs = 100.0f;
            spec.params.sustain = 0.8f;
            spec.params.releaseMs = 200.0f;
            spec.params.voiceLimit = 32;
            spec.params.gainDb = -6.0f;
            SamplerZoneSpec z;
            z.id = "pad";
            z.name = "Pad";
            z.mediaPath = "pad.wav";
            z.rootNote = 36;
            z.lowNote = 0;
            z.highNote = 127;
            z.loopMode = SamplerLoopMode::Sustain;
            z.loopStart = 0.15;
            z.loopEnd = 0.85;
            z.loopCrossfadeMs = 10.0f;
            spec.zones = {z};

            MultisampleSampler sampler;
            sampler.setParams(spec.params);
            sampler.prepare(kRate);
            sampler.publishPreparedSet(prepareSampleSet(
                spec, kRate, mapResolver({{"pad.wav", makeSineBuffer(130.81, kRate, 48000, 0.5f)}})));

            for (int v = 0; v < 32; ++v) {
                sampler.noteOn(72 + (v % 13), 100);  // +36..+48 st (step = 8..16)
            }
            QCOMPARE(sampler.activeVoiceCount(), 32);

            constexpr int kIterations = 80;
            constexpr std::size_t kBlockFrames = 512;
            std::array<float, kBlockFrames * 2> stereo{};
            sampler.renderBlock(stereo);  // warm-up

            const auto t0 = std::chrono::steady_clock::now();
            for (int it = 0; it < kIterations; ++it) {
                stereo.fill(0.0f);
                sampler.renderBlock(stereo);
            }
            const auto t1 = std::chrono::steady_clock::now();
            const double perBlockMs = std::chrono::duration<double, std::milli>(t1 - t0).count() / kIterations;
            const double budgetMs = 1000.0 * static_cast<double>(kBlockFrames) / kRate;  // 5.333 ms

            std::fprintf(stderr, "SMP1 96k worst-case CPU: 32 voices (+36..+48 st) x 512 frames = %.4f ms/block (%.2f%% of %.2f ms)\n",
                         perBlockMs, 100.0 * perBlockMs / budgetMs, budgetMs);
            QVERIFY2(perBlockMs < budgetMs * 0.45,
                     qPrintable(QString("96k worst-case too slow: %1 ms vs %2 ms budget").arg(perBlockMs).arg(budgetMs)));
        }
    }

    // D5: Runtime setParameter("oneShot"/"gainDb") on active voices and pitch-bend smoothing.
    void runtimeOneShotGainDbAndPitchBendSmoothing() {
        constexpr double kRate = 48000.0;
        SamplerInstrumentSpec spec;
        spec.params.oneShot = false;
        spec.params.attackMs = 0.0f;
        spec.params.decayMs = 0.0f;
        spec.params.sustain = 1.0f;
        spec.params.releaseMs = 20.0f;
        spec.params.pitchBendRange = 12.0f;
        spec.params.gainDb = 0.0f;
        SamplerZoneSpec z;
        z.id = "z1";
        z.name = "Z1";
        z.mediaPath = "dc.wav";
        z.rootNote = 60;
        z.loopMode = std::nullopt;  // inherit instrument oneShot
        z.loopStart = 0.1;
        z.loopEnd = 0.9;
        spec.zones = {z};

        auto resolver = mapResolver({{"dc.wav", makeConstBuffer(1.0f, 1.0f, kRate, 4800)}});

        // Part A: setParameter("oneShot", ...) takes effect live on zones without an explicit override.
        {
            MultisampleSampler sampler;
            sampler.setParams(spec.params);
            sampler.prepare(kRate);
            sampler.publishPreparedSet(prepareSampleSet(spec, kRate, resolver));

            std::vector<float> buf(256 * 2, 0.0f);
            const std::array<MultisampleSampler::MidiEvent, 1> onEv{{
                {0, MultisampleSampler::EventKind::NoteOn, 60, 127, 1.0f, 0.0f},
            }};
            sampler.renderBlock(buf, onEv);
            QVERIFY(sampler.setParameter("oneShot", 1.0));

            std::vector<float> afterOff(2048 * 2, 0.0f);
            const std::array<MultisampleSampler::MidiEvent, 1> offEv{{
                {0, MultisampleSampler::EventKind::NoteOff, 60, 0, 1.0f, 0.0f},
            }};
            sampler.renderBlock(afterOff, offEv);
            // In oneShot mode, note-off must be ignored and the voice keeps playing.
            QCOMPARE(sampler.activeVoiceCount(), 1);
            QVERIFY2(afterOff[1500 * 2] > 0.4f, qPrintable(QString("oneShot=1 ignored noteOff failed: %1").arg(afterOff[1500 * 2])));

            // Switching oneShot back to 0 must allow note-off to release the voice.
            QVERIFY(sampler.setParameter("oneShot", 0.0));
            std::vector<float> releaseBuf(2048 * 2, 0.0f);
            sampler.renderBlock(releaseBuf, offEv);
            QCOMPARE(sampler.activeVoiceCount(), 0);
        }

        // Part B: setParameter("gainDb", ...) smoothly updates sustaining voices in real time.
        {
            MultisampleSampler sampler;
            sampler.setParams(spec.params);
            sampler.prepare(kRate);
            sampler.publishPreparedSet(prepareSampleSet(spec, kRate, resolver));

            std::vector<float> pre(256 * 2, 0.0f);
            const std::array<MultisampleSampler::MidiEvent, 1> onEv{{
                {0, MultisampleSampler::EventKind::NoteOn, 60, 127, 1.0f, 0.0f},
            }};
            sampler.renderBlock(pre, onEv);
            const float level0 = pre[255 * 2];
            QVERIFY(level0 > 0.5f);

            QVERIFY(sampler.setParameter("gainDb", -12.0));
            std::vector<float> ramped(1024 * 2, 0.0f);
            sampler.renderBlock(ramped);

            float maxStep = std::abs(ramped[0] - level0);
            for (std::size_t f = 0; f + 1 < 1024; ++f) {
                maxStep = std::max(maxStep, std::abs(ramped[(f + 1) * 2] - ramped[f * 2]));
            }
            const float level1 = ramped[1023 * 2];
            QVERIFY2(std::abs(level1 / level0 - 0.2512f) < 0.03f,
                     qPrintable(QString("gainDb automation ignored sustaining voice: ratio=%1").arg(level1 / level0)));
            QVERIFY2(maxStep < level0 * 0.05f,
                     qPrintable(QString("gainDb automation clicked: maxStep=%1 level0=%2").arg(maxStep).arg(level0)));
        }

        // Part C: Pitch bend on an active voice is one-pole smoothed (no instantaneous 1-sample jump).
        {
            SamplerInstrumentSpec pbSpec = spec;
            pbSpec.zones[0].rootNote = 69;
            pbSpec.zones[0].mediaPath = "a4.wav";
            MultisampleSampler sampler;
            sampler.setParams(pbSpec.params);
            sampler.prepare(kRate);
            sampler.publishPreparedSet(prepareSampleSet(
                pbSpec, kRate, mapResolver({{"a4.wav", makeSineBuffer(440.0, kRate, 48000, 0.7f)}})));

            std::vector<float> pre(512 * 2, 0.0f);
            const std::array<MultisampleSampler::MidiEvent, 1> onEv{{
                {0, MultisampleSampler::EventKind::NoteOn, 69, 127, 1.0f, 0.0f},
            }};
            sampler.renderBlock(pre, onEv);

            std::vector<float> bent(4096 * 2, 0.0f);
            const std::array<MultisampleSampler::MidiEvent, 1> pbEv{{
                {0, MultisampleSampler::EventKind::PitchBend, 0, 0, 1.0f, 1.0f},  // +12 st -> 880 Hz
            }};
            sampler.renderBlock(bent, pbEv);

            const double earlyHz = measureSineFrequencyHz(bent, 0, 200, kRate);
            const double settledHz = measureSineFrequencyHz(bent, 1500, 2000, kRate);
            QVERIFY2(earlyHz > 450.0 && earlyHz < 830.0,
                     qPrintable(QString("Pitch bend was not smoothed: earlyHz=%1").arg(earlyHz)));
            QVERIFY2(std::abs(settledHz - 880.0) < 8.0,
                     qPrintable(QString("Pitch bend did not settle to 880 Hz: settledHz=%1").arg(settledHz)));
        }
    }

    // D6: NaN/Inf inputs in audio buffers must never poison the sampler or mixer bus.
    void nanInputSanitization() {
        for (double srcRate : {48000.0, 44100.0}) {
            DecodedAudioBuffer corrupt = makeSineBuffer(440.0, srcRate, 2048, 0.5f);
            corrupt.interleavedStereo[10] = std::numeric_limits<float>::quiet_NaN();
            corrupt.interleavedStereo[11] = std::numeric_limits<float>::infinity();
            corrupt.interleavedStereo[200] = -std::numeric_limits<float>::infinity();
            corrupt.interleavedStereo[201] = std::numeric_limits<float>::quiet_NaN();

            SamplerInstrumentSpec spec;
            spec.params.oneShot = true;
            spec.params.attackMs = 0.0f;
            spec.params.gainDb = 0.0f;
            SamplerZoneSpec z;
            z.id = "nan";
            z.name = "NaN";
            z.mediaPath = "nan.wav";
            z.rootNote = 69;
            spec.zones = {z};

            MultisampleSampler sampler;
            sampler.setParams(spec.params);
            sampler.prepare(48000.0);
            sampler.publishPreparedSet(prepareSampleSet(spec, 48000.0, mapResolver({{"nan.wav", corrupt}})));

            std::vector<float> out(512 * 2, 0.0f);
            const std::array<MultisampleSampler::MidiEvent, 1> ev{{
                {0, MultisampleSampler::EventKind::NoteOn, 69, 127, 1.0f, 0.0f},
            }};
            sampler.renderBlock(out, ev);
            for (std::size_t i = 0; i < out.size(); ++i) {
                QVERIFY2(std::isfinite(out[i]),
                         qPrintable(QString("Non-finite output at sample %1 (srcRate=%2)").arg(i).arg(srcRate)));
            }
        }
    }

    // D7: 96 kHz MIDI timing, seek retaining PitchBend, clip fade-in at clip start, and 96 kHz YIN window.
    void sampleRateMidiTimingSeekPitchBendClipFadeInAnd96kYin() {
        // Part A: 96 kHz low-note YIN detection (MIDI 24 = 32.703 Hz).
        {
            const auto lowC = makeSineBuffer(32.70319566, 96000.0, 28800, 0.7f);
            QCOMPARE(detectRootMidiNote(lowC.interleavedStereo, 96000.0, 60), 24);
        }

        // Part B: 96 kHz sample-accurate MIDI extraction (no 48 kHz pre-quantization).
        {
            constexpr double kRate = 96000.0;
            SamplerInstrumentSpec spec;
            spec.params.oneShot = true;
            spec.params.attackMs = 0.0f;
            spec.params.gainDb = 0.0f;
            SamplerZoneSpec z;
            z.id = "dc";
            z.name = "DC";
            z.mediaPath = "dc.wav";
            z.rootNote = 60;
            spec.zones = {z};

            // At 130 BPM, startTick = 5 -> 5 * (60000 / 130) / 960 = 2.40384615 ms.
            // At 96 kHz: 2.40384615 * 96 = 230.769 frames -> frame 231.
            // With 48 kHz pre-quantization: floor/round(115.38) = 115 -> 2.39583 ms -> frame 230 (wrong!).
            const auto parsed = nt::parseTimeline(QJsonObject{
                {"tempo", QJsonObject{{"bpm", 130.0}}},
                {"tracks", QJsonArray{QJsonObject{
                    {"id", "t1"},
                    {"type", "midi"},
                    {"instrument", samplerSpecToJson(spec)},
                }}},
                {"clips", QJsonArray{QJsonObject{
                    {"id", "c1"},
                    {"trackId", "t1"},
                    {"mediaType", "midi"},
                    {"startMs", 0.0},
                    {"durationMs", 1000.0},
                    {"notes", QJsonArray{
                        QJsonObject{{"id", "n1"}, {"pitch", 60}, {"velocity", 127}, {"startTick", 5}, {"durationTick", 480}},
                    }},
                }}},
            });
            QVERIFY(parsed.timeline);
            const auto& tl = requireValue(parsed.timeline);

            MultisampleSamplerProcessor proc(
                tl, tl.tracks[0], mapResolver({{"dc.wav", makeConstBuffer(0.8f, 0.8f, kRate, 4800)}}));
            proc.prepare(kRate);

            std::array<float, 512 * 2> block{};
            nt::audio::BlockContext ctx{kRate, 0.0, 1000.0 / kRate, false, 0};
            proc.process(block, ctx);
            QCOMPARE(peakAbs(block, 0, 231), 0.0f);
            QVERIFY(peakAbs(block, 231, 16) > 0.3f);
        }

        // Part C: Seek retains prior PitchBend state.
        {
            constexpr double kRate = 48000.0;
            SamplerInstrumentSpec spec;
            spec.params.oneShot = false;
            spec.params.attackMs = 0.0f;
            spec.params.decayMs = 0.0f;
            spec.params.sustain = 1.0f;
            spec.params.releaseMs = 50.0f;
            spec.params.pitchBendRange = 2.0f;
            spec.params.gainDb = 0.0f;
            SamplerZoneSpec z;
            z.id = "a4";
            z.name = "A4";
            z.mediaPath = "a4.wav";
            z.rootNote = 69;
            z.loopMode = SamplerLoopMode::Sustain;
            z.loopStart = 0.1;
            z.loopEnd = 0.9;
            spec.zones = {z};

            // Pitch bend = +8191 (+2 st) at tick 0 (0 ms), NoteOn A4 at tick 960 (500 ms @ 120 BPM).
            const auto parsed = nt::parseTimeline(QJsonObject{
                {"tempo", QJsonObject{{"bpm", 120.0}}},
                {"tracks", QJsonArray{QJsonObject{
                    {"id", "t1"},
                    {"type", "midi"},
                    {"instrument", samplerSpecToJson(spec)},
                }}},
                {"clips", QJsonArray{QJsonObject{
                    {"id", "c1"},
                    {"trackId", "t1"},
                    {"mediaType", "midi"},
                    {"startMs", 0.0},
                    {"durationMs", 2000.0},
                    {"notes", QJsonArray{
                        QJsonObject{{"id", "n1"}, {"pitch", 69}, {"velocity", 127}, {"startTick", 960}, {"durationTick", 960}},
                    }},
                    {"controllers", QJsonArray{QJsonObject{
                        {"kind", "pitchBend"},
                        {"channel", 0},
                        {"interpolation", "step"},
                        {"points", QJsonArray{
                            QJsonObject{{"tick", 0}, {"value", 8191}},
                        }},
                    }}},
                }}},
            });
            QVERIFY(parsed.timeline);
            const auto& tl = requireValue(parsed.timeline);

            MultisampleSamplerProcessor proc(
                tl, tl.tracks[0], mapResolver({{"a4.wav", makeSineBuffer(440.0, kRate, 48000, 0.7f)}}));
            proc.prepare(kRate);

            // Seek directly to 490 ms (skipping tick 0 pitchBend event).
            std::vector<float> out(8192 * 2, 0.0f);
            nt::audio::BlockContext ctx{kRate, 490.0, 1000.0 / kRate, false, 0};
            proc.process(out, ctx);
            const double hz = measureSineFrequencyHz(out, 1024, 6000, kRate);
            const double expectedB4 = 440.0 * std::exp2(2.0 / 12.0);  // 493.88 Hz
            const double cents = 1200.0 * std::abs(std::log2(hz / expectedB4));
            QVERIFY2(hz > 470.0 && cents < 3.0,
                     qPrintable(QString("Seek discarded PitchBend: measured=%1 Hz expected=%2 Hz").arg(hz).arg(expectedB4)));
        }

        // Part D: NoteOn at exact clip start with fadeInMs > 0 must fade in continuously (not be dropped).
        {
            constexpr double kRate = 48000.0;
            SamplerInstrumentSpec spec;
            spec.params.oneShot = false;
            spec.params.attackMs = 0.0f;
            spec.params.decayMs = 0.0f;
            spec.params.sustain = 1.0f;
            spec.params.gainDb = 0.0f;
            SamplerZoneSpec z;
            z.id = "dc";
            z.name = "DC";
            z.mediaPath = "dc.wav";
            z.rootNote = 60;
            z.loopMode = SamplerLoopMode::Sustain;
            z.loopStart = 0.1;
            z.loopEnd = 0.9;
            spec.zones = {z};

            const auto parsed = nt::parseTimeline(QJsonObject{
                {"tempo", QJsonObject{{"bpm", 120.0}}},
                {"tracks", QJsonArray{QJsonObject{
                    {"id", "t1"},
                    {"type", "midi"},
                    {"instrument", samplerSpecToJson(spec)},
                }}},
                {"clips", QJsonArray{QJsonObject{
                    {"id", "c1"},
                    {"trackId", "t1"},
                    {"mediaType", "midi"},
                    {"startMs", 0.0},
                    {"durationMs", 1000.0},
                    {"fadeInMs", 50.0},
                    {"notes", QJsonArray{
                        QJsonObject{{"id", "n1"}, {"pitch", 60}, {"velocity", 127}, {"startTick", 0}, {"durationTick", 960}},
                    }},
                }}},
            });
            QVERIFY(parsed.timeline);
            const auto& tl = requireValue(parsed.timeline);

            MultisampleSamplerProcessor proc(
                tl, tl.tracks[0], mapResolver({{"dc.wav", makeConstBuffer(0.8f, 0.8f, kRate, 4800)}}));
            proc.prepare(kRate);

            std::vector<float> out(4800 * 2, 0.0f);  // 100 ms
            nt::audio::BlockContext ctx{kRate, 0.0, 1000.0 / kRate, false, 0};
            proc.process(out, ctx);
            QVERIFY(std::abs(out[0]) < 0.01f);
            QVERIFY2(out[1200 * 2] > 0.15f && out[1200 * 2] < out[3600 * 2] * 0.8f,
                     qPrintable(QString("Mid-fade=%1 full=%2").arg(out[1200 * 2]).arg(out[3600 * 2])));
            QVERIFY2(out[3600 * 2] > 0.45f, qPrintable(QString("Clip fade-in note dropped: %1").arg(out[3600 * 2])));
        }
    }

    // D8: Double-precision envelope prevents float32 ULP stall at 96 kHz with long decay & high sustain.
    void envelopeNoFloat32StallAt96kLongDecay() {
        constexpr double kRate = 96000.0;
        SamplerInstrumentSpec spec;
        spec.params.oneShot = false;
        spec.params.attackMs = 0.0f;
        spec.params.decayMs = 10000.0f;  // 10 s -> 960,000 frames
        spec.params.sustain = 0.98f;     // decayInc = 2.083e-8 < 0.5 * float32 ULP (5.96e-8)!
        spec.params.releaseMs = 50.0f;
        spec.params.gainDb = 0.0f;
        SamplerZoneSpec z;
        z.id = "dc";
        z.name = "DC";
        z.mediaPath = "dc.wav";
        z.rootNote = 60;
        z.loopMode = SamplerLoopMode::Sustain;
        z.loopStart = 0.1;
        z.loopEnd = 0.9;
        spec.zones = {z};

        MultisampleSampler sampler;
        sampler.setParams(spec.params);
        sampler.prepare(kRate);
        sampler.publishPreparedSet(
            prepareSampleSet(spec, kRate, mapResolver({{"dc.wav", makeConstBuffer(1.0f, 1.0f, kRate, 4800)}})));

        sampler.noteOn(60, 127);
        std::array<float, 2> oneFrame{};
        // Advance past the 16-frame sinc buffer-start edge so startVal reflects interior DC.
        for (int f = 0; f < 16; ++f) {
            oneFrame.fill(0.0f);
            sampler.renderFrames(oneFrame, 0, 1);
        }
        const float startVal = oneFrame[0];

        // Render 2 seconds in 1-frame sub-blocks (worst case for float32 rounding back to 1.0f).
        for (int f = 0; f < 192000; ++f) {
            oneFrame.fill(0.0f);
            sampler.renderFrames(oneFrame, 0, 1);
        }
        const float after2s = oneFrame[0];
        // Expected drop: 20% of (1.0 - 0.98) = 0.004 * 0.7071 = ~0.00283.
        QVERIFY2(after2s < startVal - 0.002f && std::abs((startVal - after2s) - 0.00283f) < 0.0005f,
                 qPrintable(QString("Envelope stalled in float32: start=%1 after2s=%2").arg(startVal).arg(after2s)));
    }

    // D9: Default project resolver loads audio zones by assetId (from asset cache or project assets/).
    void assetIdResolutionLoadsAudio() {
        QTemporaryDir cacheDir;
        QTemporaryDir projectDir;
        QVERIFY(cacheDir.isValid());
        QVERIFY(projectDir.isValid());

        const std::string cacheAssetId = "0123456789abcdef0123456789abcdef";
        const std::string projAssetId = "fedcba9876543210fedcba9876543210";
        const QString cachedOrigDir =
            cacheDir.filePath(QStringLiteral("srv/usr/%1/original").arg(QString::fromStdString(cacheAssetId)));
        QVERIFY(QDir().mkpath(cachedOrigDir));
        const QString cachedWav = cachedOrigDir + QStringLiteral("/v1.wav");
        const auto toneA = makeSineBuffer(440.0, 48000.0, 12000, 0.7f);
        QVERIFY(nt::audio::vst::writeStereoFloatWav(cachedWav, 48000, toneA.interleavedStereo));

        const QString projAssetsDir = projectDir.filePath(QStringLiteral("assets"));
        QVERIFY(QDir().mkpath(projAssetsDir));
        const QString projWav = projAssetsDir + QStringLiteral("/%1.wav").arg(QString::fromStdString(projAssetId));
        const auto toneB = makeSineBuffer(880.0, 48000.0, 12000, 0.7f);
        QVERIFY(nt::audio::vst::writeStereoFloatWav(projWav, 48000, toneB.interleavedStereo));

        const QByteArray prevCacheEnv = qgetenv("NODETOOL_TIMELINE_CACHE_DIR");
        qputenv("NODETOOL_TIMELINE_CACHE_DIR", cacheDir.path().toUtf8());
        auto restoreEnv = qScopeGuard([&]() {
            if (prevCacheEnv.isNull()) {
                qunsetenv("NODETOOL_TIMELINE_CACHE_DIR");
            } else {
                qputenv("NODETOOL_TIMELINE_CACHE_DIR", prevCacheEnv);
            }
        });

        SamplerInstrumentSpec spec;
        spec.params.oneShot = true;
        spec.params.attackMs = 0.0f;
        spec.params.gainDb = 0.0f;
        SamplerZoneSpec zCache;
        zCache.id = "z-cache";
        zCache.name = "CachedAsset";
        zCache.assetId = cacheAssetId;
        zCache.rootNote = 69;
        zCache.lowNote = 60;
        zCache.highNote = 69;

        SamplerZoneSpec zProj;
        zProj.id = "z-proj";
        zProj.name = "ProjectAsset";
        zProj.assetId = projAssetId;
        zProj.rootNote = 81;
        zProj.lowNote = 70;
        zProj.highNote = 84;
        spec.zones = {zCache, zProj};

        auto resolver = makeProjectFileSampleResolver(projectDir.path().toStdString());
        MultisampleSampler sampler;
        sampler.setParams(spec.params);
        sampler.prepare(48000.0);
        sampler.publishPreparedSet(prepareSampleSet(spec, 48000.0, resolver));

        std::vector<float> outA(4096 * 2, 0.0f);
        const std::array<MultisampleSampler::MidiEvent, 1> evA{{
            {0, MultisampleSampler::EventKind::NoteOn, 69, 127, 1.0f, 0.0f},
        }};
        sampler.renderBlock(outA, evA);
        QVERIFY2(peakAbs(outA, 0, 4096) > 0.2f, "Asset-cache assetId zone produced silence");

        sampler.reset();
        std::vector<float> outB(4096 * 2, 0.0f);
        const std::array<MultisampleSampler::MidiEvent, 1> evB{{
            {0, MultisampleSampler::EventKind::NoteOn, 81, 127, 1.0f, 0.0f},
        }};
        sampler.renderBlock(outB, evB);
        QVERIFY2(peakAbs(outB, 0, 4096) > 0.2f, "Project-folder assetId zone produced silence");
    }

    // D10: Edit parity: setSamplerZonesEdit validates zone sources and updateSamplerZoneEdit can reset loopMode.
    void editParitySetZonesValidationAndResetLoopMode() {
        const QJsonObject baseDoc{
            {"id", "tl1"},
            {"name", "EditParity"},
            {"tracks", QJsonArray{QJsonObject{
                {"id", "t1"},
                {"name", "Sampler"},
                {"type", "midi"},
                {"index", 0},
                {"instrument", QJsonObject{
                    {"type", "sampler"},
                    {"oneShot", false},
                    {"attackMs", 2.0},
                    {"releaseMs", 120.0},
                    {"gainDb", -6.0},
                    {"zones", QJsonArray{QJsonObject{
                        {"id", "z1"},
                        {"name", "Z1"},
                        {"assetId", ""},
                        {"mediaPath", "samples/a.wav"},
                        {"rootNote", 60},
                        {"lowNote", 0},
                        {"highNote", 127},
                        {"gainDb", 0.0},
                        {"loopMode", "sustain"},
                    }}},
                }},
            }}},
            {"clips", QJsonArray{}},
        };

        // Resetting loopMode with null clears the zone override back to std::nullopt.
        const QJsonObject clearedNull = updateSamplerZoneEdit(baseDoc, QJsonObject{
            {"trackId", "t1"},
            {"zoneId", "z1"},
            {"loopMode", QJsonValue::Null},
        });
        const auto afterNull =
            samplerSpecFromJson(clearedNull.value(u"tracks").toArray()[0].toObject().value(u"instrument").toObject());
        QCOMPARE(afterNull.zones.size(), std::size_t{1});
        QVERIFY2(!afterNull.zones[0].loopMode.has_value(), "updateSamplerZoneEdit(loopMode: null) failed to clear override");

        // Resetting loopMode with empty string also clears the override.
        const QJsonObject clearedEmpty = updateSamplerZoneEdit(baseDoc, QJsonObject{
            {"trackId", "t1"},
            {"zoneId", "z1"},
            {"loopMode", ""},
        });
        const auto afterEmpty =
            samplerSpecFromJson(clearedEmpty.value(u"tracks").toArray()[0].toObject().value(u"instrument").toObject());
        QVERIFY2(!afterEmpty.zones[0].loopMode.has_value(), "updateSamplerZoneEdit(loopMode: \"\") failed to clear override");

        // Resetting loopMode with validated clearing value "inherit" also clears the override.
        const QJsonObject clearedInherit = updateSamplerZoneEdit(baseDoc, QJsonObject{
            {"trackId", "t1"},
            {"zoneId", "z1"},
            {"loopMode", "inherit"},
        });
        const auto afterInherit =
            samplerSpecFromJson(clearedInherit.value(u"tracks").toArray()[0].toObject().value(u"instrument").toObject());
        QVERIFY2(!afterInherit.zones[0].loopMode.has_value(),
                 "updateSamplerZoneEdit(loopMode: \"inherit\") failed to clear override");

        // setSamplerZonesEdit must reject zones lacking both assetId and mediaPath.
        const QJsonObject rejected = setSamplerZonesEdit(baseDoc, QJsonObject{
            {"trackId", "t1"},
            {"zones", QJsonArray{QJsonObject{
                {"id", "bad"},
                {"name", "NoSource"},
                {"rootNote", 60},
                {"lowNote", 0},
                {"highNote", 127},
                {"gainDb", 0.0},
            }}},
        });
        QCOMPARE(rejected, baseDoc);

        // Valid setSamplerZonesEdit replaces zones cleanly.
        const QJsonObject accepted = setSamplerZonesEdit(baseDoc, QJsonObject{
            {"trackId", "t1"},
            {"zones", QJsonArray{QJsonObject{
                {"id", "good"},
                {"name", "Good"},
                {"mediaPath", "samples/b.wav"},
                {"rootNote", 64},
                {"lowNote", 0},
                {"highNote", 127},
                {"gainDb", 0.0},
            }}},
        });
        const auto afterSet =
            samplerSpecFromJson(accepted.value(u"tracks").toArray()[0].toObject().value(u"instrument").toObject());
        QCOMPARE(afterSet.zones.size(), std::size_t{1});
        QCOMPARE(afterSet.zones[0].id, std::string("good"));
        QCOMPARE(afterSet.zones[0].mediaPath, std::string("samples/b.wav"));
    }

    // E1: Short periodic loops must not alias when transposed upward (e.g. 8-frame cosine at step 8).
    void shortLoopUpwardPitchAntiAliasing() {
        constexpr double kRate = 48000.0;

        auto makeCosineLoop = [&](std::size_t len, float dcOffset, float amp) {
            DecodedAudioBuffer buf;
            buf.sampleRate = kRate;
            buf.interleavedStereo.resize(len * 2);
            for (std::size_t i = 0; i < len; ++i) {
                const float s = dcOffset + amp * static_cast<float>(std::cos(2.0 * std::numbers::pi * static_cast<double>(i) /
                                                                             static_cast<double>(len)));
                buf.interleavedStereo[i * 2] = s;
                buf.interleavedStereo[i * 2 + 1] = s;
            }
            return buf;
        };

        auto renderLoopNote = [&](const DecodedAudioBuffer& buf, int rootNote, int playNote) {
            SamplerInstrumentSpec spec;
            spec.params.oneShot = false;
            spec.params.attackMs = 0.0f;
            spec.params.decayMs = 0.0f;
            spec.params.sustain = 1.0f;
            spec.params.releaseMs = 20.0f;
            spec.params.gainDb = 0.0f;
            SamplerZoneSpec z;
            z.id = "short";
            z.name = "Short";
            z.mediaPath = "short.wav";
            z.rootNote = rootNote;
            z.loopMode = SamplerLoopMode::Sustain;
            z.loopStart = 0.0;
            z.loopEnd = 1.0;
            z.loopCrossfadeMs = 0.0f;
            spec.zones = {z};

            MultisampleSampler sampler;
            sampler.setParams(spec.params);
            sampler.prepare(kRate);
            sampler.publishPreparedSet(prepareSampleSet(spec, kRate, mapResolver({{"short.wav", buf}})));

            std::vector<float> out(4096 * 2, 0.0f);
            const std::array<MultisampleSampler::MidiEvent, 1> ev{{
                {0, MultisampleSampler::EventKind::NoteOn, playNote, 127, 1.0f, 0.0f},
            }};
            sampler.renderBlock(out, ev);
            return out;
        };

        auto meanLeft = [](std::span<const float> buf, std::size_t startFrame, std::size_t count) {
            double sum = 0.0;
            for (std::size_t f = startFrame; f < startFrame + count; ++f) {
                sum += static_cast<double>(buf[f * 2]);
            }
            return sum / static_cast<double>(count);
        };

        // Case 1: 8-frame cosine loop (6 kHz @ 48 kHz), root 60.
        const auto cos8 = makeCosineLoop(8, 0.0f, 0.8f);
        {
            const auto atRoot = renderLoopNote(cos8, 60, 60);  // 6 kHz -> pass
            QVERIFY2(rmsLeft(atRoot, 512, 2048) > 0.35, "8-frame cosine at root unexpectedly attenuated");

            const auto atOct1 = renderLoopNote(cos8, 60, 72);  // +12 st (12 kHz) -> pass
            QVERIFY2(rmsLeft(atOct1, 512, 2048) > 0.35, "8-frame cosine at +12 st unexpectedly attenuated");

            const auto atOct2 = renderLoopNote(cos8, 60, 84);  // +24 st (24 kHz = Nyquist) -> reject
            QVERIFY2(rmsLeft(atOct2, 512, 2048) < 0.02,
                     qPrintable(QString("8-frame cosine aliased at +24 st: RMS=%1").arg(rmsLeft(atOct2, 512, 2048))));

            const auto atOct3 = renderLoopNote(cos8, 60, 96);  // +36 st (step 8: 6 kHz -> 48 kHz aliases to DC!)
            const double rms3 = rmsLeft(atOct3, 512, 2048);
            const double dc3 = std::abs(meanLeft(atOct3, 512, 2048));
            QVERIFY2(rms3 < 0.02 && dc3 < 0.01,
                     qPrintable(QString("8-frame cosine aliased at +36 st (step 8): RMS=%1 DC=%2").arg(rms3).arg(dc3)));

            const auto atOct4 = renderLoopNote(cos8, 60, 108);  // +48 st (step 16) -> reject
            QVERIFY2(rmsLeft(atOct4, 512, 2048) < 0.02,
                     qPrintable(QString("8-frame cosine aliased at +48 st: RMS=%1").arg(rmsLeft(atOct4, 512, 2048))));
        }

        // Case 2: 8-frame cosine + DC offset -> true DC preserved, 6 kHz cosine rejected at step 8.
        {
            const auto cos8Dc = makeCosineLoop(8, 0.3f, 0.6f);
            const auto atOct3 = renderLoopNote(cos8Dc, 60, 96);
            const double expectedDc = 0.3 * std::cos(std::numbers::pi * 0.25);  // center panL
            const double measuredDc = meanLeft(atOct3, 512, 2048);
            QVERIFY2(std::abs(measuredDc - expectedDc) < 0.02,
                     qPrintable(QString("DC offset corrupted at step 8: measured=%1 expected=%2")
                                    .arg(measuredDc)
                                    .arg(expectedDc)));
        }

        // Case 3: 12-frame cosine loop (4 kHz @ 48 kHz), root 60.
        {
            const auto cos12 = makeCosineLoop(12, 0.0f, 0.8f);
            const auto atOct2 = renderLoopNote(cos12, 60, 84);  // +24 st (16 kHz) -> pass
            QVERIFY2(rmsLeft(atOct2, 512, 2048) > 0.30, "12-frame cosine at +24 st unexpectedly attenuated");

            const auto at33 = renderLoopNote(cos12, 60, 93);  // +33 st (26.9 kHz > Nyquist) -> reject
            QVERIFY2(rmsLeft(at33, 512, 2048) < 0.03,
                     qPrintable(QString("12-frame cosine aliased at +33 st: RMS=%1").arg(rmsLeft(at33, 512, 2048))));

            const auto atOct3 = renderLoopNote(cos12, 60, 96);  // +36 st (32 kHz > Nyquist) -> reject
            QVERIFY2(rmsLeft(atOct3, 512, 2048) < 0.02,
                     qPrintable(QString("12-frame cosine aliased at +36 st: RMS=%1").arg(rmsLeft(atOct3, 512, 2048))));
        }

        // Case 4: 9-frame odd short cosine loop (5.333 kHz @ 48 kHz) at +34 st (step ~7.13 -> mipStep > 2).
        {
            const auto cos9 = makeCosineLoop(9, 0.0f, 0.8f);
            const auto at34 = renderLoopNote(cos9, 60, 94);  // +34 st (~38 kHz > Nyquist) -> reject
            QVERIFY2(rmsLeft(at34, 512, 2048) < 0.03,
                     qPrintable(QString("9-frame cosine aliased at +34 st: RMS=%1").arg(rmsLeft(at34, 512, 2048))));
        }
    }

    // E2: Inherited one-shot playback must preserve unmodified PCM/mips (never use destructively crossfaded loop data).
    void inheritedOneShotUsesUnmodifiedPcm() {
        constexpr double kRate = 48000.0;
        constexpr std::size_t kFrames = 4800;

        // Distinct start (+0.9) vs middle/end (-0.5) so any loop crossfade baked before loopEnd=0.5 stands out loudly.
        DecodedAudioBuffer buf;
        buf.sampleRate = kRate;
        buf.interleavedStereo.resize(kFrames * 2);
        for (std::size_t i = 0; i < kFrames; ++i) {
            const float v = (i < 1200) ? 0.9f : -0.5f;
            buf.interleavedStereo[i * 2] = v;
            buf.interleavedStereo[i * 2 + 1] = v;
        }
        auto resolver = mapResolver({{"step.wav", buf}});

        auto makeSpec = [](bool instOneShot, std::optional<SamplerLoopMode> zoneMode) {
            SamplerInstrumentSpec spec;
            spec.params.oneShot = instOneShot;
            spec.params.attackMs = 0.0f;
            spec.params.decayMs = 0.0f;
            spec.params.sustain = 1.0f;
            spec.params.releaseMs = 20.0f;
            spec.params.gainDb = 0.0f;
            SamplerZoneSpec z;
            z.id = "z1";
            z.name = "Step";
            z.mediaPath = "step.wav";
            z.rootNote = 60;
            z.loopMode = zoneMode;
            z.loopStart = 0.0;
            z.loopEnd = 0.5;
            z.loopCrossfadeMs = 15.0f;
            spec.zones = {z};
            return spec;
        };

        auto renderAll = [&](const SamplerInstrumentSpec& spec, int playNote) {
            MultisampleSampler sampler;
            sampler.setParams(spec.params);
            sampler.prepare(kRate);
            sampler.publishPreparedSet(prepareSampleSet(spec, kRate, resolver));
            std::vector<float> out(kFrames * 2, 0.0f);
            const std::array<MultisampleSampler::MidiEvent, 1> ev{{
                {0, MultisampleSampler::EventKind::NoteOn, playNote, 127, 1.0f, 0.0f},
            }};
            sampler.renderBlock(out, ev);
            return out;
        };

        // Part A: Inherited oneShot=true vs explicit OneShot zone must match identically at unity and +12 st.
        for (int note : {60, 72}) {
            const auto inheritedOut = renderAll(makeSpec(true, std::nullopt), note);
            const auto explicitOut = renderAll(makeSpec(true, SamplerLoopMode::OneShot), note);
            float maxDiff = 0.0f;
            for (std::size_t i = 0; i < inheritedOut.size(); ++i) {
                maxDiff = std::max(maxDiff, std::abs(inheritedOut[i] - explicitOut[i]));
            }
            QVERIFY2(maxDiff < 1.0e-6f,
                     qPrintable(QString("Inherited oneShot diverged from explicit OneShot at note %1: maxDiff=%2")
                                    .arg(note)
                                    .arg(maxDiff)));
        }

        // Part B: Switching a live sustaining voice to oneShot=true must also read unmodified PCM around loopEnd.
        {
            const auto explicitRef = renderAll(makeSpec(true, SamplerLoopMode::OneShot), 60);
            MultisampleSampler sampler;
            const auto sustainSpec = makeSpec(false, std::nullopt);
            sampler.setParams(sustainSpec.params);
            sampler.prepare(kRate);
            sampler.publishPreparedSet(prepareSampleSet(sustainSpec, kRate, resolver));

            std::vector<float> out(kFrames * 2, 0.0f);
            const std::array<MultisampleSampler::MidiEvent, 1> onEv{{
                {0, MultisampleSampler::EventKind::NoteOn, 60, 127, 1.0f, 0.0f},
            }};
            sampler.renderBlock(std::span<float>(out).subspan(0, 256 * 2), onEv);
            QVERIFY(sampler.setParameter("oneShot", 1.0));
            sampler.renderBlock(std::span<float>(out).subspan(256 * 2));

            // Across the crossfade region [1680..2400) before loopEnd=0.5, output must match unmodified oneShot.
            float maxMidDiff = 0.0f;
            for (std::size_t f = 1500; f < 2600; ++f) {
                maxMidDiff = std::max(maxMidDiff, std::abs(out[f * 2] - explicitRef[f * 2]));
            }
            QVERIFY2(maxMidDiff < 1.0e-5f,
                     qPrintable(QString("Switched-to-oneShot voice played crossfaded loop buffer: maxMidDiff=%1")
                                    .arg(maxMidDiff)));
        }
    }

    // E4: Consecutive sample-set swaps during an active declick must not cut the previous fade abruptly.
    void consecutiveSampleSetSwapsNoDiscontinuity() {
        QVERIFY(nt::testing::countsAnAllocation());
        constexpr double kRate = 48000.0;

        auto makeSetSpec = [](const char* path) {
            SamplerInstrumentSpec spec;
            spec.params.oneShot = false;
            spec.params.attackMs = 0.0f;
            spec.params.decayMs = 0.0f;
            spec.params.sustain = 1.0f;
            spec.params.releaseMs = 100.0f;
            spec.params.gainDb = 0.0f;
            SamplerZoneSpec z;
            z.id = path;
            z.name = path;
            z.mediaPath = path;
            z.rootNote = 60;
            z.loopMode = SamplerLoopMode::Sustain;
            z.loopStart = 0.1;
            z.loopEnd = 0.9;
            spec.zones = {z};
            return spec;
        };

        auto resolver = mapResolver({
            {"a.wav", makeConstBuffer(0.8f, 0.8f, kRate, 4800)},
            {"b.wav", makeConstBuffer(-0.5f, -0.5f, kRate, 4800)},
            {"c.wav", makeConstBuffer(0.4f, 0.4f, kRate, 4800)},
            {"d.wav", makeConstBuffer(-0.6f, -0.6f, kRate, 4800)},
            {"e.wav", makeConstBuffer(0.7f, 0.7f, kRate, 4800)},
            {"f.wav", makeConstBuffer(-0.4f, -0.4f, kRate, 4800)},
        });

        // Part A: Adopt B while A is sounding, render 16 frames (~0.33 ms), then adopt C before A finishes declicking.
        {
            MultisampleSampler sampler;
            const auto specA = makeSetSpec("a.wav");
            sampler.setParams(specA.params);
            sampler.prepare(kRate);
            sampler.publishPreparedSet(prepareSampleSet(specA, kRate, resolver));

            std::vector<float> pre(256 * 2, 0.0f);
            const std::array<MultisampleSampler::MidiEvent, 1> onA{{
                {0, MultisampleSampler::EventKind::NoteOn, 60, 127, 1.0f, 0.0f},
            }};
            sampler.renderBlock(pre, onA);
            const float steadyA = pre[255 * 2];
            QVERIFY(steadyA > 0.4f);

            // Swap A -> B and render a short 16-frame block (A is still mid-declick).
            sampler.publishPreparedSet(prepareSampleSet(makeSetSpec("b.wav"), kRate, resolver));
            std::vector<float> shortBlock(16 * 2, 0.0f);
            sampler.renderBlock(shortBlock);
            const float midFade = shortBlock[15 * 2];
            QVERIFY2(midFade > steadyA * 0.5f, qPrintable(QString("Expected mid-declick level, got %1").arg(midFade)));

            // Swap B -> C immediately before A finishes fading; render with zero audio allocations.
            sampler.publishPreparedSet(prepareSampleSet(makeSetSpec("c.wav"), kRate, resolver));
            std::vector<float> afterC(1024 * 2, 0.0f);
            nt::testing::allocations = 0;
            nt::testing::countAllocations = true;
            sampler.renderBlock(afterC);
            nt::testing::countAllocations = false;
            QCOMPARE(static_cast<std::size_t>(nt::testing::allocations), std::size_t{0});

            float maxStep = std::abs(shortBlock[0] - steadyA);
            for (std::size_t f = 0; f + 1 < 16; ++f) {
                maxStep = std::max(maxStep, std::abs(shortBlock[(f + 1) * 2] - shortBlock[f * 2]));
            }
            maxStep = std::max(maxStep, std::abs(afterC[0] - midFade));
            for (std::size_t f = 0; f + 1 < 1024; ++f) {
                maxStep = std::max(maxStep, std::abs(afterC[(f + 1) * 2] - afterC[f * 2]));
            }
            QVERIFY2(maxStep < steadyA * 0.12f,
                     qPrintable(QString("Consecutive swap A->B->C discontinuity: maxStep=%1 midFade=%2 steadyA=%3")
                                    .arg(maxStep)
                                    .arg(midFade)
                                    .arg(steadyA)));
            QVERIFY(peakAbs(afterC, 600, 400) < 1.0e-3f);
            QCOMPARE(sampler.reclaimRetired(), std::size_t{2});
        }

        // Part B: Rapid burst of 6 swaps where every set has active voices (fills drainingSets_ and
        // exercises overflow into declickResL_/declickResR_) stays continuous, alloc-free, and reclaims all 5 sets.
        {
            const std::array<const char*, 6> paths{"a.wav", "b.wav", "c.wav", "d.wav", "e.wav", "f.wav"};
            auto makeBurstSpec = [&](const char* path) {
                auto s = makeSetSpec(path);
                s.params.attackMs = 5.0f;  // smooth ramp on each retrigger so note-on itself does not step
                return s;
            };
            MultisampleSampler sampler;
            const auto spec0 = makeBurstSpec(paths[0]);
            sampler.setParams(spec0.params);
            sampler.prepare(kRate);
            sampler.publishPreparedSet(prepareSampleSet(spec0, kRate, resolver));

            std::vector<float> timeline;
            auto appendBlock = [&](std::size_t frames, bool triggerNote) {
                std::vector<float> blk(frames * 2, 0.0f);
                const std::array<MultisampleSampler::MidiEvent, 1> ev{{
                    {0, MultisampleSampler::EventKind::NoteOn, 60, 127, 1.0f, 0.0f},
                }};
                nt::testing::allocations = 0;
                nt::testing::countAllocations = true;
                if (triggerNote) {
                    sampler.renderBlock(blk, ev);
                } else {
                    sampler.renderBlock(blk);
                }
                nt::testing::countAllocations = false;
                QCOMPARE(static_cast<std::size_t>(nt::testing::allocations), std::size_t{0});
                timeline.insert(timeline.end(), blk.begin(), blk.end());
            };

            appendBlock(256, true);  // A sounding at full level
            for (std::size_t s = 1; s < paths.size(); ++s) {
                sampler.publishPreparedSet(prepareSampleSet(makeBurstSpec(paths[s]), kRate, resolver));
                // Trigger on sets B..E so every prior set has active voices and overflows drainingSets_ on F.
                appendBlock(16, s + 1 < paths.size());
            }
            appendBlock(1024, false);

            // Check continuity across every swap boundary (including drainingSets_ overflow on swap F).
            const std::size_t totalFrames = timeline.size() / 2;
            float maxStep = 0.0f;
            for (std::size_t f = 0; f + 1 < totalFrames; ++f) {
                maxStep = std::max(maxStep, std::abs(timeline[(f + 1) * 2] - timeline[f * 2]));
            }
            QVERIFY2(maxStep < 0.08f, qPrintable(QString("Burst swap discontinuity: maxStep=%1").arg(maxStep)));
            QVERIFY(peakAbs(timeline, totalFrames - 400, 400) < 1.0e-3f);
            QCOMPARE(sampler.reclaimRetired(), std::size_t{5});
        }
    }
};

QTEST_MAIN(TestMultisampleSampler)
#include "tst_multisamplesampler.moc"
