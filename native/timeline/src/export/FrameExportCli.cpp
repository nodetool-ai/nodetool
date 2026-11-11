// Behaviour ported from FilmCraft (https://github.com/storytold/filmcraft), MIT OR Apache-2.0.
#include "app/CliModes.h"
#include "export/FrameExporter.h"
#include "model/TimelineJson.h"
#include "server/ServerSource.h"
#include <QCommandLineParser>
#include <QFileInfo>
#include <QGuiApplication>
#include <QJsonDocument>
#include <QTimer>
#include <cmath>
#include <cstdio>

namespace {
int frameExportCli(int argc, char** argv) {
    QStringList arguments;
    for (int i = 0; i < argc; ++i) { arguments.append(QString::fromLocal8Bit(argv[i])); }
    QGuiApplication app(argc, argv);
    QCommandLineParser parser;
    parser.addPositionalArgument("document", "Timeline document to capture");
    parser.addOptions({{"export-frame", "Export one frame"}, {"source", "Source file or asset://id", "FILE"},
        {"time-ms", "Frame time in milliseconds", "N"}, {"out", "Output file", "PATH"},
        {"format", "png or jpeg", "FORMAT", "png"}, {"library", "Save to the Library"},
        {"name", "Library asset name", "NAME"}, {"server", "Library server", "URL"},
        {"token", "Server token", "TOKEN"}, {"cache-dir", "Original media cache", "DIR"}});
    parser.process(arguments);
    const auto fail = [](const QString& error) { std::fprintf(stderr, "%s\n", qPrintable(error)); return 1; };
    bool number = false;
    const double time = parser.value("time-ms").toDouble(&number);
    if (!number || !std::isfinite(time) || time < 0) { return fail("Enter a finite, nonnegative frame time."); }
    const auto documents = parser.positionalArguments();
    const bool source = parser.isSet("source");
    if ((source && !documents.isEmpty()) || (!source && documents.size() != 1)) {
        return fail("Choose a timeline document or a source file to export.");
    }
    if ((parser.isSet("library") && parser.isSet("out")) || (!parser.isSet("library") && parser.value("out").isEmpty())) {
        return fail("Choose a file path or the Library for the frame.");
    }
    if (parser.value("format") != "png" && parser.value("format") != "jpeg") { return fail("Choose PNG or JPEG for the frame."); }
    if (parser.isSet("server")) {
        // The upload does not need a timeline row. Reuse the normal server target,
        // including its token, cache namespace and scratch-server write proof.
        QList<QByteArray> storage{"nodetool-timeline", "--server", parser.value("server").toUtf8(),
            "--timeline", QByteArray(32, '0')};
        for (const auto& option : {"token", "cache-dir"}) {
            if (parser.isSet(option)) { storage.append(QByteArray("--") + option); storage.append(parser.value(option).toUtf8()); }
        }
        std::vector<char*> serverArguments;
        for (auto& item : storage) { serverArguments.push_back(item.data()); }
        int count = int(serverArguments.size()); serverArguments.push_back(nullptr);
        if (nt::server::takeServerArgs(count, serverArguments.data())) { return 2; }
    }
    TimelineModel model;
    if (!source) {
        auto parsed = nt::loadTimelineFile(documents.first());
        if (!parsed.timeline) { return fail(parsed.error); }
        model.setTimeline(std::move(*parsed.timeline));
    }
    FrameExporter exporter;
    if (!source) { exporter.setTimeline(&model); }
    bool saving = false;
    int exitCode = 1;
    QObject::connect(&exporter, &FrameExporter::changed, &app, [&] {
        if (exporter.state() == "failed" || (saving && exporter.state() == "ready" && !exporter.error().isEmpty())) {
            fail(exporter.error()); QCoreApplication::exit(1);
        } else if (exporter.state() == "ready" && !saving) {
            saving = true;
            if (parser.isSet("library")) { exporter.saveToLibrary(parser.value("name"), parser.value("format")); }
            else { exporter.saveToFile(QUrl::fromLocalFile(QFileInfo(parser.value("out")).absoluteFilePath()), parser.value("format")); }
        }
    });
    QObject::connect(&exporter, &FrameExporter::saved, &app, [&] {
        if (parser.isSet("library")) {
            const auto bytes = QJsonDocument(QJsonObject::fromVariantMap(exporter.savedAsset())).toJson(QJsonDocument::Compact);
            std::printf("%s\n", bytes.constData());
        }
        exitCode = 0;
        QCoreApplication::quit();
    });
    QTimer::singleShot(0, &app, [&] {
        if (source) {
            const auto path = parser.value("source");
            const auto id = path.startsWith("asset://") ? nt::server::assetIdForReference(path) : QString{};
            QVariantMap asset;
            if (!id.isEmpty()) { asset.insert("id", id); asset.insert("mediaType", "video"); }
            exporter.captureSource(asset, id.isEmpty() ? QFileInfo(path).absoluteFilePath() : path, time);
        } else { exporter.captureProgram(time); }
    });
    const int result = app.exec();
    return result != 0 ? result : exitCode;
}
const bool registered = nt::app::registerCliMode({"--export-frame", frameExportCli, nt::app::CliStage::BeforeServerArgs});
}
