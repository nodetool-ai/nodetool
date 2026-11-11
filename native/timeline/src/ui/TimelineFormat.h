#pragma once

// Labels and small geometry of the tracks region, copied from the web:
// `formatTimecode` and `computeTickIntervals` (Tracks/TimeRuler.tsx), the
// playhead pill's `formatTimecode` (Inspector/InspectorPrimitives.helpers.ts)
// and `pillShiftPx` (Tracks/Playhead.tsx), `formatClipDuration`
// (Tracks/ClipBody.tsx). Pure functions.

#include <QString>

namespace nt::ui {

inline constexpr double RULER_HEIGHT_PX = 28.0;
inline constexpr double MIN_LABEL_GAP_PX = 60.0;

struct TickIntervals {
    double majorMs = 0.0;
    double minorMs = 0.0;
};

// The smallest candidate interval at least 60 px wide; minor = major / 5.
TickIntervals computeTickIntervals(double msPerPx);
// Ruler label: M:SS at second-or-coarser ticks, M:SS:FF (with an fps) or
// decimals below a second. `fps <= 0` means no fps.
QString formatRulerTimecode(double ms, double majorMs = 1000.0, double fps = 0.0);
// Playhead pill: HH:MM:SS:FF.
QString formatPlayheadTimecode(double ms, double fps);
// Clip header: "4.0s", "12s", "1:05".
QString formatClipDuration(double durationMs);
// How far the pill moves off-centre to stay whole inside the viewport.
double pillShiftPx(double lineLeftPx, double pillWidthPx, double viewportWidthPx);

// JavaScript `Number.prototype.toFixed` (a tie rounds to the larger value).
QString jsToFixed(double value, int digits);

}  // namespace nt::ui
