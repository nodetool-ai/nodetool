#pragma once
#include "model/TimelineModel.h"
#include <QPointer>
#include <QQuickItem>
#include <QtQmlIntegration/qqmlintegration.h>

namespace nt::wiring::w {
const QJsonObject& effectReference();
}

class TrackEffectsReference : public QObject {
    Q_OBJECT
    QML_ELEMENT
    QML_SINGLETON
    Q_PROPERTY(QVariantMap data READ data CONSTANT)
public:
    explicit TrackEffectsReference(QObject* parent = nullptr) : QObject(parent) {}
    QVariantMap data() const;
    Q_INVOKABLE QVariantMap makeFableEffect(const QString& kind) const;
    Q_INVOKABLE QQuickItem* windowItem(QQuickItem* anchor, const QString& name) const;
};

// TrackHeader's fixed roles do not include the raw effects array.
class TrackEffectsModel : public QObject {
    Q_OBJECT
    QML_ELEMENT
    Q_PROPERTY(TimelineModel* timeline READ timeline WRITE setTimeline NOTIFY changed)
    Q_PROPERTY(QString trackId READ trackId WRITE setTrackId NOTIFY changed)
    Q_PROPERTY(QVariantMap track READ track NOTIFY changed)
public:
    explicit TrackEffectsModel(QObject* parent = nullptr) : QObject(parent) {}
    TimelineModel* timeline() const { return m_timeline; }
    void setTimeline(TimelineModel* timeline);
    QString trackId() const { return m_trackId; }
    void setTrackId(const QString& id);
    QVariantMap track() const;
signals:
    void changed();
private:
    QPointer<TimelineModel> m_timeline;
    QString m_trackId;
};
