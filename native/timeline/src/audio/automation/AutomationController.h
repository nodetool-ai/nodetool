#pragma once
#include "model/TimelineModel.h"
#include "playback/PlaybackClock.h"
#include <QElapsedTimer>
#include <QHash>
#include <QPointer>
#include <QVariantList>
#include <QtQmlIntegration/qqmlintegration.h>
#include <string>
#include <vector>

// UI thread only. QML parent owns this controller, timeline is a guarded borrow.
class AutomationController : public QObject {
    Q_OBJECT
    QML_ELEMENT
    Q_PROPERTY(TimelineModel* timeline READ timeline WRITE setTimeline NOTIFY changed)
    Q_PROPERTY(QString trackId MEMBER trackId NOTIFY changed)
    Q_PROPERTY(bool master MEMBER master NOTIFY changed)
    Q_PROPERTY(QVariantMap channel READ channel NOTIFY channelChanged)
    Q_PROPERTY(QVariantList tracks READ tracks NOTIFY tracksChanged)
public:
    explicit AutomationController(QObject* parent = nullptr);
    TimelineModel* timeline() const { return timeline_; }
    void setTimeline(TimelineModel* timeline);
    QString trackId;
    bool master = false;
    QVariantMap channel() const;
    QVariantList tracks() const;
    Q_INVOKABLE QVariant call(const QString& name, const QJsonArray& args) const;
    Q_INVOKABLE QString newId() const;
    Q_INVOKABLE quint64 generation() const;
    Q_INVOKABLE void setPoints(const QString& laneId, const QJsonArray& points, quint64 generation);
    Q_INVOKABLE double laneValueAt(const QString& laneId, double timeMs, double fallback) const;
    Q_INVOKABLE bool clipNameAt(double timeMs, double minimumDurationMs = 0) const;
    Q_INVOKABLE void createWithPoints(const QJsonObject& target, const QJsonArray& points, quint64 generation);
    Q_INVOKABLE void addLane(const QJsonObject& target);
    Q_INVOKABLE void patchLane(const QString& laneId, const QJsonObject& patch, bool remove = false);
    Q_INVOKABLE void edit(const QString& action, QJsonObject payload);
    // Live mixer value during a drag: the audio and the readout hear it, the document does not. NaN releases it.
    Q_INVOKABLE void previewMixer(const QString& param, double value);
    Q_INVOKABLE void commitMixer(const QString& param, double value);
signals:
    void changed();
    void channelChanged();
    void tracksChanged();
private:
    QPointer<TimelineModel> timeline_;
    QJsonObject channelState_;
    QJsonArray tracksState_;
    void refresh();
};

// UI thread only. The QML engine owns the singleton and its reading cache.
class AutomationMeters : public QObject {
    Q_OBJECT
    QML_ELEMENT
    QML_SINGLETON
public:
    explicit AutomationMeters(QObject* parent = nullptr) : QObject(parent) {}
    // The peaks since the last read. The read resets them, so two meters of
    // one channel (the mixer strip and the track header) would split the
    // peaks. A read within one meter frame returns the previous reading.
    // UI thread only.
    Q_INVOKABLE QVariantList take(const QString& channelId) const;
  private:
    struct Reading { qint64 atMs = -1000; QVariantList peaks; };
    mutable QHash<QString, Reading> readings_;
    mutable qint64 lastPrunedMs_=-1000;
    QElapsedTimer clock_ = [] { QElapsedTimer t; t.start(); return t; }();
};

// UI thread only, QML parent-owned. Curves compile on document/target changes.
// A transport tick binary-searches immutable samples without copying the lane.
class AutomationReadout : public QObject {
    Q_OBJECT
    QML_ELEMENT
    Q_PROPERTY(TimelineModel* timeline READ timeline WRITE setTimeline NOTIFY sourceChanged)
    Q_PROPERTY(PlaybackClock* clock READ clock WRITE setClock NOTIFY sourceChanged)
    Q_PROPERTY(QString trackId READ trackId WRITE setTrackId NOTIFY sourceChanged)
    Q_PROPERTY(QJsonObject target READ target WRITE setTarget NOTIFY sourceChanged)
    Q_PROPERTY(double value READ value NOTIFY valueChanged)
public:
    explicit AutomationReadout(QObject* parent = nullptr) : QObject(parent) {}
    TimelineModel* timeline() const { return timeline_; }
    PlaybackClock* clock() const { return clock_; }
    QString trackId() const { return trackId_; }
    QJsonObject target() const { return target_; }
    double value() const { return value_; }
    void setTimeline(TimelineModel* value);
    void setClock(PlaybackClock* value);
    void setTrackId(const QString& value);
    void setTarget(const QJsonObject& value);
signals:
    void sourceChanged();
    void valueChanged();
private:
    struct Point { double time, value; std::string easing; };
    QPointer<TimelineModel> timeline_;
    QPointer<PlaybackClock> clock_;
    QString trackId_;
    QJsonObject target_;
    QJsonObject trackState_;
    std::vector<Point> points_;
    double base_ = 0, value_ = 0;
    void compile();
    void update();
    void overrideChanged(const QString& trackId, const QString& param);
};

// UI thread only. The QML engine owns this immutable parameter-schema interface.
class AutomationParameters : public QObject {
    Q_OBJECT
    QML_ELEMENT
    QML_SINGLETON
public:
    explicit AutomationParameters(QObject* parent=nullptr) : QObject(parent) {}
    Q_INVOKABLE QJsonArray instrumentTargets(const QJsonObject& instrument) const;
    Q_INVOKABLE QJsonObject effectDefaults(const QString& type) const;
};
