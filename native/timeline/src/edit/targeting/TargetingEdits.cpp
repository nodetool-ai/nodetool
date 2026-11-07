#include "TargetingEdits.h"
#include "RangeSplit.h"
#include <algorithm>

namespace nt::targeting {
using namespace nt::edit;
namespace {
IdSet tracksOf(const ClipList& clips, const IdSet& ids) {
    IdSet tracks;
    for (const auto& c : clips) {
        if (ids.contains(clipId(c))) { tracks.insert(clipTrackId(c)); }
    }
    return tracks;
}
IdSet linkedTrackIds(const ClipList& clips, const QString& id, bool linked) {
    const auto clip = std::find_if(clips.begin(), clips.end(), [&](const auto& c) { return clipId(c) == id; });
    if (clip == clips.end()) { return {}; }
    IdSet tracks;
    for (const auto& c : clips) {
        if (clipId(c) == id || (linked && !clipLinkId(*clip).isEmpty() && clipLinkId(c) == clipLinkId(*clip))) {
            tracks.insert(clipTrackId(c));
        }
    }
    return tracks;
}
RippleOptions options(const EditDoc& doc, const TargetingState& state, const IdSet& edited, bool linked = true) {
    return {rippleFrozenTrackIds(doc, state, edited), lockedUserTargetIds(doc), linked};
}
ClipList rippleTrimAction(const EditDoc& doc, const TargetingState& state, const QString& id,
                          const QString& edge, double deltaMs, std::optional<double> maximum, bool linked) {
    const auto clip = std::find_if(doc.clips.begin(), doc.clips.end(), [&](const auto& c) { return clipId(c) == id; });
    if (clip == doc.clips.end() || !editableUserTargets(doc, {id}, linked, true).contains(id)) { return doc.clips; }
    if (edge == u"end") { deltaMs = clampEndTrimDeltaToSource(*clip, deltaMs, maximum); }
    try {
        return rippleTrim(doc.clips, id, edge, deltaMs,
                          options(doc, state, linkedTrackIds(doc.clips, id, linked), linked), maximum);
    } catch (const OpError&) {
        return doc.clips;
    }
}
}
IdSet targetedTrackIds(const EditDoc& doc, const TargetingState& state) {
    IdSet result;
    for (const auto& t : doc.tracks) {
        if (!t.locked && !state.untargetedTrackIds.contains(t.id)) { result.insert(t.id); }
    }
    return result;
}
IdSet rippleFrozenTrackIds(const EditDoc& doc, const TargetingState& state, const IdSet& editedTrackIds) {
    IdSet result;
    for (const auto& t : doc.tracks) {
        if (t.locked || (state.syncLockOffTrackIds.contains(t.id) && !editedTrackIds.contains(t.id))) {
            result.insert(t.id);
        }
    }
    return result;
}
ClipList rippleTrimClipStart(const EditDoc& doc, const TargetingState& state, const QString& id, double deltaMs, bool linked) {
    return rippleTrimAction(doc, state, id, "start", deltaMs, std::nullopt, linked);
}
ClipList rippleTrimClipEnd(const EditDoc& doc, const TargetingState& state, const QString& id, double deltaMs,
                          std::optional<double> maximum, bool linked) {
    return rippleTrimAction(doc, state, id, "end", deltaMs, maximum, linked);
}
ClipList rippleDeleteSelected(const EditDoc& doc, const TargetingState& state, const IdSet& selectedIds) {
    const auto editable = editableUserTargets(doc, selectedIds, true, true);
    ClipList removed;
    IdSet removedGroups;
    for (const auto& c : doc.clips) {
        if (editable.contains(clipId(c))) {
            removed.push_back(c);
            if (isGroupClip(c)) { removedGroups.insert(clipId(c)); }
        }
    }
    if (removed.empty()) { return doc.clips; }
    auto released = doc.clips;
    for (auto& c : released) {
        if (removedGroups.contains(c.value("parentId").toString())) { c.remove("parentId"); }
    }
    auto combined = removed;
    const auto survivors = removeClipsLinkAware(released, editable);
    combined.insert(combined.end(), survivors.begin(), survivors.end());
    return rippleDelete(combined, editable, options(doc, state, tracksOf(removed, editable)));
}
ClipList resolveDropAction(const EditDoc& doc, const TargetingState& state, const IdSet& movedIds, const QString& mode) {
    if (mode == u"overlap") { return doc.clips; }
    const auto locked = lockedUserTargetIds(doc);
    IdSet moved;
    for (const auto& id : movedIds) {
        if (!locked.contains(id)) { moved.insert(id); }
    }
    if (moved.empty()) { return doc.clips; }
    const auto result = resolveDrop(doc.clips, moved, mode,
                                    {rippleFrozenTrackIds(doc, state, tracksOf(doc.clips, moved)), locked, true});
    IdSet surviving;
    for (const auto& c : result) { surviving.insert(clipId(c)); }
    for (const auto& c : doc.clips) {
        if (doc.clipsWithMediaTracks.contains(clipId(c)) && !surviving.contains(clipId(c))) { return doc.clips; }
    }
    return result;
}
RangeResult removeRange(const EditDoc& doc, const QJsonArray& mediaTracks, const TargetingState& state,
                        double startMs, double endMs, bool ripple) {
    if (!(endMs > startMs)) { return {doc.clips, mediaTracks}; }
    const auto targeted = targetedTrackIds(doc, state);
    RangeResult cut{doc.clips, mediaTracks};
    for (const double atMs : {startMs, endMs}) {
        IdSet across;
        for (const auto& c : cut.clips) {
            if (targeted.contains(clipTrackId(c)) && atMs > clipStartMs(c) && atMs < clipEndMs(c)) {
                across.insert(clipId(c));
            }
        }
        auto cutDoc = doc;
        cutDoc.clips = cut.clips;
        cut = splitRangeClips(cut.clips, cut.mediaTracks, atMs, editableUserTargets(cutDoc, across, true, false));
    }
    IdSet inside;
    for (const auto& c : cut.clips) {
        if (targeted.contains(clipTrackId(c)) && !isGroupClip(c) && clipStartMs(c) >= startMs && clipEndMs(c) <= endMs) {
            inside.insert(clipId(c));
        }
    }
    auto cutDoc = doc;
    cutDoc.clips = cut.clips;
    const auto removeIds = editableUserTargets(cutDoc, inside, true, false);
    if (removeIds.empty() && !ripple) { return {doc.clips, mediaTracks}; }
    auto clips = removeClipsLinkAware(cut.clips, removeIds);
    if (ripple) {
        cutDoc.clips = clips;
        auto shifted = planShift(clips, endMs, startMs - endMs, {}, options(cutDoc, state, targeted));
        if (shifted) { clips = std::move(*shifted); }
    }
    if (clips == doc.clips) { return {doc.clips, mediaTracks}; }
    return {std::move(clips), cut.mediaTracks};
}
ClipList closeGapAt(const EditDoc& doc, const TargetingState& state, const QString& trackId, double timeMs) {
    return closeGap(doc.clips, trackId, timeMs, options(doc, state, {trackId}));
}
}
