// Tests for nt::midi::BassSynth, nt::midi::BassSynthProcessor, BassSynthPresets,
// and BassSynthEdits.
// Covers: alias energy bound for a high saw, 4-pole ZDF ladder self-oscillation
// pitch tracking, high-resonance bass gain compensation, constant-time slide,
// legato without envelope retrigger, velocity accent boost & accent-aware slide,
// last-note-priority note stack, click-free retriggers, PWM / sub / hard sync /
// analog drift / 44.1-48-96 kHz / denormal safety, curated presets & edits,
// sample-accurate BlockProcessor MIDI, zero audio-thread allocations, and CPU bound.

#include "app/EditRegistry.h"
#include "audio/Mixer.h"
#include "audio/TestAllocationCounter.h"
#include "midi/BassSynth.h"
#include "midi/BassSynthEdits.h"
#include "midi/BassSynthPresets.h"
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
#include <numbers>
#include <set>
#include <string>
#include <vector>

using namespace nt::midi;

namespace {

double midiToHz(double midiNote) {
    return 440.0 * std::pow(2.0, (midiNote - 69.0) / 12.0);
}

std::vector<double> extractMono(std::span<const float> stereo) {
    const std::size_t frames = stereo.size() / 2;
    std::vector<double> mono(frames);
    for (std::size_t i = 0; i < frames; ++i) {
        mono[i] = 0.5 * (static_cast<double>(stereo[i * 2]) + static_cast<double>(stereo[i * 2 + 1]));
    }
    return mono;
}

double rmsSpan(std::span<const double> x) {
    if (x.empty()) return 0.0;
    double sum = 0.0;
    for (double v : x) sum += v * v;
    return std::sqrt(sum / static_cast<double>(x.size()));
}

double peakAbsSpan(std::span<const float> x) {
    double p = 0.0;
    for (float v : x) p = std::max(p, std::abs(static_cast<double>(v)));
    return p;
}

// Hann-windowed DFT magnitude squared at arbitrary frequency f (Hz).
double dftPowerAtHz(std::span<const double> x, double sampleRate, double freqHz) {
    const std::size_t N = x.size();
    if (N == 0) return 0.0;
    double re = 0.0;
    double im = 0.0;
    const double w = 2.0 * std::numbers::pi * freqHz / sampleRate;
    const double invNm1 = N > 1 ? 1.0 / static_cast<double>(N - 1) : 0.0;
    for (std::size_t n = 0; n < N; ++n) {
        const double win = 0.5 * (1.0 - std::cos(2.0 * std::numbers::pi * static_cast<double>(n) * invNm1));
        const double s = x[n] * win;
        const double ang = w * static_cast<double>(n);
        re += s * std::cos(ang);
        im -= s * std::sin(ang);
    }
    return (re * re + im * im) / (static_cast<double>(N) * static_cast<double>(N));
}

// Computes full real DFT bin powers for a 4-term Blackman-Harris windowed signal
// (-92 dB sidelobes so spectral leakage never masks true alias floor).
std::vector<double> hannDftPowers(std::span<const double> x) {
    const std::size_t N = x.size();
    const std::size_t bins = N / 2 + 1;
    std::vector<double> windowed(N);
    const double invNm1 = N > 1 ? 1.0 / static_cast<double>(N - 1) : 0.0;
    for (std::size_t n = 0; n < N; ++n) {
        const double t = 2.0 * std::numbers::pi * static_cast<double>(n) * invNm1;
        const double win = 0.35875 - 0.48829 * std::cos(t) + 0.14128 * std::cos(2.0 * t) - 0.01168 * std::cos(3.0 * t);
        windowed[n] = x[n] * win;
    }
    std::vector<double> power(bins, 0.0);
    const double scale = 1.0 / (static_cast<double>(N) * static_cast<double>(N));
    for (std::size_t k = 0; k < bins; ++k) {
        const double w = 2.0 * std::numbers::pi * static_cast<double>(k) / static_cast<double>(N);
        const double cStep = std::cos(w);
        const double sStep = std::sin(w);
        double c = 1.0;
        double s = 0.0;
        double re = 0.0;
        double im = 0.0;
        for (std::size_t n = 0; n < N; ++n) {
            re += windowed[n] * c;
            im -= windowed[n] * s;
            const double cNext = c * cStep - s * sStep;
            const double sNext = s * cStep + c * sStep;
            c = cNext;
            s = sNext;
        }
        power[k] = (re * re + im * im) * scale;
    }
    return power;
}

// Estimates dominant frequency in [minHz, maxHz] via parabolic interpolation on log-magnitude DFT peak.
double estimateDominantHz(std::span<const double> x, double sampleRate, double minHz, double maxHz) {
    const auto powers = hannDftPowers(x);
    const std::size_t N = x.size();
    const std::size_t kMin = std::max<std::size_t>(2, static_cast<std::size_t>(std::floor(minHz * static_cast<double>(N) / sampleRate)));
    const std::size_t kMax = std::min(powers.size() - 2, static_cast<std::size_t>(std::ceil(maxHz * static_cast<double>(N) / sampleRate)));
    std::size_t bestK = kMin;
    for (std::size_t k = kMin + 1; k <= kMax; ++k) {
        if (powers[k] > powers[bestK]) bestK = k;
    }
    const double pM = std::log(std::max(powers[bestK - 1], 1e-30));
    const double p0 = std::log(std::max(powers[bestK], 1e-30));
    const double pP = std::log(std::max(powers[bestK + 1], 1e-30));
    const double denom = pM - 2.0 * p0 + pP;
    const double delta = (std::abs(denom) > 1e-12) ? std::clamp(0.5 * (pM - pP) / denom, -0.5, 0.5) : 0.0;
    return (static_cast<double>(bestK) + delta) * sampleRate / static_cast<double>(N);
}

bool allFinite(std::span<const float> x) {
    return std::all_of(x.begin(), x.end(), [](float v) { return std::isfinite(v); });
}

QJsonObject makeMidiTimelineDoc(const QJsonObject& instrument, const QJsonArray& notes, double bpm = 120.0) {
    return QJsonObject{
        {QStringLiteral("id"), QStringLiteral("tl_bass_test")},
        {QStringLiteral("name"), QStringLiteral("Bass Test")},
        {QStringLiteral("fps"), 30},
        {QStringLiteral("width"), 640},
        {QStringLiteral("height"), 360},
        {QStringLiteral("durationMs"), 10000},
        {QStringLiteral("tempo"), QJsonObject{{QStringLiteral("bpm"), bpm}}},
        {QStringLiteral("tracks"), QJsonArray{
            QJsonObject{
                {QStringLiteral("id"), QStringLiteral("t_bass")},
                {QStringLiteral("name"), QStringLiteral("Bass")},
                {QStringLiteral("type"), QStringLiteral("midi")},
                {QStringLiteral("index"), 0},
                {QStringLiteral("heightPx"), 80},
                {QStringLiteral("visible"), true},
                {QStringLiteral("locked"), false},
                {QStringLiteral("muted"), false},
                {QStringLiteral("solo"), false},
                {QStringLiteral("volumeDb"), 0.0},
                {QStringLiteral("pan"), 0.0},
                {QStringLiteral("instrument"), instrument},
            },
        }},
        {QStringLiteral("clips"), QJsonArray{
            QJsonObject{
                {QStringLiteral("id"), QStringLiteral("c_bass")},
                {QStringLiteral("trackId"), QStringLiteral("t_bass")},
                {QStringLiteral("name"), QStringLiteral("Line")},
                {QStringLiteral("mediaType"), QStringLiteral("midi")},
                {QStringLiteral("startMs"), 0.0},
                {QStringLiteral("durationMs"), 4000.0},
                {QStringLiteral("inPointMs"), 0.0},
                {QStringLiteral("volumeDb"), 0.0},
                {QStringLiteral("notes"), notes},
            },
        }},
    };
}

}  // namespace

class TestBassSynth : public QObject {
    Q_OBJECT

private slots:
    // 1. Alias energy bound for a high sawtooth at 48 kHz.
    void aliasEnergyBoundHighSaw() {
        constexpr double sr = 48000.0;
        BassSynth synth;
        BassSynthParams p{};
        p.waveform = BassWaveform::Saw;
        p.oscLevel = 0.9f;
        p.subLevel = 0.0f;
        p.cutoffHz = 18000.0f;
        p.resonance = 0.0f;
        p.drive = 0.0f;
        p.saturation = 0.0f;
        p.filterEnvAmount = 0.0f;
        p.keyTrack = 0.0f;
        p.attackMs = 0.5f;
        p.sustain = 1.0f;
        p.analogDrift = 0.0f;
        p.gainDb = 0.0f;

        synth.prepare(sr);
        synth.setParams(p);
        synth.snapParams();

        // High saw: MIDI 93 (A6 = 1760 Hz) — demanding aliasing stress test.
        constexpr int midiNote = 93;
        const double f0 = midiToHz(midiNote);
        synth.noteOn(midiNote, 0.78f);

        // Settle transient (2048 frames), then capture 2048 frames for spectral analysis.
        std::vector<float> settle(2048 * 2, 0.0f);
        synth.renderBlock(settle);
        std::vector<float> capture(2048 * 2, 0.0f);
        synth.renderBlock(capture);
        QVERIFY(allFinite(capture));

        const auto mono = extractMono(capture);
        const double rms = rmsSpan(mono);
        QVERIFY2(rms > 0.05, qPrintable(QStringLiteral("High saw silent: rms=%1").arg(rms)));

        const auto powers = hannDftPowers(mono);
        const std::size_t N = mono.size();
        const double binHz = sr / static_cast<double>(N);

        // Mark all bins within +/- 4 bins of true harmonics k * f0 < 22 kHz (Blackman-Harris mainlobe) and DC.
        std::vector<bool> harmonicMask(powers.size(), false);
        for (std::size_t b = 0; b <= 4 && b < harmonicMask.size(); ++b) harmonicMask[b] = true;
        double harmonicEnergy = 0.0;
        for (int h = 1; h * f0 < 22000.0; ++h) {
            const double exactBin = (h * f0) / binHz;
            const auto center = static_cast<std::size_t>(std::llround(exactBin));
            for (int d = -4; d <= 4; ++d) {
                const auto idx = static_cast<std::ptrdiff_t>(center) + d;
                if (idx >= 0 && static_cast<std::size_t>(idx) < harmonicMask.size()) {
                    harmonicMask[static_cast<std::size_t>(idx)] = true;
                }
            }
        }
        double aliasEnergy = 0.0;
        const std::size_t maxBin = static_cast<std::size_t>(std::floor(19000.0 / binHz));
        for (std::size_t k = 1; k <= maxBin && k < powers.size(); ++k) {
            if (harmonicMask[k]) harmonicEnergy += powers[k];
            else aliasEnergy += powers[k];
        }
        QVERIFY(harmonicEnergy > 1e-6);
        const double aliasDb = 10.0 * std::log10(std::max(aliasEnergy, 1e-30) / harmonicEnergy);
        std::fprintf(stderr, "[BassSynth Alias] High saw (1760 Hz @ 48 kHz) alias energy: %.2f dB\n", aliasDb);
        QVERIFY2(aliasDb < -55.0, qPrintable(QStringLiteral("High saw alias energy too high: %1 dB").arg(aliasDb)));
    }

    // 2. Ladder self-oscillation pitch tracking across octaves and sample rates.
    void ladderSelfOscillationPitchTracking() {
        const std::array<double, 4> testCutoffs = {220.0, 440.0, 880.0, 1760.0};
        for (double sr : {44100.0, 48000.0, 96000.0}) {
            for (double cutoff : testCutoffs) {
                // Only check full octave sweep at 48 kHz and 440 Hz at 44.1 / 96 kHz to keep runtime crisp.
                if (sr != 48000.0 && cutoff != 440.0) continue;

                BassSynth synth;
                BassSynthParams p{};
                p.oscLevel = 0.0f;
                p.subLevel = 0.0f;
                p.cutoffHz = static_cast<float>(cutoff);
                p.resonance = 1.0f;
                p.drive = 0.0f;
                p.saturation = 0.0f;
                p.filterEnvAmount = 0.0f;
                p.keyTrack = 0.0f;
                p.attackMs = 0.5f;
                p.sustain = 1.0f;
                p.analogDrift = 0.0f;
                p.gainDb = 0.0f;

                synth.prepare(sr);
                synth.setParams(p);
                synth.snapParams();
                synth.noteOn(60, 0.78f);

                // Let self-oscillation build up and stabilize (~250 ms).
                const std::size_t settleFrames = static_cast<std::size_t>(sr * 0.25);
                std::vector<float> settle(settleFrames * 2, 0.0f);
                synth.renderBlock(settle);

                constexpr std::size_t capFrames = 4096;
                std::vector<float> capture(capFrames * 2, 0.0f);
                synth.renderBlock(capture);
                QVERIFY(allFinite(capture));

                const auto mono = extractMono(capture);
                const double rms = rmsSpan(mono);
                QVERIFY2(rms > 0.02, qPrintable(QStringLiteral(
                    "Ladder did not self-oscillate at sr=%1 cutoff=%2: rms=%3").arg(sr).arg(cutoff).arg(rms)));

                const double measuredHz = estimateDominantHz(mono, sr, cutoff * 0.5, cutoff * 2.0);
                const double centsErr = 1200.0 * std::log2(measuredHz / cutoff);
                QVERIFY2(std::abs(centsErr) < 25.0, qPrintable(QStringLiteral(
                    "Self-oscillation pitch tracking error at sr=%1 target=%2 Hz: measured=%3 Hz (%4 cents)")
                    .arg(sr).arg(cutoff).arg(measuredHz).arg(centsErr)));
            }
        }
    }

    // 3. Resonance bass gain compensation: passband level must not collapse at high resonance.
    void resonanceGainCompensation() {
        constexpr double sr = 48000.0;
        auto measureFundamentalAtRes = [&](float res) {
            BassSynth synth;
            BassSynthParams p{};
            p.waveform = BassWaveform::Triangle;
            p.oscLevel = 0.8f;
            p.subLevel = 0.0f;
            p.cutoffHz = 1200.0f;
            p.resonance = res;
            p.drive = 0.0f;
            p.saturation = 0.0f;
            p.filterEnvAmount = 0.0f;
            p.keyTrack = 0.0f;
            p.attackMs = 1.0f;
            p.sustain = 1.0f;
            p.analogDrift = 0.0f;
            p.gainDb = -6.0f;

            synth.prepare(sr);
            synth.setParams(p);
            synth.snapParams();
            synth.noteOn(33, 0.78f);  // A1 = 55 Hz, well below 1200 Hz cutoff.

            std::vector<float> settle(4800 * 2, 0.0f);
            synth.renderBlock(settle);
            std::vector<float> capture(4096 * 2, 0.0f);
            synth.renderBlock(capture);
            const auto mono = extractMono(capture);
            return std::sqrt(dftPowerAtHz(mono, sr, 55.0));
        };

        const double magLowRes = measureFundamentalAtRes(0.0f);
        const double magHighRes = measureFundamentalAtRes(0.85f);
        QVERIFY2(magLowRes > 0.02, qPrintable(QStringLiteral("Passband too quiet at res=0: %1").arg(magLowRes)));
        const double dropDb = 20.0 * std::log10(std::max(magHighRes, 1e-12) / magLowRes);
        // Uncompensated 4-pole ladder drops ~12.9 dB at k=3.4; compensated stays within [-3.5, +3.0] dB.
        QVERIFY2(dropDb > -3.5 && dropDb < 3.0, qPrintable(QStringLiteral(
            "Resonance bass compensation out of range: %1 dB (low=%2 high=%3)")
            .arg(dropDb).arg(magLowRes).arg(magHighRes)));
    }

    // 4. Constant-time legato slide (independent of semitone interval).
    void slideTimeConstantAcrossIntervals() {
        constexpr double sr = 48000.0;
        constexpr float slideMs = 80.0f;
        const std::size_t oneTauFrames = static_cast<std::size_t>(std::llround(sr * slideMs / 1000.0));
        const std::size_t settleFrames = oneTauFrames * 6;

        auto measureSlideFraction = [&](int fromNote, int toNote) {
            BassSynth synth;
            BassSynthParams p{};
            p.slideMs = slideMs;
            p.retrigger = false;
            p.analogDrift = 0.0f;
            p.sustain = 1.0f;
            synth.prepare(sr);
            synth.setParams(p);
            synth.snapParams();

            synth.noteOn(fromNote, 0.78f);
            std::vector<float> buf(512 * 2, 0.0f);
            synth.renderBlock(buf);

            // Trigger overlapping legato note.
            synth.noteOn(toNote, 0.78f);
            std::vector<float> tauBuf(oneTauFrames * 2, 0.0f);
            synth.renderBlock(tauBuf);
            const double pitchAtTau = synth.currentPitchNote();
            const double fracAtTau = (pitchAtTau - static_cast<double>(fromNote)) /
                                     static_cast<double>(toNote - fromNote);

            std::vector<float> tailBuf(settleFrames * 2, 0.0f);
            synth.renderBlock(tailBuf);
            const double pitchEnd = synth.currentPitchNote();
            return std::pair{fracAtTau, pitchEnd};
        };

        const auto [fracSmall, endSmall] = measureSlideFraction(36, 38);   // +2 semitones
        const auto [fracLarge, endLarge] = measureSlideFraction(36, 48);   // +12 semitones

        // Exponential RC constant-time: at t = tau, fraction = 1 - 1/e ≈ 0.632.
        const double expected = 1.0 - std::exp(-1.0);
        QVERIFY2(std::abs(fracSmall - expected) < 0.08, qPrintable(QStringLiteral(
            "Small-interval slide fraction at 1*tau = %1 (expected ~%2)").arg(fracSmall).arg(expected)));
        QVERIFY2(std::abs(fracLarge - expected) < 0.08, qPrintable(QStringLiteral(
            "Large-interval slide fraction at 1*tau = %1 (expected ~%2)").arg(fracLarge).arg(expected)));
        QVERIFY2(std::abs(fracSmall - fracLarge) < 0.03, qPrintable(QStringLiteral(
            "Slide not constant-time across intervals: small=%1 large=%2").arg(fracSmall).arg(fracLarge)));
        QVERIFY2(std::abs(endSmall - 38.0) < 0.05, qPrintable(QStringLiteral("Small slide did not converge: %1").arg(endSmall)));
        QVERIFY2(std::abs(endLarge - 48.0) < 0.05, qPrintable(QStringLiteral("Large slide did not converge: %1").arg(endLarge)));
    }

    // 5. Legato without envelope retrigger when retrigger == false; retriggers when retrigger == true.
    void legatoWithoutEnvelopeRetrigger() {
        constexpr double sr = 48000.0;
        auto runCase = [&](bool retrigger) {
            BassSynth synth;
            BassSynthParams p{};
            p.attackMs = 1.0f;
            p.decayMs = 35.0f;
            p.sustain = 0.35f;
            p.filterAttackMs = 1.0f;
            p.filterDecayMs = 35.0f;
            p.filterSustain = 0.0f;
            p.filterEnvAmount = 3.5f;
            p.slideMs = 50.0f;
            p.retrigger = retrigger;
            p.analogDrift = 0.0f;
            synth.prepare(sr);
            synth.setParams(p);
            synth.snapParams();

            synth.noteOn(36, 0.78f);
            // Hold 250 ms so both envelopes settle to sustain.
            std::vector<float> hold(static_cast<std::size_t>(sr * 0.25) * 2, 0.0f);
            synth.renderBlock(hold);
            const double ampBefore = synth.ampEnvelopeLevel();
            const double fltBefore = synth.filterEnvelopeLevel();

            // Overlapping note (legato).
            synth.noteOn(43, 0.78f);
            // Sample envelope peak over the next 10 ms.
            double ampPeak = 0.0;
            double fltPeak = 0.0;
            std::vector<float> chunk(32 * 2, 0.0f);
            for (int i = 0; i < 16; ++i) {
                std::fill(chunk.begin(), chunk.end(), 0.0f);
                synth.renderBlock(chunk);
                ampPeak = std::max(ampPeak, synth.ampEnvelopeLevel());
                fltPeak = std::max(fltPeak, synth.filterEnvelopeLevel());
            }
            return std::tuple{ampBefore, fltBefore, ampPeak, fltPeak};
        };

        const auto [ampB0, fltB0, ampP0, fltP0] = runCase(false);
        QVERIFY2(ampB0 > 0.25 && ampB0 < 0.45, qPrintable(QStringLiteral("Amp did not settle to sustain: %1").arg(ampB0)));
        QVERIFY2(fltB0 < 0.05, qPrintable(QStringLiteral("Filter env did not decay: %1").arg(fltB0)));
        QVERIFY2(ampP0 < 0.45, qPrintable(QStringLiteral("Legato retriggered amp env: peak=%1").arg(ampP0)));
        QVERIFY2(fltP0 < 0.08, qPrintable(QStringLiteral("Legato retriggered filter env: peak=%1").arg(fltP0)));

        const auto [ampB1, fltB1, ampP1, fltP1] = runCase(true);
        (void)ampB1;
        (void)fltB1;
        QVERIFY2(ampP1 > 0.75, qPrintable(QStringLiteral("Retrigger=true did not retrigger amp env: peak=%1").arg(ampP1)));
        QVERIFY2(fltP1 > 0.65, qPrintable(QStringLiteral("Retrigger=true did not retrigger filter env: peak=%1").arg(fltP1)));
    }

    // 6. Accent boost from velocity (louder + brighter filter sweep + accent-aware slide).
    void accentBoostFromVelocity() {
        constexpr double sr = 48000.0;
        BassSynthParams p{};
        p.waveform = BassWaveform::Saw;
        p.oscLevel = 0.85f;
        p.subLevel = 0.2f;
        p.cutoffHz = 260.0f;
        p.resonance = 0.55f;
        p.drive = 0.3f;
        p.filterEnvAmount = 2.6f;
        p.filterAttackMs = 1.0f;
        p.filterDecayMs = 220.0f;
        p.attackMs = 1.0f;
        p.decayMs = 300.0f;
        p.sustain = 0.6f;
        p.accentAmount = 0.85f;
        p.accentVelocity = 100;
        p.slideMs = 60.0f;
        p.analogDrift = 0.0f;

        auto renderNote = [&](float vel) {
            BassSynth synth;
            synth.prepare(sr);
            synth.setParams(p);
            synth.snapParams();
            synth.noteOn(36, vel);
            std::vector<float> buf(4096 * 2, 0.0f);
            synth.renderBlock(buf);
            const auto mono = extractMono(buf);
            const double rms = rmsSpan(mono);
            // High-frequency energy (above 900 Hz) captures the brighter accented filter sweep.
            const auto powers = hannDftPowers(std::span<const double>(mono.data(), 2048));
            const double binHz = sr / 2048.0;
            double hfEnergy = 0.0;
            for (std::size_t k = static_cast<std::size_t>(900.0 / binHz); k < powers.size(); ++k) {
                hfEnergy += powers[k];
            }
            return std::tuple{rms, hfEnergy, synth.isAccented()};
        };

        const auto [plainRms, plainHf, plainAcc] = renderNote(0.65f);   // MIDI ~83 < 100
        const auto [accRms, accHf, accFlag] = renderNote(0.95f);        // MIDI ~121 >= 100

        QVERIFY(!plainAcc);
        QVERIFY(accFlag);
        QVERIFY2(accRms > plainRms * 1.25, qPrintable(QStringLiteral(
            "Accent did not boost level enough: plain=%1 acc=%2").arg(plainRms).arg(accRms)));
        QVERIFY2(accHf > plainHf * 1.5, qPrintable(QStringLiteral(
            "Accent did not brighten filter sweep enough: plainHf=%1 accHf=%2").arg(plainHf).arg(accHf)));

        // Accent-aware 303 slide: plain note -> overlapping accented slide target boosts smoothly.
        BassSynth slideSynth;
        slideSynth.prepare(sr);
        slideSynth.setParams(p);
        slideSynth.snapParams();
        slideSynth.noteOn(36, 0.65f);
        std::vector<float> before(4096 * 2, 0.0f);
        slideSynth.renderBlock(before);
        const double preSlideRms = rmsSpan(extractMono(std::span<const float>(before.data() + 2048 * 2, 2048 * 2)));
        QVERIFY(!slideSynth.isAccented());

        slideSynth.noteOn(43, 0.95f);  // Accented legato slide!
        QVERIFY(slideSynth.isAccented());
        std::vector<float> after(4096 * 2, 0.0f);
        slideSynth.renderBlock(after);
        const double postSlideRms = rmsSpan(extractMono(std::span<const float>(after.data() + 1024 * 2, 2048 * 2)));
        QVERIFY2(postSlideRms > preSlideRms * 1.15, qPrintable(QStringLiteral(
            "Accented legato slide did not boost output: pre=%1 post=%2").arg(preSlideRms).arg(postSlideRms)));
    }

    // 7. Monophonic last-note priority and note stack.
    void noteStackLastNotePriority() {
        BassSynth synth;
        synth.prepare(48000.0);

        QCOMPARE(synth.heldNoteCount(), 0);
        QCOMPARE(synth.activeMidiNote(), -1);
        QVERIFY(!synth.isGateOpen());

        synth.noteOn(36, 0.75f);  // C2
        QCOMPARE(synth.heldNoteCount(), 1);
        QCOMPARE(synth.activeMidiNote(), 36);
        QVERIFY(synth.isGateOpen());

        synth.noteOn(40, 0.75f);  // E2
        QCOMPARE(synth.heldNoteCount(), 2);
        QCOMPARE(synth.activeMidiNote(), 40);

        synth.noteOn(43, 0.75f);  // G2
        QCOMPARE(synth.heldNoteCount(), 3);
        QCOMPARE(synth.activeMidiNote(), 43);

        // Release top note G2 -> falls back to E2.
        synth.noteOff(43);
        QCOMPARE(synth.heldNoteCount(), 2);
        QCOMPARE(synth.activeMidiNote(), 40);
        QVERIFY(synth.isGateOpen());

        // Release bottom note C2 -> E2 remains active.
        synth.noteOff(36);
        QCOMPARE(synth.heldNoteCount(), 1);
        QCOMPARE(synth.activeMidiNote(), 40);
        QVERIFY(synth.isGateOpen());

        // Release last held note E2 -> gate closes.
        synth.noteOff(40);
        QCOMPARE(synth.heldNoteCount(), 0);
        QCOMPARE(synth.activeMidiNote(), -1);
        QVERIFY(!synth.isGateOpen());
    }

    // 8. No clicks on retrigger (including accent <-> plain transitions and retrigger over active notes).
    void noClicksOnRetrigger() {
        constexpr double sr = 48000.0;
        BassSynth synth;
        BassSynthParams p{};
        p.waveform = BassWaveform::Saw;
        p.oscLevel = 0.85f;
        p.subLevel = 0.5f;
        p.cutoffHz = 600.0f;
        p.resonance = 0.5f;
        p.filterEnvAmount = 2.5f;
        p.attackMs = 1.5f;
        p.decayMs = 200.0f;
        p.sustain = 0.8f;
        p.releaseMs = 100.0f;
        p.accentAmount = 0.85f;
        p.retrigger = true;
        p.analogDrift = 0.2f;
        synth.prepare(sr);
        synth.setParams(p);
        synth.snapParams();

        // Render a steady accented note first to establish natural max waveform slope.
        synth.noteOn(36, 0.98f);
        std::vector<float> steady(2048 * 2, 0.0f);
        synth.renderBlock(steady);
        const auto steadyMono = extractMono(steady);
        double steadyMaxDiff = 0.0;
        for (std::size_t i = 256; i < steadyMono.size(); ++i) {
            steadyMaxDiff = std::max(steadyMaxDiff, std::abs(steadyMono[i] - steadyMono[i - 1]));
        }
        QVERIFY2(steadyMaxDiff > 0.005, qPrintable(QStringLiteral("Steady note silent: %1").arg(steadyMaxDiff)));

        // Now hammer rapid retriggers: accented -> plain -> accented -> release -> retrigger mid-release.
        std::vector<float> stream(8192 * 2, 0.0f);
        const std::array<BassSynth::NoteEvent, 8> events{{
            {0, BassSynth::EventKind::NoteOn, 36, 0.98f, 1.0f},
            {1000, BassSynth::EventKind::NoteOn, 43, 0.55f, 1.0f},   // accent -> plain retrigger
            {2000, BassSynth::EventKind::NoteOn, 38, 0.98f, 1.0f},   // plain -> accent retrigger
            {3000, BassSynth::EventKind::NoteOff, 36, 0.0f, 1.0f},
            {3000, BassSynth::EventKind::NoteOff, 43, 0.0f, 1.0f},
            {3000, BassSynth::EventKind::NoteOff, 38, 0.0f, 1.0f},
            {3400, BassSynth::EventKind::NoteOn, 41, 0.90f, 1.0f},   // retrigger mid-release
            {5000, BassSynth::EventKind::NoteOn, 36, 0.50f, 1.0f},
        }};
        synth.renderBlock(stream, events);
        QVERIFY(allFinite(stream));

        const auto mono = extractMono(stream);
        double maxRetriggerJump = 0.0;
        for (const int boundary : {1000, 2000, 3400, 5000}) {
            for (int offset = -4; offset <= 16; ++offset) {
                const auto idx = static_cast<std::size_t>(boundary + offset);
                if (idx > 0 && idx < mono.size()) {
                    maxRetriggerJump = std::max(maxRetriggerJump, std::abs(mono[idx] - mono[idx - 1]));
                }
            }
        }
        const double bound = std::max(0.20, steadyMaxDiff * 2.5 + 0.05);
        QVERIFY2(maxRetriggerJump < bound, qPrintable(QStringLiteral(
            "Click detected on retrigger: maxJump=%1 bound=%2 (steadyMaxDiff=%3)")
            .arg(maxRetriggerJump).arg(bound).arg(steadyMaxDiff)));
    }

    // 9. Waveforms (PWM, Triangle), Sub oscillator, Hard Sync, Drift, Denormals, and 44.1/48/96 kHz.
    void waveformsPwmSubHardSyncDriftAndRates() {
        constexpr double sr = 48000.0;

        // PWM changes 2nd harmonic dramatically (square 50% has near-zero 2nd harmonic; 25% has strong 2nd).
        auto measure2ndTo1st = [&](float pw) {
            BassSynth synth;
            BassSynthParams p{};
            p.waveform = BassWaveform::Square;
            p.pulseWidth = pw;
            p.oscLevel = 0.9f;
            p.subLevel = 0.0f;
            p.cutoffHz = 16000.0f;
            p.resonance = 0.0f;
            p.drive = 0.0f;
            p.saturation = 0.0f;
            p.filterEnvAmount = 0.0f;
            p.analogDrift = 0.0f;
            p.sustain = 1.0f;
            synth.prepare(sr);
            synth.setParams(p);
            synth.snapParams();
            synth.noteOn(48, 0.78f);  // C3 = 130.81 Hz
            std::vector<float> settle(2048 * 2, 0.0f);
            synth.renderBlock(settle);
            std::vector<float> cap(4096 * 2, 0.0f);
            synth.renderBlock(cap);
            const auto mono = extractMono(cap);
            const double f0 = midiToHz(48);
            const double p1 = dftPowerAtHz(mono, sr, f0);
            const double p2 = dftPowerAtHz(mono, sr, 2.0 * f0);
            return p2 / std::max(p1, 1e-18);
        };
        const double ratio50 = measure2ndTo1st(0.50f);
        const double ratio25 = measure2ndTo1st(0.25f);
        QVERIFY2(ratio50 < 0.02, qPrintable(QStringLiteral("50% square had strong 2nd harmonic: %1").arg(ratio50)));
        QVERIFY2(ratio25 > 0.15, qPrintable(QStringLiteral("25% pulse lacked 2nd harmonic: %1").arg(ratio25)));

        // Sub oscillator (-1 oct) puts strong energy at f0 / 2.
        {
            BassSynth synth;
            BassSynthParams p{};
            p.waveform = BassWaveform::Saw;
            p.oscLevel = 0.5f;
            p.subLevel = 0.9f;
            p.subOctave = -1;
            p.cutoffHz = 8000.0f;
            p.resonance = 0.0f;
            p.drive = 0.0f;
            p.saturation = 0.0f;
            p.filterEnvAmount = 0.0f;
            p.analogDrift = 0.0f;
            p.sustain = 1.0f;
            synth.prepare(sr);
            synth.setParams(p);
            synth.snapParams();
            synth.noteOn(48, 0.78f);
            std::vector<float> settle(2048 * 2, 0.0f);
            synth.renderBlock(settle);
            std::vector<float> cap(4096 * 2, 0.0f);
            synth.renderBlock(cap);
            const auto mono = extractMono(cap);
            const double fSub = midiToHz(36);
            const double pSub = dftPowerAtHz(mono, sr, fSub);
            QVERIFY2(pSub > 1e-4, qPrintable(QStringLiteral("Sub oscillator energy missing at f0/2: %1").arg(pSub)));
        }

        // Hard sync adds distinct upper harmonic energy.
        auto measureHighEnergy = [&](bool syncOn) {
            BassSynth synth;
            BassSynthParams p{};
            p.waveform = BassWaveform::Saw;
            p.oscLevel = 0.85f;
            p.subLevel = 0.0f;
            p.hardSync = syncOn;
            p.syncSemitones = 19.0f;  // +octave + fifth
            p.cutoffHz = 12000.0f;
            p.resonance = 0.0f;
            p.drive = 0.0f;
            p.saturation = 0.0f;
            p.filterEnvAmount = 0.0f;
            p.analogDrift = 0.0f;
            p.sustain = 1.0f;
            synth.prepare(sr);
            synth.setParams(p);
            synth.snapParams();
            synth.noteOn(36, 0.78f);
            std::vector<float> settle(2048 * 2, 0.0f);
            synth.renderBlock(settle);
            std::vector<float> cap(2048 * 2, 0.0f);
            synth.renderBlock(cap);
            const auto mono = extractMono(cap);
            // Energy near slave pitch (~3 * f0) vs fundamental.
            const double f0 = midiToHz(36);
            const double fSlave = midiToHz(36 + 19);
            return dftPowerAtHz(mono, sr, fSlave) / std::max(dftPowerAtHz(mono, sr, f0), 1e-12);
        };
        const double noSyncRatio = measureHighEnergy(false);
        const double syncRatio = measureHighEnergy(true);
        QVERIFY2(syncRatio > noSyncRatio * 2.0, qPrintable(QStringLiteral(
            "Hard sync did not emphasize slave harmonic: off=%1 on=%2").arg(noSyncRatio).arg(syncRatio)));

        // Sample rates 44.1 / 48 / 96 kHz + long release tail denormal safety.
        for (double rate : {44100.0, 48000.0, 96000.0}) {
            BassSynth synth;
            BassSynthParams p{};
            p.releaseMs = 20.0f;
            synth.prepare(rate);
            synth.setParams(p);
            synth.snapParams();
            synth.noteOn(36, 0.8f);
            std::vector<float> onBuf(static_cast<std::size_t>(rate * 0.05) * 2, 0.0f);
            synth.renderBlock(onBuf);
            QVERIFY(allFinite(onBuf));
            QVERIFY(peakAbsSpan(onBuf) > 0.05);

            synth.noteOff(36);
            std::vector<float> tailBuf(static_cast<std::size_t>(rate * 0.4) * 2, 0.0f);
            synth.renderBlock(tailBuf);
            QVERIFY(allFinite(tailBuf));
            const auto tailEnd = std::span<const float>(tailBuf.data() + tailBuf.size() - 256, 256);
            QVERIFY2(peakAbsSpan(tailEnd) < 1e-4, qPrintable(QStringLiteral(
                "Release tail did not decay cleanly at %1 Hz: peak=%2").arg(rate).arg(peakAbsSpan(tailEnd))));
        }
    }

    // 10. Curated presets (12-16) and document edits round-trip.
    void presetsAndEditsRoundTrip() {
        const auto& presets = factoryBassPresets();
        QVERIFY2(presets.size() >= 12 && presets.size() <= 16,
                 qPrintable(QStringLiteral("Expected 12..16 curated presets, got %1").arg(presets.size())));

        std::set<std::string> ids;
        for (const auto& preset : presets) {
            QVERIFY(!preset.id.empty());
            QVERIFY(!preset.name.empty());
            QVERIFY2(ids.insert(std::string(preset.id)).second,
                     qPrintable(QStringLiteral("Duplicate preset ID: %1").arg(QString::fromUtf8(preset.id))));
            QCOMPARE(findBassPreset(preset.id), &preset);

            // Round-trip through JSON.
            const QJsonObject json = bassParamsToJson(preset.params, QString::fromUtf8(preset.id));
            QCOMPARE(json.value(u"type").toString(), QStringLiteral("bass"));
            const BassSynthParams parsed = bassParamsFromJson(json);
            QCOMPARE(parsed.waveform, preset.params.waveform);
            QVERIFY(std::abs(parsed.cutoffHz - preset.params.cutoffHz) < 0.5f);
            QVERIFY(std::abs(parsed.resonance - preset.params.resonance) < 0.01f);
            QVERIFY(std::abs(parsed.subLevel - preset.params.subLevel) < 0.01f);
            QCOMPARE(parsed.hardSync, preset.params.hardSync);

            // Render each preset and confirm non-silent finite output.
            BassSynth synth;
            synth.prepare(48000.0);
            synth.setParams(preset.params);
            synth.snapParams();
            synth.noteOn(36, 0.85f);
            std::vector<float> buf(2048 * 2, 0.0f);
            synth.renderBlock(buf);
            QVERIFY(allFinite(buf));
            QVERIFY2(peakAbsSpan(buf) > 0.03,
                     qPrintable(QStringLiteral("Preset %1 rendered silent").arg(QString::fromUtf8(preset.id))));
        }

        // Verify key web BL-1 IDs exist.
        for (const char* expectedId : {"bl1-acid", "bl1-deep", "bl1-rubber", "bl1-clean-sub",
                                       "bl1-808-glide", "bl1-plucked-wire", "bl1-cinematic-sub"}) {
            QVERIFY2(findBassPreset(expectedId) != nullptr,
                     qPrintable(QStringLiteral("Missing expected web BL-1 preset ID: %1").arg(expectedId)));
        }

        // Verify document edits (bass.setPreset and bass.setParams).
        QJsonObject doc = makeMidiTimelineDoc(QJsonObject{{QStringLiteral("type"), QStringLiteral("subtractive")}}, QJsonArray{});
        const QJsonObject afterPreset = setBassPresetEdit(doc, QJsonObject{
            {QStringLiteral("trackId"), QStringLiteral("t_bass")},
            {QStringLiteral("preset"), QStringLiteral("bl1-acid")},
        });
        const auto inst1 = afterPreset.value(u"tracks").toArray().at(0).toObject().value(u"instrument").toObject();
        QCOMPARE(inst1.value(u"type").toString(), QStringLiteral("bass"));
        QCOMPARE(inst1.value(u"preset").toString(), QStringLiteral("bl1-acid"));

        const QJsonObject afterPatch = setBassParamsEdit(afterPreset, QJsonObject{
            {QStringLiteral("trackId"), QStringLiteral("t_bass")},
            {QStringLiteral("waveform"), QStringLiteral("square")},
            {QStringLiteral("cutoffHz"), 920.0},
            {QStringLiteral("resonance"), 0.72},
            {QStringLiteral("hardSync"), true},
            {QStringLiteral("slideMs"), 110.0},
        });
        const auto inst2 = afterPatch.value(u"tracks").toArray().at(0).toObject().value(u"instrument").toObject();
        QCOMPARE(inst2.value(u"waveform").toString(), QStringLiteral("square"));
        QCOMPARE(inst2.value(u"cutoffHz").toDouble(), 920.0);
        QCOMPARE(inst2.value(u"hardSync").toBool(), true);
        QCOMPARE(inst2.value(u"slideMs").toDouble(), 110.0);
    }

    // 11. BlockProcessor sample-accurate MIDI, legato overlap, and setParameter automation.
    void blockProcessorSampleAccurateMidi() {
        const auto* acid = findBassPreset("bl1-acid");
        QVERIFY(acid != nullptr);
        const QJsonObject inst = bassParamsToJson(acid->params, QStringLiteral("bl1-acid"));

        // At 120 BPM, 1 beat = 500 ms = 960 ticks.
        // Note 1: starts at tick 48 (25.0 ms = frame 1200 at 48 kHz), lasts 600 ms (overlaps note 2).
        // Note 2: starts at 400 ms (tick 768), accented velocity 120, lasts 400 ms.
        const QJsonArray notes{
            QJsonObject{
                {QStringLiteral("id"), QStringLiteral("n1")},
                {QStringLiteral("pitch"), 36},
                {QStringLiteral("startTick"), 48},
                {QStringLiteral("durationTick"), 1152},
                {QStringLiteral("velocity"), 80},
            },
            QJsonObject{
                {QStringLiteral("id"), QStringLiteral("n2")},
                {QStringLiteral("pitch"), 43},
                {QStringLiteral("startTick"), 768},
                {QStringLiteral("durationTick"), 768},
                {QStringLiteral("velocity"), 120},
            },
        };
        const QJsonObject doc = makeMidiTimelineDoc(inst, notes, 120.0);
        const auto parsed = nt::parseTimelineJson(QJsonDocument(doc).toJson(QJsonDocument::Compact));
        QVERIFY(parsed.timeline.has_value());

        BassSynthProcessor proc(*parsed.timeline, parsed.timeline->tracks.at(0));
        QCOMPARE(proc.id, std::string("instrument"));
        QVERIFY(proc.hasPendingOutput(0));

        constexpr double sr = 48000.0;
        proc.prepare(sr);
        constexpr int blockFrames = 128;
        const double msPerFrame = 1000.0 / sr;

        // Render 0..2000 frames (41.67 ms): onset is at exactly frame 1200 (25.0 ms).
        std::vector<float> pcm(2048 * 2, 0.0f);
        for (int f = 0; f < 2048; f += blockFrames) {
            nt::audio::BlockContext ctx{sr, static_cast<double>(f) * msPerFrame, msPerFrame, false, 0};
            proc.process(std::span<float>(pcm.data() + static_cast<std::size_t>(f) * 2,
                                          static_cast<std::size_t>(blockFrames) * 2), ctx);
        }
        QVERIFY(allFinite(pcm));

        // Strictly silent before frame 1200, sounding shortly after frame 1200.
        const double prePeak = peakAbsSpan(std::span<const float>(pcm.data(), 1198 * 2));
        const double postPeak = peakAbsSpan(std::span<const float>(pcm.data() + 1200 * 2, 512 * 2));
        QVERIFY2(prePeak < 1e-6, qPrintable(QStringLiteral("Signal before sample-accurate onset: %1").arg(prePeak)));
        QVERIFY2(postPeak > 0.03, qPrintable(QStringLiteral("No signal after sample-accurate onset: %1").arg(postPeak)));

        // Automation parameter setter works on audio thread.
        QVERIFY(proc.setParameter("cutoffHz", 1800.0));
        QVERIFY(proc.setParameter("filter.cutoff", 1200.0));
        QVERIFY(proc.setParameter("resonance", 0.45));
        QVERIFY(!proc.setParameter("cutoffHz", std::numeric_limits<double>::quiet_NaN()));
    }

    // 12. Zero audio-thread heap allocations (TestAllocationCounter.h),
    //     including chaseAt() forward/backward seeks and active clip fade envelopes.
    void zeroAudioThreadAllocations() {
        QVERIFY2(nt::testing::countsAnAllocation(), "Allocation counter control check failed");

        const auto* syncPreset = findBassPreset("bl1-sync-lead");
        QVERIFY(syncPreset != nullptr);
        const QJsonObject inst = bassParamsToJson(syncPreset->params, QStringLiteral("bl1-sync-lead"));
        const QJsonArray notes{
            QJsonObject{{QStringLiteral("id"), QStringLiteral("n1")}, {QStringLiteral("pitch"), 36},
                        {QStringLiteral("startTick"), 0}, {QStringLiteral("durationTick"), 960}, {QStringLiteral("velocity"), 90}},
            QJsonObject{{QStringLiteral("id"), QStringLiteral("n2")}, {QStringLiteral("pitch"), 48},
                        {QStringLiteral("startTick"), 480}, {QStringLiteral("durationTick"), 960}, {QStringLiteral("velocity"), 122}},
            QJsonObject{{QStringLiteral("id"), QStringLiteral("n3")}, {QStringLiteral("pitch"), 41},
                        {QStringLiteral("startTick"), 1920}, {QStringLiteral("durationTick"), 960}, {QStringLiteral("velocity"), 100}},
        };
        QJsonObject doc = makeMidiTimelineDoc(inst, notes, 120.0);
        // Enable clip fade-in and fade-out to exercise the fade render path under allocation tracking.
        QJsonArray clips = doc.value(u"clips").toArray();
        QJsonObject clip0 = clips[0].toObject();
        clip0.insert(QStringLiteral("fadeInMs"), 40.0);
        clip0.insert(QStringLiteral("fadeOutMs"), 60.0);
        clips[0] = clip0;
        doc.insert(QStringLiteral("clips"), clips);

        const auto parsed = nt::parseTimelineJson(QJsonDocument(doc).toJson(QJsonDocument::Compact));
        QVERIFY(parsed.timeline.has_value());

        BassSynthProcessor proc(*parsed.timeline, parsed.timeline->tracks.at(0));
        proc.prepare(48000.0);

        BassSynth direct;
        direct.prepare(48000.0);
        direct.setParams(syncPreset->params);
        direct.snapParams();

        std::array<float, 256> stereo{};
        const double msPerFrame = 1000.0 / 48000.0;

        nt::testing::allocations = 0;
        nt::testing::countAllocations = true;

        for (int b = 0; b < 64; ++b) {
            stereo.fill(0.0f);
            nt::audio::BlockContext ctx{48000.0, static_cast<double>(b * 128) * msPerFrame, msPerFrame, false, 0};
            proc.process(stereo, ctx);
            if (b == 10) (void)proc.setParameter("cutoffHz", 1600.0);
            if (b == 20) (void)proc.setParameter("resonance", 0.75);
        }
        // Forward seek into held note n3 (1100 ms) and backward seek into overlapping n1+n2 (300 ms).
        stereo.fill(0.0f);
        proc.process(stereo, nt::audio::BlockContext{48000.0, 1100.0, msPerFrame, false, 0});
        const double seekFwdPeak = peakAbsSpan(stereo);
        stereo.fill(0.0f);
        proc.process(stereo, nt::audio::BlockContext{48000.0, 300.0, msPerFrame, false, 0});
        const double seekBackPeak = peakAbsSpan(stereo);
        proc.reset();

        const std::array<BassSynth::NoteEvent, 3> evs{{
            {0, BassSynth::EventKind::NoteOn, 36, 0.7f, 1.0f},
            {40, BassSynth::EventKind::NoteOn, 43, 0.95f, 1.0f},
            {100, BassSynth::EventKind::NoteOff, 43, 0.0f, 1.0f},
        }};
        stereo.fill(0.0f);
        direct.renderBlock(stereo, evs);
        direct.setParameter("cutoffHz", 900.0);
        direct.reset();

        nt::testing::countAllocations = false;
        const std::size_t allocs = nt::testing::allocations;
        QCOMPARE(allocs, std::size_t{0});
        QVERIFY2(seekFwdPeak > 0.01, qPrintable(QStringLiteral("chaseAt forward seek silent: %1").arg(seekFwdPeak)));
        QVERIFY2(seekBackPeak > 0.01, qPrintable(QStringLiteral("chaseAt backward seek silent: %1").arg(seekBackPeak)));
    }

    // 13. CPU bound: 1000 x 512-frame blocks at 48 kHz (10.67 s audio) with all DSP stages active.
    void cpuBound() {
        constexpr double sr = 48000.0;
        constexpr std::size_t blockFrames = 512;
        constexpr int numBlocks = 1000;

        BassSynth synth;
        BassSynthParams p{};
        p.waveform = BassWaveform::Saw;
        p.oscLevel = 0.85f;
        p.hardSync = true;
        p.syncSemitones = 14.0f;
        p.subLevel = 0.6f;
        p.subShape = BassSubShape::Square;
        p.cutoffHz = 420.0f;
        p.resonance = 0.75f;
        p.drive = 0.55f;
        p.filterEnvAmount = 3.2f;
        p.saturation = 0.35f;
        p.slideMs = 60.0f;

        synth.prepare(sr);
        synth.setParams(p);
        synth.snapParams();
        synth.noteOn(36, 0.95f);

        std::array<float, blockFrames * 2> stereo{};
        // Warm up caches.
        for (int i = 0; i < 16; ++i) {
            stereo.fill(0.0f);
            synth.renderBlock(stereo);
        }

        const auto t0 = std::chrono::steady_clock::now();
        double sink = 0.0;
        for (int b = 0; b < numBlocks; ++b) {
            stereo.fill(0.0f);
            if ((b % 32) == 0) {
                const int nextNote = 36 + ((b / 32) % 12);
                synth.noteOn(nextNote, (b % 64) == 0 ? 0.95f : 0.70f);
            }
            synth.renderBlock(stereo);
            sink += static_cast<double>(stereo[0]);
        }
        const auto t1 = std::chrono::steady_clock::now();
        (void)sink;

        const double elapsedUs = std::chrono::duration<double, std::micro>(t1 - t0).count();
        const double usPerBlock = elapsedUs / static_cast<double>(numBlocks);
        const double blockDurationUs = (static_cast<double>(blockFrames) / sr) * 1e6;
        const double cpuPct = 100.0 * usPerBlock / blockDurationUs;

        std::fprintf(stderr, "[BassSynth CPU] %.2f us / 512-frame block @ 48 kHz (%.2f%% real-time)\n",
                     usPerBlock, cpuPct);
        // Must stay comfortably below 15% of real-time even in debug/unoptimized builds.
        QVERIFY2(cpuPct < 15.0, qPrintable(QStringLiteral("CPU usage too high: %1% real-time").arg(cpuPct)));
    }

    // 14. D1 & D9: Hard-sync waveform integrity (no double-BLEP spike/notch) + Square/PWM & Hard Sync alias bounds.
    void hardSyncAndPwmAliasBounds() {
        constexpr double sr = 48000.0;
        auto measureAliasDb = [&](BassSynthParams p, int midiNote) {
            BassSynth synth;
            p.subLevel = 0.0f;
            p.cutoffHz = 18000.0f;
            p.resonance = 0.0f;
            p.drive = 0.0f;
            p.saturation = 0.0f;
            p.filterEnvAmount = 0.0f;
            p.keyTrack = 0.0f;
            p.attackMs = 0.5f;
            p.sustain = 1.0f;
            p.analogDrift = 0.0f;
            p.gainDb = 0.0f;
            synth.prepare(sr);
            synth.setParams(p);
            synth.snapParams();
            synth.noteOn(midiNote, 0.78f);

            std::vector<float> settle(2048 * 2, 0.0f);
            synth.renderBlock(settle);
            std::vector<float> capture(2048 * 2, 0.0f);
            synth.renderBlock(capture);
            const auto mono = extractMono(capture);
            const auto powers = hannDftPowers(mono);
            const double binHz = sr / static_cast<double>(mono.size());
            const double f0 = midiToHz(midiNote);

            std::vector<bool> harmonicMask(powers.size(), false);
            for (std::size_t b = 0; b <= 4 && b < harmonicMask.size(); ++b) harmonicMask[b] = true;
            for (int h = 1; h * f0 < 22000.0; ++h) {
                const auto center = static_cast<std::size_t>(std::llround((h * f0) / binHz));
                for (int d = -4; d <= 4; ++d) {
                    const auto idx = static_cast<std::ptrdiff_t>(center) + d;
                    if (idx >= 0 && static_cast<std::size_t>(idx) < harmonicMask.size()) {
                        harmonicMask[static_cast<std::size_t>(idx)] = true;
                    }
                }
            }
            double harmonicEnergy = 0.0;
            double aliasEnergy = 0.0;
            const std::size_t maxBin = static_cast<std::size_t>(std::floor(19000.0 / binHz));
            for (std::size_t k = 1; k <= maxBin && k < powers.size(); ++k) {
                if (harmonicMask[k]) harmonicEnergy += powers[k];
                else aliasEnergy += powers[k];
            }
            return 10.0 * std::log10(std::max(aliasEnergy, 1e-30) / std::max(harmonicEnergy, 1e-30));
        };

        // Square / PWM alias bound at 1760 Hz.
        {
            BassSynthParams p{};
            p.waveform = BassWaveform::Square;
            p.pulseWidth = 0.25f;
            p.oscLevel = 0.9f;
            const double aliasDb = measureAliasDb(p, 93);
            std::fprintf(stderr, "[BassSynth Alias] High PWM square (1760 Hz @ 48 kHz) alias: %.2f dB\n", aliasDb);
            QVERIFY2(aliasDb < -55.0, qPrintable(QStringLiteral("High PWM square alias too high: %1 dB").arg(aliasDb)));
        }

        // Hard-sync Saw alias bound at MIDI 76 (E5 = 659.25 Hz), slave +19 semitones.
        {
            BassSynthParams p{};
            p.waveform = BassWaveform::Saw;
            p.oscLevel = 0.9f;
            p.hardSync = true;
            p.syncSemitones = 19.0f;
            const double aliasDb = measureAliasDb(p, 76);
            std::fprintf(stderr, "[BassSynth Alias] Hard-sync saw (659 Hz, +19st) alias: %.2f dB\n", aliasDb);
            QVERIFY2(aliasDb < -48.0, qPrintable(QStringLiteral("Hard-sync saw alias too high: %1 dB").arg(aliasDb)));
        }

        // Hard-sync Square with small offset (+3 st, pw = 0.5): slave is in high half (oldSlavePhase ~0.19 < 0.5)
        // at master reset, so delta == 0. Double-BLEP bug injects a spurious -1.0 notch every master period
        // and drives alias energy way up.
        {
            BassSynthParams p{};
            p.waveform = BassWaveform::Square;
            p.pulseWidth = 0.5f;
            p.oscLevel = 0.9f;
            p.hardSync = true;
            p.syncSemitones = 3.0f;
            const double aliasDb = measureAliasDb(p, 76);
            std::fprintf(stderr, "[BassSynth Alias] Hard-sync square (659 Hz, +3st) alias: %.2f dB\n", aliasDb);
            QVERIFY2(aliasDb < -48.0, qPrintable(QStringLiteral("Hard-sync square alias too high: %1 dB").arg(aliasDb)));

            // Time-domain check at low pitch (MIDI 48 = 130.8 Hz, period ~367 samples):
            // After master reset (oldSlavePhase ~0.19 < 0.5), waveform must stay positive across reset (no spurious dip).
            BassSynth synth;
            p.subLevel = 0.0f;
            p.cutoffHz = 18000.0f;
            p.resonance = 0.0f;
            p.drive = 0.0f;
            p.saturation = 0.0f;
            p.filterEnvAmount = 0.0f;
            p.keyTrack = 0.0f;
            p.attackMs = 0.5f;
            p.sustain = 1.0f;
            p.analogDrift = 0.0f;
            p.gainDb = 0.0f;
            synth.prepare(sr);
            synth.setParams(p);
            synth.snapParams();
            synth.noteOn(48, 1.0f);
            std::vector<float> settle(2048 * 2, 0.0f);
            synth.renderBlock(settle);
            std::vector<float> cap(1024 * 2, 0.0f);
            synth.renderBlock(cap);
            const auto mono = extractMono(cap);
            // Count negative->positive transitions in 1024 samples (~2.79 periods at 130.8 Hz -> at most 3 cycles).
            // A spurious negative notch at master reset doubles the zero crossings!
            int negToPosCrossings = 0;
            for (std::size_t i = 1; i < mono.size(); ++i) {
                if (mono[i - 1] <= 0.0 && mono[i] > 0.0) ++negToPosCrossings;
            }
            QVERIFY2(negToPosCrossings <= 4, qPrintable(QStringLiteral(
                "Hard-sync square had spurious zero crossings (%1) from double-BLEP notch").arg(negToPosCrossings)));
        }
    }

    // 15. D2: Frozen ladder & half-band FIR downsampler state must not bleed into cold-start notes.
    void coldStartAfterSelfOscillationSilent() {
        constexpr double sr = 48000.0;
        BassSynth synth;
        BassSynthParams p{};
        p.oscLevel = 0.0f;
        p.subLevel = 0.0f;
        p.cutoffHz = 1000.0f;
        p.resonance = 1.0f;
        p.drive = 0.0f;
        p.saturation = 0.0f;
        p.filterEnvAmount = 0.0f;
        p.keyTrack = 0.0f;
        p.attackMs = 0.5f;
        p.sustain = 1.0f;
        p.releaseMs = 5.0f;
        p.analogDrift = 0.0f;
        p.gainDb = 0.0f;

        synth.prepare(sr);
        synth.setParams(p);
        synth.snapParams();

        // Drive ladder into full self-oscillation.
        synth.noteOn(60, 0.8f);
        std::vector<float> build(12000 * 2, 0.0f);
        synth.renderBlock(build);
        QVERIFY2(peakAbsSpan(build) > 0.1, "Self-oscillation did not build up");

        // Release and wait until completely idle (ampStage_ == Idle, ampSm_ == 0).
        synth.noteOff(60);
        std::vector<float> rel(6000 * 2, 0.0f);
        synth.renderBlock(rel);
        const auto tailEnd = std::span<const float>(rel.data() + rel.size() - 256, 256);
        QVERIFY2(peakAbsSpan(tailEnd) < 1e-6, "Note did not become silent before cold start");

        // Now turn resonance off (still zero osc/sub) and trigger a cold-start note.
        p.resonance = 0.0f;
        synth.setParams(p);
        synth.snapParams();
        synth.noteOn(60, 0.8f);
        std::vector<float> cold(64 * 2, 0.0f);
        synth.renderBlock(cold);
        QVERIFY(allFinite(cold));
        const double bleedPeak = peakAbsSpan(cold);
        QVERIFY2(bleedPeak < 1e-5, qPrintable(QStringLiteral(
            "Stale pre-VCA filter/downsampler state bled into cold-start note: peak=%1").arg(bleedPeak)));
    }

    // 16. D3: Effective filter cutoff must clamp to min(20 kHz, sampleRate * 0.42) across rates.
    void filterCutoffClampedBelowNyquistAcrossRates() {
        for (double sr : {44100.0, 48000.0, 96000.0}) {
            BassSynth synth;
            BassSynthParams p{};
            p.oscLevel = 0.0f;
            p.subLevel = 0.0f;
            p.cutoffHz = 18000.0f;
            p.resonance = 1.0f;
            p.drive = 0.0f;
            p.saturation = 0.0f;
            p.filterEnvAmount = 2.0f;   // 18 kHz * 4 = 72 kHz unclamped
            p.filterAttackMs = 0.5f;
            p.filterDecayMs = 4000.0f;
            p.filterSustain = 1.0f;
            p.keyTrack = 0.0f;
            p.attackMs = 0.5f;
            p.sustain = 1.0f;
            p.analogDrift = 0.0f;
            p.gainDb = 0.0f;

            synth.prepare(sr);
            synth.setParams(p);
            synth.snapParams();
            synth.noteOn(60, 0.78f);

            const std::size_t settleFrames = static_cast<std::size_t>(sr * 0.25);
            std::vector<float> settle(settleFrames * 2, 0.0f);
            synth.renderBlock(settle);
            std::vector<float> capture(4096 * 2, 0.0f);
            synth.renderBlock(capture);
            QVERIFY(allFinite(capture));

            const auto mono = extractMono(capture);
            const double rms = rmsSpan(mono);
            QVERIFY2(rms > 0.01, qPrintable(QStringLiteral(
                "Self-oscillation vanished at clamped max cutoff (sr=%1): rms=%2").arg(sr).arg(rms)));

            const double expectedMax = std::min(20000.0, sr * 0.42);
            const double measuredHz = estimateDominantHz(mono, sr, 500.0, sr * 0.49);
            QVERIFY2(measuredHz >= expectedMax * 0.90 && measuredHz <= expectedMax * 1.05, qPrintable(QStringLiteral(
                "Clamped self-oscillation frequency out of bounds at sr=%1: measured=%2 Hz expected~%3 Hz")
                .arg(sr).arg(measuredHz).arg(expectedMax)));
        }
    }

    // 17. D4: setParams with NaN/Inf must not poison smoothers or oscillator phase.
    void setParamsNanSafety() {
        constexpr double sr = 48000.0;
        const float nan = std::numeric_limits<float>::quiet_NaN();
        const float inf = std::numeric_limits<float>::infinity();

        BassSynth synth;
        synth.prepare(sr);
        BassSynthParams bad{};
        bad.pulseWidth = nan;
        bad.fine = nan;
        bad.oscLevel = nan;
        bad.syncSemitones = inf;
        bad.analogDrift = nan;
        bad.subLevel = nan;
        bad.cutoffHz = nan;
        bad.resonance = nan;
        bad.drive = inf;
        bad.filterEnvAmount = nan;
        bad.keyTrack = nan;
        bad.filterAttackMs = nan;
        bad.filterDecayMs = nan;
        bad.filterSustain = nan;
        bad.filterReleaseMs = nan;
        bad.attackMs = nan;
        bad.decayMs = nan;
        bad.sustain = nan;
        bad.releaseMs = nan;
        bad.accentAmount = nan;
        bad.slideMs = nan;
        bad.saturation = nan;
        bad.gainDb = nan;

        synth.setParams(bad);
        synth.snapParams();
        synth.noteOn(36, 0.8f);
        std::vector<float> buf(2048 * 2, 0.0f);
        synth.renderBlock(buf);
        QVERIFY2(allFinite(buf), "NaN in setParams poisoned audio output");
        QVERIFY2(peakAbsSpan(buf) > 0.02, "NaN in setParams permanently silenced synth");
    }

    // 18. D5: Zero clipGain (and -6000 dB clip in BassSynthProcessor) must render silence, not 0 dB.
    void zeroClipGainProducesSilence() {
        constexpr double sr = 48000.0;
        {
            BassSynth synth;
            synth.prepare(sr);
            synth.noteOn(36, 0.9f, 0.0f);
            std::vector<float> buf(1024 * 2, 0.0f);
            synth.renderBlock(buf);
            QVERIFY(allFinite(buf));
            const double pk = peakAbsSpan(buf);
            QVERIFY2(pk < 1e-6, qPrintable(QStringLiteral("Direct clipGain=0 played audio: peak=%1").arg(pk)));
        }
        {
            const auto* acid = findBassPreset("bl1-acid");
            QVERIFY(acid != nullptr);
            const QJsonObject inst = bassParamsToJson(acid->params, QStringLiteral("bl1-acid"));
            const QJsonArray notes{
                QJsonObject{{QStringLiteral("id"), QStringLiteral("n1")}, {QStringLiteral("pitch"), 36},
                            {QStringLiteral("startTick"), 0}, {QStringLiteral("durationTick"), 960}, {QStringLiteral("velocity"), 100}},
            };
            QJsonObject doc = makeMidiTimelineDoc(inst, notes, 120.0);
            QJsonArray clips = doc.value(u"clips").toArray();
            QJsonObject clip0 = clips[0].toObject();
            clip0.insert(QStringLiteral("volumeDb"), -6000.0);
            clips[0] = clip0;
            doc.insert(QStringLiteral("clips"), clips);

            const auto parsed = nt::parseTimelineJson(QJsonDocument(doc).toJson(QJsonDocument::Compact));
            QVERIFY(parsed.timeline.has_value());
            BassSynthProcessor proc(*parsed.timeline, parsed.timeline->tracks.at(0));
            proc.prepare(sr);

            std::vector<float> pcm(2048 * 2, 0.0f);
            const double msPerFrame = 1000.0 / sr;
            for (int f = 0; f < 2048; f += 128) {
                nt::audio::BlockContext ctx{sr, static_cast<double>(f) * msPerFrame, msPerFrame, false, 0};
                proc.process(std::span<float>(pcm.data() + static_cast<std::size_t>(f) * 2, 256), ctx);
            }
            QVERIFY(allFinite(pcm));
            const double pk = peakAbsSpan(pcm);
            QVERIFY2(pk < 1e-6, qPrintable(QStringLiteral("-6000 dB clip played audio: peak=%1").arg(pk)));
        }
    }

    // 19. D6 & D9: Overlapping same-pitch noteOn preserves legato & active slide; >64-note stack stays bounded.
    void overlappingSamePitchAndLargeNoteStack() {
        constexpr double sr = 48000.0;
        BassSynth synth;
        BassSynthParams p{};
        p.attackMs = 1.0f;
        p.decayMs = 30.0f;
        p.sustain = 0.35f;
        p.filterAttackMs = 1.0f;
        p.filterDecayMs = 30.0f;
        p.filterSustain = 0.0f;
        p.slideMs = 100.0f;
        p.retrigger = false;
        p.analogDrift = 0.0f;
        synth.prepare(sr);
        synth.setParams(p);
        synth.snapParams();

        // Hold 36 until envelopes settle.
        synth.noteOn(36, 0.78f);
        std::vector<float> hold(static_cast<std::size_t>(sr * 0.25) * 2, 0.0f);
        synth.renderBlock(hold);
        QVERIFY(synth.filterEnvelopeLevel() < 0.05);

        // Start sliding 36 -> 48, release 36 so only 48 is held, render 25 ms (still mid-slide).
        synth.noteOn(48, 0.78f);
        synth.noteOff(36);
        std::vector<float> mid(static_cast<std::size_t>(sr * 0.025) * 2, 0.0f);
        synth.renderBlock(mid);
        const double pitchBeforeDup = synth.currentPitchNote();
        QVERIFY2(pitchBeforeDup > 37.5 && pitchBeforeDup < 43.0, qPrintable(QStringLiteral(
            "Expected mid-slide pitch between 37.5 and 43.0, got %1").arg(pitchBeforeDup)));

        // Duplicate same-pitch noteOn(48) while only 48 is held must NOT snap slide or retrigger envelopes.
        synth.noteOn(48, 0.78f);
        const double pitchAfterDup = synth.currentPitchNote();
        QVERIFY2(std::abs(pitchAfterDup - pitchBeforeDup) < 0.05, qPrintable(QStringLiteral(
            "Duplicate same-pitch noteOn snapped active slide: before=%1 after=%2").arg(pitchBeforeDup).arg(pitchAfterDup)));

        double ampPeak = 0.0;
        double fltPeak = 0.0;
        std::vector<float> chunk(32 * 2, 0.0f);
        for (int i = 0; i < 16; ++i) {
            std::fill(chunk.begin(), chunk.end(), 0.0f);
            synth.renderBlock(chunk);
            ampPeak = std::max(ampPeak, synth.ampEnvelopeLevel());
            fltPeak = std::max(fltPeak, synth.filterEnvelopeLevel());
        }
        QVERIFY2(ampPeak < 0.45, qPrintable(QStringLiteral("Duplicate noteOn retriggered amp env: %1").arg(ampPeak)));
        QVERIFY2(fltPeak < 0.08, qPrintable(QStringLiteral("Duplicate noteOn retriggered filter env: %1").arg(fltPeak)));

        // Push >64 notes onto stack and verify bounded capacity + clean drain.
        synth.panic();
        for (int i = 0; i < 80; ++i) {
            synth.noteOn(20 + i, 0.75f);
        }
        QCOMPARE(synth.heldNoteCount(), BassSynth::kMaxHeldNotes);
        QCOMPARE(synth.activeMidiNote(), 99);
        for (int i = 0; i < 80; ++i) {
            synth.noteOff(20 + i);
        }
        QCOMPARE(synth.heldNoteCount(), 0);
        QVERIFY(!synth.isGateOpen());
    }

    // 20. D7: Automation of filterSustain, keyTrack, fine, and accentAmount must be smoothed (no clicks/steps).
    void automationSmoothingNoClicks() {
        constexpr double sr = 48000.0;

        // 1) filterSustain step during sustain must ramp smoothly, not jump from 0 -> 1 in 1 sample.
        {
            BassSynth synth;
            BassSynthParams p{};
            p.filterAttackMs = 1.0f;
            p.filterDecayMs = 15.0f;
            p.filterSustain = 0.0f;
            p.sustain = 1.0f;
            p.analogDrift = 0.0f;
            synth.prepare(sr);
            synth.setParams(p);
            synth.snapParams();
            synth.noteOn(36, 0.78f);
            std::vector<float> hold(static_cast<std::size_t>(sr * 0.15) * 2, 0.0f);
            synth.renderBlock(hold);
            QVERIFY(synth.filterEnvelopeLevel() < 0.02);

            QVERIFY(synth.setParameter("filterSustain", 1.0));
            std::array<float, 2> oneFrame{};
            synth.renderBlock(oneFrame);
            const double afterOneSample = synth.filterEnvelopeLevel();
            QVERIFY2(afterOneSample < 0.05, qPrintable(QStringLiteral(
                "filterSustain stepped instantaneously to %1 in 1 sample").arg(afterOneSample)));

            std::vector<float> ramp(static_cast<std::size_t>(sr * 0.02) * 2, 0.0f);
            synth.renderBlock(ramp);
            QVERIFY2(synth.filterEnvelopeLevel() > 0.95, qPrintable(QStringLiteral(
                "filterSustain did not converge after smoothing: %1").arg(synth.filterEnvelopeLevel())));
        }

        // 2) keyTrack jump 0 -> 1 on a resonant self-oscillating filter at MIDI 36 (-2 oct) must not click.
        {
            BassSynth synth;
            BassSynthParams p{};
            p.oscLevel = 0.0f;
            p.subLevel = 0.0f;
            p.cutoffHz = 2000.0f;
            p.resonance = 1.0f;
            p.keyTrack = 0.0f;
            p.filterEnvAmount = 0.0f;
            p.attackMs = 0.5f;
            p.sustain = 1.0f;
            p.analogDrift = 0.0f;
            p.gainDb = 0.0f;
            synth.prepare(sr);
            synth.setParams(p);
            synth.snapParams();
            synth.noteOn(36, 0.78f);

            std::vector<float> settle(12000 * 2, 0.0f);
            synth.renderBlock(settle);
            const auto settleMono = extractMono(std::span<const float>(settle.data() + 10000 * 2, 2000 * 2));
            double steadyMaxDiff = 0.0;
            for (std::size_t i = 1; i < settleMono.size(); ++i) {
                steadyMaxDiff = std::max(steadyMaxDiff, std::abs(settleMono[i] - settleMono[i - 1]));
            }
            QVERIFY(steadyMaxDiff > 0.02);

            // Capture immediate 512 frames after jumping keyTrack 0 -> 1 (2000 Hz -> 500 Hz).
            QVERIFY(synth.setParameter("keyTrack", 1.0));
            std::vector<float> after(512 * 2, 0.0f);
            synth.renderBlock(after);
            const auto afterMono = extractMono(after);
            double jumpMaxDiff = 0.0;
            for (std::size_t i = 1; i < 64; ++i) {
                jumpMaxDiff = std::max(jumpMaxDiff, std::abs(afterMono[i] - afterMono[i - 1]));
            }
            QVERIFY2(jumpMaxDiff < steadyMaxDiff * 1.45, qPrintable(QStringLiteral(
                "keyTrack automation clicked: jumpMaxDiff=%1 steadyMaxDiff=%2").arg(jumpMaxDiff).arg(steadyMaxDiff)));
        }

        // 3) fine jump -100 -> +100 cents on a pure high triangle must ramp smoothly (frequency in first 1 ms
        //    stays near -100 cents, not instantaneously at +100 cents).
        {
            BassSynth synth;
            BassSynthParams p{};
            p.waveform = BassWaveform::Triangle;
            p.oscLevel = 0.9f;
            p.subLevel = 0.0f;
            p.fine = -100.0f;
            p.cutoffHz = 18000.0f;
            p.resonance = 0.0f;
            p.drive = 0.0f;
            p.saturation = 0.0f;
            p.filterEnvAmount = 0.0f;
            p.attackMs = 0.5f;
            p.sustain = 1.0f;
            p.analogDrift = 0.0f;
            synth.prepare(sr);
            synth.setParams(p);
            synth.snapParams();
            synth.noteOn(72, 0.78f);  // C5 = 523.25 Hz; -100c = 493.88 Hz, +100c = 554.37 Hz

            std::vector<float> settle(2048 * 2, 0.0f);
            synth.renderBlock(settle);
            QVERIFY(synth.setParameter("fine", 100.0));
            // Measure first 64 frames (~1.33 ms, < 30% of 5 ms ramp): zero-crossing period should be closer to 494 Hz than 554 Hz.
            std::vector<float> early(96 * 2, 0.0f);
            synth.renderBlock(early);
            const auto mono = extractMono(early);
            std::vector<double> crossings;
            for (std::size_t i = 1; i < mono.size(); ++i) {
                if (mono[i - 1] <= 0.0 && mono[i] > 0.0) {
                    const double frac = -mono[i - 1] / std::max(mono[i] - mono[i - 1], 1e-12);
                    crossings.push_back(static_cast<double>(i - 1) + frac);
                }
            }
            // Wait — 96 samples @ 48 kHz is ~1 cycle of 494 Hz (97.2 samples). Use 160 frames (~3.3 ms) and check FIRST period!
            if (crossings.size() < 2) {
                std::vector<float> more(96 * 2, 0.0f);
                synth.renderBlock(more);
                const auto m2 = extractMono(more);
                std::vector<double> full = mono;
                full.insert(full.end(), m2.begin(), m2.end());
                crossings.clear();
                for (std::size_t i = 1; i < full.size(); ++i) {
                    if (full[i - 1] <= 0.0 && full[i] > 0.0) {
                        const double frac = -full[i - 1] / std::max(full[i] - full[i - 1], 1e-12);
                        crossings.push_back(static_cast<double>(i - 1) + frac);
                    }
                }
            }
            QVERIFY(crossings.size() >= 2);
            const double firstPeriodHz = sr / (crossings[1] - crossings[0]);
            QVERIFY2(firstPeriodHz < 540.0, qPrintable(QStringLiteral(
                "fine jumped instantaneously instead of smoothing: firstPeriodHz=%1").arg(firstPeriodHz)));
        }

        // 4) accentAmount jump 0 -> 1 during accented sustain must not click.
        {
            BassSynth synth;
            BassSynthParams p{};
            p.cutoffHz = 240.0f;
            p.resonance = 0.75f;
            p.filterEnvAmount = 3.5f;
            p.filterSustain = 0.8f;
            p.sustain = 0.8f;
            p.accentAmount = 0.0f;
            p.analogDrift = 0.0f;
            synth.prepare(sr);
            synth.setParams(p);
            synth.snapParams();
            synth.noteOn(36, 0.98f);  // accented

            std::vector<float> settle(4800 * 2, 0.0f);
            synth.renderBlock(settle);
            const auto settleMono = extractMono(std::span<const float>(settle.data() + 3800 * 2, 1000 * 2));
            double steadyMaxDiff = 0.0;
            for (std::size_t i = 1; i < settleMono.size(); ++i) {
                steadyMaxDiff = std::max(steadyMaxDiff, std::abs(settleMono[i] - settleMono[i - 1]));
            }
            QVERIFY(synth.setParameter("accentAmount", 1.0));
            std::vector<float> after(512 * 2, 0.0f);
            synth.renderBlock(after);
            const auto afterMono = extractMono(after);
            double jumpMaxDiff = 0.0;
            for (std::size_t i = 1; i < 64; ++i) {
                jumpMaxDiff = std::max(jumpMaxDiff, std::abs(afterMono[i] - afterMono[i - 1]));
            }
            QVERIFY2(jumpMaxDiff < std::max(0.15, steadyMaxDiff * 2.0 + 0.03), qPrintable(QStringLiteral(
                "accentAmount automation clicked: jumpMaxDiff=%1 steadyMaxDiff=%2").arg(jumpMaxDiff).arg(steadyMaxDiff)));
        }
    }

    // 21. D9: Slide and envelope timing parity across 44.1 / 48 / 96 kHz.
    void rateParitySlideAndEnvelopes() {
        auto measureAtRate = [](double sr) {
            BassSynth synth;
            BassSynthParams p{};
            p.slideMs = 80.0f;
            p.filterAttackMs = 1.0f;
            p.filterDecayMs = 180.0f;
            p.filterSustain = 0.0f;
            p.attackMs = 1.0f;
            p.decayMs = 200.0f;
            p.sustain = 0.8f;
            p.releaseMs = 100.0f;
            p.retrigger = false;
            p.analogDrift = 0.0f;
            synth.prepare(sr);
            synth.setParams(p);
            synth.snapParams();

            synth.noteOn(36, 0.78f);
            std::vector<float> envBuf(static_cast<std::size_t>(std::llround(sr * 0.050)) * 2, 0.0f);
            synth.renderBlock(envBuf);
            const double fltAt50ms = synth.filterEnvelopeLevel();

            synth.noteOn(48, 0.78f);
            std::vector<float> slideBuf(static_cast<std::size_t>(std::llround(sr * 0.080)) * 2, 0.0f);
            synth.renderBlock(slideBuf);
            const double slideFrac = (synth.currentPitchNote() - 36.0) / 12.0;

            synth.noteOff(36);
            synth.noteOff(48);
            std::vector<float> relBuf(static_cast<std::size_t>(std::llround(sr * 0.040)) * 2, 0.0f);
            synth.renderBlock(relBuf);
            const double ampRelAt40ms = synth.ampEnvelopeLevel();
            return std::tuple{fltAt50ms, slideFrac, ampRelAt40ms};
        };

        const auto [flt44, slide44, rel44] = measureAtRate(44100.0);
        const auto [flt48, slide48, rel48] = measureAtRate(48000.0);
        const auto [flt96, slide96, rel96] = measureAtRate(96000.0);

        QVERIFY2(std::abs(flt44 - flt48) < 0.025 && std::abs(flt96 - flt48) < 0.025, qPrintable(QStringLiteral(
            "Filter decay parity mismatch across rates: 44.1=%1 48=%2 96=%3").arg(flt44).arg(flt48).arg(flt96)));
        QVERIFY2(std::abs(slide44 - slide48) < 0.02 && std::abs(slide96 - slide48) < 0.02, qPrintable(QStringLiteral(
            "Slide timing parity mismatch across rates: 44.1=%1 48=%2 96=%3").arg(slide44).arg(slide48).arg(slide96)));
        QVERIFY2(std::abs(rel44 - rel48) < 0.025 && std::abs(rel96 - rel48) < 0.025, qPrintable(QStringLiteral(
            "Amp release parity mismatch across rates: 44.1=%1 48=%2 96=%3").arg(rel44).arg(rel48).arg(rel96)));
    }

    // 22. D8 & D9: Non-QML EditRegistry auto-registration and unknown enum rejection in bass.setParams.
    void editRegistryAndUnknownEnumRejection() {
        // Must be registered automatically in non-QML targets without calling registerBassEdits() manually.
        const auto setPreset = nt::app::findEdit(QStringLiteral("bass.setPreset"));
        const auto setParams = nt::app::findEdit(QStringLiteral("bass.setParams"));
        QVERIFY2(static_cast<bool>(setPreset), "bass.setPreset not registered in non-QML target");
        QVERIFY2(static_cast<bool>(setParams), "bass.setParams not registered in non-QML target");
        QVERIFY2(nt::app::editRefusals().isEmpty(), "EditRegistry reported duplicate/refused registrations");

        // Load bl1-warehouse (waveform=square, subShape=square) via EditRegistry.
        QJsonObject doc = makeMidiTimelineDoc(QJsonObject{{QStringLiteral("type"), QStringLiteral("subtractive")}}, QJsonArray{});
        const QJsonObject loaded = setPreset(doc, QJsonObject{
            {QStringLiteral("trackId"), QStringLiteral("t_bass")},
            {QStringLiteral("preset"), QStringLiteral("bl1-warehouse")},
        });
        const auto instLoaded = loaded.value(u"tracks").toArray().at(0).toObject().value(u"instrument").toObject();
        QCOMPARE(instLoaded.value(u"waveform").toString(), QStringLiteral("square"));
        QCOMPARE(instLoaded.value(u"subShape").toString(), QStringLiteral("square"));
        QCOMPARE(instLoaded.value(u"preset").toString(), QStringLiteral("bl1-warehouse"));

        // Unknown waveform/subShape strings must be rejected without clobbering existing values or clearing preset.
        const QJsonObject afterInvalid = setParams(loaded, QJsonObject{
            {QStringLiteral("trackId"), QStringLiteral("t_bass")},
            {QStringLiteral("waveform"), QStringLiteral("nonsense-wave")},
            {QStringLiteral("subShape"), QStringLiteral("nonsense-sub")},
        });
        const auto instAfterInvalid = afterInvalid.value(u"tracks").toArray().at(0).toObject().value(u"instrument").toObject();
        QCOMPARE(instAfterInvalid.value(u"waveform").toString(), QStringLiteral("square"));
        QCOMPARE(instAfterInvalid.value(u"subShape").toString(), QStringLiteral("square"));
        QCOMPARE(instAfterInvalid.value(u"preset").toString(), QStringLiteral("bl1-warehouse"));
        QCOMPARE(afterInvalid, loaded);

        // Valid parameter edit via EditRegistry updates field and clears preset to empty (custom).
        const QJsonObject afterValid = setParams(loaded, QJsonObject{
            {QStringLiteral("trackId"), QStringLiteral("t_bass")},
            {QStringLiteral("cutoffHz"), 920.0},
        });
        const auto instAfterValid = afterValid.value(u"tracks").toArray().at(0).toObject().value(u"instrument").toObject();
        QCOMPARE(instAfterValid.value(u"cutoffHz").toDouble(), 920.0);
        QCOMPARE(instAfterValid.value(u"preset").toString(), QString{});
    }

    // 23. E1: Overlapping same-pitch notes retain per-note-instance ownership through scheduling & chasing.
    void overlappingSamePitchNoteInstanceOwnership() {
        constexpr double sr = 48000.0;
        const double msPerFrame = 1000.0 / sr;

        // Part A: Direct BassSynth API overlapping same-pitch noteOn/noteOn/noteOff must keep gate open until second noteOff.
        {
            BassSynth synth;
            synth.prepare(sr);
            synth.noteOn(36, 0.75f);
            synth.noteOn(36, 0.90f);
            QCOMPARE(synth.heldNoteCount(), 2);
            QVERIFY(synth.isGateOpen());

            synth.noteOff(36);
            QCOMPARE(synth.heldNoteCount(), 1);
            QVERIFY2(synth.isGateOpen(), "First noteOff of overlapping same-pitch note closed gate prematurely");
            QCOMPARE(synth.activeMidiNote(), 36);

            synth.noteOff(36);
            QCOMPARE(synth.heldNoteCount(), 0);
            QVERIFY(!synth.isGateOpen());
        }

        BassSynthParams p{};
        p.waveform = BassWaveform::Saw;
        p.oscLevel = 0.85f;
        p.subLevel = 0.4f;
        p.cutoffHz = 900.0f;
        p.resonance = 0.25f;
        p.filterEnvAmount = 1.5f;
        p.attackMs = 1.0f;
        p.decayMs = 40.0f;
        p.sustain = 0.85f;
        p.releaseMs = 20.0f;
        p.accentAmount = 0.8f;
        p.accentVelocity = 100;
        p.analogDrift = 0.0f;
        p.gainDb = -6.0f;
        const QJsonObject inst = bassParamsToJson(p);

        auto renderRange = [&](BassSynthProcessor& proc, double startMs, double endMs) {
            constexpr int blockFrames = 128;
            const std::size_t totalFrames = static_cast<std::size_t>(std::llround((endMs - startMs) * sr / 1000.0));
            std::vector<float> pcm(totalFrames * 2, 0.0f);
            std::size_t done = 0;
            while (done < totalFrames) {
                const std::size_t chunk = std::min<std::size_t>(blockFrames, totalFrames - done);
                const double tMs = startMs + static_cast<double>(done) * msPerFrame;
                nt::audio::BlockContext ctx{sr, tMs, msPerFrame, false, 0};
                proc.process(std::span<float>(pcm.data() + done * 2, chunk * 2), ctx);
                done += chunk;
            }
            return pcm;
        };

        // Part B: Processor staggered same-pitch overlap: Note A 0..1000 ms (vel 75, plain), Note B 500..1500 ms (vel 120, accented).
        {
            const QJsonArray notes{
                QJsonObject{{QStringLiteral("id"), QStringLiteral("nA")}, {QStringLiteral("pitch"), 36},
                            {QStringLiteral("startTick"), 0}, {QStringLiteral("durationTick"), 1920}, {QStringLiteral("velocity"), 75}},
                QJsonObject{{QStringLiteral("id"), QStringLiteral("nB")}, {QStringLiteral("pitch"), 36},
                            {QStringLiteral("startTick"), 960}, {QStringLiteral("durationTick"), 1920}, {QStringLiteral("velocity"), 120}},
            };
            const QJsonObject doc = makeMidiTimelineDoc(inst, notes, 120.0);
            const auto parsed = nt::parseTimelineJson(QJsonDocument(doc).toJson(QJsonDocument::Compact));
            QVERIFY(parsed.timeline.has_value());

            BassSynthProcessor proc(*parsed.timeline, parsed.timeline->tracks.at(0));
            proc.prepare(sr);

            // Render 0..1150 ms (past A's note-off at 1000 ms, while B is still held until 1500 ms).
            (void)renderRange(proc, 0.0, 1150.0);
            QVERIFY2(proc.synth().isGateOpen(), "Note A note-off at 1000 ms prematurely released overlapping same-pitch Note B");
            QCOMPARE(proc.synth().heldNoteCount(), 1);
            QCOMPARE(proc.synth().activeMidiNote(), 36);
            QVERIFY2(proc.synth().isAccented(), "Note B (accented) should remain active after Note A ended");

            const auto midB = renderRange(proc, 1150.0, 1350.0);
            const double midBRms = rmsSpan(extractMono(midB));
            QVERIFY2(midBRms > 0.03, qPrintable(QStringLiteral("Overlapping Note B silent after Note A note-off: rms=%1").arg(midBRms)));

            // Render past B's note-off at 1500 ms -> gate closes and release decays to silence.
            (void)renderRange(proc, 1350.0, 1600.0);
            QVERIFY(!proc.synth().isGateOpen());
            QCOMPARE(proc.synth().heldNoteCount(), 0);
            const auto tail = renderRange(proc, 1600.0, 1800.0);
            const auto tailEnd = std::span<const float>(tail.data() + tail.size() - 256, 256);
            QVERIFY2(peakAbsSpan(tailEnd) < 1e-3, qPrintable(QStringLiteral("Final note-off did not release: peak=%1").arg(peakAbsSpan(tailEnd))));

            // Same overlap chased mid-overlap at 700 ms -> must still keep Note B held past 1000 ms and release at 1500 ms.
            (void)renderRange(proc, 700.0, 1150.0);
            QVERIFY2(proc.synth().isGateOpen(), "chaseAt mid-overlap released Note B prematurely at Note A note-off");
            QCOMPARE(proc.synth().heldNoteCount(), 1);
            QVERIFY(proc.synth().isAccented());
            (void)renderRange(proc, 1150.0, 1550.0);
            QVERIFY(!proc.synth().isGateOpen());
            QCOMPARE(proc.synth().heldNoteCount(), 0);
        }

        // Part C: Nested same-pitch overlap: Note A 0..1500 ms (vel 70, plain), Note B 500..1000 ms (vel 120, accented).
        // When B ends at 1000 ms, A must remain held (unaccented) until 1500 ms.
        {
            const QJsonArray notes{
                QJsonObject{{QStringLiteral("id"), QStringLiteral("nA")}, {QStringLiteral("pitch"), 36},
                            {QStringLiteral("startTick"), 0}, {QStringLiteral("durationTick"), 2880}, {QStringLiteral("velocity"), 70}},
                QJsonObject{{QStringLiteral("id"), QStringLiteral("nB")}, {QStringLiteral("pitch"), 36},
                            {QStringLiteral("startTick"), 960}, {QStringLiteral("durationTick"), 960}, {QStringLiteral("velocity"), 120}},
            };
            const QJsonObject doc = makeMidiTimelineDoc(inst, notes, 120.0);
            const auto parsed = nt::parseTimelineJson(QJsonDocument(doc).toJson(QJsonDocument::Compact));
            QVERIFY(parsed.timeline.has_value());

            BassSynthProcessor proc(*parsed.timeline, parsed.timeline->tracks.at(0));
            proc.prepare(sr);

            // Chase into mid-overlap at 700 ms, render past B's note-off at 1000 ms.
            (void)renderRange(proc, 700.0, 1150.0);
            QVERIFY2(proc.synth().isGateOpen(), "Nested Note B note-off released outer Note A prematurely");
            QCOMPARE(proc.synth().heldNoteCount(), 1);
            QCOMPARE(proc.synth().activeMidiNote(), 36);
            QVERIFY2(!proc.synth().isAccented(), "Returning to outer Note A did not restore unaccented state");

            const auto afterB = renderRange(proc, 1150.0, 1350.0);
            QVERIFY2(rmsSpan(extractMono(afterB)) > 0.02, "Outer Note A silent after nested Note B ended");

            (void)renderRange(proc, 1350.0, 1550.0);
            QVERIFY(!proc.synth().isGateOpen());
            QCOMPARE(proc.synth().heldNoteCount(), 0);
        }
    }

    // 24. E2: Returning to an underlying held note restores its clip's fade metadata instead of keeping the departing clip's fade.
    void overlappingClipFallbackRestoresClipFades() {
        constexpr double sr = 48000.0;
        const double msPerFrame = 1000.0 / sr;

        BassSynthParams p{};
        p.waveform = BassWaveform::Saw;
        p.oscLevel = 0.85f;
        p.subLevel = 0.4f;
        p.cutoffHz = 950.0f;
        p.resonance = 0.25f;
        p.filterEnvAmount = 1.2f;
        p.attackMs = 1.0f;
        p.decayMs = 40.0f;
        p.sustain = 0.9f;
        p.releaseMs = 25.0f;
        p.slideMs = 20.0f;
        p.analogDrift = 0.0f;
        p.gainDb = -6.0f;
        const QJsonObject inst = bassParamsToJson(p);

        auto makeTwoClipDoc = [&](double clipAFadeInMs, double clipAFadeOutMs, double clipBFadeOutMs) {
            QJsonObject doc = makeMidiTimelineDoc(inst, QJsonArray{}, 120.0);
            const QJsonArray notesA{
                QJsonObject{{QStringLiteral("id"), QStringLiteral("nA")}, {QStringLiteral("pitch"), 36},
                            {QStringLiteral("startTick"), 0}, {QStringLiteral("durationTick"), 3840}, {QStringLiteral("velocity"), 90}},
            };
            const QJsonArray notesB{
                QJsonObject{{QStringLiteral("id"), QStringLiteral("nB")}, {QStringLiteral("pitch"), 43},
                            {QStringLiteral("startTick"), 0}, {QStringLiteral("durationTick"), 960}, {QStringLiteral("velocity"), 90}},
            };
            QJsonObject clipA{
                {QStringLiteral("id"), QStringLiteral("c_a")},
                {QStringLiteral("trackId"), QStringLiteral("t_bass")},
                {QStringLiteral("name"), QStringLiteral("Clip A")},
                {QStringLiteral("mediaType"), QStringLiteral("midi")},
                {QStringLiteral("startMs"), 0.0},
                {QStringLiteral("durationMs"), 2000.0},
                {QStringLiteral("inPointMs"), 0.0},
                {QStringLiteral("volumeDb"), 0.0},
                {QStringLiteral("fadeInMs"), clipAFadeInMs},
                {QStringLiteral("fadeOutMs"), clipAFadeOutMs},
                {QStringLiteral("notes"), notesA},
            };
            QJsonObject clipB{
                {QStringLiteral("id"), QStringLiteral("c_b")},
                {QStringLiteral("trackId"), QStringLiteral("t_bass")},
                {QStringLiteral("name"), QStringLiteral("Clip B")},
                {QStringLiteral("mediaType"), QStringLiteral("midi")},
                {QStringLiteral("startMs"), 250.0},
                {QStringLiteral("durationMs"), 500.0},
                {QStringLiteral("inPointMs"), 0.0},
                {QStringLiteral("volumeDb"), 0.0},
                {QStringLiteral("fadeInMs"), 0.0},
                {QStringLiteral("fadeOutMs"), clipBFadeOutMs},
                {QStringLiteral("notes"), notesB},
            };
            doc.insert(QStringLiteral("clips"), QJsonArray{clipA, clipB});
            return doc;
        };

        auto renderRange = [&](BassSynthProcessor& proc, double startMs, double endMs) {
            constexpr int blockFrames = 128;
            const std::size_t totalFrames = static_cast<std::size_t>(std::llround((endMs - startMs) * sr / 1000.0));
            std::vector<float> pcm(totalFrames * 2, 0.0f);
            std::size_t done = 0;
            while (done < totalFrames) {
                const std::size_t chunk = std::min<std::size_t>(blockFrames, totalFrames - done);
                const double tMs = startMs + static_cast<double>(done) * msPerFrame;
                nt::audio::BlockContext ctx{sr, tMs, msPerFrame, false, 0};
                proc.process(std::span<float>(pcm.data() + done * 2, chunk * 2), ctx);
                done += chunk;
            }
            return pcm;
        };

        // Scenario A: Clip A (0..2000 ms, no fade) underlies Clip B (250..750 ms, 100 ms fade-out).
        // After Clip B ends at 750 ms, returning to Clip A at 800..1000 ms must NOT be silenced by Clip B's expired fade-out.
        {
            const auto parsedNoFade = nt::parseTimelineJson(QJsonDocument(makeTwoClipDoc(0.0, 0.0, 0.0)).toJson(QJsonDocument::Compact));
            const auto parsedBFade = nt::parseTimelineJson(QJsonDocument(makeTwoClipDoc(0.0, 0.0, 100.0)).toJson(QJsonDocument::Compact));
            QVERIFY(parsedNoFade.timeline.has_value());
            QVERIFY(parsedBFade.timeline.has_value());

            BassSynthProcessor procRef(*parsedNoFade.timeline, parsedNoFade.timeline->tracks.at(0));
            BassSynthProcessor procBFade(*parsedBFade.timeline, parsedBFade.timeline->tracks.at(0));
            procRef.prepare(sr);
            procBFade.prepare(sr);

            (void)renderRange(procRef, 0.0, 800.0);
            (void)renderRange(procBFade, 0.0, 800.0);

            const auto refTail = renderRange(procRef, 800.0, 1000.0);
            const auto bFadeTail = renderRange(procBFade, 800.0, 1000.0);
            QCOMPARE(procBFade.synth().activeMidiNote(), 36);
            QVERIFY(procBFade.synth().isGateOpen());

            const double refRms = rmsSpan(extractMono(refTail));
            const double bFadeRms = rmsSpan(extractMono(bFadeTail));
            QVERIFY2(refRms > 0.03, qPrintable(QStringLiteral("Reference fallback silent: rms=%1").arg(refRms)));
            QVERIFY2(bFadeRms > refRms * 0.85, qPrintable(QStringLiteral(
                "Clip A silenced after Clip B fade-out ended: refRms=%1 bFadeRms=%2").arg(refRms).arg(bFadeRms)));
        }

        // Scenario B: Clip A has its own 200 ms fade-out (1800..2000 ms) and Clip B has 100 ms fade-out (650..750 ms).
        // Returning to Clip A must sound cleanly at 900..1100 ms AND still honor Clip A's own fade-out at 1950..2000 ms.
        {
            const auto parsed = nt::parseTimelineJson(QJsonDocument(makeTwoClipDoc(0.0, 200.0, 100.0)).toJson(QJsonDocument::Compact));
            QVERIFY(parsed.timeline.has_value());
            BassSynthProcessor proc(*parsed.timeline, parsed.timeline->tracks.at(0));
            proc.prepare(sr);

            (void)renderRange(proc, 0.0, 900.0);
            const auto midA = renderRange(proc, 900.0, 1100.0);
            (void)renderRange(proc, 1100.0, 1950.0);
            const auto endA = renderRange(proc, 1950.0, 2000.0);

            const double midARms = rmsSpan(extractMono(midA));
            const double endARms = rmsSpan(extractMono(endA));
            QVERIFY2(midARms > 0.03, qPrintable(QStringLiteral("Clip A mid section silent after Clip B: rms=%1").arg(midARms)));
            QVERIFY2(endARms < midARms * 0.35, qPrintable(QStringLiteral(
                "Clip A own fade-out not restored: midRms=%1 endRms=%2").arg(midARms).arg(endARms)));
        }

        // Scenario C: Clip A has a 1000 ms fade-in (0..1000 ms), Clip B (250..750 ms) has no fade.
        // Chase mid-overlap at 500 ms, then play past 750 ms -> Clip A's fade-in curve is restored (still ramping at 760..810 ms).
        {
            const auto parsed = nt::parseTimelineJson(QJsonDocument(makeTwoClipDoc(1000.0, 0.0, 0.0)).toJson(QJsonDocument::Compact));
            QVERIFY(parsed.timeline.has_value());
            BassSynthProcessor proc(*parsed.timeline, parsed.timeline->tracks.at(0));
            proc.prepare(sr);

            (void)renderRange(proc, 500.0, 760.0);
            const auto earlyA = renderRange(proc, 760.0, 810.0);
            (void)renderRange(proc, 810.0, 1100.0);
            const auto fullA = renderRange(proc, 1100.0, 1150.0);

            const double earlyRms = rmsSpan(extractMono(earlyA));
            const double fullRms = rmsSpan(extractMono(fullA));
            QVERIFY2(fullRms > 0.03, qPrintable(QStringLiteral("Clip A full section silent after chase: rms=%1").arg(fullRms)));
            QVERIFY2(earlyRms > 0.01 && earlyRms < fullRms * 0.90, qPrintable(QStringLiteral(
                "Clip A fade-in not restored after chase + Clip B note-off: earlyRms=%1 fullRms=%2").arg(earlyRms).arg(fullRms)));
        }
    }

    // 25. BASS2: Internal stage audit, flat-tops, hard clamps, filter state level, and aliasing across all 16 presets.
    void allPresetsInternalStagesClippingAndAliasing() {
        constexpr double sr = 48000.0;
        constexpr int blockFrames = 64;

        struct DemoNote { double startSec; double lenSec; int midi; float vel; };
        const int pat[16] = {36, 36, 48, 36, 39, 36, 43, 41, 36, 36, 48, 46, 43, 39, 41, 34};
        std::vector<DemoNote> demoNotes;
        for (int i = 0; i < 16; ++i) {
            demoNotes.push_back({i * 0.125, (i % 4 == 3) ? 0.2 : 0.09, pat[i], (i % 4 == 0) ? 1.0f : 0.7f});
        }
        demoNotes.push_back({2.0, 1.0, 36, 0.9f});

        std::fprintf(stderr,
            "\n[BASS2 Stage & Alias Audit]\n"
            "%-20s %5s %5s %5s %5s %5s %5s %6s %5s %7s %7s\n",
            "Preset", "Peak", "u/Vt", "State", "Vca", "SatIn", "Flat%", "Clamps", "SatHK", "AliasdB", "HiResSt");

        int failures = 0;
        QString firstFail;
        auto recordFail = [&](const QString& msg) {
            ++failures;
            if (firstFail.isEmpty()) firstFail = msg;
            std::fprintf(stderr, "  FAIL: %s\n", qPrintable(msg));
        };

        for (const auto& preset : factoryBassPresets()) {
            // Part A: Demo phrase telemetry and flat-top check.
            BassSynth synth;
            synth.prepare(sr);
            synth.setParams(preset.params);
            synth.snapParams();
            synth.setTelemetryEnabled(true);
            synth.resetTelemetry();

            const int totalFrames = static_cast<int>(3.5 * sr);
            std::vector<float> out(static_cast<std::size_t>(totalFrames) * 2, 0.0f);
            for (int pos = 0; pos < totalFrames; pos += blockFrames) {
                const double t0 = static_cast<double>(pos) / sr;
                const double t1 = static_cast<double>(pos + blockFrames) / sr;
                for (const auto& n : demoNotes) {
                    if (n.startSec + n.lenSec >= t0 && n.startSec + n.lenSec < t1) {
                        synth.noteOff(n.midi);
                    }
                }
                for (const auto& n : demoNotes) {
                    if (n.startSec >= t0 && n.startSec < t1) {
                        synth.noteOn(n.midi, n.vel);
                    }
                }
                const int frames = std::min(blockFrames, totalFrames - pos);
                synth.renderBlock(std::span<float>(
                    out.data() + static_cast<std::size_t>(pos) * 2,
                    static_cast<std::size_t>(frames) * 2));
            }
            QVERIFY(allFinite(out));

            const auto mono = extractMono(out);
            double peak = 0.0;
            for (double v : mono) peak = std::max(peak, std::abs(v));

            // Clipped flat-top plateaus: runs of >= 6 samples pinned within 10% of peak with near-zero slope
            // during active sound, excluding pure low-frequency sub/sine crests via peak step check.
            std::size_t activeSamples = 0;
            std::size_t flatSamples = 0;
            std::size_t runLen = 0;
            const double flatLevelThr = 0.88 * peak;
            const double flatSlopeThr = 0.0025 * peak;
            const double actThr = 0.05 * peak;
            for (std::size_t i = 1; i < mono.size(); ++i) {
                if (std::abs(mono[i]) > actThr) ++activeSamples;
                if (std::abs(mono[i]) > flatLevelThr && std::abs(mono[i] - mono[i - 1]) < flatSlopeThr) {
                    ++runLen;
                } else {
                    if (runLen >= 6) flatSamples += runLen;
                    runLen = 0;
                }
            }
            if (runLen >= 6) flatSamples += runLen;
            const double flatPct = 100.0 * static_cast<double>(flatSamples) / static_cast<double>(std::max<std::size_t>(1, activeSamples));

            const auto& tel = synth.telemetry();
            const std::uint64_t totalClamps = tel.fastTanhClampHits + tel.ladderClampHits + tel.outputClampHits;

            // Part B: Aliasing energy at MIDI 72 (C5 = 523.25 Hz, sub = 261.63 Hz) with preset's own drive/res/sat
            // and filter held at accented peak (filterSustain = 1.0, analogDrift = 0) so saturator/ladder aliasing shows.
            double aliasDb = -120.0;
            {
                BassSynth aliasSynth;
                BassSynthParams ap = preset.params;
                ap.analogDrift = 0.0f;
                ap.filterSustain = 1.0f;
                ap.sustain = 1.0f;
                ap.attackMs = 1.0f;
                ap.filterAttackMs = 1.0f;
                aliasSynth.prepare(sr);
                aliasSynth.setParams(ap);
                aliasSynth.snapParams();
                constexpr int midiNote = 72;  // C5 = 523.25 Hz
                aliasSynth.noteOn(midiNote, 1.0f);  // accented

                std::vector<float> settle(4096 * 2, 0.0f);
                aliasSynth.renderBlock(settle);
                std::vector<float> cap(2048 * 2, 0.0f);
                aliasSynth.renderBlock(cap);
                const auto capMono = extractMono(cap);
                const auto powers = hannDftPowers(capMono);
                const double binHz = sr / static_cast<double>(capMono.size());
                // Include sub harmonics (fSub = f0 / 2 or f0 / 4) as legitimate played harmonics.
                const double baseHz = midiToHz(midiNote + ap.semitones) * ((ap.subOctave == -2) ? 0.25 : 0.5);

                std::vector<bool> harmonicMask(powers.size(), false);
                for (std::size_t b = 0; b <= 4 && b < harmonicMask.size(); ++b) harmonicMask[b] = true;
                for (int h = 1; h * baseHz < 22000.0; ++h) {
                    const auto center = static_cast<std::size_t>(std::llround((h * baseHz) / binHz));
                    for (int d = -4; d <= 4; ++d) {
                        const auto idx = static_cast<std::ptrdiff_t>(center) + d;
                        if (idx >= 0 && static_cast<std::size_t>(idx) < harmonicMask.size()) {
                            harmonicMask[static_cast<std::size_t>(idx)] = true;
                        }
                    }
                }
                double harmEnergy = 0.0;
                double aliasEnergy = 0.0;
                const std::size_t maxBin = static_cast<std::size_t>(std::floor(20000.0 / binHz));
                for (std::size_t k = 1; k <= maxBin && k < powers.size(); ++k) {
                    if (harmonicMask[k]) harmEnergy += powers[k];
                    else aliasEnergy += powers[k];
                }
                if (harmEnergy > 1e-12) {
                    aliasDb = 10.0 * std::log10(std::max(aliasEnergy, 1e-30) / harmEnergy);
                }
            }

            // Part C: Filter state stability at high resonance (res = 0.95) with preset's waveform & drive.
            double hiResState = 0.0;
            std::uint64_t hiResClamps = 0;
            {
                BassSynth hrSynth;
                BassSynthParams hp = preset.params;
                hp.resonance = 0.95f;
                hrSynth.prepare(sr);
                hrSynth.setParams(hp);
                hrSynth.snapParams();
                hrSynth.setTelemetryEnabled(true);
                hrSynth.resetTelemetry();
                hrSynth.noteOn(36, 1.0f);
                std::vector<float> buf(4800 * 2, 0.0f);
                hrSynth.renderBlock(buf);
                QVERIFY(allFinite(buf));
                hiResState = hrSynth.telemetry().maxLadderState;
                hiResClamps = hrSynth.telemetry().fastTanhClampHits + hrSynth.telemetry().ladderClampHits;
            }

            std::fprintf(stderr,
                "%-20s %5.3f %5.2f %5.2f %5.2f %5.2f %5.2f %6llu %5llu %7.1f %7.2f\n",
                preset.id.data(), peak, tel.maxLadderUOverVt, tel.maxLadderState,
                tel.maxVcaOut, tel.maxSatInput, flatPct,
                static_cast<unsigned long long>(totalClamps),
                static_cast<unsigned long long>(tel.satHardKneeHits),
                aliasDb, hiResState);

            const QString pid = QString::fromUtf8(preset.id.data(), static_cast<qsizetype>(preset.id.size()));
            if (totalClamps > 0 || hiResClamps > 0) {
                recordFail(QStringLiteral("%1 hit hard clamp (demo=%2, hiRes=%3)").arg(pid).arg(totalClamps).arg(hiResClamps));
            }
            if (tel.maxSatInput > 1.75 || tel.satHardKneeHits > 0) {
                recordFail(QStringLiteral("%1 overdrives output saturator into flat-top clipping (maxSatIn=%2, hits=%3)")
                    .arg(pid).arg(tel.maxSatInput).arg(tel.satHardKneeHits));
            }
            if (tel.maxLadderUOverVt > 3.5 || tel.maxLadderState > 3.5 || hiResState > 3.5) {
                recordFail(QStringLiteral("%1 ladder state/input too hot (u/Vt=%2, state=%3, hiResState=%4)")
                    .arg(pid).arg(tel.maxLadderUOverVt).arg(tel.maxLadderState).arg(hiResState));
            }
            if (aliasDb > -42.0) {
                recordFail(QStringLiteral("%1 alias energy too high: %2 dB").arg(pid).arg(aliasDb));
            }
        }
        QVERIFY2(failures == 0, qPrintable(QStringLiteral("%1 preset stage/clipping/aliasing check(s) failed; first: %2")
            .arg(failures).arg(firstFail)));
    }

    // 26. BASS2: Zero audible clicks around every note event across all 16 presets on the demo bass line
    //     and explicit transition stress cases (note-on/off, legato retrigger, glide, accent, env restart, phase).
    void allPresetsDemoLineNoEventClicks() {
        constexpr double sr = 48000.0;
        constexpr int blockFrames = 64;
        constexpr int halfWin = 48;  // 2 ms total window (+/- 1 ms around event, plus [0..+2 ms] post-event check)
        constexpr int postWin = 96;  // 2 ms post-event window

        struct DemoNote { double startSec; double lenSec; int midi; float vel; };
        const int pat[16] = {36, 36, 48, 36, 39, 36, 43, 41, 36, 36, 48, 46, 43, 39, 41, 34};
        std::vector<DemoNote> demoNotes;
        for (int i = 0; i < 16; ++i) {
            demoNotes.push_back({i * 0.125, (i % 4 == 3) ? 0.2 : 0.09, pat[i], (i % 4 == 0) ? 1.0f : 0.7f});
        }
        demoNotes.push_back({2.0, 1.0, 36, 0.9f});

        struct EventMark { int frame; bool isOn; int midi; float vel; };

        // High-frequency energy (> 6 kHz) in a 2 ms (96-sample) Hann-windowed slice, in dB.
        auto windowHfDb = [&](std::span<const double> x, int startIdx, int len) {
            if (startIdx < 0) startIdx = 0;
            const int endIdx = std::min<int>(static_cast<int>(x.size()), startIdx + len);
            const int N = endIdx - startIdx;
            if (N < 32) return -120.0;
            std::vector<double> wseg(static_cast<std::size_t>(N));
            const double invNm1 = 1.0 / static_cast<double>(N - 1);
            for (int n = 0; n < N; ++n) {
                const double w = 0.5 * (1.0 - std::cos(2.0 * std::numbers::pi * static_cast<double>(n) * invNm1));
                wseg[static_cast<std::size_t>(n)] = x[static_cast<std::size_t>(startIdx + n)] * w;
            }
            const int kMin = static_cast<int>(std::ceil(6000.0 * static_cast<double>(N) / sr));
            const int kMax = N / 2;
            double hf = 0.0;
            for (int k = kMin; k <= kMax; ++k) {
                const double ang = 2.0 * std::numbers::pi * static_cast<double>(k) / static_cast<double>(N);
                const double ca = std::cos(ang), sa = std::sin(ang);
                double c = 1.0, s = 0.0, re = 0.0, im = 0.0;
                for (int n = 0; n < N; ++n) {
                    const double v = wseg[static_cast<std::size_t>(n)];
                    re += v * c;
                    im -= v * s;
                    const double cn = c * ca - s * sa;
                    s = s * ca + c * sa;
                    c = cn;
                }
                hf += re * re + im * im;
            }
            hf /= static_cast<double>(N) * static_cast<double>(N);
            return 10.0 * std::log10(std::max(hf, 1e-20));
        };

        std::fprintf(stderr,
            "\n[BASS2 Click Audit (2 ms event windows, 120 BPM 16ths)]\n"
            "%-20s %8s %8s %8s %8s %s\n",
            "Preset", "MaxStep", "EvStep", "EvD2", "EvHFdB", "WorstEvent");

        int failures = 0;
        QString firstFail;
        auto recordFail = [&](const QString& msg) {
            ++failures;
            if (firstFail.isEmpty()) firstFail = msg;
            std::fprintf(stderr, "  FAIL: %s\n", qPrintable(msg));
        };

        for (const auto& preset : factoryBassPresets()) {
            BassSynth synth;
            synth.prepare(sr);
            synth.setParams(preset.params);
            synth.snapParams();

            const int totalFrames = static_cast<int>(3.5 * sr);
            std::vector<float> out(static_cast<std::size_t>(totalFrames) * 2, 0.0f);
            std::vector<EventMark> marks;
            for (int pos = 0; pos < totalFrames; pos += blockFrames) {
                const double t0 = static_cast<double>(pos) / sr;
                const double t1 = static_cast<double>(pos + blockFrames) / sr;
                for (const auto& n : demoNotes) {
                    if (n.startSec + n.lenSec >= t0 && n.startSec + n.lenSec < t1) {
                        synth.noteOff(n.midi);
                        marks.push_back({pos, false, n.midi, 0.0f});
                    }
                }
                for (const auto& n : demoNotes) {
                    if (n.startSec >= t0 && n.startSec < t1) {
                        synth.noteOn(n.midi, n.vel);
                        marks.push_back({pos, true, n.midi, n.vel});
                    }
                }
                const int frames = std::min(blockFrames, totalFrames - pos);
                synth.renderBlock(std::span<float>(
                    out.data() + static_cast<std::size_t>(pos) * 2,
                    static_cast<std::size_t>(frames) * 2));
            }
            QVERIFY(allFinite(out));

            const auto mono = extractMono(out);
            double globalMaxStep = 0.0;
            for (std::size_t i = 1; i < mono.size(); ++i) {
                globalMaxStep = std::max(globalMaxStep, std::abs(mono[i] - mono[i - 1]));
            }

            double worstEvStep = 0.0;
            double worstEvD2 = 0.0;
            double worstEvHfDb = -120.0;
            QString worstEvLabel;

            for (const auto& ev : marks) {
                const int lo = std::max(1, ev.frame - halfWin);
                const int hi = std::min<int>(static_cast<int>(mono.size()) - 1, ev.frame + postWin);
                double evStep = 0.0;
                double evD2 = 0.0;
                for (int i = lo; i <= hi; ++i) {
                    evStep = std::max(evStep, std::abs(mono[static_cast<std::size_t>(i)] - mono[static_cast<std::size_t>(i - 1)]));
                    if (i >= 2) {
                        const double d2 = std::abs(mono[static_cast<std::size_t>(i)]
                                                   - 2.0 * mono[static_cast<std::size_t>(i - 1)]
                                                   + mono[static_cast<std::size_t>(i - 2)]);
                        evD2 = std::max(evD2, d2);
                    }
                }
                const double hfCentered = windowHfDb(mono, ev.frame - halfWin, halfWin * 2);
                const double hfPost = windowHfDb(mono, ev.frame, postWin);
                const double evHf = std::max(hfCentered, hfPost);
                if (evStep > worstEvStep) {
                    worstEvStep = evStep;
                    worstEvLabel = QStringLiteral("%1@%2s(m=%3,v=%4)")
                        .arg(ev.isOn ? QStringLiteral("ON") : QStringLiteral("OFF"))
                        .arg(static_cast<double>(ev.frame) / sr, 0, 'f', 3)
                        .arg(ev.midi)
                        .arg(ev.vel, 0, 'f', 1);
                }
                worstEvD2 = std::max(worstEvD2, evD2);
                worstEvHfDb = std::max(worstEvHfDb, evHf);
            }

            std::fprintf(stderr,
                "%-20s %8.4f %8.4f %8.4f %8.1f %s\n",
                preset.id.data(), globalMaxStep, worstEvStep, worstEvD2, worstEvHfDb, qPrintable(worstEvLabel));

            const QString pid = QString::fromUtf8(preset.id.data(), static_cast<qsizetype>(preset.id.size()));
            if (worstEvStep > 0.22) {
                recordFail(QStringLiteral("%1 event click step too large: evStep=%2 (%3)")
                    .arg(pid).arg(worstEvStep).arg(worstEvLabel));
            }
            if (worstEvHfDb > -52.0) {
                recordFail(QStringLiteral("%1 event 2ms HF click energy too high: %2 dB")
                    .arg(pid).arg(worstEvHfDb));
            }
        }

        // Explicit click-stress sequence covering every transition mode:
        // note-on from silence, legato glide (slideMs=60 & slideMs=0), legato retrigger (retrigger=true),
        // accent<->plain, note-off mid-attack/sustain, envelope restart from non-zero release tail,
        // and fast filter envelope jump at high resonance (no oscillator phase reset while sounding).
        {
            const auto* neon = findBassPreset("bl1-neon-squelch");
            QVERIFY(neon != nullptr);
            for (const bool retrig : {false, true}) {
                for (const float slideMs : {60.0f, 0.0f}) {
                    BassSynth synth;
                    BassSynthParams p = neon->params;
                    p.retrigger = retrig;
                    p.slideMs = slideMs;
                    p.filterAttackMs = 0.5f;
                    p.attackMs = 0.5f;
                    p.sustain = 0.75f;
                    synth.prepare(sr);
                    synth.setParams(p);
                    synth.snapParams();

                    const std::array<BassSynth::NoteEvent, 11> evs{{
                        {0,    BassSynth::EventKind::NoteOn,  36, 1.0f, 1.0f},  // cold accented note-on
                        {2400, BassSynth::EventKind::NoteOn,  48, 0.65f, 1.0f}, // legato accent -> plain
                        {4800, BassSynth::EventKind::NoteOn,  39, 1.0f, 1.0f},  // legato plain -> accent
                        {7200, BassSynth::EventKind::NoteOff, 39, 0.0f, 1.0f},  // legato fallback to 48
                        {9600, BassSynth::EventKind::NoteOff, 48, 0.0f, 1.0f},  // legato fallback to 36
                        {11000, BassSynth::EventKind::NoteOff, 36, 0.0f, 1.0f}, // release gate
                        {12200, BassSynth::EventKind::NoteOn, 43, 1.0f, 1.0f},  // restart from non-zero release tail (25 ms later)
                        {12500, BassSynth::EventKind::NoteOff, 43, 0.0f, 1.0f}, // note-off during early decay/attack
                        {13200, BassSynth::EventKind::NoteOn, 36, 0.60f, 1.0f}, // plain restart after accented release tail
                        {15000, BassSynth::EventKind::NoteOn, 36, 1.0f, 1.0f},  // same-pitch accented legato
                        {17000, BassSynth::EventKind::NoteOff, 36, 0.0f, 1.0f},
                    }};
                    std::vector<float> buf(20000 * 2, 0.0f);
                    synth.renderBlock(buf, evs);
                    QVERIFY(allFinite(buf));
                    const auto mono = extractMono(buf);
                    for (const auto& ev : evs) {
                        const int lo = std::max(1, ev.frameOffset - halfWin);
                        const int hi = std::min<int>(static_cast<int>(mono.size()) - 1, ev.frameOffset + postWin);
                        double preStep = 0.0;
                        double postStep = 0.0;
                        double boundaryD2 = 0.0;
                        for (int i = lo; i <= hi; ++i) {
                            const double d = std::abs(mono[static_cast<std::size_t>(i)] - mono[static_cast<std::size_t>(i - 1)]);
                            if (i < ev.frameOffset) preStep = std::max(preStep, d);
                            else postStep = std::max(postStep, d);
                            if (i >= std::max(2, ev.frameOffset - 2) && i <= ev.frameOffset + 24) {
                                const double d2 = std::abs(mono[static_cast<std::size_t>(i)]
                                                           - 2.0 * mono[static_cast<std::size_t>(i - 1)]
                                                           + mono[static_cast<std::size_t>(i - 2)]);
                                boundaryD2 = std::max(boundaryD2, d2);
                            }
                        }
                        const double hfPre = (ev.frameOffset >= postWin)
                            ? windowHfDb(mono, ev.frameOffset - postWin, postWin)
                            : -120.0;
                        const double hfPost = windowHfDb(mono, ev.frameOffset, postWin);
                        const double stepBound = std::max(0.22, preStep * 1.4 + 0.02);
                        const double hfBound = std::max(-52.0, hfPre + 3.0);
                        if (postStep > stepBound || hfPost > hfBound || boundaryD2 > std::max(0.08, preStep * 1.2 + 0.02)) {
                            recordFail(QStringLiteral("Transition click (retrig=%1 slide=%2 frame=%3): preStep=%4 postStep=%5 d2=%6 hfPre=%7 hfPost=%8 dB")
                                .arg(retrig ? 1 : 0).arg(slideMs).arg(ev.frameOffset)
                                .arg(preStep).arg(postStep).arg(boundaryD2).arg(hfPre).arg(hfPost));
                        }
                    }
                }
            }
        }

        QVERIFY2(failures == 0, qPrintable(QStringLiteral("%1 preset click check(s) failed; first: %2")
            .arg(failures).arg(firstFail)));
    }

    // 27. BASS3: Cold-start first note after prepare/snapParams must match the same note played again later
    //     across all 16 presets (first-note 10 ms onset step and 2 ms HF energy within 1.5x of later note).
    void allPresetsColdStartMatchesLaterNote() {
        constexpr double sr = 48000.0;
        constexpr int blockFrames = 64;
        constexpr int onsetWin = 480;  // 10 ms
        constexpr int hfWin = 96;      // 2 ms

        // Computes linear high-frequency (> 6 kHz) power in a 2 ms Hann-windowed slice.
        auto windowHfPower = [&](std::span<const double> x, int startIdx, int len) {
            if (startIdx < 0) startIdx = 0;
            const int endIdx = std::min<int>(static_cast<int>(x.size()), startIdx + len);
            const int N = endIdx - startIdx;
            if (N < 32) return 0.0;
            std::vector<double> wseg(static_cast<std::size_t>(N));
            const double invNm1 = 1.0 / static_cast<double>(N - 1);
            for (int n = 0; n < N; ++n) {
                const double w = 0.5 * (1.0 - std::cos(2.0 * std::numbers::pi * static_cast<double>(n) * invNm1));
                wseg[static_cast<std::size_t>(n)] = x[static_cast<std::size_t>(startIdx + n)] * w;
            }
            const int kMin = static_cast<int>(std::ceil(6000.0 * static_cast<double>(N) / sr));
            const int kMax = N / 2;
            double hf = 0.0;
            for (int k = kMin; k <= kMax; ++k) {
                const double ang = 2.0 * std::numbers::pi * static_cast<double>(k) / static_cast<double>(N);
                const double ca = std::cos(ang), sa = std::sin(ang);
                double c = 1.0, s = 0.0, re = 0.0, im = 0.0;
                for (int n = 0; n < N; ++n) {
                    const double v = wseg[static_cast<std::size_t>(n)];
                    re += v * c;
                    im -= v * s;
                    const double cn = c * ca - s * sa;
                    s = s * ca + c * sa;
                    c = cn;
                }
                hf += re * re + im * im;
            }
            return hf / (static_cast<double>(N) * static_cast<double>(N));
        };

        // Play the exact same accented note (MIDI 36, vel 1.0, len 90 ms) at t = 0 (cold start)
        // and repeated 7 times at 125 ms intervals (warm retriggers spanning the full oscillator
        // phase circle, since 0.125 s * 65.406 Hz = 8.176 cycles -> ~63 deg phase shift per note),
        // plus one more repetition after 0.5 s of full silence.
        // Comparing Note 0 against both the full-cycle (20 ms) onset of every later note and the
        // 10 ms onset across the phase-matched later notes isolates true cold-start discrepancies
        // from single-cycle phase alignment luck.
        constexpr int kNumNotes = 8;
        struct TestNote { double startSec; double lenSec; int midi; float vel; };
        std::vector<TestNote> notes;
        notes.reserve(kNumNotes);
        for (int i = 0; i < kNumNotes; ++i) {
            notes.push_back({i * 0.125, 0.090, 36, 1.0f});
        }

        std::fprintf(stderr,
            "\n[BASS3 Cold-Start vs Later Same Note (MIDI 36, vel 1.0, 10 ms / 20 ms / same-phase)]\n"
            "%-20s %7s %7s %6s %7s %7s %6s | %7s %7s %6s\n",
            "Preset", "Stp0_10", "LatM_10", "Rat10", "HF0(dB)", "HFL(dB)", "HFRat", "Ph0_10", "Ph1_10", "PhRat");

        int failures = 0;
        QString firstFail;
        auto recordFail = [&](const QString& msg) {
            ++failures;
            if (firstFail.isEmpty()) firstFail = msg;
            std::fprintf(stderr, "  FAIL: %s\n", qPrintable(msg));
        };

        auto measureOnsetWin = [&](std::span<const double> mono, int startFrame, int winFrames) {
            const int hi = std::min<int>(static_cast<int>(mono.size()) - 1, startFrame + winFrames);
            double maxStep = 0.0;
            for (int i = std::max(1, startFrame); i <= hi; ++i) {
                maxStep = std::max(maxStep, std::abs(mono[static_cast<std::size_t>(i)] - mono[static_cast<std::size_t>(i - 1)]));
            }
            double maxHf = 0.0;
            for (int off = 0; off + hfWin <= winFrames; off += 16) {
                maxHf = std::max(maxHf, windowHfPower(mono, startFrame + off, hfWin));
            }
            return std::pair{maxStep, maxHf};
        };

        constexpr int fullCycleWin = 960;  // 20 ms (> 1 full 15.29 ms cycle of MIDI 36)

        for (const auto& preset : factoryBassPresets()) {
            BassSynth synth;
            synth.prepare(sr);
            synth.setParams(preset.params);
            synth.snapParams();

            const int totalFrames = static_cast<int>(1.25 * sr);
            std::vector<float> out(static_cast<std::size_t>(totalFrames) * 2, 0.0f);
            for (int pos = 0; pos < totalFrames; pos += blockFrames) {
                const double t0 = static_cast<double>(pos) / sr;
                const double t1 = static_cast<double>(pos + blockFrames) / sr;
                for (const auto& n : notes) {
                    if (n.startSec + n.lenSec >= t0 && n.startSec + n.lenSec < t1) {
                        synth.noteOff(n.midi);
                    }
                }
                for (const auto& n : notes) {
                    if (n.startSec >= t0 && n.startSec < t1) {
                        synth.noteOn(n.midi, n.vel);
                    }
                }
                const int frames = std::min(blockFrames, totalFrames - pos);
                synth.renderBlock(std::span<float>(
                    out.data() + static_cast<std::size_t>(pos) * 2,
                    static_cast<std::size_t>(frames) * 2));
            }
            QVERIFY(allFinite(out));

            const auto mono = extractMono(out);
            const auto [step0_10, hf0_10] = measureOnsetWin(mono, 0, onsetWin);
            const auto [step0_20, hf0_20] = measureOnsetWin(mono, 0, fullCycleWin);

            double laterMaxStep10 = 0.0;
            double laterMaxHf10 = 0.0;
            double laterMinStep20 = std::numeric_limits<double>::infinity();
            double laterMinHf20 = std::numeric_limits<double>::infinity();
            double laterMaxStep20 = 0.0;
            double laterMaxHf20 = 0.0;
            for (int i = 1; i < kNumNotes; ++i) {
                const int st = static_cast<int>(std::llround(notes[static_cast<std::size_t>(i)].startSec * sr));
                const auto [s10, h10] = measureOnsetWin(mono, st, onsetWin);
                const auto [s20, h20] = measureOnsetWin(mono, st, fullCycleWin);
                laterMaxStep10 = std::max(laterMaxStep10, s10);
                laterMaxHf10 = std::max(laterMaxHf10, h10);
                laterMinStep20 = std::min(laterMinStep20, s20);
                laterMinHf20 = std::min(laterMinHf20, h20);
                laterMaxStep20 = std::max(laterMaxStep20, s20);
                laterMaxHf20 = std::max(laterMaxHf20, h20);
            }

            const double ratio10 = step0_10 / std::max(laterMaxStep10, 1e-6);
            const double hfRatio10 = hf0_10 / std::max(laterMaxHf10, 1e-12);
            const double ratio20 = step0_20 / std::max(laterMaxStep20, 1e-6);
            const double hfRatio20 = hf0_20 / std::max(laterMaxHf20, 1e-12);
            const double hf0Db = 10.0 * std::log10(std::max(hf0_10, 1e-20));
            const double hfLDb = 10.0 * std::log10(std::max(laterMaxHf10, 1e-20));
            (void)laterMinStep20;
            (void)laterMinHf20;

            const QString pid = QString::fromUtf8(preset.id.data(), static_cast<qsizetype>(preset.id.size()));
            if (step0_10 > laterMaxStep10 * 1.5 && step0_10 > 0.005) {
                recordFail(QStringLiteral("%1 cold-start 10ms step %2 > 1.5x later note %3 (ratio=%4x)")
                    .arg(pid).arg(step0_10, 0, 'f', 4).arg(laterMaxStep10, 0, 'f', 4).arg(ratio10, 0, 'f', 2));
            }
            if (hf0_10 > laterMaxHf10 * 1.5 && hf0Db > -75.0) {
                recordFail(QStringLiteral("%1 cold-start 2ms HF energy %2 dB > 1.5x later note %3 dB (ratio=%4x)")
                    .arg(pid).arg(hf0Db, 0, 'f', 1).arg(hfLDb, 0, 'f', 1).arg(hfRatio10, 0, 'f', 2));
            }
            if (step0_20 > laterMaxStep20 * 1.5 && step0_20 > 0.005) {
                recordFail(QStringLiteral("%1 cold-start 20ms step %2 > 1.5x later note %3 (ratio=%4x)")
                    .arg(pid).arg(step0_20, 0, 'f', 4).arg(laterMaxStep20, 0, 'f', 4).arg(ratio20, 0, 'f', 2));
            }
            if (hf0_20 > laterMaxHf20 * 1.5 && 10.0 * std::log10(std::max(hf0_20, 1e-20)) > -75.0) {
                recordFail(QStringLiteral("%1 cold-start 20ms 2ms-HF %2 dB > 1.5x later note %3 dB (ratio=%4x)")
                    .arg(pid)
                    .arg(10.0 * std::log10(std::max(hf0_20, 1e-20)), 0, 'f', 1)
                    .arg(10.0 * std::log10(std::max(laterMaxHf20, 1e-20)), 0, 'f', 1)
                    .arg(hfRatio20, 0, 'f', 2));
            }

            // Part B: Exact same-phase cold-start vs later warm note (analogDrift = 0, exact integer cycles apart).
            // Eliminates phase-alignment variance so any residual smoother/envelope/FIR/ladder cold-start
            // discrepancy shows up directly.
            {
                BassSynth pSynth;
                BassSynthParams pp = preset.params;
                pp.analogDrift = 0.0f;
                pSynth.prepare(sr);
                pSynth.setParams(pp);
                pSynth.snapParams();

                const double f0 = midiToHz(36 + pp.semitones);
                const double subMul = (pp.subOctave == -2) ? 0.25 : 0.5;
                const double cycleSec = 1.0 / (f0 * subMul);  // aligns both main and sub oscillator phases
                const int cyclesBetween = std::max(1, static_cast<int>(std::ceil(0.140 / cycleSec)));
                const int note1Frame = static_cast<int>(std::llround(static_cast<double>(cyclesBetween) * cycleSec * sr));
                const int off0Frame = static_cast<int>(std::llround(0.080 * sr));
                const int off1Frame = note1Frame + off0Frame;
                const int pTotalFrames = off1Frame + static_cast<int>(0.050 * sr);

                const std::array<BassSynth::NoteEvent, 4> pevs{{
                    {0,          BassSynth::EventKind::NoteOn,  36, 1.0f, 1.0f},
                    {off0Frame,  BassSynth::EventKind::NoteOff, 36, 0.0f, 1.0f},
                    {note1Frame, BassSynth::EventKind::NoteOn,  36, 1.0f, 1.0f},
                    {off1Frame,  BassSynth::EventKind::NoteOff, 36, 0.0f, 1.0f},
                }};
                std::vector<float> pOut(static_cast<std::size_t>(pTotalFrames) * 2, 0.0f);
                pSynth.renderBlock(pOut, pevs);
                QVERIFY(allFinite(pOut));

                const auto pMono = extractMono(pOut);
                const auto [ps0, ph0] = measureOnsetWin(pMono, 0, onsetWin);
                const auto [ps1, ph1] = measureOnsetWin(pMono, note1Frame, onsetWin);
                const double pStepRat = ps0 / std::max(ps1, 1e-6);
                const double pHfRat = ph0 / std::max(ph1, 1e-12);
                const double ph0Db = 10.0 * std::log10(std::max(ph0, 1e-20));
                const double ph1Db = 10.0 * std::log10(std::max(ph1, 1e-20));

                std::fprintf(stderr,
                    "%-20s %7.4f %7.4f %5.2fx %7.1f %7.1f %5.2fx | %7.4f %7.4f %5.2fx\n",
                    preset.id.data(), step0_10, laterMaxStep10, ratio10, hf0Db, hfLDb, hfRatio10,
                    ps0, ps1, pStepRat);

                if (ps0 > ps1 * 1.5 && ps0 > 0.005) {
                    recordFail(QStringLiteral("%1 same-phase cold step %2 > 1.5x later %3 (ratio=%4x)")
                        .arg(pid).arg(ps0, 0, 'f', 4).arg(ps1, 0, 'f', 4).arg(pStepRat, 0, 'f', 2));
                }
                if (ph0 > ph1 * 1.5 && ph0Db > -75.0) {
                    recordFail(QStringLiteral("%1 same-phase cold 2ms-HF %2 dB > 1.5x later %3 dB (ratio=%4x)")
                        .arg(pid).arg(ph0Db, 0, 'f', 1).arg(ph1Db, 0, 'f', 1).arg(pHfRat, 0, 'f', 2));
                }
            }
        }

        QVERIFY2(failures == 0, qPrintable(QStringLiteral("%1 preset cold-start onset check(s) failed; first: %2")
            .arg(failures).arg(firstFail)));
    }
};

QTEST_MAIN(TestBassSynth)
#include "tst_basssynth.moc"
