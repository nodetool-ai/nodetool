#include "../../../tests/TestAssetCacheRoot.h"
#include "edit/ClipGestureController.h"
#include "model/TimelineJson.h"
#include "model/TimelineModel.h"
#include "music/MusicSelection.h"
#include "playback/PlaybackClock.h"
#include "platform/CpuUsage.h"
#include <QFile>
#include <QJSValue>
#include <QQmlContext>
#include <QQmlEngine>
#include <QQuickItem>
#include <QQuickWindow>
#include <QTemporaryDir>
#include <QtQuickTest/quicktest.h>

class KeyframeUiSetup : public QObject {
    Q_OBJECT
    TestAssetCacheRoot m_testCache;
  public:
    KeyframeUiSetup() {
        if (qEnvironmentVariableIsEmpty("NODETOOL_TIMELINE_PREFERENCES")) {
            if (!m_preferences.isValid()) { qFatal("Cannot create test preferences"); }
            qputenv("NODETOOL_TIMELINE_PREFERENCES", QFile::encodeName(m_preferences.filePath("Timeline.ini")));
        }
    }
  public slots:
    void qmlEngineAvailable(QQmlEngine* engine) {
        m_testCache.install(*engine);
        auto parsed = nt::parseTimelineJson(
            R"({"name":"Inspector","width":640,"height":360,"fps":30,"durationMs":2000,"tracks":[{"id":"v","name":"Video","type":"video"}],"clips":[{"id":"c","trackId":"v","mediaType":"video","name":"Picture","startMs":0,"durationMs":2000}]})");
        m_model.setTimeline(std::move(*parsed.timeline));
        m_clock.setDurationMs(2000);
        m_gestures.setTimeline(&m_model);
        engine->rootContext()->setContextProperty("testHarness", this);
        engine->rootContext()->setContextProperty("testTimeline", &m_model);
        engine->rootContext()->setContextProperty("testClock", &m_clock);
        engine->rootContext()->setContextProperty("testGestures", &m_gestures);
    }

  public:
    Q_INVOKABLE void loadPerf3Takes(int count) {
        if (m_beforePerf3.isEmpty()) { m_beforePerf3 = m_model.timeline().raw; }
        QJsonArray versions;
        for (int i = 0; i < count; ++i) {
            versions.append(QJsonObject{{"id", QString::number(i)}, {"assetId", QStringLiteral("asset-%1").arg(i)},
                                         {"label", QStringLiteral("Take %1").arg(i)}});
        }
        const QJsonObject raw{{"id", "takes"}, {"fps", 30}, {"width", 640}, {"height", 360},
                              {"tempo", QJsonObject{{"bpm", 120}, {"offsetMs", 0}, {"timeSignature", QJsonObject{{"beatsPerBar", 4}, {"beatUnit", 4}}}}},
                              {"tracks", QJsonArray{QJsonObject{{"id", "v"}, {"type", "audio"}}}},
                              {"clips", QJsonArray{QJsonObject{{"id", "c"}, {"trackId", "v"}, {"mediaType", "audio"},
                                                               {"startMs", 0}, {"durationMs", 2000}, {"status", "ready"},
                                                               {"currentAssetId", "asset-0"}, {"activeTakeId", "0"}, {"versions", versions}}}}};
        auto parsed = nt::parseTimeline(raw);
        if (!parsed.timeline) { qFatal("Invalid take fixture"); }
        m_model.setTimeline(std::move(*parsed.timeline));
        m_gestures.musicSelection()->set("v", 0, 48000);
    }
    Q_INVOKABLE void reset() {
        m_gestures.setSelection({});
        while (m_model.undoStack()->canUndo()) {
            m_model.undoStack()->undo();
        }
        m_model.undoStack()->clear();
        if (!m_beforePerf3.isEmpty()) {
            auto restored = nt::parseTimeline(m_beforePerf3);
            if (!restored.timeline) { qFatal("Invalid saved test document"); }
            m_beforePerf3 = {};
            m_model.setTimeline(std::move(*restored.timeline));
            m_gestures.musicSelection()->clear();
        }
        m_clock.seek(0);
    }
    // The mean CPU time of `count` steps, each followed by a full frame: bindings, polish,
    // sync and a render into a read-back image, which is more than a frame on screen costs.
    // CPU time, because agents and CI share the machine, and wall time follows their load.
    // The mean, because Windows' clock moves in 15.6 ms ticks, so a median of short frames reads 0.
    Q_INVOKABLE double meanFrameMs(QQuickItem* item, QJSValue step, int count) {
        // MSVC std::clock measures elapsed time, including frame waits.
        const auto start = nt::cpu::processNs();
        for (int i = 0; i < count; ++i) {
            step.call({i});
            QCoreApplication::processEvents();
            item->window()->grabWindow();
        }
        const auto end = nt::cpu::processNs();
        if (start < 0 || end < start) { qFatal("Cannot measure process CPU time"); }
        return static_cast<double>(end - start) / 1000000.0 / count;
    }
    Q_INVOKABLE int undoCount() const { return m_model.undoStack()->count(); }
    Q_INVOKABLE QString documentJson() const { return QString::fromUtf8(m_model.documentJson()); }

  private:
    QJsonObject m_beforePerf3;
    QTemporaryDir m_preferences;
    TimelineModel m_model;
    PlaybackClock m_clock;
    ClipGestureController m_gestures;
};
QUICK_TEST_MAIN_WITH_SETUP(keyframesui, KeyframeUiSetup)
#include "tst_keyframesui.moc"
