#include "ui/TimelineWheel.h"

#include <algorithm>
#include <cmath>

namespace nt::ui {

WheelMotion partitionTimelineWheel(const WheelSrc& event) {
    // Ctrl/Cmd + wheel, and the macOS pinch, zoom. The vertical delta drives it.
    if (event.ctrlKey || event.metaKey) {
        return {event.deltaY, 0.0};
    }
    // Shift + wheel scrolls horizontally. Prefer deltaX when the platform
    // already folded Shift into it.
    if (event.shiftKey) {
        return {0.0, event.deltaX != 0.0 ? event.deltaX : event.deltaY};
    }
    // A horizontal trackpad swipe scrolls horizontally. A vertical-dominant
    // wheel is left for the vertical track scroll.
    if (std::abs(event.deltaX) > std::abs(event.deltaY)) {
        return {0.0, event.deltaX};
    }
    return {0.0, 0.0};
}

double normalizeWheelDeltaPx(double delta, DeltaMode mode, double pageSizePx) {
    switch (mode) {
    case DeltaMode::Line: return delta * LINE_HEIGHT_PX;
    case DeltaMode::Page: return delta * pageSizePx;
    case DeltaMode::Pixel: break;
    }
    return delta;
}

double wheelZoomFactor(double deltaY, DeltaMode mode, double pageSizePx) {
    const double px = normalizeWheelDeltaPx(deltaY, mode, pageSizePx);
    const double capped = std::max(-MAX_ZOOM_DELTA_PX, std::min(MAX_ZOOM_DELTA_PX, px));
    return std::exp(capped * ZOOM_PER_PX);
}

double pinchWheelDeltaY(double magnification) {
    // A magnification of -1 or less would be a scale of 0; Chromium never
    // reports it, and log would be undefined.
    return -100.0 * std::log(std::max(1e-6, 1.0 + magnification));
}

double clampMsPerPx(double msPerPx) {
    return std::min(MAX_MS_PER_PX, std::max(MIN_MS_PER_PX, msPerPx));
}

double clampVerticalZoom(double zoom) {
    return std::min(MAX_VERTICAL_ZOOM, std::max(MIN_VERTICAL_ZOOM, zoom));
}

double totalWidthPx(double contentEndMs, double msPerPx) {
    return std::max(std::ceil((contentEndMs / msPerPx + 200.0) / 256.0) * 256.0, 1000.0);
}

double maxScrollLeftPx(double totalWidth, double viewportWidthPx) {
    return std::max(0.0, std::max(totalWidth, viewportWidthPx) - viewportWidthPx);
}

double anchoredScrollLeft(double anchorTimeMs, double msPerPx, double cursorPx) {
    return std::max(0.0, anchorTimeMs / msPerPx - cursorPx);
}

double playheadPinnedScrollLeft(double playheadMs, double prevMsPerPx, double nextMsPerPx, double scrollLeftPx) {
    const double playheadViewportPx = playheadMs / prevMsPerPx - scrollLeftPx;
    return std::max(0.0, playheadMs / nextMsPerPx - playheadViewportPx);
}

double zoomToFitMsPerPx(double contentEndMs, double viewportWidthPx) {
    const double viewport = viewportWidthPx - ZOOM_FIT_PADDING_PX;
    if (contentEndMs <= 0.0 || viewport <= 0.0) {
        return 0.0;
    }
    return contentEndMs / viewport;
}

ClipWindow clipWindow(double scrollLeftPx, double viewportWidthPx, double msPerPx) {
    return {std::max(0.0, scrollLeftPx - CLIP_OVERSCAN_PX - 4.0) * msPerPx,
            (scrollLeftPx + viewportWidthPx + CLIP_OVERSCAN_PX) * msPerPx};
}

bool clipInWindow(double clipStartMs, double clipDurationMs, const ClipWindow& window) {
    return clipStartMs < window.endMs && clipStartMs + clipDurationMs >= window.startMs;
}

ScrollThumb computeScrollThumb(double contentWidthPx, double viewportWidthPx, double scrollLeftPx, double trackWidth) {
    const double maxScroll = std::max(0.0, contentWidthPx - viewportWidthPx);
    const bool scrollable = maxScroll > 0.0 && viewportWidthPx > 0.0 && trackWidth > 0.0;
    if (!scrollable) {
        return {std::max(0.0, trackWidth), 0.0, 0.0, 0.0, false};
    }
    const double ratio = std::min(1.0, viewportWidthPx / contentWidthPx);
    // Math.round in JavaScript rounds .5 up, std::round rounds it away from 0;
    // the two agree for the positive values here.
    const double thumbWidth = std::max(MIN_THUMB_PX, std::round(trackWidth * ratio));
    const double thumbTravel = std::max(0.0, trackWidth - thumbWidth);
    const double clampedScroll = std::min(maxScroll, std::max(0.0, scrollLeftPx));
    const double thumbLeft = thumbTravel > 0.0 ? (clampedScroll / maxScroll) * thumbTravel : 0.0;
    return {thumbWidth, thumbLeft, maxScroll, thumbTravel, true};
}

double thumbDragScrollLeft(const ScrollThumb& thumb, double startScroll, double deltaPx) {
    if (thumb.thumbTravel <= 0.0) {
        return startScroll;
    }
    const double next = startScroll + (deltaPx / thumb.thumbTravel) * thumb.maxScroll;
    return std::min(thumb.maxScroll, std::max(0.0, next));
}

double troughClickScrollLeft(const ScrollThumb& thumb, double pointerInTroughPx) {
    if (!thumb.scrollable || thumb.thumbTravel <= 0.0) {
        return 0.0;
    }
    const double targetLeft = pointerInTroughPx - thumb.thumbWidth / 2.0;
    const double next = (targetLeft / thumb.thumbTravel) * thumb.maxScroll;
    return std::min(thumb.maxScroll, std::max(0.0, next));
}

double autoScrollSpeed(double pointerX, double left, double right) {
    const double leftOvershoot = left + AUTO_SCROLL_EDGE_PX - pointerX;
    const double rightOvershoot = pointerX - (right - AUTO_SCROLL_EDGE_PX);
    const double scale = AUTO_SCROLL_MAX_PX_PER_FRAME / AUTO_SCROLL_EDGE_PX;
    if (leftOvershoot > 0.0) {
        return -std::min(AUTO_SCROLL_MAX_PX_PER_FRAME, leftOvershoot * scale);
    }
    if (rightOvershoot > 0.0) {
        return std::min(AUTO_SCROLL_MAX_PX_PER_FRAME, rightOvershoot * scale);
    }
    return 0.0;
}

}  // namespace nt::ui
