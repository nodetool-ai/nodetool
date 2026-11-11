#pragma once

// The media check of `--ui-bench` (UiBench.cpp), apart so a test can reach
// it: the bench measures the tracks UI only while the preview plays its
// media, so it counts the composited frames that drew it.

#include <vector>

struct FrameStat;

namespace nt::ui {

// A composited frame drew its media: every media layer of the plan (at least
// `minLayers`) has a picture within one frame of its expected frame.
bool frameDrewMedia(const FrameStat& stat, int minLayers);
// The start of the measured range: the newest composited frame drew its
// media, by the same rule.
bool benchMediaReady(const std::vector<FrameStat>& stats, int minLayers);

}  // namespace nt::ui
