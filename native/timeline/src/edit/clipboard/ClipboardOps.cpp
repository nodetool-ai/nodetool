#include "edit/clipboard/ClipboardOps.h"
#include "edit/clipboard/RawDocument.h"
#include "app/EditRegistry.h"
#include <QHash>
#include <algorithm>
#include <cmath>
#include <limits>

namespace nt::edit::clipboard {
namespace {
ClipList clipboard;
const QMap<QString, QStringList> fields{{"motion", {"transform", "crop", "borderRadius"}},
                                        {"opacity", {"opacity", "blendMode"}},
                                        {"effects", {"effects"}},
                                        {"animations", {"animations"}},
                                        {"volume", {"volumeDb"}},
                                        {"audioEffects", {"audioEffects"}}};
IdSet withDescendants(const ClipList &clips, IdSet ids) {
    QHash<QString, QStringList> children;
    QStringList pending;
    for (const auto &clip : clips) {
        const auto parent = clip.value("parentId").toString();
        if (!parent.isEmpty()) {
            children[parent].append(clipId(clip));
        }
        if (ids.count(clipId(clip)) && isGroupClip(clip)) {
            pending.append(clipId(clip));
        }
    }
    IdSet visited;
    while (!pending.isEmpty()) {
        const auto parent = pending.takeLast();
        if (!visited.insert(parent).second) {
            continue;
        }
        for (const auto &child : children.value(parent)) {
            ids.insert(child);
            pending.append(child);
        }
    }
    return ids;
}
ClipList selectedClips(const ClipList &clips, const IdSet &ids) {
    ClipList result;
    for (const auto &clip : clips) {
        if (ids.count(clipId(clip))) {
            result.push_back(clip);
        }
    }
    return result;
}
QJsonObject settleDrop(QJsonObject raw, const QJsonObject &p, const IdSet &requested, const QString &mode) {
    if (mode == u"overlap") {
        return raw;
    }
    const auto doc = structure::editDocument(raw);
    const auto locked = lockedUserTargetIds(doc);
    IdSet moved;
    IdSet editedTracks;
    for (const auto &clip : doc.clips) {
        if (!requested.count(clipId(clip)) || locked.count(clipId(clip))) {
            continue;
        }
        moved.insert(clipId(clip));
        editedTracks.insert(clipTrackId(clip));
    }
    if (moved.empty()) {
        return raw;
    }
    const auto options = structure::rippleOptions(raw, p, doc, editedTracks);
    return structure::withClips(std::move(raw), resolveDrop(doc.clips, moved, mode, options));
}
} // namespace
int copyClipsToClipboard(const ClipList &clips) {
    // QJsonObject is implicitly shared and detaches on write, including nested values.
    clipboard = clips;
    return static_cast<int>(clipboard.size());
}
bool hasClipboardClips() {
    return !clipboard.empty();
}
int clipboardClipCount() {
    return static_cast<int>(clipboard.size());
}
std::optional<QJsonObject> firstClipboardClip() {
    return clipboard.empty() ? std::nullopt : std::optional<QJsonObject>(clipboard.front());
}
void clearClipClipboard() {
    clipboard.clear();
}
QJsonObject makeClip(const QJsonObject &overrides) {
    QJsonObject clip{{"id", overrides.contains("id") ? overrides.value("id") : QJsonValue(newId())},
                     {"trackId", ""},
                     {"name", ""},
                     {"startMs", 0},
                     {"durationMs", 0},
                     {"mediaType", "video"},
                     {"sourceType", "generated"},
                     {"status", "draft"},
                     {"locked", false},
                     {"versions", QJsonArray{}}};
    for (auto it = overrides.begin(); it != overrides.end(); ++it) {
        clip.insert(it.key(), it.value());
    }
    return clip;
}
ClipList cloneClips(const ClipList &clips) {
    QHash<QString, int> groupCount;
    QHash<QString, QString> freshIds;
    ClipList copies;
    copies.reserve(clips.size());
    for (const auto &clip : clips) {
        auto copy = clip;
        copy.insert("id", newId());
        copies.push_back(makeClip(copy));
        freshIds.insert(clipId(clip), clipId(copies.back()));
        if (clip.contains("linkId")) {
            ++groupCount[clip.value("linkId").toString()];
        }
    }
    QHash<QString, QString> freshLinks;
    for (auto &clip : copies) {
        if (clip.contains("parentId")) {
            const auto parent = freshIds.constFind(clip.value("parentId").toString());
            if (parent == freshIds.cend()) {
                clip.remove("parentId");
            } else {
                clip.insert("parentId", *parent);
            }
        }
        const auto link = clip.value("linkId").toString();
        if (clip.contains("linkId") && groupCount.value(link) >= 2) {
            if (!freshLinks.contains(link)) {
                freshLinks.insert(link, newId());
            }
            clip.insert("linkId", freshLinks.value(link));
        } else {
            clip.remove("linkId");
        }
    }
    return copies;
}
ClipList cloneClipsToTrack(const ClipList &clips, const QString &trackId) {
    auto copies = cloneClips(clips);
    for (auto &clip : copies) {
        clip.insert("trackId", trackId);
    }
    return copies;
}
ClipList buildPastedClips(const QJsonArray &tracks, double atMs, const std::optional<IdSet> &targetedTrackIds) {
    if (clipboard.empty()) {
        return {};
    }
    double minStart = std::numeric_limits<double>::infinity();
    for (const auto &clip : clipboard) {
        minStart = std::min(minStart, clipStartMs(clip));
    }
    auto sorted = structure::clipsFromJson(tracks);
    std::stable_sort(sorted.begin(), sorted.end(), [](const auto &a, const auto &b) {
        return a.value("index").toDouble() < b.value("index").toDouble();
    });
    IdSet writable;
    for (const auto &track : sorted) {
        const auto id = track.value("id").toString();
        if (!track.value("locked").toBool() && (!targetedTrackIds || targetedTrackIds->count(id))) {
            writable.insert(id);
        }
    }
    ClipList pasted;
    for (auto clip : clipboard) {
        auto track = clipTrackId(clip);
        if (!writable.count(track)) {
            const auto fallback = std::find_if(sorted.begin(), sorted.end(), [&](const auto &t) {
                return writable.count(t.value("id").toString()) &&
                       clipFitsTrack(clip.value("mediaType").toString(), t.value("type").toString());
            });
            if (fallback == sorted.end()) {
                continue;
            }
            track = fallback->value("id").toString();
        }
        clip.insert("trackId", track);
        const double anchored = atMs + (clipStartMs(clip) - minStart);
        const double lower = std::floor(anchored);
        const double rounded = anchored - lower < 0.5 ? lower : lower + 1;
        clip.insert("startMs", std::max(0.0, rounded));
        pasted.push_back(clip);
    }
    return cloneClips(pasted);
}
QStringList pasteAttributeGroups() {
    return {"motion", "opacity", "effects", "animations", "speed", "volume", "audioEffects"};
}
bool attributeGroupApplies(const QString &group, const QJsonObject &target) {
    const auto type = target.value("mediaType").toString();
    if (group == u"speed") {
        return type == u"video" || type == u"audio";
    }
    if (group == u"volume" || group == u"audioEffects") {
        return type == u"video" || type == u"audio" || type == u"midi";
    }
    return type != u"audio" && type != u"midi";
}
AttributePatch attributePatch(const QJsonObject &source, const QJsonObject &target, const IdSet &groups) {
    AttributePatch patch;
    for (const auto &group : groups) {
        if (group == u"speed" || !attributeGroupApplies(group, target)) {
            continue;
        }
        for (const auto &field : fields.value(group)) {
            patch.insert(field, source.value(field));
        }
    }
    return patch;
}
QStringList marqueeSelection(const ClipList &clips, const std::vector<TrackBounds> &rows, double startMs, double endMs,
                             double top, double bottom, const QStringList &baseSelection) {
    QHash<QString, TrackBounds> bounds;
    for (const auto &row : rows) {
        bounds.insert(row.trackId, row);
    }
    QStringList selected;
    IdSet seen;
    for (const auto &id : baseSelection) {
        if (seen.insert(id).second) {
            selected.append(id);
        }
    }
    for (const auto &clip : clips) {
        const auto lane = bounds.constFind(clipTrackId(clip));
        if (lane == bounds.cend() || lane->top > bottom || lane->bottom < top) {
            continue;
        }
        if (clipEndMs(clip) > startMs && clipStartMs(clip) < endMs && seen.insert(clipId(clip)).second) {
            selected.append(clipId(clip));
        }
    }
    return selected;
}
QJsonObject applyClipboardEdit(const QString &name, QJsonObject raw, const QJsonObject &p) {
    auto doc = structure::editDocument(raw);
    const auto selection = structure::selectedIds(p);
    const IdSet ids(selection.begin(), selection.end());
    const bool linked = p.value("linked").toBool(true);
    if (name == u"copy" || name == u"cut") {
        if (ids.empty()) {
            return raw;
        }
        auto copiedIds = withDescendants(doc.clips, ids);
        if (name == u"cut") {
            for (const auto &id : lockedUserTargetIds(doc)) {
                copiedIds.erase(id);
            }
        }
        copyClipsToClipboard(selectedClips(doc.clips, copiedIds));
        if (name == u"cut") {
            const auto remove = nt::app::findEdit("deleteSelected");
            if (remove) {
                return remove(std::move(raw), p);
            }
        }
        return raw;
    }
    if (name == u"paste" || name == u"pasteInsert") {
        const auto untargeted = structure::stateIds(raw, p, "untargetedTrackIds");
        IdSet targets;
        for (const auto &t : doc.tracks) {
            if (!t.locked && !untargeted.count(t.id)) {
                targets.insert(t.id);
            }
        }
        const auto pasted = buildPastedClips(raw.value("tracks").toArray(), p.value("atMs").toDouble(), targets);
        if (pasted.empty()) {
            return raw;
        }
        IdSet pastedIds;
        for (const auto &clip : pasted) {
            pastedIds.insert(clipId(clip));
        }
        doc.clips.insert(doc.clips.end(), pasted.begin(), pasted.end());
        const auto mode = name == u"pasteInsert" ? QStringLiteral("insert") : p.value("mode").toString("overlap");
        return settleDrop(structure::withClips(std::move(raw), doc.clips), p, pastedIds, mode);
    }
    if (name == u"duplicateSelected" || name == u"duplicate" || name == u"duplicateWithGap") {
        const auto requested = withDescendants(doc.clips, ids);
        const auto editable = editableUserTargets(doc, requested, false, false);
        const auto sources = selectedClips(doc.clips, editable);
        if (sources.empty()) {
            return raw;
        }
        double start = std::numeric_limits<double>::infinity();
        double end = -std::numeric_limits<double>::infinity();
        for (const auto &clip : sources) {
            start = std::min(start, clipStartMs(clip));
            end = std::max(end, clipEndMs(clip));
        }
        auto copies = cloneClips(sources);
        const double offset = name == u"duplicateWithGap" ? 1000 : p.value("offsetMs").toDouble();
        const double spanMs = end - start;
        for (auto &clip : copies) {
            clip.insert("startMs", clipStartMs(clip) + spanMs + offset);
        }
        doc.clips.insert(doc.clips.end(), copies.begin(), copies.end());
        return structure::withClips(std::move(raw), doc.clips);
    }
    if (name == u"altDragCopy") {
        const auto primaryId = p.value("clipId").toString();
        const auto primary =
            std::find_if(doc.clips.begin(), doc.clips.end(), [&](const auto &c) { return clipId(c) == primaryId; });
        if (primary == doc.clips.end() || !editableUserTargets(doc, {primaryId}, false, false).count(primaryId)) {
            return raw;
        }
        const bool multi = ids.count(primaryId) && ids.size() > 1;
        auto roots = withDescendants(doc.clips, multi ? ids : IdSet{primaryId});
        if (linked) {
            IdSet links;
            for (const auto &clip : doc.clips) {
                if (roots.count(clipId(clip)) && clip.contains("linkId")) {
                    links.insert(clipLinkId(clip));
                }
            }
            for (const auto &clip : doc.clips) {
                if (clip.contains("linkId") && links.count(clipLinkId(clip))) {
                    roots.insert(clipId(clip));
                }
            }
        }
        const auto copies = cloneClips(selectedClips(doc.clips, roots));
        doc.clips.insert(doc.clips.end(), copies.begin(), copies.end());
        raw = structure::withClips(std::move(raw), doc.clips);
        const auto move = nt::app::findEdit(multi ? "moveSelectedClips" : "moveClip");
        if (move) {
            raw = move(std::move(raw), p);
        }
        return settleDrop(std::move(raw), p, multi ? ids : IdSet{primaryId}, p.value("mode").toString("overlap"));
    }
    if (name == u"pasteClipAttributes" || name == u"pasteAttributes") {
        const auto source =
            p.contains("source") ? p.value("source").toObject() : firstClipboardClip().value_or(QJsonObject{});
        if (source.isEmpty()) {
            return raw;
        }
        const auto groups = structure::idSet(p.value("groups").toArray());
        const auto editable = editableUserTargets(doc, ids, false, false);
        for (auto &clip : doc.clips) {
            if (!editable.count(clipId(clip)) || clipId(clip) == clipId(source)) {
                continue;
            }
            const auto patch = attributePatch(source, clip, groups);
            for (auto it = patch.begin(); it != patch.end(); ++it) {
                clip.insert(it.key(), it.value());
            }
        }
        raw = structure::withClips(std::move(raw), doc.clips);
        // D3 supplies the store's retiming path. Keep the whole action in this registry call for one undo entry.
        if (groups.count("speed")) {
            const auto speedEdit = nt::app::findEdit("setClipSpeed");
            if (speedEdit) {
                for (const auto &id : selection) {
                    const auto current = structure::editDocument(raw);
                    const auto target = std::find_if(current.clips.begin(), current.clips.end(),
                                                     [&](const auto &c) { return clipId(c) == id; });
                    if (target != current.clips.end() && attributeGroupApplies("speed", *target)) {
                        raw = speedEdit(std::move(raw), {{"clipId", id}, {"speedMultiplier", sourceRate(source)}});
                    }
                }
            }
        }
        return raw;
    }
    if (name == u"closeGapAt") {
        const auto track = p.value("trackId").toString();
        const auto options = structure::rippleOptions(raw, p, doc, {track});
        return structure::withClips(std::move(raw), closeGap(doc.clips, track, p.value("timeMs").toDouble(), options));
    }
    return raw;
}
} // namespace nt::edit::clipboard
