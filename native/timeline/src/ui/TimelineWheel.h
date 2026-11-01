#pragma once

// Zoom, pan and scroll math of the tracks region. Pure functions, copied from
// web/src/components/timeline/Tracks/timelineWheel.ts, TimelineScrollbar.tsx,
// useClipDrag.ts and the anchored zoom in TracksRegion.tsx (DESIGN.md D29).
// The names and constants match the TypeScript source.

namespace nt::ui {

// TimelineUIStore.ts
inline constexpr double MIN_MS_PER_PX = 0.5;
inline constexpr double DEFAULT_MS_PER_PX = 10.0;
inline constexpr double MAX_MS_PER_PX = 500.0;
inline constexpr double MIN_VERTICAL_ZOOM = 0.75;
inline constexpr double MAX_VERTICAL_ZOOM = 2.0;

// TracksRegion.tsx
inline constexpr double ZOOM_IN_FACTOR = 0.8;
inline constexpr double ZOOM_OUT_FACTOR = 1.25;
inline constexpr double ZOOM_FIT_PADDING_PX = 64.0;

// TrackLane.tsx
inline constexpr double CLIP_OVERSCAN_PX = 320.0;

// timelineWheel.ts
inline constexpr double LINE_HEIGHT_PX = 16.0;
inline constexpr double ZOOM_PER_PX = 0.02;
inline constexpr double MAX_ZOOM_DELTA_PX = 15.0;

// Chromium reports one mouse wheel notch as 100 px (DOM_DELTA_PIXEL). Qt
// reports it as an angle delta of 120 (eighths of a degree).
inline constexpr double CHROMIUM_NOTCH_PX = 100.0;
inline constexpr double QT_NOTCH_ANGLE = 120.0;

// TimelineScrollbar.tsx
inline constexpr double TIMELINE_SCROLLBAR_HEIGHT_PX = 14.0;
inline constexpr double MIN_THUMB_PX = 28.0;
inline constexpr double TROUGH_HEIGHT_PX = 8.0;

// useClipDrag.ts
inline constexpr double AUTO_SCROLL_EDGE_PX = 32.0;
inline constexpr double AUTO_SCROLL_MAX_PX_PER_FRAME = 24.0;
inline constexpr double DRAG_THRESHOLD_PX = 3.0;

enum class DeltaMode { Pixel = 0, Line = 1, Page = 2 };

// The fields of a DOM WheelEvent the routing reads. `deltaY > 0` scrolls the
// content down (DOM sign), the inverse of Qt's angle and pixel deltas.
struct WheelSrc {
    double deltaX = 0.0;
    double deltaY = 0.0;
    bool ctrlKey = false;
    bool metaKey = false;
    bool shiftKey = false;
};

struct WheelMotion {
    double zoomDelta = 0.0;    // vertical delta that drives the zoom; 0 for no zoom
    double scrollDelta = 0.0;  // horizontal scroll delta; 0 for no horizontal scroll
};

WheelMotion partitionTimelineWheel(const WheelSrc& event);
double normalizeWheelDeltaPx(double delta, DeltaMode mode, double pageSizePx);
// The msPerPx multiplier for one Ctrl/Cmd wheel event (> 1 zooms out).
double wheelZoomFactor(double deltaY, DeltaMode mode, double pageSizePx);

// A macOS trackpad pinch (QNativeGestureEvent, ZoomNativeGesture) as the
// ctrlKey wheel delta Chromium reports for it: -100 * ln(1 + value).
double pinchWheelDeltaY(double magnification);

double clampMsPerPx(double msPerPx);
double clampVerticalZoom(double zoom);

// The lanes' scroll width at a zoom (TracksRegion `totalWidthPx`): the content
// extent plus 200 px, in 256 px steps, at least 1000 px.
double totalWidthPx(double contentEndMs, double msPerPx);
// The DOM clamp of scrollLeft: the content is `max(totalWidth, viewport)` wide.
double maxScrollLeftPx(double totalWidthPx, double viewportWidthPx);

// The time under the cursor stays under the cursor (the layout effect in
// TracksRegion.tsx): `max(0, anchorTimeMs / msPerPx - cursorPx)`, before the
// DOM clamp to the scroll range.
double anchoredScrollLeft(double anchorTimeMs, double msPerPx, double cursorPx);
// A button or slider zoom keeps the playhead at the same viewport x.
double playheadPinnedScrollLeft(double playheadMs, double prevMsPerPx, double nextMsPerPx, double scrollLeftPx);
// Shift+Z: `contentEndMs / (viewport - 64)`, or 0 when there is nothing to fit.
double zoomToFitMsPerPx(double contentEndMs, double viewportWidthPx);

// The clips a lane keeps: `[max(0, scrollLeft - 324) * msPerPx,
// (scrollLeft + viewport + 320) * msPerPx]` (TrackLane.tsx).
struct ClipWindow {
    double startMs = 0.0;
    double endMs = 0.0;
};
ClipWindow clipWindow(double scrollLeftPx, double viewportWidthPx, double msPerPx);
// `visibleClipIdsByTrack`: a clip is kept when `startMs < endMs` and
// `startMs + durationMs >= startMs` of the window.
bool clipInWindow(double clipStartMs, double clipDurationMs, const ClipWindow& window);

struct ScrollThumb {
    double thumbWidth = 0.0;
    double thumbLeft = 0.0;
    double maxScroll = 0.0;
    double thumbTravel = 0.0;
    bool scrollable = false;
};
ScrollThumb computeScrollThumb(double contentWidthPx, double viewportWidthPx, double scrollLeftPx, double trackWidth);
// Thumb drag: the scroll for a pointer travel since the press.
double thumbDragScrollLeft(const ScrollThumb& thumb, double startScroll, double deltaPx);
// Trough click: the scroll that centres the thumb on the pointer.
double troughClickScrollLeft(const ScrollThumb& thumb, double pointerInTroughPx);

// Signed auto-scroll speed in px per frame for a pointer near a container edge.
double autoScrollSpeed(double pointerX, double left, double right);

}  // namespace nt::ui
