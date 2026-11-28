// Tests for nt::midi::DrumSampler and nt::midi::DrumSamplerProcessor.
// Covers sample-accurate frame offsets, GM drum map, both stock kits (808 & UZU),
// velocity scaling, per-pad level/pan/tune/decay, choke groups (click-free fade),
// oldest-voice stealing, 44.1/48/96 kHz resampling at prepare(), denormal safety,
// zero audio-thread allocations, and a 64-voice x 512-frame CPU bound.

#include "../../tests/RequireValue.h"
#include "audio/Mixer.h"
#include "audio/TestAllocationCounter.h"
#include "midi/DrumSampler.h"
#include "model/TimelineJson.h"

#include <QJsonArray>
#include <QJsonObject>
#include <QtTest>

#include <algorithm>
#include <array>
#include <chrono>
#include <cmath>
#include <cstdio>
#include <limits>
#include <memory>
#include <numbers>
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

double rmsMono(std::span<const float> buf, std::size_t startFrame, std::size_t frameCount) {
    const std::size_t end = std::min(buf.size() / 2, startFrame + frameCount);
    if (end <= startFrame) return 0.0;
    double sum = 0.0;
    for (std::size_t f = startFrame; f < end; ++f) {
        const double m = 0.5 * (static_cast<double>(buf[f * 2]) + static_cast<double>(buf[f * 2 + 1]));
        sum += m * m;
    }
    return std::sqrt(sum / static_cast<double>(end - startFrame));
}

}  // namespace

class TestDrumSampler : public QObject {
    Q_OBJECT

private slots:
    void stockKitsAndGmNoteMap() {
        DrumSampler s808;
        s808.loadKit(DrumKitId::Classic808);
        s808.prepare(44100.0);

        // Verify key GM drum notes map to distinct expected pads.
        QCOMPARE(s808.padForMidiNote(36), 0);   // Kick
        QCOMPARE(s808.padForMidiNote(38), 2);   // Snare
        QCOMPARE(s808.padForMidiNote(39), 3);   // Clap
        QCOMPARE(s808.padForMidiNote(37), 4);   // Rim
        QCOMPARE(s808.padForMidiNote(42), 5);   // Closed Hi-Hat
        QCOMPARE(s808.padForMidiNote(44), 5);   // Pedal Hi-Hat
        QCOMPARE(s808.padForMidiNote(46), 6);   // Open Hi-Hat
        QCOMPARE(s808.padForMidiNote(51), 7);   // Ride
        QCOMPARE(s808.padForMidiNote(41), 8);   // Low Tom
        QCOMPARE(s808.padForMidiNote(45), 9);   // Mid Tom
        QCOMPARE(s808.padForMidiNote(48), 10);  // High Tom
        QCOMPARE(s808.padForMidiNote(49), 11);  // Crash
        QCOMPARE(s808.padForMidiNote(56), 12);  // Cowbell
        QCOMPARE(s808.padForMidiNote(54), 14);  // Tambourine / Maracas

        // Closed & open hat share choke group 1.
        QCOMPARE(s808.padParams(5).chokeGroup, 1);
        QCOMPARE(s808.padParams(6).chokeGroup, 1);
        QCOMPARE(s808.padParams(0).chokeGroup, 0);

        // Both stock kits have non-empty samples for all 16 pads and render distinct audio.
        DrumSampler suzu;
        suzu.loadKit(DrumKitId::Uzu);
        suzu.prepare(44100.0);

        for (int p = 0; p < DrumSampler::kNumPads; ++p) {
            QVERIFY2(s808.preparedSampleFrames(p) > 0, "808 pad empty");
            QVERIFY2(suzu.preparedSampleFrames(p) > 0, "UZU pad empty");
        }

        std::array<float, 1024> out808{}, outUzu{};
        const std::array<DrumSampler::NoteEvent, 1> ev{{{0, 36, 1.0f, 1.0f}}};
        s808.renderBlock(out808, ev);
        suzu.renderBlock(outUzu, ev);

        QVERIFY(peakAbs(out808, 0, 512) > 0.05f);
        QVERIFY(peakAbs(outUzu, 0, 512) > 0.05f);
        double diff = 0.0;
        for (std::size_t i = 0; i < out808.size(); ++i) {
            diff += std::abs(out808[i] - outUzu[i]);
        }
        QVERIFY2(diff > 1.0, "808 and UZU kicks must differ");
    }

    void noteOnRendersAtExactFrameOffset() {
        DrumSampler sampler;
        sampler.loadKit(DrumKitId::Classic808);
        // Install a unit impulse at sample 0 on pad 0 (MIDI 36) so the first
        // non-zero sample reveals the exact trigger frame without ambiguity.
        std::array<float, 64> impulse{};
        impulse[0] = 1.0f;
        impulse[1] = 0.5f;
        sampler.setCustomSample(0, impulse, 48000.0);
        auto pad = sampler.padParams(0);
        pad.attackSec = 0.0f;
        pad.holdSec = 0.1f;
        pad.decaySec = 0.5f;
        pad.level = 1.0f;
        pad.sampleLevel = 1.0f;
        pad.pan = 0.0f;
        sampler.setPadParams(0, pad);
        sampler.setMasterGain(1.0f);
        sampler.prepare(48000.0);

        constexpr int kOffset = 73;
        std::array<float, 256 * 2> stereo{};
        const std::array<DrumSampler::NoteEvent, 1> events{{{kOffset, 36, 1.0f, 1.0f}}};
        sampler.renderBlock(stereo, events);

        // Every frame strictly before kOffset must be exact silence.
        QCOMPARE(peakAbs(stereo, 0, kOffset), 0.0f);
        // Frame kOffset must carry the impulse peak; frame kOffset+1 half that.
        QVERIFY(stereo[static_cast<std::size_t>(kOffset) * 2] > 0.4f);
        QVERIFY(std::abs(stereo[static_cast<std::size_t>(kOffset) * 2] -
                         stereo[static_cast<std::size_t>(kOffset) * 2 + 1]) < 1e-6f);
        QVERIFY(std::abs(stereo[static_cast<std::size_t>(kOffset + 1) * 2] -
                         0.5f * stereo[static_cast<std::size_t>(kOffset) * 2]) < 1e-5f);

        // Also verify with real 808 snare (MIDI 38) at an offset inside a 512-frame block.
        DrumSampler kitSampler;
        kitSampler.loadKit(DrumKitId::Classic808);
        kitSampler.prepare(48000.0);
        std::array<float, 512 * 2> kitOut{};
        const std::array<DrumSampler::NoteEvent, 1> snareEv{{{137, 38, 1.0f, 1.0f}}};
        kitSampler.renderBlock(kitOut, snareEv);
        QCOMPARE(peakAbs(kitOut, 0, 137), 0.0f);
        QVERIFY(peakAbs(kitOut, 137, 64) > 0.02f);
    }

    void velocityScalingAndPanAndLevel() {
        DrumSampler sampler;
        sampler.loadKit(DrumKitId::Classic808);
        std::array<float, 128> dc{};
        dc.fill(0.5f);
        sampler.setCustomSample(0, dc, 48000.0);
        auto pad = sampler.padParams(0);
        pad.attackSec = 0.0f;
        pad.holdSec = 0.1f;
        pad.decaySec = 0.5f;
        pad.level = 1.0f;
        pad.sampleLevel = 1.0f;
        pad.velocityToLevel = 1.0f;
        pad.pan = 0.0f;
        sampler.setPadParams(0, pad);
        sampler.setMasterGain(1.0f);
        sampler.prepare(48000.0);

        std::array<float, 64 * 2> loud{}, half{}, silent{};
        const std::array<DrumSampler::NoteEvent, 1> evLoud{{{0, 36, 1.0f, 1.0f}}};
        const std::array<DrumSampler::NoteEvent, 1> evHalf{{{0, 36, 0.5f, 1.0f}}};
        const std::array<DrumSampler::NoteEvent, 1> evZero{{{0, 36, 0.0f, 1.0f}}};

        sampler.renderBlock(loud, evLoud);
        sampler.reset();
        sampler.renderBlock(half, evHalf);
        sampler.reset();
        sampler.renderBlock(silent, evZero);

        QCOMPARE(peakAbs(silent, 0, 64), 0.0f);
        const float ratio = half[0] / loud[0];
        QVERIFY2(std::abs(ratio - 0.5f) < 1e-5f, qPrintable(QString("expected 0.5, got %1").arg(ratio)));

        // Constant-power pan law (L^2 + R^2 = const) across -1, -0.5, 0, +0.5, +1.
        const std::array<float, 5> panValues{-1.0f, -0.5f, 0.0f, 0.5f, 1.0f};
        double refPower = -1.0;
        for (float pv : panValues) {
            pad.pan = pv;
            sampler.setPadParams(0, pad);
            sampler.reset();
            std::array<float, 32 * 2> panBuf{};
            sampler.renderBlock(panBuf, evLoud);
            const double l = panBuf[0];
            const double r = panBuf[1];
            const double power = l * l + r * r;
            if (refPower < 0.0) {
                refPower = power;
                QVERIFY(refPower > 0.05);
            } else {
                QVERIFY2(std::abs(power - refPower) / refPower < 1e-4,
                         qPrintable(QString("Pan power drift at pan=%1: power=%2 ref=%3").arg(pv).arg(power).arg(refPower)));
            }
            if (pv < -0.99f) {
                QVERIFY(std::abs(l) > 0.1);
                QVERIFY(std::abs(r) < 1e-6);
            } else if (pv > 0.99f) {
                QVERIFY(std::abs(l) < 1e-6);
                QVERIFY(std::abs(r) > 0.1);
            } else if (pv < 0.0f) {
                QVERIFY(l > r && r > 0.0);
            } else if (pv > 0.0f) {
                QVERIFY(r > l && l > 0.0);
            } else {
                QVERIFY(std::abs(l - r) < 1e-6);
            }
        }

        // Per-pad level scaling.
        pad.pan = 0.0f;
        pad.level = 0.5f;
        sampler.setPadParams(0, pad);
        sampler.reset();
        std::array<float, 32 * 2> quietBuf{};
        sampler.renderBlock(quietBuf, evLoud);
        QVERIFY(quietBuf[0] > 0.0f && quietBuf[0] < loud[0]);
    }

    void chokeGroupCutsOpenHatWithoutClick() {
        DrumSampler sampler;
        sampler.loadKit(DrumKitId::Classic808);
        // Continuous DC tone on Open Hat (pad 6, MIDI 46) and silence on Closed Hat
        // (pad 5, MIDI 42) so we can directly inspect the open hat's fade-out curve.
        std::vector<float> sustain(4800, 0.8f);
        std::vector<float> quiet(64, 0.0f);
        sampler.setCustomSample(6, sustain, 48000.0);
        sampler.setCustomSample(5, quiet, 48000.0);
        auto oh = sampler.padParams(6);
        oh.attackSec = 0.0f;
        oh.holdSec = 0.2f;
        oh.decaySec = 1.0f;
        oh.level = 1.0f;
        oh.sampleLevel = 1.0f;
        oh.chokeGroup = 1;
        sampler.setPadParams(6, oh);
        auto ch = sampler.padParams(5);
        ch.chokeGroup = 1;
        sampler.setPadParams(5, ch);
        sampler.setMasterGain(1.0f);
        sampler.prepare(48000.0);

        // Fire Open Hat at frame 0, then Closed Hat at frame 100.
        constexpr std::size_t kFrames = 1024;
        std::vector<float> stereo(kFrames * 2, 0.0f);
        const std::array<DrumSampler::NoteEvent, 2> events{{
            {0, 46, 1.0f, 1.0f},
            {100, 42, 1.0f, 1.0f},
        }};
        sampler.renderBlock(stereo, events);

        const float steady = stereo[50 * 2];
        QVERIFY2(steady > 0.2f, "Open hat must sound before choke");

        // Immediately at frame 100 it must NOT hard-zero in 1 sample (no click).
        float maxStep = 0.0f;
        for (std::size_t f = 99; f + 1 < kFrames; ++f) {
            maxStep = std::max(maxStep, std::abs(stereo[(f + 1) * 2] - stereo[f * 2]));
        }
        // Smooth fade must keep sample-to-sample step well below 10% of steady level.
        QVERIFY2(maxStep < steady * 0.08f,
                 qPrintable(QString("Click detected: maxStep=%1 steady=%2").arg(maxStep).arg(steady)));
        // And it must still be fading at frame 105 (not cut instantaneously).
        QVERIFY(stereo[105 * 2] > steady * 0.5f);
        // After ~10 ms (480 frames), the choked open hat must be silent (< -70 dB).
        QVERIFY2(peakAbs(stereo, 600, 400) < 1e-3f,
                 qPrintable(QString("Open hat did not choke to silence: tail=%1").arg(peakAbs(stereo, 600, 400))));
    }

    void voiceStealingStealsOldestVoice() {
        DrumSampler sampler;
        sampler.loadKit(DrumKitId::Classic808);
        sampler.setVoiceLimit(4);

        // Give pads 0..4 distinct constant levels and long sustain, no choke groups.
        std::vector<float> tone(4096, 1.0f);
        for (int p = 0; p < 5; ++p) {
            sampler.setCustomSample(p, tone, 48000.0);
            auto pp = sampler.padParams(p);
            pp.attackSec = 0.0f;
            pp.holdSec = 0.5f;
            pp.decaySec = 1.0f;
            pp.chokeGroup = 0;
            pp.level = 1.0f;
            pp.sampleLevel = 1.0f;
            sampler.setPadParams(p, pp);
        }
        sampler.setMasterGain(1.0f);
        sampler.prepare(48000.0);

        // Trigger pads 0, 1, 2, 3 in order.
        QVERIFY(sampler.triggerPad(0, 1.0f) >= 0);
        QVERIFY(sampler.triggerPad(1, 1.0f) >= 0);
        QVERIFY(sampler.triggerPad(2, 1.0f) >= 0);
        QVERIFY(sampler.triggerPad(3, 1.0f) >= 0);
        QCOMPARE(sampler.activeVoiceCount(), 4);
        QCOMPARE(sampler.activeVoiceCountForPad(0), 1);

        // Triggering a 5th voice (pad 4) must steal the oldest voice (pad 0).
        QVERIFY(sampler.triggerPad(4, 1.0f) >= 0);
        QCOMPARE(sampler.activeVoiceCount(), 4);
        QCOMPARE(sampler.activeVoiceCountForPad(0), 0);
        QCOMPARE(sampler.activeVoiceCountForPad(1), 1);
        QCOMPARE(sampler.activeVoiceCountForPad(2), 1);
        QCOMPARE(sampler.activeVoiceCountForPad(3), 1);
        QCOMPARE(sampler.activeVoiceCountForPad(4), 1);

        // Triggering a 6th voice (pad 0 again) must now steal pad 1.
        QVERIFY(sampler.triggerPad(0, 1.0f) >= 0);
        QCOMPARE(sampler.activeVoiceCount(), 4);
        QCOMPARE(sampler.activeVoiceCountForPad(1), 0);
        QCOMPARE(sampler.activeVoiceCountForPad(0), 1);
    }

    void tuneSemitonesLinearInterp() {
        DrumSampler sampler;
        sampler.loadKit(DrumKitId::Classic808);
        // Linear ramp 0.0 -> 1.0 over 100 samples at 48 kHz.
        std::vector<float> ramp(100);
        for (std::size_t i = 0; i < ramp.size(); ++i) {
            ramp[i] = static_cast<float>(i) / 100.0f;
        }
        sampler.setCustomSample(0, ramp, 48000.0);
        auto pad = sampler.padParams(0);
        pad.attackSec = 0.0f;
        pad.holdSec = 0.5f;
        pad.decaySec = 1.0f;
        pad.level = 1.0f;
        pad.sampleLevel = 1.0f;
        pad.pan = 0.0f;
        sampler.setMasterGain(1.0f);

        auto renderTuned = [&](float semis) {
            pad.tuneSemitones = semis;
            sampler.setPadParams(0, pad);
            sampler.prepare(48000.0);
            std::vector<float> out(256 * 2, 0.0f);
            const std::array<DrumSampler::NoteEvent, 1> ev{{{0, 36, 1.0f, 1.0f}}};
            sampler.renderBlock(out, ev);
            return out;
        };

        const auto base = renderTuned(0.0f);
        const auto upOct = renderTuned(12.0f);    // 2x speed -> finishes around frame 50
        const auto downOct = renderTuned(-12.0f); // 0.5x speed -> finishes around frame 200

        // At frame 10, +12st reads sample 20 (2x of base[10]); -12st reads sample 5 (0.5x of base[10]).
        QVERIFY(std::abs(upOct[10 * 2] - base[20 * 2]) < 1e-5f);
        QVERIFY(std::abs(downOct[10 * 2] - base[5 * 2]) < 1e-5f);

        // +12st should be silent after frame 52; base still sounding at frame 60; -12st still sounding at frame 150.
        QCOMPARE(peakAbs(upOct, 52, 50), 0.0f);
        QVERIFY(peakAbs(base, 60, 10) > 0.1f);
        QCOMPARE(peakAbs(base, 105, 50), 0.0f);
        QVERIFY(peakAbs(downOct, 150, 10) > 0.1f);
        QCOMPARE(peakAbs(downOct, 205, 50), 0.0f);
    }

    void decayEnvelopeShapesTail() {
        DrumSampler sampler;
        sampler.loadKit(DrumKitId::Classic808);
        std::vector<float> sustain(48000, 0.8f);
        sampler.setCustomSample(0, sustain, 48000.0);
        auto pad = sampler.padParams(0);
        pad.attackSec = 0.0f;
        pad.holdSec = 0.0f;
        pad.decaySec = 0.02f;  // 20 ms = 960 frames at 48 kHz
        pad.decayCurve = 0.5f;
        pad.level = 1.0f;
        pad.sampleLevel = 1.0f;
        sampler.setPadParams(0, pad);
        sampler.setMasterGain(1.0f);
        sampler.prepare(48000.0);

        std::vector<float> out(2048 * 2, 0.0f);
        const std::array<DrumSampler::NoteEvent, 1> ev{{{0, 36, 1.0f, 1.0f}}};
        sampler.renderBlock(out, ev);

        QVERIFY(out[0] > 0.2f);
        QVERIFY(out[480 * 2] < out[0] * 0.7f);
        QVERIFY(out[480 * 2] > 0.01f);
        QCOMPARE(peakAbs(out, 980, 1000), 0.0f);
        QCOMPARE(sampler.activeVoiceCount(), 0);
    }

    void renderAt44100And96000Hz() {
        auto renderAtRate = [](double rate, double& outSnareRms, double& outHatRms) {
            DrumSampler sampler;
            sampler.loadKit(DrumKitId::Classic808);
            // Long decay so the resampled buffer length determines duration.
            auto hatPad = sampler.padParams(5);  // 808CH (11025 samples at 44.1 kHz = 250 ms)
            hatPad.decaySec = 2.0f;
            sampler.setPadParams(5, hatPad);
            auto snarePad = sampler.padParams(2);  // 808SD (22051 samples at 44.1 kHz = 500 ms)
            snarePad.decaySec = 2.0f;
            sampler.setPadParams(2, snarePad);
            sampler.prepare(rate);

            const std::size_t expectedHat = static_cast<std::size_t>(std::llround(11025.0 * rate / 44100.0));
            QVERIFY2(std::abs(static_cast<std::ptrdiff_t>(sampler.preparedSampleFrames(5)) -
                              static_cast<std::ptrdiff_t>(expectedHat)) <= 2,
                     "Resampled frame count must match target sample rate");

            // Render 808CH (250 ms) and check duration + finite/denormal-free output.
            const std::size_t hatTotal = static_cast<std::size_t>(rate * 0.35);
            std::vector<float> hatOut(hatTotal * 2, 0.0f);
            const std::array<DrumSampler::NoteEvent, 1> hatEv{{{0, 42, 1.0f, 1.0f}}};
            sampler.renderBlock(hatOut, hatEv);
            for (float v : hatOut) {
                QVERIFY(std::isfinite(v));
                QVERIFY(std::fpclassify(v) != FP_SUBNORMAL);
            }
            const std::size_t earlyFrames = static_cast<std::size_t>(rate * 0.05);
            const std::size_t lateStart = static_cast<std::size_t>(rate * 0.27);
            outHatRms = rmsMono(hatOut, 0, earlyFrames);
            QVERIFY(outHatRms > 0.004);
            QVERIFY(peakAbs(hatOut, lateStart, hatTotal - lateStart) < 1e-6f);

            // Render 808SD (500 ms) and check rate-invariant RMS across 44.1 / 48 / 96 kHz.
            sampler.reset();
            std::vector<float> snareOut(earlyFrames * 2, 0.0f);
            const std::array<DrumSampler::NoteEvent, 1> snareEv{{{0, 38, 1.0f, 1.0f}}};
            sampler.renderBlock(snareOut, snareEv);
            for (float v : snareOut) {
                QVERIFY(std::isfinite(v));
                QVERIFY(std::fpclassify(v) != FP_SUBNORMAL);
            }
            outSnareRms = rmsMono(snareOut, 0, earlyFrames);
            QVERIFY(outSnareRms > 0.02);
        };

        double snare44 = 0.0, snare48 = 0.0, snare96 = 0.0;
        double hat44 = 0.0, hat48 = 0.0, hat96 = 0.0;
        renderAtRate(44100.0, snare44, hat44);
        renderAtRate(48000.0, snare48, hat48);
        renderAtRate(96000.0, snare96, hat96);

        // Snare RMS agrees tightly across 44.1 / 48 / 96 kHz (< 3% difference).
        QVERIFY2(std::abs(snare44 - snare96) / snare44 < 0.03,
                 qPrintable(QString("Snare RMS mismatch 44.1k=%1 96k=%2").arg(snare44).arg(snare96)));
        QVERIFY2(std::abs(snare44 - snare48) / snare44 < 0.03,
                 qPrintable(QString("Snare RMS mismatch 44.1k=%1 48k=%2").arg(snare44).arg(snare48)));
        // Bright hi-hat stays within cubic-interpolation Nyquist rolloff (< 10%).
        QVERIFY2(std::abs(hat44 - hat96) / hat44 < 0.10,
                 qPrintable(QString("Hat RMS mismatch 44.1k=%1 96k=%2").arg(hat44).arg(hat96)));
    }

    void zeroAudioThreadAllocations() {
        QVERIFY(nt::testing::countsAnAllocation());

        // Build a timeline with a drum track, voiceLimit = 4, and dense notes to
        // force both choking and voice stealing under the allocation counter.
        QJsonArray notes;
        const std::array<int, 8> pitches{36, 46, 42, 38, 39, 49, 51, 56};
        for (int i = 0; i < 80; ++i) {
            notes.append(QJsonObject{
                {"id", QString("n%1").arg(i)},
                {"pitch", pitches[static_cast<std::size_t>(i % 8)]},
                {"velocity", 60 + (i % 67)},
                {"startTick", i * 15},
                {"durationTick", 120},
            });
        }
        const auto parsed = nt::parseTimeline(QJsonObject{
            {"tempo", QJsonObject{{"bpm", 120.0}}},
            {"tracks", QJsonArray{QJsonObject{
                {"id", "drums"},
                {"type", "midi"},
                {"instrument", QJsonObject{{"type", "drum"}, {"kit", "808"}, {"gainDb", 0.0}, {"voiceLimit", 4}}},
            }}},
            {"clips", QJsonArray{QJsonObject{
                {"id", "c1"},
                {"trackId", "drums"},
                {"mediaType", "midi"},
                {"startMs", 0.0},
                {"durationMs", 4000.0},
                {"notes", notes},
            }}},
        });
        QVERIFY(parsed.timeline);
        const auto& tl = requireValue(parsed.timeline);
        DrumSamplerProcessor proc(tl, tl.tracks[0]);
        proc.prepare(48000.0);

        std::array<float, 128 * 2> stereo{};
        nt::audio::BlockContext ctx{48000.0, 0.0, 1000.0 / 48000.0, false, 0};

        float maxRendered = 0.0f;
        nt::testing::allocations = 0;
        nt::testing::countAllocations = true;
        for (int b = 0; b < 64; ++b) {
            stereo.fill(0.0f);
            ctx.timelineMs = static_cast<double>(b * 128) * ctx.msPerFrame;
            proc.process(stereo, ctx);
            maxRendered = std::max(maxRendered, peakAbs(stereo, 0, 128));
        }
        (void)proc.setParameter("gainDb", -3.0);
        (void)proc.setParameter("pad0.pan", -0.25);
        (void)proc.setParameter("pad2.tune", 2.0);
        (void)proc.setParameter("pad0.aenv.att", 0.005);
        (void)proc.setParameter("pad0.aenv.hold", 0.01);
        (void)proc.setParameter("pad0.aenv.curve", 0.7);
        (void)proc.setParameter("pad0.v2l", 0.5);
        // Redundant prepare at same rate must also not allocate (D9).
        proc.prepare(48000.0);
        proc.reset();
        // Seek jump also must not allocate.
        ctx.timelineMs = 500.0;
        proc.process(stereo, ctx);
        nt::testing::countAllocations = false;

        const std::size_t allocs = nt::testing::allocations;
        QCOMPARE(allocs, std::size_t{0});
        QVERIFY2(maxRendered > 0.05f, "Zero-alloc test must exercise non-silent rendering");
    }

    void blockProcessorIntegrationDrumAndSampler() {
        auto runTrack = [](const QJsonObject& instrument) {
            const auto parsed = nt::parseTimeline(QJsonObject{
                {"tempo", QJsonObject{{"bpm", 120.0}}},
                {"tracks", QJsonArray{QJsonObject{
                    {"id", "t1"},
                    {"type", "midi"},
                    {"instrument", instrument},
                }}},
                {"clips", QJsonArray{QJsonObject{
                    {"id", "c1"},
                    {"trackId", "t1"},
                    {"mediaType", "midi"},
                    {"startMs", 0.0},
                    {"durationMs", 1000.0},
                    {"notes", QJsonArray{QJsonObject{
                        {"id", "kick"},
                        {"pitch", 36},
                        {"velocity", 127},
                        {"startTick", 0},
                        {"durationTick", 240},
                    }}},
                }}},
            });
            if (!parsed.timeline) qFatal("%s", qPrintable(parsed.error));
            const auto& tl = *parsed.timeline;
            DrumSamplerProcessor proc(tl, tl.tracks[0]);
            proc.prepare(48000.0);
            std::array<float, 512 * 2> stereo{};
            nt::audio::BlockContext ctx{48000.0, 0.0, 1000.0 / 48000.0, false, 0};
            proc.process(stereo, ctx);
            return peakAbs(stereo, 0, 512);
        };

        const float drumPeak = runTrack(QJsonObject{{"type", "drum"}, {"kit", "808"}});
        const float uzuPeak = runTrack(QJsonObject{{"type", "drum"}, {"kit", "uzu"}});
        const float samplerPeak = runTrack(QJsonObject{{"type", "sampler"}, {"oneShot", true}});
        QVERIFY(drumPeak > 0.05f);
        QVERIFY(uzuPeak > 0.05f);
        QVERIFY(samplerPeak > 0.05f);

        // Verify BlockProcessor exact frame offset inside a block (10 ms = frame 480 at 48 kHz).
        const auto parsed = nt::parseTimeline(QJsonObject{
            {"tempo", QJsonObject{{"bpm", 120.0}}},
            {"tracks", QJsonArray{QJsonObject{
                {"id", "t1"},
                {"type", "midi"},
                {"instrument", QJsonObject{{"type", "drum"}, {"kit", "808"}}},
            }}},
            {"clips", QJsonArray{QJsonObject{
                {"id", "c1"},
                {"trackId", "t1"},
                {"mediaType", "midi"},
                {"startMs", 10.0},
                {"durationMs", 500.0},
                {"notes", QJsonArray{QJsonObject{
                    {"id", "kick"},
                    {"pitch", 36},
                    {"velocity", 127},
                    {"startTick", 0},
                    {"durationTick", 240},
                }}},
            }}},
        });
        QVERIFY(parsed.timeline);
        const auto& tl = requireValue(parsed.timeline);
        DrumSamplerProcessor proc(tl, tl.tracks[0]);
        QVERIFY(proc.hasPendingOutput(0));
        proc.prepare(48000.0);
        std::array<float, 512 * 2> stereo{};
        nt::audio::BlockContext ctx{48000.0, 0.0, 1000.0 / 48000.0, false, 0};
        proc.process(stereo, ctx);
        QCOMPARE(peakAbs(stereo, 0, 480), 0.0f);
        QVERIFY(peakAbs(stereo, 480, 32) > 0.01f);
        QVERIFY(proc.setParameter("gainDb", -6.0));
        QVERIFY(!proc.setParameter("unknown.param", 1.0));
    }

    void cpuBound64VoicesX512Frames() {
        DrumSampler sampler;
        sampler.loadKit(DrumKitId::Classic808);
        sampler.setVoiceLimit(64);
        // Set non-zero tune on half the pads to exercise linear-interp pitch too,
        // and disable choke groups so all 64 voices stay simultaneously active.
        for (int p = 0; p < DrumSampler::kNumPads; ++p) {
            auto pp = sampler.padParams(p);
            pp.chokeGroup = 0;
            pp.decaySec = 2.0f;
            pp.tuneSemitones = (p % 2 == 0) ? 0.0f : 3.5f;
            sampler.setPadParams(p, pp);
        }
        sampler.prepare(48000.0);

        // Trigger 64 simultaneous voices across all 16 pads.
        for (int v = 0; v < 64; ++v) {
            QVERIFY(sampler.triggerPad(v % DrumSampler::kNumPads, 0.9f) >= 0);
        }
        QCOMPARE(sampler.activeVoiceCount(), 64);

        constexpr int kIterations = 200;
        constexpr std::size_t kBlockFrames = 512;
        std::array<float, kBlockFrames * 2> stereo{};

        // Warm-up block.
        sampler.renderBlock(stereo);

        const auto t0 = std::chrono::steady_clock::now();
        for (int it = 0; it < kIterations; ++it) {
            // Re-trigger if any short sample finished so all 64 voices stay busy.
            if (sampler.activeVoiceCount() < 64) {
                sampler.reset();
                for (int v = 0; v < 64; ++v) {
                    sampler.triggerPad(v % DrumSampler::kNumPads, 0.9f);
                }
            }
            stereo.fill(0.0f);
            sampler.renderBlock(stereo);
        }
        const auto t1 = std::chrono::steady_clock::now();
        const double totalMs = std::chrono::duration<double, std::milli>(t1 - t0).count();
        const double perBlockMs = totalMs / kIterations;
        const double budgetMs = 1000.0 * static_cast<double>(kBlockFrames) / 48000.0;  // 10.667 ms

        std::fprintf(stderr, "DRUM1 CPU benchmark: 64 voices x 512 frames = %.4f ms/block (%.2f%% of %.2f ms RT budget)\n",
                     perBlockMs, 100.0 * perBlockMs / budgetMs, budgetMs);

        // Must be well under real time (<= 25% of RT budget even in unoptimized builds).
        QVERIFY2(perBlockMs < budgetMs * 0.25,
                 qPrintable(QString("Too slow: %1 ms vs %2 ms budget").arg(perBlockMs).arg(budgetMs)));
        QVERIFY(peakAbs(stereo, 0, kBlockFrames) > 0.01f);
    }

    // D1: Click-free voice stealing, choke at full polyphony, setVoiceLimit declick, same-frame choke.
    void voiceStealingAndFullPolyphonyChokeAreClickFree() {
        DrumSampler sampler;
        sampler.loadKit(DrumKitId::Classic808);
        sampler.setVoiceLimit(2);
        sampler.setMasterGain(1.0f);

        std::vector<float> dcTone(4800, 0.8f);
        std::vector<float> silent(4800, 0.0f);
        for (int p : {0, 1, 2, 5, 6}) {
            sampler.setCustomSample(p, (p == 2 || p == 5) ? silent : dcTone, 48000.0);
            auto pp = sampler.padParams(p);
            pp.attackSec = 0.0f;
            pp.holdSec = 0.5f;
            pp.decaySec = 1.0f;
            pp.level = 1.0f;
            pp.sampleLevel = 1.0f;
            pp.pan = 0.0f;
            pp.chokeGroup = (p == 5 || p == 6) ? 1 : 0;
            sampler.setPadParams(p, pp);
        }
        sampler.prepare(48000.0);

        // 1) Stealing a steady DC voice by triggering a silent pad must fade smoothly (no single-sample drop).
        std::vector<float> out(512 * 2, 0.0f);
        const std::array<DrumSampler::NoteEvent, 3> stealEvents{{
            {0, 36, 1.0f, 1.0f},   // pad 0 (DC)
            {10, 35, 1.0f, 1.0f},  // pad 1 (DC) -> voiceLimit=2 now full
            {100, 38, 1.0f, 1.0f}, // pad 2 (silent) steals pad 0
        }};
        sampler.renderBlock(out, stealEvents);
        const float beforeSteal = out[99 * 2];
        const float oneVoice = beforeSteal * 0.5f;
        QVERIFY(oneVoice > 0.3f);
        float maxStepOnSteal = 0.0f;
        for (std::size_t f = 99; f + 1 < 512; ++f) {
            maxStepOnSteal = std::max(maxStepOnSteal, std::abs(out[(f + 1) * 2] - out[f * 2]));
        }
        QVERIFY2(maxStepOnSteal < oneVoice * 0.12f,
                 qPrintable(QString("Steal click: maxStep=%1 oneVoice=%2").arg(maxStepOnSteal).arg(oneVoice)));

        // 2) Choking an open hat when polyphony is full must not hard-cut the freshly choked hat.
        sampler.reset();
        sampler.setVoiceLimit(2);
        auto p0 = sampler.padParams(0);
        p0.level = 0.25f;  // quieter older voice -> should be stolen instead of full-level choked hat
        sampler.setPadParams(0, p0);
        std::vector<float> chokeFull(512 * 2, 0.0f);
        const std::array<DrumSampler::NoteEvent, 3> chokeEvents{{
            {0, 36, 1.0f, 1.0f},   // pad 0 (quiet)
            {10, 46, 1.0f, 1.0f},  // pad 6 (open hat, full DC, chokeGroup 1) -> full
            {100, 42, 1.0f, 1.0f}, // pad 5 (closed hat, silent, chokeGroup 1) chokes pad 6 while full
        }};
        sampler.renderBlock(chokeFull, chokeEvents);
        const float preChoke = chokeFull[99 * 2];
        float maxStepOnChoke = 0.0f;
        for (std::size_t f = 99; f + 1 < 512; ++f) {
            maxStepOnChoke = std::max(maxStepOnChoke, std::abs(chokeFull[(f + 1) * 2] - chokeFull[f * 2]));
        }
        QVERIFY2(maxStepOnChoke < preChoke * 0.12f,
                 qPrintable(QString("Full-poly choke click: maxStep=%1 pre=%2").arg(maxStepOnChoke).arg(preChoke)));
        // Open hat must still be fading at frame 105 (not killed at frame 100).
        QVERIFY(chokeFull[105 * 2] > preChoke * 0.3f);

        // 3) Same-frame choke (open hat and closed hat at identical frame 0) must not emit ghost open hat audio.
        sampler.reset();
        std::vector<float> sameFrame(256 * 2, 0.0f);
        const std::array<DrumSampler::NoteEvent, 2> sameEvents{{
            {0, 46, 1.0f, 1.0f},
            {0, 42, 1.0f, 1.0f},
        }};
        sampler.renderBlock(sameFrame, sameEvents);
        QCOMPARE(peakAbs(sameFrame, 0, 256), 0.0f);

        // 4) Reducing setVoiceLimit() while voices sound must fade out smoothly (no hard step).
        sampler.reset();
        sampler.setVoiceLimit(4);
        p0.level = 1.0f;
        sampler.setPadParams(0, p0);
        QVERIFY(sampler.triggerPad(0, 1.0f) >= 0);
        QVERIFY(sampler.triggerPad(1, 1.0f) >= 0);
        std::vector<float> limOut(256 * 2, 0.0f);
        sampler.renderFrames(limOut, 0, 64);
        const float preLimit = limOut[63 * 2];
        sampler.setVoiceLimit(1);
        sampler.renderFrames(limOut, 64, 192);
        const float limitStep = std::abs(limOut[64 * 2] - preLimit);
        QVERIFY2(limitStep < (preLimit * 0.5f) * 0.12f,
                 qPrintable(QString("setVoiceLimit click: step=%1 half=%2").arg(limitStep).arg(preLimit * 0.5f)));
    }

    // D2 & D3: NaN/Inf/extreme gain, envelope, choke, and custom sample sanitization.
    void numericSafetyAndInputSanitization() {
        DrumSampler sampler;
        sampler.loadKit(DrumKitId::Classic808);
        // Custom sample containing NaN and Inf must be sanitized to finite zeros.
        std::array<float, 64> poisoned{};
        poisoned.fill(0.5f);
        poisoned[0] = std::numeric_limits<float>::quiet_NaN();
        poisoned[1] = std::numeric_limits<float>::infinity();
        poisoned[2] = -std::numeric_limits<float>::infinity();
        sampler.setCustomSample(0, poisoned, 48000.0);
        // Bogus ultra-low sourceRate must be rejected without OOM or crash.
        sampler.setCustomSample(1, poisoned, 1.0e-9);
        sampler.setCustomSample(1, poisoned, std::numeric_limits<double>::quiet_NaN());

        auto pp = sampler.padParams(0);
        pp.pan = -1.0f;  // sin(0) = 0 -> +Inf * 0 would become NaN without gain ceiling!
        pp.level = 1.2f;
        pp.sampleLevel = 1.2f;
        pp.decaySec = 1.0e30f;
        pp.attackSec = 1.0e30f;
        pp.holdSec = 1.0e30f;
        sampler.setPadParams(0, pp);
        sampler.setMasterGain(std::numeric_limits<float>::max());
        sampler.prepare(48000.0);

        std::vector<float> stereo(128 * 2, 0.0f);
        const std::array<DrumSampler::NoteEvent, 1> ev{{{0, 36, 1.0f, std::numeric_limits<float>::max()}}};
        sampler.renderBlock(stereo, ev);
        for (float s : stereo) {
            QVERIFY2(std::isfinite(s), "Non-finite output escaped DrumSampler");
            QVERIFY(std::fpclassify(s) != FP_SUBNORMAL);
        }

        // Processor-level extreme parameters and JSON fields must stay finite and bounded.
        const auto parsed = nt::parseTimeline(QJsonObject{
            {"tempo", QJsonObject{{"bpm", 120.0}}},
            {"tracks", QJsonArray{QJsonObject{
                {"id", "d"},
                {"type", "midi"},
                {"instrument", QJsonObject{
                    {"type", "drum"},
                    {"kit", "808"},
                    {"gainDb", 9999.0},
                    {"pads", QJsonArray{QJsonObject{
                        {"pan", -1.0},
                        {"level", 1.2},
                        {"decayMs", 1.0e30},
                        {"holdMs", 1.0e30},
                        {"attackMs", 0.0},
                    }}},
                }},
            }}},
            {"clips", QJsonArray{QJsonObject{
                {"id", "c1"},
                {"trackId", "d"},
                {"mediaType", "midi"},
                {"startMs", 0.0},
                {"durationMs", 500.0},
                {"volumeDb", 9999.0},
                {"notes", QJsonArray{QJsonObject{
                    {"id", "n1"}, {"pitch", 36}, {"velocity", 127}, {"startTick", 0}, {"durationTick", 120},
                }}},
            }}},
        });
        QVERIFY(parsed.timeline);
        const auto& tl = requireValue(parsed.timeline);
        DrumSamplerProcessor proc(tl, tl.tracks[0]);
        proc.prepare(48000.0);
        QVERIFY(proc.setParameter("pad0.decay", 1.0e30));
        QVERIFY(proc.setParameter("pad0.choke", 1.0e30));
        QCOMPARE(proc.sampler().padParams(0).chokeGroup, 4);
        QVERIFY(proc.sampler().padParams(0).decaySec <= 60.0f);
        QVERIFY(proc.setParameter("gainDb", 9999.0));

        std::array<float, 128 * 2> procOut{};
        nt::audio::BlockContext ctx{48000.0, 0.0, 1000.0 / 48000.0, false, 0};
        proc.process(procOut, ctx);
        for (float s : procOut) {
            QVERIFY2(std::isfinite(s), "Non-finite output escaped DrumSamplerProcessor");
            QVERIFY(std::fpclassify(s) != FP_SUBNORMAL);
        }
    }

    // D4: Windowed-sinc downsampling anti-aliasing and pitched-up octave mipmaps.
    void downsamplingAndPitchUpRejectAliasing() {
        DrumSampler sampler;
        sampler.loadKit(DrumKitId::Classic808);
        // 30 kHz sine wave at 96 kHz (strictly above 44.1 kHz Nyquist = 22.05 kHz).
        constexpr double kSrcRate = 96000.0;
        constexpr double kFreqHz = 30000.0;
        constexpr std::size_t kSrcLen = 4096;
        std::vector<float> highSine(kSrcLen);
        for (std::size_t i = 0; i < kSrcLen; ++i) {
            highSine[i] = static_cast<float>(std::sin(2.0 * std::numbers::pi * kFreqHz * static_cast<double>(i) / kSrcRate));
        }
        sampler.setCustomSample(0, highSine, kSrcRate);
        auto pp = sampler.padParams(0);
        pp.attackSec = 0.0f;
        pp.holdSec = 0.5f;
        pp.decaySec = 1.0f;
        pp.level = 1.0f;
        pp.sampleLevel = 1.0f;
        pp.pan = 0.0f;
        pp.tuneSemitones = 0.0f;
        sampler.setPadParams(0, pp);
        sampler.setMasterGain(1.0f);
        sampler.prepare(44100.0);

        std::vector<float> out(1024 * 2, 0.0f);
        const std::array<DrumSampler::NoteEvent, 1> ev{{{0, 36, 1.0f, 1.0f}}};
        sampler.renderBlock(out, ev);
        // Measure steady interior (skip edge transient); aliased energy must be < -50 dB (< 0.003 RMS).
        const double aliasRms = rmsMono(out, 128, 700);
        QVERIFY2(aliasRms < 0.003,
                 qPrintable(QString("Downsampling aliasing too high: rms=%1").arg(aliasRms)));

        // Also test pitching up +24 semitones (4x speed) on a 10 kHz tone at 48 kHz:
        // 4 * 10 kHz = 40 kHz > 24 kHz Nyquist -> octave mipmap must suppress it (< -45 dB).
        std::vector<float> tone10k(4096);
        for (std::size_t i = 0; i < tone10k.size(); ++i) {
            tone10k[i] = static_cast<float>(std::sin(2.0 * std::numbers::pi * 10000.0 * static_cast<double>(i) / 48000.0));
        }
        sampler.setCustomSample(0, tone10k, 48000.0);
        pp.tuneSemitones = 24.0f;
        sampler.setPadParams(0, pp);
        sampler.prepare(48000.0);
        std::vector<float> pitchOut(512 * 2, 0.0f);
        sampler.renderBlock(pitchOut, ev);
        const double pitchAliasRms = rmsMono(pitchOut, 64, 300);
        QVERIFY2(pitchAliasRms < 0.006,
                 qPrintable(QString("Pitch-up +24st aliasing too high: rms=%1").arg(pitchAliasRms)));
    }

    // D5: Sample-accurate timing at 44.1 / 48 / 96 kHz, block-edge offsets, and seek parity.
    void blockEdgeTimingAndSeekConsistencyAcrossRates() {
        // Test at 96 kHz: a note at an odd frame (frame 11 = 11 / 96 ms) must fire at frame 11, not 10 or 12.
        const double oddFrameMs = 11.0 * 1000.0 / 96000.0;
        const auto parsed96 = nt::parseTimeline(QJsonObject{
            {"tempo", QJsonObject{{"bpm", 120.0}}},
            {"tracks", QJsonArray{QJsonObject{
                {"id", "d"},
                {"type", "midi"},
                {"instrument", QJsonObject{{"type", "drum"}, {"kit", "808"}}},
            }}},
            {"clips", QJsonArray{QJsonObject{
                {"id", "c1"},
                {"trackId", "d"},
                {"mediaType", "midi"},
                {"startMs", oddFrameMs},
                {"durationMs", 500.0},
                {"notes", QJsonArray{QJsonObject{
                    {"id", "n1"}, {"pitch", 36}, {"velocity", 127}, {"startTick", 0}, {"durationTick", 120},
                }}},
            }}},
        });
        QVERIFY(parsed96.timeline);
        const auto& tl96 = requireValue(parsed96.timeline);
        DrumSamplerProcessor proc96(tl96, tl96.tracks[0]);
        proc96.prepare(96000.0);
        std::array<float, 64 * 2> out96{};
        nt::audio::BlockContext ctx96{96000.0, 0.0, 1000.0 / 96000.0, false, 0};
        proc96.process(out96, ctx96);
        QCOMPARE(peakAbs(out96, 0, 11), 0.0f);
        // 808BD starts with a low-level transient at sample 0 and reaches full body within ~16 frames at 96 kHz.
        QVERIFY2(peakAbs(out96, 11, 1) > 1e-5f && peakAbs(out96, 11, 16) > 0.02f, "Note at odd 96kHz frame missed");
        // Check first non-zero frame is strictly 11 (not 10 or 12).
        std::size_t firstNonZero = 64;
        for (std::size_t f = 0; f < 64; ++f) {
            if (std::abs(out96[f * 2]) > 1e-6f) { firstNonZero = f; break; }
        }
        QCOMPARE(firstNonZero, std::size_t{11});

        // Verify tick-based extraction has no 48 kHz pre-quantization: at 128 BPM,
        // startTick = 1 is 0.48828125 ms = 46.875 frames at 96 kHz -> frame 47 (odd).
        // Old 48 kHz extraction rounded 23.4375 -> 23 -> frame 46.
        const auto parsedTick96 = nt::parseTimeline(QJsonObject{
            {"tempo", QJsonObject{{"bpm", 128.0}}},
            {"tracks", QJsonArray{QJsonObject{
                {"id", "d"},
                {"type", "midi"},
                {"instrument", QJsonObject{{"type", "drum"}, {"kit", "808"}}},
            }}},
            {"clips", QJsonArray{QJsonObject{
                {"id", "c1"},
                {"trackId", "d"},
                {"mediaType", "midi"},
                {"startMs", 0.0},
                {"durationMs", 500.0},
                {"notes", QJsonArray{QJsonObject{
                    {"id", "n1"}, {"pitch", 36}, {"velocity", 127}, {"startTick", 1}, {"durationTick", 120},
                }}},
            }}},
        });
        QVERIFY(parsedTick96.timeline);
        const auto& tlTick96 = requireValue(parsedTick96.timeline);
        DrumSamplerProcessor tickProc96(tlTick96, tlTick96.tracks[0]);
        tickProc96.prepare(96000.0);
        std::array<float, 96 * 2> tickOut96{};
        tickProc96.process(tickOut96, ctx96);
        QCOMPARE(peakAbs(tickOut96, 0, 47), 0.0f);
        std::size_t tickFirstNonZero = 96;
        for (std::size_t f = 0; f < 96; ++f) {
            if (std::abs(tickOut96[f * 2]) > 1e-6f) { tickFirstNonZero = f; break; }
        }
        QCOMPARE(tickFirstNonZero, std::size_t{47});

        // Test block-edge timing and continuous vs direct-seek parity at 44.1, 48, and 96 kHz:
        // Note at frames - 0.3 of block 0 must fire on block 1 frame 0 BOTH continuously and on direct seek,
        // and a note at exact block boundary (frames * msPerFrame) must not be dropped on direct seek even with +1 ULP.
        for (double rate : {44100.0, 48000.0, 96000.0}) {
            constexpr std::size_t kBlock = 128;
            const double msPerFrame = 1000.0 / rate;
            const double block1Ms = static_cast<double>(kBlock) * msPerFrame;
            const double edgeNoteMs = (static_cast<double>(kBlock) - 0.3) * msPerFrame;
            const double lastFrameMs = static_cast<double>(kBlock - 1) * msPerFrame;

            const auto parsedEdge = nt::parseTimeline(QJsonObject{
                {"tempo", QJsonObject{{"bpm", 120.0}}},
                {"tracks", QJsonArray{QJsonObject{
                    {"id", "d"},
                    {"type", "midi"},
                    {"instrument", QJsonObject{{"type", "drum"}, {"kit", "808"}}},
                }}},
                {"clips", QJsonArray{QJsonObject{
                    {"id", "c1"},
                    {"trackId", "d"},
                    {"mediaType", "midi"},
                    {"startMs", edgeNoteMs},
                    {"durationMs", 500.0},
                    {"notes", QJsonArray{QJsonObject{
                        {"id", "n1"}, {"pitch", 36}, {"velocity", 127}, {"startTick", 0}, {"durationTick", 120},
                    }}},
                }}},
            });
            QVERIFY(parsedEdge.timeline);
            const auto& tlEdge = requireValue(parsedEdge.timeline);
            DrumSamplerProcessor contProc(tlEdge, tlEdge.tracks[0]);
            DrumSamplerProcessor seekProc(tlEdge, tlEdge.tracks[0]);
            contProc.prepare(rate);
            seekProc.prepare(rate);

            std::array<float, kBlock * 2> b0{}, b1Cont{}, b1Seek{};
            contProc.process(b0, {rate, 0.0, msPerFrame, false, 0});
            contProc.process(b1Cont, {rate, block1Ms, msPerFrame, false, 0});
            seekProc.process(b1Seek, {rate, block1Ms, msPerFrame, false, 0});

            QCOMPARE(peakAbs(b0, 0, kBlock), 0.0f);
            QVERIFY2(peakAbs(b1Cont, 0, 16) > 0.02f, "Continuous playback missed block-edge note");
            QVERIFY2(peakAbs(b1Seek, 0, 16) > 0.02f, "Direct seek dropped block-edge note");
            for (std::size_t i = 0; i < b1Cont.size(); ++i) {
                QVERIFY(std::abs(b1Cont[i] - b1Seek[i]) < 1e-6f);
            }

            // Note at frame == kBlock - 1 fires inside block 0 at frame kBlock - 1 and not dropped.
            const auto parsedLast = nt::parseTimeline(QJsonObject{
                {"tempo", QJsonObject{{"bpm", 120.0}}},
                {"tracks", QJsonArray{QJsonObject{
                    {"id", "d"},
                    {"type", "midi"},
                    {"instrument", QJsonObject{{"type", "drum"}, {"kit", "808"}}},
                }}},
                {"clips", QJsonArray{QJsonObject{
                    {"id", "c1"},
                    {"trackId", "d"},
                    {"mediaType", "midi"},
                    {"startMs", lastFrameMs},
                    {"durationMs", 500.0},
                    {"notes", QJsonArray{QJsonObject{
                        {"id", "n1"}, {"pitch", 36}, {"velocity", 127}, {"startTick", 0}, {"durationTick", 120},
                    }}},
                }}},
            });
            QVERIFY(parsedLast.timeline);
            DrumSamplerProcessor lastProc(requireValue(parsedLast.timeline), requireValue(parsedLast.timeline).tracks[0]);
            lastProc.prepare(rate);
            std::array<float, kBlock * 2> lastB0{};
            lastProc.process(lastB0, {rate, 0.0, msPerFrame, false, 0});
            QCOMPARE(peakAbs(lastB0, 0, kBlock - 1), 0.0f);
            QVERIFY(std::abs(lastB0[(kBlock - 1) * 2]) > 0.0f);

            // Direct seek to exact downbeat + 1 ULP must not drop the note.
            const double plusUlp = std::nextafter(block1Ms, block1Ms + 1.0);
            const auto parsedExact = nt::parseTimeline(QJsonObject{
                {"tempo", QJsonObject{{"bpm", 120.0}}},
                {"tracks", QJsonArray{QJsonObject{
                    {"id", "d"},
                    {"type", "midi"},
                    {"instrument", QJsonObject{{"type", "drum"}, {"kit", "808"}}},
                }}},
                {"clips", QJsonArray{QJsonObject{
                    {"id", "c1"},
                    {"trackId", "d"},
                    {"mediaType", "midi"},
                    {"startMs", block1Ms},
                    {"durationMs", 500.0},
                    {"notes", QJsonArray{QJsonObject{
                        {"id", "n1"}, {"pitch", 36}, {"velocity", 127}, {"startTick", 0}, {"durationTick", 120},
                    }}},
                }}},
            });
            QVERIFY(parsedExact.timeline);
            DrumSamplerProcessor exactProc(requireValue(parsedExact.timeline), requireValue(parsedExact.timeline).tracks[0]);
            exactProc.prepare(rate);
            std::array<float, kBlock * 2> ulpOut{};
            exactProc.process(ulpOut, {rate, plusUlp, msPerFrame, false, 0});
            QVERIFY2(peakAbs(ulpOut, 0, 16) > 0.02f, "Direct seek with +1 ULP dropped downbeat note");
        }
    }

    // D6: Clip fadeInMs > 0 must fade in downbeat note instead of dropping it, and fadeOutMs > 0 must fade tail.
    void clipFadeInAndFadeOutShapeActiveVoices() {
        const auto parsed = nt::parseTimeline(QJsonObject{
            {"tempo", QJsonObject{{"bpm", 120.0}}},
            {"tracks", QJsonArray{QJsonObject{
                {"id", "d"},
                {"type", "midi"},
                {"instrument", QJsonObject{{"type", "drum"}, {"kit", "808"}}},
            }}},
            {"clips", QJsonArray{QJsonObject{
                {"id", "c1"},
                {"trackId", "d"},
                {"mediaType", "midi"},
                {"startMs", 0.0},
                {"durationMs", 100.0},
                {"fadeInMs", 20.0},
                {"fadeOutMs", 30.0},
                {"notes", QJsonArray{QJsonObject{
                    {"id", "n1"}, {"pitch", 49}, {"velocity", 127}, {"startTick", 0}, {"durationTick", 480},
                }}},
            }}},
        });
        QVERIFY(parsed.timeline);
        const auto& tl = requireValue(parsed.timeline);
        DrumSamplerProcessor proc(tl, tl.tracks[0]);
        proc.prepare(48000.0);

        // Render 150 ms (7200 frames at 48 kHz) in 128-frame blocks.
        constexpr std::size_t kTotalFrames = 7200;
        std::vector<float> full(kTotalFrames * 2, 0.0f);
        const double msPerFrame = 1000.0 / 48000.0;
        for (std::size_t off = 0; off < kTotalFrames; off += 128) {
            const std::size_t chunk = std::min<std::size_t>(128, kTotalFrames - off);
            nt::audio::BlockContext ctx{48000.0, static_cast<double>(off) * msPerFrame, msPerFrame, false, 0};
            proc.process(std::span<float>(full).subspan(off * 2, chunk * 2), ctx);
        }
        // Frame 0 is at fadeIn start -> silence; mid-clip (30..60 ms) must sound strongly (not dropped!).
        QVERIFY(std::abs(full[0]) < 1e-5f);
        const double midRms = rmsMono(full, 1440, 1440);  // 30..60 ms
        QVERIFY2(midRms > 0.01, qPrintable(QString("Downbeat note dropped by fadeInMs: midRms=%1").arg(midRms)));
        // Past clip end (105..150 ms = frames 5040..7200), fadeOutMs must have brought the ringing cymbal to silence.
        const float postClipPeak = peakAbs(full, 5040, 2160);
        QVERIFY2(postClipPeak < 1e-5f,
                 qPrintable(QString("Tail not faded by fadeOutMs: postClipPeak=%1").arg(postClipPeak)));
    }

    // D7: Zone-only mapping clears leftover GM notes and applies zone gainDb once (not squared).
    void zoneMappingClearsGmAndAppliesGainOnce() {
        auto renderZone = [](int pitch, double zoneGainDb) {
            const auto parsed = nt::parseTimeline(QJsonObject{
                {"tempo", QJsonObject{{"bpm", 120.0}}},
                {"tracks", QJsonArray{QJsonObject{
                    {"id", "s"},
                    {"type", "midi"},
                    {"instrument", QJsonObject{
                        {"type", "sampler"},
                        {"oneShot", true},
                        {"zones", QJsonArray{QJsonObject{
                            {"rootNote", 60},
                            {"lowNote", 60},
                            {"highNote", 60},
                            {"gainDb", zoneGainDb},
                        }}},
                    }},
                }}},
                {"clips", QJsonArray{QJsonObject{
                    {"id", "c1"},
                    {"trackId", "s"},
                    {"mediaType", "midi"},
                    {"startMs", 0.0},
                    {"durationMs", 500.0},
                    {"notes", QJsonArray{QJsonObject{
                        {"id", "n1"}, {"pitch", pitch}, {"velocity", 127}, {"startTick", 0}, {"durationTick", 120},
                    }}},
                }}},
            });
            if (!parsed.timeline) qFatal("%s", qPrintable(parsed.error));
            const auto& tl = *parsed.timeline;
            DrumSamplerProcessor proc(tl, tl.tracks[0]);
            proc.prepare(48000.0);
            std::array<float, 512 * 2> out{};
            proc.process(out, {48000.0, 0.0, 1000.0 / 48000.0, false, 0});
            return rmsMono(out, 0, 512);
        };

        // Note 36 is outside zone [60, 60] and must NOT trigger leftover GM 808 kick.
        QCOMPARE(renderZone(36, 0.0), 0.0);
        // Note 60 at -6 dB must be ~0.5x RMS of 0 dB (not 0.25x from squared pp.level).
        const double rms0 = renderZone(60, 0.0);
        const double rmsMinus6 = renderZone(60, -6.0);
        QVERIFY(rms0 > 0.01);
        const double ratio = rmsMinus6 / rms0;
        const double expected = std::pow(10.0, -6.0 / 20.0);
        QVERIFY2(std::abs(ratio - expected) < 0.02,
                 qPrintable(QString("Zone gainDb misapplied: ratio=%1 expected=%2").arg(ratio).arg(expected)));

        // Routing predicate: only "drum" and one-shot kit-backed "sampler" (without zones) map to DrumSampler.
        QVERIFY(DrumSamplerProcessor::handlesInstrument(QJsonObject{{"type", "drum"}, {"kit", "808"}}));
        QVERIFY(DrumSamplerProcessor::handlesInstrument(QJsonObject{{"type", "sampler"}, {"oneShot", true}}));
        QVERIFY(!DrumSamplerProcessor::handlesInstrument(QJsonObject{{"type", "sampler"}}));
        QVERIFY(!DrumSamplerProcessor::handlesInstrument(QJsonObject{{"type", "sampler"}, {"oneShot", false}}));
        QVERIFY(!DrumSamplerProcessor::handlesInstrument(QJsonObject{
            {"type", "sampler"},
            {"oneShot", true},
            {"zones", QJsonArray{QJsonObject{{"rootNote", 60}}}},
        }));
        QVERIFY(!DrumSamplerProcessor::handlesInstrument(QJsonObject{{"type", "subtractive"}}));
        QVERIFY(!DrumSamplerProcessor::handlesInstrument(QJsonObject{}));
    }

    // D8: setParameter("gainDb") and "master.volume" smoothly modulate active tails.
    void masterGainParameterModulatesActiveTailSmoothly() {
        const auto parsed = nt::parseTimeline(QJsonObject{
            {"tempo", QJsonObject{{"bpm", 120.0}}},
            {"tracks", QJsonArray{QJsonObject{
                {"id", "d"},
                {"type", "midi"},
                {"instrument", QJsonObject{{"type", "drum"}, {"kit", "808"}, {"gainDb", 0.0}}},
            }}},
            {"clips", QJsonArray{QJsonObject{
                {"id", "c1"},
                {"trackId", "d"},
                {"mediaType", "midi"},
                {"startMs", 0.0},
                {"durationMs", 1000.0},
                {"notes", QJsonArray{QJsonObject{
                    {"id", "n1"}, {"pitch", 36}, {"velocity", 127}, {"startTick", 0}, {"durationTick", 480},
                }}},
            }}},
        });
        QVERIFY(parsed.timeline);
        const auto& tl = requireValue(parsed.timeline);
        DrumSamplerProcessor refProc(tl, tl.tracks[0]);
        DrumSamplerProcessor modProc(tl, tl.tracks[0]);
        DrumSamplerProcessor volProc(tl, tl.tracks[0]);
        refProc.prepare(48000.0);
        modProc.prepare(48000.0);
        volProc.prepare(48000.0);

        const double msPerFrame = 1000.0 / 48000.0;
        std::array<float, 256 * 2> refB0{}, modB0{}, volB0{}, refB1{}, modB1{}, volB1{}, refB2{}, modB2{}, volB2{};
        // Block 0: kick starts, all identical.
        refProc.process(refB0, {48000.0, 0.0, msPerFrame, false, 0});
        modProc.process(modB0, {48000.0, 0.0, msPerFrame, false, 0});
        volProc.process(volB0, {48000.0, 0.0, msPerFrame, false, 0});
        QVERIFY(rmsMono(refB0, 0, 256) > 0.05);

        // Drop gainDb by -12 dB and master.volume to 0.5 mid-tail.
        QVERIFY(modProc.setParameter("gainDb", -12.0));
        QVERIFY(volProc.setParameter("master.volume", 0.5));
        // Block 1 (256 frames = 5.33 ms): smoother transitions smoothly over ~240 frames.
        refProc.process(refB1, {48000.0, 256.0 * msPerFrame, msPerFrame, false, 0});
        modProc.process(modB1, {48000.0, 256.0 * msPerFrame, msPerFrame, false, 0});
        volProc.process(volB1, {48000.0, 256.0 * msPerFrame, msPerFrame, false, 0});
        // Smoothness check: first frame of Block 1 must still be close to ref (no instantaneous jump).
        QVERIFY(std::abs(modB1[0] - refB1[0]) <= std::abs(refB1[0]) * 0.05f + 1e-4f);
        // Block 2 (settled): modProc must be ~-12 dB (~0.251x) and volProc ~0.5x of refProc!
        refProc.process(refB2, {48000.0, 512.0 * msPerFrame, msPerFrame, false, 0});
        modProc.process(modB2, {48000.0, 512.0 * msPerFrame, msPerFrame, false, 0});
        volProc.process(volB2, {48000.0, 512.0 * msPerFrame, msPerFrame, false, 0});

        const double refRms = rmsMono(refB2, 0, 256);
        const double modRms = rmsMono(modB2, 0, 256);
        const double volRms = rmsMono(volB2, 0, 256);
        QVERIFY(refRms > 0.02);
        const double ratio = modRms / refRms;
        const double expected = std::pow(10.0, -12.0 / 20.0);
        QVERIFY2(std::abs(ratio - expected) < 0.02,
                 qPrintable(QString("Active tail ignored gainDb: ratio=%1 expected=%2").arg(ratio).arg(expected)));
        const double volRatio = volRms / refRms;
        QVERIFY2(std::abs(volRatio - 0.5) < 0.02,
                 qPrintable(QString("Active tail ignored master.volume: ratio=%1").arg(volRatio)));
    }

    // D9: Redundant prepare(sameRate) preserves active voices and does zero allocations.
    void redundantPreparePreservesVoicesAndSkipsReallocation() {
        DrumSampler sampler;
        sampler.loadKit(DrumKitId::Classic808);
        sampler.prepare(48000.0);
        QVERIFY(sampler.triggerPad(0, 1.0f) >= 0);
        QCOMPARE(sampler.activeVoiceCount(), 1);
        QCOMPARE(sampler.activeVoiceCountAtomic(), 1);

        nt::testing::allocations = 0;
        nt::testing::countAllocations = true;
        sampler.prepare(48000.0);
        nt::testing::countAllocations = false;

        const std::size_t allocs = nt::testing::allocations;
        QCOMPARE(allocs, std::size_t{0});
        QCOMPARE(sampler.activeVoiceCount(), 1);
        QCOMPARE(sampler.activeVoiceCountAtomic(), 1);
    }

    // E1: Real production MixPlan construction & rendering for drum, zone-free one-shot
    // sampler, zone sampler exclusion, subtractive coexistence, and mute/solo rules.
    void productionMixPlanRoutesDrumAndOneShotSampler() {
        auto buildAndRender = [](const QJsonArray& tracks, const QJsonArray& clips, nt::audio::MixPlan& outPlan) {
            const auto parsed = nt::parseTimeline(QJsonObject{
                {"tempo", QJsonObject{{"bpm", 120.0}}},
                {"tracks", tracks},
                {"clips", clips},
            });
            if (!parsed.timeline) qFatal("%s", qPrintable(parsed.error));
            outPlan = nt::audio::buildMixPlan(*parsed.timeline);
            nt::audio::prepareMixPlan(outPlan, 48000.0, 256);
            std::vector<float> out(512 * 2, 0.0f);
            nt::audio::MixStats stats{};
            nt::audio::mixBlock(outPlan, nullptr, 48000.0, 0.0, 1000.0 / 48000.0, 512, out.data(), stats);
            return out;
        };

        auto makeClip = [](const QString& id, const QString& trackId, int pitch = 36) {
            return QJsonObject{
                {"id", id},
                {"trackId", trackId},
                {"mediaType", "midi"},
                {"startMs", 0.0},
                {"durationMs", 1000.0},
                {"notes", QJsonArray{QJsonObject{
                    {"id", "n1"}, {"pitch", pitch}, {"velocity", 127}, {"startTick", 0}, {"durationTick", 240},
                }}},
            };
        };

        auto findDrumProc = [](const nt::audio::MixPlan& plan, std::string_view trackId) -> const DrumSamplerProcessor* {
            for (const auto& bus : plan.tracks) {
                if (bus.trackId != trackId) continue;
                for (const auto& p : bus.processors) {
                    if (auto* dp = dynamic_cast<const DrumSamplerProcessor*>(p.get())) return dp;
                }
            }
            return nullptr;
        };

        // 1) instrument.type = "drum" (808 and UZU) route to DrumSamplerProcessor and render distinct audio.
        nt::audio::MixPlan plan808;
        const auto out808 = buildAndRender(
            QJsonArray{QJsonObject{{"id", "d808"}, {"type", "midi"},
                                   {"instrument", QJsonObject{{"type", "drum"}, {"kit", "808"}}}}},
            QJsonArray{makeClip("c1", "d808", 36)}, plan808);
        QVERIFY2(findDrumProc(plan808, "d808") != nullptr, "buildMixPlan must attach DrumSamplerProcessor for drum track");
        QVERIFY2(peakAbs(out808, 0, 512) > 0.05f, "Production MixPlan drum 808 track rendered silence");

        nt::audio::MixPlan planUzu;
        const auto outUzu = buildAndRender(
            QJsonArray{QJsonObject{{"id", "duzu"}, {"type", "midi"},
                                   {"instrument", QJsonObject{{"type", "drum"}, {"kit", "uzu"}}}}},
            QJsonArray{makeClip("c1", "duzu", 36)}, planUzu);
        QVERIFY2(findDrumProc(planUzu, "duzu") != nullptr, "buildMixPlan must attach DrumSamplerProcessor for UZU track");
        QVERIFY2(peakAbs(outUzu, 0, 512) > 0.05f, "Production MixPlan drum UZU track rendered silence");
        double kitDiff = 0.0;
        for (std::size_t i = 0; i < out808.size(); ++i) kitDiff += std::abs(out808[i] - outUzu[i]);
        QVERIFY2(kitDiff > 1.0, "Production MixPlan 808 and UZU renders must differ");

        // 2) Zone-free one-shot "sampler" routes to DrumSamplerProcessor and renders audio.
        nt::audio::MixPlan planOneShot;
        const auto outOneShot = buildAndRender(
            QJsonArray{QJsonObject{{"id", "os"}, {"type", "midi"},
                                   {"instrument", QJsonObject{{"type", "sampler"}, {"oneShot", true}}}}},
            QJsonArray{makeClip("c1", "os", 36)}, planOneShot);
        QVERIFY2(findDrumProc(planOneShot, "os") != nullptr,
                 "buildMixPlan must attach DrumSamplerProcessor for zone-free oneShot sampler");
        QVERIFY2(peakAbs(outOneShot, 0, 512) > 0.05f, "Production MixPlan oneShot sampler rendered silence");

        // 3) Zone-based "sampler" and non-oneShot "sampler" must NOT get DrumSamplerProcessor.
        nt::audio::MixPlan planZoneSampler;
        (void)buildAndRender(
            QJsonArray{
                QJsonObject{{"id", "zs"}, {"type", "midi"},
                            {"instrument", QJsonObject{
                                {"type", "sampler"},
                                {"oneShot", true},
                                {"zones", QJsonArray{QJsonObject{{"rootNote", 60}}}},
                            }}},
                QJsonObject{{"id", "ms"}, {"type", "midi"},
                            {"instrument", QJsonObject{{"type", "sampler"}, {"oneShot", false}}}},
            },
            QJsonArray{makeClip("c1", "zs", 60), makeClip("c2", "ms", 60)}, planZoneSampler);
        QVERIFY2(findDrumProc(planZoneSampler, "zs") == nullptr, "Zone-based sampler must be excluded from DrumSampler");
        QVERIFY2(findDrumProc(planZoneSampler, "ms") == nullptr, "Non-oneShot sampler must be excluded from DrumSampler");

        // 4) Subtractive track coexists cleanly and is NOT replaced by DrumSamplerProcessor.
        nt::audio::MixPlan planSub;
        const auto outSub = buildAndRender(
            QJsonArray{QJsonObject{{"id", "sub"}, {"type", "midi"},
                                   {"instrument", QJsonObject{{"type", "subtractive"}}}}},
            QJsonArray{makeClip("c1", "sub", 60)}, planSub);
        QVERIFY2(findDrumProc(planSub, "sub") == nullptr, "Subtractive track must not attach DrumSamplerProcessor");
        QVERIFY2(peakAbs(outSub, 0, 512) > 0.01f, "Subtractive track must still render via SubtractiveInstrumentProcessor");

        // 5) Mute and solo rules on drum tracks match production mixer semantics.
        nt::audio::MixPlan planMuted;
        const auto outMuted = buildAndRender(
            QJsonArray{QJsonObject{{"id", "dm"}, {"type", "midi"}, {"muted", true},
                                   {"instrument", QJsonObject{{"type", "drum"}, {"kit", "808"}}}}},
            QJsonArray{makeClip("c1", "dm", 36)}, planMuted);
        QCOMPARE(peakAbs(outMuted, 0, 512), 0.0f);

        nt::audio::MixPlan planSolo;
        const auto outSolo = buildAndRender(
            QJsonArray{
                QJsonObject{{"id", "d1"}, {"type", "midi"}, {"solo", false},
                            {"instrument", QJsonObject{{"type", "drum"}, {"kit", "808"}}}},
                QJsonObject{{"id", "d2"}, {"type", "midi"}, {"solo", true},
                            {"instrument", QJsonObject{{"type", "drum"}, {"kit", "uzu"}}}},
            },
            QJsonArray{makeClip("c1", "d1", 36), makeClip("c2", "d2", 36)}, planSolo);
        QVERIFY(findDrumProc(planSolo, "d1") == nullptr);
        QVERIFY(findDrumProc(planSolo, "d2") != nullptr);
        QVERIFY(peakAbs(outSolo, 0, 512) > 0.05f);
    }

    // E2: Non-octave upward tuning (+5, +7, +19 st) must suppress above-Nyquist aliasing,
    // preserve passband tones, and avoid abrupt filtering switches across octave boundaries.
    void nonOctavePitchUpAntiAliasingAndOctaveContinuity() {
        auto renderSineAtPitch = [](double freqHz, float semitones, double rate = 48000.0) {
            DrumSampler sampler;
            sampler.loadKit(DrumKitId::Classic808);
            constexpr std::size_t kSrcLen = 4096;
            std::vector<float> sine(kSrcLen);
            for (std::size_t i = 0; i < kSrcLen; ++i) {
                sine[i] = static_cast<float>(std::sin(2.0 * std::numbers::pi * freqHz * static_cast<double>(i) / rate));
            }
            sampler.setCustomSample(0, sine, rate);
            auto pp = sampler.padParams(0);
            pp.attackSec = 0.0f;
            pp.holdSec = 0.5f;
            pp.decaySec = 1.0f;
            pp.level = 1.0f;
            pp.sampleLevel = 1.0f;
            pp.pan = 0.0f;
            pp.tuneSemitones = semitones;
            sampler.setPadParams(0, pp);
            sampler.setMasterGain(1.0f);
            sampler.prepare(rate);
            std::vector<float> out(512 * 2, 0.0f);
            const std::array<DrumSampler::NoteEvent, 1> ev{{{0, 36, 1.0f, 1.0f}}};
            sampler.renderBlock(out, ev);
            return rmsMono(out, 96, 256);
        };

        // 1) +7 st (rawStep = 1.4983): 18 kHz * 1.4983 = 26.97 kHz > 24 kHz Nyquist (folds to 21.03 kHz).
        const double aliasPlus7 = renderSineAtPitch(18000.0, 7.0f);
        QVERIFY2(aliasPlus7 < 0.005,
                 qPrintable(QString("Non-octave +7st aliasing too high (18 kHz): rms=%1").arg(aliasPlus7)));

        // 2) +19 st (rawStep = 2.9966): 10 kHz * 2.9966 = 29.97 kHz > 24 kHz Nyquist (folds to 18.03 kHz).
        const double aliasPlus19 = renderSineAtPitch(10000.0, 19.0f);
        QVERIFY2(aliasPlus19 < 0.005,
                 qPrintable(QString("Non-octave +19st aliasing too high (10 kHz): rms=%1").arg(aliasPlus19)));

        // 3) +5 st (rawStep = 1.3348): 20 kHz * 1.3348 = 26.70 kHz > 24 kHz Nyquist (folds to 21.30 kHz).
        const double aliasPlus5 = renderSineAtPitch(20000.0, 5.0f);
        QVERIFY2(aliasPlus5 < 0.005,
                 qPrintable(QString("Non-octave +5st aliasing too high (20 kHz): rms=%1").arg(aliasPlus5)));

        // 4) Passband preservation: 4 kHz at +7 st (5.99 kHz) and +19 st (11.99 kHz) must remain full level.
        const double passPlus7 = renderSineAtPitch(4000.0, 7.0f);
        const double passPlus19 = renderSineAtPitch(4000.0, 19.0f);
        const double expectedPass = 0.5;  // cos(pi/4) * sqrt(0.5) = 0.5 mono RMS for unit-peak sine centered at pan=0
        QVERIFY2(std::abs(passPlus7 - expectedPass) < 0.03,
                 qPrintable(QString("Passband +7st attenuated unexpectedly: rms=%1 expected=%2").arg(passPlus7).arg(expectedPass)));
        QVERIFY2(std::abs(passPlus19 - expectedPass) < 0.03,
                 qPrintable(QString("Passband +19st attenuated unexpectedly: rms=%1 expected=%2").arg(passPlus19).arg(expectedPass)));

        // 5) Continuity across +12 st octave boundary: no sudden jump in stopband or passband.
        const double stopBelow = renderSineAtPitch(14000.0, 11.9f);
        const double stopAt = renderSineAtPitch(14000.0, 12.0f);
        const double stopAbove = renderSineAtPitch(14000.0, 12.1f);
        QVERIFY2(stopBelow < 0.006 && stopAt < 0.006 && stopAbove < 0.006,
                 qPrintable(QString("Octave boundary stopband discontinuity: -0.1=%1 0=%2 +0.1=%3")
                                .arg(stopBelow).arg(stopAt).arg(stopAbove)));

        const double passBelow = renderSineAtPitch(6000.0, 11.9f);
        const double passAt = renderSineAtPitch(6000.0, 12.0f);
        const double passAbove = renderSineAtPitch(6000.0, 12.1f);
        QVERIFY2(std::abs(passBelow - passAt) / passAt < 0.05 && std::abs(passAbove - passAt) / passAt < 0.05,
                 qPrintable(QString("Octave boundary passband discontinuity: -0.1=%1 0=%2 +0.1=%3")
                                .arg(passBelow).arg(passAt).arg(passAbove)));
    }

    // E3: Published drum automation targets (padN.aenv.att, padN.aenv.hold, padN.aenv.dec,
    // padN.aenv.curve, padN.v2l, padN.lvl, padN.pan, master.volume) work via setParameter
    // and audibly shape subsequent rendered hits.
    void publishedDrumAutomationTargetsAffectRenderedOutput() {
        auto makeProc = [](int velocity = 127) {
            const auto parsed = nt::parseTimeline(QJsonObject{
                {"tempo", QJsonObject{{"bpm", 120.0}}},
                {"tracks", QJsonArray{QJsonObject{
                    {"id", "d"},
                    {"type", "midi"},
                    {"instrument", QJsonObject{
                        {"type", "drum"},
                        {"kit", "808"},
                        {"gainDb", 0.0},
                        {"pads", QJsonArray{QJsonObject{
                            {"level", 1.0},
                            {"pan", 0.0},
                            {"attackMs", 0.0},
                            {"holdMs", 0.0},
                            {"decayMs", 200.0},
                            {"curve", 0.0},
                            {"velocityToLevel", 1.0},
                        }}},
                    }},
                }}},
                {"clips", QJsonArray{QJsonObject{
                    {"id", "c1"},
                    {"trackId", "d"},
                    {"mediaType", "midi"},
                    {"startMs", 0.0},
                    {"durationMs", 1000.0},
                    {"notes", QJsonArray{QJsonObject{
                        {"id", "n1"}, {"pitch", 36}, {"velocity", velocity}, {"startTick", 0}, {"durationTick", 240},
                    }}},
                }}},
            });
            if (!parsed.timeline) qFatal("%s", qPrintable(parsed.error));
            auto proc = std::make_unique<DrumSamplerProcessor>(*parsed.timeline, parsed.timeline->tracks[0]);
            proc->prepare(48000.0);
            return proc;
        };

        auto renderMs = [](DrumSamplerProcessor& proc, std::size_t frames) {
            std::vector<float> out(frames * 2, 0.0f);
            proc.process(out, {48000.0, 0.0, 1000.0 / 48000.0, false, 0});
            return out;
        };

        // 1) pad0.aenv.att (seconds): 0.04 s attack ramps up from silence vs instant transient at 0 s.
        {
            auto fast = makeProc();
            auto slow = makeProc();
            QVERIFY(fast->setParameter("pad0.aenv.att", 0.0));
            QVERIFY(slow->setParameter("pad0.aenv.att", 0.04));
            QVERIFY(std::abs(slow->sampler().padParams(0).attackSec - 0.04f) < 1e-5f);
            const auto outFast = renderMs(*fast, 2400);
            const auto outSlow = renderMs(*slow, 2400);
            const double fastEarly = rmsMono(outFast, 0, 240);   // first 5 ms
            const double slowEarly = rmsMono(outSlow, 0, 240);   // first 5 ms (ramp <= 12.5%)
            const double slowLate = rmsMono(outSlow, 1920, 480); // 40..50 ms (full level)
            QVERIFY(fastEarly > 0.05);
            QVERIFY2(slowEarly < fastEarly * 0.25,
                     qPrintable(QString("pad0.aenv.att did not soften attack: slow=%1 fast=%2").arg(slowEarly).arg(fastEarly)));
            QVERIFY2(slowLate > slowEarly * 2.0, "pad0.aenv.att did not reach sustain after attack");
        }

        // 2) pad0.aenv.hold (seconds): longer hold keeps amplitude higher after decay would have started.
        {
            auto shortHold = makeProc();
            auto longHold = makeProc();
            QVERIFY(shortHold->setParameter("pad0.aenv.dec", 0.01));
            QVERIFY(longHold->setParameter("pad0.aenv.dec", 0.01));
            QVERIFY(shortHold->setParameter("pad0.aenv.hold", 0.0));
            QVERIFY(longHold->setParameter("pad0.aenv.hold", 0.05));
            QVERIFY(std::abs(longHold->sampler().padParams(0).holdSec - 0.05f) < 1e-5f);
            const auto outShort = renderMs(*shortHold, 2400);  // 50 ms
            const auto outLong = renderMs(*longHold, 2400);
            // At 20..40 ms (frames 960..1920): shortHold finished at 10 ms; longHold still at full hold.
            QCOMPARE(peakAbs(outShort, 960, 960), 0.0f);
            QVERIFY2(rmsMono(outLong, 960, 960) > 0.05, "pad0.aenv.hold did not sustain audio");
        }

        // 3) pad0.aenv.curve (0 = linear, 1 = exponential): exponential decays faster at midpoint.
        {
            auto lin = makeProc();
            auto exp = makeProc();
            QVERIFY(lin->setParameter("pad0.aenv.hold", 0.0));
            QVERIFY(exp->setParameter("pad0.aenv.hold", 0.0));
            QVERIFY(lin->setParameter("pad0.aenv.dec", 0.08));
            QVERIFY(exp->setParameter("pad0.aenv.dec", 0.08));
            QVERIFY(lin->setParameter("pad0.aenv.curve", 0.0));
            QVERIFY(exp->setParameter("pad0.aenv.curve", 1.0));
            QVERIFY(std::abs(exp->sampler().padParams(0).decayCurve - 1.0f) < 1e-5f);
            const auto outLin = renderMs(*lin, 3840);
            const auto outExp = renderMs(*exp, 3840);
            // At 40..60 ms (half-way through 80 ms decay), linear envelope (~0.375) >> exp envelope (~0.06).
            const double linMid = rmsMono(outLin, 1920, 960);
            const double expMid = rmsMono(outExp, 1920, 960);
            QVERIFY(linMid > 0.02);
            QVERIFY2(expMid < linMid * 0.4,
                     qPrintable(QString("pad0.aenv.curve did not steepen decay: exp=%1 lin=%2").arg(expMid).arg(linMid)));
        }

        // 4) pad0.v2l (velocity to level, 0..1): at velocity ~0.25, v2l=0 renders ~4x louder than v2l=1.
        {
            auto fullSens = makeProc(32);  // 32 / 127 = 0.252
            auto noSens = makeProc(32);
            QVERIFY(fullSens->setParameter("pad0.v2l", 1.0));
            QVERIFY(noSens->setParameter("pad0.v2l", 0.0));
            QVERIFY(std::abs(noSens->sampler().padParams(0).velocityToLevel - 0.0f) < 1e-5f);
            const auto outSens = renderMs(*fullSens, 1024);
            const auto outFixed = renderMs(*noSens, 1024);
            const double rmsSens = rmsMono(outSens, 0, 1024);
            const double rmsFixed = rmsMono(outFixed, 0, 1024);
            QVERIFY(rmsFixed > 0.05);
            const double ratio = rmsSens / rmsFixed;
            const double expected = 32.0 / 127.0;
            QVERIFY2(std::abs(ratio - expected) < 0.02,
                     qPrintable(QString("pad0.v2l did not scale velocity: ratio=%1 expected=%2").arg(ratio).arg(expected)));
        }

        // 5) pad0.lvl, pad0.pan, and rejection of unsupported / non-finite targets.
        {
            auto p = makeProc();
            QVERIFY(p->setParameter("pad0.lvl", 0.5));
            QVERIFY(p->setParameter("pad0.pan", -1.0));
            const auto out = renderMs(*p, 512);
            double lPeak = 0.0, rPeak = 0.0;
            for (std::size_t f = 0; f < 512; ++f) {
                lPeak = std::max(lPeak, static_cast<double>(std::abs(out[f * 2])));
                rPeak = std::max(rPeak, static_cast<double>(std::abs(out[f * 2 + 1])));
            }
            QVERIFY(lPeak > 0.01);
            QVERIFY(rPeak < 1e-6);
            QVERIFY(!p->setParameter("pad0.aenv.att", std::numeric_limits<double>::quiet_NaN()));
            QVERIFY(!p->setParameter("pad0.flt.cut", 1000.0));
        }
    }
};

QTEST_MAIN(TestDrumSampler)
#include "tst_drumsampler.moc"
