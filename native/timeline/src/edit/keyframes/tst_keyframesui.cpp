#include "edit/ClipGestureController.h"
#include "model/TimelineJson.h"
#include "model/TimelineModel.h"
#include "playback/PlaybackClock.h"
#include <QQmlContext>
#include <QQmlEngine>
#include <QtQuickTest/quicktest.h>

class KeyframeUiSetup : public QObject {
    Q_OBJECT
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
    Q_INVOKABLE int undoCount() const { return m_model.undoStack()->count(); }
    Q_INVOKABLE QString documentJson() const { return QString::fromUtf8(m_model.documentJson()); }

  private:
    TimelineModel m_model;
    PlaybackClock m_clock;
    ClipGestureController m_gestures;
};
QUICK_TEST_MAIN_WITH_SETUP(keyframesui, KeyframeUiSetup)
#include "tst_keyframesui.moc"
