#include "SourceMonitor.h"
#include "preview/layers/TestStill.h"
#include <QtTest>
#include <QTemporaryDir>
#include <QFile>
#include <QDataStream>
#include <cmath>

class TestSourceMonitor : public QObject {
    Q_OBJECT
    QTemporaryDir preferences;
    QVariantMap video{{"id", "numbered"}, {"content_type", "video/mp4"}};
    QVariantMap sound{{"id", "sound"}, {"content_type", "audio/wav"}};
    const QString numbered = QStringLiteral(NT_FIXTURES_DIR "/media/numbered-a-1080p30.mp4");
    static int barcode(const QImage& image) {
        if (image.isNull()) { return -1; }
        int value = 0;
        for (int bit = 0; bit < 16; ++bit) { if (qGray(image.pixel(bit * 80 + 40, 20)) > 128) { value |= 1 << bit; } }
        return value;
    }
    QString tone(QTemporaryDir& dir) {
        const auto path = dir.filePath("tone.wav"); QFile file(path);
        if (!file.open(QIODevice::WriteOnly)) { return {}; }
        QDataStream out(&file); out.setByteOrder(QDataStream::LittleEndian);
        constexpr quint32 samples = 48000 * 6;
        out.writeRawData("RIFF", 4); out << quint32(36 + samples * 2); out.writeRawData("WAVEfmt ", 8);
        out << quint32(16) << quint16(1) << quint16(1) << quint32(48000) << quint32(96000) << quint16(2) << quint16(16);
        out.writeRawData("data", 4); out << quint32(samples * 2);
        for (quint32 i = 0; i < samples; ++i) { out << qint16(std::sin(i * 2 * 3.141592653589793 * 440 / 48000) * 12000); }
        return path;
    }
private slots:
    void initTestCase() {
        QVERIFY(preferences.isValid());
        qputenv("NODETOOL_TIMELINE_PREFERENCES", preferences.filePath("preferences.ini").toUtf8());
        QCoreApplication::instance()->setProperty("timelineAudioMode", "null");
    }
    void imagesAndUnreadableMedia() {
        QTemporaryDir dir; QVERIFY(dir.isValid());
        const auto path = dir.filePath("image.png"); QImage picture(80, 40, QImage::Format_RGB32); picture.fill(Qt::red); QVERIFY(picture.save(path));
        SourceMonitor monitor;
        monitor.openLocal({{"id", "image"}, {"content_type", "image/png"}}, path, {});
        QTRY_VERIFY(monitor.ready()); QCOMPARE(monitor.mediaType(), QString("image")); QCOMPARE(monitor.frameSize(), QSize(80, 40));
        QVERIFY(monitor.error().isEmpty()); QVERIFY(monitor.audioPath().isEmpty()); QCOMPARE(monitor.timeline()->clipCount(), 0);
        monitor.togglePlay(); monitor.shuttle(1); monitor.stepFrames(1); QVERIFY(!monitor.clock()->playing()); QCOMPARE(monitor.clock()->time(), 0.0);
        monitor.openLocal(video, dir.filePath("missing.mp4"), {});
        QTRY_VERIFY(!monitor.busy()); QVERIFY(!monitor.ready()); QCOMPARE(monitor.error(), QString("This file could not be opened."));
    }
    void playsAndReadsBarcode() {
        SourceMonitor monitor; monitor.openLocal(video, numbered, {}); QTRY_VERIFY_WITH_TIMEOUT(monitor.ready(), 10000);
        QVERIFY(!monitor.hasAudio()); QCOMPARE(monitor.frameRate(), 30.0);
        nt::test::Still still; QVERIFY(still.initialize(*monitor.timeline())); still.setClock(monitor.clock());
        monitor.seek(2000);
        QTRY_COMPARE_WITH_TIMEOUT(barcode(still.capture()), 60, 10000);
        monitor.togglePlay();
        QElapsedTimer timeout; timeout.start(); int checked = 0;
        while (monitor.clock()->time() < 3100 && timeout.elapsed() < 10000) {
            QTest::qWait(15); monitor.clock()->tick();
            const auto frame = barcode(still.capture(0, true));
            const int pick = int(std::floor(still.captureTimeMs() * 30 / 1000 + 1e-6));
            if (frame > 0) { QVERIFY2(std::abs(frame - pick) <= 2, qPrintable(QString("frame %1 pick %2").arg(frame).arg(pick))); ++checked; }
        }
        QVERIFY(checked > 5); QVERIFY(monitor.clock()->time() > 3000); monitor.pause();
        const int pick = int(std::floor(monitor.clock()->time() * 30 / 1000 + 1e-6));
        QTRY_COMPARE_WITH_TIMEOUT(barcode(still.capture()), pick, 10000);
    }
    void backwardAndStepping() {
        SourceMonitor monitor; monitor.openLocal(video, numbered, {}); QTRY_VERIFY(monitor.ready());
        monitor.seek(2000); monitor.shuttle(-1); QCOMPARE(monitor.clock()->rate(), -1.0);
        QTest::qWait(100); monitor.clock()->tick(); QVERIFY(monitor.clock()->time() < 2000);
        monitor.shuttleStop(); QVERIFY(!monitor.clock()->playing());
        monitor.seek(2000); monitor.stepFrames(1); QVERIFY(std::abs(monitor.clock()->time() - 61000.0 / 30) < 1e-8);
        monitor.stepFrames(-1); QCOMPARE(monitor.clock()->time(), 2000.0);
        monitor.stepFrames(5); QVERIFY(std::abs(monitor.clock()->time() - 65000.0 / 30) < 1e-8);
        monitor.seek(0); monitor.stepFrames(-5); QCOMPARE(monitor.clock()->time(), 0.0);
        monitor.seek(monitor.durationMs()); monitor.stepFrames(5);
        QVERIFY(std::abs(monitor.clock()->time() - 599000.0 / 30) < 1e-8);
    }
    void playAtTheLastFrameStartsOver() {
        SourceMonitor monitor; monitor.openLocal(video, numbered, {}); QTRY_VERIFY(monitor.ready());
        monitor.seek(monitor.durationMs()); monitor.togglePlay();
        QVERIFY(monitor.clock()->time() < 100); QVERIFY(monitor.clock()->playing()); monitor.pause();
        monitor.seek(monitor.durationMs()); monitor.shuttle(1);
        QVERIFY(monitor.clock()->time() < 100); QVERIFY(monitor.clock()->playing()); monitor.pause();
        monitor.seek(monitor.durationMs()); monitor.shuttle(-1); QVERIFY(monitor.clock()->time() > 19000); monitor.shuttleStop();
    }
    void startingEitherStopsTheOther() {
        SourceMonitor monitor; QTemporaryDir dir; const auto path = tone(dir); QVERIFY(!path.isEmpty());
        monitor.openLocal(sound, path, path); QTRY_VERIFY(monitor.ready());
        PlaybackClock program; TimelineModel model; model.setTimeline(*monitor.timeline()->snapshot());
        program.setDurationMs(6000); nt::audio::AppAudio audio; QString error;
        QVERIFY2(audio.start("null", 0, model, program, &error), qPrintable(error)); monitor.setProgramClock(&program);
        program.play(); QTest::qWait(150); QVERIFY(audio.engine()->stats().playedFrames > 0);
        monitor.togglePlay(); QVERIFY(!program.playing()); QVERIFY(monitor.clock()->playing());
        auto* source = monitor.audioEngineForTest(); QVERIFY(source);
        QTest::qWait(100); const auto programFrames = audio.engine()->stats().playedFrames; const auto sourceFrames = source->stats().playedFrames;
        QTest::qWait(150); QCOMPARE(audio.engine()->stats().playedFrames, programFrames); QVERIFY(source->stats().playedFrames > sourceFrames);
        program.play(); QVERIFY(!monitor.clock()->playing()); QTest::qWait(100);
        const auto stopped = source->stats().playedFrames; const auto active = audio.engine()->stats().playedFrames;
        QTest::qWait(150); QCOMPARE(source->stats().playedFrames, stopped); QVERIFY(audio.engine()->stats().playedFrames > active);
        monitor.shuttle(1); QVERIFY(!program.playing()); program.shuttle(1); QVERIFY(!monitor.clock()->playing());
        // A Program scrub sounds while Program is paused, so it stops Source too.
        program.pause(); monitor.togglePlay(); QVERIFY(monitor.clock()->playing());
        program.scrub(500); QVERIFY(!monitor.clock()->playing());
        monitor.setProgramClock(nullptr); program.pause(); monitor.shuttle(1); program.play(); QVERIFY(monitor.clock()->playing());
        monitor.pause();
        // native-rules #2: naked new and delete of a QObject with no parent
        auto* temporary = new PlaybackClock; monitor.setProgramClock(temporary); delete temporary; monitor.togglePlay(); QVERIFY(monitor.clock()->playing());
    }
    void onlyNormalSpeedHasSound() {
        QTemporaryDir dir; const auto path = tone(dir); QVERIFY(!path.isEmpty());
        SourceMonitor monitor; monitor.setRecordSecondsForTest(3); monitor.openLocal(sound, path, path); QTRY_VERIFY(monitor.ready());
        monitor.togglePlay(); QVERIFY(monitor.audible()); auto* engine = monitor.audioEngineForTest(); QVERIFY(engine);
        QTest::qWait(500); const auto boundary = engine->stats().framesRendered;
        monitor.shuttle(1); QCOMPARE(monitor.clock()->rate(), 2.0); QVERIFY(!monitor.audible());
        QTest::qWait(500); engine->stop(); const auto samples = engine->recording();
        QVERIFY(samples.size() > size_t((boundary + 10000) * 2));
        double first = 0, last = 0;
        for (qint64 i = 10000; i < boundary - 2000; ++i) { first = std::max(first, double(std::abs(samples[size_t(i * 2)]))); }
        for (size_t i = size_t((boundary + 5000) * 2); i < samples.size(); ++i) { last = std::max(last, double(std::abs(samples[i]))); }
        QVERIFY(first > 0.1); QVERIFY(last < 1e-6);
        monitor.close(); monitor.openLocal(sound, path, path); QTRY_VERIFY(monitor.ready()); monitor.seek(2000); monitor.shuttle(-1);
        QVERIFY(!monitor.audible()); engine = monitor.audioEngineForTest(); QVERIFY(engine); QTest::qWait(300); engine->stop();
        for (float sample : engine->recording()) { QVERIFY(std::abs(sample) < 1e-6); }
        monitor.close(); monitor.openLocal(sound, path, path); QTRY_VERIFY(monitor.ready()); monitor.togglePlay();
        monitor.clock()->setRate(0.25); QVERIFY(!monitor.audible()); monitor.clock()->setRate(1); QVERIFY(monitor.audible());
    }
    void aVideoPlaysItsOwnSound() {
        const auto path = QStringLiteral(NT_FIXTURES_DIR "/media/flash-beep-720p30.mov");
        SourceMonitor monitor; monitor.openLocal(video, path, path); QTRY_VERIFY_WITH_TIMEOUT(monitor.ready(), 10000);
        QVERIFY(monitor.hasAudio()); QVERIFY(monitor.hasVideo()); QCOMPARE(monitor.audioPath(), path);
        monitor.togglePlay(); QVERIFY(monitor.audible());
        auto* engine = monitor.audioEngineForTest(); QVERIFY(engine);
        QTRY_VERIFY_WITH_TIMEOUT(engine->stats().sourcesOpened > 0, 5000);
        QTRY_VERIFY_WITH_TIMEOUT(engine->stats().playedFrames > 0, 5000);
        QCOMPARE(engine->stats().openFailures, qint64(0));
        monitor.pause();
    }
    void playbackUpdatesNoModel() {
        SourceMonitor monitor; monitor.openLocal(video, numbered, {}); QTRY_VERIFY(monitor.ready());
        TimelineModel program;
        QSignalSpy timeline(monitor.timeline(), &TimelineModel::timelineChanged), clips(monitor.timeline(), &TimelineModel::clipsChanged), preview(monitor.timeline(), &TimelineModel::previewChanged);
        QSignalSpy pt(&program, &TimelineModel::timelineChanged), pc(&program, &TimelineModel::clipsChanged), pp(&program, &TimelineModel::previewChanged);
        monitor.togglePlay(); QTest::qWait(100); monitor.clock()->tick(); monitor.seek(3000); monitor.pause();
        QCOMPARE(timeline.count(), 0); QCOMPARE(clips.count(), 0); QCOMPARE(preview.count(), 0);
        QCOMPARE(pt.count(), 0); QCOMPARE(pc.count(), 0); QCOMPARE(pp.count(), 0);
    }
    void replacingTheSourceStopsAndCancels() {
        SourceMonitor monitor; auto second = video; second.insert("id", "second");
        monitor.openLocal(video, numbered, {}); monitor.openLocal(second, numbered, {}, 4000);
        QTRY_VERIFY_WITH_TIMEOUT(monitor.ready() && !monitor.busy(), 10000);
        QCOMPARE(monitor.timeline()->clipsJson().first().toObject().value("currentAssetId").toString(), QString("second"));
        QCOMPARE(monitor.clock()->time(), 4000.0); monitor.togglePlay();
        monitor.openLocal(video, numbered, {}); QVERIFY(!monitor.clock()->playing()); monitor.close(); QTest::qWait(100); QVERIFY(!monitor.ready());
        { SourceMonitor destroyed; destroyed.openLocal(video, numbered, {}); }
        monitor.open(video); QVERIFY(!monitor.ready()); QCOMPARE(monitor.error(), QString("Connect to a server to preview this asset."));
    }
};
QTEST_MAIN(TestSourceMonitor)
#include "tst_sourcemonitor.moc"
