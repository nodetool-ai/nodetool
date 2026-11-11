// Drives the same controller as QML against the scratch server. No window or audio.
#include "app/CliModes.h"
#include "model/TimelineModel.h"
#include "server/ServerSource.h"
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
        QCommandLineOption("project", "Project ID", "ID"), QCommandLineOption("confirm", "Confirm deletion"),
        QCommandLineOption("settings", "Project settings JSON", "JSON")});
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
    } else if (ok && (action == "settings" || action == "inspect")) {
        const auto loaded = nt::server::loadTimelineSource(list.openTimeline(parser.value("id")));
        ok = loaded.timeline.has_value();
        if (ok) {
            TimelineModel model;
            model.setTimeline(*loaded.timeline);
            if (action == "settings") {
                const auto target = nt::server::serverSaveTarget();
                ok = target.has_value();
                if (target) {
                    nt::server::AutosaveController save(*target, model.undoStack(),
                        [&model] { return model.timeline().raw; }, model.timeline().raw.value("updatedAt").toString());
                    save.setExternalSync(false);
                    ok = model.applyEdit("setProjectSettings",
                        QJsonDocument::fromJson(parser.value("settings").toUtf8()).object()) != 0;
                    ok = save.flushBeforeQuit(5000) && ok;
                    result.insert("saveError", save.lastError());
                }
            }
            result.insert("width", model.canvasWidth());
            result.insert("height", model.canvasHeight());
            result.insert("fps", model.fps());
        } else {
            result.insert("loadError", loaded.error);
        }
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
