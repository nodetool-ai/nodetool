// The mixer (PLAN M3 exit 1, DESIGN.md D25 and D26): which clips sound
// (buildMixPlan, the web rules of renderAudio.ts and clipAudio.ts), and the
// sample-by-sample mix of mixBlock: gain, the four fade curves, a cross-fade,
// the in-point, the clip speed and the pan. Expectations are written from
// the web formulas, not from the C++ code. Also the PCM ring path that the
// device callback uses, and the audio source decode and seek.

#include "audio/AudioEngine.h"
#include "audio/AudioSource.h"
#include "audio/FadeCurves.h"
#include "audio/Mixer.h"
#include "audio/PcmRing.h"

#include <QFileInfo>
#include <QProcess>
#include <QtTest>

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
};

QTEST_APPLESS_MAIN(TstMixer)
#include "tst_mixer.moc"
