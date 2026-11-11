#include "edit/ClipGestureController.h"
#include "model/TimelineJson.h"
#include "model/TimelineModel.h"
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
  public:
    KeyframeUiSetup() {
        if (qEnvironmentVariableIsEmpty("NODETOOL_TIMELINE_PREFERENCES")) {
            if (!m_preferences.isValid()) { qFatal("Cannot create test preferences"); }
            qputenv("NODETOOL_TIMELINE_PREFERENCES", QFile::encodeName(m_preferences.filePath("Timeline.ini")));
        }
    }
  public slots:
    void qmlEngineAvailable(QQmlEngine* engine) {
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
    Q_INVOKABLE void reset() {
        m_gestures.setSelection({});
        while (m_model.undoStack()->canUndo()) {
            m_model.undoStack()->undo();
        }
        m_model.undoStack()->clear();
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
    QTemporaryDir m_preferences;
    TimelineModel m_model;
    PlaybackClock m_clock;
    ClipGestureController m_gestures;
};
QUICK_TEST_MAIN_WITH_SETUP(keyframesui, KeyframeUiSetup)
#include "tst_keyframesui.moc"
