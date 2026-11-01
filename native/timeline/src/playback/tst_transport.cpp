// Vectors from playbackSync.test.ts, PlaybackClock.test.ts and TracksRegion.tsx.
#include "playback/PlaybackClock.h"
#include <QtTest>

class TstTransport : public QObject {
    Q_OBJECT
private slots:
    void durationChangesWithoutRestartingPlayback() {
        PlaybackClock clock;
        std::int64_t now = 0;
        clock.setNowSource([&now] { return now; });
        clock.setDurationMs(1000);
        clock.play();
        now = 600'000'000;
        clock.tick();
        clock.setDurationMs(2000);
        now = 1200'000'000;
        clock.tick();
        QVERIFY(clock.playing());
        QCOMPARE(clock.time(), 1200.0);
        clock.setDurationMs(800);
        QCOMPARE(clock.currentTimeMs(), 800.0);
        clock.tick();
        QVERIFY(!clock.playing());
        QCOMPARE(clock.time(), 800.0);
    }
    void durationChangesPreserveExplicitPlaybackRange() {
        PlaybackClock clock;
        std::int64_t now = 0;
        clock.setNowSource([&now] { return now; });
        clock.setDurationMs(2000);
        clock.setRangeIn(200);
        clock.setRangeOut(1600);
        clock.playInToOut();
        clock.setDurationMs(1000);
        now = 900'000'000;
        clock.tick();
        QVERIFY(clock.playing());
        QCOMPARE(clock.time(), 1100.0);
        now = 1400'000'000;
        clock.tick();
        QVERIFY(!clock.playing());
        QCOMPARE(clock.time(), 1600.0);
    }
    void shorteningLoopUsesNewDuration() {
        PlaybackClock clock;
        std::int64_t now = 0;
        clock.setNowSource([&now] { return now; });
        clock.setDurationMs(2000);
        clock.setLoop(true);
        clock.play();
        now = 1100'000'000;
        clock.setDurationMs(1000);
        clock.tick();
        QVERIFY(clock.playing());
        QCOMPARE(clock.time(), 0.0);
    }
    void defaultAndSeek() {
        PlaybackClock c;
        QVERIFY(!c.loop());
        c.setDurationMs(10000);
        c.setLoop(true);
        c.seek(11000);
        QCOMPARE(c.time(), 10000.0); // A seek never wraps.
    }
    void shuttle() {
        PlaybackClock c;
        std::int64_t now = 0;
        c.setNowSource([&now] { return now; });
        c.setDurationMs(10000);
        c.seek(5000);
        QSignalSpy rates(&c, &PlaybackClock::rateChanged);
        for (double rate : {1., 2., 4., 8., 8.}) {
            QVERIFY(QMetaObject::invokeMethod(&c, "shuttle", Q_ARG(int, 1)));
            QCOMPARE(c.rate(), rate);
        }
        now += 10'000'000;
        const double live = c.currentTimeMs();
        QVERIFY(QMetaObject::invokeMethod(&c, "shuttle", Q_ARG(int, -1)));
        QCOMPARE(c.currentTimeMs(), live);
        QCOMPARE(c.rate(), -1.);
        QVERIFY(QMetaObject::invokeMethod(&c, "shuttle", Q_ARG(int, -1)));
        QCOMPARE(c.rate(), -2.);
        QVERIFY(QMetaObject::invokeMethod(&c, "shuttleStop"));
        QVERIFY(!c.playing());
        QCOMPARE(c.rate(), 1.);
        QVERIFY(QMetaObject::invokeMethod(&c, "shuttle", Q_ARG(int, -1)));
        c.toggle();
        QVERIFY(!c.playing());
        QCOMPARE(c.rate(), -1.);
        c.toggle();
        QCOMPARE(c.rate(), 1.);
        QVERIFY(c.playing());
        c.toggle();
        QVERIFY(!c.playing());
        QVERIFY(rates.count() >= 7);
    }
    void startVectors_data() {
        QTest::addColumn<double>("start");
        QTest::addColumn<double>("rate");
        QTest::addColumn<double>("in");
        QTest::addColumn<double>("end");
        QTest::addColumn<double>("expected");
        QTest::newRow("forward-end") << 10000. << 1. << 0. << 10000. << 0.;
        QTest::newRow("reverse-end") << 10000. << -1. << 0. << 10000. << 10000.;
        QTest::newRow("reverse-top") << 0. << -1. << 0. << 10000. << 10000.;
        QTest::newRow("forward-top") << 0. << 1. << 0. << 10000. << 0.;
        QTest::newRow("in-point") << 10000. << 2. << 2000. << 10000. << 2000.;
        QTest::newRow("middle") << 5000. << -1. << 0. << 10000. << 5000.;
        QTest::newRow("empty") << 0. << 1. << 0. << 0. << 0.;
        // Inclusive one-frame boundaries from resolvePlayStartMs's source.
        QTest::newRow("forward-frame") << 9960. << 1. << 0. << 10000. << 0.;
        QTest::newRow("reverse-frame") << 2040. << -1. << 2000. << 10000. << 10000.;
    }
    void startVectors() {
        QFETCH(double, start); QFETCH(double, rate); QFETCH(double, in);
        QFETCH(double, end); QFETCH(double, expected);
        PlaybackClock c;
        c.setNowSource([] { return 0; });
        c.setDurationMs(end);
        c.setLoop(true);
        QVERIFY(c.setProperty("fps", 25.));
        QVERIFY(QMetaObject::invokeMethod(&c, "setRangeIn", Q_ARG(double, in)));
        c.seek(start);
        c.setRate(rate);
        c.play();
        QCOMPARE(c.currentTimeMs(), expected);
    }
    void rangeSetters() {
        PlaybackClock c;
        QVERIFY(QMetaObject::invokeMethod(&c, "setRangeIn", Q_ARG(double, 2000.)));
        QVERIFY(QMetaObject::invokeMethod(&c, "setRangeOut", Q_ARG(double, 2000.)));
        QCOMPARE(c.property("rangeInMs").toDouble(), -1.);
        QCOMPARE(c.property("rangeOutMs").toDouble(), 2000.);
        QVERIFY(QMetaObject::invokeMethod(&c, "setRangeIn", Q_ARG(double, 3000.)));
        QCOMPARE(c.property("rangeOutMs").toDouble(), -1.);
        QVERIFY(QMetaObject::invokeMethod(&c, "clearRange"));
        QCOMPARE(c.property("rangeInMs").toDouble(), -1.);
        QVERIFY(QMetaObject::invokeMethod(&c, "setRangeOut", Q_ARG(double, 0.)));
        QVERIFY(QMetaObject::invokeMethod(&c, "setRangeIn", Q_ARG(double, -5.)));
        QCOMPARE(c.property("rangeInMs").toDouble(), -1.);
    }
    void rangePlayback_data() {
        QTest::addColumn<bool>("loop");
        QTest::newRow("stop") << false;
        QTest::newRow("loop") << true;
    }
    void rangePlayback() {
        QFETCH(bool, loop);
        PlaybackClock c;
        std::int64_t now = 0;
        c.setNowSource([&now] { return now; });
        c.setDurationMs(10000);
        c.setLoop(loop);
        QVERIFY(QMetaObject::invokeMethod(&c, "setRangeIn", Q_ARG(double, 2000.)));
        QVERIFY(QMetaObject::invokeMethod(&c, "setRangeOut", Q_ARG(double, 4000.)));
        QSignalSpy playing(&c, &PlaybackClock::playingChanged);
        QSignalSpy modes(&c, SIGNAL(playingInToOutChanged()));
        QVERIFY(QMetaObject::invokeMethod(&c, "playInToOut"));
        QCOMPARE(c.currentTimeMs(), 2000.);
        QVERIFY(c.property("playingInToOut").toBool());
        now += 2500'000'000;
        c.tick();
        QCOMPARE(c.time(), loop ? 2000. : 4000.);
        QCOMPARE(c.playing(), loop);
        QCOMPARE(c.property("playingInToOut").toBool(), loop);
        QCOMPARE(playing.count(), loop ? 1 : 2);
        QCOMPARE(modes.count(), loop ? 1 : 2);
        if (loop) {
            c.seek(3000);
            c.setRate(-1);
            now += 1500'000'000;
            c.tick();
            QCOMPARE(c.time(), 2000.);
            QVERIFY(!c.playing());
        }
    }
    void reverseDeviceAndRestart() {
        nt::playback::AudioClockFeed feed;
        feed.device.store({true, 48000., 0., 1});
        PlaybackClock c;
        std::int64_t now = 0;
        c.setNowSource([&now] { return now; });
        c.setDurationMs(10000);
        c.setAudioFeed(&feed);
        c.seek(5000);
        c.play();
        QSignalSpy sources(&c, &PlaybackClock::audioMasterChanged);
        c.setRate(-1);
        QVERIFY(!c.audioMaster());
        QVERIFY(!feed.command.load().playing);
        now += 250'000'000;
        QCOMPARE(c.currentTimeMs(), 4750.);
        const auto seq = feed.command.load().seekSeq;
        c.setRate(1);
        QVERIFY(c.audioMaster());
        QCOMPARE(feed.command.load().seekSeq, seq + 1);
        QCOMPARE(feed.command.load().seekMs, 4750.);
        QCOMPARE(c.currentTimeMs(), 4750.);
        QCOMPARE(sources.count(), 2);
    }
    void modeClearsAndOpenRanges() {
        PlaybackClock c;
        std::int64_t now = 0;
        c.setNowSource([&now] { return now; });
        c.setDurationMs(10000);
        QVERIFY(QMetaObject::invokeMethod(&c, "setRangeIn", Q_ARG(double, 2000.)));
        QVERIFY(QMetaObject::invokeMethod(&c, "playInToOut"));
        QCOMPARE(c.time(), 2000.);
        c.pause();
        QVERIFY(!c.property("playingInToOut").toBool());
        QVERIFY(QMetaObject::invokeMethod(&c, "clearRange"));
        QVERIFY(QMetaObject::invokeMethod(&c, "setRangeOut", Q_ARG(double, 4000.)));
        QVERIFY(QMetaObject::invokeMethod(&c, "playInToOut"));
        QCOMPARE(c.time(), 0.);
        now += 4500'000'000;
        c.tick();
        QCOMPARE(c.time(), 4000.);
        QVERIFY(!c.playing());
        QVERIFY(QMetaObject::invokeMethod(&c, "playInToOut"));
        QVERIFY(QMetaObject::invokeMethod(&c, "stop"));
        QCOMPARE(c.time(), 0.);
        QVERIFY(!c.property("playingInToOut").toBool());
    }
    void loopToggleUsesLivePositionAtBoundary() {
        PlaybackClock c;
        std::int64_t now = 0;
        c.setNowSource([&now] { return now; });
        c.setDurationMs(10000);
        c.setRangeIn(2000);
        c.setRangeOut(4000);
        c.setLoop(true);
        c.seek(3000);
        c.play();
        now += 1500'000'000;
        // A render read can reach the bound before the next GUI tick.
        const double live = c.currentTimeMs();
        QCOMPARE(live, 2000.);
        c.setLoop(false);
        QCOMPARE(c.currentTimeMs(), live);
    }
    void plainBoundsAndLoopToggle() {
        PlaybackClock c;
        std::int64_t now = 0;
        c.setNowSource([&now] { return now; });
        c.setDurationMs(10000);
        QVERIFY(QMetaObject::invokeMethod(&c, "setRangeIn", Q_ARG(double, 2000.)));
        QVERIFY(QMetaObject::invokeMethod(&c, "setRangeOut", Q_ARG(double, 4000.)));
        c.seek(3000);
        c.play();
        now += 1500'000'000;
        c.tick();
        QCOMPARE(c.time(), 4500.); // Marks alone do not bound ordinary play.
        c.setLoop(true); // Web restarts from the live position, resolving end to in.
        QCOMPARE(c.currentTimeMs(), 2000.);
        c.setLoop(false);
        c.setRate(-1);
        now += 3000'000'000;
        c.tick();
        QCOMPARE(c.time(), 0.);
        QVERIFY(!c.playing());
    }
};
QTEST_APPLESS_MAIN(TstTransport)
#include "tst_transport.moc"
