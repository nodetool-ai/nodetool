#include "ui/UiBench.h"

#include "bench/BenchReport.h"
#include "model/TimelineModel.h"
#include "playback/PlaybackClock.h"
#include "preview/PreviewCompositor.h"
#include "preview/SceneEval.h"
#include "ui/TimelineGestureArea.h"
#include "ui/TimelineViewState.h"
#include "preview/hw/HwWindow.h"

#include <QCoreApplication>
#include <QElapsedTimer>
#include <QEventLoop>
#include <QJsonArray>
#include <QJsonDocument>
#include <QJsonObject>
#include <QNativeGestureEvent>
#include <QQmlComponent>
#include <QQmlEngine>
#include <QQuickItem>
#include <QQuickRenderControl>
#include <QQuickRenderTarget>
#include <QQuickView>
#include <QQuickWindow>
#include <QWheelEvent>
#include <qpa/qwindowsysteminterface.h>
#include <rhi/qrhi.h>

#include <algorithm>
#include <atomic>
#include <chrono>
#include <cstdio>
#include <functional>
#include <memory>
#include <mutex>

namespace nt::ui {

namespace {

double nowMs() {
    using namespace std::chrono;
    return duration<double, std::milli>(steady_clock::now().time_since_epoch()).count();
}

const QPointingDevice* touchpad() {
    static const QPointingDevice* device = [] {
        auto* d = new QPointingDevice(QStringLiteral("ui-bench touchpad"), 4243, QInputDevice::DeviceType::TouchPad,
                                      QPointingDevice::PointerType::Finger, QInputDevice::Capability::Position, 2, 0);
        QWindowSystemInterface::registerInputDevice(d);
        return d;
    }();
    return device;
}

// The script: six phases of equal length, two events per frame (a trackpad
// sends about 120 per second, a frame is 1/60 s).
//   0 pinch in, 1 swipe right, 2 pinch out, 3 swipe down, 4 Ctrl-wheel in,
//   5 swipe left and up.
struct Script {
    QQuickWindow* window = nullptr;
    TimelineGestureArea* area = nullptr;
    int frames = 600;
    int events = 0;

    void wheel(QPointF scene, QPoint pixelDelta, Qt::KeyboardModifiers mods) {
        QWheelEvent ev(scene, scene, pixelDelta, QPoint(), Qt::NoButton, mods, Qt::NoScrollPhase, false);
        QCoreApplication::sendEvent(window, &ev);
        ++events;
    }
    void pinch(QPointF scene, double value) {
        QNativeGestureEvent ev(Qt::ZoomNativeGesture, touchpad(), 2, scene, scene, scene, value, {}, 0);
        QCoreApplication::sendEvent(window, &ev);
        ++events;
    }
    void step(int f) {
        const int phase = std::min(5, f * 6 / std::max(1, frames));
        const QPointF lanes = area->mapToScene(QPointF(area->lanesLeft() + 400, area->rowsTop() + 60));
        for (int e = 0; e < 2; ++e) {
            switch (phase) {
            case 0: pinch(lanes, 0.004); break;
            case 1: wheel(lanes, QPoint(-24, -2), {}); break;
            case 2: pinch(lanes, -0.004); break;
            case 3: wheel(lanes, QPoint(0, -18), {}); break;
            case 4: wheel(lanes, QPoint(0, 1), Qt::ControlModifier); break;
            default: wheel(lanes, QPoint(24, 12), {}); break;
            }
        }
    }
};

int countClipItems(QQuickItem* item) {
    int n = item->objectName().startsWith(QLatin1String("clip-")) ? 1 : 0;
    for (QQuickItem* child : item->childItems()) n += countClipItems(child);
    return n;
}

QJsonObject summaryJson(const std::vector<double>& samples) {
    if (samples.empty()) return {};
    const nt::bench::Summary s = nt::bench::summarize(samples);
    return {{QStringLiteral("p50"), s.p50}, {QStringLiteral("p95"), s.p95}, {QStringLiteral("max"), s.max},
            {QStringLiteral("count"), s.count}};
}

struct Samples {
    std::vector<double> inputMs, polishMs, syncMs, renderMs, guiMs, frameMs, frameIntervalMs;
    int clipItemsMax = 0;
    double msPerPxMin = 1e9;
    double msPerPxMax = 0;
    double scrollLeftMax = 0;
    double scrollTopMax = 0;
    int previewLayersMin = 1 << 30;
    int previewLayersMax = 0;
    // The preview's composited frames in the measured range (FrameStat).
    int compositedFrames = 0;
    int drawnFrames = 0;      // every media layer of the 4 tracks had a picture
    int advancedFrames = 0;   // the shown time moved since the previous frame
    double lastShownMs = -1;
    size_t statsRead = 0;
};

constexpr int kMediaLayers = 4;

// Reads the compositor's frame stats added since the last call. The stats
// move from the render thread in synchronize(), while the GUI thread waits.
void readFrameStats(Samples& s, const PreviewCompositor* compositor, bool measured) {
    const std::vector<FrameStat>& stats = compositor->frameStats();
    for (; s.statsRead < stats.size(); ++s.statsRead) {
        const FrameStat& st = stats[s.statsRead];
        if (!measured) continue;
        ++s.compositedFrames;
        // A decoded picture: every media layer drew, and the frame error is
        // known (a placeholder for media that failed to open has none).
        if (st.mediaLayers >= kMediaLayers && st.missingMediaLayers == 0 && st.frameError >= 0 && st.frameError <= 1)
            ++s.drawnFrames;
        if (st.timeMs != s.lastShownMs) ++s.advancedFrames;
        s.lastShownMs = st.timeMs;
    }
}

// True when the newest composited frame drew all 4 media layers.
bool mediaReady(const PreviewCompositor* compositor) {
    const std::vector<FrameStat>& stats = compositor->frameStats();
    return !stats.empty() && stats.back().mediaLayers >= kMediaLayers && stats.back().missingMediaLayers == 0 &&
           stats.back().frameError >= 0;
}

void observe(Samples& s, QQuickItem* root, TimelineViewState* view, const TimelineModel& model, double timeMs) {
    s.clipItemsMax = std::max(s.clipItemsMax, countClipItems(root));
    s.msPerPxMin = std::min(s.msPerPxMin, view->msPerPx());
    s.msPerPxMax = std::max(s.msPerPxMax, view->msPerPx());
    s.scrollLeftMax = std::max(s.scrollLeftMax, view->scrollLeftPx());
    s.scrollTopMax = std::max(s.scrollTopMax, view->scrollTopPx());
    const int layers = static_cast<int>(nt::activeLayersAt(model.timeline(), timeMs).size());
    s.previewLayersMin = std::min(s.previewLayersMin, layers);
    s.previewLayersMax = std::max(s.previewLayersMax, layers);
}

int report(const UiBenchOptions& options, const TimelineModel& model, const Samples& s, int events, int flushes,
           int windowUpdates) {
    QJsonObject out{
        {QStringLiteral("fixture"), options.fixture},
        {QStringLiteral("mode"), options.windowed ? QStringLiteral("window") : QStringLiteral("offscreen-throughput")},
        {QStringLiteral("measures"),
         options.windowed ? QStringLiteral("GUI-thread time and presentation interval in a vsync window")
                          : QStringLiteral("GUI-thread time per frame with no vsync and no window; it does not "
                                           "measure the presentation rate (see --ui-window)")},
        {QStringLiteral("frames"), options.frames},
        {QStringLiteral("size"), QJsonArray{options.size.width(), options.size.height()}},
        {QStringLiteral("tracks"), static_cast<int>(model.timeline().tracks.size())},
        {QStringLiteral("clips"), static_cast<int>(model.timeline().clips.size())},
        {QStringLiteral("events"), events},
        {QStringLiteral("viewFlushes"), flushes},
        {QStringLiteral("clipWindowUpdates"), windowUpdates},
        {QStringLiteral("guiMs"), summaryJson(s.guiMs)},
        {QStringLiteral("inputMs"), summaryJson(s.inputMs)},
        {QStringLiteral("clipItemsMax"), s.clipItemsMax},
        {QStringLiteral("msPerPx"), QJsonObject{{QStringLiteral("min"), s.msPerPxMin}, {QStringLiteral("max"), s.msPerPxMax}}},
        {QStringLiteral("scrollLeftMaxPx"), s.scrollLeftMax},
        {QStringLiteral("scrollTopMaxPx"), s.scrollTopMax},
        {QStringLiteral("previewLayers"),
         QJsonObject{{QStringLiteral("min"), s.previewLayersMin}, {QStringLiteral("max"), s.previewLayersMax}}},
    };
    if (!options.windowed) {
        out.insert(QStringLiteral("polishMs"), summaryJson(s.polishMs));
        out.insert(QStringLiteral("syncMs"), summaryJson(s.syncMs));
        out.insert(QStringLiteral("renderMs"), summaryJson(s.renderMs));
        out.insert(QStringLiteral("frameMs"), summaryJson(s.frameMs));
    } else {
        out.insert(QStringLiteral("frameIntervalMs"), summaryJson(s.frameIntervalMs));
    }
    // The 4 media tracks must decode and draw while the tracks move: a run
    // whose media did not play measures nothing.
    const double drawnFraction = s.compositedFrames ? double(s.drawnFrames) / s.compositedFrames : 0.0;
    const double advancedFraction = s.compositedFrames ? double(s.advancedFrames) / s.compositedFrames : 0.0;
    const bool mediaPlayed = drawnFraction >= 0.95 && advancedFraction >= 0.9;
    out.insert(QStringLiteral("preview"), QJsonObject{{QStringLiteral("compositedFrames"), s.compositedFrames},
                                                      {QStringLiteral("drawnMediaFraction"), drawnFraction},
                                                      {QStringLiteral("timeAdvancedFraction"), advancedFraction},
                                                      {QStringLiteral("pass"), mediaPlayed}});
    int exitCode = mediaPlayed ? 0 : 1;
    if (options.guiP95BudgetMs > 0) {
        const bool has = !s.guiMs.empty();
        const double p95 = has ? nt::bench::summarize(s.guiMs).p95 : 0.0;
        const bool pass = has && p95 < options.guiP95BudgetMs;
        out.insert(QStringLiteral("budget"), QJsonObject{{QStringLiteral("guiMs.p95"), options.guiP95BudgetMs},
                                                         {QStringLiteral("value"), has ? QJsonValue(p95) : QJsonValue()},
                                                         {QStringLiteral("pass"), pass}});
        if (!pass) exitCode = 1;
    }
    std::printf("%s\n", QJsonDocument(QJsonObject{{QStringLiteral("uiBench"), out}}).toJson(QJsonDocument::Compact).constData());
    std::fflush(stdout);
    return exitCode;
}

// The 4 media tracks run 15 s; loop inside them so the preview keeps playing.
void keepPlaying(PlaybackClock& clock) {
    if (clock.time() > 14000.0) clock.seek(0.0);
}

int runOffscreen(TimelineModel& model, PlaybackClock& clock, const UiBenchOptions& options) {
    QQuickRenderControl control;
    QQuickWindow window(&control);
    hw::prepareWindow(&window);
    window.resize(options.size);
    QQmlEngine engine;
    QQmlComponent component(&engine);
    component.loadFromModule("NodeTool.Timeline", "TimelineEditor");
    std::unique_ptr<QObject> rootObject(component.createWithInitialProperties(
        {{QStringLiteral("timeline"), QVariant::fromValue(&model)}, {QStringLiteral("clock"), QVariant::fromValue(&clock)}}));
    auto* root = qobject_cast<QQuickItem*>(rootObject.get());
    if (!root) {
        std::fprintf(stderr, "error: %s\n", qPrintable(component.errorString()));
        return 2;
    }
    root->setParentItem(window.contentItem());
    root->setSize(QSizeF(options.size));
    if (!control.initialize()) {
        std::fprintf(stderr, "error: QQuickRenderControl could not create a QRhi\n");
        return 2;
    }
    QRhi* rhi = control.rhi();
    std::unique_ptr<QRhiTexture> target(rhi->newTexture(QRhiTexture::RGBA8, options.size, 1, QRhiTexture::RenderTarget));
    target->create();
    std::unique_ptr<QRhiRenderBuffer> depthStencil(rhi->newRenderBuffer(QRhiRenderBuffer::DepthStencil, options.size));
    depthStencil->create();
    QRhiTextureRenderTargetDescription rtDesc{QRhiColorAttachment(target.get())};
    rtDesc.setDepthStencilBuffer(depthStencil.get());
    std::unique_ptr<QRhiTextureRenderTarget> rt(rhi->newTextureRenderTarget(rtDesc));
    std::unique_ptr<QRhiRenderPassDescriptor> rp(rt->newCompatibleRenderPassDescriptor());
    rt->setRenderPassDescriptor(rp.get());
    rt->create();
    window.setRenderTarget(QQuickRenderTarget::fromRhiRenderTarget(rt.get()));

    auto* compositor = root->findChild<PreviewCompositor*>(QStringLiteral("previewCompositor"));
    auto* area = root->findChild<TimelineGestureArea*>(QStringLiteral("timelineGestureArea"));
    auto* view = root->findChild<TimelineViewState*>(QStringLiteral("timelineViewState"));
    if (!compositor || !area || !view) {
        std::fprintf(stderr, "error: the editor has no compositor, gesture area or view state\n");
        return 2;
    }
    Script script{&window, area, options.frames, 0};
    Samples s;
    compositor->setCollectFrameStats(true);
    clock.seek(0.0);
    clock.play();
    int flushesAtStart = 0;
    int windowUpdatesAtStart = 0;
    QElapsedTimer warmupTimer;
    warmupTimer.start();
    for (int f = -options.warmup; f < options.frames; ++f) {
        if (f == 0) {
            // Measure only once the 4 media layers draw (decoders open, first
            // frames decoded); give up after 10 s.
            if (!mediaReady(compositor)) {
                if (warmupTimer.elapsed() > 10000) {
                    std::fprintf(stderr, "error: the preview did not draw %d media layers within 10 s\n", kMediaLayers);
                    clock.pause();
                    return 1;
                }
                f = -1;
            } else {
                flushesAtStart = view->flushCount();
                windowUpdatesAtStart = view->clipWindowUpdates();
                script.events = 0;
            }
        }
        // The clock tick is part of the frame: the playhead, timecode and
        // scrubber bindings run in it.
        const double t0 = nowMs();
        keepPlaying(clock);
        clock.tick();
        if (f >= 0) script.step(f);
        QCoreApplication::processEvents();
        const double t1 = nowMs();
        compositor->update();
        control.polishItems();
        const double t2 = nowMs();
        control.beginFrame();
        control.sync();
        const double t3 = nowMs();
        control.render();
        control.endFrame();
        const double t4 = nowMs();
        readFrameStats(s, compositor, f >= 0);
        if (f < 0) continue;
        s.inputMs.push_back(t1 - t0);
        s.polishMs.push_back(t2 - t1);
        s.syncMs.push_back(t3 - t2);
        s.renderMs.push_back(t4 - t3);
        s.guiMs.push_back(t3 - t0);
        s.frameMs.push_back(t4 - t0);
        observe(s, root, view, model, clock.time());
    }
    clock.pause();
    return report(options, model, s, script.events, view->flushCount() - flushesAtStart,
                  view->clipWindowUpdates() - windowUpdatesAtStart);
}

int runWindowed(TimelineModel& model, PlaybackClock& clock, const UiBenchOptions& options) {
    QQuickView window;
    hw::prepareWindow(&window);
    window.setResizeMode(QQuickView::SizeRootObjectToView);
    window.setFlags(window.flags() | Qt::WindowDoesNotAcceptFocus);
    window.setInitialProperties({{QStringLiteral("timeline"), QVariant::fromValue(&model)},
                                 {QStringLiteral("clock"), QVariant::fromValue(&clock)}});
    window.loadFromModule("NodeTool.Timeline", "TimelineEditor");
    if (window.status() != QQuickView::Ready) return 2;
    window.resize(options.size);
    QQuickItem* root = window.rootObject();
    auto* area = root->findChild<TimelineGestureArea*>(QStringLiteral("timelineGestureArea"));
    auto* view = root->findChild<TimelineViewState*>(QStringLiteral("timelineViewState"));
    auto* compositor = root->findChild<PreviewCompositor*>(QStringLiteral("previewCompositor"));
    if (!area || !view || !compositor) return 2;
    compositor->setCollectFrameStats(true);
    QElapsedTimer warmupTimer;
    warmupTimer.start();

    Script script{&window, area, options.frames, 0};
    Samples s;
    std::mutex mutex;
    std::atomic<double> frameStart{0.0};
    std::atomic<double> inputMs{0.0};
    std::atomic<bool> measuring{false};
    double lastSwap = 0.0;
    int frame = -options.warmup;
    int flushesAtStart = 0;
    int windowUpdatesAtStart = 0;
    QEventLoop loop;

    // GUI thread, before polish: the frame's input, then polish follows.
    QObject::connect(&window, &QQuickWindow::afterAnimating, &window, [&]() {
        readFrameStats(s, compositor, measuring);
        if (frame == 0) {
            if (!mediaReady(compositor)) {
                if (warmupTimer.elapsed() > 10000) {
                    std::fprintf(stderr, "error: the preview did not draw %d media layers within 10 s\n", kMediaLayers);
                    loop.exit(1);
                    return;
                }
                window.update();
                return;
            }
            flushesAtStart = view->flushCount();
            windowUpdatesAtStart = view->clipWindowUpdates();
            script.events = 0;
            measuring = true;
        }
        if (frame >= options.frames) {
            measuring = false;
            loop.quit();
            return;
        }
        if (frame > 0) {
            // The previous frame's state, read before this frame's clock starts.
            std::lock_guard lock(mutex);
            observe(s, root, view, model, clock.time());
        }
        // The FrameAnimation already ticked the clock before this signal; the
        // tick here, inside the measured span, runs the playhead bindings
        // again so they are counted.
        const double t0 = nowMs();
        frameStart = t0;
        keepPlaying(clock);
        clock.tick();
        if (frame >= 0) script.step(frame);
        inputMs = nowMs() - t0;
        ++frame;
        window.update();
    }, Qt::DirectConnection);
    // Render thread, the GUI thread still blocked: the end of its frame work.
    QObject::connect(&window, &QQuickWindow::afterSynchronizing, &window, [&]() {
        if (!measuring) return;
        const double end = nowMs();
        std::lock_guard lock(mutex);
        s.guiMs.push_back(end - frameStart);
        s.inputMs.push_back(inputMs);
    }, Qt::DirectConnection);
    QObject::connect(&window, &QQuickWindow::frameSwapped, &window, [&]() {
        const double now = nowMs();
        std::lock_guard lock(mutex);
        if (measuring && lastSwap > 0) s.frameIntervalMs.push_back(now - lastSwap);
        lastSwap = now;
    }, Qt::DirectConnection);

    clock.seek(0.0);
    clock.play();
    window.show();  // never raise() or requestActivate()
    if (loop.exec() != 0) {
        clock.pause();
        return 1;
    }
    clock.pause();
    std::lock_guard lock(mutex);
    return report(options, model, s, script.events, view->flushCount() - flushesAtStart,
                  view->clipWindowUpdates() - windowUpdatesAtStart);
}

}  // namespace

int runUiBench(TimelineModel& model, PlaybackClock& clock, const UiBenchOptions& options) {
    return options.windowed ? runWindowed(model, clock, options) : runOffscreen(model, clock, options);
}

}  // namespace nt::ui
