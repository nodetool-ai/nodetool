// Headless driver for the real model, sync registration and editor QML.
// stdin/stdout are JSON lines. Diagnostics belong on stderr.
#include "model/TimelineModel.h"
#include "playback/PlaybackClock.h"
#include "preview/hw/HwWindow.h"
#include "server/AssetCache.h"
#include "server/AutosaveController.h"
#include "server/ServerTimeline.h"

#include <QCommandLineParser>
#include <QDir>
#include <QFile>
#include <QGuiApplication>
#include <QJsonArray>
#include <QJsonDocument>
#include <QQmlContext>
#include <QQuickItem>
#include <QQuickView>
#include <QSocketNotifier>
#include <QUndoStack>

#include <cstdio>

namespace {
QQuickItem* findItem(QQuickItem* root, const QString& name) {
    if (!root) return nullptr;
    if (root->objectName() == name) return root;
    for (auto* child : root->childItems()) {
        if (auto* found = findItem(child, name)) return found;
    }
    return nullptr;
}

QJsonObject resultJson(const nt::server::SaveResult& result) {
    return {{"ok", result.ok}, {"conflict", result.conflict}, {"updatedAt", result.updatedAt},
        {"stripped", QJsonArray::fromStringList(result.stripped)}, {"error", result.error},
        {"keptCopy", result.keptCopy}, {"recoveryError", result.recoveryError}};
}

void reply(const QJsonObject& value) {
    const auto bytes = QJsonDocument(value).toJson(QJsonDocument::Compact);
    std::fprintf(stdout, "%s\n", bytes.constData());
    std::fflush(stdout);
}
}

int main(int argc, char** argv) {
    QGuiApplication app(argc, argv);
    QCommandLineParser parser;
    parser.addHelpOption();
    parser.addOptions({{"server", "Server origin", "url"}, {"timeline", "Timeline ID", "id"},
        {"cache-dir", "Cache root", "dir"}, {"sync-url", "Override WebSocket origin", "url"},
        {"token", "Bearer token", "token"}});
    parser.process(app);
    if (parser.value("server").isEmpty() || parser.value("timeline").isEmpty() || parser.value("cache-dir").isEmpty()) {
        parser.showHelp(2);
    }
    const QUrl server(parser.value("server"));
    if ((server.scheme() != u"http" && server.scheme() != u"https") || server.host().isEmpty()) return 2;
    const auto id = parser.value("timeline");
    const auto cache = parser.value("cache-dir");
    const auto token = parser.isSet("token") ? parser.value("token") : qEnvironmentVariable("NODETOOL_API_TOKEN");
    auto opened = nt::server::openServerTimeline({server, id, cache, token, true});
    if (!opened.timeline) {
        std::fprintf(stderr, "open: %s\n", qPrintable(opened.error));
        return 1;
    }
    const auto base = opened.timeline->raw.value("updatedAt").toString();
    TimelineModel model;
    model.setTimeline(std::move(*opened.timeline));
    PlaybackClock clock;
    const nt::server::ServerClient client(server, token);
    const auto backup = QDir(cache).filePath(nt::server::safePathPart(client.serverKey()) + u'/' +
        nt::server::safePathPart(client.userKey()) + QStringLiteral("/timelines"));
    nt::server::AutosaveController save({server, token, id, backup,
        qEnvironmentVariable("NODETOOL_TIMELINE_EXPECT_INSTANCE")}, model.undoStack(),
        [&model] { return model.timeline().raw; }, base);
    if (parser.isSet("sync-url")) save.setExternalSyncUrl(QUrl(parser.value("sync-url")));
    QQuickView view;
    nt::hw::prepareWindow(&view);
    view.setResizeMode(QQuickView::SizeRootObjectToView);
    view.setInitialProperties({{"timeline", QVariant::fromValue(&model)}, {"clock", QVariant::fromValue(&clock)}});
    view.rootContext()->setContextProperty("autosave", &save);
    view.loadFromModule("NodeTool.Timeline", "TimelineEditor");
    if (view.status() != QQuickView::Ready) return 1;
    view.resize(1280, 800);
    view.show();

    QFile input;
    if (!input.open(stdin, QIODevice::ReadOnly | QIODevice::Unbuffered)) return 1;
    QSocketNotifier readable(input.handle(), QSocketNotifier::Read, &app);
    QByteArray pending;
    bool quitting = false;
    const auto finish = [&] {
        quitting = true;
        readable.setEnabled(false);
        const int code = nt::server::exitCodeAfterQuit(&save, 0, 5000);
        reply({{"exitCodeAfterQuit", code}});
        app.exit(code);
    };
    QObject::connect(&readable, &QSocketNotifier::activated, &app, [&] {
        readable.setEnabled(false);
        const auto bytes = input.read(4096);
        if (bytes.isEmpty()) {
            finish();
            return;
        }
        pending += bytes;
        qsizetype end;
        while (!quitting && (end = pending.indexOf('\n')) >= 0) {
            QJsonParseError error;
            const auto json = QJsonDocument::fromJson(pending.left(end), &error);
            pending.remove(0, end + 1);
            if (error.error != QJsonParseError::NoError || !json.isObject()) {
                reply({{"error", "expected a JSON command object"}});
                continue;
            }
            const auto command = json.object();
            const auto cmd = command.value("cmd").toString();
            if (cmd == u"state") {
                QJsonArray clips;
                QJsonArray rendered;
                for (const auto& clip : model.timeline().clips) {
                    const auto clipId = QString::fromStdString(clip.id);
                    clips.append(QJsonObject{{"id", clipId}, {"startMs", clip.startMs}});
                    if (const auto* item = findItem(view.rootObject(), "clip-" + clipId)) {
                        rendered.append(QJsonObject{{"id", clipId}, {"x", item->x()}});
                    }
                }
                reply({{"clips", clips}, {"rendered", rendered}, {"dirty", save.dirty()}, {"saving", save.saving()},
                    {"conflict", save.conflict()}, {"base", save.baseUpdatedAt()}, {"externalState", save.externalState()},
                    {"externalConflicts", QJsonArray::fromVariantList(save.externalConflicts())},
                    {"lastError", save.lastError()}, {"canUndo", model.undoStack()->canUndo()}});
            } else if (cmd == u"move") {
                reply({{"ok", model.moveClip(command.value("clip").toString(), command.value("startMs").toDouble())}});
            } else if (cmd == u"autosave") {
                save.setAutosave(command.value("on").toBool());
                reply({{"ok", true}});
            } else if (cmd == u"sync") {
                save.setExternalSync(command.value("on").toBool());
                reply({{"ok", true}});
            } else if (cmd == u"saveNow") {
                reply(resultJson(save.saveNow()));
            } else if (cmd == u"undo") {
                model.undoStack()->undo();
                reply({{"ok", true}});
            } else if (cmd == u"quit") {
                finish();
            } else {
                reply({{"error", "unknown command"}});
            }
        }
        if (!quitting) readable.setEnabled(true);
    });
    return app.exec();
}
