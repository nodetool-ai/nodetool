#pragma once
#include <QObject>
#include <QPointer>
#include <QVariantMap>
#include <QtQmlIntegration/qqmlintegration.h>
#include "model/TimelineModel.h"
class FollowPathControls : public QObject {
    Q_OBJECT
    QML_ELEMENT
    Q_PROPERTY(TimelineModel* timeline READ timeline WRITE setTimeline NOTIFY changed)
    Q_PROPERTY(QVariantList shapeOptions READ options NOTIFY changed)
    Q_PROPERTY(QVariantList allClipOptions READ clipOptions NOTIFY changed)
  public:
    explicit FollowPathControls(QObject* parent = nullptr) : QObject(parent) {}
    TimelineModel* timeline() const { return m_timeline; }
    void setTimeline(TimelineModel* timeline);
    Q_INVOKABLE QVariantList options() const;
    QVariantList clipOptions() const;
    Q_INVOKABLE QVariantMap params(const QString& id) const;
    static QVariantMap shapeParams(const QVariantMap& shape);
  signals:
    void changed();
  private:
    QPointer<TimelineModel> m_timeline;
};
