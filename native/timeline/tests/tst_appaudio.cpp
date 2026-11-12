// AppAudio feeds the engine one plan per edit, not one per signal, and the idle
// worker does not poll at 500 Hz.
#include "audio/AppAudio.h"
#include "model/TimelineModel.h"
#include "playback/PlaybackClock.h"

#include <QJsonObject>
#include <QtTest>

using namespace nt;
using namespace nt::audio;

class TstAppAudio : public QObject {
    Q_OBJECT
private slots:
    void editBuildsOnePlan() {
        TimelineModel model;
        PlaybackClock clock;
        AppAudio audio;
        QString error;
        QVERIFY2(audio.start(QStringLiteral("null"), 0, model, clock, &error), qPrintable(error));
        const auto before = audio.engine()->stats().planBuilds;
        // One document replacement emits clipsChanged and timelineChanged back to back.
        model.setTimeline(nt::Timeline{});
        QTRY_COMPARE_WITH_TIMEOUT(audio.engine()->stats().planBuilds, before + 1, 1000);
        QTest::qWait(50);
        QCOMPARE(audio.engine()->stats().planBuilds, before + 1);
    }
    // MUSIC-MODE.md 14.1: a sequence with a `music` object mixes at 48 kHz on
    // the system device. The window follows each document the model loads.
    void musicProjectSetsTheEngineRate() {
        nt::Timeline plain;
        nt::Timeline music;
        music.raw.insert(QStringLiteral("music"), QJsonObject{{QStringLiteral("key"), QStringLiteral("C major")}});
        QCOMPARE(engineRateFor(plain), 0);
        QCOMPARE(engineRateFor(music), kMusicEngineRate);
        TimelineModel model;
        model.setTimeline(music);
        PlaybackClock clock;
        AppAudio audio;
        audio.setFollowDocumentRate(true);
        QString error;
        QVERIFY2(audio.start(QStringLiteral("null"), 0, model, clock, &error), qPrintable(error));
        QCOMPARE(audio.systemRate(), kMusicEngineRate);
        AudioEngine* engine = audio.engine();
        model.setTimeline(plain);
        QCOMPARE(audio.systemRate(), 0);
        model.setTimeline(music);
        QCOMPARE(audio.systemRate(), kMusicEngineRate);
        // The null device always runs at 48 kHz: no restart.
        QCOMPARE(audio.engine(), engine);
        QCOMPARE(audio.engine()->stats().sampleRate, 48000.0);
    }
    void idleWorkerDoesNotPoll() {
        TimelineModel model;
        PlaybackClock clock;
        AppAudio audio;
        QString error;
        QVERIFY2(audio.start(QStringLiteral("null"), 0, model, clock, &error), qPrintable(error));
        QTest::qWait(100);
        const auto a = audio.engine()->stats().workerWakes;
        QTest::qWait(500);
        const auto b = audio.engine()->stats().workerWakes;
        // 2 ms polling would give about 250 wakes.
        QVERIFY2(b - a < 80, qPrintable(QString::number(b - a)));
    }
};
QTEST_MAIN(TstAppAudio)
#include "tst_appaudio.moc"
