#include "app/CliModes.h"
#include "server/ServerClient.h"
#include <QCommandLineParser>
#include <QCoreApplication>
#include <QFileInfo>
#include <QJsonDocument>
#include <QMimeDatabase>
#include <cstdio>

namespace {
int uploadAsset(int argc, char** argv) {
    QCoreApplication app(argc, argv);
    QCommandLineParser parser;
    parser.addOptions({QCommandLineOption("upload-asset", "Upload an asset"), QCommandLineOption("server", "Server URL", "URL"),
                       QCommandLineOption("file", "Media file", "PATH"), QCommandLineOption("content-type", "Media content type", "T")});
    if (!parser.parse(app.arguments()) || !parser.isSet("server") || !parser.isSet("file")) {
        std::fprintf(stderr, "error: --upload-asset requires --server URL --file PATH [--content-type T]\n");
        return 1;
    }
    const QUrl server(parser.value("server"));
    if (!server.isValid() || server.host().isEmpty() || (server.scheme() != "http" && server.scheme() != "https")) {
        std::fprintf(stderr, "error: invalid server URL\n");
        return 1;
    }
    const QString file = parser.value("file");
    const QString contentType = parser.isSet("content-type") ? parser.value("content-type")
        : QMimeDatabase().mimeTypeForFile(file).name();
    nt::server::ServerClient client(server);
    client.setExpectedInstance(qEnvironmentVariable("NODETOOL_TIMELINE_EXPECT_INSTANCE"));
    const auto uploaded = client.upload({{"name", QFileInfo(file).fileName()}, {"content_type", contentType}}, file, contentType);
    if (!uploaded.ok()) {
        std::fprintf(stderr, "error: %s\n", qPrintable(uploaded.describe()));
        return 1;
    }
    const QString id = uploaded.data.toObject().value("id").toString();
    if (id.isEmpty()) {
        std::fprintf(stderr, "error: upload response has no asset id\n");
        return 1;
    }
    const auto get = client.getAsset(id);
    if (!get.ok()) {
        std::fprintf(stderr, "error: %s\n", qPrintable(get.describe()));
        return 1;
    }
    const auto json = QJsonDocument(QJsonObject{{"uploaded", uploaded.data}, {"get", get.data}}).toJson(QJsonDocument::Compact);
    std::printf("%s\n", json.constData());
    return 0;
}
const bool registered = nt::app::registerCliMode({"--upload-asset", uploadAsset, nt::app::CliStage::BeforeServerArgs});
}
