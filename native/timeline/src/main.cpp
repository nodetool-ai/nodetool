// nodetool-timeline: native prototype of the NodeTool timeline editor.
//
//   nodetool-timeline <fixture.json> [--size WxH] [--seek MS] [--play]
//                     [--bench [--frames N] [--warmup N] [--budget FILE|SPEC] [--no-vsync]]
//                     [--screenshot PATH]
//   nodetool-timeline <fixture.json> --dump-plan --times a,b,c
//   nodetool-timeline --server URL --timeline ID [...any mode above]   (src/server/ServerSource.h)
//
// --bench renders --warmup frames at t=0, then steps the playhead one
// sequence frame per rendered frame for --frames frames, with vsync on unless
// --no-vsync. It prints one JSON line (bench/BenchReport.h) and exits 1 when a
// --budget entry fails or has no samples.
// --screenshot grabs the window after a few frames, saves it, and exits.
// --dump-plan prints the FramePlan JSON at the given times (ms), no window.

#include "app/CliModes.h"
#include "motion/capturedeadline/CaptureDeadline.h"
#include "model/TimelineJson.h"
#include "model/TimelineModel.h"
#include "edit/ClipGestureController.h"
#include "motion/mattes/MatteResolver.h"
#include "playback/PlaybackClock.h"
#include "preview/PreviewCompositor.h"
#include "app/startup/DecodeDefault.h"
#include "app/startup/LocalDocumentSaver.h"
#include "preview/FfmpegSource.h"
#include "preview/SceneEval.h"
#include "preview/hw/HwInterop.h"
#include "preview/hw/HwWindow.h"
#include "platform/CpuUsage.h"
#include "platform/ProcessActivity.h"
#include "platform/SchedulingDiagnostics.h"
#include "bench/BenchReport.h"
#include "bench/ScrubRun.h"
#include "ui/MediaPreviews.h"
#include "ui/UiBench.h"
#include "audio/AppAudio.h"
#include "audio/AudioCli.h"
#include "audio/AudioMode.h"
#include "server/FieldAudit.h"
#include "server/SaveCli.h"
#include "server/ServerSource.h"

#include "aiassist/AgentBridge.h"
#include "aiassist/AssistantSession.h"
#include "chat/TimelineChatHost.h"
#include "runtime/ChatSession.h"
#include <QtQml/QQmlExtensionPlugin>
Q_IMPORT_QML_PLUGIN(NodeTool_ChatPlugin)

extern "C" {
#include <libavcodec/avcodec.h>
#include <libavformat/avformat.h>
#include <libavutil/avutil.h>
#include <libswscale/swscale.h>
}

#include <QCommandLineParser>
#include <QCoreApplication>
#include <QElapsedTimer>
#include <QEvent>
#include <QTimer>
#include <QFile>
#include <QDir>
#include <QFileInfo>
#include <QScreen>
#include <QGuiApplication>
#include <QImage>
#include <QJsonArray>
#include <QJsonDocument>
#include <QJsonObject>
#include <QJsonValue>
#include <QQmlComponent>
#include <QQmlContext>
#include <QQmlEngine>
#include <QQuickItem>
#include <QQuickStyle>
#include <QQuickRenderControl>
#include <QQuickRenderTarget>
#include <QQuickView>
#include <QQuickWindow>
#include <rhi/qrhi.h>
#include <QSurfaceFormat>

#include <algorithm>
#include <chrono>
#include <limits>
#include <memory>
#include <mutex>
#include <optional>
#include <set>
#include <cmath>
#include <cstdio>
#include <cstring>

namespace {

QQuickItem* namedVisualItem(QQuickItem* root, const QString& name) {
    if (!root) return nullptr;
    QList<QQuickItem*> pending{root};
    while (!pending.isEmpty()) {
        auto* item = pending.takeLast();
        if (item->objectName() == name) return item;
        pending.append(item->childItems());
    }
    return nullptr;
}

QString avVersion(unsigned v) {
    return QStringLiteral("%1.%2.%3").arg(AV_VERSION_MAJOR(v)).arg(AV_VERSION_MINOR(v)).arg(AV_VERSION_MICRO(v));
}

// Logs the window's expose events (exposed or not) with a steady-clock time.
// Qt stops rendering a window that is not exposed, which macOS reports when
// another window or a Space switch covers it. The bench counts those losses.
class ExposeLogger : public QObject {
public:
    explicit ExposeLogger(QQuickWindow* window) : QObject(window), m_window(window) {}
    int losses() const { return m_losses; }

protected:
    bool eventFilter(QObject* watched, QEvent* event) override {
        if (event->type() == QEvent::Expose) {
            const double ms =
                std::chrono::duration<double, std::milli>(std::chrono::steady_clock::now().time_since_epoch()).count();
            const bool exposed = m_window->isExposed();
            if (!exposed) ++m_losses;
            std::fprintf(stderr, "diag: %.1f ms expose %s\n", ms, exposed ? "exposed" : "not exposed");
        }
        return QObject::eventFilter(watched, event);
    }

private:
    QQuickWindow* m_window;
    int m_losses = 0;
};

// One line of the loader report: the clip, and which decoder draws it or why
// nothing does.
QString mediaLogLine(const MediaReportEntry& r) {
    if (!r.ok) return QStringLiteral("media %1: not used: %2 (placeholder)").arg(r.clipId, r.reason);
    QString line = QStringLiteral("media %1: ok (%2)").arg(r.clipId, r.decoder);
    if (!r.fallback.isEmpty()) {
        line += QStringLiteral(", %1 fallback: %2").arg(QString::fromUtf8(nt::hw::apiName()), r.fallback);
    }
    return line;
}

// Samples the bench collects while the event loop runs. Shared with the
// callbacks by shared_ptr, so it outlives the block that creates it.
struct BenchRun {
    enum class Phase { Warmup, Measure, Close, Done };
    Phase phase = Phase::Warmup;
    int warmup = 30;
    int frames = 600;           // step mode: measured frames
    double seconds = 0.0;       // realtime mode: measured playback time (0: step mode)
    double frameMs = 1000.0 / 30.0;
    long long measuredFrame = 0;
    size_t first = 0;           // index of the first measured frame stat
    size_t last = 0;            // one past the last measured frame stat
    QElapsedTimer closeTimer;
    std::optional<double> closeMs;
    std::optional<double> frameRefCloseMs;
    int exposureLossesAtStart = 0;
    QElapsedTimer warmupTimer;
    bool warmupReady = false;
    // CPU snapshots at the start and end of the measured window.
    unsigned mainThread = 0;
    unsigned renderThread = 0;
    QElapsedTimer cpuWall;
    int64_t processStart = 0, mainStart = 0, renderStart = 0;
    double cpuWallMs = 0.0;
    int64_t processUsed = -1, mainUsed = -1, renderUsed = -1;
    std::shared_ptr<bool> completed;
    std::mutex submitMutex;
    std::vector<qint64> submitNs;  // frameSwapped times, steady clock
};

qint64 steadyNowNs() {
    return std::chrono::duration_cast<std::chrono::nanoseconds>(std::chrono::steady_clock::now().time_since_epoch())
        .count();
}

nt::bench::BenchData benchData(const std::vector<FrameStat>& stats, BenchRun& run) {
    nt::bench::BenchData d;
    const size_t first = run.first;
    const size_t last = std::min(run.last, stats.size());  // exclusive
    d.frames = static_cast<int>(last - first);
    d.warmup.frames = static_cast<int>(first);
    for (size_t i = 0; i < first; ++i) {
        const FrameStat& f = stats[i];
        if (f.intervalMs > d.warmup.maxRenderIntervalMs) {
            d.warmup.maxRenderIntervalMs = f.intervalMs;
            d.warmup.maxRenderIntervalAt = static_cast<int>(i);
        }
        if (f.renderCpuMs > d.warmup.maxCpuMs) {
            d.warmup.maxCpuMs = f.renderCpuMs;
            d.warmup.maxCpuAt = static_cast<int>(i);
        }
    }
    for (size_t i = first; i < last; ++i) {
        const FrameStat& f = stats[i];
        d.cpuMs.push_back(f.renderCpuMs);
        // An interval starts at the previous render. The first measured one
        // starts in the warm-up, so it is left out.
        if (i > first) d.renderIntervalMs.push_back(f.intervalMs);
        // A GPU time read at frame i belongs to a frame up to framesInFlight
        // earlier, so the first measured frames still report warm-up work.
        if (i >= first + static_cast<size_t>(std::max(1, f.framesInFlight)) && f.windowGpuObservationMs >= 0.0) {
            d.gpuObservationsMs.push_back(f.windowGpuObservationMs);
        }
        if (f.frameError >= 0) d.frameError.push_back(f.frameError);
        d.cpuCopies += f.cpuCopies;
        d.hardwareLayerFrames += f.hardwareLayers;
        if (f.mediaLayers > 0) {
            ++d.mediaFrames;
            if (f.missingMediaLayers > 0) ++d.missingMediaFrames;
            if (f.missingMediaLayers == 0 && f.frameError == 0) ++d.correctMediaFrames;
        }
        if (f.held) ++d.heldFrames;
        d.cutMisses += f.cutMisses;
        d.missingLayerFrames += f.missingLayers;
        d.layersMax = std::max(d.layersMax, f.layers);
        if (i > first && f.intervalMs > 50.0) {
            d.stalls.push_back({static_cast<int>(i - first), static_cast<double>(f.startNs - stats[first].startNs) / 1.0e6,
                                f.intervalMs, f.renderCpuMs});
        }
        d.openDecodersMax = std::max(d.openDecodersMax, f.openDecoders);
    }
    d.decoderCloseMs = run.closeMs;
    d.frameRefCloseMs = run.frameRefCloseMs;
    if (run.cpuWallMs > 0.0) {
        const auto pct = [&](int64_t ns) -> std::optional<double> {
            if (ns < 0) return std::nullopt;  // a failed query: unavailable, not 0
            return static_cast<double>(ns) / 1.0e6 / run.cpuWallMs * 100.0;
        };
        d.cpuWallMs = run.cpuWallMs;
        d.processCpuPercent = pct(run.processUsed);
        d.mainCpuPercent = pct(run.mainUsed);
        d.renderCpuPercent = pct(run.renderUsed);
        d.guiAndRenderShareThread = run.mainThread != 0 && run.mainThread == run.renderThread;
    }
    // Submissions inside the measured window, from the first measured render
    // start to the start of the first frame after the window, so both
    // endpoints of every interval are measured frames.
    if (first < stats.size()) {
        const qint64 from = stats[first].startNs;
        const qint64 to = last < stats.size() ? stats[last].startNs : std::numeric_limits<qint64>::max();
        std::lock_guard lock(run.submitMutex);
        qint64 prev = -1;
        for (qint64 t : run.submitNs) {
            if (t < from || t >= to) continue;
            if (prev >= 0) d.submitIntervalMs.push_back(static_cast<double>(t - prev) / 1.0e6);
            prev = t;
        }
    }
    return d;
}

// FramePlan JSON (DESIGN.md D6). Layers are bottom to top.
QJsonObject framePlanJson(const nt::Timeline& tl, const QString& fixture, const std::vector<double>& times) {
    QJsonArray frames;
    for (double t : times) {
        // Layers, precomposites and dropped layers (preview/SceneEval.h).
        frames.append(nt::framePlanJson(nt::buildFramePlan(tl, t)));
    }
    // The clips the plan does not cover (a plan-level unsupported field, own
    // or inherited): plan-conformance.mjs leaves them out on both sides.
    const QJsonObject audit = nt::server::auditTimelineFields(tl.raw);
    QJsonObject why;  // clip id -> its plan-level fields
    for (const QJsonValue& c : audit.value(u"clips").toArray()) {
        QJsonArray fields;
        for (const QJsonValue& f : c.toObject().value(u"fields").toArray()) {
            if (f.toObject().value(u"effect").toString() == u"plan") fields.append(f.toObject().value(u"field"));
        }
        if (!fields.isEmpty()) why.insert(c.toObject().value(u"id").toString(), fields);
    }
    return QJsonObject{{QStringLiteral("fixture"), fixture},
                       {QStringLiteral("width"), tl.width},
                       {QStringLiteral("height"), tl.height},
                       {QStringLiteral("planUnsupported"), audit.value(u"planUnsupported")},
                       {QStringLiteral("planUnsupportedFields"), why},
                       {QStringLiteral("frames"), frames}};
}

// --dump-plan needs no window: it runs under QCoreApplication.
// --probe-media opens every media clip's file (no decode) and prints the
// loader report: per clip, the D10a facts and why a clip is not usable.
int probeMediaReport(int argc, char** argv) {
    QCoreApplication app(argc, argv);
    QCommandLineParser parser;
    parser.addPositionalArgument(QStringLiteral("fixture"), QStringLiteral("Timeline JSON file"));
    parser.addOption(QCommandLineOption(QStringLiteral("probe-media"), QStringLiteral("Print the media report")));
    parser.process(app);
    if (parser.positionalArguments().size() != 1) {
        std::fprintf(stderr, "usage: nodetool-timeline <fixture.json> --probe-media\n");
        return 2;
    }
    const QString fixture = parser.positionalArguments().first();
    const auto loaded = nt::server::loadTimelineSource(fixture);
    if (!loaded.timeline) {
        std::fprintf(stderr, "error: %s\n", qPrintable(loaded.error));
        return 1;
    }
    QJsonArray clips;
    for (const nt::Clip& clip : loaded.timeline->clips) {
        if (clip.mediaPath.empty()) continue;
        const nt::MediaFacts f = nt::probeMedia(clip.mediaPath);
        clips.append(QJsonObject{
            {QStringLiteral("clipId"), QString::fromStdString(clip.id)},
            {QStringLiteral("mediaPath"), QString::fromStdString(clip.mediaPath)},
            {QStringLiteral("ok"), f.usable()},
            {QStringLiteral("reason"), QString::fromStdString(!f.opened ? f.error : f.rejection)},
            {QStringLiteral("width"), f.width},
            {QStringLiteral("height"), f.height},
            {QStringLiteral("frameRate"), f.frameRate},
            {QStringLiteral("codec"), QString::fromStdString(f.codec)},
            {QStringLiteral("pixelFormat"), QString::fromStdString(f.pixelFormat)},
            {QStringLiteral("rotationDeg"), f.rotationDeg},
            {QStringLiteral("sampleAspect"), QStringLiteral("%1:%2").arg(f.sarNum).arg(f.sarDen)},
            {QStringLiteral("transfer"), QString::fromStdString(f.transfer)},
        });
    }
    std::printf("%s\n", QJsonDocument(QJsonObject{{QStringLiteral("fixture"), fixture}, {QStringLiteral("clips"), clips}})
                            .toJson(QJsonDocument::Compact)
                            .constData());
    return 0;
}

int dumpPlan(int argc, char** argv) {
    QCoreApplication app(argc, argv);
    QCommandLineParser parser;
    parser.addPositionalArgument(QStringLiteral("fixture"), QStringLiteral("Timeline JSON file"));
    const QCommandLineOption dumpOpt(QStringLiteral("dump-plan"), QStringLiteral("Print FramePlan JSON and exit"));
    const QCommandLineOption timesOpt(QStringLiteral("times"), QStringLiteral("Comma-separated times in ms"),
                                      QStringLiteral("a,b,c"));
    parser.addOptions({dumpOpt, timesOpt});
    parser.process(app);
    if (parser.positionalArguments().size() != 1 || !parser.isSet(timesOpt)) {
        std::fprintf(stderr, "usage: nodetool-timeline <fixture.json> --dump-plan --times a,b,c\n");
        return 2;
    }
    std::vector<double> times;
    for (const QString& part : parser.value(timesOpt).split(QLatin1Char(','), Qt::SkipEmptyParts)) {
        bool ok = false;
        const double t = part.trimmed().toDouble(&ok);
        if (!ok) {
            std::fprintf(stderr, "error: bad time '%s'\n", qPrintable(part));
            return 2;
        }
        times.push_back(t);
    }
    const QString fixture = parser.positionalArguments().first();
    const auto loaded = nt::server::loadTimelineSource(fixture);
    if (!loaded.timeline) {
        std::fprintf(stderr, "error: %s\n", qPrintable(loaded.error));
        return 1;
    }
    std::printf("%s\n", QJsonDocument(framePlanJson(*loaded.timeline, fixture, times))
                            .toJson(QJsonDocument::Compact)
                            .constData());
    return 0;
}

}  // namespace

// Renders the editor with no window: a QQuickRenderControl on a QRhi
// (Metal on macOS) into an offscreen texture, driven frame by frame from a
// timer. --stills reads the compositor canvas back at each frame once every
// layer shows its exact frame. --screenshot reads the whole editor back.
int runOffscreen(TimelineModel& model, PlaybackClock& clock, QSize size, const QString& shotPath,
                 const QString& stillsDir, const QString& playDir, const std::vector<long long>& frames,
                 const QString& scrubScript = {}, const QString& scrubOut = {}, const QString& fixture = {},
                 const QString& decodeName = {}) {
    QQuickRenderControl control;
    QQuickWindow window(&control);
    nt::hw::prepareWindow(&window);
    window.resize(size);
    window.setColor(QColor(18, 18, 20));
    // A screenshot shows the whole editor (QML). Stills, play captures and
    // scrubs read only the compositor canvas, so they create the compositor
    // item directly: they then depend on no QML file, and on nothing in the
    // tracks UI that another milestone may be changing.
    QQmlEngine engine;
    QQmlComponent component(&engine);
    std::unique_ptr<QObject> rootObject;
    PreviewCompositor* compositor = nullptr;
    if (!shotPath.isEmpty()) {
        component.loadFromModule("NodeTool.Timeline", "TimelineEditor");
        rootObject.reset(component.createWithInitialProperties(
            {{QStringLiteral("timeline"), QVariant::fromValue(&model)}, {QStringLiteral("clock"), QVariant::fromValue(&clock)}}));
        auto* root = qobject_cast<QQuickItem*>(rootObject.get());
        if (!root) {
            std::fprintf(stderr, "error: %s\n", qPrintable(component.errorString()));
            return 1;
        }
        root->setParentItem(window.contentItem());
        root->setSize(QSizeF(size));
        compositor = root->findChild<PreviewCompositor*>(QStringLiteral("previewCompositor"));
    } else {
        auto* item = new PreviewCompositor();
        rootObject.reset(item);
        item->setTimeline(&model);
        item->setClock(&clock);
        item->setParentItem(window.contentItem());
        item->setSize(QSizeF(size));
        compositor = item;
    }
    if (!control.initialize()) {
        std::fprintf(stderr, "error: QQuickRenderControl could not create a QRhi\n");
        return 1;
    }
    QRhi* rhi = control.rhi();
    std::unique_ptr<QRhiTexture> target(
        rhi->newTexture(QRhiTexture::RGBA8, size, 1, QRhiTexture::RenderTarget | QRhiTexture::UsedAsTransferSource));
    target->create();
    // Qt Quick's renderer depth-tests its opaque batches, so the target needs
    // a depth-stencil buffer (Metal validation fails a draw without one).
    std::unique_ptr<QRhiRenderBuffer> depthStencil(rhi->newRenderBuffer(QRhiRenderBuffer::DepthStencil, size));
    depthStencil->create();
    QRhiTextureRenderTargetDescription rtDesc{QRhiColorAttachment(target.get())};
    rtDesc.setDepthStencilBuffer(depthStencil.get());
    std::unique_ptr<QRhiTextureRenderTarget> rt(rhi->newTextureRenderTarget(rtDesc));
    std::unique_ptr<QRhiRenderPassDescriptor> rp(rt->newCompatibleRenderPassDescriptor());
    rt->setRenderPassDescriptor(rp.get());
    rt->create();
    window.setRenderTarget(QQuickRenderTarget::fromRhiRenderTarget(rt.get()));

    if (!compositor) {
        std::fprintf(stderr, "error: no PreviewCompositor in the scene\n");
        return 1;
    }

    // One frame of the scene. With `grab`, the whole target is read back; an
    // offscreen frame waits for the GPU, so the result is ready on return.
    QRhiReadbackResult readback;
    const auto renderFrame = [&](bool grab) {
        // No render loop runs here, so mark the compositor dirty every frame:
        // its synchronize() and render() then run, and captures flow back.
        compositor->update();
        QCoreApplication::processEvents();
        control.polishItems();
        control.beginFrame();
        control.sync();
        control.render();
        if (grab) {
            QRhiResourceUpdateBatch* rb = rhi->nextResourceUpdateBatch();
            rb->readBackTexture({target.get()}, &readback);
            control.commandBuffer()->resourceUpdate(rb);
        }
        control.endFrame();
    };

    std::set<QString> logged;
    const auto logReport = [&]() {
        for (const MediaReportEntry& r : compositor->mediaReport()) {
            if (!logged.insert(r.clipId + r.decoder + r.fallback + r.reason).second) continue;
            std::fprintf(stderr, "%s\n", qPrintable(mediaLogLine(r)));
        }
    };

    // A GPU resource the compositor could not create leaves the frame
    // incomplete: a capture run stops with the reason instead of saving it.
    const auto renderFailed = [&]() {
        if (compositor->renderError().isEmpty()) return false;
        std::fprintf(stderr, "error: incomplete frame: %s\n", qPrintable(compositor->renderError()));
        return true;
    };

    if (!shotPath.isEmpty()) {
        // Wait until every layer shows its exact frame, then grab the editor.
        compositor->requestCapture();
        QElapsedTimer timer;
        timer.start();
        while (!compositor->captureReady()) {
            renderFrame(false);
            QCoreApplication::processEvents();
            logReport();
            const auto decision = nt::capture::decide(false, renderFailed(), compositor->captureReady(), timer.elapsed());
            if (decision == nt::capture::Decision::Error) return 1;
            if (decision == nt::capture::Decision::Ready) break;
            if (decision == nt::capture::Decision::TimedOut) {
                std::fprintf(stderr, "error: no exact frame within 60 s\n");
                return 1;
            }
        }
        // The clip pictures decode off the GUI thread: wait for them too.
        while (nt::ui::MediaPreviewCache::instance().pendingCount() > 0 && timer.elapsed() < 30000) {
            renderFrame(false);
            QCoreApplication::processEvents(QEventLoop::AllEvents, 20);
        }
        renderFrame(true);
        QImage img(reinterpret_cast<const uchar*>(readback.data.constData()), readback.pixelSize.width(),
                   readback.pixelSize.height(), QImage::Format_RGBA8888_Premultiplied);
        // OpenGL (the Linux default) reads a texture back bottom row first.
        if (rhi->isYUpInFramebuffer()) img = img.flipped(Qt::Vertical);
        const bool saved = img.convertToFormat(QImage::Format_RGB888).save(shotPath);
        std::fprintf(stderr, "screenshot %s: %s\n", qPrintable(shotPath), saved ? "saved" : "FAILED");
        return saved ? 0 : 1;
    }

    const double fps = model.fps();
    if (!scrubScript.isEmpty()) {
        // The scripted scrub (M1d): seeks and scrubs measured offscreen.
        QFile file(scrubScript);
        if (!file.open(QIODevice::ReadOnly)) {
            std::fprintf(stderr, "error: cannot read %s\n", qPrintable(scrubScript));
            return 2;
        }
        const QJsonObject script = QJsonDocument::fromJson(file.readAll()).object();
        nt::bench::ScrubContext ctx;
        ctx.renderFrame = [&]() { renderFrame(false); logReport(); };
        ctx.compositor = compositor;
        ctx.clock = &clock;
        ctx.fps = fps;
        ctx.durationMs = model.durationMs();
        ctx.fixture = fixture;
        ctx.decode = decodeName;
        ctx.outDir = scrubOut;
        const QJsonObject report = nt::bench::runScrubScript(ctx, script);
        std::printf("%s\n", QJsonDocument(report).toJson(QJsonDocument::Compact).constData());
        std::fflush(stdout);
        return report.contains(u"error") ? 1 : 0;
    }
    if (!playDir.isEmpty()) {
        const nt::ProcessActivity activity("nodetool-timeline play captures");
        // Play captures: play the clock in real time from up to 3 s before
        // the first frame, read back every rendered frame as it is, and keep
        // the first one shown at each requested sequence frame. This is what
        // a viewer sees at a cut, not the settled picture.
        QDir().mkpath(playDir);
        std::set<long long> pending(frames.begin(), frames.end());
        const long long first = *pending.begin();
        const long long last = *pending.rbegin();
        const double startMs = static_cast<double>(std::max(0LL, first - 90)) * 1000.0 / fps;
        clock.setLoop(false);
        clock.seek(startMs);
        // Play start waits for every active source's first frame (D22), so
        // the first frame of playback is a picture.
        compositor->requestCapture();
        QElapsedTimer startWait;
        startWait.start();
        while (!compositor->captureReady() && startWait.elapsed() < 3000) {
            renderFrame(false);
            logReport();
        }
        compositor->takeCapture();
        clock.play();
        QJsonArray presented;
        QJsonArray missed;
        std::vector<std::pair<long long, QImage>> kept;
        QElapsedTimer guard;
        guard.start();
        const double budgetMs = (static_cast<double>(last + 1) * 1000.0 / fps - startMs) + 10000.0;
        while (!pending.empty() && guard.elapsed() < budgetMs) {
            clock.tick();
            compositor->requestCapture(true);
            renderFrame(false);
            logReport();
            if (renderFailed()) return 1;
            if (!compositor->captureReady()) continue;
            const double t = compositor->captureTimeMs();
            const QImage capture = compositor->takeCapture();
            const long long index = static_cast<long long>(std::floor(t * fps / 1000.0 + 1e-6));
            // Requested frames the playback passed without showing.
            while (!pending.empty() && *pending.begin() < index) {
                missed.append(*pending.begin());
                pending.erase(pending.begin());
            }
            if (pending.count(index) == 0) continue;
            // Kept in memory: writing a PNG here would stall playback past
            // the next frame.
            kept.emplace_back(index, capture);
            presented.append(QJsonObject{{QStringLiteral("frame"), index}, {QStringLiteral("timeMs"), t}});
            pending.erase(index);
        }
        for (const auto& [index, image] : kept) {
            const QString path = QStringLiteral("%1/frame_%2.png").arg(playDir).arg(index, 6, 10, QLatin1Char('0'));
            if (!image.convertToFormat(QImage::Format_RGB888).save(path)) {
                std::fprintf(stderr, "error: cannot write %s\n", qPrintable(path));
                return 1;
            }
        }
        for (long long f : pending) missed.append(f);
        clock.pause();
        const QJsonObject report{{QStringLiteral("presented"), presented}, {QStringLiteral("missed"), missed}};
        QFile out(playDir + QStringLiteral("/play-report.json"));
        if (out.open(QIODevice::WriteOnly)) out.write(QJsonDocument(report).toJson(QJsonDocument::Compact));
        std::fprintf(stderr, "play captures: %lld presented, %lld missed\n", static_cast<long long>(presented.size()),
                     static_cast<long long>(missed.size()));
        return missed.isEmpty() ? 0 : 1;
    }

    QDir().mkpath(stillsDir);
    for (const long long frame : frames) {
        clock.seek(static_cast<double>(frame) * 1000.0 / fps);
        compositor->requestCapture();
        QElapsedTimer timer;
        timer.start();
        while (!compositor->captureReady()) {
            renderFrame(false);
            QCoreApplication::processEvents();
            logReport();
            const auto decision = nt::capture::decide(false, renderFailed(), compositor->captureReady(), timer.elapsed());
            if (decision == nt::capture::Decision::Error) return 1;
            if (decision == nt::capture::Decision::Ready) break;
            if (decision == nt::capture::Decision::TimedOut) {
                std::fprintf(stderr, "error: frame %lld: no exact frame within 60 s\n", frame);
                return 1;
            }
        }
        const QImage img = compositor->takeCapture().convertToFormat(QImage::Format_RGB888);
        const QString path = QStringLiteral("%1/frame_%2.png").arg(stillsDir).arg(frame, 6, 10, QLatin1Char('0'));
        if (!img.save(path)) {
            std::fprintf(stderr, "error: cannot write %s\n", qPrintable(path));
            return 1;
        }
        std::fprintf(stderr, "still %s (%lld ms)\n", qPrintable(path), static_cast<long long>(timer.elapsed()));
    }
    return 0;
}

int main(int argc, char** argv) {
    nt::app::registerCliMode({"--save", nt::server::saveCli});
    nt::app::registerCliMode({"--dump-plan", dumpPlan});
    nt::app::registerCliMode({"--probe-media", probeMediaReport});
    nt::app::registerCliMode({"--render-audio", nt::audio::renderAudioCli});
    nt::app::registerCliMode({"--av-sync", nt::audio::avSyncCli});
    nt::app::registerCliMode({"--av-sync-live", nt::audio::avSyncLiveCli});
    nt::app::registerCliMode({"--audio-devices", nt::audio::audioDevicesCli});
    if (const auto rc = nt::app::dispatchCliMode(argc, argv, nt::app::CliStage::BeforeServerArgs)) {
        return *rc;
    }
    // --server URL --timeline ID replaces the fixture argument (src/server/ServerSource.h).
    if (const int rc = nt::server::takeServerArgs(argc, argv)) return rc;
    if (nt::server::listTimelinesRequested()) {
        QCoreApplication app(argc, argv);
        return nt::server::listTimelinesMain();
    }
    if (const auto rc = nt::app::dispatchCliMode(argc, argv)) {
        return *rc;
    }
    // Parse before QGuiApplication: --bench changes the surface format and
    // --dump-plan runs without a GUI.
    bool bench = false;
    bool noVsync = false;
    bool background = false;
    for (int i = 1; i < argc; ++i) {
        if (qstrcmp(argv[i], "--bench") == 0) bench = true;
        if (qstrcmp(argv[i], "--no-vsync") == 0) noVsync = true;
        // Both spellings: `--opt value` and `--opt=value`.
        const auto isOpt = [&](const char* name) {
            const std::size_t n = std::strlen(name);
            return std::strncmp(argv[i], name, n) == 0 && (argv[i][n] == '\0' || argv[i][n] == '=');
        };
        if (isOpt("--background") || isOpt("--teardown-test") || isOpt("--screenshot") || isOpt("--stills") ||
            isOpt("--play-stills") || isOpt("--scrub-script") || isOpt("--ui-bench")) {
            background = true;
        }
    }
    background = background || bench;
    if (background) {
        // A non-interactive run must not take the keyboard focus or come to
        // the front. Without the transform the process stays a background
        // process (no Dock icon, never active); with no raise, Qt does not
        // activate it at start. Both are read by the Cocoa platform plugin.
        qputenv("QT_MAC_DISABLE_FOREGROUND_APPLICATION_TRANSFORM", "1");
        qputenv("QT_MAC_SET_RAISE_PROCESS", "0");
    }
    if (bench) {
        // Vsync on measures pacing at the display rate (submitIntervalMs,
        // skippedSubmits). --no-vsync renders as fast as the loop allows.
        QSurfaceFormat fmt = QSurfaceFormat::defaultFormat();
        fmt.setSwapInterval(noVsync ? 0 : 1);
        QSurfaceFormat::setDefaultFormat(fmt);
        qputenv("QSG_RHI_PROFILE", "1");  // GPU timestamps for lastCompletedGpuTime
    }

    QQuickStyle::setStyle(QStringLiteral("Basic"));
    QGuiApplication app(argc, argv);
    app.setApplicationName(QStringLiteral("nodetool-timeline"));

    QCommandLineParser parser;
    parser.setApplicationDescription(QStringLiteral("NodeTool timeline editor, native prototype"));
    parser.addHelpOption();
    parser.addPositionalArgument(QStringLiteral("fixture"), QStringLiteral("Timeline JSON file"));
    const QCommandLineOption benchOpt(QStringLiteral("bench"), QStringLiteral("Render N frames and print timings"));
    const QCommandLineOption framesOpt(QStringLiteral("frames"), QStringLiteral("Bench frame count"),
                                       QStringLiteral("N"), QStringLiteral("600"));
    const QCommandLineOption sizeOpt(QStringLiteral("size"), QStringLiteral("Window size"), QStringLiteral("WxH"),
                                     QStringLiteral("1600x1000"));
    const QCommandLineOption seekOpt(QStringLiteral("seek"), QStringLiteral("Start time in ms"), QStringLiteral("MS"),
                                     QStringLiteral("0"));
    const QCommandLineOption playOpt(QStringLiteral("play"), QStringLiteral("Start playing"));
    const QCommandLineOption stillsOpt(QStringLiteral("stills"),
                                       QStringLiteral("Write the canvas at --frames as PNGs into DIR and exit"),
                                       QStringLiteral("DIR"));
    const QCommandLineOption stillFramesOpt(QStringLiteral("still-frames"),
                                            QStringLiteral("Sequence frame indices for --stills"),
                                            QStringLiteral("a,b,c"));
    const QCommandLineOption playStillsOpt(
        QStringLiteral("play-stills"),
        QStringLiteral("Play in real time and write the first picture shown at each --still-frames frame to DIR"),
        QStringLiteral("DIR"));
    const QCommandLineOption shotOpt(QStringLiteral("screenshot"), QStringLiteral("Save a window grab and exit"),
                                     QStringLiteral("PATH"));
    const QCommandLineOption selectOpt(QStringLiteral("select"),
                                       QStringLiteral("Select the clip with this id at start (for --screenshot)"),
                                       QStringLiteral("ID"));
    const QCommandLineOption warmupOpt(QStringLiteral("warmup"),
                                       QStringLiteral("Bench frames rendered at t=0 and excluded from every measurement"),
                                       QStringLiteral("N"), QStringLiteral("30"));
    const QCommandLineOption budgetOpt(QStringLiteral("budget"),
                                       QStringLiteral("Bench budget: a JSON file, or key=value,... (fails closed)"),
                                       QStringLiteral("FILE|SPEC"));
    const QCommandLineOption noVsyncOpt(QStringLiteral("no-vsync"), QStringLiteral("Bench without vsync"));
    const QCommandLineOption scrubOpt(QStringLiteral("scrub-script"),
                                      QStringLiteral("Run a scripted scrub offscreen and print its JSON report"),
                                      QStringLiteral("FILE"));
    const QCommandLineOption scrubOutOpt(QStringLiteral("scrub-out"),
                                         QStringLiteral("Folder for the scrub's final stills"), QStringLiteral("DIR"));
    const QCommandLineOption jsonOpt(QStringLiteral("json"), QStringLiteral("Print JSON (the scrub always does)"));
    const QCommandLineOption onTopOpt(QStringLiteral("on-top"),
                                      QStringLiteral("Keep the window above other windows, without taking focus "
                                                     "(so other windows cannot cover a bench)"));
    const QCommandLineOption hideTestOpt(
        QStringLiteral("test-hide-after"),
        QStringLiteral("Bench test: hide the window after MS ms, as an occlusion stops its rendering"),
        QStringLiteral("MS"));
    const QCommandLineOption teardownOpt(
        QStringLiteral("teardown-test"),
        QStringLiteral("Play, then delete the preview item while frames are in flight, render on, and exit"));
    const QCommandLineOption decodeOpt(QStringLiteral("decode"),
                                       QStringLiteral("Video decoder: sw (FFmpeg software), hw (VideoToolbox, a "
                                                      "failure fails the clip) or auto (hw, else sw). ") + nt::app::decodeModeHelp(),
                                       QStringLiteral("sw|hw|auto"));
    const QCommandLineOption decoderOpt(QStringLiteral("decoder"), QStringLiteral("PLAN spelling of --decode: sw|vt|auto"),
                                        QStringLiteral("sw|vt|auto"));
    const QCommandLineOption backgroundOpt(QStringLiteral("background"),
                                           QStringLiteral("Never take focus or come to the front (implied by "
                                                          "--bench, --screenshot and --stills)"));
    const QCommandLineOption realtimeOpt(QStringLiteral("realtime"),
                                         QStringLiteral("Bench: play in real time for SECONDS, then close the timeline"),
                                         QStringLiteral("SECONDS"));
    const QCommandLineOption uiBenchOpt(QStringLiteral("ui-bench"),
                                        QStringLiteral("Zoom and pan the tracks on a script while the preview plays; "
                                                       "print the GUI frame time (offscreen)"));
    const QCommandLineOption uiWindowOpt(QStringLiteral("ui-window"),
                                         QStringLiteral("Run --ui-bench in a real window (window-checks.sh only)"));
    const QCommandLineOption uiBudgetOpt(QStringLiteral("ui-gui-p95"),
                                         QStringLiteral("--ui-bench fails when guiMs.p95 reaches MS"), QStringLiteral("MS"));
    parser.addOptions({uiBenchOpt, uiWindowOpt, uiBudgetOpt});
    // Audio (M3, src/audio/AppAudio.h). Only the interactive app defaults to
    // the system device; every automated mode defaults to none.
    const QCommandLineOption audioOpt(QStringLiteral("audio"), QStringLiteral("Audio output: none, null or system"),
                                      QStringLiteral("MODE"));
    const QCommandLineOption audioLatencyOpt(QStringLiteral("audio-latency-ms"),
                                             QStringLiteral("Output latency the null device reports"),
                                             QStringLiteral("MS"), QStringLiteral("0"));
    const QCommandLineOption audioReportOpt(QStringLiteral("audio-report"),
                                            QStringLiteral("Write the audio engine stats as JSON at exit"),
                                            QStringLiteral("FILE"));
    const QCommandLineOption audioDryRunOpt(QStringLiteral("audio-dry-run"),
                                            QStringLiteral("Print the audio mode this run would use and exit"));
    parser.addOptions({audioOpt, audioLatencyOpt, audioReportOpt, audioDryRunOpt});
    // The waveform peaks of one file as the server's peaks route answers
    // (scripts/peaks-check.mjs compares the two).
    const QCommandLineOption peaksOpt(QStringLiteral("peaks"),
                                      QStringLiteral("Print the 2000 waveform peaks of FILE as JSON and exit"),
                                      QStringLiteral("FILE"));
    parser.addOption(peaksOpt);
    parser.addOptions({benchOpt, framesOpt, sizeOpt, seekOpt, playOpt, shotOpt, selectOpt, warmupOpt, budgetOpt, noVsyncOpt, realtimeOpt, stillsOpt, stillFramesOpt, backgroundOpt, playStillsOpt, decodeOpt, decoderOpt, teardownOpt, hideTestOpt, onTopOpt, scrubOpt, scrubOutOpt, jsonOpt});
    const QCommandLineOption chatOpt(QStringLiteral("chat"), QStringLiteral("Open the native chat panel"));
    parser.addOption(chatOpt);
    parser.process(app);
    bool captureChat = false;
    captureChat = parser.isSet(chatOpt) && parser.isSet(shotOpt);

    std::fprintf(stderr, "nodetool-timeline: Qt %s, libavformat %s, libavcodec %s, libavutil %s, libswscale %s\n",
                 qVersion(), qPrintable(avVersion(avformat_version())), qPrintable(avVersion(avcodec_version())),
                 qPrintable(avVersion(avutil_version())), qPrintable(avVersion(swscale_version())));

    if (parser.isSet(peaksOpt)) {
        const auto peaks = nt::ui::computeAudioPeaks(parser.value(peaksOpt));
        if (!peaks) return 1;
        QJsonArray values;
        for (float v : peaks->peaks) values.append(double(v));
        std::printf("%s\n", QJsonDocument(QJsonObject{{QStringLiteral("peaks"), values},
                                                     {QStringLiteral("duration_ms"), peaks->durationMs}})
                                .toJson(QJsonDocument::Compact)
                                .constData());
        return 0;
    }
    auto sources = parser.positionalArguments();
    if (sources.isEmpty()) {
        if (const auto startup = nt::app::dispatchDefaultStartup(app, parser)) {
            if (const auto* exitCode = std::get_if<int>(&*startup)) {
                return *exitCode;
            }
            sources.append(std::get<QString>(*startup));
        }
    }
    if (sources.size() != 1) {
        parser.showHelp(2);
    }
    const QString source = sources.first();
    const auto loaded = nt::server::loadTimelineSource(source);
    if (!loaded.timeline) {
        std::fprintf(stderr, "error: %s\n", qPrintable(loaded.error));
        return 1;
    }

    const QStringList wh = parser.value(sizeOpt).split(QLatin1Char('x'));
    bool okW = false;
    bool okH = false;
    const int winW = wh.size() == 2 ? wh[0].toInt(&okW) : 0;
    const int winH = wh.size() == 2 ? wh[1].toInt(&okH) : 0;
    if (!okW || !okH || winW <= 0 || winH <= 0) {
        std::fprintf(stderr, "error: --size must be WxH\n");
        return 2;
    }
    const int benchFrames = parser.value(framesOpt).toInt();
    if (bench && benchFrames <= 0) {
        std::fprintf(stderr, "error: --frames must be positive\n");
        return 2;
    }
    bool okWarmup = false;
    const int warmupFrames = parser.value(warmupOpt).toInt(&okWarmup);
    if (bench && (!okWarmup || warmupFrames < 1)) {
        // At least one: the first frame has no render interval.
        std::fprintf(stderr, "error: --warmup must be 1 or more\n");
        return 2;
    }
    const QString selectedDecodeMode = nt::app::resolveDecodeMode(
        parser.isSet(decodeOpt) ? std::optional<QString>(parser.value(decodeOpt)) : std::nullopt,
        parser.isSet(decoderOpt) ? std::optional<QString>(parser.value(decoderOpt)) : std::nullopt);
    {
        QString mode = selectedDecodeMode;
        if (mode == u"vt") mode = QStringLiteral("hw");
        if (mode == u"sw") {
            nt::setDecodeMode(nt::DecodeMode::Software);
        } else if (mode == u"hw") {
            nt::setDecodeMode(nt::DecodeMode::Hardware);
        } else if (mode == u"auto") {
            nt::setDecodeMode(nt::DecodeMode::Auto);
        } else {
            std::fprintf(stderr, "error: --decode takes sw, hw or auto\n");
            return 2;
        }
        // The graphics API a hardware decoder shares (M6, hw/HwWindow.h).
        nt::hw::selectGraphicsApi(nt::decodeMode() != nt::DecodeMode::Software);
    }
    double realtimeSeconds = 0.0;
    if (parser.isSet(realtimeOpt)) {
        bool ok = false;
        realtimeSeconds = parser.value(realtimeOpt).toDouble(&ok);
        if (!ok || realtimeSeconds <= 0.0) {
            std::fprintf(stderr, "error: --realtime takes a positive number of seconds\n");
            return 2;
        }
    }
    std::optional<nt::bench::Budget> budget;
    if (parser.isSet(budgetOpt)) {
        QString text = parser.value(budgetOpt);
        if (QFileInfo(text).isFile()) {
            QFile f(text);
            if (!f.open(QIODevice::ReadOnly)) {
                std::fprintf(stderr, "error: cannot read budget %s\n", qPrintable(text));
                return 2;
            }
            text = QString::fromUtf8(f.readAll());
        }
        const auto parsed = nt::bench::parseBudget(text);
        if (!parsed.budget) {
            std::fprintf(stderr, "error: %s\n", qPrintable(parsed.error));
            return 2;
        }
        budget = parsed.budget;
    }

    TimelineModel model;
    model.setTimeline(*loaded.timeline);
    PlaybackClock clock;
    clock.setDurationMs(model.durationMs());
    clock.seek(parser.value(seekOpt).toDouble());
    nt::audio::AppAudio audio;
    {
        // From the parsed options, so `--opt=value` and `--opt value` agree.
        const QString mode = nt::audio::resolveAudioMode(parser);
        QCoreApplication::instance()->setProperty("timelineAudioMode", mode);
        if (parser.isSet(audioDryRunOpt)) {
            std::printf("audio mode: %s\n", qPrintable(mode));
            return 0;
        }
        QString error;
        if (!audio.start(mode, parser.value(audioLatencyOpt).toDouble(), model, clock, &error)) {
            std::fprintf(stderr, "error: audio: %s\n", qPrintable(error));
            return 2;
        }
        if (parser.isSet(audioReportOpt)) audio.setReportPath(parser.value(audioReportOpt));
    }

    if (parser.isSet(uiBenchOpt)) {
        nt::ui::UiBenchOptions options;
        options.fixture = source;
        options.size = QSize(winW, winH);
        if (parser.isSet(framesOpt)) options.frames = benchFrames;
        options.windowed = parser.isSet(uiWindowOpt);
        options.guiP95BudgetMs = parser.value(uiBudgetOpt).toDouble();
        return nt::ui::runUiBench(model, clock, options);
    }
    if (parser.isSet(scrubOpt)) {
        const QString out = parser.isSet(scrubOutOpt)
                                ? parser.value(scrubOutOpt)
                                : QStringLiteral("build/scrub/%1").arg(QFileInfo(source).completeBaseName());
        return runOffscreen(model, clock, QSize(winW, winH), {}, {}, {}, {}, parser.value(scrubOpt), out, source,
                            selectedDecodeMode);
    }
    if (!captureChat && (parser.isSet(shotOpt) || parser.isSet(stillsOpt) || parser.isSet(playStillsOpt))) {
        // Screenshots and stills render with no window at all (offscreen).
        std::vector<long long> frames;
        if (parser.isSet(stillsOpt) || parser.isSet(playStillsOpt)) {
            for (const QString& part : parser.value(stillFramesOpt).split(QLatin1Char(','), Qt::SkipEmptyParts)) {
                bool ok = false;
                const long long f = part.trimmed().toLongLong(&ok);
                if (!ok || f < 0) {
                    std::fprintf(stderr, "error: bad still frame '%s'\n", qPrintable(part));
                    return 2;
                }
                frames.push_back(f);
            }
            if (frames.empty()) {
                std::fprintf(stderr, "error: --stills and --play-stills need --still-frames\n");
                return 2;
            }
        }
        return runOffscreen(model, clock, QSize(winW, winH), parser.value(shotOpt), parser.value(stillsOpt),
                            parser.value(playStillsOpt), frames);
    }

    QQuickView view;
    nt::hw::prepareWindow(&view);
    view.setResizeMode(QQuickView::SizeRootObjectToView);
    view.setColor(QColor(18, 18, 20));
    view.setTitle(QStringLiteral("NodeTool Timeline — %1").arg(model.name()));
    view.setInitialProperties({{QStringLiteral("timeline"), QVariant::fromValue(&model)},
                               {QStringLiteral("clock"), QVariant::fromValue(&clock)}});
    // A server timeline saves itself (D34); QML reads `autosave` for its state.
    std::unique_ptr<nt::server::AutosaveController> autosave;
    std::unique_ptr<nt::motion::MatteResolver> matteResolver;
    std::unique_ptr<nt::app::LocalDocumentSaver> localSaver;
    if (const auto target = nt::server::serverSaveTarget()) {
        matteResolver = std::make_unique<nt::motion::MatteResolver>(model, *target);
        autosave = std::make_unique<nt::server::AutosaveController>(
            *target, model.undoStack(), [&model]() { return model.timeline().raw; },
            loaded.timeline->raw.value(u"updatedAt").toString());
        QObject::connect(&model, &TimelineModel::commandSettled, autosave.get(),
                         &nt::server::AutosaveController::documentChanged);
    }
    if (!autosave && !bench && !parser.isSet(realtimeOpt) && !parser.isSet(teardownOpt) &&
        QFileInfo(source).isFile()) {
        localSaver = std::make_unique<nt::app::LocalDocumentSaver>(model, source);
        QObject::connect(localSaver.get(), &nt::app::LocalDocumentSaver::saveFailed, &app,
                         [](const QString& error) { qWarning().noquote() << error; });
    }
    nt::chat::ChatSession chatSession;
    nt::chat::TimelineChatHost chatHost(model, clock);
    AssistantSession assistantTools;
    assistantTools.setTimeline(&model);
    QVariantList hostTools = nt::aiassist::assistantTools().toVariantList();
    for (const auto& tool : nt::chat::TimelineChatHost::tools()) {
        if (tool.toMap().value("name") != QStringLiteral("ui_timeline_get_state")) hostTools.append(tool);
    }
    chatSession.setHostTools(hostTools);
    const auto chatContext = [&chatHost]() -> QVariantMap {
        const auto state = chatHost.context();
        const auto id = state.value("timeline_id").toString();
        return {{"workflow_id", id},
                {"ui_context", QVariantMap{{"source", "timeline_assistant"},
                                             {"focused", QVariantMap{{"type", "timeline"}, {"id", id}}},
                                             {"selection", QVariantMap{{"clip_ids", state.value("selected_clip_ids")}}}}}};
    };
    chatSession.setProperty("hostContext", chatContext());
    QObject::connect(&chatHost, &nt::chat::TimelineChatHost::contextChanged, &chatSession,
                     [&chatSession, chatContext] { chatSession.setProperty("hostContext", chatContext()); });
    QObject::connect(&chatSession, &nt::chat::ChatSession::stateChanged, &assistantTools,
                     [&chatSession, &assistantTools] {
        if (assistantTools.property("provider").toString() != chatSession.provider())
            assistantTools.setProperty("provider", chatSession.provider());
        if (assistantTools.property("model").toString() != chatSession.model())
            assistantTools.setProperty("model", chatSession.model());
    });
    QObject::connect(&chatSession, &nt::chat::ChatSession::hostToolRequested, &chatHost,
                     [&chatSession, &chatHost, &assistantTools, &clock](const QString& id, const QString& name, const QVariantMap& args) {
        if (name == QStringLiteral("ui_timeline_seek") || name == QStringLiteral("ui_timeline_add_marker") ||
            name == QStringLiteral("ui_timeline_delete_marker")) {
            const auto result = chatHost.execute(name, args);
            chatSession.completeHostTool(id, result, result.value("error").toString());
            return;
        }
        assistantTools.setProperty("selectedClipIds", chatHost.selection());
        assistantTools.setProperty("playheadMs", clock.currentTimeMs());
        assistantTools.setProperty("provider", chatSession.provider());
        assistantTools.setProperty("model", chatSession.model());
        const auto result = assistantTools.executeHostTool(name, QJsonObject::fromVariantMap(args), id);
        if (!result.value("deferred").toBool()) {
            chatSession.completeHostTool(id, result.toVariantMap(), result.value("error").toString());
        }
    });
    QObject::connect(&assistantTools, &AssistantSession::hostToolCompleted, &chatSession,
                     [&chatSession](const QString& id, const QJsonObject& result) {
        chatSession.completeHostTool(id, result.toVariantMap(), result.value("error").toString());
    });
    assistantTools.setPlanningSend([&chatSession](const QString& command, const QJsonObject& data, const QString& id) {
        return chatSession.sendHostRequest(command, data, id);
    });
    QObject::connect(&chatSession, &nt::chat::ChatSession::hostResponseReceived, &assistantTools,
                     [&assistantTools](const QJsonObject& response) { assistantTools.receive(response); });
    QUrl connectedChatServer;
    QString connectedChatToken;
    const auto syncChatServer = [&chatSession, &model, &connectedChatServer, &connectedChatToken] {
        const auto target = nt::server::serverSaveTarget();
        const auto documentId = model.timeline().raw.value("id").toString();
        QUrl server;
        QString token;
        if (target && target->timelineId == documentId) {
            server = target->server;
            token = target->token;
        } else if (!target) {
            const QUrl configured(qEnvironmentVariable("NODETOOL_CHAT_SERVER"));
            if ((configured.scheme() == "http" || configured.scheme() == "https") && !configured.host().isEmpty()) {
                server = configured;
                token = qEnvironmentVariable("NODETOOL_TOKEN");
            }
        }
        if (server.isEmpty()) {
            chatSession.disconnectFromServer();
            connectedChatServer = QUrl{};
            connectedChatToken.clear();
            return;
        }
        if (connectedChatServer == server && connectedChatToken == token) return;
        chatSession.connectToServer(server, token);
        connectedChatServer = server;
        connectedChatToken = token;
    };
    syncChatServer();
    QObject::connect(&model, &TimelineModel::documentReplaced, &chatSession, syncChatServer);
    view.rootContext()->setContextProperty(QStringLiteral("nativeChatSession"), &chatSession);
    view.rootContext()->setContextProperty(QStringLiteral("nativeChatHost"), &chatHost);
    view.rootContext()->setContextProperty(QStringLiteral("nativeAssistantTools"), &assistantTools);
    view.rootContext()->setContextProperty(QStringLiteral("nativeChatInitiallyOpen"), parser.isSet(chatOpt));
    view.rootContext()->setContextProperty(QStringLiteral("autosave"), autosave.get());
    view.loadFromModule("NodeTool.Timeline", "TimelineEditor");
    if (view.status() != QQuickView::Ready) {
        return 1;
    }
    view.resize(winW, winH);
    if (background) {
        view.setFlags(view.flags() | Qt::WindowDoesNotAcceptFocus);
    }
    if (parser.isSet(onTopOpt)) {
        view.setFlags(view.flags() | Qt::WindowStaysOnTopHint);
    }
    view.show();  // never raise() or requestActivate()
    if (captureChat) {
        auto* captureTimer = new QTimer(&view);
        const auto captureStarted = std::chrono::steady_clock::now();
        QObject::connect(captureTimer, &QTimer::timeout, &view,
                         [&view, &app, captureTimer, captureStarted, path = parser.value(shotOpt)] {
            const auto elapsed = std::chrono::duration_cast<std::chrono::milliseconds>(
                std::chrono::steady_clock::now() - captureStarted).count();
            if (elapsed < 500) { return; }
            const auto* session = view.rootContext()->contextProperty(QStringLiteral("nativeChatSession"))
                                      .value<QObject*>();
            if (session && session->property("connectionStatus").toString() == QStringLiteral("connecting")) {
                if (elapsed < 5000) { return; }
                captureTimer->stop();
                qWarning("The native chat connection did not settle for capture");
                app.exit(1);
                return;
            }
            captureTimer->stop();
            const auto* loader = namedVisualItem(view.rootObject(), QStringLiteral("nativeChatPanel"));
            if (!loader || loader->property("status").toInt() != 1) {
                qWarning("The native chat panel did not load for capture");
                app.exit(1);
                return;
            }
            const auto image = view.grabWindow();
            app.exit(!image.isNull() && image.save(path) ? 0 : 1);
        });
        captureTimer->start(100);
    }

    if (parser.isSet(selectOpt)) {
        auto* gestures = view.rootObject()->findChild<ClipGestureController*>();
        if (!gestures) {
            std::fprintf(stderr, "error: --select: no clip gesture controller in the scene\n");
            return 1;
        }
        gestures->setSelection({parser.value(selectOpt)});
    }

    auto* compositor = view.rootObject()->findChild<PreviewCompositor*>(QStringLiteral("previewCompositor"));
    if ((bench || parser.isSet(teardownOpt)) && !compositor) {
        std::fprintf(stderr, "error: no PreviewCompositor in the scene\n");
        return 1;
    }

    // The loader report (D10a): log each media clip once, as the pool opens it.
    if (compositor) {
        auto logged = std::make_shared<std::set<QString>>();
        // The compositor is the context: the teardown test deletes it mid-run.
        QObject::connect(&view, &QQuickWindow::afterAnimating, compositor, [compositor, logged]() {
            for (const MediaReportEntry& r : compositor->mediaReport()) {
                if (!logged->insert(r.clipId + r.decoder + r.fallback + r.reason).second) continue;
                std::fprintf(stderr, "%s\n", qPrintable(mediaLogLine(r)));
            }
        });
    }

    // Set when a bench or screenshot run reached its report. Closing the
    // window first ends app.exec() with 0, which must not read as a pass.
    auto completed = std::make_shared<bool>(false);
    // The callbacks below run from app.exec(), after this block's locals are
    // gone, so they own their state through value captures.
    // A measured run holds a user-initiated, latency-critical activity, so
    // macOS does not nap the background process mid-measurement.
    std::unique_ptr<nt::ProcessActivity> activity;
    if (bench) {
        activity = std::make_unique<nt::ProcessActivity>("nodetool-timeline bench");
    }
    if (bench) {
        // Warm-up: render at the start time until `warmup` frames are done,
        // so start-up (window show, source creation, decoder open, pipeline
        // compile) stays out of the measurement. Step mode then moves one
        // sequence frame per rendered frame; --realtime plays the clock for
        // --seconds and then closes the timeline to time the decoder shutdown.
        compositor->setCollectFrameStats(true);
        auto run = std::make_shared<BenchRun>();
        run->completed = completed;
        run->warmup = warmupFrames;
        run->frames = benchFrames;
        run->seconds = realtimeSeconds;
        run->frameMs = 1000.0 / model.fps();
        QObject::connect(
            &view, &QQuickWindow::frameSwapped, &view,
            [run]() {
                std::lock_guard lock(run->submitMutex);
                run->submitNs.push_back(steadyNowNs());
            },
            Qt::DirectConnection);
        const bool vsync = !noVsync;
        const double refreshHz = view.screen() ? view.screen()->refreshRate() : 0.0;
        const double startMs = clock.time();
        const QString decodeName = selectedDecodeMode;
        auto scheduling = std::make_shared<QJsonObject>();
        // F7 diagnostics: exposure changes of the bench window, with a
        // steady-clock time, next to the occlusion log.
        auto* exposeLogger = new ExposeLogger(&view);
        view.installEventFilter(exposeLogger);
        // Watchdog: while the window is not exposed Qt renders nothing and
        // sends no afterAnimating, so a run would wait forever. After 3 s with
        // no rendered frame the bench ends with an invalid report and exit 1.
        auto watchdog = new QTimer(&app);
        auto lastFrames = std::make_shared<long long>(-1);
        auto stillFor = std::make_shared<QElapsedTimer>();
        stillFor->start();
        QObject::connect(watchdog, &QTimer::timeout, &app, [&app, compositor, run, lastFrames, stillFor, exposeLogger]() {
            if (run->phase == BenchRun::Phase::Done) return;
            if (compositor->framesRendered() != *lastFrames) {
                *lastFrames = compositor->framesRendered();
                stillFor->restart();
                return;
            }
            if (stillFor->elapsed() < 3000) return;
            run->phase = BenchRun::Phase::Done;
            std::printf("{\"invalid\":\"no frame rendered for %lld ms\",\"exposureLosses\":%d}\n",
                        static_cast<long long>(stillFor->elapsed()), exposeLogger->losses());
            std::fflush(stdout);
            std::fprintf(stderr, "error: the bench window stopped rendering (not exposed); no valid report\n");
            *run->completed = true;
            app.exit(4);
        });
        watchdog->start(250);
        if (parser.isSet(hideTestOpt)) {
            QTimer::singleShot(parser.value(hideTestOpt).toInt(), &view, [&view]() { view.hide(); });
        }
        QObject::connect(
            &view, &QQuickWindow::afterAnimating, &app,
            [&app, &clock, &model, view = &view, compositor, run, budget, vsync, refreshHz, source, startMs,
             decodeName, scheduling, exposeLogger]() {
                using Phase = BenchRun::Phase;
                const auto& stats = compositor->frameStats();
                const auto endCpu = [&]() {
                    if (run->cpuWallMs > 0.0) return;
                    run->cpuWallMs = static_cast<double>(run->cpuWall.nsecsElapsed()) / 1.0e6;
                    // Each delta is -1 when either end of it failed.
                    const auto delta = [](int64_t end, int64_t start) -> int64_t {
                        return end < 0 || start < 0 ? -1 : end - start;
                    };
                    run->processUsed = delta(nt::cpu::processNs(), run->processStart);
                    run->mainUsed = delta(nt::cpu::threadNs(run->mainThread), run->mainStart);
                    run->renderUsed = delta(nt::cpu::threadNs(run->renderThread), run->renderStart);
                };
                const auto finish = [&]() {
                    run->phase = Phase::Done;
                    nt::bench::BenchData data = benchData(stats, *run);
                    data.fixture = source;
                    data.vsync = vsync;
                    data.refreshHz = refreshHz;
                    data.realtime = run->seconds > 0.0;
                    data.decode = decodeName;
                    (*scheduling)[QStringLiteral("exposureLosses")] = exposeLogger->losses() - run->exposureLossesAtStart;
                    if (run->first < stats.size()) {
                        (*scheduling)[QStringLiteral("measureStartSteadyMs")] =
                            static_cast<double>(stats[run->first].startNs) / 1.0e6;
                    }
                    (*scheduling)[QStringLiteral("warmupReady")] = run->warmupReady;
                    data.scheduling = *scheduling;
                    data.windowWidth = view->width();
                    data.windowHeight = view->height();
                    data.devicePixelRatio = view->devicePixelRatio();
                    data.exposureLosses = exposeLogger->losses() - run->exposureLossesAtStart;
                    data.framesReleasedInFlight = nt::hw::FrameRef::releasedInFlight();
                    const nt::bench::Report report = nt::bench::buildReport(data, budget);
                    std::printf("%s\n", QJsonDocument(report.json).toJson(QJsonDocument::Compact).constData());
                    std::fflush(stdout);
                    *run->completed = true;
                    app.exit(report.pass ? 0 : 1);
                };
                switch (run->phase) {
                case Phase::Done:
                    return;
                case Phase::Warmup: {
                    // Hold at the start time for `warmup` frames and until
                    // every layer shows its exact frame (D22: play waits for
                    // the sources), at most 3 s more. Without the wait, eight
                    // decoders still seeking made the first measured frames
                    // show frames from up to a second earlier.
                    if (!run->warmupTimer.isValid()) run->warmupTimer.start();
                    const bool ready = !stats.empty() && stats.back().allExact;
                    if (compositor->framesRendered() < run->warmup ||
                        (!ready && run->warmupTimer.elapsed() < 3000 + 1000)) {
                        compositor->update();  // hold at the start time
                        return;
                    }
                    run->warmupReady = ready;
                }
                    run->phase = Phase::Measure;
                    run->first = stats.size();
                    run->exposureLossesAtStart = exposeLogger->losses();
                    (*scheduling)[QStringLiteral("nice")] = nt::cpu::processNice();
                    (*scheduling)[QStringLiteral("mainThreadQos")] = nt::cpu::currentThreadQos();
                    (*scheduling)[QStringLiteral("renderThreadQos")] = compositor->renderThreadQos();
                    (*scheduling)[QStringLiteral("decodeWorkerQos")] = nt::lastDecodeWorkerQos();
                    (*scheduling)[QStringLiteral("occlusionAtStart")] =
                        QString::fromStdString(nt::diag::watchOcclusion(view));
                    run->mainThread = nt::cpu::currentThread();
                    run->renderThread = compositor->renderThread();
                    run->processStart = nt::cpu::processNs();
                    run->mainStart = nt::cpu::threadNs(run->mainThread);
                    run->renderStart = nt::cpu::threadNs(run->renderThread);
                    run->cpuWall.start();
                    if (run->seconds > 0.0) {
                        clock.setLoop(false);  // stop at the end instead of wrapping to 0
                        clock.play();
                    }
                    [[fallthrough]];
                case Phase::Measure:
                    if (run->seconds > 0.0) {
                        if (clock.time() - startMs < run->seconds * 1000.0 && clock.playing()) {
                            compositor->update();  // keep frames coming, also after the clock stops
                            return;
                        }
                        run->last = stats.size();
                        endCpu();
                        clock.pause();
                        model.close();  // every clip leaves: decoders must close
                        run->closeTimer.start();
                        run->phase = Phase::Close;
                        compositor->update();
                        return;
                    }
                    // One more frame than measured, to bound the submission window.
                    if (stats.size() > run->first + static_cast<size_t>(run->frames)) {
                        run->last = run->first + static_cast<size_t>(run->frames);
                        endCpu();
                        finish();
                        return;
                    }
                    clock.seek(startMs + static_cast<double>(run->measuredFrame++) * run->frameMs);
                    return;
                case Phase::Close: {
                    const double ms = static_cast<double>(run->closeTimer.nsecsElapsed()) / 1.0e6;
                    if (!run->closeMs && compositor->openDecoders() == 0) run->closeMs = ms;
                    if (!run->frameRefCloseMs && compositor->liveFrameRefs() == 0) run->frameRefCloseMs = ms;
                    if ((run->closeMs && run->frameRefCloseMs) || run->closeTimer.elapsed() > 3000) {
                        finish();  // a count still above 0 after 3 s stays null: fails a budget on it
                    } else {
                        compositor->update();
                    }
                    return;
                }
                }
            });
    } else if (parser.isSet(teardownOpt)) {
        // Teardown under load (M1c F1): play in a real window, then delete the
        // preview item mid-playback. Its renderer is destroyed on the render
        // thread while earlier frames may still be on the GPU; the Metal debug
        // layer must report nothing. 60 frames of playback, delete, 60 more.
        clock.setLoop(true);
        clock.play();
        auto frames = std::make_shared<int>(0);
        auto deleted = std::make_shared<bool>(false);
        QObject::connect(&view, &QQuickWindow::afterAnimating, &app,
                         [&app, &view, compositor, frames, deleted, completed]() mutable {
                             ++*frames;
                             if (!*deleted && *frames >= 60) {
                                 *deleted = true;
                                 compositor->setParentItem(nullptr);
                                 delete compositor;
                                 std::fprintf(stderr, "teardown: preview deleted at frame %d\n", *frames);
                             }
                             if (*frames >= 120 && !*completed) {
                                 const int live = nt::hw::FrameRef::live();
                                 const int early = nt::hw::FrameRef::releasedInFlight();
                                 std::fprintf(stderr, "teardown: done, %d live FrameRefs, %d released in flight\n",
                                              live, early);
                                 *completed = true;
                                 app.exit(live == 0 && early == 0 ? 0 : 1);
                                 return;
                             }
                             if (*completed) return;
                             view.update();
                         });
    } else if (parser.isSet(playOpt)) {
        clock.play();
    }

    // Unsaved server edits: save them (at most 5 s) or leave a recovery file;
    // exit code 4 when no folder took them.
    const int rc = nt::app::exitCodeAfterLocalSave(localSaver.get(),
        nt::server::exitCodeAfterQuit(autosave.get(), app.exec(), 5000));
    if ((bench || parser.isSet(teardownOpt)) && !*completed) {
        std::fprintf(stderr, "error: the window closed before the %s finished; no report\n",
                     "bench");
        return 3;
    }
    return rc;
}
