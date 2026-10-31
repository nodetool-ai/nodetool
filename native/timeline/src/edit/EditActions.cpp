#include "edit/EditActions.h"

#include <QHash>

#include <algorithm>
#include <cmath>
#include <map>

namespace nt::edit {

namespace {

int indexOfId(const ClipList& clips, const QString& id) {
    for (size_t i = 0; i < clips.size(); ++i) {
        if (clipId(clips[i]) == id) return static_cast<int>(i);
    }
    return -1;
}

bool isGroupId(const EditDoc& doc, const QString& id) {
    const int i = indexOfId(doc.clips, id);
    return i >= 0 && isGroupClip(doc.clips[static_cast<size_t>(i)]);
}

// Group clips are not edit targets natively (moveGroup, trimGroup and ungroup
// are not ported); they still move with a ripple, as the web moves them.
IdSet withoutGroups(const EditDoc& doc, const IdSet& ids) {
    IdSet out;
    for (const QString& id : ids) {
        if (!isGroupId(doc, id)) out.insert(id);
    }
    return out;
}

bool isEditable(const EditDoc& doc, const QString& id, bool followLinks, bool includeGroupDescendants) {
    return editableUserTargets(doc, IdSet{id}, followLinks, includeGroupDescendants).count(id) > 0;
}

// Without sync-lock state, the frozen tracks are the locked ones (the store
// also exempts the edited tracks from sync lock, which then changes nothing).
IdSet rippleFrozenTrackIds(const EditDoc& doc) {
    return lockedTrackIds(doc);
}

RippleOptions lockOptions(const EditDoc& doc) {
    RippleOptions o;
    o.lockedTrackIds = rippleFrozenTrackIds(doc);
    o.lockedClipIds = lockedUserTargetIds(doc);
    return o;
}

// All-or-nothing trim of a clip and its linked siblings (trimClipStart/End).
ClipList trimLinked(const EditDoc& doc, const QString& id, const QString& edge, double deltaMs,
                    std::optional<double> maxSourceDurationMs, bool linked) {
    const int i = indexOfId(doc.clips, id);
    if (i < 0) return doc.clips;
    const QJsonObject clip = doc.clips[static_cast<size_t>(i)];
    if (isGroupClip(clip)) return doc.clips;
    const QString link = linked ? clipLinkId(clip) : QString();
    std::map<QString, QJsonObject> trimmed;
    try {
        trimmed[id] = trimClip(clip, edge, deltaMs, maxSourceDurationMs);
        if (!link.isEmpty()) {
            for (const auto& c : doc.clips) {
                if (clipId(c) != id && clipLinkId(c) == link) trimmed[clipId(c)] = trimClip(c, edge, deltaMs);
            }
        }
    } catch (const OpError&) {
        return doc.clips;
    }
    ClipList out;
    for (const auto& c : doc.clips) {
        auto it = trimmed.find(clipId(c));
        out.push_back(it != trimmed.end() ? it->second : c);
    }
    return out;
}

}  // namespace

IdSet lockedTrackIds(const EditDoc& doc) {
    IdSet out;
    for (const auto& t : doc.tracks) {
        if (t.locked) out.insert(t.id);
    }
    return out;
}

IdSet editableUserTargets(const EditDoc& doc, const IdSet& targetIds, bool followLinks, bool includeGroupDescendants) {
    QHash<QString, int> byId;
    QHash<QString, std::vector<int>> byLink;
    QHash<QString, std::vector<int>> childrenByParent;
    for (size_t i = 0; i < doc.clips.size(); ++i) {
        const auto& c = doc.clips[i];
        byId.insert(clipId(c), static_cast<int>(i));
        if (!clipLinkId(c).isEmpty()) byLink[clipLinkId(c)].push_back(static_cast<int>(i));
        const QString parent = c.value(u"parentId").toString();
        if (!parent.isEmpty()) childrenByParent[parent].push_back(static_cast<int>(i));
    }
    const IdSet locked = lockedTrackIds(doc);
    IdSet editable;
    for (const QString& targetId : targetIds) {
        if (!byId.contains(targetId)) continue;
        std::vector<int> pending{byId.value(targetId)};
        IdSet unit;
        bool blocked = false;
        while (!pending.empty()) {
            const int index = pending.back();
            pending.pop_back();
            const auto& c = doc.clips[static_cast<size_t>(index)];
            if (unit.count(clipId(c))) continue;
            unit.insert(clipId(c));
            if (c.value(u"locked").toBool(false) || locked.count(clipTrackId(c))) blocked = true;
            if (followLinks && !clipLinkId(c).isEmpty()) {
                for (int j : byLink.value(clipLinkId(c))) pending.push_back(j);
            }
            if (includeGroupDescendants && isGroupClip(c)) {
                for (int j : childrenByParent.value(clipId(c))) pending.push_back(j);
            }
        }
        if (!blocked) editable.insert(targetId);
    }
    return editable;
}

IdSet lockedUserTargetIds(const EditDoc& doc) {
    IdSet all;
    for (const auto& c : doc.clips) all.insert(clipId(c));
    const IdSet editable = editableUserTargets(doc, all, true, true);
    IdSet out;
    for (const QString& id : all) {
        if (!editable.count(id)) out.insert(id);
    }
    return out;
}

IdSet moveUnitIds(const ClipList& clips, const QStringList& rootIds, bool followLinks) {
    QHash<QString, int> byId;
    QHash<QString, std::vector<QString>> byLink;
    QHash<QString, std::vector<QString>> childrenByParent;
    for (size_t i = 0; i < clips.size(); ++i) {
        const auto& c = clips[i];
        byId.insert(clipId(c), static_cast<int>(i));
        if (!clipLinkId(c).isEmpty()) byLink[clipLinkId(c)].push_back(clipId(c));
        const QString parent = c.value(u"parentId").toString();
        if (!parent.isEmpty()) childrenByParent[parent].push_back(clipId(c));
    }
    IdSet found;
    std::vector<QString> pending(rootIds.begin(), rootIds.end());
    while (!pending.empty()) {
        const QString id = pending.back();
        pending.pop_back();
        if (!byId.contains(id) || found.count(id)) continue;
        found.insert(id);
        for (const QString& child : childrenByParent.value(id)) pending.push_back(child);
        const QString link = clipLinkId(clips[static_cast<size_t>(byId.value(id))]);
        if (followLinks && !link.isEmpty()) {
            for (const QString& l : byLink.value(link)) pending.push_back(l);
        }
    }
    return found;
}

double clampEndTrimDeltaToSource(const QJsonObject& clip, double deltaMs, std::optional<double> maxSourceDurationMs) {
    if (!maxSourceDurationMs || deltaMs <= 0) return deltaMs;
    const double rate = sourceRate(clip);
    const double inPointMs = clip.value(u"inPointMs").isDouble() ? clip.value(u"inPointMs").toDouble() : 0.0;
    const double currentOut = clip.value(u"outPointMs").isDouble() ? clip.value(u"outPointMs").toDouble()
                                                                     : inPointMs + clipDurationMs(clip) * rate;
    const double maxGrow = std::max(0.0, (*maxSourceDurationMs - currentOut) / rate);
    return std::min(deltaMs, maxGrow);
}

ClipList removeClipsLinkAware(const ClipList& clips, const IdSet& ids) {
    IdSet affectedLinkIds;
    for (const auto& c : clips) {
        if (ids.count(clipId(c)) && !clipLinkId(c).isEmpty()) affectedLinkIds.insert(clipLinkId(c));
    }
    ClipList next;
    for (const auto& c : clips) {
        if (!ids.count(clipId(c))) next.push_back(c);
    }
    if (!affectedLinkIds.empty()) {
        // A link group left with one member drops its linkId.
        std::map<QString, int> counts;
        std::map<QString, int> lastIndex;
        for (size_t j = 0; j < next.size(); ++j) {
            const QString link = clipLinkId(next[j]);
            if (link.isEmpty() || !affectedLinkIds.count(link)) continue;
            const int count = ++counts[link];
            if (count == 1) {
                lastIndex[link] = static_cast<int>(j);
            } else if (count == 2) {
                lastIndex.erase(link);
            }
        }
        for (const auto& [link, idx] : lastIndex) next[static_cast<size_t>(idx)].remove(QStringLiteral("linkId"));
    }
    return next;
}

ClipList splitClipsLinkAware(const ClipList& clips, double atMs, const QStringList& targetIds,
                             const IdSet& clipsWithMediaTracks) {
    const auto contains = [&](const QJsonObject& c) {
        return !isGroupClip(c) && atMs > clipStartMs(c) && atMs < clipEndMs(c);
    };
    IdSet toSplit;
    const IdSet targets(targetIds.begin(), targetIds.end());
    IdSet affectedLinkIds;
    for (const auto& c : clips) {
        if (targets.count(clipId(c)) && contains(c)) {
            toSplit.insert(clipId(c));
            if (!clipLinkId(c).isEmpty()) affectedLinkIds.insert(clipLinkId(c));
        }
    }
    for (const auto& c : clips) {
        if (!clipLinkId(c).isEmpty() && affectedLinkIds.count(clipLinkId(c)) && contains(c)) toSplit.insert(clipId(c));
    }
    if (toSplit.empty()) return clips;
    // A split clip that owns a media track would need its track resliced,
    // which is not ported: refuse the whole split rather than drift.
    for (const QString& id : toSplit) {
        if (clipsWithMediaTracks.count(id)) return clips;
    }
    // A link unit splits whole or not at all: a member the split refuses (a
    // time remap, an unported animation) keeps its whole unit unsplit, so the
    // halves never carry a link the other side lacks. (The web store splits
    // clip by clip here; see DESIGN.md D4 follow-ups.)
    IdSet refusedLinks;
    IdSet refused;
    for (const auto& c : clips) {
        if (!toSplit.count(clipId(c))) continue;
        try {
            splitClip(c, atMs);
        } catch (const OpError&) {
            refused.insert(clipId(c));
            if (!clipLinkId(c).isEmpty()) refusedLinks.insert(clipLinkId(c));
        }
    }
    for (const auto& c : clips) {
        if (refused.count(clipId(c)) || (!clipLinkId(c).isEmpty() && refusedLinks.count(clipLinkId(c)))) {
            toSplit.erase(clipId(c));
        }
    }
    if (toSplit.empty()) return clips;
    std::map<QString, QString> leftLinkByGroup;
    std::map<QString, QString> rightLinkByGroup;
    const auto groupLink = [](std::map<QString, QString>& map, const QString& source) {
        auto it = map.find(source);
        if (it == map.end()) it = map.emplace(source, newId()).first;
        return it->second;
    };
    ClipList next;
    for (const auto& c : clips) {
        if (!toSplit.count(clipId(c))) {
            next.push_back(c);
            continue;
        }
        try {
            auto [left, right] = splitClip(c, atMs);
            const QString link = clipLinkId(c);
            if (!link.isEmpty()) {
                left.insert(QStringLiteral("linkId"), groupLink(leftLinkByGroup, link));
                right.insert(QStringLiteral("linkId"), groupLink(rightLinkByGroup, link));
            } else {
                left.remove(QStringLiteral("linkId"));
                right.remove(QStringLiteral("linkId"));
            }
            next.push_back(left);
            next.push_back(right);
        } catch (const OpError&) {
            next.push_back(c);
        }
    }
    return next;
}

bool clipFitsTrack(const QString& mediaType, const QString& trackType) {
    if (mediaType == u"audio") return trackType == u"audio";
    if (mediaType == u"midi") return trackType == u"midi";
    if (trackType == u"midi") return false;
    return trackType == u"video" || trackType == u"overlay";
}

ClipList moveClip(const EditDoc& doc, const QString& id, double deltaMs, const QString& toTrackId, bool linked) {
    const int i = indexOfId(doc.clips, id);
    if (i < 0 || isGroupId(doc, id) || !isEditable(doc, id, linked, true)) return doc.clips;
    for (const auto& track : doc.tracks) {
        if (!toTrackId.isEmpty() && track.id == toTrackId && track.locked) { return doc.clips; }
    }
    const QJsonObject clip = doc.clips[static_cast<size_t>(i)];
    double newStartMs = std::max(0.0, clipStartMs(clip) + deltaMs);
    double appliedDelta = newStartMs - clipStartMs(clip);
    // The gesture snaps before it calls; the store's own snap is off here.
    if (!clipLinkId(clip).isEmpty() && linked) {
        const IdSet moving = moveUnitIds(doc.clips, {id}, linked);
        double minStartMs = clipStartMs(clip);
        for (const auto& c : doc.clips) {
            if (moving.count(clipId(c))) minStartMs = std::min(minStartMs, clipStartMs(c));
        }
        appliedDelta = std::max(appliedDelta, -minStartMs);
        newStartMs = clipStartMs(clip) + appliedDelta;
    }
    IdSet linkedIds;
    if (linked && !clipLinkId(clip).isEmpty()) {
        for (const auto& c : doc.clips) {
            if (clipLinkId(c) == clipLinkId(clip) && clipId(c) != id) linkedIds.insert(clipId(c));
        }
    }
    ClipList out;
    for (auto c : doc.clips) {
        if (clipId(c) == id) {
            c.insert(QStringLiteral("startMs"), newStartMs);
            if (!toTrackId.isEmpty()) c.insert(QStringLiteral("trackId"), toTrackId);
        } else if (linkedIds.count(clipId(c))) {
            c.insert(QStringLiteral("startMs"), std::max(0.0, clipStartMs(c) + appliedDelta));
        }
        out.push_back(c);
    }
    return out;
}

ClipList moveSelectedClips(const EditDoc& doc, const QString& primaryClipId, const QStringList& selectedIds,
                           double deltaMs, const QString& toTrackId, bool linked) {
    const IdSet editable =
        editableUserTargets(doc, withoutGroups(doc, IdSet(selectedIds.begin(), selectedIds.end())), linked, true);
    QString effectivePrimary;
    if (editable.count(primaryClipId)) {
        effectivePrimary = primaryClipId;
    } else if (toTrackId.isEmpty()) {
        // The first editable id in selection order (a JavaScript Set keeps it).
        for (const QString& id : selectedIds) {
            if (editable.count(id)) {
                effectivePrimary = id;
                break;
            }
        }
    }
    const int pi = indexOfId(doc.clips, effectivePrimary);
    if (pi < 0) return doc.clips;
    if (!toTrackId.isEmpty()) {
        for (const auto& t : doc.tracks) {
            if (t.id == toTrackId && t.locked) return doc.clips;
        }
    }
    QStringList roots;
    for (const QString& id : selectedIds) {
        if (editable.count(id)) roots.append(id);
    }
    const IdSet moving = moveUnitIds(doc.clips, roots, linked);
    double minStartMs = clipStartMs(doc.clips[static_cast<size_t>(pi)]);
    for (const auto& c : doc.clips) {
        if (moving.count(clipId(c))) minStartMs = std::min(minStartMs, clipStartMs(c));
    }
    const double effectiveDelta = std::max(deltaMs, -minStartMs);
    ClipList out;
    for (auto c : doc.clips) {
        if (moving.count(clipId(c))) {
            c.insert(QStringLiteral("startMs"), clipStartMs(c) + effectiveDelta);
            if (clipId(c) == effectivePrimary && !toTrackId.isEmpty()) c.insert(QStringLiteral("trackId"), toTrackId);
        }
        out.push_back(c);
    }
    return out;
}

ClipList trimClipStart(const EditDoc& doc, const QString& id, double deltaMs, bool linked) {
    if (!isEditable(doc, id, linked, true)) return doc.clips;
    return trimLinked(doc, id, QStringLiteral("start"), deltaMs, std::nullopt, linked);
}

ClipList trimClipEnd(const EditDoc& doc, const QString& id, double deltaMs, std::optional<double> maxSourceDurationMs,
                     bool linked) {
    const int i = indexOfId(doc.clips, id);
    if (i < 0 || !isEditable(doc, id, linked, true)) return doc.clips;
    const double clamped = clampEndTrimDeltaToSource(doc.clips[static_cast<size_t>(i)], deltaMs, maxSourceDurationMs);
    return trimLinked(doc, id, QStringLiteral("end"), clamped, maxSourceDurationMs, linked);
}

ClipList rippleTrimClipStart(const EditDoc& doc, const QString& id, double deltaMs, bool linked) {
    if (isGroupId(doc, id) || !isEditable(doc, id, linked, true)) return doc.clips;
    RippleOptions o = lockOptions(doc);
    o.followLinks = linked;
    try {
        return rippleTrim(doc.clips, id, QStringLiteral("start"), deltaMs, o);
    } catch (const OpError&) {
        return doc.clips;
    }
}

ClipList rippleTrimClipEnd(const EditDoc& doc, const QString& id, double deltaMs,
                           std::optional<double> maxSourceDurationMs, bool linked) {
    const int i = indexOfId(doc.clips, id);
    if (i < 0 || isGroupId(doc, id) || !isEditable(doc, id, linked, true)) return doc.clips;
    RippleOptions o = lockOptions(doc);
    o.followLinks = linked;
    try {
        return rippleTrim(doc.clips, id, QStringLiteral("end"),
                          clampEndTrimDeltaToSource(doc.clips[static_cast<size_t>(i)], deltaMs, maxSourceDurationMs), o,
                          maxSourceDurationMs);
    } catch (const OpError&) {
        return doc.clips;
    }
}

ClipList rollClipEdge(const EditDoc& doc, const QString& id, const QString& edge, double deltaMs,
                      std::optional<double> sourceDurationMs, bool linked) {
    try {
        const int i = indexOfId(doc.clips, id);
        if (i < 0) return doc.clips;
        const QJsonObject clip = doc.clips[static_cast<size_t>(i)];
        const int n = findRollNeighbour(doc.clips, clip, edge);
        if (n < 0) return doc.clips;
        const QJsonObject neighbour = doc.clips[static_cast<size_t>(n)];
        if (isGroupClip(clip) || isGroupClip(neighbour)) return doc.clips;
        const IdSet editable = editableUserTargets(doc, IdSet{clipId(clip), clipId(neighbour)}, linked, false);
        if (!editable.count(clipId(clip)) || !editable.count(clipId(neighbour))) return doc.clips;
        const double delta = clampEndTrimDeltaToSource(edge == u"end" ? clip : neighbour, deltaMs, sourceDurationMs);
        return rollEdit(doc.clips, id, edge, delta, linked);
    } catch (const OpError&) {
        return doc.clips;
    }
}

ClipList deleteSelected(const EditDoc& doc, const IdSet& selectedIds) {
    const IdSet editable = editableUserTargets(doc, withoutGroups(doc, selectedIds), true, true);
    if (editable.empty()) return doc.clips;
    return removeClipsLinkAware(doc.clips, editable);
}

ClipList rippleDeleteSelected(const EditDoc& doc, const IdSet& selectedIds) {
    const IdSet editable = editableUserTargets(doc, withoutGroups(doc, selectedIds), true, true);
    ClipList removed;
    for (const auto& c : doc.clips) {
        if (editable.count(clipId(c))) removed.push_back(c);
    }
    if (removed.empty()) return doc.clips;
    ClipList combined = removed;
    for (const auto& c : removeClipsLinkAware(doc.clips, editable)) combined.push_back(c);
    return rippleDelete(combined, editable, lockOptions(doc));
}

ClipList splitClipAtTime(const EditDoc& doc, const QString& id, double atMs) {
    if (!isEditable(doc, id, true, false)) return doc.clips;
    return splitClipsLinkAware(doc.clips, atMs, {id}, doc.clipsWithMediaTracks);
}

SplitResult splitSelectedAtPlayhead(const EditDoc& doc, double timeMs, const QStringList& selectedIds) {
    const IdSet selected(selectedIds.begin(), selectedIds.end());
    const IdSet locked = lockedTrackIds(doc);
    // Requested targets in document order; with nothing selected, every clip
    // on a targeted (here: unlocked) track.
    QStringList requested;
    for (const auto& c : doc.clips) {
        const bool wanted = !selected.empty() ? selected.count(clipId(c)) > 0 : !locked.count(clipTrackId(c));
        if (wanted && timeMs > clipStartMs(c) && timeMs < clipEndMs(c)) requested.append(clipId(c));
    }
    const IdSet targets = editableUserTargets(doc, IdSet(requested.begin(), requested.end()), true, false);
    QStringList targetList;
    for (const QString& id : requested) {
        if (targets.count(id)) targetList.append(id);
    }
    SplitResult result;
    result.clips = splitClipsLinkAware(doc.clips, timeMs, targetList, doc.clipsWithMediaTracks);
    IdSet oldIds;
    IdSet targetTracks;
    for (const auto& c : doc.clips) {
        oldIds.insert(clipId(c));
        if (targets.count(clipId(c))) targetTracks.insert(clipTrackId(c));
    }
    for (const auto& c : result.clips) {
        if (!oldIds.count(clipId(c)) && targetTracks.count(clipTrackId(c)) && clipStartMs(c) == timeMs) {
            result.rightHalfIds.append(clipId(c));
        }
    }
    return result;
}

ClipList resolveDropAction(const EditDoc& doc, const IdSet& movedIds, const QString& mode) {
    if (mode == u"overlap") return doc.clips;
    const IdSet lockedClips = lockedUserTargetIds(doc);
    IdSet moved;
    for (const QString& id : movedIds) {
        if (!lockedClips.count(id)) moved.insert(id);
    }
    if (moved.empty()) return doc.clips;
    RippleOptions o;
    o.lockedTrackIds = rippleFrozenTrackIds(doc);
    o.lockedClipIds = lockedClips;
    ClipList out = resolveDrop(doc.clips, moved, mode, o);
    // A drop that would split or remove a clip owning a media track leaves
    // `mediaTracks[].clipId` dangling: keep it an overlap instead. (The web
    // has the same gap; see DESIGN.md D4 follow-ups.)
    if (!doc.clipsWithMediaTracks.empty()) {
        IdSet ids;
        for (const auto& c : out) ids.insert(clipId(c));
        for (const auto& c : doc.clips) {
            if (doc.clipsWithMediaTracks.count(clipId(c)) && !ids.count(clipId(c))) return doc.clips;
        }
    }
    return out;
}

double frameStepMs(double ms, double frames, double fps) {
    const double frameMs = 1000.0 / std::max(1.0, fps);
    // Math.round: halves toward +infinity.
    const auto jsRound = [](double x) { return std::floor(x + 0.5); };
    return jsRound(jsRound(ms / frameMs + frames) * frameMs);
}

ClipList rateStretchClip(const EditDoc& doc, const QString& id, const QString& edge, double durationMs, bool linked) {
    const int i = indexOfId(doc.clips, id);
    if (i < 0 || !isEditable(doc, id, linked, false)) return doc.clips;
    const QJsonObject& clip = doc.clips[static_cast<size_t>(i)];
    IdSet memberIds{id};
    if (linked && clip.value(u"linkId").isString()) {
        const QString linkId = clip.value(u"linkId").toString();
        for (const auto& c : doc.clips) {
            if (c.value(u"linkId").isString() && c.value(u"linkId").toString() == linkId) memberIds.insert(clipId(c));
        }
    }
    return rateStretchClips(doc.clips, memberIds, id, edge, durationMs);
}

ClipList slideClip(const EditDoc& doc, const QString& id, double deltaMs, bool linked,
                   const SourceDurationFor& sourceDurationMsFor) {
    const int i = indexOfId(doc.clips, id);
    if (i < 0) return doc.clips;
    const QJsonObject& clip = doc.clips[static_cast<size_t>(i)];
    IdSet memberIds{id};
    if (linked && clip.value(u"linkId").isString()) {
        const QString linkId = clip.value(u"linkId").toString();
        for (const auto& c : doc.clips) {
            if (c.value(u"linkId").isString() && c.value(u"linkId").toString() == linkId) memberIds.insert(clipId(c));
        }
    }
    ClipList clips;
    try {
        clips = slideClips(doc.clips, memberIds, deltaMs, sourceDurationMsFor);
    } catch (const OpError&) {
        return doc.clips;
    }
    IdSet touched;
    for (size_t k = 0; k < clips.size(); ++k) {
        if (clips[k] != doc.clips[k]) touched.insert(clipId(clips[k]));
    }
    if (touched.empty()) return doc.clips;
    const IdSet editable = editableUserTargets(doc, touched, false, false);
    for (const auto& id : touched) {
        if (!editable.count(id)) return doc.clips;
    }
    return clips;
}

std::optional<std::vector<ClipPatch>> planSlip(const EditDoc& doc, const QJsonObject& clip, double sourceDeltaMs,
                                               std::optional<double> sourceDurationMs, bool linked) {
    const auto isAv = [](const QJsonObject& c) {
        const QString t = c.value(u"mediaType").toString();
        return t == u"video" || t == u"audio";
    };
    if (!isAv(clip)) return std::nullopt;
    const IdSet lockedTracks = lockedTrackIds(doc);
    ClipList members;
    if (linked && clip.value(u"linkId").isString()) {
        const QString linkId = clip.value(u"linkId").toString();
        for (const auto& c : doc.clips) {
            if (c.value(u"linkId").isString() && c.value(u"linkId").toString() == linkId) members.push_back(c);
        }
    } else {
        members.push_back(clip);
    }
    for (const auto& c : members) {
        const QJsonValue remap = c.value(u"timeRemap");
        if (c.value(u"locked").toBool(false) || lockedTracks.count(clipTrackId(c)) ||
            !(remap.isUndefined() || remap.isNull()) || !isAv(c)) {
            return std::nullopt;
        }
    }
    const QJsonObject wantedPatch = slipSourceWindow(clip, sourceDeltaMs, sourceDurationMs);
    const double inAtStart = clip.value(u"inPointMs").toDouble(0);
    const double appliedTimelineMs = (wantedPatch.value(u"inPointMs").toDouble(0) - inAtStart) / sourceRate(clip);
    std::vector<ClipPatch> patches;
    for (const auto& c : members) {
        QJsonObject patch = clipId(c) == clipId(clip)
                                ? wantedPatch
                                : slipSourceWindow(c, appliedTimelineMs * sourceRate(c), std::nullopt);
        if (c.value(u"caption").isObject()) {
            patch.insert(QStringLiteral("caption"), retimeCaption(c.value(u"caption").toObject(), -appliedTimelineMs));
        }
        const double wantedIn = c.value(u"inPointMs").toDouble(0) + appliedTimelineMs * sourceRate(c);
        if (std::abs(patch.value(u"inPointMs").toDouble(0) - wantedIn) > 1e-6) return std::nullopt;
        patches.push_back({clipId(c), patch});
    }
    return patches;
}

ClipList applyPatches(const ClipList& clips, const std::vector<ClipPatch>& patches) {
    ClipList out = clips;
    for (const auto& p : patches) {
        for (auto& c : out) {
            if (clipId(c) != p.id) continue;
            for (auto it = p.patch.begin(); it != p.patch.end(); ++it) c.insert(it.key(), it.value());
        }
    }
    return out;
}

}  // namespace nt::edit
