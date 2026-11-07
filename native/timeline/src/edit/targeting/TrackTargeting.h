#pragma once
#include "edit/ClipOps.h"
#include <QObject>

namespace nt::targeting {
struct TargetingState {
    nt::edit::IdSet untargetedTrackIds;
    nt::edit::IdSet syncLockOffTrackIds;
};

class TrackTargeting : public QObject {
    Q_OBJECT
public:
    explicit TrackTargeting(QObject* parent = nullptr) : QObject(parent) {}
    static TrackTargeting& current();
    const TargetingState& state() const { return state_; }
    Q_INVOKABLE bool isTargeted(const QString& id) const { return !state_.untargetedTrackIds.contains(id); }
    Q_INVOKABLE bool isSyncLocked(const QString& id) const { return !state_.syncLockOffTrackIds.contains(id); }
    Q_INVOKABLE void setTrackTargeted(const QString& id, bool on);
    Q_INVOKABLE void setTrackSyncLocked(const QString& id, bool on);
signals:
    void changed();
private:
    TargetingState state_;
};
}
