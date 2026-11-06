#include "audio/AudioEngine.h"
#include "playback/PlaybackClock.h"
#include <QtTest>
#include <cmath>
#include <numbers>
#ifdef Q_OS_LINUX
#include <sys/prctl.h>
#endif
using namespace nt;
using namespace nt::audio;
namespace {
std::shared_ptr<Timeline> timeline() {
    auto tl = std::make_shared<Timeline>();
    Track t; t.id = "audio"; t.type = TrackType::Audio; tl->tracks.push_back(t);
    Clip c; c.id = "tone"; c.trackId = t.id; c.mediaType = MediaType::Audio;
    c.status = "generated"; c.durationMs = 60000;
    c.mediaPath = NT_FIXTURES_DIR "/media/tone-220-48k-mono.wav";
    tl->clips.push_back(c); tl->durationMs = 60000; return tl;
}
double amplitude(const std::vector<float>& out, std::int64_t first, int n, double hz) {
    double re = 0, im = 0;
    for (int i = 0; i < n; ++i) {
        double p = 2*std::numbers::pi*hz*i/48000.;
        re += out[2*(first+i)]*std::cos(p); im += out[2*(first+i)]*std::sin(p);
    }
    return 2*std::hypot(re, im)/n;
}
double rms(const std::vector<float>& out, std::int64_t first, int n) {
    double e = 0; for (int i = 0; i < n; ++i) e += out[2*(first+i)]*out[2*(first+i)];
    return std::sqrt(e/n);
}
}
class TstShuttleAudio : public QObject {
    Q_OBJECT
private slots:
    void pitch_data() {
        QTest::addColumn<double>("rate"); QTest::addColumn<bool>("keep");
        for (double r : {.25, 2., 4., 8.}) QTest::newRow(qPrintable(QString::number(r))) << r << true;
        QTest::newRow("resampled") << 2. << false;
    }
    void pitch() {
        QFETCH(double, rate); QFETCH(bool, keep);
        for (int attempt = 1;; ++attempt) {
            AudioEngine engine; engine.setTimeline(timeline());
            AudioEngine::Options o; o.recordSeconds = 2; std::string error;
            QVERIFY2(engine.start(o, &error), error.c_str());
            PlaybackClock clock; clock.setDurationMs(60000); clock.setAudioFeed(&engine.feed());
            QVERIFY(clock.scrubAudio()); QVERIFY(clock.keepShuttlePitch());
            QSignalSpy changed(&clock, &PlaybackClock::keepShuttlePitchChanged);
            clock.setKeepShuttlePitch(keep); clock.setKeepShuttlePitch(keep);
            QCOMPARE(changed.size(), keep ? 0 : 1);
            clock.setRate(rate); clock.play();
            QTRY_VERIFY_WITH_TIMEOUT(engine.stats().playedFrames >= 28800, 2500);
            const auto anchor = engine.feed().callback.load().cur();
            clock.pause(); engine.stop(); const auto out = engine.recording(); const auto st = engine.stats();
            QCOMPARE(anchor.keepPitch, keep);
            const double hz = keep ? 220 : 440;
            const auto first = anchor.frame+9600;
            const double own = amplitude(out, first, 12000, hz);
            QVERIFY(own > .05);
            QVERIFY(amplitude(out, first, 12000, keep ? 440 : 220) < .15*own);
            double best = 0, peak = 0;
            for (double f = hz*.97; f <= hz*1.03; f += hz*.0025) {
                const auto a = amplitude(out, first, 12000, f); if (a > best) { best = a; peak = f; }
            }
            QVERIFY(std::abs(peak/hz-1) < .015);
            // This is a real-time null device, not a scheduler guarantee. A delayed
            // callback can catch up faster than the worker gets scheduled. Permit
            // one 10 ms block in this >=600 ms pitch sample. A shared runner can stall
            // any one sample, so only loss in all three attempts counts as sustained.
            const bool stalled = st.underruns > 1;
            if (stalled && attempt < 3) { qInfo() << "underruns" << st.underruns << "in attempt" << attempt; continue; }
            QVERIFY2(!stalled, qPrintable(QString("underruns: %1").arg(st.underruns)));
            QCOMPARE(st.openFailures, 0);
            QCOMPARE(st.decodeErrors, 0);
            QVERIFY(st.waitBlocks <= 10); // At most 100 ms startup silence with the 480-frame null period.
            // Bound actual missing output as well as the underrun count.
            if (keep) QVERIFY(st.shuttleFrames >= st.playedFrames-st.waitBlocks*480-480);
            return;
        }
    }
    // A worker that wakes every 15.6 ms, like one on Windows' default timer tick.
    void pitchWithCoarseWakes_data() { pitch_data(); }
    void pitchWithCoarseWakes() {
#ifdef Q_OS_LINUX
        const auto before = prctl(PR_GET_TIMERSLACK);
        QCOMPARE(prctl(PR_SET_TIMERSLACK, 15'600'000UL), 0);
        const auto restore = qScopeGuard([before] { prctl(PR_SET_TIMERSLACK, static_cast<unsigned long>(before)); });
        pitch();
#else
        QSKIP("The other platforms' timers show this in the pitch cases themselves");
#endif
    }
    void reverseAndScrub() {
        AudioEngine engine; engine.setTimeline(timeline()); AudioEngine::Options o; o.recordSeconds = 3;
        std::string error; QVERIFY(engine.start(o, &error));
        PlaybackClock clock; clock.setDurationMs(60000); clock.setAudioFeed(&engine.feed());
        clock.seek(2000); clock.shuttle(-1); QTest::qWait(150); clock.shuttleStop();
        QSignalSpy changed(&clock, &PlaybackClock::scrubAudioChanged);
        clock.setScrubAudio(false); clock.setScrubAudio(false); QCOMPARE(changed.size(), 1);
        clock.scrub(1000); QVERIFY(!engine.feed().command.load().scrub); QTest::qWait(200);
        const auto silentEnd = engine.stats().framesRendered;
        clock.setScrubAudio(true); QCOMPARE(changed.size(), 2);
        // Switching off cancels a burst that is still waiting for its PCM.
        clock.scrub(1200); QVERIFY(engine.feed().command.load().scrub);
        clock.setScrubAudio(false); QVERIFY(!engine.feed().command.load().scrub);
        clock.setScrubAudio(true);
        clock.scrub(1500); QVERIFY(engine.feed().command.load().scrub); QTest::qWait(200);
        engine.stop(); const auto out = engine.recording();
        QVERIFY(rms(out, 0, static_cast<int>(silentEnd)) < 1e-6);
        QVERIFY(rms(out, silentEnd, static_cast<int>(out.size()/2-silentEnd)) > .01);
    }
    void changesInFlight() {
        AudioEngine engine; auto tl = timeline(); engine.setTimeline(tl);
        AudioEngine::Options o; o.recordSeconds = 4; std::string error; QVERIFY(engine.start(o, &error));
        PlaybackClock clock; clock.setDurationMs(60000); clock.setAudioFeed(&engine.feed()); clock.setRate(2); clock.play();
        QTRY_VERIFY_WITH_TIMEOUT(engine.stats().playedFrames > 12000, 2000);
        const auto before = engine.stats().framesRendered;
        auto edited = std::make_shared<Timeline>(*tl); edited->clips[0].volumeDb = -20; engine.setTimeline(edited);
        QTest::qWait(300); const auto after = engine.stats().framesRendered;
        const auto seekSeq = engine.feed().command.load().seekSeq;
        clock.setRate(4); QCOMPARE(engine.feed().command.load().seekSeq, seekSeq + 1); QTest::qWait(200);
        const double audibleBefore = clock.currentTimeMs();
        clock.setKeepShuttlePitch(false);
        const double audibleAfter = clock.currentTimeMs();
        const auto uncorrected = engine.feed().command.load();
        QCOMPARE(uncorrected.seekSeq, seekSeq + 2); QVERIFY(!uncorrected.keepPitch);
        QVERIFY(uncorrected.seekMs >= audibleBefore - 1);
        QVERIFY(uncorrected.seekMs <= audibleAfter + 1);
        clock.setKeepShuttlePitch(true); QVERIFY(engine.feed().command.load().keepPitch);
        clock.shuttleStop(); clock.play(); QTest::qWait(300);
        clock.pause(); engine.stop(); const auto out = engine.recording();
        QVERIFY(rms(out, after-2400, 2400) < rms(out, before-2400, 2400)*.3);
        const auto first = static_cast<std::int64_t>(out.size()/2)-9600;
        QVERIFY(amplitude(out, first, 7200, 220) > .005);
        QVERIFY(amplitude(out, first, 7200, 440) < amplitude(out, first, 7200, 220)*.15);
        QCOMPARE(engine.stats().underruns, 0);
    }
};
QTEST_GUILESS_MAIN(TstShuttleAudio)
#include "tst_shuttleaudio.moc"
