#pragma once
// How caption words group into cues. The renderers and the transcript editor share these rules,
// so this file depends on nothing but Qt's JSON types.
#include <QJsonArray>
#include <vector>

namespace nt::transcript {

inline constexpr double CUE_GAP_MS = 700;  // CAPTION_CUE_GAP_MS in packages/timeline/src/render/sceneModel.ts
inline constexpr int CUE_MAX_WORDS = 10;   // CAPTION_CUE_MAX_WORDS

// The raw indices of each cue in caption.words: the rules of captionCues in sceneModel.ts.
std::vector<std::vector<int>> captionCues(const QJsonArray& words, double durationMs);

}  // namespace nt::transcript
