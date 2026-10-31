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
#include "app/EditRegistry.h"
#include <QScopeGuard>
#include "edit/EditActions.h"
#include "playback/PlaybackClock.h"
#include "preview/PreviewCompositor.h"
#ifdef Q_OS_LINUX
#include "preview/hw/HwWindow.h"
#include <QDir>
#endif
#include "ui/BenchMedia.h"
#include "ui/MediaPreviews.h"
#include "server/AutosaveController.h"
#include "server/AssetCache.h"
#include "TestHttpServer.h"
#include "ui/RulerCanvas.h"
#include "ui/TimelineGestureArea.h"
#include "ui/TimelineViewState.h"
#include "ui/TimelineWheel.h"

#include <QGuiApplication>
#include <QFile>
#include <QKeyEvent>
#include <QUndoStack>
#include <QJsonArray>
#include <QElapsedTimer>
#include <QProcess>
#include <QStandardPaths>
#include <QTemporaryDir>
#include <QQmlComponent>
#include <QJsonDocument>
#include <QJsonObject>
#include <QNativeGestureEvent>
#include <QPointer>
#include <QQmlEngine>
#include <QQuickItem>
#include <QQuickView>
#include <QRandomGenerator>
#include <QSignalSpy>
#include <QScopeGuard>
#include <QTest>
#include <QWheelEvent>
#include <QAbstractItemModelTester>
#include <QQuickRenderControl>
#include <QQuickRenderTarget>
#include <rhi/qrhi.h>
#include <qpa/qwindowsysteminterface.h>

#ifdef Q_OS_UNIX
#include <fcntl.h>
#include <sys/stat.h>
#include <unistd.h>
#include <csignal>
#include <cstdio>
#include <condition_variable>
#include <mutex>
#include <string>
#include <utility>
#endif

#include <atomic>
#include <thread>

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

#ifdef Q_OS_UNIX
class StalledLocalIo {
    struct State {
        std::mutex mutex;
        std::condition_variable changed;
        bool released = false;
        std::atomic<int> entered{0};
    };
    std::shared_ptr<State> m_state = std::make_shared<State>();

public:
    StalledLocalIo(const QStringList& paths, const QByteArray& operation, bool firstOnly = false) {
        setLocalIoStallForTesting([state = m_state, paths, operation, firstOnly](const char* op, const QString& path) {
            if (operation != op || !paths.contains(path)) return;
            std::unique_lock lock(state->mutex);
            if (firstOnly && state->entered.load() > 0) {
                return;
            }
            ++state->entered;
            // A final bound also protects the red run from a broken watchdog.
            state->changed.wait_for(lock, std::chrono::seconds(15), [&state]() { return state->released; });
        });
    }
    ~StalledLocalIo() {
        setLocalIoStallForTesting({});
        release();
    }
    int entered() const { return m_state->entered.load(); }
    void release() {
        std::scoped_lock lock(m_state->mutex);
        m_state->released = true;
        m_state->changed.notify_all();
    }
};

class FifoDescriptor {
public:
    explicit FifoDescriptor(int fd) : m_fd(fd) {}
    ~FifoDescriptor() {
        if (m_fd >= 0) {
            ::close(m_fd);
        }
    }
    FifoDescriptor(const FifoDescriptor&) = delete;
    FifoDescriptor& operator=(const FifoDescriptor&) = delete;
    FifoDescriptor(FifoDescriptor&& other) noexcept : m_fd(std::exchange(other.m_fd, -1)) {}
    FifoDescriptor& operator=(FifoDescriptor&& other) noexcept {
        if (this != &other) {
            FifoDescriptor old(std::exchange(m_fd, std::exchange(other.m_fd, -1)));
        }
        return *this;
    }
    int get() const { return m_fd; }

private:
    int m_fd;
};

// The writer releases a blocked old-code syscall even when an assertion fails.
class StalledFifo {
public:
    std::atomic<bool> connected{false};
    std::atomic<bool> sent{false};

    StalledFifo(const QByteArray& path, bool connectWriter, const QByteArray& bytes = {})
        : m_thread([this, path = path.toStdString(), connectWriter, bytes = bytes.toStdString()](std::stop_token stop) {
            const auto deadline = std::chrono::steady_clock::now() + std::chrono::seconds(8);
            int fd = -1;
            while (std::chrono::steady_clock::now() < deadline) {
                if (connectWriter || stop.stop_requested()) {
                    fd = ::open(path.c_str(), O_WRONLY | O_NONBLOCK);
                    if (fd >= 0) break;
                    if (stop.stop_requested()) return;
                }
                std::this_thread::sleep_for(std::chrono::milliseconds(5));
            }
            if (fd < 0) return;
            FifoDescriptor writer(fd);
            connected = true;
            sent = bytes.empty() || ::write(writer.get(), bytes.data(), bytes.size()) == static_cast<ssize_t>(bytes.size());
            while (!stop.stop_requested() && std::chrono::steady_clock::now() < deadline) {
                std::this_thread::sleep_for(std::chrono::milliseconds(5));
            }
        }) {}
    ~StalledFifo() { release(); }
    void release() { m_thread.request_stop(); }
    StalledFifo(const StalledFifo&) = delete;
    StalledFifo& operator=(const StalledFifo&) = delete;

private:
    std::jthread m_thread;
};
#endif

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

    static void registryModes() {
        QTest::addColumn<bool>("registered");
        QTest::newRow("builtins") << true;
        QTest::newRow("fallback") << false;
    }

private slots:
    void cleanup() { unload(); }

    // ── Drag cost bench ──
    // Prints the median and p90 cost of one live move step at 3200 clips.
    // Runs only with NT_DRAG_BENCH=1: the numbers depend on the machine.
    void dragCostBench() {
        if (!qEnvironmentVariableIsSet("NT_DRAG_BENCH")) QSKIP("set NT_DRAG_BENCH=1");
        load({8, 400});
        seed(10, 0);
        // NT_DRAG_BENCH_PREVIEW=1: the playhead stays on the moved clip, so
        // every step writes the document for the program preview.
        if (qEnvironmentVariableIsSet("NT_DRAG_BENCH_PREVIEW")) {
            const QJsonObject clip = clipJson("c-0-2");
            clock->seek(clip.value("startMs").toDouble() + clip.value("durationMs").toDouble() / 2);
        }
        const QPoint from = clipPoint("c-0-2", 30);
        QSignalSpy writes(model, &TimelineModel::clipsChanged);
        QTest::mousePress(view.get(), Qt::LeftButton, Qt::AltModifier, from);
        std::vector<qint64> costs;
        std::vector<qint64> moves;
        const int steps = std::max(120, qEnvironmentVariableIntValue("NT_DRAG_BENCH"));
        for (int i = 1; i <= steps; ++i) {
            QElapsedTimer t;
            t.start();
            QTest::mouseMove(view.get(), from + QPoint(i % 2 ? 4 + i % 5 : -4 - i % 5, 0));
            moves.push_back(t.nsecsElapsed() / 1000);
            frame();
            costs.push_back(t.nsecsElapsed() / 1000);
        }
        qInfo("document writes during the drag: %lld, live %f", (long long)writes.count(), controller()->liveStartMs("c-0-2"));
        QTest::mouseRelease(view.get(), Qt::LeftButton, {}, from);
        std::sort(costs.begin(), costs.end());
        std::sort(moves.begin(), moves.end());
        qInfo("drag step: median %lld us, p90 %lld us; move event alone: median %lld us, p90 %lld us",
              costs[costs.size() / 2], costs[costs.size() * 9 / 10], moves[moves.size() / 2], moves[moves.size() * 9 / 10]);
    }

    // ── --ui-bench media check ──
    // The 8-track bench with hardware decode started its measured range while
    // the layers still showed the keyframe before their in-points (frame error
    // 41, falling to 0 over ~0.2 s), and failed its own drawn check. The
    // measured range starts only once the newest frame passes that check.
    void uiBenchStartsOnceTheMediaIsExact() {
        FrameStat stat;
        stat.mediaLayers = 8;
        stat.missingMediaLayers = 0;
        stat.frameError = 41;
        QVERIFY(!nt::ui::frameDrewMedia(stat, 4));
        QVERIFY(!nt::ui::benchMediaReady({stat}, 4));
        stat.frameError = 1;
        QVERIFY(nt::ui::frameDrewMedia(stat, 4));
        QVERIFY(nt::ui::benchMediaReady({stat}, 4));
        stat.missingMediaLayers = 1;
        QVERIFY(!nt::ui::benchMediaReady({stat}, 4));
        stat.missingMediaLayers = 0;
        stat.mediaLayers = 3;
        QVERIFY(!nt::ui::benchMediaReady({stat}, 4));
        QVERIFY(!nt::ui::benchMediaReady({}, 4));
    }

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

    void laneModelNotifiesWhenRegisteredMediaResolves_data() {
        QTest::addColumn<bool>("audio");
        QTest::newRow("video") << false;
        QTest::newRow("audio") << true;
    }

    void laneModelNotifiesWhenRegisteredMediaResolves() {
        QFETCH(bool, audio);
        const auto type = audio ? nt::MediaType::Audio : nt::MediaType::Video;
        nt::Timeline timeline = makeTimeline({1, 1});
        timeline.clips.front().mediaType = type;
        timeline.clips.front().mediaPath.clear();
        timeline.clips.front().audioPath.clear();
        TimelineModel doc;
        doc.setTimeline(std::move(timeline));
        LaneClipModel lane;
        lane.setTimeline(&doc);
        lane.setTrackId(QStringLiteral("track-0"));
        QCOMPARE(lane.count(), 1);
        QCOMPARE(lane.data(lane.index(0), LaneClipModel::MediaSourceRole).toString(), QString());
        QSignalSpy changed(&lane, &QAbstractItemModel::dataChanged);
        nt::Clip media = doc.snapshot()->clips.front();
        media.mediaPath = "/resolved/video.mp4";
        media.audioPath = "/resolved/audio.wav";
        const QJsonObject raw = media.raw;
        doc.registerMedia(media);
        QCOMPARE(doc.snapshot()->clips.front().raw, raw);
        QCOMPARE(changed.count(), 1);
        const auto roles = changed.front().at(2).value<QList<int>>();
        QVERIFY(roles.isEmpty() || roles.contains(LaneClipModel::MediaSourceRole));
        QCOMPARE(lane.data(lane.index(0), LaneClipModel::MediaSourceRole).toString(),
                 type == nt::MediaType::Audio ? QStringLiteral("/resolved/audio.wav")
                                              : QStringLiteral("/resolved/video.mp4"));
        doc.registerMedia(media);
        QCOMPARE(changed.count(), 1);
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

    // S1 F1: every registered controller edit can replace the built-in action.
    void controllerEditsUseRegistry_data() {
        QTest::addColumn<QString>("registration");
        QTest::addColumn<QString>("editName");
        QTest::addColumn<QString>("tool");
        QTest::addColumn<QString>("part");
        QTest::addColumn<int>("keyCode");
        QTest::addColumn<int>("modifiers");
        QTest::addColumn<bool>("rippleMode");
        QTest::addColumn<bool>("multi");
        const auto row = [](const char* label, const char* name, const char* tool, const char* part,
                            int key = 0, int modifiers = 0, bool ripple = false, bool multi = false) {
            for (const QString& registration : {QStringLiteral("override"), QStringLiteral("register"),
                                                QStringLiteral("refuse")}) {
                const QByteArray rowName = QByteArray(label) + '-' + registration.toLatin1();
                QTest::newRow(rowName.constData()) << registration << QString::fromLatin1(name)
                    << QString::fromLatin1(tool) << QString::fromLatin1(part) << key << modifiers << ripple << multi;
            }
        };
        row("delete", "deleteSelected", "select", "", Qt::Key_Delete);
        row("shift-delete", "rippleDeleteSelected", "select", "", Qt::Key_Delete, Qt::ShiftModifier);
        row("ripple-mode-delete", "rippleDeleteSelected", "select", "", Qt::Key_Delete, 0, true);
        row("plain-head", "trimClipStart", "select", "start");
        row("plain-tail", "trimClipEnd", "select", "end");
        row("ripple-head", "rippleTrimClipStart", "ripple", "start");
        row("ripple-tail", "rippleTrimClipEnd", "ripple", "end");
        row("roll-head", "rollClipEdge", "roll", "start");
        row("roll-tail", "rollClipEdge", "select", "end", 0, Qt::ControlModifier);
        row("stretch-head", "rateStretchClip", "rateStretch", "start");
        row("stretch-tail", "rateStretchClip", "rateStretch", "end");
        row("insert-drop", "resolveDropAction", "select", "body", 0, Qt::ControlModifier);
        row("move", "moveClip", "select", "body");
        row("multi-move", "moveSelectedClips", "select", "body", 0, 0, false, true);
        row("slip", "slipClip", "slip", "body");
        row("slide", "slideClip", "slide", "body");
        row("cut", "splitClipAtTime", "cut", "body");
        row("split-key", "splitSelectedAtPlayhead", "select", "", Qt::Key_S);
        row("nudge", "nudge", "select", "", Qt::Key_Right);
    }

    void controllerEditsUseRegistry() {
        QFETCH(QString, registration);
        QFETCH(QString, editName);
        QFETCH(QString, tool);
        QFETCH(QString, part);
        QFETCH(int, keyCode);
        QFETCH(int, modifiers);
        QFETCH(bool, rippleMode);
        QFETCH(bool, multi);
        load({4, 20, 800, 800});
        seed(10, 0);
        auto* g = controller();
        g->setSnapEnabled(false);
        g->setLinkedSelection(false);
        g->setActiveTool(tool);
        g->setRippleMode(rippleMode);
        g->setSelection(multi ? QStringList{"c-0-2", "c-1-2"} : QStringList{"c-0-2"});
        clock->seek(2000);
        // A finite source cap, including the neighbour that bounds a head roll.
        QJsonArray clips = model->clipsJson();
        for (qsizetype i = 0; i < clips.size(); ++i) {
            auto clip = clips.at(i).toObject();
            clip.insert("currentAssetId", "asset-" + clip.value("id").toString());
            clip.insert("inPointMs", 200);
            clip.insert("outPointMs", 1000);
            clips.replace(i, clip);
        }
        QVERIFY(model->replaceClips(clips));
        frame();
        const QJsonArray before = model->clipsJson();
        const QByteArray documentBefore = model->documentJson();
        const QJsonObject rawBefore = model->timeline().raw;
        const auto previousEdits = nt::app::edits();
        const auto previousOverrides = nt::app::editOverrides();
        const auto restore = qScopeGuard([previousEdits, previousOverrides] {
            nt::app::edits() = previousEdits;
            nt::app::editOverrides() = previousOverrides;
        });
        const bool refusing = registration == "refuse";
        std::vector<QJsonObject> documents;
        std::vector<QJsonObject> payloads;
        std::vector<int> undoCounts;
        const nt::app::Edit edit = [&](QJsonObject raw, const QJsonObject& payload) {
            documents.push_back(raw);
            payloads.push_back(payload);
            undoCounts.push_back(model->undoStack()->count());
            if (refusing) {
                return raw;
            }
            QJsonArray result = raw.value("clips").toArray();
            for (qsizetype i = 0; i < result.size(); ++i) {
                auto clip = result.at(i).toObject();
                clip.insert("registryVisits", clip.value("registryVisits").toInt() + 1);
                result.replace(i, clip);
            }
            raw.insert("clips", result);
            return raw;
        };
        if (registration == "register") {
            nt::app::edits().remove(editName);
            QVERIFY(nt::app::registerEdit(editName, edit));
        } else {
            QVERIFY(nt::app::overrideEdit(editName, edit));
        }
        if (keyCode) {
            QVERIFY(g->handleKey(keyCode, keyCode == Qt::Key_S ? "s" : "", modifiers, false));
        } else {
            const double x = part == "start" ? 3 : part == "end" ? 76 : 30;
            const QPoint from = clipPoint("c-0-2", x);
            const auto mods = static_cast<Qt::KeyboardModifiers>(modifiers);
            drag(from, from + QPoint(30, 0), 6,
                 editName == "resolveDropAction" ? Qt::NoModifier : mods,
                 editName == "resolveDropAction" ? mods : Qt::NoModifier);
        }
        QVERIFY2(!payloads.empty(), qPrintable(editName + " bypassed its registered override"));
        QCOMPARE(clipJson("c-0-2").value("registryVisits").toInt(), refusing ? 0 : int(payloads.size()));
        for (size_t i = 0; i < documents.size(); ++i) {
            auto raw = documents[i];
            const auto inputClips = raw.take("clips").toArray();
            auto expectedRaw = rawBefore;
            expectedRaw.remove("clips");
            QCOMPARE(raw, expectedRaw);
            // A move step writes only the clips under the playhead (for the
            // preview); the others reach the document on release.
            const bool live = editName == "moveClip" || editName == "moveSelectedClips";
            if (!live) QCOMPARE(inputClips.at(0).toObject().value("registryVisits").toInt(), refusing ? 0 : int(i));
            QCOMPARE(undoCounts[i], 0);  // previews never push commands
            QCOMPARE(payloads[i].value("linked"), QJsonValue(false));
        }
        const auto payload = payloads.back();
        if (editName == "deleteSelected" || editName == "rippleDeleteSelected" || editName == "resolveDropAction") {
            QCOMPARE(payload.value("selectedIds").toArray(), QJsonArray{"c-0-2"});
        } else if (editName == "splitSelectedAtPlayhead") {
            QCOMPARE(payload.value("selectedIds").toArray(), QJsonArray{"c-0-2"});
            QCOMPARE(payload.value("timeMs"), QJsonValue(2000));
        } else {
            QCOMPARE(payload.value("clipId").toString(), QStringLiteral("c-0-2"));
        }
        if (part == "end" || editName == "rollClipEdge" || editName == "slipClip") {
            if (editName != "rateStretchClip") {
                QCOMPARE(payload.value("maxSourceDurationMs"), QJsonValue(1000));
            }
        }
        if (editName == "rateStretchClip") {
            QCOMPARE(payload.value("edge").toString(), part);
            QCOMPARE(payload.value("durationMs"), QJsonValue(part == "start" ? 500 : 1100));
        } else if (editName == "slipClip") {
            QCOMPARE(payload.value("sourceDeltaMs"), QJsonValue(-300));
        } else if (editName == "splitClipAtTime") {
            QCOMPARE(payload.value("atMs"), QJsonValue(1900));
        } else if (editName == "nudge") {
            QCOMPARE(payload.value("deltaMs"), QJsonValue(33));
        } else if (editName.contains("Trim") || editName.startsWith("trim") || editName == "rollClipEdge" ||
                   editName == "moveClip" || editName == "moveSelectedClips" || editName == "slideClip") {
            QCOMPARE(payload.value("deltaMs"), QJsonValue(part == "start" && editName != "rollClipEdge" ? -300 : 300));
        }
        if (editName == "rollClipEdge") {
            QCOMPARE(payload.value("edge").toString(), part);
        }
        if (editName == "moveSelectedClips") {
            QCOMPARE(payload.value("selectedIds").toArray(), (QJsonArray{"c-0-2", "c-1-2"}));
        }
        if (editName == "resolveDropAction") {
            QCOMPARE(payload.value("mode").toString(), QStringLiteral("insert"));
            QVERIFY(documents.front().value("clips").toArray() != before);  // receives the live move
        }
        QCOMPARE(model->undoStack()->count(), refusing && editName != "resolveDropAction" ? 0 : 1);
        if (editName == "deleteSelected" || editName == "rippleDeleteSelected") {
            if (!refusing) {
                QCOMPARE(model->undoStack()->undoText(), rippleMode || modifiers & Qt::ShiftModifier
                         ? QStringLiteral("Ripple delete") : QStringLiteral("Delete clips"));
            }
            g->setSelection({});
            QVERIFY(!g->handleKey(Qt::Key_Delete, "", modifiers, false));
            QCOMPARE(payloads.size(), size_t(1));
        }
        const QByteArray after = model->documentJson();
        model->undoStack()->undo();
        QCOMPARE(model->documentJson(), documentBefore);
        QVERIFY(!model->undoStack()->canUndo());
        model->undoStack()->redo();
        QCOMPARE(model->documentJson(), after);
    }

    void registeredSplitKeepsTheRightHalvesSelectedOnALargeDocument() {
        TimelineModel timeline;
        timeline.setTimeline(makeTimeline({4, 10000}));
        PlaybackClock playback;
        playback.setDurationMs(timeline.contentEndMs());
        playback.seek(2400);
        ClipGestureController gestures;
        gestures.setTimeline(&timeline);
        gestures.setClock(&playback);
        gestures.setSelection({"c-0-2", "c-1-2"});
        const auto before = timeline.clipsJson();
        const auto doc = gestures.editDoc();
        QStringList rightHalves;
        const auto previousOverrides = nt::app::editOverrides();
        const auto restore = qScopeGuard([previousOverrides] { nt::app::editOverrides() = previousOverrides; });
        QVERIFY(nt::app::overrideEdit("splitSelectedAtPlayhead", [&](QJsonObject raw, const QJsonObject& payload) {
            const auto split = nt::edit::splitSelectedAtPlayhead(doc, payload.value("timeMs").toDouble(),
                                                                {"c-0-2", "c-1-2"});
            rightHalves = split.rightHalfIds;
            raw.insert("clips", toJsonArray(split.clips));
            return raw;
        }));
        QVERIFY(gestures.handleKey(Qt::Key_S, "s", 0, false));
        QCOMPARE(rightHalves.size(), 2);
        QCOMPARE(gestures.selection(), rightHalves);
        QCOMPARE(timeline.clipCount(), 40002);
        QCOMPARE(timeline.undoStack()->count(), 1);
        timeline.undoStack()->undo();
        QCOMPARE(timeline.clipsJson(), before);
    }

    // A drag of any length is one undo entry, applied live on every move.
    void aDragIsOneUndoEntry_data() { registryModes(); }
    void aDragIsOneUndoEntry() {
        QFETCH(bool, registered);
        const auto previousEdits = nt::app::edits();
        const auto restore = qScopeGuard([previousEdits] { nt::app::edits() = previousEdits; });
        if (!registered) {
            nt::app::edits().clear();
        }
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
    void trimGesturesMatchTheStoreActions_data() { registryModes(); }
    void trimGesturesMatchTheStoreActions() {
        QFETCH(bool, registered);
        const auto previousEdits = nt::app::edits();
        const auto restore = qScopeGuard([previousEdits] { nt::app::edits() = previousEdits; });
        if (!registered) {
            nt::app::edits().clear();
        }
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
    void moveAcrossLanes_data() { registryModes(); }
    void moveAcrossLanes() {
        QFETCH(bool, registered);
        const auto previousEdits = nt::app::edits();
        const auto restore = qScopeGuard([previousEdits] { nt::app::edits() = previousEdits; });
        if (!registered) {
            nt::app::edits().clear();
        }
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
    void editingKeys_data() { registryModes(); }
    void editingKeys() {
        QFETCH(bool, registered);
        const auto previousEdits = nt::app::edits();
        const auto restore = qScopeGuard([previousEdits] { nt::app::edits() = previousEdits; });
        if (!registered) {
            nt::app::edits().clear();
        }
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
        QQuickItem* moved = itemsNamed(QStringLiteral("clip-c-2-5")).value(0);
        QVERIFY(moved);
        const qreal xBefore = moved->x();
        const QPoint from = clipPoint("c-2-5", 30);
        QTest::mousePress(view.get(), Qt::LeftButton, Qt::AltModifier, from);
        for (int i = 1; i <= 10; ++i) QTest::mouseMove(view.get(), from + QPoint(15, 0) * i / 10);
        frame();
        QVERIFY(controller()->liveUpdates() - liveBefore > 0);
        // The steps show through the live list: the clip moved, no lane changed.
        QVERIFY(moved->x() > xBefore);
        for (auto it = lanes.begin(); it != lanes.end(); ++it) QCOMPARE(signalCount.value(it.key()), 0);
        QTest::mouseRelease(view.get(), Qt::LeftButton, {}, from + QPoint(15, 0));
        frame();
        // The release writes the move once: only the moved clip's row in its own lane.
        for (auto it = lanes.begin(); it != lanes.end(); ++it) {
            if (it.key() != "track-2") QCOMPARE(signalCount.value(it.key()), 0);
        }
        for (const auto& p : otherClips) QVERIFY(p);
        QCOMPARE(lanes.value("track-2")->dataChangedRows(), 1);
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

    // A move writes the document during the drag only when the program
    // preview can show it: here the playhead is on the moved clip.
    void aMoveUnderThePlayheadUpdatesTheDocumentLive() {
        load({2, 10});
        seed(10, 0);
        const QJsonObject clip = clipJson("c-0-2");
        clock->seek(clip.value("startMs").toDouble() + 1);
        const QByteArray original = model->documentJson();
        const QPoint press = clipPoint("c-0-2", 30);
        QSignalSpy preview(model, &TimelineModel::previewChanged);
        QSignalSpy clips(model, &TimelineModel::clipsChanged);
        QSignalSpy timeline(model, &TimelineModel::timelineChanged);
        QTest::mousePress(view.get(), Qt::LeftButton, Qt::AltModifier, press);
        // The clip leaves the playhead at this step: the preview must lose it.
        QTest::mouseMove(view.get(), press + QPoint(10, 0));
        QVERIFY(model->documentJson() != original);
        QVERIFY(controller()->liveStartMs("c-0-2") >= 0);
        // Only the preview heard the step.
        QCOMPARE(preview.count(), 1);
        QCOMPARE(clips.count(), 0);
        QCOMPARE(timeline.count(), 0);
        QTest::mouseRelease(view.get(), Qt::LeftButton, {}, press + QPoint(10, 0));
        frame();
        // The release tells the other listeners once.
        QCOMPARE(clips.count(), 1);
        QCOMPARE(model->undoStack()->count(), 1);
        QCOMPARE(controller()->liveStartMs("c-0-2"), -1.0);
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
        QVERIFY(controller()->liveStartMs("c-0-2") >= 0);  // live, not in the document
        QCOMPARE(model->documentJson(), original);
        key(Qt::Key_Escape);
        QCOMPARE(controller()->liveStartMs("c-0-2"), -1.0);
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

    // ── M2b: the toolbar tools ──
    // Loads a document given as JSON (the fixture of `l` with edits).
    void loadJson(const QJsonObject& json, const Layout& l) {
        unload();
        layout = l;
        model = new TimelineModel(this);
        clock = new PlaybackClock(this);
        model->setTimeline(parseTimeline(json));
        clock->setDurationMs(model->contentEndMs());
        view = std::make_unique<QQuickView>();
        view->setInitialProperties({{QStringLiteral("timeline"), QVariant::fromValue(model)},
                                    {QStringLiteral("clock"), QVariant::fromValue(clock)}});
        view->loadFromModule("NodeTool.Timeline", "TracksRegion");
        QVERIFY(view->status() == QQuickView::Ready);
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
    QJsonObject withClipFields(QJsonObject json, const QString& id, const QJsonObject& fields) {
        QJsonArray clips = json.value("clips").toArray();
        for (int i = 0; i < clips.size(); ++i) {
            QJsonObject c = clips.at(i).toObject();
            if (c.value("id").toString() != id) continue;
            for (auto it = fields.begin(); it != fields.end(); ++it) c.insert(it.key(), it.value());
            clips.replace(i, c);
        }
        json.insert("clips", clips);
        return json;
    }
    void click(QPoint at, Qt::KeyboardModifiers mods = {}) {
        QTest::mouseClick(view.get(), Qt::LeftButton, mods, at);
        frame();
    }
    QPoint itemCenter(const QString& name) {
        QQuickItem* it = itemNamed(name);
        if (!it) qFatal("no item %s", qPrintable(name));
        return it->mapToScene(QPointF(it->width() / 2, it->height() / 2)).toPoint();
    }

    void cutToolSplitsAtThePointer_data() { registryModes(); }
    void cutToolSplitsAtThePointer() {
        QFETCH(bool, registered);
        const auto previousEdits = nt::app::edits();
        const auto restore = qScopeGuard([previousEdits] { nt::app::edits() = previousEdits; });
        if (!registered) {
            nt::app::edits().clear();
        }
        load({2, 6});
        seed(10, 0);
        controller()->setActiveTool(QStringLiteral("cut"));
        const int before = model->clipCount();
        // c-0-1 runs 1000..1800 ms: x 30 is 1300 ms.
        QTest::mouseClick(view.get(), Qt::LeftButton, {}, clipPoint("c-0-1", 30));
        frame();
        QCOMPARE(model->clipCount(), before + 1);
        // Both halves get new ids (splitClip.ts).
        QVERIFY(clipJson("c-0-1").isEmpty());
        QList<std::pair<double, double>> halves;
        for (const QJsonValue& v : model->clipsJson()) {
            const QJsonObject c = v.toObject();
            if (c.value("trackId").toString() == "track-0" && c.value("startMs").toDouble() >= 1000 &&
                c.value("startMs").toDouble() < 2000)
                halves.append({c.value("startMs").toDouble(), c.value("durationMs").toDouble()});
        }
        std::sort(halves.begin(), halves.end());
        QCOMPARE(halves, (QList<std::pair<double, double>>{{1000, 300}, {1300, 500}}));
        QCOMPARE(model->undoStack()->count(), 1);
        // Inside an 8 px edge grip the Cut tool still cuts (BODY_TOOLS): 3 px
        // into c-0-2 (2000..2800 ms) is 2030 ms.
        QTest::mouseClick(view.get(), Qt::LeftButton, {}, clipPoint("c-0-2", 3));
        frame();
        QCOMPARE(model->clipCount(), before + 2);
        QVERIFY(clipJson("c-0-2").isEmpty());
        halves.clear();
        for (const QJsonValue& v : model->clipsJson()) {
            const QJsonObject c = v.toObject();
            if (c.value("trackId").toString() == "track-0" && c.value("startMs").toDouble() >= 2000 &&
                c.value("startMs").toDouble() < 3000)
                halves.append({c.value("startMs").toDouble(), c.value("durationMs").toDouble()});
        }
        std::sort(halves.begin(), halves.end());
        QCOMPARE(halves, (QList<std::pair<double, double>>{{2000, 30}, {2030, 770}}));
        QCOMPARE(model->undoStack()->count(), 2);
    }

    void trackSelectToolSelectsFromThePointerOn() {
        load({3, 6});
        seed(10, 0);
        auto* g = controller();
        g->setActiveTool(QStringLiteral("trackSelect"));
        // At 2300 ms on c-1-2: every clip that ends after it, the pressed one first.
        QTest::mouseClick(view.get(), Qt::LeftButton, {}, clipPoint("c-1-2", 30));
        frame();
        QStringList expected{QStringLiteral("c-1-2")};
        for (int t = 0; t < 3; ++t)
            for (int k = 2; k < 6; ++k)
                if (!(t == 1 && k == 2)) expected.append(QStringLiteral("c-%1-%2").arg(t).arg(k));
        QStringList got = g->selection();
        QCOMPARE(got.first(), QStringLiteral("c-1-2"));
        std::sort(got.begin() + 1, got.end());
        std::sort(expected.begin() + 1, expected.end());
        QCOMPARE(got, expected);
        // Shift keeps to the pressed clip's track; backward selects up to it.
        g->setActiveTool(QStringLiteral("trackSelectBackward"));
        QTest::mouseClick(view.get(), Qt::LeftButton, Qt::ShiftModifier, clipPoint("c-1-2", 30));
        frame();
        QCOMPARE(g->selection(), (QStringList{"c-1-2", "c-1-0", "c-1-1"}));
    }

    void slipToolMovesTheSourceUnderTheClip_data() { registryModes(); }
    void slipToolMovesTheSourceUnderTheClip() {
        QFETCH(bool, registered);
        const auto previousEdits = nt::app::edits();
        const auto restore = qScopeGuard([previousEdits] { nt::app::edits() = previousEdits; });
        if (!registered) {
            nt::app::edits().clear();
        }
        Layout l{2, 4};
        loadJson(withClipFields(makeTimelineJson(l), "c-0-1", QJsonObject{{"inPointMs", 1000}}), l);
        seed(10, 0);
        auto* g = controller();
        g->setActiveTool(QStringLiteral("slip"));
        // Right shows earlier source: 20 px at 10 ms/px is 200 ms.
        drag(clipPoint("c-0-1", 40), clipPoint("c-0-1", 40) + QPoint(20, 0), 4);
        QCOMPARE(clipJson("c-0-1").value("inPointMs").toDouble(), 800.0);
        QCOMPARE(clipJson("c-0-1").value("startMs").toDouble(), 1000.0);
        QCOMPARE(model->undoStack()->count(), 1);
        QCOMPARE(model->undoStack()->undoText(), QStringLiteral("Slip clip"));
        // Past the source start the slip stops at 0.
        drag(clipPoint("c-0-1", 40), clipPoint("c-0-1", 40) + QPoint(200, 0), 4);
        QCOMPARE(clipJson("c-0-1").value("inPointMs").toDouble(), 0.0);
    }

    void slideToolTrimsTheNeighbours_data() { registryModes(); }
    void slideToolTrimsTheNeighbours() {
        QFETCH(bool, registered);
        const auto previousEdits = nt::app::edits();
        const auto restore = qScopeGuard([previousEdits] { nt::app::edits() = previousEdits; });
        if (!registered) {
            nt::app::edits().clear();
        }
        Layout l{2, 4, 1000, 1000};  // touching clips
        load(l);
        seed(10, 0);
        controller()->setActiveTool(QStringLiteral("slide"));
        drag(clipPoint("c-0-1", 40), clipPoint("c-0-1", 40) + QPoint(20, 0), 4);
        QCOMPARE(clipJson("c-0-1").value("startMs").toDouble(), 1200.0);
        QCOMPARE(clipJson("c-0-1").value("durationMs").toDouble(), 1000.0);
        QCOMPARE(clipJson("c-0-0").value("durationMs").toDouble(), 1200.0);
        QCOMPARE(clipJson("c-0-2").value("startMs").toDouble(), 2200.0);
        QCOMPARE(clipJson("c-0-2").value("durationMs").toDouble(), 800.0);
        QCOMPARE(model->undoStack()->count(), 1);
        model->undoStack()->undo();
        QCOMPARE(clipJson("c-0-1").value("startMs").toDouble(), 1000.0);
    }

    void rateStretchToolChangesTheSpeed_data() { registryModes(); }
    void rateStretchToolChangesTheSpeed() {
        QFETCH(bool, registered);
        const auto previousEdits = nt::app::edits();
        const auto restore = qScopeGuard([previousEdits] { nt::app::edits() = previousEdits; });
        if (!registered) {
            nt::app::edits().clear();
        }
        load({2, 4});
        seed(10, 0);
        controller()->setActiveTool(QStringLiteral("rateStretch"));
        // End edge +10 px = +100 ms (Alt: no snap): 900 ms at 800/900 speed.
        drag(clipPoint("c-0-1", 78), clipPoint("c-0-1", 78) + QPoint(10, 0), 2, Qt::AltModifier);
        QCOMPARE(clipJson("c-0-1").value("durationMs").toDouble(), 900.0);
        QVERIFY(std::abs(clipJson("c-0-1").value("speedMultiplier").toDouble() - 800.0 / 900.0) < 1e-9);
        QCOMPARE(model->undoStack()->count(), 1);
    }

    void handAndZoomToolsActOnTheLanes() {
        load({4, 200});
        seed(10, 0);
        auto* g = controller();
        g->setActiveTool(QStringLiteral("hand"));
        drag(lanesPoint(400).toPoint(), lanesPoint(300).toPoint(), 4);
        QCOMPARE(vs->scrollLeftPx(), 100.0);
        QCOMPARE(model->undoStack()->count(), 0);  // a press on a clip does not edit
        g->setActiveTool(QStringLiteral("zoom"));
        const double timeUnder = vs->timeAtViewportX(500);
        click(lanesPoint(500).toPoint());
        QCOMPARE(vs->msPerPx(), 5.0);
        QVERIFY(std::abs(vs->timeAtViewportX(500) - timeUnder) < 1e-6);
        click(lanesPoint(500).toPoint(), Qt::AltModifier);
        QCOMPARE(vs->msPerPx(), 10.0);
    }

    void toolKeysAndTooltipsComeFromTheKeymap() {
        load({2, 4});
        auto* g = controller();
        const QList<std::tuple<int, Qt::KeyboardModifiers, QString, QString>> keys{
            {Qt::Key_C, {}, "c", "cut"},         {Qt::Key_H, {}, "h", "hand"},
            {Qt::Key_Y, {}, "y", "slip"},        {Qt::Key_U, {}, "u", "slide"},
            {Qt::Key_R, {}, "r", "rateStretch"}, {Qt::Key_A, {}, "a", "trackSelect"},
            {Qt::Key_A, Qt::ShiftModifier, "A", "trackSelectBackward"},
            {Qt::Key_Z, {}, "z", "zoom"},         {Qt::Key_V, {}, "v", "select"}};
        region->forceActiveFocus();
        for (const auto& [k, mods, text, tool] : keys) {
            key(k, mods, text);
            QCOMPARE(g->activeTool(), tool);
        }
        QCOMPARE(g->shortcutFor("cutTool"), QStringLiteral("C"));
        QCOMPARE(g->shortcutFor("stepFrameBack"), QStringLiteral("Alt+←"));
        QCOMPARE(g->shortcutFor("trackSelectBackwardTool"), QStringLiteral("Shift+A"));
        g->setKeyboardPreset(QStringLiteral("fcp"));
        QCOMPARE(g->shortcutFor("cutTool"), QStringLiteral("B"));
        QCOMPARE(itemNamed("tool_cut")->property("heading").toString(), QStringLiteral("Cut (B)"));
    }

    // nextToolbarFit: labels while the row fits, icons once it overflows, and
    // labels again only when the bar is as wide as the labelled row was.
    void toolbarDropsItsLabelsWhenNarrow() {
        load({2, 4});
        QQuickItem* select = itemNamed("tool_select");
        auto* toolbar = itemNamed("timelineToolbar");
        view->resize(2000, kRegionHeight);
        frame();
        QVERIFY2(!select->property("compact").toBool(), qPrintable(QStringLiteral("toolbar width=%1 available=%2 row=%3 needed=%4")
            .arg(toolbar->width()).arg(toolbar->property("available").toDouble()).arg(toolbar->property("rowWidth").toDouble())
            .arg(toolbar->property("neededWidth").toDouble())));
        QVERIFY(select->width() > 28);
        QCOMPARE(itemNamed("tool_slip")->width(), 28.0);  // iconOnly in both
        view->resize(kRegionWidth, kRegionHeight);
        frame();
        QVERIFY(select->property("compact").toBool());
        QVERIFY(toolbar->property("rowWidth").toDouble() <= toolbar->property("available").toDouble());
        view->resize(700, kRegionHeight);
        frame();
        QVERIFY(select->property("compact").toBool());
        QCOMPARE(select->width(), 28.0);
        QVERIFY(!itemNamed("zoomSlider")->isVisible());
        view->resize(600, kRegionHeight);
        frame();
        auto* viewport = itemNamed("timelineToolViewport");
        auto* help = itemNamed("helpButton");
        QVERIFY(viewport->clip());
        QVERIFY(viewport->property("contentWidth").toDouble() > viewport->width());
        QVERIFY(viewport->mapToScene(QPointF(viewport->width(), 0)).x()
                <= help->mapToScene(QPointF()).x());
        view->resize(2000, kRegionHeight);
        frame();
        QVERIFY(!select->property("compact").toBool());
    }

    void dropModesAreOneChoice() {
        load({2, 4});
        auto* g = controller();
        click(itemCenter("dropMode_insert"));
        QCOMPARE(g->dropMode(), QStringLiteral("insert"));
        QVERIFY(itemNamed("dropMode_insert")->property("active").toBool());
        QVERIFY(!itemNamed("dropMode_overwrite")->property("active").toBool());
        click(itemCenter("dropMode_overlap"));
        QCOMPARE(g->dropMode(), QStringLiteral("overlap"));
        click(itemCenter("snapToggle"));
        QVERIFY(!g->snapEnabled());
        click(itemCenter("linkedToggle"));
        QVERIFY(!g->linkedSelection());
        QVERIFY(region->property("followPlayhead").toBool());
        click(itemCenter("followToggle"));
        QVERIFY(!region->property("followPlayhead").toBool());
        click(itemCenter("rippleToggle"));
        QVERIFY(g->rippleMode());
    }

    // ── M2b: markers and the in/out range ──
    void markersAddSeekDeleteAndUndo() {
        load({2, 10});
        seed(10, 0);
        region->forceActiveFocus();
        clock->seek(2500);
        key(Qt::Key_M, {}, "m");
        key(Qt::Key_M, {}, "m", true);  // a held key adds no second marker
        QCOMPARE(model->markersJson().size(), 1);
        const QJsonObject m = model->markersJson().at(0).toObject();
        QCOMPARE(m.value("label").toString(), QStringLiteral("Marker 1"));
        QCOMPARE(m.value("timeMs").toDouble(), 2500.0);
        QCOMPARE(m.value("id").toString().size(), 32);
        clock->seek(6000);
        key(Qt::Key_M, {}, "m");
        frame();
        const QList<QQuickItem*> flags = itemsNamed("timelineMarker");
        QCOMPARE(flags.size(), 2);
        if (qEnvironmentVariableIsSet("NT_SHOT_DIR"))
            view->grabWindow().copy(0, 0, 1000, 160).save(qEnvironmentVariable("NT_SHOT_DIR") + "/native-markers.png");
        auto* ruler = region->findChild<RulerCanvas*>(QStringLiteral("rulerCanvas"));
        QCOMPARE(ruler->markers().size(), 2);
        // The flag sits at its time; its label seeks.
        QQuickItem* first = flags[0]->property("label").toString() == "Marker 1" ? flags[0] : flags[1];
        QCOMPARE(first->mapToItem(ruler, QPointF(1, 0)).x(), 250.0);
        clock->seek(0);
        click(first->mapToScene(QPointF(10, 7)).toPoint());
        QCOMPARE(clock->time(), 2500.0);
        // Next and previous marker.
        key(Qt::Key_M, Qt::ShiftModifier, "M");
        QCOMPARE(clock->time(), 6000.0);
        key(Qt::Key_M, Qt::ShiftModifier | Qt::MetaModifier, "M");
        QCOMPARE(clock->time(), 2500.0);
        // Delete through the marker button, then undo it and the adds.
        auto* markerDelete = first->findChild<QQuickItem*>(QStringLiteral("markerDelete"));
        QVERIFY(markerDelete);
        const auto deletePoint = markerDelete->mapToScene(QPointF(markerDelete->width() / 2, markerDelete->height() / 2)).toPoint();
        QTest::mouseMove(view.get(), deletePoint);
        QTRY_VERIFY(markerDelete->isVisible());
        click(deletePoint);
        frame();
        QCOMPARE(model->markersJson().size(), 1);
        model->undoStack()->undo();
        QCOMPARE(model->markersJson().size(), 2);
        model->undoStack()->undo();
        model->undoStack()->undo();
        QCOMPARE(model->markersJson().size(), 0);
        frame();
        QCOMPARE(itemsNamed("timelineMarker").size(), 0);
    }

    void inOutRangeFollowsThePlaybackStore() {
        load({2, 10});
        seed(10, 0);
        region->forceActiveFocus();
        auto* ruler = region->findChild<RulerCanvas*>(QStringLiteral("rulerCanvas"));
        clock->seek(1000);
        key(Qt::Key_I, {}, "i");
        clock->seek(4000);
        key(Qt::Key_O, {}, "o");
        QCOMPARE(vs->rangeInMs(), 1000.0);
        QCOMPARE(vs->rangeOutMs(), 4000.0);
        QCOMPARE(ruler->rangeInMs(), 1000.0);
        QCOMPARE(ruler->rangeOutMs(), 4000.0);
        frame();
        if (qEnvironmentVariableIsSet("NT_SHOT_DIR"))
            view->grabWindow().copy(0, 0, 1000, 160).save(qEnvironmentVariable("NT_SHOT_DIR") + "/native-range.png");
        key(Qt::Key_I, Qt::ShiftModifier, "I");
        QCOMPARE(clock->time(), 1000.0);
        // An in point at or after the out point drops the out point.
        clock->seek(5000);
        key(Qt::Key_I, {}, "i");
        QCOMPARE(vs->rangeInMs(), 5000.0);
        QCOMPARE(vs->rangeOutMs(), -1.0);
        clock->seek(2000);
        key(Qt::Key_O, {}, "o");
        QCOMPARE(vs->rangeInMs(), -1.0);
        QCOMPARE(vs->rangeOutMs(), 2000.0);
        key(Qt::Key_X, Qt::ShiftModifier | Qt::MetaModifier, "X");
        QCOMPARE(vs->rangeOutMs(), -1.0);
        QCOMPARE(model->undoStack()->count(), 0);  // the range is view state
    }

    void shortcutSheetShowsTheWebRows() {
        load({2, 4});
        auto* g = controller();
        QSignalSpy toggled(region, SIGNAL(shortcutsRequested()));
        region->forceActiveFocus();
        key(Qt::Key_Question, Qt::ShiftModifier, "?");
        QCOMPARE(toggled.count(), 1);
        click(itemCenter("helpButton"));
        QCOMPARE(toggled.count(), 2);
        // The sheet itself: the web's groups, rows and keys under the preset.
        QQmlComponent component(view->engine());
        component.loadFromModule("NodeTool.Timeline", "ShortcutsSheet");
        std::unique_ptr<QObject> sheet(component.createWithInitialProperties({{"gestures", QVariant::fromValue(g)}}));
        QVERIFY2(sheet, qPrintable(component.errorString()));
        auto* sheetItem = qobject_cast<QQuickItem*>(sheet.get());
        QVERIFY(sheetItem);
        sheetItem->setParentItem(region);
        sheetItem->setSize(region->size());
        sheetItem->setZ(100);
        auto* focusBefore = view->activeFocusItem();
        QVERIFY(focusBefore);
        sheet->setProperty("open", true);
        auto* dialog = sheet->findChild<QObject*>(QStringLiteral("shortcutsDialog"));
        QVERIFY(dialog);
        QTRY_VERIFY(dialog->property("visible").toBool());
        const QVariantMap content = sheet->property("content").toMap();
        QCOMPARE(content.value("title").toString(), QStringLiteral("Keyboard shortcuts"));
        const QVariantList groups = content.value("groups").toList();
        QCOMPARE(groups.size(), 11);
        QCOMPARE(groups.first().toMap().value("title").toString(), QStringLiteral("Tools"));
        const QVariantMap cut = groups.first().toMap().value("rows").toList().at(6).toMap();
        QCOMPARE(cut.value("label").toString(), QStringLiteral("Cut (blade) tool"));
        const auto combos = [](const QVariantMap& row) {
            QList<QStringList> out;
            for (const QVariant& c : row.value("combos").toList()) out.append(c.toStringList());
            return out;
        };
        QCOMPARE(combos(cut), (QList<QStringList>{{"C"}}));
        int rows = 0;
        for (const QVariant& gv : groups) rows += gv.toMap().value("rows").toList().size();
        QCOMPARE(rows, 107);
        if (qEnvironmentVariableIsSet("NT_SHOT_DIR")) {
            view->resize(1600, 1000);
            sheetItem->setSize(region->size());
            frame();
            view->grabWindow().save(qEnvironmentVariable("NT_SHOT_DIR") + "/native-sheet.png");
        }
        g->setKeyboardPreset(QStringLiteral("premiere"));
        sheet->setProperty("open", false);
        sheet->setProperty("open", true);
        const QVariantMap redo = sheet->property("content").toMap().value("groups").toList().last().toMap()
                                     .value("rows").toList().at(1).toMap();
        QCOMPARE(combos(redo), (QList<QStringList>{{"Ctrl", "Shift", "Z"}, {"Ctrl", "Y"}}));
        view->resize(320, 480);
        sheetItem->setSize(region->size());
        frame();
        QVERIFY(dialog->property("x").toDouble() >= 0);
        QVERIFY(dialog->property("y").toDouble() >= 0);
        QVERIFY(dialog->property("x").toDouble() + dialog->property("width").toDouble() <= view->width());
        QVERIFY(dialog->property("y").toDouble() + dialog->property("height").toDouble() <= view->height());
        if (qEnvironmentVariableIsSet("NT_SHOT_DIR"))
            view->grabWindow().save(qEnvironmentVariable("NT_SHOT_DIR") + "/native-sheet-narrow.png");
        QTest::keyClick(view.get(), Qt::Key_Escape);
        QTRY_VERIFY(!sheet->property("open").toBool());
        QCOMPARE(view->activeFocusItem(), focusBefore);
        sheet->setProperty("open", true);
        QTRY_VERIFY(dialog->property("visible").toBool());
        QTest::mouseClick(view.get(), Qt::LeftButton, Qt::NoModifier, {2, 2});
        QTRY_VERIFY(!sheet->property("open").toBool());
        sheet->setProperty("open", true);
        QTRY_VERIFY(dialog->property("visible").toBool());
        key(Qt::Key_Question, Qt::ShiftModifier, "?");
        QTRY_VERIFY(!sheet->property("open").toBool());
    }

    // ── M2b: waveforms and filmstrips ──
    // audioPeaks.test.ts and filmstripCells.test.ts, the same expectations.
    void picturesSampleLikeTheWeb() {
        const std::vector<float> full{0.1f, 0.2f, 0.3f, 0.4f, 0.5f, 0.6f, 0.7f, 0.8f, 0.9f, 1.0f};
        QCOMPARE(samplePeaksWindow(full, 1000, 0, 1000, 5).size(), size_t(5));
        auto w = samplePeaksWindow(full, 1000, 500, 1000, 5);
        QCOMPARE(w.front(), 0.6f);
        QCOMPARE(w.back(), 1.0f);
        w = samplePeaksWindow(full, 1000, -200, 2000, 4);
        QCOMPARE(w.size(), size_t(4));
        QCOMPARE(w.front(), 0.2f);
        QCOMPARE(w.back(), 1.0f);
        w = samplePeaksWindow(full, 0, 0, 1000, 5);
        QVERIFY(std::all_of(w.begin(), w.end(), [](float v) { return v == 0; }));

        std::vector<Thumbnail> thumbs;
        for (int k = 0; k < 24; ++k) thumbs.push_back({double(k), QImage()});
        QCOMPARE(selectFilmstripCells(thumbs, 4, 0, 23000), (std::vector<int>{0, 8, 15, 23}));
        QCOMPARE(selectFilmstripCells(thumbs, 3, 10000, 20000), (std::vector<int>{10, 15, 20}));
        QCOMPARE(selectFilmstripCells(thumbs, 1, 7000, 12000), (std::vector<int>{7}));
        QCOMPARE(selectFilmstripCells(thumbs, 4, 0, 10000), (std::vector<int>{0, 3, 7, 10}));
        QCOMPARE(selectFilmstripCells(thumbs, 2, 20000, 40000), (std::vector<int>{20, 23}));
        QVERIFY(selectFilmstripCells({}, 4, 0, 1000).empty());
        QVERIFY(selectFilmstripCells(thumbs, 0, 0, 1000).empty());
        QCOMPARE(beyondSourceFraction(thumbs, 0, 24000), 0.0);
        QCOMPARE(beyondSourceFraction(thumbs, 5000, 12000), 0.0);
        QVERIFY(std::abs(beyondSourceFraction(thumbs, 20000, 28000) - 0.5) < 1e-9);
        QCOMPARE(beyondSourceFraction(thumbs, 30000, 40000), 1.0);
        QCOMPARE(beyondSourceFraction({thumbs[0]}, 0, 99000), 0.0);
    }

    // The thumbnails are the frames FFmpeg's command line shows at the same
    // times (the web seeks a <video> to i / 23 of the length).
    void thumbnailsAreTheFramesAtTheirTimes() {
        const QString media = QStringLiteral(NT_FIXTURES_DIR "/media/numbered-a-1080p30.mp4");
        const std::vector<Thumbnail> thumbs = extractThumbnails(media);
        QCOMPARE(thumbs.size(), size_t(24));
        QCOMPARE(thumbs[0].image.size(), QSize(160, 90));
        for (int i = 0; i < 24; ++i) QVERIFY(std::abs(thumbs[size_t(i)].timeSec - std::min(19.999, i * 20.0 / 23)) < 1e-9);
        // Only a missing command line skips; any failure of it fails.
        const QString ffmpegBin = QStandardPaths::findExecutable("ffmpeg");
        if (ffmpegBin.isEmpty()) QSKIP("no ffmpeg command line on PATH");
        // Frame n of the clip from FFmpeg's command line, at the same size.
        const auto cliFrame = [&](int n) -> QImage {
            QProcess ffmpeg;
            ffmpeg.start(ffmpegBin, {"-v", "error", "-i", media, "-vf",
                                    QStringLiteral("select=eq(n\\,%1),scale=160:90").arg(n), "-sws_flags", "bilinear",
                                    "-frames:v", "1", "-f", "rawvideo", "-pix_fmt", "rgb24", "-"});
            if (!ffmpeg.waitForFinished(60000) || ffmpeg.exitStatus() != QProcess::NormalExit ||
                ffmpeg.exitCode() != 0) {
                qWarning("ffmpeg frame %d failed: %s", n, ffmpeg.readAllStandardError().constData());
                return {};
            }
            const QByteArray rgb = ffmpeg.readAllStandardOutput();
            if (rgb.size() != 160 * 90 * 3) {
                qWarning("ffmpeg frame %d: %lld bytes", n, static_cast<long long>(rgb.size()));
                return {};
            }
            return QImage(reinterpret_cast<const uchar*>(rgb.constData()), 160, 90, 160 * 3, QImage::Format_RGB888)
                .convertToFormat(QImage::Format_RGB32);
        };
        const auto diff = [](const QImage& a, const QImage& b) {
            double sum = 0;
            for (int y = 0; y < 90; ++y)
                for (int x = 0; x < 160; ++x) {
                    const QRgb p = a.pixel(x, y), q = b.pixel(x, y);
                    sum += std::abs(qRed(p) - qRed(q)) + std::abs(qGreen(p) - qGreen(q)) + std::abs(qBlue(p) - qBlue(q));
                }
            return sum / (160 * 90 * 3);
        };
        for (int i : {1, 5, 22}) {
            const double t = thumbs[size_t(i)].timeSec;
            // The frame a <video> shows at t: the one that starts at or before it.
            const int n = static_cast<int>(std::floor(t * 30 + 1e-6));
            const QImage same = cliFrame(n);
            const QImage prev = cliFrame(n - 1);
            const QImage next = cliFrame(n + 1);
            QVERIFY(!same.isNull() && !prev.isNull() && !next.isNull());
            // The numbered clip changes its digits every frame: the picture is
            // nearer frame n than its neighbours.
            const double d0 = diff(thumbs[size_t(i)].image, same);
            const double before = diff(thumbs[size_t(i)].image, prev);
            const double after = diff(thumbs[size_t(i)].image, next);
            QVERIFY2(d0 < before && d0 < after,
                     qPrintable(QStringLiteral("t %1: %2 vs %3 / %4").arg(t).arg(d0).arg(before).arg(after)));
        }
    }

    void thumbnailsReuseTheSameKeyframe() {
#ifdef Q_OS_UNIX
        QTemporaryDir dir;
        QVERIFY(dir.isValid());
        const QString media = dir.filePath("long-gop.mp4");
        QProcess ffmpeg;
        ffmpeg.start("ffmpeg", {"-v", "error", "-f", "lavfi", "-i", "testsrc2=size=320x180:rate=24",
                               "-t", "3", "-c:v", "libx264", "-g", "72", "-keyint_min", "72",
                               "-sc_threshold", "0", "-bf", "2", media});
        QVERIFY(ffmpeg.waitForFinished(30000));
        QCOMPARE(ffmpeg.exitCode(), 0);
        std::atomic<int> seeks{0};
        setLocalIoStallForTesting([&](const char* operation, const QString& path) {
            if (path == media && QByteArray(operation) == "lseek") ++seeks;
        });
        const auto resetHook = qScopeGuard([] { setLocalIoStallForTesting({}); });
        const auto thumbs = extractThumbnails(media);
        QCOMPARE(thumbs.size(), size_t(24));
        QVERIFY2(seeks.load() < 12, qPrintable(QStringLiteral("Repeated seeks into one GOP: %1").arg(seeks.load())));
#endif
    }

    void picturesDecodeOffTheGuiThreadOnceAndDraw() {
        MediaPreviewCache& cache = MediaPreviewCache::instance();
        cache.clear();
        const int decodesBefore = cache.decodeCount();
        const QString audio = QStringLiteral(NT_FIXTURES_DIR "/media/clicks-48k.wav");
        const QString video = QStringLiteral(NT_FIXTURES_DIR "/media/numbered-a-1080p30.mp4");
        Layout l{4, 3};
        QJsonObject json = makeTimelineJson(l);
        for (int k = 0; k < 3; ++k) {
            json = withClipFields(json, QStringLiteral("c-3-%1").arg(k), {{"mediaPath", audio}, {"inPointMs", k * 1000}});
            json = withClipFields(json, QStringLiteral("c-0-%1").arg(k), {{"mediaPath", video}, {"inPointMs", k * 1000},
                                                                          {"durationMs", 4000}});
        }
        loadJson(json, l);
        seed(10, 0);
        QTRY_COMPARE_WITH_TIMEOUT(cache.pendingCount(), 0, 30000);
        frame();
        // One decode per file, however many clips use it, none on the GUI thread.
        QCOMPARE(cache.decodeCount() - decodesBefore, 2);
        QCOMPARE(cache.guiThreadDecodes(), 0);
        auto* wave = qobject_cast<WaveformItem*>(itemNamed("clip-c-3-1")->findChild<QQuickItem*>("waveform"));
        QQuickItem* waveItem = nullptr;
        collect(itemNamed("clip-c-3-1"), [&](QQuickItem* it) { if (it->objectName() == "waveform") waveItem = it; });
        wave = qobject_cast<WaveformItem*>(waveItem);
        QVERIFY(wave && wave->loaded());
        // 800 ms over 80 px: a bar per 2 px, over the clip's own source window.
        QCOMPARE(wave->barCount(), 40);
        QCOMPARE(wave->inPointMs(), 1000.0);
        QCOMPARE(wave->outPointMs(), 1800.0);
        QQuickItem* stripItem = nullptr;
        collect(itemNamed("clip-c-0-1"), [&](QQuickItem* it) { if (it->objectName() == "filmstrip") stripItem = it; });
        auto* strip = qobject_cast<FilmstripItem*>(stripItem);
        QVERIFY(strip && strip->loaded());
        // A 4000 ms clip at 10 ms/px is 400 px: 6 cells of 60 px, from 1 s on.
        QCOMPARE(strip->cellCount(), 6);
        QCOMPARE(strip->cellThumbnails(), (QVariantList{1, 2, 3, 4, 5, 6}));
        // The six cells are drawn over the whole strip, and the frame shows them.
        QCOMPARE(strip->drawnCells(), 6);
        QVERIFY(coversSpan(strip->cellRects(), 0, strip->width()));
        QVERIFY2(pictureColours(strip, 0, strip->width()) > 64,
                 qPrintable(QString::number(pictureColours(strip, 0, strip->width()))));

        // D30: playback repaints no picture; a zoom does.
        const int wavePaints = wave->paintCount();
        const int stripPaints = strip->paintCount();
        clock->play();
        for (int i = 0; i < 30; ++i) {
            QTest::qWait(5);
            clock->tick();
            frame();
        }
        clock->pause();
        QCOMPARE(wave->paintCount(), wavePaints);
        QCOMPARE(strip->paintCount(), stripPaints);
        vs->zoomTo(5, 0);
        frame();
        QVERIFY(wave->paintCount() > wavePaints);
        QVERIFY(strip->paintCount() > stripPaints);
        QCOMPARE(wave->barCount(), 80);
        // A second document with the same files decodes nothing again.
        const int decodes = cache.decodeCount();
        loadJson(json, l);
        QTRY_COMPARE_WITH_TIMEOUT(cache.pendingCount(), 0, 30000);
        QCOMPARE(cache.decodeCount(), decodes);
    }


    // ── M2b: the save state of a server timeline ──
    // A stand-in with the AutosaveController's properties (src/server/
    // AutosaveController.h: dirty, saving, conflict, stripped, lastError).
    void saveStateShowsAsTheWebShowsIt() {
        load({2, 2});
        QQmlEngine* engine = view->engine();
        QQmlComponent fake(engine);
        fake.setData("import QtQuick\nQtObject { property bool dirty: false; property bool saving: false;"
                     " property bool conflict: false; property var stripped: []; property string lastError: \"\";"
                     " property string keptCopy: \"\"; property string recoveryError: \"\" }",
                     QUrl());
        std::unique_ptr<QObject> saver(fake.create());
        QVERIFY2(saver, qPrintable(fake.errorString()));
        QQmlComponent harness(engine);
        harness.setData("import QtQuick\nimport NodeTool.Timeline\nColumn { width: 900; property alias bar: bar;"
                        " property alias banners: banners; property QtObject saver: null; property TimelineModel model;"
                        " DocumentBar { id: bar; width: 900; timeline: parent.model; autosave: parent.saver }"
                        " SaveBanners { id: banners; width: 900; autosave: parent.saver } }",
                        QUrl());
        std::unique_ptr<QObject> root(harness.createWithInitialProperties(
            {{"saver", QVariant::fromValue(saver.get())}, {"model", QVariant::fromValue(model)}}));
        QVERIFY2(root, qPrintable(harness.errorString()));
        auto* rootItem = qobject_cast<QQuickItem*>(root.get());
        rootItem->setParentItem(region);
        rootItem->setZ(100);
        const auto find = [&](const QString& name) {
            QQuickItem* found = nullptr;
            collect(rootItem, [&](QQuickItem* it) { if (!found && it->objectName() == name) found = it; });
            return found;
        };
        const auto label = [&]() { return find("saveLabel")->property("text").toString(); };
        const auto shot = [&](const QString& name) {
            frame();
            if (qEnvironmentVariableIsSet("NT_SHOT_DIR"))
                view->grabWindow().copy(0, 0, 900, 200).save(qEnvironmentVariable("NT_SHOT_DIR") + "/save-" + name + ".png");
        };
        QCOMPARE(label(), QStringLiteral("Saved"));
        QCOMPARE(find("saveDot")->property("color").value<QColor>(), QColor("#80DCA0"));
        shot("saved");
        saver->setProperty("dirty", true);
        QCOMPARE(label(), QStringLiteral("Unsaved changes"));
        QCOMPARE(find("saveDot")->property("color").value<QColor>(), QColor("#FFD08A"));
        saver->setProperty("saving", true);
        QCOMPARE(label(), QStringLiteral("Saving…"));
        QVERIFY(find("saveSpinner")->isVisible());
        saver->setProperty("saving", false);
        saver->setProperty("lastError", "HTTP 500");
        QCOMPARE(label(), QStringLiteral("Not saved"));
        QVERIFY(!find("conflictBanner")->isVisible());  // a failed save is the status, not a banner
        saver->setProperty("conflict", true);
        saver->setProperty("lastError", "the timeline changed on the server; your copy is in 8941.local.json");
        QVERIFY(find("conflictBanner")->isVisible());
        QString detail;
        collect(find("conflictBanner"), [&](QQuickItem* it) { if (it->objectName() == "alertDetail") detail = it->property("text").toString(); });
        QCOMPARE(detail, saver->property("lastError").toString());
        // With the copy properties the review asks of the controller.
        saver->setProperty("keptCopy", "/cache/ui.local.json");
        collect(find("conflictBanner"), [&](QQuickItem* it) { if (it->objectName() == "alertDetail") detail = it->property("text").toString(); });
        QVERIFY(detail.endsWith(QStringLiteral(" A copy of your edits is in /cache/ui.local.json.")));
        saver->setProperty("keptCopy", "");
        saver->setProperty("recoveryError", "disk full");
        collect(find("conflictBanner"), [&](QQuickItem* it) { if (it->objectName() == "alertDetail") detail = it->property("text").toString(); });
        QVERIFY(detail.endsWith(QStringLiteral(" The copy of your edits could not be written: disk full.")));
        saver->setProperty("recoveryError", "");
        shot("conflict");
        saver->setProperty("conflict", false);
        saver->setProperty("lastError", "");
        QVERIFY(!find("conflictBanner")->isVisible());
        saver->setProperty("stripped", QStringList{"clips[3].lut", "tempo.swing"});
        QVERIFY(find("strippedBanner")->isVisible());
        QString title;
        collect(find("strippedBanner"), [&](QQuickItem* it) { if (it->objectName() == "alertTitle") title = it->property("text").toString(); });
        QCOMPARE(title, QStringLiteral("The server did not keep 2 fields of the saved timeline."));
        shot("stripped");
        // Dismissed until a new strip list arrives.
        rootItem->property("banners").value<QObject*>()->setProperty("strippedDismissed", true);
        QVERIFY(!find("strippedBanner")->isVisible());
        saver->setProperty("stripped", QStringList{"x"});
        QVERIFY(find("strippedBanner")->isVisible());
        // A local file has no saver: no status.
        rootItem->setProperty("saver", QVariant::fromValue<QObject*>(nullptr));
        QVERIFY(!find("saveStatus")->isVisible());
    }


    // Review F10: a probed source length belongs to one version of a file. A
    // new document whose file was replaced in place probes it again.
    void aReplacedFileIsProbedAgain() {
        QTemporaryDir dir;
        QVERIFY(dir.isValid());
        const QString file = dir.filePath("clip.mp4");
        QVERIFY(QFile::copy(QStringLiteral(NT_FIXTURES_DIR "/media/seek-360p30.mp4"), file));  // 10 s
        QJsonObject json = makeTimelineJson({1, 0});
        json.insert("clips", QJsonArray{QJsonObject{{"id", "v"}, {"trackId", "track-0"}, {"name", "v"},
                                                    {"startMs", 0}, {"durationMs", 1000}, {"mediaType", "video"},
                                                    {"mediaPath", file}, {"sourceType", "imported"},
                                                    {"status", "generated"}}});
        loadJson(json, {1, 0});
        QTRY_COMPARE(controller()->sourceCapMs("v"), 10000.0);
        QVERIFY(QFile::remove(file));
        QVERIFY(QFile::copy(QStringLiteral(NT_FIXTURES_DIR "/media/numbered-a-1080p30.mp4"), file));  // 20 s
        model->setTimeline(parseTimeline(json));
        QTRY_COMPARE(controller()->sourceCapMs("v"), 20000.0);
    }


    // Review F6 (TrackLane.tsx): a press on the empty lane under a track
    // select tool selects the block from there, Shift keeps to that lane, and
    // the playhead stays.
    void trackSelectFromAnEmptyLane() {
        load({3, 6});
        seed(10, 0);
        auto* g = controller();
        clock->seek(0);
        g->setActiveTool(QStringLiteral("trackSelect"));
        // Track 1, x 290 px = 2900 ms: in the gap after c-1-2 (2000..2800).
        const QPoint gap = itemNamed("trackLane-track-1")->mapToScene(QPointF(290 - vs->scrollLeftPx(), 20)).toPoint();
        click(gap);
        QStringList got = g->selection();
        std::sort(got.begin(), got.end());
        QStringList expected;
        for (int t = 0; t < 3; ++t)
            for (int k = 3; k < 6; ++k) expected.append(QStringLiteral("c-%1-%2").arg(t).arg(k));
        QCOMPARE(got, expected);
        QCOMPARE(clock->time(), 0.0);
        g->setActiveTool(QStringLiteral("trackSelectBackward"));
        click(gap, Qt::ShiftModifier);
        QCOMPARE(g->selection(), (QStringList{"c-1-0", "c-1-1", "c-1-2"}));
        QCOMPARE(clock->time(), 0.0);
        // With Select the press clears and seeks, as before.
        g->setActiveTool(QStringLiteral("select"));
        click(gap);
        QVERIFY(g->selection().isEmpty());
        QCOMPARE(clock->time(), 2900.0);
    }


    // Review F7: X marks the clip (markClipRange), and the sheet shows the
    // actions the native editor does not run as unavailable.
    void markClipAndUnavailableShortcuts() {
        // Each track's clip under 2300 ms has its own span, and the top
        // track is locked: the mark is the span of track 1's clip.
        Layout l{3, 6};
        QJsonObject json = makeTimelineJson(l);
        QJsonArray tracks = json.value("tracks").toArray();
        QJsonObject top = tracks.at(0).toObject();
        top.insert("locked", true);
        tracks.replace(0, top);
        json.insert("tracks", tracks);
        json = withClipFields(json, "c-1-2", {{"startMs", 2100}, {"durationMs", 900}});
        json = withClipFields(json, "c-2-2", {{"startMs", 1900}, {"durationMs", 600}});
        loadJson(json, l);
        seed(10, 0);
        region->forceActiveFocus();
        auto* g = controller();
        // No selection: the clip under the playhead on the topmost unlocked track.
        clock->seek(2300);
        key(Qt::Key_X, {}, "x");
        QCOMPARE(vs->rangeInMs(), 2100.0);
        QCOMPARE(vs->rangeOutMs(), 3000.0);
        // The top track unlocked: its clip wins over the lower ones.
        top.insert("locked", false);
        tracks.replace(0, top);
        json.insert("tracks", tracks);
        loadJson(json, l);
        seed(10, 0);
        region->forceActiveFocus();
        g = controller();
        clock->seek(2300);
        key(Qt::Key_X, {}, "x");
        QCOMPARE(vs->rangeInMs(), 2000.0);
        QCOMPARE(vs->rangeOutMs(), 2800.0);
        // A selection: its span.
        g->setSelection({"c-0-1", "c-2-3"});
        key(Qt::Key_X, {}, "x");
        QCOMPARE(vs->rangeInMs(), 1000.0);
        QCOMPARE(vs->rangeOutMs(), 3800.0);
        // In a gap with nothing selected: no change.
        g->setSelection({});
        clock->seek(3900);
        key(Qt::Key_X, {}, "x");
        QCOMPARE(vs->rangeInMs(), 1000.0);

        const QVariantMap sheet = g->shortcutSheet();
        QHash<QString, bool> available;
        for (const QVariant& gv : sheet.value("groups").toList())
            for (const QVariant& rv : gv.toMap().value("rows").toList())
                available.insert(rv.toMap().value("id").toString(), rv.toMap().value("available").toBool());
        QCOMPARE(available.size(), 107);
        for (const char* yes : {"markClip", "cutTool", "markIn", "addMarker", "splitAtPlayhead", "undo", "playPause",
                                "rollCut", "insertOnDrop", "disableSnapping", "toggleLoop", "playInToOut", "copy", "groupClips"})
            QVERIFY2(available.value(yes), yes);
        for (const char* no : {"matchFrame", "selectEditPoint", "goToStart"})
            QVERIFY2(!available.value(no, true), no);
    }


    // Review F3: the banners with the real AutosaveController against a test
    // server. A strip must not advertise a recovery of an earlier edit.
    void saveBannersFollowTheRealController() {
        load({1, 1});
        TestHttpServer http;
        QUndoStack undo;
        QJsonObject raw = model->timeline().raw;
        QTemporaryDir dir;
        QVERIFY(dir.isValid());
        const auto banners = [&](nt::server::AutosaveController* saver) {
            QQmlComponent c(view->engine());
            c.setData("import QtQuick\nimport NodeTool.Timeline\nSaveBanners { width: 900 }", QUrl());
            auto* item = qobject_cast<QQuickItem*>(c.createWithInitialProperties({{"autosave", QVariant::fromValue<QObject*>(saver)}}));
            if (!item) qFatal("%s", qPrintable(c.errorString()));
            item->setParentItem(region);
            return std::unique_ptr<QQuickItem>(item);
        };
        const auto text = [&](QQuickItem* root, const QString& banner, const QString& part) {
            QString out;
            collect(root, [&](QQuickItem* it) {
                if (it->objectName() == banner)
                    collect(it, [&](QQuickItem* t) { if (t->objectName() == part) out = t->property("text").toString(); });
            });
            return out;
        };
        const auto visible = [&](QQuickItem* root, const QString& banner) {
            bool v = false;
            collect(root, [&](QQuickItem* it) { if (it->objectName() == banner) v = it->isVisible(); });
            return v;
        };
        struct Bump : QUndoCommand {
            int* v;
            explicit Bump(int* p) : v(p) {}
            void redo() override { ++*v; }
            void undo() override { --*v; }
        };
        int value = 0;
        const auto docFn = [&]() { QJsonObject d = raw; d.insert("durationMs", 1000 + value); return d; };
        const QByteArray stripOk = R"({"result":{"data":{"id":"ui","updatedAt":"u1","stripped":["clips.0.lut"]}}})";
        const QByteArray conflictBody = R"({"error":{"message":"Timeline has been modified since last load","data":{"code":"CONFLICT","httpStatus":409,"apiCode":"ALREADY_EXISTS"}}})";

        // A strip whose copy cannot be written: no claim of a copy.
        {
            http.setPost([&](const QByteArray&, const QByteArray&) { return stripOk; });
            nt::server::SaveTarget t{http.base(), QString(), QStringLiteral("ui"), QStringLiteral("/dev/null/no-such-folder")};
            nt::server::AutosaveController saver(t, &undo, docFn, QStringLiteral("u0"));
            saver.setQuitFallbackDirs({QStringLiteral("/dev/null/also-not")});
            saver.setAutosave(false);
            undo.push(new Bump(&value));
            const nt::server::SaveResult r = saver.saveNow();
            QVERIFY(r.ok && r.keptCopy.isEmpty() && !r.recoveryError.isEmpty());
            auto root = banners(&saver);
            frame();
            QVERIFY(visible(root.get(), "strippedBanner"));
            const QString detail = text(root.get(), "strippedBanner", "alertDetail");
            QVERIFY2(detail.startsWith(QStringLiteral("clips.0.lut")), qPrintable(detail));
            QVERIFY2(!detail.contains(QStringLiteral("kept")), qPrintable(detail));
        }
        // m2b F3: a stale recovery must not appear in the strip banner.
        {
            int calls = 0;
            const QByteArray unavailable = R"({"error":{"message":"Unavailable","data":{"code":"INTERNAL_SERVER_ERROR","httpStatus":503}}})";
            http.setPost([&](const QByteArray&, const QByteArray&) { return ++calls == 1 ? unavailable : stripOk; });
            const QString backup = dir.filePath(QStringLiteral("stale-copy"));
            nt::server::SaveTarget t{http.base(), QString(), QStringLiteral("ui"), backup};
            nt::server::AutosaveController saver(t, &undo, docFn, QStringLiteral("u0"));
            saver.setQuitFallbackDirs({QStringLiteral("/dev/null/also-not")});
            saver.setAutosave(false);
            undo.push(new Bump(&value));
            const QJsonObject firstDoc = docFn();
            const auto failed = saver.saveNow();
            QVERIFY(!failed.ok && !failed.conflict);
            const QString recovery = dir.filePath(QStringLiteral("stale-copy/ui.recovery.json"));
            QCOMPARE(failed.keptCopy, recovery);
            QFile oldCopy(recovery);
            QVERIFY(oldCopy.open(QIODevice::ReadOnly));
            QCOMPARE(QJsonDocument::fromJson(oldCopy.readAll()).object(), firstDoc);
            oldCopy.close();
            auto root = banners(&saver);
            undo.push(new Bump(&value));
            QVERIFY(docFn() != firstDoc);
            QVERIFY(QDir(backup).mkpath(QStringLiteral("ui.stripped.json")));
            QVERIFY(saver.saveNow().ok);
            frame();
            QVERIFY(visible(root.get(), "strippedBanner"));
            const QString detail = text(root.get(), "strippedBanner", "alertDetail");
            QVERIFY2(!detail.contains(recovery), qPrintable(detail));
            QVERIFY2(!detail.contains(QStringLiteral("A copy of your edits is in ")), qPrintable(detail));
            QVERIFY2(detail.contains(QStringLiteral("could not be written")), qPrintable(detail));
            QVERIFY(saver.keptCopy().isEmpty());
            QVERIFY(!saver.recoveryError().isEmpty());
            QVERIFY(oldCopy.open(QIODevice::ReadOnly));
            QCOMPARE(QJsonDocument::fromJson(oldCopy.readAll()).object(), firstDoc);
        }
        // A fallback copy is named exactly, including its server/account scope.
        {
            http.setPost([&](const QByteArray&, const QByteArray&) { return stripOk; });
            nt::server::SaveTarget t{http.base(), QString(), QStringLiteral("ui"), QStringLiteral("/dev/null/no-such-folder")};
            nt::server::AutosaveController saver(t, &undo, docFn, QStringLiteral("u0"));
            const QString fallback = dir.filePath(QStringLiteral("fallback"));
            saver.setQuitFallbackDirs({fallback});
            saver.setAutosave(false);
            undo.push(new Bump(&value));
            const auto saved = saver.saveNow();
            QVERIFY(saved.ok);
            nt::server::ServerClient client(http.base(), QString());
            const QString expected = QDir(fallback).filePath(nt::server::safePathPart(client.serverKey()) + u'/' +
                nt::server::safePathPart(client.userKey()) + QStringLiteral("/ui.stripped.json"));
            QCOMPARE(saved.keptCopy, expected);
            QFile copy(expected);
            QVERIFY(copy.open(QIODevice::ReadOnly));
            QCOMPARE(QJsonDocument::fromJson(copy.readAll()).object(), docFn());
            auto root = banners(&saver);
            frame();
            QVERIFY(visible(root.get(), "strippedBanner"));
            QCOMPARE(text(root.get(), "strippedBanner", "alertDetail"),
                     QStringLiteral("clips.0.lut. A copy of your edits is in ") + expected + u'.');
        }
        // A conflict: the banner shows, with the controller's own error.
        {
            http.setPost([&](const QByteArray&, const QByteArray&) { return conflictBody; });
            nt::server::SaveTarget t{http.base(), QString(), QStringLiteral("ui"), dir.path()};
            nt::server::AutosaveController saver(t, &undo, docFn, QStringLiteral("u0"));
            saver.setQuitFallbackDirs({dir.filePath(QStringLiteral("fallback"))});
            saver.setAutosave(false);
            undo.push(new Bump(&value));
            const nt::server::SaveResult r = saver.saveNow();
            QVERIFY(r.conflict);
            auto root = banners(&saver);
            frame();
            QVERIFY(visible(root.get(), "conflictBanner"));
            QVERIFY(!visible(root.get(), "strippedBanner"));
            QCOMPARE(text(root.get(), "conflictBanner", "alertDetail").left(saver.lastError().size()), saver.lastError());
        }
    }


    // ── Review F1, F2, F4, F5: the clip picture caches ──
    QJsonObject mediaDoc(const QList<std::tuple<QString, QString, double>>& clips) {
        // clips: (id, file, durationMs); video on track 0, audio on track 3.
        QJsonObject json = makeTimelineJson({4, 0});
        QJsonArray out;
        double start = 0;
        for (const auto& [id, file, durationMs] : clips) {
            const bool audio = file.endsWith(".wav");
            out.append(QJsonObject{{"id", id}, {"trackId", audio ? "track-3" : "track-0"}, {"name", id},
                                   {"startMs", start}, {"durationMs", durationMs}, {"inPointMs", 0},
                                   {"mediaType", audio ? "audio" : "video"}, {"mediaPath", file},
                                   {"sourceType", "imported"}, {"status", "generated"}});
            if (!audio) start += durationMs;
        }
        json.insert("clips", out);
        json.insert("durationMs", std::max(1000.0, start));
        return json;
    }
    // Whether rects (cells 2 px apart) leave no gap over [from, to].
    static bool coversSpan(const QVariantList& rects, double from, double to) {
        std::vector<std::pair<double, double>> spans;
        for (const QVariant& r : rects) spans.emplace_back(r.toRectF().left(), r.toRectF().right());
        std::sort(spans.begin(), spans.end());
        double reach = from;
        for (const auto& [a, b] : spans) {
            if (a > reach + 2.5) break;
            reach = std::max(reach, b);
        }
        if (reach < to - 2.5) qWarning("covered %g..%g of %g..%g (%d rects)", from, reach, from, to, int(rects.size()));
        return reach >= to - 2.5;
    }
    // The distinct colours the window shows over [from, to] of `item` (its
    // own px), on the screen part: a drawn filmstrip shows many, a bare
    // clip body a few.
    int pictureColours(QQuickItem* item, double from, double to) {
        const QImage shot = view->grabWindow();
        const QRect area = item->mapRectToScene(QRectF(from, 0, to - from, item->height())).toAlignedRect() &
                           QRect(QPoint(int(kHeaderWidth), 0), QSize(int(shot.width() - kHeaderWidth), shot.height()));
        QSet<QRgb> colours;
        for (int y = area.top(); y <= area.bottom(); y += 2)
            for (int x = area.left(); x <= area.right(); x += 2) colours.insert(shot.pixel(x, y));
        return int(colours.size());
    }
    QQuickItem* pictureItem(const QString& clipId, const QString& name) {
        QQuickItem* found = nullptr;
        if (QQuickItem* c = itemNamed(QStringLiteral("clip-") + clipId))
            collect(c, [&](QQuickItem* it) { if (it->objectName() == name) found = it; });
        return found;
    }

    // F4: a file replaced in place gets new pictures in the next document.
    void aReplacedFileGetsNewPictures() {
        MediaPreviewCache& cache = MediaPreviewCache::instance();
        cache.clear();
        QTemporaryDir dir;
        const QString file = dir.filePath("sound.wav");
        QVERIFY(QFile::copy(QStringLiteral(NT_FIXTURES_DIR "/media/tone-440-48k-mono.wav"), file));  // 6 s
        const QJsonObject json = mediaDoc({{"a", file, 1000}});
        loadJson(json, {4, 0});
        QTRY_VERIFY(qobject_cast<WaveformItem*>(pictureItem("a", "waveform")) && qobject_cast<WaveformItem*>(pictureItem("a", "waveform"))->loaded());
        QCOMPARE(qobject_cast<WaveformItem*>(pictureItem("a", "waveform"))->sourceDurationMs(), 6000.0);
        QVERIFY(QFile::remove(file));
        QVERIFY(QFile::copy(QStringLiteral(NT_FIXTURES_DIR "/media/clicks-48k.wav"), file));  // 20 s
        loadJson(json, {4, 0});
        QTRY_VERIFY(qobject_cast<WaveformItem*>(pictureItem("a", "waveform")) && qobject_cast<WaveformItem*>(pictureItem("a", "waveform"))->loaded());
        QCOMPARE(qobject_cast<WaveformItem*>(pictureItem("a", "waveform"))->sourceDurationMs(), 20000.0);
    }

    // F5: decodes nobody waits for any more are dropped or interrupted.
    void abandonedDecodesStop() {
        MediaPreviewCache& cache = MediaPreviewCache::instance();
        cache.clear();
        QTemporaryDir dir;
        const QString big = QStringLiteral(NT_FIXTURES_DIR "/media/numbered-a-2160p30-hevc.mp4");
        auto subscriber = std::make_unique<QObject>();
        for (int i = 0; i < 6; ++i) {
            const QString link = dir.filePath(QStringLiteral("big-%1.mp4").arg(i));
            QVERIFY(QFile::link(big, link));
            QVERIFY(!cache.thumbnails(link, QStringLiteral("video"), subscriber.get()));
        }
        QCOMPARE(cache.pendingCount(), 6);
        QElapsedTimer timer;
        timer.start();
        subscriber.reset();  // the document closed
        QTRY_COMPARE_WITH_TIMEOUT(cache.pendingCount(), 0, 10000);
        cache.waitForIdle();
        // Six 4K HEVC filmstrips take many seconds; dropped ones take none.
        QVERIFY2(timer.elapsed() < 3000, qPrintable(QString::number(timer.elapsed())));
        QCOMPARE(cache.cancelledCount(), 6);
        QCOMPARE(cache.cachedThumbnailSets(), 0);
    }

    // F1: one texture per file and window, shared by its clips, and the
    // unused ones freed under the byte budget.
    void filmstripTexturesAreSharedAndBudgeted() {
        MediaPreviewCache& cache = MediaPreviewCache::instance();
        cache.clear();
        QTemporaryDir dir;
        const QString a = QStringLiteral(NT_FIXTURES_DIR "/media/numbered-a-1080p30.mp4");
        const QString b = dir.filePath("b.mp4");
        QVERIFY(QFile::link(a, b));
        QJsonObject json = mediaDoc({{"v1", a, 2000}, {"v2", a, 2000}, {"v3", a, 2000}, {"w1", b, 2000}});
        json.insert("durationMs", 600000);  // room to scroll the clips away
        loadJson(json, {4, 0});
        seed(10, 0);
        QTRY_COMPARE_WITH_TIMEOUT(cache.pendingCount(), 0, 30000);
        frame();
        frame();
        FilmstripTextureStats st = filmstripTextureStats(view.get());
        QCOMPARE(st.textures, 2);
        QCOMPARE(st.unused, 0);
        QVERIFY(st.bytes > 0);
        // Scroll every clip out of the window: the delegates go, and with no
        // budget for unused textures the textures go too.
        setFilmstripTextureBudget(view.get(), 0);
        vs->setScrollLeftPx(50000);
        frame();
        frame();
        st = filmstripTextureStats(view.get());
        QCOMPARE(itemsNamed("clip-").size(), 0);
        QCOMPARE(st.textures, 0);
        QCOMPARE(st.bytes, qint64(0));
        // Back in view: the texture comes back from the shared atlas.
        setFilmstripTextureBudget(view.get(), 64 << 20);
        vs->setScrollLeftPx(0);
        frame();
        frame();
        QCOMPARE(filmstripTextureStats(view.get()).textures, 2);
    }

    // F2: a long clip at the finest zoom draws only what crosses the view.
    void longClipsDrawOnlyTheirVisiblePart() {
        MediaPreviewCache& cache = MediaPreviewCache::instance();
        const QString audio = QStringLiteral(NT_FIXTURES_DIR "/media/clicks-48k.wav");
        const QString video = QStringLiteral(NT_FIXTURES_DIR "/media/numbered-a-1080p30.mp4");
        loadJson(mediaDoc({{"a", audio, 20000}, {"v", video, 20000}}), {4, 0});  // both from 0
        seed(MIN_MS_PER_PX, 0);  // 20 s is 40000 px
        QTRY_COMPARE_WITH_TIMEOUT(cache.pendingCount(), 0, 30000);
        frame();
        auto* wave = qobject_cast<WaveformItem*>(pictureItem("a", "waveform"));
        auto* strip = qobject_cast<FilmstripItem*>(pictureItem("v", "filmstrip"));
        QVERIFY(wave && strip);
        QTRY_VERIFY(wave->loaded() && strip->loaded());
        frame();
        const double viewport = vs->viewportWidthPx();
        QVERIFY2(wave->barCount() <= int(3 * viewport / 2) + 2, qPrintable(QString::number(wave->barCount())));
        QVERIFY2(strip->drawnCells() <= int(3 * viewport / 60) + 2, qPrintable(QString::number(strip->drawnCells())));
        QCOMPARE(strip->cellCount(), int(std::floor(40000.0 / 60)));
        // The cells cover the visible part, and the frame shows them.
        QVERIFY2(strip->drawnCells() >= int(viewport / 60), qPrintable(QString::number(strip->drawnCells())));
        QVERIFY(coversSpan(strip->cellRects(), 0, viewport));
        QVERIFY(pictureColours(strip, 0, viewport) > 64);
        // Far along the clip the bars and cells there exist; the start is not drawn.
        const int paints = wave->paintCount();
        const int stripPaints = strip->paintCount();
        vs->setScrollLeftPx(30000);
        frame();
        QVERIFY(wave->paintCount() > paints);
        QVERIFY(strip->paintCount() > stripPaints);
        QVERIFY2(strip->drawnCells() >= int(viewport / 60) && strip->drawnCells() <= int(3 * viewport / 60) + 2,
                 qPrintable(QString::number(strip->drawnCells())));
        QVERIFY(coversSpan(strip->cellRects(), 30000, 30000 + viewport));
        QVERIFY(strip->cellRects().first().toRectF().left() >= 30000 - 2 * viewport - 62);
        QVERIFY(pictureColours(strip, 30000, 30000 + viewport) > 64);
        const QVariantList bars = wave->barRects();
        QVERIFY(!bars.isEmpty());
        QVERIFY(bars.first().toRectF().left() >= 30000 - 2 * viewport - 2);
        QVERIFY(bars.last().toRectF().right() <= 30000 + 3 * viewport + 2);
        // A small scroll inside the drawn span regenerates nothing.
        const int paints2 = wave->paintCount();
        vs->setScrollLeftPx(30010);
        frame();
        QCOMPARE(wave->paintCount(), paints2);
    }

    // rv2 F1: the scene graph invalidated and made again. The textures the
    // filmstrip holds are those of the new graph: none of them reads as
    // unused, and a trim to a zero budget frees none the frame draws. The
    // software scene graph cannot be invalidated and made again, so the case
    // runs in a child process on the platform QRhi through
    // QQuickRenderControl (Metal on macOS): no window is created.
    void filmstripTexturesSurviveASceneGraphInvalidation() {
        if (!qEnvironmentVariableIsSet("NT_TRACKSUI_RHI")) {
            QProcess child;
            QProcessEnvironment env = QProcessEnvironment::systemEnvironment();
            env.remove(QStringLiteral("QT_QPA_PLATFORM"));
            env.remove(QStringLiteral("QT_QUICK_BACKEND"));
            env.insert(QStringLiteral("NT_TRACKSUI_RHI"), QStringLiteral("1"));
            child.setProcessEnvironment(env);
            child.setProcessChannelMode(QProcess::MergedChannels);
            child.start(QCoreApplication::applicationFilePath(),
                        {QStringLiteral("filmstripTexturesSurviveASceneGraphInvalidation")});
            QVERIFY(child.waitForFinished(120000));
            const QByteArray out = child.readAll();
            // A host with no platform QRhi (a CI runner with no display).
            if (out.contains("SKIP   : TestTracksUi::filmstripTexturesSurviveASceneGraphInvalidation()") ||
                (child.exitCode() != 0 && out.contains("platform plugin")))
                QSKIP(qPrintable(QStringLiteral("no platform QRhi for the render control:\n") + QString::fromUtf8(out)));
            QVERIFY2(child.exitStatus() == QProcess::NormalExit && child.exitCode() == 0, out.constData());
            QVERIFY2(out.contains("PASS   : TestTracksUi::filmstripTexturesSurviveASceneGraphInvalidation()"),
                     out.constData());
            return;
        }
        MediaPreviewCache& cache = MediaPreviewCache::instance();
        cache.clear();
        const QSize size(400, 60);
        QQuickRenderControl control;
        QQuickWindow window(&control);
        window.resize(size);
#ifdef Q_OS_LINUX
        nt::hw::prepareWindow(&window);  // a Vulkan scene graph needs an instance on the window
#endif
        auto* strip = new FilmstripItem(window.contentItem());
        strip->setSize(QSizeF(size));
        strip->setClipWidthPx(size.width());
        strip->setInPointMs(0);
        strip->setOutPointMs(4000);
        strip->setSource(QStringLiteral(NT_FIXTURES_DIR "/media/numbered-a-1080p30.mp4"));
        // The render target lives in the render control's QRhi: made after
        // each initialize, gone before each invalidate.
        struct Target {
            std::unique_ptr<QRhiTexture> texture;
            std::unique_ptr<QRhiRenderBuffer> depthStencil;
            std::unique_ptr<QRhiTextureRenderTarget> rt;
            std::unique_ptr<QRhiRenderPassDescriptor> rp;
            void reset() {
                rt.reset();
                rp.reset();
                depthStencil.reset();
                texture.reset();
            }
        } target;
        const auto start = [&]() -> bool {
            if (!control.initialize()) return false;
            QRhi* rhi = control.rhi();
            target.texture.reset(rhi->newTexture(QRhiTexture::RGBA8, size, 1, QRhiTexture::RenderTarget));
            target.depthStencil.reset(rhi->newRenderBuffer(QRhiRenderBuffer::DepthStencil, size));
            if (!target.texture->create() || !target.depthStencil->create()) return false;
            QRhiTextureRenderTargetDescription desc{QRhiColorAttachment(target.texture.get())};
            desc.setDepthStencilBuffer(target.depthStencil.get());
            target.rt.reset(rhi->newTextureRenderTarget(desc));
            target.rp.reset(target.rt->newCompatibleRenderPassDescriptor());
            target.rt->setRenderPassDescriptor(target.rp.get());
            if (!target.rt->create()) return false;
            window.setRenderTarget(QQuickRenderTarget::fromRhiRenderTarget(target.rt.get()));
            return true;
        };
        const auto render = [&]() {
            QCoreApplication::processEvents();
            control.polishItems();
            control.beginFrame();
            control.sync();
            control.render();
            control.endFrame();
        };
        if (!start()) QSKIP("no QRhi for the render control");
        QTRY_VERIFY_WITH_TIMEOUT(strip->loaded(), 30000);
        render();
        render();
        FilmstripTextureStats st = filmstripTextureStats(&window);
        QCOMPARE(st.textures, 1);
        QCOMPARE(st.unused, 0);

        QSignalSpy invalidated(&window, &QQuickWindow::sceneGraphInvalidated);
        window.setRenderTarget(QQuickRenderTarget());
        target.reset();
        control.invalidate();
        QCOMPARE(invalidated.count(), 1);
        QCOMPARE(filmstripTextureStats(&window).textures, 0);
        QVERIFY2(start(), "no QRhi for the render control after the invalidation");
        render();
        render();
        st = filmstripTextureStats(&window);
        QCOMPARE(st.textures, 1);
        QCOMPARE(st.unused, 0);
        // With no budget for unused textures the trim keeps the drawn one.
        setFilmstripTextureBudget(&window, 0);
        strip->setOutPointMs(3990);  // a repaint with the same texture
        render();
        render();
        st = filmstripTextureStats(&window);
        QCOMPARE(st.textures, 1);
        QCOMPARE(st.unused, 0);
        QCOMPARE(strip->drawnCells(), strip->cellCount());
        delete strip;
        render();
        window.setRenderTarget(QQuickRenderTarget());
        target.reset();
        control.invalidate();
    }

#ifdef Q_OS_UNIX
    void replacementDecodesWhileOldFileReadIsAbandoned() {
        auto& cache = MediaPreviewCache::instance();
        cache.clear();
        cache.setOpenTimeoutMs(0);
        QTemporaryDir dir;
        QVERIFY(dir.isValid());
        QVERIFY(QTest::qWaitFor([]() { return outstandingLocalIoForTesting() == 0; }, 3000));
        const QString path = dir.filePath("sound.wav");
        const QString replacement = dir.filePath("replacement.wav");
        QVERIFY(QFile::copy(QStringLiteral(NT_FIXTURES_DIR "/media/tone-440-48k-mono.wav"), path));
        QVERIFY(QFile::copy(QStringLiteral(NT_FIXTURES_DIR "/media/clicks-48k.wav"), replacement));
        // Stall only the read of the original, already opened inode.
        StalledLocalIo stall({path}, "read", true);
        const auto cleanup = qScopeGuard([&]() {
            stall.release();
            cache.setOpenTimeoutMs(-1);
            cache.clear();
            QVERIFY(QTest::qWaitFor([]() { return outstandingLocalIoForTesting() == 0; }, 3000));
        });
        auto subscriber = std::make_unique<QObject>();
        QVERIFY(!cache.peaks(path, subscriber.get()));
        QVERIFY(QTest::qWaitFor([&]() { return stall.entered() == 1; }, 2000));
        {
            std::jthread releaseOnTimeout([&stall](std::stop_token stop) {
                const auto deadline = std::chrono::steady_clock::now() + std::chrono::milliseconds(1500);
                while (!stop.stop_requested() && std::chrono::steady_clock::now() < deadline) {
                    std::this_thread::sleep_for(std::chrono::milliseconds(5));
                }
                if (!stop.stop_requested()) {
                    stall.release();
                }
            });
            subscriber.reset();
            cache.waitForIdle();
            releaseOnTimeout.request_stop();
        }
        QCoreApplication::processEvents();
        QCOMPARE(cache.pendingCount(), 0);
        QCOMPARE(outstandingLocalIoForTesting(), 1);
        // Rename over the path while the old helper still owns the old inode.
        QCOMPARE(std::rename(QFile::encodeName(replacement).constData(), QFile::encodeName(path).constData()), 0);
        QObject replacementSubscriber;
        QVERIFY(!cache.peaks(path, &replacementSubscriber));
        QVERIFY2(QTest::qWaitFor([&]() { return cache.peaks(path, &replacementSubscriber) != nullptr; }, 2000),
                 "replacement media was blocked by an abandoned read of the old file version");
        QCOMPARE(cache.peaks(path, &replacementSubscriber)->durationMs, 20000.0);
        cache.waitForIdle();
        QCOMPARE(outstandingLocalIoForTesting(), 1);
        QCOMPARE(stall.entered(), 1);
    }

    void m2bF5AbandonedHelpersBounded_data() {
        QTest::addColumn<QByteArray>("operation");
        QTest::newRow("open") << QByteArray("open");
        QTest::newRow("read") << QByteArray("read");
    }

    void m2bF5AbandonedHelpersBounded() {
        QFETCH(QByteArray, operation);
        constexpr int helperCap = 8;
        auto& cache = MediaPreviewCache::instance();
        cache.clear();
        cache.setOpenTimeoutMs(0);
        const auto restoreTimeout = qScopeGuard([&cache]() { cache.setOpenTimeoutMs(-1); });
        QVERIFY(QTest::qWaitFor([]() { return outstandingLocalIoForTesting() == 0; }, 3000));
        QTest::qWait(1);  // Initialize Qt's event dispatcher before counting descriptors.
#ifdef Q_OS_LINUX
        const auto descriptorCount = []() {
            return QDir(QStringLiteral("/proc/self/fd")).entryList(QDir::AllEntries | QDir::NoDotAndDotDot).size();
        };
        const auto baselineDescriptors = descriptorCount();
        QVERIFY(baselineDescriptors > 0);
#endif
        QTemporaryDir dir;
        QVERIFY(dir.isValid());
        const QString fixture = QStringLiteral(NT_FIXTURES_DIR "/media/tone-440-48k-mono.wav");
        QStringList paths;
        for (int i = 0; i < helperCap + 4; ++i) {
            paths.append(dir.filePath(QStringLiteral("stalled-%1.wav").arg(i)));
            QVERIFY(QFile::copy(fixture, paths.last()));
        }
        const QString normal = dir.filePath("normal.wav");
        QVERIFY(QFile::copy(fixture, normal));
        StalledLocalIo stall(paths, operation);
        const auto cleanup = qScopeGuard([&]() {
            stall.release();
            cache.clear();
            QVERIFY2(QTest::qWaitFor([]() { return outstandingLocalIoForTesting() == 0; }, 3000),
                     "helpers did not exit during cleanup");
        });
        const auto abandon = [&](std::unique_ptr<QObject>& subscriber) {
            std::jthread releaseOnTimeout([&stall](std::stop_token stop) {
                const auto deadline = std::chrono::steady_clock::now() + std::chrono::milliseconds(1500);
                while (!stop.stop_requested() && std::chrono::steady_clock::now() < deadline) {
                    std::this_thread::sleep_for(std::chrono::milliseconds(5));
                }
                if (!stop.stop_requested()) {
                    stall.release();
                }
            });
            subscriber.reset();
            QElapsedTimer timer;
            timer.start();
            cache.waitForIdle();
            const auto elapsed = timer.elapsed();
            releaseOnTimeout.request_stop();
            QCoreApplication::processEvents();
            return elapsed < 1500;
        };
        for (int round = 0; round < 6; ++round) {
            // Fast failures are cached for 30 s. Every round must start a job.
            cache.clear();
            auto subscriber = std::make_unique<QObject>();
            const int before = cache.decodeCount();
            const int entries = stall.entered();
            QVERIFY(!cache.peaks(paths.first(), subscriber.get()));
            QCOMPARE(cache.decodeCount(), before + 1);
            const bool reachedOrFailed = QTest::qWaitFor([&]() {
                return stall.entered() > entries || cache.pendingCount() == 0;
            }, 2000);
            if (!reachedOrFailed) {
                stall.release();
            }
            QVERIFY2(reachedOrFailed, "repeated request neither reached the hook nor failed fast");
            QVERIFY2(abandon(subscriber), "abandonment blocked the decode worker");
        }
        QCOMPARE(outstandingLocalIoForTesting(), 1);
        QCOMPARE(stall.entered(), 1);

        QObject normalSubscriber;
        QVERIFY(!cache.peaks(normal, &normalSubscriber));
        const bool normalCompleted = QTest::qWaitFor([&]() {
            return cache.peaks(normal, &normalSubscriber) != nullptr;
        }, 1500);
        if (!normalCompleted) {
            stall.release();
        }
        QVERIFY2(normalCompleted, "an abandoned helper blocked normal decoding");

        for (qsizetype i = 1; i < paths.size(); ++i) {
            auto subscriber = std::make_unique<QObject>();
            const int before = cache.decodeCount();
            const int entries = stall.entered();
            QVERIFY(!cache.peaks(paths[i], subscriber.get()));
            QCOMPARE(cache.decodeCount(), before + 1);
            const bool reachedOrFailed = QTest::qWaitFor([&]() {
                return stall.entered() > entries || cache.pendingCount() == 0;
            }, 2000);
            if (!reachedOrFailed) {
                stall.release();
            }
            QVERIFY2(reachedOrFailed, "distinct request neither reached the hook nor failed fast");
            QVERIFY2(abandon(subscriber), "saturated helpers blocked the decode worker");
            QCOMPARE(outstandingLocalIoForTesting(), std::min(helperCap, static_cast<int>(i) + 1));
        }
        QCOMPARE(stall.entered(), helperCap);
        // At capacity even an unstalled local file must fail without waiting.
        QVERIFY(!cache.peaks(fixture, &normalSubscriber));
        const bool saturatedCompleted = QTest::qWaitFor([&cache]() { return cache.pendingCount() == 0; }, 1500);
        stall.release();
        QVERIFY2(saturatedCompleted, "admission at capacity blocked a decode worker");
        QVERIFY(!cache.peaks(fixture, &normalSubscriber));
        QVERIFY(QTest::qWaitFor([]() { return outstandingLocalIoForTesting() == 0; }, 3000));
        cache.waitForIdle();
#ifdef Q_OS_LINUX
        QVERIFY2(QTest::qWaitFor([&]() { return descriptorCount() <= baselineDescriptors; }, 3000),
                 "abandoned helpers leaked file descriptors");
#endif
        cache.clear();
        QVERIFY(!cache.peaks(fixture, &normalSubscriber));
        QVERIFY2(QTest::qWaitFor([&]() { return cache.peaks(fixture, &normalSubscriber) != nullptr; }, 1500),
                 "the decode pool did not recover after helper reclamation");
    }

    void m2bF5RegularStallStops_data() {
        QTest::addColumn<QString>("kind");
        QTest::addColumn<QByteArray>("operation");
        QTest::addColumn<bool>("abandon");
        for (const auto& kind : {QStringLiteral("peaks"), QStringLiteral("video"), QStringLiteral("image")}) {
            for (const auto& operation : {QByteArray("open"), QByteArray("fstat"), QByteArray("read"), QByteArray("lseek")}) {
                if (kind != u"video" && operation == "lseek") continue;
                for (bool abandon : {true, false}) {
                    if (operation == "lseek" && !abandon) continue;
                    const QByteArray name = kind.toUtf8() + '-' + operation + (abandon ? "-abandoned" : "-timeout");
                    QTest::newRow(name.constData()) << kind << operation << abandon;
                }
            }
        }
    }

    void m2bF5RegularStallStops() {
        QFETCH(QString, kind);
        QFETCH(QByteArray, operation);
        QFETCH(bool, abandon);
        auto& cache = MediaPreviewCache::instance();
        cache.clear();
        cache.setOpenTimeoutMs(abandon ? 0 : 500);
        QTemporaryDir dir;
        QVERIFY(dir.isValid());
        const QString path = dir.filePath(kind == u"image" ? "stalled.png" : kind == u"peaks" ? "stalled.wav" : "stalled.mp4");
        if (kind == u"image") {
            QImage image(64, 32, QImage::Format_RGB32);
            image.fill(Qt::blue);
            QVERIFY(image.save(path));
        } else {
            // The small video can now decode without leaving AVIO's buffer.
            // Use a larger file to exercise cancellation of a real lseek.
            const QString fixture = kind == u"peaks" ? "tone-440-48k-mono.wav"
                                    : operation == "lseek" ? "numbered-a-1080p30.mp4" : "seek-360p30.mp4";
            QVERIFY(QFile::copy(QStringLiteral(NT_FIXTURES_DIR "/media/") + fixture, path));
        }
        StalledLocalIo stall({path}, operation);
        const auto cleanup = qScopeGuard([&]() {
            stall.release();
            cache.setOpenTimeoutMs(-1);
            cache.clear();
        });
        auto subscriber = std::make_unique<QObject>();
        if (kind == u"peaks") {
            QVERIFY(!cache.peaks(path, subscriber.get()));
        } else {
            QVERIFY(!cache.thumbnails(path, kind, subscriber.get()));
        }
        QVERIFY2(QTest::qWaitFor([&]() { return stall.entered() > 0; }, 2000), "regular-file syscall hook was not reached");
        if (abandon) {
            QElapsedTimer timer;
            timer.start();
            std::jthread releaseOnTimeout([&stall](std::stop_token stop) {
                const auto deadline = std::chrono::steady_clock::now() + std::chrono::milliseconds(1500);
                while (!stop.stop_requested() && std::chrono::steady_clock::now() < deadline) {
                    std::this_thread::sleep_for(std::chrono::milliseconds(5));
                }
                if (!stop.stop_requested()) stall.release();
            });
            subscriber.reset();
            cache.waitForIdle();
            const qint64 elapsed = timer.elapsed();
            releaseOnTimeout.request_stop();
            stall.release();
            QCoreApplication::processEvents();
            QVERIFY2(elapsed < 1500, qPrintable(QStringLiteral("M2b F5: abandoned regular %1 %2 took %3 ms")
                                                 .arg(kind, QString::fromLatin1(operation)).arg(elapsed)));
        } else {
            const bool finished = QTest::qWaitFor([&]() { return cache.pendingCount() == 0; }, 3000);
            stall.release();
            QVERIFY2(finished, "M2b F5: regular-file syscall exceeded the 3 s deadline bound");
        }
        QCOMPARE(cache.pendingCount(), 0);
    }

    void m2bF5RegularStallsDoNotExhaustPool_data() {
        QTest::addColumn<QByteArray>("operation");
        QTest::newRow("open") << QByteArray("open");
        QTest::newRow("read") << QByteArray("read");
    }

    void m2bF5RegularStallsDoNotExhaustPool() {
        QFETCH(QByteArray, operation);
        auto& cache = MediaPreviewCache::instance();
        cache.clear();
        cache.setOpenTimeoutMs(0);
        QTemporaryDir dir;
        QVERIFY(dir.isValid());
        const QString fixture = QStringLiteral(NT_FIXTURES_DIR "/media/tone-440-48k-mono.wav");
        const QString first = dir.filePath("first.wav"), second = dir.filePath("second.wav");
        QVERIFY(QFile::copy(fixture, first));
        QVERIFY(QFile::copy(fixture, second));
        StalledLocalIo stall({first, second}, operation);
        const auto cleanup = qScopeGuard([&]() {
            stall.release();
            cache.setOpenTimeoutMs(-1);
            cache.clear();
        });
        auto a = std::make_unique<QObject>();
        auto b = std::make_unique<QObject>();
        QVERIFY(!cache.peaks(first, a.get()));
        QVERIFY(!cache.peaks(second, b.get()));
        QVERIFY2(QTest::qWaitFor([&]() { return stall.entered() == 2; }, 2000), "two regular-file jobs did not stall");
        a.reset();
        b.reset();
        QObject third;
        QVERIFY(!cache.peaks(fixture, &third));
        const bool completed = QTest::qWaitFor([&]() { return cache.peaks(fixture, &third) != nullptr; }, 1500);
        stall.release();
        QVERIFY2(completed, "M2b F5: two abandoned regular-file jobs exhausted the decode pool");
    }

    void m2bF5RegularImageStillDecodes() {
        QTemporaryDir dir;
        // No extension: the device must still allow content-based probing.
        const QString path = dir.filePath("picture");
        QImage image(640, 320, QImage::Format_RGB32);
        image.fill(QColor(42, 84, 126));
        QVERIFY(image.save(path, "PNG"));
        const auto thumbs = loadImageThumbnail(path, 160, nullptr, 500);
        QCOMPARE(thumbs.size(), size_t(1));
        QCOMPARE(thumbs[0].image.size(), QSize(160, 80));
        QCOMPARE(thumbs[0].image.pixelColor(80, 40), image.pixelColor(320, 160));
    }

    void m2bF5NoWriterTimesOut_data() {
        QTest::addColumn<QString>("kind");
        QTest::newRow("peaks") << QStringLiteral("peaks");
        QTest::newRow("video") << QStringLiteral("video");
    }

    void m2bF5NoWriterTimesOut() {
        QFETCH(QString, kind);
        MediaPreviewCache& cache = MediaPreviewCache::instance();
        cache.clear();
        cache.setOpenTimeoutMs(500);
        const auto restoreTimeout = qScopeGuard([&cache]() { cache.setOpenTimeoutMs(-1); });
        QTemporaryDir dir;
        const QByteArray path = QFile::encodeName(dir.filePath(kind == u"peaks" ? "stalled.wav" : "stalled.mp4"));
        QCOMPARE(::mkfifo(path.constData(), 0600), 0);
        StalledFifo writer(path, false);
        QObject subscriber;
        if (kind == u"peaks") {
            QVERIFY(!cache.peaks(QFile::decodeName(path), &subscriber));
        } else {
            QVERIFY(!cache.thumbnails(QFile::decodeName(path), kind, &subscriber));
        }
        const bool finished = QTest::qWaitFor([&cache]() { return cache.pendingCount() == 0; }, 3000);
        writer.release();
        cache.waitForIdle();
        QCoreApplication::processEvents();
        QVERIFY2(finished, "M2b F5: no-writer FIFO exceeded the 3 s bound");
        QCOMPARE(cache.pendingCount(), 0);
    }

    void m2bF5SilentReadStops_data() {
        QTest::addColumn<QString>("kind");
        QTest::addColumn<bool>("abandon");
        for (const auto& kind : {QStringLiteral("peaks"), QStringLiteral("video"), QStringLiteral("image")}) {
            QTest::newRow(qPrintable(kind + "-abandoned")) << kind << true;
            QTest::newRow(qPrintable(kind + "-timeout")) << kind << false;
        }
    }

    void m2bF5SilentReadStops() {
        QFETCH(QString, kind);
        QFETCH(bool, abandon);
        MediaPreviewCache& cache = MediaPreviewCache::instance();
        cache.clear();
        cache.setOpenTimeoutMs(abandon ? 0 : 500);
        const auto restoreTimeout = qScopeGuard([&cache]() { cache.setOpenTimeoutMs(-1); });
        QTemporaryDir dir;
        const QString suffix = kind == u"image" ? ".png" : kind == u"peaks" ? ".wav" : ".mp4";
        const QByteArray path = QFile::encodeName(dir.filePath("silent" + suffix));
        QCOMPARE(::mkfifo(path.constData(), 0600), 0);
        // PNG signature, IHDR length/type and a partial width, then no bytes.
        const QByteArray partialPng = kind == u"image" ? QByteArray::fromHex("89504e470d0a1a0a0000000d494844520000") : QByteArray();
        StalledFifo writer(path, true, partialPng);
        auto subscriber = std::make_unique<QObject>();
        if (kind == u"peaks") {
            QVERIFY(!cache.peaks(QFile::decodeName(path), subscriber.get()));
        } else {
            QVERIFY(!cache.thumbnails(QFile::decodeName(path), kind, subscriber.get()));
        }
        QVERIFY(QTest::qWaitFor([&writer]() { return writer.connected.load() && writer.sent.load(); }, 2000));
        QTest::qWait(100);  // let the worker enter the stalled read
        if (abandon) {
            QElapsedTimer timer;
            timer.start();
            std::jthread releaseOnTimeout([&writer](std::stop_token stop) {
                const auto deadline = std::chrono::steady_clock::now() + std::chrono::milliseconds(1500);
                while (!stop.stop_requested() && std::chrono::steady_clock::now() < deadline) {
                    std::this_thread::sleep_for(std::chrono::milliseconds(5));
                }
                if (!stop.stop_requested()) writer.release();
            });
            subscriber.reset();
            cache.waitForIdle();
            const qint64 elapsed = timer.elapsed();
            releaseOnTimeout.request_stop();
            QVERIFY2(elapsed < 1500, qPrintable(QStringLiteral("M2b F5: abandoned %1 read took %2 ms").arg(kind).arg(elapsed)));
        } else {
            const bool finished = QTest::qWaitFor([&cache]() { return cache.pendingCount() == 0; }, 3000);
            writer.release();
            cache.waitForIdle();
            QCoreApplication::processEvents();
            QVERIFY2(finished, "M2b F5: silent FIFO exceeded the 3 s bound");
        }
        QCOMPARE(cache.pendingCount(), 0);
    }
#endif

#ifdef Q_OS_UNIX
    // m2b F5: an open that stalls (a pipe fed a few bytes at a time) stops
    // when nobody waits for it, and gives up after the open timeout when
    // somebody does.
    void stalledOpensStopAndTimeOut() {
        MediaPreviewCache& cache = MediaPreviewCache::instance();
        cache.clear();
        ::signal(SIGPIPE, SIG_IGN);
        QTemporaryDir dir;
        // A writer that opens the pipe once a reader does, then trickles
        // bytes until told to stop (at most 8 s).
        struct Trickle {
            std::atomic<bool> stop{false};
            std::atomic<bool> connected{false};
            std::thread thread;
            explicit Trickle(const QByteArray& path) {
                thread = std::thread([this, path]() {
                    QElapsedTimer t;
                    t.start();
                    int fd = -1;
                    while (fd < 0 && !stop && t.elapsed() < 8000) {
                        fd = ::open(path.constData(), O_WRONLY | O_NONBLOCK);
                        if (fd < 0) std::this_thread::sleep_for(std::chrono::milliseconds(5));
                    }
                    if (fd < 0) return;
                    connected = true;
                    const char bytes[16] = {0x12, 0x34, 0x56, 0x78, 0x1, 0x2, 0x3, 0x4, 0x5, 0x6, 0x7, 0x8, 0x9, 0xa, 0xb, 0xc};
                    while (!stop && t.elapsed() < 8000) {
                        if (::write(fd, bytes, sizeof bytes) < 0 && errno == EPIPE) break;
                        std::this_thread::sleep_for(std::chrono::milliseconds(20));
                    }
                    ::close(fd);
                });
            }
            ~Trickle() {
                stop = true;
                thread.join();
            }
        };
        const auto pipeAt = [&](const QString& name) {
            const QByteArray path = QFile::encodeName(dir.filePath(name));
            if (::mkfifo(path.constData(), 0600) != 0) qFatal("mkfifo failed");
            return path;
        };

        // Abandoned: the open stops at its next read.
        {
            const QByteArray path = pipeAt("abandoned.mp4");
            Trickle writer(path);
            auto subscriber = std::make_unique<QObject>();
            QVERIFY(!cache.thumbnails(QFile::decodeName(path), QStringLiteral("video"), subscriber.get()));
            QTRY_VERIFY_WITH_TIMEOUT(writer.connected.load(), 5000);
            QTest::qWait(200);  // inside the probe
            QElapsedTimer timer;
            timer.start();
            subscriber.reset();
            cache.waitForIdle();
            QVERIFY2(timer.elapsed() < 1500, qPrintable(QString::number(timer.elapsed())));
            QCOMPARE(cache.pendingCount(), 0);
        }
        // Waited for, but stalled: the open gives up after the timeout.
        {
            cache.setOpenTimeoutMs(500);
            const QByteArray path = pipeAt("stalled.wav");
            Trickle writer(path);
            QObject subscriber;
            QVERIFY(!cache.peaks(QFile::decodeName(path), &subscriber));
            QElapsedTimer timer;
            timer.start();
            QTRY_COMPARE_WITH_TIMEOUT(cache.pendingCount(), 0, 6000);
            QVERIFY2(timer.elapsed() < 3000, qPrintable(QString::number(timer.elapsed())));
            cache.setOpenTimeoutMs(-1);
        }
        cache.clear();
    }

#endif

    // m4 F7: an audio clip known only by its audioPath, whose probe fails or
    // is still pending, is capped at its out-point as an asset clip is.
    void audioPathOnlyClipsHaveTheFallbackCap() {
        QJsonObject json = makeTimelineJson({4, 0});
        QJsonArray clips;
        clips.append(QJsonObject{{"id", "sound"}, {"trackId", "track-3"}, {"name", "sound"}, {"startMs", 0},
                                 {"durationMs", 1000}, {"inPointMs", 0}, {"outPointMs", 1000},
                                 {"mediaType", "audio"}, {"audioPath", "/nonexistent/nodetool/sound.wav"},
                                 {"sourceType", "imported"}, {"status", "generated"}});
        json.insert("clips", clips);
        json.insert("durationMs", 20000);
        loadJson(json, {4, 0});
        seed(10, 0);
        auto* g = controller();
        g->setSnapEnabled(false);
        QCOMPARE(g->sourceCapMs("sound"), 1000.0);
        drag(clipPoint("sound", 96), clipPoint("sound", 96) + QPoint(200, 0), 10);
        QCOMPARE(clipJson("sound").value("durationMs").toDouble(), 1000.0);
        QCOMPARE(clipJson("sound").value("outPointMs").toDouble(), 1000.0);
    }

};

int main(int argc, char** argv) {
    if (qEnvironmentVariableIsSet("NT_TRACKSUI_RHI")) {
        // The child of a render-control case: the platform QRhi, never a
        // window, never the foreground (as main.cpp does for --screenshot).
        qputenv("QT_MAC_DISABLE_FOREGROUND_APPLICATION_TRANSFORM", "1");
        qputenv("QT_MAC_SET_RAISE_PROCESS", "0");
    } else {
        // No window may appear on screen: force the offscreen platform and the
        // software scene graph even when the test runs outside ctest.
        qputenv("QT_QPA_PLATFORM", "offscreen");
        qputenv("QT_QUICK_BACKEND", "software");
    }
    QGuiApplication app(argc, argv);
    MediaPreviewCache::instance().setThumbnailCacheDirectoryForTesting({});
    TestTracksUi test;
    return QTest::qExec(&test, argc, argv);
}

#include "tst_tracksui.moc"
