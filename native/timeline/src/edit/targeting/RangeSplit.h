#pragma once
#include "TargetingEdits.h"

namespace nt::targeting {
// The web store's splitClipsLinkAware, including splitClipMediaTracks.
// The existing clip-only helper refuses media owners and entire failing link
// units. Range edits instead reslice media and keep each failed clip intact.
RangeResult splitRangeClips(const ClipList& clips, const QJsonArray& mediaTracks,
                            double atMs, const IdSet& targets);
}
