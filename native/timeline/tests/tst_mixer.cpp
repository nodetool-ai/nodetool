// The mixer (PLAN M3 exit 1, DESIGN.md D25 and D26): which clips sound
// (buildMixPlan, the web rules of renderAudio.ts and clipAudio.ts), and the
// sample-by-sample mix of mixBlock: gain, the four fade curves, a cross-fade,
// the in-point, the clip speed and the pan. Expectations are written from
// the web formulas, not from the C++ code. Also the PCM ring path that the
// device callback uses, and the audio source decode and seek.

#include "audio/AudioEngine.h"
#include "audio/AudioSource.h"
#include "audio/DenormalGuard.h"
#include "audio/FadeCurves.h"
#include "audio/MasterLimiter.h"
#include "audio/Mixer.h"
#include "audio/PcmRing.h"
#include "audio/SincResampler.h"
#include "audio/TestAllocationCounter.h"
#include "audio/loudness/LiveLoudness.h"
#include "audio/loudness/Loudness.h"
#include "model/TimelineJson.h"
#include "scene/ClipScene.h"

#include <QFileInfo>
#include <QJsonArray>
#include <QProcess>
#include <QScopeGuard>
#include <QTemporaryDir>
#include <QtTest>

#include <atomic>
#include <cfenv>
#include <cmath>
#include <numbers>

using namespace nt;
using namespace nt::audio;

namespace {

constexpr double kRate = 48000.0;

Track track(const std::string& id, TrackType type) {
    Track t;
    t.id = id;
    t.name = id;
    t.type = type;
    return t;
}

Clip clip(const std::string& id, const std::string& trackId, MediaType type, double startMs, double durationMs) {
    Clip c;
    c.id = id;
    c.trackId = trackId;
    c.mediaType = type;
    c.startMs = startMs;
    c.durationMs = durationMs;
    c.status = "generated";
    c.mediaPath = "unused.wav";
    return c;
}

// Source PCM where frame f holds (f * 1e-5, -f * 1e-5): every frame is
// distinct, so a wrong source frame shows.
std::vector<float> ramp(std::int64_t frames) {
    std::vector<float> pcm(static_cast<std::size_t>(frames) * 2);
    for (std::int64_t f = 0; f < frames; ++f) {
        pcm[2 * f] = static_cast<float>(f * 1e-5);
        pcm[2 * f + 1] = static_cast<float>(-f * 1e-5);
    }
    return pcm;
}

// Mixes `frames` frames from timeline time `fromMs`, each voice reading `pcm`.
std::vector<float> mix(const MixPlan& plan, const std::vector<float>& pcm, double fromMs, int frames,
                       MixStats* statsOut = nullptr) {
    std::vector<VoicePcm> views(plan.voices.size());
    for (auto& v : views) {
        v.linear = pcm.data();
        v.linearCount = static_cast<std::int64_t>(pcm.size() / 2);
    }
    std::vector<float> out(static_cast<std::size_t>(frames) * 2);
    MixStats stats;
    mixBlock(plan, views.data(), kRate, fromMs, 1000.0 / kRate, frames, out.data(), stats);
    if (statsOut) *statsOut = stats;
    return out;
}

double frameMs(int frame) {
    return frame * 1000.0 / kRate;
}

// A clip keyed on its Volume through the param curve the Effect Controls row writes.
Clip keyedClip(const std::string& id, const std::string& trackId, double durationMs, double staticDb,
               const QJsonArray& keys) {
    Clip c = clip(id, trackId, MediaType::Audio, 0.0, durationMs);
    c.volumeDb = staticDb;
    const QJsonObject curve{{"property", "volumeDb"}, {"keyframes", keys}};
    c.raw = QJsonObject{{"id", QString::fromStdString(id)}, {"volumeDb", staticDb},
                        {"paramCurves", QJsonArray{curve}}};
    c.scene = scene::parseClipScene(c.raw);
    return c;
}
QJsonObject key(double t, double value, const QString& easing = {}) {
    QJsonObject k{{"t", t}, {"value", value}};
    if (!easing.isEmpty()) k.insert("easing", easing);
    return k;
}
// A held level, so the output is the gain.
std::vector<float> steady(std::int64_t frames, float level = 0.5f) {
    return std::vector<float>(static_cast<std::size_t>(frames) * 2, level);
}
double db(double value) { return std::pow(10.0, value / 20.0); }

}  // namespace

class TstMixer : public QObject {
    Q_OBJECT

private slots:
    void gainChain() {
        Timeline tl;
        tl.masterVolumeDb = -2.0;
        Track a = track("a", TrackType::Audio);
        a.volumeDb = 3.0;
        tl.tracks = {a};
        Clip c = clip("c", "a", MediaType::Audio, 0.0, 1000.0);
        c.volumeDb = -6.0;
        tl.clips = {c};
        const MixPlan plan = buildMixPlan(tl);
        QCOMPARE(plan.voices.size(), std::size_t(1));
        const auto pcm = ramp(48000);
        const auto out = mix(plan, pcm, 0.0, 4800);
        const double g = std::pow(10.0, -6.0 / 20.0) * std::pow(10.0, 3.0 / 20.0) * std::pow(10.0, -2.0 / 20.0);
        for (int f = 0; f < 4800; f += 97) {
            QCOMPARE(out[2 * f], static_cast<float>(static_cast<double>(pcm[2 * f]) * g));
            QCOMPARE(out[2 * f + 1], static_cast<float>(static_cast<double>(pcm[2 * f + 1]) * g));
        }
    }

    // Timeline 1000 ms + k reads source frame inPoint * 48 + k: sample exact.
    void inPointAndPlacement() {
        Timeline tl;
        tl.tracks = {track("a", TrackType::Audio)};
        Clip c = clip("c", "a", MediaType::Audio, 1000.0, 2000.0);
        c.inPointMs = 500.0;
        tl.clips = {c};
        const auto pcm = ramp(200000);
        const auto out = mix(buildMixPlan(tl), pcm, 900.0, 48000);
        const int startFrame = 4800;  // 100 ms after 900 ms
        for (int f = 0; f < startFrame; ++f) QCOMPARE(out[2 * f], 0.0f);
        for (int k = 0; k < 48000 - startFrame; k += 31) {
            QCOMPARE(out[2 * (startFrame + k)], pcm[2 * (24000 + k)]);
            QCOMPARE(out[2 * (startFrame + k) + 1], pcm[2 * (24000 + k) + 1]);
        }
        // The clip ends at 3000 ms: frame 0 of a mix from 3000 ms is silent,
        // the frame before it is the last source frame.
        const auto tail = mix(buildMixPlan(tl), pcm, 3000.0 - frameMs(1), 2);
        QCOMPARE(tail[0], pcm[2 * (24000 + 96000 - 1)]);
        QCOMPARE(tail[2], 0.0f);
    }

    // The four curves on a 1000 ms fade-in and a 500 ms fade-out, against
    // the audioFade.ts formulas written out here.
    void fadeShapes_data() {
        QTest::addColumn<QString>("shape");
        QTest::newRow("linear") << "linear";
        QTest::newRow("sCurve") << "sCurve";
        QTest::newRow("plus3dB") << "plus3dB";
        QTest::newRow("minus3dB") << "minus3dB";
    }
    void fadeShapes() {
        QFETCH(QString, shape);
        const auto curve = [&](double t) {
            if (shape == u"sCurve") return (1.0 - std::cos(t * std::numbers::pi)) / 2.0;
            if (shape == u"plus3dB") return std::sin(t * std::numbers::pi / 2.0);
            if (shape == u"minus3dB") return 2.0 / std::numbers::pi * std::asin(t);
            return t;
        };
        Timeline tl;
        tl.tracks = {track("a", TrackType::Audio)};
        Clip c = clip("c", "a", MediaType::Audio, 0.0, 3000.0);
        c.fadeInMs = 1000.0;
        c.fadeOutMs = 500.0;
        c.fadeInShape = shape.toStdString();
        c.fadeOutShape = shape.toStdString();
        tl.clips = {c};
        std::vector<float> dc(static_cast<std::size_t>(3 * 48000) * 2, 0.5f);
        const auto out = mix(buildMixPlan(tl), dc, 0.0, 3 * 48000);
        for (int f = 0; f < 3 * 48000; f += 113) {
            const double ms = frameMs(f);
            double g = 1.0;
            if (ms < 1000.0) g = std::min(g, curve(ms / 1000.0));
            if (ms > 2500.0) g = std::min(g, curve((3000.0 - ms) / 500.0));
            QVERIFY2(std::abs(out[2 * f] - 0.5 * g) < 1e-7,
                     qPrintable(QStringLiteral("%1 ms: %2 vs %3").arg(ms).arg(out[2 * f]).arg(0.5 * g)));
        }
        QCOMPARE(out[2 * 48000 / 4], static_cast<float>(0.5 * curve(0.25)));  // 250 ms, exact
    }

    void storedZeroFadeOverridesAutomaticCrossfade_data() {
        QTest::addColumn<bool>("explicitIn");
        QTest::addColumn<bool>("explicitOut");
        QTest::newRow("absent") << false << false;
        QTest::newRow("zero-in") << true << false;
        QTest::newRow("zero-out") << false << true;
        QTest::newRow("zero-both") << true << true;
    }
    void storedZeroFadeOverridesAutomaticCrossfade() {
        QFETCH(bool, explicitIn);
        QFETCH(bool, explicitOut);
        QJsonObject first{{"id", "first"}, {"trackId", "a"}, {"mediaType", "audio"},
                          {"startMs", 0}, {"durationMs", 1000}, {"mediaPath", "unused.wav"}, {"status", "generated"}};
        QJsonObject second = first;
        second.insert("id", "second");
        second.insert("startMs", 1000);
        if (explicitOut) { first.insert("fadeOutMs", 0); }
        if (explicitIn) { second.insert("fadeInMs", 0); }
        const auto parsed = parseTimeline(QJsonObject{
            {"durationMs", 2000}, {"music", QJsonObject{{"autoCrossfadeMs", 10}}},
            {"tracks", QJsonArray{QJsonObject{{"id", "a"}, {"type", "audio"}}}},
            {"clips", QJsonArray{first, second}}});
        if (!parsed.timeline.has_value()) { QFAIL(qPrintable(parsed.error)); }
        const auto plan = buildMixPlan(*parsed.timeline);
        QCOMPARE(plan.voices.size(), std::size_t{2});
        QCOMPARE(plan.voices[0].fades.fadeOutMs, explicitOut ? 0.0 : 5.0);
        QCOMPARE(plan.voices[1].fades.fadeInMs, explicitIn ? 0.0 : 5.0);
    }

    // Two clips that overlap by 500 ms on one track, both on plus3dB (the
    // audioCrossfade.ts result): constant power through the change.
    void crossfade() {
        Timeline tl;
        tl.tracks = {track("a", TrackType::Audio)};
        Clip out = clip("out", "a", MediaType::Audio, 0.0, 2500.0);
        out.fadeOutMs = 500.0;
        out.fadeOutShape = "plus3dB";
        Clip in = clip("in", "a", MediaType::Audio, 2000.0, 2000.0);
        in.fadeInMs = 500.0;
        in.fadeInShape = "plus3dB";
        tl.clips = {out, in};
        const MixPlan plan = buildMixPlan(tl);
        QCOMPARE(plan.voices.size(), std::size_t(2));
        // Voice 0 reads +1, voice 1 reads +1 as well; power = gA^2 + gB^2.
        std::vector<float> one(static_cast<std::size_t>(4 * 48000) * 2, 1.0f);
        std::vector<VoicePcm> views(2);
        for (auto& v : views) {
            v.linear = one.data();
            v.linearCount = 4 * 48000;
        }
        std::vector<float> buf(24000 * 2);
        MixStats stats;
        mixBlock(plan, views.data(), kRate, 2000.0, 1000.0 / kRate, 24000, buf.data(), stats);
        for (int f = 0; f < 24000; f += 101) {
            const double t = frameMs(f) / 500.0;  // progress through the overlap
            const double gOut = std::sin((1.0 - t) * std::numbers::pi / 2.0);
            const double gIn = std::sin(t * std::numbers::pi / 2.0);
            QVERIFY(std::abs(buf[2 * f] - (gOut + gIn)) < 1e-6);
            QVERIFY(std::abs(gOut * gOut + gIn * gIn - 1.0) < 1e-12);
        }
        // Midpoint: both at sin(pi/4).
        QVERIFY(std::abs(buf[2 * 12000] - 2.0 * std::sin(std::numbers::pi / 4.0)) < 1e-6);
    }

    // speedMultiplier 2 reads two source frames per timeline frame; a baked
    // speed reads 1:1; 1.5 interpolates between neighbours.
    void speed() {
        Timeline tl;
        tl.tracks = {track("a", TrackType::Audio)};
        Clip c = clip("c", "a", MediaType::Audio, 0.0, 1000.0);
        c.inPointMs = 100.0;
        c.speedMultiplier = 2.0;
        tl.clips = {c};
        const auto pcm = ramp(200000);
        auto out = mix(buildMixPlan(tl), pcm, 0.0, 4800);
        for (int k = 0; k < 4800; k += 17) QCOMPARE(out[2 * k], pcm[2 * (4800 + 2 * k)]);

        tl.clips[0].speedBaked = true;
        out = mix(buildMixPlan(tl), pcm, 0.0, 4800);
        for (int k = 0; k < 4800; k += 17) QCOMPARE(out[2 * k], pcm[2 * (4800 + k)]);

        tl.clips[0].speedBaked = false;
        tl.clips[0].speedMultiplier = 1.5;
        out = mix(buildMixPlan(tl), pcm, 0.0, 4800);
        for (int k = 1; k < 4800; k += 2) {
            const double s = 4800 + 1.5 * k;
            const double expected = (s * 1e-5);
            QVERIFY(std::abs(out[2 * k] - expected) < 1e-6);
        }
    }

    // StereoPannerNode on a stereo input: pan -1 folds R into L, pan +1 folds
    // L into R, pan 0 is the identity.
    void pan() {
        Timeline tl;
        Track a = track("a", TrackType::Audio);
        a.pan = -1.0;
        tl.tracks = {a};
        tl.clips = {clip("c", "a", MediaType::Audio, 0.0, 1000.0)};
        std::vector<float> lr(48000 * 2);
        for (int f = 0; f < 48000; ++f) {
            lr[2 * f] = 0.25f;
            lr[2 * f + 1] = 0.5f;
        }
        auto out = mix(buildMixPlan(tl), lr, 0.0, 10);
        QVERIFY(std::abs(out[0] - 0.75f) < 1e-7f);
        QVERIFY(std::abs(out[1]) < 1e-7f);
        tl.tracks[0].pan = 1.0;
        out = mix(buildMixPlan(tl), lr, 0.0, 10);
        QVERIFY(std::abs(out[0]) < 1e-7f);
        QVERIFY(std::abs(out[1] - 0.75f) < 1e-7f);
        tl.tracks[0].pan = 0.5;
        out = mix(buildMixPlan(tl), lr, 0.0, 10);
        const double x = 0.5 * std::numbers::pi / 2.0;
        QVERIFY(std::abs(out[0] - 0.25 * std::cos(x)) < 1e-7);
        QVERIFY(std::abs(out[1] - (0.5 + 0.25 * std::sin(x))) < 1e-7);
    }

    // Which clips sound: mute, solo, status, the extracted-audio link, and a
    // video clip's own audio.
    void muteSoloAndOwnAudio() {
        Timeline tl;
        Track v = track("v", TrackType::Video);
        Track a1 = track("a1", TrackType::Audio);
        Track a2 = track("a2", TrackType::Audio);
        tl.tracks = {v, a1, a2};
        Clip video = clip("video", "v", MediaType::Video, 0.0, 1000.0);
        Clip linkedVideo = clip("linkedVideo", "v", MediaType::Video, 1000.0, 1000.0);
        linkedVideo.linkId = "L";
        Clip extracted = clip("extracted", "a1", MediaType::Audio, 1000.0, 1000.0);
        extracted.linkId = "L";
        Clip music = clip("music", "a2", MediaType::Audio, 0.0, 2000.0);
        Clip failed = clip("failed", "a2", MediaType::Audio, 2000.0, 1000.0);
        failed.status = "failed";
        Clip mutedClip = clip("mutedClip", "a2", MediaType::Audio, 3000.0, 1000.0);
        mutedClip.muted = true;
        tl.clips = {video, linkedVideo, extracted, music, failed, mutedClip};

        const auto ids = [](const MixPlan& p) {
            QStringList out;
            for (const auto& voice : p.voices) out << QString::fromStdString(voice.clipId);
            out.sort();
            return out;
        };
        QCOMPARE(ids(buildMixPlan(tl)), (QStringList{"extracted", "music", "video"}));

        // A video track's own audio keeps unity gain and centre pan.
        tl.tracks[0].volumeDb = -12.0;
        tl.tracks[0].pan = 1.0;
        for (const auto& voice : buildMixPlan(tl).voices) {
            if (voice.clipId == "video") {
                QCOMPARE(voice.trackGain, 1.0);
                QCOMPARE(voice.pan, 0.0);
                QVERIFY(voice.videoOwnAudio);
            }
        }

        tl.tracks[2].solo = true;  // solo a2: a1 and every video's own audio go silent
        QCOMPARE(ids(buildMixPlan(tl)), (QStringList{"music"}));
        tl.tracks[2].solo = false;
        tl.tracks[1].muted = true;  // the extracted clip stays the stand-in: the video does not resurface
        QCOMPARE(ids(buildMixPlan(tl)), (QStringList{"music", "video"}));
        tl.tracks[0].muted = true;
        QCOMPARE(ids(buildMixPlan(tl)), (QStringList{"music"}));

        // A muted track renders exactly zero.
        const MixPlan plan = buildMixPlan(tl);
        const auto out = mix(plan, ramp(48000 * 4), 1000.0, 4800);
        for (int f = 0; f < 4800; ++f) {
            const float expected = static_cast<float>(1e-5 * (48000 + f));
            QCOMPARE(out[2 * f], expected);  // only "music", in-point 0
        }
    }

    // The device path reads rings: the same samples as the linear path, an
    // underrun when a frame is not written yet, and silence (no underrun)
    // past the end of the source.
    void ringPath() {
        Timeline tl;
        tl.tracks = {track("a", TrackType::Audio)};
        tl.clips = {clip("c", "a", MediaType::Audio, 0.0, 10000.0)};
        const MixPlan plan = buildMixPlan(tl);
        const auto pcm = ramp(48000);
        PcmRing ring(16384, 0);
        QCOMPARE(ring.write(pcm.data(), 9600), std::int64_t(9600));
        VoicePcm view;
        view.ring = &ring;
        std::vector<float> out(9600 * 2);  // the largest block below
        MixStats stats;
        mixBlock(plan, &view, kRate, 0.0, 1000.0 / kRate, 4800, out.data(), stats);
        QCOMPARE(stats.underruns, std::int64_t(0));
        for (int f = 0; f < 4800; f += 7) QCOMPARE(out[2 * f], pcm[2 * f]);
        QVERIFY(ring.readFloor() >= 4798);  // released up to the next read
        // The ring holds 9600 frames: the block 4800..14400 runs dry.
        mixBlock(plan, &view, kRate, frameMs(4800), 1000.0 / kRate, 9600, out.data(), stats);
        QCOMPARE(stats.underruns, std::int64_t(1));
        // At the source end the missing frames are silence.
        ring.markEnd(9600);
        MixStats tail;
        mixBlock(plan, &view, kRate, frameMs(9600), 1000.0 / kRate, 4800, out.data(), tail);
        QCOMPARE(tail.underruns, std::int64_t(0));
        QCOMPARE(out[0], 0.0f);
        // The producer reuses the released frames.
        QVERIFY(ring.freeFrames() > 16384 - 9600);
    }

    // A server open with a ready proxy: `mediaPath` is the proxy, which has
    // no audio stream, and `audioPath` is the original. The sound reads
    // `audioPath`. An audio clip can have `audioPath` only.
    void audioReadsAudioPath() {
        const std::string noAudio = NT_FIXTURES_DIR "/media/numbered-a-1080p30.mp4";
        const std::string tone = NT_FIXTURES_DIR "/media/tone-220-48k-mono.wav";
        Timeline tl;
        tl.tracks = {track("v", TrackType::Video), track("a", TrackType::Audio)};
        Clip video = clip("video", "v", MediaType::Video, 0.0, 1000.0);
        video.mediaPath = noAudio;
        video.audioPath = tone;
        Clip audio = clip("audio", "a", MediaType::Audio, 1000.0, 1000.0);
        audio.mediaPath.clear();
        audio.audioPath = tone;
        tl.clips = {video, audio};
        tl.durationMs = 2000.0;
        const MixPlan plan = buildMixPlan(tl);
        QCOMPARE(plan.voices.size(), std::size_t(2));
        for (const auto& v : plan.voices) QCOMPARE(v.mediaPath, tone);

        std::vector<std::string> problems;
        const auto mixed = renderOffline(tl, 48000, 0.0, 2000.0, &problems);
        QVERIFY2(problems.empty(), problems.empty() ? "" : problems.front().c_str());
        std::string error;
        const auto ref = AudioSource::open(tone, 48000, &error)->readAll();
        // Both halves are the tone from its start (in-point 0), sample exact.
        for (int f = 0; f < 48000; f += 101) {
            QCOMPARE(mixed[2 * f], ref[2 * f]);
            QCOMPARE(mixed[2 * (48000 + f)], ref[2 * f]);
        }
        double energy = 0.0;
        for (float x : mixed) energy += static_cast<double>(x) * x;
        QVERIFY(energy > 1.0);
    }

    // Two times, two levels: the key sits on top of the static level, in the mix.
    void keyedVolumeSetsTheGain() {
        Timeline tl;
        tl.tracks = {track("a", TrackType::Audio)};
        tl.clips = {keyedClip("c", "a", 1000.0, -6.0, {key(0, 0), key(1, -12)})};
        tl.durationMs = 1000.0;
        const auto plan = buildMixPlan(tl);
        QCOMPARE(plan.voices.size(), std::size_t(1));
        const auto pcm = steady(48000);
        const auto at = [&](double ms) { return mix(plan, pcm, ms, 2)[0]; };
        QCOMPARE_LE(std::abs(at(0.0) - 0.5 * db(-6)), 1e-5);
        QCOMPARE_LE(std::abs(at(500.0) - 0.5 * db(-12)), 2e-4);
        QCOMPARE_LE(std::abs(at(999.0) - 0.5 * db(-18)), 2e-4);
    }
    // Clip keys and track automation multiply, as Premiere's clip and track volume do (D20).
    void keyedVolumeMultipliesWithTheTrack() {
        Timeline tl;
        Track a = track("a", TrackType::Audio);
        a.volumeDb = -3.0;
        tl.tracks = {a};
        tl.clips = {keyedClip("c", "a", 1000.0, 0.0, {key(0, -6), key(1, -6)})};
        tl.durationMs = 1000.0;
        const auto plan = buildMixPlan(tl);
        const auto pcm = steady(48000);
        QCOMPARE_LE(std::abs(mix(plan, pcm, 500.0, 2)[0] - 0.5 * db(-9)), 1e-5);
    }
    // No two samples differ by much, even across a hold, where the value changes in one instant.
    void keyedVolumeNeverClicks_data() {
        QTest::addColumn<QString>("easing");
        for (const auto* easing : {"linear", "easeInOut", "hold", "easeOutBounce", "cubic-bezier(0.9,0,0.1,1)"}) {
            QTest::newRow(easing) << QString::fromLatin1(easing);
        }
    }
    void keyedVolumeNeverClicks() {
        QFETCH(QString, easing);
        Timeline tl;
        tl.tracks = {track("a", TrackType::Audio)};
        tl.clips = {keyedClip("c", "a", 1000.0, 0.0, {key(0, 0), key(0.5, -40, easing), key(1, 0, easing)})};
        tl.durationMs = 1000.0;
        const auto plan = buildMixPlan(tl);
        const auto pcm = steady(48000);
        const auto out = mix(plan, pcm, 0.0, 48000);
        double largest = 0;
        for (std::size_t i = 2; i + 2 < out.size(); i += 2) {
            largest = std::max(largest, std::abs(static_cast<double>(out[i]) - out[i - 2]));
        }
        // 40 dB moves a 0.5 level by 0.495. Over the ramp, 5 ms or 240 frames, a step is about 0.002.
        QVERIFY2(largest < 0.0035, qPrintable(QString::number(largest)));
        // The keys were reached.
        QCOMPARE_LE(std::abs(out[0] - 0.5), 1e-4);
        QCOMPARE_LE(std::abs(out[48000] - 0.5 * db(-40)), 1e-3);
    }
    // Two keys at one instant: the later value wins, after a ramp.
    void keyedVolumeRepeatedTime() {
        Timeline tl;
        tl.tracks = {track("a", TrackType::Audio)};
        tl.clips = {keyedClip("c", "a", 1000.0, 0.0, {key(0, -40), key(0.5, -40), key(0.5, 0), key(1, 0)})};
        tl.durationMs = 1000.0;
        const auto plan = buildMixPlan(tl);
        const auto pcm = steady(48000);
        const auto out = mix(plan, pcm, 0.0, 48000);
        QCOMPARE_LE(std::abs(out[2 * 12000] - 0.5 * db(-40)), 1e-4);
        QCOMPARE_LE(std::abs(out[2 * 36000] - 0.5), 1e-4);
        double largest = 0;
        for (std::size_t i = 2; i + 2 < out.size(); i += 2) { largest = std::max(largest, std::abs(static_cast<double>(out[i]) - out[i - 2])); }
        QVERIFY2(largest < 0.0035, qPrintable(QString::number(largest)));
    }
    // A hold between keys far closer together than the ramp still ramps.
    void keyedVolumeCloseHoldKeys() {
        Timeline tl;
        tl.tracks = {track("a", TrackType::Audio)};
        tl.clips = {keyedClip("c", "a", 1000.0, 0.0, {key(0, 0), key(0.5, 0), key(0.50001, -40, "hold"), key(1, -40)})};
        tl.durationMs = 1000.0;
        const auto plan = buildMixPlan(tl);
        const auto pcm = steady(48000);
        const auto out = mix(plan, pcm, 0.0, 48000);
        QCOMPARE_LE(std::abs(out[2 * 12000] - 0.5), 1e-4);
        QCOMPARE_LE(std::abs(out[2 * 36000] - 0.5 * db(-40)), 1e-4);
        double largest = 0;
        for (std::size_t i = 2; i + 2 < out.size(); i += 2) { largest = std::max(largest, std::abs(static_cast<double>(out[i]) - out[i - 2])); }
        QVERIFY2(largest < 0.0035, qPrintable(QString::number(largest)));
    }
    // The same plan in any block size, as the device and the export ask for it.
    void keyedVolumeIgnoresBlockSize() {
        Timeline tl;
        tl.tracks = {track("a", TrackType::Audio)};
        tl.clips = {keyedClip("c", "a", 1000.0, -3.0, {key(0, 0), key(0.3, -24, "easeIn"), key(1, 6, "hold")})};
        tl.durationMs = 1000.0;
        const auto plan = buildMixPlan(tl);
        const auto pcm = steady(48000);
        const auto whole = mix(plan, pcm, 0.0, 48000);
        for (const int block : {128, 137, 4096}) {
            std::vector<float> pieces;
            for (int at = 0; at < 48000; at += block) {
                const int n = std::min(block, 48000 - at);
                const auto part = mix(plan, pcm, frameMs(at), n);
                pieces.insert(pieces.end(), part.begin(), part.end());
            }
            QCOMPARE(pieces.size(), whole.size());
            for (std::size_t i = 0; i < pieces.size(); ++i) {
                if (std::abs(pieces[i] - whole[i]) > 1e-5f) { QFAIL(qPrintable(QString("sample %1 at block %2").arg(i).arg(block))); }
            }
        }
    }
    // The audio thread only reads the plan.
    void keyedVolumeAllocatesNothing() {
        Timeline tl;
        tl.tracks = {track("a", TrackType::Audio)};
        tl.clips = {keyedClip("c", "a", 1000.0, 0.0, {key(0, 0), key(1, -24, "easeInOut")})};
        tl.durationMs = 1000.0;
        const auto plan = buildMixPlan(tl);
        prepareMixPlan(plan, kRate);
        const auto pcm = steady(48000);
        VoicePcm view;
        view.linear = pcm.data();
        view.linearCount = 48000;
        std::vector<float> out(2 * 128);
        MixStats stats;
        nt::testing::allocations = 0;
        nt::testing::countAllocations = true;
        for (int block = 0; block < 100; ++block) {
            mixBlock(plan, &view, kRate, frameMs(block * 128), 1000.0 / kRate, 128, out.data(), stats);
        }
        nt::testing::countAllocations = false;
        QCOMPARE(std::size_t{nt::testing::allocations}, std::size_t{0});
    }
    // The export's render and a block mix of the same PCM give the same samples.
    void keyedVolumeOfflineMatchesTheBlockMix() {
        const std::string tone = NT_FIXTURES_DIR "/media/tone-220-48k-mono.wav";
        Timeline tl;
        tl.tracks = {track("a", TrackType::Audio)};
        Clip c = keyedClip("c", "a", 1000.0, -3.0, {key(0, 0), key(1, -24)});
        c.mediaPath = tone;
        tl.clips = {c};
        tl.durationMs = 1000.0;
        std::vector<std::string> problems;
        const auto rendered = renderOffline(tl, 48000, 0.0, 1000.0, &problems);
        QVERIFY2(problems.empty(), problems.empty() ? "" : problems.front().c_str());
        std::string error;
        const auto source = AudioSource::open(tone, 48000, &error)->readAll();
        const auto plan = buildMixPlan(tl);
        std::vector<float> live;
        for (int at = 0; at < 48000; at += 128) {
            const auto part = mix(plan, source, frameMs(at), std::min(128, 48000 - at));
            live.insert(live.end(), part.begin(), part.end());
        }
        QCOMPARE(rendered.size(), live.size());
        double energyStart = 0, energyEnd = 0;
        for (std::size_t i = 0; i < rendered.size(); ++i) {
            if (std::abs(rendered[i] - live[i]) > 1e-5f) { QFAIL(qPrintable(QString("sample %1").arg(i))); }
            (i < rendered.size() / 2 ? energyStart : energyEnd) += static_cast<double>(rendered[i]) * rendered[i];
        }
        // The level falls over the clip in the rendered output.
        QVERIFY(energyStart > energyEnd * 4);
    }
    // AudioSource: a float WAV decodes to the samples ffmpeg writes as raw
    // f32le, mono goes to both channels at unity, and a seek is sample exact.
    void sourceDecodeAndSeek() {
        const QString wav = QStringLiteral(NT_FIXTURES_DIR "/media/tone-440-48k-mono.wav");
        QVERIFY2(QFileInfo::exists(wav), "run scripts/make-fixtures.sh");
        QProcess ffmpeg;
        ffmpeg.start(QStringLiteral("ffmpeg"), {"-v", "error", "-i", wav, "-f", "f32le", "-"});
        QVERIFY(ffmpeg.waitForFinished(30000));
        const QByteArray raw = ffmpeg.readAllStandardOutput();
        const auto* ref = reinterpret_cast<const float*>(raw.constData());
        const auto refFrames = static_cast<std::int64_t>(raw.size() / 4);
        QVERIFY(refFrames > 48000);

        std::string error;
        auto src = AudioSource::open(wav.toStdString(), 48000, &error);
        QVERIFY2(src, error.c_str());
        QCOMPARE(src->sourceChannels(), 1);
        const auto all = src->readAll();
        QCOMPARE(static_cast<std::int64_t>(all.size() / 2), refFrames);
        for (std::int64_t f = 0; f < refFrames; f += 11) {
            QCOMPARE(all[2 * f], ref[f]);
            QCOMPARE(all[2 * f + 1], ref[f]);
        }
        for (const std::int64_t at : {std::int64_t(12345), std::int64_t(100), std::int64_t(200001)}) {
            QVERIFY(src->seek(at));
            float buf[64 * 2];
            QCOMPARE(src->read(buf, 64), std::int64_t(64));
            for (int i = 0; i < 64; ++i) QCOMPARE(buf[2 * i], ref[at + i]);
        }
    }

    // F3: master true-peak look-ahead limiter caps output at ~ -1 dBTP by default,
    // can be disabled by the project field master.limiter = false, and feeds the clip indicator.
    void masterLimiterCapsTruePeakAndCanBeDisabled() {
        QTemporaryDir dir;
        QVERIFY(dir.isValid());
        const QString hotWav = dir.filePath(QStringLiteral("hot.wav"));
        // Write a 0.5 s stereo IEEE-float WAV with hot (+6 dBFS) sine and inter-sample true peaks.
        constexpr int frames = 24000;
        {
            QFile f(hotWav);
            QVERIFY(f.open(QIODevice::WriteOnly));
            const std::uint32_t dataBytes = frames * 8;
            const auto put32 = [&](std::uint32_t v) { f.write(reinterpret_cast<const char*>(&v), 4); };
            const auto put16 = [&](std::uint16_t v) { f.write(reinterpret_cast<const char*>(&v), 2); };
            f.write("RIFF"); put32(36 + dataBytes); f.write("WAVEfmt "); put32(16); put16(3); put16(2);
            put32(48000); put32(48000 * 8); put16(8); put16(32); f.write("data"); put32(dataBytes);
            for (int i = 0; i < frames; ++i) {
                // Fs/4 square-like pattern in first half (+3 dBTP inter-sample peaks at 0 dBFS, +9 dBTP at 2x),
                // plus hot 440 Hz sine in second half.
                const float s = i < frames / 2
                    ? ((i % 4) < 2 ? 1.5f : -1.5f)
                    : static_cast<float>(2.0 * std::sin(2.0 * std::numbers::pi * 440.0 * i / 48000.0));
                f.write(reinterpret_cast<const char*>(&s), 4);
                f.write(reinterpret_cast<const char*>(&s), 4);
            }
        }
        Timeline tl;
        tl.tracks = {track("a", TrackType::Audio)};
        Clip c = clip("c", "a", MediaType::Audio, 0.0, 500.0);
        c.mediaPath = hotWav.toStdString();
        tl.clips = {c};
        tl.durationMs = 500.0;

        // 1. Default (master limiter ON): offline render stays at or below ~ -1 dBTP.
        const auto limited = renderOffline(tl, 48000, 0.0, 500.0);
        QCOMPARE(limited.size(), std::size_t{frames} * 2);
        LoudnessMeter meterOn(48000.0, 2);
        meterOn.processInterleaved(limited.data(), frames);
        QVERIFY2(meterOn.truePeakDb() <= -0.9,
                 qPrintable(QStringLiteral("expected master limiter ceiling <= -0.9 dBTP, got %1 dBTP")
                                .arg(meterOn.truePeakDb())));
        QVERIFY2(meterOn.truePeakDb() > -3.0,
                 qPrintable(QStringLiteral("expected limited signal near -1 dBTP, got %1 dBTP")
                                .arg(meterOn.truePeakDb())));

        // 2. Project field master.limiter = false turns it off: full hot true peak passes through.
        Timeline off = tl;
        off.raw.insert(QStringLiteral("master"), QJsonObject{{QStringLiteral("volumeDb"), 0.0},
                                                             {QStringLiteral("limiter"), false}});
        const auto unlimited = renderOffline(off, 48000, 0.0, 500.0);
        LoudnessMeter meterOff(48000.0, 2);
        meterOff.processInterleaved(unlimited.data(), frames);
        QVERIFY2(meterOff.truePeakDb() > 4.0,
                 qPrintable(QStringLiteral("expected unlimited true peak > +4 dBTP, got %1 dBTP")
                                .arg(meterOff.truePeakDb())));

        // 3. Live playback through AudioEngine: limiter ON keeps readout <= -0.9 dBTP and not clipped;
        //    OFF exceeds 0 dBTP and latches clipped until requestReset().
        const auto playLive = [&](const Timeline& doc, LoudnessReading& out, bool* resetCleared = nullptr) {
            LoudnessReadout readout;
            AudioEngine engine;
            engine.setTimeline(std::make_shared<const Timeline>(doc));
            AudioEngine::Options opts;
            opts.backend = AudioEngine::Backend::Manual;
            opts.sampleRate = 48000;
            opts.loudness = &readout;
            std::string err;
            QVERIFY2(engine.start(opts, &err), err.c_str());
            playback::TransportCommand cmd;
            cmd.seq = 1; cmd.playing = true; cmd.rate = 1.0; cmd.seekSeq = 1; cmd.seekMs = 0.0;
            engine.feed().command.store(cmd);
            QTRY_VERIFY(engine.stats().sessions >= 1);
            QTest::qWait(80);
            std::vector<float> block(std::size_t{480} * 2, 0.0f);
            for (int b = 0; b < 40; ++b) {
                engine.renderManual(block, static_cast<std::int64_t>(b) * 10'000'000LL);
            }
            out = readout.read();
            if (resetCleared) {
                cmd.seq = 2; cmd.playing = false;
                engine.feed().command.store(cmd);
                readout.requestReset();
                std::fill(block.begin(), block.end(), 0.0f);
                engine.renderManual(block, 40 * 10'000'000LL);
                *resetCleared = !readout.read().clipped;
            }
            engine.stop();
        };
        LoudnessReading rOn{}, rOff{};
        playLive(tl, rOn);
        QVERIFY2(std::isfinite(rOn.truePeakDb) && rOn.truePeakDb <= -0.9,
                 qPrintable(QStringLiteral("live limited truePeakDb=%1").arg(rOn.truePeakDb)));
        QVERIFY2(!rOn.clipped, "limiter ON must not latch clip indicator");
        bool resetCleared = false;
        playLive(off, rOff, &resetCleared);
        QVERIFY2(std::isfinite(rOff.truePeakDb) && rOff.truePeakDb > 4.0,
                 qPrintable(QStringLiteral("live unlimited truePeakDb=%1").arg(rOff.truePeakDb)));
        QVERIFY2(rOff.clipped, "limiter OFF with hot signal must latch clip indicator");
        QVERIFY2(resetCleared, "requestReset() must clear latched clip indicator");

        // 4. Real-time allocation-free check for MasterLimiter::process.
        MasterLimiter limiter;
        limiter.prepare(48000.0);
        std::vector<float> rtBuf(std::size_t{256} * 2, 1.5f);
        nt::testing::allocations = 0;
        nt::testing::countAllocations = true;
        for (int b = 0; b < 50; ++b) {
            limiter.process(rtBuf);
        }
        nt::testing::countAllocations = false;
        QCOMPARE(std::size_t{nt::testing::allocations}, std::size_t{0});
    }

    // F6: denormal protection (FTZ/DAZ) is active inside the audio callback and restored on exit.
    void audioCallbackFlushesDenormalsAndRestoresState() {
        struct ProbeState {
            std::atomic<bool> ran{false};
            std::atomic<float> result{1.0f};
        };
        class DenormalProbe final : public BlockProcessor {
        public:
            explicit DenormalProbe(std::shared_ptr<ProbeState> state) : m_state(std::move(state)) {}
            void process(std::span<float>, const BlockContext&) noexcept override {
                volatile float a = 1.0e-39f;
                volatile float b = 0.5f;
                m_state->result.store(a * b, std::memory_order_release);
                m_state->ran.store(true, std::memory_order_release);
            }
        private:
            std::shared_ptr<ProbeState> m_state;
        };
        const auto state = std::make_shared<ProbeState>();
        const auto token = registerMixPlanStage(
            "dsp1-denormal-probe",
            [state](const Timeline&, MixPlan& plan) {
                plan.processors.push_back(std::make_shared<DenormalProbe>(state));
            },
            900);
        const auto cleanup = qScopeGuard([token] { unregisterMixPlanStage(token); });

        volatile float beforeA = 1.0e-39f;
        volatile float beforeB = 0.5f;
        const float beforeProduct = beforeA * beforeB;
        QVERIFY2(beforeProduct != 0.0f, "host thread should not flush denormals before audio callback");

        auto tl = std::make_shared<Timeline>();
        tl->durationMs = 1000.0;
        AudioEngine engine;
        engine.setTimeline(tl);
        AudioEngine::Options opts;
        opts.backend = AudioEngine::Backend::Manual;
        opts.sampleRate = 48000;
        std::string err;
        QVERIFY2(engine.start(opts, &err), err.c_str());
        playback::TransportCommand cmd;
        cmd.seq = 1; cmd.playing = true; cmd.rate = 1.0; cmd.seekSeq = 1; cmd.seekMs = 0.0;
        engine.feed().command.store(cmd);
        QTRY_VERIFY(engine.stats().sessions >= 1);
        QTest::qWait(50);
        std::vector<float> block(std::size_t{480} * 2, 0.0f);
        engine.renderManual(block, 0);
        engine.stop();

        QVERIFY(state->ran.load(std::memory_order_acquire));
        const float cbResult = state->result.load(std::memory_order_acquire);
        QVERIFY2(cbResult == 0.0f,
                 qPrintable(QStringLiteral("expected FTZ/DAZ to flush subnormal to exact 0.0f, got %1").arg(cbResult, 0, 'e', 6)));

        volatile float afterA = 1.0e-39f;
        volatile float afterB = 0.5f;
        const float afterProduct = afterA * afterB;
        QVERIFY2(afterProduct == beforeProduct && afterProduct != 0.0f,
                 "FTZ/DAZ must be restored on exit from audio callback");
    }

    // D1: outputLatencySec in AudioEngine::Stats and AudioClockFeed::device must include
    // plug-in PDC latency and active master limiter look-ahead latency.
    void d1_outputLatencyIncludesPdcAndMasterLimiter() {
        class FixedLatencyProcessor final : public BlockProcessor {
        public:
            explicit FixedLatencyProcessor(int lat) : m_lat(lat) {}
            void process(std::span<float>, const BlockContext&) noexcept override {}
            int latencySamples() const noexcept override { return m_lat; }
        private:
            int m_lat = 0;
        };
        const auto token = registerMixPlanStage(
            "dsp1-d1-pdc",
            [](const Timeline&, MixPlan& plan) {
                if (!plan.tracks.empty()) {
                    plan.tracks[0].processors.push_back(std::make_shared<FixedLatencyProcessor>(4096));
                }
            },
            900);
        const auto cleanup = qScopeGuard([token] { unregisterMixPlanStage(token); });

        auto tl = std::make_shared<Timeline>();
        tl->tracks = {track("a", TrackType::Audio)};
        tl->clips = {clip("c", "a", MediaType::Audio, 0.0, 1000.0)};
        tl->durationMs = 1000.0;

        AudioEngine engine;
        engine.setTimeline(tl);
        AudioEngine::Options opts;
        opts.backend = AudioEngine::Backend::Manual;
        opts.sampleRate = 48000;
        opts.simulatedLatencySec = 0.010;
        std::string err;
        QVERIFY2(engine.start(opts, &err), err.c_str());
        const auto st = engine.stats();
        const auto dev = engine.feed().device.load();
        const int limLat = MasterLimiter::latencyFramesForRate(48000.0);
        const double expectedSec = 0.010 + static_cast<double>(4096 + limLat) / 48000.0;
        engine.stop();
        QVERIFY2(std::abs(st.outputLatencySec - expectedSec) < 1e-6,
                 qPrintable(QStringLiteral("stats.outputLatencySec=%1 expected=%2").arg(st.outputLatencySec, 0, 'f', 6).arg(expectedSec, 0, 'f', 6)));
        QVERIFY2(std::abs(dev.outputLatencySec - expectedSec) < 1e-6,
                 qPrintable(QStringLiteral("device.outputLatencySec=%1 expected=%2").arg(dev.outputLatencySec, 0, 'f', 6).arg(expectedSec, 0, 'f', 6)));
    }

    // D2: stats().masterLimiterLatencyFrames must be 0 when master.limiter is false and update on toggle.
    void d2_masterLimiterLatencyFramesTracksEnabledState() {
        auto off = std::make_shared<Timeline>();
        off->durationMs = 1000.0;
        off->raw.insert(QStringLiteral("master"), QJsonObject{{QStringLiteral("volumeDb"), 0.0},
                                                              {QStringLiteral("limiter"), false}});
        auto on = std::make_shared<Timeline>(*off);
        on->raw.insert(QStringLiteral("master"), QJsonObject{{QStringLiteral("volumeDb"), 0.0},
                                                             {QStringLiteral("limiter"), true}});
        AudioEngine engine;
        engine.setTimeline(off);
        AudioEngine::Options opts;
        opts.backend = AudioEngine::Backend::Manual;
        opts.sampleRate = 48000;
        opts.simulatedLatencySec = 0.010;
        std::string err;
        QVERIFY2(engine.start(opts, &err), err.c_str());
        QCOMPARE(engine.stats().masterLimiterLatencyFrames, 0);
        QVERIFY(std::abs(engine.stats().outputLatencySec - 0.010) < 1e-6);
        engine.setTimeline(on);
        const int limLat = MasterLimiter::latencyFramesForRate(48000.0);
        QCOMPARE(engine.stats().masterLimiterLatencyFrames, limLat);
        QVERIFY(std::abs(engine.stats().outputLatencySec - (0.010 + static_cast<double>(limLat) / 48000.0)) < 1e-6);
        engine.setTimeline(off);
        QCOMPARE(engine.stats().masterLimiterLatencyFrames, 0);
        QVERIFY(std::abs(engine.stats().outputLatencySec - 0.010) < 1e-6);
        engine.stop();
    }

    // D3: DelayLine's final drain block must not report silence to downstream master processors.
    void d3_delayLineFinalDrainBlockNotReportedSilent() {
        class DelayProc final : public BlockProcessor {
        public:
            explicit DelayProc(int lat) : m_lat(lat) {}
            void process(std::span<float>, const BlockContext&) noexcept override {}
            int latencySamples() const noexcept override { return m_lat; }
        private:
            int m_lat;
        };
        struct MasterProbeState {
            bool sawNonZeroWithSilentFlag = false;
            int nonZeroBlocks = 0;
        };
        class MasterSilentProbe final : public BlockProcessor {
        public:
            explicit MasterSilentProbe(std::shared_ptr<MasterProbeState> st) : m_st(std::move(st)) {}
            void process(std::span<float> stereo, const BlockContext& ctx) noexcept override {
                bool any = false;
                for (float x : stereo) {
                    if (std::abs(x) > 1e-6f) { any = true; break; }
                }
                if (any) {
                    ++m_st->nonZeroBlocks;
                    if (ctx.silent) m_st->sawNonZeroWithSilentFlag = true;
                }
            }
        private:
            std::shared_ptr<MasterProbeState> m_st;
        };
        const auto probe = std::make_shared<MasterProbeState>();
        const auto token = registerMixPlanStage(
            "dsp1-d3-drain",
            [probe](const Timeline&, MixPlan& plan) {
                plan.tracks[0].processors.push_back(std::make_shared<DelayProc>(64));
                plan.processors.push_back(std::make_shared<MasterSilentProbe>(probe));
            },
            900);
        const auto cleanup = qScopeGuard([token] { unregisterMixPlanStage(token); });

        Timeline tl;
        tl.tracks = {track("a", TrackType::Audio), track("b", TrackType::Audio)};
        // Track B has a short clip ending right at frame 128; its 64-sample delay drains inside block 1 (frames 128..256).
        tl.clips = {clip("c1", "a", MediaType::Audio, 0.0, frameMs(128)),
                    clip("c2", "b", MediaType::Audio, 0.0, frameMs(128))};
        tl.durationMs = 100.0;
        const auto plan = buildMixPlan(tl);
        std::vector<float> zeroPcm(std::size_t{256} * 2, 0.0f);
        std::vector<float> tonePcm(std::size_t{256} * 2, 0.5f);
        VoicePcm views[2]{};
        views[0].linear = zeroPcm.data();
        views[0].linearCount = 256;
        views[1].linear = tonePcm.data();
        views[1].linearCount = 256;
        std::vector<float> out(std::size_t{128} * 2, 0.0f);
        MixStats st;
        // Block 0: frames 0..128 (fills delay line).
        mixBlock(plan, views, kRate, 0.0, 1000.0 / kRate, 128, out.data(), st);
        // Block 1: frames 128..256 (clip ended, delay line drains all 64 remaining frames and pendingFrames hits 0).
        mixBlock(plan, views, kRate, frameMs(128), 1000.0 / kRate, 128, out.data(), st);
        QVERIFY(probe->nonZeroBlocks >= 2);
        QVERIFY2(!probe->sawNonZeroWithSilentFlag,
                 "master processor received ctx.silent==true while DelayLine drained non-zero samples");
    }

    // D4: Track gain/pan automation and master-bus processor automation must be time-shifted for PDC.
    void d4_trackAndMasterAutomationTimeShiftedForPdc() {
        class DelayProc final : public BlockProcessor {
        public:
            explicit DelayProc(int lat) : m_lat(lat) {}
            void process(std::span<float>, const BlockContext&) noexcept override {}
            int latencySamples() const noexcept override { return m_lat; }
        private:
            int m_lat;
        };
        class StepMuteSource final : public ParameterSource {
        public:
            explicit StepMuteSource(double muteAtMs) : m_muteAtMs(muteAtMs) {}
            double valueAt(double timelineMs, double) const noexcept override {
                return timelineMs >= m_muteAtMs ? 0.0 : 1.0;
            }
        private:
            double m_muteAtMs;
        };
        struct MasterTimeProbeState {
            double firstImpulseTimeMs = -1.0;
        };
        class MasterTimeProbe final : public BlockProcessor {
        public:
            explicit MasterTimeProbe(std::shared_ptr<MasterTimeProbeState> st) : m_st(std::move(st)) {}
            void process(std::span<float> stereo, const BlockContext& ctx) noexcept override {
                if (m_st->firstImpulseTimeMs >= 0.0) return;
                for (std::size_t f = 0; f < stereo.size() / 2; ++f) {
                    if (std::abs(stereo[2 * f]) > 0.1f) {
                        m_st->firstImpulseTimeMs = ctx.timelineMs + static_cast<double>(f) * ctx.msPerFrame;
                        break;
                    }
                }
            }
        private:
            std::shared_ptr<MasterTimeProbeState> m_st;
        };

        const auto masterProbe = std::make_shared<MasterTimeProbeState>();
        constexpr int kPdcFrames = 4096;
        const double muteMs = 150.0;  // frame 7200 at 48 kHz
        const auto token = registerMixPlanStage(
            "dsp1-d4-pdc-auto",
            [masterProbe, muteMs, kPdcFrames](const Timeline&, MixPlan& plan) {
                plan.tracks[0].processors.push_back(std::make_shared<DelayProc>(kPdcFrames));
                plan.tracks[1].gainSource = std::make_shared<StepMuteSource>(muteMs);
                plan.processors.push_back(std::make_shared<MasterTimeProbe>(masterProbe));
            },
            900);
        const auto cleanup = qScopeGuard([token] { unregisterMixPlanStage(token); });

        QTemporaryDir dir;
        QVERIFY(dir.isValid());
        const QString dcWav = dir.filePath(QStringLiteral("dc.wav"));
        constexpr int kFrames = 14400;  // 300 ms
        {
            QFile f(dcWav);
            QVERIFY(f.open(QIODevice::WriteOnly));
            const std::uint32_t dataBytes = kFrames * 8;
            const auto put32 = [&](std::uint32_t v) { f.write(reinterpret_cast<const char*>(&v), 4); };
            const auto put16 = [&](std::uint16_t v) { f.write(reinterpret_cast<const char*>(&v), 2); };
            f.write("RIFF"); put32(36 + dataBytes); f.write("WAVEfmt "); put32(16); put16(3); put16(2);
            put32(48000); put32(48000 * 8); put16(8); put16(32); f.write("data"); put32(dataBytes);
            for (int i = 0; i < kFrames; ++i) {
                const float s = (i >= 960) ? 0.5f : 0.0f;  // starts at 20 ms
                f.write(reinterpret_cast<const char*>(&s), 4);
                f.write(reinterpret_cast<const char*>(&s), 4);
            }
        }
        Timeline tl;
        tl.raw.insert(QStringLiteral("master"), QJsonObject{{QStringLiteral("volumeDb"), 0.0},
                                                            {QStringLiteral("limiter"), false}});
        tl.tracks = {track("a", TrackType::Audio), track("b", TrackType::Audio)};
        Clip ca = clip("c1", "a", MediaType::Audio, 0.0, 300.0);
        ca.mediaPath = dcWav.toStdString();
        ca.volumeDb = -120.0;  // silent so we measure Track B cleanly
        Clip cb = clip("c2", "b", MediaType::Audio, 0.0, 300.0);
        cb.mediaPath = dcWav.toStdString();
        tl.clips = {ca, cb};
        tl.durationMs = 300.0;

        const auto out = renderOffline(tl, 48000, 0.0, 300.0);
        // Track B starts at 20 ms -> master processor must see timelineMs == 20 ms when that edge arrives.
        QVERIFY2(std::abs(masterProbe->firstImpulseTimeMs - 20.0) < 0.1,
                 qPrintable(QStringLiteral("master processor saw edge at %1 ms, expected 20.0 ms")
                                .arg(masterProbe->firstImpulseTimeMs)));
        // At t = 140 ms (frame 6720, BEFORE mute at 150 ms), Track B must still be unmuted (~0.5f).
        QVERIFY2(std::abs(out[std::size_t{6720} * 2] - 0.5f) < 1e-3f,
                 qPrintable(QStringLiteral("Track B muted early at 140 ms: %1").arg(out[std::size_t{6720} * 2])));
        // At t = 155 ms (frame 7440, AFTER mute at 150 ms), Track B must be muted (0.0f).
        QVERIFY2(std::abs(out[std::size_t{7440} * 2]) < 1e-4f,
                 qPrintable(QStringLiteral("Track B not muted at 155 ms: %1").arg(out[std::size_t{7440} * 2])));
    }

    // D6: Voice-level processor latency (voice.processors) must be compensated in PDC and offline trimming.
    void d6_voiceProcessorLatencyCompensatedInPdcAndOffline() {
        class DelayLineProc final : public BlockProcessor {
        public:
            explicit DelayLineProc(int lat) : m_lat(lat) {}
            void prepare(double) override {
                m_buf.assign(static_cast<std::size_t>(m_lat) * 2, 0.0f);
                m_pos = 0;
            }
            void reset() noexcept override {
                BlockProcessor::reset();
                std::fill(m_buf.begin(), m_buf.end(), 0.0f);
                m_pos = 0;
            }
            int latencySamples() const noexcept override { return m_lat; }
            void process(std::span<float> stereo, const BlockContext&) noexcept override {
                const int n = static_cast<int>(stereo.size() / 2);
                for (int f = 0; f < n; ++f) {
                    const std::size_t idx = static_cast<std::size_t>(m_pos) * 2;
                    const float outL = m_buf[idx], outR = m_buf[idx + 1];
                    m_buf[idx] = stereo[static_cast<std::size_t>(f) * 2];
                    m_buf[idx + 1] = stereo[static_cast<std::size_t>(f) * 2 + 1];
                    m_pos = (m_pos + 1 == m_lat) ? 0 : m_pos + 1;
                    stereo[static_cast<std::size_t>(f) * 2] = outL;
                    stereo[static_cast<std::size_t>(f) * 2 + 1] = outR;
                }
            }
        private:
            int m_lat = 0;
            std::vector<float> m_buf;
            int m_pos = 0;
        };
        const auto token = registerMixPlanStage(
            "dsp1-d6-voice-pdc",
            [](const Timeline&, MixPlan& plan) {
                if (!plan.voices.empty()) {
                    plan.voices[0].processors.push_back(std::make_shared<DelayLineProc>(512));
                }
            },
            900);
        const auto cleanup = qScopeGuard([token] { unregisterMixPlanStage(token); });

        QTemporaryDir dir;
        QVERIFY(dir.isValid());
        const QString impWav = dir.filePath(QStringLiteral("imp.wav"));
        constexpr int kFrames = 4800;
        {
            QFile f(impWav);
            QVERIFY(f.open(QIODevice::WriteOnly));
            const std::uint32_t dataBytes = kFrames * 8;
            const auto put32 = [&](std::uint32_t v) { f.write(reinterpret_cast<const char*>(&v), 4); };
            const auto put16 = [&](std::uint16_t v) { f.write(reinterpret_cast<const char*>(&v), 2); };
            f.write("RIFF"); put32(36 + dataBytes); f.write("WAVEfmt "); put32(16); put16(3); put16(2);
            put32(48000); put32(48000 * 8); put16(8); put16(32); f.write("data"); put32(dataBytes);
            for (int i = 0; i < kFrames; ++i) {
                const float s = (i == 1000) ? 0.5f : 0.0f;
                f.write(reinterpret_cast<const char*>(&s), 4);
                f.write(reinterpret_cast<const char*>(&s), 4);
            }
        }
        Timeline tl;
        tl.raw.insert(QStringLiteral("master"), QJsonObject{{QStringLiteral("volumeDb"), 0.0},
                                                            {QStringLiteral("limiter"), false}});
        tl.tracks = {track("a", TrackType::Audio), track("b", TrackType::Audio)};
        Clip c1 = clip("c1", "a", MediaType::Audio, 0.0, 100.0);
        c1.mediaPath = impWav.toStdString();
        Clip c2 = clip("c2", "b", MediaType::Audio, 0.0, 100.0);
        c2.mediaPath = impWav.toStdString();
        tl.clips = {c1, c2};
        tl.durationMs = 100.0;

        const auto plan = buildMixPlan(tl);
        QCOMPARE(planLatencySamples(plan), 512);
        const auto out = renderOffline(tl, 48000, 0.0, 100.0);
        // Both tracks must align at frame 1000 (0.5 + 0.5 = 1.0) with no ghost at 1512.
        QVERIFY2(std::abs(out[std::size_t{1000} * 2] - 1.0f) < 1e-4f,
                 qPrintable(QStringLiteral("expected 1.0 at frame 1000, got %1").arg(out[std::size_t{1000} * 2])));
        QVERIFY2(std::abs(out[std::size_t{1512} * 2]) < 1e-4f,
                 qPrintable(QStringLiteral("ghost voice impulse at 1512: %1").arg(out[std::size_t{1512} * 2])));
    }

    // D11: Toggling master.limiter live during playback must not inject an 88-sample mute hole or click.
    void d11_masterLimiterLiveToggleHasNoMuteHoleOrClick() {
        QTemporaryDir dir;
        QVERIFY(dir.isValid());
        const QString sineWav = dir.filePath(QStringLiteral("sine440.wav"));
        constexpr int kFrames = 48000;
        {
            QFile f(sineWav);
            QVERIFY(f.open(QIODevice::WriteOnly));
            const std::uint32_t dataBytes = kFrames * 8;
            const auto put32 = [&](std::uint32_t v) { f.write(reinterpret_cast<const char*>(&v), 4); };
            const auto put16 = [&](std::uint16_t v) { f.write(reinterpret_cast<const char*>(&v), 2); };
            f.write("RIFF"); put32(36 + dataBytes); f.write("WAVEfmt "); put32(16); put16(3); put16(2);
            put32(48000); put32(48000 * 8); put16(8); put16(32); f.write("data"); put32(dataBytes);
            for (int i = 0; i < kFrames; ++i) {
                const float s = static_cast<float>(0.4 * std::sin(2.0 * std::numbers::pi * 440.0 * i / 48000.0));
                f.write(reinterpret_cast<const char*>(&s), 4);
                f.write(reinterpret_cast<const char*>(&s), 4);
            }
        }
        auto off = std::make_shared<Timeline>();
        off->tracks = {track("a", TrackType::Audio)};
        Clip c = clip("c", "a", MediaType::Audio, 0.0, 1000.0);
        c.mediaPath = sineWav.toStdString();
        off->clips = {c};
        off->durationMs = 1000.0;
        off->raw.insert(QStringLiteral("master"), QJsonObject{{QStringLiteral("volumeDb"), 0.0},
                                                              {QStringLiteral("limiter"), false}});
        auto on = std::make_shared<Timeline>(*off);
        on->raw.insert(QStringLiteral("master"), QJsonObject{{QStringLiteral("volumeDb"), 0.0},
                                                             {QStringLiteral("limiter"), true}});

        AudioEngine engine;
        engine.setTimeline(off);
        AudioEngine::Options opts;
        opts.backend = AudioEngine::Backend::Manual;
        opts.sampleRate = 48000;
        std::string err;
        QVERIFY2(engine.start(opts, &err), err.c_str());
        playback::TransportCommand cmd;
        cmd.seq = 1; cmd.playing = true; cmd.rate = 1.0; cmd.seekSeq = 1; cmd.seekMs = 0.0;
        engine.feed().command.store(cmd);
        QTRY_VERIFY(engine.stats().sessions >= 1);
        QTest::qWait(80);

        std::vector<float> recorded;
        std::vector<float> block(std::size_t{480} * 2, 0.0f);
        int blk = 0;
        const auto runBlocks = [&](int count) {
            for (int i = 0; i < count; ++i, ++blk) {
                engine.renderManual(block, static_cast<std::int64_t>(blk) * 10'000'000LL);
                recorded.insert(recorded.end(), block.begin(), block.end());
            }
        };
        runBlocks(10);          // 100 ms OFF
        const std::size_t toggleOnAt = recorded.size() / 2;
        engine.setTimeline(on);
        runBlocks(10);          // 100 ms ON
        const std::size_t toggleOffAt = recorded.size() / 2;
        engine.setTimeline(off);
        runBlocks(10);          // 100 ms OFF
        engine.stop();

        // Check for mute hole around toggleOnAt: no 64-sample window may drop near silence.
        double minWindowRms = 1e9;
        for (std::size_t f = toggleOnAt; f + 64 < toggleOnAt + 1000; ++f) {
            double sq = 0.0;
            for (std::size_t j = 0; j < 64; ++j) {
                const double s = recorded[(f + j) * 2];
                sq += s * s;
            }
            minWindowRms = std::min(minWindowRms, std::sqrt(sq / 64.0));
        }
        QVERIFY2(minWindowRms > 0.05,
                 qPrintable(QStringLiteral("limiter OFF->ON injected a mute hole (min 64-sample RMS=%1)").arg(minWindowRms)));

        // Natural max step of 0.4 * sin(2*pi*440*n/48000) is ~0.0230. Crossfade should keep steps small (< 0.06).
        const auto maxStepAround = [&](std::size_t center) {
            float worst = 0.0f;
            for (std::size_t f = center - 10; f < center + 600; ++f) {
                worst = std::max(worst, std::abs(recorded[f * 2] - recorded[(f - 1) * 2]));
            }
            return worst;
        };
        const float stepOn = maxStepAround(toggleOnAt);
        const float stepOff = maxStepAround(toggleOffAt);
        QVERIFY2(stepOn < 0.06f, qPrintable(QStringLiteral("OFF->ON click step=%1").arg(stepOn)));
        QVERIFY2(stepOff < 0.06f, qPrintable(QStringLiteral("ON->OFF click step=%1").arg(stepOff)));
    }

    // D12: Pitch-preserving shuttle playback and scrub bursts must run through masterLimiter and liveLoudness.
    void d12_shuttleAndScrubRunLimiterAndClipMetering() {
        QTemporaryDir dir;
        QVERIFY(dir.isValid());
        const QString hotWav = dir.filePath(QStringLiteral("hot_d12.wav"));
        constexpr int kFrames = 96000;  // 2 s
        {
            QFile f(hotWav);
            QVERIFY(f.open(QIODevice::WriteOnly));
            const std::uint32_t dataBytes = kFrames * 8;
            const auto put32 = [&](std::uint32_t v) { f.write(reinterpret_cast<const char*>(&v), 4); };
            const auto put16 = [&](std::uint16_t v) { f.write(reinterpret_cast<const char*>(&v), 2); };
            f.write("RIFF"); put32(36 + dataBytes); f.write("WAVEfmt "); put32(16); put16(3); put16(2);
            put32(48000); put32(48000 * 8); put16(8); put16(32); f.write("data"); put32(dataBytes);
            for (int i = 0; i < kFrames; ++i) {
                const float s = static_cast<float>(2.0 * std::sin(2.0 * std::numbers::pi * 440.0 * i / 48000.0));
                f.write(reinterpret_cast<const char*>(&s), 4);
                f.write(reinterpret_cast<const char*>(&s), 4);
            }
        }
        auto makeDoc = [&](bool limiterOn) {
            auto tl = std::make_shared<Timeline>();
            tl->tracks = {track("a", TrackType::Audio)};
            Clip c = clip("c", "a", MediaType::Audio, 0.0, 2000.0);
            c.mediaPath = hotWav.toStdString();
            tl->clips = {c};
            tl->durationMs = 2000.0;
            tl->raw.insert(QStringLiteral("master"), QJsonObject{{QStringLiteral("volumeDb"), 0.0},
                                                                 {QStringLiteral("limiter"), limiterOn}});
            return tl;
        };

        // (a) Pitch-preserving shuttle (2x).
        for (bool limiterOn : {true, false}) {
            LoudnessReadout readout;
            AudioEngine engine;
            engine.setTimeline(makeDoc(limiterOn));
            AudioEngine::Options opts;
            opts.backend = AudioEngine::Backend::Manual;
            opts.sampleRate = 48000;
            opts.loudness = &readout;
            std::string err;
            QVERIFY2(engine.start(opts, &err), err.c_str());
            playback::TransportCommand cmd;
            cmd.seq = 1; cmd.playing = true; cmd.rate = 2.0; cmd.keepPitch = true; cmd.seekSeq = 1; cmd.seekMs = 0.0;
            engine.feed().command.store(cmd);
            QTRY_VERIFY(engine.stats().sessions >= 1);
            QTest::qWait(80);
            std::vector<float> block(std::size_t{480} * 2, 0.0f);
            // First block publishes the anchor so produceShuttle starts filling shuttleRing.
            engine.renderManual(block, 0);
            QTest::qWait(80);
            std::vector<float> recorded;
            for (int b = 1; b <= 30; ++b) {
                engine.renderManual(block, static_cast<std::int64_t>(b) * 10'000'000LL);
                recorded.insert(recorded.end(), block.begin(), block.end());
                QTest::qWait(2);
            }
            const auto rd = readout.read();
            engine.stop();
            QVERIFY2(rd.blocks > 0, "shuttle playback must feed liveLoudness");
            LoudnessMeter m(48000.0, 2);
            m.processInterleaved(recorded.data(), static_cast<int>(recorded.size() / 2));
            if (limiterOn) {
                QVERIFY2(m.truePeakDb() <= -0.9 && m.truePeakDb() > -6.0,
                         qPrintable(QStringLiteral("shuttle limited truePeakDb=%1").arg(m.truePeakDb())));
                QVERIFY2(!rd.clipped, "shuttle with limiter ON must not clip");
            } else {
                QVERIFY2(rd.clipped, "shuttle with limiter OFF and +6 dBFS signal must latch clip indicator");
            }
        }

        // (b) Scrub burst (paused + scrub=true).
        for (bool limiterOn : {true, false}) {
            LoudnessReadout readout;
            AudioEngine engine;
            engine.setTimeline(makeDoc(limiterOn));
            AudioEngine::Options opts;
            opts.backend = AudioEngine::Backend::Manual;
            opts.sampleRate = 48000;
            opts.loudness = &readout;
            std::string err;
            QVERIFY2(engine.start(opts, &err), err.c_str());
            playback::TransportCommand cmd;
            cmd.seq = 1; cmd.playing = false; cmd.scrub = true; cmd.seekSeq = 1; cmd.seekMs = 100.0;
            engine.feed().command.store(cmd);
            QTRY_VERIFY(engine.stats().sessions >= 1);
            QTest::qWait(80);
            std::vector<float> block(std::size_t{480} * 2, 0.0f);
            std::vector<float> recorded;
            for (int b = 0; b < 12; ++b) {
                engine.renderManual(block, static_cast<std::int64_t>(b) * 10'000'000LL);
                recorded.insert(recorded.end(), block.begin(), block.end());
            }
            const auto rd = readout.read();
            engine.stop();
            QVERIFY2(rd.blocks > 0, "scrub burst must feed liveLoudness");
            LoudnessMeter m(48000.0, 2);
            m.processInterleaved(recorded.data(), static_cast<int>(recorded.size() / 2));
            if (limiterOn) {
                QVERIFY2(m.truePeakDb() <= -0.9 && m.truePeakDb() > -6.0,
                         qPrintable(QStringLiteral("scrub limited truePeakDb=%1").arg(m.truePeakDb())));
                QVERIFY2(!rd.clipped, "scrub with limiter ON must not clip");
            } else {
                QVERIFY2(rd.clipped, "scrub with limiter OFF and +6 dBFS signal must latch clip indicator");
            }
        }
    }

    // D13: Loop wraps must not carry masterLimiter 60 ms release attenuation into beat 1 of the next pass.
    void d13_loopWrapDoesNotCarryLimiterReleaseIntoBeatOne() {
        QTemporaryDir dir;
        QVERIFY(dir.isValid());
        const QString loopWav = dir.filePath(QStringLiteral("loop_snare.wav"));
        constexpr int kLoopFrames = 24000;  // 500 ms at 48 kHz
        {
            QFile f(loopWav);
            QVERIFY(f.open(QIODevice::WriteOnly));
            const std::uint32_t dataBytes = kLoopFrames * 8;
            const auto put32 = [&](std::uint32_t v) { f.write(reinterpret_cast<const char*>(&v), 4); };
            const auto put16 = [&](std::uint16_t v) { f.write(reinterpret_cast<const char*>(&v), 2); };
            f.write("RIFF"); put32(36 + dataBytes); f.write("WAVEfmt "); put32(16); put16(3); put16(2);
            put32(48000); put32(48000 * 8); put16(8); put16(32); f.write("data"); put32(dataBytes);
            for (int i = 0; i < kLoopFrames; ++i) {
                // Quiet 440 Hz tone (0.2) for most of the loop, then a +9 dBFS (2.8) snare hit near the end (frames 22000..23800).
                const float amp = (i >= 22000 && i < 23800) ? 2.8f : 0.2f;
                const float s = static_cast<float>(amp * std::sin(2.0 * std::numbers::pi * 440.0 * i / 48000.0));
                f.write(reinterpret_cast<const char*>(&s), 4);
                f.write(reinterpret_cast<const char*>(&s), 4);
            }
        }
        auto tl = std::make_shared<Timeline>();
        tl->tracks = {track("a", TrackType::Audio)};
        Clip c = clip("c", "a", MediaType::Audio, 0.0, 500.0);
        c.mediaPath = loopWav.toStdString();
        tl->clips = {c};
        tl->durationMs = 500.0;

        AudioEngine engine;
        engine.setTimeline(tl);
        AudioEngine::Options opts;
        opts.backend = AudioEngine::Backend::Manual;
        opts.sampleRate = 48000;
        std::string err;
        QVERIFY2(engine.start(opts, &err), err.c_str());
        playback::TransportCommand cmd;
        cmd.seq = 1; cmd.playing = true; cmd.rate = 1.0; cmd.seekSeq = 1; cmd.seekMs = 0.0;
        cmd.loopStartMs = 0.0; cmd.loopEndMs = 500.0;
        engine.feed().command.store(cmd);
        QTRY_VERIFY(engine.stats().sessions >= 1);
        QTest::qWait(100);

        std::vector<float> block(std::size_t{480} * 2, 0.0f);
        std::vector<float> recorded;
        for (int b = 0; b < 60; ++b) {
            engine.renderManual(block, static_cast<std::int64_t>(b) * 10'000'000LL);
            recorded.insert(recorded.end(), block.begin(), block.end());
            QTest::qWait(2);
        }
        const auto st = engine.stats();
        const int lookahead = MasterLimiter::latencyFramesForRate(48000.0);
        engine.stop();
        QVERIFY2(st.loopWraps >= 1, "expected at least one loop wrap");

        // Compare RMS of beat 1 (frames 200..700 after pass start + lookahead) on pass 1 vs pass 2.
        const auto rmsWindow = [&](int startFrame, int count) {
            double sq = 0.0;
            for (int f = startFrame; f < startFrame + count; ++f) {
                const double s = recorded[static_cast<std::size_t>(f) * 2];
                sq += s * s;
            }
            return std::sqrt(sq / count);
        };
        const double pass1Rms = rmsWindow(lookahead + 200, 500);
        const double pass2Rms = rmsWindow(kLoopFrames + lookahead + 200, 500);
        QVERIFY2(pass1Rms > 0.10, qPrintable(QStringLiteral("pass1Rms=%1").arg(pass1Rms)));
        QVERIFY2(std::abs(pass2Rms - pass1Rms) / pass1Rms < 0.05,
                 qPrintable(QStringLiteral("beat 1 ducked across loop wrap: pass1Rms=%1 pass2Rms=%2")
                                .arg(pass1Rms).arg(pass2Rms)));
    }

    // D14: MixRenderLease::mix (e.g. live shuttle worker thread) must flush denormals even outside AudioEngine::render.
    void d14_mixRenderLeaseFlushesDenormalsOutsideAudioCallback() {
        struct ProbeState {
            bool ran = false;
            float result = 1.0f;
        };
        class DenormalProbe final : public BlockProcessor {
        public:
            explicit DenormalProbe(std::shared_ptr<ProbeState> st) : m_st(std::move(st)) {}
            void process(std::span<float>, const BlockContext&) noexcept override {
                volatile float a = 1.0e-39f;
                volatile float b = 0.5f;
                m_st->result = a * b;
                m_st->ran = true;
            }
        private:
            std::shared_ptr<ProbeState> m_st;
        };
        const auto state = std::make_shared<ProbeState>();
        const auto token = registerMixPlanStage(
            "dsp1-d14-worker-denormal",
            [state](const Timeline&, MixPlan& plan) {
                plan.processors.push_back(std::make_shared<DenormalProbe>(state));
            },
            900);
        const auto cleanup = qScopeGuard([token] { unregisterMixPlanStage(token); });

        Timeline tl;
        tl.durationMs = 100.0;
        const auto plan = buildMixPlan(tl);
        std::vector<float> out(std::size_t{128} * 2, 0.0f);
        MixStats st;
        mixBlock(plan, nullptr, 48000.0, 0.0, 1000.0 / 48000.0, 128, out.data(), st);
        QVERIFY(state->ran);
        QVERIFY2(state->result == 0.0f,
                 qPrintable(QStringLiteral("expected MixRenderLease::mix to flush denormal to 0.0f, got %1")
                                .arg(state->result, 0, 'e', 6)));
    }

    // D15: ScopedDenormalGuard must restore FP control state on exit even when FTZ/FZ was already enabled on entry.
    void d15_denormalGuardRestoresFpControlWhenAlreadyEnabled() {
        const int initialRound = std::fegetround();
        const auto restoreRound = qScopeGuard([initialRound] { std::fesetround(initialRound); });
        std::fesetround(FE_TONEAREST);
        {
            const ScopedDenormalGuard outer;
            QCOMPARE(std::fegetround(), FE_TONEAREST);
            {
                const ScopedDenormalGuard inner;
                // Simulate a third-party plug-in altering FP rounding mode inside the nested guard.
                QCOMPARE(std::fesetround(FE_TOWARDZERO), 0);
                QCOMPARE(std::fegetround(), FE_TOWARDZERO);
            }
            QCOMPARE(std::fegetround(), FE_TONEAREST);
        }
        QCOMPARE(std::fegetround(), FE_TONEAREST);
    }

    // D16: ScopedDenormalGuard must preserve sticky FP exception flags across destruction.
    void d16_denormalGuardPreservesStickyFpFlags() {
        std::feclearexcept(FE_ALL_EXCEPT);
        {
            const ScopedDenormalGuard guard;
            std::feraiseexcept(FE_INEXACT);
            QVERIFY(std::fetestexcept(FE_INEXACT) != 0);
        }
        QVERIFY2(std::fetestexcept(FE_INEXACT) != 0,
                 "ScopedDenormalGuard destructor must not clobber sticky FP exception flags");
        std::feclearexcept(FE_ALL_EXCEPT);
    }

    // N1: Discontinuities (seeks/loops) must invalidate large PDC delay buffers in O(1),
    // without bulk-clearing tens of megabytes on the audio callback thread.
    void n1_pdcDelayLineResetIsO1WithoutBulkClear() {
        class FixedLatProc final : public BlockProcessor {
        public:
            explicit FixedLatProc(int lat) : m_lat(lat) {}
            void process(std::span<float>, const BlockContext&) noexcept override {}
            int latencySamples() const noexcept override { return m_lat; }
        private:
            int m_lat;
        };
        constexpr int kCompFrames = 192000;
        constexpr int kTracks = 20;
        const auto token = registerMixPlanStage(
            "dsp1-n1-large-pdc",
            [kCompFrames](const Timeline&, MixPlan& plan) {
                if (!plan.tracks.empty()) {
                    plan.tracks[0].processors.push_back(std::make_shared<FixedLatProc>(kCompFrames));
                }
            },
            900);
        const auto cleanup = qScopeGuard([token] { unregisterMixPlanStage(token); });

        Timeline tl;
        tl.durationMs = 10000.0;
        tl.raw.insert(QStringLiteral("master"), QJsonObject{{QStringLiteral("volumeDb"), 0.0},
                                                            {QStringLiteral("limiter"), false}});
        for (int t = 0; t < kTracks; ++t) {
            const std::string tid = "t" + std::to_string(t);
            tl.tracks.push_back(track(tid, TrackType::Audio));
            Clip c = clip("c" + std::to_string(t), tid, MediaType::Audio, 0.0, 10000.0);
            c.mediaPath = "mem.wav";
            if (t != 1) {
                c.volumeDb = -120.0;
            }
            tl.clips.push_back(std::move(c));
        }

        const auto plan = buildMixPlan(tl);
        QCOMPARE(plan.tracks.size(), std::size_t{kTracks});
        prepareMixPlan(plan, 48000.0);
        std::vector<float> dc(std::size_t{256} * 2, 0.5f);
        std::vector<VoicePcm> vp(plan.voices.size());
        for (auto& v : vp) {
            v.linear = dc.data();
            v.linearCount = 256;
        }
        std::vector<float> out(std::size_t{16} * 2, 0.0f);
        MixStats st;

        // Warm up with non-zero audio so stale data lives in trackDelay[1..19].
        mixBlock(plan, vp.data(), 48000.0, 0.0, 1000.0 / 48000.0, 16, out.data(), st);

        // 200 discontinuities on 19 * 192000-frame stereo delay lines (~29 MB each).
        // Bulk-clearing (~5.8 GB total) takes tens/hundreds of ms; O(1) reset takes < 5 ms.
        QElapsedTimer timer;
        timer.start();
        for (int i = 0; i < 200; ++i) {
            const double seekMs = static_cast<double>((i & 1) ? 5000 : 1000);
            mixBlock(plan, vp.data(), 48000.0, seekMs, 1000.0 / 48000.0, 16, out.data(), st);
        }
        const qint64 elapsedMs = timer.elapsed();
        QVERIFY2(elapsedMs < 25,
                 qPrintable(QStringLiteral("200 seeks across 20x192k PDC buffers took %1 ms (expected O(1) < 25 ms)")
                                .arg(elapsedMs)));

        // Verify no stale leakage after discontinuity and exact kCompFrames delay for a fresh impulse.
        std::vector<float> imp(std::size_t{200000} * 2, 0.0f);
        imp[std::size_t{10} * 2] = 0.75f;
        imp[std::size_t{10} * 2 + 1] = 0.75f;
        for (auto& v : vp) {
            v.linear = imp.data();
            v.linearCount = 200000;
        }
        std::vector<float> blk(std::size_t{128} * 2, 0.0f);
        int foundAt = -1;
        float foundVal = 0.0f;
        for (int at = 0; at < kCompFrames + 256; at += 128) {
            mixBlock(plan, vp.data(), 48000.0, at * 1000.0 / 48000.0, 1000.0 / 48000.0, 128, blk.data(), st);
            for (int f = 0; f < 128; ++f) {
                const float v = std::abs(blk[static_cast<std::size_t>(f) * 2]);
                if (v > 0.1f && foundAt < 0) {
                    foundAt = at + f;
                    foundVal = blk[static_cast<std::size_t>(f) * 2];
                }
            }
        }
        QCOMPARE(foundAt, 10 + kCompFrames);
        QVERIFY(std::abs(foundVal - 0.75f) < 1e-4f);
    }

    // N3: Toggling master.limiter live on a quiet 272.727 Hz tone (half-period == 88-frame limiter latency at 48 kHz)
    // must not suffer phase cancellation / amplitude dip.
    void n3_masterLimiterToggleHasNoPhaseCancellationAt272Hz() {
        QTemporaryDir dir;
        QVERIFY(dir.isValid());
        const QString toneWav = dir.filePath(QStringLiteral("sine272.wav"));
        constexpr int kFrames = 48000;
        const double freq = 48000.0 / 176.0;  // 272.72727 Hz -> 88 frames is exact 180 deg phase shift
        {
            QFile f(toneWav);
            QVERIFY(f.open(QIODevice::WriteOnly));
            const std::uint32_t dataBytes = kFrames * 8;
            const auto put32 = [&](std::uint32_t v) { f.write(reinterpret_cast<const char*>(&v), 4); };
            const auto put16 = [&](std::uint16_t v) { f.write(reinterpret_cast<const char*>(&v), 2); };
            f.write("RIFF"); put32(36 + dataBytes); f.write("WAVEfmt "); put32(16); put16(3); put16(2);
            put32(48000); put32(48000 * 8); put16(8); put16(32); f.write("data"); put32(dataBytes);
            for (int i = 0; i < kFrames; ++i) {
                const float s = static_cast<float>(0.4 * std::sin(2.0 * std::numbers::pi * freq * i / 48000.0));
                f.write(reinterpret_cast<const char*>(&s), 4);
                f.write(reinterpret_cast<const char*>(&s), 4);
            }
        }
        auto off = std::make_shared<Timeline>();
        off->tracks = {track("a", TrackType::Audio)};
        Clip c = clip("c", "a", MediaType::Audio, 0.0, 1000.0);
        c.mediaPath = toneWav.toStdString();
        off->clips = {c};
        off->durationMs = 1000.0;
        off->raw.insert(QStringLiteral("master"), QJsonObject{{QStringLiteral("volumeDb"), 0.0},
                                                              {QStringLiteral("limiter"), false}});
        auto on = std::make_shared<Timeline>(*off);
        on->raw.insert(QStringLiteral("master"), QJsonObject{{QStringLiteral("volumeDb"), 0.0},
                                                             {QStringLiteral("limiter"), true}});

        AudioEngine engine;
        engine.setTimeline(off);
        AudioEngine::Options opts;
        opts.backend = AudioEngine::Backend::Manual;
        opts.sampleRate = 48000;
        std::string err;
        QVERIFY2(engine.start(opts, &err), err.c_str());
        playback::TransportCommand cmd;
        cmd.seq = 1; cmd.playing = true; cmd.rate = 1.0; cmd.seekSeq = 1; cmd.seekMs = 0.0;
        engine.feed().command.store(cmd);
        QTRY_VERIFY(engine.stats().sessions >= 1);
        QTest::qWait(80);

        std::vector<float> recorded;
        std::vector<float> block(std::size_t{480} * 2, 0.0f);
        int blk = 0;
        const auto runBlocks = [&](int count) {
            for (int i = 0; i < count; ++i, ++blk) {
                engine.renderManual(block, static_cast<std::int64_t>(blk) * 10'000'000LL);
                recorded.insert(recorded.end(), block.begin(), block.end());
            }
        };
        runBlocks(10);  // 100 ms OFF
        const std::size_t toggleOnAt = recorded.size() / 2;
        engine.setTimeline(on);
        runBlocks(10);  // 100 ms ON
        const std::size_t toggleOffAt = recorded.size() / 2;
        engine.setTimeline(off);
        runBlocks(10);  // 100 ms OFF
        engine.stop();

        // Every 96-sample window (> half cycle = 88 samples) must retain a peak near 0.40 (no cancellation dip).
        const auto minHalfCyclePeak = [&](std::size_t start, std::size_t span) {
            float worst = 1e9f;
            for (std::size_t f = start; f + 96 < start + span; ++f) {
                float pk = 0.0f;
                for (std::size_t j = 0; j < 96; ++j) {
                    pk = std::max(pk, std::abs(recorded[(f + j) * 2]));
                }
                worst = std::min(worst, pk);
            }
            return worst;
        };
        const float peakOn = minHalfCyclePeak(toggleOnAt, 2000);
        const float peakOff = minHalfCyclePeak(toggleOffAt, 2000);
        QVERIFY2(peakOn >= 0.32f,
                 qPrintable(QStringLiteral("OFF->ON toggle cancelled 272.727 Hz tone (min 96-sample peak=%1, expected >= 0.32)").arg(peakOn)));
        QVERIFY2(peakOff >= 0.32f,
                 qPrintable(QStringLiteral("ON->OFF toggle cancelled 272.727 Hz tone (min 96-sample peak=%1, expected >= 0.32)").arg(peakOff)));
    }

    // N4: LoudnessMeter::resetClip must catch immediate post-reset intersample clipping
    // while still suppressing pre-reset residual energy and avoiding false latches on continuous non-clipping audio.
    void n4_clipResetCatchesImmediateIntersampleClipping() {
        LoudnessMeter meter(48000.0, 2);

        // 1. Hot pre-reset audio -> resetClip -> silence/quiet must NOT re-latch.
        std::vector<float> hot(std::size_t{64} * 2, 0.0f);
        for (std::size_t i = 0; i < 64; ++i) {
            const float s = (i & 1) ? 10.0f : -10.0f;
            hot[2 * i] = s;
            hot[2 * i + 1] = s;
        }
        meter.processInterleaved(hot.data(), 64);
        QVERIFY(meter.clipped());
        meter.resetClip();
        QVERIFY(!meter.clipped());
        std::vector<float> silence(std::size_t{64} * 2, 0.0f);
        meter.processInterleaved(silence.data(), 64);
        QVERIFY2(!meter.clipped(), "Pre-reset +20 dBFS residual must not re-latch clip after resetClip()");

        // 2. N4 exact scenario: resetClip, then feed [.99, .99, -.99, -.99] twice followed by silence.
        // Every sample is <= 0.99, but 4x true-peak FIR reaches ~1.409 -> CLIP must latch!
        meter.resetClip();
        const float pattern[8] = {0.99f, 0.99f, -0.99f, -0.99f, 0.99f, 0.99f, -0.99f, -0.99f};
        std::vector<float> burst(std::size_t{72} * 2, 0.0f);
        for (int i = 0; i < 8; ++i) {
            burst[static_cast<std::size_t>(i) * 2] = pattern[i];
            burst[static_cast<std::size_t>(i) * 2 + 1] = pattern[i];
        }
        meter.processInterleaved(burst.data(), 72);
        QVERIFY2(meter.clipped(),
                 "resetClip() followed by [.99,.99,-.99,-.99]x2 + silence must latch CLIP (FIR true peak ~1.409)");

        // 3. Continuous non-clipping 0.95f DC across resetClip() must NOT false-latch from a synthetic step.
        LoudnessMeter dcMeter(48000.0, 2);
        std::vector<float> dc(std::size_t{64} * 2, 0.95f);
        // Prime history with steady 0.95f DC, then clear any initial 0->0.95 startup step overshoot.
        dcMeter.processInterleaved(dc.data(), 64);
        dcMeter.resetClip();
        QVERIFY(!dcMeter.clipped());
        dcMeter.processInterleaved(dc.data(), 64);
        QVERIFY2(!dcMeter.clipped(), "Continuous non-clipping 0.95f DC must not false-latch after resetClip()");
    }

    // Round 3 N1: Enabling MasterLimiter after bypassed silence must keep output and detector
    // look-ahead aligned throughout the delay slew so transients never exceed -1 dBTP.
    void r3_n1_limiterRespectsCeilingDuringEnableTransition() {
        const auto checkImpulseAt = [](int impulseFrame) {
            MasterLimiter limiter;
            limiter.prepare(48000.0);
            // Warm bypassed silence with hardReset=true (liveDelay_=0, liveMix_=0).
            std::vector<float> silence(std::size_t{480} * 2, 0.0f);
            limiter.processLive(silence, false, true);

            constexpr int kTotalFrames = 2048;
            std::vector<float> buf(std::size_t{kTotalFrames} * 2, 0.0f);
            buf[static_cast<std::size_t>(impulseFrame) * 2] = 4.0f;
            buf[static_cast<std::size_t>(impulseFrame) * 2 + 1] = 4.0f;
            limiter.processLive(buf, true, false);

            float maxAbs = 0.0f;
            int maxAt = -1;
            for (int f = 0; f < kTotalFrames; ++f) {
                const float v = std::max(std::abs(buf[static_cast<std::size_t>(f) * 2]),
                                         std::abs(buf[static_cast<std::size_t>(f) * 2 + 1]));
                if (v > maxAbs) {
                    maxAbs = v;
                    maxAt = f;
                }
            }
            LoudnessMeter meter(48000.0, 2);
            meter.processInterleaved(buf.data(), kTotalFrames);
            QVERIFY2(maxAbs <= 0.90f,
                     qPrintable(QStringLiteral("N1 impulse@%1 exceeded ceiling: peak=%2 at frame %3")
                                    .arg(impulseFrame).arg(maxAbs, 0, 'f', 4).arg(maxAt)));
            QVERIFY2(meter.truePeakDb() <= -0.95,
                     qPrintable(QStringLiteral("N1 impulse@%1 exceeded -1 dBTP: truePeakDb=%2")
                                    .arg(impulseFrame).arg(meter.truePeakDb(), 0, 'f', 2)));
        };

        // Exact report.md case (frame 300) plus early/boundary/late transition frames.
        for (int f : {300, 0, 10, 50, 180, 192, 500, 1056}) {
            checkImpulseAt(f);
            if (QTest::currentTestFailed()) return;
        }

        // Also verify hot Fs/4 inter-sample true-peak bursts during early and mid enable slew,
        // and confirm processLive performs zero heap allocations during the transition.
        for (int burstStart : {0, 50, 300}) {
            MasterLimiter limiter;
            limiter.prepare(48000.0);
            std::vector<float> silence(std::size_t{480} * 2, 0.0f);
            limiter.processLive(silence, false, true);
            constexpr int kTotalFrames = 2048;
            std::vector<float> buf(std::size_t{kTotalFrames} * 2, 0.0f);
            for (int i = 0; i < 64; ++i) {
                const float s = ((i % 4) < 2) ? 1.5f : -1.5f;
                buf[static_cast<std::size_t>(burstStart + i) * 2] = s;
                buf[static_cast<std::size_t>(burstStart + i) * 2 + 1] = s;
            }
            nt::testing::allocations = 0;
            nt::testing::countAllocations = true;
            limiter.processLive(buf, true, false);
            nt::testing::countAllocations = false;
            QCOMPARE(std::size_t{nt::testing::allocations}, std::size_t{0});
            LoudnessMeter meter(48000.0, 2);
            meter.processInterleaved(buf.data(), kTotalFrames);
            QVERIFY2(meter.truePeakDb() <= -0.95,
                     qPrintable(QStringLiteral("N1 Fs/4 burst@%1 exceeded -1 dBTP: truePeakDb=%2")
                                    .arg(burstStart).arg(meter.truePeakDb(), 0, 'f', 2)));
        }
    }

    // DSP1b: dynamic plug-in latency changes during playback must update PDC delay lines
    // with zero audio-thread allocations, click-free crossfade, and sample-accurate alignment.
    void dsp1b_dynamicLatencyChangeCrossfadesWithoutAllocationOrClick() {
        class VariableDelayProc final : public BlockProcessor {
        public:
            explicit VariableDelayProc(std::shared_ptr<std::atomic<int>> targetLat)
                : m_targetLat(std::move(targetLat)) {}
            void prepare(double) override {
                m_buf.assign(std::size_t{4096} * 2, 0.0f);
                m_w = 0;
            }
            void reset() noexcept override {
                BlockProcessor::reset();
                std::fill(m_buf.begin(), m_buf.end(), 0.0f);
                m_w = 0;
            }
            int latencySamples() const noexcept override {
                return m_targetLat->load(std::memory_order_acquire);
            }
            void process(std::span<float> stereo, const BlockContext&) noexcept override {
                const int d = std::clamp(m_targetLat->load(std::memory_order_acquire), 0, 4095);
                const int cap = static_cast<int>(m_buf.size() / 2);
                const int n = static_cast<int>(stereo.size() / 2);
                for (int f = 0; f < n; ++f) {
                    const float inL = stereo[static_cast<std::size_t>(f) * 2];
                    const float inR = stereo[static_cast<std::size_t>(f) * 2 + 1];
                    m_buf[static_cast<std::size_t>(m_w) * 2] = inL;
                    m_buf[static_cast<std::size_t>(m_w) * 2 + 1] = inR;
                    int r = m_w - d;
                    if (r < 0) r += cap;
                    stereo[static_cast<std::size_t>(f) * 2] = m_buf[static_cast<std::size_t>(r) * 2];
                    stereo[static_cast<std::size_t>(f) * 2 + 1] = m_buf[static_cast<std::size_t>(r) * 2 + 1];
                    m_w = (m_w + 1 == cap) ? 0 : m_w + 1;
                }
            }
        private:
            std::shared_ptr<std::atomic<int>> m_targetLat;
            std::vector<float> m_buf;
            int m_w = 0;
        };

        auto targetLat = std::make_shared<std::atomic<int>>(0);
        const auto token = registerMixPlanStage(
            "dsp1b-var-lat",
            [targetLat](const Timeline&, MixPlan& plan) {
                if (!plan.tracks.empty()) {
                    plan.tracks[0].processors.push_back(std::make_shared<VariableDelayProc>(targetLat));
                }
            },
            900);
        const auto cleanup = qScopeGuard([token] { unregisterMixPlanStage(token); });

        // Track 0 has the variable-latency plugin (muted clip so we inspect Track 1's crossfade cleanly first).
        Timeline tl;
        tl.raw.insert(QStringLiteral("master"), QJsonObject{{QStringLiteral("volumeDb"), 0.0},
                                                            {QStringLiteral("limiter"), false}});
        tl.tracks = {track("t0", TrackType::Audio), track("t1", TrackType::Audio)};
        Clip c0 = clip("c0", "t0", MediaType::Audio, 0.0, 2000.0);
        c0.volumeDb = -120.0;
        Clip c1 = clip("c1", "t1", MediaType::Audio, 0.0, 2000.0);
        tl.clips = {c0, c1};
        tl.durationMs = 2000.0;

        const auto plan = buildMixPlan(tl);
        prepareMixPlan(plan, kRate);
        QCOMPARE(planLatencySamples(plan), 0);

        // Continuous 440 Hz sine on Track 1; switch Track 0 latency 0 -> 512 -> 1024 -> 0 during playback.
        constexpr int kTotalFrames = 16384;
        std::vector<float> sine(std::size_t{kTotalFrames} * 2, 0.0f);
        for (int i = 0; i < kTotalFrames; ++i) {
            const float s = static_cast<float>(0.5 * std::sin(2.0 * std::numbers::pi * 440.0 * i / kRate));
            sine[static_cast<std::size_t>(i) * 2] = s;
            sine[static_cast<std::size_t>(i) * 2 + 1] = s;
        }
        VoicePcm vp[2]{};
        vp[0].linear = sine.data(); vp[0].linearCount = kTotalFrames;
        vp[1].linear = sine.data(); vp[1].linearCount = kTotalFrames;

        std::vector<float> recorded(std::size_t{kTotalFrames} * 2, 0.0f);
        MixStats st;
        std::size_t allocs = 0;
        for (int at = 0; at < kTotalFrames; at += 128) {
            if (at == 2048) targetLat->store(512, std::memory_order_release);
            if (at == 6144) targetLat->store(1024, std::memory_order_release);
            if (at == 10240) targetLat->store(0, std::memory_order_release);
            nt::testing::allocations = 0;
            nt::testing::countAllocations = true;
            mixBlock(plan, vp, kRate, frameMs(at), 1000.0 / kRate, 128,
                     recorded.data() + static_cast<std::size_t>(at) * 2, st);
            nt::testing::countAllocations = false;
            allocs += nt::testing::allocations;
            if (at == 2048) QCOMPARE(planLatencySamples(plan), 512);
            if (at == 6144) QCOMPARE(planLatencySamples(plan), 1024);
            if (at == 10240) QCOMPARE(planLatencySamples(plan), 0);
        }
        QCOMPARE(allocs, std::size_t{0});

        // Verify no clicks and no mute hole across all three transitions (2048, 6144, 10240).
        // Natural max step of 0.5*sin(2*pi*440*n/48000) is ~0.0288; crossfade over >= 32 samples keeps step < 0.08.
        for (int boundary : {2048, 6144, 10240}) {
            float maxStep = 0.0f;
            for (int f = boundary - 8; f < boundary + 256; ++f) {
                const float step = std::abs(recorded[static_cast<std::size_t>(f) * 2] -
                                            recorded[static_cast<std::size_t>(f - 1) * 2]);
                maxStep = std::max(maxStep, step);
            }
            QVERIFY2(maxStep < 0.08f,
                     qPrintable(QStringLiteral("click at latency switch frame %1: maxStep=%2").arg(boundary).arg(maxStep)));
        }

        // Now verify both tracks' impulses align sample-accurately after a runtime 0 -> 512 jump.
        targetLat->store(0, std::memory_order_release);
        c0.volumeDb = 0.0;
        tl.clips = {c0, c1};
        const auto alignPlan = buildMixPlan(tl);
        prepareMixPlan(alignPlan, kRate);
        std::vector<float> imp(std::size_t{4096} * 2, 0.0f);
        imp[std::size_t{2000} * 2] = 0.5f;
        imp[std::size_t{2000} * 2 + 1] = 0.5f;
        vp[0].linear = imp.data(); vp[0].linearCount = 4096;
        vp[1].linear = imp.data(); vp[1].linearCount = 4096;
        std::vector<float> alignOut(std::size_t{4096} * 2, 0.0f);
        for (int at = 0; at < 4096; at += 128) {
            if (at == 1024) targetLat->store(512, std::memory_order_release);
            mixBlock(alignPlan, vp, kRate, frameMs(at), 1000.0 / kRate, 128,
                     alignOut.data() + static_cast<std::size_t>(at) * 2, st);
        }
        // Impulse at frame 2000 delayed by 512 on BOTH tracks -> sums to 1.0 at frame 2512, 0 at frame 2000.
        QVERIFY2(std::abs(alignOut[std::size_t{2000} * 2]) < 1e-4f,
                 qPrintable(QStringLiteral("Track 1 did not follow 0->512 latency jump: frame 2000=%1")
                                .arg(alignOut[std::size_t{2000} * 2])));
        QVERIFY2(std::abs(alignOut[std::size_t{2512} * 2] - 1.0f) < 1e-4f,
                 qPrintable(QStringLiteral("expected aligned sum 1.0 at frame 2512, got %1")
                                .arg(alignOut[std::size_t{2512} * 2])));
    }

    // DSP1b: A bypassed plug-in reports 0 latency to compensation, and bypassing/un-bypassing
    // during playback crossfades sibling track delay lines with zero audio-thread allocations.
    void dsp1b_bypassedPluginReportsZeroLatencyAndCrossfades() {
        class FixedDelayProc final : public BlockProcessor {
        public:
            explicit FixedDelayProc(int lat) : m_lat(lat) {}
            void prepare(double) override {
                m_buf.assign(static_cast<std::size_t>(m_lat + 1) * 2, 0.0f);
                m_w = 0;
                m_valid = 0;
            }
            void reset() noexcept override {
                BlockProcessor::reset();
                m_w = 0;
                m_valid = 0;
            }
            void onBypassedBlock(std::span<const float>, const BlockContext&) noexcept override {
                m_w = 0;
                m_valid = 0;
            }
            int latencySamples() const noexcept override { return m_lat; }
            void process(std::span<float> stereo, const BlockContext&) noexcept override {
                const int cap = static_cast<int>(m_buf.size() / 2);
                const int n = static_cast<int>(stereo.size() / 2);
                for (int f = 0; f < n; ++f) {
                    const float inL = stereo[static_cast<std::size_t>(f) * 2];
                    const float inR = stereo[static_cast<std::size_t>(f) * 2 + 1];
                    m_buf[static_cast<std::size_t>(m_w) * 2] = inL;
                    m_buf[static_cast<std::size_t>(m_w) * 2 + 1] = inR;
                    float outL = 0.0f, outR = 0.0f;
                    if (m_valid >= m_lat) {
                        int r = m_w - m_lat;
                        if (r < 0) r += cap;
                        outL = m_buf[static_cast<std::size_t>(r) * 2];
                        outR = m_buf[static_cast<std::size_t>(r) * 2 + 1];
                    }
                    stereo[static_cast<std::size_t>(f) * 2] = outL;
                    stereo[static_cast<std::size_t>(f) * 2 + 1] = outR;
                    m_w = (m_w + 1 == cap) ? 0 : m_w + 1;
                    if (m_valid < cap) ++m_valid;
                }
            }
        private:
            int m_lat;
            std::vector<float> m_buf;
            int m_w = 0;
            int m_valid = 0;
        };

        auto proc = std::make_shared<FixedDelayProc>(512);
        const auto token = registerMixPlanStage(
            "dsp1b-bypass-lat",
            [proc](const Timeline&, MixPlan& plan) {
                if (!plan.tracks.empty()) {
                    plan.tracks[0].processors.push_back(proc);
                }
            },
            900);
        const auto cleanup = qScopeGuard([token] { unregisterMixPlanStage(token); });

        Timeline tl;
        tl.raw.insert(QStringLiteral("master"), QJsonObject{{QStringLiteral("volumeDb"), 0.0},
                                                            {QStringLiteral("limiter"), false}});
        tl.tracks = {track("t0", TrackType::Audio), track("t1", TrackType::Audio)};
        tl.clips = {clip("c0", "t0", MediaType::Audio, 0.0, 2000.0),
                    clip("c1", "t1", MediaType::Audio, 0.0, 2000.0)};
        tl.durationMs = 2000.0;

        const auto plan = buildMixPlan(tl);
        prepareMixPlan(plan, kRate);
        QCOMPARE(planLatencySamples(plan), 512);

        // Impulse at 1000 (active -> aligns at 1512), bypass at 2048 -> impulse at 3000 (bypassed -> aligns at 3000),
        // un-bypass at 4096 -> impulse at 5000 (active -> aligns at 5512). Zero audio-thread allocations throughout.
        constexpr int kTotal = 8192;
        std::vector<float> imp(std::size_t{kTotal} * 2, 0.0f);
        for (int at : {1000, 3000, 5000}) {
            imp[static_cast<std::size_t>(at) * 2] = 0.5f;
            imp[static_cast<std::size_t>(at) * 2 + 1] = 0.5f;
        }
        VoicePcm vp[2]{};
        vp[0].linear = imp.data(); vp[0].linearCount = kTotal;
        vp[1].linear = imp.data(); vp[1].linearCount = kTotal;

        std::vector<float> out(std::size_t{kTotal} * 2, 0.0f);
        MixStats st;
        std::size_t allocs = 0;
        for (int at = 0; at < kTotal; at += 128) {
            if (at == 2048) {
                proc->setBypassed(true);
                QCOMPARE(proc->effectiveLatencySamples(), 0);
            }
            if (at == 4096) {
                proc->setBypassed(false);
                QCOMPARE(proc->effectiveLatencySamples(), 512);
            }
            nt::testing::allocations = 0;
            nt::testing::countAllocations = true;
            mixBlock(plan, vp, kRate, frameMs(at), 1000.0 / kRate, 128,
                     out.data() + static_cast<std::size_t>(at) * 2, st);
            nt::testing::countAllocations = false;
            allocs += nt::testing::allocations;
            if (at == 2048) QCOMPARE(planLatencySamples(plan), 0);
            if (at == 4096) QCOMPARE(planLatencySamples(plan), 512);
        }
        QCOMPARE(allocs, std::size_t{0});
        QVERIFY2(std::abs(out[std::size_t{1512} * 2] - 1.0f) < 1e-4f,
                 qPrintable(QStringLiteral("active impulse@1512=%1").arg(out[std::size_t{1512} * 2])));
        QVERIFY2(std::abs(out[std::size_t{3000} * 2] - 1.0f) < 1e-4f,
                 qPrintable(QStringLiteral("bypassed impulse@3000=%1").arg(out[std::size_t{3000} * 2])));
        QVERIFY2(std::abs(out[std::size_t{3512} * 2]) < 1e-4f,
                 qPrintable(QStringLiteral("bypassed ghost@3512=%1").arg(out[std::size_t{3512} * 2])));
        QVERIFY2(std::abs(out[std::size_t{5512} * 2] - 1.0f) < 1e-4f,
                 qPrintable(QStringLiteral("re-enabled impulse@5512=%1").arg(out[std::size_t{5512} * 2])));
    }

    // DSP1b: renderOffline must invoke reprobeLatency() before computing PDC trim/delay and rendering.
    void dsp1b_offlineExportReprobesLatencyBeforeRender() {
        class ReprobeDelayProc final : public BlockProcessor {
        public:
            explicit ReprobeDelayProc(std::shared_ptr<std::atomic<int>> reprobeCount)
                : m_reprobeCount(std::move(reprobeCount)) {}
            void prepare(double) override {
                m_buf.assign(std::size_t{1024} * 2, 0.0f);
                m_w = 0;
                m_valid = 0;
                m_reportedLat = 0;  // stale until reprobeLatency() is called
            }
            void reprobeLatency(double) override {
                m_reprobeCount->fetch_add(1, std::memory_order_acq_rel);
                m_reportedLat = 512;
            }
            int latencySamples() const noexcept override { return m_reportedLat; }
            void process(std::span<float> stereo, const BlockContext&) noexcept override {
                constexpr int kLat = 512;
                const int cap = static_cast<int>(m_buf.size() / 2);
                const int n = static_cast<int>(stereo.size() / 2);
                for (int f = 0; f < n; ++f) {
                    const float inL = stereo[static_cast<std::size_t>(f) * 2];
                    const float inR = stereo[static_cast<std::size_t>(f) * 2 + 1];
                    m_buf[static_cast<std::size_t>(m_w) * 2] = inL;
                    m_buf[static_cast<std::size_t>(m_w) * 2 + 1] = inR;
                    float outL = 0.0f, outR = 0.0f;
                    if (m_valid >= kLat) {
                        int r = m_w - kLat;
                        if (r < 0) r += cap;
                        outL = m_buf[static_cast<std::size_t>(r) * 2];
                        outR = m_buf[static_cast<std::size_t>(r) * 2 + 1];
                    }
                    stereo[static_cast<std::size_t>(f) * 2] = outL;
                    stereo[static_cast<std::size_t>(f) * 2 + 1] = outR;
                    m_w = (m_w + 1 == cap) ? 0 : m_w + 1;
                    if (m_valid < cap) ++m_valid;
                }
            }
        private:
            std::shared_ptr<std::atomic<int>> m_reprobeCount;
            std::vector<float> m_buf;
            int m_w = 0;
            int m_valid = 0;
            int m_reportedLat = 0;
        };

        auto reprobeCount = std::make_shared<std::atomic<int>>(0);
        const auto token = registerMixPlanStage(
            "dsp1b-offline-reprobe",
            [reprobeCount](const Timeline&, MixPlan& plan) {
                if (!plan.tracks.empty()) {
                    plan.tracks[0].processors.push_back(std::make_shared<ReprobeDelayProc>(reprobeCount));
                }
            },
            900);
        const auto cleanup = qScopeGuard([token] { unregisterMixPlanStage(token); });

        QTemporaryDir dir;
        QVERIFY(dir.isValid());
        const QString impWav = dir.filePath(QStringLiteral("reprobe_imp.wav"));
        constexpr int kFrames = 4800;
        {
            QFile f(impWav);
            QVERIFY(f.open(QIODevice::WriteOnly));
            const std::uint32_t dataBytes = kFrames * 8;
            const auto put32 = [&](std::uint32_t v) { f.write(reinterpret_cast<const char*>(&v), 4); };
            const auto put16 = [&](std::uint16_t v) { f.write(reinterpret_cast<const char*>(&v), 2); };
            f.write("RIFF"); put32(36 + dataBytes); f.write("WAVEfmt "); put32(16); put16(3); put16(2);
            put32(48000); put32(48000 * 8); put16(8); put16(32); f.write("data"); put32(dataBytes);
            for (int i = 0; i < kFrames; ++i) {
                const float s = (i == 1000) ? 0.5f : 0.0f;
                f.write(reinterpret_cast<const char*>(&s), 4);
                f.write(reinterpret_cast<const char*>(&s), 4);
            }
        }
        Timeline tl;
        tl.raw.insert(QStringLiteral("master"), QJsonObject{{QStringLiteral("volumeDb"), 0.0},
                                                            {QStringLiteral("limiter"), false}});
        tl.tracks = {track("t0", TrackType::Audio), track("t1", TrackType::Audio)};
        Clip c0 = clip("c0", "t0", MediaType::Audio, 0.0, 100.0);
        c0.mediaPath = impWav.toStdString();
        Clip c1 = clip("c1", "t1", MediaType::Audio, 0.0, 100.0);
        c1.mediaPath = impWav.toStdString();
        tl.clips = {c0, c1};
        tl.durationMs = 100.0;

        const auto out = renderOffline(tl, 48000, 0.0, 100.0);
        QVERIFY(reprobeCount->load(std::memory_order_acquire) >= 1);
        QVERIFY2(std::abs(out[std::size_t{1000} * 2] - 1.0f) < 1e-4f,
                 qPrintable(QStringLiteral("reprobed offline export expected 1.0 at frame 1000, got %1")
                                .arg(out[std::size_t{1000} * 2])));
        QVERIFY2(std::abs(out[std::size_t{1512} * 2]) < 1e-4f,
                 qPrintable(QStringLiteral("ghost impulse at 1512: %1").arg(out[std::size_t{1512} * 2])));
    }

    // D3 + D12.2: Multi-clip voice-level dynamic PDC (decrease, mid-process increase, bypass).
    void dsp1b_voiceLevelDynamicPdcIncreaseDecreaseAndBypass() {
        class VoiceDynDelayProc final : public BlockProcessor {
        public:
            explicit VoiceDynDelayProc(std::shared_ptr<std::atomic<int>> nextLat, bool applyInsideProcess)
                : m_nextLat(std::move(nextLat)), m_applyInsideProcess(applyInsideProcess) {}
            void prepare(double) override {
                m_buf.assign(std::size_t{2048} * 2, 0.0f);
                m_w = 0;
                m_reported = m_nextLat->load(std::memory_order_acquire);
            }
            void reset() noexcept override {
                BlockProcessor::reset();
                std::fill(m_buf.begin(), m_buf.end(), 0.0f);
                m_w = 0;
            }
            int latencySamples() const noexcept override {
                return m_applyInsideProcess ? m_reported : m_nextLat->load(std::memory_order_acquire);
            }
            void process(std::span<float> stereo, const BlockContext&) noexcept override {
                const int d = std::clamp(m_nextLat->load(std::memory_order_acquire), 0, 2047);
                m_reported = d;
                const int cap = static_cast<int>(m_buf.size() / 2);
                const int n = static_cast<int>(stereo.size() / 2);
                for (int f = 0; f < n; ++f) {
                    m_buf[static_cast<std::size_t>(m_w) * 2] = stereo[static_cast<std::size_t>(f) * 2];
                    m_buf[static_cast<std::size_t>(m_w) * 2 + 1] = stereo[static_cast<std::size_t>(f) * 2 + 1];
                    int r = m_w - d;
                    if (r < 0) r += cap;
                    stereo[static_cast<std::size_t>(f) * 2] = m_buf[static_cast<std::size_t>(r) * 2];
                    stereo[static_cast<std::size_t>(f) * 2 + 1] = m_buf[static_cast<std::size_t>(r) * 2 + 1];
                    m_w = (m_w + 1 == cap) ? 0 : m_w + 1;
                }
            }
        private:
            std::shared_ptr<std::atomic<int>> m_nextLat;
            bool m_applyInsideProcess = false;
            int m_reported = 0;
            std::vector<float> m_buf;
            int m_w = 0;
        };

        // Part A: Latency decrease (512 -> 0) discovered during Clip 1's process() must NOT
        // inject a bogus 512-sample voiceDelay onto Clip 1 or report stale 512 into track PDC.
        {
            auto nextLat = std::make_shared<std::atomic<int>>(512);
            auto proc = std::make_shared<VoiceDynDelayProc>(nextLat, /*applyInsideProcess=*/true);
            const auto token = registerMixPlanStage(
                "dsp1b-d3-dec",
                [proc](const Timeline&, MixPlan& plan) {
                    if (plan.voices.size() >= 2) {
                        plan.voices[1].processors.push_back(proc);
                    }
                },
                900);
            const auto cleanup = qScopeGuard([token] { unregisterMixPlanStage(token); });

            Timeline tl;
            tl.raw.insert(QStringLiteral("master"), QJsonObject{{QStringLiteral("volumeDb"), 0.0},
                                                                {QStringLiteral("limiter"), false}});
            tl.tracks = {track("t0", TrackType::Audio)};
            Clip c0 = clip("c0", "t0", MediaType::Audio, 0.0, 1000.0);
            Clip c1 = clip("c1", "t0", MediaType::Audio, 0.0, 1000.0);
            tl.clips = {c0, c1};
            tl.durationMs = 1000.0;

            const auto plan = buildMixPlan(tl);
            prepareMixPlan(plan, kRate);
            QCOMPARE(planLatencySamples(plan), 512);

            constexpr int kTotal = 4096;
            std::vector<float> zero(std::size_t{kTotal} * 2, 0.0f);
            std::vector<float> imp(std::size_t{kTotal} * 2, 0.0f);
            imp[std::size_t{1024} * 2] = 0.8f;
            imp[std::size_t{1024} * 2 + 1] = 0.8f;
            VoicePcm vp[2]{};
            vp[0].linear = zero.data(); vp[0].linearCount = kTotal;
            vp[1].linear = imp.data(); vp[1].linearCount = kTotal;
            std::vector<float> out(std::size_t{kTotal} * 2, 0.0f);
            MixStats st;
            for (int at = 0; at < kTotal; at += 128) {
                if (at == 1024) {
                    nextLat->store(0, std::memory_order_release);
                }
                mixBlock(plan, vp, kRate, frameMs(at), 1000.0 / kRate, 128,
                         out.data() + static_cast<std::size_t>(at) * 2, st);
                if (at == 1024) {
                    QCOMPARE(planLatencySamples(plan), 0);
                }
            }
            // Clip 1's impulse at frame 1024 must exit immediately at frame 1024 (not delayed to 1536).
            QVERIFY2(std::abs(out[std::size_t{1024} * 2] - 0.8f) < 1e-4f,
                     qPrintable(QStringLiteral("D3 decrease injected bogus voice delay: frame 1024=%1")
                                    .arg(out[std::size_t{1024} * 2])));
            QVERIFY2(std::abs(out[std::size_t{1536} * 2]) < 1e-4f,
                     qPrintable(QStringLiteral("D3 decrease bogus ghost at 1536=%1")
                                    .arg(out[std::size_t{1536} * 2])));
        }

        // Part B: Latency increase (0 -> 512) discovered during Clip 1's process() must delay
        // Clip 0 on the SAME block rather than mixing Clip 0 uncompensated for one block.
        {
            auto nextLat = std::make_shared<std::atomic<int>>(0);
            auto proc = std::make_shared<VoiceDynDelayProc>(nextLat, /*applyInsideProcess=*/true);
            const auto token = registerMixPlanStage(
                "dsp1b-d3-inc",
                [proc](const Timeline&, MixPlan& plan) {
                    if (plan.voices.size() >= 2) {
                        plan.voices[1].processors.push_back(proc);
                    }
                },
                900);
            const auto cleanup = qScopeGuard([token] { unregisterMixPlanStage(token); });

            Timeline tl;
            tl.raw.insert(QStringLiteral("master"), QJsonObject{{QStringLiteral("volumeDb"), 0.0},
                                                                {QStringLiteral("limiter"), false}});
            tl.tracks = {track("t0", TrackType::Audio)};
            tl.clips = {clip("c0", "t0", MediaType::Audio, 0.0, 1000.0),
                        clip("c1", "t0", MediaType::Audio, 0.0, 1000.0)};
            tl.durationMs = 1000.0;

            const auto plan = buildMixPlan(tl);
            prepareMixPlan(plan, kRate);
            QCOMPARE(planLatencySamples(plan), 0);

            constexpr int kTotal = 4096;
            std::vector<float> imp0(std::size_t{kTotal} * 2, 0.0f);
            std::vector<float> zero(std::size_t{kTotal} * 2, 0.0f);
            // Place Clip 0 impulse at frame 1024 + 80 (after 64-sample crossfade on the SAME block at 1024).
            imp0[std::size_t{1104} * 2] = 0.5f;
            imp0[std::size_t{1104} * 2 + 1] = 0.5f;
            VoicePcm vp[2]{};
            vp[0].linear = imp0.data(); vp[0].linearCount = kTotal;
            vp[1].linear = zero.data(); vp[1].linearCount = kTotal;
            std::vector<float> out(std::size_t{kTotal} * 2, 0.0f);
            MixStats st;
            for (int at = 0; at < kTotal; at += 128) {
                if (at == 1024) {
                    nextLat->store(512, std::memory_order_release);
                }
                mixBlock(plan, vp, kRate, frameMs(at), 1000.0 / kRate, 128,
                         out.data() + static_cast<std::size_t>(at) * 2, st);
            }
            // Clip 0's impulse at frame 1104 (within the transition block 1024..1151) must be delayed to 1616,
            // NOT emitted uncompensated at frame 1104.
            QVERIFY2(std::abs(out[std::size_t{1104} * 2]) < 1e-4f,
                     qPrintable(QStringLiteral("D3 increase left Clip 0 uncompensated on transition block: frame 1104=%1")
                                    .arg(out[std::size_t{1104} * 2])));
            QVERIFY2(std::abs(out[std::size_t{1616} * 2] - 0.5f) < 1e-4f,
                     qPrintable(QStringLiteral("D3 increase expected Clip 0 delayed to 1616: got %1")
                                    .arg(out[std::size_t{1616} * 2])));

            // Part C: Voice bypass drops latency to 0 and aligns both voices.
            proc->setBypassed(true);
            mixBlock(plan, vp, kRate, frameMs(kTotal), 1000.0 / kRate, 128, out.data(), st);
            QCOMPARE(planLatencySamples(plan), 0);
        }
    }

    // D4 + D12.3: Continuous-signal bypass and un-bypass must crossfade without clicks on the bypassed track itself.
    void dsp1b_bypassContinuousSineClickFreeOnBypassedTrack() {
        class WarmDelayProc final : public BlockProcessor {
        public:
            explicit WarmDelayProc(int lat) : m_lat(lat) {}
            void prepare(double) override {
                m_buf.assign(static_cast<std::size_t>(m_lat + 1) * 2, 0.0f);
                m_w = 0;
                m_valid = 0;
            }
            void reset() noexcept override {
                BlockProcessor::reset();
                m_w = 0;
                m_valid = 0;
            }
            void onBypassedBlock(std::span<const float> stereo, const BlockContext&) noexcept override {
                const int cap = static_cast<int>(m_buf.size() / 2);
                const int n = static_cast<int>(stereo.size() / 2);
                for (int f = 0; f < n; ++f) {
                    m_buf[static_cast<std::size_t>(m_w) * 2] = stereo[static_cast<std::size_t>(f) * 2];
                    m_buf[static_cast<std::size_t>(m_w) * 2 + 1] = stereo[static_cast<std::size_t>(f) * 2 + 1];
                    m_w = (m_w + 1 == cap) ? 0 : m_w + 1;
                    if (m_valid < cap) ++m_valid;
                }
            }
            int latencySamples() const noexcept override { return m_lat; }
            void process(std::span<float> stereo, const BlockContext&) noexcept override {
                const int cap = static_cast<int>(m_buf.size() / 2);
                const int n = static_cast<int>(stereo.size() / 2);
                for (int f = 0; f < n; ++f) {
                    const float inL = stereo[static_cast<std::size_t>(f) * 2];
                    const float inR = stereo[static_cast<std::size_t>(f) * 2 + 1];
                    m_buf[static_cast<std::size_t>(m_w) * 2] = inL;
                    m_buf[static_cast<std::size_t>(m_w) * 2 + 1] = inR;
                    float outL = 0.0f, outR = 0.0f;
                    if (m_valid >= m_lat) {
                        int r = m_w - m_lat;
                        if (r < 0) r += cap;
                        outL = m_buf[static_cast<std::size_t>(r) * 2];
                        outR = m_buf[static_cast<std::size_t>(r) * 2 + 1];
                    }
                    stereo[static_cast<std::size_t>(f) * 2] = outL;
                    stereo[static_cast<std::size_t>(f) * 2 + 1] = outR;
                    m_w = (m_w + 1 == cap) ? 0 : m_w + 1;
                    if (m_valid < cap) ++m_valid;
                }
            }
        private:
            int m_lat;
            std::vector<float> m_buf;
            int m_w = 0;
            int m_valid = 0;
        };

        auto proc = std::make_shared<WarmDelayProc>(512);
        const auto token = registerMixPlanStage(
            "dsp1b-d4-bypass-sine",
            [proc](const Timeline&, MixPlan& plan) {
                if (!plan.tracks.empty()) {
                    plan.tracks[0].processors.push_back(proc);
                }
            },
            900);
        const auto cleanup = qScopeGuard([token] { unregisterMixPlanStage(token); });

        Timeline tl;
        tl.raw.insert(QStringLiteral("master"), QJsonObject{{QStringLiteral("volumeDb"), 0.0},
                                                            {QStringLiteral("limiter"), false}});
        tl.tracks = {track("t0", TrackType::Audio), track("t1", TrackType::Audio)};
        Clip c0 = clip("c0", "t0", MediaType::Audio, 0.0, 2000.0);
        Clip c1 = clip("c1", "t1", MediaType::Audio, 0.0, 2000.0);
        c1.volumeDb = -120.0;  // isolate Track 0 (the bypassed track itself)
        tl.clips = {c0, c1};
        tl.durationMs = 2000.0;

        const auto plan = buildMixPlan(tl);
        prepareMixPlan(plan, kRate);

        constexpr int kTotal = 8192;
        std::vector<float> sine(std::size_t{kTotal} * 2, 0.0f);
        for (int i = 0; i < kTotal; ++i) {
            const float s = static_cast<float>(0.5 * std::sin(2.0 * std::numbers::pi * 440.0 * i / kRate));
            sine[static_cast<std::size_t>(i) * 2] = s;
            sine[static_cast<std::size_t>(i) * 2 + 1] = s;
        }
        VoicePcm vp[2]{};
        vp[0].linear = sine.data(); vp[0].linearCount = kTotal;
        vp[1].linear = sine.data(); vp[1].linearCount = kTotal;
        std::vector<float> out(std::size_t{kTotal} * 2, 0.0f);
        MixStats st;
        std::size_t allocs = 0;
        for (int at = 0; at < kTotal; at += 128) {
            if (at == 2048) proc->setBypassed(true);
            if (at == 4096) proc->setBypassed(false);
            nt::testing::allocations = 0;
            nt::testing::countAllocations = true;
            mixBlock(plan, vp, kRate, frameMs(at), 1000.0 / kRate, 128,
                     out.data() + static_cast<std::size_t>(at) * 2, st);
            nt::testing::countAllocations = false;
            allocs += nt::testing::allocations;
        }
        QCOMPARE(allocs, std::size_t{0});
        for (int boundary : {2048, 4096}) {
            float maxStep = 0.0f;
            for (int f = boundary - 8; f < boundary + 256; ++f) {
                const float step = std::abs(out[static_cast<std::size_t>(f) * 2] -
                                            out[static_cast<std::size_t>(f - 1) * 2]);
                maxStep = std::max(maxStep, step);
            }
            QVERIFY2(maxStep < 0.08f,
                     qPrintable(QStringLiteral("D4 click on bypassed track at frame %1: maxStep=%2")
                                    .arg(boundary).arg(maxStep)));
        }
    }

    // D5 + D12.3: Changing latency while a 64-sample DelayLine crossfade is in progress
    // (on sub-64-frame callback blocks) must finish the active fade without a step click.
    void dsp1b_delayLineSub64MidFadeRetargetingClickFree() {
        class LatReporterProc final : public BlockProcessor {
        public:
            explicit LatReporterProc(std::shared_ptr<std::atomic<int>> lat) : m_lat(std::move(lat)) {}
            int latencySamples() const noexcept override { return m_lat->load(std::memory_order_acquire); }
            void process(std::span<float>, const BlockContext&) noexcept override {}
        private:
            std::shared_ptr<std::atomic<int>> m_lat;
        };

        auto lat = std::make_shared<std::atomic<int>>(0);
        const auto token = registerMixPlanStage(
            "dsp1b-d5-midfade",
            [lat](const Timeline&, MixPlan& plan) {
                if (!plan.tracks.empty()) {
                    plan.tracks[0].processors.push_back(std::make_shared<LatReporterProc>(lat));
                }
            },
            900);
        const auto cleanup = qScopeGuard([token] { unregisterMixPlanStage(token); });

        Timeline tl;
        tl.raw.insert(QStringLiteral("master"), QJsonObject{{QStringLiteral("volumeDb"), 0.0},
                                                            {QStringLiteral("limiter"), false}});
        tl.tracks = {track("t0", TrackType::Audio), track("t1", TrackType::Audio)};
        Clip c0 = clip("c0", "t0", MediaType::Audio, 0.0, 2000.0);
        c0.volumeDb = -120.0;
        Clip c1 = clip("c1", "t1", MediaType::Audio, 0.0, 2000.0);
        tl.clips = {c0, c1};
        tl.durationMs = 2000.0;

        const auto plan = buildMixPlan(tl);
        prepareMixPlan(plan, kRate);

        constexpr int kTotal = 4096;
        std::vector<float> sine(std::size_t{kTotal} * 2, 0.0f);
        for (int i = 0; i < kTotal; ++i) {
            const float s = static_cast<float>(0.5 * std::sin(2.0 * std::numbers::pi * 440.0 * i / kRate));
            sine[static_cast<std::size_t>(i) * 2] = s;
            sine[static_cast<std::size_t>(i) * 2 + 1] = s;
        }
        VoicePcm vp[2]{};
        vp[0].linear = sine.data(); vp[0].linearCount = kTotal;
        vp[1].linear = sine.data(); vp[1].linearCount = kTotal;
        std::vector<float> out(std::size_t{kTotal} * 2, 0.0f);
        MixStats st;
        // 32-frame callback fragments; retarget at 1024 (0->512) and mid-fade at 1056 (512->1024).
        for (int at = 0; at < kTotal; at += 32) {
            if (at == 1024) lat->store(512, std::memory_order_release);
            if (at == 1056) lat->store(1024, std::memory_order_release);
            mixBlock(plan, vp, kRate, frameMs(at), 1000.0 / kRate, 32,
                     out.data() + static_cast<std::size_t>(at) * 2, st);
        }
        float maxStep = 0.0f;
        for (int f = 1016; f < 1300; ++f) {
            const float step = std::abs(out[static_cast<std::size_t>(f) * 2] -
                                        out[static_cast<std::size_t>(f - 1) * 2]);
            maxStep = std::max(maxStep, step);
        }
        QVERIFY2(maxStep < 0.08f,
                 qPrintable(QStringLiteral("D5 mid-fade retarget click: maxStep=%1").arg(maxStep)));
    }

    // D6 + D12.1: DelayLine overflow ring growth (> 65536 frames) must adopt without clicks
    // or >1.36s silence dropout, and must clamp pathological latencies without overflow.
    void dsp1b_delayLineOverflowRingGrowthAndCeiling() {
        class OverflowLatProc final : public BlockProcessor {
        public:
            explicit OverflowLatProc(std::shared_ptr<std::atomic<int>> lat) : m_lat(std::move(lat)) {}
            int latencySamples() const noexcept override { return m_lat->load(std::memory_order_acquire); }
            void process(std::span<float>, const BlockContext&) noexcept override {}
        private:
            std::shared_ptr<std::atomic<int>> m_lat;
        };

        auto lat = std::make_shared<std::atomic<int>>(0);
        const auto token = registerMixPlanStage(
            "dsp1b-d6-overflow",
            [lat](const Timeline&, MixPlan& plan) {
                if (!plan.tracks.empty()) {
                    plan.tracks[0].processors.push_back(std::make_shared<OverflowLatProc>(lat));
                }
            },
            900);
        const auto cleanup = qScopeGuard([token] { unregisterMixPlanStage(token); });

        Timeline tl;
        tl.raw.insert(QStringLiteral("master"), QJsonObject{{QStringLiteral("volumeDb"), 0.0},
                                                            {QStringLiteral("limiter"), false}});
        tl.tracks = {track("t0", TrackType::Audio), track("t1", TrackType::Audio)};
        Clip c0 = clip("c0", "t0", MediaType::Audio, 0.0, 5000.0);
        c0.volumeDb = -120.0;
        Clip c1 = clip("c1", "t1", MediaType::Audio, 0.0, 5000.0);
        tl.clips = {c0, c1};
        tl.durationMs = 5000.0;

        const auto plan = buildMixPlan(tl);
        prepareMixPlan(plan, kRate);

        constexpr int kOverflowLat = 70000;
        constexpr int kJumpAt = 70016;    // after the initial 65536-frame ring is full of live audio
        constexpr int kServiceAt = 70144;
        constexpr int kTotal = 160000;
        std::vector<float> sine(std::size_t{kTotal} * 2, 0.0f);
        for (int i = 0; i < kTotal; ++i) {
            const float s = static_cast<float>(0.5 * std::sin(2.0 * std::numbers::pi * 440.0 * i / kRate));
            sine[static_cast<std::size_t>(i) * 2] = s;
            sine[static_cast<std::size_t>(i) * 2 + 1] = s;
        }
        VoicePcm vp[2]{};
        vp[0].linear = sine.data(); vp[0].linearCount = kTotal;
        vp[1].linear = sine.data(); vp[1].linearCount = kTotal;
        std::vector<float> out(std::size_t{kTotal} * 2, 0.0f);
        MixStats st;
        std::size_t allocs = 0;
        for (int at = 0; at < kTotal; at += 128) {
            if (at == kJumpAt) {
                lat->store(kOverflowLat, std::memory_order_release);
            }
            if (at == kServiceAt) {
                // Control/worker thread services overflow off the audio thread.
                serviceMixPlanControl(plan);
            }
            nt::testing::allocations = 0;
            nt::testing::countAllocations = true;
            mixBlock(plan, vp, kRate, frameMs(at), 1000.0 / kRate, 128,
                     out.data() + static_cast<std::size_t>(at) * 2, st);
            nt::testing::countAllocations = false;
            allocs += nt::testing::allocations;
        }
        // Reclaim retired ring off-thread.
        serviceMixPlanControl(plan);
        QCOMPARE(allocs, std::size_t{0});

        // Verify no hard click AND no silence dropout across adoption (kServiceAt) and ring fill (~kServiceAt + 70000).
        float maxStep = 0.0f;
        int silentBlocks = 0;
        for (int at = kJumpAt; at < kTotal - 128; at += 128) {
            float blockPeak = 0.0f;
            for (int f = 0; f < 128; ++f) {
                const int idx = at + f;
                const float cur = out[static_cast<std::size_t>(idx) * 2];
                const float prev = out[static_cast<std::size_t>(idx - 1) * 2];
                maxStep = std::max(maxStep, std::abs(cur - prev));
                blockPeak = std::max(blockPeak, std::abs(cur));
            }
            if (blockPeak < 0.05f) {
                ++silentBlocks;
            }
        }
        QVERIFY2(maxStep < 0.08f,
                 qPrintable(QStringLiteral("D6 click during overflow ring adoption/fill: maxStep=%1").arg(maxStep)));
        QCOMPARE(silentBlocks, 0);

        // Verify the grown ring now delays accurately by the full 70000 samples.
        std::vector<float> imp(std::size_t{kTotal} * 2, 0.0f);
        imp[std::size_t{1000} * 2] = 0.75f;
        imp[std::size_t{1000} * 2 + 1] = 0.75f;
        vp[0].linear = imp.data(); vp[0].linearCount = kTotal;
        vp[1].linear = imp.data(); vp[1].linearCount = kTotal;
        std::vector<float> impOut(std::size_t{kTotal} * 2, 0.0f);
        // Seek back to 0 to reset cursors on the already-grown ring.
        for (int at = 0; at < kTotal; at += 128) {
            mixBlock(plan, vp, kRate, frameMs(at), 1000.0 / kRate, 128,
                     impOut.data() + static_cast<std::size_t>(at) * 2, st);
        }
        QVERIFY2(std::abs(impOut[std::size_t{1000 + kOverflowLat} * 2] - 0.75f) < 1e-4f,
                 qPrintable(QStringLiteral("D6 grown ring expected 0.75 at %1, got %2")
                                .arg(1000 + kOverflowLat).arg(impOut[std::size_t{1000 + kOverflowLat} * 2])));

        // Verify pathological INT_MAX latency is clamped cleanly without overflow or crash.
        lat->store(std::numeric_limits<int>::max(), std::memory_order_release);
        std::vector<float> scratch(128 * 2, 0.0f);
        mixBlock(plan, vp, kRate, frameMs(kTotal), 1000.0 / kRate, 128, scratch.data(), st);
        serviceMixPlanControl(plan);
        mixBlock(plan, vp, kRate, frameMs(kTotal + 128), 1000.0 / kRate, 128, scratch.data(), st);
        serviceMixPlanControl(plan);
    }

    // DSP2 F7: windowed-sinc varispeed suppresses aliasing at >1x speed and bounds THD+N at fractional rates,
    // with zero audio-thread heap allocations.
    void dsp2_f7_sincVarispeedAliasingAndThdBound() {
        constexpr int kSrcFrames = 96000;
        constexpr int kOutFrames = 8192;
        constexpr int kTrim = 256;

        // 1. Aliasing suppression: 15 kHz sine played at 2.0x maps to 30 kHz (> 24 kHz Nyquist).
        // 2-point linear interpolation aliases this to 18 kHz at full amplitude (~0 dB);
        // band-limited windowed-sinc must attenuate it by > 75 dB.
        std::vector<float> aliasSrc(std::size_t{kSrcFrames} * 2);
        for (int i = 0; i < kSrcFrames; ++i) {
            const float s = static_cast<float>(0.8 * std::sin(2.0 * std::numbers::pi * 15000.0 * i / kRate));
            aliasSrc[std::size_t{2} * i] = s;
            aliasSrc[std::size_t{2} * i + 1] = s;
        }
        Timeline tl;
        tl.tracks = {track("a", TrackType::Audio)};
        Clip c = clip("c", "a", MediaType::Audio, 0.0, 2000.0);
        c.inPointMs = 100.0;
        c.speedMultiplier = 2.0;
        tl.clips = {c};
        const MixPlan plan2x = buildMixPlan(tl);

        VoicePcm vp{};
        vp.linear = aliasSrc.data();
        vp.linearCount = kSrcFrames;
        std::vector<float> out2x(std::size_t{kOutFrames} * 2, 0.0f);
        MixStats stats;
        nt::testing::allocations = 0;
        nt::testing::countAllocations = true;
        for (int off = 0; off < kOutFrames; off += 128) {
            mixBlock(plan2x, &vp, kRate, frameMs(off), 1000.0 / kRate, 128,
                     out2x.data() + static_cast<std::size_t>(off) * 2, stats);
        }
        nt::testing::countAllocations = false;
        const std::size_t allocs2x = nt::testing::allocations;
        QCOMPARE(allocs2x, std::size_t{0});

        double aliasSq = 0.0;
        const int nEval = kOutFrames - 2 * kTrim;
        for (int i = kTrim; i < kOutFrames - kTrim; ++i) {
            const double x = out2x[std::size_t{2} * i];
            aliasSq += x * x;
        }
        const double aliasRms = std::sqrt(aliasSq / nEval);
        const double refRms = 0.8 / std::sqrt(2.0);
        const double aliasDb = 20.0 * std::log10(std::max(aliasRms / refRms, 1e-12));
        QVERIFY2(aliasDb < -75.0,
                 qPrintable(QStringLiteral("2x varispeed 15kHz alias=%1 dB (expected < -75 dB)").arg(aliasDb)));

        // 2. Fractional varispeed THD+N: 5 kHz sine played at 1.37x (6.85 kHz) and 0.73x (3.65 kHz).
        // Linear interpolation yields ~-30 dB THD+N; windowed-sinc must stay < -75 dB.
        std::vector<float> toneSrc(std::size_t{kSrcFrames} * 2);
        for (int i = 0; i < kSrcFrames; ++i) {
            const float s = static_cast<float>(0.8 * std::sin(2.0 * std::numbers::pi * 5000.0 * i / kRate));
            toneSrc[std::size_t{2} * i] = s;
            toneSrc[std::size_t{2} * i + 1] = -s;
        }
        for (const double speedMul : {1.37, 0.73}) {
            tl.clips[0].speedMultiplier = speedMul;
            const MixPlan planFrac = buildMixPlan(tl);
            vp.linear = toneSrc.data();
            vp.linearCount = kSrcFrames;
            std::vector<float> outFrac(std::size_t{kOutFrames} * 2, 0.0f);
            nt::testing::allocations = 0;
            nt::testing::countAllocations = true;
            for (int off = 0; off < kOutFrames; off += 128) {
                mixBlock(planFrac, &vp, kRate, frameMs(off), 1000.0 / kRate, 128,
                         outFrac.data() + static_cast<std::size_t>(off) * 2, stats);
            }
            nt::testing::countAllocations = false;
            const std::size_t allocsFrac = nt::testing::allocations;
            QCOMPARE(allocsFrac, std::size_t{0});

            // Least-squares fit of fundamental A*cos(w*n) + B*sin(w*n) over interior window.
            const double w = 2.0 * std::numbers::pi * (5000.0 * speedMul) / kRate;
            double cc = 0.0, ss = 0.0, cs = 0.0, xc = 0.0, xs = 0.0;
            for (int i = kTrim; i < kOutFrames - kTrim; ++i) {
                const double cVal = std::cos(w * i);
                const double sVal = std::sin(w * i);
                const double x = outFrac[std::size_t{2} * i];
                cc += cVal * cVal; ss += sVal * sVal; cs += cVal * sVal;
                xc += x * cVal; xs += x * sVal;
            }
            const double det = cc * ss - cs * cs;
            const double aFit = (ss * xc - cs * xs) / det;
            const double bFit = (cc * xs - cs * xc) / det;
            const double fundAmp = std::hypot(aFit, bFit);
            QVERIFY2(std::abs(fundAmp - 0.8) < 0.005,
                     qPrintable(QStringLiteral("speed=%1 fundAmp=%2").arg(speedMul).arg(fundAmp)));
            double errSq = 0.0, sigSq = 0.0;
            for (int i = kTrim; i < kOutFrames - kTrim; ++i) {
                const double fit = aFit * std::cos(w * i) + bFit * std::sin(w * i);
                const double err = outFrac[std::size_t{2} * i] - fit;
                errSq += err * err;
                sigSq += fit * fit;
            }
            const double thdnDb = 10.0 * std::log10(std::max(errSq / sigSq, 1e-16));
            QVERIFY2(thdnDb < -75.0,
                     qPrintable(QStringLiteral("speed=%1 THD+N=%2 dB (expected < -75 dB)").arg(speedMul).arg(thdnDb)));
        }
    }

    // DSP2 F7: AudioSource decodes/resamples with highest swresample quality (steep anti-aliasing near Nyquist).
    void dsp2_f7_audioSourceSwresampleHighQuality() {
        QTemporaryDir dir;
        QVERIFY(dir.isValid());
        // Write a 96 kHz stereo float32 WAV with a 1 kHz passband tone (0.5) + 25.5 kHz out-of-band tone (0.5).
        // When resampled to 48 kHz (Nyquist 24 kHz), 25.5 kHz lies right past Nyquist and aliases to 22.5 kHz
        // unless the resampler uses a high-order Kaiser/SoXR filter.
        constexpr int kInRate = 96000;
        constexpr int kInFrames = 48000;  // 0.5 s
        const QString wavPath = dir.filePath("src96k.wav");
        {
            QFile f(wavPath);
            QVERIFY(f.open(QIODevice::WriteOnly));
            const quint32 dataBytes = quint32(kInFrames * 2 * sizeof(float));
            const quint32 riffSize = 36 + dataBytes;
            const auto w16 = [&](quint16 v) { char b[2]{char(v & 0xff), char(v >> 8)}; f.write(b, 2); };
            const auto w32 = [&](quint32 v) { char b[4]{char(v & 0xff), char((v >> 8) & 0xff), char((v >> 16) & 0xff), char(v >> 24)}; f.write(b, 4); };
            f.write("RIFF", 4); w32(riffSize); f.write("WAVE", 4);
            f.write("fmt ", 4); w32(16); w16(3); w16(2); w32(kInRate); w32(kInRate * 8); w16(8); w16(32);
            f.write("data", 4); w32(dataBytes);
            std::vector<float> buf(std::size_t{kInFrames} * 2);
            for (int i = 0; i < kInFrames; ++i) {
                const double t = static_cast<double>(i) / kInRate;
                const float s = static_cast<float>(0.5 * std::sin(2.0 * std::numbers::pi * 1000.0 * t) +
                                                   0.5 * std::sin(2.0 * std::numbers::pi * 25500.0 * t));
                buf[std::size_t{2} * i] = s;
                buf[std::size_t{2} * i + 1] = s;
            }
            f.write(reinterpret_cast<const char*>(buf.data()), qsizetype(dataBytes));
        }

        std::string error;
        auto src = AudioSource::open(wavPath.toStdString(), 48000, &error);
        QVERIFY2(src != nullptr, error.c_str());
        const auto pcm = src->readAll();
        const int outFrames = static_cast<int>(pcm.size() / 2);
        QCOMPARE(outFrames, 24000);

        // Use an exact common multiple of 1 kHz (48 samples/cycle) and 22.5 kHz (32/15 samples/cycle)
        // so the DFT has zero rectangular-window spectral leakage between the two tones.
        const int start = 2048;
        const int len = 19200;  // 0.4 s = 400 cycles of 1 kHz, 9000 cycles of 22.5 kHz
        QVERIFY(start + len <= outFrames - 1024);
        const int end = start + len;
        double passSin = 0.0, passCos = 0.0, aliasSin = 0.0, aliasCos = 0.0;
        for (int i = start; i < end; ++i) {
            const double x = pcm[std::size_t{2} * i];
            const double ph1 = 2.0 * std::numbers::pi * 1000.0 * i / 48000.0;
            const double phA = 2.0 * std::numbers::pi * 22500.0 * i / 48000.0;
            passSin += x * std::sin(ph1); passCos += x * std::cos(ph1);
            aliasSin += x * std::sin(phA); aliasCos += x * std::cos(phA);
        }
        const double passAmp = 2.0 * std::hypot(passSin, passCos) / len;
        const double aliasAmp = 2.0 * std::hypot(aliasSin, aliasCos) / len;
        const double aliasDb = 20.0 * std::log10(std::max(aliasAmp / std::max(passAmp, 1e-12), 1e-12));
        QVERIFY2(std::abs(passAmp - 0.5) < 0.005, qPrintable(QStringLiteral("passAmp=%1").arg(passAmp)));
        QVERIFY2(aliasDb < -90.0,
                 qPrintable(QStringLiteral("96k->48k 25.5kHz alias=%1 dB (expected < -90 dB)").arg(aliasDb)));
    }

    // DSP2 F8: per-block parameter smoothing bounds sample-to-sample zipper/click steps on effect
    // parameter jumps (gain, filter cutoff, eq3, compressor, echo, reverb, distortion) with zero allocations.
    void dsp2_f8_effectParameterSmoothingZipperStepBound() {
        const auto makeProcessor = [](const QJsonObject& fx) -> std::shared_ptr<BlockProcessor> {
            const QJsonObject raw{
                {"fps", 30}, {"durationMs", 1000},
                {"tracks", QJsonArray{QJsonObject{
                    {"id", "a"}, {"type", "audio"}, {"index", 0},
                    {"effects", QJsonArray{fx}}}}},
                {"clips", QJsonArray{QJsonObject{
                    {"id", "c"}, {"trackId", "a"}, {"mediaType", "audio"},
                    {"status", "generated"}, {"mediaPath", "unused.wav"},
                    {"startMs", 0}, {"durationMs", 1000}}}}};
            auto parsed = nt::parseTimelineJson(QJsonDocument(raw).toJson());
            if (!parsed.timeline) return nullptr;
            const auto plan = buildMixPlan(*parsed.timeline);
            if (plan.tracks.empty()) return nullptr;
            const auto targetId = fx.value("id").toString().toStdString();
            for (const auto& p : plan.tracks[0].processors) {
                if (p && p->id == targetId) return p;
            }
            return nullptr;
        };

        auto runStep = [](BlockProcessor& proc, std::string_view param, double newVal,
                          const std::vector<float>& input, int stepAtBlock,
                          float& maxStepAcrossBoundary, std::size_t& allocs, bool& setOk) {
            proc.prepare(kRate);
            const int totalFrames = static_cast<int>(input.size() / 2);
            std::vector<float> out = input;
            allocs = 0;
            maxStepAcrossBoundary = 0.0f;
            setOk = true;
            for (int blk = 0; blk * 128 < totalFrames; ++blk) {
                const int off = blk * 128;
                const int n = std::min(128, totalFrames - off);
                auto span = std::span<float>(out.data() + static_cast<std::size_t>(off) * 2, static_cast<std::size_t>(n) * 2);
                const BlockContext ctx{kRate, frameMs(off), 1000.0 / kRate, false, 0};
                nt::testing::allocations = 0;
                nt::testing::countAllocations = true;
                if (blk == stepAtBlock) {
                    setOk = proc.setParameter(param, newVal);
                }
                proc.process(span, ctx);
                nt::testing::countAllocations = false;
                allocs += nt::testing::allocations;
            }
            // Measure max sample-to-sample step from the step boundary through settling.
            const int start = stepAtBlock * 128;
            const int end = std::min(totalFrames, start + 512);
            for (int i = std::max(1, start); i < end; ++i) {
                const float dL = std::abs(out[std::size_t{2} * i] - out[std::size_t{2} * (i - 1)]);
                const float dR = std::abs(out[std::size_t{2} * i + 1] - out[std::size_t{2} * (i - 1) + 1]);
                maxStepAcrossBoundary = std::max({maxStepAcrossBoundary, dL, dR});
            }
            return out;
        };

        constexpr int kFrames = 2048;
        // DC input isolates pure gain/makeup jumps with zero carrier slope.
        std::vector<float> dc(std::size_t{kFrames} * 2, 0.8f);
        // 440 Hz sine (max natural per-sample delta = 0.5 * 2*pi*440/48000 = 0.0288).
        std::vector<float> sine440(std::size_t{kFrames} * 2);
        for (int i = 0; i < kFrames; ++i) {
            const float s = static_cast<float>(0.5 * std::sin(2.0 * std::numbers::pi * 440.0 * i / kRate));
            sine440[std::size_t{2} * i] = s;
            sine440[std::size_t{2} * i + 1] = s;
        }

        // 1. Gain effect: 0 dB -> -24 dB jump on 0.8 DC (unsmoothed jump = 0.75).
        {
            auto proc = makeProcessor({{"id", "g1"}, {"type", "gain"}, {"enabled", true}, {"gainDb", 0.0}});
            QVERIFY(proc != nullptr);
            float maxStep = 0.0f; std::size_t allocs = 0; bool setOk = false;
            const auto out = runStep(*proc, "gainDb", -24.0, dc, 4, maxStep, allocs, setOk);
            QVERIFY(setOk);
            QCOMPARE(allocs, std::size_t{0});
            QVERIFY2(maxStep < 0.01f, qPrintable(QStringLiteral("gain zipper maxStep=%1").arg(maxStep)));
            const float expectedFinal = static_cast<float>(0.8 * std::pow(10.0, -24.0 / 20.0));
            QVERIFY2(std::abs(out.back() - expectedFinal) < 1e-4f,
                     qPrintable(QStringLiteral("gain final=%1 expected=%2").arg(out.back()).arg(expectedFinal)));
        }

        // 2. Filter cutoff: 200 Hz -> 8000 Hz jump on 440 Hz sine (unsmoothed click > 0.25).
        {
            auto proc = makeProcessor({{"id", "f1"}, {"type", "filter"}, {"enabled", true},
                                       {"mode", "lowpass"}, {"frequency", 200.0}, {"q", 2.0}});
            QVERIFY(proc != nullptr);
            float maxStep = 0.0f; std::size_t allocs = 0; bool setOk = false;
            runStep(*proc, "frequency", 8000.0, sine440, 4, maxStep, allocs, setOk);
            QVERIFY(setOk);
            QCOMPARE(allocs, std::size_t{0});
            QVERIFY2(maxStep < 0.06f, qPrintable(QStringLiteral("filter cutoff zipper maxStep=%1").arg(maxStep)));
        }

        // 3. EQ3: midGainDb -12 dB -> +12 dB jump on 440 Hz sine.
        {
            auto proc = makeProcessor({{"id", "e1"}, {"type", "eq3"}, {"enabled", true},
                                       {"lowFreq", 200.0}, {"lowGainDb", 0.0},
                                       {"midFreq", 440.0}, {"midQ", 1.5}, {"midGainDb", -12.0},
                                       {"highFreq", 5000.0}, {"highGainDb", 0.0}});
            QVERIFY(proc != nullptr);
            float maxStep = 0.0f; std::size_t allocs = 0; bool setOk = false;
            runStep(*proc, "midGainDb", 12.0, sine440, 4, maxStep, allocs, setOk);
            QVERIFY(setOk);
            QCOMPARE(allocs, std::size_t{0});
            // At +12 dB boost, 440 Hz sine amplitude is ~2.0 -> natural slope ~0.115/sample; unsmoothed step > 0.6.
            QVERIFY2(maxStep < 0.16f, qPrintable(QStringLiteral("eq3 midGainDb zipper maxStep=%1").arg(maxStep)));
        }

        // 4. Compressor: thresholdDb 0 dB -> -40 dB jump on 0.2 DC (makeup gain jumps instantly without smoothing).
        {
            std::vector<float> dcQuiet(std::size_t{kFrames} * 2, 0.2f);
            auto proc = makeProcessor({{"id", "c1"}, {"type", "compressor"}, {"enabled", true},
                                       {"thresholdDb", 0.0}, {"ratio", 12.0},
                                       {"attackMs", 3.0}, {"releaseMs", 250.0}, {"kneeDb", 0.0}});
            QVERIFY(proc != nullptr);
            float maxStep = 0.0f; std::size_t allocs = 0; bool setOk = false;
            runStep(*proc, "thresholdDb", -40.0, dcQuiet, 8, maxStep, allocs, setOk);
            QVERIFY(setOk);
            QCOMPARE(allocs, std::size_t{0});
            QVERIFY2(maxStep < 0.02f, qPrintable(QStringLiteral("compressor thresholdDb zipper maxStep=%1").arg(maxStep)));
        }

        // 5. Echo mix: 0.0 -> 1.0 jump on 0.8 DC (50 ms = 2400-sample delay stays 0 during the 2048-frame test).
        {
            auto proc = makeProcessor({{"id", "ec1"}, {"type", "echo"}, {"enabled", true},
                                       {"delayMs", 50.0}, {"feedback", 0.0}, {"mix", 0.0}});
            QVERIFY(proc != nullptr);
            float maxStep = 0.0f; std::size_t allocs = 0; bool setOk = false;
            runStep(*proc, "mix", 1.0, dc, 4, maxStep, allocs, setOk);
            QVERIFY(setOk);
            QCOMPARE(allocs, std::size_t{0});
            QVERIFY2(maxStep < 0.01f, qPrintable(QStringLiteral("echo mix zipper maxStep=%1").arg(maxStep)));
        }

        // 6. Reverb mix: 0.0 -> 1.0 jump on 0.8 DC.
        {
            auto proc = makeProcessor({{"id", "rv1"}, {"type", "reverb"}, {"enabled", true},
                                       {"decaySec", 0.2}, {"mix", 0.0}});
            QVERIFY(proc != nullptr);
            float maxStep = 0.0f; std::size_t allocs = 0; bool setOk = false;
            runStep(*proc, "mix", 1.0, dc, 4, maxStep, allocs, setOk);
            QVERIFY(setOk);
            QCOMPARE(allocs, std::size_t{0});
            QVERIFY2(maxStep < 0.05f, qPrintable(QStringLiteral("reverb mix zipper maxStep=%1").arg(maxStep)));
        }

        // 7. Distortion outputDb: 0 dB -> -24 dB jump on 0.8 DC.
        {
            auto proc = makeProcessor({{"id", "d1"}, {"type", "distortion"}, {"enabled", true},
                                       {"driveDb", 6.0}, {"outputDb", 0.0}});
            QVERIFY(proc != nullptr);
            float maxStep = 0.0f; std::size_t allocs = 0; bool setOk = false;
            runStep(*proc, "outputDb", -24.0, dc, 4, maxStep, allocs, setOk);
            QVERIFY(setOk);
            QCOMPARE(allocs, std::size_t{0});
            QVERIFY2(maxStep < 0.015f, qPrintable(QStringLiteral("distortion outputDb zipper maxStep=%1").arg(maxStep)));
        }
    }

    // DSP2 fix1 D1: sampleSinc signed-kernel normalization at buffer edges and short buffers.
    void dsp2_fix1_d1_sincEdgeNormalization() {
        // Non-DC alternating / high-frequency signal exposes weightSum cancellation when
        // out-of-bounds taps are omitted from the denominator (blows up 20x-150x).
        std::vector<float> sigLong(256 * 2);
        for (int i = 0; i < 256; ++i) {
            const float v = (i % 2 == 0) ? 1.0f : -1.0f;
            sigLong[std::size_t{2} * i] = v;
            sigLong[std::size_t{2} * i + 1] = -v;
        }
        const auto fetchLong = [&](std::int64_t f, float& l, float& r) noexcept -> bool {
            if (f < 0 || f >= 256) { return false; }
            l = sigLong[static_cast<std::size_t>(f) * 2];
            r = sigLong[static_cast<std::size_t>(f) * 2 + 1];
            return true;
        };
        for (const double s : {0.0, 0.01, 255.0, 255.99}) {
            double l = 0.0, r = 0.0;
            sampleSinc(s, 1.0, fetchLong, l, r);
            QVERIFY2(std::isfinite(l) && std::isfinite(r) && std::abs(l) <= 1.25 && std::abs(r) <= 1.25,
                     qPrintable(QStringLiteral("D1 long edge s=%1 gave (%2, %3)").arg(s).arg(l).arg(r)));
        }
        // Very short buffer (4 frames) at s = 3.99 (simulates edge/underrun where f0+1 is missing).
        const std::vector<float> sigShort{1.0f, -1.0f, -1.0f, 1.0f, 1.0f, -1.0f, -1.0f, 1.0f};
        const auto fetchShort = [&](std::int64_t f, float& l, float& r) noexcept -> bool {
            if (f < 0 || f >= 4) { return false; }
            l = sigShort[static_cast<std::size_t>(f) * 2];
            r = sigShort[static_cast<std::size_t>(f) * 2 + 1];
            return true;
        };
        double l = 0.0, r = 0.0;
        sampleSinc(3.99, 1.0, fetchShort, l, r);
        QVERIFY2(std::isfinite(l) && std::abs(l) <= 1.25,
                 qPrintable(QStringLiteral("D1 short edge s=3.99 gave %1").arg(l)));
    }

    // DSP2 fix1 D2: live PcmRing multi-block mix at sourceRate == 1.0 with fractional offset and varispeed.
    void dsp2_fix1_d2_ringFractionalOffsetMargin() {
        constexpr int kSrcFrames = 16384;
        constexpr int kBlocks = 10;
        constexpr int kBlockFrames = 128;
        constexpr int kTotalOut = kBlocks * kBlockFrames;
        std::vector<float> sine(std::size_t{kSrcFrames} * 2);
        for (int i = 0; i < kSrcFrames; ++i) {
            const float s = static_cast<float>(0.8 * std::sin(2.0 * std::numbers::pi * 1000.0 * i / kRate));
            sine[std::size_t{2} * i] = s;
            sine[std::size_t{2} * i + 1] = -s;
        }
        for (const double speedMul : {1.0, 1.37}) {
            Timeline tl;
            tl.tracks = {track("a", TrackType::Audio)};
            Clip c = clip("c", "a", MediaType::Audio, 0.0, 1000.0);
            c.inPointMs = 200.5 * 1000.0 / kRate;
            c.speedMultiplier = speedMul;
            tl.clips = {c};
            const MixPlan planLin = buildMixPlan(tl);
            const MixPlan planRing = buildMixPlan(tl);

            VoicePcm linPcm{};
            linPcm.linear = sine.data();
            linPcm.linearCount = kSrcFrames;
            std::vector<float> outLin(std::size_t{kTotalOut} * 2, 0.0f);
            MixStats stLin;
            for (int b = 0; b < kBlocks; ++b) {
                const int off = b * kBlockFrames;
                mixBlock(planLin, &linPcm, kRate, frameMs(off), 1000.0 / kRate, kBlockFrames,
                         outLin.data() + static_cast<std::size_t>(off) * 2, stLin);
            }

            PcmRing ring(kSrcFrames, 0);
            QCOMPARE(ring.write(sine.data(), kSrcFrames), std::int64_t{kSrcFrames});
            ring.markEnd(kSrcFrames);
            VoicePcm ringPcm{};
            ringPcm.ring = &ring;
            ringPcm.live = true;
            std::vector<float> outRing(std::size_t{kTotalOut} * 2, 0.0f);
            MixStats stRing;
            for (int b = 0; b < kBlocks; ++b) {
                const int off = b * kBlockFrames;
                mixBlock(planRing, &ringPcm, kRate, frameMs(off), 1000.0 / kRate, kBlockFrames,
                         outRing.data() + static_cast<std::size_t>(off) * 2, stRing);
            }
            QCOMPARE(stRing.underruns, std::int64_t{0});
            float maxDiff = 0.0f;
            for (std::size_t i = 0; i < outLin.size(); ++i) {
                maxDiff = std::max(maxDiff, std::abs(outRing[i] - outLin[i]));
            }
            QVERIFY2(maxDiff < 1e-6f,
                     qPrintable(QStringLiteral("D2 ring vs linear speed=%1 maxDiff=%2").arg(speedMul).arg(maxDiff)));
        }
    }

    // DSP2 fix1 D3: varispeed > 4.8x (8.0x) must hold cutoff below output Nyquist.
    void dsp2_fix1_d3_highSpeedAntiAliasing() {
        constexpr int kSrcFrames = 96000;
        constexpr int kOutFrames = 4096;
        constexpr int kTrim = 256;
        std::vector<float> src8x(std::size_t{kSrcFrames} * 2);
        for (int i = 0; i < kSrcFrames; ++i) {
            const float s = static_cast<float>(0.8 * std::sin(2.0 * std::numbers::pi * 3750.0 * i / kRate));
            src8x[std::size_t{2} * i] = s;
            src8x[std::size_t{2} * i + 1] = s;
        }
        Timeline tl;
        tl.tracks = {track("a", TrackType::Audio)};
        Clip c = clip("c", "a", MediaType::Audio, 0.0, 2000.0);
        c.inPointMs = 100.0;
        c.speedMultiplier = 8.0;
        tl.clips = {c};
        const MixPlan plan8x = buildMixPlan(tl);
        VoicePcm vp{};
        vp.linear = src8x.data();
        vp.linearCount = kSrcFrames;
        std::vector<float> out8x(std::size_t{kOutFrames} * 2, 0.0f);
        MixStats stats;
        nt::testing::allocations = 0;
        nt::testing::countAllocations = true;
        for (int off = 0; off < kOutFrames; off += 128) {
            mixBlock(plan8x, &vp, kRate, frameMs(off), 1000.0 / kRate, 128,
                     out8x.data() + static_cast<std::size_t>(off) * 2, stats);
        }
        nt::testing::countAllocations = false;
        const std::size_t allocs8x = nt::testing::allocations;
        QCOMPARE(allocs8x, std::size_t{0});
        double aliasSq = 0.0;
        for (int i = kTrim; i < kOutFrames - kTrim; ++i) {
            const double x = out8x[std::size_t{2} * i];
            aliasSq += x * x;
        }
        const double aliasRms = std::sqrt(aliasSq / (kOutFrames - 2 * kTrim));
        const double refRms = 0.8 / std::sqrt(2.0);
        const double aliasDb = 20.0 * std::log10(std::max(aliasRms / refRms, 1e-12));
        QVERIFY2(aliasDb < -65.0,
                 qPrintable(QStringLiteral("D3 8x varispeed 3.75kHz alias=%1 dB (expected < -65 dB)").arg(aliasDb)));
    }

    // DSP2 fix1 D4: AudioSource resampling compensates linear-phase group delay (exact frame count + alignment).
    void dsp2_fix1_d4_audioSourceDelayAlignment() {
        QTemporaryDir dir;
        QVERIFY(dir.isValid());
        struct Case { int inRate; int outRate; int inFrames; int impulseIn; };
        const std::array<Case, 4> cases{{
            {96000, 48000, 48000, 10000},
            {48000, 96000, 24000, 5000},
            {44100, 48000, 22050, 4410},
            {48000, 44100, 24000, 4800}
        }};
        for (const auto& c : cases) {
            const int expectedOutFrames = static_cast<int>(std::llround(
                static_cast<double>(c.inFrames) * c.outRate / c.inRate));
            const int expectedPeak = static_cast<int>(std::llround(
                static_cast<double>(c.impulseIn) * c.outRate / c.inRate));
            const QString wavPath = dir.filePath(QStringLiteral("imp_%1_%2.wav").arg(c.inRate).arg(c.outRate));
            {
                QFile f(wavPath);
                QVERIFY(f.open(QIODevice::WriteOnly));
                const quint32 dataBytes = quint32(c.inFrames * 2 * sizeof(float));
                const quint32 riffSize = 36 + dataBytes;
                const auto w16 = [&](quint16 v) { char b[2]{char(v & 0xff), char(v >> 8)}; f.write(b, 2); };
                const auto w32 = [&](quint32 v) { char b[4]{char(v & 0xff), char((v >> 8) & 0xff), char((v >> 16) & 0xff), char(v >> 24)}; f.write(b, 4); };
                f.write("RIFF", 4); w32(riffSize); f.write("WAVE", 4);
                f.write("fmt ", 4); w32(16); w16(3); w16(2); w32(quint32(c.inRate)); w32(quint32(c.inRate * 8)); w16(8); w16(32);
                f.write("data", 4); w32(dataBytes);
                std::vector<float> buf(std::size_t{static_cast<std::size_t>(c.inFrames)} * 2, 0.0f);
                buf[std::size_t{2} * c.impulseIn] = 1.0f;
                buf[std::size_t{2} * c.impulseIn + 1] = 1.0f;
                f.write(reinterpret_cast<const char*>(buf.data()), qsizetype(dataBytes));
            }
            std::string error;
            auto src = AudioSource::open(wavPath.toStdString(), c.outRate, &error);
            QVERIFY2(src != nullptr, error.c_str());
            const auto pcm = src->readAll();
            const int outFrames = static_cast<int>(pcm.size() / 2);
            int peakIdx = 0;
            float peakVal = 0.0f;
            for (int i = 0; i < outFrames; ++i) {
                const float v = std::abs(pcm[std::size_t{2} * i]);
                if (v > peakVal) { peakVal = v; peakIdx = i; }
            }
            QVERIFY2(std::abs(peakIdx - expectedPeak) <= 1,
                     qPrintable(QStringLiteral("D4 %1->%2 readAll peakIdx=%3 (expected %4, outFrames=%5)")
                                    .arg(c.inRate).arg(c.outRate).arg(peakIdx).arg(expectedPeak).arg(outFrames)));
            QVERIFY2(std::abs(outFrames - expectedOutFrames) <= 1,
                     qPrintable(QStringLiteral("D4 %1->%2 readAll outFrames=%3 (expected %4)")
                                    .arg(c.inRate).arg(c.outRate).arg(outFrames).arg(expectedOutFrames)));

            const int seekStart = expectedPeak - 20;
            QVERIFY(src->seek(seekStart));
            std::vector<float> seg(40 * 2, 0.0f);
            QCOMPARE(src->read(seg.data(), 40), std::int64_t{40});
            int seekPeak = 0;
            float seekVal = 0.0f;
            for (int i = 0; i < 40; ++i) {
                const float v = std::abs(seg[std::size_t{2} * i]);
                if (v > seekVal) { seekVal = v; seekPeak = i; }
            }
            QVERIFY2(std::abs(seekPeak - 20) <= 1,
                     qPrintable(QStringLiteral("D4 %1->%2 seek(%3) peak=%4 (expected 20)")
                                    .arg(c.inRate).arg(c.outRate).arg(seekStart).arg(seekPeak)));
        }
    }

    // DSP2 fix1 D5: Effect and PatternAudioStage first-block / seek / re-prepare snap and cutoffHz smoothing.
    void dsp2_fix1_d5_snapAndPatternAudioStageSmoothing() {
        const auto makeProcessor = [](const QJsonObject& fx) -> std::shared_ptr<BlockProcessor> {
            const QJsonObject raw{
                {"fps", 30}, {"durationMs", 2000},
                {"tracks", QJsonArray{QJsonObject{
                    {"id", "a"}, {"type", "audio"}, {"index", 0},
                    {"effects", QJsonArray{fx}}}}},
                {"clips", QJsonArray{QJsonObject{
                    {"id", "c"}, {"trackId", "a"}, {"mediaType", "audio"},
                    {"status", "generated"}, {"mediaPath", "unused.wav"},
                    {"startMs", 0}, {"durationMs", 2000}}}}};
            auto parsed = nt::parseTimelineJson(QJsonDocument(raw).toJson());
            if (!parsed.timeline) return nullptr;
            const auto plan = buildMixPlan(*parsed.timeline);
            if (plan.tracks.empty()) return nullptr;
            const auto targetId = fx.value("id").toString().toStdString();
            for (const auto& p : plan.tracks[0].processors) {
                if (p && p->id == targetId) return p;
            }
            return nullptr;
        };

        // Effect first-block snap and post-seek snap.
        {
            auto proc = makeProcessor({{"id", "g1"}, {"type", "gain"}, {"enabled", true}, {"gainDb", 0.0}});
            QVERIFY(proc != nullptr);
            proc->prepare(kRate);
            QVERIFY(proc->setParameter("gainDb", -12.0));
            std::vector<float> blk(128 * 2, 1.0f);
            proc->process(blk, {kRate, 0.0, 1000.0 / kRate, false, 0});
            const float g12 = static_cast<float>(std::pow(10.0, -12.0 / 20.0));
            QVERIFY2(std::abs(blk[0] - g12) < 1e-5f,
                     qPrintable(QStringLiteral("Effect first-block snap sample0=%1 expected=%2").arg(blk[0]).arg(g12)));
            QVERIFY(proc->setParameter("gainDb", -6.0));
            std::ranges::fill(blk, 1.0f);
            proc->process(blk, {kRate, 500.0, 1000.0 / kRate, false, 0});
            const float g6 = static_cast<float>(std::pow(10.0, -6.0 / 20.0));
            QVERIFY2(std::abs(blk[0] - g6) < 1e-5f,
                     qPrintable(QStringLiteral("Effect seek snap sample0=%1 expected=%2").arg(blk[0]).arg(g6)));
        }

        // PatternAudioStage (SubtractiveInstrumentProcessor) cutoffHz smoothing and snap.
        {
            const auto makeSynth = [](double cutoffHz) -> std::shared_ptr<BlockProcessor> {
                const QJsonObject raw{
                    {"fps", 30}, {"durationMs", 2000},
                    {"tempo", QJsonObject{{"bpm", 120}}},
                    {"tracks", QJsonArray{QJsonObject{
                        {"id", "m"}, {"type", "midi"}, {"index", 0},
                        {"instrument", QJsonObject{
                            {"type", "subtractive"}, {"waveform", "saw"},
                            {"attackMs", 0}, {"decayMs", 0}, {"sustain", 1.0}, {"releaseMs", 0},
                            {"cutoffHz", cutoffHz}, {"resonance", 1.0}, {"gainDb", 0.0}}}}}},
                    {"clips", QJsonArray{QJsonObject{
                        {"id", "mc"}, {"trackId", "m"}, {"mediaType", "midi"},
                        {"status", "generated"}, {"startMs", 0}, {"durationMs", 2000},
                        {"notes", QJsonArray{QJsonObject{
                            {"id", "n1"}, {"pitch", 48}, {"velocity", 127},
                            {"startTick", 0}, {"durationTick", 1920}}}}}}}};
                auto parsed = nt::parseTimelineJson(QJsonDocument(raw).toJson());
                if (!parsed.timeline) return nullptr;
                const auto plan = buildMixPlan(*parsed.timeline);
                if (plan.tracks.empty()) return nullptr;
                for (const auto& p : plan.tracks[0].processors) {
                    if (p && p->id == "instrument") return p;
                }
                return nullptr;
            };

            auto synthRef300 = makeSynth(300.0);
            auto synthTest = makeSynth(8000.0);
            QVERIFY(synthRef300 != nullptr && synthTest != nullptr);
            synthRef300->prepare(kRate);
            synthTest->prepare(kRate);

            // First-block snap after prepare() + setParameter().
            QVERIFY(synthTest->setParameter("cutoffHz", 300.0));
            std::vector<float> refBlk(128 * 2, 0.0f), testBlk(128 * 2, 0.0f);
            synthRef300->process(refBlk, {kRate, 0.0, 1000.0 / kRate, false, 0});
            synthTest->process(testBlk, {kRate, 0.0, 1000.0 / kRate, false, 0});
            for (std::size_t i = 0; i < refBlk.size(); ++i) {
                QVERIFY2(std::abs(testBlk[i] - refBlk[i]) < 1e-6f,
                         qPrintable(QStringLiteral("D5 synth first-block snap diff at %1: %2 vs %3").arg(i).arg(testBlk[i]).arg(refBlk[i])));
            }

            // Re-prepare() followed by setParameter() to a NEW cutoff and process() at continuous timelineMs must snap.
            auto synthRef1200 = makeSynth(1200.0);
            QVERIFY(synthRef1200 != nullptr);
            synthRef1200->prepare(kRate);
            synthTest->prepare(kRate);
            QVERIFY(synthTest->setParameter("cutoffHz", 1200.0));
            std::ranges::fill(refBlk, 0.0f);
            std::ranges::fill(testBlk, 0.0f);
            const double nextMs = frameMs(128);
            synthRef1200->process(refBlk, {kRate, nextMs, 1000.0 / kRate, false, 0});
            synthTest->process(testBlk, {kRate, nextMs, 1000.0 / kRate, false, 0});
            for (std::size_t i = 0; i < refBlk.size(); ++i) {
                QVERIFY2(std::abs(testBlk[i] - refBlk[i]) < 1e-6f,
                         qPrintable(QStringLiteral("D5 synth re-prepare snap diff at %1: %2 vs %3").arg(i).arg(testBlk[i]).arg(refBlk[i])));
            }

            // Continuous playback cutoffHz jump 300 -> 8000 must smooth smoothly (not snap) with zero allocs.
            auto synthSmooth = makeSynth(300.0);
            QVERIFY(synthSmooth != nullptr);
            synthSmooth->prepare(kRate);
            constexpr int kTotal = 1024;
            std::vector<float> out(std::size_t{kTotal} * 2, 0.0f);
            std::size_t allocs = 0;
            for (int blk = 0; blk * 128 < kTotal; ++blk) {
                const int off = blk * 128;
                auto span = std::span<float>(out.data() + static_cast<std::size_t>(off) * 2, 128 * 2);
                nt::testing::allocations = 0;
                nt::testing::countAllocations = true;
                if (blk == 2) { QVERIFY(synthSmooth->setParameter("cutoffHz", 8000.0)); }
                synthSmooth->process(span, {kRate, frameMs(off), 1000.0 / kRate, false, 0});
                nt::testing::countAllocations = false;
                allocs += nt::testing::allocations;
            }
            QCOMPARE(allocs, std::size_t{0});
            const float jumpStep = std::abs(out[std::size_t{2} * 256] - out[std::size_t{2} * 255]);
            QVERIFY2(jumpStep < 0.15f, qPrintable(QStringLiteral("D5 synth cutoffHz boundary step=%1").arg(jumpStep)));

            // Post-seek snap: seek to 500 ms with cutoffHz = 300 must match reference immediately.
            QVERIFY(synthSmooth->setParameter("cutoffHz", 300.0));
            std::ranges::fill(refBlk, 0.0f);
            std::ranges::fill(testBlk, 0.0f);
            synthRef300->process(refBlk, {kRate, 500.0, 1000.0 / kRate, false, 0});
            synthSmooth->process(testBlk, {kRate, 500.0, 1000.0 / kRate, false, 0});
            for (std::size_t i = 0; i < refBlk.size(); ++i) {
                QVERIFY2(std::abs(testBlk[i] - refBlk[i]) < 1e-6f,
                         qPrintable(QStringLiteral("D5 synth seek snap diff at %1: %2 vs %3").arg(i).arg(testBlk[i]).arg(refBlk[i])));
            }
        }
    }

    // DSP2 fix1 D6-D9: echo upward delayMs + feedback, distortion change during silence,
    // slow block-rate ramp smoothing, and non-finite guards.
    void dsp2_fix1_d6_echoUpwardDelayAndFeedback() {
        const QJsonObject raw{
            {"fps", 30}, {"durationMs", 2000},
            {"tracks", QJsonArray{QJsonObject{
                {"id", "a"}, {"type", "audio"}, {"index", 0},
                {"effects", QJsonArray{QJsonObject{
                    {"id", "ec1"}, {"type", "echo"}, {"enabled", true},
                    {"delayMs", 50.0}, {"feedback", 0.2}, {"mix", 1.0}}}}}}},
            {"clips", QJsonArray{QJsonObject{
                {"id", "c"}, {"trackId", "a"}, {"mediaType", "audio"},
                {"status", "generated"}, {"mediaPath", "unused.wav"},
                {"startMs", 0}, {"durationMs", 2000}}}}};
        auto parsed = nt::parseTimelineJson(QJsonDocument(raw).toJson());
        QVERIFY(parsed.timeline);
        const auto plan = buildMixPlan(*parsed.timeline);
        std::shared_ptr<BlockProcessor> proc;
        for (const auto& p : plan.tracks[0].processors) {
            if (p && p->id == "ec1") { proc = p; break; }
        }
        QVERIFY(proc != nullptr);
        proc->prepare(kRate);
        constexpr int kTotal = 24000;  // 500 ms
        std::vector<float> buf(std::size_t{kTotal} * 2, 0.0f);
        buf[std::size_t{2} * 1024] = 1.0f;
        buf[std::size_t{2} * 1024 + 1] = 1.0f;
        std::size_t allocs = 0;
        for (int blk = 0; blk * 128 < kTotal; ++blk) {
            const int off = blk * 128;
            const int n = std::min(128, kTotal - off);
            auto span = std::span<float>(buf.data() + static_cast<std::size_t>(off) * 2, static_cast<std::size_t>(n) * 2);
            nt::testing::allocations = 0;
            nt::testing::countAllocations = true;
            if (blk == 1) {
                QVERIFY(proc->setParameter("delayMs", 200.0));
                QVERIFY(proc->setParameter("feedback", 0.7));
            }
            proc->process(span, {kRate, frameMs(off), 1000.0 / kRate, false, 0});
            nt::testing::countAllocations = false;
            allocs += nt::testing::allocations;
        }
        QCOMPARE(allocs, std::size_t{0});
        QVERIFY2(std::abs(buf[std::size_t{2} * (1024 + 2400)]) < 1e-4f,
                 qPrintable(QStringLiteral("D6 echo clamped to old 50ms delay: val=%1").arg(buf[std::size_t{2} * (1024 + 2400)])));
        QVERIFY2(std::abs(buf[std::size_t{2} * (1024 + 9600)] - 1.0f) < 1e-3f,
                 qPrintable(QStringLiteral("D6 echo 1st repeat at 200ms=%1 (expected 1.0)").arg(buf[std::size_t{2} * (1024 + 9600)])));
        QVERIFY2(std::abs(buf[std::size_t{2} * (1024 + 19200)] - 0.7f) < 1e-3f,
                 qPrintable(QStringLiteral("D6 echo 2nd repeat at 400ms=%1 (expected 0.7)").arg(buf[std::size_t{2} * (1024 + 19200)])));
    }

    void dsp2_fix1_d7_d8_d9_distortionSilenceSlowRampAndNonFinite() {
        const auto makeProcessor = [](const QJsonObject& fx) -> std::shared_ptr<BlockProcessor> {
            const QJsonObject raw{
                {"fps", 30}, {"durationMs", 2000},
                {"tracks", QJsonArray{QJsonObject{
                    {"id", "a"}, {"type", "audio"}, {"index", 0},
                    {"effects", QJsonArray{fx}}}}},
                {"clips", QJsonArray{QJsonObject{
                    {"id", "c"}, {"trackId", "a"}, {"mediaType", "audio"},
                    {"status", "generated"}, {"mediaPath", "unused.wav"},
                    {"startMs", 0}, {"durationMs", 2000}}}}};
            auto parsed = nt::parseTimelineJson(QJsonDocument(raw).toJson());
            if (!parsed.timeline) return nullptr;
            const auto plan = buildMixPlan(*parsed.timeline);
            if (plan.tracks.empty()) return nullptr;
            const auto targetId = fx.value("id").toString().toStdString();
            for (const auto& p : plan.tracks[0].processors) {
                if (p && p->id == targetId) return p;
            }
            return nullptr;
        };

        // D7: distortion outputDb change during a silent block must apply immediately when audio resumes.
        {
            auto proc = makeProcessor({{"id", "d1"}, {"type", "distortion"}, {"enabled", true},
                                       {"driveDb", 6.0}, {"outputDb", 0.0}});
            QVERIFY(proc != nullptr);
            proc->prepare(kRate);
            // Warm up the 256-tap oversampler FIR to steady state over 4 blocks (512 frames).
            std::vector<float> blk(128 * 2, 0.5f);
            for (int b = 0; b < 4; ++b) {
                std::ranges::fill(blk, 0.5f);
                proc->process(blk, {kRate, frameMs(b * 128), 1000.0 / kRate, false, 0});
            }
            const float loudSample = blk.back();
            // Silent block while outputDb changes to -24 dB.
            QVERIFY(proc->setParameter("outputDb", -24.0));
            std::ranges::fill(blk, 0.0f);
            proc->process(blk, {kRate, frameMs(512), 1000.0 / kRate, true, 0});
            // Audio resumes continuously at frame 640: sample 0 must already be at -24 dB (not ramping from 0 dB).
            std::ranges::fill(blk, 0.5f);
            proc->process(blk, {kRate, frameMs(640), 1000.0 / kRate, false, 0});
            const float expected = loudSample * static_cast<float>(std::pow(10.0, -24.0 / 20.0));
            QVERIFY2(std::abs(blk[std::size_t{2} * 16] - expected) < 1e-3f,
                     qPrintable(QStringLiteral("D7 distortion resumed at %1 (expected %2, loud=%3)")
                                    .arg(blk[std::size_t{2} * 16]).arg(expected).arg(loudSample)));
        }

        // D8: slow block-rate automation ramp (delta <= old directThreshold_ = 0.001) must still smooth per sample.
        {
            auto proc = makeProcessor({{"id", "g2"}, {"type", "gain"}, {"enabled", true}, {"gainDb", 0.0}});
            QVERIFY(proc != nullptr);
            proc->prepare(kRate);
            std::vector<float> out(512 * 2, 1.0f);
            proc->process(std::span<float>(out.data(), 128 * 2), {kRate, frameMs(0), 1000.0 / kRate, false, 0});
            const double targetDb = 20.0 * std::log10(0.9995);
            QVERIFY(proc->setParameter("gainDb", targetDb));
            proc->process(std::span<float>(out.data() + 128 * 2, 128 * 2), {kRate, frameMs(128), 1000.0 / kRate, false, 0});
            const float boundaryStep = std::abs(out[std::size_t{2} * 128] - out[std::size_t{2} * 127]);
            QVERIFY2(boundaryStep < 0.00005f,
                     qPrintable(QStringLiteral("D8 slow block-rate ramp snapped at boundary: step=%1").arg(boundaryStep)));
        }

        // D9: Effect::setParameter rejects NaN / +-Inf without corrupting state (including across seek).
        {
            auto proc = makeProcessor({{"id", "f1"}, {"type", "filter"}, {"enabled", true},
                                       {"mode", "lowpass"}, {"frequency", 4000.0}, {"q", 1.0}});
            auto procRef = makeProcessor({{"id", "f1"}, {"type", "filter"}, {"enabled", true},
                                          {"mode", "lowpass"}, {"frequency", 4000.0}, {"q", 1.0}});
            QVERIFY(proc != nullptr && procRef != nullptr);
            proc->prepare(kRate);
            procRef->prepare(kRate);
            std::vector<float> blk(128 * 2, 0.5f), blkRef(128 * 2, 0.5f);
            proc->process(blk, {kRate, 0.0, 1000.0 / kRate, false, 0});
            procRef->process(blkRef, {kRate, 0.0, 1000.0 / kRate, false, 0});
            QVERIFY(!proc->setParameter("frequency", std::numeric_limits<double>::quiet_NaN()));
            QVERIFY(!proc->setParameter("frequency", std::numeric_limits<double>::infinity()));
            QVERIFY(!proc->setParameter("frequency", -std::numeric_limits<double>::infinity()));
            // Seek triggers snapAllSmoothers(); output must remain identical to untouched reference.
            std::vector<float> after(128 * 2, 0.5f), afterRef(128 * 2, 0.5f);
            proc->process(after, {kRate, 500.0, 1000.0 / kRate, false, 0});
            procRef->process(afterRef, {kRate, 500.0, 1000.0 / kRate, false, 0});
            for (std::size_t i = 0; i < after.size(); ++i) {
                QVERIFY(std::isfinite(after[i]));
                QVERIFY(std::abs(after[i] - afterRef[i]) < 1e-6f);
            }
        }
    }

    // DSP2 fix2 C1: effective source increment includes transport rate (msPerFrame * sampleRate / 1000)
    // for direct bypass, sinc cutoff, and retained ring history across live rate jumps.
    void dsp2_fix2_c1_transportRateAndCombinedRatios() {
        constexpr int kSrcFrames = 96000;
        constexpr int kOutFrames = 2048;
        constexpr int kTrim = 192;
        std::vector<float> tone15k(std::size_t{kSrcFrames} * 2);
        for (int i = 0; i < kSrcFrames; ++i) {
            const float s = static_cast<float>(0.8 * std::sin(2.0 * std::numbers::pi * 15000.0 * i / kRate));
            tone15k[std::size_t{2} * i] = s;
            tone15k[std::size_t{2} * i + 1] = s;
        }
        const double refRms = 0.8 / std::sqrt(2.0);

        // 1. 1x clip at 2x transport (keepPitch=false): effective rate is 2.0, so 15 kHz must be
        // attenuated > 75 dB rather than aliasing through the 1:1 bypass.
        {
            Timeline tl;
            tl.tracks = {track("a", TrackType::Audio)};
            Clip c = clip("c", "a", MediaType::Audio, 0.0, 2000.0);
            c.inPointMs = 100.0;
            c.speedMultiplier = 1.0;
            tl.clips = {c};
            const MixPlan plan = buildMixPlan(tl);
            VoicePcm vp{};
            vp.linear = tone15k.data();
            vp.linearCount = kSrcFrames;
            std::vector<float> out(std::size_t{kOutFrames} * 2, 0.0f);
            MixStats stats;
            const double step2x = (1000.0 / kRate) * 2.0;
            nt::testing::allocations = 0;
            nt::testing::countAllocations = true;
            for (int off = 0; off < kOutFrames; off += 128) {
                mixBlock(plan, &vp, kRate, off * step2x, step2x, 128,
                         out.data() + static_cast<std::size_t>(off) * 2, stats);
            }
            nt::testing::countAllocations = false;
            const std::size_t allocs = nt::testing::allocations;
            QCOMPARE(allocs, std::size_t{0});
            double sq = 0.0;
            for (int i = kTrim; i < kOutFrames - kTrim; ++i) {
                const double x = out[std::size_t{2} * i];
                sq += x * x;
            }
            const double aliasDb = 20.0 * std::log10(std::max(std::sqrt(sq / (kOutFrames - 2 * kTrim)) / refRms, 1e-12));
            QVERIFY2(aliasDb < -75.0,
                     qPrintable(QStringLiteral("C1 1x clip @ 2x transport 15kHz alias=%1 dB (expected < -75 dB)").arg(aliasDb)));
        }

        // 2. 2x clip at 0.5x transport: effective rate is 1.0, so 15 kHz must pass unattenuated
        // (both integer-aligned bypass and fractional offset sinc at effectiveRate=1.0).
        for (const double offsetFrames : {4800.0, 4800.5}) {
            Timeline tl;
            tl.tracks = {track("a", TrackType::Audio)};
            Clip c = clip("c", "a", MediaType::Audio, 0.0, 2000.0);
            c.inPointMs = offsetFrames * 1000.0 / kRate;
            c.speedMultiplier = 2.0;
            tl.clips = {c};
            const MixPlan plan = buildMixPlan(tl);
            VoicePcm vp{};
            vp.linear = tone15k.data();
            vp.linearCount = kSrcFrames;
            std::vector<float> out(std::size_t{kOutFrames} * 2, 0.0f);
            MixStats stats;
            const double stepHalf = (1000.0 / kRate) * 0.5;
            for (int off = 0; off < kOutFrames; off += 128) {
                mixBlock(plan, &vp, kRate, off * stepHalf, stepHalf, 128,
                         out.data() + static_cast<std::size_t>(off) * 2, stats);
            }
            double sq = 0.0;
            for (int i = kTrim; i < kOutFrames - kTrim; ++i) {
                const double x = out[std::size_t{2} * i];
                sq += x * x;
            }
            const double passDb = 20.0 * std::log10(std::max(std::sqrt(sq / (kOutFrames - 2 * kTrim)) / refRms, 1e-12));
            QVERIFY2(passDb > -0.1,
                     qPrintable(QStringLiteral("C1 2x clip @ 0.5x transport (off=%1) 15kHz level=%2 dB (expected > -0.1 dB)")
                                    .arg(offsetFrames).arg(passDb)));
            if (offsetFrames == 4800.0) {
                QCOMPARE(out[std::size_t{2} * 100], tone15k[std::size_t{2} * (4800 + 100)]);
            }
        }

        // 3. Live ring transport-rate jump (1x -> 2x -> 4x) without seek: zero underruns,
        // matches offline linear output, and suppresses 15 kHz alias after jumping to 2x/4x.
        {
            Timeline tl;
            tl.tracks = {track("a", TrackType::Audio)};
            Clip c = clip("c", "a", MediaType::Audio, 0.0, 2000.0);
            c.inPointMs = 200.0 * 1000.0 / kRate;
            c.speedMultiplier = 1.0;
            tl.clips = {c};
            const MixPlan planRing = buildMixPlan(tl);
            const MixPlan planLin = buildMixPlan(tl);
            PcmRing ring(kSrcFrames, 0);
            QCOMPARE(ring.write(tone15k.data(), kSrcFrames), std::int64_t{kSrcFrames});
            ring.markEnd(kSrcFrames);
            VoicePcm ringPcm{.ring = &ring, .live = true};
            VoicePcm linPcm{.linear = tone15k.data(), .linearCount = kSrcFrames};

            constexpr int kBlock = 128;
            const std::array<double, 12> blockRates{1.0, 1.0, 1.0, 1.0, 2.0, 2.0, 2.0, 2.0, 4.0, 4.0, 4.0, 4.0};
            std::vector<float> outRing(blockRates.size() * kBlock * 2, 0.0f);
            std::vector<float> outLin(blockRates.size() * kBlock * 2, 0.0f);
            MixStats stRing, stLin;
            double tMs = 0.0;
            for (std::size_t b = 0; b < blockRates.size(); ++b) {
                const double step = (1000.0 / kRate) * blockRates[b];
                mixBlock(planRing, &ringPcm, kRate, tMs, step, kBlock, outRing.data() + b * kBlock * 2, stRing);
                mixBlock(planLin, &linPcm, kRate, tMs, step, kBlock, outLin.data() + b * kBlock * 2, stLin);
                tMs += kBlock * step;
            }
            QCOMPARE(stRing.underruns, std::int64_t{0});
            float maxDiff = 0.0f;
            for (std::size_t i = 0; i < outRing.size(); ++i) {
                maxDiff = std::max(maxDiff, std::abs(outRing[i] - outLin[i]));
            }
            QVERIFY2(maxDiff < 1e-6f, qPrintable(QStringLiteral("C1 live rate-jump ring vs linear maxDiff=%1").arg(maxDiff)));
        }

        // 4. Reverse 2x transport (msPerFrame < 0): effectiveRate magnitude is 2.0, so 15 kHz
        // is attenuated > 75 dB and ring history is not released upward during reverse reads.
        {
            Timeline tl;
            tl.tracks = {track("a", TrackType::Audio)};
            Clip c = clip("c", "a", MediaType::Audio, 0.0, 2000.0);
            c.inPointMs = 100.0;
            c.speedMultiplier = 1.0;
            tl.clips = {c};
            const MixPlan plan = buildMixPlan(tl);
            PcmRing ring(kSrcFrames, 0);
            QCOMPARE(ring.write(tone15k.data(), kSrcFrames), std::int64_t{kSrcFrames});
            ring.markEnd(kSrcFrames);
            VoicePcm rp{.ring = &ring, .live = true};
            std::vector<float> out(std::size_t{kOutFrames} * 2, 0.0f);
            MixStats stats;
            const double stepRev2x = -(1000.0 / kRate) * 2.0;
            double tMs = 1500.0;
            for (int off = 0; off < kOutFrames; off += 128) {
                mixBlock(plan, &rp, kRate, tMs, stepRev2x, 128,
                         out.data() + static_cast<std::size_t>(off) * 2, stats);
                tMs += 128 * stepRev2x;
            }
            QCOMPARE(stats.underruns, std::int64_t{0});
            QCOMPARE(ring.readFloor(), std::int64_t{0});
            double sq = 0.0;
            for (int i = kTrim; i < kOutFrames - kTrim; ++i) {
                const double x = out[std::size_t{2} * i];
                sq += x * x;
            }
            const double aliasDb = 20.0 * std::log10(std::max(std::sqrt(sq / (kOutFrames - 2 * kTrim)) / refRms, 1e-12));
            QVERIFY2(aliasDb < -75.0,
                     qPrintable(QStringLiteral("C1 1x clip @ -2x reverse transport 15kHz alias=%1 dB (expected < -75 dB)").arg(aliasDb)));
        }
    }

    // DSP2 fix2 C2: incomplete producer lookahead/history counts as an underrun instead of edge-clamping,
    // while physical source boundaries match offline rendering bit-for-bit on a progressively filled ring.
    void dsp2_fix2_c2_incompleteSincLookaheadAndProgressiveRing() {
        // 1. Exact review scenario: s=100.5, readableEnd=102 (EOF not reached), frame 101=0.5, frame 102=1.0.
        // Missing right sinc wing must report an underrun and emit silence rather than clamping frame 101.
        {
            std::vector<float> src(256 * 2, 0.0f);
            src[std::size_t{2} * 101] = 0.5f;
            src[std::size_t{2} * 101 + 1] = 0.5f;
            src[std::size_t{2} * 102] = 1.0f;
            src[std::size_t{2} * 102 + 1] = 1.0f;

            Timeline tl;
            tl.tracks = {track("a", TrackType::Audio)};
            Clip c = clip("c", "a", MediaType::Audio, 0.0, 100.0);
            c.inPointMs = 100.5 * 1000.0 / kRate;
            tl.clips = {c};
            const MixPlan plan = buildMixPlan(tl);

            PcmRing ring(512, 0);
            QCOMPARE(ring.write(src.data(), 102), std::int64_t{102});
            VoicePcm rp{.ring = &ring, .live = true};
            std::array<float, 2> out{9.0f, 9.0f};
            MixStats stIncomplete;
            mixBlock(plan, &rp, kRate, 0.0, 1000.0 / kRate, 1, out.data(), stIncomplete);
            QCOMPARE(stIncomplete.underruns, std::int64_t{1});
            QCOMPARE(out[0], 0.0f);
            QCOMPARE(out[1], 0.0f);

            // Once physical EOF is marked at 102, the same read has full in-range support (no underrun)
            // and matches offline linear rendering identically.
            ring.markEnd(102);
            MixStats stEof;
            mixBlock(plan, &rp, kRate, 0.0, 1000.0 / kRate, 1, out.data(), stEof);
            QCOMPARE(stEof.underruns, std::int64_t{0});

            VoicePcm lp{.linear = src.data(), .linearCount = 102};
            std::array<float, 2> outLin{0.0f, 0.0f};
            MixStats stLin;
            mixBlock(plan, &lp, kRate, 0.0, 1000.0 / kRate, 1, outLin.data(), stLin);
            QVERIFY2(std::abs(out[0] - outLin[0]) < 1e-6f,
                     qPrintable(QStringLiteral("C2 physical EOF ring=%1 vs linear=%2").arg(out[0]).arg(outLin[0])));

            // Missing left wing (readFloor > needFirst >= 0) also counts as an underrun.
            PcmRing ringTrimmed(512, 0);
            QCOMPARE(ringTrimmed.write(src.data(), 256), std::int64_t{256});
            ringTrimmed.markEnd(256);
            ringTrimmed.release(90);
            VoicePcm rpTrimmed{.ring = &ringTrimmed, .live = false};
            MixStats stLeft;
            mixBlock(plan, &rpTrimmed, kRate, 0.0, 1000.0 / kRate, 1, out.data(), stLeft);
            QCOMPARE(stLeft.underruns, std::int64_t{1});
            QCOMPARE(out[0], 0.0f);
        }

        // 2. Progressively filled small wrapping ring vs offline linear across start, interior, and physical EOF.
        constexpr int kSrcFrames = 4096;
        std::vector<float> src(std::size_t{kSrcFrames} * 2, 0.0f);
        for (int i = 0; i < kSrcFrames; ++i) {
            const float v = static_cast<float>(
                0.4 * std::sin(2.0 * std::numbers::pi * 900.0 * i / kRate) +
                0.2 * std::sin(2.0 * std::numbers::pi * 3100.0 * i / kRate));
            src[std::size_t{2} * i] = v;
            src[std::size_t{2} * i + 1] = -v;
        }
        src[std::size_t{2} * 102] = 0.95f;
        src[std::size_t{2} * 4090] = -0.95f;

        struct Case { double inFrame; double speedMul; int outFrames; };
        for (const Case tc : std::array<Case, 2>{{{0.5, 1.0, 4224}, {0.0, 1.37, 3200}}}) {
            Timeline tl;
            tl.tracks = {track("a", TrackType::Audio)};
            Clip c = clip("c", "a", MediaType::Audio, 0.0, 200.0);
            c.inPointMs = tc.inFrame * 1000.0 / kRate;
            c.speedMultiplier = tc.speedMul;
            tl.clips = {c};
            const MixPlan planLin = buildMixPlan(tl);
            const MixPlan planRing = buildMixPlan(tl);

            VoicePcm lp{.linear = src.data(), .linearCount = kSrcFrames};
            std::vector<float> outLin(static_cast<std::size_t>(tc.outFrames) * 2, 0.0f);
            MixStats stLin;
            constexpr int kBlock = 128;
            for (int off = 0; off < tc.outFrames; off += kBlock) {
                mixBlock(planLin, &lp, kRate, frameMs(off), 1000.0 / kRate, kBlock,
                         outLin.data() + static_cast<std::size_t>(off) * 2, stLin);
            }

            // Ring capacity 1024 < 4096 forces multiple wrap-arounds as producer fills progressively.
            PcmRing ring(1024, 0);
            std::int64_t produced = 0;
            const std::int64_t lookahead = static_cast<std::int64_t>(sincRadiusForRate(tc.speedMul)) + 4;
            VoicePcm rp{.ring = &ring, .live = true};
            std::vector<float> outRing(static_cast<std::size_t>(tc.outFrames) * 2, 0.0f);
            MixStats stRing;
            for (int off = 0; off < tc.outFrames; off += kBlock) {
                const auto maxNeeded = static_cast<std::int64_t>(
                    std::ceil(tc.inFrame + (off + kBlock) * tc.speedMul)) + lookahead;
                const std::int64_t target = std::min<std::int64_t>(kSrcFrames, maxNeeded);
                while (produced < target) {
                    const std::int64_t chunk = std::min<std::int64_t>(target - produced, ring.freeFrames());
                    QVERIFY2(chunk > 0, "Progressive ring deadlocked (no free frames for producer)");
                    produced += ring.write(src.data() + static_cast<std::size_t>(produced) * 2, chunk);
                }
                if (produced == kSrcFrames && ring.endFrame() != kSrcFrames) {
                    ring.markEnd(kSrcFrames);
                }
                mixBlock(planRing, &rp, kRate, frameMs(off), 1000.0 / kRate, kBlock,
                         outRing.data() + static_cast<std::size_t>(off) * 2, stRing);
            }
            QCOMPARE(stRing.underruns, std::int64_t{0});
            float maxDiff = 0.0f;
            for (std::size_t i = 0; i < outLin.size(); ++i) {
                maxDiff = std::max(maxDiff, std::abs(outRing[i] - outLin[i]));
            }
            QVERIFY2(maxDiff < 1e-6f,
                     qPrintable(QStringLiteral("C2 progressive ring vs offline speed=%1 maxDiff=%2").arg(tc.speedMul).arg(maxDiff)));
        }
    }
};

QTEST_APPLESS_MAIN(TstMixer)
#include "tst_mixer.moc"
