#include "edit/ClipGestureController.h"
#include "model/TimelineJson.h"
#include "model/TimelineModel.h"
#include "playback/PlaybackClock.h"
#include <QJsonDocument>
#include <QQmlContext>
#include <QQmlEngine>
#include <QtQuickTest/quicktest.h>

class FollowPathUiSetup : public QObject {
    Q_OBJECT
  public slots:
    void qmlEngineAvailable(QQmlEngine* engine) {
        auto parsed = nt::parseTimelineJson(
            R"({"name":"Inspector","width":640,"height":360,"fps":30,"durationMs":2000,"tracks":[{"id":"v","name":"Video","type":"video"}],"clips":[{"id":"c","trackId":"v","mediaType":"video","name":"Picture","startMs":0,"durationMs":2000,"animations":[{"id":"a","role":"in","preset":"followPath","durationMs":800,"params":{"unknown":42}}]},{"id":"s","trackId":"v","mediaType":"shape","name":"Box","startMs":0,"durationMs":2000,"shapeStyle":{"kind":"rect"}}]})");
        m_original = parsed.timeline->raw;
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
        if (m_groupFixture) {
            auto parsed = nt::parseTimelineJson(QJsonDocument(m_original).toJson());
            m_model.setTimeline(std::move(*parsed.timeline));
            m_groupFixture = false;
        }
        m_clock.seek(0);
    }
    Q_INVOKABLE void resetGroup() {
        reset();
        auto raw = m_original;
        auto clips = raw["clips"].toArray();
        auto child = clips[0].toObject();
        child["parentId"] = "g";
        clips[0] = child;
        clips.append(QJsonObject{{"id", "g"}, {"trackId", "v"}, {"mediaType", "group"},
                                {"name", "Group"}, {"startMs", 0}, {"durationMs", 2000},
                                {"unknownGroup", 73},
                                {"repeater", QJsonObject{{"count", 2}, {"unknown", 42},
                                    {"positionStep", QJsonObject{{"x", 0}, {"y", 0}, {"unknown", 17}}}}},
                                {"animations", QJsonArray{QJsonObject{{"id", "ga"}, {"role", "in"},
                                    {"preset", "fade"}, {"durationMs", 800}, {"unknown", 23}}}}});
        raw["clips"] = clips;
        auto parsed = nt::parseTimelineJson(QJsonDocument(raw).toJson());
        m_model.setTimeline(std::move(*parsed.timeline));
        m_groupFixture = true;
    }
    Q_INVOKABLE int undoCount() const { return m_model.undoStack()->count(); }
    Q_INVOKABLE int undoIndex() const { return m_model.undoStack()->index(); }
    Q_INVOKABLE QString documentJson() const { return QString::fromUtf8(m_model.documentJson()); }

  private:
    QJsonObject m_original;
    bool m_groupFixture = false;
    TimelineModel m_model;
    PlaybackClock m_clock;
    ClipGestureController m_gestures;
};
QUICK_TEST_MAIN_WITH_SETUP(followpathui, FollowPathUiSetup)
#include "tst_followpathui.moc"
