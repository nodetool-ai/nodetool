#pragma once
#include "model/TimelineModel.h"
#include <QPointer>
#include <QVariantList>
#include <QtQmlIntegration/qqmlintegration.h>

class AutomationController : public QObject {
    Q_OBJECT
    QML_ELEMENT
    Q_PROPERTY(TimelineModel* timeline READ timeline WRITE setTimeline NOTIFY changed)
    Q_PROPERTY(QString trackId MEMBER trackId NOTIFY changed)
    Q_PROPERTY(bool master MEMBER master NOTIFY changed)
    Q_PROPERTY(QVariantMap channel READ channel NOTIFY changed)
    Q_PROPERTY(QVariantList tracks READ tracks NOTIFY changed)
public:
    explicit AutomationController(QObject* parent = nullptr) : QObject(parent) {}
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
    Q_INVOKABLE void addLane(const QJsonObject& target);
    Q_INVOKABLE void patchLane(const QString& laneId, const QJsonObject& patch, bool remove = false);
    Q_INVOKABLE void edit(const QString& action, QJsonObject payload);
signals:
    void changed();
private:
    QPointer<TimelineModel> timeline_;
};

class AutomationMeters : public QObject {
    Q_OBJECT
    QML_ELEMENT
    QML_SINGLETON
public:
    explicit AutomationMeters(QObject* parent = nullptr) : QObject(parent) {}
    Q_INVOKABLE QVariantList take(const QString& channelId) const;
};
