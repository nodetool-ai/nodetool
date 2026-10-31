#include "ui/TimelineViewState.h"

#include <algorithm>
#include <cmath>

using namespace nt::ui;

TimelineViewState::TimelineViewState(QObject* parent) : QObject(parent) {
    m_window = nt::ui::clipWindow(m_scrollLeftPx, m_viewportWidthPx, m_msPerPx);
}

double TimelineViewState::totalWidthPx() const {
    return nt::ui::totalWidthPx(m_contentEndMs, m_msPerPx);
}

double TimelineViewState::maxScrollLeftPx() const {
    return nt::ui::maxScrollLeftPx(totalWidthPx(), m_viewportWidthPx);
}

double TimelineViewState::maxScrollTopPx() const {
    return std::max(0.0, m_contentHeightPx - m_viewportHeightPx);
}

int TimelineViewState::zoomPercent() const {
    return static_cast<int>(std::floor(DEFAULT_MS_PER_PX / m_msPerPx * 100.0 + 0.5));
}

double TimelineViewState::zoomSliderValue() const {
    return 100.0 * std::log(MAX_MS_PER_PX / m_msPerPx) / std::log(MAX_MS_PER_PX / MIN_MS_PER_PX);
}

void TimelineViewState::setVerticalZoom(double zoom) {
    const double next = clampVerticalZoom(zoom);
    if (next == m_verticalZoom) return;
    m_verticalZoom = next;
    emit verticalZoomChanged();
}

void TimelineViewState::setScrollLeftPx(double px) {
    const double next = std::min(maxScrollLeftPx(), std::max(0.0, px));
    if (next == m_scrollLeftPx) return;
    m_scrollLeftPx = next;
    emit scrollLeftPxChanged();
    markWindowDirty();
}

void TimelineViewState::setScrollTopPx(double px) {
    const double next = std::min(maxScrollTopPx(), std::max(0.0, px));
    if (next == m_scrollTopPx) return;
    m_scrollTopPx = next;
    emit scrollTopPxChanged();
}

void TimelineViewState::setViewportWidthPx(double px) {
    if (px == m_viewportWidthPx) return;
    m_viewportWidthPx = px;
    emit viewportChanged();
    emit extentChanged();
    reclampScroll();
    markWindowDirty();
    fitIfOverflowing(true);
}

void TimelineViewState::setViewportHeightPx(double px) {
    if (px == m_viewportHeightPx) return;
    m_viewportHeightPx = px;
    emit viewportChanged();
    emit extentChanged();
    reclampScroll();
}

void TimelineViewState::setContentEndMs(double ms) {
    if (ms == m_contentEndMs) return;
    m_contentEndMs = ms;
    emit contentEndMsChanged();
    emit extentChanged();
    reclampScroll();
    fitIfOverflowing(false);
}

void TimelineViewState::setClipCount(int count) {
    if (count == m_clipCount) return;
    m_clipCount = count;
    emit clipCountChanged();
    fitIfOverflowing(false);
}

void TimelineViewState::setContentHeightPx(double px) {
    if (px == m_contentHeightPx) return;
    m_contentHeightPx = px;
    emit contentHeightPxChanged();
    emit extentChanged();
    reclampScroll();
}

void TimelineViewState::reclampScroll() {
    setScrollLeftPx(m_scrollLeftPx);
    setScrollTopPx(m_scrollTopPx);
}

void TimelineViewState::requestFlush() {
    if (m_flushRequested) return;
    m_flushRequested = true;
    emit flushRequested();
}

void TimelineViewState::markWindowDirty() {
    m_windowDirty = true;
    requestFlush();
}

bool TimelineViewState::wheel(const WheelSrc& event, DeltaMode mode, double cursorPx, WheelTarget target) {
    const WheelMotion motion = partitionTimelineWheel(event);
    if (event.ctrlKey || event.metaKey) {
        // The zoom listener sits on the whole region: a pinch over the ruler,
        // a header or the playhead zooms the timeline.
        m_pendingZoomFactor *= wheelZoomFactor(motion.zoomDelta, mode, m_viewportWidthPx);
        m_pendingCursorPx = cursorPx;
        requestFlush();
        return true;
    }
    if (target == Headers) {
        // A wheel over the header column scrolls the lanes vertically.
        if (maxScrollTopPx() <= 0.0) return false;
        setScrollTopPx(m_scrollTopPx + event.deltaY);
        return true;
    }
    if (target != Lanes) {
        return false;
    }
    if (motion.scrollDelta != 0.0) {
        // Taken over: only the horizontal scroll moves.
        setScrollLeftPx(m_scrollLeftPx + normalizeWheelDeltaPx(motion.scrollDelta, mode, m_viewportWidthPx));
        return true;
    }
    // Left to the native overflow scroll, which applies both deltas.
    const double before = m_scrollLeftPx + m_scrollTopPx;
    setScrollTopPx(m_scrollTopPx + normalizeWheelDeltaPx(event.deltaY, mode, m_viewportHeightPx));
    setScrollLeftPx(m_scrollLeftPx + normalizeWheelDeltaPx(event.deltaX, mode, m_viewportWidthPx));
    return before != m_scrollLeftPx + m_scrollTopPx;
}

bool TimelineViewState::wheelEvent(double deltaX, double deltaY, int modifiers, int deltaMode, double cursorPx,
                                   int target) {
    WheelSrc src;
    src.deltaX = deltaX;
    src.deltaY = deltaY;
    src.ctrlKey = (modifiers & Qt::ControlModifier) != 0;
    src.metaKey = (modifiers & Qt::MetaModifier) != 0;
    src.shiftKey = (modifiers & Qt::ShiftModifier) != 0;
    return wheel(src, static_cast<DeltaMode>(deltaMode), cursorPx, static_cast<WheelTarget>(target));
}

void TimelineViewState::pinch(double magnification, double cursorPx) {
    WheelSrc src;
    src.deltaY = pinchWheelDeltaY(magnification);
    src.ctrlKey = true;
    wheel(src, DeltaMode::Pixel, cursorPx, Lanes);
}

void TimelineViewState::setMsPerPxAndScroll(double msPerPx, double scrollLeftPx) {
    const bool zoomChanged = msPerPx != m_msPerPx;
    m_msPerPx = msPerPx;
    // The scroll is clamped against the content width at the new scale, as
    // the DOM clamps scrollLeft after the lanes re-render.
    const double scroll = std::min(maxScrollLeftPx(), std::max(0.0, scrollLeftPx));
    const bool scrollChanged = scroll != m_scrollLeftPx;
    m_scrollLeftPx = scroll;
    if (zoomChanged) {
        emit msPerPxChanged();
        emit extentChanged();
    }
    if (scrollChanged) emit scrollLeftPxChanged();
    if (zoomChanged || scrollChanged) markWindowDirty();
}

void TimelineViewState::flush() {
    m_flushRequested = false;
    ++m_flushCount;
    const double factor = m_pendingZoomFactor;
    m_pendingZoomFactor = 1.0;
    if (factor != 1.0) {
        const double current = m_msPerPx;
        const double next = clampMsPerPx(current * factor);
        if (next != current) {
            // A pinch over the headers or past the lanes anchors at the nearer
            // lanes edge.
            const double cursorPx = std::min(m_viewportWidthPx, std::max(0.0, m_pendingCursorPx));
            const double anchorTimeMs = (m_scrollLeftPx + cursorPx) * current;
            setMsPerPxAndScroll(next, anchoredScrollLeft(anchorTimeMs, next, cursorPx));
        }
    }
    if (m_windowDirty) {
        m_windowDirty = false;
        const ClipWindow next = nt::ui::clipWindow(m_scrollLeftPx, m_viewportWidthPx, m_msPerPx);
        if (next.startMs != m_window.startMs || next.endMs != m_window.endMs) {
            m_window = next;
            ++m_clipWindowUpdates;
            emit clipWindowChanged();
        }
    }
    // Setters called by the handlers above request another flush; this one
    // already applied them.
    m_flushRequested = false;
    emit flushed();
}

void TimelineViewState::zoomTo(double msPerPx, double playheadMs) {
    const double next = clampMsPerPx(msPerPx);
    if (next == m_msPerPx) return;
    setMsPerPxAndScroll(next, playheadPinnedScrollLeft(playheadMs, m_msPerPx, next, m_scrollLeftPx));
}

void TimelineViewState::setRangeIn(double ms) {
    const double in = ms < 0 ? -1 : ms;
    const double out = in >= 0 && m_rangeOutMs >= 0 && m_rangeOutMs <= in ? -1 : m_rangeOutMs;
    if (in == m_rangeInMs && out == m_rangeOutMs) return;
    m_rangeInMs = in;
    m_rangeOutMs = out;
    emit rangeChanged();
}

void TimelineViewState::setRangeOut(double ms) {
    const double out = ms < 0 ? -1 : ms;
    const double in = out >= 0 && m_rangeInMs >= 0 && m_rangeInMs >= out ? -1 : m_rangeInMs;
    if (in == m_rangeInMs && out == m_rangeOutMs) return;
    m_rangeInMs = in;
    m_rangeOutMs = out;
    emit rangeChanged();
}

void TimelineViewState::clearRange() {
    if (m_rangeInMs < 0 && m_rangeOutMs < 0) return;
    m_rangeInMs = -1;
    m_rangeOutMs = -1;
    emit rangeChanged();
}

void TimelineViewState::zoomBy(double factor, double playheadMs) {
    zoomTo(m_msPerPx * factor, playheadMs);
}

void TimelineViewState::zoomFromSlider(double value, double playheadMs) {
    const double range = std::log(MAX_MS_PER_PX / MIN_MS_PER_PX);
    zoomTo(MAX_MS_PER_PX * std::exp((-value / 100.0) * range), playheadMs);
}

void TimelineViewState::zoomToFit() {
    const double fit = zoomToFitMsPerPx(m_contentEndMs, m_viewportWidthPx);
    if (fit <= 0.0) return;
    // Pins the content start to the left edge (anchor {timeMs: 0, cursorPx: 0}).
    setMsPerPxAndScroll(clampMsPerPx(fit), 0.0);
}

void TimelineViewState::fitIfOverflowing(bool resized) {
    // TracksRegion.tsx's initial fit: the content present when the editor
    // first has any clips decides once; after that only a resize refits, and
    // only until the person zooms (the scale differs from the last fit).
    if (m_fit == Fit::Done || m_viewportWidthPx <= 0.0) return;
    if (m_fit == Fit::Decided) {
        if (!resized) return;
        if (m_msPerPx != m_fitMsPerPx) {
            m_fit = Fit::Done;
            return;
        }
    }
    if (m_clipCount == 0 || m_contentEndMs <= 0.0) return;
    if (m_contentEndMs / m_msPerPx > m_viewportWidthPx - ZOOM_FIT_PADDING_PX) {
        zoomToFit();
    }
    m_fit = Fit::Decided;
    m_fitMsPerPx = m_msPerPx;
}

QVariantMap TimelineViewState::scrollThumb(double contentWidthPx, double viewportWidthPx, double scrollLeftPx,
                                           double trackWidth) const {
    const ScrollThumb t = computeScrollThumb(contentWidthPx, viewportWidthPx, scrollLeftPx, trackWidth);
    return {{QStringLiteral("thumbWidth"), t.thumbWidth},
            {QStringLiteral("thumbLeft"), t.thumbLeft},
            {QStringLiteral("maxScroll"), t.maxScroll},
            {QStringLiteral("thumbTravel"), t.thumbTravel},
            {QStringLiteral("scrollable"), t.scrollable}};
}

double TimelineViewState::thumbDragScrollLeft(double startScroll, double deltaPx, double trackWidth) const {
    const ScrollThumb t = computeScrollThumb(totalWidthPx(), m_viewportWidthPx, startScroll, trackWidth);
    return nt::ui::thumbDragScrollLeft(t, startScroll, deltaPx);
}

double TimelineViewState::troughClickScrollLeft(double pointerInTroughPx, double trackWidth) const {
    const ScrollThumb t = computeScrollThumb(totalWidthPx(), m_viewportWidthPx, m_scrollLeftPx, trackWidth);
    return nt::ui::troughClickScrollLeft(t, pointerInTroughPx);
}

void TimelineViewState::setRulerMode(const QString& mode) {
    if ((mode != u"time" && mode != u"bars") || mode == m_rulerMode) { return; }
    m_rulerMode = mode;
    emit rulerModeChanged();
}

void TimelineViewState::setGridDivision(const QString& division) {
    if (division == m_gridDivision) { return; }
    m_gridDivision = division;
    emit gridDivisionChanged();
}
