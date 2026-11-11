#pragma once
#include "edit/EditActions.h"
#include <QJsonArray>

namespace nt::edit::structure {
inline ClipList clipsFromJson(const QJsonArray &array) {
    ClipList clips;
    clips.reserve(static_cast<size_t>(array.size()));
    for (const auto &value : array) {
        clips.push_back(value.toObject());
    }
    return clips;
}
inline QJsonArray clipsToJson(const ClipList &clips) {
    QJsonArray array;
    for (const auto &clip : clips) {
        array.append(clip);
    }
    return array;
}
inline EditDoc editDocument(const QJsonObject &raw) {
    EditDoc doc;
    doc.clips = clipsFromJson(raw.value("clips").toArray());
    for (const auto &value : raw.value("tracks").toArray()) {
        const auto t = value.toObject();
        doc.tracks.push_back({t.value("id").toString(), t.value("type").toString(), t.value("locked").toBool()});
    }
    for (const auto &value : raw.value("mediaTracks").toArray()) {
        doc.clipsWithMediaTracks.insert(value.toObject().value("clipId").toString());
    }
    return doc;
}
inline QStringList selectedIds(const QJsonObject &p) {
    QStringList ids;
    for (const auto &value : p.value("selectedIds").toArray()) {
        ids.append(value.toString());
    }
    if (ids.isEmpty() && p.contains("clipId")) {
        ids.append(p.value("clipId").toString());
    }
    return ids;
}
inline IdSet idSet(const QJsonArray &array) {
    IdSet ids;
    for (const auto &value : array) {
        ids.insert(value.toString());
    }
    return ids;
}
inline IdSet stateIds(const QJsonObject &raw, const QJsonObject &p, const QString &key) {
    return idSet((p.contains(key) ? p.value(key) : raw.value(key)).toArray());
}
inline QJsonObject withClips(QJsonObject raw, const ClipList &clips) {
    const auto array = clipsToJson(clips);
    if (raw.value("clips").toArray() != array) {
        raw.insert("clips", array);
    }
    return raw;
}
inline RippleOptions rippleOptions(const QJsonObject &raw, const QJsonObject &p, const EditDoc &doc,
                                   const IdSet &editedTracks) {
    RippleOptions options;
    options.lockedTrackIds = lockedTrackIds(doc);
    options.lockedClipIds = lockedUserTargetIds(doc);
    const auto syncOff = stateIds(raw, p, "syncLockOffTrackIds");
    for (const auto &track : doc.tracks) {
        if (syncOff.count(track.id) && !editedTracks.count(track.id)) {
            options.lockedTrackIds.insert(track.id);
        }
    }
    options.followLinks = p.value("linked").toBool(true);
    return options;
}
} // namespace nt::edit::structure
