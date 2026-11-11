#pragma once
#include "model/TimelineModel.h"
#include <QPointer>
#include <QtQmlIntegration/qqmlintegration.h>

class LocalActivity : public QObject {
    Q_OBJECT
    QML_ELEMENT
    Q_PROPERTY(TimelineModel* timeline READ timeline WRITE setTimeline NOTIFY changed)
    Q_PROPERTY(QVariantList rows READ rows NOTIFY changed)
    Q_PROPERTY(QString error READ error NOTIFY changed)
public:
    explicit LocalActivity(QObject* parent = nullptr);
    TimelineModel* timeline() const { return m_timeline; }
    void setTimeline(TimelineModel* timeline);
    QVariantList rows() const;
    QString error() const;
    Q_INVOKABLE bool cancel(const QString& id);
signals:
    void changed();
private:
    QPointer<TimelineModel> m_timeline;
};
