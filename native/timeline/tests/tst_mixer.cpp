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
};

QTEST_APPLESS_MAIN(TstMixer)
#include "tst_mixer.moc"
