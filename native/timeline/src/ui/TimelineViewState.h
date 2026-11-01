#pragma once

// The zoom and scroll state of the tracks region: the native
// `TimelineUIStore` subset (msPerPx, verticalZoom, scrollLeftPx, the lanes
// viewport) plus the wheel and pinch routing of TracksRegion.tsx (D29).
//
// Zoom events within one frame multiply into one factor and apply once, in
// `flush()`. The clip window that the lanes cull against (D28) is also
// recomputed there, so a burst of scroll events costs one recompute per frame.
// A `TimelineGestureArea` calls `flush()` from its polish step; a test without
// a window calls it directly.
//
// Nothing here reads the playback clock. A zoom that pins the playhead takes
// the playhead time as an argument (D30).

#include "ui/TimelineWheel.h"

#include <QObject>
#include <QVariantMap>
#include <QtQmlIntegration/qqmlintegration.h>

class TimelineViewState : public QObject {
    Q_OBJECT
    QML_ELEMENT
    Q_PROPERTY(QString rulerMode READ rulerMode WRITE setRulerMode NOTIFY rulerModeChanged)
    Q_PROPERTY(QString gridDivision READ gridDivision WRITE setGridDivision NOTIFY gridDivisionChanged)
    Q_PROPERTY(double msPerPx READ msPerPx NOTIFY msPerPxChanged)
    Q_PROPERTY(double verticalZoom READ verticalZoom WRITE setVerticalZoom NOTIFY verticalZoomChanged)
    Q_PROPERTY(double scrollLeftPx READ scrollLeftPx WRITE setScrollLeftPx NOTIFY scrollLeftPxChanged)
    Q_PROPERTY(double scrollTopPx READ scrollTopPx WRITE setScrollTopPx NOTIFY scrollTopPxChanged)
    Q_PROPERTY(double viewportWidthPx READ viewportWidthPx WRITE setViewportWidthPx NOTIFY viewportChanged)
    Q_PROPERTY(double viewportHeightPx READ viewportHeightPx WRITE setViewportHeightPx NOTIFY viewportChanged)
    Q_PROPERTY(double contentEndMs READ contentEndMs WRITE setContentEndMs NOTIFY contentEndMsChanged)
    // The document's clip count: the fit waits for the first clips.
    Q_PROPERTY(int clipCount READ clipCount WRITE setClipCount NOTIFY clipCountChanged)
    Q_PROPERTY(double contentHeightPx READ contentHeightPx WRITE setContentHeightPx NOTIFY contentHeightPxChanged)
    Q_PROPERTY(double totalWidthPx READ totalWidthPx NOTIFY extentChanged)
    Q_PROPERTY(double maxScrollLeftPx READ maxScrollLeftPx NOTIFY extentChanged)
    Q_PROPERTY(double maxScrollTopPx READ maxScrollTopPx NOTIFY extentChanged)
    Q_PROPERTY(double clipWindowStartMs READ clipWindowStartMs NOTIFY clipWindowChanged)
    Q_PROPERTY(double clipWindowEndMs READ clipWindowEndMs NOTIFY clipWindowChanged)
    Q_PROPERTY(int zoomPercent READ zoomPercent NOTIFY msPerPxChanged)
    Q_PROPERTY(double zoomSliderValue READ zoomSliderValue NOTIFY msPerPxChanged)
    Q_PROPERTY(bool canZoomIn READ canZoomIn NOTIFY msPerPxChanged)
    Q_PROPERTY(bool canZoomOut READ canZoomOut NOTIFY msPerPxChanged)
    Q_PROPERTY(int flushCount READ flushCount NOTIFY flushed)
    Q_PROPERTY(int clipWindowUpdates READ clipWindowUpdates NOTIFY clipWindowChanged)
    // The in/out range (TimelinePlaybackStore rangeInMs, rangeOutMs; I and
    // O); -1 when not set.
    Q_PROPERTY(double rangeInMs READ rangeInMs NOTIFY rangeChanged)
    Q_PROPERTY(double rangeOutMs READ rangeOutMs NOTIFY rangeChanged)

public:
    // Where a wheel event landed. The web listens for zoom on the whole
    // region, for horizontal scroll on the lanes, and forwards a vertical
    // wheel over the headers to the lanes.
    enum WheelTarget { Lanes, Headers, Ruler, Other };
    Q_ENUM(WheelTarget)

    explicit TimelineViewState(QObject* parent = nullptr);

    QString rulerMode() const { return m_rulerMode; }
    void setRulerMode(const QString& mode);
    QString gridDivision() const { return m_gridDivision; }
    void setGridDivision(const QString& division);
    double msPerPx() const { return m_msPerPx; }
    double verticalZoom() const { return m_verticalZoom; }
    void setVerticalZoom(double zoom);
    double scrollLeftPx() const { return m_scrollLeftPx; }
    void setScrollLeftPx(double px);
    double scrollTopPx() const { return m_scrollTopPx; }
    void setScrollTopPx(double px);
    double viewportWidthPx() const { return m_viewportWidthPx; }
    void setViewportWidthPx(double px);
    double viewportHeightPx() const { return m_viewportHeightPx; }
    void setViewportHeightPx(double px);
    double contentEndMs() const { return m_contentEndMs; }
    void setContentEndMs(double ms);
    double contentHeightPx() const { return m_contentHeightPx; }
    int clipCount() const { return m_clipCount; }
    void setClipCount(int count);
    void setContentHeightPx(double px);
    double totalWidthPx() const;
    double maxScrollLeftPx() const;
    double maxScrollTopPx() const;
    double clipWindowStartMs() const { return m_window.startMs; }
    double clipWindowEndMs() const { return m_window.endMs; }
    nt::ui::ClipWindow clipWindow() const { return m_window; }
    int zoomPercent() const;
    double zoomSliderValue() const;
    bool canZoomIn() const { return m_msPerPx > nt::ui::MIN_MS_PER_PX; }
    bool canZoomOut() const { return m_msPerPx < nt::ui::MAX_MS_PER_PX; }
    int flushCount() const { return m_flushCount; }
    int clipWindowUpdates() const { return m_clipWindowUpdates; }
    bool flushPending() const { return m_flushRequested; }
    double rangeInMs() const { return m_rangeInMs; }
    double rangeOutMs() const { return m_rangeOutMs; }

    // One wheel event in DOM terms. Returns whether the region consumed it.
    bool wheel(const nt::ui::WheelSrc& event, nt::ui::DeltaMode mode, double cursorPx, WheelTarget target);

public slots:
    // QML and test entry: DOM deltas, Qt modifier flags.
    bool wheelEvent(double deltaX, double deltaY, int modifiers, int deltaMode, double cursorPx, int target);
    // A trackpad pinch step (QNativeGestureEvent value) at a lanes x.
    void pinch(double magnification, double cursorPx);
    // Applies the zoom accumulated since the last flush and refreshes the clip
    // window. Called once per frame.
    void flush();
    // A button or slider zoom: the playhead keeps its viewport x.
    void zoomTo(double msPerPx, double playheadMs);
    void zoomBy(double factor, double playheadMs);
    void zoomFromSlider(double value, double playheadMs);
    // Shift+Z: all content in view, the content start at the left edge.
    void zoomToFit();
    // The web fits a timeline that opens wider than its lanes, again on each
    // resize until the person zooms; a later content change never refits.
    void fitIfOverflowing(bool resized);
    double timeAtViewportX(double viewportX) const { return (viewportX + m_scrollLeftPx) * m_msPerPx; }
    // computeScrollThumb for the scrollbar. The QML passes the view state's
    // own values, so the binding re-evaluates when they change.
    QVariantMap scrollThumb(double contentWidthPx, double viewportWidthPx, double scrollLeftPx,
                            double trackWidth) const;
    double thumbDragScrollLeft(double startScroll, double deltaPx, double trackWidth) const;
    double troughClickScrollLeft(double pointerInTroughPx, double trackWidth) const;
    // setRangeIn: an out point at or before the in point is dropped (and
    // the reverse for setRangeOut). A negative time clears that point.
    void setRangeIn(double ms);
    void setRangeOut(double ms);
    void clearRange();
    // The clip-drag auto-scroll speed for a pointer x in the lanes viewport.
    double autoScrollSpeed(double viewportX) const {
        return nt::ui::autoScrollSpeed(viewportX, 0.0, m_viewportWidthPx);
    }

signals:
    void rulerModeChanged();
    void gridDivisionChanged();
    void msPerPxChanged();
    void verticalZoomChanged();
    void scrollLeftPxChanged();
    void scrollTopPxChanged();
    void viewportChanged();
    void contentEndMsChanged();
    void contentHeightPxChanged();
    void clipCountChanged();
    void extentChanged();
    void clipWindowChanged();
    void rangeChanged();
    // Asks the owner of the frame (TimelineGestureArea) to call flush().
    void flushRequested();
    void flushed();

private:
    QString m_rulerMode = QStringLiteral("time");
    QString m_gridDivision = QStringLiteral("beat");
    void requestFlush();
    void markWindowDirty();
    void setMsPerPxAndScroll(double msPerPx, double scrollLeftPx);
    void reclampScroll();

    double m_msPerPx = nt::ui::DEFAULT_MS_PER_PX;
    double m_rangeInMs = -1;
    double m_rangeOutMs = -1;
    double m_verticalZoom = 1.0;
    double m_scrollLeftPx = 0.0;
    double m_scrollTopPx = 0.0;
    double m_viewportWidthPx = 0.0;
    double m_viewportHeightPx = 0.0;
    double m_contentEndMs = 0.0;
    double m_contentHeightPx = 0.0;
    double m_pendingZoomFactor = 1.0;
    double m_pendingCursorPx = 0.0;
    bool m_flushRequested = false;
    bool m_windowDirty = true;
    enum class Fit { Waiting, Decided, Done };
    Fit m_fit = Fit::Waiting;
    double m_fitMsPerPx = 0.0;
    int m_clipCount = 0;
    nt::ui::ClipWindow m_window;
    int m_flushCount = 0;
    int m_clipWindowUpdates = 0;
};
