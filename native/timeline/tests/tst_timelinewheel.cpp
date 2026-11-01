// The pure zoom, scroll and label math of the tracks region, with the cases of
// the web tests it copies:
//   web/src/components/timeline/Tracks/__tests__/timelineWheel.test.ts
//   web/src/components/timeline/Tracks/__tests__/TimelineScrollbar.test.ts
//   web/src/components/timeline/Tracks/__tests__/formatTimecode.test.ts
//   web/src/components/timeline/Tracks/__tests__/playheadPill.test.ts
#include "ui/TimelineFormat.h"
#include "ui/TimelineWheel.h"

#include <QTest>

#include <cmath>

using namespace nt::ui;

namespace {

WheelSrc fakeWheel(double dx, double dy, bool ctrl = false, bool meta = false, bool shift = false) {
    WheelSrc w;
    w.deltaX = dx;
    w.deltaY = dy;
    w.ctrlKey = ctrl;
    w.metaKey = meta;
    w.shiftKey = shift;
    return w;
}

}  // namespace

class TestTimelineWheel : public QObject {
    Q_OBJECT

private slots:
    // ── partitionTimelineWheel ──
    void zoomsOnCtrlWheel() {
        const WheelMotion out = partitionTimelineWheel(fakeWheel(0, 120, true));
        QCOMPARE(out.zoomDelta, 120.0);
        QCOMPARE(out.scrollDelta, 0.0);
    }
    void zoomsOnCmdWheelOrPinch() {
        QCOMPARE(partitionTimelineWheel(fakeWheel(0, 8, false, true)).zoomDelta, 8.0);
        QCOMPARE(partitionTimelineWheel(fakeWheel(0, -14, true)).zoomDelta, -14.0);
    }
    void scrollsOnHorizontalSwipe() {
        const WheelMotion out = partitionTimelineWheel(fakeWheel(40, 6));
        QCOMPARE(out.zoomDelta, 0.0);
        QCOMPARE(out.scrollDelta, 40.0);
    }
    void leavesVerticalWheelAlone() {
        const WheelMotion out = partitionTimelineWheel(fakeWheel(3, 90));
        QCOMPARE(out.zoomDelta, 0.0);
        QCOMPARE(out.scrollDelta, 0.0);
    }
    void shiftWheelScrollsWithDeltaY() {
        const WheelMotion out = partitionTimelineWheel(fakeWheel(0, 30, false, false, true));
        QCOMPARE(out.zoomDelta, 0.0);
        QCOMPARE(out.scrollDelta, 30.0);
    }
    void shiftWheelPrefersDeltaX() {
        QCOMPARE(partitionTimelineWheel(fakeWheel(18, 30, false, false, true)).scrollDelta, 18.0);
    }
    void zoomWinsOverScroll() {
        const WheelMotion out = partitionTimelineWheel(fakeWheel(50, 10, true));
        QCOMPARE(out.zoomDelta, 10.0);
        QCOMPARE(out.scrollDelta, 0.0);
    }

    // ── normalizeWheelDeltaPx ──
    void pixelModePassesThrough() { QCOMPARE(normalizeWheelDeltaPx(120, DeltaMode::Pixel, 800), 120.0); }
    void lineModeScalesByLineHeight() { QCOMPARE(normalizeWheelDeltaPx(3, DeltaMode::Line, 800), 48.0); }
    void pageModeScalesByPage() { QCOMPARE(normalizeWheelDeltaPx(2, DeltaMode::Page, 800), 1600.0); }

    // ── wheelZoomFactor ──
    void pinchZoomsAtTwiceTheFingerScale() {
        // Chromium sends deltaY = -100 * ln(scale); a 2x pinch-out split into
        // the many small events a trackpad delivers.
        const int steps = 10;
        const double perEvent = (-100.0 * std::log(2.0)) / steps;
        double factor = 1.0;
        for (int i = 0; i < steps; ++i) factor *= wheelZoomFactor(perEvent, DeltaMode::Pixel, 1000);
        QVERIFY(std::abs(factor - 0.25) < 0.5e-6);
    }
    void capsAMouseNotch() {
        const double notch = wheelZoomFactor(100, DeltaMode::Pixel, 1000);
        QVERIFY(notch > 1.2);
        QVERIFY(notch < 1.4);
        QVERIFY(std::abs(wheelZoomFactor(-100, DeltaMode::Pixel, 1000) * notch - 1.0) < 0.5e-10);
    }
    void normalizesLineModeBeforeTheCap() {
        QVERIFY(std::abs(wheelZoomFactor(1, DeltaMode::Line, 1000) - std::exp(0.3)) < 0.5e-10);
    }
    // The native pinch maps to the Chromium pinch delta, so a 2x magnification
    // in total zooms by 4x as on the web.
    void nativePinchMatchesChromium() {
        QCOMPARE(pinchWheelDeltaY(1.0), -100.0 * std::log(2.0));
        double factor = 1.0;
        for (int i = 0; i < 10; ++i) factor *= wheelZoomFactor(pinchWheelDeltaY(std::pow(2.0, 0.1) - 1.0), DeltaMode::Pixel, 1000);
        QVERIFY(std::abs(factor - 0.25) < 1e-9);
    }

    // ── computeScrollThumb ──
    void notScrollableWhenContentFits() {
        const ScrollThumb t = computeScrollThumb(800, 1000, 0, 1000);
        QCOMPARE(t.scrollable, false);
        QCOMPARE(t.maxScroll, 0.0);
        QCOMPARE(t.thumbWidth, 1000.0);
        QCOMPARE(t.thumbLeft, 0.0);
    }
    void thumbIsTheVisibleFraction() {
        const ScrollThumb t = computeScrollThumb(2000, 1000, 0, 1000);
        QCOMPARE(t.scrollable, true);
        QCOMPARE(t.maxScroll, 1000.0);
        QCOMPARE(t.thumbWidth, 500.0);
        QCOMPARE(t.thumbTravel, 500.0);
        QCOMPARE(t.thumbLeft, 0.0);
    }
    void thumbFollowsScrollLeft() { QCOMPARE(computeScrollThumb(2000, 1000, 500, 1000).thumbLeft, 250.0); }
    void thumbClampsAtTheEnd() {
        const ScrollThumb t = computeScrollThumb(2000, 1000, 999999, 1000);
        QCOMPARE(t.thumbLeft, t.thumbTravel);
    }
    void thumbHasAMinimumWidth() { QVERIFY(computeScrollThumb(100000, 1000, 0, 1000).thumbWidth >= 28); }
    void notScrollableBeforeMeasure() { QCOMPARE(computeScrollThumb(2000, 0, 0, 0).scrollable, false); }
    void thumbDragAndTroughClick() {
        const ScrollThumb t = computeScrollThumb(2000, 1000, 0, 1000);
        // Half the thumb travel scrolls half the range.
        QCOMPARE(thumbDragScrollLeft(t, 0, 250), 500.0);
        QCOMPARE(thumbDragScrollLeft(t, 0, 10000), 1000.0);
        // A click centres the thumb on the pointer.
        QCOMPARE(troughClickScrollLeft(t, 500), 500.0);
        QCOMPARE(troughClickScrollLeft(t, 0), 0.0);
    }

    // ── anchored zoom and fit ──
    void anchoredZoomKeepsTheTimeUnderTheCursor() {
        // TracksRegionWheelZoom.test.tsx: scrollLeft 1000, msPerPx 10, a
        // ctrl-wheel of -100 at x 500 keeps 15 000 ms under the cursor.
        const double next = clampMsPerPx(10.0 * wheelZoomFactor(-100, DeltaMode::Pixel, 1000));
        QVERIFY(next < 10.0);
        const double anchorMs = (1000.0 + 500.0) * 10.0;
        QVERIFY(std::abs(anchoredScrollLeft(anchorMs, next, 500.0) - (15000.0 / next - 500.0)) < 1e-9);
        QCOMPARE(anchoredScrollLeft(100.0, 10.0, 500.0), 0.0);
    }
    void largeDeltaZoomsByABoundedFactor() {
        const double next = clampMsPerPx(10.0 * wheelZoomFactor(-2000, DeltaMode::Pixel, 1000));
        QVERIFY(next > 1.0);
        QVERIFY(next < 10.0);
    }
    void playheadStaysPinnedOnAButtonZoom() {
        // Playhead at 20 000 ms, 10 ms/px, scrollLeft 1500: viewport x 500.
        const double scroll = playheadPinnedScrollLeft(20000, 10, 8, 1500);
        QCOMPARE(20000.0 / 8.0 - scroll, 500.0);
    }
    void fitUsesTheViewportMinusPadding() {
        QCOMPARE(zoomToFitMsPerPx(60000, 1064), 60.0);
        QCOMPARE(zoomToFitMsPerPx(0, 1064), 0.0);
        QCOMPARE(zoomToFitMsPerPx(1000, 64), 0.0);
    }
    void totalWidthIsQuantized() {
        QCOMPARE(totalWidthPx(0, 10), 1000.0);
        // 60 s at 10 ms/px = 6000 px + 200 = 6200 -> 25 steps of 256 = 6400.
        QCOMPARE(totalWidthPx(60000, 10), 6400.0);
        QCOMPARE(maxScrollLeftPx(6400, 1000), 5400.0);
        QCOMPARE(maxScrollLeftPx(1000, 1500), 0.0);
    }
    void clipWindowHasTheOverscan() {
        const ClipWindow w = clipWindow(1000, 500, 10);
        QCOMPARE(w.startMs, (1000.0 - 324.0) * 10.0);
        QCOMPARE(w.endMs, (1000.0 + 500.0 + 320.0) * 10.0);
        QCOMPARE(clipWindow(100, 500, 10).startMs, 0.0);
        // A clip ending exactly at the window start is kept (>=), one starting
        // at the window end is not (<).
        QVERIFY(clipInWindow(0, w.startMs, w));
        QVERIFY(!clipInWindow(w.endMs, 10, w));
    }
    void autoScrollRampsInTheEdgeZone() {
        QCOMPARE(autoScrollSpeed(500, 0, 1000), 0.0);
        QCOMPARE(autoScrollSpeed(16, 0, 1000), -12.0);
        QCOMPARE(autoScrollSpeed(-50, 0, 1000), -24.0);
        QCOMPARE(autoScrollSpeed(1000, 0, 1000), 24.0);
    }

    // ── formatTimecode (TimeRuler) ──
    void rulerSecondsOrCoarser() {
        QCOMPARE(formatRulerTimecode(0, 1000), QStringLiteral("0:00"));
        QCOMPARE(formatRulerTimecode(5000, 1000), QStringLiteral("0:05"));
        QCOMPARE(formatRulerTimecode(90000, 5000), QStringLiteral("1:30"));
        QCOMPARE(formatRulerTimecode(605000, 60000), QStringLiteral("10:05"));
        QCOMPARE(formatRulerTimecode(2400), QStringLiteral("0:02"));
    }
    void rulerDecimals() {
        QCOMPARE(formatRulerTimecode(2000, 500), QStringLiteral("0:02.0"));
        QCOMPARE(formatRulerTimecode(2500, 500), QStringLiteral("0:02.5"));
        QCOMPARE(formatRulerTimecode(2000, 100), QStringLiteral("0:02.00"));
        QCOMPARE(formatRulerTimecode(2100, 100), QStringLiteral("0:02.10"));
        QCOMPARE(formatRulerTimecode(2200, 100), QStringLiteral("0:02.20"));
        QCOMPARE(formatRulerTimecode(2200, 200), QStringLiteral("0:02.20"));
        QCOMPARE(formatRulerTimecode(9900, 100), QStringLiteral("0:09.90"));
        QCOMPARE(formatRulerTimecode(61500, 500), QStringLiteral("1:01.5"));
        QCOMPARE(formatRulerTimecode(70000, 100), QStringLiteral("1:10.00"));
    }
    void rulerFrames() {
        QCOMPARE(formatRulerTimecode(2000, 500, 30), QStringLiteral("0:02:00"));
        QCOMPARE(formatRulerTimecode(2500, 500, 30), QStringLiteral("0:02:15"));
        QCOMPARE(formatRulerTimecode(2080, 100, 25), QStringLiteral("0:02:02"));
        QCOMPARE(formatRulerTimecode(61500, 500, 24), QStringLiteral("1:01:12"));
        QCOMPARE(formatRulerTimecode(5000, 1000, 30), QStringLiteral("0:05"));
        QCOMPARE(formatRulerTimecode(60000, 100, 29.97), QStringLiteral("0:59:28"));
        QCOMPARE(formatRulerTimecode(60500, 100, 23.976), QStringLiteral("1:00:11"));
        QCOMPARE(formatRulerTimecode(60020, 100, 23.976), QStringLiteral("0:59:23"));
    }
    void tickIntervals() {
        // 60 px at 10 ms/px is 600 ms: the next candidate is 1 s.
        QCOMPARE(computeTickIntervals(10).majorMs, 1000.0);
        QCOMPARE(computeTickIntervals(10).minorMs, 200.0);
        QCOMPARE(computeTickIntervals(0.5).majorMs, 100.0);
        QCOMPARE(computeTickIntervals(500).majorMs, 30000.0);
        QCOMPARE(computeTickIntervals(100000).majorMs, 600000.0);
    }

    // ── playhead pill ──
    void playheadTimecode() {
        QCOMPARE(formatPlayheadTimecode(0, 30), QStringLiteral("00:00:00:00"));
        QCOMPARE(formatPlayheadTimecode(1500, 30), QStringLiteral("00:00:01:15"));
        QCOMPARE(formatPlayheadTimecode(3723000 + 500, 24), QStringLiteral("01:02:03:12"));
    }
    void pillShift() {
        QCOMPARE(pillShiftPx(400, 80, 1000), 0.0);
        QCOMPARE(pillShiftPx(0, 80, 1000), 40.0);
        QCOMPARE(pillShiftPx(10, 80, 1000), 30.0);
        QCOMPARE(pillShiftPx(1000, 80, 1000), -40.0);
        QCOMPARE(pillShiftPx(-5, 80, 1000), 0.0);
        QCOMPARE(pillShiftPx(1005, 80, 1000), 0.0);
        QCOMPARE(pillShiftPx(0, 0, 1000), 0.0);
        QCOMPARE(pillShiftPx(0, 80, 0), 0.0);
    }

    // ── clip duration label ──
    void clipDuration() {
        QCOMPARE(formatClipDuration(4000), QStringLiteral("4.0s"));
        QCOMPARE(formatClipDuration(9950), QStringLiteral("9.9s"));
        QCOMPARE(formatClipDuration(12400), QStringLiteral("12s"));
        QCOMPARE(formatClipDuration(65000), QStringLiteral("1:05"));
    }
};

QTEST_APPLESS_MAIN(TestTimelineWheel)
#include "tst_timelinewheel.moc"
