#include "edit/groups/GroupOps.h"
#include "edit/clipboard/ClipboardOps.h"
#include "edit/clipboard/RawDocument.h"
#include <QHash>
#include <algorithm>
#include <limits>

namespace nt::edit::groups {
namespace {
ClipList removeReleasingGroups(const ClipList &clips, const IdSet &ids) {
    IdSet parents;
    for (const auto &clip : clips) {
        if (ids.count(clipId(clip)) && isGroupClip(clip)) {
            parents.insert(clipId(clip));
        }
    }
    auto remaining = clips;
    for (auto &clip : remaining) {
        if (parents.count(clip.value("parentId").toString())) {
            clip.remove("parentId");
        }
    }
    return removeClipsLinkAware(remaining, ids);
}
QJsonObject clampToWindow(const QJsonObject &clip, double startMs, double endMs) {
    auto next = clip;
    try {
        if (clipStartMs(next) < startMs) {
            next = trimClip(next, "start", clipStartMs(next) - startMs);
        }
        const double overhang = clipEndMs(next) - endMs;
        if (overhang > 0) {
            next = trimClip(next, "end", -overhang);
        }
        return next;
    } catch (const OpError &) {
        // The web keeps a child that the new window cannot hold at all.
        return clip;
    }
}
} // namespace
ClipList moveGroup(const ClipList &clips, const QString &groupId, double deltaMs, bool followLinks) {
    if (deltaMs == 0) {
        return clips;
    }
    const auto moving = moveUnitIds(clips, {groupId}, followLinks);
    auto next = clips;
    for (auto &clip : next) {
        if (moving.count(clipId(clip))) {
            clip.insert("startMs", std::max(0.0, clipStartMs(clip) + deltaMs));
        }
    }
    return next;
}
ClipList ungroup(const ClipList &clips, const QString &groupId) {
    auto next = clips;
    for (auto &clip : next) {
        if (clip.value("parentId").toString() == groupId) {
            clip.remove("parentId");
        }
    }
    return next;
}
ClipList trimGroup(const ClipList &clips, const QString &groupId, const QString &edge, double deltaMs) {
    const auto group = std::find_if(clips.begin(), clips.end(), [&](const auto &c) { return clipId(c) == groupId; });
    if (group == clips.end()) {
        return clips;
    }
    const auto trimmed = trimClip(*group, edge, deltaMs);
    const auto descendants = groupDescendantIds(clips, groupId);
    auto next = clips;
    for (auto &clip : next) {
        if (clipId(clip) == groupId) {
            clip = trimmed;
        } else if (descendants.count(clipId(clip))) {
            clip = clampToWindow(clip, clipStartMs(trimmed), clipEndMs(trimmed));
        }
    }
    return next;
}
std::optional<Gap> childSpanMs(const ClipList &clips, const QString &groupId) {
    const auto descendants = groupDescendantIds(clips, groupId);
    double start = std::numeric_limits<double>::infinity();
    double end = -std::numeric_limits<double>::infinity();
    for (const auto &clip : clips) {
        if (!descendants.count(clipId(clip))) {
            continue;
        }
        start = std::min(start, clipStartMs(clip));
        end = std::max(end, clipEndMs(clip));
    }
    return end > start ? std::optional<Gap>({start, end}) : std::nullopt;
}
QJsonObject applyGroupEdit(const QString &name, QJsonObject raw, const QJsonObject &p) {
    auto doc = structure::editDocument(raw);
    const auto id = p.value("clipId").toString();
    const auto selected = structure::selectedIds(p);
    const IdSet selectedSet(selected.begin(), selected.end());
    const bool linked = p.value("linked").toBool(true);
    const double delta = p.value("deltaMs").toDouble();
    const auto toTrack = p.value("toTrackId").toString();
    const auto duration = p.value("maxSourceDurationMs");
    const auto maximum = duration.isDouble() ? std::optional<double>(duration.toDouble()) : std::nullopt;
    const auto primary =
        std::find_if(doc.clips.begin(), doc.clips.end(), [&](const auto &c) { return clipId(c) == id; });
    const bool primaryGroup = primary != doc.clips.end() && isGroupClip(*primary);
    const bool selectedGroup = std::any_of(doc.clips.begin(), doc.clips.end(), [&](const auto &c) {
        return selectedSet.count(clipId(c)) && isGroupClip(c);
    });

    if (name == u"groupClips") {
        const auto editable = editableUserTargets(doc, selectedSet, linked, true);
        ClipList members;
        double start = std::numeric_limits<double>::infinity();
        double end = -std::numeric_limits<double>::infinity();
        for (const auto &c : doc.clips) {
            if (!editable.count(clipId(c))) {
                continue;
            }
            members.push_back(c);
            start = std::min(start, clipStartMs(c));
            end = std::max(end, clipEndMs(c));
        }
        if (members.size() < 2) {
            return raw;
        }
        QHash<QString, size_t> trackOrder;
        for (size_t i = 0; i < doc.tracks.size(); ++i) {
            trackOrder.insert(doc.tracks[i].id, i);
        }
        const auto top = std::min_element(members.begin(), members.end(), [&](const auto &a, const auto &b) {
            return trackOrder.value(clipTrackId(a), std::numeric_limits<size_t>::max()) <
                   trackOrder.value(clipTrackId(b), std::numeric_limits<size_t>::max());
        });
        const auto group = clipboard::makeClip({{"trackId", clipTrackId(*top)},
                                                {"name", "Group"},
                                                {"mediaType", "group"},
                                                {"sourceType", "imported"},
                                                {"status", "generated"},
                                                {"startMs", start},
                                                {"durationMs", std::max(1.0, end - start)}});
        for (auto &c : doc.clips) {
            if (editable.count(clipId(c))) {
                c.insert("parentId", clipId(group));
            }
        }
        doc.clips.push_back(group);
        return structure::withClips(std::move(raw), doc.clips);
    }
    if (name == u"ungroupClips") {
        QStringList groupIds;
        for (const auto &c : doc.clips) {
            if (selectedSet.count(clipId(c)) && isGroupClip(c)) {
                groupIds.append(clipId(c));
            }
        }
        for (const auto &groupId : groupIds) {
            if (editableUserTargets(doc, {groupId}, true, true).count(groupId)) {
                doc.clips = removeReleasingGroups(doc.clips, {groupId});
            }
        }
        return structure::withClips(std::move(raw), doc.clips);
    }
    if (name == u"moveClip") {
        if (!primaryGroup) {
            return structure::withClips(std::move(raw), nt::edit::moveClip(doc, id, delta, toTrack, linked));
        }
        if (!editableUserTargets(doc, {id}, linked, true).count(id)) {
            return raw;
        }
        const auto moving = moveUnitIds(doc.clips, {id}, linked);
        double minStart = clipStartMs(*primary);
        for (const auto &c : doc.clips) {
            if (moving.count(clipId(c))) {
                minStart = std::min(minStart, clipStartMs(c));
            }
        }
        const double applied =
            std::max(std::max(0.0, clipStartMs(*primary) + delta) - clipStartMs(*primary), -minStart);
        auto next = moveGroup(doc.clips, id, applied, linked);
        if (!toTrack.isEmpty()) {
            for (auto &c : next) {
                if (clipId(c) == id) {
                    c.insert("trackId", toTrack);
                }
            }
        }
        return structure::withClips(std::move(raw), next);
    }
    if (name == u"moveSelectedClips" || name == u"nudge") {
        double wanted = delta;
        if (name == u"nudge" && p.contains("frames")) {
            if (primary == doc.clips.end()) {
                return raw;
            }
            wanted = frameStepMs(clipStartMs(*primary), p.value("frames").toDouble(), raw.value("fps").toDouble(30)) -
                     clipStartMs(*primary);
        }
        const auto targetTrack = name == u"nudge" ? QString() : toTrack;
        if (!selectedGroup) {
            return structure::withClips(std::move(raw),
                                        nt::edit::moveSelectedClips(doc, id, selected, wanted, targetTrack, linked));
        }
        const auto editable = editableUserTargets(doc, selectedSet, linked, true);
        QString effective;
        if (editable.count(id)) {
            effective = id;
        } else if (targetTrack.isEmpty()) {
            for (const auto &root : selected) {
                if (editable.count(root)) {
                    effective = root;
                    break;
                }
            }
        }
        const auto effectiveClip =
            std::find_if(doc.clips.begin(), doc.clips.end(), [&](const auto &c) { return clipId(c) == effective; });
        if (effectiveClip == doc.clips.end()) {
            return raw;
        }
        for (const auto &t : doc.tracks) {
            if (!targetTrack.isEmpty() && t.id == targetTrack && t.locked) {
                return raw;
            }
        }
        QStringList roots;
        for (const auto &root : selected) {
            if (editable.count(root)) {
                roots.append(root);
            }
        }
        const auto moving = moveUnitIds(doc.clips, roots, linked);
        double minStart = clipStartMs(*effectiveClip);
        for (const auto &c : doc.clips) {
            if (moving.count(clipId(c))) {
                minStart = std::min(minStart, clipStartMs(c));
            }
        }
        const double applied = std::max(wanted, -minStart);
        for (auto &c : doc.clips) {
            if (!moving.count(clipId(c))) {
                continue;
            }
            c.insert("startMs", clipStartMs(c) + applied);
            if (clipId(c) == effective && !targetTrack.isEmpty()) {
                c.insert("trackId", targetTrack);
            }
        }
        return structure::withClips(std::move(raw), doc.clips);
    }
    if (name == u"trimClipStart" || name == u"trimClipEnd") {
        const bool start = name == u"trimClipStart";
        if (!primaryGroup) {
            return structure::withClips(std::move(raw), start ? nt::edit::trimClipStart(doc, id, delta, linked)
                                                              : nt::edit::trimClipEnd(doc, id, delta, maximum, linked));
        }
        if (!editableUserTargets(doc, {id}, linked, true).count(id)) {
            return raw;
        }
        try {
            const auto next = trimGroup(doc.clips, id, start ? "start" : "end",
                                        start ? delta : clampEndTrimDeltaToSource(*primary, delta, maximum));
            return structure::withClips(std::move(raw), next);
        } catch (const OpError &) {
            return raw;
        }
    }
    if (name == u"rippleTrimClipStart" || name == u"rippleTrimClipEnd") {
        const bool start = name == u"rippleTrimClipStart";
        if (!primaryGroup) {
            return structure::withClips(std::move(raw),
                                        start ? nt::edit::rippleTrimClipStart(doc, id, delta, linked)
                                              : nt::edit::rippleTrimClipEnd(doc, id, delta, maximum, linked));
        }
        if (!editableUserTargets(doc, {id}, linked, true).count(id)) {
            return raw;
        }
        IdSet editedTracks;
        for (const auto &c : doc.clips) {
            if (clipId(c) == id ||
                (linked && !clipLinkId(*primary).isEmpty() && clipLinkId(c) == clipLinkId(*primary))) {
                editedTracks.insert(clipTrackId(c));
            }
        }
        const auto options = structure::rippleOptions(raw, p, doc, editedTracks);
        try {
            const auto next =
                rippleTrim(doc.clips, id, start ? "start" : "end",
                           start ? delta : clampEndTrimDeltaToSource(*primary, delta, maximum), options, maximum);
            return structure::withClips(std::move(raw), next);
        } catch (const OpError &) {
            return raw;
        }
    }
    if (name == u"rollClipEdge") {
        const auto edge = p.value("edge").toString();
        if (primary == doc.clips.end()) {
            return raw;
        }
        const auto neighbourIndex = findRollNeighbour(doc.clips, *primary, edge);
        if (neighbourIndex < 0) {
            return raw;
        }
        const auto &neighbour = doc.clips[static_cast<size_t>(neighbourIndex)];
        if (!primaryGroup && !isGroupClip(neighbour)) {
            return structure::withClips(std::move(raw), nt::edit::rollClipEdge(doc, id, edge, delta, maximum, linked));
        }
        const auto editable = editableUserTargets(doc, {id, clipId(neighbour)}, linked, false);
        if (!editable.count(id) || !editable.count(clipId(neighbour))) {
            return raw;
        }
        try {
            const auto applied = clampEndTrimDeltaToSource(edge == u"end" ? *primary : neighbour, delta, maximum);
            return structure::withClips(std::move(raw), rollEdit(doc.clips, id, edge, applied, linked));
        } catch (const OpError &) {
            return raw;
        }
    }
    if (name == u"deleteSelected" || name == u"rippleDeleteSelected") {
        const bool ripple = name == u"rippleDeleteSelected";
        if (!selectedGroup) {
            return structure::withClips(std::move(raw), ripple ? nt::edit::rippleDeleteSelected(doc, selectedSet)
                                                               : nt::edit::deleteSelected(doc, selectedSet));
        }
        const auto editable = editableUserTargets(doc, selectedSet, true, true);
        if (editable.empty()) {
            return raw;
        }
        const auto survivors = removeReleasingGroups(doc.clips, editable);
        if (!ripple) {
            return structure::withClips(std::move(raw), survivors);
        }
        ClipList removed;
        IdSet editedTracks;
        for (const auto &c : doc.clips) {
            if (editable.count(clipId(c))) {
                removed.push_back(c);
                editedTracks.insert(clipTrackId(c));
            }
        }
        const auto options = structure::rippleOptions(raw, p, doc, editedTracks);
        removed.insert(removed.end(), survivors.begin(), survivors.end());
        return structure::withClips(std::move(raw), rippleDelete(removed, editable, options));
    }
    return raw;
}
} // namespace nt::edit::groups
