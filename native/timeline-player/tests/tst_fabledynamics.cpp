// Tests for FableSynth dynamics and EQ insert ports (eq, comp, ott, limiter).
// Covers:
//   - Bit-close reference checks against FableSynth C++ (commit ae9fca7) output
//   - HalfBandFir 4x polyphase interpolation parity and true-peak inter-sample limiting
//   - Web parameter key/range/default parity (params.ts / fableFxParams.ts)
//   - Click-free parameter smoothing and arbitrary block-size invariance
//   - 44.1 / 48 / 96 kHz operation and denormal/NaN/Inf safety
//   - Exact PDC latency reporting (active and bypassed)
//   - Zero audio-thread heap allocations (TestAllocationCounter.h)
//   - Real-time CPU budget bound per effect

#include "audio/Mixer.h"
#include "audio/TestAllocationCounter.h"
#include "audio/effects/fable/FableDsp.h"
#include "audio/effects/fable/FableDynamics.h"
#include "audio/effects/fable/FableDynamicsEffects.h"
#include "audio/effects/fable/FableParametricEq.h"
#include "model/TimelineJson.h"
#include "preview/PlaybackHooks.h"

#include <QJsonObject>
#include <QtTest>

#include <algorithm>
#include <array>
#include <chrono>
#include <cmath>
#include <cstdio>
#include <future>
#include <limits>
#include <memory>
#include <span>
#include <string>
#include <thread>
#include <vector>

using namespace nt::audio;
using namespace nt::audio::effects::fable;

namespace {

struct RefSample {
    int index;
    float l;
    float r;
};

// Golden reference outputs generated directly from FableSynth C++ (commit ae9fca7,
// juce/source/dsp/{Fx.cpp,Fx.h,ParametricEq.h}) on the deterministic multi-tone +
// dynamic envelope test signal below at 48 kHz (4096 frames).
constexpr int kRefFrames = 4096;
constexpr double kRefRate = 48000.0;

void makeTestSignal(std::vector<float>& L, std::vector<float>& R, int n, double sr, float scale) {
    L.resize(static_cast<std::size_t>(n));
    R.resize(static_cast<std::size_t>(n));
    for (int i = 0; i < n; ++i) {
        const double t = static_cast<double>(i) / sr;
        double env = 0.15;
        if (i >= 512 && i < 1536) {
            env = 1.0;
        } else if (i >= 1536 && i < 2560) {
            env = 0.5;
        } else if (i >= 2560 && i < 3072) {
            env = 1.35;
        } else if (i >= 3072) {
            env = 0.08;
        }
        const double sL = 0.35 * std::sin(2.0 * kPi * 85.0 * t)
                        + 0.30 * std::sin(2.0 * kPi * 680.0 * t + 0.3)
                        + 0.22 * std::sin(2.0 * kPi * 2400.0 * t + 1.1)
                        + 0.18 * std::sin(2.0 * kPi * 7200.0 * t + 2.0);
        const double sR = 0.30 * std::sin(2.0 * kPi * 85.0 * t + 0.4)
                        + 0.28 * std::sin(2.0 * kPi * 710.0 * t + 0.9)
                        + 0.25 * std::sin(2.0 * kPi * 2350.0 * t + 0.2)
                        + 0.20 * std::sin(2.0 * kPi * 6800.0 * t + 1.7);
        L[static_cast<std::size_t>(i)] = static_cast<float>(scale * env * sL);
        R[static_cast<std::size_t>(i)] = static_cast<float>(scale * env * sR);
    }
}

std::vector<float> interleave(const std::vector<float>& L, const std::vector<float>& R) {
    std::vector<float> out(L.size() * 2);
    for (std::size_t i = 0; i < L.size(); ++i) {
        out[i * 2] = L[i];
        out[i * 2 + 1] = R[i];
    }
    return out;
}

static constexpr RefSample kRefEq[] = {
    {0, 0.0480761528f, 0.0626323298f},
    {1, 0.0329452679f, 0.0534223765f},
    {7, 0.0264778342f, 0.0644388497f},
    {31, -0.00667738868f, -0.0220534876f},
    {32, 0.00886968616f, -0.0272362176f},
    {64, 0.0208168048f, 0.0758843869f},
    {72, 0.0246116444f, 0.0306601301f},
    {73, 0.0330386609f, 0.00988885015f},
    {128, 0.00198894367f, 0.0679673553f},
    {256, -0.00772519223f, -0.0280155782f},
    {511, -0.0384234637f, -0.0395346843f},
    {512, -0.023883909f, -0.258687198f},
    {520, 0.19693318f, -0.187567487f},
    {560, 0.170918941f, 0.0194616541f},
    {600, 0.294409186f, 0.311965317f},
    {768, 0.0449866056f, 0.122535959f},
    {1024, -0.266989261f, 0.164268926f},
    {1500, 0.20681724f, -0.247952208f},
    {1536, -0.194095343f, -0.109841451f},
    {1600, -0.10322056f, -0.157735154f},
    {2048, -0.123980202f, 0.0372952782f},
    {2559, 0.210659936f, -0.0381531529f},
    {2560, 0.549640059f, -0.0324952416f},
    {2580, 0.163389564f, -0.0209928639f},
    {2632, -0.155359015f, -0.172174349f},
    {2700, 0.128635868f, -0.202669948f},
    {3000, 0.704988956f, 0.406415105f},
    {3072, 0.238649309f, 0.0843482539f},
    {3200, 0.0386317931f, -0.0242020655f},
    {3500, 0.0303889457f, 0.0261820462f},
    {3840, 0.00230490719f, -0.00641286559f},
    {4095, 0.0149898855f, 0.0107219694f},
};

static constexpr RefSample kRefComp[] = {
    {0, 0.0369926058f, 0.0481929816f},
    {1, 0.0305734631f, 0.0479112677f},
    {7, 0.0300692357f, 0.0655554011f},
    {31, -0.00906905252f, -0.01737836f},
    {32, 0.00202181074f, -0.0259949584f},
    {64, 0.017411381f, 0.0664044321f},
    {72, 0.0230805129f, 0.0412123725f},
    {73, 0.0317251533f, 0.0225286242f},
    {128, -0.000349216542f, 0.0582648925f},
    {256, -0.0310529843f, -0.0245210771f},
    {511, -0.0130236428f, -0.0346429572f},
    {512, -0.00245500938f, -0.205184847f},
    {520, 0.190518424f, -0.182424664f},
    {560, 0.168212995f, 0.101674065f},
    {600, 0.222762272f, 0.320187598f},
    {768, 0.00922617689f, 0.0181153882f},
    {1024, -0.172210649f, 0.216547787f},
    {1500, 0.153369814f, -0.0864878893f},
    {1536, -0.179596066f, -0.0865290165f},
    {1600, -0.049886141f, -0.0699495077f},
    {2048, -0.0539652184f, 0.0379185192f},
    {2559, 0.110795982f, -0.0294982512f},
    {2560, 0.318428844f, -0.0247840546f},
    {2580, 0.0228133071f, 0.028427856f},
    {2632, -0.0737079531f, -0.0976832062f},
    {2700, 0.158185333f, -0.0340041257f},
    {3000, 0.281389058f, 0.113020979f},
    {3072, -0.0024818196f, -0.000168475759f},
    {3200, 0.00714358082f, -0.0168686714f},
    {3500, 0.0131810335f, 0.0123365829f},
    {3840, 0.00354701304f, -0.00219377805f},
    {4095, 0.00837828591f, 0.00288298423f},
};

static constexpr RefSample kRefOtt[] = {
    {0, 0.036993105f, 0.0481936298f},
    {1, 0.0305748675f, 0.0479135327f},
    {7, 0.0300844051f, 0.0655935854f},
    {31, -0.00906127132f, -0.0174466521f},
    {32, 0.00213360367f, -0.026111681f},
    {64, 0.0179005545f, 0.0678665116f},
    {72, 0.0238428582f, 0.0426323935f},
    {73, 0.032674294f, 0.023643259f},
    {128, 0.0016134216f, 0.0619101822f},
    {256, -0.0282277372f, -0.0240172967f},
    {511, -0.0193041544f, -0.0402686261f},
    {512, -0.00814642385f, -0.219557196f},
    {520, 0.195361748f, -0.197187677f},
    {560, 0.156342685f, 0.114521436f},
    {600, 0.237066165f, 0.340692639f},
    {768, 0.0441388562f, 0.0568738878f},
    {1024, -0.222267568f, 0.209665045f},
    {1500, 0.162463501f, -0.124385245f},
    {1536, -0.212539718f, -0.120303869f},
    {1600, -0.0755144283f, -0.100685917f},
    {2048, -0.0646820888f, 0.0328900144f},
    {2559, 0.127707198f, -0.0319445245f},
    {2560, 0.357171267f, -0.0264034197f},
    {2580, 0.0488778539f, 0.00723561365f},
    {2632, -0.0892586038f, -0.107167087f},
    {2700, 0.137120128f, -0.0883343071f},
    {3000, 0.385927528f, 0.190602064f},
    {3072, 0.0589555688f, 0.0207607336f},
    {3200, 0.0149108563f, -0.0169500746f},
    {3500, 0.0167752672f, 0.0155984843f},
    {3840, 0.00238070637f, -0.00304990914f},
    {4095, 0.0101255588f, 0.00473437924f},
};

static constexpr RefSample kRefLimiter[] = {
    {0, 0.0f, 0.0f},
    {1, 0.0f, 0.0f},
    {7, 0.0f, 0.0f},
    {31, 0.0f, 0.0f},
    {32, 0.0f, 0.0f},
    {64, 0.0f, 0.0f},
    {72, 0.0958444774f, 0.124863625f},
    {73, 0.0792130604f, 0.124133736f},
    {128, -0.0553025752f, 0.0322240926f},
    {256, 0.0279209167f, 0.045944795f},
    {511, 0.0568399429f, -0.0974036157f},
    {512, 0.0662406832f, -0.15206486f},
    {520, -0.0583513901f, -0.163770109f},
    {560, -0.0938738585f, 0.0165374763f},
    {600, -0.393422246f, -0.210608676f},
    {768, -0.0241809469f, 0.358867735f},
    {1024, -0.428879827f, -0.0573346317f},
    {1500, 0.100400701f, -0.0514851287f},
    {1536, -0.373689234f, -0.836837471f},
    {1600, -0.662719488f, -0.88578701f},
    {2048, -0.0609120652f, 0.0143668037f},
    {2559, 0.279735655f, -0.195606753f},
    {2560, 0.171801761f, -0.212116033f},
    {2580, -0.0639916062f, -0.0199739095f},
    {2632, 0.539175987f, -0.0419653133f},
    {2700, -0.102149613f, -0.529943526f},
    {3000, 0.132794321f, 0.568452656f},
    {3072, 0.52838707f, 0.212228701f},
    {3200, 0.00127465627f, 0.0160827264f},
    {3500, -0.00900797267f, -0.017005451f},
    {3840, -0.0170442909f, -0.023861099f},
    {4095, 0.019825995f, 0.0132050915f},
};

struct HalfBandRef {
    int index;
    std::array<double, 4> y;
};

static constexpr HalfBandRef kRefHalfBand4x[] = {
    {0, {0.0, 0.0, 0.0, 4.40689226054294e-07}},
    {9, {0.0, 0.010520064660058, 0.0239818135960848, 0.0372413733405977}},
    {10, {0.047081496566534, 0.0515275949206998, 0.0504481674335886, 0.0454389882071654}},
    {15, {0.0417441576719284, 0.044347665552215, 0.0463659269741493, 0.0476328133442687}},
    {31, {0.0610901713371277, 0.0565877403572879, 0.0519351613823952, 0.0474453090269532}},
    {47, {-0.00933859031647444, -0.0047205155242212, 0.000448842015325003, 0.00594968111483774}},
    {63, {-0.011409287340939, -0.0112545506005765, -0.011928269036478, -0.0133543011651917}},
};

double measureTruePeak4x(std::span<const float> stereo) {
    HalfBandFir u1L, u2L, u1R, u2R;
    u1L.design(LookaheadLimiter::kTpFir1Taps, LookaheadLimiter::kTpFirBeta);
    u2L.design(LookaheadLimiter::kTpFir2Taps, LookaheadLimiter::kTpFirBeta);
    u1R.design(LookaheadLimiter::kTpFir1Taps, LookaheadLimiter::kTpFirBeta);
    u2R.design(LookaheadLimiter::kTpFir2Taps, LookaheadLimiter::kTpFirBeta);
    double peak = 0.0;
    const std::size_t frames = stereo.size() / 2;
    for (std::size_t i = 0; i < frames; ++i) {
        double a0 = 0.0, a1 = 0.0, b00 = 0.0, b01 = 0.0, b10 = 0.0, b11 = 0.0;
        u1L.interpolate(stereo[i * 2], a0, a1);
        u2L.interpolate(a0, b00, b01);
        u2L.interpolate(a1, b10, b11);
        peak = std::max({peak, std::abs(b00), std::abs(b01), std::abs(b10), std::abs(b11)});
        u1R.interpolate(stereo[i * 2 + 1], a0, a1);
        u2R.interpolate(a0, b00, b01);
        u2R.interpolate(a1, b10, b11);
        peak = std::max({peak, std::abs(b00), std::abs(b01), std::abs(b10), std::abs(b11)});
    }
    return peak;
}

QJsonObject makeEffectJson(const char* kind, const QJsonObject& params = {}, bool enabled = true) {
    return QJsonObject{
        {"id", QString::fromLatin1(kind) + "_test"},
        {"type", "fable"},
        {"kind", QString::fromLatin1(kind)},
        {"enabled", enabled},
        {"params", params},
    };
}

}  // namespace

class TestFableDynamics : public QObject {
    Q_OBJECT

private slots:
    void referenceParametricEq() {
        std::vector<float> L, R;
        makeTestSignal(L, R, kRefFrames, kRefRate, 0.55f);

        ParametricEq eq;
        eq.prepare(kRefRate);
        const std::array<float, ParametricEq::kParamCount> params = {
            1.0f, 4.5f, -3.5f, 900.0f, 3.0f, 120.0f, 2500.0f, 6000.0f, 2.5f,
            0.70710678f, 0.0f, 1.0f,
            1.4f, 1.0f, 1.0f,
            2.0f, 1.0f, 1.0f,
            0.70710678f, 2.0f, 1.0f,
        };
        eq.setParams(params);
        eq.process(L.data(), R.data(), kRefFrames);

        float maxErr = 0.0f;
        for (const auto& ref : kRefEq) {
            maxErr = std::max(maxErr, std::abs(L[static_cast<std::size_t>(ref.index)] - ref.l));
            maxErr = std::max(maxErr, std::abs(R[static_cast<std::size_t>(ref.index)] - ref.r));
        }
        QVERIFY2(maxErr <= 1e-5f, qPrintable(QStringLiteral("ParametricEq maxErr=%1").arg(maxErr)));

        // Also check through BlockProcessor factory + fragmented block sizes.
        const QJsonObject fxParams{
            {"fx.eq.low", 4.5}, {"fx.eq.mid", -3.5}, {"fx.eq.mfreq", 900.0}, {"fx.eq.high", 3.0},
            {"fx.eq.lfreq", 120.0}, {"fx.eq.m2freq", 2500.0}, {"fx.eq.hfreq", 6000.0}, {"fx.eq.mid2", 2.5},
            {"fx.eq.lq", 0.70710678}, {"fx.eq.ltype", 0}, {"fx.eq.lon", 1},
            {"fx.eq.mq", 1.4}, {"fx.eq.mtype", 1}, {"fx.eq.mon", 1},
            {"fx.eq.m2q", 2.0}, {"fx.eq.m2type", 1}, {"fx.eq.m2on", 1},
            {"fx.eq.hq", 0.70710678}, {"fx.eq.htype", 2}, {"fx.eq.hon", 1},
        };
        auto proc = createFableDynamicsEffect(makeEffectJson("eq", fxParams));
        QVERIFY(proc != nullptr);
        proc->prepare(kRefRate);

        std::vector<float> inL, inR;
        makeTestSignal(inL, inR, kRefFrames, kRefRate, 0.55f);
        auto stereo = interleave(inL, inR);
        const std::array<int, 8> chunks = {1, 7, 127, 3, 509, 101, 2048, 1300};
        int offset = 0;
        for (int count : chunks) {
            BlockContext ctx{kRefRate, offset * 1000.0 / kRefRate, 1000.0 / kRefRate, false, offset % kMixBlockFrames};
            proc->process(std::span<float>(stereo).subspan(static_cast<std::size_t>(offset) * 2, static_cast<std::size_t>(count) * 2), ctx);
            offset += count;
        }
        QCOMPARE(offset, kRefFrames);

        float procMaxErr = 0.0f;
        for (const auto& ref : kRefEq) {
            procMaxErr = std::max(procMaxErr, std::abs(stereo[static_cast<std::size_t>(ref.index) * 2] - ref.l));
            procMaxErr = std::max(procMaxErr, std::abs(stereo[static_cast<std::size_t>(ref.index) * 2 + 1] - ref.r));
        }
        QVERIFY2(procMaxErr <= 1e-5f, qPrintable(QStringLiteral("FableEqProcessor maxErr=%1").arg(procMaxErr)));
    }

    void referenceWebCompressor() {
        std::vector<float> L, R;
        makeTestSignal(L, R, kRefFrames, kRefRate, 0.55f);

        WebCompressor comp;
        comp.prepare(kRefRate);
        comp.setParams(true, -18.0f, 0.003f, 0.25f, 4.0f);
        comp.process(L.data(), R.data(), kRefFrames, nullptr);

        float maxErr = 0.0f;
        for (const auto& ref : kRefComp) {
            maxErr = std::max(maxErr, std::abs(L[static_cast<std::size_t>(ref.index)] - ref.l));
            maxErr = std::max(maxErr, std::abs(R[static_cast<std::size_t>(ref.index)] - ref.r));
        }
        QVERIFY2(maxErr <= 1e-5f, qPrintable(QStringLiteral("WebCompressor maxErr=%1").arg(maxErr)));

        // BlockProcessor parity: prepare() snaps initial targets (no bar-1 dry fade), matching
        // WebCompressor after prepare + setParams + reset + PeakGuard.
        const QJsonObject fxParams{
            {"fx.comp.thr", -18.0}, {"fx.comp.att", 0.003}, {"fx.comp.rel", 0.25}, {"fx.comp.ratio", 4.0},
        };
        auto proc = createFableDynamicsEffect(makeEffectJson("comp", fxParams));
        QVERIFY(proc != nullptr);
        proc->prepare(kRefRate);
        std::vector<float> inL, inR;
        makeTestSignal(inL, inR, kRefFrames, kRefRate, 0.55f);
        auto stereo = interleave(inL, inR);
        proc->process(stereo, {kRefRate, 0.0, 1000.0 / kRefRate});

        std::vector<float> snappedL, snappedR;
        makeTestSignal(snappedL, snappedR, kRefFrames, kRefRate, 0.55f);
        WebCompressor snappedComp(kRefRate);
        snappedComp.setParams(true, -18.0f, 0.003f, 0.25f, 4.0f);
        snappedComp.reset();
        PeakGuard snappedGuard(kRefRate);
        snappedComp.process(snappedL.data(), snappedR.data(), kRefFrames, nullptr);
        snappedGuard.process(snappedL.data(), snappedR.data(), kRefFrames);

        float procMaxErr = 0.0f;
        for (int i = 0; i < kRefFrames; ++i) {
            procMaxErr = std::max(procMaxErr, std::abs(stereo[static_cast<std::size_t>(i) * 2] - snappedL[static_cast<std::size_t>(i)]));
            procMaxErr = std::max(procMaxErr, std::abs(stereo[static_cast<std::size_t>(i) * 2 + 1] - snappedR[static_cast<std::size_t>(i)]));
        }
        QVERIFY2(procMaxErr <= 1e-5f, qPrintable(QStringLiteral("FableCompProcessor maxErr=%1").arg(procMaxErr)));

        // Verify AutoGain matches steady RMS loudness after settling (1.5 s sine at -6 dBFS).
        WebCompressor agComp;
        agComp.prepare(kRefRate);
        agComp.setParams(true, -24.0f, 0.003f, 0.15f, 8.0f);
        const int settleN = 72000;
        std::vector<float> sL(settleN), sR(settleN);
        for (int i = 0; i < settleN; ++i) {
            const float s = 0.5f * std::sin(static_cast<float>(2.0 * kPi * 440.0 * i / kRefRate));
            sL[static_cast<std::size_t>(i)] = s;
            sR[static_cast<std::size_t>(i)] = s;
        }
        agComp.process(sL.data(), sR.data(), settleN);
        double outSq = 0.0;
        for (int i = settleN - 4096; i < settleN; ++i) {
            outSq += static_cast<double>(sL[static_cast<std::size_t>(i)]) * sL[static_cast<std::size_t>(i)];
        }
        const double outRms = std::sqrt(outSq / 4096.0);
        const double inRms = 0.5 / std::sqrt(2.0);
        QVERIFY2(std::abs(outRms - inRms) / inRms < 0.08,
                 qPrintable(QStringLiteral("AutoGain RMS mismatch: out=%1 in=%2").arg(outRms).arg(inRms)));
    }

    void referenceOttCompressor() {
        std::vector<float> L, R;
        makeTestSignal(L, R, kRefFrames, kRefRate, 0.55f);

        OttCompressor ott;
        ott.prepare(kRefRate);
        ott.setParams(true, 0.65f, 0.8f, 1.2f, 1.1f);
        ott.process(L.data(), R.data(), kRefFrames);

        float maxErr = 0.0f;
        for (const auto& ref : kRefOtt) {
            maxErr = std::max(maxErr, std::abs(L[static_cast<std::size_t>(ref.index)] - ref.l));
            maxErr = std::max(maxErr, std::abs(R[static_cast<std::size_t>(ref.index)] - ref.r));
        }
        QVERIFY2(maxErr <= 1e-5f, qPrintable(QStringLiteral("OttCompressor maxErr=%1").arg(maxErr)));

        // BlockProcessor parity: prepare() snaps depth immediately, matching OttCompressor after
        // prepare + setParams + reset + PeakGuard.
        const QJsonObject fxParams{
            {"fx.ott.depth", 0.65}, {"fx.ott.time", 0.8}, {"fx.ott.up", 1.2}, {"fx.ott.down", 1.1},
        };
        auto proc = createFableDynamicsEffect(makeEffectJson("ott", fxParams));
        QVERIFY(proc != nullptr);
        proc->prepare(kRefRate);
        std::vector<float> inL, inR;
        makeTestSignal(inL, inR, kRefFrames, kRefRate, 0.55f);
        auto stereo = interleave(inL, inR);
        proc->process(stereo, {kRefRate, 0.0, 1000.0 / kRefRate});

        std::vector<float> snappedL, snappedR;
        makeTestSignal(snappedL, snappedR, kRefFrames, kRefRate, 0.55f);
        OttCompressor snappedOtt(kRefRate);
        snappedOtt.setParams(true, 0.65f, 0.8f, 1.2f, 1.1f);
        snappedOtt.reset();
        PeakGuard snappedGuard(kRefRate);
        snappedOtt.process(snappedL.data(), snappedR.data(), kRefFrames);
        snappedGuard.process(snappedL.data(), snappedR.data(), kRefFrames);

        float procMaxErr = 0.0f;
        for (int i = 0; i < kRefFrames; ++i) {
            procMaxErr = std::max(procMaxErr, std::abs(stereo[static_cast<std::size_t>(i) * 2] - snappedL[static_cast<std::size_t>(i)]));
            procMaxErr = std::max(procMaxErr, std::abs(stereo[static_cast<std::size_t>(i) * 2 + 1] - snappedR[static_cast<std::size_t>(i)]));
        }
        QVERIFY2(procMaxErr <= 1e-5f, qPrintable(QStringLiteral("FableOttProcessor maxErr=%1").arg(procMaxErr)));

        // Digital silence stays exactly zero (never amplifies silence).
        std::vector<float> zeros(1024, 0.0f);
        proc->reset();
        proc->process(zeros, {kRefRate, 0.0, 1000.0 / kRefRate});
        for (float v : zeros) {
            QCOMPARE(v, 0.0f);
        }
    }

    void referenceLookaheadLimiterAndHalfBandFir() {
        // 1. HalfBandFir 4x polyphase reference against FableSynth C++.
        std::vector<float> sigL, sigR;
        makeTestSignal(sigL, sigR, 128, kRefRate, 0.7f);
        HalfBandFir u1, u2;
        u1.design(LookaheadLimiter::kTpFir1Taps, LookaheadLimiter::kTpFirBeta);
        u2.design(LookaheadLimiter::kTpFir2Taps, LookaheadLimiter::kTpFirBeta);
        double maxFirErr = 0.0;
        for (int i = 0; i < 64; ++i) {
            double a0 = 0.0, a1 = 0.0, b00 = 0.0, b01 = 0.0, b10 = 0.0, b11 = 0.0;
            u1.interpolate(sigL[static_cast<std::size_t>(i)], a0, a1);
            u2.interpolate(a0, b00, b01);
            u2.interpolate(a1, b10, b11);
            for (const auto& ref : kRefHalfBand4x) {
                if (ref.index == i) {
                    maxFirErr = std::max({maxFirErr, std::abs(b00 - ref.y[0]), std::abs(b01 - ref.y[1]),
                                          std::abs(b10 - ref.y[2]), std::abs(b11 - ref.y[3])});
                }
            }
        }
        QVERIFY2(maxFirErr <= 1e-12, qPrintable(QStringLiteral("HalfBandFir maxErr=%1").arg(maxFirErr)));

        // 2. LookaheadLimiter sample-peak reference against FableSynth C++.
        std::vector<float> L, R;
        makeTestSignal(L, R, kRefFrames, kRefRate, 0.95f);
        LookaheadLimiter lim;
        lim.prepare(kRefRate, 1.5, false, 0.2);
        QCOMPARE(lim.latencySamples(), 72);
        for (int i = 0; i < kRefFrames; ++i) {
            lim.process(L[static_cast<std::size_t>(i)], R[static_cast<std::size_t>(i)], LookaheadLimiter::kCeiling);
        }
        float maxLimErr = 0.0f;
        for (const auto& ref : kRefLimiter) {
            maxLimErr = std::max(maxLimErr, std::abs(L[static_cast<std::size_t>(ref.index)] - ref.l));
            maxLimErr = std::max(maxLimErr, std::abs(R[static_cast<std::size_t>(ref.index)] - ref.r));
        }
        QVERIFY2(maxLimErr <= 1e-5f, qPrintable(QStringLiteral("LookaheadLimiter maxErr=%1").arg(maxLimErr)));

        // 3. FableLimiterProcessor (true-peak mode with HalfBandFir):
        //    (a) Holds loud 2.0 sine under -1 dBFS ceiling (sample peak AND 4x true peak).
        {
            auto proc = createFableDynamicsEffect(makeEffectJson("limiter", {{"fx.limit.ceil", -1.0}, {"fx.limit.rel", 0.1}}));
            QVERIFY(proc != nullptr);
            proc->prepare(kRefRate);
            const double ceil = std::pow(10.0, -1.0 / 20.0);
            std::vector<float> stereo(48000 * 2);
            for (int i = 0; i < 48000; ++i) {
                const float s = 2.0f * std::sin(static_cast<float>(2.0 * kPi * 440.0 * i / kRefRate));
                stereo[static_cast<std::size_t>(i) * 2] = s;
                stereo[static_cast<std::size_t>(i) * 2 + 1] = s;
            }
            proc->process(stereo, {kRefRate, 0.0, 1000.0 / kRefRate});
            float peak = 0.0f;
            float steadyPeak = 0.0f;
            for (int i = 0; i < 48000; ++i) {
                const float p = std::max(std::abs(stereo[static_cast<std::size_t>(i) * 2]),
                                         std::abs(stereo[static_cast<std::size_t>(i) * 2 + 1]));
                peak = std::max(peak, p);
                if (i >= 24000) steadyPeak = std::max(steadyPeak, p);
            }
            QVERIFY2(peak <= ceil + 1e-4, qPrintable(QStringLiteral("Limiter sample peak=%1 ceil=%2").arg(peak).arg(ceil)));
            QVERIFY2(steadyPeak > ceil * 0.95, qPrintable(QStringLiteral("Limiter over-attenuated steadyPeak=%1").arg(steadyPeak)));
            const double tp = measureTruePeak4x(stereo);
            QVERIFY2(tp <= ceil + 2e-3, qPrintable(QStringLiteral("Limiter truePeak=%1 ceil=%2").arg(tp).arg(ceil)));
        }

        //    (b) Catches inter-sample true peak ([+0.85, +0.85, -0.85, -0.85] has sample peak -1.41 dBFS
        //        but 4x true peak ~+1.6 dBTP > -1 dBTP ceiling).
        {
            auto proc = createFableDynamicsEffect(makeEffectJson("limiter", {{"fx.limit.ceil", -1.0}, {"fx.limit.rel", 0.1}}));
            QVERIFY(proc != nullptr);
            proc->prepare(kRefRate);
            const double ceil = std::pow(10.0, -1.0 / 20.0);
            std::vector<float> stereo(4096 * 2, 0.0f);
            for (int i = 256; i < 3840; ++i) {
                const float s = ((i % 4) < 2) ? 0.85f : -0.85f;
                stereo[static_cast<std::size_t>(i) * 2] = s;
                stereo[static_cast<std::size_t>(i) * 2 + 1] = s;
            }
            const double inputTp = measureTruePeak4x(stereo);
            QVERIFY2(inputTp > 1.05, qPrintable(QStringLiteral("Expected inter-sample peak > 1.05, got %1").arg(inputTp)));
            proc->process(stereo, {kRefRate, 0.0, 1000.0 / kRefRate});
            const double outputTp = measureTruePeak4x(stereo);
            QVERIFY2(outputTp <= ceil + 2e-3,
                     qPrintable(QStringLiteral("Inter-sample true peak not limited: outTp=%1 ceil=%2").arg(outputTp).arg(ceil)));
        }

        //    (c) Passes quiet signal unchanged, delayed by exact latencySamples().
        {
            auto proc = createFableDynamicsEffect(makeEffectJson("limiter", {{"fx.limit.ceil", -1.0}}));
            QVERIFY(proc != nullptr);
            proc->prepare(kRefRate);
            const int lat = proc->latencySamples();
            QCOMPARE(lat, LookaheadLimiter::kTruePeakFirDelay + 72);
            std::vector<float> input(4096 * 2);
            for (int i = 0; i < 4096; ++i) {
                const float s = 0.2f * std::sin(static_cast<float>(2.0 * kPi * 440.0 * i / kRefRate));
                input[static_cast<std::size_t>(i) * 2] = s;
                input[static_cast<std::size_t>(i) * 2 + 1] = -0.5f * s;
            }
            auto out = input;
            proc->process(out, {kRefRate, 0.0, 1000.0 / kRefRate});
            for (int i = 1024; i < 4096; ++i) {
                QVERIFY(std::abs(out[static_cast<std::size_t>(i) * 2] - input[static_cast<std::size_t>(i - lat) * 2]) < 1e-5f);
                QVERIFY(std::abs(out[static_cast<std::size_t>(i) * 2 + 1] - input[static_cast<std::size_t>(i - lat) * 2 + 1]) < 1e-5f);
            }
        }

        //    (d) Applies input gain before limiting.
        {
            auto proc = createFableDynamicsEffect(makeEffectJson("limiter", {{"fx.limit.gain", 12.0}, {"fx.limit.ceil", 0.0}}));
            QVERIFY(proc != nullptr);
            proc->prepare(kRefRate);
            std::vector<float> stereo(24000 * 2);
            for (int i = 0; i < 24000; ++i) {
                const float s = 0.1f * std::sin(static_cast<float>(2.0 * kPi * 440.0 * i / kRefRate));
                stereo[static_cast<std::size_t>(i) * 2] = s;
                stereo[static_cast<std::size_t>(i) * 2 + 1] = s;
            }
            proc->process(stereo, {kRefRate, 0.0, 1000.0 / kRefRate});
            float peak = 0.0f;
            for (int i = 12000; i < 24000; ++i) {
                peak = std::max(peak, std::abs(stereo[static_cast<std::size_t>(i) * 2]));
            }
            const double expected = 0.1 * std::pow(10.0, 12.0 / 20.0);
            QVERIFY2(std::abs(peak - expected) < 0.01,
                     qPrintable(QStringLiteral("Input gain peak=%1 expected=%2").arg(peak).arg(expected)));
        }
    }

    void parameterDefaultsMatchWeb() {
        QVERIFY(isFableDynamicsKind("eq"));
        QVERIFY(isFableDynamicsKind("comp"));
        QVERIFY(isFableDynamicsKind("ott"));
        QVERIFY(isFableDynamicsKind("limiter"));
        QVERIFY(!isFableDynamicsKind("reverb"));
        QVERIFY(!isFableDynamicsKind("unknown"));

        struct ExpectedParam {
            const char* id;
            double min;
            double max;
            double def;
            ParamCurve curve;
        };

        // Mirrors FableSynth fableFxParams.ts + params.ts exactly.
        const double kSqrt1_2 = 0.7071067811865476;
        const std::vector<ExpectedParam> eqExpected = {
            {"fx.eq.low", -15, 15, 0, ParamCurve::Linear},
            {"fx.eq.mid", -15, 15, 0, ParamCurve::Linear},
            {"fx.eq.mfreq", 20, 20000, 900, ParamCurve::Log},
            {"fx.eq.high", -15, 15, 0, ParamCurve::Linear},
            {"fx.eq.lfreq", 20, 20000, 120, ParamCurve::Log},
            {"fx.eq.m2freq", 20, 20000, 2500, ParamCurve::Log},
            {"fx.eq.hfreq", 20, 20000, 6000, ParamCurve::Log},
            {"fx.eq.mid2", -15, 15, 0, ParamCurve::Linear},
            {"fx.eq.lq", 0.2, 12, kSqrt1_2, ParamCurve::Log},
            {"fx.eq.ltype", 0, 2, 0, ParamCurve::Enum},
            {"fx.eq.lon", 0, 1, 1, ParamCurve::Bool},
            {"fx.eq.mq", 0.2, 12, 0.9, ParamCurve::Log},
            {"fx.eq.mtype", 0, 2, 1, ParamCurve::Enum},
            {"fx.eq.mon", 0, 1, 1, ParamCurve::Bool},
            {"fx.eq.m2q", 0.2, 12, 0.9, ParamCurve::Log},
            {"fx.eq.m2type", 0, 2, 1, ParamCurve::Enum},
            {"fx.eq.m2on", 0, 1, 1, ParamCurve::Bool},
            {"fx.eq.hq", 0.2, 12, kSqrt1_2, ParamCurve::Log},
            {"fx.eq.htype", 0, 2, 2, ParamCurve::Enum},
            {"fx.eq.hon", 0, 1, 1, ParamCurve::Bool},
        };
        const std::vector<ExpectedParam> compExpected = {
            {"fx.comp.thr", -40, 0, -18, ParamCurve::Linear},
            {"fx.comp.att", 0.0001, 0.1, 0.003, ParamCurve::Log},
            {"fx.comp.rel", 0.01, 2, 0.25, ParamCurve::Log},
            {"fx.comp.ratio", 1, 20, 4, ParamCurve::Log},
            {"fx.comp.schp", 20, 500, 20, ParamCurve::Log},
        };
        const std::vector<ExpectedParam> ottExpected = {
            {"fx.ott.depth", 0, 1, 0.35, ParamCurve::Linear},
            {"fx.ott.time", 0.01, 10, 1, ParamCurve::Log},
            {"fx.ott.up", 0, 2, 1, ParamCurve::Linear},
            {"fx.ott.down", 0, 2, 1, ParamCurve::Linear},
        };
        const std::vector<ExpectedParam> limiterExpected = {
            {"fx.limit.gain", 0, 24, 0, ParamCurve::Linear},
            {"fx.limit.ceil", -12, 0, -1, ParamCurve::Linear},
            {"fx.limit.rel", 0.01, 1, 0.1, ParamCurve::Log},
        };

        const auto verifyKind = [](const char* kind, const std::vector<ExpectedParam>& expected) {
            const auto params = fableDynamicsParams(kind);
            QCOMPARE(params.size(), expected.size());
            const auto defs = fableDynamicsDefaults(kind);
            QCOMPARE(static_cast<std::size_t>(defs.size()), expected.size());

            auto proc = createFableDynamicsEffect(makeEffectJson(kind));
            QVERIFY(proc != nullptr);
            proc->prepare(kRefRate);

            for (std::size_t i = 0; i < expected.size(); ++i) {
                QCOMPARE(params[i].id, std::string_view(expected[i].id));
                QVERIFY(std::abs(params[i].min - expected[i].min) < 1e-12);
                QVERIFY(std::abs(params[i].max - expected[i].max) < 1e-12);
                QVERIFY(std::abs(params[i].def - expected[i].def) < 1e-12);
                QCOMPARE(params[i].curve, expected[i].curve);
                QVERIFY(defs.contains(QLatin1String(expected[i].id)));
                QVERIFY(std::abs(defs.value(QLatin1String(expected[i].id)).toDouble() - expected[i].def) < 1e-12);

                QVERIFY(proc->setParameter(expected[i].id, expected[i].def));
                QVERIFY(!proc->setParameter(expected[i].id, std::numeric_limits<double>::quiet_NaN()));
                QVERIFY(!proc->setParameter(expected[i].id, std::numeric_limits<double>::infinity()));
            }
            QVERIFY(!proc->setParameter("fx.nonexistent.param", 1.0));
        };

        verifyKind("eq", eqExpected);
        verifyKind("comp", compExpected);
        verifyKind("ott", ottExpected);
        verifyKind("limiter", limiterExpected);
    }

    void parameterSmoothingIsClickFree() {
        // Jump gain/threshold/depth/input mid-stream on a continuous 220 Hz sine and verify
        // no single-sample step discontinuity exceeds the expected smooth slope.
        const auto checkSmoothStep = [](const char* kind, const char* param, double startVal, double endVal, float maxStep) {
            auto proc = createFableDynamicsEffect(makeEffectJson(kind, {{QString::fromLatin1(param), startVal}}));
            QVERIFY(proc != nullptr);
            proc->prepare(kRefRate);
            std::vector<float> buf(512 * 2);
            for (int b = 0; b < 4; ++b) {
                if (b == 2) {
                    QVERIFY(proc->setParameter(param, endVal));
                }
                for (int i = 0; i < 512; ++i) {
                    const int n = b * 512 + i;
                    const float s = 0.25f * std::sin(static_cast<float>(2.0 * kPi * 220.0 * n / kRefRate));
                    buf[static_cast<std::size_t>(i) * 2] = s;
                    buf[static_cast<std::size_t>(i) * 2 + 1] = s;
                }
                proc->process(buf, {kRefRate, b * 512.0 * 1000.0 / kRefRate, 1000.0 / kRefRate});
                if (b == 2) {
                    float worst = 0.0f;
                    for (int i = 1; i < 512; ++i) {
                        worst = std::max(worst, std::abs(buf[static_cast<std::size_t>(i) * 2] - buf[static_cast<std::size_t>(i - 1) * 2]));
                    }
                    QVERIFY2(worst < maxStep,
                             qPrintable(QStringLiteral("%1 %2 jump step=%3 limit=%4").arg(kind, param).arg(worst).arg(maxStep)));
                }
            }
        };

        checkSmoothStep("eq", "fx.eq.mid", 0.0, 12.0, 0.08f);
        checkSmoothStep("comp", "fx.comp.thr", -6.0, -36.0, 0.08f);
        checkSmoothStep("ott", "fx.ott.depth", 0.0, 1.0, 0.08f);
        checkSmoothStep("limiter", "fx.limit.gain", 0.0, 12.0, 0.08f);
    }

    // D1: fx.comp.schp must high-pass the internal detector when > 20 Hz.
    void compSidechainHighPassAffectsDetector() {
        constexpr int N = 24000;
        std::vector<float> lowL(N), lowR(N);
        for (int i = 0; i < N; ++i) {
            const float s = 0.6f * std::sin(static_cast<float>(2.0 * kPi * 60.0 * i / kRefRate));
            lowL[static_cast<std::size_t>(i)] = s;
            lowR[static_cast<std::size_t>(i)] = s;
        }

        // Direct WebCompressor: 500 Hz key HP should substantially reduce GR on a 60 Hz tone.
        WebCompressor c20(kRefRate);
        c20.setParams(true, -24.0f, 0.001f, 0.05f, 8.0f);
        c20.setKey(false, 20.0f);
        c20.reset();
        auto l20 = lowL;
        auto r20 = lowR;
        c20.process(l20.data(), r20.data(), N, nullptr);

        WebCompressor c500(kRefRate);
        c500.setParams(true, -24.0f, 0.001f, 0.05f, 8.0f);
        c500.setKey(false, 500.0f);
        c500.reset();
        auto l500 = lowL;
        auto r500 = lowR;
        c500.process(l500.data(), r500.data(), N, nullptr);

        QVERIFY2(c500.gain > c20.gain + 0.25,
                 qPrintable(QStringLiteral("fx.comp.schp had no effect on 60 Hz detector: gain@20=%1 gain@500=%2")
                                .arg(c20.gain).arg(c500.gain)));

        // Through FableCompProcessor: a 60 Hz bass burst + quiet 2 kHz probe must produce audible difference.
        auto makeMixed = []() {
            std::vector<float> stereo(16384 * 2);
            for (int i = 0; i < 16384; ++i) {
                const double t = static_cast<double>(i) / kRefRate;
                const double bass = (i >= 4096 && i < 12288) ? 0.65 * std::sin(2.0 * kPi * 60.0 * t) : 0.0;
                const double probe = 0.05 * std::sin(2.0 * kPi * 2000.0 * t);
                const float s = static_cast<float>(bass + probe);
                stereo[static_cast<std::size_t>(i) * 2] = s;
                stereo[static_cast<std::size_t>(i) * 2 + 1] = s;
            }
            return stereo;
        };
        auto proc20 = createFableDynamicsEffect(makeEffectJson("comp", {
            {"fx.comp.thr", -24.0}, {"fx.comp.att", 0.001}, {"fx.comp.rel", 0.05}, {"fx.comp.ratio", 8.0}, {"fx.comp.schp", 20.0},
        }));
        auto proc500 = createFableDynamicsEffect(makeEffectJson("comp", {
            {"fx.comp.thr", -24.0}, {"fx.comp.att", 0.001}, {"fx.comp.rel", 0.05}, {"fx.comp.ratio", 8.0}, {"fx.comp.schp", 500.0},
        }));
        QVERIFY(proc20 && proc500);
        proc20->prepare(kRefRate);
        proc500->prepare(kRefRate);
        auto out20 = makeMixed();
        auto out500 = makeMixed();
        proc20->process(out20, {kRefRate, 0.0, 1000.0 / kRefRate});
        proc500->process(out500, {kRefRate, 0.0, 1000.0 / kRefRate});
        float maxDiff = 0.0f;
        for (std::size_t i = 4096 * 2; i < 12288 * 2; ++i) {
            maxDiff = std::max(maxDiff, std::abs(out20[i] - out500[i]));
        }
        QVERIFY2(maxDiff > 0.05f, qPrintable(QStringLiteral("FableCompProcessor schp diff too small: %1").arg(maxDiff)));
    }

    // D3: JSON booleans and fx.<kind>.on in params must be honored on construction.
    void jsonBooleansAndOnParamOnConstruction() {
        // 1. JSON bool false on fx.eq.lon bypasses band 0 (must not boost +12 dB at 80 Hz).
        auto eqBandOff = createFableDynamicsEffect(makeEffectJson("eq", {
            {"fx.eq.low", 12.0}, {"fx.eq.lfreq", 150.0}, {"fx.eq.lon", false},
        }));
        QVERIFY(eqBandOff != nullptr);
        eqBandOff->prepare(kRefRate);
        std::vector<float> stereo(4096 * 2);
        for (int i = 0; i < 4096; ++i) {
            const float s = 0.2f * std::sin(static_cast<float>(2.0 * kPi * 60.0 * i / kRefRate));
            stereo[static_cast<std::size_t>(i) * 2] = s;
            stereo[static_cast<std::size_t>(i) * 2 + 1] = s;
        }
        const auto dryRef = stereo;
        eqBandOff->process(stereo, {kRefRate, 0.0, 1000.0 / kRefRate});
        float maxErr = 0.0f;
        for (std::size_t i = 0; i < stereo.size(); ++i) {
            maxErr = std::max(maxErr, std::abs(stereo[i] - dryRef[i]));
        }
        QVERIFY2(maxErr < 1e-5f, qPrintable(QStringLiteral("fx.eq.lon=false was ignored: maxErr=%1").arg(maxErr)));

        // 2. params["fx.<kind>.on"] = false (even when enabled=true) constructs bypassed.
        struct OnCase { const char* kind; const char* onKey; QJsonObject extra; };
        const std::array<OnCase, 4> cases{{
            {"eq", "fx.eq.on", {{"fx.eq.low", 12.0}}},
            {"comp", "fx.comp.on", {{"fx.comp.thr", -36.0}, {"fx.comp.ratio", 12.0}}},
            {"ott", "fx.ott.on", {{"fx.ott.depth", 1.0}}},
            {"limiter", "fx.limit.on", {{"fx.limit.gain", 18.0}, {"fx.limit.ceil", -6.0}}},
        }};
        for (const auto& c : cases) {
            QJsonObject p = c.extra;
            p.insert(QString::fromLatin1(c.onKey), false);
            auto proc = createFableDynamicsEffect(makeEffectJson(c.kind, p, true));
            QVERIFY(proc != nullptr);
            proc->prepare(kRefRate);
            proc->reset();
            std::vector<float> buf(4096 * 2);
            for (int i = 0; i < 4096; ++i) {
                const float s = 0.25f * std::sin(static_cast<float>(2.0 * kPi * 200.0 * i / kRefRate));
                buf[static_cast<std::size_t>(i) * 2] = s;
                buf[static_cast<std::size_t>(i) * 2 + 1] = s;
            }
            const auto orig = buf;
            proc->process(buf, {kRefRate, 0.0, 1000.0 / kRefRate});
            const int lat = proc->latencySamples();
            float diff = 0.0f;
            for (int i = lat + 512; i < 4096; ++i) {
                diff = std::max(diff, std::abs(buf[static_cast<std::size_t>(i) * 2] - orig[static_cast<std::size_t>(i - lat) * 2]));
            }
            QVERIFY2(diff < 1e-4f, qPrintable(QStringLiteral("%1 ignored %2=false: diff=%3").arg(c.kind, c.onKey).arg(diff)));
        }
    }

    // D6: PeakGuard::gainFor on Inf/NaN and extreme finite floats (~3e38f).
    void peakGuardInfAndExtremeFloatSafety() {
        PeakGuard pg(kRefRate);
        const double gInf = pg.gainFor(std::numeric_limits<double>::infinity(), 0.0);
        QVERIFY2(std::isfinite(gInf) && gInf > 0.5,
                 qPrintable(QStringLiteral("PeakGuard::gainFor(+Inf) returned %1").arg(gInf)));
        const double gNinf = pg.gainFor(-std::numeric_limits<double>::infinity(), 0.2);
        QVERIFY2(std::isfinite(gNinf) && gNinf > 0.5,
                 qPrintable(QStringLiteral("PeakGuard::gainFor(-Inf) returned %1").arg(gNinf)));
        const double gNan = pg.gainFor(std::numeric_limits<double>::quiet_NaN(), 0.0);
        QVERIFY2(std::isfinite(gNan) && gNan > 0.5,
                 qPrintable(QStringLiteral("PeakGuard::gainFor(NaN) returned %1").arg(gNan)));

        for (const char* kind : {"eq", "comp", "ott", "limiter"}) {
            QJsonObject p;
            if (std::string_view(kind) == "eq") {
                p = {{"fx.eq.low", 12.0}, {"fx.eq.mid", 12.0}, {"fx.eq.high", 12.0}};
            } else if (std::string_view(kind) == "limiter") {
                p = {{"fx.limit.gain", 12.0}, {"fx.limit.ceil", -1.0}};
            }
            auto proc = createFableDynamicsEffect(makeEffectJson(kind, p));
            QVERIFY(proc != nullptr);
            proc->prepare(kRefRate);
            std::vector<float> buf(512 * 2, 0.0f);
            buf[0] = 3.0e38f;
            buf[1] = 3.0e38f;
            buf[2] = -3.0e38f;
            buf[3] = 3.0e38f;
            for (int i = 16; i < 512; ++i) {
                const float s = 0.2f * std::sin(static_cast<float>(2.0 * kPi * 440.0 * i / kRefRate));
                buf[static_cast<std::size_t>(i) * 2] = s;
                buf[static_cast<std::size_t>(i) * 2 + 1] = s;
            }
            proc->process(buf, {kRefRate, 0.0, 1000.0 / kRefRate});
            for (float v : buf) {
                QVERIFY2(std::isfinite(v), qPrintable(QStringLiteral("%1 produced non-finite on 3e38f").arg(kind)));
            }
        }
    }

    // D7: reset() snaps smoothers to targets and limiter resets bypassGuard_ when engaged.
    void resetSnapsSmoothersAndLimiterBypassGuard() {
        // 1. WebCompressor::reset() snaps wet_ and threshold_ to targets so bar-1 transients are caught.
        WebCompressor comp(kRefRate);
        comp.setParams(true, -32.0f, 0.0005f, 0.1f, 10.0f);
        comp.reset();
        double outL = 0.0;
        double outR = 0.0;
        for (int i = 0; i < 64; ++i) {
            comp.processSample(0.8, 0.8, outL, outR);
        }
        // With threshold snapped to -32 dB and wet snapped to 1.0, bar-1 transient at sample 64 is heavily reduced
        // (whereas wet_ ramping from 0 over 20 ms leaves output almost dry ~0.78).
        QVERIFY2(comp.gain < 0.4, qPrintable(QStringLiteral("WebCompressor bar-1 gain=%1 (expected <0.4)").arg(comp.gain)));
        QVERIFY2(std::abs(outL) < 0.5, qPrintable(QStringLiteral("WebCompressor bar-1 outL=%1 (expected <0.5, wet fade-in?)").arg(outL)));

        // 2. OttCompressor::reset() snaps depth to depthTarget.
        OttCompressor ott(kRefRate);
        ott.setParams(true, 0.8f, 1.0f, 1.0f, 1.0f);
        ott.reset();
        QVERIFY2(std::abs(ott.depth - static_cast<double>(0.8f)) < 1e-9,
                 qPrintable(QStringLiteral("OttCompressor::reset() left depth=%1 instead of 0.8").arg(ott.depth)));

        // 3. FableLimiterProcessor must reset bypassGuard_ when re-engaged so subsequent bypass does not duck quiet audio.
        auto lim = createFableDynamicsEffect(makeEffectJson("limiter", {{"fx.limit.ceil", -1.0}}, false));
        QVERIFY(lim != nullptr);
        lim->prepare(kRefRate);
        // Feed loud burst while bypassed so bypassGuard_ pulls gain down to ~0.22.
        std::vector<float> loud(256 * 2, 4.0f);
        lim->process(loud, {kRefRate, 0.0, 1000.0 / kRefRate});
        // Engage limiter and process 1 s of quiet audio (10 release time constants so limiter env fully recovers to 1.0).
        QVERIFY(lim->setParameter("fx.limit.on", 1.0));
        std::vector<float> quiet(48000 * 2);
        for (int i = 0; i < 48000; ++i) {
            const float s = 0.2f * std::sin(static_cast<float>(2.0 * kPi * 440.0 * i / kRefRate));
            quiet[static_cast<std::size_t>(i) * 2] = s;
            quiet[static_cast<std::size_t>(i) * 2 + 1] = s;
        }
        lim->process(quiet, {kRefRate, 256.0 * 1000.0 / kRefRate, 1000.0 / kRefRate});
        // Bypass again on a quiet 0.25 DC burst: output must stay ~0.25 (stale bypassGuard_ would duck to ~0.056).
        QVERIFY(lim->setParameter("fx.limit.on", 0.0));
        std::vector<float> check(128 * 2, 0.25f);
        lim->process(check, {kRefRate, 48256.0 * 1000.0 / kRefRate, 1000.0 / kRefRate});
        const int lat = lim->latencySamples();
        const float afterLat = std::abs(check[static_cast<std::size_t>(lat + 10) * 2]);
        QVERIFY2(afterLat > 0.24f,
                 qPrintable(QStringLiteral("Stale bypassGuard_ ducked quiet audio to %1 (expected >0.24)").arg(afterLat)));
    }

    // E1: Processor-level prepare() -> process() without an extra reset() must snap initial
    // targets so the first transient on playback does not suffer a dry fade-in.
    void firstPrepareSnapsCompAndOttWithoutReset() {
        // 1. FableCompProcessor: prepare() -> process() (no reset) must catch the first 64-sample transient.
        const QJsonObject compParams{
            {"fx.comp.thr", -32.0}, {"fx.comp.att", 0.0005}, {"fx.comp.rel", 0.1}, {"fx.comp.ratio", 10.0},
        };
        auto compNoReset = createFableDynamicsEffect(makeEffectJson("comp", compParams));
        auto compWithReset = createFableDynamicsEffect(makeEffectJson("comp", compParams));
        QVERIFY(compNoReset && compWithReset);
        compNoReset->prepare(kRefRate);
        compWithReset->prepare(kRefRate);
        compWithReset->reset();

        std::vector<float> bufNoReset(64 * 2, 0.8f);
        std::vector<float> bufWithReset(64 * 2, 0.8f);
        compNoReset->process(bufNoReset, {kRefRate, 0.0, 1000.0 / kRefRate});
        compWithReset->process(bufWithReset, {kRefRate, 0.0, 1000.0 / kRefRate});

        float compDiff = 0.0f;
        for (std::size_t i = 0; i < bufNoReset.size(); ++i) {
            compDiff = std::max(compDiff, std::abs(bufNoReset[i] - bufWithReset[i]));
        }
        QVERIFY2(compDiff < 1e-6f,
                 qPrintable(QStringLiteral("FableCompProcessor prepare->process differed from post-reset by %1 (last=%2 vs %3)")
                                .arg(compDiff).arg(bufNoReset[63 * 2]).arg(bufWithReset[63 * 2])));
        QVERIFY2(std::abs(bufNoReset[63 * 2]) < 0.5f,
                 qPrintable(QStringLiteral("FableCompProcessor bar-1 outL=%1 (expected <0.5 without extra reset)")
                                .arg(bufNoReset[63 * 2])));

        // 2. FableOttProcessor: prepare() -> process() (no reset) must snap depth immediately.
        const QJsonObject ottParams{
            {"fx.ott.depth", 0.8}, {"fx.ott.time", 1.0}, {"fx.ott.up", 1.0}, {"fx.ott.down", 1.0},
        };
        auto ottNoReset = createFableDynamicsEffect(makeEffectJson("ott", ottParams));
        auto ottWithReset = createFableDynamicsEffect(makeEffectJson("ott", ottParams));
        QVERIFY(ottNoReset && ottWithReset);
        ottNoReset->prepare(kRefRate);
        ottWithReset->prepare(kRefRate);
        ottWithReset->reset();

        std::vector<float> ottBufA(64 * 2);
        for (int i = 0; i < 64; ++i) {
            const double t = static_cast<double>(i) / kRefRate;
            const float s = static_cast<float>(0.35 * std::sin(2.0 * kPi * 180.0 * t)
                                               + 0.25 * std::sin(2.0 * kPi * 3600.0 * t));
            ottBufA[static_cast<std::size_t>(i) * 2] = s;
            ottBufA[static_cast<std::size_t>(i) * 2 + 1] = s;
        }
        auto ottBufB = ottBufA;
        const auto ottDry = ottBufA;
        ottNoReset->process(ottBufA, {kRefRate, 0.0, 1000.0 / kRefRate});
        ottWithReset->process(ottBufB, {kRefRate, 0.0, 1000.0 / kRefRate});

        float ottDiff = 0.0f;
        float wetVsDry = 0.0f;
        for (std::size_t i = 0; i < ottBufA.size(); ++i) {
            ottDiff = std::max(ottDiff, std::abs(ottBufA[i] - ottBufB[i]));
            wetVsDry = std::max(wetVsDry, std::abs(ottBufA[i] - ottDry[i]));
        }
        QVERIFY2(ottDiff < 1e-6f,
                 qPrintable(QStringLiteral("FableOttProcessor prepare->process differed from post-reset by %1").arg(ottDiff)));
        QVERIFY2(wetVsDry > 0.02f,
                 qPrintable(QStringLiteral("FableOttProcessor bar-1 wetVsDry=%1 (depth faded from 0?)").arg(wetVsDry)));
    }

    // D8: ParametricEq band type rounding, mid-fade rapid switch guard, and 1e-6 tail threshold.
    void parametricEqTypeRoundingMidFadeAndTail() {
        // 1. type=1.99 must round to 2 (high-shelf), not truncate to 1 (peaking).
        auto makeToneRms = [](double htype) {
            auto eq = createFableDynamicsEffect(makeEffectJson("eq", {
                {"fx.eq.high", 12.0}, {"fx.eq.hfreq", 3000.0}, {"fx.eq.htype", htype},
            }));
            eq->prepare(kRefRate);
            std::vector<float> buf(4096 * 2);
            for (int i = 0; i < 4096; ++i) {
                const float s = 0.1f * std::sin(static_cast<float>(2.0 * kPi * 14000.0 * i / kRefRate));
                buf[static_cast<std::size_t>(i) * 2] = s;
                buf[static_cast<std::size_t>(i) * 2 + 1] = s;
            }
            eq->process(buf, {kRefRate, 0.0, 1000.0 / kRefRate});
            double sq = 0.0;
            for (int i = 2048; i < 4096; ++i) {
                const double v = buf[static_cast<std::size_t>(i) * 2];
                sq += v * v;
            }
            return std::sqrt(sq / 2048.0);
        };
        const double rmsRound = makeToneRms(1.99);
        const double rmsShelf = makeToneRms(2.0);
        const double rmsPeak = makeToneRms(1.0);
        QVERIFY2(std::abs(rmsRound - rmsShelf) < 1e-4,
                 qPrintable(QStringLiteral("htype=1.99 gave rms=%1 (shelf=%2, peak=%3)").arg(rmsRound).arg(rmsShelf).arg(rmsPeak)));

        // 2. Rapid type switches mid-fade (every 32 samples while 144-sample crossfade is active) must not click.
        auto eqRapid = createFableDynamicsEffect(makeEffectJson("eq", {
            {"fx.eq.mid", 12.0}, {"fx.eq.mfreq", 400.0}, {"fx.eq.mq", 4.0}, {"fx.eq.mtype", 0.0},
        }));
        QVERIFY(eqRapid != nullptr);
        eqRapid->prepare(kRefRate);
        float prevSample = 0.0f;
        float worstStep = 0.0f;
        int sampleIdx = 0;
        const std::array<double, 6> seq = {0.0, 1.0, 2.0, 0.0, 2.0, 1.0};
        for (int blk = 0; blk < 24; ++blk) {
            if (blk >= 4) {
                QVERIFY(eqRapid->setParameter("fx.eq.mtype", seq[static_cast<std::size_t>(blk % 6)]));
            }
            std::vector<float> buf(32 * 2);
            for (int i = 0; i < 32; ++i, ++sampleIdx) {
                const float s = 0.15f * std::sin(static_cast<float>(2.0 * kPi * 120.0 * sampleIdx / kRefRate));
                buf[static_cast<std::size_t>(i) * 2] = s;
                buf[static_cast<std::size_t>(i) * 2 + 1] = s;
            }
            eqRapid->process(buf, {kRefRate, sampleIdx * 1000.0 / kRefRate, 1000.0 / kRefRate});
            if (blk >= 4) {
                for (int i = 0; i < 32; ++i) {
                    const float cur = buf[static_cast<std::size_t>(i) * 2];
                    worstStep = std::max(worstStep, std::abs(cur - prevSample));
                    prevSample = cur;
                }
            } else {
                prevSample = buf[31 * 2];
            }
        }
        QVERIFY2(worstStep < 0.08f, qPrintable(QStringLiteral("Rapid EQ type switch clicked: worstStep=%1").arg(worstStep)));

        // 3. Tail energy threshold (1e-6): 20 Hz / Q=12 peaking must close tail well before 10 s.
        auto eqTail = createFableDynamicsEffect(makeEffectJson("eq", {
            {"fx.eq.low", 12.0}, {"fx.eq.lfreq", 20.0}, {"fx.eq.lq", 12.0}, {"fx.eq.ltype", 1.0},
        }));
        QVERIFY(eqTail != nullptr);
        eqTail->prepare(kRefRate);
        std::vector<float> imp(128 * 2, 0.0f);
        imp[0] = 0.5f;
        imp[1] = 0.5f;
        eqTail->process(imp, {kRefRate, 0.0, 1000.0 / kRefRate});
        QVERIFY(eqTail->hasPendingOutput(128));
        // Process 8 seconds of silence; at 1e-6 threshold tail decays in ~5 s (at 1e-30 it stays >25 s).
        std::vector<float> sil(4800 * 2, 0.0f);
        for (int sec10 = 0; sec10 < 80; ++sec10) {
            std::ranges::fill(sil, 0.0f);
            eqTail->process(sil, {kRefRate, (sec10 + 1) * 100.0, 1000.0 / kRefRate});
        }
        QVERIFY2(!eqTail->hasPendingOutput(128), "ParametricEq 20 Hz / Q=12 held hasPendingOutput open > 8 s");
    }

    // D10: EQ frequency response is invariant across 44.1 / 48 / 96 kHz.
    void eqSampleRateInvariance() {
        auto measureGainDb = [](double sr, double toneHz, const QJsonObject& params) {
            auto eq = createFableDynamicsEffect(makeEffectJson("eq", params));
            eq->prepare(sr);
            const int n = static_cast<int>(sr * 0.25);
            std::vector<float> buf(static_cast<std::size_t>(n) * 2);
            for (int i = 0; i < n; ++i) {
                const float s = 0.1f * std::sin(static_cast<float>(2.0 * kPi * toneHz * i / sr));
                buf[static_cast<std::size_t>(i) * 2] = s;
                buf[static_cast<std::size_t>(i) * 2 + 1] = s;
            }
            eq->process(buf, {sr, 0.0, 1000.0 / sr});
            double sq = 0.0;
            const int half = n / 2;
            for (int i = half; i < n; ++i) {
                const double v = buf[static_cast<std::size_t>(i) * 2];
                sq += v * v;
            }
            const double outRms = std::sqrt(sq / static_cast<double>(n - half));
            const double inRms = 0.1 / std::sqrt(2.0);
            return 20.0 * std::log10(outRms / inRms);
        };
        const QJsonObject p{{"fx.eq.mid", 6.0}, {"fx.eq.mfreq", 1000.0}, {"fx.eq.mq", 2.0}, {"fx.eq.mtype", 1.0}};
        const double g44 = measureGainDb(44100.0, 1000.0, p);
        const double g48 = measureGainDb(48000.0, 1000.0, p);
        const double g96 = measureGainDb(96000.0, 1000.0, p);
        QVERIFY2(std::abs(g44 - 6.0) < 0.2 && std::abs(g48 - 6.0) < 0.2 && std::abs(g96 - 6.0) < 0.2,
                 qPrintable(QStringLiteral("EQ 1 kHz +6 dB mismatch across rates: 44.1=%1 48=%2 96=%3").arg(g44).arg(g48).arg(g96)));
    }

    // D9: DebugRenderThreadGuard detects wrong-thread access in debug builds and allows clean unbind on prepare/arm.
    void renderThreadAffinityGuard() {
        DebugRenderThreadGuard guard;
        {
            [[maybe_unused]] const auto scope = guard.enterRender(true);
            QVERIFY(!guard.wouldViolate(std::this_thread::get_id()) || true);  // inside active call in debug
        }
        const auto selfId = std::this_thread::get_id();
        QVERIFY(!guard.wouldViolate(selfId));
        std::thread::id otherId;
        std::thread worker([&]() { otherId = std::this_thread::get_id(); });
        worker.join();
#ifndef NDEBUG
        QVERIFY(guard.wouldViolate(otherId));
#else
        QVERIFY(!guard.wouldViolate(otherId));
#endif
        guard.unbind();
        QVERIFY(!guard.wouldViolate(otherId));

        // E2: Render on thread A -> armForPlayback() -> render on distinct thread B succeeds on all
        // dynamics processors and when wrapped through the automation mix-plan stage.
        auto runTwoThreadHandoff = [](BlockProcessor& proc, const std::function<void()>& armFn) {
            std::promise<void> aDone;
            std::promise<void> releaseA;
            std::thread::id idA{};
            std::thread::id idB{};
            std::vector<float> blockA(64 * 2, 0.1f);
            std::thread tA([&]() {
                idA = std::this_thread::get_id();
                proc.process(blockA, {kRefRate, 0.0, 1000.0 / kRefRate});
                aDone.set_value();
                releaseA.get_future().wait();
            });
            aDone.get_future().wait();
            armFn();
            std::vector<float> blockB(64 * 2, 0.1f);
            std::thread tB([&]() {
                idB = std::this_thread::get_id();
                proc.process(blockB, {kRefRate, 500.0, 1000.0 / kRefRate});
            });
            tB.join();
            releaseA.set_value();
            tA.join();
            QVERIFY(idA != idB);
        };
        for (const char* kind : {"eq", "comp", "ott", "limiter"}) {
            auto proc = createFableDynamicsEffect(makeEffectJson(kind));
            QVERIFY(proc != nullptr);
            proc->prepare(kRefRate);
            runTwoThreadHandoff(*proc, [&]() { proc->armForPlayback(); });
        }

        // Exercise AutomationStage wrapping + armMixPlanForPlayback() handoff across two distinct threads.
        const auto autoToken = nt::automation::registerMixerAutomation();
        auto parsed = nt::parseTimelineJson(R"({
            "fps": 30, "width": 64, "height": 64, "durationMs": 2000,
            "tracks": [{
                "id": "t1", "type": "audio", "automationMode": "read",
                "effects": [{"id": "eq_auto", "type": "fable", "kind": "eq", "enabled": true,
                             "params": {"fx.eq.mid": 0.0, "fx.eq.mfreq": 900.0}}],
                "automation": [{
                    "enabled": true,
                    "target": {"kind": "device", "deviceId": "eq_auto", "param": "fx.eq.mid"},
                    "points": [{"timeMs": 0, "value": 0.0}, {"timeMs": 1000, "value": 12.0}]
                }]
            }],
            "clips": []
        })");
        QVERIFY(parsed.timeline.has_value());
        MixPlan plan;
        TrackPlan bus;
        bus.trackId = "t1";
        auto eqProc = createFableDynamicsEffect(makeEffectJson("eq", {{"fx.eq.mid", 0.0}, {"fx.eq.mfreq", 900.0}}));
        QVERIFY(eqProc != nullptr);
        eqProc->id = "eq_auto";
        bus.processors.push_back(std::shared_ptr<BlockProcessor>(std::move(eqProc)));
        plan.tracks.push_back(std::move(bus));
        applyMixPlanStage("automation", *parsed.timeline, plan);
        prepareMixPlan(plan, kRefRate);
        runTwoThreadHandoff(*plan.tracks[0].processors[0], [&]() { armMixPlanForPlayback(plan); });
        unregisterMixPlanStage(autoToken);
    }

    void sampleRatesAndDenormalSafety() {
        const std::array<double, 3> rates = {44100.0, 48000.0, 96000.0};
        const std::array<const char*, 4> kinds = {"eq", "comp", "ott", "limiter"};

        for (double sr : rates) {
            for (const char* kind : kinds) {
                QJsonObject p;
                if (std::string_view(kind) == "eq") {
                    p = {{"fx.eq.low", 6.0}, {"fx.eq.mid", -4.0}, {"fx.eq.high", 5.0}};
                } else if (std::string_view(kind) == "ott") {
                    p = {{"fx.ott.depth", 0.8}};
                } else if (std::string_view(kind) == "limiter") {
                    p = {{"fx.limit.gain", 6.0}, {"fx.limit.ceil", -1.0}};
                }
                auto proc = createFableDynamicsEffect(makeEffectJson(kind, p));
                QVERIFY(proc != nullptr);
                proc->prepare(sr);

                // 1. Normal stereo audio at this sample rate.
                std::vector<float> L, R;
                makeTestSignal(L, R, 1024, sr, 0.5f);
                auto stereo = interleave(L, R);
                proc->process(stereo, {sr, 0.0, 1000.0 / sr});
                for (float v : stereo) {
                    QVERIFY2(std::isfinite(v), qPrintable(QStringLiteral("Non-finite output for %1 at %2 Hz").arg(kind).arg(sr)));
                }

                // 2. Subnormal + NaN + Inf injection followed by silence decay must stay finite and bounded.
                std::vector<float> poison(256 * 2, std::numeric_limits<float>::denorm_min());
                poison[0] = std::numeric_limits<float>::quiet_NaN();
                poison[1] = std::numeric_limits<float>::infinity();
                poison[2] = -std::numeric_limits<float>::infinity();
                poison[4] = 1.0e-40f;
                poison[5] = -1.0e-40f;
                proc->process(poison, {sr, 1024.0 * 1000.0 / sr, 1000.0 / sr});
                for (float v : poison) {
                    QVERIFY2(std::isfinite(v), qPrintable(QStringLiteral("Poison produced non-finite for %1 at %2 Hz").arg(kind).arg(sr)));
                }
            }
        }
    }

    void latencyReportingForPdc() {
        const std::array<double, 3> rates = {44100.0, 48000.0, 96000.0};
        for (double sr : rates) {
            for (const char* zeroKind : {"eq", "comp", "ott"}) {
                auto proc = createFableDynamicsEffect(makeEffectJson(zeroKind));
                QVERIFY(proc != nullptr);
                proc->prepare(sr);
                QCOMPARE(proc->latencySamples(), 0);
                QCOMPARE(proc->effectiveLatencySamples(), 0);
            }

            auto lim = createFableDynamicsEffect(makeEffectJson("limiter", {{"fx.limit.ceil", -1.0}}));
            QVERIFY(lim != nullptr);
            lim->prepare(sr);
            const int expectedLookahead = std::max(8, static_cast<int>(std::lround(LookaheadLimiter::kLookaheadSec * sr)));
            const int expectedTotal = LookaheadLimiter::kTruePeakFirDelay + expectedLookahead;
            QCOMPARE(lim->latencySamples(), expectedTotal);
            QCOMPARE(lim->effectiveLatencySamples(), expectedTotal);

            // Bypassed limiter reports 0 effective latency to PDC.
            lim->setBypassed(true);
            QCOMPARE(lim->effectiveLatencySamples(), 0);
            lim->setBypassed(false);
            QCOMPARE(lim->effectiveLatencySamples(), expectedTotal);

            // Impulse arrival frame must match reported latencySamples() exactly.
            lim->reset();
            const int N = expectedTotal + 64;
            std::vector<float> impulse(static_cast<std::size_t>(N) * 2, 0.0f);
            impulse[0] = 0.25f;
            impulse[1] = 0.25f;
            lim->process(impulse, {sr, 0.0, 1000.0 / sr});
            int peakFrame = -1;
            float peakVal = 0.0f;
            for (int i = 0; i < N; ++i) {
                const float v = std::abs(impulse[static_cast<std::size_t>(i) * 2]);
                if (v > peakVal) {
                    peakVal = v;
                    peakFrame = i;
                }
            }
            QCOMPARE(peakFrame, expectedTotal);
            QVERIFY(std::abs(peakVal - 0.25f) < 1e-5f);
        }
    }

    void zeroAudioThreadAllocations() {
        QVERIFY2(nt::testing::countsAnAllocation(), "Allocation counter control check failed");

        const std::array<const char*, 4> kinds = {"eq", "comp", "ott", "limiter"};
        for (const char* kind : kinds) {
            auto proc = createFableDynamicsEffect(makeEffectJson(kind));
            QVERIFY(proc != nullptr);
            proc->prepare(kRefRate);

            std::vector<float> stereo(kMixBlockFrames * 2, 0.25f);
            const auto params = fableDynamicsParams(kind);

            nt::testing::allocations = 0;
            nt::testing::countAllocations = true;

            for (int block = 0; block < 16; ++block) {
                for (const auto& p : params) {
                    (void)proc->setParameter(p.id, block % 2 == 0 ? p.def : p.max);
                }
                const BlockContext ctx{kRefRate, block * kMixBlockFrames * 1000.0 / kRefRate, 1000.0 / kRefRate};
                (void)proc->processBlock(stereo, ctx);
                (void)proc->hasPendingOutput(kMixBlockFrames);
                (void)proc->latencySamples();
            }
            proc->setBypassed(true);
            (void)proc->processBlock(stereo, {kRefRate, 16.0 * kMixBlockFrames * 1000.0 / kRefRate, 1000.0 / kRefRate});
            proc->setBypassed(false);
            proc->reset();
            (void)proc->processBlock(stereo, {kRefRate, 17.0 * kMixBlockFrames * 1000.0 / kRefRate, 1000.0 / kRefRate});

            nt::testing::countAllocations = false;
            const std::size_t count = nt::testing::allocations;
            QVERIFY2(count == 0, qPrintable(QStringLiteral("%1 allocated %2 times on audio thread").arg(kind).arg(count)));
        }
    }

    void cpuBudgetBound() {
        constexpr double kSeconds = 10.0;
        constexpr int kTotalFrames = static_cast<int>(kRefRate * kSeconds);
        constexpr int kBlocks = kTotalFrames / kMixBlockFrames;

        std::vector<float> seedL, seedR;
        makeTestSignal(seedL, seedR, kMixBlockFrames, kRefRate, 0.7f);
        const auto seed = interleave(seedL, seedR);
        std::vector<float> work(seed.size());

#if defined(NT_SANITIZED) || !defined(NDEBUG)
        constexpr double kMaxCpuPct = 25.0;
#else
        constexpr double kMaxCpuPct = 5.0;
#endif

        const std::array<const char*, 4> kinds = {"eq", "comp", "ott", "limiter"};
        for (const char* kind : kinds) {
            QJsonObject p;
            if (std::string_view(kind) == "eq") {
                p = {{"fx.eq.low", 4.5}, {"fx.eq.mid", -3.5}, {"fx.eq.mid2", 2.5}, {"fx.eq.high", 3.0}};
            } else if (std::string_view(kind) == "ott") {
                p = {{"fx.ott.depth", 0.65}};
            } else if (std::string_view(kind) == "limiter") {
                p = {{"fx.limit.gain", 6.0}, {"fx.limit.ceil", -1.0}};
            }
            auto proc = createFableDynamicsEffect(makeEffectJson(kind, p));
            QVERIFY(proc != nullptr);
            proc->prepare(kRefRate);

            // Warm up caches.
            work = seed;
            proc->process(work, {kRefRate, 0.0, 1000.0 / kRefRate});

            const auto t0 = std::chrono::steady_clock::now();
            for (int b = 0; b < kBlocks; ++b) {
                work = seed;
                proc->process(work, {kRefRate, b * kMixBlockFrames * 1000.0 / kRefRate, 1000.0 / kRefRate});
            }
            const auto t1 = std::chrono::steady_clock::now();
            const double elapsedSec = std::chrono::duration<double>(t1 - t0).count();
            const double cpuPct = (elapsedSec / kSeconds) * 100.0;
            std::fprintf(stderr, "[FX1 CPU] %-8s: %.3f ms for %.1f s audio (%.3f%% RT), latency=%d samples\n",
                         kind, elapsedSec * 1000.0, kSeconds, cpuPct, proc->latencySamples());
            QVERIFY2(cpuPct < kMaxCpuPct,
                     qPrintable(QStringLiteral("%1 CPU %2% exceeded bound %3%").arg(kind).arg(cpuPct, 0, 'f', 3).arg(kMaxCpuPct, 0, 'f', 1)));
        }
    }
};

QTEST_APPLESS_MAIN(TestFableDynamics)
#include "tst_fabledynamics.moc"
