#pragma once
#include "SourceEdit.h"

namespace nt::sourceedit {
enum class RangeEdge { In, Out, Move };
double frameFloorMs(double ms, double fps);
double frameDurationMs(double fps);
std::optional<Range> adjustRange(double fullMs, Range range, double fps, RangeEdge edge, double deltaMs);
}
