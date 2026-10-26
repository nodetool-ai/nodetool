#pragma once
#include "model/TimelineModel.h"
#include <QObject>
#include <QUrl>
#include <QVariantList>
#include <QtQmlIntegration/qqmlintegration.h>

namespace nt::tracks {
struct HeaderAction {
    QString id;
    QUrl source;
    int order = 0;
};
bool registerHeaderAction(HeaderAction action);
}
class TrackHeaderActions : public QObject {
    Q_OBJECT
    QML_ELEMENT
    QML_SINGLETON
public:
    explicit TrackHeaderActions(QObject* parent = nullptr) : QObject(parent) {}
    Q_INVOKABLE QVariantList items() const;
    Q_INVOKABLE int position(TimelineModel* timeline, const QString& trackId) const;
};
