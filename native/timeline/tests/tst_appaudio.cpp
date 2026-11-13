// AppAudio feeds the engine one plan per edit, not one per signal, and the idle
// worker does not poll at 500 Hz.
#include "audio/AppAudio.h"
#include "model/TimelineModel.h"
#include "playback/PlaybackClock.h"

#include <QJsonObject>
#include <QtTest>

#include <algorithm>
#include <string>
#include <vector>

using namespace nt;
using namespace nt::audio;

namespace {

// The system backend for AppAudio, played by the null device. Each rate in
// `refuse` fails to open once. `opened` lists the rate of every open.
struct RefusingDevice {
    std::vector<int> refuse;
    std::vector<int> opened;

    void install(AppAudio& audio) {
        audio.setEngineStarterForTest([this](AudioEngine& engine, const AudioEngine::Options& options, std::string* why) {
            if (options.backend != AudioEngine::Backend::System) {
                *why = "not the system backend";
                return false;
            }
            opened.push_back(options.sampleRate);
            const auto it = std::find(refuse.begin(), refuse.end(), options.sampleRate);
            if (it != refuse.end()) {
                refuse.erase(it);
                *why = "the device refused the rate";
                return false;
            }
            AudioEngine::Options null = options;
            null.backend = AudioEngine::Backend::Null;
            null.sampleRate = options.sampleRate > 0 ? options.sampleRate : 48000;
            return engine.start(null, why);
        });
    }
};

}  // namespace

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
    // A system device that refuses a rate: setSystemRate reopens the engine
    // at the rate it ran at, then at the device's own rate. The null device
    // stands in for the system one.
    void refusedRateFallsBack() {
        TimelineModel model;
        PlaybackClock clock;
        RefusingDevice device;
        AppAudio audio;
        device.install(audio);
        QString error;
        QVERIFY2(audio.start(QStringLiteral("system"), 0, model, clock, &error), qPrintable(error));
        QVERIFY(audio.setSystemRate(44100, &error));
        QCOMPARE(audio.engine()->stats().sampleRate, 44100.0);

        device.refuse = {48000};
        QVERIFY(!audio.setSystemRate(48000, &error));
        QVERIFY(!error.isEmpty());
        QCOMPARE(device.opened, (std::vector<int>{0, 44100, 48000, 44100}));
        QVERIFY(audio.engine() && audio.engine()->running());
        QCOMPARE(audio.systemRate(), 44100);
        QCOMPARE(audio.engine()->stats().sampleRate, 44100.0);
        // The rate is asked for again later, and the device takes it now.
        QVERIFY(audio.setSystemRate(48000, &error));
        QCOMPARE(audio.engine()->stats().sampleRate, 48000.0);

        device.refuse = {96000, 48000};
        device.opened.clear();
        QVERIFY(!audio.setSystemRate(96000, &error));
        QCOMPARE(device.opened, (std::vector<int>{96000, 48000, 0}));
        QVERIFY(audio.engine() && audio.engine()->running());
        QCOMPARE(audio.systemRate(), 0);
    }

    // Backlog M15: a music project opens the system device at 48 kHz at
    // launch. A device that refuses that rate falls back to its own rate, as
    // setSystemRate does, instead of failing start() and exiting the app.
    void startFallsBackWhenTheDeviceRefusesTheMusicRate() {
        nt::Timeline music;
        music.raw.insert(QStringLiteral("music"), QJsonObject{{QStringLiteral("key"), QStringLiteral("C major")}});
        TimelineModel model;
        model.setTimeline(music);
        PlaybackClock clock;
        RefusingDevice device;
        device.refuse = {kMusicEngineRate};
        AppAudio audio;
        audio.setFollowDocumentRate(true);
        device.install(audio);
        QString error;
        QVERIFY2(audio.start(QStringLiteral("system"), 0, model, clock, &error), qPrintable(error));
        QCOMPARE(device.opened, (std::vector<int>{kMusicEngineRate, 0}));
        QVERIFY(audio.engine() && audio.engine()->running());
        QCOMPARE(audio.systemRate(), 0);
        // The next music document asks for 48 kHz again, and the device takes it now.
        model.setTimeline(music);
        QCOMPARE(audio.systemRate(), kMusicEngineRate);
        QCOMPARE(audio.engine()->stats().sampleRate, 48000.0);
    }

    // A device that opens at no rate still fails start().
    void startFailsWhenNoRateOpens() {
        nt::Timeline music;
        music.raw.insert(QStringLiteral("music"), QJsonObject{{QStringLiteral("key"), QStringLiteral("C major")}});
        TimelineModel model;
        model.setTimeline(music);
        PlaybackClock clock;
        RefusingDevice device;
        device.refuse = {kMusicEngineRate, 0};
        AppAudio audio;
        audio.setFollowDocumentRate(true);
        device.install(audio);
        QString error;
        QVERIFY(!audio.start(QStringLiteral("system"), 0, model, clock, &error));
        QVERIFY(!error.isEmpty());
        QCOMPARE(audio.engine(), nullptr);
    }

    // When no rate opens, the engine is gone until the next call, which
    // opens it again: here the next document the window loads.
    void reopensAfterEveryRateFailed() {
        nt::Timeline plain;
        nt::Timeline music;
        music.raw.insert(QStringLiteral("music"), QJsonObject{{QStringLiteral("key"), QStringLiteral("C major")}});
        TimelineModel model;
        model.setTimeline(plain);
        PlaybackClock clock;
        RefusingDevice device;
        AppAudio audio;
        audio.setFollowDocumentRate(true);
        device.install(audio);
        QString error;
        QVERIFY2(audio.start(QStringLiteral("system"), 0, model, clock, &error), qPrintable(error));
        device.refuse = {48000, 0};
        model.setTimeline(music);
        QCOMPARE(audio.engine(), nullptr);
        QCOMPARE(audio.systemRate(), kMusicEngineRate);
        model.setTimeline(music);
        QVERIFY(audio.engine() && audio.engine()->running());
        QCOMPARE(audio.engine()->stats().sampleRate, 48000.0);
    }

    // The document connection ends with the AppAudio: a document loaded
    // after it is gone reaches nothing of it.
    void documentConnectionEndsWithTheAudio() {
        nt::Timeline music;
        music.raw.insert(QStringLiteral("music"), QJsonObject{{QStringLiteral("key"), QStringLiteral("C major")}});
        TimelineModel model;
        PlaybackClock clock;
        {
            AppAudio audio;
            audio.setFollowDocumentRate(true);
            QString error;
            QVERIFY2(audio.start(QStringLiteral("null"), 0, model, clock, &error), qPrintable(error));
        }
        model.setTimeline(music);
        model.setTimeline(nt::Timeline{});
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
