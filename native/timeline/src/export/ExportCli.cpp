#include "app/CliModes.h"
#include "export/ExportEngine.h"
#include "preview/FfmpegSource.h"
#include "preview/hw/HwWindow.h"
#include "server/ServerSource.h"
#include <QCommandLineParser>
#include <QFileInfo>
#include <QFile>
#include <QDir>
#include <QTemporaryDir>
#include <QGuiApplication>
#include <QJsonDocument>
#include <QJsonObject>
#include <cstdio>
#include <stop_token>
#include <stdexcept>
#include <chrono>
#include <cmath>
#include <condition_variable>
#include <cstdlib>
#include <limits>
#include <memory>
#include <mutex>
#include <optional>
#include <thread>
#include <type_traits>

namespace nt::exporting {
namespace {
int exportCli(int argc, char** argv) {
    qputenv("QT_MAC_DISABLE_FOREGROUND_APPLICATION_TRANSFORM", "1");
    qputenv("QT_MAC_SET_RAISE_PROCESS", "0");
    QGuiApplication app(argc, argv);
    QCommandLineParser parser;
    parser.addPositionalArgument(QStringLiteral("timeline"), QStringLiteral("Timeline source"));
    QCommandLineOption stagingDirectory(QStringLiteral("staging-directory"),
        "Editor-owned temporary output directory", "PATH");
    stagingDirectory.setFlags(QCommandLineOption::HiddenFromHelp);
    parser.addOption(stagingDirectory);
    parser.addOptions({
        {QStringLiteral("export"), "Export output path", "OUT"},
        {QStringLiteral("format"), "mp4, webm, png_sequence, wav, mp3", "FORMAT", "mp4"},
        {QStringLiteral("start-ms"), "First timeline time to export", "MS"},
        {QStringLiteral("end-ms"), "Exclusive end time (default: timeline end)", "MS"},
        {QStringLiteral("width"), "Output picture width (0: timeline width)", "PX"},
        {QStringLiteral("height"), "Output picture height (0: timeline height)", "PX"},
        {QStringLiteral("fps"), "Output frame rate (0: timeline rate)", "FPS"},
        {QStringLiteral("video-bitrate"), "Target video bit rate (0: fixed quality)", "KBPS"},
        {QStringLiteral("scale-mode"), "fit (letterbox) or fill (centre crop)", "fit|fill", "fit"},
        {QStringLiteral("alpha"), "Keep transparency (unavailable in this build)"},
        {QStringLiteral("cancel-after-frames"), "Cancel after N completed frames", "N"},
        {QStringLiteral("cancel-file"), "Cancel when this file exists", "PATH"},
        {QStringLiteral("video-encoder"), "Override video encoder for diagnostics", "NAME"},
        {QStringLiteral("audio-encoder"), "Override audio encoder for diagnostics", "NAME"},
        {QStringLiteral("json"), "Print the JSON result"}
    });
    parser.process(app);
    nt::setDecodeMode(nt::DecodeMode::Software);
    nt::hw::selectGraphicsApi(false);
    if (parser.positionalArguments().size() != 1) {
        std::fprintf(stderr, "usage: nodetool-timeline <timeline.json> --export OUT [--format mp4|webm|png_sequence|wav|mp3] [--start-ms MS] [--end-ms MS] [--width PX] [--height PX] [--fps FPS] [--video-bitrate KBPS] [--scale-mode fit|fill]\n");
        return 2;
    }
    bool valid = true;
    const qint64 cancelAt = parser.isSet("cancel-after-frames") ? parser.value("cancel-after-frames").toLongLong(&valid) : -1;
    if (!valid || (parser.isSet("cancel-after-frames") && cancelAt < 0)) {
        std::fprintf(stderr, "error: cancel-after-frames must be nonnegative\n");
        return 2;
    }
    Options options{parser.value("export"), parser.value("format"), parser.isSet("alpha"),
        parser.value("video-encoder"), parser.value("audio-encoder"), parser.value("staging-directory")};
    if (qEnvironmentVariable("NT_TEST_EXPORT_FP16") == u"1") {
        options.workingFormat = nt::WorkingFormat::Rgba16F;
    }
    const auto testFloatPath = qEnvironmentVariable("NT_TEST_EXPORT_FLOAT");
    if (!testFloatPath.isEmpty()) {
        options.floatCanvasForTest = [testFloatPath](const QImage& image) {
            QFile file(testFloatPath);
            if (!file.open(QIODevice::WriteOnly)) {
                throw std::runtime_error("Cannot save test float canvas");
            }
            for (int y = 0; y < image.height(); ++y) {
                const auto bytes = image.width() * 4 * qsizetype(sizeof(float));
                if (file.write(reinterpret_cast<const char*>(image.constScanLine(y)), bytes) != bytes) {
                    throw std::runtime_error("Cannot save test float canvas row");
                }
            }
        };
    }
    const auto testYuvPath = qEnvironmentVariable("NT_TEST_EXPORT_YUV");
    if (!testYuvPath.isEmpty()) {
        options.videoFrameForTest = [testYuvPath](const QByteArray& bytes) {
            QFile file(testYuvPath);
            if (!file.open(QIODevice::WriteOnly) || file.write(bytes) != bytes.size()) {
                throw std::runtime_error("Cannot save test YUV observation");
            }
        };
    }
    const auto number = [&](const char* name, auto& target) {
        if (!parser.isSet(name)) return true;
        using Value = std::remove_reference_t<decltype(target)>;
        bool ok = false;
        const double value = parser.value(name).toDouble(&ok);
        if (!ok || !std::isfinite(value) || value < 0 || value > std::numeric_limits<Value>::max() ||
            (std::is_integral_v<Value> && value != std::floor(value))) {
            std::fprintf(stderr, "error: %s must be a nonnegative number\n", name);
            return false;
        }
        target = static_cast<Value>(value);
        return true;
    };
    if (!number("start-ms", options.startMs) || !number("end-ms", options.endMs) ||
        !number("width", options.width) || !number("height", options.height) ||
        !number("fps", options.fps) || !number("video-bitrate", options.videoBitrateKbps)) return 2;
    options.scaleMode = parser.value("scale-mode");
    const auto loaded = server::loadTimelineSource(parser.positionalArguments().first());
    if (!loaded.timeline) {
        std::fprintf(stderr, "error: %s\n", qPrintable(loaded.error));
        return 1;
    }
    // Own CLI staging here so the watchdog can remove partial output even
    // when an encoder or driver cannot return through the engine's cleanup.
    std::unique_ptr<QTemporaryDir> staging;
    const QFileInfo destination(options.output);
    if (options.stagingDirectory.isEmpty() && !options.output.isEmpty() && destination.dir().exists()) {
        staging = std::make_unique<QTemporaryDir>(destination.dir().filePath(QStringLiteral(".nt-export-XXXXXX")));
        if (!staging->isValid()) {
            std::fprintf(stderr, "Export failed: Cannot create temporary export output\n");
            return 1;
        }
        options.stagingDirectory = staging->path();
    }
    std::stop_source stop;
    const auto progress = [&](const Progress& p) {
        const QJsonObject json{{"phase", p.phase}, {"frame", p.frame}, {"totalFrames", p.totalFrames}, {"ratio", p.ratio}};
        std::fprintf(stderr, "export-progress %s\n", QJsonDocument(json).toJson(QJsonDocument::Compact).constData());
        std::fflush(stderr);
        if (cancelAt >= 0 && p.frame >= cancelAt) stop.request_stop();
    };
    const QString cancelFile = parser.value("cancel-file");
    std::mutex watchdogMutex;
    std::condition_variable_any watchdogWake;
    std::jthread watchdog;
    if (!cancelFile.isEmpty() || cancelAt >= 0) {
        watchdog = std::jthread([&](std::stop_token done) {
            std::unique_lock lock(watchdogMutex);
            std::optional<std::chrono::steady_clock::time_point> requested;
            while (!done.stop_requested()) {
                const auto now = std::chrono::steady_clock::now();
                if (!requested && (stop.stop_requested() || (!cancelFile.isEmpty() && QFileInfo::exists(cancelFile)))) {
                    requested = now;
                    stop.request_stop();
                }
                // Reserve time for filesystem cleanup and process teardown.
                if (requested && now - *requested >= std::chrono::milliseconds(kCancelStopBudgetMs - 100)) {
                    QFile::remove(QDir(options.stagingDirectory).filePath(QStringLiteral("output")));
                    if (staging) QDir().rmdir(staging->path());
                    std::_Exit(3);
                }
                watchdogWake.wait_for(lock, done, std::chrono::milliseconds(10), [] { return false; });
            }
        });
    }
    const auto result = exportTimeline(*loaded.timeline, options, stop.get_token(), progress,
        [&] { return !cancelFile.isEmpty() && QFileInfo::exists(cancelFile); });
    if (watchdog.joinable()) {
        watchdog.request_stop();
        watchdog.join();
    }
    if (result.cancelled) { std::fprintf(stderr, "Export cancelled\n"); return 3; }
    if (!result.ok()) { std::fprintf(stderr, "Export failed: %s\n", qPrintable(result.error)); return 1; }
    const QJsonObject json{{"output", options.output}, {"format", options.format}, {"alpha", false},
        {"frames", result.frames}, {"samples", result.samples}, {"fps", result.fps},
        {"width", result.width}, {"height", result.height}, {"startMs", result.startMs}, {"endMs", result.endMs},
        {"videoEncoder", result.videoEncoder}, {"audioEncoder", result.audioEncoder}};
    std::printf("%s\n", QJsonDocument(json).toJson(QJsonDocument::Compact).constData());
    return 0;
}
const bool registered = app::registerCliMode({QStringLiteral("--export"), exportCli});
}
}
