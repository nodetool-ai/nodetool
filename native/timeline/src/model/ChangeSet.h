#pragma once

#include <algorithm>
#include <QHash>
#include <QJsonArray>
#include <QSet>
#include <QString>
#include <QMetaType>

// UI-thread value. Roles are document field names, independent of view-model enums.
struct ChangeSet {
    QHash<QString, QSet<QString>> clips;
    QHash<QString, QSet<QString>> tracks;
    QHash<QString, QSet<QString>> markers;
    QSet<QString> noteClipIds;
    // Inclusive index ranges in the union of the before/after note arrays.
    QHash<QString, QList<QPair<qsizetype, qsizetype>>> noteRanges;
    void recordNoteRanges(const QString& id, const QJsonArray& before, const QJsonArray& after) {
        QList<QPair<qsizetype, qsizetype>> ranges;
        qsizetype first = -1;
        const auto count = std::max(before.size(), after.size());
        for (qsizetype i = 0; i < count; ++i) {
            const bool different = i >= before.size() || i >= after.size() || before.at(i) != after.at(i);
            if (different && first < 0) { first = i; }
            if (!different && first >= 0) { ranges.append({first, i - 1}); first = -1; }
        }
        if (first >= 0) { ranges.append({first, count - 1}); }
        if (!ranges.isEmpty()) { noteRanges.insert(id, ranges); }
    }
    QSet<QString> documentFields;
    bool clipsStructural = false;
    bool tracksStructural = false;
    bool markersStructural = false;
    bool fullReplacement = false;

    bool clipChanged(const QString& id) const { return fullReplacement || clips.contains(id); }
    bool trackChanged(const QString& id) const { return fullReplacement || tracks.contains(id); }
};
Q_DECLARE_METATYPE(ChangeSet)
