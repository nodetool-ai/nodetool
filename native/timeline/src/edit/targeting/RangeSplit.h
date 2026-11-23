#pragma once
#include "TargetingEdits.h"

namespace nt::targeting {
QJsonObject sliceMediaTrack(QJsonObject track, const QJsonObject& clip);
void splitOwnedMediaTracks(QJsonArray& tracks, const QString& originalId, QJsonObject& left, QJsonObject& right);

// The web store's splitClipsLinkAware, including splitClipMediaTracks.
// The existing clip-only helper refuses media owners and entire failing link
// units. Range edits instead reslice media and keep each failed clip intact.
RangeResult splitRangeClips(const ClipList& clips, const QJsonArray& mediaTracks,
                            double atMs, const IdSet& targets);
}
