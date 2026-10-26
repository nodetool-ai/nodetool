// Drives the same controller as QML against the scratch server. No window or audio.
#include "app/CliModes.h"
#include "server/TimelineList/TimelineListController.h"
#include <QCommandLineParser>
#include <QCoreApplication>
#include <QJsonDocument>
#include <QJsonArray>
#include <cstdio>

namespace {
int check(int argc, char** argv) {
    QCoreApplication app(argc, argv);
    QCommandLineParser parser;
    parser.addOptions({QCommandLineOption("timeline-list-command", "List controller operation", "ACTION"),
        QCommandLineOption("id", "Timeline ID", "ID"), QCommandLineOption("name", "New name", "NAME"),
        QCommandLineOption("project", "Project ID", "ID"), QCommandLineOption("confirm", "Confirm deletion")});
    if (!parser.parse(app.arguments())) {
        std::fprintf(stderr, "%s\n", qPrintable(parser.errorText()));
        return 2;
    }
    nt::server::TimelineListController list;
    list.refresh();
    if (parser.isSet("project")) {
        list.setProjectId(parser.value("project"));
    }
    const auto action = parser.value("timeline-list-command");
    QJsonObject result;
    bool ok = list.error().isEmpty();
    if (ok && action == "create") {
        result = QJsonObject::fromVariantMap(list.createTimeline());
        ok = !result.isEmpty();
    } else if (ok && action == "rename") {
        ok = list.renameTimeline(parser.value("id"), parser.value("name"));
    } else if (ok && action == "delete") {
        list.requestDelete(parser.value("id"));
        ok = parser.isSet("confirm") && list.confirmDelete();
    } else if (ok && action == "open") {
        const auto source = list.openTimeline(parser.value("id"));
        ok = !source.isEmpty();
        result.insert("source", source);
    } else if (action != "list") {
        ok = false;
    }
    result.insert("documents", QJsonArray::fromVariantList(list.documents()));
    result.insert("projects", QJsonArray::fromVariantList(list.projects()));
    result.insert("projectId", list.projectId());
    result.insert("error", list.error());
    std::printf("%s\n", QJsonDocument(result).toJson(QJsonDocument::Compact).constData());
    return ok ? 0 : 1;
}
const bool cli = nt::app::registerCliMode({"--timeline-list-command", check, nt::app::CliStage::BeforeServerArgs});
}
