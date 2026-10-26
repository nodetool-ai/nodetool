#include "DocumentApplier.h"
#include "TimelineMerge.h"
#include "edit/EditActions.h"
#include "edit/groups/GroupOps.h"
#include "edit/tracks/TrackEdits.h"
#include <QJsonArray>
#include <QHash>

namespace nt::server::sync {
namespace {
DocumentApplier& applier() {
    static DocumentApplier value;
    return value;
}
}
void setDocumentApplier(DocumentApplier value) { applier() = std::move(value); }
bool applyDocument(QUndoStack* undo, const QJsonObject& raw, const nt::Timeline& resolved) {
    return applier() && applier()(undo, raw, resolved);
}
QJsonObject applyAcceptedUnit(QJsonObject raw, const QJsonObject& conflict) {
    // web/src/hooks/timeline/timelineExternalMerge.ts:149-273.
    const auto reason = conflict.value("reason").toString();
    if (reason == u"dangling") return raw;
    const auto external = conflict.value("external");
    if (reason == u"replaced" && external.isObject()) {
        return applyMergeDocument(raw, external.toObject());
    }
    const auto kind = conflict.value("kind").toString();
    const auto id = conflict.value("id").toString();
    if (reason == u"deleted" && external.isNull()) {
        if (kind == u"track") return nt::tracks::removeTrack(raw, {{"trackId", id}});
        if (kind == u"clip") {
            nt::edit::EditDoc doc;
            bool group = false;
            for (const auto& value : raw.value("clips").toArray()) {
                const auto clip = value.toObject();
                doc.clips.push_back(clip);
                if (nt::edit::clipId(clip) == id) group = nt::edit::isGroupClip(clip);
            }
            for (const auto& value : raw.value("tracks").toArray()) {
                const auto track = value.toObject();
                doc.tracks.push_back({track.value("id").toString(), track.value("type").toString(), track.value("locked").toBool()});
            }
            if (!nt::edit::editableUserTargets(doc, {id}, true, true).contains(id)) return raw;
            const auto remaining = group ? nt::edit::groups::ungroup(doc.clips, id) : doc.clips;
            QJsonArray clips;
            for (const auto& clip : nt::edit::removeClipsLinkAware(remaining, {id})) clips.append(clip);
            raw.insert("clips", clips);
            return raw;
        }
    }
    if (kind == u"field") {
        raw.insert(id, external);
        return raw;
    }
    static const QHash<QString, QString> fields{{"clip", "clips"}, {"track", "tracks"},
        {"trackFolder", "trackFolders"}, {"marker", "markers"}, {"mediaTrack", "mediaTracks"}, {"transcript", "transcript"}};
    const auto field = fields.value(kind);
    if (field.isEmpty()) return raw;
    QJsonArray units;
    bool found = false;
    for (const auto& unit : raw.value(field).toArray()) {
        if (unit.toObject().value("id").toString() != id) {
            units.append(unit);
        } else {
            found = true;
            if (!external.isNull() && !external.isUndefined()) {
                if (kind == u"clip") {
                    auto patched = unit.toObject();
                    const auto incoming = external.toObject();
                    for (auto it = incoming.begin(); it != incoming.end(); ++it) patched.insert(it.key(), it.value());
                    units.append(patched);
                } else {
                    units.append(external);
                }
            } else if (reason != u"deleted") {
                units.append(unit);
            }
        }
    }
    if (!found && external.isObject()) units.append(external);
    raw.insert(field, units);
    if (kind == u"trackFolder" && reason == u"deleted" && external.isNull()) {
        QJsonArray tracks;
        for (const auto& value : raw.value("tracks").toArray()) {
            auto track = value.toObject();
            if (track.value("folderId") == id) track.remove("folderId");
            tracks.append(track);
        }
        raw.insert("tracks", tracks);
    }
    return raw;
}
} // namespace nt::server::sync
