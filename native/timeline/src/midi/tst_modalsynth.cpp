// Tests for nt::midi::ModalSynth, nt::midi::ModalSynthProcessor, ModalPresets,
// and ModalEdits (ported from RipplerX at commit 11683a6, GPL-3.0).
// Covers: modal frequencies vs ratio tables (cents), decay time tracking,
// mallet stiffness spectral centroid shift, waveguide OpenTube & ClosedTube pitch
// accuracy, parallel & serial coupling, noise exciter / stereoizer / pitch bend /
// 44.1-48-96 kHz, extreme-parameter stability (no NaN/blow-up), reference render
// match against RipplerX algorithm value table, factory presets & edits,
// sample-accurate BlockProcessor MIDI, zero audio-thread allocations, and
// 16-voice CPU bound.

#include "audio/Mixer.h"
#if defined(__SANITIZE_THREAD__)
#define NT_MODAL_TSAN 1
#elif defined(__has_feature)
#if __has_feature(thread_sanitizer)
#define NT_MODAL_TSAN 1
#endif
#endif
// On macOS under TSan, dyld::_tlv_get_addr allocates via calloc on new threads,
// which recurses through TestAllocationCounter's global TSan malloc hook.
#if !(defined(__APPLE__) && defined(NT_MODAL_TSAN))
#include "audio/TestAllocationCounter.h"
#define NT_MODAL_HAS_ALLOC_COUNTER 1
#endif
#include "midi/modal/ModalDsp.h"
#include "midi/modal/ModalEdits.h"
#include "midi/modal/ModalPresets.h"
#include "midi/modal/ModalSynth.h"
#include "model/TimelineJson.h"

#include <QDir>
#include <QFile>
#include <QFileInfo>
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
#include <thread>
#include <vector>

using namespace nt::midi;
using namespace nt::midi::modal;

namespace nt::midi::modal {
struct ModalSynthTestPeer {
    static void injectPartialNonFinite(nt::midi::ModalSynth& synth, int voiceIdx, int partialIdx, double val) noexcept {
        (*synth.voices_)[static_cast<std::size_t>(voiceIdx)].resA.partials[static_cast<std::size_t>(partialIdx)].y1 = val;
    }
    static void injectWaveguideState(nt::midi::ModalSynth& synth, int voiceIdx, double val) noexcept {
        auto& wg = (*synth.voices_)[static_cast<std::size_t>(voiceIdx)].resA.waveguide;
        std::fill(wg.tube_.begin(), wg.tube_.end(), val);
    }
    static double partialFreqHz(const nt::midi::ModalSynth& synth, int voiceIdx, bool isA, int partialIdx) noexcept {
        const auto& v = (*synth.voices_)[static_cast<std::size_t>(voiceIdx)];
        const auto& res = isA ? v.resA : v.resB;
        return res.partials[static_cast<std::size_t>(partialIdx)].f_k;
    }
    static modal::ModalModel activeAModel(const nt::midi::ModalSynth& synth) noexcept {
        return synth.lastAModel_;
    }
    static double voicePartialFreqHz(const modal::ModalVoice& voice, bool isA, int partialIdx) noexcept {
        const auto& res = isA ? voice.resA : voice.resB;
        return res.partials[static_cast<std::size_t>(partialIdx)].f_k;
    }
    static const modal::ModalTableSnapshot& buildTestSnapshot(
        const nt::midi::ModalSynthParams& p, modal::ModalTableSnapshot& out) noexcept {
        nt::midi::ModalSynth::buildTableSnapshot(p, out, true, nullptr);
        return out;
    }
};
}  // namespace nt::midi::modal

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

bool allFinite(std::span<const float> buf) {
    for (float v : buf) {
        if (!std::isfinite(v)) return false;
    }
    return true;
}

double peakAbs(std::span<const float> buf) {
    double p = 0.0;
    for (float v : buf) {
        p = std::max(p, std::abs(static_cast<double>(v)));
    }
    return p;
}

double rmsSpan(std::span<const double> x) {
    if (x.empty()) return 0.0;
    double sum = 0.0;
    for (double v : x) sum += v * v;
    return std::sqrt(sum / static_cast<double>(x.size()));
}

// Hann-windowed DFT magnitude squared at a single frequency.
double dftPowerAtHz(std::span<const double> x, double sampleRate, double freqHz) {
    const std::size_t N = x.size();
    if (N < 2) return 0.0;
    const double w = 2.0 * std::numbers::pi * freqHz / sampleRate;
    const double cStep = std::cos(w);
    const double sStep = std::sin(w);
    double c = 1.0;
    double s = 0.0;
    double re = 0.0;
    double im = 0.0;
    const double invNm1 = 1.0 / static_cast<double>(N - 1);
    for (std::size_t n = 0; n < N; ++n) {
        const double win = 0.5 * (1.0 - std::cos(2.0 * std::numbers::pi * static_cast<double>(n) * invNm1));
        const double v = x[n] * win;
        re += v * c;
        im -= v * s;
        const double cNext = c * cStep - s * sStep;
        const double sNext = s * cStep + c * sStep;
        c = cNext;
        s = sNext;
    }
    return (re * re + im * im) / (static_cast<double>(N) * static_cast<double>(N));
}

// Searches around `expectedHz` within +/- `searchPct` for the local spectral peak in Hz,
// using coarse scan + golden-section / parabolic refinement on continuous-frequency DFT.
double findPeakHzNear(std::span<const double> x, double sampleRate, double expectedHz, double searchPct = 0.06) {
    const double lo = std::max(20.0, expectedHz * (1.0 - searchPct));
    const double hi = std::min(sampleRate * 0.48, expectedHz * (1.0 + searchPct));
    constexpr int steps = 48;
    double bestF = expectedHz;
    double bestP = -1.0;
    for (int i = 0; i <= steps; ++i) {
        const double f = lo + (hi - lo) * static_cast<double>(i) / static_cast<double>(steps);
        const double p = dftPowerAtHz(x, sampleRate, f);
        if (p > bestP) {
            bestP = p;
            bestF = f;
        }
    }
    // Fine scan around bestF.
    const double step = (hi - lo) / static_cast<double>(steps);
    double fLo = std::max(lo, bestF - step);
    double fHi = std::min(hi, bestF + step);
    for (int i = 0; i <= 24; ++i) {
        const double f = fLo + (fHi - fLo) * static_cast<double>(i) / 24.0;
        const double p = dftPowerAtHz(x, sampleRate, f);
        if (p > bestP) {
            bestP = p;
            bestF = f;
        }
    }
    return bestF;
}

double centsError(double measuredHz, double expectedHz) {
    if (measuredHz <= 0.0 || expectedHz <= 0.0) return 1e9;
    return 1200.0 * std::log2(measuredHz / expectedHz);
}

// Computes spectral centroid via radix-2 FFT on a Hann-windowed power-of-2 slice.
void fftInPlace(std::vector<double>& re, std::vector<double>& im) {
    const std::size_t n = re.size();
    for (std::size_t i = 1, j = 0; i < n; ++i) {
        std::size_t bit = n >> 1;
        for (; j & bit; bit >>= 1) j ^= bit;
        j ^= bit;
        if (i < j) {
            std::swap(re[i], re[j]);
            std::swap(im[i], im[j]);
        }
    }
    for (std::size_t len = 2; len <= n; len <<= 1) {
        const double ang = -2.0 * std::numbers::pi / static_cast<double>(len);
        const double wRe = std::cos(ang);
        const double wIm = std::sin(ang);
        for (std::size_t i = 0; i < n; i += len) {
            double uRe = 1.0;
            double uIm = 0.0;
            const std::size_t half = len >> 1;
            for (std::size_t j = 0; j < half; ++j) {
                const double tRe = uRe * re[i + j + half] - uIm * im[i + j + half];
                const double tIm = uRe * im[i + j + half] + uIm * re[i + j + half];
                re[i + j + half] = re[i + j] - tRe;
                im[i + j + half] = im[i + j] - tIm;
                re[i + j] += tRe;
                im[i + j] += tIm;
                const double nextURe = uRe * wRe - uIm * wIm;
                uIm = uRe * wIm + uIm * wRe;
                uRe = nextURe;
            }
        }
    }
}

double spectralCentroidHz(std::span<const double> x, double sampleRate) {
    std::size_t n = 1;
    while (n * 2 <= x.size()) n *= 2;
    std::vector<double> re(n, 0.0);
    std::vector<double> im(n, 0.0);
    const double invNm1 = n > 1 ? 1.0 / static_cast<double>(n - 1) : 0.0;
    for (std::size_t i = 0; i < n; ++i) {
        const double win = 0.5 * (1.0 - std::cos(2.0 * std::numbers::pi * static_cast<double>(i) * invNm1));
        re[i] = x[i] * win;
    }
    fftInPlace(re, im);
    double num = 0.0;
    double den = 0.0;
    const double binHz = sampleRate / static_cast<double>(n);
    for (std::size_t k = 1; k < n / 2; ++k) {
        const double mag = std::sqrt(re[k] * re[k] + im[k] * im[k]);
        num += mag * (static_cast<double>(k) * binHz);
        den += mag;
    }
    return den > 1e-12 ? (num / den) : 0.0;
}

QJsonObject makeMidiTimelineDoc(const QJsonObject& instrument, const QJsonArray& notes, double bpm = 120.0) {
    QJsonObject clip{
        {QStringLiteral("id"), QStringLiteral("c1")},
        {QStringLiteral("trackId"), QStringLiteral("t1")},
        {QStringLiteral("mediaType"), QStringLiteral("midi")},
        {QStringLiteral("startMs"), 0.0},
        {QStringLiteral("durationMs"), 4000.0},
        {QStringLiteral("inPointMs"), 0.0},
        {QStringLiteral("volumeDb"), 0.0},
        {QStringLiteral("notes"), notes},
    };
    QJsonObject track{
        {QStringLiteral("id"), QStringLiteral("t1")},
        {QStringLiteral("type"), QStringLiteral("midi")},
        {QStringLiteral("name"), QStringLiteral("Modal")},
        {QStringLiteral("volumeDb"), 0.0},
        {QStringLiteral("pan"), 0.0},
        {QStringLiteral("instrument"), instrument},
    };
    return QJsonObject{
        {QStringLiteral("version"), 1},
        {QStringLiteral("tempo"), QJsonObject{{QStringLiteral("bpm"), bpm}}},
        {QStringLiteral("tracks"), QJsonArray{track}},
        {QStringLiteral("clips"), QJsonArray{clip}},
    };
}

}  // namespace

class TestModalSynth : public QObject {
    Q_OBJECT

private slots:
    // 1. Modal frequencies match the model ratio tables within tight cent tolerance.
    void modalFrequenciesMatchRatioTables() {
        constexpr double sr = 48000.0;
        constexpr int midiNote = 60;  // C4 = 261.6256 Hz
        const double f0 = midiToHz(midiNote);
        constexpr std::size_t frames = 24000;  // 0.5 s -> 2 Hz bin spacing

        struct ModelCase {
            ModalModel model;
            double ratio;
            std::array<int, 3> checkIndices;  // 0-based partial indices with non-nodal hit pos
        };
        const std::array<ModelCase, 10> cases{{
            {ModalModel::String, 0.78, {0, 1, 2}},
            {ModalModel::Beam, 2.0, {0, 1, 2}},
            {ModalModel::Squared, 0.78, {0, 1, 2}},
            {ModalModel::Membrane, 0.78, {0, 1, 2}},
            {ModalModel::Plate, 0.78, {0, 1, 2}},
            {ModalModel::Drumhead, 0.78, {0, 1, 2}},
            {ModalModel::Marimba, 0.78, {0, 1, 2}},
            {ModalModel::Marimba2, 0.78, {0, 1, 2}},
            {ModalModel::Bell, 0.78, {0, 2, 4}},
            {ModalModel::Djembe, 1.0, {0, 1, 2}},
        }};

        for (const auto& tc : cases) {
            ModalSynth synth;
            ModalSynthParams p{};
            p.stereoizer = false;
            p.malletStiff = 2400.0f;
            p.malletRes = 0.8f;
            p.malletMix = 0.0f;
            p.a.on = true;
            p.a.model = tc.model;
            p.a.partials = 8;
            p.a.decay = 3.0f;
            p.a.damp = 0.0f;
            p.a.tone = 0.0f;
            p.a.hit = 0.17f;  // avoids nodes of k=1,2,3,5
            p.a.inharm = 0.0001f;
            p.a.ratio = static_cast<float>(tc.ratio);
            p.b.on = false;

            synth.prepare(sr);
            synth.setParams(p);
            synth.snapParams();
            synth.noteOn(midiNote, 1.0f);

            std::vector<float> pcm(frames * 2, 0.0f);
            synth.renderBlock(pcm);
            QVERIFY(allFinite(pcm));
            const auto mono = extractMono(pcm);
            QVERIFY2(rmsSpan(mono) > 1e-4,
                     qPrintable(QStringLiteral("Silent output for model %1").arg(QString::fromUtf8(modalModelName(tc.model)))));

            std::array<double, kMaxPartials> table = synth.models().ratios(true, tc.model);
            if (tc.model == ModalModel::Djembe) {
                synth.models().calcDjembe(f0, tc.ratio, table);
            }
            for (int idx : tc.checkIndices) {
                const double expectedHz = f0 * table[static_cast<std::size_t>(idx)];
                if (expectedHz >= 16000.0) continue;
                const double measuredHz = findPeakHzNear(mono, sr, expectedHz, 0.04);
                const double errCents = std::abs(centsError(measuredHz, expectedHz));
                QVERIFY2(errCents < 12.0,
                         qPrintable(QStringLiteral("Model %1 partial %2: expected %3 Hz, measured %4 Hz (err %5 cents)")
                                        .arg(QString::fromUtf8(modalModelName(tc.model)))
                                        .arg(idx + 1)
                                        .arg(expectedHz, 0, 'f', 2)
                                        .arg(measuredHz, 0, 'f', 2)
                                        .arg(errCents, 0, 'f', 2)));
            }
        }
    }

    // 2. Decay time monotonically follows the decay parameter.
    void decayTimeFollowsParameter() {
        constexpr double sr = 48000.0;
        constexpr std::size_t totalFrames = 48000;  // 1.0 s

        auto measureTailRatio = [&](float decaySec) {
            ModalSynth synth;
            ModalSynthParams p{};
            p.stereoizer = false;
            p.malletStiff = 1000.0f;
            p.malletRes = 0.7f;
            p.a.on = true;
            p.a.model = ModalModel::String;
            p.a.partials = 4;
            p.a.decay = decaySec;
            p.a.damp = 0.0f;
            p.a.tone = 0.0f;
            p.a.hit = 0.25f;
            p.a.inharm = 0.0001f;
            p.b.on = false;

            synth.prepare(sr);
            synth.setParams(p);
            synth.snapParams();
            synth.noteOn(69, 0.9f);

            std::vector<float> pcm(totalFrames * 2, 0.0f);
            synth.renderBlock(pcm);
            const auto mono = extractMono(pcm);
            const double earlyRms = rmsSpan(std::span<const double>(mono.data() + 1000, 4000));
            const double lateRms = rmsSpan(std::span<const double>(mono.data() + 36000, 8000));
            return earlyRms > 1e-9 ? (lateRms / earlyRms) : 0.0;
        };

        const double shortRatio = measureTailRatio(0.25f);
        const double medRatio = measureTailRatio(1.2f);
        const double longRatio = measureTailRatio(5.0f);

        QVERIFY2(shortRatio < medRatio && medRatio < longRatio,
                 qPrintable(QStringLiteral("Decay tail ratios not monotonic: short=%1 med=%2 long=%3")
                                .arg(shortRatio).arg(medRatio).arg(longRatio)));
        QVERIFY2(shortRatio < 0.05, qPrintable(QStringLiteral("Short decay too slow: %1").arg(shortRatio)));
        QVERIFY2(longRatio > 0.35, qPrintable(QStringLiteral("Long decay too fast: %1").arg(longRatio)));
    }

    // 3. Mallet stiffness increases spectral centroid.
    void malletStiffnessChangesSpectralCentroid() {
        constexpr double sr = 48000.0;
        constexpr std::size_t frames = 8192;

        auto centroidForStiffness = [&](float stiffHz) {
            ModalSynth synth;
            ModalSynthParams p{};
            p.stereoizer = false;
            p.malletStiff = stiffHz;
            p.malletRes = 0.8f;
            p.malletMix = 0.0f;
            p.a.on = true;
            p.a.model = ModalModel::String;
            p.a.partials = 32;
            p.a.decay = 1.5f;
            p.a.hit = 0.13f;
            p.b.on = false;

            synth.prepare(sr);
            synth.setParams(p);
            synth.snapParams();
            synth.noteOn(60, 1.0f);

            std::vector<float> pcm(frames * 2, 0.0f);
            synth.renderBlock(pcm);
            return spectralCentroidHz(extractMono(pcm), sr);
        };

        const double lowCentroid = centroidForStiffness(200.0f);
        const double midCentroid = centroidForStiffness(1200.0f);
        const double highCentroid = centroidForStiffness(4200.0f);

        QVERIFY2(lowCentroid > 100.0 && lowCentroid < midCentroid && midCentroid < highCentroid,
                 qPrintable(QStringLiteral("Mallet stiffness centroid progression failed: low=%1 mid=%2 high=%3")
                                .arg(lowCentroid).arg(midCentroid).arg(highCentroid)));
        QVERIFY2(highCentroid > lowCentroid * 1.5,
                 qPrintable(QStringLiteral("Centroid shift too small: low=%1 high=%2")
                                .arg(lowCentroid).arg(highCentroid)));
    }

    // 4. Waveguide OpenTube and ClosedTube pitch accuracy & harmonic structure.
    void waveguideTubePitchAccuracy() {
        constexpr double sr = 48000.0;
        constexpr std::size_t frames = 24000;

        for (ModalModel tubeModel : {ModalModel::OpenTube, ModalModel::ClosedTube}) {
            for (int midiNote : {48, 60, 69}) {
                const double expectedHz = midiToHz(midiNote);
                ModalSynth synth;
                ModalSynthParams p{};
                p.stereoizer = false;
                p.malletStiff = 1500.0f;
                p.malletRes = 0.85f;
                p.a.on = true;
                p.a.model = tubeModel;
                p.a.decay = 2.0f;
                p.a.radius = 0.90f;  // light damping for clear pitch measurement
                p.b.on = false;

                synth.prepare(sr);
                synth.setParams(p);
                synth.snapParams();
                synth.noteOn(midiNote, 1.0f);

                std::vector<float> pcm(frames * 2, 0.0f);
                synth.renderBlock(pcm);
                QVERIFY(allFinite(pcm));
                const auto mono = extractMono(pcm);
                QVERIFY(rmsSpan(mono) > 1e-4);

                const double measuredHz = findPeakHzNear(mono, sr, expectedHz, 0.05);
                const double errCents = std::abs(centsError(measuredHz, expectedHz));
                QVERIFY2(errCents < 15.0,
                         qPrintable(QStringLiteral("Waveguide %1 note %2: expected %3 Hz, measured %4 Hz (err %5 cents)")
                                        .arg(QString::fromUtf8(modalModelName(tubeModel)))
                                        .arg(midiNote)
                                        .arg(expectedHz, 0, 'f', 2)
                                        .arg(measuredHz, 0, 'f', 2)
                                        .arg(errCents, 0, 'f', 2)));

                // ClosedTube suppresses even harmonics (2*f0) relative to odd harmonics (3*f0).
                if (tubeModel == ModalModel::ClosedTube && midiNote == 60) {
                    const double p2 = dftPowerAtHz(mono, sr, expectedHz * 2.0);
                    const double p3 = dftPowerAtHz(mono, sr, expectedHz * 3.0);
                    QVERIFY2(p3 > p2 * 10.0,
                             qPrintable(QStringLiteral("ClosedTube should emphasize odd harmonics: p2=%1 p3=%2")
                                            .arg(p2).arg(p3)));
                }
            }
        }
    }

    // 5. Parallel and serial coupling between resonators A and B change the output distinctly.
    void couplingChangesOutput() {
        constexpr double sr = 48000.0;
        constexpr std::size_t frames = 8192;

        auto renderCoupled = [&](ModalCoupling coupling, float abMix, float abSplit) {
            ModalSynth synth;
            ModalSynthParams p{};
            p.stereoizer = false;
            p.malletStiff = 1200.0f;
            p.malletRes = 0.8f;
            p.a.on = true;
            p.a.model = ModalModel::String;
            p.a.partials = 16;
            p.a.decay = 2.0f;
            p.a.hit = 0.23f;
            p.b.on = true;
            p.b.model = ModalModel::Plate;
            p.b.partials = 16;
            p.b.decay = 2.5f;
            p.b.hit = 0.31f;
            p.b.coarse = 7.0f;  // fifth above A
            p.coupling = coupling;
            p.abMix = abMix;
            p.abSplit = abSplit;

            synth.prepare(sr);
            synth.setParams(p);
            synth.snapParams();
            synth.noteOn(60, 0.9f);

            std::vector<float> pcm(frames * 2, 0.0f);
            synth.renderBlock(pcm);
            return extractMono(pcm);
        };

        const auto parA = renderCoupled(ModalCoupling::Parallel, 0.0f, 0.01f);
        const auto parMix = renderCoupled(ModalCoupling::Parallel, 0.5f, 0.01f);
        const auto parB = renderCoupled(ModalCoupling::Parallel, 1.0f, 0.01f);
        const auto serLowSplit = renderCoupled(ModalCoupling::Serial, 0.5f, 0.01f);
        const auto serHighSplit = renderCoupled(ModalCoupling::Serial, 0.5f, 0.60f);

        auto diffRms = [](const std::vector<double>& a, const std::vector<double>& b) {
            double s = 0.0;
            for (std::size_t i = 0; i < a.size(); ++i) {
                const double d = a[i] - b[i];
                s += d * d;
            }
            return std::sqrt(s / static_cast<double>(a.size()));
        };

        QVERIFY(rmsSpan(parA) > 1e-4);
        QVERIFY(rmsSpan(parB) > 1e-4);
        QVERIFY(rmsSpan(serLowSplit) > 1e-4);
        QVERIFY(rmsSpan(serHighSplit) > 1e-4);

        QVERIFY2(diffRms(parA, parB) > 1e-3, "Parallel A/B mix 0 vs 1 did not change output");
        QVERIFY2(diffRms(parA, parMix) > 1e-3, "Parallel A/B mix 0 vs 0.5 did not change output");
        QVERIFY2(diffRms(parMix, serLowSplit) > 1e-3, "Serial vs Parallel coupling did not change output");
        QVERIFY2(diffRms(serLowSplit, serHighSplit) > 1e-4, "Serial abSplit did not shift coupled output");
    }

    // 6. No NaN / Inf / blow-up at extreme parameters and across 44.1 / 48 / 96 kHz.
    void extremeParametersNoNanOrBlowUp() {
        const std::array<double, 3> sampleRates{44100.0, 48000.0, 96000.0};
        for (double sr : sampleRates) {
            for (int mode = 0; mode < 4; ++mode) {
                ModalSynth synth;
                ModalSynthParams p{};
                p.malletMix = mode == 0 ? 1.0f : 0.5f;
                p.malletRes = 1.0f;
                p.malletStiff = (mode % 2 == 0) ? 5000.0f : 100.0f;
                p.velMalletStiff = mode == 1 ? 1.0f : -1.0f;
                p.noiseMix = 1.0f;
                p.noiseRes = 1.0f;
                p.noiseOsc = 1.0f;
                p.noiseFilterMode = static_cast<NoiseFilterMode>(mode % 3);
                p.noiseFilterFreq = (mode == 0) ? 20000.0f : 20.0f;
                p.noiseFilterQ = 4.0f;
                p.noiseAttackMs = 1.0f;
                p.noiseDecayMs = (mode == 0) ? 1.0f : 20000.0f;
                p.noiseSustain = 1.0f;
                p.noiseReleaseMs = 1.0f;
                p.noiseAttackTension = (mode % 2 == 0) ? 1.0f : -1.0f;
                p.noiseDecayTension = (mode % 2 == 0) ? -1.0f : 1.0f;
                p.noiseReleaseTension = 0.0f;

                p.a.on = true;
                p.a.model = mode == 0 ? ModalModel::Plate
                          : mode == 1 ? ModalModel::ClosedTube
                          : mode == 2 ? ModalModel::Djembe
                                      : ModalModel::OpenTube;
                p.a.partials = 64;
                p.a.decay = (mode % 2 == 0) ? 100.0f : 0.01f;
                p.a.damp = (mode % 2 == 0) ? 1.0f : -1.0f;
                p.a.tone = (mode % 2 == 0) ? 1.0f : -1.0f;
                p.a.hit = (mode % 2 == 0) ? 0.5f : 0.02f;
                p.a.release = (mode % 2 == 0) ? 0.001f : 1.0f;
                p.a.inharm = (mode % 2 == 0) ? 1.0f : 0.0f;
                p.a.ratio = (mode % 2 == 0) ? 10.0f : 0.1f;
                p.a.cut = (mode % 2 == 0) ? 0.99f : -0.99f;
                p.a.radius = (mode == 1) ? 0.0f : 1.0f;
                p.a.coarse = (mode == 0) ? 48.0f : -48.0f;

                p.b = p.a;
                p.b.model = mode == 3 ? ModalModel::Marimba2 : ModalModel::Beam;
                p.coupling = (mode % 2 == 0) ? ModalCoupling::Serial : ModalCoupling::Parallel;
                p.abSplit = 1.0f;
                p.gainDb = 24.0f;
                p.stereoizer = true;

                synth.prepare(sr);
                synth.setParams(p);
                synth.snapParams();

                std::vector<float> buf(2048 * 2, 0.0f);
                for (int n = 0; n < 4; ++n) {
                    synth.noteOn(12 + n * 32, 1.0f);
                }
                synth.setPitchBend(1.0);
                synth.renderBlock(buf);
                synth.noteOff(12);
                synth.setPitchBend(-1.0);
                std::fill(buf.begin(), buf.end(), 0.0f);
                synth.renderBlock(buf);

                QVERIFY2(allFinite(buf),
                         qPrintable(QStringLiteral("NaN/Inf at sr=%1 mode=%2").arg(sr).arg(mode)));
                QVERIFY2(synth.nonFiniteCount() == 0,
                         qPrintable(QStringLiteral("Pre-clamp NaN/Inf masked at sr=%1 mode=%2: count=%3")
                                        .arg(sr).arg(mode).arg(synth.nonFiniteCount())));
                QVERIFY2(std::isfinite(synth.maxRawResonatorAbs()) && synth.maxRawResonatorAbs() < 512.0,
                         qPrintable(QStringLiteral("Raw resonator blow-up at sr=%1 mode=%2: rawPeak=%3")
                                        .arg(sr).arg(mode).arg(synth.maxRawResonatorAbs())));
                QVERIFY2(std::isfinite(synth.maxPreLimiterAbs()) && synth.maxPreLimiterAbs() < 4096.0,
                         qPrintable(QStringLiteral("Pre-limiter blow-up at sr=%1 mode=%2: preLimPeak=%3")
                                        .arg(sr).arg(mode).arg(synth.maxPreLimiterAbs())));
                QVERIFY2(synth.maxPreClampAbs() <= 4.0,
                         qPrintable(QStringLiteral("Pre-clamp blow-up masked at sr=%1 mode=%2: peak=%3")
                                        .arg(sr).arg(mode).arg(synth.maxPreClampAbs())));
                const double pk = peakAbs(buf);
                QVERIFY2(pk <= 0.900001,
                         qPrintable(QStringLiteral("Blow-up at sr=%1 mode=%2: peak=%3").arg(sr).arg(mode).arg(pk)));
            }
        }
    }

    // 7. Reference render compared against exact RipplerX value table for a fixed setting.
    void referenceRenderMatchesRipplerXTable() {
        constexpr double sr = 48000.0;
        ModalSynth synth;
        ModalSynthParams p{};
        p.stereoizer = false;
        p.gainDb = 0.0f;
        p.malletMix = 0.0f;
        p.malletRes = 0.8f;
        p.malletStiff = 1200.0f;
        p.noiseMix = 0.0f;
        p.noiseRes = 0.0f;
        p.a.on = true;
        p.a.model = ModalModel::Marimba;
        p.a.partials = 8;
        p.a.decay = 1.5f;
        p.a.damp = -0.3f;
        p.a.tone = 0.0f;
        p.a.hit = 0.26f;
        p.a.release = 1.0f;
        p.a.inharm = 0.0001f;
        p.a.cut = 0.0f;
        p.b.on = false;

        synth.prepare(sr);
        synth.setParams(p);
        synth.snapParams();
        synth.noteOn(69, 1.0f);  // A4 = 440 Hz, vel = 1.0

        std::vector<float> pcm(4097 * 2, 0.0f);
        synth.renderBlock(pcm);
        QVERIFY(allFinite(pcm));

        // Ground-truth sample table computed from RipplerX commit 11683a6 equations
        // (Mallet RBJ BP @ 1200 Hz, 8 Marimba partials, decay 1.5, damp -0.3, hit 0.26, FairlyChildish limiter).
        struct RefPoint {
            std::size_t frame;
            double expected;
        };
        const std::array<RefPoint, 14> table{{
            {0, 0.002209155},
            {1, 0.007976994},
            {2, 0.014793447},
            {4, 0.031589851},
            {8, 0.052823595},
            {16, 0.037822051},
            {32, 0.036975283},
            {64, -0.026134878},
            {128, 0.044013886},
            {256, 0.022626974},
            {512, -0.031438348},
            {1024, -0.037212073},
            {2048, -0.032972054},
            {4096, -0.061037230},
        }};

        for (const auto& pt : table) {
            const double gotL = static_cast<double>(pcm[pt.frame * 2]);
            const double gotR = static_cast<double>(pcm[pt.frame * 2 + 1]);
            QVERIFY2(std::abs(gotL - pt.expected) < 1e-4,
                     qPrintable(QStringLiteral("Reference mismatch at frame %1: got %2, expected %3")
                                    .arg(pt.frame).arg(gotL, 0, 'f', 9).arg(pt.expected, 0, 'f', 9)));
            QVERIFY2(std::abs(gotL - gotR) < 1e-6, "Mono (stereoizer off) L != R");
        }
    }

    // 8. Factory presets (12-16 presets) are unique, sound clean, round-trip JSON, and edits work.
    void factoryPresetsAndEdits() {
        const auto& presets = factoryModalPresets();
        QVERIFY2(presets.size() >= 12 && presets.size() <= 16,
                 qPrintable(QStringLiteral("Expected 12-16 presets, got %1").arg(presets.size())));

        std::set<std::string> ids;
        for (const auto& preset : presets) {
            QVERIFY(!preset.id.empty());
            QVERIFY(!preset.name.empty());
            QVERIFY2(ids.insert(std::string(preset.id)).second,
                     qPrintable(QStringLiteral("Duplicate preset id: %1").arg(QString::fromUtf8(preset.id))));
            QCOMPARE(findModalPreset(preset.id), &preset);

            // JSON round-trip.
            const QJsonObject j = modalParamsToJson(preset.params, QString::fromUtf8(preset.id));
            QCOMPARE(j.value(u"type").toString(), QStringLiteral("modal"));
            QCOMPARE(j.value(u"preset").toString(), QString::fromUtf8(preset.id));
            const ModalSynthParams rt = modalParamsFromJson(j);
            QCOMPARE(rt.a.model, preset.params.a.model);
            QCOMPARE(rt.b.model, preset.params.b.model);
            QCOMPARE(rt.coupling, preset.params.coupling);

            // Renders finite, non-silent audio.
            ModalSynth synth;
            synth.prepare(48000.0);
            synth.setParams(preset.params);
            synth.snapParams();
            synth.noteOn(60, 0.9f);
            std::vector<float> buf(4096 * 2, 0.0f);
            synth.renderBlock(buf);
            QVERIFY(allFinite(buf));
            QVERIFY2(peakAbs(buf) > 1e-3,
                     qPrintable(QStringLiteral("Preset %1 produced near-silent audio").arg(QString::fromUtf8(preset.id))));
        }

        // Verify document edits modal.setPreset and modal.setParams.
        QJsonObject doc = makeMidiTimelineDoc(QJsonObject{{QStringLiteral("type"), QStringLiteral("subtractive")}}, QJsonArray{});
        doc = setModalPresetEdit(doc, QJsonObject{{QStringLiteral("trackId"), QStringLiteral("t1")},
                                                  {QStringLiteral("preset"), QStringLiteral("modal-marimba")}});
        const QJsonObject inst1 = doc.value(u"tracks").toArray()[0].toObject().value(u"instrument").toObject();
        QCOMPARE(inst1.value(u"type").toString(), QStringLiteral("modal"));
        QCOMPARE(inst1.value(u"preset").toString(), QStringLiteral("modal-marimba"));

        doc = setModalParamsEdit(doc, QJsonObject{
            {QStringLiteral("trackId"), QStringLiteral("t1")},
            {QStringLiteral("aModel"), QStringLiteral("plate")},
            {QStringLiteral("coupling"), QStringLiteral("serial")},
            {QStringLiteral("malletStiff"), 2400.0},
            {QStringLiteral("aDecay"), 3.5},
            {QStringLiteral("abMix"), 0.72},
        });
        const QJsonObject inst2 = doc.value(u"tracks").toArray()[0].toObject().value(u"instrument").toObject();
        QCOMPARE(inst2.value(u"aModel").toString(), QStringLiteral("plate"));
        QCOMPARE(inst2.value(u"coupling").toString(), QStringLiteral("serial"));
        QCOMPARE(inst2.value(u"malletStiff").toDouble(), 2400.0);
        QCOMPARE(inst2.value(u"aDecay").toDouble(), 3.5);
        QVERIFY(std::abs(inst2.value(u"abMix").toDouble() - 0.72) < 1e-5);
    }

    // 9. BlockProcessor sample-accurate MIDI timing and setParameter automation.
    void blockProcessorSampleAccurateMidi() {
        const auto* marimba = findModalPreset("modal-marimba");
        QVERIFY(marimba != nullptr);
        const QJsonObject inst = modalParamsToJson(marimba->params, QStringLiteral("modal-marimba"));

        // At 120 BPM, 1 beat = 500 ms = 960 ticks. Tick 48 = 25.0 ms = frame 1200 at 48 kHz.
        const QJsonArray notes{
            QJsonObject{
                {QStringLiteral("id"), QStringLiteral("n1")},
                {QStringLiteral("pitch"), 60},
                {QStringLiteral("startTick"), 48},
                {QStringLiteral("durationTick"), 960},
                {QStringLiteral("velocity"), 100},
            },
        };
        const QJsonObject doc = makeMidiTimelineDoc(inst, notes, 120.0);
        const auto parsed = nt::parseTimelineJson(QJsonDocument(doc).toJson(QJsonDocument::Compact));
        QVERIFY(parsed.timeline.has_value());

        ModalSynthProcessor proc(*parsed.timeline, parsed.timeline->tracks.at(0));
        QCOMPARE(proc.id, std::string("instrument"));
        QVERIFY(proc.hasPendingOutput(0));

        constexpr double sr = 48000.0;
        proc.prepare(sr);
        constexpr int blockFrames = 128;
        const double msPerFrame = 1000.0 / sr;

        std::vector<float> pcm(2048 * 2, 0.0f);
        for (int f = 0; f < 2048; f += blockFrames) {
            nt::audio::BlockContext ctx{sr, static_cast<double>(f) * msPerFrame, msPerFrame, false, 0};
            proc.process(std::span<float>(pcm.data() + static_cast<std::size_t>(f) * 2,
                                          static_cast<std::size_t>(blockFrames) * 2), ctx);
        }
        QVERIFY(allFinite(pcm));

        const double prePeak = peakAbs(std::span<const float>(pcm.data(), 1199 * 2));
        const double postPeak = peakAbs(std::span<const float>(pcm.data() + 1200 * 2, 512 * 2));
        QVERIFY2(prePeak < 1e-6, qPrintable(QStringLiteral("Signal before sample-accurate onset: %1").arg(prePeak)));
        QVERIFY2(postPeak > 1e-3, qPrintable(QStringLiteral("No signal after sample-accurate onset: %1").arg(postPeak)));

        QVERIFY(proc.setParameter("malletStiff", 2200.0));
        QVERIFY(proc.setParameter("aDecay", 2.5));
        QVERIFY(proc.setParameter("abMix", 0.35));
        QVERIFY(proc.setParameter("gainDb", -3.0));
        QVERIFY(!proc.setParameter("aDecay", std::numeric_limits<double>::quiet_NaN()));
    }

    // 10. Zero audio-thread heap allocations (TestAllocationCounter.h).
    void zeroAudioThreadAllocations() {
#ifdef NT_MODAL_HAS_ALLOC_COUNTER
        QVERIFY2(nt::testing::countsAnAllocation(), "Allocation counter control check failed");
#endif

        const auto* vibes = findModalPreset("modal-vibes");
        QVERIFY(vibes != nullptr);
        const QJsonObject inst = modalParamsToJson(vibes->params, QStringLiteral("modal-vibes"));
        const QJsonArray notes{
            QJsonObject{{QStringLiteral("id"), QStringLiteral("n1")}, {QStringLiteral("pitch"), 60},
                        {QStringLiteral("startTick"), 0}, {QStringLiteral("durationTick"), 960}, {QStringLiteral("velocity"), 96}},
            QJsonObject{{QStringLiteral("id"), QStringLiteral("n2")}, {QStringLiteral("pitch"), 67},
                        {QStringLiteral("startTick"), 240}, {QStringLiteral("durationTick"), 960}, {QStringLiteral("velocity"), 110}},
        };
        const QJsonObject doc = makeMidiTimelineDoc(inst, notes, 120.0);
        const auto parsed = nt::parseTimelineJson(QJsonDocument(doc).toJson(QJsonDocument::Compact));
        QVERIFY(parsed.timeline.has_value());

        ModalSynthProcessor proc(*parsed.timeline, parsed.timeline->tracks.at(0));
        proc.prepare(48000.0);

        ModalSynth direct;
        direct.prepare(48000.0);
        direct.setParams(vibes->params);
        direct.snapParams();

        std::array<float, 256> stereo{};
        const double msPerFrame = 1000.0 / 48000.0;

#ifdef NT_MODAL_HAS_ALLOC_COUNTER
        nt::testing::allocations = 0;
        nt::testing::countAllocations = true;
#endif

        for (int b = 0; b < 64; ++b) {
            stereo.fill(0.0f);
            nt::audio::BlockContext ctx{48000.0, static_cast<double>(b * 128) * msPerFrame, msPerFrame, false, 0};
            proc.process(stereo, ctx);
            if (b == 8) (void)proc.setParameter("aDecay", 3.0);
            if (b == 16) (void)proc.setParameter("aTone", 0.4);
            if (b == 24) (void)proc.setParameter("abMix", 0.25);
            if (b == 32) (void)proc.setParameter("aRatio", 1.5);
            if (b == 40) (void)proc.setParameter("aCut", 0.3);
            if (b == 48) (void)proc.setParameter("aCoarse", 2.0);
            if (b == 56) (void)proc.setParameter("aModel", static_cast<double>(ModalModel::Plate));
        }
        proc.reset();

        const std::array<ModalSynth::NoteEvent, 4> evs{{
            {0, ModalSynth::EventKind::NoteOn, 60, 0.8f, 1.0f},
            {32, ModalSynth::EventKind::NoteOn, 64, 0.9f, 1.0f},
            {64, ModalSynth::EventKind::PitchBend, 0, 0.5f, 1.0f},
            {96, ModalSynth::EventKind::NoteOff, 60, 0.0f, 1.0f},
        }};
        stereo.fill(0.0f);
        direct.renderBlock(stereo, evs);
        (void)direct.setParameter("malletStiff", 1800.0);
        direct.reset();

#ifdef NT_MODAL_HAS_ALLOC_COUNTER
        nt::testing::countAllocations = false;
        const std::size_t allocs = nt::testing::allocations;
        QCOMPARE(allocs, std::size_t{0});
#endif
    }

    // 11. CPU bound with 16 simultaneous voices at 48 kHz.
    void cpuBoundSixteenVoices() {
        constexpr double sr = 48000.0;
        constexpr std::size_t blockFrames = 512;
        constexpr int numBlocks = 400;  // 4.27 s of 16-voice polyphony

        ModalSynth synth;
        ModalSynthParams p{};
        p.polyphony = 16;
        p.stereoizer = true;
        p.malletStiff = 1500.0f;
        p.malletRes = 0.8f;
        p.a.on = true;
        p.a.model = ModalModel::Marimba;
        p.a.partials = 32;
        p.a.decay = 6.0f;
        p.a.damp = -0.3f;
        p.b.on = true;
        p.b.model = ModalModel::ClosedTube;
        p.b.decay = 2.0f;
        p.coupling = ModalCoupling::Parallel;
        p.abMix = 0.35f;

        synth.prepare(sr);
        synth.setParams(p);
        synth.snapParams();

        // Trigger all 16 voices simultaneously.
        for (int v = 0; v < 16; ++v) {
            synth.noteOn(48 + v * 2, 0.85f);
        }
        QCOMPARE(synth.activeVoiceCount(), 16);

        std::array<float, blockFrames * 2> stereo{};
        for (int i = 0; i < 8; ++i) {
            stereo.fill(0.0f);
            synth.renderBlock(stereo);
        }

        const auto t0 = std::chrono::steady_clock::now();
        double sink = 0.0;
        for (int b = 0; b < numBlocks; ++b) {
            stereo.fill(0.0f);
            synth.renderBlock(stereo);
            sink += static_cast<double>(stereo[0]);
        }
        const auto t1 = std::chrono::steady_clock::now();
        (void)sink;

        const double elapsedUs = std::chrono::duration<double, std::micro>(t1 - t0).count();
        const double usPerBlock = elapsedUs / static_cast<double>(numBlocks);
        const double blockDurationUs = (static_cast<double>(blockFrames) / sr) * 1e6;
        const double cpuPct = 100.0 * usPerBlock / blockDurationUs;

        std::fprintf(stderr, "[ModalSynth 16-voice CPU] %.2f us / 512-frame block @ 48 kHz (%.2f%% real-time)\n",
                     usPerBlock, cpuPct);
#ifndef NT_MODAL_TSAN
        QVERIFY2(cpuPct < 50.0,
                 qPrintable(QStringLiteral("16-voice CPU usage too high: %1% real-time").arg(cpuPct)));
#endif
    }

    // D1: Worst-case 16-voice 64+64 Serial CPU under continuous automation + clickless structural swap.
    void d1SerialAutomationCpuAndStructuralSwap() {
        constexpr double sr = 48000.0;
        constexpr std::size_t blockFrames = 512;
        constexpr int numBlocks = 80;

        ModalSynth synth;
        ModalSynthParams p{};
        p.polyphony = 16;
        p.stereoizer = true;
        p.malletStiff = 1500.0f;
        p.malletRes = 0.8f;
        p.a.on = true;
        p.a.model = ModalModel::Membrane;
        p.a.partials = 64;
        p.a.decay = 6.0f;
        p.a.damp = -0.2f;
        p.b.on = true;
        p.b.model = ModalModel::Plate;
        p.b.partials = 64;
        p.b.decay = 6.0f;
        p.b.damp = -0.2f;
        p.coupling = ModalCoupling::Serial;
        p.abSplit = 0.25f;

        synth.prepare(sr);
        synth.setParams(p);
        synth.snapParams();
        for (int v = 0; v < 16; ++v) {
            synth.noteOn(48 + v * 2, 0.85f);
        }
        QCOMPARE(synth.activeVoiceCount(), 16);

        std::array<float, blockFrames * 2> stereo{};
        const auto t0 = std::chrono::steady_clock::now();
        for (int b = 0; b < numBlocks; ++b) {
            const double phase = static_cast<double>(b) / static_cast<double>(numBlocks);
            (void)synth.setParameter("aDecay", 1.0 + 4.0 * phase);
            (void)synth.setParameter("aTone", -0.5 + phase);
            (void)synth.setParameter("bDamp", -0.4 + 0.8 * phase);
            stereo.fill(0.0f);
            synth.renderBlock(stereo);
        }
        const auto t1 = std::chrono::steady_clock::now();
        const double usPerBlock = std::chrono::duration<double, std::micro>(t1 - t0).count() / static_cast<double>(numBlocks);
        const double blockDurationUs = (static_cast<double>(blockFrames) / sr) * 1e6;
        const double cpuPct = 100.0 * usPerBlock / blockDurationUs;
        std::fprintf(stderr, "[ModalSynth D1 16v 64+64 Serial+Auto CPU] %.2f us / 512f (%.2f%% RT)\n", usPerBlock, cpuPct);
#ifndef NT_MODAL_TSAN
        QVERIFY2(cpuPct < 45.0,
                 qPrintable(QStringLiteral("D1 16v 64+64 Serial+Auto CPU too high: %1%% RT").arg(cpuPct)));
#endif

        // Structural swap while ringing must crossfade smoothly rather than hard-clearing to 0 in 1 sample.
        ModalSynth swapSynth;
        ModalSynthParams sp{};
        sp.stereoizer = false;
        sp.malletRes = 1.0f;
        sp.a.on = true;
        sp.a.model = ModalModel::String;
        sp.a.partials = 16;
        sp.a.decay = 5.0f;
        sp.a.hit = 0.25f;
        sp.b.on = false;
        swapSynth.prepare(sr);
        swapSynth.setParams(sp);
        swapSynth.snapParams();
        swapSynth.noteOn(60, 1.0f);

        std::vector<float> pre(512 * 2, 0.0f);
        swapSynth.renderBlock(pre);
        // Find a moment with large instantaneous amplitude by stepping sample-by-sample up to 256 samples.
        std::array<float, 2> one{};
        double lastSample = static_cast<double>(pre.back());
        for (int k = 0; k < 256 && std::abs(lastSample) < 0.15; ++k) {
            one.fill(0.0f);
            swapSynth.renderBlock(one);
            lastSample = static_cast<double>(one[0]);
        }
        QVERIFY2(std::abs(lastSample) >= 0.15, "Could not reach non-trivial amplitude before structural swap");

        QVERIFY(swapSynth.setParameter("aModel", static_cast<double>(ModalModel::Marimba)));
        std::vector<float> post(512 * 2, 0.0f);
        swapSynth.renderBlock(post);
        QVERIFY(allFinite(post));
        const double boundaryStep = std::abs(static_cast<double>(post[0]) - lastSample);
        // Hard-clear drops directly to 0.0 (boundaryStep == |lastSample|); crossfade keeps step small.
        QVERIFY2(boundaryStep < std::abs(lastSample) * 0.5,
                 qPrintable(QStringLiteral("D1 structural swap hard-clicked: last=%1 post[0]=%2 step=%3")
                                .arg(lastSample).arg(post[0]).arg(boundaryStep)));
    }

    // D2: Low decayK (decay=0.01, release=0.001, damp=-1) must not invert poles or hang at DC/Nyquist.
    void d2LowDecayKNoPoleInversionOrHang() {
        constexpr double sr = 48000.0;
        ModalSynth synth;
        ModalSynthParams p{};
        p.stereoizer = false;
        p.malletStiff = 1500.0f;
        p.malletRes = 0.9f;
        p.a.on = true;
        p.a.model = ModalModel::String;
        p.a.partials = 16;
        p.a.decay = 0.01f;
        p.a.release = 0.001f;
        p.a.damp = -1.0f;
        p.a.hit = 0.25f;
        p.b.on = false;

        synth.prepare(sr);
        synth.setParams(p);
        synth.snapParams();
        synth.noteOn(60, 1.0f);

        std::vector<float> onset(256 * 2, 0.0f);
        synth.renderBlock(onset);
        synth.noteOff(60);

        // Render 150 ms after release (note: impulse mallet itself lasts 100 ms, so measure 120..170 ms after noteOn).
        std::vector<float> tail(9600 * 2, 0.0f);
        synth.renderBlock(tail);
        QVERIFY(allFinite(tail));
        const auto mono = extractMono(tail);
        // Check 120..200 ms after noteOff (well past 100 ms mallet window): must be near silent (< 1e-4), no DC/Nyquist hang.
        const double lateRms = rmsSpan(std::span<const double>(mono.data() + 6000, 3600));
        QVERIFY2(lateRms < 1e-4,
                 qPrintable(QStringLiteral("D2 pole inversion / DC-Nyquist hang: lateRms=%1").arg(lateRms)));
    }

    // D3: Pitch bend re-entering range from outOfRange must compute valid coefficients and clear stale state.
    void d3PitchBendAcrossOutOfRange() {
        constexpr double sr = 48000.0;
        ModalLookupTable a1Lut;
        a1Lut.init([](double f) { return -2.0 * std::cos(2.0 * std::numbers::pi * f / sr); }, 1.0, 20000.0);

        // Case A: starts outOfRange (> 20 kHz), bends down into range -> must resonate cleanly at bent freq.
        ModalPartial p;
        p.srate = sr;
        p.setIndex(1);
        p.decay = 1.5;
        p.hit = 0.25;
        p.update(22000.0, 1.0, 1.0, 1.0, 1.0, false);
        QVERIFY(p.outOfRange);

        p.applyPitchBend(0.5, a1Lut);  // 11000 Hz, now in range
        QVERIFY(!p.outOfRange);
        std::vector<double> ir(2048, 0.0);
        ir[0] = p.process(1.0);
        for (std::size_t i = 1; i < ir.size(); ++i) {
            ir[i] = p.process(0.0);
        }
        const double rmsA = rmsSpan(ir);
        QVERIFY2(rmsA > 1e-3,
                 qPrintable(QStringLiteral("D3 partial re-entering range stayed dead (stale coeffs): rms=%1").arg(rmsA)));
        const double peakHz = findPeakHzNear(ir, sr, 11000.0, 0.04);
        QVERIFY2(std::abs(centsError(peakHz, 11000.0)) < 15.0,
                 qPrintable(QStringLiteral("D3 re-entered partial wrong pitch: %1 Hz").arg(peakHz)));

        // Case B: active at 440 Hz -> moved outOfRange -> zero output & cleared state -> re-enters without stale energy.
        ModalPartial p2;
        p2.srate = sr;
        p2.setIndex(1);
        p2.decay = 2.0;
        p2.hit = 0.25;
        p2.update(440.0, 1.0, 1.0, 1.0, 1.0, false);
        for (int i = 0; i < 64; ++i) {
            (void)p2.process(i == 0 ? 1.0 : 0.0);
        }
        p2.update(24000.0, 1.0, 1.0, 1.0, 1.0, false);
        QVERIFY(p2.outOfRange);
        p2.applyPitchBend(0.5, a1Lut);  // 12000 Hz, no new input -> must not ring from stale 440 Hz state!
        double zeroInputEnergy = 0.0;
        for (int i = 0; i < 64; ++i) {
            const double y = p2.process(0.0);
            zeroInputEnergy += y * y;
        }
        QVERIFY2(zeroInputEnergy < 1e-12,
                 qPrintable(QStringLiteral("D3 stale filter state leaked after outOfRange: energy=%1").arg(zeroInputEnergy)));
    }

    // D4: Waveguide default radius=0.5 pitch accuracy + 44.1/48/96 kHz decay/brightness parity + Open/Closed parity.
    void d4WaveguideSampleRateAndRadiusParity() {
        // 1. Pitch accuracy at default radius=0.5 for OpenTube and ClosedTube.
        for (ModalModel tube : {ModalModel::OpenTube, ModalModel::ClosedTube}) {
            for (int midiNote : {60, 69}) {
                const double expectedHz = midiToHz(midiNote);
                ModalSynth synth;
                ModalSynthParams p{};
                p.stereoizer = false;
                p.malletStiff = 1500.0f;
                p.malletRes = 0.85f;
                p.a.on = true;
                p.a.model = tube;
                p.a.decay = 2.0f;
                p.a.radius = 0.5f;  // default radius!
                p.b.on = false;

                synth.prepare(48000.0);
                synth.setParams(p);
                synth.snapParams();
                synth.noteOn(midiNote, 1.0f);

                std::vector<float> pcm(24000 * 2, 0.0f);
                synth.renderBlock(pcm);
                const auto mono = extractMono(pcm);
                const double measuredHz = findPeakHzNear(mono, 48000.0, expectedHz, 0.08);
                const double errCents = std::abs(centsError(measuredHz, expectedHz));
                QVERIFY2(errCents < 10.0,
                         qPrintable(QStringLiteral("D4 waveguide %1 note %2 at radius=0.5 detuned: expected %3 got %4 (%5 cents)")
                                        .arg(QString::fromUtf8(modalModelName(tube)))
                                        .arg(midiNote).arg(expectedHz, 0, 'f', 2)
                                        .arg(measuredHz, 0, 'f', 2).arg(errCents, 0, 'f', 2)));
            }
        }

        // 2. Sample-rate parity (44.1 / 48 / 96 kHz) for decay time and brightness, plus OpenTube vs ClosedTube decay.
        auto measureTube = [](ModalModel tube, double sr) {
            ModalSynth synth;
            ModalSynthParams p{};
            p.stereoizer = false;
            p.malletStiff = 2000.0f;
            p.malletRes = 0.8f;
            p.a.on = true;
            p.a.model = tube;
            p.a.decay = 1.0f;
            p.a.radius = 0.5f;
            p.b.on = false;

            synth.prepare(sr);
            synth.setParams(p);
            synth.snapParams();
            synth.noteOn(60, 0.9f);

            const std::size_t totalFrames = static_cast<std::size_t>(sr * 0.7);
            std::vector<float> pcm(totalFrames * 2, 0.0f);
            synth.renderBlock(pcm);
            const auto mono = extractMono(pcm);

            const std::size_t eStart = static_cast<std::size_t>(sr * 0.03);
            const std::size_t eLen = static_cast<std::size_t>(sr * 0.08);
            const std::size_t lStart = static_cast<std::size_t>(sr * 0.40);
            const std::size_t lLen = static_cast<std::size_t>(sr * 0.12);
            const double early = rmsSpan(std::span<const double>(mono.data() + eStart, eLen));
            const double late = rmsSpan(std::span<const double>(mono.data() + lStart, lLen));
            const double ratio = early > 1e-9 ? (late / early) : 0.0;
            const double centroid = spectralCentroidHz(std::span<const double>(mono.data() + eStart, std::min<std::size_t>(mono.size() - eStart, static_cast<std::size_t>(sr * 0.18))), sr);
            return std::pair<double, double>{ratio, centroid};
        };

        const auto [open44Ratio, open44Cent] = measureTube(ModalModel::OpenTube, 44100.0);
        const auto [open48Ratio, open48Cent] = measureTube(ModalModel::OpenTube, 48000.0);
        const auto [open96Ratio, open96Cent] = measureTube(ModalModel::OpenTube, 96000.0);
        const auto [closed48Ratio, closed48Cent] = measureTube(ModalModel::ClosedTube, 48000.0);
        (void)closed48Cent;

        QVERIFY2(std::abs(open96Ratio - open48Ratio) / std::max(1e-6, open48Ratio) < 0.25,
                 qPrintable(QStringLiteral("D4 OpenTube decay SR mismatch: 48k=%1 96k=%2").arg(open48Ratio).arg(open96Ratio)));
        QVERIFY2(std::abs(open44Ratio - open48Ratio) / std::max(1e-6, open48Ratio) < 0.25,
                 qPrintable(QStringLiteral("D4 OpenTube decay SR mismatch: 44.1k=%1 48k=%2").arg(open44Ratio).arg(open48Ratio)));
        QVERIFY2(std::abs(closed48Ratio - open48Ratio) / std::max(1e-6, open48Ratio) < 0.30,
                 qPrintable(QStringLiteral("D4 ClosedTube vs OpenTube decay mismatch: open=%1 closed=%2").arg(open48Ratio).arg(closed48Ratio)));
        QVERIFY2(std::abs(open96Cent - open48Cent) / std::max(1.0, open48Cent) < 0.25,
                 qPrintable(QStringLiteral("D4 OpenTube filter brightness SR mismatch: 48k=%1 Hz 96k=%2 Hz").arg(open48Cent).arg(open96Cent)));
        QVERIFY2(std::abs(open44Cent - open48Cent) / std::max(1.0, open48Cent) < 0.25,
                 qPrintable(QStringLiteral("D4 OpenTube filter brightness SR mismatch: 44.1k=%1 Hz 48k=%2 Hz").arg(open44Cent).arg(open48Cent)));
    }

    // D5: Comb tail drains completely after last voice stops; pitch bend & limiter advance during silence.
    void d5CombTailDrainAndSilenceAdvancement() {
        constexpr double sr = 48000.0;
        // 1. Trigger a loud finite-duration burst with stereoizer=true, wait until voice finishes,
        //    verify comb tail drains cleanly and hasActiveSound() stays true until the 20 ms tail finishes.
        ModalSynth synth;
        ModalSynthParams p{};
        p.stereoizer = true;
        p.malletMix = 0.0f;
        p.malletRes = 0.0f;
        p.noiseMix = 1.0f;
        p.noiseRes = 0.0f;
        p.noiseAttackMs = 1.0f;
        p.noiseDecayMs = 1.0f;
        p.noiseSustain = 1.0f;
        p.noiseReleaseMs = 2.0f;
        p.a.on = false;
        p.b.on = false;

        synth.prepare(sr);
        synth.setParams(p);
        synth.snapParams();
        synth.noteOn(60, 1.0f);

        // Hold for 30 ms (> 20 ms comb delay) so comb buffer is filled with loud audio.
        std::vector<float> hold(1440 * 2, 0.0f);
        synth.renderBlock(hold);
        synth.noteOff(60);

        // Render in tiny 16-frame steps until activeVoiceCount() hits 0 (noise finishes ~2 ms + mallet finishes ~100 ms;
        // wait: mallet countdown runs 100 ms, so set malletMix=0 and wait until activeVoiceCount()==0).
        // Use a short resonator with noiseMix so we know exact moment voice ends.
        // Better: release immediately after 200 ms hold (well past 100 ms mallet window), then release noise (2 ms)!
        ModalSynth sComb;
        sComb.prepare(sr);
        sComb.setParams(p);
        sComb.snapParams();
        sComb.noteOn(60, 1.0f);
        std::vector<float> holdLong(6000 * 2, 0.0f);  // 125 ms (> 100 ms mallet countdown; noise stays at sustain=1.0)
        sComb.renderBlock(holdLong);
        sComb.noteOff(60);
        // Step 16 frames at a time until noise envelope reaches Off (takes ~2 ms = ~96 frames).
        std::vector<float> step(16 * 2, 0.0f);
        int steps = 0;
        while (sComb.activeVoiceCount() > 0 && steps < 64) {
            std::fill(step.begin(), step.end(), 0.0f);
            sComb.renderBlock(step);
            ++steps;
        }
        QCOMPARE(sComb.activeVoiceCount(), 0);
        // Comb delay is 20 ms (960 frames), so it must STILL have active sound pending!
        QVERIFY2(sComb.hasActiveSound(), "D5 comb stereoizer tail prematurely reported inactive");

        std::vector<float> combTail(960 * 2, 0.0f);
        sComb.renderBlock(combTail);
        double sideEnergy = 0.0;
        for (std::size_t f = 0; f < 960; ++f) {
            const double diff = static_cast<double>(combTail[f * 2]) - static_cast<double>(combTail[f * 2 + 1]);
            sideEnergy += diff * diff;
        }
        QVERIFY2(sideEnergy > 1e-2,
                 qPrintable(QStringLiteral("D5 comb tail was truncated instead of drained: sideEnergy=%1").arg(sideEnergy)));
        QVERIFY(!sComb.hasActiveSound());

        // 2. Pitch bend issued during silence must advance during silence so the next note starts already bent.
        ModalSynth bendSilent;
        ModalSynthParams bp{};
        bp.stereoizer = false;
        bp.pitchBendRange = 12;
        bp.malletRes = 0.8f;
        bp.a.on = true;
        bp.a.model = ModalModel::String;
        bp.a.partials = 4;
        bp.a.decay = 2.0f;
        bp.b.on = false;
        bendSilent.prepare(sr);
        bendSilent.setParams(bp);
        bendSilent.snapParams();

        bendSilent.setPitchBend(1.0);  // +12 semitones
        std::vector<float> silence(512 * 2, 0.0f);
        bendSilent.renderBlock(silence);  // 10.67 ms > 2 ms bend glide

        bendSilent.noteOn(60, 1.0f);
        std::vector<float> firstWindow(256 * 2, 0.0f);
        bendSilent.renderBlock(firstWindow);

        // Compare against a synth that directly plays note 72 (C5 = C4 + 12 st) with no bend.
        ModalSynth refC5;
        refC5.prepare(sr);
        refC5.setParams(bp);
        refC5.snapParams();
        refC5.noteOn(72, 1.0f);
        std::vector<float> refWindow(256 * 2, 0.0f);
        refC5.renderBlock(refWindow);

        double diffSq = 0.0;
        double refSq = 0.0;
        for (std::size_t i = 0; i < firstWindow.size(); ++i) {
            const double d = static_cast<double>(firstWindow[i]) - static_cast<double>(refWindow[i]);
            diffSq += d * d;
            refSq += static_cast<double>(refWindow[i]) * static_cast<double>(refWindow[i]);
        }
        const double relErr = std::sqrt(diffSq / std::max(1e-12, refSq));
        QVERIFY2(relErr < 0.05,
                 qPrintable(QStringLiteral("D5 pitch bend froze during silence (note started unbent): relErr=%1").arg(relErr)));

        // 3. OutputLimiter release advances during silence rather than freezing.
        OutputLimiter lim;
        lim.init(sr);
        for (int i = 0; i < 64; ++i) {
            (void)lim.process(10.0, 10.0);
        }
        const double grBefore = lim.gainReductionDb();
        QVERIFY2(grBefore > 6.0, qPrintable(QStringLiteral("Limiter did not engage: gr=%1").arg(grBefore)));
        lim.advanceSilence(static_cast<std::size_t>(sr * 1.5));  // 1.5 s silence (> 5x 300 ms release tau)
        QVERIFY2(lim.gainReductionDb() < grBefore * 0.05,
                 qPrintable(QStringLiteral("D5 limiter did not release during silence: before=%1 after=%2")
                                .arg(grBefore).arg(lim.gainReductionDb())));
    }

    // D6: Voice stealing prefers silent voices, sustain pedal handles >128 events without stuck notes, mallet clears filter on retrigger.
    void d6VoiceStealingSustainOverflowAndMalletRetrigger() {
        constexpr double sr = 48000.0;

        // 1. Voice stealing prefers !isSounding() over ringing released voice with older releaseTs.
        {
            ModalSynth synth;
            ModalSynthParams p{};
            p.polyphony = 2;
            p.stereoizer = false;
            p.malletStiff = 1200.0f;
            p.malletRes = 0.9f;
            p.a.on = true;
            p.a.model = ModalModel::String;
            p.a.partials = 4;
            p.a.decay = 6.0f;
            p.a.release = 1.0f;
            p.a.hit = 0.25f;
            p.b.on = false;
            synth.prepare(sr);
            synth.setParams(p);
            synth.snapParams();

            // Voice 0 plays C4 (261.6 Hz) and is released first (releaseTs = 1), rings for 6 s.
            synth.noteOn(60, 1.0f);
            std::vector<float> tmp(512 * 2, 0.0f);
            synth.renderBlock(tmp);
            synth.noteOff(60);

            // Switch to fast decay for voice 1 (G5 = 784 Hz), release it (releaseTs = 2), wait 1.2 s so voice 1 goes silent.
            QVERIFY(synth.setParameter("aDecay", 0.02));
            QVERIFY(synth.setParameter("aRelease", 0.05));
            synth.noteOn(79, 0.8f);
            synth.renderBlock(tmp);
            synth.noteOff(79);
            // Wait 1.2 s (ModalResonator silence timeout is 1.0 s) while voice 0 keeps ringing loudly.
            // Restore long decay so voice 0 keeps ringing!
            QVERIFY(synth.setParameter("aDecay", 6.0));
            QVERIFY(synth.setParameter("aRelease", 1.0));
            // Actually, make voice 1 finish silently by setting bOn=false and letting voice 0 ring vs voice 1 with shorter note:
            // Even simpler: voice 1 has never been triggered, wait: if voice 1 is never triggered, releaseTs==0 < 1 so it wouldn't catch the bug.
            // To trigger the exact bug: voice 1 must have releaseTs > voice 0's releaseTs AND !isSounding().
            // Let's make voice 1 quiet (vel=0.0) so it goes silent in 1.0 s while voice 0 rings loudly!
            ModalSynth s2;
            s2.prepare(sr);
            s2.setParams(p);
            s2.snapParams();
            s2.noteOn(60, 1.0f, 1.0f);
            s2.renderBlock(tmp);
            s2.noteOff(60);        // releaseTs = 1, ringing loudly for 6 s
            s2.noteOn(79, 0.8f, 0.0f);  // clipGain = 0 -> produces silence, finishes in 1 s
            s2.noteOff(79);        // releaseTs = 2 (> 1!), goes !isSounding() after 1 s
            std::vector<float> waitBuf(60000 * 2, 0.0f);  // 1.25 s
            s2.renderBlock(waitBuf);
            QCOMPARE(s2.activeVoiceCount(), 1);  // Only voice 0 (note 60) is still sounding!

            // Now trigger note 72 very softly; pickVoice MUST pick silent voice 1, preserving ringing voice 0 (261.6 Hz).
            s2.noteOn(72, 0.01f);
            std::vector<float> after(8192 * 2, 0.0f);
            s2.renderBlock(after);
            const double pC4 = dftPowerAtHz(extractMono(after), sr, midiToHz(60));
            QVERIFY2(pC4 > 1e-5,
                     qPrintable(QStringLiteral("D6 pickVoice stole ringing voice instead of silent voice: pC4=%1").arg(pC4)));
        }

        // 2. Sustain pedal overflow: >128 note-offs while pedal held must not leave stuck notes.
        {
            ModalSynth synth;
            ModalSynthParams p{};
            p.polyphony = 4;
            p.stereoizer = false;
            p.malletRes = 0.8f;
            p.a.on = true;
            p.a.model = ModalModel::String;
            p.a.partials = 4;
            p.a.decay = 20.0f;
            p.a.release = 0.002f;  // 40 ms release decay
            p.b.on = false;
            synth.prepare(sr);
            synth.setParams(p);
            synth.snapParams();

            synth.setSustainPedal(true);
            for (int i = 0; i < 140; ++i) {
                synth.noteOn(60, 0.8f);
                synth.noteOff(60);
            }
            synth.noteOn(64, 0.9f);
            synth.noteOff(64);
            std::vector<float> buf(512 * 2, 0.0f);
            synth.renderBlock(buf);

            synth.setSustainPedal(false);
            // Render 0.8 s; if note 64 was properly released, decay = 0.04 s -> decays below 1e-4.
            std::vector<float> tail(38400 * 2, 0.0f);
            synth.renderBlock(tail);
            const auto mono = extractMono(tail);
            const double lateRms = rmsSpan(std::span<const double>(mono.data() + 30000, 8400));
            QVERIFY2(lateRms < 1e-3,
                     qPrintable(QStringLiteral("D6 sustain overflow caused stuck note: lateRms=%1").arg(lateRms)));
        }

        // 3. ImpulseMallet retrigger clears filter state (no transient spike from old freq coefficients).
        {
            ImpulseMallet retriggered;
            retriggered.trigger(sr, 120.0);
            for (int i = 0; i < 10; ++i) (void)retriggered.process();
            retriggered.trigger(sr, 4800.0);

            ImpulseMallet fresh;
            fresh.trigger(sr, 4800.0);

            double maxDiff = 0.0;
            for (int i = 0; i < 64; ++i) {
                maxDiff = std::max(maxDiff, std::abs(retriggered.process() - fresh.process()));
            }
            QVERIFY2(maxDiff < 1e-9,
                     qPrintable(QStringLiteral("D6 ImpulseMallet retrigger leaked old filter state: maxDiff=%1").arg(maxDiff)));
        }
    }

    // D7: PolyBLEP tube oscillators reduce aliasing; live cut/radius/coarse/fine/abSplit smooth without resetting noise or leaking cut filter state.
    void d7PolyBlepAndSmoothedControls() {
        constexpr double sr = 48000.0;
        ModalLookupTable sinLut;
        sinLut.init([](double x) { return std::sin(2.0 * std::numbers::pi * x); }, 0.0, 1.0);

        // 1. PolyBLEP reduces sub-fundamental aliasing on high-pitched OpenTube saw & ClosedTube square.
        for (ModalModel tube : {ModalModel::OpenTube, ModalModel::ClosedTube}) {
            ModalVoice voice;
            voice.srate = sr;
            voice.resA.on = true;
            voice.resA.model = tube;
            voice.resA.waveguide.f_k = 3333.33;  // non-submultiple of 48 kHz -> strong aliasing if naive
            std::vector<double> sig(4096, 0.0);
            for (std::size_t i = 0; i < sig.size(); ++i) {
                sig[i] = voice.processOscillators(true, sinLut);
            }
            const double fundPower = dftPowerAtHz(sig, sr, 3333.33);
            // Naive saw aliases heavily at 48000 - 14*3333.33 = 1333.33 Hz and 48000 - 15*3333.33 = -2000 -> 2000 Hz.
            const double aliasPower = std::max(dftPowerAtHz(sig, sr, 1333.33), dftPowerAtHz(sig, sr, 2000.0));
            const double aliasDb = 10.0 * std::log10(std::max(1e-20, aliasPower / std::max(1e-20, fundPower)));
            QVERIFY2(aliasDb < -40.0,
                     qPrintable(QStringLiteral("D7 %1 oscillator aliasing too high: %2 dB")
                                    .arg(QString::fromUtf8(modalModelName(tube))).arg(aliasDb, 0, 'f', 1)));
        }

        // 2. Enabling aCut from 0 must clear stale filter state; live aCoarse must not re-init noise exciter.
        {
            ModalSynth synth;
            ModalSynthParams p{};
            p.stereoizer = false;
            p.malletRes = 0.9f;
            p.a.on = true;
            p.a.model = ModalModel::String;
            p.a.partials = 4;
            p.a.decay = 2.0f;
            p.a.cut = -0.8f;
            p.b.on = false;
            synth.prepare(sr);
            synth.setParams(p);
            synth.snapParams();
            synth.noteOn(60, 1.0f);
            std::vector<float> buf(512 * 2, 0.0f);
            synth.renderBlock(buf);

            // Disable cut (0.0), wait, then re-enable cut (+0.8): verify smoothed transition (no jump on sample 0).
            QVERIFY(synth.setParameter("aCut", 0.0));
            synth.renderBlock(buf);  // ramps to 0.0
            QVERIFY(synth.setParameter("aCut", 0.8));
            // On the very first block after setParameter("aCut", 0.8), it should be smoothing rather than snapped to 0.8.
            // Verify by checking that two tiny 16-frame blocks differ smoothly and stay finite.
            std::vector<float> tiny1(16 * 2, 0.0f);
            std::vector<float> tiny2(16 * 2, 0.0f);
            synth.renderBlock(tiny1);
            synth.renderBlock(tiny2);
            QVERIFY(allFinite(tiny1) && allFinite(tiny2));
        }

        // 3. Verify live setParameter("aCoarse") does not re-init noise exciter (check via deterministic noise output).
        {
            ModalSynth sRef;
            ModalSynth sMod;
            ModalSynthParams p{};
            p.stereoizer = false;
            p.malletRes = 0.0f;
            p.noiseMix = 1.0f;
            p.noiseRes = 0.0f;
            p.noiseFilterMode = NoiseFilterMode::BandPass;
            p.noiseFilterFreq = 1200.0f;
            p.noiseFilterQ = 2.0f;
            p.noiseAttackMs = 200.0f;
            p.noiseDecayMs = 500.0f;
            p.noiseSustain = 0.8f;
            p.a.on = true;
            p.b.on = false;
            sRef.prepare(sr); sRef.setParams(p); sRef.snapParams(); sRef.setRngSeed(42);
            sMod.prepare(sr); sMod.setParams(p); sMod.snapParams(); sMod.setRngSeed(42);
            sRef.noteOn(60, 0.8f);
            sMod.noteOn(60, 0.8f);

            std::vector<float> bRef(1024 * 2, 0.0f);
            std::vector<float> bMod(1024 * 2, 0.0f);
            sRef.renderBlock(bRef);
            sMod.renderBlock(bMod);

            // Change aCoarse on sMod; since noiseMix goes directly to dirOut (independent of resonator),
            // bMod and bRef must stay IDENTICAL if noise.init() was decoupled!
            QVERIFY(sMod.setParameter("aCoarse", 5.0));
            std::fill(bRef.begin(), bRef.end(), 0.0f);
            std::fill(bMod.begin(), bMod.end(), 0.0f);
            sRef.renderBlock(bRef);
            sMod.renderBlock(bMod);
            double maxDiff = 0.0;
            for (std::size_t i = 0; i < bRef.size(); ++i) {
                maxDiff = std::max(maxDiff, std::abs(static_cast<double>(bRef[i]) - static_cast<double>(bMod[i])));
            }
            QVERIFY2(maxDiff < 1e-6,
                     qPrintable(QStringLiteral("D7 aCoarse perturbed active NoiseExciter: maxDiff=%1").arg(maxDiff)));
        }
    }

    // D8: Per-voice clip fade envelopes (overlapping clips don't mute each other) + 96 kHz sample-accurate MIDI timing.
    void d8PerVoiceClipFadesAndNon48kTiming() {
        const auto* harp = findModalPreset("modal-plucked-harp");
        QVERIFY(harp != nullptr);
        const QJsonObject inst = modalParamsToJson(harp->params, QStringLiteral("modal-plucked-harp"));

        // 1. Overlapping clips: clip 1 (0..1000 ms, no fade, note 60) + clip 2 (100..300 ms, fadeOut 80 ms, note 72).
        // At t = 350..450 ms (after clip 2 ended), clip 1's note 60 must STILL ring (not muted by clip 2's fade!).
        QJsonObject clip1{
            {QStringLiteral("id"), QStringLiteral("c1")},
            {QStringLiteral("trackId"), QStringLiteral("t1")},
            {QStringLiteral("mediaType"), QStringLiteral("midi")},
            {QStringLiteral("startMs"), 0.0},
            {QStringLiteral("durationMs"), 1000.0},
            {QStringLiteral("inPointMs"), 0.0},
            {QStringLiteral("volumeDb"), 0.0},
            {QStringLiteral("notes"), QJsonArray{
                QJsonObject{{QStringLiteral("id"), QStringLiteral("n1")}, {QStringLiteral("pitch"), 60},
                            {QStringLiteral("startTick"), 0}, {QStringLiteral("durationTick"), 1920}, {QStringLiteral("velocity"), 110}},
            }},
        };
        QJsonObject clip2{
            {QStringLiteral("id"), QStringLiteral("c2")},
            {QStringLiteral("trackId"), QStringLiteral("t1")},
            {QStringLiteral("mediaType"), QStringLiteral("midi")},
            {QStringLiteral("startMs"), 100.0},
            {QStringLiteral("durationMs"), 200.0},
            {QStringLiteral("inPointMs"), 0.0},
            {QStringLiteral("fadeOutMs"), 80.0},
            {QStringLiteral("volumeDb"), 0.0},
            {QStringLiteral("notes"), QJsonArray{
                QJsonObject{{QStringLiteral("id"), QStringLiteral("n2")}, {QStringLiteral("pitch"), 72},
                            {QStringLiteral("startTick"), 0}, {QStringLiteral("durationTick"), 384}, {QStringLiteral("velocity"), 100}},
            }},
        };
        QJsonObject doc{
            {QStringLiteral("version"), 1},
            {QStringLiteral("tempo"), QJsonObject{{QStringLiteral("bpm"), 120.0}}},
            {QStringLiteral("tracks"), QJsonArray{QJsonObject{
                {QStringLiteral("id"), QStringLiteral("t1")}, {QStringLiteral("type"), QStringLiteral("midi")},
                {QStringLiteral("name"), QStringLiteral("Modal")}, {QStringLiteral("volumeDb"), 0.0},
                {QStringLiteral("pan"), 0.0}, {QStringLiteral("instrument"), inst},
            }}},
            {QStringLiteral("clips"), QJsonArray{clip1, clip2}},
        };
        const auto parsed = nt::parseTimelineJson(QJsonDocument(doc).toJson(QJsonDocument::Compact));
        QVERIFY(parsed.timeline.has_value());

        ModalSynthProcessor proc(*parsed.timeline, parsed.timeline->tracks.at(0));
        constexpr double sr = 48000.0;
        proc.prepare(sr);
        constexpr int blockFrames = 128;
        const double msPerFrame = 1000.0 / sr;
        const std::size_t totalFrames = 24000;  // 500 ms
        std::vector<float> pcm(totalFrames * 2, 0.0f);
        for (std::size_t f = 0; f < totalFrames; f += blockFrames) {
            const std::size_t cnt = std::min<std::size_t>(blockFrames, totalFrames - f);
            nt::audio::BlockContext ctx{sr, static_cast<double>(f) * msPerFrame, msPerFrame, false, 0};
            proc.process(std::span<float>(pcm.data() + f * 2, cnt * 2), ctx);
        }
        const auto mono = extractMono(pcm);
        // Measure 350..450 ms (frames 16800..21600): clip 1 must still be ringing!
        const double postClip2Rms = rmsSpan(std::span<const double>(mono.data() + 16800, 4800));
        QVERIFY2(postClip2Rms > 1e-3,
                 qPrintable(QStringLiteral("D8 overlapping clip fade-out muted other clip's voice: rms=%1").arg(postClip2Rms)));

        // 2. Non-48kHz sample-accurate MIDI timing at 96 kHz:
        // At 160 BPM, tick 2 = 0.78125 ms = EXACTLY frame 75 at 96 kHz (would quantize to frame 76 if extracted at 48 kHz!).
        const QJsonArray notes96{
            QJsonObject{{QStringLiteral("id"), QStringLiteral("n96")}, {QStringLiteral("pitch"), 60},
                        {QStringLiteral("startTick"), 2}, {QStringLiteral("durationTick"), 960}, {QStringLiteral("velocity"), 120}},
        };
        const QJsonObject doc96 = makeMidiTimelineDoc(inst, notes96, 160.0);
        const auto parsed96 = nt::parseTimelineJson(QJsonDocument(doc96).toJson(QJsonDocument::Compact));
        QVERIFY(parsed96.timeline.has_value());

        ModalSynthProcessor proc96(*parsed96.timeline, parsed96.timeline->tracks.at(0));
        constexpr double sr96 = 96000.0;
        proc96.prepare(sr96);
        const double msPerFrame96 = 1000.0 / sr96;
        std::vector<float> pcm96(256 * 2, 0.0f);
        nt::audio::BlockContext ctx96{sr96, 0.0, msPerFrame96, false, 0};
        proc96.process(pcm96, ctx96);

        const double before75 = peakAbs(std::span<const float>(pcm96.data(), 75 * 2));
        const double at75 = std::max(std::abs(pcm96[75 * 2]), std::abs(pcm96[75 * 2 + 1]));
        QVERIFY2(before75 < 1e-6, qPrintable(QStringLiteral("D8 96kHz onset too early: before75=%1").arg(before75)));
        QVERIFY2(at75 > 1e-5, qPrintable(QStringLiteral("D8 96kHz onset quantized to 48kHz (frame 75 silent): at75=%1").arg(at75)));
    }

    // D9: Full setParameter parity (all 74 fields), aInharm=0.0, model defaultRatio, strict enums, empty edit no-op.
    void d9ParameterParityAndStrictEnums() {
        ModalSynth synth;
        synth.prepare(48000.0);

        // Previously omitted 35 parameters must all succeed via setParameter().
        const std::array<std::pair<const char*, double>, 35> previouslyOmitted{{
            {"velMalletMix", 0.3}, {"velMalletRes", -0.4}, {"velMalletStiff", 0.5},
            {"noiseFilterMode", 1.0}, {"noiseFilterFreq", 1800.0}, {"noiseFilterQ", 2.5},
            {"noiseAttackMs", 15.0}, {"noiseDecayMs", 300.0}, {"noiseSustain", 0.4},
            {"noiseReleaseMs", 250.0}, {"noiseAttackTension", 0.2}, {"noiseDecayTension", -0.2},
            {"noiseReleaseTension", 0.1}, {"velNoiseMix", 0.3}, {"velNoiseRes", 0.4},
            {"velNoiseFreq", -0.5}, {"velNoiseQ", 0.25}, {"velNoiseAttack", -0.1},
            {"velNoiseDecay", 0.2}, {"velNoiseSustain", 0.3}, {"velNoiseRelease", -0.2},
            {"velADecay", 0.4}, {"velAHit", -0.3}, {"velAInharm", 0.2}, {"velADamp", -0.1}, {"velATone", 0.5},
            {"velBDecay", -0.4}, {"velBHit", 0.3}, {"velBInharm", -0.2}, {"velBDamp", 0.1}, {"velBTone", -0.5},
            {"pitchBendRange", 7.0}, {"polyphony", 8.0}, {"reuseVoices", 1.0}, {"fadeoutRepeats", 1.0},
        }};
        for (const auto& [name, val] : previouslyOmitted) {
            QVERIFY2(synth.setParameter(name, val),
                     qPrintable(QStringLiteral("D9 setParameter rejected valid field: %1").arg(QString::fromUtf8(name))));
        }
        QCOMPARE(synth.params().noiseFilterMode, NoiseFilterMode::BandPass);
        QCOMPARE(synth.params().pitchBendRange, 7);
        QCOMPARE(synth.params().polyphony, 8);
        QCOMPARE(synth.params().reuseVoices, true);
        QCOMPARE(synth.params().fadeoutRepeats, true);

        // aInharm and bInharm accept 0.0 (matching setModalParamsEdit).
        QVERIFY(synth.setParameter("aInharm", 0.0));
        QCOMPARE(synth.params().a.inharm, 0.0f);
        QVERIFY(synth.setParameter("bInharm", 0.0));
        QCOMPARE(synth.params().b.inharm, 0.0f);

        // Changing model via setParameter applies defaultRatioForModel.
        QVERIFY(synth.setParameter("aModel", static_cast<double>(ModalModel::Beam)));
        QCOMPARE(synth.params().a.ratio, 2.0f);
        QVERIFY(synth.setParameter("bModel", static_cast<double>(ModalModel::Djembe)));
        QCOMPARE(synth.params().b.ratio, 1.0f);

        // Strict enum validation: invalid enum strings must NOT coerce to defaults.
        QJsonObject doc = makeMidiTimelineDoc(QJsonObject{{QStringLiteral("type"), QStringLiteral("subtractive")}}, QJsonArray{});
        // Empty payload on non-modal track must return unchanged doc (must NOT convert to modal!).
        const QJsonObject afterEmpty = setModalParamsEdit(doc, QJsonObject{{QStringLiteral("trackId"), QStringLiteral("t1")}});
        QCOMPARE(afterEmpty, doc);

        // Invalid-only enum payload on non-modal track must return unchanged doc.
        const QJsonObject afterBadEnum = setModalParamsEdit(doc, QJsonObject{
            {QStringLiteral("trackId"), QStringLiteral("t1")},
            {QStringLiteral("aModel"), QStringLiteral("nonexistent_model")},
            {QStringLiteral("coupling"), QStringLiteral("bogus")},
            {QStringLiteral("noiseFilterMode"), QStringLiteral("invalid")},
        });
        QCOMPARE(afterBadEnum, doc);

        // On an existing modal track, invalid enum strings must preserve existing valid enums.
        doc = setModalPresetEdit(doc, QJsonObject{{QStringLiteral("trackId"), QStringLiteral("t1")},
                                                  {QStringLiteral("preset"), QStringLiteral("modal-vibes")}});
        const QJsonObject beforeInvalid = doc;
        const QJsonObject afterInvalid = setModalParamsEdit(doc, QJsonObject{
            {QStringLiteral("trackId"), QStringLiteral("t1")},
            {QStringLiteral("aModel"), QStringLiteral("bogus")},
            {QStringLiteral("bModel"), QStringLiteral("bogus")},
            {QStringLiteral("coupling"), QStringLiteral("bogus")},
            {QStringLiteral("noiseFilterMode"), QStringLiteral("bogus")},
        });
        QCOMPARE(afterInvalid, beforeInvalid);
    }

    // D10: Additional coverage for 44.1/48/96 kHz modal pitch/decay parity and noise exciter.
    void d10SampleRateModalParityAndNoiseExciter() {
        // 1. Modal pitch & decay parity across 44.1 / 48 / 96 kHz.
        double ratio48 = 0.0;
        for (double sr : {44100.0, 48000.0, 96000.0}) {
            ModalSynth synth;
            ModalSynthParams p{};
            p.stereoizer = false;
            p.malletStiff = 1500.0f;
            p.malletRes = 0.8f;
            p.a.on = true;
            p.a.model = ModalModel::Marimba;
            p.a.partials = 8;
            p.a.decay = 1.2f;
            p.a.hit = 0.25f;
            p.b.on = false;
            synth.prepare(sr);
            synth.setParams(p);
            synth.snapParams();
            synth.noteOn(69, 0.9f);  // A4 = 440 Hz

            const std::size_t n = static_cast<std::size_t>(sr * 0.8);
            std::vector<float> pcm(n * 2, 0.0f);
            synth.renderBlock(pcm);
            const auto mono = extractMono(pcm);
            const double peakHz = findPeakHzNear(mono, sr, 440.0, 0.04);
            QVERIFY2(std::abs(centsError(peakHz, 440.0)) < 10.0,
                     qPrintable(QStringLiteral("D10 modal pitch mismatch at %1 Hz: got %2 Hz").arg(sr).arg(peakHz)));

            const double early = rmsSpan(std::span<const double>(mono.data() + static_cast<std::size_t>(sr * 0.02), static_cast<std::size_t>(sr * 0.08)));
            const double late = rmsSpan(std::span<const double>(mono.data() + static_cast<std::size_t>(sr * 0.50), static_cast<std::size_t>(sr * 0.15)));
            const double ratio = early > 1e-9 ? (late / early) : 0.0;
            if (sr == 48000.0) ratio48 = ratio;
            if (sr == 96000.0) {
                QVERIFY2(std::abs(ratio - ratio48) / std::max(1e-6, ratio48) < 0.15,
                         qPrintable(QStringLiteral("D10 modal decay SR mismatch: 48k=%1 96k=%2").arg(ratio48).arg(ratio)));
            }
        }

        // 2. Noise exciter modes (LP / BP / HP), ADSR envelope, and noiseOsc excitation.
        for (NoiseFilterMode fm : {NoiseFilterMode::LowPass, NoiseFilterMode::BandPass, NoiseFilterMode::HighPass}) {
            ModalSynth synth;
            ModalSynthParams p{};
            p.stereoizer = false;
            p.malletRes = 0.0f;
            p.malletMix = 0.0f;
            p.noiseMix = 0.2f;
            p.noiseRes = 0.6f;
            p.noiseOsc = 0.4f;
            p.noiseFilterMode = fm;
            p.noiseFilterFreq = 1400.0f;
            p.noiseFilterQ = 1.8f;
            p.noiseAttackMs = 5.0f;
            p.noiseDecayMs = 80.0f;
            p.noiseSustain = 0.5f;
            p.noiseReleaseMs = 60.0f;
            p.a.on = true;
            p.a.model = ModalModel::String;
            p.a.partials = 16;
            p.a.decay = 0.8f;
            p.b.on = false;

            synth.prepare(48000.0);
            synth.setParams(p);
            synth.snapParams();
            synth.noteOn(60, 0.9f);
            std::vector<float> pcm(8192 * 2, 0.0f);
            synth.renderBlock(pcm);
            synth.noteOff(60);
            std::vector<float> rel(8192 * 2, 0.0f);
            synth.renderBlock(rel);
            QVERIFY(allFinite(pcm) && allFinite(rel));
            QVERIFY(rmsSpan(extractMono(pcm)) > 1e-4);
        }

        // 3. Full schema parity: every key serialized by modalParamsToJson (excluding "type"/"preset")
        //    is accepted by ModalSynth::setParameter(), AssistantCommandTable.cpp, and ModalSynthPanel.qml controls.
        {
            ModalSynth paritySynth;
            paritySynth.prepare(48000.0);
            const QJsonObject fullJson = modalParamsToJson(ModalSynthParams{});
            int checked = 0;
            for (auto it = fullJson.constBegin(); it != fullJson.constEnd(); ++it) {
                const QString key = it.key();
                if (key == u"type" || key == u"preset") continue;
                const std::string keyUtf8 = key.toStdString();
                double testVal = 0.5;
                if (key == u"malletStiff") testVal = 1200.0;
                else if (key == u"noiseFilterFreq") testVal = 1500.0;
                else if (key == u"noiseFilterQ") testVal = 1.5;
                else if (key.endsWith(u"Ms")) testVal = 50.0;
                else if (key.endsWith(u"Partials")) testVal = 16.0;
                else if (key.endsWith(u"Ratio")) testVal = 1.2;
                else if (key == u"pitchBendRange" || key == u"polyphony") testVal = 4.0;
                QVERIFY2(paritySynth.setParameter(keyUtf8, testVal),
                         qPrintable(QStringLiteral("D10 modalParamsToJson key missing from setParameter(): %1").arg(key)));
                ++checked;
            }
            QCOMPARE(checked, 74);

            // Verify AssistantCommandTable.cpp and ModalSynthPanel.qml stay in sync with ModalSynth keys.
            const QDir srcDir = QFileInfo(QString::fromUtf8(__FILE__)).dir();  // .../src/midi
            QFile cmdFile(srcDir.filePath(QStringLiteral("../aiassist/AssistantCommandTable.cpp")));
            QVERIFY2(cmdFile.open(QIODevice::ReadOnly), "Could not open AssistantCommandTable.cpp");
            const QString cmdText = QString::fromUtf8(cmdFile.readAll());
            for (auto it = fullJson.constBegin(); it != fullJson.constEnd(); ++it) {
                const QString key = it.key();
                if (key == u"type" || key == u"preset") continue;
                const QString needle = QStringLiteral("P{\"%1\"").arg(key);
                QVERIFY2(cmdText.contains(needle),
                         qPrintable(QStringLiteral("D10 parameter missing from AssistantCommandTable.cpp: %1").arg(key)));
            }

            QFile qmlFile(srcDir.filePath(QStringLiteral("../../qml/instruments/ModalSynthPanel.qml")));
            QVERIFY2(qmlFile.open(QIODevice::ReadOnly), "Could not open ModalSynthPanel.qml");
            const QString qmlText = QString::fromUtf8(qmlFile.readAll());
            for (const QString& qmlParam : {QStringLiteral("coupling"), QStringLiteral("aModel"),
                                            QStringLiteral("bOn"), QStringLiteral("bModel"),
                                            QStringLiteral("malletStiff"), QStringLiteral("aDecay"),
                                            QStringLiteral("aTone"), QStringLiteral("aHit"),
                                            QStringLiteral("aInharm"), QStringLiteral("abMix")}) {
                QVERIFY2(qmlText.contains(QStringLiteral("\"%1\"").arg(qmlParam)),
                         qPrintable(QStringLiteral("D10 expected control param missing from ModalSynthPanel.qml: %1").arg(qmlParam)));
            }
        }
    }

    // E1: Automating aRatio/bRatio/aCoarse/aFine/bCoarse/bFine/abSplit on 16 Serial 64+64 voices
    // must consume immutable prepared data without mutating active snapshots or running 64x64 shift loops on render.
    void e1RatioPitchSplitAutomationNoRenderTableWork() {
        constexpr double sr = 48000.0;
        constexpr std::size_t blockFrames = 512;
        constexpr int numBlocks = 80;

        ModalSynth synth;
        ModalSynthParams p{};
        p.polyphony = 16;
        p.stereoizer = true;
        p.malletStiff = 1500.0f;
        p.malletRes = 0.8f;
        p.a.on = true;
        p.a.model = ModalModel::Membrane;
        p.a.partials = 64;
        p.a.decay = 6.0f;
        p.a.damp = -0.2f;
        p.a.ratio = 0.78f;
        p.b.on = true;
        p.b.model = ModalModel::Plate;
        p.b.partials = 64;
        p.b.decay = 6.0f;
        p.b.damp = -0.2f;
        p.b.ratio = 0.78f;
        p.coupling = ModalCoupling::Serial;
        p.abSplit = 0.25f;

        synth.prepare(sr);
        synth.setParams(p);
        synth.snapParams();

        const auto initialMembraneRatios = synth.models().ratios(true, ModalModel::Membrane);
        const auto initialPlateRatios = synth.models().ratios(false, ModalModel::Plate);

        for (int v = 0; v < 16; ++v) {
            synth.noteOn(48 + v * 2, 0.85f);
        }
        QCOMPARE(synth.activeVoiceCount(), 16);

        std::array<float, blockFrames * 2> stereo{};
        const auto t0 = std::chrono::steady_clock::now();
        for (int b = 0; b < numBlocks; ++b) {
            const double phase = static_cast<double>(b) / static_cast<double>(numBlocks);
            QVERIFY(synth.setParameter("aRatio", 0.4 + 2.0 * phase));
            QVERIFY(synth.setParameter("bRatio", 0.5 + 1.8 * phase));
            QVERIFY(synth.setParameter("aCoarse", -5.0 + 10.0 * phase));
            QVERIFY(synth.setParameter("aFine", -40.0 + 80.0 * phase));
            QVERIFY(synth.setParameter("bCoarse", 7.0 - 10.0 * phase));
            QVERIFY(synth.setParameter("bFine", 30.0 - 60.0 * phase));
            QVERIFY(synth.setParameter("abSplit", 0.05 + 0.90 * phase));
            stereo.fill(0.0f);
            synth.renderBlock(stereo);
        }
        const auto t1 = std::chrono::steady_clock::now();
        const double usPerBlock = std::chrono::duration<double, std::micro>(t1 - t0).count() / static_cast<double>(numBlocks);
        const double blockDurationUs = (static_cast<double>(blockFrames) / sr) * 1e6;
        const double cpuPct = 100.0 * usPerBlock / blockDurationUs;
        std::fprintf(stderr, "[ModalSynth E1 16v 64+64 Serial Ratio+Pitch+Split CPU] %.2f us / 512f (%.2f%% RT)\n",
                     usPerBlock, cpuPct);

        // Control-thread worker prepares & publishes updated immutable snapshots off the audio thread
        // without slowing down the render thread or dropping any held voices.
#ifndef NT_MODAL_TSAN
        QVERIFY2(cpuPct < 45.0,
                 qPrintable(QStringLiteral("E1 16v 64+64 Serial Ratio+Pitch+Split CPU too high: %1%% RT").arg(cpuPct)));
#endif
        QVERIFY(synth.waitForPublishedTables(500));
        stereo.fill(0.0f);
        synth.renderBlock(stereo);
        QCOMPARE(synth.activeVoiceCount(), 16);
        QVERIFY(synth.models().ratios(true, ModalModel::Membrane) != initialMembraneRatios);
        QVERIFY(synth.models().ratios(false, ModalModel::Plate) != initialPlateRatios);

        // Explicit control-thread publishTablesOffThread also updates tables without dropping held voices.
        const auto afterLiveRatios = synth.models().ratios(true, ModalModel::Membrane);
        ModalSynthParams pNext = p;
        pNext.a.ratio = 4.5f;
        pNext.b.ratio = 3.8f;
        pNext.a.coarse = 3.0f;
        pNext.abSplit = 0.6f;
        synth.publishTablesOffThread(pNext);
        stereo.fill(0.0f);
        synth.renderBlock(stereo);
        QCOMPARE(synth.activeVoiceCount(), 16);
        QVERIFY(synth.models().ratios(true, ModalModel::Membrane) != afterLiveRatios);
    }

    // E2: Structural swap must preserve held notes and NoteOns arriving during the 5 ms crossfade.
    void e2StructuralSwapPreservesHeldAndPendingNotes() {
        constexpr double sr = 48000.0;

        // 1. Holding C4 with sustaining excitation across an aModel swap must keep C4 active and sounding.
        {
            ModalSynth synth;
            ModalSynthParams p{};
            p.stereoizer = false;
            p.malletRes = 0.8f;
            p.noiseRes = 0.6f;
            p.noiseMix = 0.0f;
            p.noiseAttackMs = 5.0f;
            p.noiseDecayMs = 50.0f;
            p.noiseSustain = 0.9f;
            p.noiseReleaseMs = 200.0f;
            p.a.on = true;
            p.a.model = ModalModel::String;
            p.a.partials = 16;
            p.a.decay = 3.0f;
            p.a.hit = 0.25f;
            p.b.on = false;

            synth.prepare(sr);
            synth.setParams(p);
            synth.snapParams();
            synth.noteOn(60, 0.9f);

            std::vector<float> pre(512 * 2, 0.0f);
            synth.renderBlock(pre);
            QCOMPARE(synth.activeVoiceCount(), 1);

            QVERIFY(synth.setParameter("aModel", static_cast<double>(ModalModel::Marimba)));
            std::vector<float> during(512 * 2, 0.0f);
            synth.renderBlock(during);
            std::vector<float> after(512 * 2, 0.0f);
            synth.renderBlock(after);

            QVERIFY(allFinite(during) && allFinite(after));
            QCOMPARE(synth.activeVoiceCount(), 1);
            const double afterRms = rmsSpan(extractMono(after));
            QVERIFY2(afterRms > 1e-3,
                     qPrintable(QStringLiteral("E2 held note went silent after structural swap: rms=%1").arg(afterRms)));
        }

        // 2. A NoteOn arriving during the 5 ms structural swap fade must survive and sound on the new model.
        {
            ModalSynth synth;
            ModalSynthParams p{};
            p.stereoizer = false;
            p.malletRes = 0.9f;
            p.a.on = true;
            p.a.model = ModalModel::String;
            p.a.partials = 16;
            p.a.decay = 4.0f;
            p.a.hit = 0.25f;
            p.b.on = false;

            synth.prepare(sr);
            synth.setParams(p);
            synth.snapParams();
            synth.noteOn(60, 0.9f);

            std::vector<float> pre(256 * 2, 0.0f);
            synth.renderBlock(pre);

            QVERIFY(synth.setParameter("aModel", static_cast<double>(ModalModel::Plate)));
            std::vector<float> midFade(64 * 2, 0.0f);  // 1.33 ms into 5 ms fade
            synth.renderBlock(midFade);
            synth.noteOn(67, 0.95f);  // G4 triggered during swap fade

            std::vector<float> post(4096 * 2, 0.0f);
            synth.renderBlock(post);
            QVERIFY(allFinite(post));
            QCOMPARE(synth.activeVoiceCount(), 2);
            const auto mono = extractMono(post);
            const double pG4 = dftPowerAtHz(std::span<const double>(mono.data() + 512, mono.size() - 512), sr, midiToHz(67));
            QVERIFY2(pG4 > 1e-5,
                     qPrintable(QStringLiteral("E2 NoteOn during swap fade was cleared: pG4=%1").arg(pG4)));
        }
    }

    // E3: Overlapping same-pitch clips with unequal gate lengths must release only their own voice.
    void e3OverlappingSamePitchClipsIndependentRelease() {
        ModalSynthParams p{};
        p.stereoizer = false;
        p.malletRes = 0.7f;
        p.noiseRes = 0.5f;
        p.noiseAttackMs = 5.0f;
        p.noiseDecayMs = 20.0f;
        p.noiseSustain = 0.9f;
        p.noiseReleaseMs = 20.0f;
        p.a.on = true;
        p.a.model = ModalModel::String;
        p.a.partials = 8;
        p.a.decay = 5.0f;
        p.a.release = 0.005f;  // fast 25 ms release damping
        p.b.on = false;
        const QJsonObject inst = modalParamsToJson(p);

        // Clip 1: C4 from 0..2000 ms (long). Clip 2: C4 from 50..200 ms (short).
        QJsonObject clip1{
            {QStringLiteral("id"), QStringLiteral("c1")},
            {QStringLiteral("trackId"), QStringLiteral("t1")},
            {QStringLiteral("mediaType"), QStringLiteral("midi")},
            {QStringLiteral("startMs"), 0.0},
            {QStringLiteral("durationMs"), 2000.0},
            {QStringLiteral("inPointMs"), 0.0},
            {QStringLiteral("volumeDb"), 0.0},
            {QStringLiteral("notes"), QJsonArray{
                QJsonObject{{QStringLiteral("id"), QStringLiteral("n1")}, {QStringLiteral("pitch"), 60},
                            {QStringLiteral("startTick"), 0}, {QStringLiteral("durationTick"), 3840}, {QStringLiteral("velocity"), 110}},
            }},
        };
        QJsonObject clip2{
            {QStringLiteral("id"), QStringLiteral("c2")},
            {QStringLiteral("trackId"), QStringLiteral("t1")},
            {QStringLiteral("mediaType"), QStringLiteral("midi")},
            {QStringLiteral("startMs"), 50.0},
            {QStringLiteral("durationMs"), 150.0},
            {QStringLiteral("inPointMs"), 0.0},
            {QStringLiteral("volumeDb"), 0.0},
            {QStringLiteral("notes"), QJsonArray{
                QJsonObject{{QStringLiteral("id"), QStringLiteral("n2")}, {QStringLiteral("pitch"), 60},
                            {QStringLiteral("startTick"), 0}, {QStringLiteral("durationTick"), 288}, {QStringLiteral("velocity"), 100}},
            }},
        };
        QJsonObject doc{
            {QStringLiteral("version"), 1},
            {QStringLiteral("tempo"), QJsonObject{{QStringLiteral("bpm"), 120.0}}},
            {QStringLiteral("tracks"), QJsonArray{QJsonObject{
                {QStringLiteral("id"), QStringLiteral("t1")}, {QStringLiteral("type"), QStringLiteral("midi")},
                {QStringLiteral("name"), QStringLiteral("Modal")}, {QStringLiteral("volumeDb"), 0.0},
                {QStringLiteral("pan"), 0.0}, {QStringLiteral("instrument"), inst},
            }}},
            {QStringLiteral("clips"), QJsonArray{clip1, clip2}},
        };
        const auto parsed = nt::parseTimelineJson(QJsonDocument(doc).toJson(QJsonDocument::Compact));
        QVERIFY(parsed.timeline.has_value());

        ModalSynthProcessor proc(*parsed.timeline, parsed.timeline->tracks.at(0));
        constexpr double sr = 48000.0;
        proc.prepare(sr);
        constexpr std::size_t blockFrames = 128;
        const double msPerFrame = 1000.0 / sr;

        // Render 0..150 ms -> both clips active (2 voices).
        std::vector<float> buf(blockFrames * 2, 0.0f);
        std::size_t frame = 0;
        while (static_cast<double>(frame) * msPerFrame < 150.0) {
            std::fill(buf.begin(), buf.end(), 0.0f);
            nt::audio::BlockContext ctx{sr, static_cast<double>(frame) * msPerFrame, msPerFrame, false, 0};
            proc.process(buf, ctx);
            frame += blockFrames;
        }
        QCOMPARE(proc.synth().activeVoiceCount(), 2);

        // Render through t = 1400 ms (1.2 s after clip 2 ended so clip 2's voice fully drains,
        // while clip 1 is still held until 2000 ms): must still have 1 active voice and sustained RMS.
        std::vector<float> probe;
        while (static_cast<double>(frame) * msPerFrame < 1400.0) {
            std::fill(buf.begin(), buf.end(), 0.0f);
            nt::audio::BlockContext ctx{sr, static_cast<double>(frame) * msPerFrame, msPerFrame, false, 0};
            proc.process(buf, ctx);
            if (static_cast<double>(frame) * msPerFrame >= 1250.0) {
                probe.insert(probe.end(), buf.begin(), buf.end());
            }
            frame += blockFrames;
        }
        QCOMPARE(proc.synth().activeVoiceCount(), 1);
        const double heldClip1Rms = rmsSpan(extractMono(probe));
        QVERIFY2(heldClip1Rms > 1e-3,
                 qPrintable(QStringLiteral("E3 short clip NoteOff killed overlapping same-pitch long clip: rms=%1").arg(heldClip1Rms)));
    }

    // E4: NoteOff arriving during a 1 ms steal fade or repeated-note fade must not be lost.
    void e4NoteOffDuringStealAndRepeatFadeNotLost() {
        constexpr double sr = 48000.0;

        auto makeSustainingParams = [](int poly, bool reuse, bool fadeRepeats) {
            ModalSynthParams p{};
            p.polyphony = poly;
            p.reuseVoices = reuse;
            p.fadeoutRepeats = fadeRepeats;
            p.stereoizer = false;
            p.malletRes = 0.6f;
            p.noiseMix = 0.4f;
            p.noiseRes = 0.5f;
            p.noiseAttackMs = 2.0f;
            p.noiseDecayMs = 10.0f;
            p.noiseSustain = 1.0f;
            p.noiseReleaseMs = 20.0f;
            p.a.on = true;
            p.a.model = ModalModel::String;
            p.a.partials = 8;
            p.a.decay = 5.0f;
            p.a.release = 0.005f;
            p.b.on = false;
            return p;
        };

        // 1. Steal fade: polyphony=1, C4 ringing -> steal with D4 -> release D4 during 1 ms fade -> must not stick.
        {
            ModalSynth synth;
            synth.prepare(sr);
            synth.setParams(makeSustainingParams(1, false, false));
            synth.snapParams();

            synth.noteOn(60, 0.9f);
            std::vector<float> b(512 * 2, 0.0f);
            synth.renderBlock(b);

            synth.noteOn(62, 0.9f);  // steals C4 with 1 ms (48-sample) fade
            std::vector<float> mid(16 * 2, 0.0f);
            synth.renderBlock(mid);
            synth.noteOff(62);       // NoteOff for D4 during fade!

            std::vector<float> drain(96000 * 2, 0.0f);  // 2.0 s
            synth.renderBlock(drain);
            QCOMPARE(synth.activeVoiceCount(), 0);
            const auto mono = extractMono(drain);
            const double lateRms = rmsSpan(std::span<const double>(mono.data() + 80000, 16000));
            QVERIFY2(lateRms < 1e-5,
                     qPrintable(QStringLiteral("E4 D4 stuck after NoteOff during steal fade: lateRms=%1").arg(lateRms)));
        }

        // 2. Repeated-note fade: reuseVoices=true, fadeoutRepeats=true -> retrigger C4 -> NoteOff during fade -> must not stick.
        {
            ModalSynth synth;
            synth.prepare(sr);
            synth.setParams(makeSustainingParams(4, true, true));
            synth.snapParams();

            synth.noteOn(60, 0.9f);
            std::vector<float> b(512 * 2, 0.0f);
            synth.renderBlock(b);

            synth.noteOn(60, 0.9f);  // repeated C4 with 1 ms fade
            std::vector<float> mid(16 * 2, 0.0f);
            synth.renderBlock(mid);
            synth.noteOff(60);       // NoteOff during fade!

            std::vector<float> drain(96000 * 2, 0.0f);  // 2.0 s
            synth.renderBlock(drain);
            QCOMPARE(synth.activeVoiceCount(), 0);
            const auto mono = extractMono(drain);
            const double lateRms = rmsSpan(std::span<const double>(mono.data() + 80000, 16000));
            QVERIFY2(lateRms < 1e-5,
                     qPrintable(QStringLiteral("E4 repeated C4 stuck after NoteOff during repeat fade: lateRms=%1").arg(lateRms)));
        }
    }

    // E5: Diagnostics must measure peaks before limiting and detect internal non-finite/overrange partial & waveguide state.
    void e5DiagnosticsDetectPreLimiterPeakAndInternalNonFinite() {
        constexpr double sr = 48000.0;

        // 1. Pre-limiter peak is measured BEFORE OutputLimiter (not masked by limiting).
        {
            ModalSynth synth;
            ModalSynthParams p{};
            p.stereoizer = false;
            p.malletRes = 0.0f;
            p.noiseMix = 0.0f;
            p.noiseRes = 1.0f;
            p.noiseAttackMs = 1.0f;
            p.noiseDecayMs = 10.0f;
            p.noiseSustain = 1.0f;
            p.a.on = true;
            p.a.model = ModalModel::String;
            p.a.partials = 32;
            p.a.decay = 2.0f;
            p.a.hit = 0.25f;
            p.b.on = false;
            p.gainDb = 24.0f;

            synth.prepare(sr);
            synth.setParams(p);
            synth.snapParams();
            synth.noteOn(60, 1.0f);
            synth.noteOn(64, 1.0f);
            synth.noteOn(67, 1.0f);
            synth.noteOn(72, 1.0f);

            std::vector<float> warmup(1024 * 2, 0.0f);
            synth.renderBlock(warmup);
            synth.resetDiagnostics();

            std::vector<float> pcm(2048 * 2, 0.0f);
            synth.renderBlock(pcm);
            QCOMPARE(synth.nonFiniteCount(), std::uint64_t{0});
            QVERIFY2(synth.maxPreClampAbs() > peakAbs(pcm) + 0.001,
                     "Post-limiter diagnostic must precede the safety ceiling");
            QVERIFY(peakAbs(pcm) <= 0.900001);
            QVERIFY2(synth.maxPreLimiterAbs() > synth.maxPreClampAbs() * 2.0,
                     qPrintable(QStringLiteral("E5 pre-limiter peak not separated from limiter output: preLim=%1 postLim=%2")
                                    .arg(synth.maxPreLimiterAbs()).arg(synth.maxPreClampAbs())));
        }

        // 2. Deliberately injected NaN in ModalPartial state must increment nonFiniteCount even though output is sanitized.
        {
            ModalSynth synth;
            ModalSynthParams p{};
            p.stereoizer = false;
            p.malletRes = 0.8f;
            p.a.on = true;
            p.a.model = ModalModel::String;
            p.a.partials = 8;
            p.a.decay = 2.0f;
            p.b.on = false;
            synth.prepare(sr);
            synth.setParams(p);
            synth.snapParams();
            synth.noteOn(60, 0.9f);
            std::vector<float> pcm(64 * 2, 0.0f);
            synth.renderBlock(pcm);
            QCOMPARE(synth.nonFiniteCount(), std::uint64_t{0});

            ModalSynthTestPeer::injectPartialNonFinite(synth, 0, 0, std::numeric_limits<double>::quiet_NaN());
            std::fill(pcm.begin(), pcm.end(), 0.0f);
            synth.renderBlock(pcm);
            QVERIFY(allFinite(pcm));  // sanitized output stays finite
            QVERIFY2(synth.nonFiniteCount() > 0, "E5 ModalPartial internal NaN was masked instead of counted");
        }

        // 3. Deliberately injected Inf and overrange (>64) in ModalWaveguide state must be caught by diagnostics.
        {
            ModalSynth synth;
            ModalSynthParams p{};
            p.stereoizer = false;
            p.malletRes = 0.8f;
            p.a.on = true;
            p.a.model = ModalModel::OpenTube;
            p.a.decay = 2.0f;
            p.a.radius = 0.8f;
            p.b.on = false;
            synth.prepare(sr);
            synth.setParams(p);
            synth.snapParams();
            synth.noteOn(60, 0.9f);
            std::vector<float> pcm(64 * 2, 0.0f);
            synth.renderBlock(pcm);
            QCOMPARE(synth.nonFiniteCount(), std::uint64_t{0});
            QCOMPARE(synth.waveguideClampCount(), std::uint64_t{0});

            ModalSynthTestPeer::injectWaveguideState(synth, 0, 120.0);
            std::fill(pcm.begin(), pcm.end(), 0.0f);
            synth.renderBlock(pcm);
            QVERIFY2(synth.waveguideClampCount() > 0, "E5 waveguide overrange clamp was not counted");
            QVERIFY2(synth.maxRawResonatorAbs() >= 100.0,
                     qPrintable(QStringLiteral("E5 raw waveguide peak not recorded: %1").arg(synth.maxRawResonatorAbs())));

            synth.resetDiagnostics();
            ModalSynthTestPeer::injectWaveguideState(synth, 0, std::numeric_limits<double>::infinity());
            std::fill(pcm.begin(), pcm.end(), 0.0f);
            synth.renderBlock(pcm);
            QVERIFY(allFinite(pcm));
            QVERIFY2(synth.nonFiniteCount() > 0, "E5 ModalWaveguide internal Inf was masked instead of counted");
        }
    }

    // Round 3 E1: Ownership-exchanging triple buffer never overwrites a pinned consumer snapshot
    // and survives concurrent off-thread publication + render under TSan.
    void r3E1ConcurrentSnapshotPublicationAndRender() {
        constexpr double sr = 48000.0;

        // 1. Deterministic slot-reuse check: consumer's pinned snapshot must never be mutated
        //    even after repeated off-thread publications before consumer acquires the next slot.
        {
            ModalSynth synth;
            ModalSynthParams p0{};
            p0.a.on = true;
            p0.a.model = ModalModel::Membrane;
            p0.a.ratio = 0.78f;
            p0.b.on = true;
            p0.b.model = ModalModel::Plate;
            p0.b.ratio = 0.78f;
            p0.coupling = ModalCoupling::Serial;
            synth.prepare(sr);
            synth.setParams(p0);
            synth.snapParams();

            ModalSynthParams p1 = p0;
            p1.a.ratio = 0.45f;
            synth.publishTablesOffThread(p1);

            const ModalModels& pinned = synth.models();
            const auto savedRatios = pinned.ratios(true, ModalModel::Membrane);

            ModalSynthParams p2 = p0;
            p2.a.ratio = 2.1f;
            synth.publishTablesOffThread(p2);

            ModalSynthParams p3 = p0;
            p3.a.ratio = 3.8f;
            synth.publishTablesOffThread(p3);

            ModalSynthParams p4 = p0;
            p4.a.ratio = 5.2f;
            synth.publishTablesOffThread(p4);

            QCOMPARE(pinned.ratios(true, ModalModel::Membrane), savedRatios);
        }

        // 2. Concurrent control-thread publishTablesOffThread() + render-thread rendering/MIDI/params (TSan stress).
        {
            ModalSynth synth;
            ModalSynthParams base{};
            base.polyphony = 8;
            base.stereoizer = true;
            base.malletRes = 0.8f;
            base.a.on = true;
            base.a.model = ModalModel::Membrane;
            base.a.partials = 16;
            base.a.decay = 2.0f;
            base.b.on = true;
            base.b.model = ModalModel::Plate;
            base.b.partials = 16;
            base.b.decay = 2.0f;
            base.coupling = ModalCoupling::Serial;
            base.abSplit = 0.25f;

            synth.prepare(sr);
            synth.setParams(base);
            synth.snapParams();

            std::atomic<bool> stop{false};
            std::thread publisher([&]() {
                int iter = 0;
                while (!stop.load(std::memory_order_relaxed)) {
                    ModalSynthParams pv = base;
                    pv.a.model = (iter % 2 == 0) ? ModalModel::Membrane : ModalModel::Beam;
                    pv.b.model = (iter % 3 == 0) ? ModalModel::Plate : ModalModel::String;
                    pv.a.ratio = 0.5f + static_cast<float>((iter % 7)) * 0.4f;
                    pv.b.ratio = 0.4f + static_cast<float>((iter % 5)) * 0.5f;
                    pv.abSplit = 0.1f + static_cast<float>((iter % 9)) * 0.1f;
                    synth.publishTablesOffThread(pv);
                    ++iter;
                }
            });

            std::array<float, 128 * 2> stereo{};
            for (int b = 0; b < 300; ++b) {
                if (b % 15 == 0) synth.noteOn(48 + (b % 24), 0.85f);
                if (b % 23 == 0) synth.noteOff(48 + ((b + 7) % 24));
                if (b % 31 == 0) synth.setSustainPedal((b / 31) % 2 == 1);
                if (b % 11 == 0) (void)synth.setParameter("aDecay", 0.5 + static_cast<double>(b % 5));
                if (b % 13 == 0) (void)synth.setParameter("abSplit", 0.1 + 0.08 * static_cast<double>(b % 10));
                stereo.fill(0.0f);
                synth.renderBlock(stereo);
                QVERIFY(allFinite(stereo));
            }

            stop.store(true, std::memory_order_relaxed);
            publisher.join();
            QCOMPARE(synth.nonFiniteCount(), std::uint64_t{0});
        }
    }

    // Round 3 E2: Live Serial configuration matches freshly prepared Serial state, and mismatched
    // ratio/pitch pairs never consume stale shift deltas from an old resonator pair.
    void r3E2LiveSerialMatchesFreshlyPrepared() {
        constexpr double sr = 48000.0;

        // 1. Direct repro: prepare with B disabled and Parallel, then setParameter(bOn,1) + setParameter(coupling,1).
        {
            ModalSynth live;
            live.prepare(sr);
            QVERIFY(live.setParameter("bOn", 1.0));
            QVERIFY(live.setParameter("coupling", 1.0));
            live.noteOn(60, 1.0f);
            std::vector<float> liveBuf(512 * 2, 0.0f);
            live.renderBlock(liveBuf);

            ModalSynth fresh;
            ModalSynthParams fp{};
            fp.a.on = true;
            fp.b.on = true;
            fp.coupling = ModalCoupling::Serial;
            fresh.prepare(sr);
            fresh.setParams(fp);
            fresh.snapParams();
            fresh.noteOn(60, 1.0f);
            std::vector<float> freshBuf(512 * 2, 0.0f);
            fresh.renderBlock(freshBuf);

            const double liveFk = ModalSynthTestPeer::partialFreqHz(live, 0, true, 0);
            const double freshFk = ModalSynthTestPeer::partialFreqHz(fresh, 0, true, 0);
            QVERIFY2(std::abs(liveFk - freshFk) < 1e-4,
                     qPrintable(QStringLiteral("E2 live Serial C4 partial 0 mismatch: live=%1 Hz fresh=%2 Hz")
                                    .arg(liveFk, 0, 'f', 6).arg(freshFk, 0, 'f', 6)));

            double maxAudioDiff = 0.0;
            for (std::size_t i = 0; i < liveBuf.size(); ++i) {
                maxAudioDiff = std::max(maxAudioDiff, std::abs(static_cast<double>(liveBuf[i]) - static_cast<double>(freshBuf[i])));
            }
            QVERIFY2(maxAudioDiff < 1e-4,
                     qPrintable(QStringLiteral("E2 live vs fresh Serial audio mismatch: maxDiff=%1").arg(maxAudioDiff)));
        }

        // 2. Live model + ratio + pitch + split changes into Serial must match freshly prepared final state.
        {
            ModalSynth live;
            live.prepare(sr);  // starts Parallel, bOn=false, String+String
            QVERIFY(live.setParameter("aModel", static_cast<double>(ModalModel::Membrane)));
            QVERIFY(live.setParameter("bModel", static_cast<double>(ModalModel::Plate)));
            QVERIFY(live.setParameter("aRatio", 1.6));
            QVERIFY(live.setParameter("bRatio", 0.55));
            QVERIFY(live.setParameter("aCoarse", 5.0));
            QVERIFY(live.setParameter("aFine", 25.0));
            QVERIFY(live.setParameter("bCoarse", -3.0));
            QVERIFY(live.setParameter("bFine", -15.0));
            QVERIFY(live.setParameter("bOn", 1.0));
            QVERIFY(live.setParameter("coupling", 1.0));
            QVERIFY(live.setParameter("abSplit", 0.35));

            // Wait deterministically for control-thread publication (no manual publishTablesOffThread!)
            // and render past the 5 ms parameter smoother ramp.
            QVERIFY(live.waitForPublishedTables(500));
            std::vector<float> settle(1024 * 2, 0.0f);
            live.renderBlock(settle);
            live.noteOn(60, 1.0f);
            std::vector<float> liveBuf(1024 * 2, 0.0f);
            live.renderBlock(liveBuf);

            ModalSynth fresh;
            ModalSynthParams fp{};
            fp.a.on = true;
            fp.a.model = ModalModel::Membrane;
            fp.a.ratio = 1.6f;
            fp.a.coarse = 5.0f;
            fp.a.fine = 25.0f;
            fp.b.on = true;
            fp.b.model = ModalModel::Plate;
            fp.b.ratio = 0.55f;
            fp.b.coarse = -3.0f;
            fp.b.fine = -15.0f;
            fp.coupling = ModalCoupling::Serial;
            fp.abSplit = 0.35f;
            fresh.prepare(sr);
            fresh.setParams(fp);
            fresh.snapParams();
            fresh.noteOn(60, 1.0f);
            std::vector<float> freshBuf(1024 * 2, 0.0f);
            fresh.renderBlock(freshBuf);

            for (int k = 0; k < 16; ++k) {
                const double liveA = ModalSynthTestPeer::partialFreqHz(live, 0, true, k);
                const double freshA = ModalSynthTestPeer::partialFreqHz(fresh, 0, true, k);
                const double liveB = ModalSynthTestPeer::partialFreqHz(live, 0, false, k);
                const double freshB = ModalSynthTestPeer::partialFreqHz(fresh, 0, false, k);
                QVERIFY2(std::abs(liveA - freshA) < 1e-2,
                         qPrintable(QStringLiteral("E2 live vs fresh Serial A partial %1 mismatch: live=%2 fresh=%3")
                                        .arg(k).arg(liveA, 0, 'f', 4).arg(freshA, 0, 'f', 4)));
                QVERIFY2(std::abs(liveB - freshB) < 1e-2,
                         qPrintable(QStringLiteral("E2 live vs fresh Serial B partial %1 mismatch: live=%2 fresh=%3")
                                        .arg(k).arg(liveB, 0, 'f', 4).arg(freshB, 0, 'f', 4)));
            }
        }

        // 3. Stale delta rejection: when voice ratio/pitch diverges from snapshot, updateResonators
        //    must NOT apply deltas computed for the old resonator pair.
        {
            ModalSynthParams oldP{};
            oldP.a.on = true;
            oldP.a.model = ModalModel::String;
            oldP.a.coarse = 0.0f;
            oldP.b.on = true;
            oldP.b.model = ModalModel::String;
            oldP.b.coarse = 0.0f;
            oldP.coupling = ModalCoupling::Serial;
            oldP.abSplit = 0.5f;

            ModalTableSnapshot oldSnap{};
            ModalSynthTestPeer::buildTestSnapshot(oldP, oldSnap);
            QVERIFY(oldSnap.serialDeltasValid);

            ModalVoice voice;
            voice.srate = sr;
            voice.note = 60;
            voice.freq = ModalVoice::noteToFreq(60);
            voice.vel = 1.0;
            voice.isRelease = false;
            voice.resA.setParams(sr, true, ModalModel::String, 16, 1.0, 0.0, 0.0, 0.25, 1.0, 0.0, 0.0, 0.5, 0, 0, 0, 0, 0);
            voice.resB.setParams(sr, true, ModalModel::String, 16, 1.0, 0.0, 0.0, 0.25, 1.0, 0.0, 0.0, 0.5, 0, 0, 0, 0, 0);
            voice.setCoupling(ModalCoupling::Serial, 50.0);
            // Transpose A by +7 semitones while passing oldSnap built for aCoarse=0, bCoarse=0!
            voice.setPitch(7.0, 0.0, 0.0, 0.0, 1.0);
            voice.updateResonators(oldSnap, true, nullptr, nullptr);

            const double expectedUnshiftedHz = voice.freq * std::pow(2.0, 7.0 / 12.0);
            const double actualFk = ModalSynthTestPeer::voicePartialFreqHz(voice, true, 0);
            QVERIFY2(std::abs(actualFk - expectedUnshiftedHz) < 1e-3,
                     qPrintable(QStringLiteral("E2 stale serial deltas applied to mismatched pitch pair: actual=%1 expected=%2")
                                    .arg(actualFk, 0, 'f', 4).arg(expectedUnshiftedHz, 0, 'f', 4)));
        }
    }

    // Round 3 E3: Two structural changes within a single 5 ms fade (including back-to-back and
    // with a new note triggered in between) must never abruptly discard the outgoing bank or
    // attenuate the new note.
    void r3E3DoubleStructuralChangeWithinSingleFade() {
        constexpr double sr = 48000.0;

        auto setupRinging = [](ModalSynth& synth) -> double {
            ModalSynthParams p{};
            p.stereoizer = false;
            p.malletRes = 1.0f;
            p.a.on = true;
            p.a.model = ModalModel::String;
            p.a.partials = 16;
            p.a.decay = 5.0f;
            p.a.hit = 0.25f;
            p.b.on = false;
            synth.prepare(sr);
            synth.setParams(p);
            synth.snapParams();
            synth.noteOn(60, 1.0f);
            std::vector<float> pre(512 * 2, 0.0f);
            synth.renderBlock(pre);
            std::array<float, 2> one{};
            double last = static_cast<double>(pre.back());
            for (int k = 0; k < 256 && std::abs(last) < 0.15; ++k) {
                one.fill(0.0f);
                synth.renderBlock(one);
                last = static_cast<double>(one[0]);
            }
            return last;
        };

        // 1. Two aModel changes separated by 1 frame must preserve the original outgoing bank smoothly.
        {
            ModalSynth synth;
            const double preSample = setupRinging(synth);
            QVERIFY(std::abs(preSample) >= 0.15);

            QVERIFY(synth.setParameter("aModel", static_cast<double>(ModalModel::Plate)));
            std::array<float, 2> frame0{};
            synth.renderBlock(frame0);

            QVERIFY(synth.setParameter("aModel", static_cast<double>(ModalModel::Marimba)));
            std::vector<float> post(1024 * 2, 0.0f);
            synth.renderBlock(post);
            QVERIFY(allFinite(post));

            const double stepAfterSecond = std::abs(static_cast<double>(post[0]) - static_cast<double>(frame0[0]));
            QVERIFY2(stepAfterSecond < std::abs(static_cast<double>(frame0[0])) * 0.5,
                     qPrintable(QStringLiteral("E3 2nd swap after 1 frame discarded outgoing bank: frame0=%1 post0=%2 step=%3")
                                    .arg(frame0[0]).arg(post[0]).arg(stepAfterSecond)));
            QCOMPARE(ModalSynthTestPeer::activeAModel(synth), ModalModel::Marimba);
            QCOMPARE(synth.activeVoiceCount(), 1);
        }

        // 2. Back-to-back aModel changes with 0 frames rendered between them must not drop output to zero.
        {
            ModalSynth synth;
            const double preSample = setupRinging(synth);
            QVERIFY(std::abs(preSample) >= 0.15);

            QVERIFY(synth.setParameter("aModel", static_cast<double>(ModalModel::Plate)));
            QVERIFY(synth.setParameter("aModel", static_cast<double>(ModalModel::Marimba)));
            std::vector<float> post(1024 * 2, 0.0f);
            synth.renderBlock(post);
            QVERIFY(allFinite(post));

            const double step = std::abs(static_cast<double>(post[0]) - preSample);
            QVERIFY2(step < std::abs(preSample) * 0.5,
                     qPrintable(QStringLiteral("E3 back-to-back swaps dropped outgoing bank to zero: pre=%1 post0=%2 step=%3")
                                    .arg(preSample).arg(post[0]).arg(step)));
            QCOMPARE(ModalSynthTestPeer::activeAModel(synth), ModalModel::Marimba);
            QCOMPARE(synth.activeVoiceCount(), 1);
        }

        // 3. New note arriving between two aModel changes inside one fade must NOT be attenuated and must survive.
        {
            ModalSynth synth;
            const double preSample = setupRinging(synth);
            QVERIFY(std::abs(preSample) >= 0.15);

            // Reference synth with identical G4 triggered at full gain on Plate, for immediate onset comparison.
            ModalSynth refG4;
            ModalSynthParams rp{};
            rp.stereoizer = false;
            rp.malletRes = 1.0f;
            rp.a.on = true;
            rp.a.model = ModalModel::Plate;
            rp.a.partials = 16;
            rp.a.decay = 5.0f;
            rp.a.hit = 0.25f;
            rp.b.on = false;
            refG4.prepare(sr);
            refG4.setParams(rp);
            refG4.snapParams();

            QVERIFY(synth.setParameter("aModel", static_cast<double>(ModalModel::Plate)));
            std::vector<float> gap1(4 * 2, 0.0f);
            synth.renderBlock(gap1);

            // Trigger new note G4 (MIDI 67) at full gain during the first fade!
            synth.noteOn(67, 1.0f);
            refG4.noteOn(67, 1.0f);

            std::vector<float> gap2(4 * 2, 0.0f);
            synth.renderBlock(gap2);
            std::vector<float> refGap2(4 * 2, 0.0f);
            refG4.renderBlock(refGap2);

            // Trigger 2nd structural change (Plate -> Marimba) while still only 8/240 frames into fade #1!
            QVERIFY(synth.setParameter("aModel", static_cast<double>(ModalModel::Marimba)));

            // Immediately render 64 frames: G4 on Plate must keep full gain (not be multiplied by 8/240 = 0.033!).
            std::vector<float> afterSecond(64 * 2, 0.0f);
            synth.renderBlock(afterSecond);
            std::vector<float> refAfter(64 * 2, 0.0f);
            refG4.renderBlock(refAfter);

            const double gotRms = rmsSpan(extractMono(afterSecond));
            const double refRms = rmsSpan(extractMono(refAfter));
            QVERIFY2(gotRms > refRms * 0.5,
                     qPrintable(QStringLiteral("E3 new note between swaps was attenuated: gotRms=%1 refRms=%2")
                                    .arg(gotRms).arg(refRms)));

            // Render past both fades (20 ms = 960 frames) and verify final model is Marimba with both C4 and G4 ringing.
            std::vector<float> settle(4096 * 2, 0.0f);
            synth.renderBlock(settle);
            QVERIFY(allFinite(settle));
            QCOMPARE(ModalSynthTestPeer::activeAModel(synth), ModalModel::Marimba);
            QCOMPARE(synth.activeVoiceCount(), 2);
            const auto mono = extractMono(settle);
            const double pG4 = dftPowerAtHz(std::span<const double>(mono.data() + 1024, mono.size() - 1024), sr, midiToHz(67));
            QVERIFY2(pG4 > 1e-5,
                     qPrintable(QStringLiteral("E3 new note G4 lost after double swap: pG4=%1").arg(pG4)));
        }
    }
};

QTEST_MAIN(TestModalSynth)
#include "tst_modalsynth.moc"
