// AppAudio feeds the engine one plan per edit, not one per signal, and the idle
// worker does not poll at 500 Hz.
#include "audio/AppAudio.h"
#include "model/TimelineModel.h"
#include "playback/PlaybackClock.h"

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
