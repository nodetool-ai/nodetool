// Tests for FableSynth color and time insert ports (drive, chorus, echo, reverb).
// Covers:
//   - Bit-close reference checks against FableSynth C++ (commit ae9fca7) output:
//     * drive (SOFT, TAPE, HARD + tone + 4x HalfBandFir) & DriveOs2 2x IIR oversampler
//     * chorus (dual modulated Hermite taps)
//     * echo (free ping-pong & tempo-synced stereo tape echo + all 6 divisions)
//     * reverb (ROOM Freeverb comb/allpass & PLATE Dattorro PlateReverb)
//   - Web parameter key/range/default parity (params.ts / fableFxParams.ts)
//   - Click-free parameter smoothing and arbitrary block-size invariance
//   - 44.1 / 48 / 96 kHz operation and denormal/NaN/Inf safety
//   - Exact PDC latency reporting (active, bypassed, impulse alignment)
//   - Zero audio-thread heap allocations (TestAllocationCounter.h)
//   - Real-time CPU budget bound per effect

#include "audio/Mixer.h"
#include "audio/TestAllocationCounter.h"
#include "audio/effects/fable/FableColorTime.h"
#include "audio/effects/fable/FableColorTimeEffects.h"

#include <QJsonObject>
#include <QtTest>

#include <algorithm>
#include <array>
#include <chrono>
#include <cmath>
#include <cstdio>
#include <limits>
#include <memory>
#include <span>
#include <string>
#include <vector>

using namespace nt::audio;
using namespace nt::audio::effects::fable;

namespace {

struct RefSample {
    int index;
    float l;
    float r;
};

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

QJsonObject makeEffectJson(const char* kind, const QJsonObject& params = {}, bool enabled = true) {
    return QJsonObject{
        {"id", QString::fromLatin1(kind) + "_test"},
        {"type", "fable"},
        {"kind", QString::fromLatin1(kind)},
        {"enabled", enabled},
        {"params", params},
    };
}

// Golden reference vectors generated directly from FableSynth C++ (commit ae9fca7,
// juce/source/dsp/{Fx.cpp,Fx.h,DriveOs.h,PlateReverb.h}) at 48 kHz (4096 frames).
static constexpr RefSample kRefDriveSoft[] = {
    {0, 0.0f, 0.0f},
    {1, -6.32173935e-15f, -8.23579367e-15f},
    {7, -3.80668874e-09f, -4.71737183e-09f},
    {34, 0.000213297666f, 0.000338459242f},
    {35, 0.0450288318f, 0.0578971617f},
    {36, 0.0376821645f, 0.0578589588f},
    {64, -0.0149984127f, 0.0335720368f},
    {128, 0.0721056685f, 0.0297984518f},
    {256, 0.134818852f, -0.0169634074f},
    {511, -0.197451115f, 0.0379287638f},
    {512, -0.174805969f, 0.0341192782f},
    {520, -0.0687470958f, -0.0535012297f},
    {600, 0.34497419f, 0.123948164f},
    {768, 0.395889699f, 0.366251826f},
    {1024, -0.459165931f, -0.400601327f},
    {1500, -0.440898865f, -0.581697404f},
    {1536, 0.508663833f, -0.466866523f},
    {2048, -0.436324984f, -0.445616364f},
    {2560, -0.0536878146f, -0.529247224f},
    {2700, -0.534297407f, -0.65033263f},
    {3000, 0.602055311f, 0.662834704f},
    {3500, 0.230980217f, 0.118146144f},
    {3840, -0.0668976903f, 0.109101214f},
    {4095, 0.198319361f, 0.132797658f},
};

static constexpr RefSample kRefDriveTape[] = {
    {0, 0.0f, 0.0f},
    {1, -8.03900081e-15f, -1.04729966e-14f},
    {7, -4.83911178e-09f, -5.99666317e-09f},
    {34, 0.000335404737f, 0.000537608867f},
    {35, 0.0461982973f, 0.0586927347f},
    {36, 0.0388017669f, 0.0584397651f},
    {64, -0.01579169f, 0.036240682f},
    {128, 0.078014724f, 0.036060825f},
    {256, 0.13621372f, -0.0155493505f},
    {511, -0.202855542f, 0.0491993129f},
    {512, -0.194954127f, 0.0453342795f},
    {520, -0.112782285f, -0.0682489425f},
    {600, 0.268014193f, 0.156777471f},
    {768, 0.338474244f, 0.270022392f},
    {1024, -0.379280061f, -0.335123003f},
    {1500, -0.35889408f, -0.435084492f},
    {1536, 0.297641367f, -0.287834674f},
    {2048, -0.31524542f, -0.375336707f},
    {2560, -0.134086877f, -0.311711401f},
    {2700, -0.408821702f, -0.395658493f},
    {3000, 0.402651697f, 0.362689942f},
    {3500, 0.314043701f, 0.231086418f},
    {3840, -0.176944643f, 0.120367937f},
    {4095, 0.288257718f, 0.231462032f},
};

static constexpr RefSample kRefDriveHard[] = {
    {0, 0.0f, 0.0f},
    {1, -8.95442828e-15f, -1.16655893e-14f},
    {7, -5.38890443e-09f, -6.67810252e-09f},
    {34, 0.000406331033f, 0.000640110578f},
    {35, 0.046883136f, 0.059170451f},
    {36, 0.0394011959f, 0.0587001257f},
    {64, -0.0168528948f, 0.0370046012f},
    {128, 0.0786827877f, 0.0355045237f},
    {256, 0.136385858f, -0.020488007f},
    {511, -0.197793037f, 0.0490340516f},
    {512, -0.19018124f, 0.0444764197f},
    {520, -0.0949497372f, -0.0697498098f},
    {600, 0.293892086f, 0.149181351f},
    {768, 0.339565635f, 0.322880507f},
    {1024, -0.387095541f, -0.335776508f},
    {1500, -0.361947805f, -0.480144262f},
    {1536, 0.405275762f, -0.374992669f},
    {2048, -0.402772337f, -0.369828463f},
    {2560, -0.10105665f, -0.478577316f},
    {2700, -0.429536074f, -0.515372217f},
    {3000, 0.473918021f, 0.498958379f},
    {3500, 0.33326596f, 0.169902563f},
    {3840, -0.100021139f, 0.143625483f},
    {4095, 0.282938153f, 0.188379094f},
};

static constexpr RefSample kRefDriveOs2[] = {
    {0, 0.0368000641f, 0.0479421429f},
    {1, 0.0302758124f, 0.0474393703f},
    {7, 0.0321894586f, 0.0684364364f},
    {34, -0.00340368412f, -0.0206582155f},
    {35, -0.00649595354f, -0.0202118047f},
    {36, -0.00821043458f, -0.0203225724f},
    {64, 0.0362768769f, 0.0707973093f},
    {128, 0.042904526f, 0.102640651f},
    {256, -0.0318605229f, 0.0137491236f},
    {511, -0.0170844588f, -0.0577915013f},
    {512, -0.0592925325f, -0.063894175f},
    {520, -0.0308130607f, -0.182990134f},
    {600, 0.0761400163f, 0.408974081f},
    {768, 0.411134928f, 0.0788743868f},
    {1024, -0.206473425f, 0.0515797548f},
    {1500, -0.0751813576f, 0.486456811f},
    {1536, -0.754496455f, -0.524610102f},
    {2048, -0.0145053761f, 0.0930158123f},
    {2560, 0.141397625f, -0.0129974503f},
    {2700, -0.226401374f, 0.203849733f},
    {3000, 0.482378036f, -0.285425305f},
    {3500, 0.013633051f, 0.0209126193f},
    {3840, -0.0309164841f, -0.0907779261f},
    {4095, 0.0419247597f, 0.0255759917f},
};

static constexpr RefSample kRefChorus[] = {
    {0, 0.0369786434f, 0.048174791f},
    {1, 0.0305503923f, 0.0478751138f},
    {7, 0.0299787596f, 0.0653581545f},
    {34, 0.000572705874f, -0.0116945421f},
    {35, -0.0100072492f, -0.00618357118f},
    {36, -0.014708695f, -0.0105620008f},
    {64, 0.0169980898f, 0.0648282021f},
    {128, -0.000333295902f, 0.0556086227f},
    {256, -0.0284085777f, -0.022432914f},
    {511, -0.0110717593f, -0.0294509381f},
    {512, -0.00208652788f, -0.174387887f},
    {520, 0.161586866f, -0.154722199f},
    {600, 0.200388193f, 0.266170263f},
    {768, 0.0132529922f, 0.015111859f},
    {1024, -0.156303138f, 0.200373679f},
    {1500, 0.207682222f, 0.162287518f},
    {1536, -0.318220258f, -0.00812249724f},
    {2048, -0.018833654f, 0.221574932f},
    {2560, 0.333526134f, 0.0038884778f},
    {2700, 0.119106509f, -0.0141465208f},
    {3000, 0.343829125f, 0.155672997f},
    {3500, 0.0342698619f, 0.0472638644f},
    {3840, -0.0114051504f, -0.00278542121f},
    {4095, 0.0109634921f, -0.00958886556f},
};

static constexpr RefSample kRefEchoFree[] = {
    {0, 0.0369789898f, 0.0481752455f},
    {1, 0.0305509679f, 0.0478760153f},
    {7, 0.0299810134f, 0.0653630644f},
    {34, 0.000572893536f, -0.0116983745f},
    {35, -0.0100106224f, -0.00618565502f},
    {36, -0.0147137893f, -0.010565659f},
    {64, 0.0170083884f, 0.0648674816f},
    {128, -0.000333692646f, 0.0556748137f},
    {256, -0.0284744669f, -0.0224849433f},
    {511, -0.0111203939f, -0.0295803044f},
    {512, -0.00209570909f, -0.175155237f},
    {520, 0.162307724f, -0.155412436f},
    {600, 0.186117455f, 0.267516136f},
    {768, 0.0077443663f, 0.0152058881f},
    {1024, -0.150427118f, 0.189155906f},
    {1500, 0.140804052f, -0.0794018358f},
    {1536, -0.1648224f, -0.0794110969f},
    {2048, -0.0479271784f, 0.0344205797f},
    {2560, 0.36124447f, -0.0164445527f},
    {2700, 0.0486130081f, -0.039188467f},
    {3000, 0.364512593f, 0.122438073f},
    {3500, 0.0530144349f, 0.0156148029f},
    {3840, -0.0142691359f, -0.00353327487f},
    {4095, 0.00337789604f, 0.00301516824f},
};

static constexpr RefSample kRefEchoSyncStereo[] = {
    {0, 0.0369808935f, 0.0481777228f},
    {1, 0.0305541139f, 0.0478809439f},
    {7, 0.0299933571f, 0.0653899759f},
    {34, 0.000573920959f, -0.0117193544f},
    {35, -0.010029085f, -0.00619706372f},
    {36, -0.0147416759f, -0.0105856834f},
    {64, 0.0170647632f, 0.065082483f},
    {128, -0.000335864257f, 0.0560371391f},
    {256, -0.0288351625f, -0.0227697678f},
    {511, -0.0113866255f, -0.0302884821f},
    {512, -0.00214596908f, -0.17935586f},
    {520, 0.166253909f, -0.159190968f},
    {600, 0.191243455f, 0.274883986f},
    {768, 0.00800653454f, 0.0157206506f},
    {1024, -0.156783491f, 0.19714877f},
    {1500, 0.148445219f, -0.0837108195f},
    {1536, -0.17388846f, -0.0837791041f},
    {2048, -0.0520012267f, 0.0365385264f},
    {2560, 0.299592465f, -0.0233179741f},
    {2700, 0.160703614f, -0.0345454626f},
    {3000, 0.313047588f, 0.125736743f},
    {3500, 0.0145890601f, 0.0136544034f},
    {3840, 0.00381506234f, -0.00235956279f},
    {4095, 0.0213890933f, 0.00369623443f},
};

static constexpr RefSample kRefReverbRoom[] = {
    {0, 0.0369815379f, 0.0481785648f},
    {1, 0.0305551793f, 0.0478826165f},
    {7, 0.0299975295f, 0.0653990731f},
    {34, 0.000574268342f, -0.0117264483f},
    {35, -0.0100353276f, -0.00620092079f},
    {36, -0.0147511046f, -0.0105924541f},
    {64, 0.0170838181f, 0.065155156f},
    {128, -0.00033659843f, 0.0561596267f},
    {256, -0.0289571285f, -0.0228660777f},
    {511, -0.0114766601f, -0.0305279754f},
    {512, -0.00216296595f, -0.180776432f},
    {520, 0.167588457f, -0.160468832f},
    {600, 0.192977026f, 0.277375758f},
    {768, 0.00809520017f, 0.0158947427f},
    {1024, -0.158933371f, 0.199852169f},
    {1500, 0.152021766f, -0.0833414569f},
    {1536, -0.177237391f, -0.0851003081f},
    {2048, -0.0424997024f, 0.030544199f},
    {2560, 0.305541605f, -0.0315212868f},
    {2700, 0.174142495f, -0.0316668078f},
    {3000, 0.322474748f, 0.188673496f},
    {3500, -0.0145577649f, 0.057952933f},
    {3840, -0.0048892987f, 0.063196674f},
    {4095, -0.0221750718f, -0.0473389514f},
};

static constexpr RefSample kRefReverbPlate[] = {
    {0, 0.0369795598f, 0.0481759869f},
    {1, 0.0305519123f, 0.0478774942f},
    {7, 0.0299847219f, 0.0653711483f},
    {34, 0.000573202095f, -0.0117046749f},
    {35, -0.0100161666f, -0.00618908135f},
    {36, -0.0147221647f, -0.0105716735f},
    {64, 0.0170253199f, 0.0649320558f},
    {128, -0.000334344833f, 0.0557836294f},
    {256, -0.028582802f, -0.0225704908f},
    {511, -0.0114519466f, -0.0297929887f},
    {512, -0.00242323964f, -0.176416785f},
    {520, 0.163376823f, -0.156547233f},
    {600, 0.187802315f, 0.269892871f},
    {768, 0.00792420004f, 0.0152618038f},
    {1024, -0.152862623f, 0.191428721f},
    {1500, 0.143087685f, -0.0795078278f},
    {1536, -0.168445587f, -0.0792612359f},
    {2048, -0.0473358929f, 0.0354224555f},
    {2560, 0.288492799f, -0.0288568195f},
    {2700, 0.147217706f, -0.0343449079f},
    {3000, 0.307134062f, 0.117058262f},
    {3500, -0.00298693101f, 0.00306898798f},
    {3840, -0.00333293038f, -0.00875117071f},
    {4095, -0.00749288872f, 0.00316413236f},
};

template <std::size_t N>
float maxStereoRefError(const std::vector<float>& stereo, const RefSample (&refs)[N]) {
    float maxErr = 0.0f;
    for (const auto& ref : refs) {
        const auto idx = static_cast<std::size_t>(ref.index);
        maxErr = std::max(maxErr, std::abs(stereo[idx * 2] - ref.l));
        maxErr = std::max(maxErr, std::abs(stereo[idx * 2 + 1] - ref.r));
    }
    return maxErr;
}

}  // namespace

class TestFableColorTime : public QObject {
    Q_OBJECT

private slots:
    void referenceDriveAndDriveOs2() {
        // 1. DriveOs2 (2x polyphase IIR oversampler from DriveOs.h) exact reference.
        {
            std::vector<float> L, R;
            makeTestSignal(L, R, kRefFrames, kRefRate, 0.55f);
            DriveOs2 osL, osR;
            const double wStep = 1.0 / (kDriveOsRampSec * kRefRate);
            auto sat = [](double a, double /*xp*/) { return std::tanh(3.5 * a) / std::tanh(3.5); };
            for (int i = 0; i < kRefFrames; ++i) {
                L[static_cast<std::size_t>(i)] = static_cast<float>(osL.run(L[static_cast<std::size_t>(i)], true, true, 0.8, wStep, sat));
                R[static_cast<std::size_t>(i)] = static_cast<float>(osR.run(R[static_cast<std::size_t>(i)], true, true, 0.8, wStep, sat));
            }
            const auto stereo = interleave(L, R);
            const float err = maxStereoRefError(stereo, kRefDriveOs2);
            QVERIFY2(err <= 1e-5f, qPrintable(QStringLiteral("DriveOs2 maxErr=%1").arg(err)));
        }

        // 2. FableDriveProcessor across SOFT / TAPE / HARD modes + fragmented block sizes.
        const auto checkDrive = [](const char* label, const QJsonObject& params, const auto& refs) {
            auto proc = createFableColorTimeEffect(makeEffectJson("drive", params));
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
            const float err = maxStereoRefError(stereo, refs);
            QVERIFY2(err <= 1e-5f, qPrintable(QStringLiteral("Drive %1 maxErr=%2").arg(label).arg(err)));
        };

        checkDrive("SOFT", {{"fx.drive.amt", 0.55}, {"fx.drive.mix", 0.85}, {"fx.drive.type", 0}, {"fx.drive.tone", 0.35}}, kRefDriveSoft);
        checkDrive("TAPE", {{"fx.drive.amt", 0.70}, {"fx.drive.mix", 1.00}, {"fx.drive.type", 1}, {"fx.drive.tone", -0.45}}, kRefDriveTape);
        checkDrive("HARD", {{"fx.drive.amt", 0.80}, {"fx.drive.mix", 0.90}, {"fx.drive.type", 2}, {"fx.drive.tone", 0.25}}, kRefDriveHard);
    }

    void referenceChorus() {
        const QJsonObject params{
            {"fx.chorus.rate", 1.25}, {"fx.chorus.depth", 0.65}, {"fx.chorus.mix", 0.70},
        };
        auto proc = createFableColorTimeEffect(makeEffectJson("chorus", params));
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
        const float err = maxStereoRefError(stereo, kRefChorus);
        QVERIFY2(err <= 1e-5f, qPrintable(QStringLiteral("Chorus maxErr=%1").arg(err)));
    }

    void referenceEchoAndTempoSync() {
        // 1. Free-time ping-pong tape echo reference.
        {
            const QJsonObject params{
                {"fx.delay.time", 0.04}, {"fx.delay.fb", 0.55}, {"fx.delay.mix", 0.65},
                {"fx.delay.tone", 4500.0}, {"fx.delay.sat", 0.35}, {"fx.delay.wow", 0.25},
                {"fx.delay.flutter", 0.20}, {"fx.delay.width", 0.85}, {"fx.delay.mode", 0},
                {"fx.delay.sync", 0}, {"fx.delay.div", 3},
            };
            auto proc = createFableColorTimeEffect(makeEffectJson("echo", params), 120.0);
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
            const float err = maxStereoRefError(stereo, kRefEchoFree);
            QVERIFY2(err <= 1e-5f, qPrintable(QStringLiteral("Echo free maxErr=%1").arg(err)));
        }

        // 2. Tempo-synced stereo tape echo reference (1/16 @ 180 BPM = 83.333 ms).
        {
            const QJsonObject params{
                {"fx.delay.time", 0.36}, {"fx.delay.fb", 0.45}, {"fx.delay.mix", 0.60},
                {"fx.delay.tone", 4500.0}, {"fx.delay.sat", 0.25}, {"fx.delay.wow", 0.18},
                {"fx.delay.flutter", 0.12}, {"fx.delay.width", 1.0}, {"fx.delay.mode", 1},
                {"fx.delay.sync", 1}, {"fx.delay.div", 5},
            };
            auto proc = createFableColorTimeEffect(makeEffectJson("echo", params), 180.0);
            QVERIFY(proc != nullptr);
            proc->prepare(kRefRate);
            std::vector<float> inL, inR;
            makeTestSignal(inL, inR, kRefFrames, kRefRate, 0.55f);
            auto stereo = interleave(inL, inR);
            proc->process(stereo, {kRefRate, 0.0, 1000.0 / kRefRate});
            const float err = maxStereoRefError(stereo, kRefEchoSyncStereo);
            QVERIFY2(err <= 1e-5f, qPrintable(QStringLiteral("Echo sync stereo maxErr=%1").arg(err)));
        }

        // 3. Verify all 6 tempo-sync divisions match 60 / bpm * div clamped to [0.02, 1.5],
        //    and verify actual impulse repeat position matches synced time at 120 BPM (1/16 = 125 ms = 6000 smp).
        {
            const std::array<double, 6> expectedDivs = {1.0, 1.5, 0.5, 0.75, 1.0 / 3.0, 0.25};
            FableEchoProcessor echo(makeEffectJson("echo", {
                {"fx.delay.sync", 1}, {"fx.delay.div", 5}, {"fx.delay.fb", 0.0},
                {"fx.delay.mix", 1.0}, {"fx.delay.wow", 0.0}, {"fx.delay.flutter", 0.0},
                {"fx.delay.sat", 0.0}, {"fx.delay.tone", 12000.0}, {"fx.delay.mode", 1},
            }), 120.0);
            echo.prepare(kRefRate);
            for (int d = 0; d < 6; ++d) {
                QVERIFY(echo.setParameter("fx.delay.div", static_cast<double>(d)));
                const double expectedSec = std::clamp(60.0 / 120.0 * expectedDivs[static_cast<std::size_t>(d)], 0.02, 1.5);
                QVERIFY2(std::abs(echo.targetDelaySec() - expectedSec) < 1e-6,
                         qPrintable(QStringLiteral("div=%1 got=%2 expected=%3").arg(d).arg(echo.targetDelaySec()).arg(expectedSec)));
            }
            // Test live tempo change to 150 BPM on 1/8 note (0.5 beat -> 0.200 s = 9600 samples).
            QVERIFY(echo.setParameter("fx.delay.div", 2.0));
            echo.setTempoBpm(150.0);
            echo.reset();
            QVERIFY(std::abs(echo.targetDelaySec() - 0.2) < 1e-6);

            const int N = 12000;
            std::vector<float> buf(static_cast<std::size_t>(N) * 2, 0.0f);
            buf[0] = 0.5f;
            buf[1] = 0.5f;
            echo.process(buf, {kRefRate, 0.0, 1000.0 / kRefRate});
            int repeatFrame = -1;
            float repeatPeak = 0.0f;
            for (int i = 1000; i < N; ++i) {
                const float v = std::abs(buf[static_cast<std::size_t>(i) * 2]);
                if (v > repeatPeak) {
                    repeatPeak = v;
                    repeatFrame = i;
                }
            }
            QVERIFY2(repeatPeak > 0.1f, qPrintable(QStringLiteral("Echo repeat too quiet: %1").arg(repeatPeak)));
            QVERIFY2(std::abs(repeatFrame - 9600) <= 6,
                     qPrintable(QStringLiteral("Echo synced repeat frame=%1 expected~9600").arg(repeatFrame)));
        }
    }

    void referenceReverbRoomAndPlate() {
        // 1. ROOM mode (Freeverb comb/allpass, default web mode).
        {
            const QJsonObject params{
                {"fx.reverb.size", 0.65}, {"fx.reverb.mix", 0.55}, {"fx.reverb.type", 0},
            };
            auto proc = createFableColorTimeEffect(makeEffectJson("reverb", params));
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
            const float err = maxStereoRefError(stereo, kRefReverbRoom);
            QVERIFY2(err <= 1e-5f, qPrintable(QStringLiteral("Reverb ROOM maxErr=%1").arg(err)));
        }

        // 2. PLATE mode (Dattorro PlateReverb).
        {
            const QJsonObject params{
                {"fx.reverb.size", 0.70}, {"fx.reverb.mix", 0.60}, {"fx.reverb.type", 1}, {"fx.reverb.damp", 0.35},
            };
            auto proc = createFableColorTimeEffect(makeEffectJson("reverb", params));
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
            const float err = maxStereoRefError(stereo, kRefReverbPlate);
            QVERIFY2(err <= 1e-5f, qPrintable(QStringLiteral("Reverb PLATE maxErr=%1").arg(err)));
        }

        // 3. Switching ROOM -> PLATE crossfades cleanly (~5 ms) and clears the outgoing tank so no stale tail leaks.
        {
            auto proc = createFableColorTimeEffect(makeEffectJson("reverb", {{"fx.reverb.size", 0.9}, {"fx.reverb.mix", 1.0}, {"fx.reverb.type", 0}}));
            QVERIFY(proc != nullptr);
            proc->prepare(kRefRate);
            proc->reset();
            std::vector<float> burst(2048 * 2, 0.0f);
            burst[0] = 0.8f;
            burst[1] = 0.8f;
            proc->process(burst, {kRefRate, 0.0, 1000.0 / kRefRate});
            QVERIFY(proc->setParameter("fx.reverb.type", 1.0));
            std::vector<float> silence(512 * 2, 0.0f);
            proc->process(silence, {kRefRate, 2048.0 * 1000.0 / kRefRate, 1000.0 / kRefRate});
            float latePeak = 0.0f;
            for (int i = 300; i < 512; ++i) {
                latePeak = std::max(latePeak, std::abs(silence[static_cast<std::size_t>(i) * 2]));
                latePeak = std::max(latePeak, std::abs(silence[static_cast<std::size_t>(i) * 2 + 1]));
            }
            QCOMPARE(latePeak, 0.0f);
        }
    }

    void parameterDefaultsMatchWeb() {
        QVERIFY(isFableColorTimeKind("drive"));
        QVERIFY(isFableColorTimeKind("chorus"));
        QVERIFY(isFableColorTimeKind("echo"));
        QVERIFY(isFableColorTimeKind("reverb"));
        QVERIFY(!isFableColorTimeKind("lab"));
        QVERIFY(!isFableColorTimeKind("eq"));
        QVERIFY(!isFableColorTimeKind("unknown"));
        QVERIFY(createFableColorTimeEffect(makeEffectJson("lab")) == nullptr);

        struct ExpectedParam {
            const char* id;
            double min;
            double max;
            double def;
            ParamCurve curve;
        };

        const std::vector<ExpectedParam> driveExpected = {
            {"fx.drive.amt", 0.0, 1.0, 0.3, ParamCurve::Linear},
            {"fx.drive.mix", 0.0, 1.0, 1.0, ParamCurve::Linear},
            {"fx.drive.tone", -1.0, 1.0, 0.0, ParamCurve::Linear},
            {"fx.drive.type", 0.0, 2.0, 0.0, ParamCurve::Enum},
        };
        const std::vector<ExpectedParam> chorusExpected = {
            {"fx.chorus.rate", 0.05, 8.0, 0.6, ParamCurve::Log},
            {"fx.chorus.depth", 0.0, 1.0, 0.5, ParamCurve::Linear},
            {"fx.chorus.mix", 0.0, 1.0, 0.5, ParamCurve::Linear},
        };
        const std::vector<ExpectedParam> echoExpected = {
            {"fx.delay.time", 0.02, 1.5, 0.36, ParamCurve::Log},
            {"fx.delay.fb", 0.0, 0.92, 0.35, ParamCurve::Linear},
            {"fx.delay.mix", 0.0, 1.0, 0.3, ParamCurve::Linear},
            {"fx.delay.tone", 400.0, 12000.0, 4500.0, ParamCurve::Log},
            {"fx.delay.sat", 0.0, 1.0, 0.2, ParamCurve::Linear},
            {"fx.delay.wow", 0.0, 1.0, 0.18, ParamCurve::Linear},
            {"fx.delay.flutter", 0.0, 1.0, 0.12, ParamCurve::Linear},
            {"fx.delay.width", 0.0, 1.0, 1.0, ParamCurve::Linear},
            {"fx.delay.mode", 0.0, 1.0, 0.0, ParamCurve::Enum},
            {"fx.delay.sync", 0.0, 1.0, 0.0, ParamCurve::Bool},
            {"fx.delay.div", 0.0, 5.0, 3.0, ParamCurve::Enum},
        };
        const std::vector<ExpectedParam> reverbExpected = {
            {"fx.reverb.size", 0.0, 1.0, 0.5, ParamCurve::Linear},
            {"fx.reverb.mix", 0.0, 1.0, 0.3, ParamCurve::Linear},
            {"fx.reverb.type", 0.0, 1.0, 0.0, ParamCurve::Enum},
            {"fx.reverb.damp", 0.0, 1.0, 0.5, ParamCurve::Linear},
        };

        const auto verifyKind = [](const char* kind, const std::vector<ExpectedParam>& expected) {
            const auto params = fableColorTimeParams(kind);
            QCOMPARE(params.size(), expected.size());
            const auto defs = fableColorTimeDefaults(kind);
            QCOMPARE(static_cast<std::size_t>(defs.size()), expected.size());

            auto proc = createFableColorTimeEffect(makeEffectJson(kind));
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

        verifyKind("drive", driveExpected);
        verifyKind("chorus", chorusExpected);
        verifyKind("echo", echoExpected);
        verifyKind("reverb", reverbExpected);
    }

    void parameterSmoothingIsClickFree() {
        const auto checkSmoothStep = [](const char* kind, const char* param, double startVal, double endVal, float maxStep) {
            auto proc = createFableColorTimeEffect(makeEffectJson(kind, {{QString::fromLatin1(param), startVal}}));
            QVERIFY(proc != nullptr);
            proc->prepare(kRefRate);
            proc->reset();
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

        checkSmoothStep("drive", "fx.drive.amt", 0.0, 1.0, 0.12f);
        checkSmoothStep("drive", "fx.drive.mix", 0.0, 1.0, 0.12f);
        checkSmoothStep("drive", "fx.drive.type", 0.0, 2.0, 0.12f);
        checkSmoothStep("chorus", "fx.chorus.mix", 0.0, 1.0, 0.10f);
        checkSmoothStep("echo", "fx.delay.mix", 0.0, 1.0, 0.10f);
        checkSmoothStep("echo", "fx.delay.time", 0.1, 0.6, 0.12f);
        checkSmoothStep("reverb", "fx.reverb.mix", 0.0, 1.0, 0.10f);
        checkSmoothStep("reverb", "fx.reverb.damp", 0.0, 1.0, 0.10f);
    }

    // D2: Echo must read JSON effect["bpm"] when no host BPM is passed and accept live BPM via BlockProcessor.
    void echoTempoPropagationAndJsonBpm() {
        // 1. Default 1-arg createFableColorTimeEffect(effect) must honor effect["bpm"].
        QJsonObject eff = makeEffectJson("echo", {
            {"fx.delay.sync", 1}, {"fx.delay.div", 2}, {"fx.delay.fb", 0.0},
            {"fx.delay.mix", 1.0}, {"fx.delay.wow", 0.0}, {"fx.delay.flutter", 0.0},
            {"fx.delay.sat", 0.0}, {"fx.delay.tone", 12000.0}, {"fx.delay.mode", 1},
        });
        eff.insert(u"bpm", 150.0);
        auto proc = createFableColorTimeEffect(eff);
        QVERIFY(proc != nullptr);
        proc->prepare(kRefRate);
        proc->reset();

        // 1/8 note @ 150 BPM = 0.200 s = 9600 samples (not 120 BPM = 0.250 s = 12000 samples).
        const int N = 15000;
        std::vector<float> buf(static_cast<std::size_t>(N) * 2, 0.0f);
        buf[0] = 0.5f;
        buf[1] = 0.5f;
        proc->process(buf, {kRefRate, 0.0, 1000.0 / kRefRate});
        int peakFrame = -1;
        float peakVal = 0.0f;
        for (int i = 1000; i < N; ++i) {
            const float v = std::abs(buf[static_cast<std::size_t>(i) * 2]);
            if (v > peakVal) {
                peakVal = v;
                peakFrame = i;
            }
        }
        QVERIFY2(std::abs(peakFrame - 9600) <= 8,
                 qPrintable(QStringLiteral("JSON bpm=150 ignored: repeat at %1 (expected ~9600)").arg(peakFrame)));

        // 2. Live tempo change through base BlockProcessor::setParameter("bpm", 180.0).
        QVERIFY2(proc->setParameter("bpm", 180.0), "BlockProcessor::setParameter(\"bpm\", ...) rejected");
        proc->reset();
        // 1/8 note @ 180 BPM = 0.16667 s = 8000 samples.
        std::ranges::fill(buf, 0.0f);
        buf[0] = 0.5f;
        buf[1] = 0.5f;
        proc->process(buf, {kRefRate, 0.0, 1000.0 / kRefRate});
        peakFrame = -1;
        peakVal = 0.0f;
        for (int i = 1000; i < N; ++i) {
            const float v = std::abs(buf[static_cast<std::size_t>(i) * 2]);
            if (v > peakVal) {
                peakVal = v;
                peakFrame = i;
            }
        }
        QVERIFY2(std::abs(peakFrame - 8000) <= 8,
                 qPrintable(QStringLiteral("Live bpm=180 via setParameter failed: repeat at %1 (expected ~8000)").arg(peakFrame)));
    }

    // E3: Echo's hasPendingOutput() must stay true through max positive wow/flutter excursion
    // and filter/interpolation margin while draining a modulated impulse at 96 kHz.
    void echoPendingOutputCoversModulatedImpulseAt96k() {
        constexpr double kSr = 96000.0;
        constexpr int kBlock = 32;
        for (double toneHz : {4500.0, 400.0}) {
            auto proc = createFableColorTimeEffect(makeEffectJson("echo", {
                {"fx.delay.time", 1.5}, {"fx.delay.fb", 0.0}, {"fx.delay.mix", 1.0},
                {"fx.delay.tone", toneHz}, {"fx.delay.sat", 0.0},
                {"fx.delay.wow", 1.0}, {"fx.delay.flutter", 1.0},
                {"fx.delay.width", 1.0}, {"fx.delay.mode", 0}, {"fx.delay.sync", 0},
            }));
            QVERIFY(proc != nullptr);
            proc->prepare(kSr);
            proc->reset();

            std::vector<float> block(kBlock * 2, 0.0f);
            block[0] = 1.0f;
            block[1] = 1.0f;
            proc->process(block, {kSr, 0.0, 1000.0 / kSr});
            QVERIFY2(proc->hasPendingOutput(kBlock), "Echo reported no pending output right after impulse");

            int drainedFrames = kBlock;
            float wetPeak = 0.0f;
            int wetPeakFrame = -1;
            constexpr int kMaxDrainFrames = 400000;
            while (proc->hasPendingOutput(kBlock) && drainedFrames < kMaxDrainFrames) {
                std::ranges::fill(block, 0.0f);
                proc->process(block, {kSr, drainedFrames * 1000.0 / kSr, 1000.0 / kSr});
                for (int i = 0; i < kBlock; ++i) {
                    const int frame = drainedFrames + i;
                    const float p = std::max(std::abs(block[static_cast<std::size_t>(i) * 2]),
                                             std::abs(block[static_cast<std::size_t>(i) * 2 + 1]));
                    if (frame >= 1000 && p > wetPeak) {
                        wetPeak = p;
                        wetPeakFrame = frame;
                    }
                }
                drainedFrames += kBlock;
            }
            const float minWetPeak = toneHz > 1000.0 ? 0.05f : 0.005f;
            QVERIFY2(!proc->hasPendingOutput(kBlock),
                     qPrintable(QStringLiteral("Echo pending output never drained at tone=%1 Hz (frames=%2)")
                                    .arg(toneHz).arg(drainedFrames)));
            QVERIFY2(wetPeak > minWetPeak && wetPeakFrame >= 144000,
                     qPrintable(QStringLiteral("Echo dropped modulated 96 kHz wet repeat (tone=%1 Hz): "
                                               "drained=%2 wetPeak=%3 peakFrame=%4")
                                    .arg(toneHz).arg(drainedFrames).arg(wetPeak).arg(wetPeakFrame)));
        }
    }

    // D3: JSON booleans (e.g. fx.delay.sync: true) and fx.<kind>.on: false in params on construction.
    void jsonBooleansAndOnParamOnConstruction() {
        // 1. JSON boolean true for fx.delay.sync.
        FableEchoProcessor echo(makeEffectJson("echo", {
            {"fx.delay.sync", true}, {"fx.delay.div", 5}, {"fx.delay.time", 0.36},
        }), 120.0);
        echo.prepare(kRefRate);
        // 1/16 @ 120 BPM = 0.125 s (if sync=true was ignored, targetDelaySec stays 0.36 s).
        QVERIFY2(std::abs(echo.targetDelaySec() - 0.125) < 1e-6,
                 qPrintable(QStringLiteral("fx.delay.sync=true ignored: targetDelaySec=%1").arg(echo.targetDelaySec())));

        // 2. params["fx.<kind>.on"] = false (even with enabled=true) constructs bypassed.
        struct OnCase { const char* kind; const char* onKey; QJsonObject extra; };
        const std::array<OnCase, 4> cases{{
            {"drive", "fx.drive.on", {{"fx.drive.amt", 0.9}, {"fx.drive.mix", 1.0}}},
            {"chorus", "fx.chorus.on", {{"fx.chorus.mix", 1.0}, {"fx.chorus.depth", 1.0}}},
            {"echo", "fx.delay.on", {{"fx.delay.mix", 1.0}, {"fx.delay.time", 0.05}}},
            {"reverb", "fx.reverb.on", {{"fx.reverb.mix", 1.0}, {"fx.reverb.size", 0.9}}},
        }};
        for (const auto& c : cases) {
            QJsonObject p = c.extra;
            p.insert(QString::fromLatin1(c.onKey), false);
            auto proc = createFableColorTimeEffect(makeEffectJson(c.kind, p, true));
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

    // D4: ROOM damping SR scaling & damp control, click-free mode crossfade, smooth damp.
    void reverbDampingScalingCrossfadeAndSmoothDamp() {
        // Helper: excite ROOM reverb with a deterministic broadband impulse burst and compare
        // broadband high-band (>5 kHz) vs low-band (<1 kHz) energy in the tail (80-300 ms).
        auto roomHighToLowDb = [](double sr, double dampVal) {
            auto proc = createFableColorTimeEffect(makeEffectJson("reverb", {
                {"fx.reverb.size", 0.5}, {"fx.reverb.mix", 1.0}, {"fx.reverb.type", 0}, {"fx.reverb.damp", dampVal},
            }));
            proc->prepare(sr);
            proc->reset();
            const int n = static_cast<int>(sr * 0.35);
            std::vector<float> buf(static_cast<std::size_t>(n) * 2, 0.0f);
            // Multi-tone burst spanning low (200-900 Hz) and high (5500-11000 Hz) bands, SR-independent.
            const int burstN = static_cast<int>(sr * 0.015);
            static constexpr std::array<double, 4> kLowHz{{240.0, 410.0, 620.0, 860.0}};
            static constexpr std::array<double, 4> kHighHz{{5800.0, 7300.0, 9100.0, 10800.0}};
            for (int i = 0; i < burstN; ++i) {
                const double t = static_cast<double>(i) / sr;
                const double win = 0.5 - 0.5 * std::cos(2.0 * kPi * static_cast<double>(i) / static_cast<double>(burstN));
                double s = 0.0;
                for (double f : kLowHz) {
                    s += 0.12 * std::sin(2.0 * kPi * f * t);
                }
                for (double f : kHighHz) {
                    s += 0.12 * std::sin(2.0 * kPi * f * t);
                }
                const float sample = static_cast<float>(s * win);
                buf[static_cast<std::size_t>(i) * 2] = sample;
                buf[static_cast<std::size_t>(i) * 2 + 1] = sample;
            }
            proc->process(buf, {sr, 0.0, 1000.0 / sr});

            Biquad lp;
            Biquad hp;
            lp.lowpass(1200.0, 0.707, sr);
            hp.highpass(4500.0, 0.707, sr);
            const int start = static_cast<int>(sr * 0.08);
            const int end = static_cast<int>(sr * 0.30);
            double eLo = 0.0;
            double eHi = 0.0;
            for (int i = 0; i < end; ++i) {
                const double x = buf[static_cast<std::size_t>(i) * 2];
                const double yLo = lp.process(x);
                const double yHi = hp.process(x);
                if (i >= start) {
                    eLo += yLo * yLo;
                    eHi += yHi * yHi;
                }
            }
            return 10.0 * std::log10(std::max(1e-18, eHi) / std::max(1e-18, eLo));
        };

        // 1. Sample-rate invariance of ROOM damping between 44.1 kHz and 96 kHz.
        const double ratio44 = roomHighToLowDb(44100.0, 0.5);
        const double ratio96 = roomHighToLowDb(96000.0, 0.5);
        QVERIFY2(std::abs(ratio96 - ratio44) < 3.0,
                 qPrintable(QStringLiteral("ROOM damping not SR-invariant: Hi/Lo @44.1=%1 dB, @96=%2 dB")
                                .arg(ratio44).arg(ratio96)));

        // 2. fx.reverb.damp must visibly darken ROOM mode tail (damp=1.0 vs damp=0.0).
        const double ratioBright = roomHighToLowDb(48000.0, 0.0);
        const double ratioDark = roomHighToLowDb(48000.0, 1.0);
        QVERIFY2(ratioBright - ratioDark > 6.0,
                 qPrintable(QStringLiteral("fx.reverb.damp did not darken ROOM mode: bright=%1 dB dark=%2 dB")
                                .arg(ratioBright).arg(ratioDark)));

        // 3. Switching fx.reverb.type on a live tail must crossfade without a hard click.
        auto rev = createFableColorTimeEffect(makeEffectJson("reverb", {
            {"fx.reverb.size", 0.9}, {"fx.reverb.mix", 1.0}, {"fx.reverb.type", 0},
        }));
        QVERIFY(rev != nullptr);
        rev->prepare(kRefRate);
        rev->reset();
        std::vector<float> warm(8192 * 2, 0.0f);
        for (int i = 0; i < 8192; ++i) {
            const float s = 0.6f * std::sin(static_cast<float>(2.0 * kPi * 220.0 * i / kRefRate));
            warm[static_cast<std::size_t>(i) * 2] = s;
            warm[static_cast<std::size_t>(i) * 2 + 1] = s;
        }
        rev->process(warm, {kRefRate, 0.0, 1000.0 / kRefRate});
        // Advance 1-sample steps on silence until we hit a strong live tail sample (avoiding a sine zero-crossing).
        float lastTail = warm[8191 * 2];
        for (int s = 0; s < 512 && std::abs(lastTail) < 0.08f; ++s) {
            std::array<float, 2> step{0.0f, 0.0f};
            rev->process(step, {kRefRate, (8192 + s) * 1000.0 / kRefRate, 1000.0 / kRefRate});
            lastTail = step[0];
        }
        QVERIFY2(std::abs(lastTail) >= 0.08f, qPrintable(QStringLiteral("Expected audible live tail, got %1").arg(lastTail)));

        QVERIFY(rev->setParameter("fx.reverb.type", 1.0));
        std::vector<float> after(1024 * 2, 0.0f);
        rev->process(after, {kRefRate, 8704.0 * 1000.0 / kRefRate, 1000.0 / kRefRate});
        const float firstJump = std::abs(after[0] - lastTail);
        // Hard reset jumps directly from lastTail to 0.0 (firstJump == |lastTail|).
        // Crossfade keeps first step small relative to live tail.
        QVERIFY2(firstJump < std::abs(lastTail) * 0.5f,
                 qPrintable(QStringLiteral("Reverb mode switch clicked: last=%1 first=%2 jump=%3")
                                .arg(lastTail).arg(after[0]).arg(firstJump)));
        // After crossfade completes (~5 ms = 240 smp), silence stays exact 0.0 (no stale tail leak).
        float latePeak = 0.0f;
        for (int i = 400; i < 1024; ++i) {
            latePeak = std::max(latePeak, std::abs(after[static_cast<std::size_t>(i) * 2]));
        }
        QCOMPARE(latePeak, 0.0f);
    }

    // D5: DriveOs2 must clamp before interpolate (no NaN latch) and clear filter state on full bypass.
    void driveOs2NanRecoveryAndBypassReset() {
        DriveOs2 os;
        const double wStep = 1.0 / (kDriveOsRampSec * kRefRate);
        auto sat = [](double a, double /*xp*/) { return std::tanh(3.5 * a) / std::tanh(3.5); };

        // Warm up active stage.
        for (int i = 0; i < 300; ++i) {
            (void)os.run(0.4 * std::sin(2.0 * kPi * 440.0 * i / kRefRate), true, true, 0.8, wStep, sat);
        }
        // Inject NaN and +Inf, then feed normal audio: must stay finite AND recover live signal (not latch NaN/0).
        const double yNan = os.run(std::numeric_limits<double>::quiet_NaN(), true, true, 0.8, wStep, sat);
        const double yInf = os.run(std::numeric_limits<double>::infinity(), true, true, 0.8, wStep, sat);
        QVERIFY2(std::isfinite(yNan) && std::isfinite(yInf), "DriveOs2 returned non-finite on NaN/Inf");
        double recoveryPeak = 0.0;
        for (int i = 0; i < 128; ++i) {
            const double y = os.run(0.35 * std::sin(2.0 * kPi * 440.0 * i / kRefRate), true, true, 0.8, wStep, sat);
            QVERIFY2(std::isfinite(y), qPrintable(QStringLiteral("DriveOs2 latched NaN at recovery sample %1").arg(i)));
            if (i >= 32) {
                recoveryPeak = std::max(recoveryPeak, std::abs(y));
            }
        }
        QVERIFY2(recoveryPeak > 0.15,
                 qPrintable(QStringLiteral("DriveOs2 failed to recover live audio after NaN: peak=%1").arg(recoveryPeak)));

        // Disengage until fully bypassed (w == 0) on a fresh instance: filter state must clear so re-engage on silence outputs 0.
        DriveOs2 os2;
        for (int i = 0; i < 400; ++i) {
            (void)os2.run(0.6, true, true, 0.8, wStep, sat);
        }
        for (int i = 0; i < 400; ++i) {
            (void)os2.run(0.6, false, true, 0.8, wStep, sat);
        }
        QCOMPARE(os2.w, 0.0);
        // Re-engage on exact silence: must not discharge stale DC from previous engaged period.
        double stalePeak = 0.0;
        for (int i = 0; i < 32; ++i) {
            stalePeak = std::max(stalePeak, std::abs(os2.run(0.0, true, true, 0.8, wStep, sat)));
        }
        QVERIFY2(stalePeak < 1e-12,
                 qPrintable(QStringLiteral("DriveOs2 discharged stale state after bypass: peak=%1").arg(stalePeak)));
    }

    // D6: Extreme finite floats (~3e38f) must not overflow channel sums to Inf/NaN.
    void extremeFiniteFloatOverflowSafety() {
        struct Case { const char* kind; QJsonObject params; };
        const std::vector<Case> cases = {
            {"drive", {{"fx.drive.amt", 0.8}, {"fx.drive.mix", 1.0}, {"fx.drive.type", 1}}},
            {"chorus", {{"fx.chorus.mix", 0.8}, {"fx.chorus.depth", 0.7}}},
            {"echo", {{"fx.delay.time", 0.04}, {"fx.delay.fb", 0.7}, {"fx.delay.mix", 0.8}, {"fx.delay.sat", 0.5}}},
            {"reverb", {{"fx.reverb.size", 0.8}, {"fx.reverb.mix", 0.8}, {"fx.reverb.type", 0}}},
            {"reverb", {{"fx.reverb.size", 0.8}, {"fx.reverb.mix", 0.8}, {"fx.reverb.type", 1}}},
        };
        for (const auto& c : cases) {
            auto proc = createFableColorTimeEffect(makeEffectJson(c.kind, c.params));
            QVERIFY(proc != nullptr);
            proc->prepare(kRefRate);
            proc->reset();
            std::vector<float> buf(1024 * 2, 0.0f);
            buf[0] = 3.0e38f;
            buf[1] = 3.0e38f;
            buf[2] = -3.0e38f;
            buf[3] = -3.0e38f;
            for (int i = 16; i < 1024; ++i) {
                const float s = 0.2f * std::sin(static_cast<float>(2.0 * kPi * 440.0 * i / kRefRate));
                buf[static_cast<std::size_t>(i) * 2] = s;
                buf[static_cast<std::size_t>(i) * 2 + 1] = s;
            }
            proc->process(buf, {kRefRate, 0.0, 1000.0 / kRefRate});
            for (std::size_t i = 0; i < buf.size(); ++i) {
                QVERIFY2(std::isfinite(buf[i]),
                         qPrintable(QStringLiteral("%1 produced non-finite at sample %2 on 3e38f input").arg(c.kind).arg(i)));
            }
        }
    }

    // D10: Chorus LFO rate invariance (44.1 vs 96 kHz) and 4x drive aliasing rejection.
    void chorusRateInvarianceAndDriveAliasingRejection() {
        // 1. Chorus LFO period at 44.1 kHz vs 96 kHz must match (4 Hz LFO -> peak correlation at T=0.25 s).
        auto measureChorusPeriodErr = [](double sr) {
            auto proc = createFableColorTimeEffect(makeEffectJson("chorus", {
                {"fx.chorus.rate", 4.0}, {"fx.chorus.depth", 0.9}, {"fx.chorus.mix", 1.0},
            }));
            proc->prepare(sr);
            proc->reset();
            const int n = static_cast<int>(sr * 1.0);
            std::vector<float> buf(static_cast<std::size_t>(n) * 2);
            for (int i = 0; i < n; ++i) {
                const float s = 0.4f * std::sin(static_cast<float>(2.0 * kPi * 1000.0 * i / sr));
                buf[static_cast<std::size_t>(i) * 2] = s;
                buf[static_cast<std::size_t>(i) * 2 + 1] = s;
            }
            proc->process(buf, {sr, 0.0, 1000.0 / sr});
            // Compare wet L channel at t=0.25 s vs t=0.50 s (1 full LFO cycle = 0.25 s, 1000 Hz also integer cycles).
            const int start = static_cast<int>(sr * 0.25);
            const int period = static_cast<int>(std::lround(sr * 0.25));
            const int win = static_cast<int>(sr * 0.05);
            double diffSq = 0.0;
            double refSq = 0.0;
            for (int i = 0; i < win; ++i) {
                const double a = buf[static_cast<std::size_t>(start + i) * 2];
                const double b = buf[static_cast<std::size_t>(start + period + i) * 2];
                diffSq += (a - b) * (a - b);
                refSq += a * a;
            }
            return std::sqrt(diffSq / std::max(1e-12, refSq));
        };
        const double err44 = measureChorusPeriodErr(44100.0);
        const double err96 = measureChorusPeriodErr(96000.0);
        QVERIFY2(err44 < 0.05 && err96 < 0.05,
                 qPrintable(QStringLiteral("Chorus 4 Hz LFO period mismatch: err44=%1 err96=%2").arg(err44).arg(err96)));

        // 2. 4x HalfBandFir drive suppresses folded aliasing from an 11 kHz sine at 48 kHz (3rd harmonic 33k -> 15k alias).
        auto proc = createFableColorTimeEffect(makeEffectJson("drive", {
            {"fx.drive.amt", 0.9}, {"fx.drive.mix", 1.0}, {"fx.drive.type", 0}, {"fx.drive.tone", 0.0},
        }));
        QVERIFY(proc != nullptr);
        proc->prepare(kRefRate);
        proc->reset();
        const int n = 8192;
        std::vector<float> buf(static_cast<std::size_t>(n) * 2);
        std::vector<float> naive(static_cast<std::size_t>(n));
        const double k = 1.0 + 0.9 * 12.0;
        const double pre = 1.0 + 0.9 * 2.0;
        const double norm = 1.0 / (pre * std::tanh(k));
        for (int i = 0; i < n; ++i) {
            const double x = 0.6 * std::sin(2.0 * kPi * 11000.0 * i / kRefRate);
            buf[static_cast<std::size_t>(i) * 2] = static_cast<float>(x);
            buf[static_cast<std::size_t>(i) * 2 + 1] = static_cast<float>(x);
            naive[static_cast<std::size_t>(i)] = static_cast<float>(std::tanh(pre * x * k) * norm);
        }
        proc->process(buf, {kRefRate, 0.0, 1000.0 / kRefRate});
        auto toneAmp = [](const auto& getSample, int start, int end, double fHz) {
            double re = 0.0, im = 0.0;
            const double w = 2.0 * kPi * fHz / kRefRate;
            for (int i = start; i < end; ++i) {
                const double v = getSample(i);
                re += v * std::cos(w * i);
                im += v * std::sin(w * i);
            }
            return std::hypot(re, im) / static_cast<double>(end - start);
        };
        const double aliasOs = toneAmp([&](int i) { return buf[static_cast<std::size_t>(i) * 2]; }, 1024, 7168, 15000.0);
        const double aliasNaive = toneAmp([&](int i) { return naive[static_cast<std::size_t>(i)]; }, 1024, 7168, 15000.0);
        const double rejectionDb = 20.0 * std::log10(std::max(1e-12, aliasNaive) / std::max(1e-12, aliasOs));
        QVERIFY2(rejectionDb > 40.0,
                 qPrintable(QStringLiteral("4x drive 15 kHz alias rejection too low: %1 dB (os=%2 naive=%3)")
                                .arg(rejectionDb).arg(aliasOs).arg(aliasNaive)));
    }

    void sampleRatesAndDenormalSafety() {
        const std::array<double, 3> rates = {44100.0, 48000.0, 96000.0};
        const std::array<const char*, 4> kinds = {"drive", "chorus", "echo", "reverb"};

        for (double sr : rates) {
            for (const char* kind : kinds) {
                QJsonObject p;
                if (std::string_view(kind) == "drive") {
                    p = {{"fx.drive.amt", 0.6}, {"fx.drive.type", 1}, {"fx.drive.tone", 0.4}};
                } else if (std::string_view(kind) == "reverb") {
                    p = {{"fx.reverb.size", 0.7}, {"fx.reverb.mix", 0.5}, {"fx.reverb.type", 1}};
                }
                auto proc = createFableColorTimeEffect(makeEffectJson(kind, p));
                QVERIFY(proc != nullptr);
                proc->prepare(sr);

                std::vector<float> L, R;
                makeTestSignal(L, R, 1024, sr, 0.5f);
                auto stereo = interleave(L, R);
                proc->process(stereo, {sr, 0.0, 1000.0 / sr});
                for (float v : stereo) {
                    QVERIFY2(std::isfinite(v), qPrintable(QStringLiteral("Non-finite output for %1 at %2 Hz").arg(kind).arg(sr)));
                }

                // Subnormal + NaN + Inf injection must stay finite.
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

                // Also exercise ROOM reverb at each sample rate.
                if (std::string_view(kind) == "reverb") {
                    QVERIFY(proc->setParameter("fx.reverb.type", 0.0));
                    proc->process(poison, {sr, 1280.0 * 1000.0 / sr, 1000.0 / sr});
                    for (float v : poison) {
                        QVERIFY2(std::isfinite(v), qPrintable(QStringLiteral("ROOM reverb poison non-finite at %1 Hz").arg(sr)));
                    }
                }
            }
        }
    }

    void latencyReportingForPdc() {
        const std::array<double, 3> rates = {44100.0, 48000.0, 96000.0};
        for (double sr : rates) {
            for (const char* zeroKind : {"chorus", "echo", "reverb"}) {
                auto proc = createFableColorTimeEffect(makeEffectJson(zeroKind));
                QVERIFY(proc != nullptr);
                proc->prepare(sr);
                QCOMPARE(proc->latencySamples(), 0);
                QCOMPARE(proc->effectiveLatencySamples(), 0);
            }

            // Drive has exact 4x HalfBandFir linear-phase latency (kDriveLatency = 35 samples) at every rate.
            auto drive = createFableColorTimeEffect(makeEffectJson("drive", {{"fx.drive.amt", 0.0}, {"fx.drive.mix", 1.0}}));
            QVERIFY(drive != nullptr);
            drive->prepare(sr);
            QCOMPARE(drive->latencySamples(), kDriveLatency);
            QCOMPARE(drive->effectiveLatencySamples(), kDriveLatency);

            drive->setBypassed(true);
            QCOMPARE(drive->effectiveLatencySamples(), 0);
            drive->setBypassed(false);
            QCOMPARE(drive->effectiveLatencySamples(), kDriveLatency);

            // Both 100% wet (4x FIR) and 0% wet (dry DelayLine) impulses land on exact frame kDriveLatency (35).
            for (double mixVal : {0.0, 1.0}) {
                QVERIFY(drive->setParameter("fx.drive.mix", mixVal));
                drive->reset();
                const int N = kDriveLatency + 64;
                std::vector<float> impulse(static_cast<std::size_t>(N) * 2, 0.0f);
                impulse[0] = 0.25f;
                impulse[1] = 0.25f;
                drive->process(impulse, {sr, 0.0, 1000.0 / sr});
                int peakFrame = -1;
                float peakVal = 0.0f;
                for (int i = 0; i < N; ++i) {
                    const float v = std::abs(impulse[static_cast<std::size_t>(i) * 2]);
                    if (v > peakVal) {
                        peakVal = v;
                        peakFrame = i;
                    }
                }
                QCOMPARE(peakFrame, kDriveLatency);
                QVERIFY(peakVal > 0.15f);
            }
        }
    }

    void zeroAudioThreadAllocations() {
        QVERIFY2(nt::testing::countsAnAllocation(), "Allocation counter control check failed");

        const std::array<const char*, 4> kinds = {"drive", "chorus", "echo", "reverb"};
        for (const char* kind : kinds) {
            auto proc = createFableColorTimeEffect(makeEffectJson(kind));
            QVERIFY(proc != nullptr);
            proc->prepare(kRefRate);

            std::vector<float> stereo(kMixBlockFrames * 2, 0.25f);
            const auto params = fableColorTimeParams(kind);

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

        struct BenchCase {
            const char* label;
            const char* kind;
            QJsonObject params;
        };
        const std::vector<BenchCase> cases = {
            {"drive", "drive", {{"fx.drive.amt", 0.65}, {"fx.drive.mix", 1.0}, {"fx.drive.type", 1}, {"fx.drive.tone", 0.3}}},
            {"chorus", "chorus", {{"fx.chorus.rate", 0.8}, {"fx.chorus.depth", 0.6}, {"fx.chorus.mix", 0.5}}},
            {"echo", "echo", {{"fx.delay.time", 0.36}, {"fx.delay.fb", 0.5}, {"fx.delay.mix", 0.4}, {"fx.delay.sat", 0.3}, {"fx.delay.wow", 0.2}, {"fx.delay.flutter", 0.15}}},
            {"reverb(room)", "reverb", {{"fx.reverb.size", 0.65}, {"fx.reverb.mix", 0.4}, {"fx.reverb.type", 0}}},
            {"reverb(plate)", "reverb", {{"fx.reverb.size", 0.65}, {"fx.reverb.mix", 0.4}, {"fx.reverb.type", 1}, {"fx.reverb.damp", 0.4}}},
        };

        for (const auto& c : cases) {
            auto proc = createFableColorTimeEffect(makeEffectJson(c.kind, c.params));
            QVERIFY(proc != nullptr);
            proc->prepare(kRefRate);
            proc->reset();

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
            std::fprintf(stderr, "[FX2 CPU] %-14s: %.3f ms for %.1f s audio (%.3f%% RT), latency=%d samples\n",
                         c.label, elapsedSec * 1000.0, kSeconds, cpuPct, proc->latencySamples());
            QVERIFY2(cpuPct < kMaxCpuPct,
                     qPrintable(QStringLiteral("%1 CPU %2% exceeded bound %3%").arg(c.label).arg(cpuPct, 0, 'f', 3).arg(kMaxCpuPct, 0, 'f', 1)));
        }
    }
};

QTEST_APPLESS_MAIN(TestFableColorTime)
#include "tst_fablecolortime.moc"
