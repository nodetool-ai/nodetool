#include "audio/AudioEngine.h"
#include <QtTest>
#include <chrono>
#include <cmath>
#include <span>

using namespace nt;
using namespace nt::audio;
namespace {
constexpr int kPeriod = 480;
std::shared_ptr<Timeline> timeline(bool left = true) {
    auto tl = std::make_shared<Timeline>();
    for (int i = 0; i < 2; ++i) {
        Track t;
        t.id = std::to_string(i);
        t.type = TrackType::Audio;
        t.pan = i == 0 ? -1. : 1.;
        tl->tracks.push_back(t);
        if (i == 0 && !left) continue;
        Clip c;
        c.id = t.id;
        c.trackId = t.id;
        c.mediaType = MediaType::Audio;
        c.status = "generated";
        c.durationMs = 8000;
        c.mediaPath = NT_FIXTURES_DIR "/media/tone-220-48k-mono.wav";
        tl->clips.push_back(c);
    }
    tl->durationMs = 8000;
    return tl;
}
void play(AudioEngine& engine) {
    playback::TransportCommand cmd;
    cmd.seq = 1;
    cmd.seekSeq = 1;
    cmd.playing = true;
    cmd.seekIssuedNs = std::chrono::duration_cast<std::chrono::nanoseconds>(
        std::chrono::steady_clock::now().time_since_epoch()).count();
    engine.feed().command.store(cmd);
}
double rms(std::span<const float> samples, std::int64_t first, int count, int channel) {
    double sum = 0;
    for (int i = 0; i < count; ++i) {
        const double x = samples[static_cast<std::size_t>(first + i) * 2 + channel];
        sum += x * x;
    }
    return std::sqrt(sum / count);
}
}
class TstLiveAudioEdit : public QObject {
    Q_OBJECT
private slots:
    void editsChangeInOneBlock_data() {
        QTest::addColumn<QString>("edit");
        for (const char* edit : {"gain", "trackGain", "fade", "pan", "mute", "solo", "master", "remove", "extent"}) {
            QTest::newRow(edit) << QString::fromLatin1(edit);
        }
    }
    void editsChangeInOneBlock() {
        QFETCH(QString, edit);
        auto tl = timeline();
        if (edit == u"extent") {
            // Exercise snapshot matching on a large plan without opening
            // thousands of decoders: these clips are outside the lookahead.
            for (int i = 0; i < 8192; ++i) {
                Clip future = tl->clips[0];
                future.id = "future-" + std::to_string(i);
                future.startMs = 10000 + i;
                tl->clips.push_back(future);
            }
        }
        AudioEngine engine;
        engine.setTimeline(tl);
        AudioEngine::Options options;
        options.backend = AudioEngine::Backend::Null;
        options.periodFrames = kPeriod;
        options.recordSeconds = 3;
        std::string error;
        QVERIFY2(engine.start(options, &error), error.c_str());
        play(engine);
        QTRY_VERIFY_WITH_TIMEOUT(engine.stats().playedFrames >= 24000, 3000);
        const auto before = engine.stats();
        auto edited = std::make_shared<Timeline>(*tl);
        double leftGain = 1.0;
        double rightGain = 1.0;
        if (edit == u"gain") {
            edited->clips[0].volumeDb = -20;
            leftGain = .1;
        } else if (edit == u"trackGain") {
            edited->tracks[0].volumeDb = -20;
            leftGain = .1;
        } else if (edit == u"fade") {
            edited->clips[0].fadeInMs = 8000;
        } else if (edit == u"pan") {
            edited->tracks[0].pan = 0;
            leftGain = .5;
            rightGain = 1.5;
        } else if (edit == u"mute") {
            edited->tracks[0].muted = true;
            leftGain = 0;
        } else if (edit == u"solo") {
            edited->tracks[1].solo = true;
            leftGain = 0;
        } else if (edit == u"master") {
            edited->masterVolumeDb = -20;
            leftGain = .1;
            rightGain = .1;
        } else if (edit == u"remove") {
            edited->clips.erase(edited->clips.begin());
            leftGain = 0;
        } else if (edit == u"extent") {
            edited->clips[0].durationMs = 7000;
        }
        const auto anchor = engine.feed().callback.load().cur();
        engine.setTimeline(edited);
        const auto returned = engine.stats().framesRendered;
        qInfo("setTimeline: frames before %lld, return %lld, period %d",
              static_cast<long long>(before.framesRendered), static_cast<long long>(returned), kPeriod);
        QTRY_VERIFY_WITH_TIMEOUT(engine.stats().framesRendered >= returned + 9600, 2000);
        const auto after = engine.stats();
        engine.stop();
        const auto recording = engine.recording();
        const auto first = returned + kPeriod;
        QVERIFY(recording.size() >= static_cast<std::size_t>(first + 4800) * 2);
        for (auto f = first; f < first + 4800; ++f) {
            const auto at = static_cast<std::size_t>(f) * 2;
            // Same 220 Hz source four full 2400-frame periods earlier,
            // entirely before the edit, including when both channels change.
            const double baseline = recording[at + 1 - 19200];
            const double fade = edit == u"fade" ? static_cast<double>(f - anchor.frame) / 384000.0 : 1.0;
            QVERIFY2(std::abs(recording[at] - baseline * leftGain * fade) < 1e-5,
                     qPrintable(QStringLiteral("new mix late at frame %1: left %2, expected %3, baseline %4")
                         .arg(f).arg(recording[at]).arg(baseline * leftGain * fade).arg(baseline)));
            QVERIFY2(std::abs(recording[at + 1] - baseline * rightGain) < 1e-5,
                     "continuing voice lost continuity");
        }
        QCOMPARE(after.waitBlocks, before.waitBlocks);
        QCOMPARE(after.underruns, before.underruns);
        QCOMPARE(after.sourcesOpened, before.sourcesOpened);
        QCOMPARE(engine.feed().command.load().seekSeq, std::uint64_t(1));
    }
    void remappedClipPlaysWithoutSeek_data() {
        QTest::addColumn<bool>("speed");
        QTest::newRow("in-point") << false;
        QTest::newRow("source-rate") << true;
    }
    void remappedClipPlaysWithoutSeek() {
        QFETCH(bool, speed);
        AudioEngine engine;
        auto tl = timeline();
        engine.setTimeline(tl);
        AudioEngine::Options options;
        options.backend = AudioEngine::Backend::Null;
        options.periodFrames = kPeriod;
        options.recordSeconds = 3;
        std::string error;
        QVERIFY2(engine.start(options, &error), error.c_str());
        play(engine);
        QTRY_VERIFY_WITH_TIMEOUT(engine.stats().playedFrames >= 24000, 3000);
        const auto before = engine.stats();
        const auto anchor = engine.feed().callback.load().cur();
        auto edited = std::make_shared<Timeline>(*tl);
        if (speed) {
            edited->clips[0].speedMultiplier = 2;
        } else {
            edited->clips[0].inPointMs = 25; // 5.5 cycles at 220 Hz.
        }
        engine.setTimeline(edited);
        const auto returned = engine.stats().framesRendered;
        QTRY_VERIFY_WITH_TIMEOUT(engine.stats().framesRendered >= returned + 24000, 2000);
        const auto after = engine.stats();
        engine.stop();
        const auto recording = engine.recording();
        for (auto f = returned + kPeriod; f < returned + 19200; f += kPeriod) {
            QVERIFY2(rms(recording, f, kPeriod, 1) > .1, "remapping interrupted an untouched voice");
        }
        for (auto f = returned + 19200; f < returned + 21600; ++f) {
            const auto into = f - anchor.frame;
            const auto sourceFrame = speed ? into * 2 : into + 1200;
            const auto reference = anchor.frame + 4800 + sourceFrame % 2400;
            QVERIFY2(std::abs(recording[static_cast<std::size_t>(f) * 2] -
                              recording[static_cast<std::size_t>(reference) * 2 + 1]) < 1e-5f,
                     "remapped voice did not adopt its new PCM mapping");
        }
        QCOMPARE(after.waitBlocks, before.waitBlocks);
        QCOMPARE(engine.feed().command.load().seekSeq, std::uint64_t(1));
    }
    void addedClipPlaysWithoutSeek() {
        AudioEngine engine;
        engine.setTimeline(timeline(false));
        AudioEngine::Options options;
        options.backend = AudioEngine::Backend::Null;
        options.periodFrames = kPeriod;
        options.recordSeconds = 3;
        std::string error;
        QVERIFY2(engine.start(options, &error), error.c_str());
        play(engine);
        QTRY_VERIFY_WITH_TIMEOUT(engine.stats().playedFrames >= 24000, 3000);
        const auto before = engine.stats();
        engine.setTimeline(timeline());
        const auto returned = engine.stats().framesRendered;
        QTRY_VERIFY_WITH_TIMEOUT(engine.stats().framesRendered >= returned + 24000, 2000);
        const auto after = engine.stats();
        engine.stop();
        const auto recording = engine.recording();
        QVERIFY(rms(recording, before.framesRendered - 4800, 2400, 0) < 1e-6);
        QVERIFY2(rms(recording, returned + 19200, 2400, 0) > .1,
                 "clip added during playback never became audible without a seek");
        for (auto f = returned + kPeriod; f < returned + 19200; f += kPeriod) {
            QVERIFY2(rms(recording, f, kPeriod, 1) > .1, "untouched voice has a silent gap");
        }
        QCOMPARE(after.waitBlocks, before.waitBlocks);
        QCOMPARE(engine.feed().command.load().seekSeq, std::uint64_t(1));
    }
};
QTEST_GUILESS_MAIN(TstLiveAudioEdit)
#include "tst_liveaudioedit.moc"
