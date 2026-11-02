// adjustRange is ported from FilmCraft crates/engine/src/source_monitor.rs. See licenses/FilmCraft-MIT.txt.
#include "SourceRange.h"
#include <algorithm>
#include <cmath>

namespace nt::sourceedit {
namespace {
double usableRate(double fps) { return std::isfinite(fps) && fps > 0 ? fps : 1000; }
double frameIndex(double ms, double fps) { return std::floor(ms * fps / 1000 + 1e-6); }
double frameTime(double index, double fps) { return index * 1000 / fps; }
double nearestIndex(double value) { return std::ceil(value - 0.5); }
}
double frameFloorMs(double ms, double fps) {
    if (!std::isfinite(fps) || fps <= 0) { return ms; }
    return frameTime(frameIndex(ms, fps), fps);
}
double frameDurationMs(double fps) { return 1000 / usableRate(fps); }
std::optional<Range> adjustRange(double fullMs, Range range, double fps, RangeEdge edge, double deltaMs) {
    if (!std::isfinite(fullMs) || !std::isfinite(range.inMs) || !std::isfinite(range.outMs) ||
        !std::isfinite(deltaMs) || fullMs <= 0 || range.inMs < 0 || range.outMs > fullMs || range.outMs <= range.inMs) {
        return std::nullopt;
    }
    fps = usableRate(fps);
    const double count = fullMs * fps / 1000;
    if (!std::isfinite(count)) { return std::nullopt; }
    const double last = std::max(0.0, std::ceil(count - 1e-6) - 1);
    if (last == 0) { return Range{0, fullMs}; }
    const double start = frameIndex(range.inMs, fps);
    const double stop = std::min(last + 1, std::ceil(range.outMs * fps / 1000 - 1e-6));
    const double delta = std::clamp(deltaMs, -fullMs, fullMs) * fps / 1000;
    if (edge == RangeEdge::In) {
        range.inMs = frameTime(std::clamp(nearestIndex(start + delta), 0.0, std::max(0.0, stop - 1)), fps);
    } else if (edge == RangeEdge::Out) {
        const double end = std::clamp(nearestIndex(stop - 1 + delta), start, last) + 1;
        range.outMs = std::min(fullMs, frameTime(end, fps));
    } else {
        // A partial frame at the source end counts as a whole frame, so a marked range can leave the end.
        const double high = last + 1 - stop;
        const double shift = std::clamp(nearestIndex(delta), -start, std::max(0.0, high));
        range.inMs = frameTime(start + shift, fps);
        range.outMs = std::min(fullMs, frameTime(stop + shift, fps));
    }
    return range;
}
}
