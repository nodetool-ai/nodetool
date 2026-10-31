#pragma once

// The editor's clip actions: the TimelineStore.ts wrappers that a gesture or
// a key calls (moveClip, moveSelectedClips, the trims, the roll, deletes,
// splits, resolveDrop), over the operations of ClipOps.h. They copy the
// store's lock and link rules (`editableUserTargets`, `lockedUserTargetIds`,
// `rippleFrozenTrackIds`) and, like the store, return the clips unchanged
// when an edit is refused.
//
// Not modelled natively, so refused or treated as the web treats a document
// without them: a group clip is never the target of a move, trim, roll or
// delete (moveGroup, trimGroup and ungroup are not ported), but it moves with
// a ripple together with its children, as on the web; sync-lock-off and
// untargeted tracks (every unlocked track is targeted and sync-locked); media
// tracks (a split or a drop that would split or remove a clip owning one is
// refused, so `mediaTracks[].clipId` never dangles). A link unit splits whole
// or not at all.

#include "edit/ClipOps.h"

#include <QStringList>

#include <optional>
#include <vector>

namespace nt::edit {

struct TrackInfo {
    QString id;
    QString type;
    bool locked = false;
};

struct EditDoc {
    ClipList clips;
    std::vector<TrackInfo> tracks;
    // Clips that own a media track (`mediaTracks[].clipId`).
    IdSet clipsWithMediaTracks;
};

// TimelineStore.ts helpers.
IdSet lockedTrackIds(const EditDoc& doc);
IdSet editableUserTargets(const EditDoc& doc, const IdSet& targetIds, bool followLinks, bool includeGroupDescendants);
IdSet lockedUserTargetIds(const EditDoc& doc);
IdSet moveUnitIds(const ClipList& clips, const QStringList& rootIds, bool followLinks);
double clampEndTrimDeltaToSource(const QJsonObject& clip, double deltaMs, std::optional<double> maxSourceDurationMs);
ClipList removeClipsLinkAware(const ClipList& clips, const IdSet& ids);
ClipList splitClipsLinkAware(const ClipList& clips, double atMs, const QStringList& targetIds,
                             const IdSet& clipsWithMediaTracks = {});
// defaults.ts clipFitsTrack
bool clipFitsTrack(const QString& mediaType, const QString& trackType);

// The store actions. `linked` is the store's `linkedSelection`.
ClipList moveClip(const EditDoc& doc, const QString& clipId, double deltaMs, const QString& toTrackId, bool linked);
ClipList moveSelectedClips(const EditDoc& doc, const QString& primaryClipId, const QStringList& selectedIds,
                           double deltaMs, const QString& toTrackId, bool linked);
ClipList trimClipStart(const EditDoc& doc, const QString& clipId, double deltaMs, bool linked);
ClipList trimClipEnd(const EditDoc& doc, const QString& clipId, double deltaMs, std::optional<double> maxSourceDurationMs,
                     bool linked);
ClipList rippleTrimClipStart(const EditDoc& doc, const QString& clipId, double deltaMs, bool linked);
ClipList rippleTrimClipEnd(const EditDoc& doc, const QString& clipId, double deltaMs,
                           std::optional<double> maxSourceDurationMs, bool linked);
ClipList rollClipEdge(const EditDoc& doc, const QString& clipId, const QString& edge, double deltaMs,
                      std::optional<double> sourceDurationMs, bool linked);
ClipList deleteSelected(const EditDoc& doc, const IdSet& selectedIds);
ClipList rippleDeleteSelected(const EditDoc& doc, const IdSet& selectedIds);
ClipList splitClipAtTime(const EditDoc& doc, const QString& clipId, double atMs);
// The right halves on the tracks of the split clips, for the next selection.
struct SplitResult {
    ClipList clips;
    QStringList rightHalfIds;
};
SplitResult splitSelectedAtPlayhead(const EditDoc& doc, double timeMs, const QStringList& selectedIds);
ClipList resolveDropAction(const EditDoc& doc, const IdSet& movedIds, const QString& mode);

// The store's rateStretchClip and slideClip (the Rate stretch and Slide
// tools).
ClipList rateStretchClip(const EditDoc& doc, const QString& clipId, const QString& edge, double durationMs, bool linked);
ClipList slideClip(const EditDoc& doc, const QString& clipId, double deltaMs, bool linked,
                   const SourceDurationFor& sourceDurationMsFor = {});

// useClipSourceSlip.ts planSlip: the patches of a slip, or nothing when it is
// refused. applyPatches is the store's patchClip for each of them.
struct ClipPatch {
    QString id;
    QJsonObject patch;
};
std::optional<std::vector<ClipPatch>> planSlip(const EditDoc& doc, const QJsonObject& clip, double sourceDeltaMs,
                                               std::optional<double> sourceDurationMs, bool linked);
ClipList applyPatches(const ClipList& clips, const std::vector<ClipPatch>& patches);

// TracksRegion.tsx frameStepMs: the frame grid point `frames` frames away.
double frameStepMs(double ms, double frames, double fps);

}  // namespace nt::edit
