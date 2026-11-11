#pragma once
#include "TrackTargeting.h"
#include <QtQmlIntegration/qqmlintegration.h>

class TrackTargetingQml : public QObject {
    Q_OBJECT
    QML_NAMED_ELEMENT(TrackTargeting)
    QML_SINGLETON
    Q_PROPERTY(QStringList untargetedTrackIds READ untargetedTrackIds NOTIFY changed)
    Q_PROPERTY(QStringList syncLockOffTrackIds READ syncLockOffTrackIds NOTIFY changed)
public:
    explicit TrackTargetingQml(QObject* parent = nullptr) : QObject(parent) {
        connect(&nt::targeting::TrackTargeting::current(), &nt::targeting::TrackTargeting::changed,
                this, &TrackTargetingQml::changed);
    }
    QStringList untargetedTrackIds() const {
        const auto& ids = nt::targeting::TrackTargeting::current().state().untargetedTrackIds;
        return {ids.begin(), ids.end()};
    }
    QStringList syncLockOffTrackIds() const {
        const auto& ids = nt::targeting::TrackTargeting::current().state().syncLockOffTrackIds;
        return {ids.begin(), ids.end()};
    }
    Q_INVOKABLE bool isTargeted(const QString& id) const {
        return nt::targeting::TrackTargeting::current().isTargeted(id);
    }
    Q_INVOKABLE bool isSyncLocked(const QString& id) const {
        return nt::targeting::TrackTargeting::current().isSyncLocked(id);
    }
    Q_INVOKABLE void setTrackTargeted(const QString& id, bool on) {
        nt::targeting::TrackTargeting::current().setTrackTargeted(id, on);
    }
    Q_INVOKABLE void setTrackSyncLocked(const QString& id, bool on) {
        nt::targeting::TrackTargeting::current().setTrackSyncLocked(id, on);
    }
signals:
    void changed();
};
