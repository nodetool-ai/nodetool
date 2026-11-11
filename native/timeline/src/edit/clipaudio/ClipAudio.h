#pragma once
#include "model/TimelineModel.h"
#include <QPointer>
#include <QVariantMap>
#include <QtQmlIntegration/qqmlintegration.h>

class ClipAudio : public QObject {
    Q_OBJECT
    QML_ELEMENT
    Q_PROPERTY(TimelineModel* timeline READ timeline WRITE setTimeline NOTIFY changed)
    Q_PROPERTY(QStringList selection READ selection WRITE setSelection NOTIFY changed)
    Q_PROPERTY(QVariantMap clip READ clip NOTIFY changed)
    Q_PROPERTY(QVariantList audible READ audible NOTIFY changed)
    Q_PROPERTY(quint64 generation READ generation NOTIFY changed)
public:
    explicit ClipAudio(QObject* parent = nullptr) : QObject(parent) {}
    TimelineModel* timeline() const { return m_timeline; }
    void setTimeline(TimelineModel* timeline);
    QStringList selection() const { return m_selection; }
    void setSelection(const QStringList& selection);
    QVariantMap clip() const;
    QVariantList audible() const;
    quint64 generation() const { return m_timeline ? m_timeline->documentGeneration() : 0; }
    Q_INVOKABLE void beginFade(const QString& clipId, const QString& edge);
    Q_INVOKABLE void previewFade(double value);
    Q_INVOKABLE void finishFade();
signals:
    void changed();
private:
    QPointer<TimelineModel> m_timeline;
    QStringList m_selection;
    QJsonObject m_beforeClip;
    QString m_fadeField;
    quint64 m_generation = 0;
    double m_fadeValue = 0;
    bool m_previewed = false;
};
