#include "TrackTargeting.h"
#include <QCoreApplication>
#include <QPointer>

namespace nt::targeting {
TrackTargeting& TrackTargeting::current() {
    // One application-owned editor state bridges registry edits and the QML
    // singleton. It is never part of a document or its undo history.
    Q_ASSERT(QCoreApplication::instance());
    static QPointer<TrackTargeting> instance;
    if (!instance) {
        instance = new TrackTargeting(QCoreApplication::instance());
    }
    return *instance;
}
void TrackTargeting::setTrackTargeted(const QString& id, bool on) {
    if (isTargeted(id) == on) { return; }
    if (on) { state_.untargetedTrackIds.erase(id); }
    else { state_.untargetedTrackIds.insert(id); }
    emit changed();
}
void TrackTargeting::setTrackSyncLocked(const QString& id, bool on) {
    if (isSyncLocked(id) == on) { return; }
    if (on) { state_.syncLockOffTrackIds.erase(id); }
    else { state_.syncLockOffTrackIds.insert(id); }
    emit changed();
}
}
