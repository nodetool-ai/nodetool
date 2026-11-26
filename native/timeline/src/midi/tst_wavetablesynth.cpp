// Tests for nt::midi::WavetableSynth, WavetableTables, WavetablePresets,
// WavetableSynthProcessor, and WavetableEdits.
//
// Covers:
// 1. Top-octave sawtooth alias energy bound at 44.1 kHz
// 2. Unison stereo width (mono vs 7-voice stereo spread)
// 3. ZDF SVF filter cutoff response (LP12/LP24/HP12/HP24/BP12/BP24), resonance, key track, oversampled drive
// 4. Amp & Mod ADSR envelope timings across 44.1 / 48 / 96 kHz
// 5. Glide time convergence (mono & poly)
// 6. Voice stealing without clicks (declick fade on 16-voice saturation)
// 7. LFO tempo-sync & 3 fixed destinations (pitch, table position, cutoff)
// 8. Velocity to amp & cutoff, pitch bend, mod wheel, sub oscillator & noise
// 9. Sample-accurate MIDI event timing
// 10. Curated factory preset round trip (JSON serialize/deserialize + audio render)
// 11. Zero audio-thread heap allocations (TestAllocationCounter.h)
// 12. Denormal / NaN / Inf safety
// 13. CPU bound: 16 voices x 7 unison x 512 frames well under real time
// 14. WavetableSynthProcessor (BlockProcessor contract: MIDI stream, seek, automation, zero alloc)
// 15. WavetableEdits (wavetable.setPreset, wavetable.setParams)

#include "../../tests/RequireValue.h"
#include "app/EditRegistry.h"
#include "audio/Mixer.h"
#include "audio/TestAllocationCounter.h"
#include "midi/WavetableEdits.h"
#include "midi/WavetablePresets.h"
#include "midi/WavetableSynth.h"
#include "midi/WavetableTables.h"
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

double rmsLeft(std::span<const float> stereo, std::size_t startFrame, std::size_t frameCount) {
    const std::size_t end = std::min(stereo.size() / 2, startFrame + frameCount);
    if (end <= startFrame) return 0.0;
    double sum = 0.0;
    for (std::size_t f = startFrame; f < end; ++f) {
        const double v = static_cast<double>(stereo[f * 2]);
        sum += v * v;
    }
    return std::sqrt(sum / static_cast<double>(end - startFrame));
}

double rmsMono(std::span<const float> stereo, std::size_t startFrame, std::size_t frameCount) {
    const std::size_t end = std::min(stereo.size() / 2, startFrame + frameCount);
    if (end <= startFrame) return 0.0;
    double sum = 0.0;
    for (std::size_t f = startFrame; f < end; ++f) {
        const double m = 0.5 * (static_cast<double>(stereo[f * 2]) + static_cast<double>(stereo[f * 2 + 1]));
        sum += m * m;
    }
    return std::sqrt(sum / static_cast<double>(end - startFrame));
}

double rmsSide(std::span<const float> stereo, std::size_t startFrame, std::size_t frameCount) {
    const std::size_t end = std::min(stereo.size() / 2, startFrame + frameCount);
    if (end <= startFrame) return 0.0;
    double sum = 0.0;
    for (std::size_t f = startFrame; f < end; ++f) {
        const double s = 0.5 * (static_cast<double>(stereo[f * 2]) - static_cast<double>(stereo[f * 2 + 1]));
        sum += s * s;
    }
    return std::sqrt(sum / static_cast<double>(end - startFrame));
}

float peakAbs(std::span<const float> stereo, std::size_t startFrame, std::size_t frameCount) {
    float peak = 0.0f;
    const std::size_t end = std::min(stereo.size() / 2, startFrame + frameCount);
    for (std::size_t f = startFrame; f < end; ++f) {
        peak = std::max(peak, std::abs(stereo[f * 2]));
        peak = std::max(peak, std::abs(stereo[f * 2 + 1]));
    }
    return peak;
}

// Estimates fundamental frequency in Hz from positive-going zero crossings of left channel.
double estimateZeroCrossingHz(std::span<const float> stereo, std::size_t startFrame, std::size_t frameCount,
                              double sampleRate) {
    const std::size_t end = std::min(stereo.size() / 2, startFrame + frameCount);
    double firstCross = -1.0;
    double lastCross = -1.0;
    int crossings = 0;
    for (std::size_t f = startFrame + 1; f < end; ++f) {
        const double a = static_cast<double>(stereo[(f - 1) * 2]);
        const double b = static_cast<double>(stereo[f * 2]);
        if (a <= 0.0 && b > 0.0) {
            const double frac = (b - a) > 1e-12 ? (-a / (b - a)) : 0.0;
            const double pos = static_cast<double>(f - 1) + frac;
            if (firstCross < 0.0) firstCross = pos;
            lastCross = pos;
            ++crossings;
        }
    }
    if (crossings < 2 || lastCross <= firstCross) return 0.0;
    const double avgPeriod = (lastCross - firstCross) / static_cast<double>(crossings - 1);
    return sampleRate / avgPeriod;
}

// Measures energy at target frequency bin via Hann-windowed Goertzel/DFT magnitude squared.
double dftBandEnergy(std::span<const float> mono, double sampleRate, double freqHz) {
    const std::size_t n = mono.size();
    if (n == 0) return 0.0;
    const double w = 2.0 * std::numbers::pi * freqHz / sampleRate;
    double re = 0.0;
    double im = 0.0;
    for (std::size_t i = 0; i < n; ++i) {
        const double win = 0.5 - 0.5 * std::cos(2.0 * std::numbers::pi * static_cast<double>(i) / static_cast<double>(n));
        const double x = static_cast<double>(mono[i]) * win;
        re += x * std::cos(w * static_cast<double>(i));
        im -= x * std::sin(w * static_cast<double>(i));
    }
    return (re * re + im * im) / (static_cast<double>(n) * static_cast<double>(n));
}

}  // namespace

class TestWavetableSynth : public QObject {
    Q_OBJECT

private slots:
    // 1. Top-octave sawtooth at 44.1 kHz must have aliased energy well below -60 dB.
    void topOctaveSawAliasBoundAt44100() {
        constexpr double kRate = 44100.0;
        constexpr int kNote = 108;  // C8 = 4186.009 Hz (top octave of 88-key piano)
        const double f0 = 440.0 * std::pow(2.0, (kNote - 69) / 12.0);

        WavetableSynth synth;
        WavetableSynthParams p;
        p.oscA.on = true;
        p.oscA.table = WavetableId::Prime;
        p.oscA.position = 2.0f / 3.0f;  // Exact saw frame in PRIME (0=sine, 1/3=tri, 2/3=saw, 1=sqr)
        p.oscA.unison = 1;
        p.oscA.level = 1.0f;
        p.oscB.on = false;
        p.filter.on = false;
        p.ampEnv = {0.001f, 0.01f, 1.0f, 0.05f};
        p.masterVolume = 1.0f;
        synth.setParams(p);
        synth.prepare(kRate);

        // Settle attack for 2048 frames, then capture 4096 frames for high-res FFT.
        constexpr std::size_t kWarmup = 2048;
        constexpr std::size_t kFftN = 4096;
        std::vector<float> warm(kWarmup * 2, 0.0f);
        synth.noteOn(kNote, 1.0f);
        synth.renderBlock(warm);

        std::vector<float> cap(kFftN * 2, 0.0f);
        synth.renderBlock(cap);

        std::vector<double> re(kFftN, 0.0), im(kFftN, 0.0);
        for (std::size_t i = 0; i < kFftN; ++i) {
            const double win = 0.42 - 0.5 * std::cos(2.0 * std::numbers::pi * static_cast<double>(i) / kFftN) +
                               0.08 * std::cos(4.0 * std::numbers::pi * static_cast<double>(i) / kFftN);  // Blackman
            re[i] = static_cast<double>(cap[i * 2]) * win;
        }
        wavetableFft(re.data(), im.data(), static_cast<int>(kFftN), false);

        const double binHz = kRate / static_cast<double>(kFftN);
        double harmonicEnergy = 0.0;
        double aliasEnergy = 0.0;
        for (std::size_t k = 2; k < kFftN / 2; ++k) {
            const double freq = static_cast<double>(k) * binHz;
            const double mag2 = re[k] * re[k] + im[k] * im[k];
            // Check if bin falls within +/- 5 bins of any valid harmonic m * f0 < Nyquist.
            bool nearHarmonic = false;
            for (int h = 1; h * f0 < kRate * 0.5; ++h) {
                if (std::abs(freq - h * f0) <= 5.0 * binHz) {
                    nearHarmonic = true;
                    break;
                }
            }
            if (nearHarmonic) {
                harmonicEnergy += mag2;
            } else {
                aliasEnergy += mag2;
            }
        }
        QVERIFY2(harmonicEnergy > 1e-3, "Top-octave saw must produce strong fundamental/harmonic energy");
        const double aliasDb = 10.0 * std::log10(std::max(aliasEnergy, 1e-20) / harmonicEnergy);
        std::fprintf(stderr, "[WT1] C8 (4186 Hz) saw alias energy @ 44.1 kHz: %.2f dB\n", aliasDb);
        QVERIFY2(aliasDb < -60.0, qPrintable(QString("Alias energy too high: %1 dB").arg(aliasDb)));
    }

    // 2. Unison stereo width: 7 voices + spread produces rich stereo side signal; mono produces zero side.
    void unisonStereoWidth() {
        WavetableSynth synth;
        WavetableSynthParams p;
        p.oscA.on = true;
        p.oscA.table = WavetableId::Prime;
        p.oscA.position = 0.66f;
        p.oscA.level = 0.9f;
        p.oscA.pan = 0.0f;
        p.oscB.on = false;
        p.filter.on = false;
        p.ampEnv = {0.002f, 0.05f, 1.0f, 0.05f};
        p.masterVolume = 0.9f;

        // Mono (unison = 1, pan = 0): L == R.
        p.oscA.unison = 1;
        p.oscA.detune = 0.35f;
        p.oscA.spread = 1.0f;
        synth.setParams(p);
        synth.prepare(48000.0);
        std::vector<float> monoBuf(2048 * 2, 0.0f);
        synth.noteOn(60, 1.0f);
        synth.renderBlock(monoBuf);
        const double monoSide = rmsSide(monoBuf, 256, 1536);
        const double monoMid = rmsMono(monoBuf, 256, 1536);
        QVERIFY(monoMid > 0.05);
        QVERIFY2(monoSide < 1e-6, qPrintable(QString("Expected zero side for unison=1, got %1").arg(monoSide)));

        // Unison = 7, spread = 0: still mono.
        p.oscA.unison = 7;
        p.oscA.spread = 0.0f;
        synth.setParams(p);
        synth.reset();
        std::vector<float> zeroSpreadBuf(2048 * 2, 0.0f);
        synth.noteOn(60, 1.0f);
        synth.renderBlock(zeroSpreadBuf);
        QVERIFY(rmsSide(zeroSpreadBuf, 256, 1536) < 1e-5);

        // Unison = 7, spread = 1.0, detune = 0.4: wide stereo side signal.
        p.oscA.unison = 7;
        p.oscA.detune = 0.4f;
        p.oscA.spread = 1.0f;
        synth.setParams(p);
        synth.reset();
        std::vector<float> wideBuf(4096 * 2, 0.0f);
        synth.noteOn(60, 1.0f);
        synth.renderBlock(wideBuf);
        const double wideMid = rmsMono(wideBuf, 512, 3072);
        const double wideSide = rmsSide(wideBuf, 512, 3072);
        const double widthRatio = wideSide / std::max(wideMid, 1e-9);
        QVERIFY2(widthRatio > 0.25, qPrintable(QString("Expected stereo width ratio > 0.25, got %1").arg(widthRatio)));
    }

    // 3. ZDF SVF filter cutoff response (LP12/LP24/HP12/HP24/BP12/BP24), resonance, key track, oversampled drive.
    void filterCutoffResponseResonanceKeyTrackAndDrive() {
        auto renderSaw = [](FilterType ftype, float cutoffHz, float res, float drive, float keyTrack, int note) {
            WavetableSynth synth;
            WavetableSynthParams p;
            p.oscA.on = true;
            p.oscA.table = WavetableId::Prime;
            p.oscA.position = 2.0f / 3.0f;
            p.oscA.unison = 1;
            p.oscA.level = 0.9f;
            p.oscB.on = false;
            p.filter.on = (ftype != FilterType::None);
            p.filter.type = ftype;
            p.filter.cutoffHz = cutoffHz;
            p.filter.resonance = res;
            p.filter.drive = drive;
            p.filter.keyTrack = keyTrack;
            p.ampEnv = {0.002f, 0.02f, 1.0f, 0.05f};
            p.masterVolume = 1.0f;
            synth.setParams(p);
            synth.prepare(48000.0);
            std::vector<float> buf(4096 * 2, 0.0f);
            synth.noteOn(note, 1.0f);
            synth.renderBlock(buf);
            std::vector<float> mono(2048);
            for (std::size_t i = 0; i < 2048; ++i) {
                mono[i] = buf[(2048 + i) * 2];
            }
            return mono;
        };

        // Low-pass: 100 Hz saw (~130.8 Hz C3) passes fundamental, attenuates high harmonics (> 2 kHz).
        const auto openSaw = renderSaw(FilterType::None, 20000.0f, 0.0f, 0.0f, 0.0f, 48);
        const auto lp12Saw = renderSaw(FilterType::Lp12, 400.0f, 0.0f, 0.0f, 0.0f, 48);
        const auto lp24Saw = renderSaw(FilterType::Lp24, 400.0f, 0.0f, 0.0f, 0.0f, 48);
        const double f1 = 440.0 * std::pow(2.0, (48 - 69) / 12.0);  // ~130.81 Hz
        const double highHarm = f1 * 16.0;                           // ~2093 Hz (> 2 octaves above 400 Hz)
        const double openHi = dftBandEnergy(openSaw, 48000.0, highHarm);
        const double lp12Hi = dftBandEnergy(lp12Saw, 48000.0, highHarm);
        const double lp24Hi = dftBandEnergy(lp24Saw, 48000.0, highHarm);
        QVERIFY2(lp12Hi < openHi * 0.05, "LP12 must strongly attenuate >2 octaves above cutoff");
        QVERIFY2(lp24Hi < lp12Hi * 0.15, "LP24 must attenuate steeper than LP12");

        // High-pass: 1500 Hz cutoff attenuates fundamental (~130.8 Hz) while passing ~2093 Hz.
        const auto hp12Saw = renderSaw(FilterType::Hp12, 1500.0f, 0.0f, 0.0f, 0.0f, 48);
        const auto hp24Saw = renderSaw(FilterType::Hp24, 1500.0f, 0.0f, 0.0f, 0.0f, 48);
        const double openLo = dftBandEnergy(openSaw, 48000.0, f1);
        const double hp12Lo = dftBandEnergy(hp12Saw, 48000.0, f1);
        const double hp24Lo = dftBandEnergy(hp24Saw, 48000.0, f1);
        QVERIFY2(hp12Lo < openLo * 0.02, "HP12 must strongly attenuate fundamental below cutoff");
        QVERIFY2(hp24Lo < hp12Lo * 0.1, "HP24 must attenuate fundamental steeper than HP12");

        // Band-pass: 1046.5 Hz cutoff attenuates both 130.8 Hz and 5232 Hz relative to passband gain.
        const auto bp12Saw = renderSaw(FilterType::Bp12, 1046.5f, 0.35f, 0.0f, 0.0f, 48);
        const auto bp24Saw = renderSaw(FilterType::Bp24, 1046.5f, 0.35f, 0.0f, 0.0f, 48);
        const double openMid = dftBandEnergy(openSaw, 48000.0, f1 * 8.0);
        const double openTop = dftBandEnergy(openSaw, 48000.0, f1 * 40.0);
        const double bpMidGain = dftBandEnergy(bp12Saw, 48000.0, f1 * 8.0) / std::max(openMid, 1e-12);
        const double bpLoGain = dftBandEnergy(bp12Saw, 48000.0, f1) / std::max(openLo, 1e-12);
        const double bpTopGain = dftBandEnergy(bp12Saw, 48000.0, f1 * 40.0) / std::max(openTop, 1e-12);
        const double bp24LoGain = dftBandEnergy(bp24Saw, 48000.0, f1) / std::max(openLo, 1e-12);
        QVERIFY2(bpMidGain > bpLoGain * 10.0, "BP12 passband gain must far exceed low stopband");
        QVERIFY2(bpMidGain > bpTopGain * 5.0, "BP12 passband gain must far exceed high stopband");
        QVERIFY2(bp24LoGain < bpLoGain * 0.25, "BP24 must reject out-of-band more steeply than BP12");

        // Resonance: high res boosts energy near cutoff.
        const auto resLow = renderSaw(FilterType::Lp24, 1046.5f, 0.0f, 0.0f, 0.0f, 48);
        const auto resHigh = renderSaw(FilterType::Lp24, 1046.5f, 0.85f, 0.0f, 0.0f, 48);
        QVERIFY2(dftBandEnergy(resHigh, 48000.0, f1 * 8.0) > dftBandEnergy(resLow, 48000.0, f1 * 8.0) * 4.0,
                 "High resonance must boost energy near filter cutoff");

        // Key tracking: high note (MIDI 84 = C6, +2 octaves above C4) passes brighter with keyTrack=1 than 0.
        const auto noTrack = renderSaw(FilterType::Lp24, 500.0f, 0.0f, 0.0f, 0.0f, 84);
        const auto fullTrack = renderSaw(FilterType::Lp24, 500.0f, 0.0f, 0.0f, 1.0f, 84);
        const double c6Freq = 440.0 * std::pow(2.0, (84 - 69) / 12.0);
        QVERIFY2(dftBandEnergy(fullTrack, 48000.0, c6Freq) > dftBandEnergy(noTrack, 48000.0, c6Freq) * 5.0,
                 "Key tracking must raise cutoff for higher notes");

        // Oversampled drive: sine wave through high drive adds odd harmonics (3rd harmonic) without NaN.
        WavetableSynth driveSynth;
        WavetableSynthParams dp;
        dp.oscA.on = true;
        dp.oscA.table = WavetableId::Prime;
        dp.oscA.position = 0.0f;  // Pure sine
        dp.oscA.level = 1.0f;
        dp.filter.on = true;
        dp.filter.type = FilterType::Lp12;
        dp.filter.cutoffHz = 18000.0f;
        dp.filter.resonance = 0.0f;
        dp.filter.drive = 0.0f;
        dp.ampEnv = {0.001f, 0.01f, 1.0f, 0.05f};
        dp.masterVolume = 1.0f;
        driveSynth.setParams(dp);
        driveSynth.prepare(48000.0);
        std::vector<float> cleanOut(4096 * 2, 0.0f);
        driveSynth.noteOn(69, 1.0f);  // 440 Hz
        driveSynth.renderBlock(cleanOut);

        dp.filter.drive = 0.9f;
        driveSynth.setParams(dp);
        driveSynth.reset();
        std::vector<float> drivenOut(4096 * 2, 0.0f);
        driveSynth.noteOn(69, 1.0f);
        driveSynth.renderBlock(drivenOut);

        std::vector<float> cleanMono(2048), drivenMono(2048);
        for (std::size_t i = 0; i < 2048; ++i) {
            cleanMono[i] = cleanOut[(2048 + i) * 2];
            drivenMono[i] = drivenOut[(2048 + i) * 2];
        }
        const double h3Clean = dftBandEnergy(cleanMono, 48000.0, 1320.0);
        const double h3Driven = dftBandEnergy(drivenMono, 48000.0, 1320.0);
        QVERIFY2(h3Driven > h3Clean * 20.0 + 1e-6, "Oversampled drive must generate 3rd harmonic saturation on sine");
    }

    // 4. ADSR timings across 44.1 / 48 / 96 kHz.
    void adsrTimingsAcrossSampleRates() {
        for (double sr : {44100.0, 48000.0, 96000.0}) {
            WavetableSynth synth;
            WavetableSynthParams p;
            p.oscA.on = true;
            p.oscA.table = WavetableId::Prime;
            p.oscA.position = 0.0f;  // Pure sine for smooth RMS measurement
            p.oscA.level = 1.0f;
            p.oscB.on = false;
            p.filter.on = false;
            p.ampEnv = {0.05f, 0.15f, 0.5f, 0.12f};  // 50ms A, 150ms D, 0.5 S, 120ms R
            p.masterVolume = 1.0f;
            synth.setParams(p);
            synth.prepare(sr);

            // Render 600 ms with noteOff at 350 ms.
            const std::size_t totalFrames = static_cast<std::size_t>(sr * 0.65);
            const int noteOffFrame = static_cast<int>(sr * 0.35);
            std::vector<float> buf(totalFrames * 2, 0.0f);
            const std::array<WavetableSynth::MidiEvent, 2> events{{
                {0, WavetableSynth::MidiEvent::Type::NoteOn, 69, 1.0f, 1.0f},
                {noteOffFrame, WavetableSynth::MidiEvent::Type::NoteOff, 69, 0.0f, 1.0f},
            }};
            synth.renderBlock(buf, events);

            const std::size_t win = static_cast<std::size_t>(sr * 0.01);  // 10 ms RMS window
            const double earlyAtk = rmsLeft(buf, static_cast<std::size_t>(sr * 0.005), win);
            const double peakAtk = rmsLeft(buf, static_cast<std::size_t>(sr * 0.055), win);
            const double sustain = rmsLeft(buf, static_cast<std::size_t>(sr * 0.30), win);
            const double midRel = rmsLeft(buf, static_cast<std::size_t>(sr * 0.41), win);
            const double lateRel = rmsLeft(buf, static_cast<std::size_t>(sr * 0.60), win);

            // Attack rises significantly from 5 ms to 55 ms.
            QVERIFY2(peakAtk > earlyAtk * 1.8, qPrintable(QString("sr=%1 attack did not rise").arg(sr)));
            // Sustain settles near 0.5 of peak.
            const double susRatio = sustain / std::max(peakAtk, 1e-9);
            QVERIFY2(susRatio > 0.35 && susRatio < 0.68,
                     qPrintable(QString("sr=%1 sustain ratio=%2 out of expected range").arg(sr).arg(susRatio)));
            // Release decays monotonically and reaches near silence well after release time.
            QVERIFY2(midRel < sustain * 0.55, qPrintable(QString("sr=%1 release too slow").arg(sr)));
            QVERIFY2(lateRel < sustain * 0.02, qPrintable(QString("sr=%1 tail did not decay").arg(sr)));
        }
    }

    // 5. Glide time convergence (mono legato glide).
    void glideTimeConvergence() {
        constexpr double kRate = 48000.0;
        WavetableSynth synth;
        WavetableSynthParams p;
        p.oscA.on = true;
        p.oscA.table = WavetableId::Prime;
        p.oscA.position = 0.0f;  // Sine for clean zero-crossing pitch tracking
        p.oscA.level = 1.0f;
        p.filter.on = false;
        p.ampEnv = {0.002f, 0.01f, 1.0f, 0.05f};
        p.mono = true;
        p.legato = true;
        p.glideSec = 0.20f;  // 200 ms glide
        p.masterVolume = 1.0f;
        synth.setParams(p);
        synth.prepare(kRate);

        // Start on A4 (69, 440 Hz), then trigger A5 (81, 880 Hz) while holding A4.
        std::vector<float> intro(2400 * 2, 0.0f);  // 50 ms
        synth.noteOn(69, 1.0f);
        synth.renderBlock(intro);
        const double startHz = estimateZeroCrossingHz(intro, 480, 1800, kRate);
        QVERIFY2(std::abs(startHz - 440.0) < 15.0, qPrintable(QString("Expected ~440 Hz, got %1").arg(startHz)));

        synth.noteOn(81, 1.0f);
        // After 50 ms of a 200 ms glide, pitch must be strictly between 69 and 81 (mid-glide).
        std::vector<float> mid(2400 * 2, 0.0f);
        synth.renderBlock(mid);
        const double midPitch = synth.newestVoicePitch();
        QVERIFY2(midPitch > 71.0 && midPitch < 79.5,
                 qPrintable(QString("Expected mid-glide pitch in (71, 79.5), got %1").arg(midPitch)));

        // After another 450 ms (total 500 ms >> 200 ms glide), pitch converges to A5 (880 Hz).
        std::vector<float> tail(21600 * 2, 0.0f);
        synth.renderBlock(tail);
        const double endHz = estimateZeroCrossingHz(tail, 16800, 4096, kRate);
        QVERIFY2(std::abs(endHz - 880.0) < 15.0, qPrintable(QString("Expected ~880 Hz after glide, got %1").arg(endHz)));
    }

    // 6. Voice stealing without clicks (per-voice 4ms declick fade + amp slew).
    void voiceStealingWithoutClicks() {
        constexpr double kRate = 48000.0;
        WavetableSynth synth;
        WavetableSynthParams p;
        p.oscA.on = true;
        p.oscA.table = WavetableId::Prime;
        p.oscA.position = 0.0f;  // Pure sine (smooth natural derivative)
        p.oscA.level = 0.7f;
        p.filter.on = false;
        p.ampEnv = {0.005f, 0.05f, 0.9f, 0.5f};
        p.mono = false;
        p.masterVolume = 0.6f;
        synth.setParams(p);
        synth.prepare(kRate);

        // Measure single-voice peak with identical parameters so the steal-step bound
        // is strictly tighter than a single-voice hard-kill discontinuity.
        synth.noteOn(45, 0.9f);
        std::vector<float> singleBuf(2048 * 2, 0.0f);
        synth.renderBlock(singleBuf);
        const float singleVoicePeak = peakAbs(singleBuf, 512, 1536);
        QVERIFY(singleVoicePeak > 0.02f);
        synth.reset();

        // Fill all 16 voices with low notes (110..260 Hz) so a hard kill would cause a large step.
        for (int i = 0; i < WavetableSynth::kMaxVoices; ++i) {
            synth.noteOn(45 + i, 0.9f);
        }
        std::vector<float> warm(2048 * 2, 0.0f);
        synth.renderBlock(warm);
        QCOMPARE(synth.activeVoiceCount(), WavetableSynth::kMaxVoices);

        // Steal 8 voices mid-buffer across successive 128-frame offsets and track max sample-to-sample step.
        constexpr std::size_t kFrames = 2048;
        std::vector<float> stealBuf(kFrames * 2, 0.0f);
        std::vector<WavetableSynth::MidiEvent> events;
        for (int i = 0; i < 8; ++i) {
            events.push_back({128 + i * 160, WavetableSynth::MidiEvent::Type::NoteOn, 62 + i, 0.9f, 1.0f});
        }
        synth.renderBlock(stealBuf, events);

        float maxStep = 0.0f;
        float prevL = warm[(warm.size() / 2 - 1) * 2];
        for (std::size_t f = 0; f < kFrames; ++f) {
            const float curL = stealBuf[f * 2];
            QVERIFY(std::isfinite(curL));
            maxStep = std::max(maxStep, std::abs(curL - prevL));
            prevL = curL;
        }
        // Must stay strictly below a single voice's peak amplitude (hard-kill would step ~singleVoicePeak).
        const float maxAllowedStep = singleVoicePeak * 0.70f;
        QVERIFY2(maxStep < maxAllowedStep,
                 qPrintable(QString("Voice steal click detected: maxStep=%1 >= %2 (singleVoicePeak=%3)")
                                .arg(maxStep)
                                .arg(maxAllowedStep)
                                .arg(singleVoicePeak)));
        QVERIFY(synth.activeVoiceCount() <= WavetableSynth::kMaxVoices);
    }

    // 7. LFO tempo-sync & 3 fixed destinations (pitch, table position, cutoff).
    void lfoTempoSyncAndThreeDestinations() {
        constexpr double kRate = 48000.0;
        // 7a: LFO -> cutoff (tempo-synced at 120 BPM, 1/4 note = 2 Hz).
        {
            WavetableSynth synth;
            WavetableSynthParams p;
            p.oscA.on = true;
            p.oscA.table = WavetableId::Prime;
            p.oscA.position = 0.66f;
            p.oscA.level = 0.9f;
            p.filter.on = true;
            p.filter.type = FilterType::Lp24;
            p.filter.cutoffHz = 600.0f;
            p.filter.resonance = 0.1f;
            p.ampEnv = {0.002f, 0.01f, 1.0f, 0.05f};
            p.lfo.shape = LfoShape::Sine;
            p.lfo.tempoSync = true;
            p.lfo.syncDiv = 2;  // 1/4 note -> 1 cycle/beat = 2 Hz at 120 BPM
            p.lfo.toCutoff = 0.6f;
            p.masterVolume = 1.0f;
            synth.setParams(p);
            synth.prepare(kRate);
            synth.setTempo(120.0, 0.0, true);  // beat 0 -> sin(0) = 0, beat 0.25 (125 ms) -> sin(pi/2) = +1, beat 0.75 (375 ms) -> -1

            std::vector<float> buf(24000 * 2, 0.0f);  // 500 ms = 1 full LFO cycle
            synth.noteOn(48, 1.0f);
            synth.renderBlock(buf);

            // At 125 ms (peak of sine LFO), cutoff is high -> high RMS. At 375 ms (trough), cutoff is low -> low RMS.
            const double rmsPeak = rmsLeft(buf, 5500, 1000);
            const double rmsTrough = rmsLeft(buf, 17500, 1000);
            QVERIFY2(rmsPeak > rmsTrough * 2.0,
                     qPrintable(QString("Tempo-synced LFO->cutoff failed: peak=%1 trough=%2").arg(rmsPeak).arg(rmsTrough)));
        }
        // 7b: LFO -> pitch.
        {
            WavetableSynth synth;
            WavetableSynthParams p;
            p.oscA.on = true;
            p.oscA.table = WavetableId::Prime;
            p.oscA.position = 0.0f;
            p.oscA.level = 1.0f;
            p.filter.on = false;
            p.ampEnv = {0.002f, 0.01f, 1.0f, 0.05f};
            p.lfo.shape = LfoShape::Square;
            p.lfo.tempoSync = false;
            p.lfo.rateHz = 2.0f;  // 250 ms high (+1), 250 ms low (-1)
            p.lfo.retrig = true;
            p.lfo.toPitch = 0.25f;  // +/- 3 semitones
            p.masterVolume = 1.0f;
            synth.setParams(p);
            synth.prepare(kRate);

            std::vector<float> buf(24000 * 2, 0.0f);
            synth.noteOn(69, 1.0f);
            synth.renderBlock(buf);
            const double hiHz = estimateZeroCrossingHz(buf, 2000, 6000, kRate);
            const double loHz = estimateZeroCrossingHz(buf, 14000, 6000, kRate);
            QVERIFY2(hiHz > loHz * 1.25, qPrintable(QString("LFO->pitch failed: hi=%1 lo=%2").arg(hiHz).arg(loHz)));
        }
        // 7c: LFO -> table position (PRIME pos 0.35 +/- 0.35 moves between sine and saw).
        {
            WavetableSynth synth;
            WavetableSynthParams p;
            p.oscA.on = true;
            p.oscA.table = WavetableId::Prime;
            p.oscA.position = 0.35f;
            p.oscA.level = 1.0f;
            p.filter.on = false;
            p.ampEnv = {0.002f, 0.01f, 1.0f, 0.05f};
            p.lfo.shape = LfoShape::Square;
            p.lfo.rateHz = 2.0f;
            p.lfo.retrig = true;
            p.lfo.toPos = 0.35f;  // +0.35 -> 0.70 (saw, bright); -0.35 -> 0.0 (sine, pure)
            p.masterVolume = 1.0f;
            synth.setParams(p);
            synth.prepare(kRate);

            std::vector<float> buf(24000 * 2, 0.0f);
            synth.noteOn(60, 1.0f);
            synth.renderBlock(buf);
            std::vector<float> hiHalf(2048), loHalf(2048);
            for (std::size_t i = 0; i < 2048; ++i) {
                hiHalf[i] = buf[(4000 + i) * 2];
                loHalf[i] = buf[(16000 + i) * 2];
            }
            const double f0 = 440.0 * std::pow(2.0, (60 - 69) / 12.0);
            const double hiH2 = dftBandEnergy(hiHalf, kRate, f0 * 2.0);
            const double loH2 = dftBandEnergy(loHalf, kRate, f0 * 2.0);
            QVERIFY2(hiH2 > loH2 * 10.0 + 1e-6, "LFO->table pos must morph harmonic content");
        }
    }

    // 8. Velocity to amp & cutoff, pitch bend, mod wheel, sub & noise.
    void velocityPitchBendModWheelSubAndNoise() {
        constexpr double kRate = 48000.0;
        // Velocity -> amp & cutoff
        {
            WavetableSynth synth;
            WavetableSynthParams p;
            p.oscA.on = true;
            p.oscA.table = WavetableId::Prime;
            p.oscA.position = 0.66f;
            p.oscA.level = 1.0f;
            p.filter.on = true;
            p.filter.type = FilterType::Lp24;
            p.filter.cutoffHz = 300.0f;
            p.velToAmp = 1.0f;
            p.velToCutoff = 0.6f;
            p.ampEnv = {0.002f, 0.01f, 1.0f, 0.05f};
            p.masterVolume = 1.0f;
            synth.setParams(p);
            synth.prepare(kRate);

            std::vector<float> soft(4096 * 2, 0.0f), loud(4096 * 2, 0.0f);
            synth.noteOn(48, 0.25f);
            synth.renderBlock(soft);
            synth.reset();
            synth.noteOn(48, 1.0f);
            synth.renderBlock(loud);
            QVERIFY(rmsLeft(loud, 1024, 2048) > rmsLeft(soft, 1024, 2048) * 2.5);
        }
        // Pitch bend (+1.0 with +/-2 semitone range shifts 440 Hz -> ~493.88 Hz)
        {
            WavetableSynth synth;
            WavetableSynthParams p;
            p.oscA.on = true;
            p.oscA.table = WavetableId::Prime;
            p.oscA.position = 0.0f;
            p.oscA.level = 1.0f;
            p.filter.on = false;
            p.pitchBendRange = 2.0f;
            p.ampEnv = {0.001f, 0.01f, 1.0f, 0.05f};
            p.masterVolume = 1.0f;
            synth.setParams(p);
            synth.prepare(kRate);

            std::vector<float> buf(4096 * 2, 0.0f);
            synth.setPitchBend(1.0f);
            synth.noteOn(69, 1.0f);
            synth.renderBlock(buf);
            const double hz = estimateZeroCrossingHz(buf, 1500, 2048, kRate);
            const double expected = 440.0 * std::pow(2.0, 2.0 / 12.0);
            QVERIFY2(std::abs(hz - expected) < 12.0, qPrintable(QString("Expected %1 Hz, got %2").arg(expected).arg(hz)));
        }
        // Mod wheel (CC 1) adds vibrato / filter motion
        {
            WavetableSynth synth;
            WavetableSynthParams p;
            p.oscA.on = true;
            p.oscA.table = WavetableId::Prime;
            p.oscA.position = 0.66f;
            p.oscA.level = 1.0f;
            p.filter.on = true;
            p.filter.type = FilterType::Lp24;
            p.filter.cutoffHz = 600.0f;
            p.lfo.shape = LfoShape::Sine;
            p.lfo.rateHz = 5.0f;
            p.lfo.retrig = true;
            p.ampEnv = {0.001f, 0.01f, 1.0f, 0.05f};
            p.masterVolume = 1.0f;
            synth.setParams(p);
            synth.prepare(kRate);

            std::vector<float> wheelOff(4096 * 2, 0.0f), wheelFull(4096 * 2, 0.0f);
            synth.setModWheel(0.0f);
            synth.noteOn(60, 1.0f);
            synth.renderBlock(wheelOff);

            synth.reset();
            synth.setModWheel(1.0f);
            synth.noteOn(60, 1.0f);
            synth.renderBlock(wheelFull);

            double diff = 0.0;
            for (std::size_t i = 0; i < wheelOff.size(); ++i) {
                diff += std::abs(wheelFull[i] - wheelOff[i]);
            }
            QVERIFY2(diff > 5.0, "Mod wheel must audibly modulate the voice");
        }
        // Sub oscillator & noise work independently when oscA/oscB are off
        {
            WavetableSynth synth;
            WavetableSynthParams p;
            p.oscA.on = false;
            p.oscB.on = false;
            p.sub.on = true;
            p.sub.shape = SubShape::Square;
            p.sub.octave = -1;
            p.sub.level = 0.8f;
            p.noise.on = false;
            p.filter.on = false;
            p.ampEnv = {0.001f, 0.01f, 1.0f, 0.05f};
            p.masterVolume = 1.0f;
            synth.setParams(p);
            synth.prepare(kRate);
            std::vector<float> subBuf(2048 * 2, 0.0f);
            synth.noteOn(69, 1.0f);  // sub -1 oct -> 220 Hz
            synth.renderBlock(subBuf);
            const double subHz = estimateZeroCrossingHz(subBuf, 512, 1400, kRate);
            QVERIFY2(std::abs(subHz - 220.0) < 12.0, qPrintable(QString("Expected 220 Hz sub, got %1").arg(subHz)));

            p.sub.on = false;
            p.noise.on = true;
            p.noise.type = NoiseType::Pink;
            p.noise.level = 0.8f;
            synth.setParams(p);
            synth.reset();
            std::vector<float> noiseBuf(2048 * 2, 0.0f);
            synth.noteOn(60, 1.0f);
            synth.renderBlock(noiseBuf);
            QVERIFY(rmsLeft(noiseBuf, 256, 1536) > 0.01);
        }
    }

    // 9. Sample-accurate MIDI event offset.
    void sampleAccurateMidiOffset() {
        WavetableSynth synth;
        WavetableSynthParams p;
        p.oscA.on = true;
        p.oscA.table = WavetableId::Prime;
        p.oscA.position = 0.66f;
        p.oscA.level = 1.0f;
        p.filter.on = false;
        p.ampEnv = {0.001f, 0.01f, 1.0f, 0.05f};
        p.masterVolume = 1.0f;
        synth.setParams(p);
        synth.prepare(48000.0);

        constexpr int kOffset = 173;
        std::vector<float> buf(512 * 2, 0.0f);
        const std::array<WavetableSynth::MidiEvent, 1> ev{{
            {kOffset, WavetableSynth::MidiEvent::Type::NoteOn, 60, 1.0f, 1.0f},
        }};
        synth.renderBlock(buf, ev);

        QCOMPARE(peakAbs(buf, 0, static_cast<std::size_t>(kOffset)), 0.0f);
        QVERIFY(peakAbs(buf, static_cast<std::size_t>(kOffset), 64) > 0.02f);
    }

    // 10. Curated factory presets: 16..24 presets, web IDs, exact JSON round-trip, all render audio.
    void presetRoundTripAndRender() {
        const auto& presets = factoryWavetablePresets();
        QVERIFY2(presets.size() >= 16 && presets.size() <= 24,
                 qPrintable(QString("Expected 16..24 presets, got %1").arg(presets.size())));
        QVERIFY(findWavetablePreset("wt1-init") != nullptr);
        QVERIFY(findWavetablePreset("wt1-acid-line") != nullptr);
        QVERIFY(findWavetablePreset("wt1-hyper-saw") != nullptr);
        QVERIFY(findWavetablePreset("wt1-reese-bass") != nullptr);

        WavetableSynth synth;
        synth.prepare(48000.0);
        std::vector<float> buf(2048 * 2, 0.0f);

        for (const auto& preset : presets) {
            QVERIFY(!preset.id.empty());
            QVERIFY(!preset.name.empty());
            QVERIFY(findWavetablePreset(preset.id) == &preset);

            const QJsonObject json = wavetableParamsToJson(preset.params, QString::fromUtf8(preset.id));
            QCOMPARE(json.value(u"type").toString(), QStringLiteral("wavetable"));
            QCOMPARE(json.value(u"preset").toString(), QString::fromUtf8(preset.id));

            const WavetableSynthParams roundTripped = wavetableParamsFromJson(json);
            QCOMPARE(roundTripped.oscA.table, preset.params.oscA.table);
            QVERIFY(std::abs(roundTripped.oscA.position - preset.params.oscA.position) < 1e-4f);
            QCOMPARE(roundTripped.oscA.unison, preset.params.oscA.unison);
            QVERIFY(std::abs(roundTripped.oscA.detune - preset.params.oscA.detune) < 1e-4f);
            QVERIFY(std::abs(roundTripped.oscA.spread - preset.params.oscA.spread) < 1e-4f);
            QCOMPARE(roundTripped.oscB.on, preset.params.oscB.on);
            QCOMPARE(roundTripped.oscB.table, preset.params.oscB.table);
            QCOMPARE(roundTripped.filter.on, preset.params.filter.on);
            QCOMPARE(roundTripped.filter.type, preset.params.filter.type);
            QVERIFY(std::abs(roundTripped.filter.cutoffHz - preset.params.filter.cutoffHz) < 1e-2f);
            QVERIFY(std::abs(roundTripped.filter.resonance - preset.params.filter.resonance) < 1e-4f);
            QVERIFY(std::abs(roundTripped.filter.drive - preset.params.filter.drive) < 1e-4f);
            QVERIFY(std::abs(roundTripped.ampEnv.attackSec - preset.params.ampEnv.attackSec) < 1e-4f);
            QVERIFY(std::abs(roundTripped.ampEnv.releaseSec - preset.params.ampEnv.releaseSec) < 1e-4f);
            QCOMPARE(roundTripped.lfo.shape, preset.params.lfo.shape);
            QCOMPARE(roundTripped.lfo.tempoSync, preset.params.lfo.tempoSync);
            QVERIFY(std::abs(roundTripped.lfo.toCutoff - preset.params.lfo.toCutoff) < 1e-4f);
            QCOMPARE(roundTripped.mono, preset.params.mono);
            QVERIFY(std::abs(roundTripped.glideSec - preset.params.glideSec) < 1e-4f);

            // Render audio and ensure every preset produces finite non-silent output.
            synth.setParams(roundTripped);
            synth.reset();
            std::fill(buf.begin(), buf.end(), 0.0f);
            synth.noteOn(60, 0.9f);
            synth.renderBlock(buf);
            float peak = 0.0f;
            for (float s : buf) {
                QVERIFY2(std::isfinite(s), qPrintable(QString("Non-finite sample in %1").arg(preset.id.data())));
                peak = std::max(peak, std::abs(s));
            }
            QVERIFY2(peak > 1e-4f, qPrintable(QString("Preset %1 rendered silent").arg(preset.id.data())));
        }
    }

    // 11. Zero audio-thread heap allocations (with TestAllocationCounter.h control check).
    void zeroAudioThreadAllocations() {
        QVERIFY2(nt::testing::countsAnAllocation(), "Allocation counter control must observe a heap allocation");

        WavetableSynth synth;
        if (const auto* preset = findWavetablePreset("wt1-hyper-saw")) {
            synth.setParams(preset->params);
        }
        synth.prepare(48000.0);

        std::array<float, 512 * 2> stereo{};
        const std::array<WavetableSynth::MidiEvent, 5> events{{
            {0, WavetableSynth::MidiEvent::Type::NoteOn, 60, 0.9f, 1.0f},
            {64, WavetableSynth::MidiEvent::Type::NoteOn, 64, 0.8f, 1.0f},
            {128, WavetableSynth::MidiEvent::Type::PitchBend, 0, 0.5f, 1.0f},
            {192, WavetableSynth::MidiEvent::Type::ModWheel, 0, 0.7f, 1.0f},
            {320, WavetableSynth::MidiEvent::Type::NoteOff, 60, 0.0f, 1.0f},
        }};

        nt::testing::allocations = 0;
        nt::testing::countAllocations = true;
        synth.setTempo(128.0, 4.0, true);
        synth.setParameter("filter.cutoff", 2400.0);
        synth.setParameter("oscA.pos", 0.5);
        synth.setParameter("filter.drive", 0.45);
        synth.renderBlock(stereo, events);
        synth.renderBlock(stereo);
        synth.reset();
        nt::testing::countAllocations = false;

        QCOMPARE(static_cast<std::size_t>(nt::testing::allocations), std::size_t{0});
    }

    // 12. Denormal & finite safety during long silent release decay.
    void denormalAndFiniteSafety() {
        WavetableSynth synth;
        WavetableSynthParams p;
        p.oscA.on = true;
        p.oscA.table = WavetableId::Prime;
        p.oscA.position = 0.66f;
        p.filter.on = true;
        p.filter.type = FilterType::Lp24;
        p.filter.cutoffHz = 800.0f;
        p.filter.resonance = 0.85f;
        p.filter.drive = 0.6f;
        p.noise.on = true;
        p.noise.type = NoiseType::Pink;
        p.noise.level = 0.2f;
        p.ampEnv = {0.001f, 0.02f, 0.2f, 0.02f};
        synth.setParams(p);
        synth.prepare(48000.0);

        std::array<float, 512 * 2> block{};
        synth.noteOn(60, 0.8f);
        synth.renderBlock(block);
        synth.noteOff(60);

        for (int b = 0; b < 80; ++b) {
            block.fill(0.0f);
            synth.renderBlock(block);
            for (float s : block) {
                QVERIFY(std::isfinite(s));
                QVERIFY2(std::fpclassify(s) != FP_SUBNORMAL, "Subnormal float escaped WavetableSynth::renderBlock");
            }
        }
    }

    // 13. CPU bound: 16 voices x 7 unison x 512 frames well under real time.
    void cpuBound16Voices7Unison512Frames() {
        constexpr double kRate = 48000.0;
        constexpr int kFrames = 512;
        const double realTimeMs = (static_cast<double>(kFrames) / kRate) * 1000.0;  // 10.667 ms

        WavetableSynth synth;
        WavetableSynthParams p;
        p.oscA.on = true;
        p.oscA.table = WavetableId::Prime;
        p.oscA.position = 0.5f;
        p.oscA.unison = 7;
        p.oscA.detune = 0.35f;
        p.oscA.spread = 0.9f;
        p.oscA.level = 0.7f;
        p.oscB.on = true;
        p.oscB.table = WavetableId::Bloom;
        p.oscB.position = 0.4f;
        p.oscB.unison = 7;
        p.oscB.detune = 0.3f;
        p.oscB.spread = 0.8f;
        p.oscB.level = 0.5f;
        p.sub.on = true;
        p.sub.shape = SubShape::Square;
        p.sub.level = 0.3f;
        p.noise.on = true;
        p.noise.type = NoiseType::Pink;
        p.noise.level = 0.1f;
        p.filter.on = true;
        p.filter.type = FilterType::Lp24;
        p.filter.cutoffHz = 2400.0f;
        p.filter.resonance = 0.4f;
        p.filter.drive = 0.35f;
        p.filter.envAmount = 0.5f;
        p.filter.keyTrack = 0.4f;
        p.ampEnv = {0.005f, 0.3f, 0.85f, 0.4f};
        p.lfo.rateHz = 2.0f;
        p.lfo.toCutoff = 0.25f;
        p.lfo.toPos = 0.2f;
        synth.setParams(p);
        synth.prepare(kRate);

        for (int v = 0; v < WavetableSynth::kMaxVoices; ++v) {
            synth.noteOn(48 + v, 0.85f);
        }

        std::array<float, kFrames * 2> stereo{};
        // Warmup 4 blocks
        for (int i = 0; i < 4; ++i) {
            stereo.fill(0.0f);
            synth.renderBlock(stereo);
        }
        QCOMPARE(synth.activeVoiceCount(), WavetableSynth::kMaxVoices);

        constexpr int kIters = 40;
        const auto t0 = std::chrono::steady_clock::now();
        for (int i = 0; i < kIters; ++i) {
            stereo.fill(0.0f);
            synth.renderBlock(stereo);
        }
        const auto t1 = std::chrono::steady_clock::now();
        const double avgMs =
            std::chrono::duration<double, std::milli>(t1 - t0).count() / static_cast<double>(kIters);
        const double pctRealtime = (avgMs / realTimeMs) * 100.0;
        std::fprintf(stderr,
                     "[WT1] CPU 16v x 7uni (2 oscs + sub + noise + LP24 + 2x drive) x 512f @ 48k: %.3f ms (%.1f%% of %.2f ms RT)\n",
                     avgMs, pctRealtime, realTimeMs);
        QVERIFY2(avgMs < realTimeMs * 0.65,
                 qPrintable(QString("CPU too slow: %1 ms vs %2 ms real-time budget").arg(avgMs).arg(realTimeMs)));
    }

    // 14. WavetableSynthProcessor (BlockProcessor contract: MIDI stream, seek, automation, zero alloc).
    void blockProcessorMidiStreamSeekAndZeroAlloc() {
        const QByteArray json = R"({
            "id": "tl1",
            "name": "WT1 Test",
            "fps": 30,
            "width": 640,
            "height": 360,
            "durationMs": 4000,
            "tempo": { "bpm": 120 },
            "tracks": [{
                "id": "t1",
                "name": "Lead",
                "type": "midi",
                "index": 0,
                "volumeDb": 0,
                "pan": 0,
                "instrument": {
                    "type": "wavetable",
                    "preset": "wt1-acid-line"
                }
            }],
            "clips": [{
                "id": "c1",
                "trackId": "t1",
                "name": "Line",
                "mediaType": "midi",
                "startMs": 0,
                "durationMs": 2000,
                "inPointMs": 0,
                "volumeDb": 0,
                "notes": [
                    { "id": "n1", "pitch": 48, "startTick": 0, "durationTick": 960, "velocity": 110 },
                    { "id": "n2", "pitch": 60, "startTick": 960, "durationTick": 960, "velocity": 100 }
                ],
                "controllers": [
                    { "id": "pb1", "kind": "pitchBend", "interpolation": "step",
                      "points": [{ "tick": 480, "value": 4096 }] }
                ]
            }]
        })";
        auto parsed = nt::parseTimelineJson(json);
        QVERIFY(parsed.timeline.has_value());
        const auto& tl = *parsed.timeline;
        QCOMPARE(tl.tracks.size(), std::size_t{1});

        WavetableSynthProcessor proc(tl, tl.tracks[0]);
        QCOMPARE(proc.id, std::string("instrument"));
        QVERIFY(proc.hasPendingOutput(0));
        proc.prepare(48000.0);

        // Render blocks sequentially with zero heap allocations.
        std::array<float, 128 * 2> block{};
        const double msPerFrame = 1000.0 / 48000.0;
        double peak = 0.0;
        nt::testing::allocations = 0;
        nt::testing::countAllocations = true;
        for (int b = 0; b < 32; ++b) {
            block.fill(0.0f);
            nt::audio::BlockContext ctx{48000.0, static_cast<double>(b * 128) * msPerFrame, msPerFrame, false, 0};
            proc.process(block, ctx);
            peak = std::max(peak, static_cast<double>(peakAbs(block, 0, 128)));
        }
        QVERIFY(proc.setParameter("filter.cutoff", 3200.0));
        QVERIFY(proc.setParameter("oscA.pos", 0.5));
        // Seek into middle of second note (600 ms): chase held note without allocating.
        block.fill(0.0f);
        proc.process(block, nt::audio::BlockContext{48000.0, 600.0, msPerFrame, false, 0});
        const float seekPeak = peakAbs(block, 0, 128);
        nt::testing::countAllocations = false;

        QCOMPARE(static_cast<std::size_t>(nt::testing::allocations), std::size_t{0});
        QVERIFY2(peak > 0.02, "WavetableSynthProcessor must render audible MIDI clip");
        QVERIFY2(seekPeak > 0.005f, "Seek mid-note must chase held note");
    }

    // 15. WavetableEdits: setPreset and setParams update track instrument cleanly.
    void documentEditsSetPresetAndParams() {
        const QJsonObject doc{
            {"id", "tl1"},
            {"tracks", QJsonArray{QJsonObject{
                {"id", "t1"}, {"name", "Synth"}, {"type", "midi"}, {"locked", false},
                {"instrument", QJsonObject{{"type", "subtractive"}}}}}}};

        const QJsonObject withPreset = setWavetablePresetEdit(doc, {{"trackId", "t1"}, {"preset", "wt1-hyper-saw"}});
        const auto inst1 = withPreset.value(u"tracks").toArray()[0].toObject().value(u"instrument").toObject();
        QCOMPARE(inst1.value(u"type").toString(), QStringLiteral("wavetable"));
        QCOMPARE(inst1.value(u"preset").toString(), QStringLiteral("wt1-hyper-saw"));
        QCOMPARE(inst1.value(u"oscA").toObject().value(u"unison").toInt(), 7);

        const QJsonObject patched = setWavetableParamsEdit(
            withPreset, {{"trackId", "t1"}, {"cutoffHz", 1800.0}, {"resonance", 0.62}, {"oscA.pos", 0.42}, {"mono", true},
                         {"oscBTable", "vox"}, {"oscBPosition", 0.35}, {"ampAttackMs", 25.0}, {"lfoToCutoff", 0.45}});
        const auto inst2 = patched.value(u"tracks").toArray()[0].toObject().value(u"instrument").toObject();
        const WavetableSynthParams parsed = wavetableParamsFromJson(inst2);
        QVERIFY(std::abs(parsed.filter.cutoffHz - 1800.0f) < 1e-2f);
        QVERIFY(std::abs(parsed.filter.resonance - 0.62f) < 1e-4f);
        QVERIFY(std::abs(parsed.oscA.position - 0.42f) < 1e-4f);
        QCOMPARE(parsed.oscB.table, WavetableId::Vox);
        QVERIFY(std::abs(parsed.oscB.position - 0.35f) < 1e-4f);
        QVERIFY(std::abs(parsed.ampEnv.attackSec - 0.025f) < 1e-4f);
        QVERIFY(std::abs(parsed.lfo.toCutoff - 0.45f) < 1e-4f);
        QCOMPARE(parsed.mono, true);
        // Untouched fields from wt1-hyper-saw remain intact.
        QCOMPARE(parsed.oscA.unison, 7);
    }

    // D1: >256 MIDI events inside one block must batch-flush without dropping NoteOffs.
    void denseMidiEventsOver256PerBlock() {
        QJsonArray ccPoints;
        for (int i = 0; i < 300; ++i) {
            ccPoints.append(QJsonObject{{"tick", i * 2}, {"value", (i % 120) + 1}});
        }
        const QJsonObject doc{
            {"id", "tl-d1"},
            {"name", "D1"},
            {"fps", 30},
            {"width", 640},
            {"height", 360},
            {"durationMs", 4000},
            {"tempo", QJsonObject{{"bpm", 120}}},
            {"tracks", QJsonArray{QJsonObject{
                {"id", "t1"},
                {"name", "Synth"},
                {"type", "midi"},
                {"index", 0},
                {"volumeDb", 0},
                {"pan", 0},
                {"instrument", QJsonObject{
                    {"type", "wavetable"},
                    {"ampEnv", QJsonObject{{"attackMs", 2}, {"decayMs", 20}, {"sustain", 0.9}, {"releaseMs", 20}}},
                }},
            }}},
            {"clips", QJsonArray{QJsonObject{
                {"id", "c1"},
                {"trackId", "t1"},
                {"name", "Dense"},
                {"mediaType", "midi"},
                {"startMs", 0},
                {"durationMs", 2000},
                {"inPointMs", 0},
                {"volumeDb", 0},
                {"notes", QJsonArray{
                    // At 120 BPM, 960 ticks/beat = 500 ms. 640 ticks = 333.3 ms (after all 300 CC points).
                    QJsonObject{{"id", "n1"}, {"pitch", 60}, {"startTick", 0}, {"durationTick", 640}, {"velocity", 110}},
                }},
                {"controllers", QJsonArray{
                    QJsonObject{{"id", "mw1"}, {"kind", "cc"}, {"cc", 1}, {"interpolation", "step"}, {"points", ccPoints}},
                }},
            }}},
        };
        auto parsed = nt::parseTimelineJson(QJsonDocument(doc).toJson(QJsonDocument::Compact));
        QVERIFY(parsed.timeline.has_value());
        const auto& tl = *parsed.timeline;

        WavetableSynthProcessor proc(tl, tl.tracks[0]);
        proc.prepare(48000.0);

        // One large export-sized block covering 0..500 ms (24000 frames) with >300 MIDI events.
        const double msPerFrame = 1000.0 / 48000.0;
        std::vector<float> bigBlock(24000 * 2, 0.0f);
        std::vector<float> tailBlock(9600 * 2, 0.0f);
        nt::testing::allocations = 0;
        nt::testing::countAllocations = true;
        proc.process(bigBlock, nt::audio::BlockContext{48000.0, 0.0, msPerFrame, false, 0});
        // Render another 200 ms after NoteOff (333 ms + 20 ms release -> silent by 700 ms).
        proc.process(tailBlock, nt::audio::BlockContext{48000.0, 500.0, msPerFrame, false, 0});
        nt::testing::countAllocations = false;

        QCOMPARE(static_cast<std::size_t>(nt::testing::allocations), std::size_t{0});
        QVERIFY2(peakAbs(bigBlock, 0, 8000) > 0.05f, "Note should sound before NoteOff");
        QVERIFY2(!proc.synth().hasActiveVoices(), "NoteOff past event #256 must not be dropped");
        QVERIFY2(peakAbs(tailBlock, 4800, 4800) < 1e-4f, "Note must decay to silence after NoteOff");
    }

    // D2: hasPendingOutput must clear to false after all MIDI events and release tails finish.
    void hasPendingOutputClearsAfterTail() {
        const QByteArray json = R"({
            "id": "tl-d2", "name": "D2", "fps": 30, "width": 640, "height": 360, "durationMs": 2000,
            "tempo": { "bpm": 120 },
            "tracks": [{
                "id": "t1", "name": "Synth", "type": "midi", "index": 0, "volumeDb": 0, "pan": 0,
                "instrument": {
                    "type": "wavetable",
                    "ampEnv": { "attackMs": 2, "decayMs": 20, "sustain": 0.8, "releaseMs": 30 }
                }
            }],
            "clips": [{
                "id": "c1", "trackId": "t1", "name": "Short", "mediaType": "midi",
                "startMs": 0, "durationMs": 500, "inPointMs": 0, "volumeDb": 0,
                "notes": [{ "id": "n1", "pitch": 60, "startTick": 0, "durationTick": 192, "velocity": 100 }]
            }]
        })";
        auto parsed = nt::parseTimelineJson(json);
        QVERIFY(parsed.timeline.has_value());
        WavetableSynthProcessor proc(*parsed.timeline, parsed.timeline->tracks[0]);
        proc.prepare(48000.0);
        QVERIFY(proc.hasPendingOutput(0));

        const double msPerFrame = 1000.0 / 48000.0;
        std::array<float, 256 * 2> block{};
        for (int b = 0; b < 150; ++b) {  // 800 ms total >> 100 ms note + 30 ms release
            block.fill(0.0f);
            proc.process(block, nt::audio::BlockContext{48000.0, static_cast<double>(b * 256) * msPerFrame, msPerFrame, false, 0});
        }
        QVERIFY2(!proc.synth().hasActiveVoices(), "Voice should finish releasing");
        QVERIFY2(!proc.hasPendingOutput(0), "hasPendingOutput must become false after events and tails end");
    }

    // D3: Clip fade-in, fade-out, and butt-join [startMs, endMs) must apply continuously during rendering.
    void clipFadesAndButtJoin() {
        const QByteArray json = R"({
            "id": "tl-d3", "name": "D3", "fps": 30, "width": 640, "height": 360, "durationMs": 3000,
            "tempo": { "bpm": 120 },
            "tracks": [{
                "id": "t1", "name": "Synth", "type": "midi", "index": 0, "volumeDb": 0, "pan": 0,
                "instrument": {
                    "type": "wavetable",
                    "filterOn": false,
                    "ampEnv": { "attackMs": 2, "decayMs": 20, "sustain": 1.0, "releaseMs": 20 }
                }
            }],
            "clips": [
                {
                    "id": "c1", "trackId": "t1", "name": "Faded", "mediaType": "midi",
                    "startMs": 0, "durationMs": 1000, "inPointMs": 0, "volumeDb": 0,
                    "fadeInMs": 200, "fadeOutMs": 200, "fadeInShape": "linear", "fadeOutShape": "linear",
                    "notes": [{ "id": "n1", "pitch": 60, "startTick": 0, "durationTick": 1920, "velocity": 110 }]
                },
                {
                    "id": "c2", "trackId": "t1", "name": "ButtJoined", "mediaType": "midi",
                    "startMs": 1000, "durationMs": 1000, "inPointMs": 0, "volumeDb": 0,
                    "fadeInMs": 0, "fadeOutMs": 0,
                    "notes": [{ "id": "n2", "pitch": 67, "startTick": 0, "durationTick": 960, "velocity": 110 }]
                }
            ]
        })";
        auto parsed = nt::parseTimelineJson(json);
        QVERIFY(parsed.timeline.has_value());
        WavetableSynthProcessor proc(*parsed.timeline, parsed.timeline->tracks[0]);
        proc.prepare(48000.0);

        constexpr double kRate = 48000.0;
        const double msPerFrame = 1000.0 / kRate;
        constexpr std::size_t kTotalFrames = 72000;  // 1500 ms
        std::vector<float> audio(kTotalFrames * 2, 0.0f);
        for (std::size_t f = 0; f < kTotalFrames; f += 256) {
            const std::size_t n = std::min<std::size_t>(256, kTotalFrames - f);
            proc.process(std::span<float>(audio.data() + f * 2, n * 2),
                         nt::audio::BlockContext{kRate, static_cast<double>(f) * msPerFrame, msPerFrame, false, 0});
        }

        const double earlyIn = rmsLeft(audio, static_cast<std::size_t>(kRate * 0.01), static_cast<std::size_t>(kRate * 0.02));
        const double midClip1 = rmsLeft(audio, static_cast<std::size_t>(kRate * 0.40), static_cast<std::size_t>(kRate * 0.10));
        const double lateOut = rmsLeft(audio, static_cast<std::size_t>(kRate * 0.96), static_cast<std::size_t>(kRate * 0.03));
        const double clip2Body = rmsLeft(audio, static_cast<std::size_t>(kRate * 1.10), static_cast<std::size_t>(kRate * 0.10));

        QVERIFY2(midClip1 > 0.04, qPrintable(QString("Note starting on fade-in edge latched silent: mid=%1").arg(midClip1)));
        QVERIFY2(earlyIn < midClip1 * 0.35, qPrintable(QString("Fade-in did not ramp: early=%1 mid=%2").arg(earlyIn).arg(midClip1)));
        QVERIFY2(lateOut < midClip1 * 0.30, qPrintable(QString("Fade-out did not attenuate held note: late=%1 mid=%2").arg(lateOut).arg(midClip1)));
        QVERIFY2(clip2Body > 0.04, qPrintable(QString("Butt-joined clip at 1000ms picked ending clip fade-out: body=%1").arg(clip2Body)));
    }

    // D4: modEnv must open filter during fast pluck transients consistently across 44.1 / 48 / 96 kHz.
    void modEnvFastPluckAndSampleRateIndependence() {
        auto renderPluckEarlyRms = [](double sr, float envAmount) {
            WavetableSynth synth;
            WavetableSynthParams p;
            p.oscA.on = true;
            p.oscA.table = WavetableId::Prime;
            p.oscA.position = 2.0f / 3.0f;  // Saw
            p.oscA.level = 1.0f;
            p.filter.on = true;
            p.filter.type = FilterType::Lp24;
            p.filter.cutoffHz = 180.0f;
            p.filter.resonance = 0.0f;
            p.filter.envAmount = envAmount;
            p.ampEnv = {0.001f, 0.05f, 1.0f, 0.05f};
            p.modEnv = {0.001f, 0.02f, 0.0f, 0.02f};
            p.masterVolume = 1.0f;
            synth.setParams(p);
            synth.prepare(sr);

            // First 2.5 ms: before fix, 128 frames @ 44.1 kHz is 2.9 ms so e2 stayed 0!
            const std::size_t frames = static_cast<std::size_t>(sr * 0.0025);
            std::vector<float> buf(frames * 2, 0.0f);
            synth.noteOn(48, 1.0f);
            synth.renderBlock(buf);
            return rmsLeft(buf, 0, frames);
        };

        std::array<double, 3> openRms{};
        const std::array<double, 3> rates{44100.0, 48000.0, 96000.0};
        for (std::size_t i = 0; i < rates.size(); ++i) {
            const double closed = renderPluckEarlyRms(rates[i], 0.0f);
            const double opened = renderPluckEarlyRms(rates[i], 1.0f);
            openRms[i] = opened;
            QVERIFY2(opened > closed * 2.0,
                     qPrintable(QString("sr=%1 modEnv did not open fast pluck transient: open=%2 closed=%3")
                                    .arg(rates[i])
                                    .arg(opened)
                                    .arg(closed)));
        }
        const double maxRms = std::max({openRms[0], openRms[1], openRms[2]});
        const double minRms = std::min({openRms[0], openRms[1], openRms[2]});
        QVERIFY2(minRms > maxRms * 0.70,
                 qPrintable(QString("Fast pluck transient diverged across rates: 44.1k=%1 48k=%2 96k=%3")
                                .arg(openRms[0])
                                .arg(openRms[1])
                                .arg(openRms[2])));
    }

    // D5: setParams must sanitize NaN and Inf on every numeric field so output never becomes NaN.
    void nonFiniteParamsSanitized() {
        const float nan = std::numeric_limits<float>::quiet_NaN();
        const float inf = std::numeric_limits<float>::infinity();

        WavetableSynthParams bad;
        bad.oscA.position = nan;
        bad.oscA.fine = inf;
        bad.oscA.detune = nan;
        bad.oscA.spread = -inf;
        bad.oscA.blend = nan;
        bad.oscA.level = nan;
        bad.oscA.pan = inf;
        bad.oscB.on = true;
        bad.oscB.position = inf;
        bad.oscB.level = nan;
        bad.sub.on = true;
        bad.sub.level = nan;
        bad.noise.on = true;
        bad.noise.level = inf;
        bad.filter.cutoffHz = nan;
        bad.filter.resonance = inf;
        bad.filter.drive = nan;
        bad.filter.envAmount = nan;
        bad.filter.keyTrack = inf;
        bad.ampEnv = {nan, inf, nan, -inf};
        bad.modEnv = {inf, nan, -inf, nan};
        bad.lfo.rateHz = nan;
        bad.lfo.riseSec = inf;
        bad.lfo.phase = nan;
        bad.lfo.toPitch = nan;
        bad.lfo.toPos = inf;
        bad.lfo.toCutoff = -inf;
        bad.velToAmp = nan;
        bad.velToCutoff = inf;
        bad.glideSec = nan;
        bad.pitchBendRange = inf;
        bad.modWheel = nan;
        bad.masterVolume = nan;

        WavetableSynth synth;
        synth.setParams(bad);
        synth.prepare(48000.0);

        const auto& sp = synth.params();
        QVERIFY(std::isfinite(sp.masterVolume));
        QVERIFY(std::isfinite(sp.filter.cutoffHz));
        QVERIFY(std::isfinite(sp.glideSec));
        QVERIFY(std::isfinite(sp.ampEnv.attackSec));
        QVERIFY(std::isfinite(sp.lfo.rateHz));
        QVERIFY(std::isfinite(sp.oscA.position));

        std::vector<float> buf(2048 * 2, 0.0f);
        synth.noteOn(60, 0.8f);
        synth.renderBlock(buf);
        for (float s : buf) {
            QVERIFY2(std::isfinite(s), "Non-finite sample produced after NaN/Inf setParams");
        }
        QVERIFY2(peakAbs(buf, 0, 2048) > 1e-4f, "Sanitized synth should still render audio");
    }

    // D6: Mono sustain pedal must not kill newly held note; mono must reuse releasing voice; clipGain must slew.
    void monoSustainReleaseReuseAndClipGainSlew() {
        constexpr double kRate = 48000.0;
        // 6a: Mono sustain pedal cleared on retrigger and legato.
        for (bool legato : {false, true}) {
            WavetableSynth synth;
            WavetableSynthParams p;
            p.oscA.on = true;
            p.oscA.table = WavetableId::Prime;
            p.oscA.position = 0.0f;
            p.oscA.level = 1.0f;
            p.filter.on = false;
            p.ampEnv = {0.002f, 0.02f, 0.9f, 0.03f};
            p.mono = true;
            p.legato = legato;
            p.masterVolume = 1.0f;
            synth.setParams(p);
            synth.prepare(kRate);

            std::vector<float> buf(1024 * 2, 0.0f);
            synth.noteOn(60, 1.0f);
            synth.renderBlock(buf);
            synth.setSustainPedal(true);
            synth.noteOff(60);  // sets v.sustained = true
            synth.renderBlock(buf);
            synth.noteOn(64, 1.0f);  // newly held note
            synth.renderBlock(buf);
            synth.setSustainPedal(false);  // must NOT kill held note 64

            std::vector<float> after(4096 * 2, 0.0f);
            synth.renderBlock(after);
            QVERIFY2(rmsLeft(after, 2048, 2048) > 0.05,
                     qPrintable(QString("Mono sustain release killed newly held note (legato=%1)").arg(legato)));
        }

        // 6b: Mono mode reuses releasing voice instead of spawning polyphonic tails.
        {
            WavetableSynth synth;
            WavetableSynthParams p;
            p.oscA.on = true;
            p.oscA.level = 1.0f;
            p.filter.on = false;
            p.ampEnv = {0.002f, 0.02f, 0.9f, 1.0f};  // Long release
            p.mono = true;
            p.masterVolume = 1.0f;
            synth.setParams(p);
            synth.prepare(kRate);

            std::vector<float> buf(512 * 2, 0.0f);
            synth.noteOn(60, 1.0f);
            synth.renderBlock(buf);
            synth.noteOff(60);
            synth.renderBlock(buf);
            QCOMPARE(synth.activeVoiceCount(), 1);
            synth.noteOn(64, 1.0f);
            synth.renderBlock(buf);
            QCOMPARE(synth.activeVoiceCount(), 1);
        }

        // 6c: retriggerVoice slews clipGain smoothly instead of stepping instantaneously.
        {
            WavetableSynth synth;
            WavetableSynthParams p;
            p.oscA.on = true;
            p.oscA.table = WavetableId::Prime;
            p.oscA.position = 0.0f;  // Pure sine (smooth derivative)
            p.oscA.level = 1.0f;
            p.filter.on = false;
            p.ampEnv = {0.002f, 0.02f, 1.0f, 0.1f};
            p.mono = true;
            p.legato = false;
            p.masterVolume = 1.0f;
            synth.setParams(p);
            synth.prepare(kRate);

            std::vector<float> warm(1024 * 2, 0.0f);
            synth.noteOn(48, 1.0f, 0.05f);  // Very low clipGain
            synth.renderBlock(warm);
            // Retrigger at peak-ish phase with 20x jump in clipGain (0.05 -> 1.0).
            std::vector<float> stepBuf(256 * 2, 0.0f);
            synth.noteOn(48, 1.0f, 1.0f);
            synth.renderBlock(stepBuf);

            // Check discontinuity right at sample 0 vs end of warm.
            const float boundaryStep = std::abs(stepBuf[0] - warm[(1024 - 1) * 2]);
            const float peakAfter = peakAbs(stepBuf, 128, 128);
            QVERIFY(peakAfter > 0.1f);
            QVERIFY2(boundaryStep < peakAfter * 0.25f,
                     qPrintable(QString("clipGain stepped without slew: boundaryStep=%1 peak=%2")
                                    .arg(boundaryStep)
                                    .arg(peakAfter)));
        }
    }

    // D7: High pitch clamps instead of hard-muting, filter bypass resets state, keyTrack follows gliding pitch.
    void highPitchClampFilterBypassResetAndGlidingKeyTrack() {
        constexpr double kRate = 48000.0;
        // 7a: Extreme pitch + octave + bend clamps instead of hard-muting.
        {
            WavetableSynth synth;
            WavetableSynthParams p;
            p.oscA.on = true;
            p.oscA.table = WavetableId::Prime;
            p.oscA.position = 0.0f;
            p.oscA.octave = 3;
            p.oscA.semitones = 12;
            p.oscA.level = 1.0f;
            p.filter.on = false;
            p.pitchBendRange = 12.0f;
            p.ampEnv = {0.001f, 0.01f, 1.0f, 0.05f};
            p.masterVolume = 1.0f;
            synth.setParams(p);
            synth.prepare(kRate);
            synth.setPitchBend(1.0f);

            std::vector<float> buf(2048 * 2, 0.0f);
            synth.noteOn(108, 1.0f);  // rawFreq >> Nyquist
            synth.renderBlock(buf);
            QVERIFY2(peakAbs(buf, 256, 1536) > 0.05f, "High pitch must clamp rather than hard-mute oscillator");
            for (float s : buf) {
                QVERIFY(std::isfinite(s));
            }
        }

        // 7b: Bypassing filter resets SVF & oversampler state so re-enabling does not emit stale ringing.
        {
            WavetableSynth synth;
            WavetableSynthParams p;
            p.oscA.on = true;
            p.oscA.table = WavetableId::Prime;
            p.oscA.position = 2.0f / 3.0f;
            p.oscA.level = 1.0f;
            p.filter.on = true;
            p.filter.type = FilterType::Lp24;
            p.filter.cutoffHz = 400.0f;
            p.filter.resonance = 0.96f;  // High resonance stores lots of SVF energy
            p.filter.drive = 0.7f;
            p.ampEnv = {0.001f, 0.01f, 1.0f, 0.5f};
            p.masterVolume = 1.0f;
            synth.setParams(p);
            synth.prepare(kRate);

            std::vector<float> hot(2048 * 2, 0.0f);
            synth.noteOn(48, 1.0f);
            synth.renderBlock(hot);

            // Bypass filter and mute oscA while voice stays active so filter has zero input.
            synth.setParameter("filter.on", 0.0);
            synth.setParameter("oscA.on", 0.0);
            std::vector<float> bypassed(1024 * 2, 0.0f);
            synth.renderBlock(bypassed);

            // Re-enable filter with oscA still off: must not emit stale SVF ringing or click!
            synth.setParameter("filter.on", 1.0);
            std::vector<float> reenabled(1024 * 2, 0.0f);
            synth.renderBlock(reenabled);
            const float bypassedTailPeak = peakAbs(bypassed, 960, 64);
            const float reenableStep = std::abs(reenabled[0] - bypassed[(1024 - 1) * 2]);
            const float reenabledPeak = peakAbs(reenabled, 0, 1024);
            QVERIFY2(reenableStep < 1e-4f,
                     qPrintable(QString("Re-enabling bypassed filter clicked: step=%1").arg(reenableStep)));
            QVERIFY2(reenabledPeak <= bypassedTailPeak + 1e-4f,
                     qPrintable(QString("Re-enabling bypassed filter emitted stale energy: peak=%1 tail=%2")
                                    .arg(reenabledPeak)
                                    .arg(bypassedTailPeak)));
        }

        // 7c: keyTrack tracks gliding v.pitch rather than snapping immediately to integer v.note.
        {
            auto renderGlideBrightness = [](float glideSec) {
                WavetableSynth synth;
                WavetableSynthParams p;
                p.oscA.on = true;
                p.oscA.table = WavetableId::Prime;
                p.oscA.position = 2.0f / 3.0f;
                p.oscA.level = 1.0f;
                p.filter.on = true;
                p.filter.type = FilterType::Lp24;
                p.filter.cutoffHz = 250.0f;
                p.filter.resonance = 0.0f;
                p.filter.keyTrack = 1.0f;
                p.ampEnv = {0.001f, 0.01f, 1.0f, 0.05f};
                p.mono = true;
                p.legato = true;
                p.glideSec = glideSec;
                p.masterVolume = 1.0f;
                synth.setParams(p);
                synth.prepare(kRate);

                // Start on C2 (36 -> -2 oct -> cutoff 62.5 Hz), then jump to C6 (84 -> +2 oct -> cutoff 1000 Hz).
                std::vector<float> intro(2048 * 2, 0.0f);
                synth.noteOn(36, 1.0f);
                synth.renderBlock(intro);

                synth.noteOn(84, 1.0f);
                // Measure RMS over 10..40 ms after note 84 (very early in a 600 ms glide).
                std::vector<float> early(2048 * 2, 0.0f);
                synth.renderBlock(early);
                return rmsLeft(early, 480, 1440);
            };
            // With 600 ms glide, pitch is still near note 36-46, so key-tracked cutoff must stay much lower
            // than a test where keyTrack jumped straight to note 84 (1000 Hz).
            // Compare keyTrack=1.0 with glide=0.6s vs a synth whose filter cutoff is locked to note 84:
            // Actually even simpler: compare keyTrack=1.0 on glide 36->84 against keyTrack=0.0 at fixed cutoff=1000 Hz
            // OR measure high-harmonic energy (above 400 Hz) at 20 ms vs 800 ms of the SAME gliding voice!
            WavetableSynth synth;
            WavetableSynthParams p;
            p.oscA.on = true;
            p.oscA.table = WavetableId::Prime;
            p.oscA.position = 2.0f / 3.0f;
            p.oscA.level = 1.0f;
            p.filter.on = true;
            p.filter.type = FilterType::Lp24;
            p.filter.cutoffHz = 300.0f;
            p.filter.resonance = 0.0f;
            p.filter.keyTrack = 1.0f;
            p.ampEnv = {0.001f, 0.01f, 1.0f, 0.05f};
            p.mono = true;
            p.legato = true;
            p.glideSec = 0.8f;
            p.masterVolume = 1.0f;
            synth.setParams(p);
            synth.prepare(kRate);

            std::vector<float> intro(2048 * 2, 0.0f);
            synth.noteOn(36, 1.0f);
            synth.renderBlock(intro);

            // Capture RMS right before note 84 vs 15 ms after note 84:
            // If keyTrack uses v.note (84), cutoff jumps 16x (from 75 Hz to 1200 Hz) immediately on chunk 0,
            // making RMS jump >3x within 15 ms while pitch has barely moved!
            const double beforeRms = rmsLeft(intro, 1024, 1024);
            synth.noteOn(84, 1.0f);
            std::vector<float> rightAfter(1024 * 2, 0.0f);  // 21 ms
            synth.renderBlock(rightAfter);
            const double rightAfterRms = rmsLeft(rightAfter, 256, 768);
            QVERIFY(beforeRms > 1e-4);
            QVERIFY2(rightAfterRms < beforeRms * 2.2,
                     qPrintable(QString("keyTrack jumped to target note instead of gliding pitch: before=%1 after21ms=%2")
                                    .arg(beforeRms)
                                    .arg(rightAfterRms)));
            (void)renderGlideBrightness;
        }
    }

    // D8: DriveAllpass/DriveOs2 denormal & NaN safety + single-frame (off0 == off1) fast path.
    void driveSafetyAndSingleFrameOscPath() {
        // Direct DriveAllpass x1 denormal flush & DriveOs2 NaN recovery checks.
        {
            WavetableSynth::DriveAllpass ap;
            const double sub = 1e-310;  // IEEE 754 double subnormal
            (void)ap.process(0.5, sub);
            QVERIFY2(ap.x1 == 0.0 && ap.y1 == 0.0, "DriveAllpass must flush both x1 and y1 denormals");

            WavetableSynth::DriveOs2 os;
            auto identitySat = [](double a, double) noexcept { return std::tanh(a); };
            // Feed a NaN sample while engaged, then normal samples: must NOT latch NaN into allpass state.
            const double badOut = os.run(std::numeric_limits<double>::quiet_NaN(), true, true, 1.0, 1.0, identitySat);
            QVERIFY2(std::isfinite(badOut), "DriveOs2::run must sanitize non-finite input before interpolate");
            const double nextOut = os.run(0.5, true, true, 1.0, 1.0, identitySat);
            QVERIFY2(std::isfinite(nextOut), "DriveOs2::run must not latch NaN into allpass state");
        }

        constexpr double kRate = 48000.0;
        // Single-frame positions 0.0 and 1.0 must render accurately and cleanly.
        for (float pos : {0.0f, 1.0f}) {
            WavetableSynth synth;
            WavetableSynthParams p;
            p.oscA.on = true;
            p.oscA.table = WavetableId::Prime;
            p.oscA.position = pos;
            p.oscA.level = 1.0f;
            p.filter.on = true;
            p.filter.type = FilterType::Lp24;
            p.filter.cutoffHz = 12000.0f;
            p.filter.drive = 0.85f;
            p.ampEnv = {0.001f, 0.01f, 1.0f, 0.02f};
            p.masterVolume = 1.0f;
            synth.setParams(p);
            synth.prepare(kRate);

            std::vector<float> buf(2048 * 2, 0.0f);
            synth.noteOn(69, 1.0f);
            synth.renderBlock(buf);
            QVERIFY(peakAbs(buf, 512, 1024) > 0.1f);
            const double hz = estimateZeroCrossingHz(buf, 512, 1400, kRate);
            QVERIFY2(std::abs(hz - 440.0) < 12.0, qPrintable(QString("pos=%1 expected 440 Hz, got %2").arg(pos).arg(hz)));

            // Decay well past release: zero subnormals or NaNs in DriveAllpass state.
            synth.noteOff(69);
            for (int b = 0; b < 60; ++b) {
                std::fill(buf.begin(), buf.end(), 0.0f);
                synth.renderBlock(buf);
                for (float s : buf) {
                    QVERIFY(std::isfinite(s));
                    QVERIFY(std::fpclassify(s) != FP_SUBNORMAL);
                }
            }
        }
    }

    // D9: Unified camelCase + dot key aliases, numeric enums, filter "none" parity, and headless EditRegistry auto-registration.
    void parameterAndEditParityAndAutoRegistration() {
        // 9a: Auto-registration in core/audio EditRegistry without manual registerWavetableEdits() call.
        const auto presetEdit = nt::app::findEdit(QStringLiteral("wavetable.setPreset"));
        const auto paramsEdit = nt::app::findEdit(QStringLiteral("wavetable.setParams"));
        QVERIFY2(static_cast<bool>(presetEdit), "wavetable.setPreset must auto-register in headless targets");
        QVERIFY2(static_cast<bool>(paramsEdit), "wavetable.setParams must auto-register in headless targets");

        // 9b: WavetableSynth::setParameter accepts camelCase edit keys AND dot keys consistently.
        WavetableSynth synth;
        synth.prepare(48000.0);
        QVERIFY(synth.setParameter("oscAPosition", 0.42));
        QVERIFY(synth.setParameter("oscBPosition", 0.73));
        QVERIFY(synth.setParameter("ampAttackMs", 25.0));
        QVERIFY(synth.setParameter("ampDecayMs", 180.0));
        QVERIFY(synth.setParameter("ampSustain", 0.55));
        QVERIFY(synth.setParameter("ampReleaseMs", 420.0));
        QVERIFY(synth.setParameter("modAttackMs", 12.0));
        QVERIFY(synth.setParameter("glideMs", 150.0));
        QVERIFY(synth.setParameter("lfoToCutoff", 0.45));
        QVERIFY(synth.setParameter("lfoToPitch", 0.15));
        QVERIFY(synth.setParameter("lfoToPos", 0.35));
        QVERIFY(synth.setParameter("lfoRateHz", 4.5));
        QVERIFY(synth.setParameter("masterVolume", 0.9));
        QVERIFY(synth.setParameter("pitchBendRange", 12.0));
        QVERIFY(synth.setParameter("sub.octave", -2.0));
        QVERIFY(synth.setParameter("subShape", 1.0));
        QVERIFY(synth.setParameter("noiseType", 1.0));
        QVERIFY(synth.setParameter("mono", 1.0));
        QVERIFY(synth.setParameter("legato", 1.0));

        QVERIFY(std::abs(synth.params().oscA.position - 0.42f) < 1e-4f);
        QVERIFY(std::abs(synth.params().oscB.position - 0.73f) < 1e-4f);
        QVERIFY(std::abs(synth.params().ampEnv.attackSec - 0.025f) < 1e-4f);
        QVERIFY(std::abs(synth.params().ampEnv.decaySec - 0.180f) < 1e-4f);
        QVERIFY(std::abs(synth.params().ampEnv.sustain - 0.55f) < 1e-4f);
        QVERIFY(std::abs(synth.params().ampEnv.releaseSec - 0.420f) < 1e-4f);
        QVERIFY(std::abs(synth.params().modEnv.attackSec - 0.012f) < 1e-4f);
        QVERIFY(std::abs(synth.params().glideSec - 0.150f) < 1e-4f);
        QVERIFY(std::abs(synth.params().lfo.toCutoff - 0.45f) < 1e-4f);
        QVERIFY(std::abs(synth.params().lfo.toPitch - 0.15f) < 1e-4f);
        QVERIFY(std::abs(synth.params().lfo.toPos - 0.35f) < 1e-4f);
        QVERIFY(std::abs(synth.params().lfo.rateHz - 4.5f) < 1e-4f);
        QVERIFY(std::abs(synth.params().masterVolume - 0.9f) < 1e-4f);
        QVERIFY(std::abs(synth.params().pitchBendRange - 12.0f) < 1e-4f);
        QCOMPARE(synth.params().sub.octave, -2);
        QCOMPARE(synth.params().sub.shape, SubShape::Square);
        QCOMPARE(synth.params().noise.type, NoiseType::Pink);
        QCOMPARE(synth.params().mono, true);
        QCOMPARE(synth.params().legato, true);

        // FilterType::None parity between setParameter and setWavetableParamsEdit.
        QVERIFY(synth.setParameter("filterType", static_cast<double>(FilterType::None)));
        QCOMPARE(synth.params().filter.type, FilterType::None);
        QCOMPARE(synth.params().filter.on, false);
        QVERIFY(synth.setParameter("filterType", static_cast<double>(FilterType::Hp24)));
        QCOMPARE(synth.params().filter.type, FilterType::Hp24);
        QCOMPARE(synth.params().filter.on, true);

        // 9c: setWavetableParamsEdit supports master.pitchBendRange, sub.octave, numeric enums, and "none" parity.
        const QJsonObject doc{
            {"id", "tl-d9"},
            {"tracks", QJsonArray{QJsonObject{
                {"id", "t1"}, {"name", "Synth"}, {"type", "midi"}, {"locked", false},
                {"instrument", QJsonObject{{"type", "wavetable"}}}}}}};
        const QJsonObject loaded = presetEdit(doc, {{"trackId", "t1"}, {"preset", "wt1-init"}});
        const QJsonObject patched = paramsEdit(loaded, {
            {"trackId", "t1"},
            {"master.pitchBendRange", 7.0},
            {"sub.octave", -2},
            {"subShape", 1},
            {"noiseType", 1},
            {"filterType", 2},  // Bp12
            {"lfoShape", 3},    // Square
        });
        const auto inst = patched.value(u"tracks").toArray()[0].toObject().value(u"instrument").toObject();
        const WavetableSynthParams parsed = wavetableParamsFromJson(inst);
        QVERIFY(std::abs(parsed.pitchBendRange - 7.0f) < 1e-4f);
        QCOMPARE(parsed.sub.octave, -2);
        QCOMPARE(parsed.sub.shape, SubShape::Square);
        QCOMPARE(parsed.noise.type, NoiseType::Pink);
        QCOMPARE(parsed.filter.type, FilterType::Bp12);
        QCOMPARE(parsed.filter.on, true);
        QCOMPARE(parsed.lfo.shape, LfoShape::Square);

        const QJsonObject filterOff = paramsEdit(patched, {{"trackId", "t1"}, {"filterType", 6}});
        const auto instOff = filterOff.value(u"tracks").toArray()[0].toObject().value(u"instrument").toObject();
        const WavetableSynthParams parsedOff = wavetableParamsFromJson(instOff);
        QCOMPARE(parsedOff.filter.on, false);
        QCOMPARE(instOff.value(u"filterType").toString(), QStringLiteral("none"));
    }

    // D10: Multi-rate checks (44.1 / 48 / 96 kHz) for pitch, filter cutoff, LFO tempo-sync, and glide.
    void multiRatePitchFilterLfoAndGlide() {
        for (double sr : {44100.0, 48000.0, 96000.0}) {
            // Pitch accuracy (A4 = 440 Hz)
            {
                WavetableSynth synth;
                WavetableSynthParams p;
                p.oscA.on = true;
                p.oscA.table = WavetableId::Prime;
                p.oscA.position = 0.0f;
                p.oscA.level = 1.0f;
                p.filter.on = false;
                p.ampEnv = {0.001f, 0.01f, 1.0f, 0.05f};
                p.masterVolume = 1.0f;
                synth.setParams(p);
                synth.prepare(sr);
                const std::size_t frames = static_cast<std::size_t>(sr * 0.10);
                std::vector<float> buf(frames * 2, 0.0f);
                synth.noteOn(69, 1.0f);
                synth.renderBlock(buf);
                const double hz = estimateZeroCrossingHz(buf, frames / 4, frames / 2, sr);
                QVERIFY2(std::abs(hz - 440.0) < 10.0, qPrintable(QString("sr=%1 pitch=%2").arg(sr).arg(hz)));
            }
            // Filter cutoff response (LP24 @ 400 Hz attenuates 16th harmonic of C3)
            {
                auto renderBand = [sr](FilterType ft) {
                    WavetableSynth synth;
                    WavetableSynthParams p;
                    p.oscA.on = true;
                    p.oscA.table = WavetableId::Prime;
                    p.oscA.position = 2.0f / 3.0f;
                    p.oscA.level = 0.9f;
                    p.filter.on = (ft != FilterType::None);
                    p.filter.type = ft;
                    p.filter.cutoffHz = 400.0f;
                    p.filter.resonance = 0.0f;
                    p.ampEnv = {0.002f, 0.01f, 1.0f, 0.05f};
                    p.masterVolume = 1.0f;
                    synth.setParams(p);
                    synth.prepare(sr);
                    const std::size_t n = static_cast<std::size_t>(sr * 0.10);
                    std::vector<float> buf(n * 2, 0.0f);
                    synth.noteOn(48, 1.0f);
                    synth.renderBlock(buf);
                    const std::size_t win = static_cast<std::size_t>(sr * 0.04);
                    std::vector<float> mono(win);
                    for (std::size_t i = 0; i < win; ++i) mono[i] = buf[(n / 2 + i) * 2];
                    const double f1 = 440.0 * std::pow(2.0, (48 - 69) / 12.0);
                    return dftBandEnergy(mono, sr, f1 * 16.0);
                };
                const double openHi = renderBand(FilterType::None);
                const double lp24Hi = renderBand(FilterType::Lp24);
                QVERIFY2(lp24Hi < openHi * 0.005, qPrintable(QString("sr=%1 LP24 attenuation weak").arg(sr)));
            }
            // LFO tempo-sync (120 BPM 1/4 = 2 Hz -> peak at 125 ms, trough at 375 ms)
            {
                WavetableSynth synth;
                WavetableSynthParams p;
                p.oscA.on = true;
                p.oscA.table = WavetableId::Prime;
                p.oscA.position = 0.66f;
                p.oscA.level = 0.9f;
                p.filter.on = true;
                p.filter.type = FilterType::Lp24;
                p.filter.cutoffHz = 600.0f;
                p.ampEnv = {0.002f, 0.01f, 1.0f, 0.05f};
                p.lfo.shape = LfoShape::Sine;
                p.lfo.tempoSync = true;
                p.lfo.syncDiv = 2;
                p.lfo.toCutoff = 0.6f;
                p.masterVolume = 1.0f;
                synth.setParams(p);
                synth.prepare(sr);
                synth.setTempo(120.0, 0.0, true);
                const std::size_t frames = static_cast<std::size_t>(sr * 0.50);
                std::vector<float> buf(frames * 2, 0.0f);
                synth.noteOn(48, 1.0f);
                synth.renderBlock(buf);
                const std::size_t win = static_cast<std::size_t>(sr * 0.02);
                const double peak = rmsLeft(buf, static_cast<std::size_t>(sr * 0.115), win);
                const double trough = rmsLeft(buf, static_cast<std::size_t>(sr * 0.365), win);
                QVERIFY2(peak > trough * 2.0, qPrintable(QString("sr=%1 LFO sync failed: %2 vs %3").arg(sr).arg(peak).arg(trough)));
            }
            // Glide time convergence (50 ms into 200 ms glide across all 3 rates)
            {
                WavetableSynth synth;
                WavetableSynthParams p;
                p.oscA.on = true;
                p.oscA.position = 0.0f;
                p.oscA.level = 1.0f;
                p.filter.on = false;
                p.ampEnv = {0.002f, 0.01f, 1.0f, 0.05f};
                p.mono = true;
                p.legato = true;
                p.glideSec = 0.20f;
                p.masterVolume = 1.0f;
                synth.setParams(p);
                synth.prepare(sr);
                std::vector<float> intro(static_cast<std::size_t>(sr * 0.03) * 2, 0.0f);
                synth.noteOn(69, 1.0f);
                synth.renderBlock(intro);
                synth.noteOn(81, 1.0f);
                std::vector<float> mid(static_cast<std::size_t>(sr * 0.05) * 2, 0.0f);
                synth.renderBlock(mid);
                const double midPitch = synth.newestVoicePitch();
                QVERIFY2(midPitch > 71.0 && midPitch < 79.5,
                         qPrintable(QString("sr=%1 mid-glide pitch=%2").arg(sr).arg(midPitch)));
            }
        }
    }

    // D10: Extended aliasing bounds at 44.1 kHz (G8, unison detune, mip-crossfade, SubShape::Square, oversampled drive).
    void extendedAliasingChecks() {
        constexpr double kRate = 44100.0;
        constexpr std::size_t kWarmup = 2048;
        constexpr std::size_t kFftN = 4096;

        auto measureAliasDb = [&](const WavetableSynthParams& p, int note, double maxAllowedDetuneRatio) {
            const double f0 = 440.0 * std::pow(2.0, (note - 69) / 12.0);
            WavetableSynth synth;
            synth.setParams(p);
            synth.prepare(kRate);
            std::vector<float> warm(kWarmup * 2, 0.0f);
            synth.noteOn(note, 1.0f);
            synth.renderBlock(warm);
            std::vector<float> cap(kFftN * 2, 0.0f);
            synth.renderBlock(cap);

            std::vector<double> re(kFftN, 0.0), im(kFftN, 0.0);
            for (std::size_t i = 0; i < kFftN; ++i) {
                const double win = 0.42 - 0.5 * std::cos(2.0 * std::numbers::pi * static_cast<double>(i) / kFftN) +
                                   0.08 * std::cos(4.0 * std::numbers::pi * static_cast<double>(i) / kFftN);
                re[i] = static_cast<double>(cap[i * 2]) * win;
            }
            wavetableFft(re.data(), im.data(), static_cast<int>(kFftN), false);
            const double binHz = kRate / static_cast<double>(kFftN);
            double harmE = 0.0, aliasE = 0.0;
            for (std::size_t k = 2; k < kFftN / 2; ++k) {
                const double freq = static_cast<double>(k) * binHz;
                const double mag2 = re[k] * re[k] + im[k] * im[k];
                bool nearHarm = false;
                for (int h = 1; h * f0 * maxAllowedDetuneRatio < kRate * 0.5; ++h) {
                    const double lo = h * f0 / maxAllowedDetuneRatio - 5.0 * binHz;
                    const double hi = h * f0 * maxAllowedDetuneRatio + 5.0 * binHz;
                    if (freq >= lo && freq <= hi) {
                        nearHarm = true;
                        break;
                    }
                }
                if (nearHarm) harmE += mag2;
                else aliasE += mag2;
            }
            return std::pair{harmE, 10.0 * std::log10(std::max(aliasE, 1e-20) / std::max(harmE, 1e-20))};
        };

        // 1. G8 (MIDI 115 = 6271.9 Hz) saw on Prime
        {
            WavetableSynthParams p;
            p.oscA = {true, WavetableId::Prime, 2.0f / 3.0f, 0, 0, 0.0f, 1, 0.0f, 0.0f, 1.0f, 1.0f, 0.0f};
            p.filter.on = false;
            p.ampEnv = {0.001f, 0.01f, 1.0f, 0.05f};
            p.masterVolume = 1.0f;
            const auto [harmE, db] = measureAliasDb(p, 115, 1.0);
            QVERIFY(harmE > 1e-3);
            QVERIFY2(db < -60.0, qPrintable(QString("G8 saw alias too high: %1 dB").arg(db)));
        }
        // 2. C8 (MIDI 108) with 7-voice unison + detune=0.5
        {
            WavetableSynthParams p;
            p.oscA = {true, WavetableId::Prime, 2.0f / 3.0f, 0, 0, 0.0f, 7, 0.5f, 0.8f, 1.0f, 1.0f, 0.0f};
            p.filter.on = false;
            p.ampEnv = {0.001f, 0.01f, 1.0f, 0.05f};
            p.masterVolume = 1.0f;
            const double detRatio = std::pow(2.0, 26.0 / 1200.0);
            const auto [harmE, db] = measureAliasDb(p, 108, detRatio);
            QVERIFY(harmE > 1e-3);
            QVERIFY2(db < -55.0, qPrintable(QString("C8 7-unison detuned saw alias too high: %1 dB").arg(db)));
        }
        // 3. Mip-crossfade boundary (fine-tuned right into kMipCrossfadeW zone around mip 8->9)
        {
            // mipF = log2(cps * 1024 / 0.475) = 8.03 -> cps = 2^8.03 * 0.475 / 1024 = 0.12126 -> freq ~ 5347 Hz
            const double targetFreq = std::pow(2.0, 8.03) * 0.475 / 1024.0 * kRate;
            const double exactMidi = 69.0 + 12.0 * std::log2(targetFreq / 440.0);
            const int note = static_cast<int>(std::round(exactMidi));
            const float fineCents = static_cast<float>((exactMidi - note) * 100.0);
            WavetableSynthParams p;
            p.oscA = {true, WavetableId::Prime, 2.0f / 3.0f, 0, 0, fineCents, 1, 0.0f, 0.0f, 1.0f, 1.0f, 0.0f};
            p.filter.on = false;
            p.ampEnv = {0.001f, 0.01f, 1.0f, 0.05f};
            p.masterVolume = 1.0f;
            const auto [harmE, db] = measureAliasDb(p, note, std::pow(2.0, (std::abs(fineCents) + 5.0) / 1200.0));
            QVERIFY(harmE > 1e-3);
            QVERIFY2(db < -55.0, qPrintable(QString("Mip-crossfade alias too high: %1 dB").arg(db)));
        }
        // 4. SubShape::Square at C8 (sub.octave = 0 -> 4186 Hz)
        {
            WavetableSynthParams p;
            p.oscA.on = false;
            p.sub = {true, SubShape::Square, 0, 1.0f};
            p.filter.on = false;
            p.ampEnv = {0.001f, 0.01f, 1.0f, 0.05f};
            p.masterVolume = 1.0f;
            const auto [harmE, db] = measureAliasDb(p, 108, 1.0);
            QVERIFY(harmE > 1e-4);
            QVERIFY2(db < -60.0, qPrintable(QString("SubShape::Square C8 alias too high: %1 dB").arg(db)));
        }
        // 5. Oversampled 2x ADAA drive on high sine (B7 = 3951 Hz, 3rd harmonic = 11.85 kHz < Nyquist, 5th = 19.75 kHz < Nyquist)
        {
            WavetableSynthParams p;
            p.oscA = {true, WavetableId::Prime, 0.0f, 0, 0, 0.0f, 1, 0.0f, 0.0f, 1.0f, 1.0f, 0.0f};
            p.filter = {true, FilterType::Lp12, 19000.0f, 0.0f, 0.7f, 0.0f, 0.0f};
            p.ampEnv = {0.001f, 0.01f, 1.0f, 0.05f};
            p.masterVolume = 1.0f;
            const auto [harmE, db] = measureAliasDb(p, 107, 1.0);
            QVERIFY(harmE > 1e-3);
            QVERIFY2(db < -40.0, qPrintable(QString("Oversampled drive B7 alias too high: %1 dB").arg(db)));
        }
    }

    // D10: OscB independent synthesis + polyphonic sustain pedal hold & release.
    void oscBAndPolySustainPedal() {
        constexpr double kRate = 48000.0;
        // OscB alone at +1 octave on Pulse table with right pan.
        {
            WavetableSynth synth;
            WavetableSynthParams p;
            p.oscA.on = false;
            p.oscB = {true, WavetableId::Pulse, 0.0f, 1, 0, 0.0f, 1, 0.0f, 0.0f, 1.0f, 0.9f, 1.0f};
            p.filter.on = false;
            p.ampEnv = {0.002f, 0.01f, 1.0f, 0.05f};
            p.masterVolume = 1.0f;
            synth.setParams(p);
            synth.prepare(kRate);

            std::vector<float> buf(4096 * 2, 0.0f);
            synth.noteOn(69, 1.0f);  // +1 oct -> 880 Hz
            synth.renderBlock(buf);
            const double lRms = rmsLeft(buf, 512, 2048);
            double rSum = 0.0;
            for (std::size_t f = 512; f < 2560; ++f) {
                const double r = buf[f * 2 + 1];
                rSum += r * r;
            }
            const double rRms = std::sqrt(rSum / 2048.0);
            QVERIFY2(rRms > 0.05 && lRms < rRms * 0.01, "OscB hard-right pan must route energy to right channel");
        }

        // Polyphonic sustain pedal holds released notes until pedal release.
        {
            WavetableSynth synth;
            WavetableSynthParams p;
            p.oscA.on = true;
            p.oscA.position = 0.0f;
            p.oscA.level = 0.9f;
            p.filter.on = false;
            p.ampEnv = {0.002f, 0.01f, 1.0f, 0.02f};
            p.mono = false;
            p.masterVolume = 1.0f;
            synth.setParams(p);
            synth.prepare(kRate);

            std::vector<float> buf(2048 * 2, 0.0f);
            synth.setSustainPedal(true);
            synth.noteOn(60, 1.0f);
            synth.noteOn(64, 1.0f);
            synth.renderBlock(buf);
            synth.noteOff(60);
            synth.noteOff(64);
            std::vector<float> held(4096 * 2, 0.0f);
            synth.renderBlock(held);
            QVERIFY2(rmsLeft(held, 2048, 2048) > 0.05, "Poly sustain pedal must hold released notes");
            QCOMPARE(synth.activeVoiceCount(), 2);

            synth.setSustainPedal(false);
            std::vector<float> released(8192 * 2, 0.0f);
            synth.renderBlock(released);
            QVERIFY2(rmsLeft(released, 6144, 2048) < 1e-3, "Releasing poly sustain pedal must release held notes");
            QCOMPARE(synth.activeVoiceCount(), 0);
        }
    }

    // E1: Overlapping clips must not impose their gain/fades onto voices owned by other clips,
    // including normal playback, simultaneous overlapping notes, mid-clip seek/chase, and pending steals.
    void overlappingClipEnvelopesAreVoiceOwned() {
        constexpr double kRate = 48000.0;
        const double msPerFrame = 1000.0 / kRate;

        auto renderTimeline = [&](const QByteArray& json, double startMs, std::size_t totalFrames) {
            auto parsed = nt::parseTimelineJson(json);
            Q_ASSERT(parsed.timeline.has_value());
            WavetableSynthProcessor proc(*parsed.timeline, parsed.timeline->tracks[0]);
            proc.prepare(kRate);
            std::vector<float> audio(totalFrames * 2, 0.0f);
            for (std::size_t f = 0; f < totalFrames; f += 256) {
                const std::size_t n = std::min<std::size_t>(256, totalFrames - f);
                proc.process(std::span<float>(audio.data() + f * 2, n * 2),
                             nt::audio::BlockContext{kRate, startMs + static_cast<double>(f) * msPerFrame, msPerFrame, false, 0});
            }
            return audio;
        };

        // 1a. Sustain C4 in clip A [0, 1500) at 0 dB alone vs overlapped by empty clip B [250, 750) at -60 dB.
        const QByteArray aloneJson = R"({
            "id": "tl-e1-a", "name": "E1A", "fps": 30, "width": 640, "height": 360, "durationMs": 2000,
            "tempo": { "bpm": 120 },
            "tracks": [{
                "id": "t1", "name": "Synth", "type": "midi", "index": 0, "volumeDb": 0, "pan": 0,
                "instrument": {
                    "type": "wavetable", "oscATable": "prime", "oscAPosition": 0.0,
                    "filterOn": false,
                    "ampEnv": { "attackMs": 2, "decayMs": 20, "sustain": 1.0, "releaseMs": 50 }
                }
            }],
            "clips": [{
                "id": "cA", "trackId": "t1", "name": "A", "mediaType": "midi",
                "startMs": 0, "durationMs": 1500, "inPointMs": 0, "volumeDb": 0,
                "notes": [{ "id": "nA", "pitch": 60, "startTick": 0, "durationTick": 2880, "velocity": 110 }]
            }]
        })";

        const QByteArray overlapEmptyJson = R"({
            "id": "tl-e1-b", "name": "E1B", "fps": 30, "width": 640, "height": 360, "durationMs": 2000,
            "tempo": { "bpm": 120 },
            "tracks": [{
                "id": "t1", "name": "Synth", "type": "midi", "index": 0, "volumeDb": 0, "pan": 0,
                "instrument": {
                    "type": "wavetable", "oscATable": "prime", "oscAPosition": 0.0,
                    "filterOn": false,
                    "ampEnv": { "attackMs": 2, "decayMs": 20, "sustain": 1.0, "releaseMs": 50 }
                }
            }],
            "clips": [
                {
                    "id": "cA", "trackId": "t1", "name": "A", "mediaType": "midi",
                    "startMs": 0, "durationMs": 1500, "inPointMs": 0, "volumeDb": 0,
                    "notes": [{ "id": "nA", "pitch": 60, "startTick": 0, "durationTick": 2880, "velocity": 110 }]
                },
                {
                    "id": "cB", "trackId": "t1", "name": "EmptyQuiet", "mediaType": "midi",
                    "startMs": 250, "durationMs": 500, "inPointMs": 0, "volumeDb": -60,
                    "notes": []
                }
            ]
        })";

        constexpr std::size_t kFrames1s = 48000;
        const auto alone = renderTimeline(aloneJson, 0.0, kFrames1s);
        const auto withEmpty = renderTimeline(overlapEmptyJson, 0.0, kFrames1s);
        const double aloneRms = rmsLeft(alone, static_cast<std::size_t>(kRate * 0.50), static_cast<std::size_t>(kRate * 0.10));
        const double withEmptyRms = rmsLeft(withEmpty, static_cast<std::size_t>(kRate * 0.50), static_cast<std::size_t>(kRate * 0.10));
        QVERIFY2(aloneRms > 0.04, qPrintable(QString("Baseline C4 too quiet: %1").arg(aloneRms)));
        QVERIFY2(std::abs(withEmptyRms - aloneRms) < aloneRms * 0.02,
                 qPrintable(QString("Empty overlapping clip attenuated clip A: alone=%1 withEmpty=%2")
                                .arg(aloneRms)
                                .arg(withEmptyRms)));

        // 1b. Mid-clip seek/chase at 500 ms must retain clip A ownership on the chased C4 voice.
        const auto seekAlone = renderTimeline(aloneJson, 500.0, static_cast<std::size_t>(kRate * 0.15));
        const auto seekWithEmpty = renderTimeline(overlapEmptyJson, 500.0, static_cast<std::size_t>(kRate * 0.15));
        const double seekAloneRms = rmsLeft(seekAlone, static_cast<std::size_t>(kRate * 0.03), static_cast<std::size_t>(kRate * 0.10));
        const double seekWithEmptyRms = rmsLeft(seekWithEmpty, static_cast<std::size_t>(kRate * 0.03), static_cast<std::size_t>(kRate * 0.10));
        QVERIFY(seekAloneRms > 0.04);
        QVERIFY2(std::abs(seekWithEmptyRms - seekAloneRms) < seekAloneRms * 0.02,
                 qPrintable(QString("Chased note lost clip ownership on seek: alone=%1 withEmpty=%2")
                                .arg(seekAloneRms)
                                .arg(seekWithEmptyRms)));

        // 1c. Two overlapping clips both containing notes: C4 (0 dB) stays full level while G5 (-60 dB) is attenuated.
        auto makeOverlapNotesJson = [](double clipBVolumeDb) {
            return QStringLiteral(R"({
                "id": "tl-e1-c", "name": "E1C", "fps": 30, "width": 640, "height": 360, "durationMs": 2000,
                "tempo": { "bpm": 120 },
                "tracks": [{
                    "id": "t1", "name": "Synth", "type": "midi", "index": 0, "volumeDb": 0, "pan": 0,
                    "instrument": {
                        "type": "wavetable", "oscATable": "prime", "oscAPosition": 0.0,
                        "filterOn": false,
                        "ampEnv": { "attackMs": 2, "decayMs": 20, "sustain": 1.0, "releaseMs": 50 }
                    }
                }],
                "clips": [
                    {
                        "id": "cA", "trackId": "t1", "name": "A", "mediaType": "midi",
                        "startMs": 0, "durationMs": 1500, "inPointMs": 0, "volumeDb": 0,
                        "notes": [{ "id": "nA", "pitch": 60, "startTick": 0, "durationTick": 2880, "velocity": 110 }]
                    },
                    {
                        "id": "cB", "trackId": "t1", "name": "B", "mediaType": "midi",
                        "startMs": 250, "durationMs": 500, "inPointMs": 0, "volumeDb": %1,
                        "notes": [{ "id": "nB", "pitch": 79, "startTick": 0, "durationTick": 960, "velocity": 110 }]
                    }
                ]
            })").arg(clipBVolumeDb).toUtf8();
        };
        const auto loudB = renderTimeline(makeOverlapNotesJson(0.0), 0.0, kFrames1s);
        const auto quietB = renderTimeline(makeOverlapNotesJson(-60.0), 0.0, kFrames1s);
        constexpr std::size_t kWinStart = 24000;  // 500 ms
        constexpr std::size_t kWinLen = 4096;
        std::vector<float> aloneWin(kWinLen), loudBWin(kWinLen), quietBWin(kWinLen);
        for (std::size_t i = 0; i < kWinLen; ++i) {
            aloneWin[i] = alone[(kWinStart + i) * 2];
            loudBWin[i] = loudB[(kWinStart + i) * 2];
            quietBWin[i] = quietB[(kWinStart + i) * 2];
        }
        const double fC4 = 440.0 * std::pow(2.0, (60 - 69) / 12.0);
        const double fG5 = 440.0 * std::pow(2.0, (79 - 69) / 12.0);
        const double c4AloneE = dftBandEnergy(aloneWin, kRate, fC4);
        const double c4QuietBE = dftBandEnergy(quietBWin, kRate, fC4);
        const double g5LoudBE = dftBandEnergy(loudBWin, kRate, fG5);
        const double g5QuietBE = dftBandEnergy(quietBWin, kRate, fG5);
        QVERIFY2(std::abs(c4QuietBE - c4AloneE) < c4AloneE * 0.05,
                 qPrintable(QString("Overlapping clip B affected C4 energy: alone=%1 quietB=%2")
                                .arg(c4AloneE)
                                .arg(c4QuietBE)));
        QVERIFY2(g5QuietBE < g5LoudBE * 1e-4,
                 qPrintable(QString("Overlapping clip B (-60 dB) did not attenuate G5: loud=%1 quiet=%2")
                                .arg(g5LoudBE)
                                .arg(g5QuietBE)));

        // 1d. Pending steals across clips must preserve the incoming note's source-clip envelope.
        auto makeStealJson = [](double clipBVolumeDb) {
            QStringList notesA, notesB;
            for (int i = 0; i < 16; ++i) {
                notesA << QStringLiteral(R"({"id":"a%1","pitch":%2,"startTick":0,"durationTick":1920,"velocity":100})")
                              .arg(i)
                              .arg(48 + i);
                notesB << QStringLiteral(R"({"id":"b%1","pitch":%2,"startTick":0,"durationTick":1536,"velocity":100})")
                              .arg(i)
                              .arg(64 + i);
            }
            return QStringLiteral(R"({
                "id": "tl-e1-steal", "name": "Steal", "fps": 30, "width": 640, "height": 360, "durationMs": 1500,
                "tempo": { "bpm": 120 },
                "tracks": [{
                    "id": "t1", "name": "Synth", "type": "midi", "index": 0, "volumeDb": 0, "pan": 0,
                    "instrument": {
                        "type": "wavetable", "oscATable": "prime", "oscAPosition": 0.0,
                        "filterOn": false,
                        "ampEnv": { "attackMs": 2, "decayMs": 20, "sustain": 1.0, "releaseMs": 50 }
                    }
                }],
                "clips": [
                    {
                        "id": "cA", "trackId": "t1", "name": "A", "mediaType": "midi",
                        "startMs": 0, "durationMs": 1000, "inPointMs": 0, "volumeDb": 0,
                        "notes": [%1]
                    },
                    {
                        "id": "cB", "trackId": "t1", "name": "B", "mediaType": "midi",
                        "startMs": 200, "durationMs": 800, "inPointMs": 0, "volumeDb": %2,
                        "notes": [%3]
                    }
                ]
            })").arg(notesA.join(","), QString::number(clipBVolumeDb), notesB.join(",")).toUtf8();
        };
        const auto stealLoud = renderTimeline(makeStealJson(0.0), 0.0, static_cast<std::size_t>(kRate * 0.40));
        const auto stealQuiet = renderTimeline(makeStealJson(-40.0), 0.0, static_cast<std::size_t>(kRate * 0.40));
        const double stealLoudRms = rmsLeft(stealLoud, static_cast<std::size_t>(kRate * 0.30), static_cast<std::size_t>(kRate * 0.06));
        const double stealQuietRms = rmsLeft(stealQuiet, static_cast<std::size_t>(kRate * 0.30), static_cast<std::size_t>(kRate * 0.06));
        QVERIFY(stealLoudRms > 0.05);
        QVERIFY2(stealQuietRms < stealLoudRms * 0.02,
                 qPrintable(QString("Pending steal dropped source clip envelope: loud=%1 quiet=%2")
                                .arg(stealLoudRms)
                                .arg(stealQuietRms)));
    }

    // E1: Adjacent clips must not impose their gain or fade-in onto the preceding clip's release tails.
    void adjacentClipDoesNotAlterPrecedingReleaseTail() {
        constexpr double kRate = 48000.0;
        const double msPerFrame = 1000.0 / kRate;
        constexpr std::size_t kTotalFrames = 52800;  // 1100 ms

        auto renderTimeline = [&](const QByteArray& json) {
            auto parsed = nt::parseTimelineJson(json);
            Q_ASSERT(parsed.timeline.has_value());
            WavetableSynthProcessor proc(*parsed.timeline, parsed.timeline->tracks[0]);
            proc.prepare(kRate);
            std::vector<float> audio(kTotalFrames * 2, 0.0f);
            for (std::size_t f = 0; f < kTotalFrames; f += 256) {
                const std::size_t n = std::min<std::size_t>(256, kTotalFrames - f);
                proc.process(std::span<float>(audio.data() + f * 2, n * 2),
                             nt::audio::BlockContext{kRate, static_cast<double>(f) * msPerFrame, msPerFrame, false, 0});
            }
            return audio;
        };

        const QByteArray aloneJson = R"({
            "id": "tl-e1-tail-0", "name": "Tail0", "fps": 30, "width": 640, "height": 360, "durationMs": 2000,
            "tempo": { "bpm": 120 },
            "tracks": [{
                "id": "t1", "name": "Synth", "type": "midi", "index": 0, "volumeDb": 0, "pan": 0,
                "instrument": {
                    "type": "wavetable", "oscATable": "prime", "oscAPosition": 0.0,
                    "filterOn": false,
                    "ampEnv": { "attackMs": 2, "decayMs": 20, "sustain": 1.0, "releaseMs": 400 }
                }
            }],
            "clips": [{
                "id": "cA", "trackId": "t1", "name": "A", "mediaType": "midi",
                "startMs": 0, "durationMs": 500, "inPointMs": 0, "volumeDb": 0,
                "notes": [{ "id": "nA", "pitch": 60, "startTick": 0, "durationTick": 960, "velocity": 110 }]
            }]
        })";

        const QByteArray adjQuietJson = R"({
            "id": "tl-e1-tail-1", "name": "Tail1", "fps": 30, "width": 640, "height": 360, "durationMs": 2000,
            "tempo": { "bpm": 120 },
            "tracks": [{
                "id": "t1", "name": "Synth", "type": "midi", "index": 0, "volumeDb": 0, "pan": 0,
                "instrument": {
                    "type": "wavetable", "oscATable": "prime", "oscAPosition": 0.0,
                    "filterOn": false,
                    "ampEnv": { "attackMs": 2, "decayMs": 20, "sustain": 1.0, "releaseMs": 400 }
                }
            }],
            "clips": [
                {
                    "id": "cA", "trackId": "t1", "name": "A", "mediaType": "midi",
                    "startMs": 0, "durationMs": 500, "inPointMs": 0, "volumeDb": 0,
                    "notes": [{ "id": "nA", "pitch": 60, "startTick": 0, "durationTick": 960, "velocity": 110 }]
                },
                {
                    "id": "cB", "trackId": "t1", "name": "AdjacentQuiet", "mediaType": "midi",
                    "startMs": 500, "durationMs": 1000, "inPointMs": 0, "volumeDb": -60,
                    "notes": []
                }
            ]
        })";

        const QByteArray adjFadeInJson = R"({
            "id": "tl-e1-tail-2", "name": "Tail2", "fps": 30, "width": 640, "height": 360, "durationMs": 2000,
            "tempo": { "bpm": 120 },
            "tracks": [{
                "id": "t1", "name": "Synth", "type": "midi", "index": 0, "volumeDb": 0, "pan": 0,
                "instrument": {
                    "type": "wavetable", "oscATable": "prime", "oscAPosition": 0.0,
                    "filterOn": false,
                    "ampEnv": { "attackMs": 2, "decayMs": 20, "sustain": 1.0, "releaseMs": 400 }
                }
            }],
            "clips": [
                {
                    "id": "cA", "trackId": "t1", "name": "A", "mediaType": "midi",
                    "startMs": 0, "durationMs": 500, "inPointMs": 0, "volumeDb": 0,
                    "notes": [{ "id": "nA", "pitch": 60, "startTick": 0, "durationTick": 960, "velocity": 110 }]
                },
                {
                    "id": "cB", "trackId": "t1", "name": "AdjacentFadeIn", "mediaType": "midi",
                    "startMs": 500, "durationMs": 1000, "inPointMs": 0, "volumeDb": 0,
                    "fadeInMs": 400, "fadeInShape": "linear",
                    "notes": [{ "id": "nB", "pitch": 79, "startTick": 0, "durationTick": 1920, "velocity": 110 }]
                }
            ]
        })";

        const auto alone = renderTimeline(aloneJson);
        const auto adjQuiet = renderTimeline(adjQuietJson);
        const auto adjFadeIn = renderTimeline(adjFadeInJson);

        const std::size_t tailStart = static_cast<std::size_t>(kRate * 0.54);
        const std::size_t tailLen = static_cast<std::size_t>(kRate * 0.10);
        const double aloneTailRms = rmsLeft(alone, tailStart, tailLen);
        const double adjQuietTailRms = rmsLeft(adjQuiet, tailStart, tailLen);
        QVERIFY2(aloneTailRms > 0.015, qPrintable(QString("Baseline release tail too quiet: %1").arg(aloneTailRms)));
        QVERIFY2(std::abs(adjQuietTailRms - aloneTailRms) < aloneTailRms * 0.02,
                 qPrintable(QString("Adjacent quiet clip attenuated clip A's release tail: alone=%1 adjQuiet=%2")
                                .arg(aloneTailRms)
                                .arg(adjQuietTailRms)));

        // Clip B's 400 ms fade-in must not attenuate Clip A's C4 release tail, while still fading in Clip B's G5.
        constexpr std::size_t kDftLen = 4096;
        std::vector<float> aloneWin(kDftLen), fadeInWin(kDftLen), earlyBWin(1024), lateBWin(4096);
        for (std::size_t i = 0; i < kDftLen; ++i) {
            aloneWin[i] = alone[(tailStart + i) * 2];
            fadeInWin[i] = adjFadeIn[(tailStart + i) * 2];
            lateBWin[i] = adjFadeIn[(static_cast<std::size_t>(kRate * 0.95) + i) * 2];
        }
        for (std::size_t i = 0; i < earlyBWin.size(); ++i) {
            earlyBWin[i] = adjFadeIn[(static_cast<std::size_t>(kRate * 0.505) + i) * 2];
        }
        const double fC4 = 440.0 * std::pow(2.0, (60 - 69) / 12.0);
        const double fG5 = 440.0 * std::pow(2.0, (79 - 69) / 12.0);
        const double c4AloneTailE = dftBandEnergy(aloneWin, kRate, fC4);
        const double c4WithFadeInTailE = dftBandEnergy(fadeInWin, kRate, fC4);
        const double g5EarlyE = dftBandEnergy(earlyBWin, kRate, fG5);
        const double g5LateE = dftBandEnergy(lateBWin, kRate, fG5);
        QVERIFY2(std::abs(c4WithFadeInTailE - c4AloneTailE) < c4AloneTailE * 0.05,
                 qPrintable(QString("Adjacent fade-in clip attenuated clip A's C4 tail: alone=%1 withFadeIn=%2")
                                .arg(c4AloneTailE)
                                .arg(c4WithFadeInTailE)));
        QVERIFY2(g5LateE > 1e-4 && g5EarlyE < g5LateE * 0.05,
                 qPrintable(QString("Adjacent clip B fade-in did not ramp G5: early=%1 late=%2")
                                .arg(g5EarlyE)
                                .arg(g5LateE)));
    }
};

QTEST_GUILESS_MAIN(TestWavetableSynth)
#include "tst_wavetablesynth.moc"
