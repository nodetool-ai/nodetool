#include "app/CliModes.h"
#include "export/ExportEngine.h"
#include "preview/FfmpegSource.h"
#include "preview/hw/HwWindow.h"
#include "server/ServerSource.h"
#include <QCommandLineParser>
#include <QFileInfo>
#include <QGuiApplication>
#include <QJsonDocument>
#include <QJsonObject>
#include <cstdio>
#include <stop_token>

namespace nt::exporting {
namespace {
int exportCli(int argc, char** argv) {
    qputenv("QT_MAC_DISABLE_FOREGROUND_APPLICATION_TRANSFORM", "1");
    qputenv("QT_MAC_SET_RAISE_PROCESS", "0");
    QGuiApplication app(argc, argv);
    QCommandLineParser parser;
    parser.addPositionalArgument(QStringLiteral("timeline"), QStringLiteral("Timeline source"));
    parser.addOptions({
        {QStringLiteral("export"), "Export output path", "OUT"},
        {QStringLiteral("format"), "mp4, webm, png_sequence, wav, mp3", "FORMAT", "mp4"},
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
        std::fprintf(stderr, "usage: nodetool-timeline <timeline.json> --export OUT [--format mp4|webm|png_sequence|wav|mp3]\n");
        return 2;
    }
    bool valid = true;
    const qint64 cancelAt = parser.isSet("cancel-after-frames") ? parser.value("cancel-after-frames").toLongLong(&valid) : -1;
    if (!valid || (parser.isSet("cancel-after-frames") && cancelAt < 0)) {
        std::fprintf(stderr, "error: cancel-after-frames must be nonnegative\n");
        return 2;
    }
    const auto loaded = server::loadTimelineSource(parser.positionalArguments().first());
    if (!loaded.timeline) {
        std::fprintf(stderr, "error: %s\n", qPrintable(loaded.error));
        return 1;
    }
    const Options options{parser.value("export"), parser.value("format"), parser.isSet("alpha"),
        parser.value("video-encoder"), parser.value("audio-encoder")};
    std::stop_source stop;
    const auto progress = [&](const Progress& p) {
        const QJsonObject json{{"phase", p.phase}, {"frame", p.frame}, {"totalFrames", p.totalFrames}, {"ratio", p.ratio}};
        std::fprintf(stderr, "export-progress %s\n", QJsonDocument(json).toJson(QJsonDocument::Compact).constData());
        std::fflush(stderr);
        if (cancelAt >= 0 && p.frame >= cancelAt) stop.request_stop();
    };
    const QString cancelFile = parser.value("cancel-file");
    const auto result = exportTimeline(*loaded.timeline, options, stop.get_token(), progress,
        [&] { return !cancelFile.isEmpty() && QFileInfo::exists(cancelFile); });
    if (result.cancelled) { std::fprintf(stderr, "Export cancelled\n"); return 3; }
    if (!result.ok()) { std::fprintf(stderr, "Export failed: %s\n", qPrintable(result.error)); return 1; }
    const QJsonObject json{{"output", options.output}, {"format", options.format}, {"alpha", false},
        {"frames", result.frames}, {"samples", result.samples}, {"fps", result.fps},
        {"videoEncoder", result.videoEncoder}, {"audioEncoder", result.audioEncoder}};
    std::printf("%s\n", QJsonDocument(json).toJson(QJsonDocument::Compact).constData());
    return 0;
}
const bool registered = app::registerCliMode({QStringLiteral("--export"), exportCli});
}
}
