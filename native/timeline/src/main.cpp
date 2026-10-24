// nodetool-timeline: native prototype of the NodeTool timeline editor.
//
//   nodetool-timeline <fixture.json> [--size WxH] [--seek MS] [--play]
//                     [--bench [--frames N] [--warmup N] [--budget FILE|SPEC] [--no-vsync]]
//                     [--screenshot PATH]
//   nodetool-timeline <fixture.json> --dump-plan --times a,b,c
//
// --bench renders --warmup frames at t=0, then steps the playhead one
// sequence frame per rendered frame for --frames frames, with vsync on unless
// --no-vsync. It prints one JSON line (bench/BenchReport.h) and exits 1 when a
// --budget entry fails or has no samples.
// --screenshot grabs the window after a few frames, saves it, and exits.
// --dump-plan prints the FramePlan JSON at the given times (ms), no window.

#include "model/TimelineJson.h"
#include "model/TimelineModel.h"
#include "playback/PlaybackClock.h"
#include "preview/PreviewCompositor.h"
#include "preview/FfmpegSource.h"
#include "preview/SceneEval.h"
#include "bench/BenchReport.h"

extern "C" {
#include <libavcodec/avcodec.h>
#include <libavformat/avformat.h>
#include <libavutil/avutil.h>
#include <libswscale/swscale.h>
}

#include <QCommandLineParser>
#include <QCoreApplication>
#include <QElapsedTimer>
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
#include <QQmlEngine>
#include <QQuickItem>
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

namespace {

QString avVersion(unsigned v) {
    return QStringLiteral("%1.%2.%3").arg(AV_VERSION_MAJOR(v)).arg(AV_VERSION_MINOR(v)).arg(AV_VERSION_MICRO(v));
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
        if (f.mediaLayers > 0) {
            ++d.mediaFrames;
            if (f.missingMediaLayers > 0) ++d.missingMediaFrames;
            if (f.missingMediaLayers == 0 && f.frameError == 0) ++d.correctMediaFrames;
        }
        if (f.held) ++d.heldFrames;
        d.cutMisses += f.cutMisses;
        d.missingLayerFrames += f.missingLayers;
        d.layersMax = std::max(d.layersMax, f.layers);
        d.openDecodersMax = std::max(d.openDecodersMax, f.openDecoders);
    }
    d.decoderCloseMs = run.closeMs;
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

QJsonArray matrixJson(const std::array<float, 16>& m) {
    QJsonArray a;
    for (float v : m) a.append(static_cast<double>(v));
    return a;
}

// FramePlan JSON (DESIGN.md D6). Layers are bottom to top.
QJsonObject framePlanJson(const nt::Timeline& tl, const QString& fixture, const std::vector<double>& times) {
    QJsonArray frames;
    for (double t : times) {
        const nt::FramePlan plan = nt::buildFramePlan(tl, t);
        QJsonArray layers;
        for (const nt::PlanLayer& pl : plan.layers) {
            layers.append(QJsonObject{
                {QStringLiteral("clipId"), QString::fromStdString(pl.layer.clipId)},
                {QStringLiteral("trackIndex"), pl.layer.trackIndex},
                {QStringLiteral("z"), pl.layer.z},
                {QStringLiteral("opacity"), pl.layer.opacity},
                {QStringLiteral("sourceTimeMs"), pl.layer.sourceTimeMs},
                {QStringLiteral("matrix"), matrixJson(pl.matrix)},
            });
        }
        frames.append(QJsonObject{{QStringLiteral("timeMs"), t}, {QStringLiteral("layers"), layers}});
    }
    return QJsonObject{{QStringLiteral("fixture"), fixture},
                       {QStringLiteral("width"), tl.width},
                       {QStringLiteral("height"), tl.height},
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
    const auto loaded = nt::loadTimelineFile(fixture);
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
    const auto loaded = nt::loadTimelineFile(fixture);
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
                 const QString& stillsDir, const QString& playDir, const std::vector<long long>& frames) {
    QQuickRenderControl control;
    QQuickWindow window(&control);
    window.resize(size);
    window.setColor(QColor(18, 18, 20));
    QQmlEngine engine;
    QQmlComponent component(&engine);
    component.loadFromModule("NodeTool.Timeline", "TimelineEditor");
    std::unique_ptr<QObject> rootObject(component.createWithInitialProperties(
        {{QStringLiteral("timeline"), QVariant::fromValue(&model)}, {QStringLiteral("clock"), QVariant::fromValue(&clock)}}));
    auto* root = qobject_cast<QQuickItem*>(rootObject.get());
    if (!root) {
        std::fprintf(stderr, "error: %s\n", qPrintable(component.errorString()));
        return 1;
    }
    root->setParentItem(window.contentItem());
    root->setSize(QSizeF(size));
    if (!control.initialize()) {
        std::fprintf(stderr, "error: QQuickRenderControl could not create a QRhi\n");
        return 1;
    }
    QRhi* rhi = control.rhi();
    std::unique_ptr<QRhiTexture> target(
        rhi->newTexture(QRhiTexture::RGBA8, size, 1, QRhiTexture::RenderTarget | QRhiTexture::UsedAsTransferSource));
    target->create();
    std::unique_ptr<QRhiTextureRenderTarget> rt(rhi->newTextureRenderTarget({target.get()}));
    std::unique_ptr<QRhiRenderPassDescriptor> rp(rt->newCompatibleRenderPassDescriptor());
    rt->setRenderPassDescriptor(rp.get());
    rt->create();
    window.setRenderTarget(QQuickRenderTarget::fromRhiRenderTarget(rt.get()));

    auto* compositor = root->findChild<PreviewCompositor*>(QStringLiteral("previewCompositor"));
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
            if (!logged.insert(r.clipId).second) continue;
            std::fprintf(stderr, "media %s: %s%s%s\n", qPrintable(r.clipId), r.ok ? "ok" : "not used: ",
                         qPrintable(r.reason), r.ok ? "" : " (placeholder)");
        }
    };

    if (!shotPath.isEmpty()) {
        // Wait until every layer shows its exact frame, then grab the editor.
        compositor->requestCapture();
        QElapsedTimer timer;
        timer.start();
        while (!compositor->captureReady()) {
            renderFrame(false);
            logReport();
            if (timer.elapsed() > 15000) {
                std::fprintf(stderr, "error: no exact frame within 15 s\n");
                return 1;
            }
            QCoreApplication::processEvents();
        }
        renderFrame(true);
        const QImage img(reinterpret_cast<const uchar*>(readback.data.constData()), readback.pixelSize.width(),
                         readback.pixelSize.height(), QImage::Format_RGBA8888_Premultiplied);
        const bool saved = img.convertToFormat(QImage::Format_RGB888).save(shotPath);
        std::fprintf(stderr, "screenshot %s: %s\n", qPrintable(shotPath), saved ? "saved" : "FAILED");
        return saved ? 0 : 1;
    }

    const double fps = model.fps();
    if (!playDir.isEmpty()) {
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
            logReport();
            if (timer.elapsed() > 15000) {
                std::fprintf(stderr, "error: frame %lld: no exact frame within 15 s\n", frame);
                return 1;
            }
            QCoreApplication::processEvents();
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
    // Parse before QGuiApplication: --bench changes the surface format and
    // --dump-plan runs without a GUI.
    bool bench = false;
    bool noVsync = false;
    bool background = false;
    for (int i = 1; i < argc; ++i) {
        if (qstrcmp(argv[i], "--bench") == 0) bench = true;
        if (qstrcmp(argv[i], "--no-vsync") == 0) noVsync = true;
        if (qstrcmp(argv[i], "--background") == 0 || qstrcmp(argv[i], "--screenshot") == 0 ||
            qstrcmp(argv[i], "--stills") == 0 || qstrcmp(argv[i], "--play-stills") == 0) {
            background = true;
        }
        if (qstrcmp(argv[i], "--dump-plan") == 0) return dumpPlan(argc, argv);
        if (qstrcmp(argv[i], "--probe-media") == 0) return probeMediaReport(argc, argv);
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
    const QCommandLineOption warmupOpt(QStringLiteral("warmup"),
                                       QStringLiteral("Bench frames rendered at t=0 and excluded from every measurement"),
                                       QStringLiteral("N"), QStringLiteral("30"));
    const QCommandLineOption budgetOpt(QStringLiteral("budget"),
                                       QStringLiteral("Bench budget: a JSON file, or key=value,... (fails closed)"),
                                       QStringLiteral("FILE|SPEC"));
    const QCommandLineOption noVsyncOpt(QStringLiteral("no-vsync"), QStringLiteral("Bench without vsync"));
    const QCommandLineOption backgroundOpt(QStringLiteral("background"),
                                           QStringLiteral("Never take focus or come to the front (implied by "
                                                          "--bench, --screenshot and --stills)"));
    const QCommandLineOption realtimeOpt(QStringLiteral("realtime"),
                                         QStringLiteral("Bench: play in real time for SECONDS, then close the timeline"),
                                         QStringLiteral("SECONDS"));
    parser.addOptions({benchOpt, framesOpt, sizeOpt, seekOpt, playOpt, shotOpt, warmupOpt, budgetOpt, noVsyncOpt, realtimeOpt, stillsOpt, stillFramesOpt, backgroundOpt, playStillsOpt});
    parser.process(app);

    std::fprintf(stderr, "nodetool-timeline: Qt %s, libavformat %s, libavcodec %s, libavutil %s, libswscale %s\n",
                 qVersion(), qPrintable(avVersion(avformat_version())), qPrintable(avVersion(avcodec_version())),
                 qPrintable(avVersion(avutil_version())), qPrintable(avVersion(swscale_version())));

    if (parser.positionalArguments().size() != 1) {
        parser.showHelp(2);
    }
    const auto loaded = nt::loadTimelineFile(parser.positionalArguments().first());
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

    if (parser.isSet(shotOpt) || parser.isSet(stillsOpt) || parser.isSet(playStillsOpt)) {
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
    view.setResizeMode(QQuickView::SizeRootObjectToView);
    view.setColor(QColor(18, 18, 20));
    view.setTitle(QStringLiteral("NodeTool Timeline — %1").arg(model.name()));
    view.setInitialProperties({{QStringLiteral("timeline"), QVariant::fromValue(&model)},
                               {QStringLiteral("clock"), QVariant::fromValue(&clock)}});
    view.loadFromModule("NodeTool.Timeline", "TimelineEditor");
    if (view.status() != QQuickView::Ready) {
        return 1;
    }
    view.resize(winW, winH);
    if (background) {
        view.setFlags(view.flags() | Qt::WindowDoesNotAcceptFocus);
    }
    view.show();  // never raise() or requestActivate()

    auto* compositor = view.rootObject()->findChild<PreviewCompositor*>(QStringLiteral("previewCompositor"));
    if (bench && !compositor) {
        std::fprintf(stderr, "error: no PreviewCompositor in the scene\n");
        return 1;
    }

    // The loader report (D10a): log each media clip once, as the pool opens it.
    if (compositor) {
        auto logged = std::make_shared<std::set<QString>>();
        QObject::connect(&view, &QQuickWindow::afterAnimating, &app, [compositor, logged]() {
            for (const MediaReportEntry& r : compositor->mediaReport()) {
                if (!logged->insert(r.clipId).second) continue;
                std::fprintf(stderr, "media %s: %s%s%s\n", qPrintable(r.clipId), r.ok ? "ok" : "not used: ",
                             qPrintable(r.reason), r.ok ? "" : " (placeholder)");
            }
        });
    }

    // Set when a bench or screenshot run reached its report. Closing the
    // window first ends app.exec() with 0, which must not read as a pass.
    auto completed = std::make_shared<bool>(false);
    // The callbacks below run from app.exec(), after this block's locals are
    // gone, so they own their state through value captures.
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
        const QString fixture = parser.positionalArguments().first();
        const double startMs = clock.time();
        QObject::connect(
            &view, &QQuickWindow::afterAnimating, &app,
            [&app, &clock, &model, view = &view, compositor, run, budget, vsync, refreshHz, fixture, startMs]() {
                using Phase = BenchRun::Phase;
                const auto& stats = compositor->frameStats();
                const auto finish = [&]() {
                    run->phase = Phase::Done;
                    nt::bench::BenchData data = benchData(stats, *run);
                    data.fixture = fixture;
                    data.vsync = vsync;
                    data.refreshHz = refreshHz;
                    data.realtime = run->seconds > 0.0;
                    data.windowWidth = view->width();
                    data.windowHeight = view->height();
                    data.devicePixelRatio = view->devicePixelRatio();
                    const nt::bench::Report report = nt::bench::buildReport(data, budget);
                    std::printf("%s\n", QJsonDocument(report.json).toJson(QJsonDocument::Compact).constData());
                    std::fflush(stdout);
                    *run->completed = true;
                    app.exit(report.pass ? 0 : 1);
                };
                switch (run->phase) {
                case Phase::Done:
                    return;
                case Phase::Warmup:
                    if (compositor->framesRendered() < run->warmup) {
                        compositor->update();  // hold at the start time
                        return;
                    }
                    run->phase = Phase::Measure;
                    run->first = stats.size();
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
                        finish();
                        return;
                    }
                    clock.seek(startMs + static_cast<double>(run->measuredFrame++) * run->frameMs);
                    return;
                case Phase::Close:
                    if (compositor->openDecoders() == 0) {
                        run->closeMs = static_cast<double>(run->closeTimer.nsecsElapsed()) / 1.0e6;
                        finish();
                    } else if (run->closeTimer.elapsed() > 3000) {
                        finish();  // decoderCloseMs stays null: fails a budget on it
                    } else {
                        compositor->update();
                    }
                    return;
                }
            });
    } else if (parser.isSet(playOpt)) {
        clock.play();
    }

    const int rc = app.exec();
    if (bench && !*completed) {
        std::fprintf(stderr, "error: the window closed before the %s finished; no report\n",
                     "bench");
        return 3;
    }
    return rc;
}
