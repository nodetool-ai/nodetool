#pragma once

#include <QHash>
#include <QSet>
#include <QString>
#include <QMetaType>

// UI-thread value. Roles are document field names, independent of view-model enums.
struct ChangeSet {
    QHash<QString, QSet<QString>> clips;
    QHash<QString, QSet<QString>> tracks;
    QHash<QString, QSet<QString>> markers;
    QSet<QString> noteClipIds;
    QSet<QString> documentFields;
    bool clipsStructural = false;
    bool tracksStructural = false;
    bool markersStructural = false;
    bool fullReplacement = false;

    bool clipChanged(const QString& id) const { return fullReplacement || clips.contains(id); }
    bool trackChanged(const QString& id) const { return fullReplacement || tracks.contains(id); }
};
Q_DECLARE_METATYPE(ChangeSet)
