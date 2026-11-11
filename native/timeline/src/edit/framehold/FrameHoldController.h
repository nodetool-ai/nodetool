// Behaviour ported from FilmCraft (https://github.com/storytold/filmcraft), MIT OR Apache-2.0.
#pragma once
#include "model/TimelineModel.h"
#include <QPointer>
#include <QtQmlIntegration/qqmlintegration.h>

class FrameHoldController : public QObject {
    Q_OBJECT
    QML_ELEMENT
    Q_PROPERTY(TimelineModel* timeline READ timeline WRITE setTimeline NOTIFY timelineChanged)
public:
    explicit FrameHoldController(QObject* parent = nullptr) : QObject(parent) {}
    TimelineModel* timeline() const { return m_timeline; }
    void setTimeline(TimelineModel* model);
    Q_INVOKABLE QVariantMap add(const QStringList& clipIds, double atMs);
    Q_INVOKABLE QVariantMap insertSegment(const QString& clipId, double atMs, double durationMs);
    Q_INVOKABLE QVariantMap setOptions(const QVariantMap& request);
    Q_INVOKABLE QStringList targetsAt(const QStringList& selection, double atMs) const;
    Q_INVOKABLE QVariantMap clipJson(const QString& clipId) const;
    // The source time a clip holds on, or -1 when it does not hold.
    Q_INVOKABLE double holdSourceMs(const QString& clipId) const;
signals:
    void timelineChanged();
private:
    QPointer<TimelineModel> m_timeline;
};
