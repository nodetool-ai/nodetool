#pragma once

// Port of packages/timeline/src/audioCrossfade.ts, Premiere's default audio
// transition: a constant power cross-fade at each edit of the chosen audio clips.

#include "edit/ClipOps.h"

#include <functional>
#include <optional>

namespace nt::edit {

struct AudioCrossfadeOptions {
    // Whether the clip may be lengthened under its neighbour.
    std::function<bool(const QJsonObject&)> canExtend;
    // The clip's source length in ms, when known. Unknown is not capped.
    std::function<std::optional<double>(const QJsonObject&)> sourceDurationMs;
};

ClipList applyAudioCrossfades(const ClipList& clips, const IdSet& clipIds, double durationMs,
                              const AudioCrossfadeOptions& options = {});

}  // namespace nt::edit
