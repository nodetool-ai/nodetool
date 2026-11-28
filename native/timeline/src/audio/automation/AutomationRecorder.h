#pragma once
#include "model/TimelineModel.h"
#include "playback/PlaybackClock.h"
#include <QPointer>
#include <QList>
#include <optional>
#include <QtQmlIntegration/qqmlintegration.h>

// UI thread only. The model owns its document recorder. Explicit QML instances
// belong to their QML parent. Samples never reach the audio
// thread. TimelineModel owns the atomic handoffs retained by published plans.
class AutomationRecorder : public QObject {
    Q_OBJECT
    QML_ELEMENT
    Q_PROPERTY(TimelineModel* timeline READ timeline WRITE setTimeline NOTIFY changed)
    Q_PROPERTY(PlaybackClock* clock READ clock WRITE setClock NOTIFY changed)
public:
    explicit AutomationRecorder(QObject* parent = nullptr) : QObject(parent) {}
    Q_DISABLE_COPY_MOVE(AutomationRecorder)
    ~AutomationRecorder() override;
    TimelineModel* timeline() const { return timeline_; }
    PlaybackClock* clock() const { return clock_; }
    void setTimeline(TimelineModel* value);
    void setClock(PlaybackClock* value);
    Q_INVOKABLE bool gestureStart(const QString& track, const QString& param);
    Q_INVOKABLE bool record(const QString& track, const QString& param, double value);
    Q_INVOKABLE void gestureEnd(const QString& track, const QString& param);
    Q_INVOKABLE void gestureCancel(const QString& track, const QString& param);
    Q_INVOKABLE double value(const QString& track, const QString& param) const;
    Q_INVOKABLE bool consumes(const QString& track) const;
signals:
    void changed();
private:
    struct Pass {
        QString track, param, mode;
        double lastTime = 0, lastValue = 0;
        QJsonArray samples;
    };
    QPointer<TimelineModel> timeline_;
    QPointer<PlaybackClock> clock_;
    QList<Pass> passes_;
    struct Gesture { QString track, param; std::optional<Pass> before; };
    QList<Gesture> gestures_;
    bool finishing_ = false;
    double previousTime_ = 0;
    QJsonObject track(const QString& id) const;
    double curveValue(const QString& id, const QString& param, double timeMs) const;
    void start(const QString& id, const QString& param, const QString& mode, double timeMs);
    void finish(int index, double end, bool write);
    void finishAll(double end, bool write);
    void reconcile();
    void transport();
};
