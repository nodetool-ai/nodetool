#pragma once

// The range a Range tool drag selects (docs/MUSIC-MODE.md MD11, MT-3) and the
// bar labels and lengths the overlay and the music panel show for it. Edges
// snap to the ruler's grid division (bar, or beat when the division is finer)
// on frames from barStartFrame and beatStartFrame, so an edge is never a sum
// of bar lengths (MT-4). A free edge (Alt) keeps the pointer's own frame.
//
// Thread affinity: pure functions with no state, callable from any thread.

#include "music/MusicPlan.h"

#include <QJsonObject>
#include <QString>

#include <cstdint>
#include <optional>
#include <string_view>

namespace nt::music {

// "bar" snaps to bars. Every finer ruler division ("beat", "1/8", ...) snaps to beats.
[[nodiscard]] GridDivision rangeDivision(std::string_view rulerDivision);

// The tempo of a raw sequence: its `tempo` object, or DEFAULT_TEMPO when it has none.
// Nullopt when the tempo cannot be read (a zero or missing BPM).
[[nodiscard]] std::optional<MusicTempo> sequenceTempo(const QJsonObject& rawSequence);

// The frame of a lane position in milliseconds, never before frame 0.
[[nodiscard]] std::int64_t laneFrame(double ms);

// An edge at a lane frame: the nearest grid line, or the frame itself when free.
[[nodiscard]] std::int64_t rangeEdge(std::int64_t frame, const MusicTempo& tempo, GridDivision division, bool free);

// The range between the press edge and the pointer. A snapped pointer that
// lands on the anchor takes the next grid line in the drag's direction, so a
// short snapped drag selects one bar (or beat). Empty when start == end.
[[nodiscard]] FrameRange rangeBetween(std::int64_t anchor, std::int64_t pointerFrame, const MusicTempo& tempo,
                                      GridDivision division, bool freePointer);

// The bar that holds the frame: the last bar whose line is at or before it.
[[nodiscard]] std::int64_t barAtFrame(std::int64_t frame, const MusicTempo& tempo);
// "5" on the line of bar 5, else "5.3" for the beat of bar 5 that holds the frame.
[[nodiscard]] QString barPositionLabel(std::int64_t frame, const MusicTempo& tempo);
// "Bar 5" or "Bars 5–12": the bars the range covers.
[[nodiscard]] QString barRangeLabel(const FrameRange& range, const MusicTempo& tempo);
// "8 bars" when both edges are bar lines, "3 beats" when both are beat lines,
// else seconds ("2.50 s").
[[nodiscard]] QString rangeLengthLabel(const FrameRange& range, const MusicTempo& tempo);

} // namespace nt::music
