// The tracks region (M2) in an offscreen window: the QML module loaded into a
// QQuickView on the offscreen platform with the software scene graph, so no
// window ever appears on screen. Synthetic Qt wheel, native-gesture and mouse
// events drive it; the assertions read the view state, the models and the
// item tree.
//
// Cases copied from the web tests in web/src/components/timeline/Tracks/__tests__/:
// TracksRegionWheelZoom, TracksRegionHorizontalVirtualization,
// TracksRegionVirtualization, TimelineScrollbar and timelineWheel.
#include "model/LaneClipModel.h"
#include "model/TimelineJson.h"
#include "model/TimelineModel.h"
#include "model/TrackWindowModel.h"
#include "preview/FfmpegSource.h"
#include "edit/ClipGestureController.h"
#include "edit/EditActions.h"
#include "playback/PlaybackClock.h"
#include "ui/RulerCanvas.h"
#include "ui/TimelineGestureArea.h"
#include "ui/TimelineViewState.h"
#include "ui/TimelineWheel.h"

#include <QGuiApplication>
#include <QFile>
#include <QKeyEvent>
#include <QUndoStack>
#include <QJsonArray>
#include <QJsonDocument>
#include <QJsonObject>
#include <QNativeGestureEvent>
#include <QPointer>
#include <QQmlEngine>
#include <QQuickItem>
#include <QQuickView>
#include <QRandomGenerator>
#include <QSignalSpy>
#include <QTest>
#include <QWheelEvent>
#include <QAbstractItemModelTester>
#include <qpa/qwindowsysteminterface.h>

#include <cmath>
#include <functional>
#include <memory>

using namespace nt::ui;

namespace {

constexpr int kRegionWidth = 1600;
constexpr int kRegionHeight = 600;
constexpr double kHeaderWidth = 320;
constexpr double kToolbar = 36;
constexpr double kRuler = 28;

struct Layout {
    int tracks = 0;
    int clipsPerTrack = 0;
    double clipStepMs = 1000;
    double clipDurationMs = 800;
    double clipStart(int k) const { return k * clipStepMs; }
};

// The fixture as the document JSON the server sends, parsed the way a load
// parses it, so the raw JSON the edits work on is there (D4).
QJsonObject makeTimelineJson(const Layout& layout) {
    QJsonArray tracks;
    QJsonArray clips;
    for (int i = 0; i < layout.tracks; ++i) {
        const QString trackId = QStringLiteral("track-%1").arg(i);
        const bool audio = i % 4 == 3;
        tracks.append(QJsonObject{{"id", trackId},
                                  {"name", QStringLiteral("Track %1").arg(i)},
                                  {"type", audio ? "audio" : "video"},
                                  {"index", i},
                                  {"visible", true},
                                  {"locked", false},
                                  {"muted", false}});
        for (int k = 0; k < layout.clipsPerTrack; ++k) {
            clips.append(QJsonObject{{"id", QStringLiteral("c-%1-%2").arg(i).arg(k)},
                                     {"trackId", trackId},
                                     {"name", QStringLiteral("Clip %1").arg(k)},
                                     {"startMs", layout.clipStart(k)},
                                     {"durationMs", layout.clipDurationMs},
                                     {"mediaType", audio ? "audio" : "video"},
                                     {"sourceType", "imported"},
                                     {"status", "generated"},
                                     {"versions", QJsonArray()},
                                     {"notModelled", QJsonObject{{"kept", k}}}});
        }
    }
    return {{"id", "ui"},       {"name", "ui"},     {"fps", 30},          {"width", 1920},
            {"height", 1080},   {"durationMs", layout.clipsPerTrack * layout.clipStepMs},
            {"tracks", tracks}, {"clips", clips},   {"markers", QJsonArray()}};
}

nt::Timeline parseTimeline(const QJsonObject& doc) {
    nt::ParseResult parsed = nt::parseTimelineJson(QJsonDocument(doc).toJson());
    if (!parsed.timeline) qFatal("fixture does not parse: %s", qPrintable(parsed.error));
    return *parsed.timeline;
}

nt::Timeline makeTimeline(const Layout& layout) {
    return parseTimeline(makeTimelineJson(layout));
}

void collect(QQuickItem* item, const std::function<void(QQuickItem*)>& fn) {
    fn(item);
    for (QQuickItem* child : item->childItems()) collect(child, fn);
}

void dropDeferredDeletes() {
    QCoreApplication::sendPostedEvents(nullptr, QEvent::DeferredDelete);
}

}  // namespace

class TestTracksUi : public QObject {
    Q_OBJECT

    TimelineModel* model = nullptr;
    PlaybackClock* clock = nullptr;
    std::unique_ptr<QQuickView> view;
    QQuickItem* region = nullptr;
    TimelineViewState* vs = nullptr;
    TrackWindowModel* rows = nullptr;
    Layout layout;

    void load(const Layout& l) {
        unload();
        layout = l;
        model = new TimelineModel(this);
        clock = new PlaybackClock(this);
        model->setTimeline(makeTimeline(l));
        clock->setDurationMs(model->contentEndMs());
        view = std::make_unique<QQuickView>();
        view->setInitialProperties({{QStringLiteral("timeline"), QVariant::fromValue(model)},
                                    {QStringLiteral("clock"), QVariant::fromValue(clock)}});
        view->loadFromModule("NodeTool.Timeline", "TracksRegion");
        QVERIFY2(view->status() == QQuickView::Ready, qPrintable(view->errors().isEmpty() ? QString() : view->errors().first().toString()));
        view->setResizeMode(QQuickView::SizeRootObjectToView);
        view->resize(kRegionWidth, kRegionHeight);
        view->show();
        QVERIFY(QTest::qWaitForWindowExposed(view.get()));
        region = view->rootObject();
        vs = region->findChild<TimelineViewState*>(QStringLiteral("timelineViewState"));
        rows = region->findChild<TrackWindowModel*>(QStringLiteral("trackWindowModel"));
        QVERIFY(vs && rows);
        frame();
    }

    void unload() {
        view.reset();
        delete model;
        delete clock;
        model = nullptr;
        clock = nullptr;
        dropDeferredDeletes();
    }

    // Renders one frame: polish (the view state's flush), sync, render.
    void frame() {
        QSignalSpy swapped(view.get(), &QQuickWindow::frameSwapped);
        view->update();
        QVERIFY(swapped.wait(2000));
        dropDeferredDeletes();
    }

    // A zoom set the way the web tests seed it: msPerPx with the playhead at 0
    // and the scroll at `scroll`.
    void seed(double msPerPx, double scroll) {
        vs->zoomTo(msPerPx, 0);
        vs->setScrollLeftPx(scroll);
        frame();
        QCOMPARE(vs->msPerPx(), msPerPx);
        QCOMPARE(vs->scrollLeftPx(), scroll);
    }

    // In region coordinates.
    QPointF lanesPoint(double viewportX, double rowsY = 20) const {
        return {kHeaderWidth + viewportX, kToolbar + kRuler + rowsY};
    }

    // Qt deltas: a trackpad pixel delta (Qt sign) or a mouse notch angle.
    void wheel(QPointF pos, QPoint pixelDelta, QPoint angleDelta, Qt::KeyboardModifiers mods = {}) {
        QWheelEvent ev(pos, view->mapToGlobal(pos), pixelDelta, angleDelta, Qt::NoButton, mods, Qt::NoScrollPhase,
                       false);
        QCoreApplication::sendEvent(view.get(), &ev);
    }

    void pinch(QPointF pos, double value) {
        static const QPointingDevice* touchpad = [] {
            auto* d = new QPointingDevice(QStringLiteral("test touchpad"), 4242, QInputDevice::DeviceType::TouchPad,
                                          QPointingDevice::PointerType::Finger, QInputDevice::Capability::Position, 2,
                                          0);
            QWindowSystemInterface::registerInputDevice(d);
            return d;
        }();
        QNativeGestureEvent ev(Qt::ZoomNativeGesture, touchpad, 2, pos, pos, view->mapToGlobal(pos), value, {}, 0);
        QCoreApplication::sendEvent(view.get(), &ev);
    }

    // Delegates are not QObject children of the region, so search the item tree.
    QQuickItem* itemNamed(const QString& name) const {
        QQuickItem* found = nullptr;
        collect(region, [&](QQuickItem* it) {
            if (!found && it->objectName() == name) found = it;
        });
        return found;
    }

    QList<QQuickItem*> itemsNamed(const QString& prefix) const {
        QList<QQuickItem*> out;
        collect(region, [&](QQuickItem* it) {
            if (it->objectName().startsWith(prefix)) out.append(it);
        });
        return out;
    }

    // The clips a correct culling keeps: every clip of every row in the track
    // window that intersects the clip window, computed from the fixture.
    int expectedClipItems() const {
        const ClipWindow w = vs->clipWindow();
        int perTrack = 0;
        for (int k = 0; k < layout.clipsPerTrack; ++k) {
            if (clipInWindow(layout.clipStart(k), layout.clipDurationMs, w)) ++perTrack;
        }
        return perTrack * (rows->windowEnd() - rows->windowStart());
    }

    QList<LaneClipModel*> laneModels() const {
        QList<LaneClipModel*> out;
        for (QQuickItem* lane : itemsNamed(QStringLiteral("trackLane-"))) {
            if (auto* m = lane->property("clipModel").value<LaneClipModel*>()) out.append(m);
        }
        return out;
    }


    // ── M4 helpers ──
    ClipGestureController* controller() const {
        return region->findChild<ClipGestureController*>(QStringLiteral("clipGestures"));
    }
    QPoint clipPoint(const QString& id, double localX, double localY = 20) {
        QQuickItem* c = itemNamed(QStringLiteral("clip-") + id);
        if (!c) qFatal("no clip %s", qPrintable(id));
        return c->mapToScene(QPointF(localX, localY)).toPoint();
    }
    void drag(QPoint from, QPoint to, int steps, Qt::KeyboardModifiers pressMods = {},
              Qt::KeyboardModifiers releaseMods = {}) {
        QTest::mousePress(view.get(), Qt::LeftButton, pressMods, from);
        for (int i = 1; i <= steps; ++i) QTest::mouseMove(view.get(), from + (to - from) * i / steps);
        QTest::mouseRelease(view.get(), Qt::LeftButton, releaseMods, to);
        frame();
    }
    QJsonObject clipJson(const QString& id) const {
        for (const QJsonValue& v : model->clipsJson())
            if (v.toObject().value("id").toString() == id) return v.toObject();
        return {};
    }
    QJsonArray toJsonArray(const nt::edit::ClipList& clips) const {
        QJsonArray out;
        for (const auto& c : clips) out.append(c);
        return out;
    }
    void key(int k, Qt::KeyboardModifiers mods = {}, const QString& text = {}, bool autoRepeat = false) {
        QKeyEvent press(QEvent::KeyPress, k, mods, text, autoRepeat);
        QCoreApplication::sendEvent(view.get(), &press);
        QKeyEvent release(QEvent::KeyRelease, k, mods, text, autoRepeat);
        QCoreApplication::sendEvent(view.get(), &release);
        frame();
    }

private slots:
    void cleanup() { unload(); }

    // ── Zoom ──
    // The expectations come from the web tests, not from the native formula:
    // TracksRegionWheelZoom.test.tsx (the anchor, a bounded large delta) and
    // timelineWheel.test.ts `wheelZoomFactor` (a 2x Chromium pinch zooms 4x; a
    // mouse notch is one step between x1.2 and x1.4, and equal opposite
    // notches cancel). The web code is web/src/components/timeline/Tracks/
    // timelineWheel.ts at e173cc68f6 on main (DESIGN.md D29).
    void ctrlWheelZoomsAtTheCursor() {
        load({8, 400});
        seed(10, 1000);
        // DOM deltaY -100 (one notch toward the user's screen) at clientX 500.
        wheel(lanesPoint(500), {0, 100}, {0, 120}, Qt::ControlModifier);
        frame();
        QVERIFY(vs->msPerPx() < 10);
        QVERIFY(vs->msPerPx() > 10 / 1.4);
        QVERIFY(vs->msPerPx() < 10 / 1.2);
        // The time under the cursor (1500 px x 10 ms) stays under the cursor.
        QVERIFY(std::abs(vs->scrollLeftPx() - (15000.0 / vs->msPerPx() - 500.0)) < 1e-6);
        // The opposite notch cancels exactly.
        wheel(lanesPoint(500), {0, -100}, {0, -120}, Qt::ControlModifier);
        frame();
        QVERIFY(std::abs(vs->msPerPx() - 10.0) < 1e-9);
    }

    void eventsInOneFrameApplyOnce() {
        load({8, 400});
        seed(10, 1000);
        const int flushes = vs->flushCount();
        QSignalSpy zoomSpy(vs, &TimelineViewState::msPerPxChanged);
        // A 2x pinch-out split into the 10 small events a trackpad delivers,
        // all inside one frame.
        for (int i = 0; i < 10; ++i) pinch(lanesPoint(400), std::pow(2.0, 0.1) - 1.0);
        QCOMPARE(zoomSpy.count(), 0);  // nothing applies before the frame
        frame();
        QCOMPARE(zoomSpy.count(), 1);
        QVERIFY(vs->flushCount() > flushes);
        // The web: a 2x pinch zooms by 4x.
        QVERIFY(std::abs(vs->msPerPx() - 2.5) < 1e-6);
    }

    void largeDeltaZoomsByABoundedFactor() {
        load({8, 400});
        seed(10, 0);
        // A mouse notch reported as a huge delta: DOM -2000.
        wheel(lanesPoint(500), {0, 2000}, {0, 0}, Qt::ControlModifier);
        frame();
        QVERIFY(vs->msPerPx() > 1);
        QVERIFY(vs->msPerPx() < 10);
        // Capped: no more than one notch.
        QVERIFY(vs->msPerPx() > 10 / 1.4);
    }

    void mouseNotchIsAChromiumNotch() {
        load({8, 400});
        seed(10, 0);
        // One notch away from the user: angle +120, DOM deltaY -100.
        wheel(lanesPoint(0), {}, {0, 120}, Qt::ControlModifier);
        frame();
        QVERIFY(vs->msPerPx() > 10 / 1.4);
        QVERIFY(vs->msPerPx() < 10 / 1.2);
    }

    void pinchOverTheRulerZooms() {
        load({8, 400});
        seed(10, 0);
        wheel(QPointF(kHeaderWidth + 400, kToolbar + 10), {0, 100}, {}, Qt::ControlModifier);
        frame();
        QVERIFY(vs->msPerPx() < 10);
    }

    void nativePinchZoomsAtTheFingers() {
        load({8, 400});
        seed(10, 2000);
        pinch(lanesPoint(600), 0.1);
        frame();
        auto* area = region->findChild<TimelineGestureArea*>(QStringLiteral("timelineGestureArea"));
        QCOMPARE(area->gestureEvents(), 1);
        // The web zooms by the square of the finger scale.
        QVERIFY(std::abs(vs->msPerPx() - 10.0 / (1.1 * 1.1)) < 1e-9);
        QVERIFY(std::abs(vs->timeAtViewportX(600) - (2000.0 + 600.0) * 10.0) < 1e-6);
    }

    void zoomButtonsKeepThePlayheadPinned() {
        load({8, 400});
        seed(10, 1500);
        clock->seek(20000);  // viewport x 500
        auto* zoomIn = region->findChild<QQuickItem*>(QStringLiteral("zoomIn"));
        QVERIFY(zoomIn);
        const QPointF p = zoomIn->mapToScene(QPointF(zoomIn->width() / 2, zoomIn->height() / 2));
        QTest::mouseClick(view.get(), Qt::LeftButton, {}, p.toPoint());
        frame();
        QCOMPARE(vs->msPerPx(), 8.0);
        QVERIFY(std::abs(20000.0 / vs->msPerPx() - vs->scrollLeftPx() - 500.0) < 1e-9);
    }

    void zoomToFitShowsAllContent() {
        load({8, 400});
        seed(10, 3000);
        vs->zoomToFit();
        frame();
        QCOMPARE(vs->scrollLeftPx(), 0.0);
        QCOMPARE(vs->msPerPx(), model->contentEndMs() / (vs->viewportWidthPx() - 64));
    }

    void opensFittedWhenTheContentOverflows() {
        load({8, 400});
        // 400 s at 10 ms/px is 40 000 px: the first layout fits it.
        QCOMPARE(vs->msPerPx(), model->contentEndMs() / (vs->viewportWidthPx() - 64));
    }

    // ── Pan and scroll ──
    void horizontalSwipePansTheLanes() {
        load({8, 400});
        seed(10, 1000);
        // Trackpad swipe left: Qt pixel delta x -40 is DOM deltaX +40.
        wheel(lanesPoint(300), {-40, -6}, {});
        frame();
        QCOMPARE(vs->scrollLeftPx(), 1040.0);
        QCOMPARE(vs->scrollTopPx(), 0.0);
    }

    void shiftWheelPansTheLanes() {
        load({8, 400});
        seed(10, 1000);
        wheel(lanesPoint(300), {0, -30}, {}, Qt::ShiftModifier);
        frame();
        QCOMPARE(vs->scrollLeftPx(), 1030.0);
    }

    void verticalWheelScrollsTheTracks() {
        load({40, 50});
        seed(10, 0);
        wheel(lanesPoint(300), {0, -90}, {});
        frame();
        QCOMPARE(vs->scrollTopPx(), 90.0);
        // Over the headers: forwarded to the lanes.
        wheel(QPointF(100, kToolbar + kRuler + 50), {0, -60}, {});
        frame();
        QCOMPARE(vs->scrollTopPx(), 150.0);
        // A plain wheel over the ruler is not the region's.
        wheel(QPointF(kHeaderWidth + 300, kToolbar + 10), {0, -60}, {});
        frame();
        QCOMPARE(vs->scrollTopPx(), 150.0);
        QCOMPARE(vs->scrollLeftPx(), 0.0);
    }

    void scrollStopsAtTheContentEdge() {
        load({8, 400});
        seed(10, 0);
        vs->setScrollLeftPx(1e9);
        QCOMPARE(vs->scrollLeftPx(), vs->maxScrollLeftPx());
        QCOMPARE(vs->maxScrollLeftPx(), totalWidthPx(model->contentEndMs(), 10) - vs->viewportWidthPx());
    }

    // ── Scrollbar (TimelineScrollbar.tsx) ──
    void scrollbarThumbDragAndTroughClick() {
        load({8, 400});
        seed(10, 0);
        auto* thumb = region->findChild<QQuickItem*>(QStringLiteral("scrollbarThumb"));
        QVERIFY(thumb);
        const ScrollThumb t = computeScrollThumb(vs->totalWidthPx(), vs->viewportWidthPx(), 0, vs->viewportWidthPx());
        QCOMPARE(thumb->width(), t.thumbWidth);
        QCOMPARE(thumb->x(), 0.0);
        const QPoint start = thumb->mapToScene(QPointF(thumb->width() / 2, 4)).toPoint();
        QTest::mousePress(view.get(), Qt::LeftButton, {}, start);
        for (int dx = 10; dx <= 100; dx += 10) QTest::mouseMove(view.get(), start + QPoint(dx, 0));
        QTest::mouseRelease(view.get(), Qt::LeftButton, {}, start + QPoint(100, 0));
        frame();
        const double expected = thumbDragScrollLeft(t, 0, 100);
        QCOMPARE(vs->scrollLeftPx(), expected);
        QVERIFY(std::abs(thumb->x() - expected / t.maxScroll * t.thumbTravel) < 1e-9);

        // A trough click centres the thumb on the pointer.
        auto* trough = region->findChild<QQuickItem*>(QStringLiteral("scrollbarTrough"));
        const ScrollThumb now = computeScrollThumb(vs->totalWidthPx(), vs->viewportWidthPx(), vs->scrollLeftPx(), vs->viewportWidthPx());
        const QPoint click = trough->mapToScene(QPointF(900, 4)).toPoint();
        QTest::mouseClick(view.get(), Qt::LeftButton, {}, click);
        frame();
        QCOMPARE(vs->scrollLeftPx(), troughClickScrollLeft(now, 900));
    }

    // ── Ruler seek ──
    void rulerClickSeeksAndDragScrubs() {
        load({8, 400});
        seed(10, 1000);
        const QPoint p(static_cast<int>(kHeaderWidth + 200), static_cast<int>(kToolbar + 10));
        QTest::mousePress(view.get(), Qt::LeftButton, {}, p);
        QCOMPARE(clock->time(), (200.0 + 1000.0) * 10.0);
        QTest::mouseMove(view.get(), p + QPoint(50, 0));
        QCOMPARE(clock->time(), (250.0 + 1000.0) * 10.0);
        QTest::mouseRelease(view.get(), Qt::LeftButton, {}, p + QPoint(50, 0));
        // The playhead line sits under the click.
        auto* playhead = region->findChild<QQuickItem*>(QStringLiteral("playhead"));
        frame();
        QCOMPARE(playhead->x() + 8, 250.0);
    }

    // ── Vertical virtualization (TracksRegionVirtualization.test.tsx) ──
    void mountsOnlyTheVisibleRows() {
        load({319, 2});
        const double rowsHeight = kRegionHeight - kToolbar - kRuler - 14;
        const int visibleRows = static_cast<int>(std::ceil(rowsHeight / 64.0));
        QCOMPARE(itemsNamed(QStringLiteral("trackHeader-")).size(), visibleRows + 3);
        QCOMPARE(itemsNamed(QStringLiteral("trackLane-")).size(), visibleRows + 3);
        vs->setScrollTopPx(200 * 64);
        frame();
        QVERIFY(itemNamed(QStringLiteral("trackHeader-track-200")) != nullptr);
        QVERIFY(itemNamed(QStringLiteral("trackHeader-track-0")) == nullptr);
        QVERIFY(itemsNamed(QStringLiteral("trackHeader-")).size() < 20);
        QCOMPARE(rows->contentHeight(), 319.0 * 64.0);
        // Header and lane of a row share the vertical position.
        auto* header = itemNamed(QStringLiteral("trackHeader-track-200"));
        auto* lane = itemNamed(QStringLiteral("trackLane-track-200"));
        QCOMPARE(header->mapToScene({0, 0}).y(), lane->mapToScene({0, 0}).y());
        QCOMPARE(header->mapToScene({0, 0}).y(), kToolbar + kRuler);
    }

    void visibleTrackWindowMatchesTheWeb() {
        // trackWindow.ts on 10 rows of 64 px with one of 120 px.
        std::vector<double> tops;
        std::vector<double> heights;
        double top = 0;
        for (int i = 0; i < 10; ++i) {
            const double h = i == 4 ? 120 : 64;
            tops.push_back(top);
            heights.push_back(h);
            top += h;
        }
        nt::TrackWindow w = nt::visibleTrackWindow(tops, heights, 0, 100);
        QCOMPARE(w.start, 0);
        QCOMPARE(w.end, 5);
        QCOMPARE(w.top, 0.0);
        QCOMPARE(w.bottom, top - tops[5]);
        w = nt::visibleTrackWindow(tops, heights, 300, 100);
        // Row 4 (256..376) holds the scroll; rows 1..7 with 3 of overscan.
        QCOMPARE(w.start, 1);
        QCOMPARE(w.end, 9);
        w = nt::visibleTrackWindow({}, {}, 0, 100);
        QCOMPARE(w.start, 0);
        QCOMPARE(w.end, 0);
    }

    void verticalZoomScalesRowsAndKeepsTheTopRow() {
        load({100, 2});
        vs->setScrollTopPx(10 * 64 + 32);  // half way into row 10
        frame();
        vs->setVerticalZoom(1.5);
        frame();
        QCOMPARE(rows->contentHeight(), 100 * 96.0);
        QCOMPARE(vs->scrollTopPx(), 10 * 96.0 + 48.0);
        auto* lane = itemNamed(QStringLiteral("trackLane-track-10"));
        QCOMPARE(lane->height(), 96.0);
    }

    // ── Horizontal virtualization (TracksRegionHorizontalVirtualization.test.tsx) ──
    void windowsSparseTracksAsTheTimelineScrolls() {
        load({1, 10});
        // 10 clips of 500 ms every second, a 500 px viewport at 10 ms/px.
        view->resize(static_cast<int>(kHeaderWidth + 500), kRegionHeight);
        frame();
        seed(10, 0);
        QVERIFY(itemNamed(QStringLiteral("clip-c-0-0")));
        QVERIFY(!itemNamed(QStringLiteral("clip-c-0-9")));
        vs->setScrollLeftPx(700);
        frame();
        // maxScroll clamps 700 to the content: 10 s -> 1000 px + 200 -> 1280 - 500.
        QCOMPARE(vs->scrollLeftPx(), 700.0);
        QVERIFY(!itemNamed(QStringLiteral("clip-c-0-0")));
        QVERIFY(itemNamed(QStringLiteral("clip-c-0-9")));
    }

    void culledClipCountStaysBoundedOnALargeTimeline_data() {
        QTest::addColumn<int>("tracks");
        QTest::addColumn<int>("clipsPerTrack");
        QTest::newRow("50 tracks x 200 clips") << 50 << 200;
        QTest::newRow("200 tracks, 2000 clips") << 200 << 10;
    }
    void culledClipCountStaysBoundedOnALargeTimeline() {
        QFETCH(int, tracks);
        QFETCH(int, clipsPerTrack);
        load({tracks, clipsPerTrack});
        QRandomGenerator rng(42);
        int maxSeen = 0;
        for (int step = 0; step < 40; ++step) {
            switch (step % 4) {
            case 0: vs->setScrollLeftPx(rng.bounded(vs->maxScrollLeftPx() + 1)); break;
            case 1: vs->setScrollTopPx(rng.bounded(vs->maxScrollTopPx() + 1)); break;
            case 2: vs->zoomTo(0.5 + rng.bounded(40.0), 0); break;
            case 3: wheel(lanesPoint(rng.bounded(1200)), {0, rng.bounded(30) - 15}, {}, Qt::ControlModifier); break;
            }
            frame();
            const int items = itemsNamed(QStringLiteral("clip-")).size();
            const int expected = expectedClipItems();
            QCOMPARE(items, expected);
            maxSeen = std::max(maxSeen, items);
        }
        // At the default zoom a lane holds a few screens of clips, whatever
        // the document length.
        vs->zoomTo(10, 0);
        frame();
        const int atDefault = itemsNamed(QStringLiteral("clip-")).size();
        QCOMPARE(atDefault, expectedClipItems());
        QVERIFY2(atDefault * 10 < tracks * clipsPerTrack, qPrintable(QString::number(atDefault)));
        qInfo("instantiated clips: max %d over the script, %d at 10 ms/px, of %d", maxSeen, atDefault,
              tracks * clipsPerTrack);
    }

    // D28: a dragged clip keeps its delegate and its grab past the window and
    // the overscan, and the drop lands at the pointer.
    void draggedClipSurvivesPastTheOverscan() {
        load({4, 400});
        seed(10, 0);
        QPointer<QQuickItem> clip = itemNamed(QStringLiteral("clip-c-0-2"));
        QVERIFY(clip);
        auto* gestures = region->findChild<QQuickItem*>(QStringLiteral("clipGestures"));
        QVERIFY(gestures);
        auto* laneModel = laneModels().first();
        const QPoint press = clip->mapToScene(QPointF(20, 20)).toPoint();
        QTest::mousePress(view.get(), Qt::LeftButton, {}, press);
        QTest::mouseMove(view.get(), press + QPoint(10, 0));
        QTest::mouseMove(view.get(), press + QPoint(40, 0));
        QCOMPARE(laneModel->pinnedClipId(), QStringLiteral("c-0-2"));
        // Scroll the clip's own place far past the window and the overscan.
        const double scroll = 20000;
        vs->setScrollLeftPx(scroll);
        frame();
        frame();
        const double clipEndPx = (2000.0 + 800.0) / 10.0;
        QVERIFY(clipEndPx < vs->clipWindowStartMs() / 10.0);
        QVERIFY2(clip, "the dragged clip's delegate was destroyed");
        // The gesture controller holds the pointer, whatever the delegate does.
        QCOMPARE(view->mouseGrabberItem(), gestures);
        QTest::mouseMove(view.get(), press + QPoint(60, 0));
        QTest::mouseRelease(view.get(), Qt::LeftButton, {}, press + QPoint(60, 0));
        frame();
        // Pointer travel 60 px plus scroll travel 20 000 px at 10 ms/px.
        const double expectedStart = 2000.0 + (60.0 + scroll) * 10.0;
        const nt::Clip* moved = nullptr;
        for (const auto& c : model->timeline().clips)
            if (c.id == "c-0-2") moved = &c;
        QCOMPARE(moved->startMs, expectedStart);
        // The drop is under the pointer: the time at the pointer minus the
        // grab offset inside the clip.
        const double pointerViewportX = press.x() + 60 - kHeaderWidth;
        QCOMPARE(vs->timeAtViewportX(pointerViewportX) - 20.0 * 10.0, expectedStart);
        QCOMPARE(laneModel->pinnedClipId(), QString());
        QVERIFY(clip);  // now inside the window at its new place
        QCOMPARE(clip->x() - vs->scrollLeftPx(), expectedStart / 10.0 - scroll);
    }

    // The same drag with the pin removed: the delegate dies with the window.
    // This is the failure the pin prevents.
    void withoutThePinTheDelegateDies() {
        load({4, 400});
        seed(10, 0);
        QPointer<QQuickItem> clip = itemNamed(QStringLiteral("clip-c-0-2"));
        auto* laneModel = laneModels().first();
        const QPoint press = clip->mapToScene(QPointF(20, 20)).toPoint();
        QTest::mousePress(view.get(), Qt::LeftButton, {}, press);
        QTest::mouseMove(view.get(), press + QPoint(40, 0));
        laneModel->setPinnedClipId(QString());
        vs->setScrollLeftPx(20000);
        frame();
        frame();
        QVERIFY(!clip);
        QTest::mouseRelease(view.get(), Qt::LeftButton, {}, press + QPoint(40, 0));
    }

    void moveKeepsTheDelegate() {
        load({2, 20});
        seed(10, 0);
        QPointer<QQuickItem> clip = itemNamed(QStringLiteral("clip-c-0-1"));
        QVERIFY(model->moveClip(QStringLiteral("c-0-1"), 3500));
        frame();
        QVERIFY(clip);
        QCOMPARE(clip->x(), 350.0);
    }

    // D30: playback moves the playhead and nothing else.
    void playbackTouchesNoModelOrDelegate() {
        load({50, 200});
        seed(10, 0);
        auto* ruler = region->findChild<RulerCanvas*>(QStringLiteral("rulerCanvas"));
        auto* playhead = region->findChild<QQuickItem*>(QStringLiteral("playhead"));
        const QList<LaneClipModel*> lanes = laneModels();
        QVERIFY(!lanes.isEmpty());
        struct Counters {
            int laneRecomputes = 0;
            int rowWindowUpdates = 0;
            int clipWindowUpdates = 0;
            int rulerPaints = 0;
            int clipItems = 0;
        };
        const auto read = [&]() {
            Counters c;
            for (LaneClipModel* m : lanes) c.laneRecomputes += m->recomputeCount();
            c.rowWindowUpdates = rows->windowUpdates();
            c.clipWindowUpdates = vs->clipWindowUpdates();
            c.rulerPaints = ruler->paintCount();
            c.clipItems = itemsNamed(QStringLiteral("clip-")).size();
            return c;
        };
        std::vector<std::unique_ptr<QSignalSpy>> dataSpies;
        for (LaneClipModel* m : lanes) dataSpies.push_back(std::make_unique<QSignalSpy>(m, &QAbstractItemModel::dataChanged));
        QSignalSpy rowData(rows, &QAbstractItemModel::dataChanged);
        QList<QPointer<QQuickItem>> clipsBefore;
        for (QQuickItem* it : itemsNamed(QStringLiteral("clip-"))) clipsBefore.append(it);

        const Counters before = read();
        const double x0 = playhead->x();
        clock->play();
        for (int i = 0; i < 60; ++i) {
            QTest::qWait(5);
            clock->tick();
            frame();
        }
        clock->pause();
        // A seek and a scrub over the ruler move the playhead too.
        clock->seek(9000);
        frame();
        const Counters after = read();
        QVERIFY(playhead->x() != x0);
        QCOMPARE(after.laneRecomputes, before.laneRecomputes);
        QCOMPARE(after.rowWindowUpdates, before.rowWindowUpdates);
        QCOMPARE(after.clipWindowUpdates, before.clipWindowUpdates);
        QCOMPARE(after.rulerPaints, before.rulerPaints);
        QCOMPARE(after.clipItems, before.clipItems);
        for (const auto& spy : dataSpies) QCOMPARE(spy->count(), 0);
        QCOMPARE(rowData.count(), 0);
        for (const auto& p : clipsBefore) QVERIFY(p);

        // The counters do move on a scroll: the check can fail.
        vs->setScrollLeftPx(5000);
        frame();
        const Counters scrolled = read();
        QVERIFY(scrolled.laneRecomputes > after.laneRecomputes);
        QVERIFY(scrolled.clipWindowUpdates > after.clipWindowUpdates);
        QVERIFY(scrolled.rulerPaints > after.rulerPaints);
    }

    // F2: a scroll during a drag, then a release with no move: the drop is
    // still under the pointer (useClipDrag reapplies the move before commit).
    void dropAfterAScrollWithoutAMoveLandsAtThePointer() {
        load({4, 400});
        seed(10, 0);
        QQuickItem* clip = itemNamed(QStringLiteral("clip-c-0-2"));
        QVERIFY(clip);
        const QPoint press = clip->mapToScene(QPointF(20, 20)).toPoint();
        QTest::mousePress(view.get(), Qt::LeftButton, {}, press);
        QTest::mouseMove(view.get(), press + QPoint(10, 0));
        QTest::mouseMove(view.get(), press + QPoint(40, 0));
        vs->setScrollLeftPx(3000);
        frame();
        QTest::mouseRelease(view.get(), Qt::LeftButton, {}, press + QPoint(40, 0));
        frame();
        double start = -1;
        for (const auto& c : model->timeline().clips)
            if (c.id == "c-0-2") start = c.startMs;
        QCOMPARE(start, 2000.0 + (40.0 + 3000.0) * 10.0);
    }

    // F3: replacing a scrolled document with a shorter one resets the row
    // model without row signals inside the reset.
    void replacingWithAShorterDocumentKeepsTheRowModelValid() {
        load({100, 2});
        QAbstractItemModelTester tester(rows, QAbstractItemModelTester::FailureReportingMode::QtTest);
        vs->setScrollTopPx(90 * 64);
        frame();
        QSignalSpy inserted(rows, &QAbstractItemModel::rowsInserted);
        QSignalSpy aboutToReset(rows, &QAbstractItemModel::modelAboutToBeReset);
        QSignalSpy reset(rows, &QAbstractItemModel::modelReset);
        bool insertedInsideReset = false;
        connect(rows, &QAbstractItemModel::rowsAboutToBeInserted, this,
                [&]() { insertedInsideReset = insertedInsideReset || aboutToReset.count() > reset.count(); });
        model->setTimeline(makeTimeline({10, 2}));
        frame();
        QVERIFY(!insertedInsideReset);
        QCOMPARE(vs->scrollTopPx(), vs->maxScrollTopPx());
        QCOMPARE(rows->rowCount(), rows->windowEnd() - rows->windowStart());
        QCOMPARE(itemsNamed(QStringLiteral("trackHeader-")).size(), rows->rowCount());
        QVERIFY(rows->rowCount() > 0);
    }

    // F7: a lane model follows a replaced document without being recreated.
    void laneModelFollowsADocumentReplacement() {
        TimelineModel doc;
        doc.setTimeline(makeTimeline({1, 5}));
        TimelineViewState state;
        state.setViewportWidthPx(100000);
        state.flush();
        LaneClipModel lane;
        lane.setTimeline(&doc);
        lane.setTrackId(QStringLiteral("track-0"));
        lane.setViewState(&state);
        QCOMPARE(lane.count(), 5);
        const std::weak_ptr<const nt::Timeline> first = doc.snapshot();
        doc.setTimeline(makeTimeline({1, 3}));
        QCOMPARE(lane.count(), 3);
        QCOMPARE(lane.trackClipCount(), 3);
        QVERIFY2(first.expired(), "the lane model still holds the replaced document");
        doc.close();
        QCOMPARE(lane.count(), 0);
    }

    // F6: the first content decides the fit; an edit that moves the content
    // end does not rezoom, a resize still refits.
    void contentEditsDoNotRefit() {
        load({8, 200});
        const double fitted = vs->msPerPx();
        QCOMPARE(fitted, model->contentEndMs() / (vs->viewportWidthPx() - 64));
        QVERIFY(model->moveClip(QStringLiteral("c-0-199"), 300000));
        frame();
        QCOMPARE(vs->msPerPx(), fitted);
        view->resize(kRegionWidth - 400, kRegionHeight);
        frame();
        QCOMPARE(vs->msPerPx(), model->contentEndMs() / (vs->viewportWidthPx() - 64));
        // After a manual zoom nothing refits.
        vs->zoomTo(20, 0);
        view->resize(kRegionWidth, kRegionHeight);
        frame();
        QCOMPARE(vs->msPerPx(), 20.0);
    }

    // F8: a long transition draws only the stripes in view.
    void transitionStripesAreBoundedByTheViewport() {
        unload();
        layout = {1, 1, 1000, 120000};
        model = new TimelineModel(this);
        clock = new PlaybackClock(this);
        QJsonObject json = makeTimelineJson(layout);
        QJsonArray clips = json.value("clips").toArray();
        QJsonObject firstClip = clips.at(0).toObject();
        firstClip.insert("transitionIn", QJsonObject{{"type", "crossfade"}, {"durationMs", 60000}});
        clips.replace(0, firstClip);
        json.insert("clips", clips);
        model->setTimeline(parseTimeline(json));
        view = std::make_unique<QQuickView>();
        view->setInitialProperties({{QStringLiteral("timeline"), QVariant::fromValue(model)},
                                    {QStringLiteral("clock"), QVariant::fromValue(clock)}});
        view->loadFromModule("NodeTool.Timeline", "TracksRegion");
        view->setResizeMode(QQuickView::SizeRootObjectToView);
        view->resize(kRegionWidth, kRegionHeight);
        view->show();
        QVERIFY(QTest::qWaitForWindowExposed(view.get()));
        region = view->rootObject();
        vs = region->findChild<TimelineViewState*>(QStringLiteral("timelineViewState"));
        rows = region->findChild<TrackWindowModel*>(QStringLiteral("trackWindowModel"));
        frame();
        seed(0.5, 0);
        QQuickItem* wedge = itemNamed(QStringLiteral("transitionWedge"));
        QVERIFY(wedge);
        QCOMPARE(wedge->width(), 120000.0);
        const int stripes = wedge->property("stripeCount").toInt();
        const double step = 6 * std::sqrt(2.0);
        const int bound = static_cast<int>((vs->viewportWidthPx() + wedge->height()) / step) + 4;
        QVERIFY2(stripes > 0 && stripes <= bound, qPrintable(QStringLiteral("%1 stripes, bound %2").arg(stripes).arg(bound)));
        // Scrolled to the middle, the stripes still cover the viewport.
        vs->setScrollLeftPx(50000);
        frame();
        QVERIFY(wedge->property("stripeCount").toInt() <= bound);
        const double first = wedge->property("firstStripeX").toDouble();
        QVERIFY(first <= 50000);
        QVERIFY(first + wedge->height() + step > 50000);
    }

    // ── M4: editing ──

    // A drag of any length is one undo entry, applied live on every move.
    void aDragIsOneUndoEntry() {
        load({4, 20});
        seed(10, 0);
        QUndoStack* undo = model->undoStack();
        const int entries = undo->count();
        const int live = controller()->liveUpdates();
        const QByteArray before = model->documentJson();
        drag(clipPoint("c-0-2", 30), clipPoint("c-0-2", 30) + QPoint(237, 0), 60, Qt::AltModifier);
        QCOMPARE(undo->count(), entries + 1);
        QVERIFY2(controller()->liveUpdates() - live > 30, "the lanes did not follow the drag live");
        QCOMPARE(clipJson("c-0-2").value("startMs").toDouble(), 2000.0 + 2370.0);
        undo->undo();
        frame();
        QCOMPARE(model->documentJson(), before);
    }

    // A trim gesture gives the document the store action gives (the actions
    // are checked against the web store by scripts/op-conformance.mjs).
    void trimGesturesMatchTheStoreActions() {
        load({4, 20, 800, 800});  // abutting clips: every edge is a cut
        seed(10, 0);
        auto* g = controller();
        g->setSnapEnabled(false);
        const auto doc0 = g->editDoc();
        // Plain trim of the end edge by 50 px (500 ms).
        drag(clipPoint("c-0-2", 76), clipPoint("c-0-2", 76) + QPoint(50, 0), 10);
        QCOMPARE(model->clipsJson(), toJsonArray(nt::edit::trimClipEnd(doc0, "c-0-2", 500, std::nullopt, true)));
        model->undoStack()->undo();
        frame();
        // Ripple mode: the later clips follow.
        g->setRippleMode(true);
        drag(clipPoint("c-0-2", 76), clipPoint("c-0-2", 76) + QPoint(-30, 0), 10);
        QCOMPARE(model->clipsJson(),
                 toJsonArray(nt::edit::rippleTrimClipEnd(doc0, "c-0-2", -300, std::nullopt, true)));
        model->undoStack()->undo();
        frame();
        g->setRippleMode(false);
        // Ctrl/Cmd rolls the cut with the neighbour.
        drag(clipPoint("c-0-2", 76), clipPoint("c-0-2", 76) + QPoint(20, 0), 10, Qt::ControlModifier);
        QCOMPARE(model->clipsJson(),
                 toJsonArray(nt::edit::rollClipEdge(doc0, "c-0-2", "end", 200, std::nullopt, true)));
        model->undoStack()->undo();
        frame();
        // A head trim.
        drag(clipPoint("c-0-2", 3), clipPoint("c-0-2", 3) + QPoint(20, 0), 10);
        QCOMPARE(model->clipsJson(), toJsonArray(nt::edit::trimClipStart(doc0, "c-0-2", -200, true)));
        const QStringList modes{ClipGestureController::trimModeFor("select", false, false),
                                ClipGestureController::trimModeFor("select", false, true),
                                ClipGestureController::trimModeFor("select", true, true),
                                ClipGestureController::trimModeFor("ripple", false, false),
                                ClipGestureController::trimModeFor("roll", false, false),
                                ClipGestureController::trimModeFor("rateStretch", true, true)};
        QCOMPARE(modes, (QStringList{"trim", "ripple", "roll", "ripple", "roll", "stretch"}));
    }

    // Both clip edges snap within 8 px to clip edges, the playhead and the
    // 1 s ticks; Alt (or the magnet off) moves freely.
    void moveSnapsBothEdges() {
        load({2, 10});
        seed(10, 0);
        // 17 px: start 2170 (no candidate within 80 ms), end 2970 -> 3000.
        drag(clipPoint("c-0-2", 30), clipPoint("c-0-2", 30) + QPoint(17, 0), 6);
        QCOMPARE(clipJson("c-0-2").value("startMs").toDouble(), 2200.0);
        model->undoStack()->undo();
        frame();
        drag(clipPoint("c-0-2", 30), clipPoint("c-0-2", 30) + QPoint(17, 0), 6, Qt::AltModifier);
        QCOMPARE(clipJson("c-0-2").value("startMs").toDouble(), 2170.0);
        QCOMPARE(controller()->snapGuideMs(), -1.0);
    }

    // A clip follows the pointer onto another lane whose type takes it, and
    // the overwrite drop clears what it lands on there.
    void moveAcrossLanes() {
        load({4, 10});
        seed(10, 0);
        drag(clipPoint("c-0-2", 30), clipPoint("c-0-2", 30) + QPoint(0, 64), 8, Qt::AltModifier);
        QCOMPARE(clipJson("c-0-2").value("trackId").toString(), QStringLiteral("track-1"));
        QVERIFY(clipJson("c-1-2").isEmpty());  // fully covered: overwritten
        // An audio lane does not take a video clip: it stays on the last lane
        // that did (track-2), as the web drag does.
        drag(clipPoint("c-0-3", 30), clipPoint("c-0-3", 30) + QPoint(0, 3 * 64), 12, Qt::AltModifier);
        QCOMPARE(clipJson("c-0-3").value("trackId").toString(), QStringLiteral("track-2"));
        // Ctrl/Cmd on release inserts: everything from the drop on moves right.
        const double before = clipJson("c-0-6").value("startMs").toDouble();
        drag(clipPoint("c-0-4", 30), clipPoint("c-0-4", 30) + QPoint(0, 1), 3, Qt::AltModifier, Qt::ControlModifier);
        QVERIFY(clipJson("c-0-6").value("startMs").toDouble() >= before);
    }

    void clicksSelect() {
        load({2, 10});
        seed(10, 0);
        auto* g = controller();
        QTest::mouseClick(view.get(), Qt::LeftButton, {}, clipPoint("c-0-2", 30));
        QCOMPARE(g->selection(), QStringList{"c-0-2"});
        QTest::mouseClick(view.get(), Qt::LeftButton, Qt::ShiftModifier, clipPoint("c-0-4", 30));
        QCOMPARE(g->selection(), (QStringList{"c-0-2", "c-0-4"}));
        QTest::mouseClick(view.get(), Qt::LeftButton, Qt::ControlModifier, clipPoint("c-0-2", 30));
        QCOMPARE(g->selection(), QStringList{"c-0-4"});
        QTest::mouseClick(view.get(), Qt::LeftButton, {}, clipPoint("c-0-4", 30));
        QCOMPARE(g->selection(), QStringList{"c-0-4"});
        // The empty lane clears it.
        QTest::mouseClick(view.get(), Qt::LeftButton, {}, clipPoint("c-0-4", 90));
        QCOMPARE(g->selection(), QStringList{});
        QCOMPARE(model->undoStack()->count(), 0);  // a click edits nothing
        // A multi-selection moves together.
        g->setSelection({"c-0-2", "c-1-5"});
        drag(clipPoint("c-0-2", 30), clipPoint("c-0-2", 30) + QPoint(33, 0), 6, Qt::AltModifier);
        QCOMPARE(clipJson("c-0-2").value("startMs").toDouble(), 2330.0);
        QCOMPARE(clipJson("c-1-5").value("startMs").toDouble(), 5330.0);
    }

    // The editing keys resolve through the web keymap (NodeTool preset).
    void editingKeys() {
        load({2, 10});
        seed(10, 0);
        region->forceActiveFocus();
        auto* g = controller();
        QUndoStack* undo = model->undoStack();
        const QByteArray original = model->documentJson();
        g->setSelection({"c-0-2"});
        clock->seek(2400);
        key(Qt::Key_S, {}, "s");  // split at the playhead
        QVERIFY(clipJson("c-0-2").isEmpty());
        QCOMPARE(g->selection().size(), 1);
        const QString right = g->selection().first();
        QCOMPARE(clipJson(right).value("startMs").toDouble(), 2400.0);
        key(Qt::Key_Delete);
        QVERIFY(clipJson(right).isEmpty());
        QCOMPARE(undo->count(), 2);
        key(Qt::Key_Z, Qt::ControlModifier, "z");
        key(Qt::Key_Z, Qt::ControlModifier, "z");
        QCOMPARE(model->documentJson(), original);
        key(Qt::Key_Z, Qt::ControlModifier | Qt::ShiftModifier, "Z");  // redo
        QCOMPARE(undo->index(), 1);
        undo->undo();
        frame();
        // Ripple delete closes the gap on every unlocked track.
        g->setSelection({"c-0-0"});
        key(Qt::Key_Delete, Qt::ShiftModifier);
        // The deleted span (0-800) closes; the 200 ms gap after it stays.
        QCOMPARE(clipJson("c-0-1").value("startMs").toDouble(), 200.0);
        QCOMPARE(clipJson("c-1-1").value("startMs").toDouble(), 1000.0);  // c-1-0 straddles: track frozen
        undo->undo();
        frame();
        // Ctrl+A selects every clip; Escape clears.
        key(Qt::Key_A, Qt::ControlModifier, "a");
        QCOMPARE(g->selection().size(), 20);
        key(Qt::Key_A, Qt::ControlModifier | Qt::ShiftModifier, "A");
        QCOMPARE(g->selection().size(), 0);
        // Nudge one frame (30 fps), then a held key: one undo entry per hold.
        g->setSelection({"c-0-2"});
        // A push drops the redo entries: count from the current index.
        const int entries = undo->index();
        key(Qt::Key_Right);
        QCOMPARE(clipJson("c-0-2").value("startMs").toDouble(), 2033.0);
        for (int i = 0; i < 5; ++i) key(Qt::Key_Right, {}, {}, true);
        QCOMPARE(clipJson("c-0-2").value("startMs").toDouble(), 2200.0);
        QCOMPARE(undo->index(), entries + 1);
        key(Qt::Key_Right, Qt::ShiftModifier);  // a second
        QCOMPARE(clipJson("c-0-2").value("startMs").toDouble(), 3200.0);
        QCOMPARE(undo->index(), entries + 2);
    }

    // Undo and redo restore the document byte for byte, through every kind of
    // edit, on a shipped fixture.
    void undoRedoRoundTripsByteForByte() {
        unload();
        nt::ParseResult loaded = nt::loadTimelineFile(QStringLiteral(NT_FIXTURES_DIR "/overlaps.json"));
        QVERIFY(loaded.timeline);
        layout = {};
        model = new TimelineModel(this);
        clock = new PlaybackClock(this);
        model->setTimeline(*loaded.timeline);
        view = std::make_unique<QQuickView>();
        view->setInitialProperties({{QStringLiteral("timeline"), QVariant::fromValue(model)},
                                    {QStringLiteral("clock"), QVariant::fromValue(clock)}});
        view->loadFromModule("NodeTool.Timeline", "TracksRegion");
        view->setResizeMode(QQuickView::SizeRootObjectToView);
        view->resize(kRegionWidth, kRegionHeight);
        view->show();
        QVERIFY(QTest::qWaitForWindowExposed(view.get()));
        region = view->rootObject();
        vs = region->findChild<TimelineViewState*>(QStringLiteral("timelineViewState"));
        rows = region->findChild<TrackWindowModel*>(QStringLiteral("trackWindowModel"));
        frame();
        region->forceActiveFocus();
        QFile file(QStringLiteral(NT_FIXTURES_DIR "/overlaps.json"));
        QVERIFY(file.open(QIODevice::ReadOnly));
        const QByteArray original = QJsonDocument::fromJson(file.readAll()).toJson(QJsonDocument::Compact);
        QCOMPARE(model->documentJson(), original);

        auto* g = controller();
        QStringList ids;
        for (const QJsonValue& v : model->clipsJson()) ids.append(v.toObject().value("id").toString());
        std::vector<QByteArray> states{model->documentJson()};
        int step = 0;
        const auto record = [&]() {
            ++step;
            if (model->documentJson() != states.back()) {
                states.push_back(model->documentJson());
            } else {
                qWarning("edit step %d changed nothing", step);
            }
        };
        // Gestures on whatever clips are on screen, then keys.
        QStringList visible;
        for (const QString& id : ids)
            if (itemNamed(QStringLiteral("clip-") + id) && itemNamed(QStringLiteral("clip-") + id)->width() > 40) visible.append(id);
        QVERIFY(visible.size() >= 3);
        drag(clipPoint(visible[0], 20), clipPoint(visible[0], 20) + QPoint(25, 0), 8, Qt::AltModifier);
        record();
        const double w1 = itemNamed(QStringLiteral("clip-") + visible[1])->width();
        drag(clipPoint(visible[1], w1 - 3), clipPoint(visible[1], w1 - 3) + QPoint(-15, 0), 5);
        record();
        g->setRippleMode(true);
        drag(clipPoint(visible[2], 3), clipPoint(visible[2], 3) + QPoint(12, 0), 5);
        record();
        g->setRippleMode(false);
        g->setSelection({visible[2]});
        clock->seek(clipJson(visible[2]).value("startMs").toDouble() + 100);
        key(Qt::Key_S, {}, "s");
        record();
        key(Qt::Key_Right);
        record();
        key(Qt::Key_Delete, Qt::ShiftModifier);
        record();
        key(Qt::Key_A, Qt::ControlModifier, "a");
        key(Qt::Key_Delete);
        record();
        QVERIFY2(states.size() >= 7, qPrintable(QStringLiteral("%1 states, %2 commands").arg(states.size()).arg(model->undoStack()->count())));
        QCOMPARE(model->undoStack()->count(), static_cast<int>(states.size()) - 1);
        // Back to the start, one state at a time, then forward again.
        for (int i = static_cast<int>(states.size()) - 2; i >= 0; --i) {
            model->undoStack()->undo();
            QCOMPARE(model->documentJson(), states[static_cast<size_t>(i)]);
        }
        QCOMPARE(model->documentJson(), original);
        for (size_t i = 1; i < states.size(); ++i) {
            model->undoStack()->redo();
            QCOMPARE(model->documentJson(), states[i]);
        }
    }

    // D4: an edit writes the fields it owns and keeps every other one,
    // parentId and animations included.
    void editsKeepTheRawJson() {
        QJsonObject json = makeTimelineJson({2, 10});
        QJsonArray clips = json.value("clips").toArray();
        QJsonObject c = clips.at(2).toObject();
        c.insert("parentId", "some-group");
        c.insert("animations", QJsonArray{QJsonObject{{"id", "a1"}, {"role", "in"}, {"preset", "fade"}, {"durationMs", 300}}});
        c.insert("futureField", QJsonObject{{"x", 1}});
        clips.replace(2, c);
        json.insert("clips", clips);
        json.insert("somethingTheNativeModelIgnores", QJsonArray{1, 2, 3});
        unload();
        layout = {2, 10};
        model = new TimelineModel(this);
        clock = new PlaybackClock(this);
        model->setTimeline(parseTimeline(json));
        view = std::make_unique<QQuickView>();
        view->setInitialProperties({{QStringLiteral("timeline"), QVariant::fromValue(model)},
                                    {QStringLiteral("clock"), QVariant::fromValue(clock)}});
        view->loadFromModule("NodeTool.Timeline", "TracksRegion");
        view->setResizeMode(QQuickView::SizeRootObjectToView);
        view->resize(kRegionWidth, kRegionHeight);
        view->show();
        QVERIFY(QTest::qWaitForWindowExposed(view.get()));
        region = view->rootObject();
        vs = region->findChild<TimelineViewState*>(QStringLiteral("timelineViewState"));
        rows = region->findChild<TrackWindowModel*>(QStringLiteral("trackWindowModel"));
        frame();
        seed(10, 0);
        drag(clipPoint("c-0-2", 30), clipPoint("c-0-2", 30) + QPoint(10, 0), 4, Qt::AltModifier);
        QJsonObject expected = c;
        expected.insert("startMs", 2100.0);
        QCOMPARE(clipJson("c-0-2"), expected);
        QCOMPARE(QJsonDocument::fromJson(model->documentJson()).object().value("somethingTheNativeModelIgnores"),
                 QJsonValue(QJsonArray{1, 2, 3}));
    }

    // An edit updates only the lanes whose clips changed (the playhead rule
    // for edits): the other lanes send no row signal and keep every delegate.
    void anEditTouchesOnlyItsLanes() {
        load({8, 20});
        seed(10, 0);
        QMap<QString, LaneClipModel*> lanes;
        for (QQuickItem* lane : itemsNamed(QStringLiteral("trackLane-")))
            lanes.insert(lane->objectName().mid(10), lane->property("clipModel").value<LaneClipModel*>());
        QVERIFY(lanes.size() >= 6);
        QMap<QString, int> signalCount;
        for (auto it = lanes.begin(); it != lanes.end(); ++it) {
            const QString id = it.key();
            connect(it.value(), &QAbstractItemModel::rowsInserted, this, [&signalCount, id]() { ++signalCount[id]; });
            connect(it.value(), &QAbstractItemModel::rowsRemoved, this, [&signalCount, id]() { ++signalCount[id]; });
            connect(it.value(), &QAbstractItemModel::rowsMoved, this, [&signalCount, id]() { ++signalCount[id]; });
            connect(it.value(), &QAbstractItemModel::dataChanged, this, [&signalCount, id]() { ++signalCount[id]; });
        }
        QList<QPointer<QQuickItem>> otherClips;
        for (QQuickItem* c : itemsNamed(QStringLiteral("clip-c-")))
            if (!c->objectName().startsWith(QLatin1String("clip-c-2-"))) otherClips.append(c);
        const int liveBefore = controller()->liveUpdates();
        drag(clipPoint("c-2-5", 30), clipPoint("c-2-5", 30) + QPoint(15, 0), 10, Qt::AltModifier);
        const int liveMoves = controller()->liveUpdates() - liveBefore;
        QVERIFY(liveMoves > 0);
        QVERIFY(signalCount.value("track-2") > 0);
        for (auto it = lanes.begin(); it != lanes.end(); ++it) {
            if (it.key() != "track-2") QCOMPARE(signalCount.value(it.key()), 0);
        }
        for (const auto& p : otherClips) QVERIFY(p);
        // In its own lane only the moved clip's row changed: one row per
        // live update of the gesture.
        QCOMPARE(lanes.value("track-2")->dataChangedRows(), liveMoves);
    }


    // F1: a document replaced during a gesture ends the gesture; neither its
    // release nor a cancel writes the old clips into the new document.
    void aNewDocumentEndsTheGesture() {
        load({2, 10});
        seed(10, 0);
        const QPoint press = clipPoint("c-0-2", 30);
        QTest::mousePress(view.get(), Qt::LeftButton, Qt::AltModifier, press);
        QTest::mouseMove(view.get(), press + QPoint(10, 0));
        QTest::mouseMove(view.get(), press + QPoint(40, 0));
        model->setTimeline(makeTimeline({3, 4}));
        const QByteArray replaced = model->documentJson();
        QTest::mouseMove(view.get(), press + QPoint(60, 0));
        QTest::mouseRelease(view.get(), Qt::LeftButton, {}, press + QPoint(60, 0));
        frame();
        QCOMPARE(model->documentJson(), replaced);
        QCOMPARE(model->undoStack()->count(), 0);
        QCOMPARE(controller()->activeClipId(), QString());
    }

    // F6: Escape cancels the gesture and restores the press state; a key
    // command during a gesture cancels the gesture before it runs.
    void escapeCancelsAndKeysEndTheGesture() {
        load({2, 10});
        seed(10, 0);
        region->forceActiveFocus();
        const QByteArray original = model->documentJson();
        const QPoint press = clipPoint("c-0-2", 30);
        QTest::mousePress(view.get(), Qt::LeftButton, Qt::AltModifier, press);
        QTest::mouseMove(view.get(), press + QPoint(10, 0));
        QTest::mouseMove(view.get(), press + QPoint(40, 0));
        QVERIFY(model->documentJson() != original);  // live
        key(Qt::Key_Escape);
        QCOMPARE(model->documentJson(), original);
        QTest::mouseRelease(view.get(), Qt::LeftButton, {}, press + QPoint(40, 0));
        frame();
        QCOMPARE(model->documentJson(), original);
        QCOMPARE(model->undoStack()->count(), 0);
        // Delete during a drag: the drag is cancelled, then the delete runs on
        // the press state, and undo returns to it exactly.
        controller()->setSelection({"c-0-4"});
        QTest::mousePress(view.get(), Qt::LeftButton, Qt::AltModifier, press);
        QTest::mouseMove(view.get(), press + QPoint(10, 0));
        QTest::mouseMove(view.get(), press + QPoint(40, 0));
        key(Qt::Key_Delete);
        QTest::mouseRelease(view.get(), Qt::LeftButton, {}, press + QPoint(40, 0));
        frame();
        QVERIFY(clipJson("c-0-4").isEmpty());
        QCOMPARE(clipJson("c-0-2").value("startMs").toDouble(), 2000.0);
        QCOMPARE(model->undoStack()->count(), 1);
        model->undoStack()->undo();
        QCOMPARE(model->documentJson(), original);
    }

    // F7: the trims stop at the source's end: the probed length of the media
    // file, or (unknown length) the furthest out-point seen on the asset; a
    // head roll uses the neighbour's source.
    void trimsStopAtTheSourceEnd() {
        const QString media = QStringLiteral(NT_FIXTURES_DIR "/media/seek-360p30.mp4");
        const nt::MediaFacts facts = nt::probeMedia(media.toStdString());
        QVERIFY2(facts.opened && facts.durationSec > 1, "run scripts/make-fixtures.sh");
        const double sourceMs = facts.durationSec * 1000.0;
        QJsonObject json = makeTimelineJson({2, 0});
        QJsonArray clips;
        clips.append(QJsonObject{{"id", "probed"}, {"trackId", "track-0"}, {"name", "probed"}, {"startMs", 0},
                                 {"durationMs", 1000}, {"inPointMs", 0}, {"mediaType", "video"},
                                 {"mediaPath", media}, {"sourceType", "imported"}, {"status", "generated"}});
        clips.append(QJsonObject{{"id", "left"}, {"trackId", "track-1"}, {"name", "left"}, {"startMs", 0},
                                 {"durationMs", 1000}, {"inPointMs", 0}, {"outPointMs", 1000},
                                 {"currentAssetId", "asset-left"}, {"mediaType", "video"},
                                 {"sourceType", "imported"}, {"status", "generated"}});
        clips.append(QJsonObject{{"id", "right"}, {"trackId", "track-1"}, {"name", "right"}, {"startMs", 1000},
                                 {"durationMs", 1000}, {"inPointMs", 1000}, {"outPointMs", 2000},
                                 {"currentAssetId", "asset-right"}, {"mediaType", "video"},
                                 {"sourceType", "imported"}, {"status", "generated"}});
        json.insert("clips", clips);
        json.insert("durationMs", 20000);
        unload();
        layout = {2, 0};
        model = new TimelineModel(this);
        clock = new PlaybackClock(this);
        model->setTimeline(parseTimeline(json));
        view = std::make_unique<QQuickView>();
        view->setInitialProperties({{QStringLiteral("timeline"), QVariant::fromValue(model)},
                                    {QStringLiteral("clock"), QVariant::fromValue(clock)}});
        view->loadFromModule("NodeTool.Timeline", "TracksRegion");
        view->setResizeMode(QQuickView::SizeRootObjectToView);
        view->resize(kRegionWidth, kRegionHeight);
        view->show();
        QVERIFY(QTest::qWaitForWindowExposed(view.get()));
        region = view->rootObject();
        vs = region->findChild<TimelineViewState*>(QStringLiteral("timelineViewState"));
        rows = region->findChild<TrackWindowModel*>(QStringLiteral("trackWindowModel"));
        frame();
        seed(20, 0);  // 20 ms/px: a 900 px drag reaches past the 10 s source
        auto* g = controller();
        g->setSnapEnabled(false);
        QTRY_COMPARE(g->sourceCapMs("probed"), sourceMs);
        QCOMPARE(g->sourceCapMs("left"), 1000.0);  // unknown length: the out-point seen
        // Trim the probed clip's end far past its source.
        drag(clipPoint("probed", 46), clipPoint("probed", 46) + QPoint(900, 0), 10);
        QCOMPARE(clipJson("probed").value("outPointMs").toDouble(), sourceMs);
        QCOMPARE(clipJson("probed").value("durationMs").toDouble(), sourceMs);
        // Ripple and roll obey the same cap.
        g->setRippleMode(true);
        drag(clipPoint("left", 46), clipPoint("left", 46) + QPoint(50, 0), 5);
        QCOMPARE(clipJson("left").value("durationMs").toDouble(), 1000.0);
        g->setRippleMode(false);
        // A head roll later grows the left neighbour: its source caps it.
        drag(clipPoint("right", 3), clipPoint("right", 3) + QPoint(30, 0), 5, Qt::ControlModifier);
        QCOMPARE(clipJson("left").value("durationMs").toDouble(), 1000.0);
        QCOMPARE(clipJson("right").value("startMs").toDouble(), 1000.0);
        // A head roll earlier shrinks it: no cap in the way.
        drag(clipPoint("right", 3), clipPoint("right", 3) + QPoint(-30, 0), 5, Qt::ControlModifier);
        QCOMPARE(clipJson("left").value("durationMs").toDouble(), 400.0);
    }
};

int main(int argc, char** argv) {
    // No window may appear on screen: force the offscreen platform and the
    // software scene graph even when the test runs outside ctest.
    qputenv("QT_QPA_PLATFORM", "offscreen");
    qputenv("QT_QUICK_BACKEND", "software");
    QGuiApplication app(argc, argv);
    TestTracksUi test;
    return QTest::qExec(&test, argc, argv);
}

#include "tst_tracksui.moc"
